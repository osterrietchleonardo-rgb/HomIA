import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody, parseJson } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { refundPayment, ensureFreshSellerToken } from '@/lib/mercadopago'
import { round2, OUTSIDE_REFUND_METHODS, OUTSIDE_REFUND_LABEL } from '@/lib/leftovers'
import { logActivity, type ActorRole } from '@/lib/activity'

// ── Máquina de estados de una devolución de sobrantes ──
//   solicitada ─aceptar(vend)──▶ aceptada | aceptada_parcial ─recibir(vend)──▶ recibida (efectivo / fuera de HomIA) | reembolsada (MP) | reembolso_fallido
//       │                                                                             │                                          │
//       ├─rechazar(vend)──▶ rechazada                   reembolsar_efectivo | reembolsar_fuera (vend) ─▶ reembolsada    reintentar_reembolso(vend)
//       └─cancelar(solicitante)──▶ cancelada
// Sin retroceso desde `recibida`.
// "vend" = el VENDEDOR de esa devolución (D14): el proveedor, o el profesional cuando el
// material se cobró en su factura (sellerKind = profesional). Solo las dos partes ven y actúan.
// Pata profesional → proveedor (tipo = profesional_a_proveedor): el pago original fue por
// fuera de HomIA, así que el reembolso también (reembolsar_fuera: efectivo, transferencia o
// saldo a favor + nota). Nunca se intenta Mercado Pago en esa pata.
// Reembolso en efectivo o por fuera: el solicitante confirma que lo recibió
// (confirmar_reembolso) o el cron lo confirma solo a las 72 h (refundConfirmedBy = automatico).
// Si el vendedor no responde una devolución en 72 h, el cron le manda UN recordatorio.

