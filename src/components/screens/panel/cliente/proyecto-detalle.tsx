'use client'
// Detalle de proyecto (cliente): brief, cotización del profesional, aprobación de materiales
// (reserva stock), etapas, facturas (Mercado Pago o efectivo), finalizar/cancelar y reseñas 360°.
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, Loading, UAvatar, VerifyBadge } from '@/components/app/ui-bits'
import { formatARS, formatARSCents, formatDate } from '@/lib/format'
import { MpFeeBreakdown, NoMpNotice, PaidFeeLine } from '@/components/app/mp-fee'
import { totalWithMp } from '@/lib/fees'
import { toast } from 'sonner'
import {
  Check, ArrowRight, Star, FolderKanban, Phone, Mail, Package, ReceiptText,
  Wallet, Flag, ListChecks, History, Info, FileDown, FileText, CircleCheck,
  Banknote, Undo2, Hourglass, Store, HandCoins, MessageSquare, CircleX, Loader2, RefreshCcw,
} from 'lucide-react'
import ReviewForm from '../review-form'
import SobrantesSection from '@/components/screens/panel/sobrantes-section'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

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

type Material = {
  id: string; name: string; unit: string; quantity: number; unitPrice: number; subtotal: number; status: string
  note: string | null; providerName: string | null; providerUserId: string | null; invoicedAt: string | null; createdAt: string
}
type Invoice = { id: string; number: string; total: number; serviceFee?: number; status: string; issuedAt: string; paymentMethod?: string | null }
type Charge = {
  id: string; number: string; description: string; amount: number; serviceFee?: number; status: string; method: string | null
  createdAt: string; providerName: string | null; providerMpConnected?: boolean
}
type Brief = { urgency?: string | null; address?: string | null; deadline?: string | null; photos?: string[] }
type Project = {
  id: string; title: string; description: string | null; stage: string; status: string
  laborCost: number; budgetMin: number | null; budgetMax: number | null; materialsCost: number; materialsPaymentMode: string
  conversationId: string | null
  urgency?: string | null; address?: string | null; deadline?: string | null; photos?: string[]
  // D16: solo llega si quien mira es el profesional que subcontrató desde su proyecto
  parentProject?: { id: string; title: string } | null
  professional: {
    id: string; userId: string; displayName: string; avatarUrl: string | null; verificationStatus?: string
    personType: string; companyName: string | null; phone: string | null; email: string | null
    mpConnected?: boolean
  }
}
type Data = { project: Project; materials: Material[]; invoices: Invoice[]; charges: Charge[]; role: string }

const STAGES = ['presupuesto', 'materiales', 'ejecucion', 'revision', 'finalizado']
const STAGE_LABEL: Record<string, string> = {
  presupuesto: 'Presupuesto', materiales: 'Materiales', ejecucion: 'Ejecución', revision: 'Revisión', finalizado: 'Finalizado',
}
const MP_NO_CONFIG = 'El pago con Mercado Pago no está disponible: podés pagar en efectivo'
const NET_ERROR = 'No pudimos conectar con HomIA. Revisá tu conexión y probá de nuevo.'

async function readJson(res: Response): Promise<Record<string, unknown> & { error?: string; needsConfig?: boolean; initPoint?: string }> {
  try { return await res.json() } catch { return {} }
}

