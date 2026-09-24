'use client'
// Mis ofertas (profesional): cada presupuesto que mandaste a la bolsa, con su
// trabajo, monto, plazo y estado real (pendiente / aceptada / rechazada / retirada).
import { useCallback, useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { Loading, AutoFitValue, UrgencyBadge } from '@/components/app/ui-bits'
import { formatARS, timeAgo } from '@/lib/format'
import { apiFetch, NETWORK_ERROR } from '@/lib/api-client'
import { useCategories, categoryName } from '@/lib/categories'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowRight, Search, ClipboardPen, Wallet, Handshake, FileText, MapPin, CalendarDays,
  Undo2, FolderKanban, RefreshCw, WifiOff, MessageSquareText,
} from 'lucide-react'

type Bid = {
  id: string; amount: number; timelineDays: number; message: string | null
  status: 'pendiente' | 'aceptado' | 'rechazado' | 'retirado' | string
  createdAt: string; updatedAt: string; projectId: string | null
  job: { id: string; title: string; categorySlug: string; status: string; city: string | null; urgency: string }
}

const FILTERS = [
  { key: 'todas', label: 'Todas' },
  { key: 'pendiente', label: 'Pendientes' },
  { key: 'aceptado', label: 'Aceptadas' },
  { key: 'rechazado', label: 'Rechazadas' },
  { key: 'retirado', label: 'Retiradas' },
] as const
type FilterKey = (typeof FILTERS)[number]['key']

const STATUS_META: Record<string, { label: string; dot: string; note: string }> = {
  pendiente: { label: 'Pendiente', dot: 'bg-amber-500', note: 'Esperando respuesta del cliente' },
  aceptado: { label: 'Aceptada', dot: 'bg-emerald-500', note: 'El cliente te eligió: ya hay proyecto' },
  rechazado: { label: 'Rechazada', dot: 'bg-red-500', note: 'El cliente eligió otra oferta o cerró el trabajo' },
  retirado: { label: 'Retirada', dot: 'bg-slate-400', note: 'La retiraste vos; podés volver a ofertar si el trabajo sigue abierto' },
}

