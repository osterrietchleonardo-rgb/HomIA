import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { refundPayment, ensureFreshSellerToken } from '@/lib/mercadopago'
import { round2 } from '@/lib/leftovers'

// ── Máquina de estados de una devolución de sobrantes ──
//   solicitada ─aceptar(prov)──▶ aceptada | aceptada_parcial ─recibir(prov)──▶ recibida (efectivo) | reembolsada (MP) | reembolso_fallido
//       │                                                                             │                                   │
//       ├─rechazar(prov)──▶ rechazada                                  reembolsar_efectivo(prov) ─▶ reembolsada   reintentar_reembolso(prov)
//       └─cancelar(solicitante)──▶ cancelada
// Sin retroceso desde `recibida`.

const schema = z.object({
  action: z.enum(['aceptar', 'rechazar', 'cancelar', 'recibir', 'reembolsar_efectivo', 'reintentar_reembolso']),
  note: z.string().max(500).optional(),
  items: z.array(z.object({
    id: z.string().min(1),
    qtyAccepted: z.coerce.number().min(0).optional(),
    qtyReceived: z.coerce.number().min(0).optional(),
    refundAmount: z.coerce.number().min(0).optional(),
  })).optional(),
})

const include = {
  items: { include: { element: { select: { id: true, name: true, unit: true } } } },
  requester: { select: { id: true, displayName: true } },
  provider: true,
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error
  const d = parsed.data

  const ret = await db.leftoverReturn.findUnique({ where: { id }, include })
  if (!ret) return fail('Devolución no encontrada', 404)
  const isRequester = ret.requesterId === user.id
  const isProvider = ret.provider.userId === user.id
  if (!isRequester && !isProvider) return fail('No tenés acceso a esta devolución', 403)

  const st = ret.status
  const notifyRequester = (type: string, title: string, body: string) =>
    db.notification.create({ data: { userId: ret.requesterId, type, title, body, link: originLink(ret) } })
  const notifyProvider = (type: string, title: string, body: string) =>
    db.notification.create({ data: { userId: ret.provider.userId, type, title, body, link: '#/panel/proveedor/cobros?tab=devoluciones' } })
  const label = `${ret.items.length} ítem${ret.items.length === 1 ? '' : 's'}`

  // ─────────────── CANCELAR (solicitante) ───────────────
  if (d.action === 'cancelar') {
    if (!isRequester) return fail('Solo quien pidió la devolución puede cancelarla', 403)
    if (st !== 'solicitada') return fail(st === 'cancelada' ? 'Esta devolución ya está cancelada' : 'Solo se cancela una devolución que el proveedor todavía no respondió', 409)
    await db.leftoverReturn.update({ where: { id }, data: { status: 'cancelada' } })
    await notifyProvider('devolucion_cancelada', 'Devolución cancelada', `${user.displayName} canceló su pedido de devolución (${label}).`)
    return ok({ success: true, status: 'cancelada' })
  }

  if (!isProvider) return fail('Solo el proveedor gestiona la devolución', 403)

  // ─────────────── RECHAZAR ───────────────
  if (d.action === 'rechazar') {
    if (st !== 'solicitada') return fail('Solo se rechaza una devolución pendiente de respuesta', 409)
    const note = d.note?.trim() || null
    await db.leftoverReturn.update({ where: { id }, data: { status: 'rechazada', providerNote: note, respondedAt: new Date() } })
    await db.leftoverItem.updateMany({ where: { returnId: id }, data: { status: 'rechazado' } })
    await notifyRequester('devolucion_rechazada', 'Devolución rechazada', `${ret.provider.businessName} no aceptó la devolución (${label}).${note ? ` Motivo: ${note}` : ''}`)
    return ok({ success: true, status: 'rechazada' })
  }

  // ─────────────── ACEPTAR (todo o parcial) ───────────────
  if (d.action === 'aceptar') {
    if (st !== 'solicitada') return fail(st.startsWith('aceptada') ? 'Esta devolución ya fue aceptada' : 'Solo se acepta una devolución pendiente de respuesta', 409)
    const decisions = d.items && d.items.length ? d.items : ret.items.map((i) => ({ id: i.id, qtyAccepted: i.qtyRequested, refundAmount: undefined }))
    const paidCap = await refundCap(ret)
    let refundTotal = 0
    const updates: { id: string; qtyAccepted: number; refundAmount: number; status: 'aceptado' | 'rechazado' }[] = []
    for (const it of ret.items) {
      const dec = decisions.find((x) => x.id === it.id)
      const qty = dec?.qtyAccepted ?? (dec ? it.qtyRequested : 0)
      if (!dec || qty <= 0) { updates.push({ id: it.id, qtyAccepted: 0, refundAmount: 0, status: 'rechazado' }); continue }
      if (qty > it.qtyRequested + 1e-9) return fail(`No podés aceptar más de lo pedido (${it.qtyRequested} ${it.element.unit}) en "${it.element.name}"`, 400)
      const max = round2(it.unitPricePaid * qty)
      const refund = dec.refundAmount != null ? round2(dec.refundAmount) : max
      if (refund > max + 1e-9) return fail(`El reembolso de "${it.element.name}" no puede superar lo pagado (${formatARS(max)})`, 400)
      refundTotal = round2(refundTotal + refund)
      updates.push({ id: it.id, qtyAccepted: qty, refundAmount: refund, status: 'aceptado' })
    }
    const accepted = updates.filter((u) => u.status === 'aceptado')
    if (accepted.length === 0) return fail('No aceptaste ningún ítem: usá "Rechazar" con un motivo', 400)
    if (refundTotal > paidCap + 1e-9) return fail(`El reembolso total (${formatARS(refundTotal)}) supera lo que queda por reembolsar de ese pago (${formatARS(paidCap)})`, 409)
    for (const u of updates) {
      await db.leftoverItem.update({ where: { id: u.id }, data: { qtyAccepted: u.qtyAccepted, refundAmount: u.refundAmount, status: u.status } })
    }
    const status = accepted.length === ret.items.length && accepted.every((u) => Math.abs(u.qtyAccepted - ret.items.find((i) => i.id === u.id)!.qtyRequested) < 1e-9)
      ? 'aceptada' : 'aceptada_parcial'
    await db.leftoverReturn.update({ where: { id }, data: { status, refundTotal, providerNote: d.note?.trim() || null, respondedAt: new Date() } })
    await notifyRequester(
      'devolucion_aceptada',
      status === 'aceptada' ? 'Devolución aceptada: acercá los sobrantes al local' : 'Devolución aceptada en parte: acercá los sobrantes al local',
      `${ret.provider.businessName} acepta ${accepted.length} de ${ret.items.length} ítem${ret.items.length === 1 ? '' : 's'} por ${formatARS(refundTotal)}. Cuando los reciba, ${ret.paymentMethod === 'mercadopago' ? 'el reembolso vuelve solo a tu medio de pago de Mercado Pago' : 'te devuelve el dinero en efectivo en el mostrador'}.`
    )
    return ok({ success: true, status, refundTotal })
  }

  // ─────────────── RECIBIR (devuelve stock + reembolso) ───────────────
  if (d.action === 'recibir') {
    if (st !== 'aceptada' && st !== 'aceptada_parcial') {
      return fail(st === 'solicitada' ? 'Primero aceptá la devolución' : ['recibida', 'reembolsada', 'reembolso_fallido'].includes(st) ? 'Esta devolución ya fue recibida' : 'No se puede marcar recibida en este estado', 409)
    }
    const accepted = ret.items.filter((i) => i.status === 'aceptado')
    let refundTotal = 0
    const received: { id: string; qty: number; refund: number; elementId: string }[] = []
    for (const it of accepted) {
      const dec = d.items?.find((x) => x.id === it.id)
      const qty = dec?.qtyReceived ?? it.qtyAccepted ?? 0
      const qtyAcc = it.qtyAccepted ?? 0
      if (qty > qtyAcc + 1e-9) return fail(`No podés recibir más de lo aceptado (${qtyAcc} ${it.element.unit}) en "${it.element.name}"`, 400)
      const refund = qtyAcc > 0 ? round2((it.refundAmount ?? 0) * (qty / qtyAcc)) : 0
      refundTotal = round2(refundTotal + refund)
      received.push({ id: it.id, qty, refund, elementId: it.elementId })
    }
    if (received.every((r) => r.qty <= 0)) return fail('Indicá al menos un ítem recibido con cantidad mayor a cero', 400)

    for (const r of received) {
      await db.leftoverItem.update({ where: { id: r.id }, data: { qtyReceived: r.qty, refundAmount: r.refund } })
      if (r.qty > 0) await restock(ret.providerId, r.elementId, r.qty, `Devolución de sobrantes ${ret.id}`)
    }
    const receivedAt = new Date()

    if (ret.paymentMethod === 'mercadopago' && ret.mpPaymentId) {
      const result = await doRefund({ ...ret, refundTotal }, refundTotal)
      await db.leftoverReturn.update({
        where: { id },
        data: result.ok
          ? { status: 'reembolsada', refundTotal, receivedAt, refundedAt: new Date(), mpRefundId: result.refundId, providerNote: null }
          : { status: 'reembolso_fallido', refundTotal, receivedAt, providerNote: result.error },
      })
      if (result.ok) {
        await notifyRequester('devolucion_reembolsada', 'Sobrantes recibidos y reembolsados', `${ret.provider.businessName} recibió tus sobrantes. Mercado Pago te devuelve ${formatARS(refundTotal)} a tu medio de pago en 1 a 15 días.`)
        return ok({ success: true, status: 'reembolsada', refundTotal, mpRefundId: result.refundId })
      }
      await notifyRequester('devolucion_recibida', 'Sobrantes recibidos: reembolso en proceso', `${ret.provider.businessName} recibió tus sobrantes. El reembolso de ${formatARS(refundTotal)} por Mercado Pago está en proceso; te avisamos cuando se acredite.`)
      return ok({ success: true, status: 'reembolso_fallido', refundTotal, error: result.error }, 200)
    }

    // efectivo (o pago MP sin id): el proveedor devuelve en el mostrador y lo marca
    await db.leftoverReturn.update({ where: { id }, data: { status: 'recibida', refundTotal, receivedAt } })
    await notifyRequester('devolucion_recibida', 'Sobrantes recibidos', `${ret.provider.businessName} recibió tus sobrantes. Te devuelve ${formatARS(refundTotal)} en efectivo en el mostrador.`)
    return ok({ success: true, status: 'recibida', refundTotal })
  }

  // ─────────────── REEMBOLSAR EFECTIVO ───────────────
  if (d.action === 'reembolsar_efectivo') {
    if (st !== 'recibida') return fail(st === 'reembolsada' ? 'Esta devolución ya está reembolsada' : 'Primero marcá los sobrantes como recibidos', 409)
    await db.leftoverReturn.update({ where: { id }, data: { status: 'reembolsada', refundedAt: new Date(), providerNote: d.note?.trim() || ret.providerNote } })
    await notifyRequester('devolucion_reembolsada', 'Reembolso en efectivo registrado', `${ret.provider.businessName} registró que te devolvió ${formatARS(ret.refundTotal)} en efectivo por tus sobrantes.`)
    return ok({ success: true, status: 'reembolsada' })
  }

  // ─────────────── REINTENTAR REEMBOLSO MP ───────────────
  if (d.action === 'reintentar_reembolso') {
    if (st !== 'reembolso_fallido') return fail('Solo se reintenta un reembolso que falló', 409)
    if (ret.paymentMethod !== 'mercadopago' || !ret.mpPaymentId) return fail('Este pago no fue por Mercado Pago: marcá el reembolso en efectivo', 409)
    const result = await doRefund(ret, ret.refundTotal)
    if (!result.ok) {
      await db.leftoverReturn.update({ where: { id }, data: { providerNote: result.error } })
      return fail(`No pudimos reembolsar por Mercado Pago: ${result.error}`, 503, { retry: true })
    }
    await db.leftoverReturn.update({ where: { id }, data: { status: 'reembolsada', refundedAt: new Date(), mpRefundId: result.refundId, providerNote: null } })
    await notifyRequester('devolucion_reembolsada', 'Reembolso acreditado', `Mercado Pago te devuelve ${formatARS(ret.refundTotal)} a tu medio de pago en 1 a 15 días.`)
    return ok({ success: true, status: 'reembolsada', mpRefundId: result.refundId })
  }

  return fail('Acción no reconocida')
}

