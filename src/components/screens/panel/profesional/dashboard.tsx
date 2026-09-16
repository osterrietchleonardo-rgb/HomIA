'use client'
// Dashboard Profesional HomIA — resumen de actividad, próximas acciones y accesos rápidos
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatCard, StatusBadge, Loading, EmptyState } from '@/components/app/ui-bits'
import { formatARS, timeAgo } from '@/lib/format'
import { Search, Boxes, Users, ArrowRight } from 'lucide-react'

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
    <div>
      <PageHeader
        title="Tu panel profesional"
        subtitle="Trabajos disponibles, proyectos en curso y materiales al mejor precio"
        right={
          <button onClick={() => navigate('/panel/profesional/bolsa')} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white font-bold px-5 py-2.5 flex items-center gap-2 transition shadow-lg shadow-[#FF5A1F]/20">
            <Search className="size-4" /> Buscar trabajos
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Presupuestos enviados" value={quotesSent.length} hint="esperando respuesta" accent="#1D63B8" />
        <StatCard label="Proyectos activos" value={active.length} hint={pipelineValue > 0 ? formatARS(pipelineValue) + ' en cartera' : undefined} accent="#16A34A" />
        <StatCard label="Trabajos en tu rubro" value={inMyField.length} hint="abiertos en la bolsa" accent="#FF5A1F" />
        <StatCard label="Tu rating" value={rating > 0 ? rating.toFixed(1) : '—'} hint={rating > 0 ? '⭐ según tus reseñas' : 'completá obras para recibir reseñas'} accent="#FFC700" />
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section>
          <h2 className="font-extrabold text-[#0A2540] mb-3">Próximas acciones</h2>
          {actions.length === 0 ? (
            <div className="rounded-2xl bg-white border border-slate-200 p-6">
              <EmptyState icon="🧰" title="Todo al día, campeón" hint="Cuando envíes presupuestos o propongas materiales, vas a ver acá lo que necesita tu atención." />
            </div>
          ) : (
            <div className="space-y-2">
              {actions.map(({ key, project: p, kind }) => (
                <button key={key} onClick={() => navigate(`/panel/profesional/proyectos/${p.id}`)} className="w-full text-left rounded-2xl bg-white border border-slate-200 p-4 hover:shadow-md transition flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0A2540] truncate">{p.title}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <StatusBadge status={p.stage === 'finalizado' ? 'finalizado' : 'activo'} label={p.stage} />
                      {kind === 'quote' && <span className="text-xs font-semibold text-amber-600">Esperando respuesta del cliente</span>}
                      {kind === 'materials' && <span className="text-xs font-semibold text-amber-600">{p.materialsPending} material(es) por aprobar</span>}
                      {kind === 'work' && <span className="text-xs font-semibold text-[#1D63B8]">Obra en ejecución</span>}
                      <span className="text-xs text-slate-400">{timeAgo(p.updatedAt)}</span>
                    </div>
                  </div>
                  <ArrowRight className="size-4 text-slate-300 shrink-0" />
                </button>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="font-extrabold text-[#0A2540] mb-3">Accesos rápidos</h2>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <QuickCard icon={Search} title="Bolsa de trabajos" desc="Trabajos abiertos cerca tuyo" onClick={() => navigate('/panel/profesional/bolsa')} />
            <QuickCard icon={Boxes} title="Materiales" desc="Precios y comparables entre proveedores" onClick={() => navigate('/panel/profesional/materiales')} />
            <QuickCard icon={Users} title="CRM" desc="Tu pipeline de clientes y tratos" onClick={() => navigate('/panel/profesional/crm')} />
          </div>

          <h2 className="font-extrabold text-[#0A2540] mb-3 mt-6">Trabajos para vos</h2>
          {inMyField.length === 0 ? (
            <div className="rounded-2xl bg-white border border-slate-200 p-6 text-sm text-slate-500">
              No hay trabajos abiertos en tu rubro ahora mismo. Volvé a chequear la bolsa pronto o ampliá tu radio de búsqueda.
            </div>
          ) : (
            <div className="space-y-2">
              {inMyField.slice(0, 4).map((j) => (
                <button key={j.id} onClick={() => navigate(`/trabajo/${j.id}`)} className="w-full text-left rounded-2xl bg-white border border-slate-200 p-4 hover:shadow-md transition">
                  <p className="font-bold text-[#0A2540] truncate">{j.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {j.city || '—'} · {j.bidsCount} presupuesto{j.bidsCount === 1 ? '' : 's'}
                    {j.budgetMin ? ` · desde ${formatARS(j.budgetMin)}` : ' · a presupuesto'}
                  </p>
                </button>
              ))}
              <button onClick={() => navigate('/panel/profesional/bolsa')} className="w-full text-center rounded-2xl border-2 border-dashed border-slate-200 p-3.5 text-sm font-bold text-[#1D63B8] hover:border-[#1D63B8]/40 hover:bg-[#1D63B8]/5 transition">
                Ver todos en la bolsa <ArrowRight className="inline size-4" />
              </button>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function QuickCard({ icon: Icon, title, desc, onClick }: { icon: React.ComponentType<{ className?: string }>; title: string; desc: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="rounded-2xl bg-white border border-slate-200 p-4 shadow-sm hover:shadow-md hover:border-[#1D63B8]/40 transition text-left group">
      <span className="inline-flex rounded-xl bg-[#1D63B8]/10 p-2.5 text-[#1D63B8] group-hover:bg-[#1D63B8] group-hover:text-white transition">
        <Icon className="size-5" />
      </span>
      <p className="font-bold text-[#0A2540] mt-2.5 text-sm">{title}</p>
      <p className="text-xs text-slate-400 mt-0.5">{desc}</p>
    </button>
  )
}
