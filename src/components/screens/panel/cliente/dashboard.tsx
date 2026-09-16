'use client'
// Dashboard Cliente HomIA
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatCard, StatusBadge, UrgencyBadge, Loading, EmptyState, UAvatar } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { Plus, ArrowRight, Wrench } from 'lucide-react'

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
          <button onClick={() => navigate('/panel/cliente/publicar')} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white font-bold px-5 py-2.5 flex items-center gap-2 transition shadow-lg shadow-[#FF5A1F]/20">
            <Plus className="size-4" /> Publicar trabajo
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Trabajos abiertos" value={openJobs.length} accent="#FF5A1F" />
        <StatCard label="Presupuestos a revisar" value={bidsToReview} accent="#1D63B8" />
        <StatCard label="Proyectos activos" value={totalPending} accent="#00A3E0" />
        <StatCard label="Proyectos finalizados" value={projects.filter((p) => p.status === 'finalizado').length} accent="#16A34A" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <h2 className="font-extrabold text-[#0A2540] mb-3">Tus publicaciones</h2>
          {jobs.length === 0 ? (
            <div className="rounded-2xl bg-white border border-slate-200 p-6">
              <EmptyState icon="📢" title="Todavía no publicaste trabajos"
                hint="Publicá qué necesitás y los profesionales de tu zona te mandan presupuestos."
                action={
                  <button onClick={() => navigate('/panel/cliente/publicar')} className="rounded-xl bg-[#FF5A1F] text-white font-bold px-5 py-2.5 flex items-center gap-2 mx-auto">
                    <Wrench className="size-4" /> Publicar el primero
                  </button>
                } />
            </div>
          ) : (
            <div className="space-y-2">
              {jobs.slice(0, 5).map((j) => (
                <button key={j.id} onClick={() => navigate(`/panel/cliente/trabajos`)} className="w-full text-left rounded-2xl bg-white border border-slate-200 p-4 hover:shadow-md transition flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0A2540] truncate">{j.title}</p>
                    <div className="flex items-center gap-2 mt-1"><StatusBadge status={j.status} /><UrgencyBadge urgency={j.urgency} /><span className="text-xs text-slate-400">{j.bids.length} presupuesto{j.bids.length === 1 ? '' : 's'}</span></div>
                  </div>
                  <ArrowRight className="size-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-extrabold text-[#0A2540] mb-3">Tus proyectos</h2>
          {projects.length === 0 ? (
            <div className="rounded-2xl bg-white border border-slate-200 p-6 text-sm text-slate-500">
              Cuando aceptes un presupuesto se crea un proyecto acá: aprobás materiales, seguís etapas y pagás con Mercado Pago.
            </div>
          ) : (
            <div className="space-y-2">
              {projects.slice(0, 5).map((p) => (
                <button key={p.id} onClick={() => navigate(`/panel/cliente/proyectos/${p.id}`)} className="w-full text-left rounded-2xl bg-white border border-slate-200 p-4 hover:shadow-md transition flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0A2540] truncate">{p.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <StatusBadge status={p.stage === 'finalizado' ? 'finalizado' : 'activo'} label={p.stage} />
                      {p.materialsPending > 0 && <span className="text-xs font-bold text-amber-600">{p.materialsPending} material(es) por aprobar</span>}
                    </div>
                  </div>
                  <p className="text-sm font-extrabold text-[#0A2540] shrink-0">{formatARS(p.laborCost + p.materialsCost)}</p>
                </button>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
