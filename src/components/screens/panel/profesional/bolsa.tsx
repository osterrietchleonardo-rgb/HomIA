'use client'
// Bolsa de trabajos para profesionales: "¿qué hay para plomeros hoy?"
import { useEffect, useMemo, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, UrgencyBadge, StatusBadge, Loading, EmptyState } from '@/components/app/ui-bits'
import { formatARS, URGENCY_LABEL } from '@/lib/format'
import { formatDistance } from '@/lib/geo'
import { useLocation } from '@/lib/store'
import { ChevronDown, MapPin, Boxes } from 'lucide-react'

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

type SearchJob = {
  id: string; title: string; description: string; categorySlug: string; urgency: string
  budgetMin: number | null; budgetMax: number | null; city: string | null
  clientName: string; bidsCount: number; distanceKm?: number
}
type SearchMaterial = {
  id: string; name: string; unit: string; brand: string | null; price: number; quantity: number
  status: string; providerName: string; providerCity: string | null; distanceKm?: number
}

export default function ProJobsBoard() {
  const location = useLocation()
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [urgency, setUrgency] = useState('')
  const [radius, setRadius] = useState(25)
  const [jobs, setJobs] = useState<SearchJob[]>([])
  const [materials, setMaterials] = useState<SearchMaterial[]>([])
  const [loading, setLoading] = useState(true)
  const [showMaterials, setShowMaterials] = useState(false)

  useEffect(() => {
    const t = setTimeout(async () => {
      setLoading(true)
      try {
        const params = new URLSearchParams({ mode: 'profesional', q, cat, urgency, radius: String(radius) })
        if (location.lat && location.lng) {
          params.set('lat', String(location.lat))
          params.set('lng', String(location.lng))
        }
        const res = await fetch(`/api/search?${params}`)
        if (res.ok) {
          const data = await res.json()
          setJobs(data.jobs || [])
          setMaterials(data.materials || [])
        }
      } finally { setLoading(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [q, cat, urgency, radius, location.lat, location.lng])

  const jobsWithDistance = useMemo(
    () => [...jobs].sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999)),
    [jobs]
  )

  return (
    <div className="max-w-4xl">
      <PageHeader title="Bolsa de trabajos" subtitle="Publicaciones abiertas de clientes buscando profesionales como vos" />

      {/* Filtros */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm mb-5">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <input
            value={q} onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar: plomero, instalación eléctrica, pintura…"
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm outline-none focus:border-[#1D63B8] focus:ring-2 focus:ring-[#1D63B8]/20"
            aria-label="Buscar trabajos"
          />
          <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Categoría"
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#1D63B8] cursor-pointer">
            <option value="">Todas las categorías</option>
            {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
          </select>
          <select value={urgency} onChange={(e) => setUrgency(e.target.value)} aria-label="Urgencia"
            className="rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold outline-none focus:border-[#1D63B8] cursor-pointer">
            <option value="">Cualquier urgencia</option>
            {Object.entries(URGENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </div>
        <div className="flex items-center gap-3 mt-3">
          <label className="text-xs font-semibold text-slate-500 uppercase shrink-0">Radio: {radius} km</label>
          <input type="range" min={1} max={100} value={radius} onChange={(e) => setRadius(parseInt(e.target.value))}
            className="w-full max-w-[220px] accent-[#00C4FF]" aria-label="Radio de búsqueda en kilómetros" />
          {!location.shared && (
            <button onClick={() => location.request()} className="text-xs font-bold text-[#1D63B8] hover:underline">
              📍 Compartir ubicación para ordenar por distancia
            </button>
          )}
        </div>
      </div>

      {/* Lista de trabajos */}
      {loading ? (
        <Loading />
      ) : jobsWithDistance.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-6">
          <EmptyState icon="🧰" title="No encontramos trabajos con esos filtros"
            hint="Probá ampliar el radio, quitar la urgencia o buscar por otra categoría."
            action={
              <button onClick={() => { setQ(''); setCat(''); setUrgency(''); setRadius(100) }} className="rounded-xl bg-[#FF5A1F] text-white font-bold px-5 py-2.5">
                Limpiar filtros
              </button>
            } />
        </div>
      ) : (
        <div className="space-y-3">
          {jobsWithDistance.map((j) => (
            <div key={j.id} className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm hover:shadow-md transition">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <UrgencyBadge urgency={j.urgency} />
                    <span className="text-xs font-semibold uppercase text-[#1D63B8]">{j.categorySlug}</span>
                  </div>
                  <h3 className="font-extrabold text-[#0A2540] leading-snug">{j.title}</h3>
                  <p className="text-sm text-slate-500 mt-0.5 line-clamp-2">{j.description}</p>
                </div>
                <button onClick={() => navigate(`/trabajo/${j.id}`)}
                  className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white text-sm font-bold px-4 py-2.5 transition shrink-0">
                  Ver y presupuestar
                </button>
              </div>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-3 text-xs text-slate-400">
                <span className="font-semibold text-[#0A2540]">
                  {j.budgetMin ? `${formatARS(j.budgetMin)}${j.budgetMax ? ` – ${formatARS(j.budgetMax)}` : '+'}` : 'A presupuesto'}
                </span>
                <span>{j.bidsCount} presupuesto{j.bidsCount === 1 ? '' : 's'}</span>
                <span className="flex items-center gap-1">
                  <MapPin className="size-3.5" />
                  {j.city || '—'}{j.distanceKm !== undefined ? ` · ${formatDistance(j.distanceKm)}` : ''}
                </span>
                {j.clientName && <span>Cliente: {j.clientName}</span>}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Materiales en proveedores (colapsable) */}
      <div className="mt-8">
        <button onClick={() => setShowMaterials(!showMaterials)}
          className="w-full flex items-center justify-between rounded-2xl bg-white border border-slate-200 px-5 py-4 shadow-sm hover:shadow-md transition"
          aria-expanded={showMaterials}>
          <span className="flex items-center gap-2 font-extrabold text-[#0A2540]">
            <Boxes className="size-5 text-[#1D63B8]" />
            Materiales en proveedores {materials.length > 0 && <span className="text-sm font-semibold text-slate-400">({materials.length})</span>}
          </span>
          <ChevronDown className={`size-5 text-slate-400 transition-transform ${showMaterials ? 'rotate-180' : ''}`} />
        </button>
        {showMaterials && (
          materials.length === 0 ? (
            <div className="rounded-2xl bg-white border border-slate-200 p-6 mt-3 text-sm text-slate-500 text-center">
              No hay stock cargado en proveedores para esta búsqueda.
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
              {materials.slice(0, 6).map((m) => (
                <div key={m.id} className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-[#0A2540] text-sm leading-snug">{m.name}</p>
                    <StatusBadge status={m.status} />
                  </div>
                  {m.brand && <p className="text-xs text-slate-400 mt-0.5">{m.brand}</p>}
                  <p className="mt-2 text-lg font-extrabold text-emerald-600">
                    {formatARS(m.price)}<span className="text-xs font-semibold text-slate-400"> /{m.unit}</span>
                  </p>
                  <p className="text-xs text-slate-400 mt-1.5 truncate">
                    🏪 {m.providerName}{m.providerCity ? ` · ${m.providerCity}` : ''}{m.distanceKm !== undefined ? ` · ${formatDistance(m.distanceKm)}` : ''}
                  </p>
                  <p className="text-xs text-slate-400">stock: {m.quantity}</p>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  )
}
