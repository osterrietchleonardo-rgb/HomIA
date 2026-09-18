import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { parseJson } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'

// Perfil de profesional (requiere sesión): incluye usuario, obras y reseñas recibidas
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const viewer = await getSessionUser()
  if (!viewer) return fail('Iniciá sesión para ver el perfil de este profesional', 401)
  const pro = await db.professionalProfile.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true, displayName: true, avatarUrl: true, rating: true, reviewsCount: true,
          city: true, lat: true, lng: true, createdAt: true, roles: true, verificationStatus: true,
        },
      },
    },
  })
  if (!pro) return fail('Profesional no encontrado', 404)

  const works = await db.completedWork.findMany({
    where: { professionalId: pro.id, visible: true },
    orderBy: { createdAt: 'desc' },
    take: 12,
  })
  const reviews = await db.review.findMany({
    where: { targetUserId: pro.userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { author: { select: { id: true, displayName: true, avatarUrl: true, verificationStatus: true } } },
  })
  const avgRating = reviews.length
    ? reviews.reduce((a, r) => a + r.rating, 0) / reviews.length
    : pro.rating

  // Regla de comunidad: los clientes escriben primero. Si el espectador es
  // profesional/proveedor (sin rol cliente) y el perfil es de un cliente con
  // el que NO hay hilo previo, no puede contactarlo — el cliente inicia.
  const targetRoles = parseJson<string[]>(pro.user.roles, [])
  let chatBlocked = false
  if (viewer.id !== pro.userId && !viewer.roles.includes('cliente') && targetRoles.includes('cliente')) {
    const pair = viewer.id < pro.userId ? { userAId: viewer.id, userBId: pro.userId } : { userAId: pro.userId, userBId: viewer.id }
    const conv = await db.conversation.findUnique({ where: { userAId_userBId: pair } })
    chatBlocked = !conv
  }

  return ok({
    profile: {
      id: pro.id,
      userId: pro.userId,
      displayName: pro.user.displayName,
      avatarUrl: pro.user.avatarUrl,
      city: pro.city || pro.user.city,
      lat: pro.lat || pro.user.lat,
      lng: pro.lng || pro.user.lng,
      personType: pro.personType,
      professions: parseJson<string[]>(pro.professions, []),
      skills: parseJson<string[]>(pro.skills, []),
      experienceYears: pro.experienceYears,
      bio: pro.bio,
      companyName: pro.companyName,
      companyWebsite: pro.companyWebsite,
      employeesCount: pro.employeesCount,
      serviceRadiusKm: pro.serviceRadiusKm,
      // la verificación la define el DNI + IA del usuario (visible para todos)
      verified: pro.user.verificationStatus === 'verificado',
      verificationStatus: pro.user.verificationStatus,
      subscription: pro.subscription,
      rating: Math.round(avgRating * 10) / 10,
      reviewsCount: reviews.length,
      worksCount: pro.worksCount,
      memberSince: pro.user.createdAt,
    },
    chatBlocked,
    works,
    reviews,
  })
}
