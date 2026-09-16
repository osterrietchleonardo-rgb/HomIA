'use client'
// Buscador de materiales + comparables de precios entre proveedores
import { useEffect, useMemo, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatusBadge, Loading, EmptyState } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { formatDistance } from '@/lib/geo'
import { useLocation } from '@/lib/store'
import { MapPin, Compass, Trophy, ExternalLink } from 'lucide-react'

const CATEGORIES = [
  { slug: 'plomeria', name: 'Plomería' },
  { slug: 'gasistas', name: 'Gasistas' },
  { slug: 'electricistas', name: 'Electricistas' },
  { slug: 'albanileria', name: 'Albañilería' },
  { slug: 'pintura', name: 'Pintura' },
  { slug: 'carpinteria', name: 'Carpintería' },
  { slug: 'herreria', name: 'Herrería' },
  { slug: 'limpieza', name: 'Limpieza' },
  { slug: 'jardineria', name: 'Jardinería' },
  { slug: 'climatizacion', name: 'Climatización' },
  { slug: 'techos', name: 'Techos' },
  { slug: 'cerramientos', name: 'Cerramientos' },
]

type SearchMaterial = {
  id: string; name: string; category: string; unit: string; brand: string | null
  price: number; quantity: number; status: string; providerName: string
  providerCity: string | null; distanceKm?: number
}
type Comparable = {
  stockId: string; elementId: string; elementName: string; unit: string; brand: string | null
  price: number; quantity: number; status: string; providerId: string; providerName: string
  providerCity: string | null; providerRating: number; providerVerified: boolean; distanceKm?: number
}

