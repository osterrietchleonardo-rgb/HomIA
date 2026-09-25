import { NextRequest } from 'next/server'
import { ok } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { parseJson } from '@/lib/api'
import { withinRadius } from '@/lib/geo'
import { matchScore, canonicalCategoria } from '@/lib/search-match'
import { matchTerms } from '@/lib/search-match'
import { puedeOperar, esProActivo } from '@/lib/plans'
import { whereUsuarioPublico } from '@/lib/visibility'

// ── MARKETPLACE DE MATERIALES ──
// El cliente (o cualquier usuario) busca lo que necesita comprar — sin
// contratar a nadie — y ve TODAS las ofertas que concuerdan: elemento del
// catálogo con su explicación, precio, stock real y ficha del proveedor
// (reseñas, verificación, distancia). Los proveedores con plan PRO van
// primeros como "Recomendados".
// D15 (24/09/2026): también se listan las ofertas SIN stock (el proveedor publica el
// elemento con cantidad 0) con `inStock: false`, al final: esas solo se pueden RESERVAR.
// `offersCount`, `minPrice` y `maxPrice` cuentan solo las ofertas con stock.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const q = (sp.get('q') || '').trim()
  const cat = sp.get('cat') || ''
  const lat = sp.get('lat') ? parseFloat(sp.get('lat')!) : null
  const lng = sp.get('lng') ? parseFloat(sp.get('lng')!) : null
  const radius = sp.get('radius') ? parseFloat(sp.get('radius')!) : 25

  const user = await getSessionUser().catch(() => null)

  // ── 1. Elementos del catálogo que concuerdan (búsqueda difusa) ──
  // Sin tope artificial: se listan TODOS los elementos que concuerden con la
  // búsqueda (nombre, alias, descripción, MARCA o nombre del proveedor) para
  // que el usuario vea todo lo que cada proveedor tiene disponible.
  const catSlug = canonicalCategoria(cat)
  const elements = await db.catalogElement.findMany({
    where: { active: true, ...(catSlug ? { category: { slug: catSlug } } : {}) },
    include: {
      category: true,
      stock: {
        select: {
          quantity: true, status: true, brand: true,
          provider: { select: { businessName: true, subscription: true, trialEndsAt: true, planPaidUntil: true, createdAt: true } },
        },
      },
    },
  })

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const qn = norm(q)
  const scored = elements
    .map((e) => {
      const aliases = parseJson<string[]>(e.aliases, [])
      const hayName = norm(e.name)
      const hayAll = norm([e.name, ...aliases, e.description || ''].join(' · '))
      // solo cuenta el stock de proveedores operativos (plan activo o prueba vigente)
      const stockOperativo = e.stock.filter((s) => puedeOperar(s.provider))
      // marcas y nombres de proveedores que publican este elemento
      const brandsProvs = norm(stockOperativo.map((s) => `${s.brand || ''} ${s.provider.businessName}`).join(' · '))
      const hasStock = stockOperativo.some((s) => s.quantity > 0 && s.status !== 'agotado')
      // algún proveedor Recomendado (PRO activo) lo tiene disponible
      const hasProStock = stockOperativo.some((s) => s.quantity > 0 && s.status !== 'agotado' && esProActivo(s.provider))
      let score = 0
      if (!qn) {
        // navegación sin búsqueda: todos los elementos con stock disponible
        score = hasStock ? 2 : 1
      } else {
        if (hayName.includes(qn)) score = 100
        else if (brandsProvs.includes(qn)) score = 40 // matchea la marca o el proveedor
        else {
          score = matchScore(q, `${e.name} ${aliases.join(' ')} ${e.description || ''}`) * 10
          if (score === 0 && brandsProvs && matchScore(q, brandsProvs) > 0) score = 40
          if (score === 0 && matchTerms(q, hayAll)) score = 5
        }
        if (score > 0 && hasStock) score += 3
      }
      return { e, score, hasStock, hasProStock }
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => {
      if (a.score !== b.score) return b.score - a.score
      if (a.hasStock !== b.hasStock) return a.hasStock ? -1 : 1
      // a igual relevancia, primero lo que venden los proveedores Recomendados
      if (a.hasProStock !== b.hasProStock) return a.hasProStock ? -1 : 1
      return a.e.name.localeCompare(b.e.name, 'es')
    })
    .slice(0, 120)

  const elementIds = scored.map((x) => x.e.id)

  // ── 2. Ofertas reales de esos elementos (stock de todos los proveedores, con y sin stock) ──
  const stocks = elementIds.length
    ? await db.providerStock.findMany({
        // sin cuentas eliminadas ni (con HIDE_DEMO_USERS=1) cuentas demo — src/lib/visibility.ts
        where: { elementId: { in: elementIds }, provider: { user: whereUsuarioPublico() } },
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
    stockId: string; elementId: string; price: number; quantity: number; inStock: boolean; brand: string | null
    providerId: string; businessName: string; kind: string
    providerUserId: string; providerAvatar: string | null; providerCity: string | null
    providerRating: number; providerReviews: number; providerVerified: boolean
    planPro: boolean; distanceKm?: number
    lat: number | null; lng: number | null
  }

  const kindFilter = sp.get('kind') || ''

  const byElement = new Map<string, Offer[]>()
  for (const s of stocks) {
    if (kindFilter && s.provider.kind !== kindFilter) continue
    // prueba vencida / sin plan → el proveedor no aparece en el marketplace
    if (!puedeOperar(s.provider)) continue
    const base: Offer = {
      stockId: s.id,
      elementId: s.elementId,
      price: s.price,
      quantity: Math.max(0, s.quantity),
      inStock: s.quantity > 0 && s.status !== 'agotado',
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
      planPro: esProActivo(s.provider), // Plan PRO ACTIVO → "Recomendado" y primero
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
  // con ubicación: solo ofertas dentro del radio (withinRadius ya excluyó las lejanas)
  if (lat != null && lng != null) {
    for (const [elementId, list] of byElement) {
      const dentro = list.filter((o) => geoMap.has(o.stockId))
      if (dentro.length) byElement.set(elementId, dentro)
      else byElement.delete(elementId)
    }
  }
  for (const [, list] of byElement) {
    list.sort((a, b) => {
      if (a.inStock !== b.inStock) return a.inStock ? -1 : 1 // sin stock (solo reserva) al final
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
    const withStock = offers.filter((o) => o.inStock)
    const prices = withStock.map((o) => o.price)
    return {
      elementId: e.id,
      name: e.name,
      description: e.description || '',
      aliases: parseJson<string[]>(e.aliases, []),
      unit: e.unit,
      categorySlug: e.category.slug,
      categoryName: e.category.name,
      offersCount: withStock.length,
      reservableCount: offers.length - withStock.length,
      minPrice: prices.length ? Math.min(...prices) : null,
      maxPrice: prices.length ? Math.max(...prices) : null,
      hasPro: withStock.some((o) => o.planPro),
      offers,
    }
  })

  // ── 3. Registrar la búsqueda (analítica de demanda para proveedores PRO) ──
  // Solo consultas reales (3+ letras): evita ruido de cada tecla y de la navegación por categoría.
  if (q.length >= 3) {
    try {
      await db.searchEvent.create({
        data: {
          userId: user?.id || null,
          mode: 'materiales',
          query: q,
          intent: JSON.stringify({ cat, radius }),
          results: JSON.stringify({
            count: results.reduce((a, r) => a + r.offersCount, 0),
            providerIds: [...new Set(results.flatMap((r) => r.offers.map((o) => o.providerId)))],
            elementIds,
          }),
        },
      })
    } catch { /* la analítica nunca bloquea la búsqueda */ }
  }

  const categories = await db.category.findMany({ select: { slug: true, name: true, icon: true }, orderBy: { name: 'asc' } })
  
  return ok({ results, categories, q, cat })
}
