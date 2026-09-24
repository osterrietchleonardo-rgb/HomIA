// Tareas programadas de Sobrantes (las corre el cron horario /api/cron/reservations):
//   1) reembolso en efectivo registrado por el proveedor y no confirmado por el
//      solicitante en 72 h → se confirma solo ("automatico") y se avisa a los dos;
//   2) devolución sin respuesta del proveedor hace más de 72 h → UN recordatorio.
// Diseño: docs/PLAN-LANZAMIENTO-48H.md §6.1 (plazos) y §6.2 (estados).
import { db } from '@/lib/db'
import { parseJson } from '@/lib/api'

export const RETURN_CONFIRM_HOURS = 72
export const RETURN_REMIND_HOURS = 72

export async function runLeftoverTasks(now = new Date()): Promise<{ autoConfirmed: number; reminded: number }> {
  const confirmBefore = new Date(now.getTime() - RETURN_CONFIRM_HOURS * 3600_000)
  const remindBefore = new Date(now.getTime() - RETURN_REMIND_HOURS * 3600_000)

  // 1) confirmación automática del reembolso en efectivo
  const toConfirm = await db.leftoverReturn.findMany({
    where: {
      status: 'reembolsada',
      refundConfirmedAt: null,
      refundedAt: { lt: confirmBefore },
      OR: [{ paymentMethod: null }, { paymentMethod: { not: 'mercadopago' } }],
    },
    include: { provider: { select: { userId: true, businessName: true } }, requester: { select: { roles: true } } },
    take: 200,
  })
  // el aviso lleva al panel del solicitante (cliente, o profesional del proyecto / comprador sin rol cliente)
  const requesterLink = async (r: (typeof toConfirm)[number]) => {
    const roles = parseJson<string[]>(r.requester.roles, [])
    if (r.projectId) {
      const p = await db.project.findUnique({ where: { id: r.projectId }, select: { clientId: true } })
      return `#/panel/${p?.clientId === r.requesterId ? 'cliente' : 'profesional'}/proyectos/${r.projectId}`
    }
    return `#/panel/${roles.includes('cliente') ? 'cliente' : 'profesional'}/pedidos`
  }
  let autoConfirmed = 0
  for (const r of toConfirm) {
    const upd = await db.leftoverReturn.updateMany({
      where: { id: r.id, refundConfirmedAt: null },
      data: { refundConfirmedAt: now, refundConfirmedBy: 'automatico' },
    })
    if (upd.count === 0) continue
    autoConfirmed++
    const monto = r.refundTotal.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
    await db.notification.createMany({
      data: [
        {
          userId: r.requesterId,
          type: 'devolucion_reembolso_confirmado',
          title: 'Reembolso confirmado automáticamente',
          body: `Pasaron 72 h desde que ${r.provider.businessName} registró el reembolso en efectivo de ${monto} y quedó confirmado. Si no lo recibiste, escribile por chat.`,
          link: await requesterLink(r),
        },
        {
          userId: r.provider.userId,
          type: 'devolucion_reembolso_confirmado',
          title: 'Reembolso confirmado',
          body: `El reembolso en efectivo de ${monto} quedó confirmado (pasaron 72 h sin objeciones del cliente).`,
          link: '#/panel/proveedor/cobros?tab=devoluciones',
        },
      ],
    })
  }

  // 2) recordatorio al proveedor (una sola vez por devolución)
  const toRemind = await db.leftoverReturn.findMany({
    where: { status: 'solicitada', reminderSentAt: null, requestedAt: { lt: remindBefore } },
    include: { provider: { select: { userId: true } }, requester: { select: { displayName: true } } },
    take: 200,
  })
  let reminded = 0
  for (const r of toRemind) {
    const upd = await db.leftoverReturn.updateMany({ where: { id: r.id, reminderSentAt: null }, data: { reminderSentAt: now } })
    if (upd.count === 0) continue
    reminded++
    await db.notification.create({
      data: {
        userId: r.provider.userId,
        type: 'devolucion_recordatorio',
        title: 'Tenés una devolución sin responder',
        body: `${r.requester.displayName} te pidió devolver sobrantes hace más de 72 h. Aceptala, ajustala o rechazala con un motivo.`,
        link: '#/panel/proveedor/cobros?tab=devoluciones',
      },
    })
  }
  return { autoConfirmed, reminded }
}
