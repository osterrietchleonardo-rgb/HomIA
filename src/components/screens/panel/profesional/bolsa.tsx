'use client'
// Bolsa de trabajos para profesionales: "¿qué hay para plomeros hoy?"
import { useEffect, useMemo, useState } from 'react'
import { navigate } from '@/lib/router'
import { UrgencyBadge, StatusBadge, Loading } from '@/components/app/ui-bits'
import { formatARS, URGENCY_LABEL } from '@/lib/format'
import { formatDistance } from '@/lib/geo'
import { useLocation } from '@/lib/store'
import { ChevronDown, MapPin, Boxes, Store, BriefcaseBusiness, Search, Wallet } from 'lucide-react'

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
    <div className="homy-page">
      <div>
        {/* Encabezado */}
        <header className="homy-page-head">
          <div className="min-w-0">
            <span className="homy-eyebrow">Nuevas oportunidades</span>
            <h1 className="homy-page-title mt-1.5">Bolsa de trabajos</h1>
            <p className="homy-page-sub">Publicaciones abiertas de clientes buscando profesionales como vos.</p>
          </div>
        </header>

        {/* Filtros */}
        <div className="homy-glass rounded-3xl p-4 sm:p-5 mb-5">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" aria-hidden />
            <input
              value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar: plomero, instalación eléctrica, pintura…"
              className="homy-glass-input w-full rounded-xl pl-11 pr-4 py-2.5 text-sm"
              aria-label="Buscar trabajos"
            />
          </div>

          {/* Oficios */}
          <div className="mt-3.5 overflow-x-auto no-scrollbar -mx-1 px-1">
            <div className="flex gap-2 min-w-max sm:flex-wrap sm:min-w-0 sm:mx-0 sm:px-0 pb-1">
              <button onClick={() => setCat('')} aria-pressed={cat === ''} className="homy-tab">Todos los oficios</button>
              {CATEGORIES.map((c) => (
                <button key={c.slug} onClick={() => setCat(c.slug)} aria-pressed={cat === c.slug} className="homy-tab">
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-x-4 gap-y-2.5 mt-3.5">
            <label className="flex items-center gap-2 shrink-0">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Urgencia</span>
              <select value={urgency} onChange={(e) => setUrgency(e.target.value)} aria-label="Urgencia"
                className="homy-glass-input rounded-xl px-3 py-2 text-sm font-semibold cursor-pointer">
                <option value="">Cualquiera</option>
                {Object.entries(URGENCY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </label>
            <label className="flex items-center gap-2.5 min-w-[220px] flex-1 sm:flex-none">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide shrink-0">Radio: {radius} km</span>
              <input type="range" min={1} max={100} value={radius} onChange={(e) => setRadius(parseInt(e.target.value))}
                className="homy-range w-full max-w-[180px]" style={{ '--range-progress': `${radius}%` } as React.CSSProperties}
                aria-label="Radio de búsqueda en kilómetros" />
            </label>
            {!location.shared && (
              <button onClick={() => location.request()} className="flex items-center gap-1.5 text-xs font-bold text-[#1D63B8] hover:underline">
                <MapPin className="size-3.5 shrink-0" aria-hidden />
                Compartir ubicación para ordenar por distancia
              </button>
            )}
          </div>
        </div>

        {/* Lista de trabajos */}
        {loading ? (
          <Loading text="Buscando trabajos…" />
        ) : jobsWithDistance.length === 0 ? (
          <Empty
            icon={<BriefcaseBusiness className="size-7" />}
            title="No encontramos trabajos con esos filtros"
            hint="Probá ampliar el radio, quitar la urgencia o buscar por otra categoría."
            action={
              <button onClick={() => { setQ(''); setCat(''); setUrgency(''); setRadius(100) }} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm">
                Limpiar filtros
              </button>
            }
          />
        ) : (
          <div className="homy-stagger space-y-3">
            {jobsWithDistance.map((j) => {
              const catName = CATEGORIES.find((c) => c.slug === j.categorySlug)?.name || j.categorySlug
              return (
                <article key={j.id} className="homy-glass homy-lift homy-card-glow rounded-3xl p-4 sm:p-5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1.5">
                        <UrgencyBadge urgency={j.urgency} />
                        <span className="homy-pill"><span className="homy-pill-dot bg-[#1D63B8]" aria-hidden />{catName}</span>
                      </div>
                      <h3 className="font-extrabold text-[#0A2540] leading-snug tracking-tight line-clamp-2">{j.title}</h3>
                      <p className="text-sm text-slate-500 mt-1 line-clamp-2 leading-relaxed">{j.description}</p>
                    </div>
                    <button onClick={() => navigate(`/trabajo/${j.id}`)} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm shrink-0">
                      Ofertar
                    </button>
                  </div>
                  <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2 mt-4 pt-3.5 border-t border-[#0A2540]/6">
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-400">
                      <span className="tabular-nums">{j.bidsCount} presupuesto{j.bidsCount === 1 ? '' : 's'}</span>
                      <span className="flex items-center gap-1">
                        <MapPin className="size-3.5" aria-hidden />
                        {j.city || '—'}{j.distanceKm !== undefined ? ` · ${formatDistance(j.distanceKm)}` : ''}
                      </span>
                      {j.clientName && <span>Cliente: {j.clientName}</span>}
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em] flex items-center justify-end gap-1">
                        <Wallet className="size-3" aria-hidden /> Presupuesto
                      </p>
                      <p className="text-base font-extrabold text-[#0A2540] tabular-nums leading-tight">
                        {j.budgetMin ? `${formatARS(j.budgetMin)}${j.budgetMax ? ` – ${formatARS(j.budgetMax)}` : '+'}` : 'A presupuesto'}
                      </p>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        )}

        {/* Materiales en proveedores (colapsable) */}
        <div className="mt-9">
          <button onClick={() => setShowMaterials(!showMaterials)}
            className="homy-glass w-full flex items-center justify-between rounded-3xl px-5 py-4 min-h-[56px] homy-lift homy-card-glow"
            aria-expanded={showMaterials}>
            <span className="flex items-center gap-3 font-extrabold text-[#0A2540] tracking-tight">
              <span className="homy-icon-chip homy-chip-blue size-9 [&_svg]:size-4" aria-hidden><Boxes /></span>
              <span>Materiales en proveedores</span>
              {materials.length > 0 && (
                <span className="homy-glass-soft rounded-full px-2.5 py-0.5 text-xs font-bold text-slate-500 tabular-nums">{materials.length}</span>
              )}
            </span>
            <ChevronDown className={`size-5 text-slate-400 transition-transform duration-300 ${showMaterials ? 'rotate-180' : ''}`} aria-hidden />
          </button>
          {showMaterials && (
            materials.length === 0 ? (
              <div className="homy-glass-soft rounded-2xl border border-dashed border-[#0A2540]/12 p-6 mt-3 text-sm text-slate-500 text-center">
                No hay stock cargado en proveedores para esta búsqueda.
              </div>
            ) : (
              <div className="homy-stagger grid sm:grid-cols-2 lg:grid-cols-3 gap-3 mt-3">
                {materials.slice(0, 6).map((m) => (
                  <div key={m.id} className="homy-glass homy-lift homy-card-glow rounded-2xl p-4">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-[#0A2540] text-sm leading-snug">{m.name}</p>
                      <StatusBadge status={m.status} />
                    </div>
                    {m.brand && <p className="text-xs text-slate-400 mt-0.5">{m.brand}</p>}
                    <p className="mt-2 text-lg font-extrabold text-emerald-600 tabular-nums">
                      {formatARS(m.price)}<span className="text-xs font-semibold text-slate-400"> /{m.unit}</span>
                    </p>
                    <div className="flex items-center justify-between gap-2 mt-2.5 text-xs text-slate-400">
                      <span className="homy-glass-soft rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 font-semibold min-w-0">
                        <Store className="size-3.5 shrink-0" aria-hidden />
                        <span className="line-clamp-1">{m.providerName}</span>
                      </span>
                      <span className="shrink-0 tabular-nums">stock: {m.quantity}</span>
                    </div>
                    {m.providerCity && (
                      <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                        <MapPin className="size-3.5 shrink-0" aria-hidden />
                        {m.providerCity}{m.distanceKm !== undefined ? ` · ${formatDistance(m.distanceKm)}` : ''}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )
          )}
        </div>
      </div>
    </div>
  )
}

/* Estado vacío diseñado: icono flotante + copy + acción */
function Empty({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
      <span className="homy-empty-icon homy-chip-blue" aria-hidden>{icon}</span>
      <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">{title}</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
