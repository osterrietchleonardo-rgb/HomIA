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

  const isPro = !!user.hasProfessional
  const work = await db.completedWork.create({
    data: {
      authorId: user.id,
      authorRole: isPro ? 'profesional' : 'cliente',
      title: d.title,
      description: d.description,
      photos: JSON.stringify(d.photos || []),
      professionalId: d.professionalId || null,
      projectId: d.projectId || null,
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
