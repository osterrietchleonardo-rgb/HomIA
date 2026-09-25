import { NextRequest } from 'next/server'
import { ok, fail, parseJson } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { planState, mensajePlanInactivo } from '@/lib/plans'

// ── ANALÍTICA DEL NEGOCIO (exclusiva del Plan PRO) ──
// Qué elementos se están pidiendo más, cuántas consultas hubo sobre el rubro
// del proveedor y qué búsquedas lo encontraron. Solo un plan de pago activo
// (pro) desbloquea esta pantalla; basic y trial ven el resumen con teaser.
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  if (!prov) return fail('Solo los proveedores tienen analítica', 403)

  const state = planState(prov)
  if (!state.activo) {
    return fail(mensajePlanInactivo(state, 'ver la analítica'), 403, { needsPlan: true })
  }
  if (state.plan !== 'pro') {
    return fail('La analítica del negocio es exclusiva del Plan PRO', 403, {
      needsPro: true,
      plan: state.plan,
    })
  }

  const rawDays = parseInt(req.nextUrl.searchParams.get('days') || '30', 10)
  const days = Number.isFinite(rawDays) ? Math.min(365, Math.max(1, rawDays)) : 30
  const since = new Date(Date.now() - days * 86400000)

  // ── 1. Elementos más pedidos (ítems de pedidos del carrito + compras históricas + materiales de obras) ──
  const [itemAgg, purchaseAgg, materialAgg] = await Promise.all([
    db.purchaseItem.groupBy({
      by: ['elementName'],
      where: { purchase: { providerId: prov.id, createdAt: { gte: since }, status: { not: 'cancelado' } } },
      _count: { _all: true },
      _sum: { quantity: true, total: true },
    }),
    // compras anteriores al carrito (un solo ítem, sin PurchaseItem)
    db.purchase.groupBy({
      by: ['elementName'],
      where: { providerId: prov.id, createdAt: { gte: since }, status: { not: 'cancelado' }, items: { none: {} } },
      _count: { _all: true },
      _sum: { quantity: true, total: true },
    }),
    db.projectMaterial.groupBy({
      by: ['name'],
      where: { providerId: prov.id, createdAt: { gte: since }, status: 'aprobado' },
      _count: { _all: true },
      _sum: { quantity: true },
    }),
  ])

  const demand = new Map<string, { name: string; pedidos: number; cantidad: number; ventas: number }>()
  for (const p of [...itemAgg, ...purchaseAgg]) {
    const acc = demand.get(p.elementName) || { name: p.elementName, pedidos: 0, cantidad: 0, ventas: 0 }
    acc.pedidos += p._count._all
    acc.cantidad += p._sum.quantity || 0
    acc.ventas += p._sum.total || 0
    demand.set(p.elementName, acc)
  }
  for (const m of materialAgg) {
    const acc = demand.get(m.name) || { name: m.name, pedidos: 0, cantidad: 0, ventas: 0 }
    acc.pedidos += m._count._all
    acc.cantidad += m._sum.quantity || 0
    demand.set(m.name, acc)
  }
  const topElementos = [...demand.values()].sort((a, b) => b.pedidos - a.pedidos || b.cantidad - a.cantidad).slice(0, 8)

  // ── 2. Consultas sobre MI rubro (búsquedas del marketplace y del buscador) ──
  const myStock = await db.providerStock.findMany({
    where: { providerId: prov.id },
    select: { element: { select: { name: true, aliases: true, category: { select: { slug: true, name: true } } } } },
  })
  const myCategories = [...new Set(myStock.map((s) => s.element.category.slug))]
  const myTerms = [
    ...new Set(
      myStock.flatMap((s) => [s.element.name, ...parseJson<string[]>(s.element.aliases, [])]).filter(Boolean)
    ),
  ].map((t) => t.toLowerCase().trim()).filter((t) => t.length >= 4)

  const events = await db.searchEvent.findMany({
    where: { createdAt: { gte: since }, mode: { in: ['materiales', 'cliente', 'profesional'] } },
    orderBy: { createdAt: 'desc' },
    take: 2000,
    select: { id: true, query: true, results: true, createdAt: true },
  })

  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  let consultasRubro = 0
  let busquedasQueTeEncontraron = 0
  const queriesQueTeEncontraron = new Map<string, { query: string; veces: number; last: Date }>()
  const rubroQueryCount = new Map<string, number>()

  for (const ev of events) {
    const q = norm(ev.query || '')
    let rubroHit = false
    for (const t of myTerms) {
      if (q.includes(norm(t))) { rubroHit = true; break }
    }
    if (!rubroHit) {
      // consultas por categoría del rubro (ej. "ferreteria")
      for (const c of myCategories) {
        if (q.includes(norm(c))) { rubroHit = true; break }
      }
    }
    if (rubroHit) {
      consultasRubro++
      const key = ev.query.toLowerCase().trim()
      rubroQueryCount.set(key, (rubroQueryCount.get(key) || 0) + 1)
    }

    // búsquedas cuyo resultado incluyó mi negocio
    if (ev.results) {
      try {
        const r = parseJson<{ providerIds?: string[] }>(ev.results, {})
        if (r.providerIds?.includes(prov.id)) {
          busquedasQueTeEncontraron++
          const key = ev.query.toLowerCase().trim()
          const prev = queriesQueTeEncontraron.get(key)
          queriesQueTeEncontraron.set(key, { query: ev.query, veces: (prev?.veces || 0) + 1, last: ev.createdAt })
        }
      } catch { /* resultados malformados: ignorar */ }
    }
  }

  const topQueriesRubro = [...rubroQueryCount.entries()]
    .sort((a, b) => b[1] - a[1]).slice(0, 6)
    .map(([query, veces]) => ({ query, veces }))
  const topQueriesTeEncontraron = [...queriesQueTeEncontraron.values()]
    .sort((a, b) => b.veces - a.veces).slice(0, 6)
    .map((q) => ({ query: q.query, veces: q.veces }))

  // ── 3. Resumen de ventas ──
  const [ventas, stockCount, pendientes] = await Promise.all([
    db.purchase.aggregate({
      where: { providerId: prov.id, status: { in: ['entregado', 'pagado'] }, createdAt: { gte: since } },
      _count: { _all: true },
      _sum: { total: true },
    }),
    db.providerStock.count({ where: { providerId: prov.id } }),
    db.purchase.count({ where: { providerId: prov.id, status: { in: ['pendiente_aprobacion', 'esperando_stock', 'aprobado'] } } }),
  ])

  return ok({
    days,
    plan: state,
    negocio: { businessName: prov.businessName, kind: prov.kind },
    topElementos,
    consultasRubro: {
      total: consultasRubro,
      topQueries: topQueriesRubro,
      categories: [...new Set(myStock.map((s) => s.element.category.name))],
    },
    teEncontraron: {
      total: busquedasQueTeEncontraron,
      topQueries: topQueriesTeEncontraron,
    },
    ventas: { pedidos: ventas._count._all, total: ventas._sum.total || 0, pendientes, stockCount },
  })
}
