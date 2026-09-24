import { NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(request: Request) {
  // Solo el cron de Vercel (Authorization: Bearer CRON_SECRET). Sin secreto
  // configurado el endpoint queda cerrado: nunca se ejecuta "abierto".
  const authHeader = request.headers.get('authorization')
  const secret = process.env.CRON_SECRET
  if (!secret || authHeader !== `Bearer ${secret}`) {
    return new NextResponse('Unauthorized', { status: 401 })
  }

  try {
    // Vencen los pedidos APROBADOS (reserva 48 h / compra 7 días) cuyo plazo pasó
    // y cuyo cobro todavía no está pagado: se cancelan, devuelven el stock
    // reservado, anulan el cobro y avisan a las dos partes.
    const now = new Date()
    const candidates = await db.purchase.findMany({
      where: { status: 'aprobado', reservationExpiresAt: { lt: now } },
      include: { provider: { select: { userId: true, businessName: true } } },
    })
    if (candidates.length === 0) return NextResponse.json({ success: true, cancelled: 0 })

    const chargeIds = candidates.map((p) => p.chargeId).filter((x): x is string => !!x)
    const charges = chargeIds.length
      ? await db.providerCharge.findMany({ where: { id: { in: chargeIds } }, select: { id: true, status: true } })
      : []
    const chargeStatus = new Map(charges.map((c) => [c.id, c.status]))

    let cancelled = 0
    for (const p of candidates) {
      // el cliente ya pagó (MP o efectivo confirmado): no se vence, se entrega
      if (p.chargeId && chargeStatus.get(p.chargeId) === 'pagada') continue

      // cancelar de forma atómica (por si otro proceso la tocó entre medio)
      const upd = await db.purchase.updateMany({
        where: { id: p.id, status: 'aprobado' },
        data: { status: 'cancelado', rejectionReason: p.type === 'reserva' ? 'Reserva vencida (48 h)' : 'Plazo de retiro vencido (7 días)' },
      })
      if (upd.count === 0) continue
      cancelled++

      if (p.stockId) {
        const stock = await db.providerStock.findUnique({ where: { id: p.stockId }, select: { id: true, minStock: true } })
        if (stock) {
          const s = await db.providerStock.update({
            where: { id: stock.id },
            data: { quantity: { increment: p.quantity } },
            select: { quantity: true, minStock: true },
          })
          await db.stockMovement.create({
            data: { stockId: stock.id, type: 'liberacion', quantity: p.quantity, note: `Vencimiento del pedido ${p.id}` },
          })
          await db.providerStock.update({
            where: { id: stock.id },
            data: { status: s.quantity <= 0 ? 'agotado' : s.quantity <= s.minStock ? 'por_agotar' : 'disponible' },
          })
        }
      }
      if (p.chargeId) {
        await db.providerCharge.updateMany({
          where: { id: p.chargeId, status: { not: 'pagada' } },
          data: { status: 'anulada' },
        })
      }

      const label = `${p.elementName} × ${p.quantity} ${p.unit}`
      const esReserva = p.type === 'reserva'
      await db.notification.createMany({
        data: [
          {
            userId: p.clientId,
            type: 'reserva_vencida',
            title: esReserva ? 'Tu reserva venció' : 'Tu pedido venció',
            body: esReserva
              ? `Pasaron las 48 h de tu reserva de ${label} en ${p.provider.businessName} y se canceló. Si lo seguís necesitando, volvé a pedirlo.`
              : `Pasaron los 7 días para pagar y retirar ${label} en ${p.provider.businessName} y el pedido se canceló. Si lo seguís necesitando, volvé a pedirlo.`,
            link: '#/panel/cliente/materiales?tab=compras',
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
    }

    return NextResponse.json({ success: true, cancelled, checked: candidates.length })
  } catch (error) {
    console.error('Error in reservations cron:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
