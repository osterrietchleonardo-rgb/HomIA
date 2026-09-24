import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody, appUrl } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { planState } from '@/lib/plans'
import { createPurchasePreference, ensureFreshSellerToken } from '@/lib/mercadopago'

// ── Máquina de estados de una compra directa ──
//   pendiente_aprobacion ─aprobar(prov)──▶ aprobado ─entregar(prov)──▶ entregado | pagado
//          │                                  │
//          ├─rechazar(prov)──▶ rechazado      ├─pagar_efectivo(cli): charge acordada_efectivo
//          └─cancelar(ambos)─▶ cancelado      ├─pagar_mp(cli): preferencia MP del proveedor
//                                             └─cancelar(ambos, si el cobro no está pagado) ─▶ cancelado (+ devuelve stock)
// El cobro (ProviderCharge) nace al aprobar: pendiente → acordada_efectivo/pagada → confirma el proveedor
// (PATCH /api/charges/:id) o el webhook de MP. Al pasar a pagada, la compra queda `pagado`.

const RESERVA_MS = 48 * 60 * 60 * 1000
const COMPRA_MS = 7 * 24 * 60 * 60 * 1000

const schema = z.object({
  action: z.enum(['aprobar', 'rechazar', 'cancelar', 'pagar_efectivo', 'pagar_mp', 'entregar']),
  unitPrice: z.coerce.number().positive().optional(),
  reason: z.string().max(400).optional(),
})

function round2(n: number) {
  return Math.round(n * 100) / 100
}