export default function ProMaterials() {
  const location = useLocation()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [materials, setMaterials] = useState<SearchMaterial[]>([])
  const [comparables, setComparables] = useState<Comparable[]>([])
  const [averagePrice, setAveragePrice] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingCmp, setLoadingCmp] = useState(true)

  // Materiales en stock de proveedores
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ mode: 'profesional', q, cat })
        if (location.lat && location.lng) {
          params.set('lat', String(location.lat))
          params.set('lng', String(location.lng))
        }
        const res = await fetch(`/api/search?${params}`)
        if (res.ok) setMaterials((await res.json()).materials || [])
      } finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q, cat, location.lat, location.lng])

  // Comparables: mismo elemento en todos los proveedores
  useEffect(() => {
    const t = setTimeout(async () => {
      setLoadingCmp(true)
      try {
        const params = new URLSearchParams({ q })
        if (location.lat && location.lng) {
          params.set('lat', String(location.lat))
          params.set('lng', String(location.lng))
        }
        const res = await fetch(`/api/comparables?${params}`)
        if (res.ok) {
          const data = await res.json()
          setComparables(data.results || [])
          setAveragePrice(data.averagePrice || 0)
        }
      } finally { setLoadingCmp(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q, location.lat, location.lng])

  // Mejor precio por elemento (agrupa por elemento y se queda con el más barato)
  const bestPerElement = useMemo(() => {
    const map = new Map<string, Comparable>()
    for (const r of comparables) {
      const cur = map.get(r.elementId)
      if (!cur || r.price < cur.price) map.set(r.elementId, r)
    }
    return [...map.values()].sort((a, b) => a.price - b.price)
  }, [comparables])

  const cheapestStockId = bestPerElement[0]?.stockId

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Materiales y precios"
        subtitle="Stock en proveedores de tu zona + comparables para no pagar de más"
        right={
          <button onClick={() => navigate('/buscar?mode=profesional')}
            className="rounded-xl border-2 border-[#1D63B8] text-[#1D63B8] hover:bg-[#1D63B8] hover:text-white font-bold px-4 py-2.5 text-sm flex items-center gap-2 transition">
            <Compass className="size-4" /> Ir a la búsqueda completa con mapa
          </button>
        }
      />

      {/* Filtros */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm mb-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar material: caño, cemento, cable…"
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-[#1D63B8] focus:ring-2 focus:ring-[#1D63B8]/20"
            aria-label="Buscar materiales"
          />
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría"
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#1D63B8] cursor-pointer">
            <option value="">Todas las categorías</option>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        {!location.shared && (
          <button onClick={() => location.request()} className="mt-3 text-xs font-bold text-[#1D63B8] hover:underline">
            📍 Compartir ubicación para ver distancias y ordenar por cercanía
          </button>
        )}
      </div>

      {/* Stock de proveedores */}
      <section className="mb-8">
        <h2 className="font-extrabold text-[#0A2540] mb-3">Stock en proveedores {materials.length > 0 && <span className="text-sm font-semibold text-slate-400">({materials.length})</span>}</h2>
        {loading ? (
          <Loading text="Buscando materiales…" />
        ) : materials.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-6">
            <EmptyState icon="📦" title="Sin resultados de stock"
              hint="Probá con otro término (buscamos también por alias: 'caño' encuentra 'tubo') o cambiá la categoría." />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {materials.map((m) => (
              <div key={m.id} className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm hover:shadow-md transition">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-[#0A2540] leading-snug">{m.name}</p>
                  <StatusBadge status={m.status} />
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{m.category}{m.brand ? ` · ${m.brand}` : ''}</p>
                <p className="mt-2 text-xl font-extrabold text-emerald-600">
                  {formatARS(m.price)}<span className="text-xs font-semibold text-slate-400"> /{m.unit}</span>
                </p>
                <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                  <span className="truncate">🏪 {m.providerName}{m.providerCity ? ` · ${m.providerCity}` : ''}</span>
                  <span className="shrink-0">stock: {m.quantity}</span>
                </div>
                {(m.distanceKm !== undefined || !location.shared) && (
                  <p className="text-xs text-slate-400 mt-0.5 flex items-center gap-1">
                    <MapPin className="size-3.5" /> {m.distanceKm !== undefined ? formatDistance(m.distanceKm) : 'compartí ubicación para distancia'}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Comparables */}
      <section>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <h2 className="font-extrabold text-[#0A2540] flex items-center gap-2">
            <Trophy className="size-5 text-[#FFC700]" /> Comparables: mejor precio por elemento
          </h2>
          {bestPerElement.length > 0 && (
            <p className="text-xs text-slate-400">
              {bestPerElement.length} elemento{bestPerElement.length === 1 ? '' : 's'} · promedio general {formatARS(averagePrice)}
            </p>
          )}
        </div>
        {loadingCmp ? (
          <Loading text="Comparando precios entre proveedores…" />
        ) : bestPerElement.length === 0 ? (
          <div className="rounded-2xl bg-white border border-slate-200 p-6">
            <EmptyState icon="⚖️" title="Nada para comparar todavía"
              hint="Cuando haya stock cargado en dos o más proveedores, acá ves el mejor precio por elemento." />
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bestPerElement.map((c) => (
              <div key={c.stockId}
                className={`rounded-2xl bg-white p-4 shadow-sm border-2 transition ${c.stockId === cheapestStockId ? 'border-emerald-500 ring-2 ring-emerald-500/20' : 'border-slate-200'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-[#0A2540] leading-snug">{c.elementName}</p>
                  {c.stockId === cheapestStockId && (
                    <span className="rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-extrabold uppercase px-2 py-0.5 shrink-0">Mejor precio</span>
                  )}
                </div>
                {c.brand && <p className="text-xs text-slate-400 mt-0.5">{c.brand}</p>}
                <p className="mt-2 text-xl font-extrabold text-emerald-600">
                  {formatARS(c.price)}<span className="text-xs font-semibold text-slate-400"> /{c.unit}</span>
                </p>
                <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
                  <span className="truncate">🏪 {c.providerName}{c.providerCity ? ` · ${c.providerCity}` : ''}</span>
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {c.distanceKm !== undefined ? formatDistance(c.distanceKm) : (c.providerCity || 'distancia no disponible')}
                  {' · '}stock: {c.quantity}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-6 text-xs text-slate-400 flex items-center gap-1.5">
        <ExternalLink className="size-3.5" /> ¿Querés ver pines en el mapa? La búsqueda completa tiene mapa con radio ajustable.
      </p>
    </div>
  )
}