export default function ClientProjectDetail({ id }: { id: string }) {
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // una acción en curso a la vez, identificada por clave (no bloquea toda la pantalla)
  const [busy, setBusy] = useState<string | null>(null)
  // targets ya reseñados en este proyecto (userId → reseña publicada)
  const [reviewedTargets, setReviewedTargets] = useState<Set<string>>(new Set())

  const [finishOpen, setFinishOpen] = useState(false)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [rejectFor, setRejectFor] = useState<Material | null>(null)
  const [rejectNote, setRejectNote] = useState('')

  async function load() {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${id}`)
      const d = await readJson(res)
      if (!res.ok) { setError(d.error || 'No pudimos cargar el proyecto'); return }
      setData(d as unknown as Data)
      const resRev = await fetch(`/api/reviews?mine=1&projectId=${id}`)
      if (resRev.ok) {
        const r = await readJson(resRev)
        setReviewedTargets(new Set(((r.reviews as { targetUserId: string }[] | undefined) || []).map((x) => x.targetUserId)))
      }
    } catch {
      setError(NET_ERROR)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  async function decideMaterial(materialId: string, action: 'aprobar' | 'rechazar', note?: string) {
    setBusy(`material:${materialId}`)
    try {
      const res = await fetch(`/api/projects/${id}/materials`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId, action, note: note?.trim() || undefined }),
      })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No se pudo actualizar el material'); return false }
      toast.success(action === 'aprobar' ? 'Material aprobado: el proveedor lo reservó para tu obra' : 'Material rechazado')
      load()
      return true
    } catch {
      toast.error(NET_ERROR)
      return false
    } finally { setBusy(null) }
  }

  async function patchProject(body: Record<string, unknown>, key: string, okMsg: string) {
    setBusy(key)
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No se pudo actualizar el proyecto'); return false }
      toast.success(okMsg)
      load()
      return true
    } catch {
      toast.error(NET_ERROR)
      return false
    } finally { setBusy(null) }
  }

  async function finishProject() {
    const okd = await patchProject({ stage: 'finalizado' }, 'finalizar', '¡Obra finalizada! Ya podés dejar tus reseñas.')
    if (okd) setFinishOpen(false)
  }

  async function cancelProject() {
    if (cancelReason.trim().length < 3) { toast.error('Contá brevemente el motivo'); return }
    const okd = await patchProject({ status: 'cancelado', cancelReason: cancelReason.trim() }, 'cancelar', 'Proyecto cancelado')
    if (okd) { setCancelOpen(false); setCancelReason('') }
  }

  async function payInvoice(invoiceId: string) {
    setBusy(`invoice:${invoiceId}`)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}`, { method: 'POST' })
      const d = await readJson(res)
      if (!res.ok) {
        if (d.needsConfig) toast.info(d.error || MP_NO_CONFIG)
        else toast.error(d.error || 'No se pudo iniciar el pago')
        return
      }
      if (d.initPoint) window.location.href = d.initPoint
    } catch {
      toast.error(NET_ERROR)
    } finally { setBusy(null) }
  }

  async function invoiceCash(invoiceId: string, action: 'acordar' | 'cancelar') {
    setBusy(`invoice:${invoiceId}`)
    try {
      const res = await fetch(`/api/invoices/${invoiceId}/cash`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No se pudo actualizar el acuerdo'); return }
      toast.success(action === 'acordar'
        ? 'Efectivo acordado: el profesional confirma cuando recibe el dinero'
        : 'Acuerdo cancelado: elegí otro método de pago')
      load()
    } catch {
      toast.error(NET_ERROR)
    } finally { setBusy(null) }
  }

  async function payCharge(chargeId: string, method: 'mercadopago' | 'efectivo') {
    setBusy(`charge:${chargeId}`)
    try {
      const res = await fetch(`/api/charges/${chargeId}`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      })
      const d = await readJson(res)
      if (!res.ok) {
        if (d.needsConfig) toast.info(d.error || MP_NO_CONFIG)
        else toast.error(d.error || 'No se pudo iniciar el pago')
        return
      }
      if (method === 'mercadopago') {
        if (d.initPoint) window.location.href = d.initPoint
        return
      }
      toast.success('Efectivo acordado con el proveedor: confirma cuando lo cobre')
      load()
    } catch {
      toast.error(NET_ERROR)
    } finally { setBusy(null) }
  }

  if (loading) return <Loading />
  if (!data) {
    return (
      <div className="homy-page">
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <span className="homy-empty-icon homy-chip-blue" aria-hidden><FolderKanban className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">{error ? 'No pudimos cargar el proyecto' : 'Proyecto no encontrado'}</h3>
          {error && <p className="mt-1.5 max-w-sm text-sm text-slate-500">{error}</p>}
          <div className="mt-5 flex flex-wrap justify-center gap-2">
            {error && (
              <button onClick={load} className="homy-btn-primary px-5 py-3 text-sm sm:py-2.5">
                <RefreshCcw className="size-4" aria-hidden /> Reintentar
              </button>
            )}
            <button onClick={() => navigate('/panel/cliente/proyectos')} className="homy-btn-dark px-5 py-3 text-sm sm:py-2.5">Volver a mis proyectos</button>
          </div>
        </div>
      </div>
    )
  }
  const p = data.project
  const isActive = p.status === 'activo'
  const isCancelled = p.status === 'cancelado'
  const stageIdx = STAGES.indexOf(p.stage)
  const stageNum = Math.max(stageIdx, 0)
  const progress = p.stage === 'finalizado' ? 100 : ((stageNum + 1) / STAGES.length) * 100
  const pending = data.materials.filter((m) => m.status === 'propuesto')
  const decided = data.materials.filter((m) => m.status !== 'propuesto')
  const clientePagaMateriales = p.materialsPaymentMode === 'cliente_paga_proveedor'
  const canFinish = isActive && (p.stage === 'ejecucion' || p.stage === 'revision')
  const canCancel = isActive && (p.stage === 'presupuesto' || p.stage === 'materiales')
  const quoted = p.laborCost > 0
  const proName = p.professional.companyName || p.professional.displayName
  const budgetLabel = p.budgetMin && p.budgetMax
    ? `${formatARS(p.budgetMin)} – ${formatARS(p.budgetMax)}`
    : p.budgetMin ? `Desde ${formatARS(p.budgetMin)}`
    : p.budgetMax ? `Hasta ${formatARS(p.budgetMax)}`
    : null
  const brief: Brief | null = (p.urgency || p.address || p.deadline || (p.photos && p.photos.length > 0))
    ? { urgency: p.urgency, address: p.address, deadline: p.deadline, photos: p.photos || [] }
    : null
  const chatHref = p.conversationId ? `/mensajes?c=${p.conversationId}` : `/mensajes?c=nuevo:${p.professional.userId}`

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <span className="homy-eyebrow">Proyecto · {STAGE_LABEL[p.stage] || p.stage}</span>
            <StatusBadge status={p.status} />
          </div>
          <h1 className="homy-page-title mt-1.5">{p.title}</h1>
          <p className="homy-page-sub">Proyecto con {proName}</p>
        </div>
        {(canFinish || canCancel) && (
          <div className="flex flex-wrap gap-2">
            {canFinish && (
              <button onClick={() => setFinishOpen(true)} disabled={busy !== null} className="homy-btn-primary homy-focus px-5 py-3 text-sm disabled:opacity-50 sm:py-2.5">
                <Flag className="size-4" aria-hidden /> Finalizar obra
              </button>
            )}
            {canCancel && (
              <button onClick={() => setCancelOpen(true)} disabled={busy !== null} className="homy-glass-soft homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:text-red-500 disabled:opacity-50">
                <CircleX className="size-4" aria-hidden /> Cancelar proyecto
              </button>
            )}
          </div>
        )}
      </header>

      {isCancelled && (
        <section className="mb-5 rounded-3xl border border-red-100 bg-red-50 p-5" aria-label="Proyecto cancelado">
          <p className="flex items-center gap-2 font-extrabold text-[#0A2540]">
            <CircleX className="size-5 text-red-500" aria-hidden /> Este proyecto fue cancelado
          </p>
          <p className="mt-1 text-sm leading-relaxed text-slate-600">
            El motivo quedó en tus notificaciones y en el chat. Los materiales que estaban reservados volvieron al stock del proveedor. Si querés, buscá otro profesional en el directorio.
          </p>
          <button onClick={() => navigate('/directorio')} className="homy-btn-dark mt-3 px-4 py-2.5 text-sm">Buscar otro profesional</button>
        </section>
      )}

      {/* D16: subcontratación → link al proyecto original (lo ve solo el profesional que subcontrata) */}
      {p.parentProject && (
        <button
          type="button"
          onClick={() => navigate(`/panel/profesional/proyectos/${p.parentProject!.id}`)}
          className="homy-glass-soft homy-focus mb-5 flex min-h-[44px] w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition hover:ring-1 hover:ring-[#1D63B8]/30"
        >
          <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><FolderKanban /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-slate-400">Subcontratación</span>
            <span className="block truncate text-sm font-bold text-[#0A2540]">Parte del proyecto {p.parentProject.title}</span>
          </span>
          <ArrowRight className="size-4 shrink-0 text-[#1D63B8]" aria-hidden />
        </button>
      )}

      {/* qué pediste: brief textual de la contratación */}
      {p.description && (
        <section className="homy-glass mb-5 rounded-3xl p-5">
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><FileText /></span>
              Qué pediste
            </h2>
          </div>
          <p className="whitespace-pre-line text-sm leading-relaxed text-slate-600">{p.description}</p>
        </section>
      )}

      {/* brief de la contratación guiada (si el cliente contrató por el directorio) */}
      {brief && (
        <section className="homy-glass mb-5 rounded-3xl p-5">
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><ListChecks /></span>
              Cuándo y dónde
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

      {/* etapas + números */}
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
              <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${p.stage === s ? 'bg-[#0A2540] text-white shadow-md shadow-[#0A2540]/20' : stageIdx > i ? 'homy-glass-soft text-emerald-600' : 'homy-glass-soft text-slate-400'}`}>
                {stageIdx > i && <Check className="size-3" aria-hidden />}
                {STAGE_LABEL[s]}
              </span>
              {i < STAGES.length - 1 && <ArrowRight className="size-3 text-[#0A2540]/20" aria-hidden />}
            </span>
          ))}
        </div>
        {isActive && p.stage === 'presupuesto' && (
          <p className="homy-glass-soft mt-4 flex items-start gap-2.5 rounded-xl p-3.5 text-sm text-slate-500">
            <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            {quoted
              ? `${proName} ya cotizó la mano de obra. Cuando avance a Materiales vas a aprobar cada material que te proponga.`
              : `${proName} tiene que cotizar la mano de obra para arrancar. Si tenés dudas, escribile por el chat.`}
          </p>
        )}
        {isActive && p.stage === 'revision' && (
          <p className="homy-glass-soft mt-4 flex items-start gap-2.5 rounded-xl p-3.5 text-sm text-slate-500">
            <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
            Revisá la obra con calma. Cuando esté todo bien, tocá “Finalizar obra”: solo vos podés darla por terminada.
          </p>
        )}
        <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <MiniStat label="Presupuesto estimado" value={budgetLabel || 'Sin estimar'} muted={!budgetLabel} hint="Tu referencia" />
          <MiniStat
            label="Mano de obra cotizada"
            value={quoted ? formatARS(p.laborCost) : 'El profesional todavía no cotizó'}
            muted={!quoted}
          />
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
              <span className="font-extrabold text-[#0A2540]">Mano de obra:</span> la pagás a {proName} en su factura al finalizar.
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

      {/* contacto del profesional + chat (el cliente siempre puede iniciar) */}
      <section className="homy-row mb-5 flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex min-w-0 items-center gap-3">
          <UAvatar name={p.professional.displayName} url={p.professional.avatarUrl} size={46} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-1.5 font-bold text-[#0A2540]">
              <span className="truncate">{proName}</span>
              {p.professional.verificationStatus && <VerifyBadge status={p.professional.verificationStatus} compact />}
            </p>
            <p className="text-xs capitalize text-slate-500">{p.professional.personType}</p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button onClick={() => navigate(chatHref)} className="homy-btn-primary min-h-[44px] px-4 py-2 text-sm">
            <MessageSquare className="size-4" aria-hidden /> Abrir chat
          </button>
          {p.professional.phone && (
            <a href={`tel:${p.professional.phone}`} className="homy-glass-soft homy-focus inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-[#0A2540] transition hover:text-[#1D63B8]">
              <Phone className="size-4" aria-hidden /> Llamar
            </a>
          )}
          {p.professional.email && (
            <a href={`mailto:${p.professional.email}`} className="homy-glass-soft homy-focus inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 py-2 text-sm font-bold text-[#0A2540] transition hover:text-[#1D63B8]">
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
            {pending.map((m) => {
              const mBusy = busy === `material:${m.id}`
              return (
                <div key={m.id} className="homy-row p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[#0A2540]">{m.name}</p>
                      <p className="text-sm text-slate-500">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}{m.providerName ? ` · ${m.providerName}` : ''}</p>
                      {m.note && <p className="mt-1 text-xs text-slate-400">{m.note}</p>}
                      {m.providerName && (
                        <p className="mt-1 flex items-center gap-1 text-xs font-bold text-[#1D63B8]">
                          <HandCoins className="size-3.5" aria-hidden />
                          {clientePagaMateriales
                            ? `Si lo aprobás, ${m.providerName} lo reserva y te lo cobra directamente`
                            : `Si lo aprobás, ${m.providerName} lo reserva para tu obra`}
                        </p>
                      )}
                    </div>
                    <p className="homy-num-cell max-w-[45%] text-lg font-extrabold text-[#0A2540]"><span className="homy-num-adapt">{formatARS(m.subtotal)}</span></p>
                  </div>
                  {isActive && (
                    <div className="mt-3 flex justify-end gap-2">
                      <button disabled={busy !== null} onClick={() => { setRejectFor(m); setRejectNote('') }} className="homy-glass-soft homy-focus min-h-[40px] rounded-full px-4 py-2 text-sm font-bold text-slate-600 transition hover:text-red-500 disabled:opacity-60">Rechazar</button>
                      <button disabled={busy !== null} onClick={() => decideMaterial(m.id, 'aprobar')} className="homy-btn-primary min-h-[40px] px-4 py-2 text-sm disabled:opacity-60">
                        {mBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Aprobar
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
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
            {decided.map((m) => {
              const counts = m.status === 'aprobado'
              return (
                // flex-wrap + base 11rem: con "facturado" + precio + Rechazar el texto quedaba en una columna de 50px
                <div key={m.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 py-2.5">
                  <div className="min-w-0 flex-[1_1_11rem]">
                    <p className={`line-clamp-1 text-sm font-semibold ${counts ? 'text-[#0A2540]' : 'text-slate-400 line-through'}`}>{m.name}</p>
                    <p className="text-xs text-slate-400">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}{m.providerName ? ` · ${m.providerName}` : ''}</p>
                    {m.status === 'rechazado' && m.note && <p className="mt-0.5 text-xs text-slate-400">{m.note}</p>}
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                    <StatusBadge status={m.status} />
                    {counts && m.invoicedAt && <span className="homy-pill"><span className="homy-pill-dot bg-emerald-500" aria-hidden />facturado</span>}
                    {counts && <p className="text-sm font-bold tabular-nums">{formatARS(m.subtotal)}</p>}
                    {counts && isActive && !m.invoicedAt && (
                      <button disabled={busy !== null} onClick={() => { setRejectFor(m); setRejectNote('') }} className="homy-focus rounded-lg px-2 py-1 text-xs font-bold text-slate-400 transition hover:text-red-500 disabled:opacity-60" title="Rechazar este material (vuelve al stock del proveedor)">
                        Rechazar
                      </button>
                    )}
                  </div>
                </div>
              )
            })}
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
              {data.charges.map((ch) => {
                const cBusy = busy === `charge:${ch.id}`
                return (
                  <div key={ch.id} className="homy-row flex flex-wrap items-center justify-between gap-2 p-3.5">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[#0A2540]">{ch.number} · {ch.providerName || 'Proveedor'}</p>
                      <p className="line-clamp-1 text-xs text-slate-400">{ch.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="font-extrabold tabular-nums">{formatARS(ch.amount)}</p>
                      {ch.status === 'pendiente' && (
                        <div className="flex flex-wrap items-center gap-2">
                          {ch.providerMpConnected && (
                            <button disabled={busy !== null} onClick={() => payCharge(ch.id, 'mercadopago')} className="homy-btn-primary min-h-[40px] px-4 py-2 text-sm disabled:opacity-60">
                              {cBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wallet className="size-4" aria-hidden />} Mercado Pago · {formatARSCents(totalWithMp(ch.amount))}
                            </button>
                          )}
                          <button disabled={busy !== null} onClick={() => payCharge(ch.id, 'efectivo')} className="homy-glass-soft homy-focus min-h-[40px] rounded-xl px-4 py-2 text-sm font-bold text-[#0A2540] transition hover:bg-[#0A2540]/10 disabled:opacity-60">
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
                    {ch.status === 'pendiente' && (
                      <div className="basis-full">
                        {ch.providerMpConnected ? <MpFeeBreakdown subtotal={ch.amount} className="mt-1 max-w-sm" /> : <NoMpNotice name={ch.providerName || 'El proveedor'} />}
                      </div>
                    )}
                    {ch.status === 'pagada' && ch.method === 'mercadopago' && (
                      <div className="basis-full"><PaidFeeLine subtotal={ch.amount} fee={ch.serviceFee || 0} /></div>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>
      )}

      {/* sobrantes (D14): la devolución es con quien te cobró los materiales */}
      <div className="mb-5">
        <SobrantesSection
          projectId={id}
          canRequest
          sellerNote={clientePagaMateriales
            ? 'Los materiales se los pagaste a cada proveedor: la devolución es con ellos.'
            : `Los materiales te los vendió ${proName} en su factura: la devolución es con él.`}
        />
      </div>
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
            El profesional emite la factura con el detalle (mano de obra y, si corresponde, materiales). La pagás con Mercado Pago (+ cargo de servicio HomIA del 1%) o en efectivo sin cargo.
          </p>
        ) : (
          <div className="space-y-2.5 homy-stagger">
            {data.invoices.map((inv) => {
              const iBusy = busy === `invoice:${inv.id}`
              return (
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
                        <button disabled={busy !== null} onClick={() => invoiceCash(inv.id, 'cancelar')} className="homy-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-xl homy-glass-soft px-3.5 py-2 text-xs font-bold text-slate-500 transition hover:text-red-500 disabled:opacity-60">
                          <Undo2 className="size-3.5" aria-hidden /> Cancelar
                        </button>
                      </div>
                    ) : (
                      <div className="flex flex-wrap items-center gap-2">
                        {p.professional.mpConnected && (
                          <button disabled={busy !== null} onClick={() => payInvoice(inv.id)} className="homy-btn-primary min-h-[40px] px-4 py-2 text-sm disabled:opacity-60">
                            {iBusy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wallet className="size-4" aria-hidden />} Mercado Pago · {formatARSCents(totalWithMp(inv.total))}
                          </button>
                        )}
                        <button disabled={busy !== null} onClick={() => invoiceCash(inv.id, 'acordar')} className="homy-glass-soft homy-focus min-h-[40px] rounded-xl px-4 py-2 text-sm font-bold text-[#0A2540] transition hover:bg-[#0A2540]/10 disabled:opacity-60">
                          <Banknote className="mr-1 inline size-4" aria-hidden /> Efectivo
                        </button>
                      </div>
                    ))}
                  </div>
                  {inv.status === 'pendiente' && inv.paymentMethod !== 'efectivo' && (
                    <div className="basis-full">
                      {p.professional.mpConnected
                        ? <MpFeeBreakdown subtotal={inv.total} className="mt-1 max-w-sm" />
                        : <NoMpNotice name={p.professional.companyName || p.professional.displayName} />}
                    </div>
                  )}
                  {inv.status === 'pagada' && inv.paymentMethod === 'mercadopago' && (
                    <div className="basis-full"><PaidFeeLine subtotal={inv.total} fee={inv.serviceFee || 0} /></div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </section>

      {/* reseñas 360°: quién, cuándo y dónde — siempre visible para que el cliente sepa dónde reseñar */}
      {(() => {
        const finalized = p.stage === 'finalizado' || p.status === 'finalizado'
        if (isCancelled) return null
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
                  targetName={proName}
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

      {/* confirmar finalización */}
      <AlertDialog open={finishOpen} onOpenChange={(o) => { if (busy !== 'finalizar') setFinishOpen(o) }}>
        <AlertDialogContent className="homy-glass-strong rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#0A2540]">¿Finalizás la obra?</AlertDialogTitle>
            <AlertDialogDescription className="text-slate-600">
              {data.invoices.length === 0
                ? 'No hay factura emitida: ¿finalizás igual? El profesional todavía puede facturarte después, y al finalizar se habilitan las reseñas.'
                : 'Al finalizar, la obra queda cerrada y se habilitan las reseñas para vos y para tu profesional. Esta acción no se deshace.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === 'finalizar'} className="min-h-[44px] rounded-xl">Todavía no</AlertDialogCancel>
            <AlertDialogAction
              disabled={busy === 'finalizar'}
              onClick={(e) => { e.preventDefault(); finishProject() }}
              className="homy-btn-primary min-h-[44px] rounded-xl"
            >
              {busy === 'finalizar' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Flag className="size-4" aria-hidden />}
              {data.invoices.length === 0 ? 'Finalizar igual' : 'Sí, finalizar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* cancelar proyecto con motivo */}
      <Dialog open={cancelOpen} onOpenChange={(o) => { if (busy !== 'cancelar') setCancelOpen(o) }}>
        <DialogContent className="homy-glass-strong rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-[#0A2540]">Cancelar el proyecto</DialogTitle>
            <DialogDescription className="text-slate-600">
              Se cancela para vos y para {proName}; los materiales reservados vuelven al stock del proveedor. Contale el motivo: le llega por notificación y por el chat.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="cancel-reason" className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#0A2540]/70">Motivo</label>
          <textarea
            id="cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value.slice(0, 500))}
            rows={3} placeholder="Ej: conseguí otro presupuesto, cambié de idea, no puedo ahora…"
            className="homy-glass-input rounded-xl px-3.5 py-3 min-h-[44px] text-sm w-full resize-none leading-relaxed"
          />
          <DialogFooter>
            <button type="button" disabled={busy === 'cancelar'} onClick={() => setCancelOpen(false)} className="homy-glass-soft homy-focus min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600">Volver</button>
            <button type="button" disabled={busy === 'cancelar' || cancelReason.trim().length < 3} onClick={cancelProject} className="homy-btn-dark min-h-[44px] rounded-xl px-4 py-2.5 text-sm disabled:opacity-50">
              {busy === 'cancelar' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CircleX className="size-4" aria-hidden />} Cancelar proyecto
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* rechazar material con motivo opcional */}
      <Dialog open={rejectFor !== null} onOpenChange={(o) => { if (!o && !busy) setRejectFor(null) }}>
        <DialogContent className="homy-glass-strong rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-[#0A2540]">Rechazar {rejectFor?.name}</DialogTitle>
            <DialogDescription className="text-slate-600">
              {rejectFor?.status === 'aprobado'
                ? 'Este material ya estaba aprobado: al rechazarlo vuelve al stock del proveedor. Si querés, contale al profesional por qué.'
                : 'El profesional puede proponerte una alternativa. Si querés, contale por qué lo rechazás.'}
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="reject-note" className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#0A2540]/70">Motivo (opcional)</label>
          <textarea
            id="reject-note" value={rejectNote} onChange={(e) => setRejectNote(e.target.value.slice(0, 500))}
            rows={3} placeholder="Ej: muy caro, prefiero otra marca, ya lo tengo…"
            className="homy-glass-input rounded-xl px-3.5 py-3 min-h-[44px] text-sm w-full resize-none leading-relaxed"
          />
          <DialogFooter>
            <button type="button" disabled={busy !== null} onClick={() => setRejectFor(null)} className="homy-glass-soft homy-focus min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600">Volver</button>
            <button
              type="button" disabled={busy !== null}
              onClick={async () => { if (rejectFor && await decideMaterial(rejectFor.id, 'rechazar', rejectNote)) setRejectFor(null) }}
              className="homy-btn-dark min-h-[44px] rounded-xl px-4 py-2.5 text-sm disabled:opacity-50"
            >
              {busy?.startsWith('material:') ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CircleX className="size-4" aria-hidden />} Rechazar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MiniStat({ label, value, accent, muted, hint }: { label: string; value: string; accent?: boolean; muted?: boolean; hint?: string }) {
  return (
    <div className="homy-glass-soft homy-num-cell rounded-2xl px-4 py-3">
      <p className="text-[0.68rem] font-bold uppercase tracking-[0.09em] text-slate-400">{label}</p>
      {muted ? (
        <p className="text-sm font-bold leading-snug text-slate-500">{value}</p>
      ) : (
        <p className={`font-extrabold ${accent ? 'text-[#FF5A1F]' : 'text-[#0A2540]'}`}>
          <span className="homy-num-adapt">{value}</span>
        </p>
      )}
      {hint && <p className="mt-0.5 text-[10px] text-slate-400">{hint}</p>}
    </div>
  )
}