const schema = z.object({
  action: z.enum(['aceptar', 'rechazar', 'cancelar', 'recibir', 'reembolsar_efectivo', 'reembolsar_fuera', 'reintentar_reembolso', 'confirmar_reembolso']),
  note: z.string().max(500).optional(),
  // reembolsar_fuera: cómo le devolvió la plata el proveedor al profesional
  metodo: z.enum(OUTSIDE_REFUND_METHODS, { message: 'Indicá cómo devolviste la plata: efectivo, transferencia o saldo a favor' }).optional(),
  nota: z.string().max(300).optional(),
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
  professional: { include: { user: { select: { displayName: true } } } },
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
  const sellerIsPro = ret.sellerKind === 'profesional'
  const proLeg = ret.tipo === 'profesional_a_proveedor'
  const sellerUserId = sellerIsPro ? ret.professional?.userId : ret.provider?.userId
  const sellerName = sellerIsPro
    ? (ret.professional?.companyName || ret.professional?.user.displayName || 'El profesional')
    : (ret.provider?.businessName || 'El proveedor')
  const isRequester = ret.requesterId === user.id
  const isSeller = !!sellerUserId && sellerUserId === user.id
  if (!isRequester && !isSeller) return fail('No tenés acceso a esta devolución', 403)

  const st = ret.status
  // el solicitante puede ser el cliente o el PROFESIONAL del proyecto: el aviso lo
  // lleva a SU panel (antes siempre iba al panel de cliente, que el pro no tiene)
  // (en compras, el comprador puede ser un profesional sin rol cliente: va a SU panel de pedidos)
  const originPurchase = ret.purchaseId
    ? await db.purchase.findUnique({ where: { id: ret.purchaseId }, select: { orderId: true, client: { select: { roles: true } } } })
    : null
  const requesterPanel: 'cliente' | 'profesional' = proLeg
    ? 'profesional'
    : ret.projectId
      ? (await db.project.findUnique({ where: { id: ret.projectId }, select: { clientId: true } }))?.clientId === ret.requesterId ? 'cliente' : 'profesional'
      : parseJson<string[]>(originPurchase?.client.roles, []).includes('cliente') || !originPurchase ? 'cliente' : 'profesional'
  const requesterLink = proLeg ? '#/panel/profesional/devoluciones?tab=proveedores' : originLink(ret, requesterPanel, originPurchase?.orderId)
  const sellerLink = sellerIsPro ? '#/panel/profesional/devoluciones?tab=clientes' : '#/panel/proveedor/cobros?tab=devoluciones'
  const notifyRequester = (type: string, title: string, body: string) =>
    db.notification.create({ data: { userId: ret.requesterId, type, title, body, link: requesterLink } })
  const notifySeller = (type: string, title: string, body: string) =>
    sellerUserId ? db.notification.create({ data: { userId: sellerUserId, type, title, body, link: sellerLink } }) : Promise.resolve(null)
  const actorRole: ActorRole = isRequester ? requesterPanel : sellerIsPro ? 'profesional' : 'proveedor'
  const log = (type: string, message: string, data: Record<string, unknown> = {}) =>
    logActivity({ projectId: ret.projectId, purchaseId: ret.purchaseId, actorId: user.id, actorRole, type, message, data: { returnId: ret.id, tipo: ret.tipo, sellerKind: ret.sellerKind, ...data } })
  const label = `${ret.items.length} ítem${ret.items.length === 1 ? '' : 's'}`

  // ─────────────── CANCELAR (solicitante) ───────────────
  if (d.action === 'cancelar') {
    if (!isRequester) return fail('Solo quien pidió la devolución puede cancelarla', 403)
    if (st !== 'solicitada') return fail(st === 'cancelada' ? 'Esta devolución ya está cancelada' : `Solo se cancela una devolución que ${sellerIsPro ? 'el profesional' : 'el proveedor'} todavía no respondió`, 409)
    await db.leftoverReturn.update({ where: { id }, data: { status: 'cancelada' } })
    await notifySeller('devolucion_cancelada', 'Devolución cancelada', `${user.displayName} canceló su pedido de devolución (${label}).`)
    await log('devolucion_cancelada', `${user.displayName} canceló el pedido de devolución (${label}).`)
    return ok({ success: true, status: 'cancelada' })
  }

  // ─────────────── CONFIRMAR REEMBOLSO EN EFECTIVO / POR FUERA (solicitante) ───────────────
  // El vendedor marca el reembolso; el solicitante confirma que lo recibió.
  // Si no confirma, el cron lo da por confirmado a las 72 h (queda "automatico").
  if (d.action === 'confirmar_reembolso') {
    if (!isRequester) return fail('Solo quien pidió la devolución confirma que recibió el reembolso', 403)
    if (st !== 'reembolsada' || isMpRefund(ret)) {
      return fail('Solo se confirma un reembolso en efectivo (o por fuera de HomIA) ya registrado por quien te vendió', 409)
    }
    if (ret.refundConfirmedAt) return fail('Ya confirmaste este reembolso', 409)
    const upd = await db.leftoverReturn.updateMany({
      where: { id, refundConfirmedAt: null },
      data: { refundConfirmedAt: new Date(), refundConfirmedBy: 'solicitante' },
    })
    if (upd.count === 0) return fail('Ya confirmaste este reembolso', 409)
    const how = proLeg ? OUTSIDE_REFUND_LABEL[ret.refundMethod || ''] || 'por fuera de HomIA' : 'en efectivo'
    await notifySeller('devolucion_reembolso_confirmado', proLeg ? 'El profesional confirmó el reembolso' : 'El cliente confirmó el reembolso', `${user.displayName} confirmó que recibió ${formatARS(ret.refundTotal)} ${how} por sus sobrantes. La devolución quedó cerrada.`)
    await log('devolucion_reembolso_confirmado', `${user.displayName} confirmó que recibió el reembolso de ${formatARS(ret.refundTotal)} ${how}.`)
    return ok({ success: true, status: 'reembolsada', refundConfirmedBy: 'solicitante' })
  }

  if (!isSeller) return fail(`Solo ${sellerIsPro ? 'el profesional que te cobró los materiales' : 'el proveedor'} gestiona la devolución`, 403)

  // ─────────────── RECHAZAR ───────────────
  if (d.action === 'rechazar') {
    if (st !== 'solicitada') return fail('Solo se rechaza una devolución pendiente de respuesta', 409)
    const note = d.note?.trim() || null
    await db.leftoverReturn.update({ where: { id }, data: { status: 'rechazada', providerNote: note, respondedAt: new Date() } })
    await db.leftoverItem.updateMany({ where: { returnId: id }, data: { status: 'rechazado' } })
    await notifyRequester('devolucion_rechazada', 'Devolución rechazada', `${sellerName} no aceptó la devolución (${label}).${note ? ` Motivo: ${note}` : ''}`)
    await log('devolucion_rechazada', `${sellerName} rechazó la devolución (${label}).${note ? ` Motivo: ${note}` : ''}`)
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
    const howRefund = proLeg
      ? 'te devuelve la plata por fuera de HomIA (efectivo, transferencia o saldo a favor en el local) y lo marca en la app'
      : ret.paymentMethod === 'mercadopago'
        ? 'el reembolso vuelve solo a tu medio de pago de Mercado Pago'
        : sellerIsPro ? 'te devuelve el dinero en efectivo' : 'te devuelve el dinero en efectivo en el mostrador'
    // ¿dónde se entregan los sobrantes? al profesional, o en el local del proveedor
    const bringTitle = sellerIsPro ? `entregale los sobrantes a ${sellerName}` : 'acercá los sobrantes al local'
    await notifyRequester(
      'devolucion_aceptada',
      status === 'aceptada' ? `Devolución aceptada: ${bringTitle}` : `Devolución aceptada en parte: ${bringTitle}`,
      `${sellerName} acepta ${accepted.length} de ${ret.items.length} ítem${ret.items.length === 1 ? '' : 's'} por ${formatARS(refundTotal)}. Cuando los reciba, ${howRefund}.`
    )
    await log('devolucion_aceptada', `${sellerName} aceptó ${accepted.length} de ${ret.items.length} ítem${ret.items.length === 1 ? '' : 's'} por ${formatARS(refundTotal)}.`)
    return ok({ success: true, status, refundTotal })
  }

  // ─────────────── RECIBIR (devuelve stock al proveedor + reembolso) ───────────────
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
      // solo vuelve al stock del PROVEEDOR que vendió; lo que recibe el profesional no toca ningún stock (D14)
      if (r.qty > 0 && !sellerIsPro && ret.providerId) await restock(ret.providerId, r.elementId, r.qty, `Devolución de sobrantes ${ret.id}`)
    }
    const receivedAt = new Date()

    // pata profesional → proveedor: el pago fue por fuera de HomIA, el reembolso también
    if (proLeg) {
      await db.leftoverReturn.update({ where: { id }, data: { status: 'recibida', refundTotal, receivedAt } })
      await notifyRequester('devolucion_recibida', 'El proveedor recibió tus materiales', `${sellerName} recibió los materiales que le devolviste. Te devuelve ${formatARS(refundTotal)} por fuera de HomIA (efectivo, transferencia o saldo a favor) y lo marca en la app.`)
      await log('devolucion_recibida', `${sellerName} recibió los materiales devueltos; reembolso por fuera de HomIA de ${formatARS(refundTotal)}.`)
      return ok({ success: true, status: 'recibida', refundTotal })
    }

    if (ret.paymentMethod === 'mercadopago' && ret.mpPaymentId) {
      const result = await doRefund({ ...ret, refundTotal }, refundTotal)
      await db.leftoverReturn.update({
        where: { id },
        data: result.ok
          ? { status: 'reembolsada', refundTotal, receivedAt, refundedAt: new Date(), mpRefundId: result.refundId, providerNote: null, refundChannel: 'mercadopago' }
          : { status: 'reembolso_fallido', refundTotal, receivedAt, providerNote: result.error, refundChannel: 'mercadopago' },
      })
      if (result.ok) {
        await notifyRequester('devolucion_reembolsada', 'Sobrantes recibidos y reembolsados', `${sellerName} recibió tus sobrantes. Mercado Pago te devuelve ${formatARS(refundTotal)} a tu medio de pago en 1 a 15 días.`)
        await log('devolucion_reembolsada', `${sellerName} recibió los sobrantes y reembolsó ${formatARS(refundTotal)} por Mercado Pago.`)
        return ok({ success: true, status: 'reembolsada', refundTotal, mpRefundId: result.refundId })
      }
      await notifyRequester('devolucion_recibida', 'Sobrantes recibidos: reembolso en proceso', `${sellerName} recibió tus sobrantes. El reembolso de ${formatARS(refundTotal)} por Mercado Pago está en proceso; te avisamos cuando se acredite.`)
      await log('devolucion_reembolso_fallido', `${sellerName} recibió los sobrantes; falló el reembolso por Mercado Pago.`)
      return ok({ success: true, status: 'reembolso_fallido', refundTotal, error: result.error }, 200)
    }

    // efectivo (o pago MP sin id): el vendedor devuelve en mano y lo marca
    await db.leftoverReturn.update({ where: { id }, data: { status: 'recibida', refundTotal, receivedAt } })
    await notifyRequester('devolucion_recibida', 'Sobrantes recibidos', `${sellerName} recibió tus sobrantes. Te devuelve ${formatARS(refundTotal)} en efectivo${sellerIsPro ? '' : ' en el mostrador'}.`)
    await log('devolucion_recibida', `${sellerName} recibió los sobrantes; reembolso en efectivo de ${formatARS(refundTotal)} pendiente.`)
    return ok({ success: true, status: 'recibida', refundTotal })
  }

  // ─────────────── REEMBOLSAR EFECTIVO (pata cliente) ───────────────
  if (d.action === 'reembolsar_efectivo') {
    if (proLeg) return fail('Esta devolución se reembolsa por fuera de HomIA: marcá cómo devolviste la plata', 409)
    if (st !== 'recibida') return fail(st === 'reembolsada' ? 'Esta devolución ya está reembolsada' : 'Primero marcá los sobrantes como recibidos', 409)
    await db.leftoverReturn.update({ where: { id }, data: { status: 'reembolsada', refundedAt: new Date(), refundChannel: 'efectivo', providerNote: d.note?.trim() || ret.providerNote } })
    await notifyRequester('devolucion_reembolsada', 'Reembolso en efectivo registrado: confirmá que lo recibiste', `${sellerName} registró que te devolvió ${formatARS(ret.refundTotal)} en efectivo por tus sobrantes. Confirmalo en la app (si no, se confirma solo a las 72 h).`)
    await log('devolucion_reembolsada', `${sellerName} registró el reembolso en efectivo de ${formatARS(ret.refundTotal)}.`)
    return ok({ success: true, status: 'reembolsada' })
  }

  // ─────────────── REEMBOLSAR POR FUERA DE HOMIA (pata profesional → proveedor) ───────────────
  if (d.action === 'reembolsar_fuera') {
    if (!proLeg) return fail('Solo una devolución de un profesional se reembolsa por fuera de HomIA', 409)
    if (st !== 'recibida') return fail(st === 'reembolsada' ? 'Esta devolución ya está reembolsada' : 'Primero marcá los materiales como recibidos', 409)
    if (!d.metodo) return fail('Indicá cómo devolviste la plata: efectivo, transferencia o saldo a favor', 400)
    const nota = d.nota?.trim() || null
    await db.leftoverReturn.update({
      where: { id },
      data: { status: 'reembolsada', refundedAt: new Date(), refundChannel: 'fuera_de_homia', refundMethod: d.metodo, refundMethodNote: nota },
    })
    const how = OUTSIDE_REFUND_LABEL[d.metodo]
    await notifyRequester('devolucion_reembolsada', 'Tu proveedor registró el reembolso: confirmá que lo recibiste', `${sellerName} registró que te devolvió ${formatARS(ret.refundTotal)} ${how}${nota ? ` (${nota})` : ''}. Confirmalo en la app (si no, se confirma solo a las 72 h).`)
    await log('devolucion_reembolsada', `${sellerName} registró el reembolso de ${formatARS(ret.refundTotal)} ${how} (por fuera de HomIA).`, { metodo: d.metodo })
    return ok({ success: true, status: 'reembolsada', refundChannel: 'fuera_de_homia', refundMethod: d.metodo })
  }

  // ─────────────── REINTENTAR REEMBOLSO MP ───────────────
  if (d.action === 'reintentar_reembolso') {
    if (st !== 'reembolso_fallido') return fail('Solo se reintenta un reembolso que falló', 409)
    if (proLeg || ret.paymentMethod !== 'mercadopago' || !ret.mpPaymentId) return fail('Este pago no fue por Mercado Pago: marcá el reembolso en efectivo', 409)
    const result = await doRefund(ret, ret.refundTotal)
    if (!result.ok) {
      await db.leftoverReturn.update({ where: { id }, data: { providerNote: result.error } })
      return fail(`No pudimos reembolsar por Mercado Pago: ${result.error}`, 503, { retry: true })
    }
    await db.leftoverReturn.update({ where: { id }, data: { status: 'reembolsada', refundedAt: new Date(), mpRefundId: result.refundId, providerNote: null, refundChannel: 'mercadopago' } })
    await notifyRequester('devolucion_reembolsada', 'Reembolso acreditado', `Mercado Pago te devuelve ${formatARS(ret.refundTotal)} a tu medio de pago en 1 a 15 días.`)
    await log('devolucion_reembolsada', `${sellerName} reintentó y reembolsó ${formatARS(ret.refundTotal)} por Mercado Pago.`)
    return ok({ success: true, status: 'reembolsada', mpRefundId: result.refundId })
  }

  return fail('Acción no reconocida')
}

