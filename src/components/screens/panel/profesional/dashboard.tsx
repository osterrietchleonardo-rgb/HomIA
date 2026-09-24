'use client'
// Dashboard Profesional HomIA — resumen de actividad, próximas acciones y accesos rápidos
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, Loading, AutoFitValue } from '@/components/app/ui-bits'
import { formatARS, timeAgo } from '@/lib/format'
import {
  Search, Boxes, Users, ArrowRight, BriefcaseBusiness, ClipboardPen,
  FolderKanban, Star, Package, HardHat, Zap, LayoutGrid, MapPin, RefreshCw, WifiOff,
} from 'lucide-react'
import { VerificationPrompt } from '../verificacion'
import OnboardingCard, { isOnboardingDismissed, type OnboardingTask } from '../onboarding-card'
import { useSession } from '@/lib/store'
import { apiFetch, NETWORK_ERROR } from '@/lib/api-client'

type Project = {
  id: string; title: string; status: string; stage: string
  laborCost: number; materialsCost: number; materialsPending: number; updatedAt: string
}
type SearchJob = { id: string; title: string; categorySlug: string; urgency: string; budgetMin: number | null; budgetMax: number | null; bidsCount: number; city: string | null; clientName: string }
type MyBid = { id: string; amount: number; status: string; createdAt: string; job: { id: string; title: string } }

