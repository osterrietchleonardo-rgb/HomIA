// Cierre de un trabajo publicado cuando el cliente ya eligió profesional (D16).
// Lo usan los dos caminos que asignan un trabajo de la bolsa:
//   1. aceptar una oferta (`PATCH /api/bids/[id]`, action `aceptar`);
//   2. contratar directo eligiendo el trabajo en el asistente "Contratar" (`POST /api/projects` con `jobId`).
// Siempre corre DENTRO de la transacción que crea el proyecto: todo o nada.
import type { Prisma } from '@prisma/client'

type Tx = Prisma.TransactionClient

export class HireError extends Error {
  constructor(public code: 'JOB_NOT_OPEN' | 'BID_NOT_PENDING') { super(code) }
}

/** Re-chequea dentro de la transacción que el trabajo siga abierto (dos contrataciones
 *  simultáneas no crean dos proyectos para el mismo trabajo). */
export async function assertJobOpen(tx: Tx, jobId: string) {
  const job = await tx.jobPost.findUnique({ where: { id: jobId }, select: { status: true } })
  if (!job || job.status !== 'abierto') throw new HireError('JOB_NOT_OPEN')
}

/**
 * Marca la oferta elegida como `aceptado` (si hay), rechaza el resto de las pendientes
 * avisándole a cada profesional y pasa el trabajo a `en_proceso` con `selectedBidId`.
 * `rejectedTitle`/`rejectedBody`: el texto del aviso a los que no quedaron.
 */
export async function closeJobWithHire(
  tx: Tx,
  opts: { jobId: string; acceptedBidId: string | null; rejectedTitle: string; rejectedBody: string },
) {
  const { jobId, acceptedBidId } = opts
  if (acceptedBidId) {
    const fresh = await tx.jobBid.findUnique({ where: { id: acceptedBidId }, select: { status: true } })
    if (!fresh || fresh.status !== 'pendiente') throw new HireError('BID_NOT_PENDING')
    await tx.jobBid.update({ where: { id: acceptedBidId }, data: { status: 'aceptado' } })
  }
  const othersWhere: Prisma.JobBidWhereInput = {
    jobId,
    status: 'pendiente',
    ...(acceptedBidId ? { id: { not: acceptedBidId } } : {}),
  }
  const others = await tx.jobBid.findMany({
    where: othersWhere,
    select: { professional: { select: { userId: true } } },
  })
  await tx.jobBid.updateMany({ where: othersWhere, data: { status: 'rechazado' } })
  if (others.length) {
    await tx.notification.createMany({
      data: others.map((o) => ({
        userId: o.professional.userId,
        type: 'presupuesto_rechazado',
        title: opts.rejectedTitle,
        body: opts.rejectedBody,
        link: '#/panel/profesional/presupuestos',
      })),
    })
  }
  await tx.jobPost.update({
    where: { id: jobId },
    data: { status: 'en_proceso', selectedBidId: acceptedBidId },
  })
  return { rejected: others.length }
}
