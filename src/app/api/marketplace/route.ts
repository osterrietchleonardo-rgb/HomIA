import { NextRequest } from 'next/server'
import { ok } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { parseJson } from '@/lib/api'
import { withinRadius } from '@/lib/geo'
import { matchScore, canonicalCategoria } from '@/lib/search-match'
import { matchTerms } from '@/lib/search-match'

// ── MARKETPLACE DE MATERIALES ──
// El cliente (o cualquier usuario) busca lo que necesita comprar — sin
// contratar a nadie — y ve TODAS las ofertas que concuerdan: elemento del
// catálogo con su explicación, precio, stock real y ficha del proveedor
// (reseñas, verificación, distancia). Los proveedores con plan PRO van
// primeros como "Recomendados".
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const cat = sp.get('cat') || ''
  const lat = sp.get('lat') ? parseFloat(sp.get('lat')!) : null
  const lng = sp.get('lng') ? parseFloat(sp.get('lng')!) : null
  const radius = sp.get('radius') ? parseFloat(sp.get('radius')!) : 25

  const user = await getSessionUser().catch(() => null)

  // ── 1. Elementos del catálogo que concuerdan (búsqueda difusa) ──
  const catSlug = canonicalCategoria(cat)
  const elements = await db.catalogElement.findMany({
    where: { active: true, ...(catSlug ? { category: { slug: catSlug } } : {}) },
    include: { category: true, stock: { select: { quantity: true, status: true } } },
  })

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const qn = norm(q)
  const scored = elements
    .map((e) => {
      const aliases = parseJson<string[]>(e.aliases, [])
      const hayName = norm(e.name)
      const hayAll = norm([e.name, ...aliases, e.description || ''].join(' · '))
      let score = 0
      if (!qn) score = e.stock.length > 0 ? 2 : 1
      else {
        if (hayName.includes(qn)) score = 100
        else {
          score = matchScore(q, `${e.name} ${aliases.join(' ')} ${e.description || ''}`) * 10
          if (score === 0 && matchTerms(q, hayAll)) score = 5
        }
        if (score > 0 && e.stock.some((s) => s.quantity > 0 && s.status === 'disponible')) score += 3
      }
      return { e, score }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 14)

  const elementIds = scored.map((x) => x.e.id)

  // ── 2. Ofertas reales de esos elementos (stock de todos los proveedores) ──
  const stocks = elementIds.length
    ? await db.providerStock.findMany({
        where: { elementId: { in: elementIds }, quantity: { gt: 0 }, status: 'disponible' },
        include: {
          provider: {
            include: {
              user: { select: { id: true, displayName: true, avatarUrl: true, city: true, verificationStatus: true, rating: true, reviewsCount: true } },
            },
          },
        },
      })
    : []

  type Offer = {
    stockId: string; elementId: string; price: number; quantity: number; brand: string | null
    providerId: string; businessName: string; kind: string
    providerUserId: string; providerAvatar: string | null; providerCity: string | null
    providerRating: number; providerReviews: number; providerVerified: boolean
    planPro: boolean; distanceKm?: number
    lat: number | null; lng: number | null
  }

  const byElement = new Map<string, Offer[]>()
  for (const s of stocks) {
    const base: Offer = {
      stockId: s.id,
      elementId: s.elementId,
      price: s.price,
      quantity: s.quantity,
      brand: s.brand,
      providerId: s.provider.id,
      businessName: s.provider.businessName,
      kind: s.provider.kind,
      providerUserId: s.provider.userId,
      providerAvatar: s.provider.user.avatarUrl,
      providerCity: s.provider.city || s.provider.user.city,
      providerRating: s.provider.rating || s.provider.user.rating,
      providerReviews: s.provider.reviewsCount || s.provider.user.reviewsCount,
      providerVerified: s.provider.user.verificationStatus === 'verificado',
      planPro: s.provider.subscription === 'pro',
      lat: s.provider.lat,
      lng: s.provider.lng,
    }
    const list = byElement.get(s.elementId) || []
    list.push(base)
    byElement.set(s.elementId, list)
  }

  // geo + orden: PRO ("Recomendado") primero, después precio
  const withGeo = withinRadius(
    [...byElement.values()].flat() as (Offer & import('@/lib/geo').WithGeo)[],
    lat, lng, radius
  ) as (Offer & { distanceKm?: number })[]
  const geoMap = new Map(withGeo.map((o) => [o.stockId, o]))
  for (const [, list] of byElement) {
    list.sort((a, b) => {
      const ga = geoMap.get(a.stockId)?.distanceKm
      const gb = geoMap.get(b.stockId)?.distanceKm
      if (a.planPro !== b.planPro) return a.planPro ? -1 : 1 // Recomendados primero
      if (ga != null && gb != null && Math.abs(ga - gb) > 15) return ga - gb
      return a.price - b.price
    })
  }

  const results = scored.map(({ e }) => {
    const offers = (byElement.get(e.id) || []).map((o) => {
      const g = geoMap.get(o.stockId)
      return { ...o, distanceKm: g?.distanceKm }
    })
    const prices = offers.map((o) => o.price)
    return {
      elementId: e.id,
      name: e.name,
      description: e.description || '',
      aliases: parseJson<string[]>(e.aliases, []),
      unit: e.unit,
      categorySlug: e.category.slug,
      categoryName: e.category.name,
      offersCount: offers.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      hasPro: offers.some((o) => o.planPro),
      offers,
    }
  })

  // ── 3. Registrar la búsqueda (analítica de demanda para proveedores PRO) ──
  try {
    await db.searchEvent.create({
      data: {
        userId: user?.id || null,
        mode: 'materiales',
        query: q || `(categoría: ${cat || 'todo'})`,
        intent: JSON.stringify({ cat, radius }),
        results: JSON.stringify({
          count: results.reduce((a, r) => a + r.offersCount, 0),
          providerIds: [...new Set(results.flatMap((r) => r.offers.map((o) => o.providerId)))],
          elementIds,
        }),
      },
    })
  } catch { /* la analítica nunca bloquea la búsqueda */ }

  return ok({ results, q, cat })
}
