import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody, appUrl, parseJson } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { planState } from '@/lib/plans'
import { createSellerPreference } from '@/lib/mercadopago'
import { createWithChargeNumber } from '@/lib/charge-number'
import { purchaseLines, releaseLines, refreshStockStatus, fmt, type PurchaseLine } from '@/lib/orders'
import { serviceFeeFor, round2, totalWithMp } from '@/lib/fees'
import { logActivity } from '@/lib/activity'
import { sellerTokenOr503, mpDown } from '@/lib/seller-pay'
import { LEGACY_PREFIX } from '@/lib/order-view'

// ── Máquina de estados de un sub-pedido (compra a UN proveedor, con uno o más ítems) ──
//   pendiente_aprobacion ─aprobar(prov)──▶ aprobado ─entregar(prov)──▶ entregado | pagado
//          │                                  │
//          ├─rechazar(prov)──▶ rechazado      ├─pagar_efectivo(cli): charge acordada_efectivo (también desde entregado)
//          └─cancelar(ambos)─▶ cancelado      ├─pagar_mp(cli): preferencia MP con el token del proveedor + cargo 1%
//                                             └─cancelar(ambos, si el cobro no está pagado) ─▶ cancelado (+ devuelve stock)
// Aprobar reserva TODOS los ítems en una transacción: si alguno no alcanza, no se
// reserva nada y el 409 dice cuál. El cobro (ProviderCharge) nace al aprobar:
// pendiente → acordada_efectivo/pagada → confirma el proveedor (PATCH /api/charges/:id)
// o el webhook de MP. Al pasar a pagada, el sub-pedido queda `pagado`.
// Cada acción queda en la línea de tiempo (ActivityEvent) y avisa a la otra parte.

const RESERVA_MS = 48 * 60 * 60 * 1000
const COMPRA_MS = 7 * 24 * 60 * 60 * 1000

const schema = z.object({
  action: z.enum(['aprobar', 'rechazar', 'cancelar', 'pagar_efectivo', 'pagar_mp', 'entregar']),
  unitPrice: z.coerce.number().positive().optional(),
  reason: z.string().max(400).optional(),
})

