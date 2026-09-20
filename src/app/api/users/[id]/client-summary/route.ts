import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { parseJson } from '@/lib/api'

// ── RESUMEN PÚBLICO DEL CLIENTE ──
// Los profesionales y proveedores pueden ver, antes de aceptar un trabajo o un
// pedido, con quién van a trabajar: reseñas que recibió el cliente de otros
// profesionales, proyectos finalizados, antigüedad y verificación de identidad.
// Es la reputación del cliente — la contracara del rating de pros y proveedores.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const client = await db.user.findUnique({
    where: { id },
    select: {
      id: true, displayName: true, avatarUrl: true, city: true, roles: true,
      createdAt: true, verificationStatus: true, rating: true, reviewsCount: true,
    },
  })
  if (!client) return fail('Usuario no encontrado', 404)

  const esCliente = (parseJson<string[]>(client.roles, []) || []).includes('cliente')

  // Proyectos del cliente: finalizados y activos (los activos solo cifras, sin detalle)
  const [finalizados, activos, reviews, purchases] = await Promise.all([
    db.project.count({ where: { clientId: id, stage: 'finalizado' } }),
    db.project.count({ where: { clientId: id, status: 'activo' } }),
    db.review.findMany({
      where: { targetUserId: id },
      orderBy: { createdAt: 'desc' },
      take: 10,
      select: {
        id: true, rating: true, comment: true, photos: true, context: true, createdAt: true,
        author: { select: { id: true, displayName: true, avatarUrl: true } },
      },
    }),
    db.purchase.aggregate({
      where: { clientId: id, status: { in: ['pagado', 'entregado'] } },
      _count: { _all: true },
    }),
  ])

  return ok({
    client: {
      id: client.id,
      displayName: client.displayName,
      avatarUrl: client.avatarUrl,
      city: client.city,
      memberSince: client.createdAt,
      verificationStatus: client.verificationStatus,
      rating: client.rating,
      reviewsCount: client.reviewsCount,
      esCliente,
    },
    stats: {
      proyectosFinalizados: finalizados,
      proyectosActivos: activos,
      comprasRealizadas: purchases._count._all,
    },
    reviews: reviews.map((r) => ({ ...r, photos: r.photos ? parseJson<string[]>(r.photos, []) : [] })),
  })
}
