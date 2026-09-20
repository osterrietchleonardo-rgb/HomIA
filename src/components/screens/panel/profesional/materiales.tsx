'use client'
// Buscador de materiales + comparables de precios entre proveedores
import { useEffect, useMemo, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, Loading } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { formatDistance } from '@/lib/geo'
import { useLocation } from '@/lib/store'
import { MapPin, Compass, Trophy, ExternalLink, Package, Scale, Store, Search, TrendingDown } from 'lucide-react'

const CATEGORIES = [
  { slug: '', name: 'Todas las categorías' },
  { slug: 'plomeria', name: 'Plomería' },
  { slug: 'gasistas', name: 'Gas' },
  { slug: 'electricistas', name: 'Electricidad' },
  { slug: 'albanileria', name: 'Albañilería' },
  { slug: 'durlock', name: 'Durlock' },
  { slug: 'pintura', name: 'Pintura' },
  { slug: 'herreria', name: 'Ferretería' },
  { slug: 'herramientas', name: 'Herramientas' },
  { slug: 'maderera', name: 'Maderera' },
  { slug: 'carpinteria', name: 'Carpintería' },
  { slug: 'techos', name: 'Techos' },
  { slug: 'cerramientos', name: 'Aberturas' },
  { slug: 'pisos', name: 'Pisos' },
  { slug: 'aislacion', name: 'Aislación' },
  { slug: 'iluminacion', name: 'Iluminación' },
  { slug: 'climatizacion', name: 'Climatización' },
  { slug: 'jardineria', name: 'Jardín' },
  { slug: 'limpieza', name: 'Limpieza' },
  { slug: 'muebles', name: 'Muebles' },
  { slug: 'seguridad', name: 'Seguridad' },
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
    <div className="homy-page">
      {/* Encabezado */}
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Abastecimiento inteligente</span>
          <h1 className="homy-page-title mt-1.5">Materiales y precios</h1>
          <p className="homy-page-sub">Stock en proveedores de tu zona + comparables para no pagar de más.</p>
        </div>
        <button onClick={() => navigate('/buscar?mode=profesional')} className="homy-btn-dark min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
          <Compass className="size-4" /> Búsqueda con mapa
        </button>
      </header>

      {/* Filtros */}
      <div className="homy-glass rounded-3xl p-4 sm:p-5 mb-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" aria-hidden />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar material: caño, cemento, cable…"
              className="homy-glass-input w-full rounded-xl pl-11 pr-4 py-2.5 text-sm"
              aria-label="Buscar materiales"
            />
          </div>
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría"
            className="homy-glass-input rounded-xl px-3 py-2.5 text-sm font-semibold cursor-pointer sm:min-w-[190px]">
            <option value="">Todas las categorías</option>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
        </div>
        {!location.shared && (
          <button onClick={() => location.request()} className="mt-3.5 flex items-center gap-1.5 text-xs font-bold text-[#1D63B8] hover:underline">
            <MapPin className="size-3.5 shrink-0" aria-hidden />
            Compartir ubicación para ver distancias y ordenar por cercanía
          </button>
        )}
      </div>

      {/* Stock de proveedores */}
      <section className="mb-9">
        <div className="homy-section-head">
          <h2 className="homy-section-title">
            <span className="homy-icon-chip homy-chip-blue size-7 [&_svg]:size-3.5" aria-hidden><Package /></span>
            Stock en proveedores
          </h2>
          {materials.length > 0 && (
            <span className="homy-glass-soft rounded-full px-2.5 py-0.5 text-xs font-bold text-slate-500 tabular-nums">
              {materials.length} resultado{materials.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {loading ? (
          <Loading text="Buscando materiales…" />
        ) : materials.length === 0 ? (
          <Empty
            icon={<Package className="size-7" />}
            title="Sin resultados de stock"
            hint="Probá con otro término (buscamos también por alias: 'caño' encuentra 'tubo') o cambiá la categoría."
          />
        ) : (
          <div className="homy-stagger grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {materials.map((m) => (
              <div key={m.id} className="homy-glass homy-lift homy-card-glow rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-[#0A2540] leading-snug">{m.name}</p>
                  <StatusBadge status={m.status} />
                </div>
                <p className="text-xs text-slate-400 mt-0.5">{m.category}{m.brand ? ` · ${m.brand}` : ''}</p>
                <p className="mt-2 text-xl font-extrabold text-emerald-600 tabular-nums">
                  {formatARS(m.price)}<span className="text-xs font-semibold text-slate-400"> /{m.unit}</span>
                </p>
                <div className="flex items-center justify-between gap-2 mt-2.5 text-xs text-slate-400">
                  <span className="homy-glass-soft rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 font-semibold min-w-0">
                    <Store className="size-3.5 shrink-0" aria-hidden />
                    <span className="line-clamp-1">{m.providerName}</span>
                  </span>
                  <span className="shrink-0 tabular-nums">stock: {m.quantity}</span>
                </div>
                {(m.distanceKm !== undefined || m.providerCity) && (
                  <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                    <MapPin className="size-3.5 shrink-0" aria-hidden />
                    {m.distanceKm !== undefined ? formatDistance(m.distanceKm) : m.providerCity}
                  </p>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Comparables */}
      <section>
        <div className="homy-section-head">
          <h2 className="homy-section-title">
            <span className="homy-icon-chip homy-chip-gold size-7 [&_svg]:size-3.5" aria-hidden><Trophy /></span>
            Comparables: mejor precio por elemento
          </h2>
          {bestPerElement.length > 0 && (
            <p className="text-xs text-slate-400 tabular-nums hidden sm:flex items-center gap-1.5">
              <TrendingDown className="size-3.5 shrink-0" aria-hidden />
              {bestPerElement.length} elemento{bestPerElement.length === 1 ? '' : 's'} · promedio general {formatARS(averagePrice)}
            </p>
          )}
        </div>
        {loadingCmp ? (
          <Loading text="Comparando precios entre proveedores…" />
        ) : bestPerElement.length === 0 ? (
          <Empty
            icon={<Scale className="size-7" />}
            title="Nada para comparar todavía"
            hint="Cuando haya stock cargado en dos o más proveedores, acá ves el mejor precio por elemento."
          />
        ) : (
          <div className="homy-stagger grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {bestPerElement.map((c) => (
              <div key={c.stockId}
                className={`homy-glass homy-lift homy-card-glow rounded-2xl p-4 ${c.stockId === cheapestStockId ? 'outline-2 outline-offset-2 outline-emerald-500/60' : ''}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-[#0A2540] leading-snug">{c.elementName}</p>
                  {c.stockId === cheapestStockId && (
                    <span className="homy-pill shrink-0"><span className="homy-pill-dot bg-emerald-500" aria-hidden />Mejor precio</span>
                  )}
                </div>
                {c.brand && <p className="text-xs text-slate-400 mt-0.5">{c.brand}</p>}
                <p className="mt-2 text-xl font-extrabold text-emerald-600 tabular-nums">
                  {formatARS(c.price)}<span className="text-xs font-semibold text-slate-400"> /{c.unit}</span>
                </p>
                <div className="flex items-center justify-between gap-2 mt-2.5 text-xs text-slate-400">
                  <span className="homy-glass-soft rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 font-semibold min-w-0">
                    <Store className="size-3.5 shrink-0" aria-hidden />
                    <span className="line-clamp-1">{c.providerName}</span>
                  </span>
                  <StatusBadge status={c.status} />
                </div>
                <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                  <MapPin className="size-3.5 shrink-0" aria-hidden />
                  {c.distanceKm !== undefined ? formatDistance(c.distanceKm) : (c.providerCity || 'distancia no disponible')}
                  {' · '}stock: {c.quantity}
                </p>
              </div>
            ))}
          </div>
        )}
      </section>

      <p className="mt-7 text-xs text-slate-400 flex items-center gap-1.5">
        <ExternalLink className="size-3.5 shrink-0" aria-hidden /> ¿Querés ver pines en el mapa? La búsqueda completa tiene mapa con radio ajustable.
      </p>
    </div>
  )
}

/* Estado vacío diseñado: icono flotante + copy claro */
function Empty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
      <span className="homy-empty-icon homy-chip-blue" aria-hidden>{icon}</span>
      <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">{title}</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{hint}</p>
    </div>
  )
}
