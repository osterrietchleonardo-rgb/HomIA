'use client'
// Proyectos del profesional: lista con cliente, etapa, montos y materiales por aprobar
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, UAvatar, Loading } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { ArrowRight, FolderOpen, FileText } from 'lucide-react'

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
    <div className="homy-page">
      <div className="max-w-4xl">
        {/* Encabezado */}
        <header className="homy-page-head">
          <div className="min-w-0">
            <span className="homy-eyebrow">Ejecución en curso</span>
            <h1 className="homy-page-title mt-1.5">Mis proyectos</h1>
            <p className="homy-page-sub">Trabajos acordados con clientes: etapas, materiales y facturación.</p>
          </div>
        </header>

        {/* Filtros */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 mb-5">
          <div className="flex gap-2 min-w-max">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className="homy-tab">
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {filtered.length === 0 ? (
          <Empty
            icon={<FolderOpen className="size-7" />}
            title={filter === 'todos' ? 'No tenés proyectos todavía' : 'Nada con este filtro'}
            hint="Cuando un cliente acepte tu presupuesto de la bolsa, el proyecto se crea solo y lo seguís desde acá."
            action={
              <button onClick={() => navigate('/panel/profesional/bolsa')} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm">
                Ir a la bolsa de trabajos
              </button>
            }
          />
        ) : (
          <div className="homy-stagger space-y-3">
            {filtered.map((p) => (
              <button key={p.id}
                onClick={() => navigate(`/panel/profesional/proyectos/${p.id}`)}
                className="homy-row group w-full text-left p-4 sm:p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UAvatar name={p.client?.displayName || 'Cliente'} url={p.client?.avatarUrl} size={44} />
                    <div className="min-w-0">
                      <h3 className="font-extrabold text-[#0A2540] line-clamp-1 tracking-tight">{p.title}</h3>
                      <p className="text-xs text-slate-400 line-clamp-1 mt-0.5">
                        Cliente: {p.client?.displayName || '—'} · {formatDate(p.createdAt)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <p className="text-lg font-extrabold text-[#0A2540] tabular-nums leading-tight">{formatARS(p.laborCost + p.materialsCost)}</p>
                      <p className="text-[11px] text-slate-400 tabular-nums">mano de obra {formatARS(p.laborCost)} + materiales {formatARS(p.materialsCost)}</p>
                    </div>
                    <span className="homy-glass-soft grid size-8 place-items-center rounded-full text-slate-400 transition-colors group-hover:text-[#1D63B8]" aria-hidden>
                      <ArrowRight className="size-4" />
                    </span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 mt-3.5 pt-3 border-t border-[#0A2540]/6">
                  <StatusBadge status={p.stage === 'finalizado' ? 'finalizado' : p.status} label={p.stage} />
                  {p.materialsPending > 0 && (
                    <span className="homy-pill">
                      <span className="homy-pill-dot bg-amber-500" aria-hidden />
                      {p.materialsPending} material(es) esperando aprobación del cliente
                    </span>
                  )}
                  {p.invoices.length > 0 && (
                    <span className="text-xs font-semibold text-slate-500 inline-flex items-center gap-1.5">
                      <FileText className="size-3.5 shrink-0 text-slate-400" aria-hidden />
                      {p.invoices.length} factura{p.invoices.length === 1 ? '' : 's'} emitida{p.invoices.length === 1 ? '' : 's'}
                    </span>
                  )}
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* Estado vacío diseñado: icono flotante + copy + acción */
function Empty({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
      <span className="homy-empty-icon homy-chip-blue" aria-hidden>{icon}</span>
      <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">{title}</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
