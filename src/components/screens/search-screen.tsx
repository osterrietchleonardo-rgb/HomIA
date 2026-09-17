'use client'
// Búsqueda dual HomIA con superagente Homy (loop+graph+tools) + mapa de pines + radio de alcance
// modo cliente → profesionales y problemas · modo profesional → materiales, comparables y bolsa de trabajos
import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { navigate, useRoute } from '@/lib/router'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { Homy } from '@/components/homy/homy-character'
import { Loading, EmptyState, UrgencyBadge, StatusBadge, UAvatar } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { formatDistance } from '@/lib/geo'
import type { MapPin } from '@/components/app/map-view'
import { toast } from 'sonner'
import { Search, SearchX, MapPin as MapPinIcon, Compass, Sparkles, X, Lock, Home, Hammer, BadgeCheck, Store, Star, ArrowUpRight, HardHat, Package, Scale, Briefcase } from 'lucide-react'

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
  brand: string | null; price: number; quantity: number; status: string
  providerId: string; providerName: string; providerCity: string | null; providerRating: number; distanceKm?: number
}

type AgentReply = {
  ok: boolean
  message: string
  suggestions: string[]
  question?: { pregunta: string; opciones: string[] }
  results?: { professionals?: ProResult[]; jobs?: JobResult[]; materials?: MaterialResult[]; comparables?: MaterialResult[] }
  steps?: { thought: string; action: string; found: number }[]
  error?: string
}

const CATEGORY_TABS = [
  { slug: '', name: 'Todo' }, { slug: 'plomeria', name: 'Plomería' },
  { slug: 'gasistas', name: 'Gas' }, { slug: 'electricistas', name: 'Electricidad' },
  { slug: 'albanileria', name: 'Albañilería' }, { slug: 'pintura', name: 'Pintura' },
  { slug: 'carpinteria', name: 'Carpintería' }, { slug: 'herreria', name: 'Herrería' },
  { slug: 'limpieza', name: 'Limpieza' }, { slug: 'jardineria', name: 'Jardinería' },
  { slug: 'climatizacion', name: 'Climatización' }, { slug: 'techos', name: 'Techos' },
  { slug: 'cerramientos', name: 'Cerramientos' },
]