/** ¿El reembolso fue (o va) por Mercado Pago? Entonces no hay confirmación del solicitante. */
function isMpRefund(r: { refundChannel: string | null; paymentMethod: string | null; tipo: string }): boolean {
  if (r.tipo === 'profesional_a_proveedor') return false
  if (r.refundChannel) return r.refundChannel === 'mercadopago'
  return r.paymentMethod === 'mercadopago'
}

type SellerToken = { mpOauthAccessToken: string | null; mpOauthRefreshToken: string | null; mpOauthExpiresAt: Date | null; mpOauthStatus: string }
type RetForRefund = {
  id: string; purchaseId: string | null; chargeId: string | null; invoiceId: string | null
  mpPaymentId: string | null; refundTotal: number; sellerKind: string
  provider: ({ id: string } & SellerToken) | null
}

/** Cargo de servicio HomIA (1%) incluido en el pago original: no se reembolsa. */
async function feeOf(ret: { purchaseId: string | null; chargeId: string | null; invoiceId: string | null }): Promise<number> {
  if (ret.purchaseId) return (await db.purchase.findUnique({ where: { id: ret.purchaseId }, select: { serviceFee: true } }))?.serviceFee ?? 0
  if (ret.chargeId) return (await db.providerCharge.findUnique({ where: { id: ret.chargeId }, select: { serviceFee: true } }))?.serviceFee ?? 0
  if (ret.invoiceId) return (await db.invoice.findUnique({ where: { id: ret.invoiceId }, select: { serviceFee: true } }))?.serviceFee ?? 0
  return 0
}

