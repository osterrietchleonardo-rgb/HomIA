import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { parseJson } from '@/lib/api'
import { purchaseLines, releaseLines } from '@/lib/orders'
import { logActivity } from '@/lib/activity'
import { LEGACY_PREFIX } from '@/lib/order-view'
import { runLeftoverTasks } from '@/lib/leftovers-cron'

export async function GET(request: Request) {
  // Solo el cron de Vercel (Authorization: Bearer CRON_SECRET). Sin secreto
  // configurado el endpoint queda cerrado: nunca se ejecuta "abierto".
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    // Vencen los sub-pedidos APROBADOS cuyo plazo pasó y cuyo cobro todavía no está pagado
    // (D15, 24/09/2026): compra sin pagar ni elegir efectivo → 24 h; compra con efectivo
    // acordado → 7 días desde la compra; reserva aprobada o marcada disponible → 48 h.
    // Las reservas sin stock (`esperando_stock`) no vencen: no tienen stock reservado.
    // Las vencidas se cancelan, devuelven al stock TODOS
    // los ítems reservados, anulan el cobro, avisan a las dos partes y queda en la
    // línea de tiempo.
    const now = new Date()
    const candidates = await db.purchase.findMany({
      where: { status: 'aprobado', reservationExpiresAt: { lt: now } },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        provider: { select: { userId: true, businessName: true } },
        client: { select: { roles: true } },
        order: { select: { number: true } },
      },
    })
    // Sobrantes: confirmación automática de reembolsos en efectivo (72 h) y
    // recordatorio al proveedor por devoluciones sin responder (72 h)
    const leftovers = await runLeftoverTasks(now)
    if (candidates.length === 0) return NextResponse.json({ success: true, cancelled: 0, ...leftovers })

    const chargeIds = candidates.map((p) => p.chargeId).filter((x): x is string => !!x)
    const charges = chargeIds.length
      ? await db.providerCharge.findMany({ where: { id: { in: chargeIds } }, select: { id: true, status: true } })
      : []
    const chargeStatus = new Map(charges.map((c) => [c.id, c.status]))

    let cancelled = 0
    for (const p of candidates) {
      // el cliente ya pagó (MP o efectivo confirmado): no se vence, se entrega
      if (p.chargeId && chargeStatus.get(p.chargeId) === 'pagada') continue

      const esReserva = p.type === 'reserva'
      const efectivo = p.paymentMethod === 'efectivo'
      const motivo = esReserva ? 'Reserva vencida (48 h sin pagar ni retirar)'
        : efectivo ? 'Plazo de retiro vencido (7 días con efectivo acordado)'
          : 'Compra vencida (24 h sin pagar ni elegir efectivo)'
      // cancelar de forma atómica (por si otro proceso la tocó entre medio)
      const upd = await db.purchase.updateMany({
        where: { id: p.id, status: 'aprobado' },
        data: { status: 'cancelado', rejectionReason: motivo },
      })
      if (upd.count === 0) continue
      cancelled++

      await releaseLines(purchaseLines(p), `Vencimiento del pedido ${p.id}`)
      if (p.chargeId) {
        await db.providerCharge.updateMany({
          where: { id: p.chargeId, status: { not: 'pagada' } },
          data: { status: 'anulada' },
        })
      }

      const label = `${p.order ? `${p.order.number} · ` : ''}${p.elementName}`
      const panel = parseJson<string[]>(p.client.roles, []).includes('cliente') ? 'cliente' : 'profesional'
      await db.notification.createMany({
        data: [
          {
            userId: p.clientId,
            type: 'reserva_vencida',
            title: esReserva ? 'Tu reserva venció' : 'Tu compra venció',
            body: esReserva
              ? `Pasaron las 48 h de tu reserva de ${label} en ${p.provider.businessName} y se canceló. Si lo seguís necesitando, volvé a pedirlo.`
              : efectivo
                ? `Pasaron los 7 días para retirar y pagar ${label} en ${p.provider.businessName} y la compra se canceló. Si lo seguís necesitando, volvé a pedirlo.`
                : `Pasaron 24 h sin que pagaras ni eligieras efectivo para ${label} en ${p.provider.businessName}, así que la compra se canceló. Si lo seguís necesitando, volvé a pedirlo.`,
            link: `#/panel/${panel}/pedidos/${p.orderId || `${LEGACY_PREFIX}${p.id}`}`,
          },
          {
            userId: p.provider.userId,
            type: 'reserva_vencida',
            title: esReserva ? 'Reserva vencida' : 'Compra vencida',
            body: `${esReserva ? 'La reserva' : 'La compra'} de ${label} venció sin pago y se canceló (${motivo.toLowerCase()}). El stock volvió a tu inventario.`,
            link: '#/panel/proveedor/cobros?tab=ventas',
          },
        ],
      })
      await logActivity({
        orderId: p.orderId, purchaseId: p.id, actorRole: 'sistema', type: 'vencido',
        message: `${motivo}: se canceló y el stock volvió al proveedor.`,
      })
    }

    return NextResponse.json({ success: true, cancelled, checked: candidates.length, ...leftovers })
  } catch (error) {
    console.error('Error in reservations cron:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
