import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'

// POST: dejar reseña 360° (cliente→profesional, profesional→cliente, etc.)
export async function POST(req: NextRequest) {
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para reseñar', 401)

  const d = await body<{
    targetUserId: string
    rating: number
    comment: string
    context?: string // proyecto|obra|perfil
    projectId?: string
    workId?: string
  }>(req)
  if (!d.targetUserId || !d.rating || !d.comment) {
    return fail('Faltan puntaje o comentario')
  }
  if (d.rating < 1 || d.rating > 5) return fail('El puntaje va de 1 a 5')
  if (d.targetUserId === user.id) return fail('No podés reseñarte a vos mismo')

  const target = await db.user.findUnique({ where: { id: d.targetUserId } })
  if (!target) return fail('Usuario no encontrado', 404)

  // única reseña por proyecto/obra por autor
  if (d.projectId) {
    const dup = await db.review.findFirst({
      where: { authorId: user.id, projectId: d.projectId },
    })
    if (dup) return fail('Ya dejaste una reseña en este proyecto', 409)
  }

  const review = await db.review.create({
    data: {
      authorId: user.id,
      targetUserId: d.targetUserId,
      rating: d.rating,
      comment: d.comment,
      context: d.context || 'proyecto',
      projectId: d.projectId || null,
      workId: d.workId || null,
    },
  })

  // recalcula rating promedio del target
  const agg = await db.review.aggregate({
    where: { targetUserId: d.targetUserId },
    _avg: { rating: true },
    _count: { rating: true },
  })
  const avg = agg._avg.rating || 0
  const count = agg._count.rating || 0
  await db.user.update({
    where: { id: d.targetUserId },
    data: { rating: Math.round(avg * 10) / 10, reviewsCount: count },
  })
  await db.professionalProfile.updateMany({ where: { userId: d.targetUserId }, data: { rating: Math.round(avg * 10) / 10, reviewsCount: count } })
  await db.providerProfile.updateMany({ where: { userId: d.targetUserId }, data: { rating: Math.round(avg * 10) / 10, reviewsCount: count } })

  await db.notification.create({
    data: {
      userId: d.targetUserId,
      type: 'nueva_reseña',
      title: 'Nueva reseña',
      body: `${user.displayName} te calificó con ${d.rating}★`,
      link: '#/panel',
    },
  })

  return ok({ review }, 201)
}

// GET: reseñas recibidas del usuario logueado (o de targetUserId público)
export async function GET(req: NextRequest) {
  const targetUserId = req.nextUrl.searchParams.get('targetUserId')
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  const target = targetUserId || user?.id
  if (!target) return ok({ reviews: [] })
  const reviews = await db.review.findMany({
    where: { targetUserId: target },
    orderBy: { createdAt: 'desc' },
    include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
  })
  return ok({ reviews })
}
