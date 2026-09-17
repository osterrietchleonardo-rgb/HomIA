'use client'
// Mis presupuestos (profesional): proyectos en etapa de presupuesto + activos con su monto
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, Loading } from '@/components/app/ui-bits'
import { formatARS, timeAgo } from '@/lib/format'
import { ArrowRight, Search, ClipboardPen, Wallet, Handshake, Banknote, FileText, FolderKanban, Archive } from 'lucide-react'

type Project = {
  id: string; title: string; status: string; stage: string
  laborCost: number; materialsCost: number; materialsPending: number
  invoices: { id: string }[]; updatedAt: string
}

const FILTERS = [
  { key: 'todos', label: 'Todos' },
  { key: 'presupuesto', label: 'En presupuestación' },
  { key: 'activos', label: 'Activos' },
  { key: 'finalizados', label: 'Finalizados' },
] as const

export default function ProBids() {
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

  const quoting = projects.filter((p) => p.stage === 'presupuesto' && p.status !== 'cancelado')
  const active = projects.filter((p) => p.status === 'activo' && p.stage !== 'presupuesto')
  const finished = projects.filter((p) => p.status === 'finalizado')
  const quotedValue = quoting.reduce((a, p) => a + p.laborCost, 0)
  const wonValue = active.reduce((a, p) => a + p.laborCost, 0)

  const showQuoting = filter === 'todos' || filter === 'presupuesto'
  const showActive = filter === 'todos' || filter === 'activos'
  const showFinished = filter === 'todos' || filter === 'finalizados'

  return (
    <div className="homy-page">
      <div className="max-w-4xl">
        {/* Encabezado */}
        <header className="homy-page-head">
          <div className="min-w-0">
            <span className="homy-eyebrow">Tu cartera de cotizaciones</span>
            <h1 className="homy-page-title mt-1.5">Mis presupuestos</h1>
            <p className="homy-page-sub">Cotizaciones que enviaste y cómo vienen tus proyectos.</p>
          </div>
          <button onClick={() => navigate('/panel/profesional/bolsa')} className="homy-btn-primary min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
            <Search className="size-4" /> Buscar más trabajos
          </button>
        </header>

        {/* KPIs */}
        <div className="homy-stagger grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <Kpi glow="#1D63B8" valueColor="#1D63B8" chip="homy-chip-blue" icon={<ClipboardPen />}
            label="En presupuestación" value={String(quoting.length)} hint="esperando respuesta" />
          <Kpi glow="#FFC700" valueColor="#B98A00" chip="homy-chip-gold" icon={<Wallet />}
            label="Valor cotizado" value={formatARS(quotedValue)} compact />
          <Kpi glow="#10B981" chip="homy-chip-mint" icon={<Handshake />}
            label="Ganados (activos)" value={String(active.length)} />
          <Kpi glow="#FF5A1F" valueColor="#FF5A1F" chip="homy-chip-orange" icon={<Banknote />}
            label="Mano de obra ganada" value={formatARS(wonValue)} compact />
        </div>

        {/* Filtros por estado */}
        <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 mb-5">
          <div className="flex gap-2 min-w-max">
            {FILTERS.map((f) => (
              <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className="homy-tab">
                {f.label}
                {f.key === 'presupuesto' && quoting.length > 0 && <span className="tabular-nums opacity-70">{quoting.length}</span>}
                {f.key === 'activos' && active.length > 0 && <span className="tabular-nums opacity-70">{active.length}</span>}
                {f.key === 'finalizados' && finished.length > 0 && <span className="tabular-nums opacity-70">{finished.length}</span>}
              </button>
            ))}
          </div>
        </div>

        {projects.length === 0 ? (
          <Empty
            icon={<FileText className="size-7" />}
            title="Todavía no enviaste ningún presupuesto"
            hint="Entrá a la bolsa de trabajos, elegí una publicación y mandá tu cotización. Cuando el cliente la acepte, el proyecto aparece acá."
            action={
              <button onClick={() => navigate('/panel/profesional/bolsa')} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm">
                Ver la bolsa de trabajos
              </button>
            }
          />
        ) : (
          <div className="space-y-7">
            {showQuoting && (
              <section>
                <div className="homy-section-head">
                  <h2 className="homy-section-title">
                    <span className="homy-icon-chip homy-chip-gold size-7 [&_svg]:size-3.5" aria-hidden><ClipboardPen /></span>
                    En presupuestación
                  </h2>
                  <span className="text-xs font-semibold text-slate-400">pendiente de respuesta</span>
                </div>
                {quoting.length === 0 ? (
                  <div className="homy-glass-soft rounded-2xl border border-dashed border-[#0A2540]/12 p-5 text-sm text-slate-500">
                    No hay cotizaciones esperando respuesta. Buscá nuevos trabajos en la bolsa y mandá tu presupuesto.
                  </div>
                ) : (
                  <div className="homy-stagger space-y-2">
                    {quoting.map((p) => <ProjectRow key={p.id} p={p} badgeLabel="presupuesto" note="Esperando respuesta del cliente" />)}
                  </div>
                )}
              </section>
            )}

            {showActive && (
              <section>
                <div className="homy-section-head">
                  <h2 className="homy-section-title">
                    <span className="homy-icon-chip homy-chip-mint size-7 [&_svg]:size-3.5" aria-hidden><FolderKanban /></span>
                    Proyectos activos
                  </h2>
                </div>
                {active.length === 0 ? (
                  <div className="homy-glass-soft rounded-2xl border border-dashed border-[#0A2540]/12 p-5 text-sm text-slate-500">
                    Cuando un cliente acepte uno de tus presupuestos, el proyecto activo aparece acá con su monto y etapa.
                  </div>
                ) : (
                  <div className="homy-stagger space-y-2">
                    {active.map((p) => <ProjectRow key={p.id} p={p} />)}
                  </div>
                )}
              </section>
            )}

            {showFinished && (
              <section>
                <div className="homy-section-head">
                  <h2 className="homy-section-title">
                    <span className="homy-icon-chip homy-chip-navy size-7 [&_svg]:size-3.5" aria-hidden><Archive /></span>
                    Finalizados
                  </h2>
                </div>
                {finished.length === 0 ? (
                  <div className="homy-glass-soft rounded-2xl border border-dashed border-[#0A2540]/12 p-5 text-sm text-slate-500">
                    Cuando cierres una obra desde el detalle del proyecto, va a aparecer acá como track record.
                  </div>
                ) : (
                  <div className="homy-stagger space-y-2">
                    {finished.map((p) => <ProjectRow key={p.id} p={p} />)}
                  </div>
                )}
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* KPI Signature: cifra protagonista + chip de gradiente + resplandor de esquina */
function Kpi({ label, value, hint, glow, valueColor, chip, icon, compact }: {
  label: string; value: string; hint?: string; glow: string; valueColor?: string
  chip: string; icon: React.ReactNode; compact?: boolean
}) {
  return (
    <div className="homy-glass homy-kpi homy-lift" style={{ '--kpi-glow': glow } as React.CSSProperties}>
      <div className="flex items-start justify-between gap-2">
        <p className="homy-kpi-label">{label}</p>
        <span className={`homy-icon-chip size-8 shrink-0 [&_svg]:size-4 ${chip}`} aria-hidden>{icon}</span>
      </div>
      <p className="homy-kpi-value mt-2 break-words"
        style={{ ...(valueColor ? { color: valueColor } : {}), ...(compact ? { fontSize: 'clamp(1.15rem, 1rem + 0.9vw, 1.55rem)' } : {}) }}>
        {value}
      </p>
      {hint && <p className="text-xs text-slate-400 mt-1.5 leading-snug line-clamp-1">{hint}</p>}
    </div>
  )
}

function ProjectRow({ p, badgeLabel, note }: { p: Project; badgeLabel?: string; note?: string }) {
  return (
    <button
      onClick={() => navigate(`/panel/profesional/proyectos/${p.id}`)}
      className="homy-row group w-full text-left p-4 flex items-center justify-between gap-3"
    >
      <div className="min-w-0">
        <p className="font-bold text-[#0A2540] line-clamp-1">{p.title}</p>
        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <StatusBadge status={p.stage === 'finalizado' ? 'finalizado' : 'activo'} label={badgeLabel || p.stage} />
          {note && <span className="text-xs font-semibold text-amber-600">{note}</span>}
          {p.materialsPending > 0 && <span className="text-xs font-semibold text-amber-600">{p.materialsPending} material(es) por aprobar</span>}
          <span className="text-xs text-slate-400">{timeAgo(p.updatedAt)}</span>
        </div>
      </div>
      <div className="text-right shrink-0 flex items-center gap-2.5">
        <p className="text-lg font-extrabold text-[#FF5A1F] tabular-nums">{formatARS(p.laborCost)}</p>
        <span className="homy-glass-soft grid size-8 place-items-center rounded-full text-slate-400 transition-colors group-hover:text-[#1D63B8]" aria-hidden>
          <ArrowRight className="size-4" />
        </span>
      </div>
    </button>
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
