import { ok } from '@/lib/api'
import { db } from '@/lib/db'

// ── SPONSORS DE CONFIANZA (home) ──
// Proveedores con Plan PRO: su logo y marca aparecen en la home como
// "proveedores sponsors de nuestra confianza".
export async function GET() {
  const provs = await db.providerProfile.findMany({
    where: { subscription: 'pro' },
    orderBy: { rating: 'desc' },
    take: 12,
    include: {
      user: { select: { avatarUrl: true, verificationStatus: true } },
      _count: { select: { stock: true } },
    },
  })
  return ok({
    sponsors: provs.map((p) => ({
      id: p.id,
      href: `/proveedor/${p.id}`,
      businessName: p.businessName,
      kind: p.kind,
      city: p.city,
      avatarUrl: p.user.avatarUrl,
      verified: p.user.verificationStatus === 'verificado',
      rating: p.rating,
      reviewsCount: p.reviewsCount,
      stockCount: p._count.stock,
    })),
  })
}