type RetForRefund = {
  id: string; purchaseId: string | null; chargeId: string | null; invoiceId: string | null
  mpPaymentId: string | null; refundTotal: number
  provider: { id: string; mpOauthAccessToken: string | null; mpOauthRefreshToken: string | null; mpOauthExpiresAt: Date | null; mpOauthStatus: string }
}

/** Reembolso por MP con el mismo token que cobró: OAuth del proveedor si fue venta directa (split), plataforma si no. */
async function doRefund(ret: RetForRefund, amount: number): Promise<{ ok: true; refundId: string } | { ok: false; error: string }> {
  if (!ret.mpPaymentId) return { ok: false, error: 'Sin id de pago de Mercado Pago' }
  if (amount <= 0) return { ok: false, error: 'Monto a reembolsar en cero' }
  try {
    const payment = await db.payment.findUnique({ where: { mpPaymentId: ret.mpPaymentId } })
    if (payment && amount > round2(payment.amount - payment.refundedAmount) + 1e-9) {
      return { ok: false, error: `El reembolso (${formatARS(amount)}) supera lo que queda del pago (${formatARS(round2(payment.amount - payment.refundedAmount))})` }
    }
    let accessToken: string | null = null
    if (ret.purchaseId) {
      try { accessToken = await ensureFreshSellerToken(ret.provider) } catch { accessToken = null }
      if (!accessToken) return { ok: false, error: 'Tu cuenta de Mercado Pago no está conectada: reconectala en Cobros y reintentá' }
    }
    const res = await refundPayment({ paymentId: ret.mpPaymentId, amount, accessToken, idempotencyKey: `return-${ret.id}` })
    if (payment) {
      await db.payment.update({ where: { id: payment.id }, data: { refundedAmount: { increment: amount } } })
    }
    return { ok: true, refundId: res.id }
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error desconocido de Mercado Pago'
    console.error('[returns] refund', ret.id, msg)
    return { ok: false, error: msg.slice(0, 300) }
  }
}

