'use client'
// Detalle de proyecto (cliente): aprobar materiales, etapas, facturas con Mercado Pago, reseña final
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatusBadge, Loading, EmptyState, UAvatar, UStars } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { Check, X, ArrowRight, Star } from 'lucide-react'

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
      toast.success(action === 'aprobar' ? 'Material aprobado ✓' : 'Material rechazado')
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
  if (!data) return <EmptyState icon="📁" title="Proyecto no encontrado" />
  const p = data.project
  const pending = data.materials.filter((m) => m.status === 'propuesto')
  const decided = data.materials.filter((m) => m.status !== 'propuesto')

  return (
    <div className="max-w-4xl">
      <PageHeader title={p.title} subtitle={`Proyecto con ${p.professional.companyName || p.professional.displayName}`} />

      {/* etapas */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-5">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2">
            {STAGES.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${p.stage === s ? 'bg-[#1D63B8] text-white' : STAGES.indexOf(p.stage) > i ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {s}
                </span>
                {i < STAGES.length - 1 && <ArrowRight className="size-3 text-slate-300" />}
              </div>
            ))}
          </div>
          {p.status !== 'finalizado' && (
            <div className="flex gap-2">
              {p.stage !== 'finalizado' && <button onClick={() => setStage('finalizado')} className="rounded-xl bg-[#16A34A] text-white text-sm font-bold px-4 py-2 hover:bg-[#15803d] transition">Finalizar obra</button>}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
          <MiniStat label="Mano de obra" value={formatARS(p.laborCost)} />
          <MiniStat label="Materiales aprobados" value={formatARS(p.materialsCost)} />
          <MiniStat label="Total" value={formatARS(p.laborCost + p.materialsCost)} accent />
        </div>
      </div>

      {/* contacto del profesional */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 mb-5 flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <UAvatar name={p.professional.displayName} url={p.professional.avatarUrl} size={46} />
          <div>
            <p className="font-bold text-[#0A2540]">{p.professional.companyName || p.professional.displayName}</p>
            <p className="text-xs text-slate-500 capitalize">{p.professional.personType}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {p.professional.phone && <a href={`tel:${p.professional.phone}`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-[#0A2540] hover:border-[#1D63B8] transition">📞 {p.professional.phone}</a>}
          {p.professional.email && <a href={`mailto:${p.professional.email}`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-[#0A2540] hover:border-[#1D63B8] transition">✉️ Email</a>}
        </div>
      </div>

      {/* materiales por aprobar */}
      {pending.length > 0 && (
        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50/50 p-5 mb-5">
          <h2 className="font-extrabold text-[#0A2540] mb-3">Materiales por aprobar ({pending.length})</h2>
          <div className="space-y-2">
            {pending.map((m) => (
              <div key={m.id} className="rounded-2xl bg-white border border-amber-200 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-[#0A2540]">{m.name}</p>
                    <p className="text-sm text-slate-500">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}{m.providerName ? ` · ${m.providerName}` : ''}</p>
                    {m.note && <p className="text-xs text-slate-400 mt-1">{m.note}</p>}
                  </div>
                  <p className="text-lg font-extrabold text-[#0A2540]">{formatARS(m.subtotal)}</p>
                </div>
                <div className="flex gap-2 mt-3 justify-end">
                  <button disabled={busy} onClick={() => decideMaterial(m.id, 'rechazar')} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-slate-600 hover:border-red-400 hover:text-red-500 transition">Rechazar</button>
                  <button disabled={busy} onClick={() => decideMaterial(m.id, 'aprobar')} className="rounded-xl bg-[#16A34A] hover:bg-[#15803d] text-white px-4 py-2 text-sm font-bold transition flex items-center gap-1.5">
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
        <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-5">
          <h2 className="font-extrabold text-[#0A2540] mb-3">Historial de materiales</h2>
          <div className="divide-y divide-slate-100">
            {decided.map((m) => (
              <div key={m.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0A2540] truncate">{m.name}</p>
                  <p className="text-xs text-slate-400">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={m.status} />
                  <p className="text-sm font-bold">{formatARS(m.subtotal)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* facturas */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-5">
        <h2 className="font-extrabold text-[#0A2540] mb-3">Facturas ({data.invoices.length})</h2>
        {data.invoices.length === 0 ? (
          <p className="text-sm text-slate-500">El profesional factura con detalle explícito cuando haya materiales aprobados y mano de obra.</p>
        ) : (
          <div className="space-y-2">
            {data.invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3.5">
                <div>
                  <p className="font-bold text-[#0A2540]">{inv.number}</p>
                  <p className="text-xs text-slate-400">{formatDate(inv.issuedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-extrabold">{formatARS(inv.total)}</p>
                  <StatusBadge status={inv.status} />
                  {inv.status === 'pendiente' && (
                    <button disabled={busy} onClick={() => payInvoice(inv.id)} className="rounded-xl bg-[#009EE3] hover:bg-[#0082bb] text-white text-sm font-bold px-4 py-2 transition">
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
        <div className="rounded-3xl bg-gradient-to-br from-[#0A2540] to-[#1D63B8] p-6 text-white shadow-xl">
          <h2 className="font-extrabold text-lg flex items-center gap-2"><Star className="size-5 text-[#FFC700]" /> ¿Cómo fue la obra?</h2>
          <p className="text-sm text-slate-300 mt-1">Tu reseña ayuda a otros usuarios. Queda en el perfil del profesional.</p>
          <div className="flex gap-1 mt-3">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setRating(n)} className={`text-2xl transition ${n <= rating ? 'text-[#FFC700]' : 'text-white/25'}`} aria-label={`${n} estrellas`}>★</button>
            ))}
          </div>
          <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3} placeholder="Contá cómo trabajó, puntualidad, calidad…"
            className="mt-3 w-full rounded-xl bg-white/10 border border-white/20 px-4 py-3 text-white placeholder:text-slate-400 outline-none focus:border-[#00C4FF] resize-none" />
          <button onClick={submitReview} disabled={busy} className="mt-3 rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] px-6 py-2.5 font-bold text-white transition">
            Publicar reseña
          </button>
        </div>
      )}
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-400 font-semibold uppercase">{label}</p>
      <p className={`text-lg font-extrabold ${accent ? 'text-[#FF5A1F]' : 'text-[#0A2540]'}`}>{value}</p>
    </div>
  )
}
