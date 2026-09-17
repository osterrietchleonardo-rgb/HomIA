'use client'
// Proyectos del profesional: lista con cliente, etapa, montos y materiales por aprobar
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatusBadge, UAvatar, Loading, EmptyState } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { ArrowRight, FolderOpen } from 'lucide-react'

type Project = {
  id: string; title: string; status: string; stage: string
  laborCost: number; materialsCost: number; materialsPending: number
  invoices: { id: string; number: string; total: number; status: string }[]
  createdAt: string
  client?: { id: string; displayName: string; avatarUrl: string | null }
}

const FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'activos', label: 'Activos' },
  { key: 'finalizados', label: 'Finalizados' },
] as const

export default function ProProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('todos')

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/projects')
        if (res.ok) setProjects((await res.json()).asPro || [])
      } finally { setLoading(false) }
    })()
  }, [])

  if (loading) return <Loading />

  const filtered = projects.filter((p) => {
    if (filter === 'activos') return p.status === 'activo'
    if (filter === 'finalizados') return p.status === 'finalizado'
    return true
  })

  return (
    <div className="max-w-4xl">
      <PageHeader title="Mis proyectos" subtitle="Trabajos acordados con clientes: etapas, materiales y facturación" />

      <div className="inline-flex homy-glass-soft rounded-full p-1 gap-1 mb-5 max-w-full overflow-x-auto no-scrollbar">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition whitespace-nowrap ${filter === f.key ? 'bg-[#0A2540] text-white shadow-lg shadow-[#0A2540]/25' : 'text-slate-500 hover:text-[#0A2540]'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <EmptyState icon={<FolderOpen />} title={filter === 'todos' ? 'No tenés proyectos todavía' : 'Nada con este filtro'}
          hint="Cuando un cliente acepte tu presupuesto de la bolsa, el proyecto se crea solo y lo seguís desde acá."
          action={
            <button onClick={() => navigate('/panel/profesional/bolsa')} className="homy-btn-primary px-5 py-2.5 text-sm">
              Ir a la bolsa de trabajos
            </button>
          } />
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <button key={p.id}
              onClick={() => navigate(`/panel/profesional/proyectos/${p.id}`)}
              className="w-full text-left rounded-2xl homy-glass homy-lift homy-card-glow p-4 sm:p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <UAvatar name={p.client?.displayName || 'Cliente'} url={p.client?.avatarUrl} size={44} />
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-[#0A2540] line-clamp-1 tracking-tight">{p.title}</h3>
                    <p className="text-xs text-slate-400 line-clamp-1">
                      Cliente: {p.client?.displayName || '—'} · {formatDate(p.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-extrabold text-[#0A2540] tabular-nums">{formatARS(p.laborCost + p.materialsCost)}</p>
                    <p className="text-[11px] text-slate-400 tabular-nums">mano de obra {formatARS(p.laborCost)} + materiales {formatARS(p.materialsCost)}</p>
                  </div>
                  <span className="homy-glass-soft grid size-8 place-items-center rounded-full text-slate-400" aria-hidden>
                    <ArrowRight className="size-4" />
                  </span>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <StatusBadge status={p.stage === 'finalizado' ? 'finalizado' : p.status} label={p.stage} />
                {p.materialsPending > 0 && (
                  <span className="homy-pill">
                    <span className="homy-pill-dot bg-amber-500" aria-hidden />
                    {p.materialsPending} material(es) esperando aprobación del cliente
                  </span>
                )}
                {p.invoices.length > 0 && (
                  <span className="text-xs font-semibold text-slate-500">
                    {p.invoices.length} factura{p.invoices.length === 1 ? '' : 's'} emitida{p.invoices.length === 1 ? '' : 's'}
                  </span>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
