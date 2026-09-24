'use client'
// CRM del profesional: pipeline kanban con etapas, tratos y movimiento entre columnas
import { useEffect, useMemo, useState } from 'react'
import { Loading, UAvatar } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ChevronLeft, ChevronRight, Plus, Trash2, BarChart3, Handshake } from 'lucide-react'

type Stage = { id: string; name: string; color: string; sortOrder: number }
type Pipeline = { id: string; name: string; stages: Stage[] }
type Deal = {
  id: string; stageId: string; title: string; value: number; note: string | null
  counterparty: { id: string; displayName: string; avatarUrl: string | null } | null
}

export default function ProCRM() {
  const [pipelines, setPipelines] = useState<Pipeline[]>([])
  const [deals, setDeals] = useState<Deal[]>([])
  const [pipelineId, setPipelineId] = useState('')
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // nuevo trato
  const [newForStage, setNewForStage] = useState<Stage | null>(null)
  const [newTitle, setNewTitle] = useState('')
  const [newValue, setNewValue] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/crm/pipelines')
      if (res.ok) {
        const data = await res.json()
        setPipelines(data.pipelines || [])
        setDeals(data.deals || [])
        setPipelineId((cur) => cur || (data.pipelines || [])[0]?.id || '')
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  const pipeline = useMemo(() => pipelines.find((p) => p.id === pipelineId) || pipelines[0], [pipelines, pipelineId])
  const stageDeals = useMemo(() => {
    const map = new Map<string, Deal[]>()
    for (const d of deals) {
      const arr = map.get(d.stageId) || []
      arr.push(d)
      map.set(d.stageId, arr)
    }
    return map
  }, [deals])

  async function createDeal() {
    if (!pipeline || !newForStage) return
    if (!newTitle.trim()) { toast.error('Poné un título al trato'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/crm/deals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pipelineId: pipeline.id, stageId: newForStage.id, title: newTitle.trim(), value: parseFloat(newValue) || 0 }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      toast.success('Trato creado')
      setNewForStage(null); setNewTitle(''); setNewValue('')
      load()
    } finally { setBusy(false) }
  }

  async function moveDeal(deal: Deal, dir: -1 | 1) {
    if (!pipeline) return
    const idx = pipeline.stages.findIndex((s) => s.id === deal.stageId)
    const target = pipeline.stages[idx + dir]
    if (!target) return
    setBusy(true)
    try {
      const res = await fetch('/api/crm/deals', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: deal.id, stageId: target.id }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      setDeals((cur) => cur.map((d) => (d.id === deal.id ? { ...d, stageId: target.id } : d)))
      toast.success(`Movido a "${target.name}"`)
    } finally { setBusy(false) }
  }

  async function deleteDeal(dealId: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/crm/deals?id=${dealId}`, { method: 'DELETE' })
      if (!res.ok) { toast.error((await res.json()).error); return }
      toast.success('Trato eliminado')
      setDeals((cur) => cur.filter((d) => d.id !== dealId))
    } finally { setBusy(false) }
  }

  if (loading) return <Loading />

  if (!pipeline) {
    return (
      <div className="homy-page">
        <header className="homy-page-head">
          <div className="min-w-0">
            <span className="homy-eyebrow">CRM</span>
            <h1 className="homy-page-title mt-1.5">Tu pipeline de clientes</h1>
            <p className="homy-page-sub">Seguí tus oportunidades de trabajo columna por columna.</p>
          </div>
        </header>
        <Empty />
      </div>
    )
  }

  const totalValue = deals.reduce((a, d) => a + d.value, 0)

  return (
    <div className="homy-page">
      {/* Encabezado */}
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">CRM</span>
          <h1 className="homy-page-title mt-1.5">Tu pipeline de clientes</h1>
          <p className="homy-page-sub">Seguí tus oportunidades de trabajo columna por columna.</p>
        </div>
        {pipelines.length > 1 && (
          <div className="shrink-0">
            <Select value={pipeline.id} onValueChange={setPipelineId}>
              <SelectTrigger className="homy-glass-input rounded-xl px-3 py-2.5 text-sm font-semibold cursor-pointer min-h-[44px] min-w-[140px] border-none" aria-label="Pipeline">
                <SelectValue placeholder="Seleccionar pipeline" />
              </SelectTrigger>
              <SelectContent>
                {pipelines.map((p) => <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}
      </header>

      {/* Resumen del pipeline */}
      <div className="flex flex-wrap items-center gap-2.5 mb-5">
        <span className="homy-glass rounded-full px-4 py-2.5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500">
          <Handshake className="size-4 text-[#1D63B8]" aria-hidden />
          {deals.length} trato{deals.length === 1 ? '' : 's'} activo{deals.length === 1 ? '' : 's'}
        </span>
        <span className="homy-glass rounded-full px-4 py-2.5 inline-flex items-center gap-2 text-sm font-semibold text-slate-500">
          Valor total del pipeline:
          <b className="text-[#0A2540] tabular-nums">{formatARS(totalValue)}</b>
        </span>
      </div>

      {/* Kanban */}
      <div className="overflow-x-auto no-scrollbar pb-4 -mx-1 px-1">
        <div className="flex gap-3 min-w-max items-start">
          {pipeline.stages.map((stage, i) => {
            const list = stageDeals.get(stage.id) || []
            const stageValue = list.reduce((a, d) => a + d.value, 0)
            return (
              <div key={stage.id} className="min-w-[264px] w-[264px] shrink-0 rounded-3xl homy-glass-soft p-3 flex flex-col max-h-[36rem]">
                <div className="flex items-center justify-between gap-2 mb-1 px-1.5 pt-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-2.5 rounded-full shrink-0 ring-2 ring-white/70" style={{ background: stage.color || '#1D63B8' }} aria-hidden />
                    <p className="font-bold text-[#0A2540] text-sm truncate">{stage.name}</p>
                  </div>
                  <span className="homy-glass rounded-full px-2 py-0.5 text-xs font-bold text-slate-500 tabular-nums">{list.length}</span>
                </div>
                {stageValue > 0 && (
                  <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400 tabular-nums px-1.5 mb-2">
                    {formatARS(stageValue)}
                  </p>
                )}

                <div className="space-y-2 flex-1 overflow-y-auto homy-scroll pt-1 px-0.5 -mx-0.5">
                  {list.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-5 border border-dashed border-[#0A2540]/10 rounded-2xl">
                      Sin tratos en esta etapa
                    </p>
                  )}
                  {list.map((d) => (
                    <div key={d.id} className="rounded-2xl homy-glass homy-card-glow p-3">
                      <p className="font-bold text-[#0A2540] text-sm leading-snug break-words">{d.title}</p>
                      {d.value > 0 && <p className="text-sm font-extrabold text-[#FF5A1F] mt-1 text-right tabular-nums">{formatARS(d.value)}</p>}
                      {d.counterparty && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <UAvatar name={d.counterparty.displayName} url={d.counterparty.avatarUrl} size={20} />
                          <span className="text-xs text-slate-500 truncate">{d.counterparty.displayName}</span>
                        </div>
                      )}
                      {d.note && <p className="text-xs text-slate-400 mt-1.5 homy-glass-soft rounded-lg p-2 leading-relaxed">{d.note}</p>}
                      <div className="flex items-center justify-between mt-2.5">
                        <div className="flex gap-1">
                          <button disabled={busy || i === 0} onClick={() => moveDeal(d, -1)}
                            className="homy-glass-soft rounded-lg p-2 text-slate-500 hover:text-[#1D63B8] transition disabled:opacity-30"
                            aria-label={`Mover "${d.title}" a la etapa anterior`} title="Etapa anterior">
                            <ChevronLeft className="size-3.5" aria-hidden />
                          </button>
                          <button disabled={busy || i === pipeline.stages.length - 1} onClick={() => moveDeal(d, 1)}
                            className="homy-glass-soft rounded-lg p-2 text-slate-500 hover:text-emerald-600 transition disabled:opacity-30"
                            aria-label={`Mover "${d.title}" a la etapa siguiente`} title="Etapa siguiente">
                            <ChevronRight className="size-3.5" aria-hidden />
                          </button>
                        </div>
                        <button disabled={busy} onClick={() => deleteDeal(d.id)}
                          className="rounded-lg p-2 text-slate-300 hover:text-red-500 transition disabled:opacity-30"
                          aria-label={`Eliminar trato "${d.title}"`} title="Eliminar trato">
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={() => { setNewForStage(stage); setNewTitle(''); setNewValue('') }}
                  className="mt-2.5 w-full rounded-xl border-2 border-dashed border-[#0A2540]/12 py-2.5 text-xs font-bold text-slate-400 hover:border-[#1D63B8]/50 hover:text-[#1D63B8] transition flex items-center justify-center gap-1">
                  <Plus className="size-3.5" aria-hidden /> Nuevo trato
                </button>
              </div>
            )
          })}
        </div>
      </div>

      {/* Dialog nuevo trato */}
      <Dialog open={!!newForStage} onOpenChange={(open) => !open && setNewForStage(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo trato en "{newForStage?.name}"</DialogTitle>
            <DialogDescription>Cargá la oportunidad y movela por el pipeline a medida que avance.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Título</span>
              <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} placeholder="Ej: Reforma baño — Moreno 1234"
                className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Valor estimado (ARS)</span>
              <input type="number" min="0" step="any" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="0"
                className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm tabular-nums" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setNewForStage(null)} className="homy-glass-soft rounded-full min-h-[44px] px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-red-500 transition">Cancelar</button>
              <button disabled={busy} onClick={createDeal} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50">Crear trato</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/* Estado vacío cuando no hay pipeline */
function Empty() {
  return (
    <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
      <span className="homy-empty-icon homy-chip-blue" aria-hidden><BarChart3 className="size-7" /></span>
      <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">No tenés pipelines todavía</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">
        El pipeline se crea automáticamente la primera vez que entrás.
      </p>
    </div>
  )
}
