'use client'
// CRM del proveedor — pipeline kanban de contactos, cotizaciones y compras en curso
import { useEffect, useState } from 'react'
import { Loading, UAvatar } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Plus, ChevronLeft, ChevronRight, Trash2, UserRound, Handshake } from 'lucide-react'

type Stage = { id: string; name: string; color: string; sortOrder: number }

type Deal = {
  id: string; stageId: string; title: string; value: number; note: string | null
  counterparty: { id: string; displayName: string; avatarUrl: string | null } | null
}

type Pipeline = { id: string; name: string; stages: Stage[] }

export default function ProviderCRM() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [loading, setLoading] = useState(true)

  // nuevo trato
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [value, setValue] = useState('')
  const [counterparty, setCounterparty] = useState('')
  const [stageId, setStageId] = useState('')
  const [busy, setBusy] = useState(false)

  const [movingId, setMovingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<Deal | null>(null)

  async function load() {
    const res = await fetch('/api/crm/pipelines')
    if (res.ok) {
      const d = await res.json()
      setPipelines(d.pipelines || [])
      setDeals(d.deals || [])
    }
  }

  useEffect(() => {
    (async () => { try { await load() } finally { setLoading(false) } })()
  }, [])

  const pipeline = pipelines[0]
  const stages = pipeline?.stages || []

  function stageIndex(id: string): number {
    return stages.findIndex((s) => s.id === id)
  }

  async function move(deal: Deal, dir: -1 | 1) {
    const idx = stageIndex(deal.stageId)
    const target = stages[idx + dir]
    if (!target) return
    setMovingId(deal.id)
    try {
      const res = await fetch('/api/crm/deals', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deal.id, stageId: target.id }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      toast.success(`Movido a “${target.name}”`)
      load()
    } finally { setMovingId(null) }
  }

  async function remove() {
    if (!deleteTarget) return
    const res = await fetch(`/api/crm/deals?id=${deleteTarget.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error((await res.json()).error); setDeleteTarget(null); return }
    toast.success('Trato eliminado')
    setDeleteTarget(null)
    load()
  }

  function resetForm() { setTitle(''); setValue(''); setCounterparty(''); setStageId('') }

  async function createDeal() {
    if (!pipeline) return
    if (!title.trim()) { toast.error('Poné un título al trato'); return }
    const targetStage = stageId || stages[0]?.id
    if (!targetStage) { toast.error('Elegí una etapa'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/crm/deals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          pipelineId: pipeline.id,
          stageId: targetStage,
          title: title.trim(),
          value: value !== '' ? Number(value) : undefined,
          // la contraparte es opcional: puede ir null y se muestra solo si viene
          counterpartyId: undefined,
          note: counterparty.trim() || undefined,
        }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      toast.success('Trato creado')
      setOpen(false)
      resetForm()
      load()
    } finally { setBusy(false) }
  }

  if (loading) return <Loading />
  if (!pipeline) {
    return (
      <div className="homy-page">
        <header className="homy-page-head">
          <div className="min-w-0">
            <span className="homy-eyebrow">Seguimiento comercial</span>
            <h1 className="homy-page-title mt-1.5">CRM</h1>
            <p className="homy-page-sub">Tus tratos con clientes y profesionales.</p>
          </div>
        </header>
        <Empty
          icon={<Handshake className="size-7" />}
          title="No tenemos un pipeline para vos todavía"
          hint="Recargá la pantalla: se crea automáticamente la primera vez."
        />
      </div>
    )
  }

  return (
    <div className="homy-page">
      {/* Encabezado */}
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Seguimiento comercial</span>
          <h1 className="homy-page-title mt-1.5">CRM</h1>
          <p className="homy-page-sub">{pipeline.name} — seguí cada trato de contacto a compra.</p>
        </div>
        <button onClick={() => setOpen(true)} className="homy-btn-primary homy-focus min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
          <Plus className="size-4" /> Nuevo trato
        </button>
      </header>

      {deals.length === 0 ? (
        <Empty
          icon={<Handshake className="size-7" />}
          title="Tu pipeline está vacío"
          hint={`Anotá cada contacto y cotización para no perder ninguna venta. Las etapas ${stages.map((s) => s.name).join(' / ')} ya están listas.`}
          action={
            <button onClick={() => setOpen(true)} className="homy-btn-primary homy-focus min-h-[44px] px-5 py-2.5 text-sm">
              <Plus className="size-4" /> Crear el primer trato
            </button>
          }
        />
      ) : (
        <div className="overflow-x-auto no-scrollbar pb-3 px-0.5 -mx-0.5">
          <div className="homy-stagger flex gap-3.5 min-w-max">
            {stages.map((stage) => {
              const list = deals.filter((d) => d.stageId === stage.id)
              const total = list.reduce((a, d) => a + (d.value || 0), 0)
              const idx = stageIndex(stage.id)
              return (
                <section key={stage.id} className="min-w-[272px] w-[272px] sm:flex-1 shrink-0 rounded-2xl homy-glass-soft p-3 flex flex-col">
                  <header className="px-1 mb-3">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span aria-hidden className="size-2.5 rounded-full shrink-0 ring-2 ring-white/70" style={{ background: stage.color }} />
                        <h2 className="font-bold text-sm text-[#0A2540] truncate">{stage.name}</h2>
                      </div>
                      <span className="homy-pill">{list.length}</span>
                    </div>
                    {total > 0 && (
                      <p className="text-xs font-bold text-[#1D63B8] mt-1.5 tabular-nums">{formatARS(total)}</p>
                    )}
                  </header>

                  <div className="space-y-2.5 flex-1 min-h-[80px]">
                    {list.map((deal) => (
                      <article key={deal.id} className="homy-glass homy-card-glow rounded-2xl p-3.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-bold text-sm text-[#0A2540] leading-snug break-words min-w-0">{deal.title}</p>
                          <button onClick={() => setDeleteTarget(deal)} title="Eliminar trato" aria-label={`Eliminar ${deal.title}`}
                            className="rounded-lg p-2 -m-1 text-slate-300 hover:text-red-500 transition shrink-0">
                            <Trash2 className="size-4" />
                          </button>
                        </div>
                        <p className={`text-lg font-extrabold mt-0.5 text-right tabular-nums ${deal.value > 0 ? 'text-[#0A2540]' : 'text-slate-300'}`}>
                          {deal.value > 0 ? formatARS(deal.value) : '—'}
                        </p>
                        {(deal.counterparty?.displayName || deal.note) && (
                          <p className="flex items-center gap-1.5 mt-2 text-xs text-slate-500 min-w-0">
                            {deal.counterparty ? (
                              <>
                                <UAvatar name={deal.counterparty.displayName} url={deal.counterparty.avatarUrl} size={18} />
                                <span className="truncate">{deal.counterparty.displayName}</span>
                              </>
                            ) : (
                              <>
                                <UserRound className="size-3.5 shrink-0" aria-hidden />
                                <span className="truncate">{deal.note}</span>
                              </>
                            )}
                          </p>
                        )}
                        <div className="flex items-center justify-between gap-2 mt-3 pt-3 border-t border-[#0A2540]/8">
                          <button onClick={() => move(deal, -1)} disabled={idx === 0 || movingId === deal.id}
                            title={idx > 0 ? `Mover a “${stages[idx - 1].name}”` : 'Primera etapa'}
                            aria-label={`Mover ${deal.title} a la etapa anterior`}
                            className="homy-glass-soft homy-focus rounded-xl size-11 grid place-items-center text-slate-500 hover:text-[#1D63B8] disabled:opacity-30 disabled:hover:text-slate-500 transition">
                            <ChevronLeft className="size-4" />
                          </button>
                          <span aria-hidden className="text-[10px] font-extrabold uppercase tracking-[0.14em] text-slate-300 tabular-nums">
                            {idx + 1} / {stages.length}
                          </span>
                          <button onClick={() => move(deal, +1)} disabled={idx === stages.length - 1 || movingId === deal.id}
                            title={idx < stages.length - 1 ? `Mover a “${stages[idx + 1].name}”` : 'Última etapa'}
                            aria-label={`Mover ${deal.title} a la etapa siguiente`}
                            className="homy-glass-soft homy-focus rounded-xl size-11 grid place-items-center text-slate-500 hover:text-emerald-600 disabled:opacity-30 disabled:hover:text-slate-500 transition">
                            <ChevronRight className="size-4" />
                          </button>
                        </div>
                      </article>
                    ))}
                    {list.length === 0 && (
                      <p className="rounded-2xl border-2 border-dashed border-[#0A2540]/10 text-xs font-semibold text-slate-400 text-center py-7">
                        Sin tratos acá
                      </p>
                    )}
                  </div>
                </section>
              )
            })}
          </div>
        </div>
      )}

      {/* dialog nuevo trato */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <span aria-hidden className="homy-icon-chip homy-chip-mint size-8 [&_svg]:size-4"><Handshake /></span>
              Nuevo trato
            </DialogTitle>
            <DialogDescription>Anotá el contacto o la cotización para hacerle seguimiento en el pipeline.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="deal-title" className="text-[13px] font-bold text-[#0A2540]">Título</label>
              <input id="deal-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Corralón López — pedido de caños"
                className="homy-glass-input mt-1.5 w-full rounded-xl px-4 py-3 min-h-[44px] text-sm" />
            </div>
            <div>
              <label htmlFor="deal-stage" className="text-[13px] font-bold text-[#0A2540]">Etapa</label>
              <select id="deal-stage" value={stageId || stages[0]?.id || ''} onChange={(e) => setStageId(e.target.value)}
                className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-3 min-h-[44px] text-sm">
                {stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="deal-value" className="text-[13px] font-bold text-[#0A2540]">Valor (ARS) <span className="text-slate-400 font-semibold">(opcional)</span></label>
                <input id="deal-value" type="number" min={0} value={value} onChange={(e) => setValue(e.target.value)} placeholder="0"
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-3 min-h-[44px] text-sm text-right tabular-nums" />
              </div>
              <div>
                <label htmlFor="deal-party" className="text-[13px] font-bold text-[#0A2540]">Contraparte <span className="text-slate-400 font-semibold">(opcional)</span></label>
                <input id="deal-party" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} placeholder="Cliente o profesional"
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-3 min-h-[44px] text-sm" />
              </div>
            </div>
            <button onClick={createDeal} disabled={busy} className="homy-btn-primary homy-focus w-full min-h-[48px] disabled:opacity-60">
              {busy ? 'Creando…' : 'Crear trato'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* confirmación de borrado */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar el trato “{deleteTarget?.title}”?</AlertDialogTitle>
            <AlertDialogDescription>Se saca del pipeline para siempre. Esta acción no se puede deshacer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-red-600 hover:bg-red-700 text-white">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* Estado vacío del panel: icono flotante + copy claro */
function Empty({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="homy-empty rounded-3xl border-2 border-dashed border-[#0A2540]/10">
      <span className="homy-empty-icon homy-icon-chip homy-chip-mint [&_svg]:size-7" aria-hidden>{icon}</span>
      <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">{title}</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