async function nextChargeNumber() {
  const year = new Date().getFullYear()
  const count = await db.providerCharge.count()
  return `PRV-${year}-${String(count + 1).padStart(6, '0')}`
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error
  const d = parsed.data

  const purchase = await db.purchase.findUnique({
    where: { id },
    include: { provider: true, client: { select: { id: true, displayName: true } } },
  })
  if (!purchase) return fail('Compra no encontrada', 404)

  const isClient = purchase.clientId === user.id
  const isProvider = purchase.provider.userId === user.id
  if (!isClient && !isProvider) return fail('No tenés acceso a esta compra', 403)

  const charge = purchase.chargeId ? await db.providerCharge.findUnique({ where: { id: purchase.chargeId } }) : null
  const chargePagado = charge?.status === 'pagada'
  const label = `${purchase.elementName} × ${purchase.quantity} ${purchase.unit}`
  const st = purchase.status

  // ─────────────── CANCELAR (cliente o proveedor) ───────────────
  if (d.action === 'cancelar') {
    if (!['pendiente_aprobacion', 'aprobado'].includes(st)) {
      return fail(
        st === 'cancelado' ? 'Este pedido ya está cancelado'
          : st === 'rechazado' ? 'Este pedido ya fue rechazado'
            : 'El pedido ya fue entregado o pagado: coordiná con la otra parte por chat',
        409
      )
    }
    if (chargePagado) return fail('El cobro ya está pagado: no se puede cancelar. Coordiná por chat', 409)

    if (st === 'aprobado') await liberarStock(purchase.stockId, purchase.quantity, `Cancelación de pedido ${purchase.id}`)
    await db.purchase.update({ where: { id }, data: { status: 'cancelado', rejectionReason: d.reason?.trim() || null } })
    if (charge && charge.status !== 'anulada') {
      await db.providerCharge.update({ where: { id: charge.id }, data: { status: 'anulada' } })
    }
    const otherId = isClient ? purchase.provider.userId : purchase.clientId
    await db.notification.create({
      data: {
        userId: otherId,
        type: 'compra_cancelada',
        title: 'Pedido cancelado',
        body: `${user.displayName} canceló el pedido de ${label}.`,
        link: isClient ? '#/panel/proveedor/cobros?tab=ventas' : '#/panel/cliente/materiales?tab=compras',
      },
    })
    return ok({ success: true, status: 'cancelado' })
  }

  // ─────────────── ACCIONES DEL CLIENTE ───────────────
  if (d.action === 'pagar_efectivo' || d.action === 'pagar_mp') {
    if (!isClient) return fail('Solo el cliente paga su pedido', 403)
    if (st !== 'aprobado') {
      return fail(
        st === 'pendiente_aprobacion' ? 'El proveedor todavía no aprobó tu pedido'
          : st === 'pagado' ? 'Este pedido ya está pagado'
            : 'Este pedido no está en condiciones de pagarse',
        409
      )
    }
    if (!charge || charge.status === 'anulada') return fail('Este pedido no tiene un cobro emitido. Escribile al proveedor por chat', 409)
    if (chargePagado) return fail('Este pedido ya está pagado', 409)

    if (d.action === 'pagar_efectivo') {
      await db.providerCharge.update({ where: { id: charge.id }, data: { status: 'acordada_efectivo', method: 'efectivo' } })
      await db.purchase.update({ where: { id }, data: { paymentMethod: 'efectivo' } })
      await db.notification.create({
        data: {
          userId: purchase.provider.userId,
          type: 'cobro_efectivo_acordado',
          title: 'Pago en efectivo acordado',
          body: `${user.displayName} paga ${label} en efectivo al retirar. Confirmá el cobro cuando recibas el dinero.`,
          link: '#/panel/proveedor/cobros?tab=ventas',
        },
      })
      return ok({ success: true, status: st, paymentMethod: 'efectivo', chargeStatus: 'acordada_efectivo' })
    }

    // pagar_mp: Checkout Pro con el token del proveedor (cobra directo a su cuenta)
    if (purchase.total <= 0) return fail('Este pedido no tiene precio todavía: pedile al proveedor que lo fije', 409)
    let sellerAccessToken: string
    try {
      sellerAccessToken = await ensureFreshSellerToken(purchase.provider)
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'PROVIDER_NOT_CONNECTED') {
        return fail('Este proveedor todavía no conectó Mercado Pago. Podés pagar en efectivo al retirar', 503, { needsConfig: true })
      }
      console.error('[purchases] ensureFreshSellerToken', e)
      return fail('No pudimos conectar con Mercado Pago del proveedor. Podés pagar en efectivo al retirar', 503, { needsConfig: true })
    }
    try {
      const pref = await createPurchasePreference({
        purchaseId: purchase.id,
        title: label,
        total: purchase.total,
        payerEmail: user.email,
        baseUrl: appUrl(),
        sellerAccessToken,
        marketplaceFee: round2(purchase.total * 0.01),
      })
      await db.purchase.update({ where: { id }, data: { mpPreferenceId: pref.id, paymentMethod: 'mercadopago' } })
      await db.providerCharge.update({ where: { id: charge.id }, data: { mpPreferenceId: pref.id, method: 'mercadopago' } })
      return ok({ success: true, initPoint: pref.initPoint, init_point: pref.initPoint, preferenceId: pref.id })
    } catch (e) {
      const msg = e instanceof Error ? e.message : ''
      if (msg === 'PROVIDER_NOT_CONNECTED') {
        return fail('Este proveedor todavía no conectó Mercado Pago. Podés pagar en efectivo al retirar', 503, { needsConfig: true })
      }
      console.error('[purchases] createPurchasePreference', e)
      return fail('Mercado Pago no respondió. Probá de nuevo en un rato o pagá en efectivo al retirar', 503, { needsConfig: true })
    }
  }

  // ─────────────── ACCIONES DEL PROVEEDOR ───────────────
  if (!isProvider) return fail('Solo el proveedor puede gestionar tu pedido', 403)

  const state = planState(purchase.provider)
  if (!state.activo) return fail('Tu prueba gratis terminó: elegí un plan Básico o PRO para seguir vendiendo', 403, { needsPlan: true })

  if (d.action === 'aprobar') {
    if (st !== 'pendiente_aprobacion') {
      return fail(st === 'aprobado' ? 'Este pedido ya está aprobado' : 'Solo se aprueban pedidos pendientes', 409)
    }
    if (!purchase.stockId) return fail('Este pedido no está asociado a un stock tuyo', 409)

    // precio final: el de la oferta, o el que fija el proveedor si se pidió "a coordinar"
    let unitPrice = purchase.unitPrice
    if (d.unitPrice && d.unitPrice > 0) unitPrice = round2(d.unitPrice)
    if (unitPrice <= 0) return fail('Este pedido se pidió sin precio: fijá el precio unitario para aprobarlo', 400, { needsPrice: true })
    const total = round2(unitPrice * purchase.quantity)
    if (total <= 0) return fail('El precio tiene que ser mayor a cero', 400, { needsPrice: true })

    // reserva atómica de stock: solo si alcanza
    const reserved = await db.providerStock.updateMany({
      where: { id: purchase.stockId, quantity: { gte: purchase.quantity } },
      data: { quantity: { decrement: purchase.quantity } },
    })
    if (reserved.count === 0) return fail('No te queda stock suficiente para este pedido', 409)
    await db.stockMovement.create({
      data: { stockId: purchase.stockId, type: 'reserva', quantity: purchase.quantity, note: `Pedido ${purchase.id} de ${purchase.client.displayName}` },
    })
    await refreshStockStatus(purchase.stockId)

    const newCharge = await db.providerCharge.create({
      data: {
        number: await nextChargeNumber(),
        providerId: purchase.providerId,
        clientId: purchase.clientId,
        projectId: null,
        amount: total,
        status: 'pendiente',
        materialIds: '[]',
        description: `Compra directa: ${purchase.elementName} x ${purchase.quantity}`,
      },
    })
    const expiresAt = new Date(Date.now() + (purchase.type === 'reserva' ? RESERVA_MS : COMPRA_MS))
    await db.purchase.update({
      where: { id },
      data: {
        status: 'aprobado',
        approvedAt: new Date(),
        reservationExpiresAt: expiresAt,
        unitPrice,
        total,
        chargeId: newCharge.id,
      },
    })
    await db.notification.create({
      data: {
        userId: purchase.clientId,
        type: 'compra_aprobada',
        title: 'Tu pedido fue aprobado: pagá para retirarlo',
        body: `${purchase.provider.businessName} aprobó ${label} por ${formatARS(total)}. Tenés hasta el ${expiresAt.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} para ${purchase.type === 'reserva' ? 'retirarlo' : 'pagarlo y retirarlo'}.`,
        link: '#/panel/cliente/materiales?tab=compras',
      },
    })
    return ok({ success: true, status: 'aprobado', chargeId: newCharge.id, total, reservationExpiresAt: expiresAt })
  }

  if (d.action === 'rechazar') {
    if (st !== 'pendiente_aprobacion') return fail('Solo se rechazan pedidos pendientes', 409)
    const reason = d.reason?.trim() || null
    await db.purchase.update({ where: { id }, data: { status: 'rechazado', rejectionReason: reason } })
    await db.notification.create({
      data: {
        userId: purchase.clientId,
        type: 'compra_rechazada',
        title: 'Tu pedido fue rechazado',
        body: `${purchase.provider.businessName} rechazó tu pedido de ${label}.${reason ? ` Motivo: ${reason}` : ''}`,
        link: '#/panel/cliente/materiales?tab=compras',
      },
    })
    return ok({ success: true, status: 'rechazado' })
  }

  if (d.action === 'entregar') {
    // Desde `aprobado` siempre. Desde `pagado` solo si todavía no se registró la entrega
    // (el webhook de MP puede marcar pagado antes de que el cliente retire).
    if (st !== 'aprobado' && st !== 'pagado') {
      return fail(
        st === 'pendiente_aprobacion' ? 'Primero aprobá el pedido' : st === 'entregado' ? 'Este pedido ya está entregado' : 'No podés entregar este pedido ahora',
        409
      )
    }
    if (purchase.stockId) {
      const yaEntregado = await db.stockMovement.findFirst({
        where: { stockId: purchase.stockId, type: 'consumo', note: { contains: purchase.id } },
      })
      if (yaEntregado) return fail('Este pedido ya está entregado', 409)
      await db.stockMovement.create({
        data: { stockId: purchase.stockId, type: 'consumo', quantity: purchase.quantity, note: `Entrega del pedido ${purchase.id}` },
      })
    }
    // nunca retroceder desde pagado
    const nextStatus = st === 'pagado' || chargePagado ? 'pagado' : 'entregado'
    await db.purchase.update({ where: { id }, data: { status: nextStatus } })
    await db.notification.create({
      data: {
        userId: purchase.clientId,
        type: 'compra_entregada',
        title: nextStatus === 'pagado' ? 'Pedido entregado' : 'Pedido entregado: falta el pago',
        body: nextStatus === 'pagado'
          ? `${purchase.provider.businessName} te entregó ${label}. ¡Ya podés calificar tu compra!`
          : `${purchase.provider.businessName} te entregó ${label}. Cuando el pago quede confirmado, podés calificar tu compra.`,
        link: '#/panel/cliente/materiales?tab=compras',
      },
    })
    return ok({ success: true, status: nextStatus })
  }

  return fail('Acción no reconocida')
}

/** Devuelve stock reservado y registra el movimiento de liberación. */
async function liberarStock(stockId: string | null, quantity: number, note: string) {
  if (!stockId) return
  const stock = await db.providerStock.findUnique({ where: { id: stockId } })
  if (!stock) return
  await db.providerStock.update({ where: { id: stockId }, data: { quantity: { increment: quantity } } })
  await db.stockMovement.create({ data: { stockId, type: 'liberacion', quantity, note } })
  await refreshStockStatus(stockId)
}

/** Recalcula el estado derivado del stock (disponible | por_agotar | agotado). */
async function refreshStockStatus(stockId: string) {
  const s = await db.providerStock.findUnique({ where: { id: stockId }, select: { quantity: true, minStock: true } })
  if (!s) return
  const status = s.quantity <= 0 ? 'agotado' : s.quantity <= s.minStock ? 'por_agotar' : 'disponible'
  await db.providerStock.update({ where: { id: stockId }, data: { status } })
}

function formatARS(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}
