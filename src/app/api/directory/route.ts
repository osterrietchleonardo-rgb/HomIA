import { NextRequest } from 'next/server'
import { ok, parseJson } from '@/lib/api'
import { db } from '@/lib/db'
import { PROVIDER_KINDS } from '@/lib/search-match'
import { puedeOperar, esProActivo } from '@/lib/plans'
import { whereUsuarioPublico } from '@/lib/visibility'

// Directorio HomIA: todos los profesionales y proveedores registrados,
// ordenables por reseñas/rating/trabajos y filtrables por rubro, rating
// mínimo y precio promedio (presupuestos enviados o stock del proveedor).
// La LISTA es pública (home y paneles); el detalle requiere sesión.

type ProCard = {
  kind: 'profesional'
  id: string
  userId: string
  href: string
  name: string
  avatarUrl: string | null
  city: string | null
  verified: boolean
  verificationStatus: string
  isPro: boolean
  rating: number
  reviewsCount: number
  professions: string[]
  worksCount: number
  experienceYears: number
  avgBid: number | null
  bidsCount: number
  memberSince: Date
}
type ProvCard = {
  kind: 'proveedor'
  id: string
  userId: string
  href: string
  name: string
  avatarUrl: string | null
  city: string | null
  verified: boolean
  verificationStatus: string
  isPro: boolean
  rating: number
  reviewsCount: number
  businessName: string
  provKind: string
  description: string | null
  stockCount: number
  avgPrice: number | null
  categories: string[]
  memberSince: Date
}

