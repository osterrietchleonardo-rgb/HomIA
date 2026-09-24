import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody, appUrl, parseJson } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { planState } from '@/lib/plans'
import { createSellerPreference, ensureFreshSellerToken, refundPayment } from '@/lib/mercadopago'
import { createWithChargeNumber } from '@/lib/charge-number'
import { purchaseLines, releaseLines, reserveItems, StockShortError, fmt, type PurchaseLine } from '@/lib/orders'
import { serviceFeeFor, round2, totalWithMp } from '@/lib/fees'
import { logActivity } from '@/lib/activity'
import { sellerTokenOr503, mpDown } from '@/lib/seller-pay'
import { LEGACY_PREFIX } from '@/lib/order-view'
import { RESERVA_MS, COMPRA_EFECTIVO_MS, fmtDeadline, fmtDay } from '@/lib/order-rules'

// ── Máquina de estados de un sub-pedido (a UN proveedor, con uno o más ítems) ──
// D15 (24/09/2026, Leonardo): "Las compras no necesitan aprobación del proveedor: son
// directas al pago, siempre y cuando haya stock. Las aprobaciones son para las reservas
// de productos, con o sin stock."
//
// COMPRA (nace en POST /api/orders ya `aprobado` = por pagar, stock reservado + cobro):
//   aprobado ─pagar_efectivo(cli)─▶ aprobado (cobro acordada_efectivo, 7 días desde la compra)
//            ─pagar_mp(cli)───────▶ preferencia MP (token del proveedor + 1%) → webhook → pagado
//            ─entregar(prov)──────▶ entregado | pagado
//            ─cancelar(ambos; el proveedor con motivo, también si ya está pagada y no la
//             entregó → reembolso total por MP con SU token) ─▶ cancelado (+ libera stock)
//   24 h sin pagar ni elegir efectivo / 7 días con efectivo sin retirar → cron → cancelado
//
// RESERVA (con o sin stock):
//   pendiente_aprobacion ─aprobar(prov)─▶ aprobado (hay stock: reserva atómica + cobro + 48 h)
//                        ─aprobar(prov, availableFrom)─▶ esperando_stock (no hay stock: fecha
//                           aproximada, sin descontar nada; puede fijar el precio si era "a coordinar")
//                        ─rechazar(prov, motivo)─▶ rechazado
//   esperando_stock ─disponible(prov)─▶ aprobado (reserva atómica + cobro + 48 h)
//   cualquier estado sin pago ─cancelar(ambos)─▶ cancelado
// Cada acción queda en la línea de tiempo (ActivityEvent) y avisa a la otra parte.

const schema = z.object({
  action: z.enum(['aprobar', 'rechazar', 'cancelar', 'pagar_efectivo', 'pagar_mp', 'entregar', 'disponible']),
  unitPrice: z.coerce.number().positive().optional(),
  reason: z.string().max(400).optional(),
  // reserva sin stock: fecha aproximada de disponibilidad (AAAA-MM-DD)
  availableFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha tiene que ser AAAA-MM-DD').optional(),
})