export default function ProDashboard() {
  const { user } = useSession()
  const [projects, setProjects] = useState<Project[]>([])
  const [jobs, setJobs] = useState<SearchJob[]>([])
  const [myProfessions, setMyProfessions] = useState<string[]>([])
  const [rating, setRating] = useState(0)
  const [profileBio, setProfileBio] = useState<string | null>(null)
  const [worksCount, setWorksCount] = useState<number | null>(null)
  const [bids, setBids] = useState<MyBid[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [checklistHidden, setChecklistHidden] = useState(() => isOnboardingDismissed('profesional'))

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const [rP, rS, rMe, rB, rW] = await Promise.all([
        apiFetch<{ asPro: Project[] }>('/api/projects?role=profesional', { silent: true }),
        apiFetch<{ jobs: SearchJob[] }>('/api/search?mode=profesional', { silent: true }),
        apiFetch<{ user?: { professional?: { professions?: string | string[]; rating?: number; bio?: string | null } } }>('/api/profiles/me', { silent: true }),
        apiFetch<{ bids: MyBid[] }>('/api/bids?mine=1', { silent: true }),
        // guía: obras cargadas (para el checklist)
        apiFetch<{ works: unknown[] }>('/api/works', { silent: true }),
      ])
      if (!rP.ok || !rB.ok) { setError(rP.error || rB.error || NETWORK_ERROR); return }
      setProjects(rP.data?.asPro || [])
      setBids(rB.data?.bids || [])
      if (rS.ok) setJobs(rS.data?.jobs || [])
      const pro = rMe.ok ? rMe.data?.user?.professional : null
      if (pro) {
        try { setMyProfessions(Array.isArray(pro.professions) ? pro.professions : JSON.parse(pro.professions || '[]')) } catch { /* professions vacío */ }
        setRating(pro.rating || 0)
        setProfileBio(pro.bio || null)
      }
      if (rW.ok) setWorksCount((rW.data?.works || []).length)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  if (loading) return <Loading />
  if (error) {
    return (
      <div className="homy-page">
        <div className="homy-empty homy-glass-soft border border-dashed border-red-300/60" role="alert">
          <span className="homy-empty-icon homy-chip-orange" aria-hidden><WifiOff className="size-7" /></span>
          <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">No pudimos cargar tu panel</h3>
          <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{error}</p>
          <div className="mt-5">
            <button onClick={load} className="homy-btn-dark min-h-[44px] px-5 py-2.5 text-sm"><RefreshCw className="size-4" aria-hidden /> Reintentar</button>
          </div>
        </div>
      </div>
    )
  }

  // ofertas reales de la bolsa (JobBid), no proyectos
  const pendingBids = bids.filter((b) => b.status === 'pendiente')
  const quotesSent = projects.filter((p) => p.stage === 'presupuesto' && p.status === 'activo')
  const active = projects.filter((p) => p.status === 'activo')
  const toApprove = projects.filter((p) => p.materialsPending > 0 && p.status === 'activo')
  const inMyField = myProfessions.length > 0 ? jobs.filter((j) => myProfessions.includes(j.categorySlug)) : jobs
  const pipelineValue = active.reduce((a, p) => a + p.laborCost + p.materialsCost, 0)

  // Próximas acciones: presupuestos esperando respuesta + materiales por aprobar + obras en curso
  const actions = [
    ...quotesSent.map((p) => ({ key: `q-${p.id}`, project: p, kind: 'quote' as const })),
    ...toApprove.map((p) => ({ key: `m-${p.id}`, project: p, kind: 'materials' as const })),
    ...active.filter((p) => p.stage === 'ejecucion' && p.materialsPending === 0).map((p) => ({ key: `e-${p.id}`, project: p, kind: 'work' as const })),
  ].slice(0, 6)

  // checklist guiado con estado real del sistema
  const onboardingTasks: OnboardingTask[] = [
    {
      id: 'verify', label: 'Verificá tu identidad',
      desc: 'Subí tu DNI: la IA lo valida y los clientes ven tu check verde antes de contratarte.',
      done: user?.verificationStatus === 'verificado', href: '/panel/profesional/verificacion', cta: 'Verificar ahora',
    },
    {
      id: 'profile', label: 'Completá tu perfil profesional',
      desc: 'Presentación, experiencia y rubros: los perfiles completos reciben hasta 3× más contactos.',
      done: !!profileBio, href: '/panel/profesional/perfil', cta: 'Completar perfil',
    },
    {
      id: 'works', label: 'Mostrá tus obras',
      desc: 'Subí fotos de trabajos terminados: son tu vitrina en el directorio y generan confianza.',
      done: (worksCount ?? 0) > 0, href: '/panel/profesional/obras', cta: 'Cargar obras',
    },
    {
      id: 'bids', label: 'Enviá tu primer presupuesto',
      desc: 'Mirá la bolsa de trabajos y respondé a un cliente: los clientes escriben primero, vos respondés con tu precio.',
      done: bids.length > 0, href: '/panel/profesional/bolsa', cta: 'Ver bolsa de trabajos',
    },
  ]

  return (
    <div className="homy-page">
      {/* un solo aviso de verificación: si el checklist está visible ya lo incluye */}
      {checklistHidden && <VerificationPrompt role="profesional" />}
      <OnboardingCard role="profesional" tasks={onboardingTasks} onDismiss={() => setChecklistHidden(true)} />
      {/* Encabezado */}
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Panel profesional</span>
          <h1 className="homy-page-title mt-1.5">Tu centro de mando</h1>
          <p className="homy-page-sub">Trabajos disponibles, proyectos en curso y materiales al mejor precio.</p>
        </div>
        <button onClick={() => navigate('/panel/profesional/bolsa')} className="homy-btn-primary min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
          <Search className="size-4" /> Buscar trabajos
        </button>
      </header>

      {/* KPIs */}
      <div className="homy-stagger grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <button type="button" onClick={() => navigate('/panel/profesional/presupuestos')} className="homy-focus rounded-3xl text-left">
          <Kpi
            glow="#1D63B8" valueColor="#1D63B8" chip="homy-chip-blue" icon={<ClipboardPen />}
            label="Presupuestos enviados" value={String(pendingBids.length)}
            hint={bids.length > 0 ? `pendientes · ${bids.length} en total` : 'todavía no ofertaste'}
          />
        </button>
        <Kpi
          glow="#10B981" chip="homy-chip-mint" icon={<FolderKanban />}
          label="Proyectos activos" value={String(active.length)}
          hint={pipelineValue > 0 ? `${formatARS(pipelineValue)} en cartera` : 'sin cartera activa por ahora'}
        />
        <Kpi
          glow="#FF5A1F" valueColor="#FF5A1F" chip="homy-chip-orange" icon={<BriefcaseBusiness />}
          label="Trabajos en tu rubro" value={String(inMyField.length)} hint="abiertos en la bolsa"
        />
        <Kpi
          glow="#FFC700" valueColor="#B98A00" chip="homy-chip-gold" icon={<Star />}
          label="Tu rating" value={rating > 0 ? rating.toFixed(1) : '—'}
          hint={rating > 0 ? 'según tus reseñas' : 'completá obras para recibir reseñas'}
        />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Próximas acciones */}
        <section>
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-orange size-7 [&_svg]:size-3.5" aria-hidden><Zap /></span>
              Próximas acciones
            </h2>
            {actions.length > 0 && (
              <span className="homy-pill"><span className="homy-pill-dot bg-amber-500" aria-hidden />{actions.length} pendiente{actions.length === 1 ? '' : 's'}</span>
            )}
          </div>
          {actions.length === 0 ? (
            <Empty
              icon={<BriefcaseBusiness className="size-7" />}
              title="Todo al día"
              hint={pendingBids.length > 0
                ? `Tenés ${pendingBids.length} oferta${pendingBids.length === 1 ? '' : 's'} esperando respuesta del cliente. Las seguís en Mis ofertas.`
                : 'Cuando tengas proyectos en curso o materiales por aprobar, vas a ver acá lo que necesita tu atención.'}
            />
          ) : (
            <div className="homy-stagger space-y-2">
              {actions.map(({ key, project: p, kind }) => (
                <button key={key} onClick={() => navigate(`/panel/profesional/proyectos/${p.id}`)}
                  className="homy-row group w-full text-left p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`homy-icon-chip size-9 shrink-0 [&_svg]:size-4 ${kind === 'quote' ? 'homy-chip-gold' : kind === 'materials' ? 'homy-chip-orange' : 'homy-chip-blue'}`} aria-hidden>
                      {kind === 'quote' ? <ClipboardPen /> : kind === 'materials' ? <Package /> : <HardHat />}
                    </span>
                    <div className="min-w-0">
                      <p className="font-bold text-[#0A2540] line-clamp-1">{p.title}</p>
                      <div className="flex items-center gap-2 mt-1 flex-wrap">
                        <StatusBadge status={p.stage === 'finalizado' ? 'finalizado' : 'activo'} label={p.stage} />
                        {kind === 'quote' && <span className="text-xs font-semibold text-amber-600">Esperando respuesta del cliente</span>}
                        {kind === 'materials' && <span className="text-xs font-semibold text-amber-600">{p.materialsPending} material(es) por aprobar</span>}
                        {kind === 'work' && <span className="text-xs font-semibold text-[#1D63B8]">Obra en ejecución</span>}
                        <span className="text-xs text-slate-400">{timeAgo(p.updatedAt)}</span>
                      </div>
                    </div>
                  </div>
                  <span className="homy-glass-soft grid size-8 shrink-0 place-items-center rounded-full text-slate-400 transition-colors group-hover:text-[#1D63B8]" aria-hidden>
                    <ArrowRight className="size-4" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* Accesos + oportunidades */}
        <section>
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-blue size-7 [&_svg]:size-3.5" aria-hidden><LayoutGrid /></span>
              Accesos rápidos
            </h2>
          </div>
          <div className="homy-stagger grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuickCard icon={Search} chip="homy-chip-orange" title="Bolsa de trabajos" desc="Trabajos abiertos cerca tuyo" onClick={() => navigate('/panel/profesional/bolsa')} />
            <QuickCard icon={Boxes} chip="homy-chip-blue" title="Materiales" desc="Precios y comparables entre proveedores" onClick={() => navigate('/panel/profesional/materiales')} />
            <QuickCard icon={Users} chip="homy-chip-mint" title="CRM" desc="Tu pipeline de clientes y tratos" onClick={() => navigate('/panel/profesional/crm')} />
          </div>

          <div className="homy-section-head mt-7">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-mint size-7 [&_svg]:size-3.5" aria-hidden><BriefcaseBusiness /></span>
              Oportunidades para vos
            </h2>
          </div>
          {inMyField.length === 0 ? (
            <div className="homy-glass-soft rounded-2xl border border-dashed border-[#0A2540]/12 p-5 text-sm text-slate-500 leading-relaxed">
              No hay trabajos abiertos en tu rubro ahora mismo. Volvé a chequear la bolsa pronto o ampliá tu radio de búsqueda.
            </div>
          ) : (
            <div className="homy-stagger space-y-2">
              {inMyField.slice(0, 4).map((j) => (
                <button key={j.id} onClick={() => navigate(`/trabajo/${j.id}`)}
                  className="homy-row w-full text-left p-4 group">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-[#0A2540] line-clamp-1">{j.title}</p>
                      <p className="text-xs text-slate-400 mt-1 flex items-center gap-1.5 flex-wrap">
                        <MapPin className="size-3.5 shrink-0" aria-hidden />
                        {j.city || '—'} · {j.bidsCount} presupuesto{j.bidsCount === 1 ? '' : 's'}
                      </p>
                    </div>
                    <span className="shrink-0 text-sm font-extrabold text-[#1D63B8] tabular-nums">
                      {j.budgetMin ? `desde ${formatARS(j.budgetMin)}` : 'A presupuesto'}
                    </span>
                  </div>
                </button>
              ))}
              <button onClick={() => navigate('/panel/profesional/bolsa')}
                className="homy-glass-soft w-full text-center rounded-2xl p-3.5 min-h-[44px] text-sm font-bold text-[#1D63B8] transition hover:text-[#0A2540] flex items-center justify-center gap-1.5">
                Ver todas en la bolsa <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/* KPI Signature: cifra protagonista + chip de gradiente + resplandor de esquina */
function Kpi({ label, value, hint, glow, valueColor, chip, icon }: {
  label: string; value: string; hint?: string; glow: string; valueColor?: string
  chip: string; icon: React.ReactNode
}) {
  return (
    <div className="homy-glass homy-kpi homy-lift" style={{ '--kpi-glow': glow } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-2">
        <p className="homy-kpi-label">{label}</p>
        <span className={`homy-icon-chip size-8 shrink-0 [&_svg]:size-4 ${chip}`} aria-hidden>{icon}</span>
      </div>
      <AutoFitValue className="homy-kpi-value mt-2" style={valueColor ? { color: valueColor } : undefined} value={value} />
      {hint && <p className="text-xs text-slate-400 mt-1.5 leading-snug line-clamp-1">{hint}</p>}
    </div>
  )
}

function QuickCard({ icon: Icon, chip, title, desc, onClick }: { icon: React.ComponentType<{ className?: string }>; chip: string; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="homy-glass homy-lift homy-card-glow rounded-2xl p-4 text-left">
      <span className={`homy-icon-chip size-10 [&_svg]:size-5 ${chip}`} aria-hidden>
        <Icon className="size-5" />
      </span>
      <p className="font-bold text-[#0A2540] mt-2.5 text-sm">{title}</p>
      <p className="text-xs text-slate-400 mt-0.5 leading-snug">{desc}</p>
    </button>
  )
}

/* Estado vacío del panel: icono flotante + copy claro */
function Empty({ icon, title, hint }: { icon: React.ReactNode; title: string; hint: string }) {
  return (
    <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
      <span className="homy-empty-icon homy-chip-blue" aria-hidden>{icon}</span>
      <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">{title}</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{hint}</p>
    </div>
  )
}
