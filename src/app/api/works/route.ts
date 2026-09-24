import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// fotos: máx 4, solo rutas de subida reales de HomIA (igual que las reseñas)
function sanitizeWorkPhotos(list: unknown): string[] {
  return Array.isArray(list)
    ? list.filter((p): p is string => typeof p === 'string' && p.length < 500 && /^(https?:\/\/.+|\/uploads\/.+)\.(jpg|jpeg|png|webp)$/i.test(p)).slice(0, 4)
    : []
}

const createSchema = z.object({
  title: z.string().trim().min(3, 'El título tiene que tener al menos 3 letras').max(120, 'El título puede tener hasta 120 caracteres'),
  description: z.string().trim().min(10, 'Contá un poco más de la obra (mínimo 10 caracteres)').max(4000, 'La descripción puede tener hasta 4000 caracteres'),
  photos: z.array(z.string()).max(4, 'Máximo 4 fotos por obra').optional(),
  projectId: z.string().min(1).optional(),
  jobId: z.string().min(1).optional(),
  categorySlug: z.string().max(60).optional(),
})

// POST: publicar trabajo realizado.
// - Si el autor tiene perfil profesional, la obra queda vinculada a SU perfil
//   (professionalId automático) → aparece en su perfil público.
// - projectId/jobId solo se guardan si el autor participa de ese proyecto/trabajo.
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const parsed = await parseBody(req, createSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data
  const photos = sanitizeWorkPhotos(d.photos)

  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  const professionalId = pro?.id ?? null

  // proyecto: solo si el usuario es el cliente o el profesional de ese proyecto
  let projectId: string | null = null
  if (d.projectId) {
    const project = await db.project.findUnique({
      where: { id: d.projectId },
      select: { clientId: true, pro: { select: { userId: true } } },
    })
    if (project && (project.clientId === user.id || project.pro?.userId === user.id)) projectId = d.projectId
  }
  // trabajo: solo si lo publicó el autor o el autor ofertó en él; si no, se ignora
  let jobId: string | null = null
  if (d.jobId) {
    const job = await db.jobPost.findUnique({ where: { id: d.jobId }, select: { userId: true } })
    if (job) {
      const ownsJob = job.userId === user.id
      const bidOnJob = pro ? await db.jobBid.findFirst({ where: { jobId: d.jobId, professionalId: pro.id }, select: { id: true } }) : null
      if (ownsJob || bidOnJob) jobId = d.jobId
    }
  }

  const work = await db.completedWork.create({
    data: {
      authorId: user.id,
      authorRole: pro ? 'profesional' : 'cliente',
      title: d.title,
      description: d.description,
      photos: JSON.stringify(photos),
      professionalId,
      projectId,
      jobId,
      categorySlug: d.categorySlug || null,
    },
  })

  if (pro) await db.professionalProfile.update({ where: { id: pro.id }, data: { worksCount: { increment: 1 } } })

  return ok({ work }, 201)
}

// GET: obras visibles de un profesional (público) o las mías (sesión)
export async function GET(req: NextRequest) {
  const professionalId = req.nextUrl.searchParams.get('professionalId')

  if (professionalId) {
    const works = await db.completedWork.findMany({
      where: { professionalId, visible: true },
      orderBy: { createdAt: 'desc' },
    })
    return ok({ works })
  }
  const user = await getSessionUser()
  if (!user) return ok({ works: [] })
  const works = await db.completedWork.findMany({
    where: { authorId: user.id, visible: true },
    orderBy: { createdAt: 'desc' },
  })
  return ok({ works })
}
