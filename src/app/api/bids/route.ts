import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// GET /api/bids?mine=1 — "Mis ofertas" del profesional: cada JobBid con su
// trabajo, estado humano y (si fue aceptada) el proyecto que se creó.
export async function GET(req: NextRequest) {
  const mine = req.nextUrl.searchParams.get('mine') === '1'
  if (!mine) return fail('Indicá ?mine=1 para ver tus ofertas', 400)

  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!pro) return fail('Esta sección es para perfiles profesionales', 403, { needsRole: 'profesional' })

  const bids = await db.jobBid.findMany({
    where: { professionalId: pro.id },
    include: {
      job: { select: { id: true, title: true, categorySlug: true, status: true, city: true, urgency: true, selectedBidId: true } },
    },
    orderBy: { createdAt: 'desc' },
  })

  // proyecto creado a partir de la oferta aceptada (jobId + professionalId)
  const acceptedJobIds = bids.filter((b) => b.status === 'aceptado').map((b) => b.jobId)
  const projects = acceptedJobIds.length
    ? await db.project.findMany({
        where: { professionalId: pro.id, jobId: { in: acceptedJobIds } },
        select: { id: true, jobId: true },
      })
    : []
  const projectByJob = new Map(projects.map((p) => [p.jobId as string, p.id]))

  return ok({
    bids: bids.map((b) => ({
      id: b.id,
      amount: b.amount,
      timelineDays: b.timelineDays,
      message: b.message,
      status: b.status,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
      projectId: b.status === 'aceptado' ? projectByJob.get(b.jobId) ?? null : null,
      job: {
        id: b.job.id,
        title: b.job.title,
        categorySlug: b.job.categorySlug,
        status: b.job.status,
        city: b.job.city,
        urgency: b.job.urgency,
      },
    })),
  })
}
