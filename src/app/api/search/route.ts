import { NextRequest } from 'next/server'
import { ok } from '@/lib/api'
import { db } from '@/lib/db'
import { parseJson } from '@/lib/api'
import { withinRadius, type WithGeo } from '@/lib/geo'
import { matchTerms, canonicalCategoria } from '@/lib/search-match'
import { puedeOperar, esProActivo } from '@/lib/plans'

// Búsqueda dual HomIA
// mode=cliente    → profesionales + trabajos abiertos + MATERIALES en proveedores
//                   (el cliente también compra insumos sin contratar a nadie)
// mode=profesional→ stock de materiales + bolsa de trabajos ("¿qué hay para plomeros?")
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const mode = sp.get('mode') || 'cliente'
  const q = (sp.get('q') || '').trim().toLowerCase()
  const cat = sp.get('cat') || ''
  const lat = sp.get('lat') ? parseFloat(sp.get('lat')!) : null
  const lng = sp.get('lng') ? parseFloat(sp.get('lng')!) : null
  const radius = sp.get('radius') ? parseFloat(sp.get('radius')!) : 25
  const urgency = sp.get('urgency') || ''

  // ── Materiales en proveedores (para AMBOS modos) ──
  // Matchea por nombre del elemento, ALIASES ("caño" encuentra "Caño PVC desagüe",
  // "corrugado" encuentra el caño de luz), descripción, marca y nombre del proveedor.
  const stock = await db.providerStock.findMany({
    include: {
      element: { include: { category: true } },
      provider: {
        include: {
          user: { select: { displayName: true, avatarUrl: true, city: true } },
        },
      },
    },
  })

  // proveedores con prueba vencida / sin plan no aparecen en las búsquedas
  let matched = stock.filter((s) => puedeOperar(s.provider))
  if (q) {
    matched = matched.filter((s) => {
      const hay = [s.element.name, ...parseJson<string[]>(s.element.aliases, []), s.element.description || '', s.brand || '', s.provider.businessName].join(' ').toLowerCase()
      return matchTerms(q, hay)
    })
  }
  if (cat) {
    const catSlug = canonicalCategoria(cat)
    if (catSlug) matched = matched.filter((s) => s.element.category.slug === catSlug)
  }

  const materialResults = withinRadius(
    matched
      .sort((a, b) => {
        const pa = esProActivo(a.provider) ? 1 : 0
        const pb = esProActivo(b.provider) ? 1 : 0
        if (pa !== pb) return pb - pa // proveedores Recomendados primero
        return a.price - b.price
      })
      .map((s) => ({
      id: s.id,
      type: 'material' as const,
      elementId: s.elementId,
      name: s.element.name,
      description: s.element.description || null,
      category: s.element.category.name,
      categorySlug: s.element.category.slug,
      unit: s.element.unit,
      brand: s.brand,
      price: s.price,
      quantity: s.quantity,
      status: s.status,
      providerId: s.provider.id,
      providerName: s.provider.businessName,
      providerCity: s.provider.city || s.provider.user.city,
      providerRating: s.provider.rating,
      recommended: esProActivo(s.provider), // Plan PRO activo → "Recomendado"
      lat: s.provider.lat,
      lng: s.provider.lng,
    })),
    lat, lng, radius
  )
    // con ubicación withinRadius ordena por distancia: los Recomendados (PRO
    // activo) vuelven a encabezar, manteniendo el orden por cercanía entre sí
    .sort((a, b) => Number(b.recommended) - Number(a.recommended))

  if (mode === 'cliente') {
    // ── Profesionales ──
    const pros = await db.professionalProfile.findMany({
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, rating: true, reviewsCount: true, city: true, verificationStatus: true } },
      },
    })
    let filtered = pros
    if (q || cat) {
      const catSlug = canonicalCategoria(cat)
      filtered = pros.filter((p) => {
        const professions = parseJson<string[]>(p.professions, [])
        const skills = parseJson<string[]>(p.skills, [])
        const hay = [professions.join(' '), skills.join(' '), p.bio || '', p.user.displayName, p.companyName || '', p.city || ''].join(' ').toLowerCase()
        const catOk = catSlug ? professions.some((pf) => canonicalCategoria(pf) === catSlug || pf.toLowerCase().includes(catSlug)) : true
        return catOk && (!q || matchTerms(q, hay) || professions.some((pf) => hay.includes(pf)))
      })
    }
    const proResults = withinRadius(
      filtered.map((p) => ({
        id: p.id,
        type: 'profesional' as const,
        displayName: p.user.displayName,
        avatarUrl: p.user.avatarUrl,
        professions: parseJson<string[]>(p.professions, []),
        personType: p.personType,
        companyName: p.companyName,
        bio: p.bio,
        city: p.city || p.user.city,
        rating: p.rating || p.user.rating,
        reviewsCount: p.reviewsCount || p.user.reviewsCount,
        worksCount: p.worksCount,
        verified: p.user.verificationStatus === 'verificado',
        subscription: p.subscription,
        lat: p.lat,
        lng: p.lng,
      })),
      lat, lng, radius
    )

    // ── Trabajos abiertos de la categoría (para mostrar demanda) ──
    const openJobs = await db.jobPost.findMany({
      where: { status: 'abierto', ...(cat ? { categorySlug: cat } : {}) },
      include: { user: { select: { displayName: true } }, bids: { select: { id: true } } },
      orderBy: { createdAt: 'desc' },
      take: 30,
    })
    const jobResults = withinRadius(
      openJobs
        .filter((j) => !q || matchTerms(q, `${j.title} ${j.description} ${j.categorySlug}`.toLowerCase()))
        .map((j) => ({
          id: j.id,
          type: 'trabajo' as const,
          title: j.title,
          description: j.description.slice(0, 160),
          categorySlug: j.categorySlug,
          urgency: j.urgency,
          budgetMin: j.budgetMin,
          budgetMax: j.budgetMax,
          city: j.city,
          bidsCount: j.bids.length,
          lat: j.lat,
          lng: j.lng,
        })),
      lat, lng, radius
    )

    return ok({ professionals: proResults, jobs: jobResults, materials: materialResults, mode })
  }

  // ── Bolsa de trabajos abiertos (modo profesional) ──
  const catFilter = canonicalCategoria(cat)
  const openJobs = await db.jobPost.findMany({
    where: {
      status: 'abierto',
      ...(catFilter ? { categorySlug: catFilter } : {}),
      ...(urgency ? { urgency } : {}),
    },
    include: { user: { select: { displayName: true, city: true } }, bids: { select: { id: true } } },
    orderBy: { createdAt: 'desc' },
    take: 40,
  })
  const jobResults = withinRadius(
    openJobs
      .filter((j) => !q || matchTerms(q, `${j.title} ${j.description} ${j.categorySlug}`.toLowerCase()))
      .map((j) => ({
        id: j.id,
        type: 'trabajo' as const,
        title: j.title,
        description: j.description.slice(0, 160),
        categorySlug: j.categorySlug,
        urgency: j.urgency,
        budgetMin: j.budgetMin,
        budgetMax: j.budgetMax,
        city: j.city || j.user.city,
        clientName: j.user.displayName,
        bidsCount: j.bids.length,
        lat: j.lat,
        lng: j.lng,
      })),
    lat, lng, radius
  )

  return ok({ materials: materialResults, jobs: jobResults, mode })
}
