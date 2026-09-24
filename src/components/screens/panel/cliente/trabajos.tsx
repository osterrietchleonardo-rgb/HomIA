'use client'
// Mis trabajos (cliente): publicaciones + presupuestos recibidos
import { useCallback, useEffect, useRef, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, UrgencyBadge, UAvatar, UStars, Loading } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { apiFetch, NETWORK_ERROR } from '@/lib/api-client'
import { useCategories, categoryName } from '@/lib/categories'
import { Plus, Megaphone, Star, BadgeCheck, XCircle, RotateCcw, Clock, FileText, CalendarDays, FolderKanban, RefreshCw, WifiOff } from 'lucide-react'

type Bid = {
  id: string; amount: number; timelineDays: number; message: string | null; status: string; createdAt: string
  professional: {
    id: string; professions: string[]
    personType: string; companyName: string | null; rating: number; reviewsCount: number; worksCount: number; verified: boolean; subscription: string
    user?: { displayName?: string | null; avatarUrl?: string | null; verificationStatus?: string }
  }
}
type Job = {
  id: string; title: string; description: string; status: string; urgency: string; categorySlug: string
  budgetMin: number | null; budgetMax: number | null; createdAt: string
  selectedBidId?: string | null
  bids: Bid[]
}
type ProjectLite = { id: string; jobId: string | null }

const FILTERS = [
  { key: 'todas', label: 'Todas' },
  { key: 'abiertas', label: 'Abiertas' },
  { key: 'proyecto', label: 'En proyecto' },
  { key: 'cerradas', label: 'Cerradas' },
] as const
type FilterKey = (typeof FILTERS)[number]['key']
const FILTER_STATUS: Record<Exclude<FilterKey, 'todas'>, string[]> = {
  abiertas: ['abierto'],
  proyecto: ['en_proceso'],
  cerradas: ['cerrado', 'cancelado'],
}
const JOB_STATUS_LABEL: Record<string, string> = {
  abierto: 'abierto', en_proceso: 'en proyecto', cerrado: 'cerrado', cancelado: 'cancelado',
}

