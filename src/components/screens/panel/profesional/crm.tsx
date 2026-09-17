'use client'
// CRM del profesional: pipeline kanban con etapas, tratos y movimiento entre columnas
import { useEffect, useMemo, useState } from 'react'
import { PageHeader, Loading, EmptyState, UAvatar } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
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
      <div className="max-w-4xl">
        <PageHeader title="CRM" subtitle="Tu pipeline de clientes y oportunidades" />
        <EmptyState icon={<BarChart3 />} title="No tenés pipelines todavía"
          hint="El pipeline se crea automáticamente la primera vez que entrás." />
      </div>
    )
  }

  const totalValue = deals.reduce((a, d) => a + d.value, 0)

  return (
    <div className="max-w-full">
      <PageHeader
        title="CRM"
        subtitle="Seguí tus oportunidades de trabajo columna por columna"
        right={
          pipelines.length > 1 ? (
            <select value={pipeline.id} onChange={(e) => setPipelineId(e.target.value)} aria-label="Pipeline"
              className="homy-glass-input rounded-xl px-3 py-2.5 text-sm font-semibold cursor-pointer">
              {pipelines.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          ) : undefined
        }
      />

      <p className="text-sm text-slate-500 mb-4 flex items-center gap-1.5 flex-wrap">
        <Handshake className="size-4 text-[#1D63B8]" aria-hidden />
        {deals.length} trato{deals.length === 1 ? '' : 's'} · valor total del pipeline: <b className="text-[#0A2540] tabular-nums">{formatARS(totalValue)}</b>
      </p>

      <div className="overflow-x-auto no-scrollbar pb-4 -mx-1 px-1">
        <div className="flex gap-3 min-w-max">
          {pipeline.stages.map((stage, i) => {
            const list = stageDeals.get(stage.id) || []
            return (
              <div key={stage.id} className="min-w-[250px] w-[250px] shrink-0 rounded-2xl homy-glass-soft p-3 flex flex-col">
                <div className="flex items-center justify-between gap-2 mb-3 px-1">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="size-2.5 rounded-full shrink-0 ring-2 ring-white/70" style={{ background: stage.color || '#1D63B8' }} aria-hidden />
                    <p className="font-bold text-[#0A2540] text-sm truncate">{stage.name}</p>
                  </div>
                  <span className="homy-glass rounded-full px-2 py-0.5 text-xs font-bold text-slate-500 tabular-nums">{list.length}</span>
                </div>

                <div className="space-y-2 flex-1">
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
                      {d.note && <p className="text-xs text-slate-400 mt-1.5 homy-glass-soft rounded-lg p-2">{d.note}</p>}
                      <div className="flex items-center justify-between mt-2.5">
                        <div className="flex gap-1">
                          <button disabled={busy || i === 0} onClick={() => moveDeal(d, -1)}
                            className="homy-glass-soft rounded-lg p-1.5 text-slate-500 hover:text-[#1D63B8] transition disabled:opacity-30"
                            aria-label={`Mover "${d.title}" a la etapa anterior`} title="Etapa anterior">
                            <ChevronLeft className="size-3.5" aria-hidden />
                          </button>
                          <button disabled={busy || i === pipeline.stages.length - 1} onClick={() => moveDeal(d, 1)}
                            className="homy-glass-soft rounded-lg p-1.5 text-slate-500 hover:text-emerald-600 transition disabled:opacity-30"
                            aria-label={`Mover "${d.title}" a la etapa siguiente`} title="Etapa siguiente">
                            <ChevronRight className="size-3.5" aria-hidden />
                          </button>
                        </div>
                        <button disabled={busy} onClick={() => deleteDeal(d.id)}
                          className="rounded-lg p-1.5 text-slate-300 hover:text-red-500 transition disabled:opacity-30"
                          aria-label={`Eliminar trato "${d.title}"`} title="Eliminar trato">
                          <Trash2 className="size-3.5" aria-hidden />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <button onClick={() => { setNewForStage(stage); setNewTitle(''); setNewValue('') }}
                  className="mt-3 w-full rounded-xl border-2 border-dashed border-[#0A2540]/12 py-2 text-xs font-bold text-slate-400 hover:border-[#1D63B8]/50 hover:text-[#1D63B8] transition flex items-center justify-center gap-1">
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
                className="homy-glass-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Valor estimado (ARS)</span>
              <input type="number" min="0" step="any" value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="0"
                className="homy-glass-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm tabular-nums" />
            </label>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => setNewForStage(null)} className="homy-glass-soft rounded-full px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-red-500 transition">Cancelar</button>
              <button disabled={busy} onClick={createDeal} className="homy-btn-primary px-5 py-2.5 text-sm disabled:opacity-50">Crear trato</button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
