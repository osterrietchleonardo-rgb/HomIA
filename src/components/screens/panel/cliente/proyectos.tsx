'use client'
// Proyectos del cliente: lista + aprobación de materiales en detalle
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatusBadge, EmptyState, Loading, UAvatar } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { FolderKanban } from 'lucide-react'

type Project = {
  id: string; title: string; stage: string; status: string; laborCost: number; materialsCost: number
  materialsPending: number; updatedAt: string
  pro?: { user?: { displayName: string; avatarUrl: string | null } }
  invoices?: { id: string; number: string; total: number; status: string }[]
}

const STAGES = ['presupuesto', 'materiales', 'ejecucion', 'revision', 'finalizado']

export default function ClientProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/projects?role=cliente')
        if (res.ok) setProjects((await res.json()).asClient || [])
      } finally { setLoading(false) }
    })()
  }, [])

  if (loading) return <Loading />

  return (
    <div className="max-w-4xl">
      <PageHeader title="Mis proyectos" subtitle="Seguimiento de obras con tu profesional" />
      {projects.length === 0 ? (
        <EmptyState icon={<FolderKanban />} title="Sin proyectos todavía"
          hint="Cuando aceptes un presupuesto de un profesional, acá vas a seguir el avance: materiales, etapas, facturas y pago con Mercado Pago." />
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <button key={p.id} onClick={() => navigate(`/panel/cliente/proyectos/${p.id}`)}
              className="group w-full text-left rounded-2xl homy-glass homy-lift homy-card-glow p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1 flex items-start gap-3.5">
                  <span className="homy-icon-chip homy-chip-ai size-10 shrink-0 [&_svg]:size-4" aria-hidden><FolderKanban /></span>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <StatusBadge status={p.status === 'finalizado' ? 'finalizado' : 'activo'} />
                      {p.materialsPending > 0 && (
                        <span className="homy-pill">
                          <span className="homy-pill-dot bg-amber-500" aria-hidden />
                          {p.materialsPending} material{p.materialsPending > 1 ? 'es' : ''} por aprobar
                        </span>
                      )}
                    </div>
                    <h3 className="font-extrabold text-[#0A2540] tracking-tight group-hover:text-[#1D63B8] transition-colors">{p.title}</h3>
                    {p.pro?.user && (
                      <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                        <UAvatar name={p.pro.user.displayName} url={p.pro.user.avatarUrl} size={22} />
                        {p.pro.user.displayName}
                      </p>
                    )}
                    <p className="text-xs text-slate-400 mt-1.5">Actualizado {formatDate(p.updatedAt)}</p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[0.68rem] text-slate-400 uppercase tracking-[0.09em] font-bold">Total</p>
                  <p className="text-xl font-extrabold text-[#0A2540] tabular-nums">{formatARS(p.laborCost + p.materialsCost)}</p>
                  <div className="flex gap-1 mt-2 justify-end">
                    {STAGES.map((s) => (
                      <span key={s} title={s} className={`h-1.5 w-8 rounded-full transition-colors ${STAGES.indexOf(p.stage) >= STAGES.indexOf(s) ? 'bg-gradient-to-r from-[#1D63B8] to-[#00C4FF]' : 'bg-[#0A2540]/10'}`} />
                    ))}
                  </div>
                </div>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
