import { NextRequest } from 'next/server'
import { ok, fail, parseJson } from '@/lib/api'
import { db } from '@/lib/db'
import { esProActivo } from '@/lib/plans'
import { getSessionUser } from '@/lib/auth'

// Perfil de proveedor (requiere sesión): catálogo visible + reseñas
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const viewer = await getSessionUser()
  if (!viewer) return fail('Iniciá sesión para ver el perfil de este proveedor', 401)
  const prov = await db.providerProfile.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true, displayName: true, avatarUrl: true, city: true, lat: true, lng: true,
          createdAt: true, roles: true, verificationStatus: true,
        },
      },
    },
  })
  if (!prov) return fail('Proveedor no encontrado', 404)

  const stock = await db.providerStock.findMany({
    where: { providerId: prov.id },
    include: { element: { include: { category: true } } },
    orderBy: { updatedAt: 'desc' },
    take: 100,
  })
  const reviews = await db.review.findMany({
    where: { targetUserId: prov.userId },
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { author: { select: { id: true, displayName: true, avatarUrl: true, verificationStatus: true } } },
  })

  // Regla de comunidad "el cliente inicia": las conversaciones nuevas se abren
  // hacia quien ofrece algo. Este perfil ofrece (profesional/proveedor), así que
  // contactarlo siempre está permitido (misma regla que /api/messages/conversations).
  const chatBlocked = false

  return ok({
    profile: {
      id: prov.id,
      userId: prov.userId,
      displayName: prov.user.displayName,
      avatarUrl: prov.user.avatarUrl,
      businessName: prov.businessName,
      kind: prov.kind,
      cuit: prov.cuit,
      description: prov.description,
      address: prov.address,
      city: prov.city || prov.user.city,
      lat: prov.lat || prov.user.lat,
      lng: prov.lng || prov.user.lng,
      // la verificación la define el DNI + IA del usuario (visible para todos)
      verified: prov.user.verificationStatus === 'verificado',
      verificationStatus: prov.user.verificationStatus,
      subscription: prov.subscription,
      recommended: esProActivo(prov),
      proSince: prov.proSince,
      rating: prov.rating,
      reviewsCount: Math.max(prov.reviewsCount, reviews.length), // la lista trae 20: el total real es el del perfil
      memberSince: prov.user.createdAt,
    },
    chatBlocked,
    stock: stock.map((s) => ({
      id: s.id,
      name: s.element.name,
      category: s.element.category.name,
      categorySlug: s.element.category.slug,
      brand: s.brand,
      unit: s.element.unit,
      price: s.price,
      quantity: s.quantity,
      status: s.status,
    })),
    reviews,
  })
}
