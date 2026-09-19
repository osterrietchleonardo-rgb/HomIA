'use client'
// Detalle de proyecto (cliente): aprobar materiales, etapas, facturas con Mercado Pago, reseña final
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, Loading, UAvatar } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import {
  Check, ArrowRight, Star, FolderKanban, Phone, Mail, Package, ReceiptText,
  Wallet, Flag, ListChecks, History, Info, ShieldCheck, FileDown, FileText, CircleCheck,
  Banknote, Undo2, Hourglass, Store, HandCoins,
} from 'lucide-react'
import ReviewForm from '../review-form'

function verPdf(id: string, number_: string) {
  const w = window.open(`/api/invoices/${id}/pdf`, '_blank')
  if (!w) {
    const a = document.createElement('a')
    a.href = `/api/invoices/${id}/pdf`
    a.download = `Factura-${number_}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
}

type Material = { id: string; name: string; unit: string; quantity: number; unitPrice: number; subtotal: number; status: string; note: string | null; providerName: string | null; providerUserId: string | null; createdAt: string }
type Invoice = { id: string; number: string; total: number; status: string; issuedAt: string; paymentMethod?: string | null }
type Charge = { id: string; number: string; description: string; amount: number; status: string; method: string | null; createdAt: string; providerName: string | null }
type Brief = { urgency?: string | null; address?: string | null; deadline?: string | null; photos?: string[] }
type Project = {
  id: string; title: string; description: string | null; stage: string; status: string
  laborCost: number; materialsCost: number; materialsPaymentMode: string
  escrowStatus: string; escrowAmount: number
  urgency?: string | null; address?: string | null; deadline?: string | null; photos?: string[]
  professional: { id: string; userId: string; displayName: string; avatarUrl: string | null; personType: string; companyName: string | null; phone: string | null; email: string | null }
}
const STAGES = ['presupuesto', 'materiales', 'ejecucion', 'revision', 'finalizado']

export default function ClientProjectDetail({ id }: { id: string }) {
  const [data, setData] = useState<{ project: Project; materials: Material[]; invoices: Invoice[]; charges: Charge[]; role: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  // targets ya reseñados en este proyecto (userId → reseña publicada)
  const [reviewedTargets, setReviewedTargets] = useState<Set<string>>(new Set())
  const [confirmRelease, setConfirmRelease] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${id}`)
      if (res.ok) setData(await res.json())
      const resRev = await fetch(`/api/reviews?mine=1&projectId=${id}`)
      if (resRev.ok) {
        const d = await resRev.json()
        setReviewedTargets(new Set((d.reviews || []).map((r: { targetUserId: string }) => r.targetUserId)))
      }
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

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

  async function invoiceCash(invoiceId: string, action: 'acordar' | 'cancelar') {
    setBusy(true)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/cash`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      toast.success(action === 'acordar'
        ? 'Efectivo acordado: el profesional confirma cuando recibe el dinero'
        : 'Acuerdo cancelado: elegí otro método de pago')
      load()
    } finally { setBusy(false) }
  }

  async function payCharge(chargeId: string, method: 'mercadopago' | 'efectivo') {
    setBusy(true)
    try {
      const res = await fetch(`/api/charges/${chargeId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.needsConfig) {
          toast.error('Mercado Pago no configurado en el servidor')
        } else {
          toast.error(d.error)
        }
        return
      }
      if (method === 'mercadopago') {
        window.location.href = d.initPoint
        return
      }
      toast.success('Efectivo acordado con el proveedor: confirma cuando lo cobre')
      load()
    } finally { setBusy(false) }
  }

  async function startEscrow() {
    setBusy(true)
    try {
      const res = await fetch(`/api/projects/${id}/escrow`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        if (data.needsConfig) {
          toast.error('Mercado Pago no configurado en el servidor', { description: 'Agregá MP_ACCESS_TOKEN al archivo .env para retener pagos.' })
        } else {
          toast.error(data.error)
        }
        return
      }
      window.location.href = data.initPoint
    } finally { setBusy(false) }
  }

  async function releaseEscrow() {
    setBusy(true)
    try {
      const res = await fetch(`/api/projects/${id}/escrow/release`, { method: 'POST' })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success('¡Pago liberado! La factura quedó emitida como pagada.')
      setConfirmRelease(false)
      load()
    } finally { setBusy(false) }
  }

  if (loading) return <Loading />
  if (!data) {
    return (
      <div className="homy-page">
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <span className="homy-empty-icon homy-chip-blue" aria-hidden><FolderKanban className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">Proyecto no encontrado</h3>
          <button onClick={() => navigate('/panel/cliente/proyectos')} className="homy-btn-dark mt-5 px-5 py-3 text-sm sm:py-2.5">Volver a mis proyectos</button>
        </div>
      </div>
    )
  }
  const p = data.project
  const stageIdx = STAGES.indexOf(p.stage)
  const stageNum = Math.max(stageIdx, 0)
  const progress = p.stage === 'finalizado' ? 100 : ((stageNum + 1) / STAGES.length) * 100
  const pending = data.materials.filter((m) => m.status === 'propuesto')
  const decided = data.materials.filter((m) => m.status !== 'propuesto')
  const clientePagaMateriales = p.materialsPaymentMode === 'cliente_paga_proveedor'
  // en modo cliente_paga_proveedor la garantía cubre solo mano de obra
  const garantiaTotal = clientePagaMateriales ? p.laborCost : p.laborCost + p.materialsCost
  const brief: Brief | null = (p.urgency || p.address || p.deadline || (p.photos && p.photos.length > 0))
    ? { urgency: p.urgency, address: p.address, deadline: p.deadline, photos: p.photos || [] }
    : null

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="homy-eyebrow">Proyecto</span>
            <StatusBadge status={p.status} />
          </div>
          <h1 className="homy-page-title mt-1.5">{p.title}</h1>
          <p className="homy-page-sub">Proyecto con {p.professional.companyName || p.professional.displayName}</p>
        </div>
        {p.status !== 'finalizado' && (
          <div className="flex gap-2">
            {p.stage !== 'finalizado' && (
              <button onClick={() => setStage('finalizado')} className="homy-btn-primary homy-focus px-5 py-3 text-sm sm:py-2.5">
                <Flag className="size-4" aria-hidden /> Finalizar obra
              </button>
            )}
          </div>
        )}
      </header>

      {/* brief de la contratación guiada (si el cliente contrató por el directorio) */}
      {brief && (
        <section className="homy-glass mb-5 rounded-3xl p-5">
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><FileText /></span>
              Brief de la contratación
            </h2>
            {brief.urgency && <span className="homy-pill">{({ ya: 'Lo antes posible', esta_semana: 'Próximas semanas', normal: 'Fecha flexible' } as Record<string, string>)[brief.urgency] || brief.urgency}</span>}
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {brief.deadline && (
              <div className="homy-glass-soft rounded-xl px-4 py-3">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Fecha deseada</p>
                <p className="mt-0.5 text-sm font-bold text-[#0A2540]">{formatDate(brief.deadline)}</p>
              </div>
            )}
            {brief.address && (
              <div className="homy-glass-soft rounded-xl px-4 py-3">
                <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Dirección del trabajo</p>
                <p className="mt-0.5 text-sm font-bold text-[#0A2540]">{brief.address}</p>
              </div>
            )}
          </div>
          {brief.photos && brief.photos.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {brief.photos.map((ph, i) => (
                <img key={ph} src={ph} alt={`Foto ${i + 1} del brief`} className="h-20 w-20 rounded-xl object-cover ring-1 ring-[#0A2540]/10" />
              ))}
            </div>
          )}
        </section>
      )}

      {/* etapas */}
      <section className="homy-glass mb-5 rounded-3xl p-5 sm:p-6">
        <div className="homy-section-head">
          <h2 className="homy-section-title">
            <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><ListChecks /></span>
            Etapas de la obra
          </h2>
          <span className="text-xs font-bold text-slate-400 tabular-nums">Etapa {stageNum + 1} de {STAGES.length}</span>
        </div>
        <div className="homy-progress" role="img" aria-label={`Progreso: etapa ${stageNum + 1} de ${STAGES.length}`}>
          <i style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-1.5 sm:gap-2">
          {STAGES.map((s, i) => (
            <span key={s} className="flex items-center gap-1.5 sm:gap-2">
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold capitalize ${p.stage === s ? 'bg-[#0A2540] text-white shadow-md shadow-[#0A2540]/20' : stageIdx > i ? 'homy-glass-soft text-emerald-600' : 'homy-glass-soft text-slate-400'}`}>
                {stageIdx > i && <Check className="size-3" aria-hidden />}
                {s}
              </span>
              {i < STAGES.length - 1 && <ArrowRight className="size-3 text-[#0A2540]/20" aria-hidden />}
            </span>
          ))}
        </div>
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <MiniStat label="Mano de obra" value={formatARS(p.laborCost)} />
          <MiniStat label="Materiales aprobados" value={formatARS(p.materialsCost)} />
          <MiniStat label="Total" value={formatARS(p.laborCost + p.materialsCost)} accent />
        </div>
      </section>

      {/* quién paga los materiales: banner siempre visible para los 3 roles implicados */}
      <section className="homy-glass mb-5 rounded-3xl p-5" aria-label="Modo de pago de materiales">
        <div className="homy-section-head">
          <h2 className="homy-section-title">
            <span className="homy-icon-chip homy-chip-ai size-8 shrink-0 [&_svg]:size-4" aria-hidden><Store /></span>
            ¿Quién paga los materiales?
          </h2>
          <span className="homy-pill">Acordado con tu profesional</span>
        </div>
        {clientePagaMateriales ? (
          <div className="grid gap-2.5 text-sm sm:grid-cols-2">
            <p className="homy-glass-soft rounded-xl p-3.5 leading-relaxed text-slate-600">
              <span className="font-extrabold text-[#0A2540]">Materiales:</span> los pagás <span className="font-bold text-[#1D63B8]">directamente al proveedor</span> cuando te los cobre (Mercado Pago o efectivo, abajo en “Pagos a proveedores”).
            </p>
            <p className="homy-glass-soft rounded-xl p-3.5 leading-relaxed text-slate-600">
              <span className="font-extrabold text-[#0A2540]">Mano de obra:</span> la pagás a {p.professional.companyName || p.professional.displayName} en su factura al finalizar.
            </p>
          </div>
        ) : (
          <div className="grid gap-2.5 text-sm sm:grid-cols-2">
            <p className="homy-glass-soft rounded-xl p-3.5 leading-relaxed text-slate-600">
              <span className="font-extrabold text-[#0A2540]">Materiales:</span> los adelanta tu profesional y los ves detallados en <span className="font-bold">su factura</span> (más mano de obra).
            </p>
            <p className="homy-glass-soft rounded-xl p-3.5 leading-relaxed text-slate-600">
              <span className="font-extrabold text-[#0A2540]">Mano de obra:</span> incluida en la misma factura del profesional.
            </p>
          </div>
        )}
      </section>

      {/* pago protegido (escrow Mercado Pago) */}
      <section className="homy-glass mb-5 rounded-3xl p-5">
        <div className="homy-section-head">
          <h2 className="homy-section-title">
            <span className="homy-icon-chip homy-chip-gold size-8 shrink-0 [&_svg]:size-4" aria-hidden><ShieldCheck /></span>
            Pago protegido (escrow)
          </h2>
          {p.escrowStatus === 'retained' && <span className="homy-pill">Fondos en garantía · {formatARS(p.escrowAmount)}</span>}
          {p.escrowStatus === 'released' && <span className="homy-pill">Pago liberado</span>}
        </div>
        {p.escrowStatus === 'none' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="homy-glass-soft flex max-w-xl items-start gap-2.5 rounded-xl p-3.5 text-sm text-slate-500">
              <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
              {clientePagaMateriales
                ? <>Retenés {formatARS(garantiaTotal)} con Mercado Pago (solo mano de obra: los materiales los pagás directamente al proveedor). El profesional trabaja sabiendo que su pago está asegurado y vos lo liberás cuando la obra quede bien.</>
                : <>Retenés {formatARS(garantiaTotal)} con Mercado Pago. El profesional trabaja sabiendo que el pago está asegurado y vos lo liberás cuando la obra quede bien.</>}
            </p>
            <button disabled={busy || p.status !== 'activo'} onClick={startEscrow} className="homy-btn-primary px-5 py-3 text-sm">
              <ShieldCheck className="size-4" aria-hidden /> Retener pago en garantía
            </button>
          </div>
        )}
        {p.escrowStatus === 'retained' && (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="homy-glass-soft flex max-w-xl items-start gap-2.5 rounded-xl p-3.5 text-sm text-slate-500">
              <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
              Tus fondos están retenidos. Cuando confirmes que la obra quedó bien, liberás el pago y se emite la factura al profesional.
            </p>
            {confirmRelease ? (
              <div className="flex items-center gap-2">
                <button onClick={() => setConfirmRelease(false)} disabled={busy} className="homy-glass-soft homy-focus rounded-full px-4 py-2 text-sm font-bold text-slate-600 transition hover:text-[#0A2540]">Volver</button>
                <button onClick={releaseEscrow} disabled={busy} className="homy-btn-primary px-5 py-3 text-sm">
                  <Check className="size-4" aria-hidden /> Confirmar liberación
                </button>
              </div>
            ) : (
              <button onClick={() => setConfirmRelease(true)} disabled={busy} className="homy-btn-primary px-5 py-3 text-sm">
                <Wallet className="size-4" aria-hidden /> Liberar pago al profesional
              </button>
            )}
          </div>
        )}
        {p.escrowStatus === 'released' && (
          <p className="homy-glass-soft flex items-start gap-2.5 rounded-xl p-3.5 text-sm text-slate-500">
            <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            Liberaste el pago y el profesional ya cobró. Podés ver la factura en la sección de abajo.
          </p>
        )}
      </section>

      {/* contacto del profesional */}
      <section className="homy-row mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex items-center gap-3">
          <UAvatar name={p.professional.displayName} url={p.professional.avatarUrl} size={46} />
          <div className="min-w-0">
            <p className="font-bold text-[#0A2540]">{p.professional.companyName || p.professional.displayName}</p>
            <p className="text-xs capitalize text-slate-500">{p.professional.personType}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {p.professional.phone && (
            <a href={`tel:${p.professional.phone}`} className="homy-glass-soft homy-focus inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-[#0A2540] transition hover:text-[#1D63B8]">
              <Phone className="size-4" aria-hidden /> {p.professional.phone}
            </a>
          )}
          {p.professional.email && (
            <a href={`mailto:${p.professional.email}`} className="homy-glass-soft homy-focus inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-[#0A2540] transition hover:text-[#1D63B8]">
              <Mail className="size-4" aria-hidden /> Email
            </a>
          )}
        </div>
      </section>

      {/* materiales por aprobar */}
      {pending.length > 0 && (
        <section className="homy-glass homy-glass-featured mb-5 rounded-3xl p-5">
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-4" aria-hidden><Package /></span>
              Materiales por aprobar
            </h2>
            <span className="homy-pill">{pending.length} pendiente{pending.length > 1 ? 's' : ''}</span>
          </div>
          <div className="space-y-2.5 homy-stagger">
            {pending.map((m) => (
              <div key={m.id} className="homy-row p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0A2540]">{m.name}</p>
                    <p className="text-sm text-slate-500">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}{m.providerName ? ` · ${m.providerName}` : ''}</p>
                    {m.note && <p className="mt-1 text-xs text-slate-400">{m.note}</p>}
                    {clientePagaMateriales && m.providerName && (
                      <p className="mt-1 flex items-center gap-1 text-xs font-bold text-[#1D63B8]">
                        <HandCoins className="size-3.5" aria-hidden /> Si lo aprobás, te lo cobra {m.providerName} directamente (no va en la factura del profesional)
                      </p>
                    )}
                  </div>
                  <p className="text-lg font-extrabold text-[#0A2540] tabular-nums">{formatARS(m.subtotal)}</p>
                </div>
                <div className="mt-3 flex justify-end gap-2">
                  <button disabled={busy} onClick={() => decideMaterial(m.id, 'rechazar')} className="homy-glass-soft homy-focus rounded-full px-4 py-2 text-sm font-bold text-slate-600 transition hover:text-red-500 disabled:opacity-60">Rechazar</button>
                  <button disabled={busy} onClick={() => decideMaterial(m.id, 'aprobar')} className="homy-btn-primary px-4 py-2 text-sm">
                    <Check className="size-4" aria-hidden /> Aprobar
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* materiales decididos */}
      {decided.length > 0 && (
        <section className="homy-glass mb-5 rounded-3xl p-5">
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-mint size-8 shrink-0 [&_svg]:size-4" aria-hidden><History /></span>
              Historial de materiales
            </h2>
          </div>
          <div className="divide-y divide-[#0A2540]/5">
            {decided.map((m) => (
              <div key={m.id} className="flex items-center justify-between gap-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0A2540] line-clamp-1">{m.name}</p>
                  <p className="text-xs text-slate-400">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}</p>
                </div>
                <div className="flex shrink-0 items-center gap-2.5">
                  <StatusBadge status={m.status} />
                  <p className="text-sm font-bold tabular-nums">{formatARS(m.subtotal)}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* pagos a proveedores (materiales en modo cliente_paga_proveedor) */}
      {(data.charges.length > 0 || (clientePagaMateriales && data.materials.some((m) => m.status === 'aprobado' && m.providerName))) && (
        <section className="homy-glass mb-5 rounded-3xl p-5">
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-ai size-9 shrink-0 [&_svg]:size-4" aria-hidden><Store /></span>
              Pagos a proveedores (materiales)
            </h2>
            <span className="homy-pill">{data.charges.length}</span>
          </div>
          {data.charges.length === 0 ? (
            <p className="homy-glass-soft flex items-start gap-2.5 rounded-xl p-3.5 text-sm text-slate-500">
              <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
              Los materiales aprobados te los va a cobrar cada proveedor directamente (aparecen acá cuando te emitan el cobro). La factura del profesional cubre solo la mano de obra.
            </p>
          ) : (
            <div className="space-y-2.5 homy-stagger">
              {data.charges.map((ch) => (
                <div key={ch.id} className="homy-row flex flex-wrap items-center justify-between gap-2 p-3.5">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0A2540]">{ch.number} · {ch.providerName || 'Proveedor'}</p>
                    <p className="text-xs text-slate-400 line-clamp-1">{ch.description}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-extrabold tabular-nums">{formatARS(ch.amount)}</p>
                    {ch.status === 'pendiente' && (
                      <div className="flex items-center gap-2">
                        <button disabled={busy} onClick={() => payCharge(ch.id, 'mercadopago')} className="homy-btn-primary px-4 py-2 text-sm">
                          <Wallet className="size-4" aria-hidden /> Mercado Pago
                        </button>
                        <button disabled={busy} onClick={() => payCharge(ch.id, 'efectivo')} className="homy-glass-soft homy-focus rounded-xl px-4 py-2 text-sm font-bold text-[#0A2540] transition hover:bg-[#0A2540]/10">
                          <Banknote className="mr-1 inline size-4" aria-hidden /> Efectivo
                        </button>
                      </div>
                    )}
                    {ch.status === 'acordada_efectivo' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1D63B8]/10 px-3.5 py-2 text-xs font-extrabold text-[#1D63B8]">
                        <Hourglass className="size-3.5" aria-hidden /> Efectivo acordado — esperando confirmación del proveedor
                      </span>
                    )}
                    {ch.status === 'pagada' && <StatusBadge status="pagada" />}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* facturas */}
      <section className="homy-glass mb-5 rounded-3xl p-5">
        <div className="homy-section-head">
          <h2 className="homy-section-title">
            <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-4" aria-hidden><ReceiptText /></span>
            Facturas
          </h2>
          <span className="homy-pill">{data.invoices.length}</span>
        </div>
        {data.invoices.length === 0 ? (
          <p className="homy-glass-soft flex items-start gap-2.5 rounded-xl p-3.5 text-sm text-slate-500">
            <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            El profesional factura con detalle explícito cuando haya materiales aprobados y mano de obra.
          </p>
        ) : (
          <div className="space-y-2.5 homy-stagger">
            {data.invoices.map((inv) => (
              <div key={inv.id} className="homy-row flex flex-wrap items-center justify-between gap-2 p-3.5">
                <div className="min-w-0">
                  <p className="font-bold text-[#0A2540]">{inv.number}</p>
                  <p className="text-xs text-slate-400">{formatDate(inv.issuedAt)}</p>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <p className="font-extrabold tabular-nums">{formatARS(inv.total)}</p>
                  <button
                    onClick={() => verPdf(inv.id, inv.number)}
                    aria-label={`Ver factura ${inv.number} en PDF`}
                    title="Ver / descargar PDF"
                    className="homy-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-xl homy-glass-soft px-3.5 py-2 text-xs font-bold text-[#1D63B8] transition hover:bg-[#1D63B8]/10"
                  >
                    <FileDown className="size-4" aria-hidden /> PDF
                  </button>
                  <StatusBadge status={inv.status} />
                  {inv.status === 'pendiente' && (inv.paymentMethod === 'efectivo' ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1D63B8]/10 px-3.5 py-2 text-xs font-extrabold text-[#1D63B8]">
                        <Hourglass className="size-3.5" aria-hidden /> Efectivo acordado — esperando confirmación
                      </span>
                      <button disabled={busy} onClick={() => invoiceCash(inv.id, 'cancelar')} className="homy-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-xl homy-glass-soft px-3.5 py-2 text-xs font-bold text-slate-500 transition hover:text-red-500">
                        <Undo2 className="size-3.5" aria-hidden /> Cancelar
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <button disabled={busy} onClick={() => payInvoice(inv.id)} className="homy-btn-primary px-4 py-2 text-sm">
                        <Wallet className="size-4" aria-hidden /> Mercado Pago
                      </button>
                      <button disabled={busy} onClick={() => invoiceCash(inv.id, 'acordar')} className="homy-glass-soft homy-focus rounded-xl px-4 py-2 text-sm font-bold text-[#0A2540] transition hover:bg-[#0A2540]/10">
                        <Banknote className="mr-1 inline size-4" aria-hidden /> Efectivo
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* reseñas 360°: quién, cuándo y dónde — siempre visible para que el cliente sepa dónde reseñar */}
      {(() => {
        const finalized = p.stage === 'finalizado' || p.status === 'finalizado'
        if (!finalized) {
          return (
            <section className="homy-glass mb-5 rounded-3xl p-5" aria-label="Reseñas bloqueadas hasta finalizar la obra">
              <div className="homy-section-head">
                <h2 className="homy-section-title">
                  <span className="homy-icon-chip homy-chip-gold size-8 shrink-0 [&_svg]:size-4" aria-hidden><Star /></span>
                  Reseñas
                </h2>
                <span className="homy-pill">Se activan al finalizar</span>
              </div>
              <p className="homy-glass-soft flex items-start gap-2.5 rounded-xl p-3.5 text-sm text-slate-500">
                <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
                Las reseñas las escriben solo quienes participaron de la obra, y recién cuando termina. Al finalizar este proyecto vas a poder calificar acá a tu profesional y a cada proveedor que vendió materiales, con texto y fotos.
              </p>
            </section>
          )
        }
        const providers = data.materials
          .filter((m) => m.providerUserId && m.providerUserId !== p.professional.userId)
          .filter((m, i, arr) => arr.findIndex((x) => x.providerUserId === m.providerUserId) === i)
        const proReviewed = reviewedTargets.has(p.professional.userId)
        const pendingProviders = providers.filter((m) => !reviewedTargets.has(m.providerUserId!))
        const allReviewed = proReviewed && pendingProviders.length === 0
        return (
          <>
            <div className="mb-2 rounded-2xl homy-glass-soft px-4 py-3 text-sm font-semibold text-slate-600">
              <span className="font-extrabold text-[#0A2540]">¿Quién califica a quién?</span> Vos calificás a tu profesional y a cada proveedor que te vendió materiales; tu profesional te califica a vos. Una vez por persona, con texto y fotos que avalen.
            </div>
            {allReviewed ? (
              <section className="homy-glass flex flex-wrap items-center gap-3 rounded-3xl p-5">
                <span className="homy-icon-chip homy-chip-mint size-10 shrink-0 [&_svg]:size-5" aria-hidden><CircleCheck /></span>
                <div className="min-w-0 flex-1">
                  <h2 className="text-base font-extrabold tracking-tight text-[#0A2540]">Gracias por tus reseñas</h2>
                  <p className="text-sm text-slate-500">Calificaste a todos los que participaron de esta obra. Tu opinión ayuda a que la comunidad contrate con confianza.</p>
                </div>
                <Star className="size-6 shrink-0 text-[#FFC700] fill-[#FFC700]" aria-hidden />
              </section>
            ) : (
              <div className="mb-2 rounded-2xl homy-glass-soft px-4 py-3 text-sm font-semibold text-slate-600">
                La obra terminó: dejá tu reseña a cada participante desde acá abajo.
              </div>
            )}
            {!proReviewed && (
              <div className="mb-5">
                <ReviewForm
                  targetUserId={p.professional.userId}
                  targetName={p.professional.companyName || p.professional.displayName}
                  targetLabel="al profesional"
                  projectId={id}
                  onDone={load}
                />
              </div>
            )}
            {pendingProviders.map((m) => (
              <div key={m.providerUserId} className="mb-5">
                <ReviewForm
                  targetUserId={m.providerUserId!}
                  targetName={m.providerName || 'el proveedor'}
                  targetLabel="al proveedor"
                  projectId={id}
                  onDone={load}
                />
              </div>
            ))}
          </>
        )
      })()}
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="homy-glass-soft rounded-2xl px-4 py-3">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.09em] text-slate-400">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${accent ? 'text-[#FF5A1F]' : 'text-[#0A2540]'}`}>{value}</p>
    </div>
  )
}