export default function ProBids() {
  const [bids, setBids] = useState<Bid[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [filter, setFilter] = useState<FilterKey>('todas')
  const [withdrawTarget, setWithdrawTarget] = useState<Bid | null>(null)
  const [busyId, setBusyId] = useState<string | null>(null)
  const { categories } = useCategories()

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    const r = await apiFetch<{ bids: Bid[] }>('/api/bids?mine=1', { silent: true })
    if (r.ok) setBids(r.data?.bids || [])
    else setError(r.error || NETWORK_ERROR)
    setLoading(false)
  }, [])
  useEffect(() => { load() }, [load])

  async function withdraw() {
    if (!withdrawTarget) return
    const target = withdrawTarget
    setBusyId(target.id)
    setWithdrawTarget(null)
    try {
      const r = await apiFetch(`/api/bids/${target.id}`, { method: 'PATCH', json: { action: 'retirar' } })
      if (!r.ok) return
      toast.success('Oferta retirada')
      setBids((cur) => cur.map((b) => (b.id === target.id ? { ...b, status: 'retirado' } : b)))
    } finally { setBusyId(null) }
  }

  if (loading) return <Loading text="Cargando tus ofertas…" />

  const counts = FILTERS.reduce<Record<string, number>>((acc, f) => {
    acc[f.key] = f.key === 'todas' ? bids.length : bids.filter((b) => b.status === f.key).length
    return acc
  }, {})
  const visible = filter === 'todas' ? bids : bids.filter((b) => b.status === filter)
  const pending = bids.filter((b) => b.status === 'pendiente')
  const accepted = bids.filter((b) => b.status === 'aceptado')
  const pendingValue = pending.reduce((a, b) => a + b.amount, 0)
  const wonValue = accepted.reduce((a, b) => a + b.amount, 0)

  return (
    <div className="homy-page">
      <div>
        <header className="homy-page-head">
          <div className="min-w-0">
            <span className="homy-eyebrow">Tu cartera de cotizaciones</span>
            <h1 className="homy-page-title mt-1.5">Mis ofertas</h1>
            <p className="homy-page-sub">Presupuestos que mandaste a la bolsa y cómo los respondieron.</p>
          </div>
          <button onClick={() => navigate('/panel/profesional/bolsa')} className="homy-btn-primary min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
            <Search className="size-4" /> Buscar más trabajos
          </button>
        </header>

        {error ? (
          <ErrorState message={error} onRetry={load} />
        ) : (
          <>
            {/* KPIs */}
            <div className="homy-stagger grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
              <Kpi glow="#FFC700" valueColor="#B98A00" chip="homy-chip-gold" icon={<ClipboardPen />}
                label="Pendientes" value={String(pending.length)} hint="esperando respuesta" />
              <Kpi glow="#1D63B8" valueColor="#1D63B8" chip="homy-chip-blue" icon={<Wallet />}
                label="Valor cotizado" value={formatARS(pendingValue)} compact hint="en ofertas pendientes" />
              <Kpi glow="#10B981" chip="homy-chip-mint" icon={<Handshake />}
                label="Aceptadas" value={String(accepted.length)} hint="se convirtieron en proyecto" />
              <Kpi glow="#FF5A1F" valueColor="#FF5A1F" chip="homy-chip-orange" icon={<FolderKanban />}
                label="Mano de obra ganada" value={formatARS(wonValue)} compact />
            </div>

            {/* Filtros por estado */}
            <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-1 px-1 mb-5" role="group" aria-label="Filtrar ofertas por estado">
              <div className="flex gap-2 min-w-max">
                {FILTERS.map((f) => (
                  <button key={f.key} onClick={() => setFilter(f.key)} aria-pressed={filter === f.key} className="homy-tab">
                    {f.label}
                    {counts[f.key] > 0 && <span className="tabular-nums opacity-70">{counts[f.key]}</span>}
                  </button>
                ))}
              </div>
            </div>

            {bids.length === 0 ? (
              <Empty
                icon={<FileText className="size-7" />}
                title="Todavía no mandaste ninguna oferta"
                hint="Entrá a la bolsa de trabajos, elegí una publicación y mandá tu presupuesto. Cuando el cliente responda, lo ves acá."
                action={
                  <button onClick={() => navigate('/panel/profesional/bolsa')} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm">
                    Ver la bolsa de trabajos
                  </button>
                }
              />
            ) : visible.length === 0 ? (
              <Empty
                icon={<Search className="size-7" />}
                title={`No tenés ofertas ${FILTERS.find((f) => f.key === filter)?.label.toLowerCase()}`}
                hint="Probá con otro filtro o mandá nuevas ofertas desde la bolsa."
                action={
                  <button onClick={() => setFilter('todas')} className="homy-btn-dark min-h-[44px] px-5 py-2.5 text-sm">Ver todas</button>
                }
              />
            ) : (
              <div className="homy-stagger space-y-3">
                {visible.map((b) => {
                  const meta = STATUS_META[b.status] || { label: b.status, dot: 'bg-slate-400', note: '' }
                  const jobOpen = b.job.status === 'abierto'
                  return (
                    <article key={b.id} className="homy-glass homy-lift homy-card-glow rounded-3xl p-4 sm:p-5">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap mb-1.5">
                            <span className="homy-pill">
                              <span className={`homy-pill-dot ${meta.dot}`} aria-hidden />
                              {meta.label}
                            </span>
                            <UrgencyBadge urgency={b.job.urgency} />
                            <span className="homy-pill"><span className="homy-pill-dot bg-[#1D63B8]" aria-hidden />{categoryName(categories, b.job.categorySlug)}</span>
                          </div>
                          <h3 className="font-extrabold text-[#0A2540] leading-snug tracking-tight line-clamp-2">{b.job.title}</h3>
                          <p className="text-xs text-slate-400 mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
                            <span className="flex items-center gap-1"><MapPin className="size-3.5" aria-hidden />{b.job.city || '—'}</span>
                            <span className="flex items-center gap-1"><CalendarDays className="size-3.5" aria-hidden />ofertaste {timeAgo(b.createdAt)}</span>
                            {!jobOpen && b.status !== 'aceptado' && <span>· trabajo {b.job.status.replace(/_/g, ' ')}</span>}
                          </p>
                          {b.message && (
                            <p className="homy-glass-soft mt-2.5 rounded-xl p-2.5 text-sm leading-relaxed text-slate-600 flex gap-2">
                              <MessageSquareText className="size-4 shrink-0 mt-0.5 text-slate-400" aria-hidden />
                              <span className="line-clamp-3 min-w-0">{b.message}</span>
                            </p>
                          )}
                        </div>
                        <div className="text-right shrink-0 min-w-0 max-w-full">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.12em]">Tu oferta</p>
                          <p className="text-xl font-extrabold text-[#FF5A1F] tabular-nums leading-tight break-words">{formatARS(b.amount)}</p>
                          <p className="text-xs text-slate-400">en {b.timelineDays} día{b.timelineDays === 1 ? '' : 's'}</p>
                        </div>
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5 mt-4 pt-3.5 border-t border-[#0A2540]/6">
                        <p className={`text-xs font-semibold ${b.status === 'aceptado' ? 'text-emerald-600' : b.status === 'pendiente' ? 'text-amber-600' : 'text-slate-400'}`}>{meta.note}</p>
                        <div className="flex flex-wrap gap-2 ml-auto">
                          <button onClick={() => navigate(`/trabajo/${b.job.id}`)} className="homy-glass-soft homy-focus rounded-full min-h-[40px] px-4 text-sm font-bold text-[#1D63B8] transition hover:text-[#0A2540] inline-flex items-center gap-1.5">
                            {b.status === 'retirado' && jobOpen ? 'Volver a ofertar' : 'Ver trabajo'} <ArrowRight className="size-4" aria-hidden />
                          </button>
                          {b.status === 'pendiente' && (
                            <button onClick={() => setWithdrawTarget(b)} disabled={busyId === b.id}
                              className="homy-glass-soft homy-focus rounded-full min-h-[40px] px-4 text-sm font-bold text-slate-500 transition hover:text-red-600 disabled:opacity-50 inline-flex items-center gap-1.5">
                              <Undo2 className="size-4" aria-hidden /> {busyId === b.id ? 'Retirando…' : 'Retirar'}
                            </button>
                          )}
                          {b.status === 'aceptado' && b.projectId && (
                            <button onClick={() => navigate(`/panel/profesional/proyectos/${b.projectId}`)} className="homy-btn-primary min-h-[40px] px-4 text-sm">
                              <FolderKanban className="size-4" aria-hidden /> Ver proyecto
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      <AlertDialog open={!!withdrawTarget} onOpenChange={(v) => { if (!v) setWithdrawTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Retirar tu oferta?</AlertDialogTitle>
            <AlertDialogDescription>
              Tu presupuesto de {withdrawTarget ? formatARS(withdrawTarget.amount) : ''} para “{withdrawTarget?.job.title}” deja de estar disponible para el cliente.
              Si el trabajo sigue abierto, podés volver a ofertar después.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={withdraw} className="bg-red-600 hover:bg-red-700 text-white">Retirar oferta</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
      <AutoFitValue
        className="homy-kpi-value mt-2"
        style={{ ...(valueColor ? { color: valueColor } : {}), ...(compact ? { fontSize: 'clamp(1.15rem, 1rem + 0.9vw, 1.55rem)' } : {}) }}
        value={value}
      />
      {hint && <p className="text-xs text-slate-400 mt-1.5 leading-snug line-clamp-1">{hint}</p>}
    </div>
  )
}

/* Estado de error honesto: no confundir "falló la red" con "no tenés ofertas" */
function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return (
    <div className="homy-empty homy-glass-soft border border-dashed border-red-300/60" role="alert">
      <span className="homy-empty-icon homy-chip-orange" aria-hidden><WifiOff className="size-7" /></span>
      <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">No pudimos cargar tus ofertas</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{message}</p>
      <div className="mt-5">
        <button onClick={onRetry} className="homy-btn-dark min-h-[44px] px-5 py-2.5 text-sm">
          <RefreshCw className="size-4" aria-hidden /> Reintentar
        </button>
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
