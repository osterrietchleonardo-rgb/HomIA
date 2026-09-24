'use client'
// Proyectos del cliente: lista con profesional, etapa, montos y materiales por aprobar
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, Loading, UAvatar } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { FolderKanban, Star, RefreshCcw } from 'lucide-react'

const STAGES = ['presupuesto', 'materiales', 'ejecucion', 'revision', 'finalizado']
const STAGE_LABEL: Record<string, string> = {
  presupuesto: 'Presupuesto', materiales: 'Materiales', ejecucion: 'Ejecución', revision: 'Revisión', finalizado: 'Finalizado',
}

type Project = {
  id: string; title: string; stage: string; status: string; laborCost: number; materialsCost: number
  budgetMin: number | null; budgetMax: number | null
  materialsPending: number; updatedAt: string; canReview?: boolean
  pro: { id: string; userId: string; user: { displayName: string; avatarUrl: string | null; verificationStatus?: string } }
  invoices: { id: string; number: string; total: number; status: string }[]
}

export default function ClientProjects() {
  const [projects, setProjects] = useState<Project[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch('/api/projects?role=cliente')
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'No pudimos cargar tus proyectos'); return }
      setProjects(d.asClient || [])
    } catch {
      setError('No pudimos conectar con HomIA. Revisá tu conexión y probá de nuevo.')
      toast.error('No pudimos cargar tus proyectos')
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

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

      {error ? (
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <span className="homy-empty-icon homy-chip-blue" aria-hidden><FolderKanban className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">No pudimos cargar tus proyectos</h3>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{error}</p>
          <button onClick={load} className="homy-btn-primary mt-5 px-5 py-3 text-sm sm:py-2.5">
            <RefreshCcw className="size-4" aria-hidden /> Reintentar
          </button>
        </div>
      ) : projects.length === 0 ? (
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <span className="homy-empty-icon homy-chip-blue" aria-hidden><FolderKanban className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">Sin proyectos todavía</h3>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
            Cuando contrates a un profesional desde el directorio o aceptes un presupuesto, acá vas a seguir el avance: cotización, materiales, etapas y facturas (Mercado Pago o efectivo).
          </p>
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            <button onClick={() => navigate('/directorio')} className="homy-btn-primary px-5 py-3 text-sm sm:py-2.5">Buscar un profesional</button>
            <button onClick={() => navigate('/panel/cliente/trabajos')} className="homy-btn-dark px-5 py-3 text-sm sm:py-2.5">Ver presupuestos recibidos</button>
          </div>
        </div>
      ) : (
        <div className="space-y-3.5 homy-stagger">
          {projects.map((p) => {
            const stageIdx = Math.max(STAGES.indexOf(p.stage), 0)
            const progress = p.stage === 'finalizado' ? 100 : ((stageIdx + 1) / STAGES.length) * 100
            const quoted = p.laborCost > 0
            const total = p.laborCost + p.materialsCost
            return (
              <button key={p.id} onClick={() => navigate(`/panel/cliente/proyectos/${p.id}`)}
                className="homy-glass homy-lift homy-card-glow group w-full rounded-3xl p-4 text-left sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 flex-1 items-start gap-3">
                    <span className="homy-icon-chip homy-chip-ai size-10 shrink-0 [&_svg]:size-4" aria-hidden><FolderKanban /></span>
                    <div className="min-w-0">
                      <div className="mb-1 flex flex-wrap items-center gap-2">
                        <StatusBadge status={p.status} />
                        {p.status === 'activo' && p.stage === 'presupuesto' && !quoted && (
                          <span className="homy-pill"><span className="homy-pill-dot bg-slate-400" aria-hidden />esperando cotización</span>
                        )}
                        {p.materialsPending > 0 && p.status === 'activo' && (
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
                          <span className="truncate">{p.pro.user.displayName}</span>
                        </p>
                      )}
                      <p className="mt-1.5 text-xs text-slate-400">Actualizado {formatDate(p.updatedAt)}</p>
                    </div>
                  </div>
                  <div className="homy-num-cell min-w-0 max-w-[40%] shrink text-right">
                    <p className="text-[0.68rem] font-bold uppercase tracking-[0.09em] text-slate-400">{quoted ? 'Total' : 'Mano de obra'}</p>
                    {quoted || p.materialsCost > 0 ? (
                      <p className="font-extrabold text-[#0A2540]"><span className="homy-num-adapt">{formatARS(total)}</span></p>
                    ) : (
                      <p className="text-xs font-bold leading-snug text-slate-500">Sin cotizar</p>
                    )}
                  </div>
                </div>
                <div className="mt-4">
                  <div className="mb-1.5 flex items-center justify-between gap-2 text-xs">
                    <span className="font-bold text-[#0A2540]">{STAGE_LABEL[p.stage] || p.stage}</span>
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
