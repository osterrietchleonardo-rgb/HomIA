import { NextRequest } from 'next/server'
import { ok } from '@/lib/api'
import { db } from '@/lib/db'
import { parseJson } from '@/lib/api'
import { withinRadius } from '@/lib/geo'

// Comparables de materiales: mismo elemento entre todos los proveedores, ordenado por precio
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const elementId = sp.get('elementId')
  const q = (sp.get('q') || '').trim().toLowerCase()
  const lat = sp.get('lat') ? parseFloat(sp.get('lat')!) : null
  const lng = sp.get('lng') ? parseFloat(sp.get('lng')!) : null
  const radius = sp.get('radius') ? parseFloat(sp.get('radius')!) : 50

  const where = elementId ? { elementId } : {}
  const stock = await db.providerStock.findMany({
    where,
    include: {
      element: true,
      provider: { include: { user: { select: { displayName: true, city: true } } } },
    },
    orderBy: { price: 'asc' },
  })

  let matched = stock
  if (!elementId && q) {
    matched = stock.filter((s) => {
      const hay = [s.element.name, ...parseJson<string[]>(s.element.aliases, []), s.brand || ''].join(' ').toLowerCase()
      return hay.includes(q) || q.split(/\s+/).some((t) => t && hay.includes(t))
    })
  }

  const results = withinRadius(
    matched.map((s) => ({
      stockId: s.id,
      elementId: s.elementId,
      elementName: s.element.name,
      unit: s.element.unit,
      brand: s.brand,
      price: s.price,
      quantity: s.quantity,
      status: s.status,
      providerId: s.provider.id,
      providerName: s.provider.businessName,
      providerCity: s.provider.city || s.provider.user.city,
      providerRating: s.provider.rating,
      providerVerified: s.provider.verified,
      lat: s.provider.lat,
      lng: s.provider.lng,
    })),
    lat, lng, radius
  )

  const best = results[0] || null
  const avg = results.length ? results.reduce((a, r) => a + r.price, 0) / results.length : 0

  return ok({ results, best, averagePrice: Math.round(avg * 100) / 100, count: results.length })
}