class StockShortError extends Error {
  constructor(readonly line: PurchaseLine, readonly available: number) {
    super('STOCK_SHORT')
  }
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
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      provider: true,
      client: { select: { id: true, displayName: true, roles: true } },
      order: { select: { id: true, number: true } },
    },
  })
  if (!purchase) return fail('Compra no encontrada', 404)

  const isClient = purchase.clientId === user.id
  const isProvider = purchase.provider.userId === user.id
  if (!isClient && !isProvider) return fail('No tenés acceso a esta compra', 403)

  const charge = purchase.chargeId ? await db.providerCharge.findUnique({ where: { id: purchase.chargeId } }) : null
  const chargePagado = charge?.status === 'pagada'
  const lines = purchaseLines(purchase)
  const label = purchase.elementName
  const st = purchase.status
  // el comprador puede ser cliente o profesional: los avisos lo llevan a SU panel
  const buyerRoles = parseJson<string[]>(purchase.client.roles, [])
  const buyerPanel = buyerRoles.includes('cliente') ? 'cliente' : buyerRoles.includes('profesional') ? 'profesional' : 'cliente'
  const orderKey = purchase.orderId || `${LEGACY_PREFIX}${purchase.id}`
  const clientLink = `#/panel/${buyerPanel}/pedidos/${orderKey}`
  const providerLink = '#/panel/proveedor/cobros?tab=ventas'
  const ref = purchase.order ? `${purchase.order.number} · ` : ''
  const ev = (type: string, message: string, data?: Record<string, unknown>) =>
    logActivity({
      orderId: purchase.orderId, purchaseId: purchase.id, actorId: user.id,
      actorRole: isProvider ? 'proveedor' : buyerPanel, type, message, data,
    })

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

    // cancelación condicional: si otro proceso la cambió entre medio, no se libera stock dos veces
    const upd = await db.purchase.updateMany({ where: { id, status: st }, data: { status: 'cancelado', rejectionReason: d.reason?.trim() || null } })
    if (upd.count === 0) return fail('El pedido cambió de estado recién: actualizá la pantalla', 409)
    if (st === 'aprobado') await releaseLines(lines, `Cancelación del pedido ${purchase.id}`)
    if (charge && charge.status !== 'anulada') {
      await db.providerCharge.update({ where: { id: charge.id }, data: { status: 'anulada' } })
    }
    const otherId = isClient ? purchase.provider.userId : purchase.clientId
    await db.notification.create({
      data: {
        userId: otherId,
        type: 'compra_cancelada',
        title: 'Pedido cancelado',
        body: `${user.displayName} canceló el pedido ${ref}${label}.${d.reason?.trim() ? ` Motivo: ${d.reason.trim()}` : ''}`,
        link: isClient ? providerLink : clientLink,
      },
    })
    await ev('cancelado', `${user.displayName} canceló el pedido${st === 'aprobado' ? ' (el stock reservado volvió al proveedor)' : ''}.${d.reason?.trim() ? ` Motivo: ${d.reason.trim()}` : ''}`)
    return ok({ success: true, status: 'cancelado' })
  }

  // ─────────────── ACCIONES DEL CLIENTE ───────────────
  if (d.action === 'pagar_efectivo' || d.action === 'pagar_mp') {
    if (!isClient) return fail('Solo el cliente paga su pedido', 403)
    // se paga desde `aprobado` o, si el proveedor entregó antes de cobrar, desde `entregado`
    if (st !== 'aprobado' && st !== 'entregado') {
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
      // en efectivo NO hay cargo de servicio
      await db.providerCharge.update({ where: { id: charge.id }, data: { status: 'acordada_efectivo', method: 'efectivo', serviceFee: 0 } })
      await db.purchase.update({ where: { id }, data: { paymentMethod: 'efectivo', serviceFee: 0 } })
      await db.notification.create({
        data: {
          userId: purchase.provider.userId,
          type: 'cobro_efectivo_acordado',
          title: 'Pago en efectivo acordado',
          body: `${user.displayName} paga ${ref}${label} (${fmt(purchase.total)}) en efectivo al retirar. Confirmá el cobro cuando recibas el dinero.`,
          link: providerLink,
        },
      })
      await ev('pago_efectivo_acordado', `${user.displayName} eligió pagar ${fmt(purchase.total)} en efectivo al retirar (sin cargo de servicio).`)
      return ok({ success: true, status: st, paymentMethod: 'efectivo', chargeStatus: 'acordada_efectivo' })
    }

    // pagar_mp: Checkout Pro con el token del proveedor (cobra directo a su cuenta) + cargo 1%
    if (purchase.total <= 0) return fail('Este pedido no tiene precio todavía: pedile al proveedor que lo fije', 409)
    const tk = await sellerTokenOr503(purchase.provider, 'provider', purchase.provider.businessName)
    if (tk.error) return tk.error
    const fee = serviceFeeFor(purchase.total)
    let pref: { id: string; initPoint: string }
    try {
      pref = await createSellerPreference({
        kind: 'purchase',
        id: purchase.id,
        items: lines.map((l) => ({ id: l.id, title: l.elementName, quantity: l.quantity, unitPrice: l.unitPrice })),
        serviceFee: fee,
        payerEmail: user.email,
        baseUrl: appUrl(),
        sellerAccessToken: tk.token,
        backPath: `/panel/${buyerPanel}/pedidos/${orderKey}`,
      })
    } catch (e) {
      console.error('[purchases] createSellerPreference', e)
      return mpDown()
    }
    await db.purchase.update({ where: { id }, data: { mpPreferenceId: pref.id, paymentMethod: 'mercadopago', serviceFee: fee } })
    await db.providerCharge.update({
      where: { id: charge.id },
      // si había acordado efectivo y cambia a MP, el cobro vuelve a pendiente de pago
      data: { mpPreferenceId: pref.id, method: 'mercadopago', serviceFee: fee, status: charge.status === 'acordada_efectivo' ? 'pendiente' : charge.status },
    })
    await ev('pago_mp_iniciado', `${user.displayName} inició el pago con Mercado Pago: ${fmt(purchase.total)} + cargo de servicio ${fmt(fee)} = ${fmt(totalWithMp(purchase.total))}.`)
    return ok({ success: true, initPoint: pref.initPoint, init_point: pref.initPoint, preferenceId: pref.id, serviceFee: fee, totalMp: totalWithMp(purchase.total) })
  }

  // ─────────────── ACCIONES DEL PROVEEDOR ───────────────
  if (!isProvider) return fail('Solo el proveedor puede gestionar tu pedido', 403)

  const state = planState(purchase.provider)
  if (!state.activo) return fail('Tu prueba gratis terminó: elegí un plan Básico o PRO para seguir vendiendo', 403, { needsPlan: true })

  if (d.action === 'aprobar') {
    if (st !== 'pendiente_aprobacion') {
      return fail(st === 'aprobado' ? 'Este pedido ya está aprobado' : 'Solo se aprueban pedidos pendientes', 409)
    }
    if (lines.length === 0 || lines.some((l) => !l.stockId)) return fail('Este pedido no está asociado a un stock tuyo', 409)

    // precio final: el de la oferta; en pedidos históricos de un solo ítem "a coordinar", el que fija el proveedor
    let finalLines = lines
    if (d.unitPrice && d.unitPrice > 0 && lines.length === 1) {
      const up = round2(d.unitPrice)
      finalLines = [{ ...lines[0], unitPrice: up, total: round2(up * lines[0].quantity) }]
    }
    if (finalLines.some((l) => l.unitPrice <= 0)) return fail('Este pedido se pidió sin precio: fijá el precio unitario para aprobarlo', 400, { needsPrice: true })
    const total = round2(finalLines.reduce((a, l) => a + l.total, 0))
    if (total <= 0) return fail('El precio tiene que ser mayor a cero', 400, { needsPrice: true })

    // reserva atómica de TODOS los ítems: si uno no alcanza, no se reserva ninguno
    try {
      await db.$transaction(async (tx) => {
        // el estado se "toma" dentro de la transacción: dos aprobaciones simultáneas no reservan dos veces
        const taken = await tx.purchase.updateMany({ where: { id, status: 'pendiente_aprobacion' }, data: { approvedAt: new Date() } })
        if (taken.count === 0) throw new Error('YA_APROBADO')
        for (const l of finalLines) {
          const r = await tx.providerStock.updateMany({
            where: { id: l.stockId!, quantity: { gte: l.quantity } },
            data: { quantity: { decrement: l.quantity } },
          })
          if (r.count === 0) {
            const s = await tx.providerStock.findUnique({ where: { id: l.stockId! }, select: { quantity: true } })
            throw new StockShortError(l, s?.quantity ?? 0)
          }
          await tx.stockMovement.create({
            data: { stockId: l.stockId!, type: 'reserva', quantity: l.quantity, note: `Pedido ${purchase.id} de ${purchase.client.displayName}` },
          })
          await refreshStockStatus(l.stockId!, tx)
        }
        await tx.purchase.update({ where: { id }, data: { status: 'aprobado' } })
      })
    } catch (e) {
      if (e instanceof StockShortError) {
        return fail(
          `No te alcanza el stock de "${e.line.elementName}": pidieron ${e.line.quantity} ${e.line.unit} y tenés ${e.available}. No se reservó nada: actualizá tu stock o rechazá el pedido con un motivo`,
          409,
          { item: { id: e.line.id, name: e.line.elementName, requested: e.line.quantity, available: e.available } }
        )
      }
      if (e instanceof Error && e.message === 'YA_APROBADO') return fail('Este pedido ya está aprobado', 409)
      throw e
    }

    const newCharge = await createWithChargeNumber((number) =>
      db.providerCharge.create({
        data: {
          number,
          providerId: purchase.providerId,
          clientId: purchase.clientId,
          projectId: null,
          amount: total,
          status: 'pendiente',
          materialIds: '[]',
          description: `${purchase.order ? `Pedido ${purchase.order.number}: ` : 'Compra directa: '}${label}`.slice(0, 500),
        },
      })
    )
    if (!newCharge) {
      // no quedó cobro: se devuelve la reserva y el pedido vuelve a pendiente
      await releaseLines(finalLines, `Aprobación fallida del pedido ${purchase.id}`)
      await db.purchase.update({ where: { id }, data: { status: 'pendiente_aprobacion', approvedAt: null } })
      return fail('No pudimos emitir el cobro del pedido: probá aprobarlo de nuevo en unos segundos', 503)
    }
    const expiresAt = new Date(Date.now() + (purchase.type === 'reserva' ? RESERVA_MS : COMPRA_MS))
    await db.purchase.update({
      where: { id },
      data: {
        approvedAt: new Date(),
        reservationExpiresAt: expiresAt,
        total,
        chargeId: newCharge.id,
        ...(finalLines !== lines ? { unitPrice: finalLines[0].unitPrice } : {}),
      },
    })
    if (finalLines !== lines && !finalLines[0].legacy) {
      await db.purchaseItem.update({ where: { id: finalLines[0].id }, data: { unitPrice: finalLines[0].unitPrice, total: finalLines[0].total } })
    }
    const hasta = expiresAt.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
    await db.notification.create({
      data: {
        userId: purchase.clientId,
        type: 'compra_aprobada',
        title: 'Tu pedido fue aprobado: pagá para retirarlo',
        body: `${purchase.provider.businessName} aprobó ${ref}${label} por ${fmt(total)}. Tenés hasta el ${hasta} para ${purchase.type === 'reserva' ? 'retirarlo' : 'pagarlo y retirarlo'}.`,
        link: clientLink,
      },
    })
    await ev('aprobado', `${purchase.provider.businessName} aprobó el pedido y reservó ${finalLines.length} producto${finalLines.length === 1 ? '' : 's'} por ${fmt(total)}. Plazo: hasta el ${hasta}.`)
    return ok({ success: true, status: 'aprobado', chargeId: newCharge.id, total, reservationExpiresAt: expiresAt })
  }

  if (d.action === 'rechazar') {
    if (st !== 'pendiente_aprobacion') return fail('Solo se rechazan pedidos pendientes', 409)
    const reason = d.reason?.trim() || null
    const upd = await db.purchase.updateMany({ where: { id, status: 'pendiente_aprobacion' }, data: { status: 'rechazado', rejectionReason: reason } })
    if (upd.count === 0) return fail('El pedido cambió de estado recién: actualizá la pantalla', 409)
    await db.notification.create({
      data: {
        userId: purchase.clientId,
        type: 'compra_rechazada',
        title: 'Tu pedido fue rechazado',
        body: `${purchase.provider.businessName} rechazó tu pedido ${ref}${label}.${reason ? ` Motivo: ${reason}` : ''}`,
        link: clientLink,
      },
    })
    await ev('rechazado', `${purchase.provider.businessName} rechazó el pedido.${reason ? ` Motivo: ${reason}` : ''}`)
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
    const withStock = lines.filter((l) => !!l.stockId)
    if (withStock.length) {
      const yaEntregado = await db.stockMovement.findFirst({
        where: { stockId: { in: withStock.map((l) => l.stockId!) }, type: 'consumo', note: { contains: purchase.id } },
      })
      if (yaEntregado) return fail('Este pedido ya está entregado', 409)
      for (const l of withStock) {
        const exists = await db.providerStock.findUnique({ where: { id: l.stockId! }, select: { id: true } })
        if (!exists) continue
        await db.stockMovement.create({
          data: { stockId: l.stockId!, type: 'consumo', quantity: l.quantity, note: `Entrega del pedido ${purchase.id}` },
        })
      }
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
          ? `${purchase.provider.businessName} te entregó ${ref}${label}. ¡Ya podés calificar tu compra!`
          : `${purchase.provider.businessName} te entregó ${ref}${label}. Cuando el pago quede confirmado, podés calificar tu compra.`,
        link: clientLink,
      },
    })
    await ev('entregado', `${purchase.provider.businessName} registró la entrega${nextStatus === 'pagado' ? '' : ' (falta el pago)'}.`)
    return ok({ success: true, status: nextStatus })
  }

  return fail('Acción no reconocida')
}
