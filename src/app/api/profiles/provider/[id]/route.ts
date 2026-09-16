import { NextRequest } from 'next/server'
import { ok, fail, parseJson } from '@/lib/api'
import { db } from '@/lib/db'

// Perfil público de proveedor: catálogo visible + reseñas
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const prov = await db.providerProfile.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true, displayName: true, avatarUrl: true, city: true, lat: true, lng: true, createdAt: true,
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
    include: { author: { select: { id: true, displayName: true, avatarUrl: true } } },
  })

  return ok({
    profile: {
      id: prov.id,
      userId: prov.userId,
      displayName: prov.user.displayName,
      avatarUrl: prov.user.avatarUrl,
      businessName: prov.businessName,
      cuit: prov.cuit,
      description: prov.description,
      address: prov.address,
      city: prov.city || prov.user.city,
      lat: prov.lat || prov.user.lat,
      lng: prov.lng || prov.user.lng,
      verified: prov.verified,
      rating: prov.rating,
      reviewsCount: reviews.length,
      memberSince: prov.user.createdAt,
    },
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