/** AAAA-MM-DD → mediodía de ese día en Argentina (15:00 UTC). */
function parseDay(s: string): Date | null {
  const d = new Date(`${s}T15:00:00.000Z`)
  return Number.isNaN(d.getTime()) ? null : d
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
  const esCompra = purchase.type !== 'reserva'
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

  /** Emite el cobro de un sub-pedido con el stock ya reservado; si no se pudo, deshace la reserva. */
  async function emitCharge(total: number, reservedLines: PurchaseLine[], revertTo: 'pendiente_aprobacion' | 'esperando_stock') {
    const newCharge = await createWithChargeNumber((number) =>
      db.providerCharge.create({
        data: {
          number,
          providerId: purchase!.providerId,
          clientId: purchase!.clientId,
          projectId: null,
          amount: total,
          status: 'pendiente',
          materialIds: '[]',
          description: `${purchase!.order ? `${esCompra ? 'Compra' : 'Reserva'} ${purchase!.order.number}: ` : 'Compra directa: '}${label}`.slice(0, 500),
        },
      })
    )
    if (!newCharge) {
      await releaseLines(reservedLines, `Aprobación fallida del pedido ${purchase!.id}`)
      await db.purchase.update({ where: { id }, data: { status: revertTo, ...(revertTo === 'pendiente_aprobacion' ? { approvedAt: null } : {}) } })
    }
    return newCharge
  }

  // ─────────────── CANCELAR (cliente o proveedor) ───────────────
  if (d.action === 'cancelar') {
    const reason = d.reason?.trim() || ''
    const cancelables = isProvider ? ['pendiente_aprobacion', 'esperando_stock', 'aprobado', 'pagado'] : ['pendiente_aprobacion', 'esperando_stock', 'aprobado']
    if (!cancelables.includes(st)) {
      return fail(
        st === 'cancelado' ? 'Este pedido ya está cancelado'
          : st === 'rechazado' ? 'Este pedido ya fue rechazado'
            : 'El pedido ya fue entregado o pagado: coordiná con la otra parte por chat',
        409
      )
    }
    if (isClient && chargePagado) return fail('El cobro ya está pagado: no se puede cancelar. Coordiná por chat', 409)
    if (isProvider && reason.length < 3) return fail('Contale al cliente por qué cancelás: le llega en la notificación y en su pedido', 400, { needsReason: true })

    // el proveedor cancela algo ya pagado (no entregado): se devuelve la plata
    const paid = chargePagado || st === 'pagado'
    let refundNote = ''
    let refunded: { id: string; amount: number } | null = null
    if (paid) {
      const withStock = lines.filter((l) => !!l.stockId)
      const entregado = withStock.length
        ? await db.stockMovement.findFirst({ where: { stockId: { in: withStock.map((l) => l.stockId!) }, type: 'consumo', note: { contains: purchase.id } } })
        : null
      if (entregado) return fail('Ya lo entregaste: si hay un problema con los productos, se resuelve con una devolución', 409)
      const porMp = (charge?.method || purchase.paymentMethod) === 'mercadopago'
      if (porMp) {
        const paymentId = purchase.mpPaymentId || charge?.mpPaymentId
        if (!paymentId) return fail('No encontramos el pago de Mercado Pago para devolverlo. Escribinos antes de cancelar', 409)
        let token: string
        try {
          token = await ensureFreshSellerToken(purchase.provider)
        } catch {
          return fail('Tu Mercado Pago no está conectado: reconectalo en Cobros para poder devolverle el pago al cliente. No se canceló nada', 409, { needsMp: true })
        }
        try {
          const r = await refundPayment({ paymentId, accessToken: token, idempotencyKey: `purchase-cancel-${purchase.id}` })
          const pay = await db.payment.findUnique({ where: { mpPaymentId: paymentId } })
          const amount = pay?.amount ?? round2(purchase.total + purchase.serviceFee)
          if (pay) await db.payment.update({ where: { id: pay.id }, data: { refundedAmount: amount } })
          refunded = { id: r.id, amount }
          refundNote = ` Mercado Pago le devuelve ${fmt(amount)} al cliente (reembolso total).`
        } catch (e) {
          console.error('[purchases] reembolso al cancelar', purchase.id, e)
          return fail('Mercado Pago no pudo hacer la devolución, así que no se canceló nada. Probá de nuevo en un rato', 502, { retry: true })
        }
      } else {
        refundNote = ` Como ya pagó en efectivo, devolvele ${fmt(purchase.total)} en mano.`
      }
    }

    // cancelación condicional: si otro proceso la cambió entre medio, no se libera stock dos veces
    const upd = await db.purchase.updateMany({ where: { id, status: st }, data: { status: 'cancelado', rejectionReason: reason || null } })
    if (upd.count === 0) return fail('El pedido cambió de estado recién: actualizá la pantalla', 409)
    const stockReservado = st === 'aprobado' || st === 'pagado'
    if (stockReservado) await releaseLines(lines, `Cancelación del pedido ${purchase.id}`)
    if (charge && charge.status !== 'anulada') {
      await db.providerCharge.update({ where: { id: charge.id }, data: { status: paid ? 'reembolsada' : 'anulada' } })
    }
    const otherId = isClient ? purchase.provider.userId : purchase.clientId
    await db.notification.create({
      data: {
        userId: otherId,
        type: 'compra_cancelada',
        title: paid ? 'Pedido cancelado: te devuelven el pago' : 'Pedido cancelado',
        body: `${isProvider ? purchase.provider.businessName : user.displayName} canceló el pedido ${ref}${label}.${reason ? ` Motivo: ${reason}` : ''}${paid ? (refunded ? ` Mercado Pago te devuelve ${fmt(refunded.amount)}.` : ` ${purchase.provider.businessName} te tiene que devolver ${fmt(purchase.total)} en efectivo.`) : ''}`,
        link: isClient ? providerLink : clientLink,
      },
    })
    await ev(
      'cancelado',
      `${isProvider ? purchase.provider.businessName : user.displayName} canceló el pedido${stockReservado ? ' (el stock reservado volvió al proveedor)' : ''}.${reason ? ` Motivo: ${reason}` : ''}${refundNote}`,
      refunded ? { refundId: refunded.id, amount: refunded.amount } : undefined
    )
    return ok({ success: true, status: 'cancelado', refunded })
  }

  // ─────────────── ACCIONES DEL CLIENTE ───────────────
  if (d.action === 'pagar_efectivo' || d.action === 'pagar_mp') {
    if (!isClient) return fail('Solo el cliente paga su pedido', 403)
    // se paga desde `aprobado` o, si el proveedor entregó antes de cobrar, desde `entregado`
    if (st !== 'aprobado' && st !== 'entregado') {
      return fail(
        st === 'pendiente_aprobacion' ? 'El proveedor todavía no aprobó tu reserva'
          : st === 'esperando_stock' ? 'Tu reserva todavía no está disponible: el proveedor te avisa cuando la tenga'
            : st === 'pagado' ? 'Este pedido ya está pagado'
              : 'Este pedido no está en condiciones de pagarse',
        409
      )
    }
    if (!charge || charge.status === 'anulada') return fail('Este pedido no tiene un cobro emitido. Escribile al proveedor por chat', 409)
    if (chargePagado) return fail('Este pedido ya está pagado', 409)

    if (d.action === 'pagar_efectivo') {
      // en efectivo NO hay cargo de servicio. En una COMPRA, con efectivo acordado hay
      // 7 días desde la compra para retirar y pagar (en vez de las 24 h para pagar).
      const efectivoHasta = esCompra && st === 'aprobado'
        ? new Date((purchase.approvedAt ?? purchase.createdAt).getTime() + COMPRA_EFECTIVO_MS)
        : null
      await db.providerCharge.update({ where: { id: charge.id }, data: { status: 'acordada_efectivo', method: 'efectivo', serviceFee: 0 } })
      await db.purchase.update({
        where: { id },
        data: { paymentMethod: 'efectivo', serviceFee: 0, ...(efectivoHasta ? { reservationExpiresAt: efectivoHasta } : {}) },
      })
      const plazo = efectivoHasta ? ` Tiene hasta el ${fmtDeadline(efectivoHasta)} para retirarlo y pagarte.` : ''
      await db.notification.create({
        data: {
          userId: purchase.provider.userId,
          type: 'cobro_efectivo_acordado',
          title: 'Pago en efectivo acordado',
          body: `${user.displayName} paga ${ref}${label} (${fmt(purchase.total)}) en efectivo al retirar.${plazo} Confirmá el cobro cuando recibas el dinero.`,
          link: providerLink,
        },
      })
      await ev('pago_efectivo_acordado', `${user.displayName} eligió pagar ${fmt(purchase.total)} en efectivo al retirar (sin cargo de servicio).${efectivoHasta ? ` Plazo para retirar y pagar: hasta el ${fmtDeadline(efectivoHasta)}.` : ''}`)
      return ok({ success: true, status: st, paymentMethod: 'efectivo', chargeStatus: 'acordada_efectivo', reservationExpiresAt: efectivoHasta ?? purchase.reservationExpiresAt })
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
      return fail(
        st === 'aprobado' ? (esCompra ? 'Las compras no se aprueban: el cliente ya la tiene lista para pagar' : 'Esta reserva ya está aprobada')
          : st === 'esperando_stock' ? 'Esta reserva ya está aprobada: marcala "disponible" cuando tengas el producto'
            : 'Solo se aprueban reservas pendientes',
        409
      )
    }
    if (lines.length === 0 || lines.some((l) => !l.stockId)) return fail('Este pedido no está asociado a un stock tuyo', 409)

    // precio final: el de la oferta; con un solo ítem el proveedor puede ajustarlo (o fijarlo si era "a coordinar")
    let finalLines = lines
    if (d.unitPrice && d.unitPrice > 0 && lines.length === 1) {
      const up = round2(d.unitPrice)
      finalLines = [{ ...lines[0], unitPrice: up, total: round2(up * lines[0].quantity) }]
    }
    if (finalLines.some((l) => l.unitPrice <= 0)) return fail('Este pedido se pidió sin precio: fijá el precio unitario para aprobarlo', 400, { needsPrice: true })
    const total = round2(finalLines.reduce((a, l) => a + l.total, 0))
    if (total <= 0) return fail('El precio tiene que ser mayor a cero', 400, { needsPrice: true })
    const priceChanged = finalLines !== lines
    const savePrice = async () => {
      if (!priceChanged) return
      await db.purchase.update({ where: { id }, data: { total, unitPrice: finalLines[0].unitPrice } })
      if (!finalLines[0].legacy) await db.purchaseItem.update({ where: { id: finalLines[0].id }, data: { unitPrice: finalLines[0].unitPrice, total: finalLines[0].total } })
    }

    let availableFrom: Date | null = null
    if (d.availableFrom) {
      availableFrom = parseDay(d.availableFrom)
      const today = new Date(Date.now() - 36 * 3600 * 1000)
      if (!availableFrom || availableFrom < today || availableFrom.getTime() > Date.now() + 180 * 86400000) {
        return fail('Elegí una fecha entre hoy y los próximos 6 meses', 400)
      }
    }

    // reserva atómica de TODOS los ítems: si uno no alcanza, no se reserva ninguno
    try {
      await db.$transaction(async (tx) => {
        // el estado se "toma" dentro de la transacción: dos aprobaciones simultáneas no reservan dos veces
        const taken = await tx.purchase.updateMany({ where: { id, status: 'pendiente_aprobacion' }, data: { approvedAt: new Date() } })
        if (taken.count === 0) throw new Error('YA_APROBADO')
        await reserveItems(tx, finalLines, `Pedido ${purchase.id} de ${purchase.client.displayName}`)
        await tx.purchase.update({ where: { id }, data: { status: 'aprobado' } })
      }, { timeout: 30_000, maxWait: 10_000 })
    } catch (e) {
      if (e instanceof Error && e.message === 'YA_APROBADO') return fail('Este pedido ya está aprobado', 409)
      if (!(e instanceof StockShortError)) throw e

      // ── no hay stock: una RESERVA se aprueba igual, con fecha aproximada ──
      if (!esCompra && availableFrom) {
        const upd = await db.purchase.updateMany({
          where: { id, status: 'pendiente_aprobacion' },
          data: { status: 'esperando_stock', approvedAt: new Date(), availableFrom },
        })
        if (upd.count === 0) return fail('El pedido cambió de estado recién: actualizá la pantalla', 409)
        await savePrice()
        const dia = fmtDay(availableFrom)
        await db.notification.create({
          data: {
            userId: purchase.clientId,
            type: 'reserva_aprobada_sin_stock',
            title: 'Tu reserva fue aprobada',
            body: `${purchase.provider.businessName} aprobó tu reserva ${ref}${label} (${fmt(total)}) y lo tendría disponible aproximadamente el ${dia}. Te avisamos cuando esté para retirar.`,
            link: clientLink,
          },
        })
        await ev('aprobado_sin_stock', `${purchase.provider.businessName} aprobó la reserva sin stock por ${fmt(total)}: disponible aproximadamente el ${dia}. Todavía no se reservó stock.`)
        return ok({ success: true, status: 'esperando_stock', total, availableFrom })
      }
      return fail(
        esCompra
          ? `No te alcanza el stock de "${e.line.elementName}": pidieron ${e.line.quantity} ${e.line.unit} y tenés ${e.available}. No se reservó nada: actualizá tu stock o rechazá el pedido con un motivo`
          : `No tenés stock suficiente de "${e.line.elementName}" (pidieron ${e.line.quantity} ${e.line.unit}, tenés ${e.available}). Indicá la fecha aproximada en que lo vas a tener para aprobar la reserva, o rechazala con un motivo`,
        409,
        { item: { id: e.line.id, name: e.line.elementName, requested: e.line.quantity, available: e.available }, needsDate: !esCompra }
      )
    }

    const newCharge = await emitCharge(total, finalLines, 'pendiente_aprobacion')
    if (!newCharge) return fail('No pudimos emitir el cobro del pedido: probá aprobarlo de nuevo en unos segundos', 503)
    // compra aprobada acá: solo pedidos anteriores a D15 que quedaron pendientes (regla vieja de 7 días)
    const expiresAt = new Date(Date.now() + (esCompra ? COMPRA_EFECTIVO_MS : RESERVA_MS))
    await db.purchase.update({ where: { id }, data: { approvedAt: new Date(), reservationExpiresAt: expiresAt, total, chargeId: newCharge.id } })
    await savePrice()
    const hasta = fmtDeadline(expiresAt)
    await db.notification.create({
      data: {
        userId: purchase.clientId,
        type: 'compra_aprobada',
        title: esCompra ? 'Tu pedido fue aprobado: pagá para retirarlo' : 'Tu reserva fue aprobada',
        body: `${purchase.provider.businessName} aprobó ${ref}${label} por ${fmt(total)} y te lo guarda. Tenés hasta el ${hasta} para pagarlo y retirarlo.`,
        link: clientLink,
      },
    })
    await ev('aprobado', `${purchase.provider.businessName} aprobó ${esCompra ? 'el pedido' : 'la reserva'} y reservó ${finalLines.length} producto${finalLines.length === 1 ? '' : 's'} por ${fmt(total)}. Plazo: hasta el ${hasta}.`)
    return ok({ success: true, status: 'aprobado', chargeId: newCharge.id, total, reservationExpiresAt: expiresAt })
  }

  // ─────────────── reserva sin stock → ya lo tengo ───────────────
  if (d.action === 'disponible') {
    if (st !== 'esperando_stock') {
      return fail(st === 'pendiente_aprobacion' ? 'Primero aprobá la reserva' : 'Solo se marcan disponibles las reservas que esperan stock', 409)
    }
    if (lines.length === 0 || lines.some((l) => !l.stockId)) return fail('Esta reserva no está asociada a un stock tuyo', 409)
    try {
      await db.$transaction(async (tx) => {
        const taken = await tx.purchase.updateMany({ where: { id, status: 'esperando_stock' }, data: { status: 'aprobado' } })
        if (taken.count === 0) throw new Error('YA_DISPONIBLE')
        await reserveItems(tx, lines, `Reserva ${purchase.id} de ${purchase.client.displayName} (disponible)`)
      }, { timeout: 30_000, maxWait: 10_000 })
    } catch (e) {
      if (e instanceof Error && e.message === 'YA_DISPONIBLE') return fail('Esta reserva ya está disponible', 409)
      if (e instanceof StockShortError) {
        return fail(
          `Todavía no te alcanza el stock de "${e.line.elementName}": la reserva pide ${e.line.quantity} ${e.line.unit} y tenés ${e.available}. Cargalo en Stock y volvé a marcarla disponible`,
          409,
          { item: { id: e.line.id, name: e.line.elementName, requested: e.line.quantity, available: e.available } }
        )
      }
      throw e
    }
    const newCharge = await emitCharge(purchase.total, lines, 'esperando_stock')
    if (!newCharge) return fail('No pudimos emitir el cobro de la reserva: probá de nuevo en unos segundos', 503)
    const expiresAt = new Date(Date.now() + RESERVA_MS)
    await db.purchase.update({ where: { id }, data: { reservationExpiresAt: expiresAt, chargeId: newCharge.id } })
    const hasta = fmtDeadline(expiresAt)
    await db.notification.create({
      data: {
        userId: purchase.clientId,
        type: 'reserva_disponible',
        title: 'Tu reserva ya está para retirar',
        body: `${purchase.provider.businessName} ya tiene ${ref}${label} (${fmt(purchase.total)}) y te lo guarda hasta el ${hasta}. Pagalo por Mercado Pago o en efectivo al retirar.`,
        link: clientLink,
      },
    })
    await ev('disponible', `${purchase.provider.businessName} ya tiene el producto: reservó el stock y te lo guarda 48 h, hasta el ${hasta}.`)
    return ok({ success: true, status: 'aprobado', chargeId: newCharge.id, reservationExpiresAt: expiresAt })
  }

  if (d.action === 'rechazar') {
    if (st !== 'pendiente_aprobacion') return fail('Solo se rechazan reservas pendientes: si ya la aprobaste, cancelala con un motivo', 409)
    const reason = d.reason?.trim() || null
    const upd = await db.purchase.updateMany({ where: { id, status: 'pendiente_aprobacion' }, data: { status: 'rechazado', rejectionReason: reason } })
    if (upd.count === 0) return fail('El pedido cambió de estado recién: actualizá la pantalla', 409)
    await db.notification.create({
      data: {
        userId: purchase.clientId,
        type: 'compra_rechazada',
        title: esCompra ? 'Tu pedido fue rechazado' : 'Tu reserva fue rechazada',
        body: `${purchase.provider.businessName} rechazó tu ${esCompra ? 'pedido' : 'reserva'} ${ref}${label}.${reason ? ` Motivo: ${reason}` : ''}`,
        link: clientLink,
      },
    })
    await ev('rechazado', `${purchase.provider.businessName} rechazó ${esCompra ? 'el pedido' : 'la reserva'}.${reason ? ` Motivo: ${reason}` : ''}`)
    return ok({ success: true, status: 'rechazado' })
  }

  if (d.action === 'entregar') {
    // Desde `aprobado` siempre. Desde `pagado` solo si todavía no se registró la entrega
    // (el webhook de MP puede marcar pagado antes de que el cliente retire).
    if (st !== 'aprobado' && st !== 'pagado') {
      return fail(
        st === 'pendiente_aprobacion' ? 'Primero aprobá la reserva'
          : st === 'esperando_stock' ? 'Primero marcá la reserva como disponible'
            : st === 'entregado' ? 'Este pedido ya está entregado' : 'No podés entregar este pedido ahora',
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
