import { NextRequest } from 'next/server'
import { ok } from '@/lib/api'
import { db } from '@/lib/db'
import { parseJson } from '@/lib/api'
import { withinRadius } from '@/lib/geo'

// Pines para el mapa de búsqueda: profesionales, trabajos y materiales con coords reales
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const mode = sp.get('mode') || 'cliente'
  const q = (sp.get('q') || '').toLowerCase().trim()
  const cat = sp.get('cat') || ''
  const lat = sp.get('lat') ? parseFloat(sp.get('lat')!) : null
  const lng = sp.get('lng') ? parseFloat(sp.get('lng')!) : null
  const radius = sp.get('radius') ? parseFloat(sp.get('radius')!) : 25

  type Pin = {
    id: string; lat: number; lng: number; label: string; sub?: string
    kind: 'profesional' | 'trabajo' | 'material'; href?: string; price?: string
  }

  const pins: Pin[] = []

  if (mode === 'cliente') {
    const pros = await db.professionalProfile.findMany({
      where: { lat: { not: null }, lng: { not: null } },
      include: { user: { select: { displayName: true, city: true } } },
    })
    const filtered = pros.filter((p) => {
      const professions = parseJson<string[]>(p.professions, [])
      if (cat && !professions.includes(cat)) return false
      if (!q) return true
      const hay = [professions.join(' '), parseJson<string[]>(p.skills, []).join(' '), p.bio || '', p.user.displayName, p.companyName || ''].join(' ').toLowerCase()
      return hay.includes(q) || professions.some((pf) => hay.includes(pf))
    })
    const geo = withinRadius(filtered, lat, lng, radius)
    for (const p of geo.slice(0, 40)) {
      pins.push({
        id: p.id, lat: p.lat!, lng: p.lng!,
        label: p.companyName || p.user.displayName,
        sub: professionsLabel(p.professions),
        kind: 'profesional',
        href: `/profesional/${p.id}`,
      })
    }
  } else {
    // materiales (pines en proveedores)
    const stock = await db.providerStock.findMany({
      include: {
        element: { include: { category: true } },
        provider: { include: { user: { select: { city: true } } } },
      },
      take: 500,
    })
    let matched = stock
    if (q) {
      matched = stock.filter((s) => {
        const hay = [s.element.name, ...parseJson<string[]>(s.element.aliases, []), s.brand || '', s.provider.businessName].join(' ').toLowerCase()
        return hay.includes(q) || q.split(/\s+/).some((t) => t && hay.includes(t))
      })
    }
    if (cat) matched = matched.filter((s) => s.element.category.slug === cat)
    // withinRadius filtra por lat/lng a NIVEL RAÍZ: las coords del stock viven
    // en s.provider — las subimos antes de filtrar (si no, el radio no filtra nada).
    const geo = withinRadius(
      matched
        .filter((s) => s.provider.lat != null && s.provider.lng != null)
        .map((s) => ({ ...s, lat: s.provider.lat as number, lng: s.provider.lng as number })),
      lat, lng, radius
    )
    for (const s of geo.slice(0, 40)) {
      pins.push({
        id: s.id, lat: s.lat, lng: s.lng,
        label: s.element.name,
        sub: s.provider.businessName,
        kind: 'material',
        price: `$${s.price >= 1000 ? Math.round(s.price / 1000) + 'k' : s.price}`,
        href: `/proveedor/${s.provider.id}`,
      })
    }
  }

  // trabajos siempre visibles en el mapa
  const jobs = await db.jobPost.findMany({
    where: { status: 'abierto', lat: { not: null }, lng: { not: null }, ...(cat ? { categorySlug: cat } : {}) },
    include: { user: { select: { city: true } } },
    take: 100,
  })
  const jobsFiltered = jobs.filter((j) => !q || `${j.title} ${j.description}`.toLowerCase().includes(q))
  const jobsGeo = withinRadius(jobsFiltered, lat, lng, radius)
  for (const j of jobsGeo.slice(0, 30)) {
    pins.push({
      id: j.id, lat: j.lat!, lng: j.lng!,
      label: j.title,
      sub: j.city || j.user.city || undefined,
      kind: 'trabajo',
      href: `/trabajo/${j.id}`,
    })
  }

  return ok({ pins })
}

function professionsLabel(json: string): string {
  try {
    const arr = JSON.parse(json) as string[]
    return arr.join(' · ')
  } catch {
    return 'Profesional'
  }
}
