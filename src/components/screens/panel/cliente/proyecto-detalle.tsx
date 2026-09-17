'use client'
// Detalle de proyecto (cliente): aprobar materiales, etapas, facturas con Mercado Pago, reseña final
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatusBadge, Loading, EmptyState, UAvatar, UStars } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { Check, ArrowRight, Star, FolderKanban, Phone, Mail, Package, ReceiptText } from 'lucide-react'

type Material = { id: string; name: string; unit: string; quantity: number; unitPrice: number; subtotal: number; status: string; note: string | null; providerName: string | null; createdAt: string }
type Invoice = { id: string; number: string; total: number; status: string; issuedAt: string }
type Project = {
  id: string; title: string; description: string | null; stage: string; status: string
  laborCost: number; materialsCost: number
  professional: { id: string; userId: string; displayName: string; avatarUrl: string | null; personType: string; companyName: string | null; phone: string | null; email: string | null }
}
const STAGES = ['presupuesto', 'materiales', 'ejecucion', 'revision', 'finalizado']

export default function ClientProjectDetail({ id }: { id: string }) {
  const [data, setData] = useState<{ project: Project; materials: Material[]; invoices: Invoice[]; role: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [alreadyReviewed, setAlreadyReviewed] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${id}`)
      if (res.ok) setData(await res.json())
      const resRev = await fetch(`/api/reviews?mine=1&projectId=${id}`)
      if (resRev.ok) {
        const d = await resRev.json()
        setAlreadyReviewed((d.reviews || []).some((r: { projectId: string }) => r.projectId === id))
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { load()   }, [id])

  async function decideMaterial(materialId: string, action: 'aprobar' | 'rechazar') {
    setBusy(true)
    try {
      const res = await fetch(`/api/projects/${id}/materials`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId, action }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      toast.success(action === 'aprobar' ? 'Material aprobado' : 'Material rechazado')
      load()
    } finally { setBusy(false) }
  }

  async function setStage(stage: string) {
    const res = await fetch(`/api/projects/${id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage }),
    })
    if (res.ok) { toast.success('Etapa actualizada'); load() }
  }

  async function payInvoice(invoiceId: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        if (data.needsConfig) {
          toast.error('Mercado Pago no configurado en el servidor', { description: 'Agregá MP_ACCESS_TOKEN al archivo .env para cobrar.' })
        } else {
          toast.error(data.error)
        }
        return
      }
      window.location.href = data.initPoint
    } finally { setBusy(false) }
  }

  async function submitReview() {
    if (!data || !comment.trim()) { toast.error('Escribí un comentario'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: data.project.professional.userId, rating, comment, context: 'proyecto', projectId: id }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      toast.success('¡Reseña publicada!')
      load()
    } finally { setBusy(false) }
  }

  if (loading) return <Loading />
  if (!data) return <EmptyState icon={<FolderKanban />} title="Proyecto no encontrado" />
  const p = data.project
  const stageIdx = STAGES.indexOf(p.stage)
  const pending = data.materials.filter((m) => m.status === 'propuesto')
  const decided = data.materials.filter((m) => m.status !== 'propuesto')

  return (
    <div className="max-w-4xl">
      <PageHeader title={p.title} subtitle={`Proyecto con ${p.professional.companyName || p.professional.displayName}`} />

      {/* etapas */}
      <div className="rounded-3xl homy-glass shadow-sm p-5 sm:p-6 mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
            {STAGES.map((s, i) => (
              <div key={s} className="flex items-center gap-1.5 sm:gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize inline-flex items-center gap-1 ${p.stage === s ? 'bg-[#0A2540] text-white shadow-md shadow-[#0A2540]/20' : stageIdx > i ? 'homy-glass-soft text-emerald-600' : 'homy-glass-soft text-slate-400'}`}>
                  {stageIdx > i && <Check className="size-3" aria-hidden />}
                  {s}
                </span>
                {i < STAGES.length - 1 && <ArrowRight className="size-3 text-[#0A2540]/20" aria-hidden />}
              </div>
            ))}
          </div>
          {p.status !== 'finalizado' && (
            <div className="flex gap-2">
              {p.stage !== 'finalizado' && <button onClick={() => setStage('finalizado')} className="homy-btn-primary px-4 py-2 text-sm">Finalizar obra</button>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-5">
          <MiniStat label="Mano de obra" value={formatARS(p.laborCost)} />
          <MiniStat label="Materiales aprobados" value={formatARS(p.materialsCost)} />
          <MiniStat label="Total" value={formatARS(p.laborCost + p.materialsCost)} accent />
        </div>
      </div>

      {/* contacto del profesional */}
      <div className="rounded-2xl homy-glass p-4 mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <UAvatar name={p.professional.displayName} url={p.professional.avatarUrl} size={46} />
          <div>
            <p className="font-bold text-[#0A2540]">{p.professional.companyName || p.professional.displayName}</p>
            <p className="text-xs text-slate-500 capitalize">{p.professional.personType}</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {p.professional.phone && <a href={`tel:${p.professional.phone}`} className="homy-glass-soft rounded-full px-4 py-2 text-sm font-bold text-[#0A2540] hover:text-[#1D63B8] transition inline-flex items-center gap-2"><Phone className="size-4" aria-hidden /> {p.professional.phone}</a>}
          {p.professional.email && <a href={`mailto:${p.professional.email}`} className="homy-glass-soft rounded-full px-4 py-2 text-sm font-bold text-[#0A2540] hover:text-[#1D63B8] transition inline-flex items-center gap-2"><Mail className="size-4" aria-hidden /> Email</a>}
        </div>
      </div>

      {/* materiales por aprobar */}
      {pending.length > 0 && (
        <div className="rounded-3xl border border-amber-300/70 bg-amber-100/40 p-5 mb-5">
          <h2 className="font-extrabold text-[#0A2540] mb-3 flex items-center gap-2.5">
            <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-4" aria-hidden><Package /></span>
            Materiales por aprobar ({pending.length})
          </h2>
          <div className="space-y-2.5">
            {pending.map((m) => (
              <div key={m.id} className="rounded-2xl homy-glass p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0A2540]">{m.name}</p>
                    <p className="text-sm text-slate-500">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}{m.providerName ? ` · ${m.providerName}` : ''}</p>
                    {m.note && <p className="text-xs text-slate-400 mt-1">{m.note}</p>}
                  </div>
                  <p className="text-lg font-extrabold text-[#0A2540] tabular-nums">{formatARS(m.subtotal)}</p>
                </div>
                <div className="flex gap-2 mt-3 justify-end">
                  <button disabled={busy} onClick={() => decideMaterial(m.id, 'rechazar')} className="homy-glass-soft rounded-full px-4 py-2 text-sm font-bold text-slate-600 hover:text-red-500 disabled:opacity-60 transition">Rechazar</button>
                  <button disabled={busy} onClick={() => decideMaterial(m.id, 'aprobar')} className="homy-btn-primary px-4 py-2 text-sm">
                    <Check className="size-4" /> Aprobar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* materiales decididos */}
      {decided.length > 0 && (
        <div className="rounded-2xl homy-glass p-5 mb-5">
          <h2 className="font-extrabold text-[#0A2540] mb-3">Historial de materiales</h2>
          <div className="divide-y divide-[#0A2540]/5">
            {decided.map((m) => (
              <div key={m.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0A2540] truncate">{m.name}</p>
                  <p className="text-xs text-slate-400">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <StatusBadge status={m.status} />
                  <p className="text-sm font-bold tabular-nums">{formatARS(m.subtotal)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* facturas */}
      <div className="rounded-2xl homy-glass p-5 mb-5">
        <h2 className="font-extrabold text-[#0A2540] mb-3 flex items-center gap-2.5">
          <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-4" aria-hidden><ReceiptText /></span>
          Facturas ({data.invoices.length})
        </h2>
        {data.invoices.length === 0 ? (
          <p className="text-sm text-slate-500 homy-glass-soft rounded-xl p-3.5">El profesional factura con detalle explícito cuando haya materiales aprobados y mano de obra.</p>
        ) : (
          <div className="space-y-2.5">
            {data.invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl homy-glass-soft p-3.5">
                <div>
                  <p className="font-bold text-[#0A2540]">{inv.number}</p>
                  <p className="text-xs text-slate-400">{formatDate(inv.issuedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-extrabold tabular-nums">{formatARS(inv.total)}</p>
                  <StatusBadge status={inv.status} />
                  {inv.status === 'pendiente' && (
                    <button disabled={busy} onClick={() => payInvoice(inv.id)} className="rounded-full bg-[#009EE3] hover:bg-[#0082bb] text-white text-sm font-bold px-4 py-2 transition shadow-lg shadow-[#009EE3]/25 disabled:opacity-60">
                      Pagar con Mercado Pago
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* reseña final */}
      {p.stage === 'finalizado' && !alreadyReviewed && (
        <div className="homy-glass-dark rounded-3xl p-6 sm:p-7 text-white relative overflow-hidden">
          <span aria-hidden className="pointer-events-none absolute -top-20 -right-16 size-56 rounded-full bg-[#00C4FF]/20 blur-3xl" />
          <h2 className="font-extrabold text-lg flex items-center gap-2.5 relative">
            <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-4" aria-hidden><Star /></span>
            ¿Cómo fue la obra?
          </h2>
          <p className="text-sm text-slate-300 mt-2 relative">Tu reseña ayuda a otros usuarios. Queda en el perfil del profesional.</p>
          <div className="flex gap-1.5 mt-4 relative">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} className={`transition-transform duration-200 hover:scale-110 ${n <= rating ? 'text-[#FFC700] fill-[#FFC700]' : 'text-white/25'}`} aria-label={`${n} estrellas`}>
                <Star className="size-7" />
              </button>
            ))}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Contá cómo trabajó, puntualidad, calidad…"
            className="relative mt-4 w-full rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-slate-400 outline-none focus:border-[#00C4FF] resize-none" />
          <button onClick={submitReview} disabled={busy} className="relative mt-4 homy-btn-primary px-6 py-2.5 text-sm">
            Publicar reseña
          </button>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl homy-glass-soft px-4 py-3">
      <p className="text-[0.68rem] text-slate-400 font-bold uppercase tracking-[0.09em]">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${accent ? 'text-[#FF5A1F]' : 'text-[#0A2540]'}`}>{value}</p>
    </div>
  )
}
