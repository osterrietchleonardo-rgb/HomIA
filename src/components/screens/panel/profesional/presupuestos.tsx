'use client'
// Mis presupuestos (profesional): proyectos en etapa de presupuesto + activos con su monto
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatusBadge, StatCard, Loading, EmptyState } from '@/components/app/ui-bits'
import { formatARS, timeAgo } from '@/lib/format'
import { ArrowRight, Search, ClipboardPen, Wallet, Handshake, Banknote, FileText, FolderKanban } from 'lucide-react'

type Project = {
  id: string; title: string; status: string; stage: string
  laborCost: number; materialsCost: number; materialsPending: number
  invoices: { id: string }[]; updatedAt: string
}

export default function ProBids() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)

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
  const quotedValue = quoting.reduce((a, p) => a + p.laborCost, 0)
  const wonValue = active.reduce((a, p) => a + p.laborCost, 0)

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Mis presupuestos"
        subtitle="Cotizaciones que enviaste y cómo vienen tus proyectos"
        right={
          <button onClick={() => navigate('/panel/profesional/bolsa')} className="homy-btn-primary px-5 py-2.5 text-sm">
            <Search className="size-4" /> Buscar más trabajos
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="En presupuestación" value={quoting.length} hint="esperando respuesta" accent="#1D63B8" icon={<ClipboardPen />} tone="blue" />
        <StatCard label="Valor cotizado" value={formatARS(quotedValue)} accent="#FFC700" icon={<Wallet />} tone="gold" />
        <StatCard label="Ganados (activos)" value={active.length} accent="#16A34A" icon={<Handshake />} tone="mint" />
        <StatCard label="Mano de obra ganada" value={formatARS(wonValue)} accent="#FF5A1F" icon={<Banknote />} tone="orange" />
      </div>

      {projects.length === 0 ? (
        <EmptyState icon={<FileText />} title="Todavía no enviaste ningún presupuesto"
          hint="Entrá a la bolsa de trabajos, elegí una publicación y mandá tu cotización. Cuando el cliente la acepte, el proyecto aparece acá."
          action={
            <button onClick={() => navigate('/panel/profesional/bolsa')} className="homy-btn-primary px-5 py-2.5 text-sm">
              Ver la bolsa de trabajos
            </button>
          } />
      ) : (
        <div className="space-y-6">
          <section>
            <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-3">
              <span className="homy-icon-chip homy-chip-gold size-7 [&_svg]:size-3.5" aria-hidden><ClipboardPen /></span>
              En presupuestación (pendiente de respuesta)
            </h2>
            {quoting.length === 0 ? (
              <div className="homy-glass-soft rounded-2xl p-5 text-sm text-slate-500">
                No hay cotizaciones esperando respuesta. Buscá nuevos trabajos en la bolsa y mandá tu presupuesto.
              </div>
            ) : (
              <div className="space-y-2">
                {quoting.map((p) => <ProjectRow key={p.id} p={p} badgeLabel="presupuesto" note="Esperando respuesta del cliente" />)}
              </div>
            )}
          </section>

          <section>
            <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-3">
              <span className="homy-icon-chip homy-chip-mint size-7 [&_svg]:size-3.5" aria-hidden><FolderKanban /></span>
              Proyectos activos
            </h2>
            {active.length === 0 ? (
              <div className="homy-glass-soft rounded-2xl p-5 text-sm text-slate-500">
                Cuando un cliente acepte uno de tus presupuestos, el proyecto activo aparece acá con su monto y etapa.
              </div>
            ) : (
              <div className="space-y-2">
                {active.map((p) => <ProjectRow key={p.id} p={p} />)}
              </div>
            )}
          </section>
        </div>
      )}
    </div>
  )
}

function ProjectRow({ p, badgeLabel, note }: { p: Project; badgeLabel?: string; note?: string }) {
  return (
    <button
      onClick={() => navigate(`/panel/profesional/proyectos/${p.id}`)}
      className="w-full text-left rounded-2xl homy-glass homy-lift homy-card-glow p-4 flex items-center justify-between gap-3"
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
      <div className="text-right shrink-0 flex items-center gap-2">
        <p className="text-lg font-extrabold text-[#FF5A1F] tabular-nums">{formatARS(p.laborCost)}</p>
        <span className="homy-glass-soft grid size-8 place-items-center rounded-full text-slate-400" aria-hidden>
          <ArrowRight className="size-4" />
        </span>
      </div>
    </button>
  )
}
