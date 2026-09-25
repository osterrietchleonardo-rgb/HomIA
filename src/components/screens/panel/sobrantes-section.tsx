'use client'
// Sobrantes — piezas reutilizables del lado de quien DEVUELVE (solicitante):
//   · <SobrantesSection>: sección para el detalle de proyecto (cliente / profesional en modo B)
//     y para cada compra directa pagada. Lista las devoluciones del origen y abre el diálogo.
//   · <ReturnRequestDialog>: diálogo "Devolver sobrantes" (bottom-sheet en móvil), también
//     usado por el profesional para "Pedir devolución a <proveedor>" (con precarga).
//   · <RequesterReturnList>: tarjetas con estado, "Recibí el reembolso" y "Cancelar pedido".
// D14 (24/09/2026): cada devolución es con quien te vendió (sellerName): el proveedor, o el
// profesional cuando te cobró los materiales en su factura.
//
// API:
//   <SobrantesSection projectId="…" canRequest sellerNote="…" tipo="cliente" />
//   <SobrantesSection purchaseId="…" canRequest compact />
import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { toast } from 'sonner'
import { formatARS, formatDate } from '@/lib/format'
import { Loading } from '@/components/app/ui-bits'
import { Link } from '@/lib/router'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Undo2, Camera, X, Loader2, CircleCheck, Hourglass, Ban, PackageCheck, Banknote, CircleAlert, Send, Trash2, ClipboardCopy, ArrowRight,
} from 'lucide-react'
import { subirImagen } from '@/lib/upload-image'

export type ReturnTipo = 'cliente' | 'profesional_a_proveedor'
export type EligibleItem = {
  materialId: string | null; purchaseId: string | null; purchaseItemId?: string | null; elementId: string; name: string; unit: string
  quantity: number; remaining: number; unitPrice: number
  providerId: string; providerName: string; paymentMethod: string | null; paidAt: string | null
  sellerKind?: 'proveedor' | 'profesional'; sellerName?: string
}
/** Lo que el cliente ya le devolvió al profesional (para precargar el pedido al proveedor). */
export type PrefillItem = { returnId: string; materialId: string; qty: number; condition: string; photoUrl: string; note: string | null }
export type LeftoverItemRow = {
  id: string; elementId: string; materialId?: string | null; qtyRequested: number; qtyAccepted: number | null; qtyReceived: number | null
  unitPricePaid: number; refundAmount: number | null; condition: string; photoUrl: string; note: string | null; status: string
  element: { id: string; name: string; unit: string }
}
export type LeftoverReturnRow = {
  id: string; status: string; paymentMethod: string | null; refundTotal: number; providerNote: string | null
  tipo?: ReturnTipo; sellerKind?: 'proveedor' | 'profesional'; sellerName?: string; sellerUserId?: string | null
  parentReturnId?: string | null; refundChannel?: string | null; refundMethod?: string | null; refundMethodNote?: string | null
  requestedAt: string; respondedAt: string | null; receivedAt: string | null; refundedAt: string | null
  refundConfirmedAt?: string | null; refundConfirmedBy?: string | null
  mpRefundId: string | null; projectId: string | null; purchaseId: string | null
  items: LeftoverItemRow[]
  requester: { id: string; displayName: string; avatarUrl: string | null; verificationStatus?: string }
  provider: { id: string; businessName: string; userId: string; user?: { avatarUrl: string | null } } | null
  professional?: { id: string; userId: string; companyName: string | null; user: { displayName: string; avatarUrl: string | null } } | null
  children?: { id: string; status: string; providerId: string | null }[]
  origin?: { kind: 'proyecto' | 'compra'; id: string; label: string; href: string } | null
}

