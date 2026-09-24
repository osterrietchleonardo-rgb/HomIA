import { ok } from '@/lib/api'
import { db } from '@/lib/db'
import { esProActivo } from '@/lib/plans'

// ── CINTA DE SPONSORS (home) ──
// Solo proveedores con Plan PRO ACTIVO (esProActivo): si deja de pagar o baja a
// Básico, sale de la cinta en el acto. Cada uno aparece con su logo y su marca
// (lo que cargó en Mi perfil → "Tu marca en la home"; si todavía no subió logo,
// se usa su foto de perfil).
const MAX_SPONSORS = 40

export async function GET() {
  const provs = await db.providerProfile.findMany({
    where: { subscription: 'pro' },
    orderBy: { rating: 'desc' },
    take: 200,
    select: {
      id: true,
      businessName: true,
      kind: true,
      city: true,
      rating: true,
      reviewsCount: true,
      subscription: true,
      trialEndsAt: true,
      createdAt: true,
      brandLogoUrl: true,
      brandTagline: true,
      brandColor: true,
      user: { select: { avatarUrl: true, verificationStatus: true } },
    },
  })

  const sponsors = provs
    .filter((p) => esProActivo(p))
    // primero los que cargaron su logo propio; después por reputación
    .sort((a, b) => {
      const la = a.brandLogoUrl ? 1 : 0
      const lb = b.brandLogoUrl ? 1 : 0
      if (la !== lb) return lb - la
      if (a.rating !== b.rating) return b.rating - a.rating
      return b.reviewsCount - a.reviewsCount
    })
    .slice(0, MAX_SPONSORS)
    .map((p) => ({
      id: p.id,
      href: `/proveedor/${p.id}`,
      businessName: p.businessName,
      logoUrl: p.brandLogoUrl ?? p.user.avatarUrl ?? null,
      hasBrandLogo: !!p.brandLogoUrl,
      tagline: p.brandTagline ?? null,
      color: p.brandColor ?? null,
      kind: p.kind,
      city: p.city,
      verified: p.user.verificationStatus === 'verificado',
      rating: p.rating,
      reviewsCount: p.reviewsCount,
    }))

  return ok({ sponsors })
}
