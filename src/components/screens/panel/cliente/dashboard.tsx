'use client'
// Dashboard Cliente HomIA
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatCard, StatusBadge, UrgencyBadge, Loading, EmptyState, UAvatar } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
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

  return (
    <div>
      <PageHeader
        title="Tu panel"
        subtitle="Seguí tus trabajos, proyectos y pagos en un solo lugar"
        right={
          <button onClick={() => navigate('/panel/cliente/publicar')} className="homy-btn-primary px-5 py-2.5 text-sm">
            <Plus className="size-4" /> Publicar trabajo
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Trabajos abiertos" value={openJobs.length} accent="#FF5A1F" icon={<Megaphone />} tone="orange" />
        <StatCard label="Presupuestos a revisar" value={bidsToReview} accent="#1D63B8" icon={<FileText />} tone="blue" />
        <StatCard label="Proyectos activos" value={totalPending} accent="#00A3E0" icon={<FolderKanban />} tone="ai" />
        <StatCard label="Proyectos finalizados" value={projects.filter((p) => p.status === 'finalizado').length} accent="#16A34A" icon={<CircleCheck />} tone="mint" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <h2 className="font-extrabold text-[#0A2540] mb-3 flex items-center gap-2.5">
            <span className="homy-icon-chip homy-chip-orange size-8 shrink-0 [&_svg]:size-4" aria-hidden><Megaphone /></span>
            Tus publicaciones
          </h2>
          {jobs.length === 0 ? (
            <EmptyState icon={<Megaphone />} title="Todavía no publicaste trabajos"
              hint="Publicá qué necesitás y los profesionales de tu zona te mandan presupuestos."
              action={
                <button onClick={() => navigate('/panel/cliente/publicar')} className="homy-btn-primary px-5 py-2.5 text-sm">
                  <Wrench className="size-4" /> Publicar el primero
                </button>
              } />
          ) : (
            <div className="space-y-2.5">
              {jobs.slice(0, 5).map((j) => (
                <button key={j.id} onClick={() => navigate(`/panel/cliente/trabajos`)} className="group w-full text-left rounded-2xl homy-glass homy-lift homy-card-glow p-4 flex items-center gap-3.5">
                  <span className="homy-icon-chip homy-chip-blue size-10 shrink-0 [&_svg]:size-4" aria-hidden><Wrench /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[#0A2540] truncate group-hover:text-[#1D63B8] transition-colors">{j.title}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap"><StatusBadge status={j.status} /><UrgencyBadge urgency={j.urgency} /><span className="text-xs text-slate-400">{j.bids.length} presupuesto{j.bids.length === 1 ? '' : 's'}</span></div>
                  </div>
                  <span className="grid size-8 place-items-center rounded-full homy-glass-soft shrink-0" aria-hidden>
                    <ArrowRight className="size-4 text-[#1D63B8] transition-transform duration-300 group-hover:translate-x-0.5" />
                  </span>
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-extrabold text-[#0A2540] mb-3 flex items-center gap-2.5">
            <span className="homy-icon-chip homy-chip-ai size-8 shrink-0 [&_svg]:size-4" aria-hidden><FolderKanban /></span>
            Tus proyectos
          </h2>
          {projects.length === 0 ? (
            <EmptyState icon={<FolderKanban />} title="Sin proyectos todavía"
              hint="Cuando aceptes un presupuesto se crea un proyecto acá: aprobás materiales, seguís etapas y pagás con Mercado Pago."
              action={
                <button onClick={() => navigate('/panel/cliente/trabajos')} className="homy-btn-dark px-5 py-2.5 text-sm">
                  Revisar presupuestos
                </button>
              } />
          ) : (
            <div className="space-y-2.5">
              {projects.slice(0, 5).map((p) => (
                <button key={p.id} onClick={() => navigate(`/panel/cliente/proyectos/${p.id}`)} className="group w-full text-left rounded-2xl homy-glass homy-lift homy-card-glow p-4 flex items-center gap-3.5">
                  <span className="homy-icon-chip homy-chip-ai size-10 shrink-0 [&_svg]:size-4" aria-hidden><FolderKanban /></span>
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[#0A2540] truncate group-hover:text-[#1D63B8] transition-colors">{p.title}</p>
                    <div className="flex items-center gap-2 mt-1.5 flex-wrap">
                      <StatusBadge status={p.stage === 'finalizado' ? 'finalizado' : 'activo'} label={p.stage} />
                      {p.materialsPending > 0 && (
                        <span className="homy-pill">
                          <span className="homy-pill-dot bg-amber-500" aria-hidden />
                          {p.materialsPending} material(es) por aprobar
                        </span>
                      )}
                    </div>
                  </div>
                  <p className="text-sm font-extrabold text-[#0A2540] tabular-nums shrink-0">{formatARS(p.laborCost + p.materialsCost)}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
