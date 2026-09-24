// Tareas programadas de Sobrantes (las corre el cron horario /api/cron/reservations):
//   1) reembolso en efectivo (o por fuera de HomIA, pata profesional → proveedor) registrado
//      por el vendedor y no confirmado por el solicitante en 72 h → se confirma solo
//      ("automatico") y se avisa a los dos;
//   2) devolución sin respuesta del vendedor hace más de 72 h → UN recordatorio.
// Vendedor (D14): el proveedor, o el profesional cuando cobró los materiales en su factura.
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
      // todo reembolso que no salió por Mercado Pago (efectivo o por fuera de HomIA)
      OR: [
        { refundChannel: { in: ['efectivo', 'fuera_de_homia'] } },
        { refundChannel: null, OR: [{ paymentMethod: null }, { paymentMethod: { not: 'mercadopago' } }] },
      ],
    },
    include: sellerInclude,
    take: 200,
  })
  // el aviso lleva al panel del solicitante (cliente, o profesional del proyecto / comprador sin rol cliente)
  const requesterLink = async (r: (typeof toConfirm)[number]) => {
    const roles = parseJson<string[]>(r.requester.roles, [])
    if (r.tipo === 'profesional_a_proveedor') return '#/panel/profesional/devoluciones?tab=proveedores'
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
    const seller = sellerOf(r)
    const how = r.refundChannel === 'fuera_de_homia' ? 'por fuera de HomIA' : 'en efectivo'
    const quien = r.tipo === 'profesional_a_proveedor' ? 'del profesional' : 'del cliente'
    await db.notification.createMany({
      data: [
        {
          userId: r.requesterId,
          type: 'devolucion_reembolso_confirmado',
          title: 'Reembolso confirmado automáticamente',
          body: `Pasaron 72 h desde que ${seller.name} registró el reembolso ${how} de ${monto} y quedó confirmado. Si no lo recibiste, escribile por chat.`,
          link: await requesterLink(r),
        },
        ...(seller.userId ? [{
          userId: seller.userId,
          type: 'devolucion_reembolso_confirmado',
          title: 'Reembolso confirmado',
          body: `El reembolso ${how} de ${monto} quedó confirmado (pasaron 72 h sin objeciones ${quien}).`,
          link: seller.link,
        }] : []),
      ],
    })
  }

  // 2) recordatorio al vendedor (una sola vez por devolución)
  const toRemind = await db.leftoverReturn.findMany({
    where: { status: 'solicitada', reminderSentAt: null, requestedAt: { lt: remindBefore } },
    include: { ...sellerInclude, requester: { select: { roles: true, displayName: true } } },
    take: 200,
  })
  let reminded = 0
  for (const r of toRemind) {
    const upd = await db.leftoverReturn.updateMany({ where: { id: r.id, reminderSentAt: null }, data: { reminderSentAt: now } })
    if (upd.count === 0) continue
    reminded++
    const seller = sellerOf(r)
    if (!seller.userId) continue
    await db.notification.create({
      data: {
        userId: seller.userId,
        type: 'devolucion_recordatorio',
        title: 'Tenés una devolución sin responder',
        body: `${r.requester.displayName} te pidió devolver sobrantes hace más de 72 h. Aceptala, ajustala o rechazala con un motivo.`,
        link: seller.link,
      },
    })
  }
  return { autoConfirmed, reminded }
}

const sellerInclude = {
  provider: { select: { userId: true, businessName: true } },
  professional: { select: { userId: true, companyName: true, user: { select: { displayName: true } } } },
  requester: { select: { roles: true } },
} as const

/** Vendedor de la devolución: proveedor, o profesional si cobró los materiales en su factura (D14). */
function sellerOf(r: {
  sellerKind: string
  provider: { userId: string; businessName: string } | null
  professional: { userId: string; companyName: string | null; user: { displayName: string } } | null
}): { userId: string | null; name: string; link: string } {
  if (r.sellerKind === 'profesional') {
    return {
      userId: r.professional?.userId || null,
      name: r.professional?.companyName || r.professional?.user.displayName || 'El profesional',
      link: '#/panel/profesional/devoluciones?tab=clientes',
    }
  }
  return { userId: r.provider?.userId || null, name: r.provider?.businessName || 'El proveedor', link: '#/panel/proveedor/cobros?tab=devoluciones' }
}