export default function MyJobs({ highlightId }: { highlightId?: string }) {
  const [jobs, setJobs] = useState<Job[]>([])
  const [projectByJob, setProjectByJob] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [closingId, setClosingId] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('todas')
  const { categories } = useCategories()
  const scrolledRef = useRef(false)

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [rJ, rP] = await Promise.all([
      apiFetch<{ jobs: Job[] }>('/api/jobs?mine=1', { silent: true }),
      apiFetch<{ asClient: ProjectLite[] }>('/api/projects?role=cliente', { silent: true }),
    ])
    if (rJ.ok) setJobs(rJ.data?.jobs || [])
    else setError(rJ.error || NETWORK_ERROR)
    if (rP.ok) {
      const map: Record<string, string> = {}
      for (const p of rP.data?.asClient || []) if (p.jobId && !map[p.jobId]) map[p.jobId] = p.id
      setProjectByJob(map)
    }
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  // llegó desde una notificación (#/panel/cliente/trabajos/<jobId>): resaltar y scrollear
  useEffect(() => {
    if (!highlightId || loading || scrolledRef.current) return
    const el = document.getElementById(`job-${highlightId}`)
    if (!el) return
    scrolledRef.current = true
    el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [highlightId, loading, jobs])

  async function decide(bidId: string, action: 'aceptar' | 'rechazar') {
    setBusy(true)
    try {
      const r = await apiFetch<{ project?: { id: string } }>(`/api/bids/${bidId}`, { method: 'PATCH', json: { action } })
      if (!r.ok) { if (r.status === 409) load(); return }
      if (action === 'aceptar' && r.data?.project) {
        toast.success('Presupuesto aceptado → proyecto creado')
        navigate(`/panel/cliente/proyectos/${r.data.project.id}`)
      } else {
        toast.success('Presupuesto rechazado')
        load()
      }
    } finally { setBusy(false) }
  }

  async function closeJob(jobId: string, status: 'cerrado' | 'abierto') {
    if (closingId) return
    setClosingId(jobId)
    try {
      const r = await apiFetch(`/api/jobs/${jobId}`, { method: 'PATCH', json: { status } })
      if (!r.ok) return
      toast.success(status === 'cerrado' ? 'Publicación cerrada' : 'Publicación reabierta')
      load()
    } finally { setClosingId(null) }
  }

  if (loading) return <Loading />

  const counts: Record<FilterKey, number> = {
    todas: jobs.length,
    abiertas: jobs.filter((j) => FILTER_STATUS.abiertas.includes(j.status)).length,
    proyecto: jobs.filter((j) => FILTER_STATUS.proyecto.includes(j.status)).length,
    cerradas: jobs.filter((j) => FILTER_STATUS.cerradas.includes(j.status)).length,
  }
  const visible = filter === 'todas' ? jobs : jobs.filter((j) => FILTER_STATUS[filter].includes(j.status))

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Publicaciones</span>
          <h1 className="homy-page-title mt-1.5">Mis trabajos</h1>
          <p className="homy-page-sub">Publicaciones y presupuestos que te mandaron</p>
        </div>
        <button onClick={() => navigate('/panel/cliente/publicar')} className="homy-btn-primary homy-focus px-5 py-3 text-sm sm:py-2.5">
          <Plus className="size-4" aria-hidden /> Publicar
        </button>
      </header>

      {error ? (
        <div className="homy-empty homy-glass-soft border border-dashed border-red-300/60" role="alert">
          <span className="homy-empty-icon homy-chip-orange" aria-hidden><WifiOff className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">No pudimos cargar tus trabajos</h3>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{error}</p>
          <button onClick={load} className="homy-btn-dark mt-5 px-5 py-3 text-sm sm:py-2.5"><RefreshCw className="size-4" aria-hidden /> Reintentar</button>
        </div>
      ) : jobs.length === 0 ? (
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <span className="homy-empty-icon homy-chip-orange" aria-hidden><Megaphone className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">Todavía no publicaste trabajos</h3>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">Publicá qué necesitás y empezá a recibir presupuestos.</p>
          <button onClick={() => navigate('/panel/cliente/publicar')} className="homy-btn-primary mt-5 px-5 py-3 text-sm sm:py-2.5">Publicar ahora</button>
        </div>
      ) : (
        <>
          <div className="mb-5 flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar publicaciones">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className="homy-tab homy-focus">
                {f.label}
                <span className={`rounded-full px-1.5 text-[0.68rem] font-extrabold tabular-nums ${filter === f.key ? 'bg-white/15' : 'bg-[#0A2540]/6'}`}>{counts[f.key]}</span>
              </button>
            ))}
          </div>

          <div className="space-y-4 homy-stagger">
            {visible.length === 0 && (
              <div className="homy-glass-soft rounded-2xl border border-dashed border-[#0A2540]/12 p-5 text-sm text-slate-500">
                No tenés publicaciones en este filtro.
              </div>
            )}
            {visible.map((job) => {
              const projectId = projectByJob[job.id]
              const highlighted = highlightId === job.id
              return (
              <article key={job.id} id={`job-${job.id}`}
                className={`homy-glass homy-card-glow overflow-hidden rounded-3xl scroll-mt-52 sm:scroll-mt-40 ${highlighted ? 'ring-2 ring-[#00C4FF] ring-offset-2 ring-offset-transparent' : ''}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#0A2540]/5 p-5 sm:p-6">
                  <div className="min-w-0 flex-1">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <StatusBadge status={job.status} label={JOB_STATUS_LABEL[job.status]} />
                      <UrgencyBadge urgency={job.urgency} />
                      <span className="text-[0.68rem] font-bold uppercase tracking-[0.09em] text-[#1D63B8]">{categoryName(categories, job.categorySlug)}</span>
                      <span className="homy-pill">
                        <FileText className="size-3 text-[#1D63B8]" aria-hidden />
                        {job.bids.length} presupuesto{job.bids.length === 1 ? '' : 's'}
                      </span>
                    </div>
                    <h3 className="text-lg font-extrabold leading-snug tracking-tight text-[#0A2540]">{job.title}</h3>
                    <p className="mt-1 flex flex-wrap items-center gap-1.5 text-sm text-slate-500">
                      <CalendarDays className="size-3.5 shrink-0 text-slate-400" aria-hidden />
                      {formatDate(job.createdAt)}
                      {job.budgetMin ? (
                        <> · presupuesto <span className="font-bold text-[#0A2540] tabular-nums">{formatARS(job.budgetMin)}{job.budgetMax ? `–${formatARS(job.budgetMax)}` : ''}</span></>
                      ) : null}
                    </p>
                  </div>
                  {job.status === 'abierto' && (
                    <button onClick={() => closeJob(job.id, 'cerrado')} disabled={closingId === job.id}
                      className="homy-glass-soft homy-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-slate-500 transition hover:text-red-500 disabled:opacity-50">
                      <XCircle className="size-3.5" aria-hidden /> {closingId === job.id ? 'Cerrando…' : 'Cerrar'}
                    </button>
                  )}
                  {job.status === 'cerrado' && !job.selectedBidId && (
                    <button onClick={() => closeJob(job.id, 'abierto')} disabled={closingId === job.id}
                      className="homy-glass-soft homy-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-[#1D63B8] transition hover:text-[#0A2540] disabled:opacity-50">
                      <RotateCcw className="size-3.5" aria-hidden /> {closingId === job.id ? 'Reabriendo…' : 'Reabrir'}
                    </button>
                  )}
                  {job.status === 'en_proceso' && (
                    projectId ? (
                      <button onClick={() => navigate(`/panel/cliente/proyectos/${projectId}`)} className="homy-btn-primary min-h-[40px] px-4 py-2 text-xs">
                        <FolderKanban className="size-3.5" aria-hidden /> Ver proyecto
                      </button>
                    ) : (
                      <button onClick={() => navigate('/panel/cliente/proyectos')} className="homy-glass-soft homy-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-[#1D63B8]">
                        <FolderKanban className="size-3.5" aria-hidden /> Ver proyectos
                      </button>
                    )
                  )}
                </div>
                <div className="divide-y divide-[#0A2540]/5">
                  {job.bids.length === 0 ? (
                    <div className="flex items-center gap-3 p-5">
                      <span className="homy-icon-chip homy-chip-blue size-9 shrink-0 [&_svg]:size-4" aria-hidden><Clock /></span>
                      <div>
                        <p className="text-sm font-bold text-[#0A2540]">Esperando presupuestos de profesionales…</p>
                        <p className="text-xs text-slate-400">Te van a llegar ofertas acá y por notificación.</p>
                      </div>
                    </div>
                  ) : (
                    job.bids.map((b) => (
                      <div key={b.id} className="flex flex-wrap items-start gap-3.5 p-4 transition-colors sm:p-5">
                        <UAvatar name={b.professional.user?.displayName || b.professional.companyName || ''} url={b.professional.user?.avatarUrl} size={44} />
                        <div className="min-w-[180px] flex-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <button onClick={() => navigate(`/profesional/${b.professional.id}`)} className="homy-focus rounded-lg font-bold text-[#0A2540] transition-colors hover:text-[#1D63B8]">
                              {b.professional.companyName || b.professional.user?.displayName}
                            </button>
                            {b.professional.user?.verificationStatus === 'verificado' && <BadgeCheck className="size-4 shrink-0 text-[#00A8E0]" aria-label="Verificado" />}
                          </div>
                          <div className="mt-0.5 flex flex-wrap items-center gap-2">
                            <UStars rating={b.professional.rating} />
                            <span className="text-xs text-slate-500">{b.professional.rating > 0 ? `${b.professional.rating} (${b.professional.reviewsCount})` : 'Nuevo'} · {b.professional.worksCount} obras</span>
                          </div>
                          {b.message && <p className="homy-glass-soft mt-2.5 rounded-xl p-2.5 text-sm leading-relaxed text-slate-600">{b.message}</p>}
                        </div>
                        <div className="ml-auto shrink-0 text-right">
                          <p className="text-xl font-extrabold text-[#FF5A1F] tabular-nums">{formatARS(b.amount)}</p>
                          <p className="mb-2 text-xs text-slate-400">en {b.timelineDays} días</p>
                          <StatusBadge status={b.status} />
                          {b.status === 'pendiente' && job.status === 'abierto' && (
                            <div className="mt-2.5 flex justify-end gap-1.5">
                              <button disabled={busy} onClick={() => decide(b.id, 'rechazar')} className="homy-glass-soft homy-focus rounded-full px-3.5 py-1.5 text-xs font-bold text-slate-600 transition hover:text-red-500 disabled:opacity-60">Rechazar</button>
                              <button disabled={busy} onClick={() => decide(b.id, 'aceptar')} className="homy-btn-primary px-3.5 py-1.5 text-xs">Aceptar</button>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </article>
              )
            })}
          </div>
        </>
      )}
    </div>
  )
}