export const RETURN_STATUS_META: Record<string, { label: string; icon: typeof Hourglass; tone: string }> = {
  solicitada: { label: 'Esperando respuesta', icon: Hourglass, tone: 'text-[#B98A00] bg-[#FFC700]/12 ring-[#FFC700]/35' },
  aceptada: { label: 'Aceptada: entregá los sobrantes', icon: CircleCheck, tone: 'text-[#1D63B8] bg-[#1D63B8]/10 ring-[#1D63B8]/30' },
  aceptada_parcial: { label: 'Aceptada en parte: entregá los sobrantes', icon: CircleCheck, tone: 'text-[#1D63B8] bg-[#1D63B8]/10 ring-[#1D63B8]/30' },
  rechazada: { label: 'Rechazada', icon: Ban, tone: 'text-red-600 bg-red-500/10 ring-red-500/30' },
  cancelada: { label: 'Cancelada', icon: Undo2, tone: 'text-slate-500 bg-slate-500/10 ring-slate-400/30' },
  recibida: { label: 'Recibida: reembolso pendiente', icon: PackageCheck, tone: 'text-[#FF5A1F] bg-[#FF5A1F]/10 ring-[#FF5A1F]/30' },
  reembolsada: { label: 'Reembolsada', icon: Banknote, tone: 'text-[#0e9f6e] bg-[#0e9f6e]/10 ring-[#0e9f6e]/30' },
  reembolso_fallido: { label: 'Reembolso en proceso', icon: CircleAlert, tone: 'text-[#FF5A1F] bg-[#FF5A1F]/10 ring-[#FF5A1F]/30' },
}
export const CONDITION_LABEL: Record<string, string> = { sin_abrir: 'Sin abrir', abierto_sin_usar: 'Abierto, sin usar' }
export const OUTSIDE_METHOD_LABEL: Record<string, string> = { efectivo: 'en efectivo', transferencia: 'por transferencia', saldo_a_favor: 'como saldo a favor en el local' }

async function readJson(res: Response): Promise<Record<string, any>> {
  try { return await res.json() } catch { return {} }
}

/** Nombre de quien vendió (y por eso acepta, recibe y reembolsa). */
export function sellerNameOf(r: LeftoverReturnRow): string {
  if (r.sellerName) return r.sellerName
  if (r.sellerKind === 'profesional' && r.professional) return r.professional.companyName || r.professional.user.displayName
  return r.provider?.businessName || 'el proveedor'
}

/** ¿El reembolso sale por Mercado Pago (sin confirmación del solicitante)? */
export function isMpRefund(r: LeftoverReturnRow): boolean {
  if (r.tipo === 'profesional_a_proveedor') return false
  if (r.refundChannel) return r.refundChannel === 'mercadopago'
  return r.paymentMethod === 'mercadopago'
}

/** Estado del reembolso en palabras (lado solicitante). */
export function refundStatusText(r: LeftoverReturnRow): string {
  const seller = sellerNameOf(r)
  const outside = r.tipo === 'profesional_a_proveedor'
  if (r.status === 'reembolsada') {
    if (isMpRefund(r)) return `Reembolsado por Mercado Pago el ${formatDate(r.refundedAt)}: se acredita en tu medio de pago en 1 a 15 días.`
    const how = outside ? (OUTSIDE_METHOD_LABEL[r.refundMethod || ''] || 'por fuera de HomIA') : 'en efectivo'
    const note = outside && r.refundMethodNote ? ` (${r.refundMethodNote})` : ''
    return r.refundConfirmedAt
      ? `Reembolsado ${how}${note} el ${formatDate(r.refundedAt)}. ${r.refundConfirmedBy === 'automatico' ? 'Se confirmó solo a las 72 h.' : 'Confirmaste que lo recibiste.'}`
      : `${seller} registró que te devolvió ${formatARS(r.refundTotal)} ${how}${note} el ${formatDate(r.refundedAt)}. Confirmá que lo recibiste (si no, se confirma solo a las 72 h).`
  }
  if (r.status === 'recibida') {
    return outside
      ? `Recibido el ${formatDate(r.receivedAt)}. ${seller} te devuelve ${formatARS(r.refundTotal)} por fuera de HomIA (efectivo, transferencia o saldo a favor) y lo marca acá.`
      : `Recibido el ${formatDate(r.receivedAt)}. ${seller} te devuelve ${formatARS(r.refundTotal)} en efectivo.`
  }
  if (r.status === 'reembolso_fallido') return `Recibido el ${formatDate(r.receivedAt)}. El reembolso de ${formatARS(r.refundTotal)} por Mercado Pago está en proceso.`
  if (r.status.startsWith('aceptada')) {
    const how = outside ? ' (te lo devuelve por fuera de HomIA cuando le lleves los materiales)'
      : r.paymentMethod === 'mercadopago' ? ' (vuelve a tu Mercado Pago cuando entregues los sobrantes)' : ' (en efectivo al entregar los sobrantes)'
    return `${seller} aceptó. Reembolso acordado: ${formatARS(r.refundTotal)}${how}.`
  }
  if (r.status === 'rechazada') return r.providerNote ? `${seller} no la aceptó. Motivo: ${r.providerNote}` : `${seller} no aceptó la devolución.`
  if (r.status === 'cancelada') return 'Cancelaste este pedido.'
  return `${seller} tiene que aceptar, ajustar o rechazar tu pedido.`
}

