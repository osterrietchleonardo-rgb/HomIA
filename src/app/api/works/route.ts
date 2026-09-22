import { NextRequest } from 'next/server'
import { ok, fail, body, parseJson } from '@/lib/api'
import { db } from '@/lib/db'

// POST: publicar trabajo realizado (vincula profesional/proyecto opcional)
export async function POST(req: NextRequest) {
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const d = await body<{
    title: string
    description: string
    photos?: string[]
    professionalId?: string // ProfessionalProfile.id si el cliente lo publica y vincula
    projectId?: string
    jobId?: string
    categorySlug?: string
  }>(req)
  if (!d.title || !d.description) return fail('Título y descripción son obligatorios')
  if (d.title.length > 120 || d.description.length > 4000) {
    return fail('El título puede tener hasta 120 caracteres y la descripción hasta 4000')
  }
  // fotos: máx 4, solo rutas de subida reales de HomIA (igual que las reseñas)
  const photos = Array.isArray(d.photos)
    ? d.photos.filter((p) => typeof p === 'string' && p.length < 500 && /^(https?:\/\/.+|\/uploads\/.+)\.(jpg|jpeg|png|webp)$/i.test(p)).slice(0, 4)
    : []

  // vinculación verificada: solo podés declarar tu propio perfil profesional
  let professionalId: string | null = null
  if (d.professionalId) {
    const pro = await db.professionalProfile.findUnique({ where: { id: d.professionalId }, select: { userId: true } })
    if (pro?.userId === user.id) professionalId = d.professionalId
  }
  // proyecto: solo si el usuario es el cliente o el profesional de ese proyecto
  let projectId: string | null = null
  if (d.projectId) {
    const project = await db.project.findUnique({
      where: { id: d.projectId },
      select: { clientId: true, pro: { select: { userId: true } } },
    })
    if (project && (project.clientId === user.id || project.pro?.userId === user.id)) {
      projectId = d.projectId
    }
  }

  const isPro = !!user.hasProfessional
  const work = await db.completedWork.create({
    data: {
      authorId: user.id,
      authorRole: isPro ? 'profesional' : 'cliente',
      title: d.title,
      description: d.description,
      photos: JSON.stringify(photos),
      professionalId,
      projectId,
      jobId: d.jobId || null,
      categorySlug: d.categorySlug || null,
    },
  })

  if (isPro) {
    const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })
    if (pro) await db.professionalProfile.update({ where: { id: pro.id }, data: { worksCount: { increment: 1 } } })
  }

  return ok({ work }, 201)
}

// GET: obras (mías o de un profesional)
export async function GET(req: NextRequest) {
  const professionalId = req.nextUrl.searchParams.get('professionalId')
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()

  if (professionalId) {
    const works = await db.completedWork.findMany({
      where: { professionalId, visible: true },
      orderBy: { createdAt: 'desc' },
    })
    return ok({ works })
  }
  if (!user) return ok({ works: [] })
  const works = await db.completedWork.findMany({
    where: { authorId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  return ok({ works })
}