export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const kind = sp.get('kind') // all|profesional|proveedor
  const cat = sp.get('cat') // slug de rubro
  const q = (sp.get('q') || '').toLowerCase().trim()
  const sort = sp.get('sort') || 'reviews' // reviews|rating|works|recent
  const minRating = sp.get('minRating') ? parseFloat(sp.get('minRating')!) : 0
  const bidMin = sp.get('bidMin') ? parseFloat(sp.get('bidMin')!) : null
  const bidMax = sp.get('bidMax') ? parseFloat(sp.get('bidMax')!) : null
  const priceMin = sp.get('priceMin') ? parseFloat(sp.get('priceMin')!) : null
  const priceMax = sp.get('priceMax') ? parseFloat(sp.get('priceMax')!) : null

  const wantPro = kind !== 'proveedor'
  const wantProv = kind !== 'profesional'

  // ── Profesionales ──
  let pros: ProCard[] = []
  if (wantPro) {
    const rows = await db.professionalProfile.findMany({
      // sin cuentas eliminadas ni (con HIDE_DEMO_USERS=1) cuentas demo — src/lib/visibility.ts
      where: { user: whereUsuarioPublico() },
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, rating: true, reviewsCount: true, city: true, createdAt: true, verificationStatus: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    const bidsAgg = await db.jobBid.groupBy({ by: ['professionalId'], _avg: { amount: true }, _count: { _all: true } })
    const bidMap = new Map(bidsAgg.map((b) => [b.professionalId, { avg: b._avg.amount, n: b._count._all }]))
    pros = rows.map((p) => {
      const bid = bidMap.get(p.id)
      return {
        kind: 'profesional' as const,
        id: p.id,
        userId: p.userId,
        href: `/profesional/${p.id}`,
        name: p.user.displayName,
        avatarUrl: p.user.avatarUrl,
        city: p.city || p.user.city,
        // la verificación la define el DNI + IA (quien no subió DNI = no verificado)
        verified: p.user.verificationStatus === 'verificado',
        verificationStatus: p.user.verificationStatus,
        isPro: p.subscription === 'pro',
        rating: p.user.rating,
        reviewsCount: p.user.reviewsCount,
        professions: parseJson<string[]>(p.professions, []),
        worksCount: p.worksCount,
        experienceYears: p.experienceYears,
        avgBid: bid?.avg != null ? Math.round(bid.avg) : null,
        bidsCount: bid?.n || 0,
        memberSince: p.user.createdAt,
      }
    })
    if (cat) pros = pros.filter((p) => p.professions.includes(cat))
    if (bidMin != null) pros = pros.filter((p) => p.avgBid != null && p.avgBid >= bidMin)
    if (bidMax != null) pros = pros.filter((p) => p.avgBid != null && p.avgBid <= bidMax)
    pros = pros.filter((p) =>
      !q ||
      `${p.name} ${p.professions.join(' ')} ${p.city || ''}`.toLowerCase().includes(q)
    )
  }

  // ── Proveedores ──
  let provs: ProvCard[] = []
  if (wantProv) {
    const rows = await db.providerProfile.findMany({
      where: { user: whereUsuarioPublico() },
      include: {
        user: { select: { id: true, avatarUrl: true, rating: true, reviewsCount: true, city: true, createdAt: true, verificationStatus: true } },
      },
      orderBy: { createdAt: 'desc' },
    })
    const stockRows = await db.providerStock.findMany({
      select: { providerId: true, price: true, element: { select: { category: { select: { slug: true } } } } },
    })
    const stockMap = new Map<string, { n: number; sum: number; cats: Set<string> }>()
    for (const s of stockRows) {
      const acc = stockMap.get(s.providerId) || { n: 0, sum: 0, cats: new Set<string>() }
      acc.n++
      acc.sum += s.price
      if (s.element?.category?.slug) acc.cats.add(s.element.category.slug)
      stockMap.set(s.providerId, acc)
    }
    // proveedores con prueba vencida / sin plan no figuran en el directorio
    provs = rows.filter((p) => puedeOperar(p)).map((p) => {
      const acc = stockMap.get(p.id) || { n: 0, sum: 0, cats: new Set<string>() }
      return {
        kind: 'proveedor' as const,
        id: p.id,
        userId: p.userId,
        href: `/proveedor/${p.id}`,
        name: p.businessName,
        avatarUrl: p.user.avatarUrl,
        city: p.city || p.user.city,
        // la verificación la define el DNI + IA (quien no subió DNI = no verificado)
        verified: p.user.verificationStatus === 'verificado',
        verificationStatus: p.user.verificationStatus,
        // Plan PRO ACTIVO → "Recomendado" y primero en la lista
        isPro: esProActivo(p),
        rating: p.user.rating,
        reviewsCount: p.user.reviewsCount,
        businessName: p.businessName,
        provKind: p.kind,
        description: p.description,
        stockCount: acc.n,
        avgPrice: acc.n ? Math.round(acc.sum / acc.n) : null,
        categories: [...acc.cats],
        memberSince: p.user.createdAt,
      }
    })
    if (cat) provs = provs.filter((p) => p.categories.includes(cat))
    if (priceMin != null) provs = provs.filter((p) => p.avgPrice != null && p.avgPrice >= priceMin)
    if (priceMax != null) provs = provs.filter((p) => p.avgPrice != null && p.avgPrice <= priceMax)
    provs = provs.filter((p) =>
      !q || `${p.name} ${p.businessName} ${PROVIDER_KINDS[p.provKind] || ''} ${p.description || ''} ${p.city || ''}`.toLowerCase().includes(q)
    )
  }

  // Rating mínimo se aplica solo a quienes tienen reseñas (evita esconder a los nuevos)
  if (minRating > 0) {
    pros = pros.filter((p) => p.reviewsCount > 0 && p.rating >= minRating)
    provs = provs.filter((p) => p.reviewsCount > 0 && p.rating >= minRating)
  }

  // ── Orden (reseñas positivas primero por defecto) ──
  const sortKey = (c: ProCard | ProvCard) =>
    sort === 'rating' ? c.rating * 1000 + c.reviewsCount
      : sort === 'recent' ? new Date(c.memberSince).getTime() / 1e10
        : sort === 'works' ? (c.kind === 'profesional' ? c.worksCount * 100 + c.reviewsCount : c.stockCount * 100 + c.reviewsCount)
          : c.reviewsCount * 1000 + c.rating * 10 // reviews (default)
  const all: (ProCard | ProvCard)[] = [...pros, ...provs].sort((a, b) => {
    // Proveedores con Plan PRO ("Recomendados") encabezan siempre la lista
    const featA = a.kind === 'proveedor' && a.isPro ? 1 : 0
    const featB = b.kind === 'proveedor' && b.isPro ? 1 : 0
    if (featA !== featB) return featB - featA
    return sortKey(b) - sortKey(a)
  })

  const categories = await db.category.findMany({ orderBy: { sortOrder: 'asc' }, select: { slug: true, name: true, icon: true } })

  return ok({ directory: all, total: all.length, categories })
}