/**
 * Reembolso por MP con el MISMO token que cobró el pago:
 *  · Payment.collector = 'vendedor' (desde el carrito, 2026-09): el del vendedor →
 *    proveedor en compras y cobros, profesional en facturas (D14: en ese caso el
 *    profesional es además quien acepta y recibe la devolución);
 *  · sin collector (pagos anteriores): compras → proveedor; facturas y cobros → plataforma.
 * Solo se reembolsa el precio de los ítems devueltos: el cargo de servicio no.
 */
async function doRefund(ret: RetForRefund, amount: number): Promise<{ ok: true; refundId: string } | { ok: false; error: string }> {
  if (!ret.mpPaymentId) return { ok: false, error: 'Sin id de pago de Mercado Pago' }
  if (amount <= 0) return { ok: false, error: 'Monto a reembolsar en cero' }
  try {
    const payment = await db.payment.findUnique({ where: { mpPaymentId: ret.mpPaymentId } })
    if (payment) {
      const cap = round2(payment.amount - (await feeOf(ret)) - payment.refundedAmount)
      if (amount > cap + 1e-9) {
        return { ok: false, error: `El reembolso (${formatARS(amount)}) supera lo que queda del pago sin el cargo de servicio (${formatARS(cap)})` }
      }
    }
    const bySeller = payment?.collector === 'vendedor' || (!payment?.collector && !!ret.purchaseId)
    let accessToken: string | null = null
    if (bySeller && ret.invoiceId) {
      // factura cobrada por el profesional: se reembolsa desde su cuenta
      const inv = await db.invoice.findUnique({ where: { id: ret.invoiceId }, select: { professionalId: true } })
      const pro = inv ? await db.professionalProfile.findUnique({ where: { id: inv.professionalId } }) : null
      try { accessToken = pro ? await ensureFreshSellerToken(pro, 'professional') : null } catch { accessToken = null }
      if (!accessToken) {
        return { ok: false, error: ret.sellerKind === 'profesional'
          ? 'Tu cuenta de Mercado Pago no está conectada: reconectala en Mi perfil y reintentá'
          : 'El profesional que cobró la factura no tiene Mercado Pago conectado: coordiná el reembolso con él y reintentá' }
      }
    } else if (bySeller) {
      if (!ret.provider) return { ok: false, error: 'Falta la cuenta del vendedor que cobró el pago' }
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

/** Tope de reembolso: lo pagado sin el cargo de servicio, menos lo ya reembolsado de ese mismo pago.
 *  Pata profesional → proveedor: sin pago en HomIA, el tope es el precio unitario × cantidad de cada ítem. */
async function refundCap(ret: { mpPaymentId: string | null; chargeId: string | null; invoiceId: string | null; purchaseId: string | null }): Promise<number> {
  if (ret.mpPaymentId) {
    const p = await db.payment.findUnique({ where: { mpPaymentId: ret.mpPaymentId } })
    if (p) return round2(p.amount - (await feeOf(ret)) - p.refundedAmount)
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

function originLink(ret: { projectId: string | null; purchaseId: string | null }, panel: 'cliente' | 'profesional', purchaseOrderId?: string | null) {
  if (ret.projectId) return `#/panel/${panel}/proyectos/${ret.projectId}`
  return `#/panel/${panel}/pedidos/${purchaseOrderId || (ret.purchaseId ? `legacy-${ret.purchaseId}` : '')}`.replace(/\/$/, '')
}

function formatARS(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}