type DraftItem = {
  key: string
  src: EligibleItem
  qty: string
  condition: 'sin_abrir' | 'abierto_sin_usar'
  photoUrl: string
  note: string
  uploading: boolean
}

const sellerKeyOf = (e: EligibleItem) => (e.sellerKind === 'profesional' ? 'profesional' : e.providerId)

/**
 * Diálogo de carga de un pedido de devolución: cantidad, estado, foto obligatoria y nota por ítem.
 * `tipo = profesional_a_proveedor` → el profesional le devuelve a su proveedor (pago por fuera de HomIA).
 * `prefill` → ofrece "Precargar con lo que me devolvió el cliente" (vincula la devolución de origen).
 */
export function ReturnRequestDialog({ open, onClose, eligible, notEligible, projectId, purchaseId, tipo = 'cliente', title, subtitle, prefill, onCreated }: {
  open: boolean
  onClose: () => void
  eligible: EligibleItem[] | null
  notEligible: string | null
  projectId?: string
  purchaseId?: string
  tipo?: ReturnTipo
  title: string
  subtitle: string
  prefill?: PrefillItem[]
  onCreated: () => void
}) {
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [busy, setBusy] = useState(false)
  const [parentReturnId, setParentReturnId] = useState<string | null>(null)
  const proLeg = tipo === 'profesional_a_proveedor'

  // armar borradores cuando llegan los elegibles con el diálogo abierto
  useEffect(() => {
    if (!open) { setDrafts([]); setParentReturnId(null); return }
    if (!eligible) return
    setDrafts((prev) => prev.length ? prev : eligible.map((src) => ({
      key: src.materialId || src.purchaseItemId || src.purchaseId || src.elementId,
      src, qty: '', condition: 'sin_abrir', photoUrl: '', note: '', uploading: false,
    })))
  }, [open, eligible])

  // precarga: todo lo que el cliente ya le devolvió de estos materiales (la más reciente queda vinculada)
  const prefillRows = (() => {
    if (!prefill?.length || !eligible?.length) return []
    const ids = new Set(eligible.map((e) => e.materialId))
    return prefill.filter((p) => ids.has(p.materialId))
  })()

  function applyPrefill() {
    setDrafts((prev) => prev.map((d) => {
      const rows = prefillRows.filter((p) => p.materialId === d.src.materialId)
      if (!rows.length) return d
      const qty = Math.min(d.src.remaining, rows.reduce((a, p) => a + p.qty, 0))
      const first = rows[0]
      return { ...d, qty: String(qty), condition: first.condition === 'abierto_sin_usar' ? 'abierto_sin_usar' : 'sin_abrir', photoUrl: d.photoUrl || first.photoUrl, note: d.note || first.note || '' }
    }))
    setParentReturnId(prefillRows[0]?.returnId || null)
    toast.success('Precargado con lo que te devolvió el cliente', { description: 'Revisá cantidades y fotos antes de enviar.' })
  }

  function updateDraft(key: string, patch: Partial<DraftItem>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  async function uploadPhoto(key: string, file: File) {
    updateDraft(key, { uploading: true })
    try {
      const r = await subirImagen(file, 'sobrantes')
      if (!r.ok) { toast.error(r.error); return }
      updateDraft(key, { photoUrl: r.url })
    } finally {
      updateDraft(key, { uploading: false })
    }
  }

  const active = drafts.filter((d) => parseFloat(d.qty) > 0)
  const sellers = [...new Set(active.map((d) => sellerKeyOf(d.src)))]
  const estimated = active.reduce((a, d) => a + parseFloat(d.qty) * d.src.unitPrice, 0)

  async function submit() {
    if (active.length === 0) { toast.error('Indicá la cantidad a devolver de al menos un material'); return }
    if (sellers.length > 1) { toast.error('Un pedido agrupa ítems de un solo vendedor: hacé un pedido por cada uno'); return }
    for (const d of active) {
      const qty = parseFloat(d.qty)
      if (qty > d.src.remaining + 1e-9) { toast.error(`Podés devolver hasta ${d.src.remaining} ${d.src.unit} de "${d.src.name}"`); return }
      if (!d.photoUrl) { toast.error(`Falta la foto de "${d.src.name}"`); return }
      if (d.uploading) { toast.error('Esperá a que termine de subir la foto'); return }
    }
    setBusy(true)
    try {
      const res = await fetch('/api/returns', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tipo, projectId, purchaseId,
          parentReturnId: proLeg && parentReturnId ? parentReturnId : undefined,
          items: active.map((d) => ({
            materialId: d.src.materialId || undefined,
            purchaseId: d.src.purchaseId || undefined,
            purchaseItemId: d.src.purchaseItemId || undefined,
            elementId: d.src.elementId,
            qty: parseFloat(d.qty),
            condition: d.condition,
            photoUrl: d.photoUrl,
            note: d.note.trim() || undefined,
          })),
        }),
      })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No pudimos enviar el pedido'); return }
      const seller = active[0].src.sellerName || active[0].src.providerName
      toast.success('Pedido de devolución enviado', { description: `${seller} lo revisa y te avisamos cuando responda.` })
      onClose()
      onCreated()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(false)
    }
  }

  if (!open || typeof document === 'undefined') return null
  // portal a <body>: dentro del contenedor con scroll del panel, el botón flotante de Homy quedaba encima
  return createPortal(
    <div className="fixed inset-0 z-[55] flex items-end justify-center bg-[#0A2540]/45 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={title}>
      <div className="homy-glass-strong flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl">
        <div className="flex items-start justify-between gap-3 p-5 pb-3 sm:p-6 sm:pb-3">
          <div className="min-w-0">
            <p className="homy-eyebrow">Sobrantes</p>
            <h3 className="mt-0.5 text-lg font-extrabold text-[#0A2540]">{title}</h3>
            <p className="text-[12.5px] text-slate-500">{subtitle}</p>
          </div>
          <button type="button" onClick={() => { if (!busy) onClose() }} aria-label="Cerrar" className="grid size-10 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/70 hover:text-[#0A2540] transition">
            <X className="size-4" aria-hidden />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6">
          {prefillRows.length > 0 && eligible && eligible.length > 0 && (
            <div className="mb-3 rounded-2xl bg-[#0e9f6e]/8 p-3 ring-1 ring-[#0e9f6e]/25">
              <p className="text-[12.5px] leading-snug text-slate-600">Tu cliente ya te devolvió sobrantes de este proveedor. Podés usar esas cantidades y fotos.</p>
              <button type="button" onClick={applyPrefill} className="homy-glass-soft mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold text-[#0e9f6e]">
                <ClipboardCopy className="size-4" aria-hidden /> Precargar con lo que me devolvió el cliente
              </button>
            </div>
          )}
          {eligible === null ? (
            <Loading text="Buscando materiales…" />
          ) : eligible.length === 0 ? (
            <p className="rounded-2xl bg-[#FFC700]/10 px-4 py-3 text-[13px] text-slate-600">{notEligible || 'No hay materiales pagados con sobrantes para devolver.'}</p>
          ) : (
            <ul className="space-y-3 pb-2">
              {drafts.map((d) => {
                const qty = parseFloat(d.qty) || 0
                const step = /unidad/i.test(d.src.unit) ? 1 : 0.5
                const who = d.src.sellerKind === 'profesional'
                  ? `Te lo cobró ${d.src.sellerName} en su factura`
                  : d.src.providerName
                return (
                  <li key={d.key} className={`rounded-2xl p-3.5 ring-1 transition ${qty > 0 ? 'bg-[#1D63B8]/6 ring-[#1D63B8]/30' : 'bg-white/40 ring-[#0A2540]/8'}`}>
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="text-sm font-extrabold text-[#0A2540]">{d.src.name}</p>
                        <p className="text-[11.5px] text-slate-500">
                          {proLeg
                            ? <>Le pagaste {formatARS(d.src.unitPrice)} por {d.src.unit} · te vendió {d.src.quantity} · podés pedir hasta <b>{d.src.remaining} {d.src.unit}</b></>
                            : <>{who} · pagaste {formatARS(d.src.unitPrice)} por {d.src.unit} · podés devolver hasta <b>{d.src.remaining} {d.src.unit}</b></>}
                        </p>
                      </div>
                      {qty > 0 && <span className="homy-num-adapt shrink-0 text-sm font-extrabold tabular-nums text-[#0A2540]">{formatARS(qty * d.src.unitPrice)}</span>}
                    </div>
                    <div className="mt-2.5 grid grid-cols-2 gap-2">
                      <label className="block">
                        <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">Cantidad ({d.src.unit})</span>
                        <input
                          type="number" min={0} max={d.src.remaining} step={step} inputMode="decimal"
                          value={d.qty}
                          onChange={(e) => updateDraft(d.key, { qty: e.target.value })}
                          placeholder="0"
                          aria-label={`Cantidad de ${d.src.name}`}
                          className="homy-glass-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm"
                        />
                      </label>
                      <label className="block">
                        <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">Estado</span>
                        <select
                          value={d.condition}
                          onChange={(e) => updateDraft(d.key, { condition: e.target.value as DraftItem['condition'] })}
                          aria-label={`Estado de ${d.src.name}`}
                          className="homy-glass-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm"
                        >
                          <option value="sin_abrir">Sin abrir</option>
                          <option value="abierto_sin_usar">Abierto, sin usar</option>
                        </select>
                      </label>
                    </div>
                    {qty > 0 && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <PhotoPicker
                          url={d.photoUrl}
                          uploading={d.uploading}
                          onPick={(f) => void uploadPhoto(d.key, f)}
                          onClear={() => updateDraft(d.key, { photoUrl: '' })}
                          label={`Foto de ${d.src.name}`}
                        />
                        <input
                          value={d.note}
                          onChange={(e) => updateDraft(d.key, { note: e.target.value })}
                          maxLength={400}
                          placeholder="Nota (opcional): lote, medida, dónde lo guardaste…"
                          aria-label={`Nota sobre ${d.src.name}`}
                          className="homy-glass-input min-w-0 flex-1 rounded-xl px-3 py-2.5 text-sm"
                        />
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-[#0A2540]/8 p-5 pt-3 sm:p-6 sm:pt-3">
          {sellers.length > 1 && (
            <p className="mb-2 rounded-xl bg-red-500/8 px-3 py-2 text-[12px] font-bold text-red-700">Elegiste materiales de {sellers.length} vendedores distintos: hacé un pedido por cada uno.</p>
          )}
          <p className="text-[13px] text-slate-600">
            Reembolso estimado: <b className="text-[#0A2540] tabular-nums">{formatARS(estimated)}</b> <span className="text-slate-400">(lo confirma quien te vendió)</span>
          </p>
          {proLeg ? (
            <p className="mt-1 text-[11.5px] leading-snug text-slate-400">Como le pagaste por fuera de HomIA, el proveedor te devuelve la plata por fuera (efectivo, transferencia o saldo a favor) y lo marca en la app.</p>
          ) : active.some((d) => d.src.paymentMethod === 'mercadopago') && (
            <p className="mt-1 text-[11.5px] leading-snug text-slate-400">Se reembolsa el precio de lo que devolvés. El cargo de servicio HomIA (1%) que pagaste con Mercado Pago no se devuelve.</p>
          )}
          <button
            type="button"
            disabled={busy || active.length === 0 || sellers.length > 1 || (eligible?.length ?? 0) === 0}
            onClick={() => void submit()}
            className="homy-btn-primary mt-3 w-full px-6 py-3.5 text-[15px] disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} {busy ? 'Enviando…' : 'Enviar pedido de devolución'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Tarjetas de las devoluciones que pidió el usuario, con sus acciones (confirmar reembolso / cancelar). */
export function RequesterReturnList({ returns, onChanged, showOrigin = false }: {
  returns: LeftoverReturnRow[]
  onChanged: () => void
  showOrigin?: boolean
}) {
  const [busy, setBusy] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<LeftoverReturnRow | null>(null)
  const [zoom, setZoom] = useState<string | null>(null)

  async function act(r: LeftoverReturnRow, action: 'confirmar_reembolso' | 'cancelar') {
    setBusy(true)
    try {
      const res = await fetch(`/api/returns/${r.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action }),
      })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || (action === 'cancelar' ? 'No pudimos cancelar' : 'No pudimos confirmar el reembolso')); return }
      if (action === 'cancelar') toast.info('Pedido de devolución cancelado')
      else toast.success('Listo: confirmaste que recibiste el reembolso')
      onChanged()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(false)
      setCancelTarget(null)
    }
  }

  return (
    <>
      <ul className="mt-3 space-y-2.5">
        {returns.map((r) => {
          const meta = RETURN_STATUS_META[r.status] || RETURN_STATUS_META.solicitada
          const Icon = meta.icon
          return (
            <li key={r.id} className="rounded-2xl bg-[#0A2540]/3 p-3.5 ring-1 ring-[#0A2540]/8">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-extrabold text-[#0A2540]">
                    {r.items.length} ítem{r.items.length === 1 ? '' : 's'} a {sellerNameOf(r)}
                  </p>
                  {showOrigin && r.origin && (
                    <Link to={r.origin.href} className="inline-flex min-h-[44px] max-w-full items-center text-[12.5px] font-bold text-[#1D63B8] hover:underline">
                      <span className="truncate">{r.origin.label}</span>
                    </Link>
                  )}
                  <p className="text-[12px] text-slate-500">
                    Pedido el {formatDate(r.requestedAt)}{r.refundTotal > 0 ? ` · reembolso ${formatARS(r.refundTotal)}` : ''}
                  </p>
                </div>
                <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold ring-1 ${meta.tone}`}>
                  <Icon className="size-3.5" aria-hidden /> {meta.label}
                </span>
              </div>
              <ul className="mt-2 space-y-1">
                {r.items.map((it) => (
                  <li key={it.id} className="flex items-center gap-2 text-[12.5px] text-slate-600">
                    <button type="button" onClick={() => setZoom(it.photoUrl)} className="shrink-0 overflow-hidden rounded-lg ring-1 ring-[#0A2540]/10" aria-label={`Ver foto de ${it.element.name}`}>
                      <img src={it.photoUrl} alt="" className="size-11 object-cover" />
                    </button>
                    <span className="min-w-0 flex-1 truncate">
                      <b className="text-[#0A2540]">{it.element.name}</b> × {it.qtyReceived ?? it.qtyAccepted ?? it.qtyRequested} {it.element.unit}
                      {it.qtyAccepted != null && it.qtyAccepted !== it.qtyRequested ? ` (pediste ${it.qtyRequested})` : ''} · {CONDITION_LABEL[it.condition] || it.condition}
                      {it.status === 'rechazado' ? ' · no aceptado' : ''}
                    </span>
                    {it.refundAmount != null && it.status === 'aceptado' && <span className="shrink-0 font-bold tabular-nums text-[#0A2540]">{formatARS(it.refundAmount)}</span>}
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[12px] text-slate-500">{refundStatusText(r)}</p>
              {r.status === 'reembolsada' && !isMpRefund(r) && !r.refundConfirmedAt && (
                <button disabled={busy} onClick={() => void act(r, 'confirmar_reembolso')} className="homy-btn-primary mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[12.5px] disabled:opacity-50">
                  <CircleCheck className="size-4" aria-hidden /> Recibí el reembolso
                </button>
              )}
              {r.status === 'solicitada' && (
                <button disabled={busy} onClick={() => setCancelTarget(r)} className="mt-2 inline-flex min-h-[44px] items-center gap-1 rounded-full px-3 text-[12px] font-bold text-slate-500 hover:text-red-600 disabled:opacity-50">
                  <Trash2 className="size-3.5" aria-hidden /> Cancelar pedido
                </button>
              )}
            </li>
          )
        })}
      </ul>

      {zoom && (
        <div role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={() => setZoom(null)} className="fixed inset-0 z-[60] grid place-items-center bg-[#0A2540]/85 p-4 backdrop-blur-sm">
          <img src={zoom} alt="Foto del sobrante" className="max-h-[88dvh] max-w-full rounded-2xl object-contain shadow-2xl" />
          <button type="button" onClick={() => setZoom(null)} aria-label="Cerrar" className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25">
            <X className="size-5" aria-hidden />
          </button>
        </div>
      )}

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o && !busy) setCancelTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar el pedido de devolución?</AlertDialogTitle>
            <AlertDialogDescription>Le avisamos a {cancelTarget ? sellerNameOf(cancelTarget) : 'quien te vendió'}. Podés volver a pedirlo mientras estés dentro de los 30 días.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Volver</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); if (cancelTarget) void act(cancelTarget, 'cancelar') }} className="bg-red-600 text-white hover:bg-red-700">
              {busy ? 'Cancelando…' : 'Sí, cancelar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

export default function SobrantesSection({ projectId, purchaseId, canRequest, materials, compact = false, sellerNote, tipo, onChanged }: {
  projectId?: string
  purchaseId?: string
  canRequest: boolean
  materials?: EligibleItem[]
  compact?: boolean
  /** a quién se le devuelve (ej. "Los materiales te los vendió X en su factura: la devolución es con él") */
  sellerNote?: string
  /** filtra la lista por pata (el profesional ve acá solo las suyas como comprador) */
  tipo?: ReturnTipo
  onChanged?: () => void
}) {
  const [returns, setReturns] = useState<LeftoverReturnRow[] | null>(null)
  const [eligible, setEligible] = useState<EligibleItem[] | null>(materials ?? null)
  const [notEligible, setNotEligible] = useState<string | null>(null)
  const [open, setOpen] = useState(false)

  const originQuery = projectId ? `projectId=${encodeURIComponent(projectId)}` : purchaseId ? `purchaseId=${encodeURIComponent(purchaseId)}` : ''

  const loadReturns = useCallback(async () => {
    if (!originQuery) return
    try {
      const res = await fetch(`/api/returns?role=solicitante&${originQuery}${tipo ? `&tipo=${tipo}` : ''}`)
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No pudimos cargar las devoluciones'); return }
      setReturns(d.returns || [])
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    }
  }, [originQuery, tipo])

  const loadEligible = useCallback(async () => {
    if (!originQuery) return
    try {
      const res = await fetch(`/api/returns/eligible?${originQuery}`)
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No pudimos calcular los materiales devolvibles'); return }
      setEligible(d.items || [])
      setNotEligible(d.notEligibleReason || null)
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    }
  }, [originQuery])

  // carga inicial: el setState ocurre después del fetch (mismo patrón que Cobros)
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadReturns() }, [loadReturns])

  async function openDialog() {
    setOpen(true)
    if (materials) { setEligible(materials); return }
    // siempre recalcular: lo restante cambia con cada devolución
    setEligible(null)
    await loadEligible()
  }

  const hasReturns = !!returns && returns.length > 0
  if (!canRequest && !hasReturns && returns !== null) return null

  return (
    <section className={compact ? 'mt-3' : 'homy-glass rounded-3xl p-4 sm:p-5 mt-5'} aria-label="Sobrantes">
      <div className="flex flex-wrap items-center justify-between gap-2">
        {compact ? (
          <p className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-slate-400">
            <Undo2 className="size-3.5" aria-hidden /> Sobrantes
          </p>
        ) : (
          <h2 className="homy-section-title">
            <span className="homy-icon-chip homy-chip-mint size-8 [&_svg]:size-4" aria-hidden><Undo2 /></span>
            Sobrantes
          </h2>
        )}
        {canRequest && (
          <button onClick={() => void openDialog()} className="homy-glass-soft inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-xs font-bold text-[#1D63B8] transition hover:bg-white">
            <Undo2 className="size-3.5" aria-hidden /> Devolver sobrantes
          </button>
        )}
      </div>
      {sellerNote && (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-[#1D63B8]/8 px-3 py-2 text-[12.5px] font-semibold leading-snug text-[#1D63B8]">
          <ArrowRight className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {sellerNote}
        </p>
      )}
      {!compact && (
        <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">
          ¿Te sobró material? Pedí devolvérselo a quien te lo vendió (hasta 30 días después del pago). Si pagaste con Mercado Pago,
          el reembolso vuelve solo a tu medio de pago (se devuelve el precio de lo que devolvés; el cargo de servicio HomIA del 1% no se reembolsa); si pagaste en efectivo, te lo devuelven en efectivo.
        </p>
      )}

      {returns === null ? (
        <Loading text="Cargando devoluciones…" />
      ) : returns.length > 0 && (
        <RequesterReturnList returns={returns} onChanged={() => { void loadReturns(); onChanged?.() }} />
      )}

      <ReturnRequestDialog
        open={open}
        onClose={() => setOpen(false)}
        eligible={eligible}
        notEligible={notEligible}
        projectId={projectId}
        purchaseId={purchaseId}
        title="Devolver sobrantes"
        subtitle="Indicá cuánto devolvés de cada material, su estado y una foto. Quien te lo vendió confirma el monto."
        onCreated={() => { void loadReturns(); onChanged?.() }}
      />
    </section>
  )
}

/** Selector de foto por ítem (sube a /api/uploads con folder=sobrantes). */
export function PhotoPicker({ url, uploading, onPick, onClear, label }: {
  url: string; uploading: boolean; onPick: (f: File) => void; onClear: () => void; label: string
}) {
  const ref = useRef<HTMLInputElement>(null)
  return (
    <span className="inline-flex items-center gap-1.5">
      <input
        ref={ref} type="file" accept="image/*" capture="environment" className="hidden" aria-label={label}
        onChange={(e) => { const f = e.target.files?.[0]; if (f) onPick(f); if (ref.current) ref.current.value = '' }}
      />
      {url ? (
        <span className="relative">
          <img src={url} alt={label} className="size-11 rounded-xl object-cover ring-1 ring-[#0A2540]/10" />
          <button type="button" onClick={onClear} aria-label="Quitar foto" className="absolute -right-1.5 -top-1.5 grid size-5 place-items-center rounded-full bg-[#0A2540] text-white">
            <X className="size-3" aria-hidden />
          </button>
        </span>
      ) : (
        <button
          type="button" disabled={uploading} onClick={() => ref.current?.click()}
          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border-2 border-dashed border-[#1D63B8]/40 px-3 text-[12px] font-bold text-[#1D63B8] hover:bg-[#1D63B8]/5 disabled:opacity-60"
        >
          {uploading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />}
          {uploading ? 'Subiendo…' : 'Foto (obligatoria)'}
        </button>
      )}
    </span>
  )
}
