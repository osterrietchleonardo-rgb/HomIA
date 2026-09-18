'use client'
// Dashboard Profesional HomIA — resumen de actividad, próximas acciones y accesos rápidos
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, Loading } from '@/components/app/ui-bits'
import { formatARS, timeAgo } from '@/lib/format'
import {
  Search, Boxes, Users, ArrowRight, BriefcaseBusiness, ClipboardPen,
  FolderKanban, Star, Package, HardHat, Zap, LayoutGrid, MapPin,
} from 'lucide-react'
import { VerificationPrompt } from '../verificacion'

type Project = {
  id: string; title: string; status: string; stage: string
  laborCost: number; materialsCost: number; materialsPending: number; updatedAt: string
}
type SearchJob = { id: string; title: string; categorySlug: string; urgency: string; budgetMin: number | null; budgetMax: number | null; bidsCount: number; city: string | null; clientName: string }

export default function ProDashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [jobs, setJobs] = useState<SearchJob[]>([])
  const [myProfessions, setMyProfessions] = useState<string[]>([])
  const [rating, setRating] = useState(0)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [resP, resS, resMe] = await Promise.all([
          fetch('/api/projects'),
          fetch('/api/search?mode=profesional'),
          fetch('/api/profiles/me'),
        ])
        if (resP.ok) setProjects((await resP.json()).asPro || [])
        if (resS.ok) setJobs((await resS.json()).jobs || [])
        if (resMe.ok) {
          const me = await resMe.json()
          const pro = me.user?.professional
          if (pro) {
            try { setMyProfessions(JSON.parse(pro.professions || '[]')) } catch { /* professions vacío */ }
            setRating(pro.rating || 0)
          }
        }
      } finally { setLoading(false) }
    })()
  }, [])

  if (loading) return <Loading />

  const quotesSent = projects.filter((p) => p.stage === 'presupuesto' && p.status !== 'cancelado')
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

  return (
    <div className="homy-page">
      <VerificationPrompt role="profesional" />
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
        <Kpi
          glow="#1D63B8" valueColor="#1D63B8" chip="homy-chip-blue" icon={<ClipboardPen />}
          label="Presupuestos enviados" value={String(quotesSent.length)} hint="esperando respuesta"
        />
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
              title="Todo al día, campeón"
              hint="Cuando envíes presupuestos o propongas materiales, vas a ver acá lo que necesita tu atención."
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
      <p className="homy-kpi-value mt-2" style={valueColor ? { color: valueColor } : undefined}>{value}</p>
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