/** Tope de reembolso: lo pagado menos lo ya reembolsado de ese mismo pago. */
async function refundCap(ret: { mpPaymentId: string | null; chargeId: string | null; invoiceId: string | null; purchaseId: string | null }): Promise<number> {
  if (ret.mpPaymentId) {
    const p = await db.payment.findUnique({ where: { mpPaymentId: ret.mpPaymentId } })
    if (p) return round2(p.amount - p.refundedAmount)
  }
  if (ret.chargeId) {
    const c = await db.providerCharge.findUnique({ where: { id: ret.chargeId }, select: { amount: true } })
    if (c) return c.amount
  }
  if (ret.invoiceId) {
    const i = await db.invoice.findUnique({ where: { id: ret.invoiceId }, select: { total: true } })
    if (i) return i.total
  }
  if (ret.purchaseId) {
    const p = await db.purchase.findUnique({ where: { id: ret.purchaseId }, select: { total: true } })
    if (p) return p.total
  }
  return Number.POSITIVE_INFINITY
}

/** Los ítems recibidos vuelven al stock del proveedor (si publica ese elemento). */
async function restock(providerId: string, elementId: string, qty: number, note: string) {
  const stock = await db.providerStock.findUnique({ where: { providerId_elementId: { providerId, elementId } } })
  if (!stock) return
  const s = await db.providerStock.update({ where: { id: stock.id }, data: { quantity: { increment: qty } } })
  await db.stockMovement.create({ data: { stockId: stock.id, type: 'devolucion', quantity: qty, note } })
  await db.providerStock.update({
    where: { id: stock.id },
    data: { status: s.quantity <= 0 ? 'agotado' : s.quantity <= s.minStock ? 'por_agotar' : 'disponible' },
  })
}

function originLink(ret: { projectId: string | null; purchaseId: string | null }) {
  return ret.projectId ? `#/panel/cliente/proyectos/${ret.projectId}` : '#/panel/cliente/materiales?tab=compras'
}

function formatARS(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}
