'use client'
// Búsqueda dual HomIA con superagente Homy (loop+graph+tools) + mapa de pines + radio de alcance
// modo cliente → profesionales y problemas · modo profesional → materiales, comparables y bolsa de trabajos
import { useCallback, useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { navigate, useRoute } from '@/lib/router'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { Homy } from '@/components/homy/homy-character'
import { Loading, EmptyState, UrgencyBadge, StatusBadge, UAvatar, UStars } from '@/components/app/ui-bits'
import { formatARS, URGENCY_LABEL } from '@/lib/format'
import { formatDistance } from '@/lib/geo'
import type { MapPin } from '@/components/app/map-view'
import { toast } from 'sonner'
import { Search, MapPin as MapPinIcon, Compass, Sparkles, Send, X, Lock } from 'lucide-react'

const MapView = dynamic(() => import('@/components/app/map-view'), { ssr: false, loading: () => <div className="h-[380px] rounded-2xl bg-slate-100 animate-pulse" /> })

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
          message: text, mode, sessionId,
          lat: location.lat, lng: location.lng,
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

  const allPins = 0 // (los pines reales vienen de /api/search/pins)
  void allPins
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
      <div className="homy-glass-dark sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center gap-3">
          <button onClick={() => navigate('/')} className="shrink-0 flex items-center gap-1.5">
            <Homy size={36} state={aiState} />
          </button>
          <div className="flex-1 relative">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4.5 text-slate-400" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') { askAgent(query) } }}
              placeholder={mode === 'cliente' ? 'Contá qué necesitás: “plomero urgente, se me inundó el baño”…' : '“cemento 50kg” · “¿qué hay para plomeros?” · “tubo PVC 110”'}
              className="w-full rounded-full bg-white/10 border border-white/20 text-white placeholder:text-slate-400 pl-11 pr-10 py-3 outline-none focus:border-[#00C4FF] focus:bg-white/15 transition"
            />
            {query && (
              <button onClick={() => setQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white" aria-label="Limpiar">
                <X className="size-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => askAgent(query || aiMessage || '')}
            disabled={aiBusy}
            className="shrink-0 rounded-full bg-[#FF5A1F] hover:bg-[#e64d15] disabled:opacity-60 text-white font-bold px-4 sm:px-5 py-3 text-sm transition flex items-center gap-2"
          >
            <Sparkles className="size-4" />
            <span className="hidden sm:inline">{aiBusy ? 'Pensando…' : 'Preguntale a Homy'}</span>
          </button>
        </div>
        {/* Modo + categorías */}
        <div className="max-w-7xl mx-auto px-4 pb-3 flex flex-wrap items-center gap-2">
          <div className="flex rounded-full bg-white/10 p-1 mr-1">
            {(['cliente', 'profesional'] as Mode[]).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${mode === m ? 'bg-[#00C4FF] text-[#0A2540]' : 'text-slate-300 hover:text-white'}`}
              >
                {m === 'cliente' ? '🏠 Busco un pro' : '🛠️ Busco trabajo/materiales'}
              </button>
            ))}
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-1">
            {CATEGORY_TABS.map((c) => (
              <button
                key={c.slug}
                onClick={() => setCat(c.slug)}
                className={`shrink-0 rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${cat === c.slug ? 'border-[#00C4FF] bg-[#00C4FF]/15 text-[#00C4FF]' : 'border-white/15 text-slate-300 hover:border-white/40'}`}
              >
                {c.name}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Respuesta del superagente */}
        {(aiMessage || question) && (
          <div className="mb-6 rounded-3xl border border-[#00C4FF]/30 bg-gradient-to-br from-white to-[#00C4FF]/5 p-5 shadow-lg">
            <div className="flex items-start gap-3">
              <Homy size={56} state={aiBusy ? 'thinking' : 'happy'} />
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold uppercase tracking-wider text-[#00C4FF] mb-1">Superagente Homy</p>
                {aiMessage && <p className="text-[#0A2540] leading-relaxed">{aiMessage}</p>}
                {question && (
                  <div className="mt-3">
                    <p className="font-bold text-[#0A2540]">{question.pregunta}</p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {question.opciones.map((op) => (
                        <button key={op} onClick={() => { askAgent(op) }} className="rounded-full border border-[#1D63B8] text-[#1D63B8] px-4 py-1.5 text-sm font-semibold hover:bg-[#1D63B8] hover:text-white transition">
                          {op}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                {suggestions.length > 0 && !question && (
                  <div className="flex flex-wrap gap-2 mt-3">
                    {suggestions.map((s) => (
                      <button key={s} onClick={() => askAgent(s)} className="rounded-full bg-slate-100 hover:bg-[#00C4FF]/15 px-3.5 py-1.5 text-sm font-medium text-slate-600 transition">
                        {s}
                      </button>
                    ))}
                  </div>
                )}
                {steps && steps.length > 0 && (
                  <details className="mt-3">
                    <summary className="text-xs text-slate-400 cursor-pointer hover:text-slate-600">Ver razonamiento del agente ({steps.length} pasos)</summary>
                    <ol className="mt-2 space-y-1 text-xs text-slate-500">
                      {steps.map((st, i) => (
                        <li key={i}>▸ <b>{st.action}</b> → {st.found} resultados {st.thought && `· ${st.thought}`}</li>
                      ))}
                    </ol>
                  </details>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Ubicación + radio */}
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <MapPinIcon className="size-4 text-[#FF5A1F]" />
            {location.shared ? (
              <span>Mostrando resultados a <b className="text-[#0A2540]">{location.radiusKm} km</b> de tu ubicación</span>
            ) : (
              <button onClick={() => location.request().then((ok) => { if (ok && user) syncLocationToServer(location.lat!, location.lng!, location.radiusKm) })} className="text-[#1D63B8] font-bold hover:underline">
                Compartir ubicación para ver pines cercanos
              </button>
            )}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-xs font-semibold text-slate-500 uppercase">Radio: {location.radiusKm} km</label>
            <input
              type="range" min={1} max={100} value={location.radiusKm}
              onChange={(e) => location.setRadius(parseInt(e.target.value))}
              className="w-40 accent-[#00C4FF]"
              aria-label="Diámetro de alcance"
            />
          </div>
        </div>

        {/* Mapa */}
        <div className="mb-6">
          <button onClick={() => setShowMap(!showMap)} className="mb-2 text-sm font-bold text-[#1D63B8] hover:underline flex items-center gap-1">
            <Compass className="size-4" /> {showMap ? 'Ocultar' : 'Ver'} mapa de pines ({mapPins.length})
          </button>
          {showMap && (
            <MapView
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
          )}
        </div>

        {loading ? (
          <Loading text="Buscando en la base de HomIA…" />
        ) : !hasResults ? (
          <EmptyState
            icon="🤷"
            title="Sin resultados todavía"
            hint="Probá con otras palabras, ampliá el radio o preguntale a Homy para que interprete lo que necesitás."
          />
        ) : (
          <div className="space-y-8">
            {/* Profesionales */}
            {mode === 'cliente' && (
              <Section title={`Profesionales (${pros.length})`}>
                {pros.length === 0 ? (
                  <p className="text-sm text-slate-500">Todavía no hay profesionales con ese criterio.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {pros.map((p) => <ProCard key={p.id} pro={p} logged={!!user} />)}
                  </div>
                )}
              </Section>
            )}

            {/* Materiales */}
            {mode === 'profesional' && (
              <Section title={`Materiales en proveedores (${materials.length})`}>
                {materials.length === 0 ? (
                  <p className="text-sm text-slate-500">Ningún proveedor publica ese elemento todavía.</p>
                ) : (
                  <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {materials.map((m) => <MaterialCard key={m.stockId} m={m} logged={!!user} />)}
                  </div>
                )}
              </Section>
            )}

            {/* Comparables */}
            {comparables.length > 0 && (
              <Section title={`Comparables: mejor precio por elemento (${comparables.length})`}>
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {comparables.map((m) => <MaterialCard key={m.stockId} m={m} logged={!!user} highlight />)}
                </div>
              </Section>
            )}

            {/* Bolsa de trabajos */}
            <Section title={`Trabajos publicados (${jobs.length})`}>
              {jobs.length === 0 ? (
                <p className="text-sm text-slate-500">
                  {mode === 'profesional' ? 'No hay trabajos abiertos para ese criterio. Activá notificaciones en tu perfil.' : 'No hay trabajos publicados para esta búsqueda.'}
                </p>
              ) : (
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-extrabold text-[#0A2540] mb-3">{title}</h2>
      {children}
    </section>
  )
}

function ProCard({ pro, logged }: { pro: ProResult; logged: boolean }) {
  return (
    <button
      onClick={() => logged ? navigate(`/profesional/${pro.id}`) : gate()}
      className="text-left rounded-2xl homy-glass border border-slate-200 p-4 shadow-sm hover:shadow-lg hover:border-[#1D63B8]/50 transition group"
    >
      <div className="flex items-start gap-3">
        <UAvatar name={pro.displayName} size={46} />
        <div className="min-w-0 flex-1">
          <p className="font-bold text-[#0A2540] truncate group-hover:text-[#1D63B8] transition">{pro.companyName || pro.displayName}</p>
          <p className="text-xs text-slate-500 truncate capitalize">{pro.professions.join(' · ') || 'Profesional'}</p>
          <div className="flex items-center gap-2 mt-1">
            <UStars rating={pro.rating} />
            <span className="text-xs text-slate-500">{pro.rating > 0 ? `${pro.rating} (${pro.reviewsCount})` : 'Nuevo'}</span>
          </div>
        </div>
        {pro.verified && <span title="Verificado" className="text-[#00C4FF]">✓</span>}
      </div>
      <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
        <span>{pro.city || '—'}{pro.distanceKm !== undefined ? ` · ${formatDistance(pro.distanceKm)}` : ''}</span>
        <span>{pro.worksCount} obra{pro.worksCount === 1 ? '' : 's'}</span>
      </div>
      {!logged && <GateBar />}
    </button>
  )
}

function MaterialCard({ m, logged, highlight }: { m: MaterialResult; logged: boolean; highlight?: boolean }) {
  return (
    <button
      onClick={() => logged ? navigate(`/proveedor/${m.providerId}`) : gate()}
      className={`text-left rounded-2xl homy-glass border p-4 shadow-sm hover:shadow-lg transition ${highlight ? 'border-emerald-300 hover:border-emerald-400' : 'border-slate-200 hover:border-[#00A3E0]/60'}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-[#0A2540] leading-snug">{m.elementName}</p>
        <StatusBadge status={m.status} />
      </div>
      {m.brand && <p className="text-xs text-slate-400 mt-0.5">{m.brand}</p>}
      <p className="mt-2 text-xl font-extrabold text-[#16A34A]">{formatARS(m.price)}<span className="text-xs font-semibold text-slate-400"> /{m.unit}</span></p>
      <div className="flex items-center justify-between mt-2 text-xs text-slate-400">
        <span className="truncate">🏪 {m.providerName}{m.providerCity ? ` · ${m.providerCity}` : ''}{m.distanceKm !== undefined ? ` · ${formatDistance(m.distanceKm)}` : ''}</span>
        <span>stock: {m.quantity}</span>
      </div>
      {!logged && <GateBar />}
    </button>
  )
}

function JobCard({ job, logged }: { job: JobResult; logged: boolean }) {
  return (
    <button
      onClick={() => logged ? navigate(`/trabajo/${job.id}`) : gate()}
      className="text-left rounded-2xl homy-glass border border-slate-200 p-4 shadow-sm hover:shadow-lg hover:border-[#FF5A1F]/50 transition"
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-bold text-[#0A2540] leading-snug">{job.title}</p>
        <UrgencyBadge urgency={job.urgency} />
      </div>
      <p className="text-sm text-slate-500 mt-1 line-clamp-2">{job.description}</p>
      <div className="flex items-center justify-between mt-3 text-xs text-slate-400">
        <span>{job.budgetMin ? `Presupuesto: ${formatARS(job.budgetMin)}${job.budgetMax ? ` – ${formatARS(job.budgetMax)}` : '+'}` : 'A presupuesto'}</span>
        <span>{job.bidsCount} presupuesto{job.bidsCount === 1 ? '' : 's'}</span>
      </div>
      <div className="text-xs text-slate-400 mt-1">{job.city || ''}{job.distanceKm !== undefined ? ` · ${formatDistance(job.distanceKm)}` : ''}</div>
      {!logged && <GateBar />}
    </button>
  )
}

function GateBar() {
  return (
    <div className="mt-3 flex items-center gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-1.5 text-[11px] font-semibold text-amber-700">
      <Lock className="size-3" /> Registrate para ver esta tarjeta
    </div>
  )
}

function gate() {
  toast('Creá tu cuenta para abrir tarjetas', {
    description: 'Buscar y mirar es gratis. Los datos y acciones requieren cuenta.',
    action: { label: 'Registrarme', onClick: () => navigate('/registrarse?volver=/buscar') },
  })
}
