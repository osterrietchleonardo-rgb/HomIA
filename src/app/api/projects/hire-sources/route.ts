import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, requireAuth, parseJson } from '@/lib/api'
import { db } from '@/lib/db'

// GET /api/projects/hire-sources — para el selector "¿Es para algo que ya publicaste?" del
// asistente "Contratar" (D16). Devuelve, SOLO del usuario de la sesión:
//   jobs:     sus trabajos publicados ABIERTOS (para contratar directo a partir de uno);
//   projects: sus proyectos ACTIVOS como profesional a cargo (para subcontratar a partir de uno).
// Con `professionalProfileId` (el profesional que se está por contratar) se marca si ese
// profesional ya ofertó en cada trabajo (su oferta quedaría aceptada con ese monto).
const querySchema = z.object({
  professionalProfileId: z.string().min(1).max(60).optional(),
})

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const q = querySchema.safeParse({
    professionalProfileId: req.nextUrl.searchParams.get('professionalProfileId') || undefined,
  })
  if (!q.success) return fail('Parámetros inválidos')
  const targetId = q.data.professionalProfileId || null

  const jobs = await db.jobPost.findMany({
    where: { userId: auth.user.id, status: 'abierto' },
    orderBy: { createdAt: 'desc' },
    take: 30,
    select: {
      id: true, title: true, description: true, categorySlug: true, urgency: true,
      budgetMin: true, budgetMax: true, address: true, city: true, photos: true, createdAt: true,
      bids: { select: { professionalId: true, status: true, amount: true } },
    },
  })

  const mePro = await db.professionalProfile.findUnique({ where: { userId: auth.user.id }, select: { id: true } })
  const projects = mePro
    ? await db.project.findMany({
        where: {
          professionalId: mePro.id,
          status: 'activo',
          stage: { not: 'finalizado' },
        },
        orderBy: { updatedAt: 'desc' },
        take: 30,
        select: {
          id: true, title: true, description: true, stage: true, urgency: true,
          budgetMin: true, budgetMax: true, address: true, deadline: true, photos: true, createdAt: true,
          client: { select: { displayName: true, city: true } },
          job: { select: { categorySlug: true, city: true } },
        },
      })
    : []

  // nombres de rubro legibles (el slug se usa para precargar el rubro)
  const slugs = [...new Set(jobs.map((j) => j.categorySlug).concat(projects.map((p) => p.job?.categorySlug || '').filter(Boolean)))]
  const cats = slugs.length
    ? await db.category.findMany({ where: { slug: { in: slugs } }, select: { slug: true, name: true } })
    : []
  const catName = new Map(cats.map((c) => [c.slug, c.name]))

  return ok({
    jobs: jobs.map((j) => {
      const pending = j.bids.filter((b) => b.status === 'pendiente')
      const targetBid = targetId ? pending.find((b) => b.professionalId === targetId) : undefined
      return {
        id: j.id,
        title: j.title,
        description: j.description,
        categorySlug: j.categorySlug,
        categoryName: catName.get(j.categorySlug) || j.categorySlug,
        urgency: j.urgency,
        budgetMin: j.budgetMin,
        budgetMax: j.budgetMax,
        address: j.address,
        city: j.city,
        photos: parseJson<string[]>(j.photos, []),
        createdAt: j.createdAt,
        bidsCount: pending.length,
        // si el profesional que vas a contratar ya ofertó: su oferta queda aceptada con ese monto
        targetBidAmount: targetBid ? targetBid.amount : null,
      }
    }),
    projects: projects.map((p) => ({
      id: p.id,
      title: p.title,
      description: p.description,
      stage: p.stage,
      clientName: p.client.displayName,
      categorySlug: p.job?.categorySlug || null,
      categoryName: p.job?.categorySlug ? catName.get(p.job.categorySlug) || p.job.categorySlug : null,
      urgency: p.urgency,
      budgetMin: p.budgetMin,
      budgetMax: p.budgetMax,
      address: p.address,
      city: p.job?.city || p.client.city || null,
      deadline: p.deadline,
      photos: parseJson<string[]>(p.photos, []),
      createdAt: p.createdAt,
    })),
  })
}
