import { NextRequest } from 'next/server'
import { ok } from '@/lib/api'
import { db } from '@/lib/db'
import { parseJson } from '@/lib/api'
import { withinRadius, type WithGeo } from '@/lib/geo'

// Búsqueda dual HomIA
// mode=cliente    → profesionales (por profesión/habilidades) + trabajos abiertos de la categoría
// mode=profesional→ stock de materiales en proveedores + bolsa de trabajos ("¿qué hay para plomeros?")
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const mode = sp.get('mode') || 'cliente'
  const q = (sp.get('q') || '').trim().toLowerCase()
  const cat = sp.get('cat') || ''
  const lat = sp.get('lat') ? parseFloat(sp.get('lat')!) : null
  const lng = sp.get('lng') ? parseFloat(sp.get('lng')!) : null
  const radius = sp.get('radius') ? parseFloat(sp.get('radius')!) : 25
  const urgency = sp.get('urgency') || ''

  if (mode === 'cliente') {
    // ── Profesionales ──
    const pros = await db.professionalProfile.findMany({
      include: {
        user: { select: { id: true, displayName: true, avatarUrl: true, rating: true, reviewsCount: true, city: true } },
      },
    })
    let filtered = pros
    if (q || cat) {
      filtered = pros.filter((p) => {
        const professions = parseJson<string[]>(p.professions, [])
        const skills = parseJson<string[]>(p.skills, [])
        const hay = [professions.join(' '), skills.join(' '), p.bio || '', p.user.displayName, p.companyName || '', p.city || ''].join(' ').toLowerCase()
        const catOk = cat ? professions.includes(cat) : true
        return catOk && (!q || hay.includes(q) || professions.some((pf) => pf.includes(q) || q.includes(pf)))
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
        verified: p.verified,
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
        .filter((j) => !q || `${j.title} ${j.description}`.toLowerCase().includes(q))
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

    return ok({ professionals: proResults, jobs: jobResults, mode })
  }

  // ── mode=profesional: materiales en proveedores ──
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

  let matched = stock
  if (q) {
    const terms = q.split(/\s+/).filter(Boolean)
    matched = stock.filter((s) => {
      const hay = [s.element.name, ...parseJson<string[]>(s.element.aliases, []), s.brand || '', s.provider.businessName].join(' ').toLowerCase()
      return terms.some((t) => hay.includes(t)) || hay.includes(q)
    })
  }
  if (cat) matched = matched.filter((s) => s.element.category.slug === cat)

  const materialResults = withinRadius(
    matched.map((s) => ({
      id: s.id,
      type: 'material' as const,
      elementId: s.elementId,
      name: s.element.name,
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
      lat: s.provider.lat,
      lng: s.provider.lng,
    })),
    lat, lng, radius
  )

  // ── Bolsa de trabajos abiertos ──
  const openJobs = await db.jobPost.findMany({
    where: {
      status: 'abierto',
      ...(cat ? { categorySlug: cat } : {}),
      ...(urgency ? { urgency } : {}),
    },
    include: { user: { select: { displayName: true, city: true } }, bids: { select: { id: true } } },
    orderBy: { createdAt: 'desc' },
    take: 40,
  })
  const jobResults = withinRadius(
    openJobs
      .filter((j) => !q || `${j.title} ${j.description} ${j.categorySlug}`.toLowerCase().includes(q))
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
