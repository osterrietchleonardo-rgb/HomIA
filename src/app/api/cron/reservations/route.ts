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
    // Vencen los sub-pedidos APROBADOS (reserva 48 h / compra 7 días) cuyo plazo pasó
    // y cuyo cobro todavía no está pagado: se cancelan, devuelven al stock TODOS
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
      // cancelar de forma atómica (por si otro proceso la tocó entre medio)
      const upd = await db.purchase.updateMany({
        where: { id: p.id, status: 'aprobado' },
        data: { status: 'cancelado', rejectionReason: esReserva ? 'Reserva vencida (48 h)' : 'Plazo de retiro vencido (7 días)' },
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
            title: esReserva ? 'Tu reserva venció' : 'Tu pedido venció',
            body: esReserva
              ? `Pasaron las 48 h de tu reserva de ${label} en ${p.provider.businessName} y se canceló. Si lo seguís necesitando, volvé a pedirlo.`
              : `Pasaron los 7 días para pagar y retirar ${label} en ${p.provider.businessName} y el pedido se canceló. Si lo seguís necesitando, volvé a pedirlo.`,
            link: `#/panel/${panel}/pedidos/${p.orderId || `${LEGACY_PREFIX}${p.id}`}`,
          },
          {
            userId: p.provider.userId,
            type: 'reserva_vencida',
            title: esReserva ? 'Reserva vencida' : 'Pedido vencido',
            body: `${esReserva ? 'La reserva' : 'El pedido'} de ${label} venció sin pago y se canceló. El stock volvió a tu inventario.`,
            link: '#/panel/proveedor/cobros?tab=ventas',
          },
        ],
      })
      await logActivity({
        orderId: p.orderId, purchaseId: p.id, actorRole: 'sistema', type: 'vencido',
        message: esReserva ? 'La reserva venció a las 48 h sin pago: se canceló y el stock volvió al proveedor.' : 'Pasaron los 7 días sin pago: el pedido se canceló y el stock volvió al proveedor.',
      })
    }

    return NextResponse.json({ success: true, cancelled, checked: candidates.length, ...leftovers })
  } catch (error) {
    console.error('Error in reservations cron:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
