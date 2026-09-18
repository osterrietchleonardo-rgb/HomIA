'use client'
// Proyectos del cliente: lista + aprobación de materiales en detalle
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, Loading, UAvatar } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { FolderKanban, Star } from 'lucide-react'

const STAGES = ['presupuesto', 'materiales', 'ejecucion', 'revision', 'finalizado']

type Project = {
  id: string; title: string; stage: string; status: string; laborCost: number; materialsCost: number
  materialsPending: number; updatedAt: string; canReview?: boolean
  pro?: { user?: { displayName: string; avatarUrl: string | null } }
  invoices?: { id: string; number: string; total: number; status: string }[]
}

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
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Obras</span>
          <h1 className="homy-page-title mt-1.5">Mis proyectos</h1>
          <p className="homy-page-sub">Seguimiento de obras con tu profesional</p>
        </div>
      </header>

      {projects.length === 0 ? (
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <span className="homy-empty-icon homy-chip-blue" aria-hidden><FolderKanban className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">Sin proyectos todavía</h3>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
            Cuando aceptes un presupuesto de un profesional, acá vas a seguir el avance: materiales, etapas, facturas y pago con Mercado Pago.
          </p>
          <button onClick={() => navigate('/panel/cliente/trabajos')} className="homy-btn-primary mt-5 px-5 py-3 text-sm sm:py-2.5">Ver presupuestos recibidos</button>
        </div>
      ) : (
        <div className="space-y-3.5 homy-stagger">
          {projects.map((p) => {
            const stageIdx = Math.max(STAGES.indexOf(p.stage), 0)
            const progress = ((stageIdx + 1) / STAGES.length) * 100
            return (
              <button key={p.id} onClick={() => navigate(`/panel/cliente/proyectos/${p.id}`)}
                className="homy-glass homy-lift homy-card-glow group w-full rounded-3xl p-5 text-left">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3.5">
                    <span className="homy-icon-chip homy-chip-ai size-10 shrink-0 [&_svg]:size-4" aria-hidden><FolderKanban /></span>
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <StatusBadge status={p.status === 'finalizado' ? 'finalizado' : 'activo'} />
                        {p.materialsPending > 0 && (
                          <span className="homy-pill">
                            <span className="homy-pill-dot bg-amber-500" aria-hidden />
                            {p.materialsPending} material{p.materialsPending > 1 ? 'es' : ''} por aprobar
                          </span>
                        )}
                        {p.canReview && (
                          <span className="homy-pill" title="Abrí el proyecto para calificar al profesional y al proveedor">
                            <Star className="size-3 text-[#FFC700] fill-[#FFC700]" aria-hidden />
                            Dejá tu reseña
                          </span>
                        )}
                      </div>
                      <h3 className="font-extrabold tracking-tight text-[#0A2540] transition-colors group-hover:text-[#1D63B8]">{p.title}</h3>
                      {p.pro?.user && (
                        <p className="mt-1 flex items-center gap-2 text-sm text-slate-500">
                          <UAvatar name={p.pro.user.displayName} url={p.pro.user.avatarUrl} size={22} />
                          {p.pro.user.displayName}
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-slate-400">Actualizado {formatDate(p.updatedAt)}</p>
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.09em] text-slate-400">Total</p>
                    <p className="text-xl font-extrabold text-[#0A2540] tabular-nums">{formatARS(p.laborCost + p.materialsCost)}</p>
                  </div>
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold capitalize text-[#0A2540]">{p.stage}</span>
                    <span className="font-semibold text-slate-400 tabular-nums">Etapa {stageIdx + 1} de {STAGES.length}</span>
                  </div>
                  <div className="homy-progress" role="img" aria-label={`Progreso: etapa ${stageIdx + 1} de ${STAGES.length}`}>
                    <i style={{ width: `${progress}%` }} />
                  </div>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
