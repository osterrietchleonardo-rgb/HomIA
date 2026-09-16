'use client'
// Proyectos del cliente: lista + aprobación de materiales en detalle
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatusBadge, EmptyState, Loading, UAvatar } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'

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
        <div className="rounded-2xl homy-glass border border-slate-200 p-6">
          <EmptyState icon="📁" title="Sin proyectos todavía"
            hint="Cuando aceptes un presupuesto de un profesional, acá vas a seguir el avance: materiales, etapas, facturas y pago con Mercado Pago." />
        </div>
      ) : (
        <div className="space-y-3">
          {projects.map((p) => (
            <button key={p.id} onClick={() => navigate(`/panel/cliente/proyectos/${p.id}`)}
              className="w-full text-left rounded-2xl homy-glass border border-slate-200 p-5 hover:shadow-lg transition">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <StatusBadge status={p.status === 'finalizado' ? 'finalizado' : 'activo'} />
                    {p.materialsPending > 0 && (
                      <span className="rounded-full bg-amber-100 text-amber-700 text-xs font-bold px-2.5 py-0.5">
                        {p.materialsPending} material{p.materialsPending > 1 ? 'es' : ''} por aprobar
                      </span>
                    )}
                  </div>
                  <h3 className="font-extrabold text-[#0A2540]">{p.title}</h3>
                  {p.pro?.user && (
                    <p className="text-sm text-slate-500 flex items-center gap-2 mt-1">
                      <UAvatar name={p.pro.user.displayName} url={p.pro.user.avatarUrl} size={22} />
                      {p.pro.user.displayName}
                    </p>
                  )}
                  <p className="text-xs text-slate-400 mt-1">Actualizado {formatDate(p.updatedAt)}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-xs text-slate-400 uppercase font-semibold">Total</p>
                  <p className="text-xl font-extrabold text-[#0A2540]">{formatARS(p.laborCost + p.materialsCost)}</p>
                  <div className="flex gap-1 mt-2 justify-end">
                    {STAGES.map((s) => (
                      <span key={s} title={s} className={`h-1.5 w-8 rounded-full ${STAGES.indexOf(p.stage) >= STAGES.indexOf(s) ? 'bg-[#1D63B8]' : 'bg-slate-200'}`} />
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
