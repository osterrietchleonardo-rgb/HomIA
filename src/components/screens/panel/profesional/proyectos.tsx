'use client'
// Proyectos del profesional: lista con cliente, etapa, montos y materiales por aprobar
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatusBadge, UAvatar, Loading, EmptyState } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { ArrowRight } from 'lucide-react'

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

      <div className="flex gap-2 mb-5">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className={`rounded-full px-4 py-1.5 text-sm font-bold transition ${filter === f.key ? 'bg-[#0A2540] text-white' : 'homy-glass border border-slate-200 text-slate-500 hover:border-[#1D63B8]/40'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-2xl homy-glass border border-slate-200 p-6">
          <EmptyState icon="📁" title={filter === 'todos' ? 'No tenés proyectos todavía' : 'Nada con este filtro'}
            hint="Cuando un cliente acepte tu presupuesto de la bolsa, el proyecto se crea solo y lo seguís desde acá."
            action={
              <button onClick={() => navigate('/panel/profesional/bolsa')} className="rounded-xl bg-[#FF5A1F] text-white font-bold px-5 py-2.5">
                Ir a la bolsa de trabajos
              </button>
            } />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((p) => (
            <button key={p.id}
              onClick={() => navigate(`/panel/profesional/proyectos/${p.id}`)}
              className="w-full text-left rounded-2xl homy-glass border border-slate-200 p-4 shadow-sm hover:shadow-md transition">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <UAvatar name={p.client?.displayName || 'Cliente'} url={p.client?.avatarUrl} size={44} />
                  <div className="min-w-0">
                    <h3 className="font-extrabold text-[#0A2540] truncate">{p.title}</h3>
                    <p className="text-xs text-slate-400 truncate">
                      Cliente: {p.client?.displayName || '—'} · {formatDate(p.createdAt)}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <div className="text-right">
                    <p className="text-lg font-extrabold text-[#0A2540]">{formatARS(p.laborCost + p.materialsCost)}</p>
                    <p className="text-[11px] text-slate-400">mano de obra {formatARS(p.laborCost)} + materiales {formatARS(p.materialsCost)}</p>
                  </div>
                  <ArrowRight className="size-4 text-slate-300" />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2 mt-3">
                <StatusBadge status={p.stage === 'finalizado' ? 'finalizado' : p.status} label={p.stage} />
                {p.materialsPending > 0 && (
                  <span className="text-xs font-bold text-amber-600 bg-amber-50 rounded-full px-2.5 py-1">
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
