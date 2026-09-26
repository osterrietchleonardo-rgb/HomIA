'use client'
// Búsqueda dual HomIA con superagente Homy (loop+graph+tools) + mapa de pines + radio de alcance
// modo cliente → profesionales y problemas · modo profesional → materiales y bolsa de trabajos
// La tarjeta de Homy usa el súper agente (/api/homy/agent, puerta "buscar"): mismo agente que la home y el panel.
import { useCallback, useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { navigate, useRoute, Link } from '@/lib/router'
import { addToCart, useCart } from '@/lib/cart'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { Homy } from '@/components/homy/homy-character'
import { Loading, EmptyState, UrgencyBadge, StatusBadge, UAvatar } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { formatDistance } from '@/lib/geo'
import type { MapPin } from '@/components/app/map-view'
import { toast } from 'sonner'
import { Search, SearchX, MapPin as MapPinIcon, Compass, Sparkles, X, Lock, Home, Hammer, BadgeCheck, Store, Star, ArrowUpRight, HardHat, Package, Briefcase, Loader2, ShoppingCart, Clock } from 'lucide-react'
import { AccionesHomy, TarjetasHomy } from '@/components/homy/homy-tarjetas'
import { rutaActual, useDuenioHomy, useHomy } from '@/components/homy/homy-store'
import { trackBusqueda } from '@/lib/analytics/tracker'
import { useRubroNombre } from '@/lib/categories'

const MapView = dynamic(() => import('@/components/app/map-view'), { ssr: false, loading: () => <div className="h-[320px] sm:h-[420px] lg:h-[480px] rounded-2xl homy-skeleton" /> })

type Mode = 'cliente' | 'profesional'

type ProResult = {
  id: string; displayName: string; professions: string[]; personType: string
  companyName: string | null; city: string | null; rating: number; reviewsCount: number
  worksCount: number; verified: boolean; distanceKm?: number
}
type JobResult = {
  id: string; title: string; description: string; categorySlug: string; urgency: string
  budgetMin: number | null; budgetMax: number | null; city: string | null
  clientName?: string; bidsCount: number; distanceKm?: number
}
type MaterialResult = {
  stockId: string; elementId: string; elementName: string; categorySlug: string; unit: string
  description?: string | null; brand: string | null; price: number; quantity: number; status: string
  providerId: string; providerName: string; providerCity: string | null; providerRating: number; distanceKm?: number
}
const CATEGORY_TABS = [
  { slug: '', name: 'Todo' }, { slug: 'plomeria', name: 'Plomería' },
  { slug: 'gasistas', name: 'Gas' }, { slug: 'electricistas', name: 'Electricidad' },
  { slug: 'albanileria', name: 'Albañilería' }, { slug: 'durlock', name: 'Durlock' },
  { slug: 'pintura', name: 'Pintura' }, { slug: 'herreria', name: 'Ferretería' },
  { slug: 'herramientas', name: 'Herramientas' }, { slug: 'maderera', name: 'Maderera' },
  { slug: 'carpinteria', name: 'Carpintería' }, { slug: 'techos', name: 'Techos' },
  { slug: 'cerramientos', name: 'Aberturas' }, { slug: 'pisos', name: 'Pisos' },
  { slug: 'aislacion', name: 'Aislación' }, { slug: 'iluminacion', name: 'Iluminación' },
  { slug: 'climatizacion', name: 'Clima' }, { slug: 'jardineria', name: 'Jardín' },
  { slug: 'limpieza', name: 'Limpieza' }, { slug: 'muebles', name: 'Muebles' },
  { slug: 'seguridad', name: 'Seguridad' }, { slug: 'electrodomesticos', name: 'Electro' },
  { slug: 'plagas', name: 'Plagas' },
]

export default function SearchScreen({ embedded = false }: { embedded?: boolean }) {
  // `embedded` se conserva por compatibilidad de ruteo (panel vs público); el
  // sticky del header usa top-0 en ambos casos: en el app-shell el topbar ya
  // está fuera del scroller y en público no hay topbar fijo.
  void embedded
  // pantalla de búsqueda dual con superagente (re-render intencional)
  const route = useRoute()
  const { user, revalidate } = useSession()
  const location = useLocation()

  const [mode, setMode] = useState<Mode>(route.query.mode === 'profesional' ? 'profesional' : 'cliente')
  const [query, setQuery] = useState(route.query.q || '')
  const [cat, setCat] = useState(route.query.cat || '')
  const [pros, setPros] = useState<ProResult[]>([])
  const [jobs, setJobs] = useState<JobResult[]>([])
  const [materials, setMaterials] = useState<MaterialResult[]>([])
  const [loading, setLoading] = useState(true)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiState, setAiState] = useState<'idle' | 'listening' | 'thinking' | 'happy'>('idle')
  // turno de Homy abierto desde esta pantalla (misma conversación que la home y el panel)
  const [turnoId, setTurnoId] = useState<string | null>(null)
  useDuenioHomy()
  const preguntar = useHomy((st) => st.preguntar)
  const turno = useHomy((st) => (turnoId ? st.turnos.find((t) => t.id === turnoId) ?? null : null))
  const [showMap, setShowMap] = useState(true)

  useEffect(() => { void revalidate() /* sync sesión en segundo plano (sin pedido duplicado) */ }, [revalidate])

  // Búsqueda directa (sin IA) — lista inmediata
  const directSearch = useCallback(async (q: string, category: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ mode, q, cat: category })
      if (location.lat && location.lng) {
        params.set('lat', String(location.lat))
        params.set('lng', String(location.lng))
        params.set('radius', String(location.radiusKm))
      }
      const res = await fetch(`/api/search?${params}`)
      const data = await res.json()
      setPros(data.professionals || [])
      setJobs(data.jobs || [])
      // /api/search devuelve cada oferta como { id, name }; la tarjeta (igual que el
      // superagente) usa { stockId, elementName }: sin esto las tarjetas salían sin
      // nombre y con keys repetidas
      setMaterials(((data.materials || []) as (MaterialResult & { id?: string; name?: string })[]).map((m) => ({
        ...m,
        stockId: m.stockId ?? m.id ?? '',
        elementName: m.elementName ?? m.name ?? '',
      })))
      // métricas (D27): término, filtros y cantidad de resultados (0 = oportunidad de catálogo)
      trackBusqueda('buscar', q, (data.professionals?.length || 0) + (data.jobs?.length || 0) + (data.materials?.length || 0), { cat: category, modo: mode })
    } finally {
      setLoading(false)
    }
  }, [mode, location.lat, location.lng, location.radiusKm])

  useEffect(() => {
    directSearch(query, cat)
  }, [directSearch, query, cat, location.radiusKm])

  // Súper agente: interpreta, busca con herramientas reales y responde en streaming
  async function askAgent(text: string) {
    if (!text.trim() || useHomy.getState().ocupado) return
    setAiBusy(true)
    setAiState('thinking')
    try {
      const pendiente = preguntar(text, { puerta: 'buscar', pagina: rutaActual(), lat: location.lat, lng: location.lng })
      const ultimo = useHomy.getState().turnos.at(-1)
      if (ultimo?.rol === 'homy') setTurnoId(ultimo.id)
      await pendiente
      setAiState('happy')
      setTimeout(() => setAiState('idle'), 1800)
    } finally {
      setAiBusy(false)
    }
  }

  const [mapPins, setMapPins] = useState<MapPin[]>([])
  useEffect(() => {
    async function pins() {
      const params = new URLSearchParams({ mode, q: query, cat, radius: String(location.radiusKm) })
      if (location.lat && location.lng) { params.set('lat', String(location.lat)); params.set('lng', String(location.lng)) }
      const res = await fetch(`/api/search/pins?${params}`)
      if (!res.ok) return
      const data = await res.json()
      setMapPins(data.pins || [])
    }
    pins().catch(() => null)
  }, [mode, query, cat, location.lat, location.lng, location.radiusKm])

  function pinList(): MapPin[] {
    const pins: MapPin[] = []
    if (location.lat && location.lng) {
      pins.push({ id: 'yo', lat: location.lat, lng: location.lng, label: 'Vos', kind: 'yo' })
    }
    return [...pins, ...mapPins]
  }

  const hasResults = pros.length + jobs.length + materials.length > 0
  return (
    <div className="min-h-screen">
      {/* Header de búsqueda — vidrio nocturno (fondo reforzado para que el
          contenido que scrollea por detrás no se meta con la lectura).
          En el app-shell el topbar vive FUERA del scroller: top-0 ancla el
          header al borde visible del marco, igual que .homy-page-head. */}
      <header className={`homy-glass-dark sticky ${embedded ? 'top-0' : 'top-20'} z-40 overflow-hidden`}>
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(70% 130% at 88% -30%, rgba(0,196,255,0.16) 0%, transparent 58%), radial-gradient(42% 90% at -5% 130%, rgba(255,90,31,0.12) 0%, transparent 55%), linear-gradient(to bottom, rgba(10,37,64,0.55) 0%, rgba(10,37,64,0.8) 100%)',
          }}
        />
        <div className="relative max-w-7xl mx-auto px-3 sm:px-4 pt-3 pb-2 flex items-center gap-2 sm:gap-3">
          <button
            onClick={() => navigate('/')}
            className="homy-focus rounded-full shrink-0 transition-transform duration-300 hover:scale-105"
            aria-label="Volver a la home"
          >
            <Homy size={36} state={aiState} />
          </button>
          <div className="flex-1 min-w-0 relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-slate-400 pointer-events-none" aria-hidden />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { askAgent(query) } }}
              placeholder={mode === 'cliente' ? '¿Qué necesitás para tu hogar?' : '“cemento 50kg” · “¿qué hay para plomeros?”'}
              className="w-full rounded-full bg-white/[0.08] border border-white/15 text-white placeholder:text-slate-400 pl-11 pr-10 py-2.5 sm:py-3 text-sm sm:text-base outline-none transition focus:border-[#00C4FF] focus:bg-white/[0.14] focus:ring-2 focus:ring-[#00C4FF]/25"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="homy-focus absolute right-2 top-1/2 -translate-y-1/2 grid place-items-center size-9 rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition"
                aria-label="Limpiar búsqueda"
              >
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          <button
            onClick={() => askAgent(query)}
            disabled={aiBusy}
            className="homy-btn-primary homy-focus shrink-0 px-3.5 sm:px-5 py-2.5 sm:py-3 min-h-[44px] text-sm"
          >
            <Sparkles className="size-4" aria-hidden />
            <span className="hidden sm:inline">{aiBusy ? 'Pensando…' : 'Preguntale a Homy'}</span>
          </button>
        </div>
        {/* Modo + categorías: tira scrolleable en mobile, dos zonas en desktop */}
        <div className="relative max-w-7xl mx-auto px-3 sm:px-4 pb-3 flex items-center gap-2 sm:gap-3 overflow-x-auto no-scrollbar sm:overflow-visible">
          <div role="group" aria-label="Modo de búsqueda" className="flex items-center gap-1 rounded-full bg-white/[0.06] ring-1 ring-white/10 p-1 shrink-0">
            {(['cliente', 'profesional'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className="homy-tab min-h-[44px] sm:min-h-[36px]"
              >
                {m === 'cliente' ? <Home className="size-4" aria-hidden /> : <Hammer className="size-4" aria-hidden />}
                <span className="whitespace-nowrap">{m === 'cliente' ? 'Busco un pro' : 'Trabajo y materiales'}</span>
              </button>
            ))}
          </div>
          <span aria-hidden className="hidden sm:block w-px h-6 bg-white/15 shrink-0" />
          <div className="relative shrink-0 sm:flex-1 sm:min-w-0">
            <div className="flex gap-1.5 py-0.5 sm:overflow-x-auto sm:no-scrollbar">
              {CATEGORY_TABS.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => setCat(c.slug)}
                  aria-pressed={cat === c.slug}
                  className="homy-tab shrink-0 min-h-[44px] sm:min-h-[36px]"
                >
                  {c.name}
                </button>
              ))}
            </div>
            {/* fade decorativo: sugiere que hay más chips deslizables (solo desktop) */}
            <div aria-hidden className="pointer-events-none hidden sm:block absolute inset-y-0 right-0 w-12 bg-gradient-to-l from-[#0A2540]/85 to-transparent" />
          </div>
        </div>
        {/* Ubicación + radio SIEMPRE visibles dentro del header: antes quedaban
            en el contenido y el header sticky los tapaba al scrollear. */}
        <div className="relative max-w-7xl mx-auto px-3 sm:px-4 pb-3 flex flex-wrap items-center gap-2">
          {location.shared ? (
            <span className="min-w-0 flex-1 sm:flex-none inline-flex items-center gap-2 rounded-full bg-white/[0.07] ring-1 ring-white/10 px-3.5 py-2 text-[12.5px] text-slate-300">
              <MapPinIcon className="size-3.5 shrink-0 text-[#FF5A1F]" aria-hidden />
              <span className="truncate">A <b className="text-white">{location.radiusKm} km</b> de tu ubicación</span>
            </span>
          ) : (
            <button
              onClick={() => location.request().then((ok) => { if (ok && user) syncLocationToServer(location.lat!, location.lng!, location.radiusKm) })}
              className="min-w-0 flex-1 sm:flex-none inline-flex items-center gap-2 rounded-full bg-white/[0.07] ring-1 ring-white/10 px-3.5 py-2 text-[12.5px] font-bold text-[#66DFFF] hover:bg-white/[0.12] transition text-left"
            >
              <MapPinIcon className="size-3.5 shrink-0 text-[#FF5A1F]" aria-hidden />
              <span className="truncate">Compartir ubicación para pines cercanos</span>
            </button>
          )}
          <div className="ml-auto inline-flex shrink-0 items-center gap-2.5 rounded-full bg-white/[0.07] ring-1 ring-white/10 px-3.5 py-2">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Radio</span>
            <span className="text-xs font-extrabold text-white tabular-nums min-w-[42px]">{location.radiusKm} km</span>
            <input
              type="range" min={1} max={100} value={location.radiusKm}
              onChange={(e) => location.setRadius(parseInt(e.target.value))}
              className="homy-range w-28 sm:w-44"
              style={{ ['--range-progress' as string]: `${location.radiusKm}%` }}
              aria-label="Radio de alcance de los resultados"
            />
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        {/* Respuesta del superagente */}
        {turno && (
          <div className="mb-6 sm:mb-8 rounded-3xl homy-glass relative overflow-hidden p-5 sm:p-6" data-homy-buscar={turno.estado}>
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-24"
              style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(0,196,255,0.12) 0%, transparent 72%)' }}
            />
            <div className="relative flex items-start gap-3 sm:gap-4">
              <Homy size={56} state={turno.estado === 'streaming' ? 'thinking' : 'happy'} />
              <div className="flex-1 min-w-0">
                <p className="homy-eyebrow mb-1.5">Homy</p>
                {turno.estado === 'streaming' && !turno.texto && (
                  <ul className="space-y-1" aria-hidden>
                    {(turno.pasos?.length ? turno.pasos.slice(-3) : ['Pensando tu pedido…']).map((p, i, arr) => (
                      <li key={`${p}-${i}`} className="flex items-center gap-2 text-sm font-semibold text-slate-500">
                        {i === arr.length - 1 ? <Loader2 className="size-3.5 animate-spin text-[#00C4FF]" /> : <span className="size-1.5 rounded-full bg-[#00C4FF]" />}
                        {p}
                      </li>
                    ))}
                  </ul>
                )}
                <div aria-live="polite" aria-busy={turno.estado === 'streaming'}>
                  {turno.texto && <p className="whitespace-pre-line text-[#0A2540] leading-relaxed font-medium">{turno.texto}</p>}
                </div>
                {turno.pregunta && turno.estado === 'listo' && !turno.texto.includes(turno.pregunta) && (
                  <p className="mt-2 font-bold text-[#0A2540]">{turno.pregunta}</p>
                )}
                {turno.degradado && <p className="mt-1.5 text-xs text-slate-400">Respuesta armada sin IA (búsqueda directa en HomIA).</p>}
                {turno.tarjetas && <div className="sm:max-w-2xl"><TarjetasHomy tarjetas={turno.tarjetas} /></div>}
                {turno.acciones && <AccionesHomy acciones={turno.acciones} />}
                {turno.estado === 'listo' && (turno.sugerencias?.length ?? 0) > 0 && (
                  <div className="flex flex-wrap gap-2 mt-3.5">
                    {turno.sugerencias!.map((sug) => (
                      <button
                        key={sug}
                        onClick={() => askAgent(sug)}
                        className="homy-focus homy-glass-soft rounded-full min-h-[44px] sm:min-h-[38px] px-4 py-2 text-sm font-semibold text-slate-600 hover:text-[#1D63B8] transition"
                      >
                        {sug}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Mapa */}
        <div className="mb-8 sm:mb-10">
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-blue size-9 shrink-0 [&_svg]:size-[18px]" aria-hidden><Compass /></span>
              Mapa de pines
              <span className="homy-pill tabular-nums">{mapPins.length}</span>
            </h2>
            <button onClick={() => setShowMap(!showMap)} aria-pressed={showMap} className="homy-tab min-h-[44px] sm:min-h-[38px]">
              <Compass className="size-4" aria-hidden />
              {showMap ? 'Ocultar mapa' : 'Ver mapa'}
            </button>
          </div>
          {showMap && (
            <div className="relative isolate rounded-2xl overflow-hidden ring-1 ring-[#0A2540]/10 shadow-[0_24px_60px_-32px_rgba(10,37,64,0.45)]">
              <MapView
                className="h-[320px] w-full sm:h-[420px] lg:h-[480px]"
                center={location.lat && location.lng ? { lat: location.lat, lng: location.lng } : null}
                radiusKm={location.radiusKm}
                pins={pinList()}
                onSelect={(pin) => {
                  if (!user && pin.kind !== 'yo') {
                    toast('Registrate para abrir tarjetas', { description: 'Buscar es libre; abrir datos requiere cuenta.', action: { label: 'Crear cuenta', onClick: () => navigate('/registrarse?volver=/buscar') } })
                    return
                  }
                  if (pin.href) navigate(pin.href)
                }}
              />
            </div>
          )}
        </div>

        {loading ? (
          <Loading text="Buscando en la base de HomIA…" />
        ) : !hasResults ? (
          <EmptyState
            icon={<SearchX />}
            title="Sin resultados todavía"
            hint="Probá con otras palabras, ampliá el radio o preguntale a Homy para que interprete lo que necesitás."
          />
        ) : (
          <div className="space-y-9 sm:space-y-10">
            {/* Profesionales */}
            {mode === 'cliente' && (
              <Section title="Profesionales" count={pros.length} icon={<HardHat />} tone="homy-chip-blue">
                {pros.length === 0 ? (
                  <p className="homy-glass-soft rounded-2xl px-5 py-4 text-sm text-slate-500">Todavía no hay profesionales con ese criterio.</p>
                ) : (
                  <div className="homy-stagger grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pros.map((p) => <ProCard key={p.id} pro={p} logged={!!user} />)}
                  </div>
                )}
              </Section>
            )}

            {/* Materiales — visible para ambos modos: el cliente también compra
                insumos sin contratar a nadie (compra directa al proveedor) */}
            <Section
              title={mode === 'profesional' ? 'Materiales en proveedores' : 'Materiales para comprar directo'}
              count={materials.length}
              icon={<Package />}
              tone="homy-chip-mint"
            >
              {mode === 'cliente' && user && materials.length > 0 && (
                <p className="homy-glass-soft rounded-2xl px-5 py-3.5 text-[13px] text-slate-600 leading-relaxed mb-4">
                  Podés comprar estos insumos sin contratar a nadie: agregalos al carrito o reservalos desde acá mismo, o abrí{' '}
                  <button onClick={() => navigate(`/panel/cliente/materiales${query ? `?q=${encodeURIComponent(query)}` : ''}`)} className="font-extrabold text-[#1D63B8] hover:underline underline-offset-2">
                    Materiales → Buscar materiales
                  </button>{' '}
                  para pedir el producto y pagar por Mercado Pago o efectivo.
                </p>
              )}
              {materials.length === 0 ? (
                <p className="homy-glass-soft rounded-2xl px-5 py-4 text-sm text-slate-500">
                  {mode === 'profesional'
                    ? 'Ningún proveedor publica ese elemento todavía.'
                    : 'Ningún proveedor publica ese producto todavía. Probá con otra palabra (ej: “caño” o “cemento”) o mirá por categoría.'}
                </p>
              ) : (
                <div className="homy-stagger grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {materials.map((m) => <MaterialCard key={m.stockId} m={m} logged={!!user} />)}
                </div>
              )}
            </Section>

            {/* Bolsa de trabajos */}
            <Section title="Trabajos publicados" count={jobs.length} icon={<Briefcase />} tone="homy-chip-orange">
              {jobs.length === 0 ? (
                <p className="homy-glass-soft rounded-2xl px-5 py-4 text-sm text-slate-500">
                  {mode === 'profesional' ? 'No hay trabajos abiertos para ese criterio. Activá notificaciones en tu perfil.' : 'No hay trabajos publicados para esta búsqueda.'}
                </p>
              ) : (
                <div className="homy-stagger grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {jobs.map((j) => <JobCard key={j.id} job={j} logged={!!user} />)}
                </div>
              )}
            </Section>
          </div>
        )}
      </div>
    </div>
  )
}

function Section({ title, count, icon, tone = 'homy-chip-blue', children }: { title: string; count?: number; icon: React.ReactNode; tone?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="homy-section-head">
        <h2 className="homy-section-title">
          <span className={`homy-icon-chip size-9 shrink-0 ${tone}`} aria-hidden>
            <span className="[&_svg]:size-[18px]">{icon}</span>
          </span>
          {title}
          {count !== undefined && <span className="homy-pill tabular-nums">{count}</span>}
        </h2>
      </div>
      {children}
    </section>
  )
}

function ProCard({ pro, logged }: { pro: ProResult; logged: boolean }) {
  const rubroNombre = useRubroNombre()
  return (
    <button
      onClick={() => logged ? navigate(`/profesional/${pro.id}`) : gate()}
      className="homy-focus group text-left rounded-2xl homy-glass homy-lift homy-card-glow p-5"
    >
      <div className="flex items-start gap-3.5">
        <UAvatar name={pro.displayName} size={48} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 min-w-0">
            <p className="font-bold text-[#0A2540] truncate group-hover:text-[#1D63B8] transition-colors">{pro.companyName || pro.displayName}</p>
            {pro.verified && <BadgeCheck className="size-4 shrink-0 text-[#00A8E0]" aria-label="Verificado" />}
          </div>
          <p className="text-xs text-slate-500 truncate mt-0.5">{pro.professions.map(rubroNombre).join(', ') || 'Profesional'}</p>
          <div className="flex items-center gap-1.5 mt-1.5">
            <Star className="size-3.5 shrink-0 fill-[#FFC700] text-[#FFC700]" aria-hidden />
            {pro.rating > 0 ? (
              <>
                <span className="text-xs font-bold text-[#0A2540] tabular-nums">{pro.rating}</span>
                <span className="text-xs text-slate-400 tabular-nums">({pro.reviewsCount})</span>
              </>
            ) : (
              <span className="text-xs font-semibold text-slate-400">Nuevo</span>
            )}
          </div>
        </div>
      </div>
      <div className="mt-3.5 flex items-center justify-between gap-2 border-t border-[#0A2540]/8 pt-3 text-xs text-slate-400">
        <span className="flex items-center gap-1 min-w-0">
          <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
          <span className="truncate">{pro.city || '—'}{pro.distanceKm !== undefined ? ` · ${formatDistance(pro.distanceKm)}` : ''}</span>
        </span>
        <span className="shrink-0">{pro.worksCount} obra{pro.worksCount === 1 ? '' : 's'}</span>
      </div>
      {logged && (
        <div className="mt-3 flex items-center justify-end">
          <span className="inline-flex items-center gap-1 text-sm font-bold text-[#1D63B8]">
            Ver perfil
            <ArrowUpRight className="size-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" aria-hidden />
          </span>
        </div>
      )}
      {!logged && <GateBar />}
    </button>
  )
}

// Tarjeta de material: se agrega al carrito o se reserva SIN salir de la búsqueda (D15).
// Con stock: "Agregar al carrito" (compra directa) o "Reservar"; sin stock: solo "Reservar".
// El nombre del proveedor sigue llevando a su perfil. El visitante también agrega (carrito
// local); el proveedor puro no compra: sin botones.
function MaterialCard({ m, logged }: { m: MaterialResult; logged: boolean }) {
  const cartMode = useCart((s) => s.mode)
  const [adding, setAdding] = useState<'compra' | 'reserva' | null>(null)
  const inStock = m.quantity > 0 && m.status !== 'agotado'
  async function add(mode: 'compra' | 'reserva') {
    setAdding(mode)
    try {
      await addToCart(m.stockId, 1, m.elementName, { mode: mode === 'reserva' ? 'reserva' : undefined })
    } finally {
      setAdding(null)
    }
  }
  return (
    <article className="rounded-2xl homy-glass homy-lift p-5 homy-card-glow flex flex-col">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-[#0A2540] leading-snug">{m.elementName}</p>
          {m.brand && <p className="text-xs text-slate-400 mt-0.5">{m.brand}</p>}
        </div>
        <StatusBadge status={m.status} />
      </div>
      {m.description && (
        <p className="mt-2 text-xs text-slate-500 leading-relaxed line-clamp-2">{m.description}</p>
      )}
      <p className="homy-num-adapt mt-3 text-2xl font-extrabold text-[#16A34A] tabular-nums">
        {formatARS(m.price)}<span className="text-xs font-semibold text-slate-400"> /{m.unit}</span>
      </p>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#0A2540]/8 pt-3 text-xs text-slate-400">
        <span className="flex min-w-0 items-center gap-1">
          <Store className="size-3.5 shrink-0 text-tech" aria-hidden />
          <span className="min-w-0 truncate">
            {logged
              ? <Link to={`/proveedor/${m.providerId}`} className="inline-flex min-h-[40px] items-center font-bold text-[#1D63B8] hover:underline underline-offset-2">{m.providerName}</Link>
              : <button type="button" onClick={gate} className="inline-flex min-h-[40px] items-center font-bold text-[#1D63B8] hover:underline underline-offset-2">{m.providerName}</button>}
            {m.providerCity ? ` · ${m.providerCity}` : ''}{m.distanceKm !== undefined ? ` · ${formatDistance(m.distanceKm)}` : ''}
          </span>
        </span>
        <span className="shrink-0">{inStock ? `stock: ${m.quantity}` : 'sin stock'}</span>
      </div>
      {cartMode !== 'sin_carrito' && (
        <>
          {!inStock && (
            <p className="mt-2.5 text-[12px] font-semibold text-[#1D63B8]">Sin stock: podés reservarlo y el proveedor te avisa</p>
          )}
          <div className="mt-3 flex flex-wrap gap-2">
            {inStock && (
              <button
                type="button"
                onClick={() => void add('compra')}
                disabled={adding !== null}
                className="homy-btn-primary inline-flex min-h-[44px] flex-1 items-center justify-center gap-1.5 rounded-full px-4 text-[13px] disabled:opacity-60"
              >
                {adding === 'compra' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ShoppingCart className="size-4" aria-hidden />} Agregar al carrito
              </button>
            )}
            <button
              type="button"
              onClick={() => void add('reserva')}
              disabled={adding !== null}
              className={`${inStock ? 'homy-glass-soft text-[#1D63B8] hover:bg-white' : 'homy-btn-dark flex-1'} inline-flex min-h-[44px] items-center justify-center gap-1.5 rounded-full px-4 text-[13px] font-bold disabled:opacity-60`}
            >
              {adding === 'reserva' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Clock className="size-4" aria-hidden />} Reservar
            </button>
          </div>
        </>
      )}
    </article>
  )
}

function JobCard({ job, logged }: { job: JobResult; logged: boolean }) {
  const rubroNombre = useRubroNombre()
  return (
    <button
      onClick={() => logged ? navigate(`/trabajo/${job.id}`) : gate()}
      className="homy-focus group text-left rounded-2xl homy-glass homy-lift homy-card-glow p-5"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-[#0A2540] leading-snug group-hover:text-[#1D63B8] transition-colors">{job.title}</p>
        <UrgencyBadge urgency={job.urgency} />
      </div>
      <p className="text-sm text-slate-500 mt-1.5 line-clamp-2 leading-relaxed">{job.description}</p>
      <div className="mt-3 flex flex-wrap items-center gap-x-2.5 gap-y-1.5">
        <span className="homy-pill">{rubroNombre(job.categorySlug)}</span>
        {(job.city || job.distanceKm !== undefined) && (
          <span className="inline-flex items-center gap-1 text-xs text-slate-400 min-w-0">
            <MapPinIcon className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{job.city || ''}{job.distanceKm !== undefined ? ` · ${formatDistance(job.distanceKm)}` : ''}</span>
          </span>
        )}
      </div>
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#0A2540]/8 pt-3 text-xs">
        <span className="font-bold text-[#0A2540] tabular-nums">
          {job.budgetMin ? `Presupuesto: ${formatARS(job.budgetMin)}${job.budgetMax ? ` – ${formatARS(job.budgetMax)}` : '+'}` : 'A presupuesto'}
        </span>
        <span className="text-slate-400 shrink-0">{job.bidsCount} presupuesto{job.bidsCount === 1 ? '' : 's'}</span>
      </div>
      {!logged && <GateBar />}
    </button>
  )
}

function GateBar() {
  return (
    <div className="mt-3 flex items-center gap-1.5 rounded-xl bg-[#FFF7D6] border border-[#FFC700]/60 px-3 py-2 text-[11px] font-semibold text-[#B98A00]">
      <Lock className="size-3.5 shrink-0" aria-hidden /> Registrate para ver esta tarjeta
    </div>
  )
}

function gate() {
  toast('Creá tu cuenta para abrir tarjetas', {
    description: 'Buscar y mirar es gratis. Los datos y acciones requieren cuenta.',
    action: { label: 'Registrarme', onClick: () => navigate('/registrarse?volver=/buscar') },
  })
}