export default function SearchScreen() {
  // pantalla de búsqueda dual con superagente (re-render intencional)
  const route = useRoute()
  const { user, refresh } = useSession()
  const location = useLocation()

  const [mode, setMode] = useState<Mode>(route.query.mode === 'profesional' ? 'profesional' : 'cliente')
  const [query, setQuery] = useState(route.query.q || '')
  const [cat, setCat] = useState(route.query.cat || '')
  const [pros, setPros] = useState<ProResult[]>([])
  const [jobs, setJobs] = useState<JobResult[]>([])
  const [materials, setMaterials] = useState<MaterialResult[]>([])
  const [comparables, setComparables] = useState<MaterialResult[]>([])
  const [loading, setLoading] = useState(true)
  const [aiBusy, setAiBusy] = useState(false)
  const [aiState, setAiState] = useState<'idle' | 'listening' | 'thinking' | 'happy'>('idle')
  const [aiMessage, setAiMessage] = useState<string | null>(null)
  const [question, setQuestion] = useState<{ pregunta: string; opciones: string[] } | null>(null)
  const [suggestions, setSuggestions] = useState<string[]>([])
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [steps, setSteps] = useState<{ thought: string; action: string; found: number }[]>([])
  const [showMap, setShowMap] = useState(true)
  const convRef = useRef<{ role: 'user' | 'homy'; content: string }[]>([])

  useEffect(() => { refresh() /* sync sesión */ }, [refresh])

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
      setMaterials(data.materials || [])
      setComparables([])
    } finally {
      setLoading(false)
    }
  }, [mode, location.lat, location.lng, location.radiusKm])

  useEffect(() => {
    directSearch(query, cat)
  }, [directSearch, query, cat, location.radiusKm])

  // Superagente: interpreta, pregunta y busca con herramientas reales
  async function askAgent(text: string) {
    if (!text.trim()) return
    setAiBusy(true)
    setAiState('thinking')
    setQuestion(null)
    try {
      const res = await fetch('/api/homy/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: text, mode,
          ...(sessionId ? { sessionId } : {}),
          lat: location.lat ?? null, lng: location.lng ?? null,
        }),
      })
      const data: AgentReply = await res.json()
      if (!data.ok) {
        toast.error(data.error || 'El superagente no pudo responder')
        return
      }
      setSessionId((data as unknown as { sessionId?: string }).sessionId || sessionId)
      setAiMessage(data.message)
      setSuggestions(data.suggestions || [])
      setQuestion(data.question || null)
      setSteps(data.steps || [])
      if (data.results) {
        setPros((prev) => data.results!.professionals?.length ? data.results!.professionals : prev)
        setJobs((prev) => data.results!.jobs?.length ? data.results!.jobs : prev)
        setMaterials((prev) => data.results!.materials?.length ? data.results!.materials : prev)
        setComparables(data.results.comparables || [])
      }
      convRef.current.push({ role: 'user', content: text }, { role: 'homy', content: data.message })
      setAiState('happy')
      setTimeout(() => setAiState('idle'), 1800)
    } catch {
      toast.error('Problema de conexión con el superagente')
      setAiState('idle')
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

  const hasResults = pros.length + jobs.length + materials.length + comparables.length > 0

  return (
    <div className="min-h-screen">
      {/* Header de búsqueda — vidrio nocturno */}
      <header className="homy-glass-dark sticky top-0 z-40 overflow-hidden">
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(70% 130% at 88% -30%, rgba(0,196,255,0.16) 0%, transparent 58%), radial-gradient(42% 90% at -5% 130%, rgba(255,90,31,0.12) 0%, transparent 55%)',
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
            onClick={() => askAgent(query || aiMessage || '')}
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
      </header>

      <div className="max-w-7xl mx-auto px-4 py-6 sm:py-8">
        {/* Respuesta del superagente */}
        {(aiMessage || question) && (
          <div className="mb-6 sm:mb-8 rounded-3xl homy-glass homy-lift relative overflow-hidden p-5 sm:p-6">
            <span
              aria-hidden
              className="pointer-events-none absolute inset-x-0 top-0 h-24"
              style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(0,196,255,0.12) 0%, transparent 72%)' }}
            />
            <div className="relative flex items-start gap-3 sm:gap-4">
              <Homy size={56} state={aiBusy ? 'thinking' : 'happy'} />
              <div className="flex-1 min-w-0">
                <p className="homy-eyebrow mb-1.5">Superagente Homy</p>
                {aiMessage && <p className="text-[#0A2540] leading-relaxed font-medium">{aiMessage}</p>}
                {question && (
                  <div className="mt-4">
                    <p className="font-bold text-[#0A2540]">{question.pregunta}</p>
                    <div className="flex flex-wrap gap-2 mt-2.5">
                      {question.opciones.map((op) => (
                        <button
                          key={op}
                          onClick={() => { askAgent(op) }}
                          className="homy-focus rounded-full min-h-[44px] sm:min-h-[40px] border border-[#1D63B8]/30 bg-white/70 px-4 py-2 text-sm font-bold text-[#1D63B8] hover:bg-[#1D63B8] hover:border-[#1D63B8] hover:text-white transition"
                        >
                          {op}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {suggestions.length > 0 && !question && (
                  <div className="flex flex-wrap gap-2 mt-3.5">
                    {suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => askAgent(s)}
                        className="homy-focus homy-glass-soft rounded-full min-h-[44px] sm:min-h-[38px] px-4 py-2 text-sm font-semibold text-slate-600 hover:text-[#1D63B8] transition"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {steps && steps.length > 0 && (
                  <details className="mt-4">
                    <summary className="homy-focus inline-flex items-center gap-1.5 rounded-lg text-xs font-semibold text-slate-400 cursor-pointer hover:text-slate-600 transition-colors">
                      Ver razonamiento del agente ({steps.length} pasos)
                    </summary>
                    <ol className="mt-2.5 space-y-1.5 text-xs text-slate-500 border-l-2 border-[#00C4FF]/30 pl-3.5">
                      {steps.map((st, i) => (
                        <li key={i}><b className="text-[#0A2540]">{st.action}</b> → {st.found} resultados {st.thought && `· ${st.thought}`}</li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Ubicación + radio */}
        <div className="mb-5 sm:mb-6 flex flex-wrap items-center justify-between gap-3">
          <div className="homy-glass-soft flex items-center gap-2 rounded-full px-4 py-2.5 text-sm text-slate-500 min-w-0">
            <MapPinIcon className="size-4 shrink-0 text-[#FF5A1F]" aria-hidden />
            {location.shared ? (
              <span className="min-w-0">Mostrando resultados a <b className="text-[#0A2540]">{location.radiusKm} km</b> de tu ubicación</span>
            ) : (
              <button
                onClick={() => location.request().then((ok) => { if (ok && user) syncLocationToServer(location.lat!, location.lng!, location.radiusKm) })}
                className="homy-focus rounded-lg text-[#1D63B8] font-bold hover:underline underline-offset-2 text-left"
              >
                Compartir ubicación para ver pines cercanos
              </button>
            )}
          </div>
          <div className="homy-glass-soft flex items-center gap-3 rounded-full px-4 py-2.5">
            <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Radio</span>
            <span className="text-xs font-extrabold text-[#0A2540] tabular-nums min-w-[46px]">{location.radiusKm} km</span>
            <input
              type="range" min={1} max={100} value={location.radiusKm}
              onChange={(e) => location.setRadius(parseInt(e.target.value))}
              className="homy-range w-28 sm:w-44"
              style={{ ['--range-progress' as string]: `${location.radiusKm}%` }}
              aria-label="Diámetro de alcance"
            />
          </div>
        </div>

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

            {/* Materiales */}
            {mode === 'profesional' && (
              <Section title="Materiales en proveedores" count={materials.length} icon={<Package />} tone="homy-chip-mint">
                {materials.length === 0 ? (
                  <p className="homy-glass-soft rounded-2xl px-5 py-4 text-sm text-slate-500">Ningún proveedor publica ese elemento todavía.</p>
                ) : (
                  <div className="homy-stagger grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {materials.map((m) => <MaterialCard key={m.stockId} m={m} logged={!!user} />)}
                  </div>
                )}
              </Section>
            )}

            {/* Comparables */}
            {comparables.length > 0 && (
              <Section title="Comparables: mejor precio por elemento" count={comparables.length} icon={<Scale />} tone="homy-chip-gold">
                <div className="homy-stagger grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {comparables.map((m) => <MaterialCard key={m.stockId} m={m} logged={!!user} highlight />)}
                </div>
              </Section>
            )}

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
          <p className="text-xs text-slate-500 truncate capitalize mt-0.5">{pro.professions.join(' · ') || 'Profesional'}</p>
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

function MaterialCard({ m, logged, highlight }: { m: MaterialResult; logged: boolean; highlight?: boolean }) {
  return (
    <button
      onClick={() => logged ? navigate(`/proveedor/${m.providerId}`) : gate()}
      className={`homy-focus text-left rounded-2xl homy-glass homy-lift p-5 ${highlight ? 'outline-2 outline-emerald-500/60' : 'homy-card-glow'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-bold text-[#0A2540] leading-snug">{m.elementName}</p>
          {m.brand && <p className="text-xs text-slate-400 mt-0.5">{m.brand}</p>}
        </div>
        <StatusBadge status={m.status} />
      </div>
      <p className="mt-3 text-2xl font-extrabold text-[#16A34A] tabular-nums">
        {formatARS(m.price)}<span className="text-xs font-semibold text-slate-400"> /{m.unit}</span>
      </p>
      {highlight && (
        <span className="homy-pill mt-2">
          <span className="homy-pill-dot bg-emerald-500" aria-hidden />
          Mejor precio
        </span>
      )}
      <div className="mt-3 flex items-center justify-between gap-2 border-t border-[#0A2540]/8 pt-3 text-xs text-slate-400">
        <span className="flex min-w-0 items-center gap-1 truncate">
          <Store className="size-3.5 shrink-0 text-tech" aria-hidden />
          {m.providerName}{m.providerCity ? ` · ${m.providerCity}` : ''}{m.distanceKm !== undefined ? ` · ${formatDistance(m.distanceKm)}` : ''}
        </span>
        <span className="shrink-0">stock: {m.quantity}</span>
      </div>
      {!logged && <GateBar />}
    </button>
  )
}

function JobCard({ job, logged }: { job: JobResult; logged: boolean }) {
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
        <span className="homy-pill capitalize">{job.categorySlug}</span>
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
