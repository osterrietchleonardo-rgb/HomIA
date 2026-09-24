'use client'
// Marketplace público de materiales: todas las ofertas con stock real de proveedores
// operativos, con distancia si el usuario comparte su ubicación. Comprar/Reservar
// lleva al panel del cliente (deep link ?stock=) o al registro si no hay sesión.
import { useCallback, useEffect, useRef, useState } from 'react'
import { navigate, Link } from '@/lib/router'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { Loading, EmptyState, UAvatar, VerifyBadge } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { formatDistance } from '@/lib/geo'
import { toast } from 'sonner'
import { Search, MapPin, Package, Navigation, ChevronDown, ChevronUp } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type Offer = {
  stockId: string; elementId: string; price: number; quantity: number; brand: string | null
  providerId: string; businessName: string; kind: string
  providerUserId: string; providerAvatar: string | null; providerCity: string | null
  providerRating: number; providerReviews: number; providerVerified: boolean
  planPro: boolean; distanceKm?: number
}

type ElementResult = {
  elementId: string; name: string; description: string; unit: string
  categoryName: string; hasPro: boolean; offersCount: number; minPrice: number | null; maxPrice: number | null
  offers: Offer[]
}

type Category = { slug: string; name: string; icon: string }

const PROVIDER_KINDS = [
  { v: 'todos', label: 'Cualquier rubro' },
  { v: 'corralon', label: 'Corralón' },
  { v: 'ferreteria', label: 'Ferretería' },
  { v: 'electricidad', label: 'Electricidad' },
  { v: 'pintura', label: 'Pinturería' },
  { v: 'sanitarios', label: 'Sanitarios' },
  { v: 'maderera', label: 'Maderera' },
]
const RADII = [5, 10, 15, 25, 50]
const VISIBLE_OFFERS = 3

