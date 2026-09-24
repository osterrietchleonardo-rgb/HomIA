'use client'
// Proyectos del profesional: lista con cliente, etapa, montos y materiales por aprobar
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, UAvatar, Loading } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { ArrowRight, FolderOpen, FileText, RefreshCcw } from 'lucide-react'

const STAGE_LABEL: Record<string, string> = {
  presupuesto: 'Presupuesto', materiales: 'Materiales', ejecucion: 'Ejecución', revision: 'Revisión', finalizado: 'Finalizado',
}

type Project = {
  id: string; title: string; status: string; stage: string
  laborCost: number; budgetMin: number | null; budgetMax: number | null; materialsCost: number; materialsPending: number
  invoices: { id: string; number: string; total: number; status: string }[]
  createdAt: string
  client: { id: string; displayName: string; avatarUrl: string | null; verificationStatus?: string }
}

const FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'activos', label: 'Activos' },
  { key: 'finalizados', label: 'Finalizados' },
] as const

export default function ProProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<(typeof FILTERS)[number]['key']>('todos')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/projects?role=profesional')
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'No pudimos cargar tus proyectos'); return }
      setProjects(d.asPro || [])
    } catch {
      setError('No pudimos conectar con HomIA. Revisá tu conexión y probá de nuevo.')
      toast.error('No pudimos cargar tus proyectos')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  if (loading) return <Loading />

  const filtered = projects.filter((p) => {
    if (filter === 'activos') return p.status === 'activo'
    if (filter === 'finalizados') return p.status === 'finalizado'
    return true
  })

  return (
    <div className="homy-page">
      <div>
        {/* Encabezado */}
        <header className="homy-page-head">
          <div className="min-w-0">
            <span className="homy-eyebrow">Ejecución en curso</span>
            <h1 className="homy-page-title mt-1.5">Mis proyectos</h1>
            <p className="homy-page-sub">Trabajos acordados con clientes: cotización, etapas, materiales y facturación.</p>
          </div>
        </header>

        {/* Filtros */}
        <div className="no-scrollbar -mx-1 mb-5 flex gap-2 overflow-x-auto px-1">
          <div className="flex min-w-max gap-2">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className="homy-tab">
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {error ? (
          <Empty
            icon={<FolderOpen className="size-7" />}
            title="No pudimos cargar tus proyectos"
            hint={error}
            action={
              <button onClick={load} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm">
                <RefreshCcw className="size-4" aria-hidden /> Reintentar
              </button>
            }
          />
        ) : filtered.length === 0 ? (
          <Empty
            icon={<FolderOpen className="size-7" />}
            title={filter === 'todos' ? 'No tenés proyectos todavía' : 'Nada con este filtro'}
            hint="Cuando un cliente te contrate desde el directorio o acepte tu presupuesto de la bolsa, el proyecto se crea solo y lo seguís desde acá."
            action={
              <button onClick={() => navigate('/panel/profesional/bolsa')} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm">
                Ir a la bolsa de trabajos
              </button>
            }
          />
        ) : (
          <div className="homy-stagger space-y-3">
            {filtered.map((p) => {
              const quoted = p.laborCost > 0
              return (
                <button key={p.id}
                  onClick={() => navigate(`/panel/profesional/proyectos/${p.id}`)}
                  className="homy-row group w-full p-4 text-left sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <UAvatar name={p.client?.displayName || 'Cliente'} url={p.client?.avatarUrl} size={44} />
                      <div className="min-w-0">
                        <h3 className="line-clamp-1 font-extrabold tracking-tight text-[#0A2540]">{p.title}</h3>
                        <p className="mt-0.5 line-clamp-1 text-xs text-slate-400">
                          Cliente: {p.client?.displayName || '—'} · {formatDate(p.createdAt)}
                        </p>
                      </div>
                    </div>
                    <div className="flex min-w-0 max-w-[45%] shrink items-center gap-2">
                      <div className="homy-num-cell min-w-0 text-right">
                        {quoted || p.materialsCost > 0 ? (
                          <>
                            <p className="font-extrabold leading-tight text-[#0A2540]"><span className="homy-num-adapt">{formatARS(p.laborCost + p.materialsCost)}</span></p>
                            <p className="text-[11px] leading-snug text-slate-400">
                              {quoted ? `mano de obra ${formatARS(p.laborCost)}` : 'sin cotizar'} + mat. {formatARS(p.materialsCost)}
                            </p>
                          </>
                        ) : (
                          <p className="text-xs font-bold leading-snug text-slate-500">
                            {p.status === 'activo' ? 'Cotizá la mano de obra' : 'Sin cotizar'}
                          </p>
                        )}
                      </div>
                      <span className="homy-glass-soft hidden size-8 shrink-0 place-items-center rounded-full text-slate-400 transition-colors group-hover:text-[#1D63B8] sm:grid" aria-hidden>
                        <ArrowRight className="size-4" />
                      </span>
                    </div>
                  </div>
                  <div className="mt-3.5 flex flex-wrap items-center gap-2 border-t border-[#0A2540]/6 pt-3">
                    <StatusBadge status={p.status} label={p.status === 'activo' ? (STAGE_LABEL[p.stage] || p.stage) : p.status} />
                    {p.status === 'activo' && p.stage === 'presupuesto' && !quoted && (
                      <span className="homy-pill"><span className="homy-pill-dot bg-amber-500" aria-hidden />falta cotizar</span>
                    )}
                    {p.materialsPending > 0 && (
                      <span className="homy-pill">
                        <span className="homy-pill-dot bg-amber-500" aria-hidden />
                        {p.materialsPending} material(es) esperando aprobación del cliente
                      </span>
                    )}
                    {p.invoices.length > 0 && (
                      <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500">
                        <FileText className="size-3.5 shrink-0 text-slate-400" aria-hidden />
                        {p.invoices.length} factura{p.invoices.length === 1 ? '' : 's'} emitida{p.invoices.length === 1 ? '' : 's'}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
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
      <h3 className="text-lg font-bold tracking-tight text-[#0A2540]">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
