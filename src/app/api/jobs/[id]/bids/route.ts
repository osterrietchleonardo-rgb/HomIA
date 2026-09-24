import { NextRequest } from 'next/server'
import { ok, fail, body, parseJson } from '@/lib/api'
import { db } from '@/lib/db'

// GET: presupuestos de un trabajo (dueño ve todos; profesional ve el propio)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const job = await db.jobPost.findUnique({ where: { id } })
  if (!job) return fail('Trabajo no encontrado', 404)

  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })
  const isOwner = job.userId === user.id
  if (!isOwner && !pro) return fail('No tenés acceso a los presupuestos', 403)

  const bids = await db.jobBid.findMany({
    where: { jobId: id, ...(isOwner ? {} : { professionalId: pro!.id }) },
    include: {
      professional: {
        include: { user: { select: { id: true, displayName: true, avatarUrl: true, rating: true, reviewsCount: true } } },
      },
    },
    orderBy: { createdAt: 'desc' },
  })

  return ok({
    bids: bids.map((b) => ({
      id: b.id,
      amount: b.amount,
      timelineDays: b.timelineDays,
      message: b.message,
      status: b.status,
      createdAt: b.createdAt,
      professional: {
        id: b.professional.id,
        userId: b.professional.userId,
        displayName: b.professional.user.displayName,
        avatarUrl: b.professional.user.avatarUrl,
        professions: parseJson<string[]>(b.professional.professions, []),
        personType: b.professional.personType,
        companyName: b.professional.companyName,
        rating: b.professional.rating || b.professional.user.rating,
        reviewsCount: b.professional.reviewsCount || b.professional.user.reviewsCount,
        worksCount: b.professional.worksCount,
        verified: b.professional.verified,
        subscription: b.professional.subscription,
      },
    })),
    isOwner,
  })
}

// POST: profesional deja presupuesto
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Iniciá sesión para dejar tu presupuesto', 401)
  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })
  if (!pro) return fail('Solo los profesionales pueden dejar presupuestos', 403)

  const job = await db.jobPost.findUnique({ where: { id } })
  if (!job) return fail('Trabajo no encontrado', 404)
  if (job.status !== 'abierto') return fail('El trabajo ya no está abierto')
  if (job.userId === user.id) return fail('No podés ofertar en tu propio trabajo')

  const d = await body<{ amount: number; timelineDays?: number; message?: string }>(req)
  if (!d.amount || d.amount <= 0) return fail('Indicá un monto válido')

  const existing = await db.jobBid.findFirst({
    where: { jobId: id, professionalId: pro.id },
  })
  if (existing) {
    // Una oferta aceptada no se edita (ya hay proyecto). Rechazada o retirada
    // se reactiva como pendiente (re-oferta); pendiente se actualiza en el lugar.
    if (existing.status === 'aceptado') return fail('Esta oferta ya fue aceptada: los cambios van por el proyecto', 409)
    const reactivated = existing.status === 'rechazado' || existing.status === 'retirado'
    const updated = await db.jobBid.update({
      where: { id: existing.id },
      data: {
        amount: d.amount,
        timelineDays: d.timelineDays || existing.timelineDays,
        // no pisar el mensaje anterior con vacío
        message: d.message?.trim() ? d.message : existing.message,
        status: reactivated ? 'pendiente' : existing.status,
      },
    })
    if (reactivated) {
      await db.notification.create({
        data: {
          userId: job.userId,
          type: 'nuevo_presupuesto',
          title: 'Presupuesto actualizado en tu trabajo',
          body: `${pro.companyName || user.displayName} volvió a ofertar por "${job.title}"`,
          link: `#/panel/cliente/trabajos/${job.id}`,
        },
      })
    }
    return ok({ bid: updated })
  }

  const bid = await db.jobBid.create({
    data: {
      jobId: id,
      professionalId: pro.id,
      amount: d.amount,
      timelineDays: d.timelineDays || 7,
      message: d.message || null,
    },
  })

  await db.notification.create({
    data: {
      userId: job.userId,
      type: 'nuevo_presupuesto',
      title: 'Nuevo presupuesto en tu trabajo',
      body: `${pro.companyName || user.displayName} ofertó por "${job.title}"`,
      link: `#/panel/cliente/trabajos/${job.id}`,
    },
  })

  return ok({ bid }, 201)
}