export default function MarketplaceScreen({ embedded = false }: { embedded?: boolean }) {
  const { user } = useSession()
  const location = useLocation()
  const [results, setResults] = useState<ElementResult[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [expanded, setExpanded] = useState<Set<string>>(new Set())

  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [cat, setCat] = useState('')
  const [kind, setKind] = useState('todos')
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hasGeo = location.shared && location.lat != null && location.lng != null

  const fetchResults = useCallback(async (query: string, category: string, providerKind: string) => {
    const sp = new URLSearchParams()
    if (query) sp.set('q', query)
    if (category) sp.set('cat', category)
    if (providerKind && providerKind !== 'todos') sp.set('kind', providerKind)
    if (location.shared && location.lat != null && location.lng != null) {
      sp.set('lat', String(location.lat))
      sp.set('lng', String(location.lng))
      sp.set('radius', String(location.radiusKm))
    }
    try {
      const r = await fetch('/api/marketplace?' + sp.toString())
      const d = r.ok ? await r.json() : null
      if (!d) { toast.error('No pudimos cargar los materiales. Reintentá'); return }
      setResults(d.results || [])
      if (d.categories) setCategories(d.categories)
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setLoading(false)
    }
  }, [location.shared, location.lat, location.lng, location.radiusKm])

  // recarga ante cambios de búsqueda, filtros o ubicación/radio
  useEffect(() => {
    void fetchResults(debouncedQ, cat, kind)
  }, [fetchResults, debouncedQ, cat, kind])

  const onSearch = (v: string) => {
    setQ(v)
    if (qTimer.current) clearTimeout(qTimer.current)
    qTimer.current = setTimeout(() => { setLoading(true); setDebouncedQ(v) }, 450)
  }
  const onFilterCat = (c: string) => { setLoading(true); setCat(c) }
  const onFilterKind = (k: string) => { setLoading(true); setKind(k) }
  const onFilterRadius = (r: number) => { setLoading(true); location.setRadius(r) }

  async function shareLocation() {
    const okGeo = await location.request()
    if (!okGeo) { toast.error(useLocation.getState().error || 'No pudimos obtener tu ubicación'); return }
    const st = useLocation.getState()
    if (user && st.lat != null && st.lng != null) void syncLocationToServer(st.lat, st.lng, st.radiusKm)
    setLoading(true)
  }

  function handleAction(o: Offer, r: ElementResult, action: 'comprar' | 'reservar') {
    if (!user) {
      toast.info(`Creá tu cuenta gratis para ${action}`, { description: 'Te traemos de vuelta a esta búsqueda.' })
      navigate(`/registrarse?volver=${encodeURIComponent('/materiales')}`)
      return
    }
    if (user.roles.includes('cliente')) {
      const sp = new URLSearchParams({ stock: o.stockId, q: r.name, tipo: action === 'reservar' ? 'reserva' : 'compra' })
      navigate(`/panel/cliente/materiales?${sp.toString()}`)
      return
    }
    // profesional / proveedor sin rol cliente: ver la ficha del proveedor
    navigate(`/proveedor/${o.providerId}`)
  }

  function toggleExpanded(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className={embedded ? 'homy-page' : 'min-h-screen'}>
      {/* banda de encabezado */}
      <div className={embedded ? 'mb-6' : 'relative max-w-7xl mx-auto pt-8 pb-8 px-4 sm:px-6 lg:px-8'}>
        <p className="homy-eyebrow">Marketplace HomIA</p>
        <h1 className={embedded ? 'homy-page-title mt-1' : 'mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-navy leading-tight'}>
          Materiales al mejor precio
        </h1>
        <p className={`max-w-2xl text-[15px] leading-relaxed text-slate-500 ${embedded ? 'mt-1.5' : 'mt-3'}`}>
          Compará precio, stock y distancia de los proveedores de la comunidad. Comprás directo al local: pagás con Mercado Pago o en efectivo al retirar.
        </p>
      </div>

      <div className={embedded ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16'}>
        <div className={embedded ? '' : '-mt-6'}>
          {/* buscador y filtros principales */}
          <div className={`homy-glass rounded-3xl p-4 sm:p-5 ${embedded ? 'mb-5' : 'homy-stagger relative shadow-[0_18px_50px_-24px_rgba(10,37,64,0.35)] mb-5'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search aria-hidden className="size-4.5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text" placeholder="Buscar materiales, proveedores, marcas…"
                  aria-label="Buscar materiales"
                  value={q} onChange={(e) => onSearch(e.target.value)}
                  className="homy-glass-input w-full rounded-full pl-11 pr-4 py-3 text-sm"
                />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Select value={kind} onValueChange={onFilterKind}>
                  <SelectTrigger aria-label="Rubro del proveedor" className="homy-glass-soft rounded-full pl-3 pr-4 py-2.5 text-[13px] font-bold text-navy outline-none transition hover:bg-white border-none min-w-[120px]">
                    <SelectValue placeholder="Rubro" />
                  </SelectTrigger>
                  <SelectContent>
                    {PROVIDER_KINDS.map((k) => <SelectItem key={k.v} value={k.v}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
                {hasGeo ? (
                  <div className="relative">
                    <Select value={String(location.radiusKm)} onValueChange={(v) => onFilterRadius(Number(v))}>
                      <SelectTrigger aria-label="Radio de búsqueda" className="homy-glass-soft rounded-full pl-8 pr-4 py-2.5 text-[13px] font-bold text-navy outline-none transition hover:bg-white border-none min-w-[110px]">
                        <SelectValue placeholder="Radio" />
                      </SelectTrigger>
                      <SelectContent>
                        {[...new Set([...RADII, location.radiusKm])].sort((a, b) => a - b).map((r) => (
                          <SelectItem key={r} value={String(r)}>A {r} km</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <MapPin aria-hidden className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-tech pointer-events-none" />
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => void shareLocation()}
                    disabled={location.requesting}
                    className="homy-glass-soft inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[13px] font-bold text-tech transition hover:bg-white disabled:opacity-60"
                  >
                    <Navigation className="size-4" aria-hidden /> {location.requesting ? 'Ubicando…' : 'Compartir ubicación'}
                  </button>
                )}
              </div>
            </div>

            {/* categorías */}
            <div className="mt-3.5 flex gap-1.5 overflow-x-auto no-scrollbar pb-1" role="group" aria-label="Categorías">
              <button
                onClick={() => onFilterCat('')}
                aria-pressed={cat === ''}
                className={`homy-focus shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold min-h-[32px] transition whitespace-nowrap ${cat === '' ? 'bg-navy text-white shadow-[0_8px_18px_-8px_rgba(10,37,64,0.6)]' : 'homy-glass-soft text-slate-500 hover:text-navy'}`}
              >
                Todas las categorías
              </button>
              {categories.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => onFilterCat(c.slug)}
                  aria-pressed={cat === c.slug}
                  className={`homy-focus shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold min-h-[32px] transition whitespace-nowrap ${cat === c.slug ? 'bg-navy text-white shadow-[0_8px_18px_-8px_rgba(10,37,64,0.6)]' : 'homy-glass-soft text-slate-500 hover:text-navy'}`}
                >
                  {c.name}
                </button>
              ))}
            </div>
          </div>

          {loading && !results ? (
            <div className="py-20 text-center"><Loading text="Buscando ofertas…" /></div>
          ) : !results?.some((r) => r.offersCount > 0) ? (
            <EmptyState
              icon={<Package className="size-7" />}
              title="Sin ofertas para esta búsqueda"
              hint={hasGeo ? 'Probá con otro nombre (por ejemplo «caño» o «cemento») o ampliá el radio de búsqueda.' : 'Probá con otro nombre (por ejemplo «caño» o «cemento») o elegí otra categoría.'}
            />
          ) : (
            <div className={`grid gap-5 sm:grid-cols-2 lg:grid-cols-3 transition-opacity ${loading ? 'opacity-60' : ''}`}>
              {results.filter((r) => r.offersCount > 0).map((r) => {
                const isOpen = expanded.has(r.elementId)
                const shown = isOpen ? r.offers : r.offers.slice(0, VISIBLE_OFFERS)
                const hidden = r.offers.length - VISIBLE_OFFERS
                return (
                  <article key={r.elementId} className={`homy-glass homy-lift rounded-2xl p-5 flex flex-col ${r.hasPro ? 'ring-1 ring-gold/50' : ''}`}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="text-[11px] font-bold uppercase tracking-wider text-action">{r.categoryName}</span>
                        <h3 className="mt-1 font-bold text-navy text-lg leading-snug">{r.name}</h3>
                      </div>
                      {r.hasPro && (
                        <span className="shrink-0 rounded-full bg-gradient-to-r from-gold to-[#ffd84d] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-[#6b4d00] shadow-sm">
                          ★ Recomendado
                        </span>
                      )}
                    </div>
                    {r.description && <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500 line-clamp-2">{r.description}</p>}

                    <div className="mt-4 flex-1">
                      <p className="text-[13px] font-medium text-slate-600 mb-2">
                        {r.offersCount} proveedor{r.offersCount === 1 ? '' : 'es'} con stock · por {r.unit}
                        {r.minPrice != null && <> · desde <b className="text-navy">{formatARS(r.minPrice)}</b></>}
                      </p>
                      <ul className="space-y-2">
                        {shown.map((o) => (
                          <li key={o.stockId} className={`flex flex-col gap-2 rounded-xl border p-3 ${o.planPro ? 'border-gold/50 bg-gold/8' : 'border-navy/8 bg-white/40'}`}>
                            <div className="flex items-start justify-between gap-2">
                              <div className="flex min-w-0 items-center gap-2">
                                <UAvatar url={o.providerAvatar} name={o.businessName || ''} size={28} />
                                <div className="min-w-0">
                                  <p className="flex flex-wrap items-center gap-1 text-[12.5px] font-bold text-navy">
                                    <Link to={`/proveedor/${o.providerId}`} className="truncate hover:underline" title={o.businessName}>{o.businessName}</Link>
                                    <VerifyBadge status={o.providerVerified ? 'verificado' : 'none'} />
                                  </p>
                                  <p className="text-[11px] text-slate-500 truncate">
                                    {o.brand || 'Sin marca'} · stock {o.quantity}
                                    {o.planPro && <span className="ml-1 rounded-full bg-gold/25 px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-wider text-[#6b4d00]">Recomendado</span>}
                                  </p>
                                </div>
                              </div>
                              <p className="homy-num-adapt shrink-0 text-[14px] font-extrabold text-tech tabular-nums">{formatARS(o.price)}</p>
                            </div>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <span className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500">
                                <MapPin className="size-3 text-slate-400" aria-hidden />
                                {o.distanceKm != null ? formatDistance(o.distanceKm) : (o.providerCity || 'Argentina')}
                              </span>
                              <div className="flex items-center gap-2">
                                <button onClick={() => handleAction(o, r, 'reservar')} className="homy-glass-soft inline-flex min-h-[36px] items-center rounded-full px-3 text-[11.5px] font-bold text-tech transition hover:bg-white">
                                  Reservar
                                </button>
                                <button onClick={() => handleAction(o, r, 'comprar')} className="homy-btn-primary min-h-[36px] rounded-full px-3 text-[11.5px]">
                                  Comprar
                                </button>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {hidden > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleExpanded(r.elementId)}
                          aria-expanded={isOpen}
                          className="mt-2 inline-flex w-full min-h-[36px] items-center justify-center gap-1 rounded-full text-[12px] font-bold text-tech hover:bg-white/60"
                        >
                          {isOpen ? <>Ver menos <ChevronUp className="size-3.5" aria-hidden /></> : <>Ver {hidden} oferta{hidden === 1 ? '' : 's'} más <ChevronDown className="size-3.5" aria-hidden /></>}
                        </button>
                      )}
                    </div>
                  </article>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
