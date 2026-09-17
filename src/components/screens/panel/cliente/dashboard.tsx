'use client'
// Dashboard Cliente HomIA — vista general: KPIs, publicaciones y proyectos
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, UrgencyBadge, Loading } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { Plus, ArrowRight, Wrench, Megaphone, FileText, FolderKanban, CircleCheck } from 'lucide-react'

type Project = { id: string; title: string; stage: string; status: string; laborCost: number; materialsCost: number; materialsPending: number; updatedAt: string }
type Job = { id: string; title: string; status: string; urgency: string; bids: { id: string; amount: number; professional: { user: { displayName: string } } }[]; createdAt: string }

export default function ClientDashboard() {
  const [projects, setProjects] = useState<Project[]>([])
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [resP, resJ] = await Promise.all([fetch('/api/projects?role=cliente'), fetch('/api/jobs?mine=1')])
        if (resP.ok) setProjects((await resP.json()).asClient || [])
        if (resJ.ok) setJobs((await resJ.json()).jobs || [])
      } finally { setLoading(false) }
    })()
  }, [])

  if (loading) return <Loading />
  const openJobs = jobs.filter((j) => j.status === 'abierto')
  const totalPending = projects.filter((p) => p.status === 'activo').length
  const bidsToReview = openJobs.reduce((a, j) => a + j.bids.length, 0)
  const doneProjects = projects.filter((p) => p.status === 'finalizado').length

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Panel del cliente</span>
          <h1 className="homy-page-title mt-1.5">Tu panel</h1>
          <p className="homy-page-sub">Seguí tus trabajos, proyectos y pagos en un solo lugar</p>
        </div>
        <button onClick={() => navigate('/panel/cliente/publicar')} className="homy-btn-primary homy-focus px-5 py-3 text-sm sm:py-2.5">
          <Plus className="size-4" aria-hidden /> Publicar trabajo
        </button>
      </header>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-7 homy-stagger">
        <Kpi label="Trabajos abiertos" value={openJobs.length} hint={`${jobs.length} publicación${jobs.length === 1 ? '' : 'es'} en total`} chip="homy-chip-orange" glow="#FF5A1F" icon={<Megaphone />} onClick={() => navigate('/panel/cliente/trabajos')} />
        <Kpi label="Presupuestos a revisar" value={bidsToReview} hint={`en ${openJobs.length} publicación${openJobs.length === 1 ? '' : 'es'} abierta${openJobs.length === 1 ? '' : 's'}`} chip="homy-chip-blue" glow="#1D63B8" icon={<FileText />} onClick={() => navigate('/panel/cliente/trabajos')} />
        <Kpi label="Proyectos activos" value={totalPending} hint={totalPending > 0 ? 'con avance en curso' : 'aceptá un presupuesto para empezar'} chip="homy-chip-ai" glow="#00C4FF" icon={<FolderKanban />} onClick={() => navigate('/panel/cliente/proyectos')} />
        <Kpi label="Proyectos finalizados" value={doneProjects} hint={doneProjects > 0 ? 'obra completa' : 'van a aparecer acá'} chip="homy-chip-mint" glow="#10B981" icon={<CircleCheck />} onClick={() => navigate('/panel/cliente/proyectos')} />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-orange size-8 shrink-0 [&_svg]:size-4" aria-hidden><Megaphone /></span>
              Tus publicaciones
            </h2>
            {jobs.length > 0 && (
              <button onClick={() => navigate('/panel/cliente/trabajos')} className="homy-glass-soft homy-focus inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-slate-500 transition hover:text-[#0A2540]">
                Ver todas <ArrowRight className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
          {jobs.length === 0 ? (
            <Empty
              icon={<Megaphone className="size-6" />} chip="homy-chip-orange"
              title="Todavía no publicaste trabajos"
              copy="Publicá qué necesitás y los profesionales de tu zona te mandan presupuestos."
              action={
                <button onClick={() => navigate('/panel/cliente/publicar')} className="homy-btn-primary px-5 py-3 text-sm sm:py-2.5">
                  <Wrench className="size-4" aria-hidden /> Publicar el primero
                </button>
              }
            />
          ) : (
            <div className="space-y-2.5 homy-stagger">
              {jobs.slice(0, 5).map((j) => (
                <button key={j.id} onClick={() => navigate('/panel/cliente/trabajos')} className="homy-row group flex w-full items-center gap-3.5 p-4 text-left">
                  <span className="homy-icon-chip homy-chip-blue size-10 shrink-0 [&_svg]:size-4" aria-hidden><Wrench /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[#0A2540] line-clamp-1 transition-colors group-hover:text-[#1D63B8]">{j.title}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StatusBadge status={j.status} />
                      <UrgencyBadge urgency={j.urgency} />
                      <span className="homy-pill">
                        <FileText className="size-3 text-[#1D63B8]" aria-hidden />
                        {j.bids.length} presupuesto{j.bids.length === 1 ? '' : 's'}
                      </span>
                    </span>
                  </span>
                  <span className="grid size-8 shrink-0 place-items-center rounded-full homy-glass-soft" aria-hidden>
                    <ArrowRight className="size-4 text-[#1D63B8] transition-transform duration-300 group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-ai size-8 shrink-0 [&_svg]:size-4" aria-hidden><FolderKanban /></span>
              Tus proyectos
            </h2>
            {projects.length > 0 && (
              <button onClick={() => navigate('/panel/cliente/proyectos')} className="homy-glass-soft homy-focus inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold text-slate-500 transition hover:text-[#0A2540]">
                Ver todos <ArrowRight className="size-3.5" aria-hidden />
              </button>
            )}
          </div>
          {projects.length === 0 ? (
            <Empty
              icon={<FolderKanban className="size-6" />} chip="homy-chip-blue"
              title="Sin proyectos todavía"
              copy="Cuando aceptes un presupuesto se crea un proyecto acá: aprobás materiales, seguís etapas y pagás con Mercado Pago."
              action={
                <button onClick={() => navigate('/panel/cliente/trabajos')} className="homy-btn-dark px-5 py-3 text-sm sm:py-2.5">
                  Revisar presupuestos
                </button>
              }
            />
          ) : (
            <div className="space-y-2.5 homy-stagger">
              {projects.slice(0, 5).map((p) => (
                <button key={p.id} onClick={() => navigate(`/panel/cliente/proyectos/${p.id}`)} className="homy-row group flex w-full items-center gap-3.5 p-4 text-left">
                  <span className="homy-icon-chip homy-chip-ai size-10 shrink-0 [&_svg]:size-4" aria-hidden><FolderKanban /></span>
                  <span className="min-w-0 flex-1">
                    <span className="block font-bold text-[#0A2540] line-clamp-1 transition-colors group-hover:text-[#1D63B8]">{p.title}</span>
                    <span className="mt-1.5 flex flex-wrap items-center gap-2">
                      <StatusBadge status={p.stage === 'finalizado' ? 'finalizado' : 'activo'} label={p.stage} />
                      {p.materialsPending > 0 && (
                        <span className="homy-pill">
                          <span className="homy-pill-dot bg-amber-500" aria-hidden />
                          {p.materialsPending} material(es) por aprobar
                        </span>
                      )}
                    </span>
                  </span>
                  <span className="shrink-0 text-sm font-extrabold text-[#0A2540] tabular-nums">{formatARS(p.laborCost + p.materialsCost)}</span>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

/* KPI de vidrio: chip de icono + cifra protagonista + contexto real */
function Kpi({ label, value, hint, chip, glow, icon, onClick }: {
  label: string; value: number; hint: string; chip: string; glow: string
  icon: React.ReactNode; onClick: () => void
}) {
  return (
    <button type="button" onClick={onClick} style={{ '--kpi-glow': glow } as React.CSSProperties}
      className="homy-glass homy-lift homy-kpi homy-focus group w-full text-left">
      <span className="flex items-start justify-between gap-2">
        <span className={`homy-icon-chip ${chip} size-9 shrink-0 [&_svg]:size-4`} aria-hidden>{icon}</span>
        <ArrowRight className="size-4 text-[#0A2540]/20 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-[#1D63B8]" aria-hidden />
      </span>
      <span className="homy-kpi-value mt-3 block">{value}</span>
      <span className="homy-kpi-label block">{label}</span>
      <span className="mt-1 block text-xs font-medium leading-snug text-slate-400">{hint}</span>
    </button>
  )
}

/* Estado vacío del sistema: icono en chip + título + copy útil + CTA */
function Empty({ icon, chip, title, copy, action }: {
  icon: React.ReactNode; chip: string; title: string; copy: string; action?: React.ReactNode
}) {
  return (
    <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
      <span className={`homy-empty-icon ${chip}`} aria-hidden>{icon}</span>
      <h3 className="font-extrabold tracking-tight text-[#0A2540]">{title}</h3>
      <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{copy}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
