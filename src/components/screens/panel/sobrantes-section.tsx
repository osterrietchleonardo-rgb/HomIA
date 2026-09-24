'use client'
// Sobrantes — sección reutilizable para el detalle de proyecto (cliente / profesional)
// y para cada compra directa pagada del cliente. Lista las devoluciones del origen
// con su estado y abre el diálogo "Devolver sobrantes" (bottom-sheet en móvil).
//
// API:
//   <SobrantesSection projectId="…" canRequest={stage === 'finalizado' || …} />
//   <SobrantesSection purchaseId="…" canRequest compact />
//   props opcionales: `materials` (elegibles precargados con la forma de GET /api/returns/eligible),
//   `compact` (sin encabezado grande, para tarjetas), `onChanged` (callback tras crear/cancelar).
import { useCallback, useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { formatARS, formatDate } from '@/lib/format'
import { Loading } from '@/components/app/ui-bits'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Undo2, Camera, X, Loader2, CircleCheck, Hourglass, Ban, PackageCheck, Banknote, CircleAlert, Send, Trash2,
} from 'lucide-react'

export type EligibleItem = {
  materialId: string | null; purchaseId: string | null; purchaseItemId?: string | null; elementId: string; name: string; unit: string
  quantity: number; remaining: number; unitPrice: number
  providerId: string; providerName: string; paymentMethod: string | null; paidAt: string | null
}
export type LeftoverItemRow = {
  id: string; elementId: string; qtyRequested: number; qtyAccepted: number | null; qtyReceived: number | null
  unitPricePaid: number; refundAmount: number | null; condition: string; photoUrl: string; note: string | null; status: string
  element: { id: string; name: string; unit: string }
}
export type LeftoverReturnRow = {
  id: string; status: string; paymentMethod: string | null; refundTotal: number; providerNote: string | null
  requestedAt: string; respondedAt: string | null; receivedAt: string | null; refundedAt: string | null
  refundConfirmedAt?: string | null; refundConfirmedBy?: string | null
  mpRefundId: string | null; projectId: string | null; purchaseId: string | null
  items: LeftoverItemRow[]
  requester: { id: string; displayName: string; avatarUrl: string | null; verificationStatus?: string }
  provider: { id: string; businessName: string; userId: string; user?: { avatarUrl: string | null } }
  origin?: { kind: 'proyecto' | 'compra'; id: string; label: string; href: string } | null
}

export const RETURN_STATUS_META: Record<string, { label: string; icon: typeof Hourglass; tone: string }> = {
  solicitada: { label: 'Esperando al proveedor', icon: Hourglass, tone: 'text-[#B98A00] bg-[#FFC700]/12 ring-[#FFC700]/35' },
  aceptada: { label: 'Aceptada: acercá los sobrantes', icon: CircleCheck, tone: 'text-[#1D63B8] bg-[#1D63B8]/10 ring-[#1D63B8]/30' },
  aceptada_parcial: { label: 'Aceptada en parte: acercá los sobrantes', icon: CircleCheck, tone: 'text-[#1D63B8] bg-[#1D63B8]/10 ring-[#1D63B8]/30' },
  rechazada: { label: 'Rechazada', icon: Ban, tone: 'text-red-600 bg-red-500/10 ring-red-500/30' },
  cancelada: { label: 'Cancelada', icon: Undo2, tone: 'text-slate-500 bg-slate-500/10 ring-slate-400/30' },
  recibida: { label: 'Recibida: reembolso en efectivo pendiente', icon: PackageCheck, tone: 'text-[#FF5A1F] bg-[#FF5A1F]/10 ring-[#FF5A1F]/30' },
  reembolsada: { label: 'Reembolsada', icon: Banknote, tone: 'text-[#0e9f6e] bg-[#0e9f6e]/10 ring-[#0e9f6e]/30' },
  reembolso_fallido: { label: 'Reembolso en proceso', icon: CircleAlert, tone: 'text-[#FF5A1F] bg-[#FF5A1F]/10 ring-[#FF5A1F]/30' },
}
export const CONDITION_LABEL: Record<string, string> = { sin_abrir: 'Sin abrir', abierto_sin_usar: 'Abierto, sin usar' }

async function readJson(res: Response): Promise<Record<string, any>> {
  try { return await res.json() } catch { return {} }
}

/** Estado del reembolso en palabras (lado solicitante). */
export function refundStatusText(r: LeftoverReturnRow): string {
  if (r.status === 'reembolsada') {
    return r.paymentMethod === 'mercadopago'
      ? `Reembolsado por Mercado Pago el ${formatDate(r.refundedAt)}: se acredita en tu medio de pago en 1 a 15 días.`
      : r.refundConfirmedAt
        ? `Reembolsado en efectivo el ${formatDate(r.refundedAt)}. ${r.refundConfirmedBy === 'automatico' ? 'Se confirmó solo a las 72 h.' : 'Confirmaste que lo recibiste.'}`
        : `El proveedor registró que te devolvió ${formatARS(r.refundTotal)} en efectivo el ${formatDate(r.refundedAt)}. Confirmá que lo recibiste (si no, se confirma solo a las 72 h).`
  }
  if (r.status === 'recibida') return `Recibido el ${formatDate(r.receivedAt)}. Te devuelven ${formatARS(r.refundTotal)} en efectivo en el mostrador.`
  if (r.status === 'reembolso_fallido') return `Recibido el ${formatDate(r.receivedAt)}. El reembolso de ${formatARS(r.refundTotal)} por Mercado Pago está en proceso.`
  if (r.status.startsWith('aceptada')) return `Reembolso acordado: ${formatARS(r.refundTotal)}${r.paymentMethod === 'mercadopago' ? ' (vuelve a tu Mercado Pago cuando entregues los sobrantes)' : ' (en efectivo al entregar los sobrantes)'}.`
  if (r.status === 'rechazada') return r.providerNote ? `Motivo: ${r.providerNote}` : 'El proveedor no aceptó la devolución.'
  return 'El proveedor tiene que aceptar, ajustar o rechazar tu pedido.'
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

export default function SobrantesSection({ projectId, purchaseId, canRequest, materials, compact = false, onChanged }: {
  projectId?: string
  purchaseId?: string
  canRequest: boolean
  materials?: EligibleItem[]
  compact?: boolean
  onChanged?: () => void
}) {
  const [returns, setReturns] = useState<LeftoverReturnRow[] | null>(null)
  const [eligible, setEligible] = useState<EligibleItem[] | null>(materials ?? null)
  const [notEligible, setNotEligible] = useState<string | null>(null)
  const [open, setOpen] = useState(false)
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [busy, setBusy] = useState(false)
  const [cancelTarget, setCancelTarget] = useState<LeftoverReturnRow | null>(null)
  const [zoom, setZoom] = useState<string | null>(null)

  const originQuery = projectId ? `projectId=${encodeURIComponent(projectId)}` : purchaseId ? `purchaseId=${encodeURIComponent(purchaseId)}` : ''

  const loadReturns = useCallback(async () => {
    if (!originQuery) return
    try {
      const res = await fetch(`/api/returns?role=solicitante&${originQuery}`)
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No pudimos cargar las devoluciones'); return }
      setReturns(d.returns || [])
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    }
  }, [originQuery])

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

  useEffect(() => { void loadReturns() }, [loadReturns])

  async function openDialog() {
    setDrafts([])
    setOpen(true)
    if (materials) { setEligible(materials); return }
    // siempre recalcular: lo restante cambia con cada devolución
    setEligible(null)
    await loadEligible()
  }

  // cuando llegan los elegibles con el diálogo abierto, armar borradores
  useEffect(() => {
    if (!open || !eligible) return
    setDrafts((prev) => prev.length ? prev : eligible.map((src) => ({
      key: src.materialId || src.purchaseItemId || src.purchaseId || src.elementId,
      src, qty: '', condition: 'sin_abrir', photoUrl: '', note: '', uploading: false,
    })))
  }, [open, eligible])

  function updateDraft(key: string, patch: Partial<DraftItem>) {
    setDrafts((prev) => prev.map((d) => (d.key === key ? { ...d, ...patch } : d)))
  }

  async function uploadPhoto(key: string, file: File) {
    updateDraft(key, { uploading: true })
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'sobrantes')
      const res = await fetch('/api/uploads', { method: 'POST', body: fd })
      const d = await readJson(res)
      if (!res.ok || !d.url) { toast.error(d.error || 'No se pudo subir la foto'); return }
      updateDraft(key, { photoUrl: d.url as string })
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      updateDraft(key, { uploading: false })
    }
  }

  const active = drafts.filter((d) => parseFloat(d.qty) > 0)
  const providers = [...new Set(active.map((d) => d.src.providerId))]
  const estimated = active.reduce((a, d) => a + parseFloat(d.qty) * d.src.unitPrice, 0)

  async function submit() {
    if (active.length === 0) { toast.error('Indicá la cantidad a devolver de al menos un material'); return }
    if (providers.length > 1) { toast.error('Un pedido agrupa ítems de un solo proveedor: hacé un pedido por proveedor'); return }
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
          projectId, purchaseId,
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
      toast.success('Pedido de devolución enviado', { description: 'El proveedor lo revisa y te avisamos cuando responda.' })
      setOpen(false)
      setDrafts([])
      await loadReturns()
      onChanged?.()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(false)
    }
  }

  async function confirmRefund(r: LeftoverReturnRow) {
    setBusy(true)
    try {
      const res = await fetch(`/api/returns/${r.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'confirmar_reembolso' }),
      })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No pudimos confirmar el reembolso'); return }
      toast.success('Listo: confirmaste que recibiste el reembolso')
      await loadReturns()
      onChanged?.()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(false)
    }
  }

  async function cancelReturn(r: LeftoverReturnRow) {
    setBusy(true)
    try {
      const res = await fetch(`/api/returns/${r.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'cancelar' }),
      })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No pudimos cancelar'); return }
      toast.info('Pedido de devolución cancelado')
      await loadReturns()
      onChanged?.()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(false)
      setCancelTarget(null)
    }
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
          <button onClick={() => void openDialog()} className="homy-glass-soft inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-xs font-bold text-[#1D63B8] transition hover:bg-white">
            <Undo2 className="size-3.5" aria-hidden /> Devolver sobrantes
          </button>
        )}
      </div>
      {!compact && (
        <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
          ¿Te sobró material? Pedí devolverlo al proveedor que te lo vendió (hasta 30 días después del pago). Si pagaste con Mercado Pago,
          el reembolso vuelve solo a tu medio de pago (se devuelve el precio de lo que devolvés; el cargo de servicio HomIA del 1% no se reembolsa); si pagaste en efectivo, te lo devuelven en el mostrador.
        </p>
      )}

      {returns === null ? (
        <Loading text="Cargando devoluciones…" />
      ) : returns.length > 0 && (
        <ul className="mt-3 space-y-2.5">
          {returns.map((r) => {
            const meta = RETURN_STATUS_META[r.status] || RETURN_STATUS_META.solicitada
            const Icon = meta.icon
            return (
              <li key={r.id} className="rounded-2xl bg-[#0A2540]/3 p-3.5 ring-1 ring-[#0A2540]/8">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-[#0A2540]">
                      {r.items.length} ítem{r.items.length === 1 ? '' : 's'} a {r.provider.businessName}
                    </p>
                    <p className="text-[12px] text-slate-500">Pedido el {formatDate(r.requestedAt)}{r.refundTotal > 0 ? ` · reembolso ${formatARS(r.refundTotal)}` : ''}</p>
                  </div>
                  <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold ring-1 ${meta.tone}`}>
                    <Icon className="size-3.5" aria-hidden /> {meta.label}
                  </span>
                </div>
                <ul className="mt-2 space-y-1">
                  {r.items.map((it) => (
                    <li key={it.id} className="flex items-center gap-2 text-[12.5px] text-slate-600">
                      <button type="button" onClick={() => setZoom(it.photoUrl)} className="shrink-0 overflow-hidden rounded-lg ring-1 ring-[#0A2540]/10" aria-label={`Ver foto de ${it.element.name}`}>
                        <img src={it.photoUrl} alt="" className="size-9 object-cover" />
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
                {r.status === 'reembolsada' && r.paymentMethod !== 'mercadopago' && !r.refundConfirmedAt && (
                  <button disabled={busy} onClick={() => void confirmRefund(r)} className="homy-btn-primary mt-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[12px] disabled:opacity-50">
                    <CircleCheck className="size-3.5" aria-hidden /> Recibí el reembolso
                  </button>
                )}
                {r.status === 'solicitada' && (
                  <button disabled={busy} onClick={() => setCancelTarget(r)} className="mt-2 inline-flex min-h-[34px] items-center gap-1 rounded-full px-3 text-[12px] font-bold text-slate-500 hover:text-red-600 disabled:opacity-50">
                    <Trash2 className="size-3.5" aria-hidden /> Cancelar pedido
                  </button>
                )}
              </li>
            )
          })}
        </ul>
      )}

      {/* ── diálogo: devolver sobrantes (bottom-sheet en móvil) ── */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0A2540]/45 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Devolver sobrantes">
          <div className="homy-glass-strong flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-3xl sm:rounded-3xl">
            <div className="flex items-start justify-between gap-3 p-5 pb-3 sm:p-6 sm:pb-3">
              <div className="min-w-0">
                <p className="homy-eyebrow">Sobrantes</p>
                <h3 className="mt-0.5 text-lg font-extrabold text-[#0A2540]">Devolver sobrantes</h3>
                <p className="text-[12.5px] text-slate-500">Indicá cuánto devolvés de cada material, su estado y una foto. El proveedor confirma el monto.</p>
              </div>
              <button type="button" onClick={() => { if (!busy) setOpen(false) }} aria-label="Cerrar" className="grid size-9 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/70 hover:text-[#0A2540] transition">
                <X className="size-4" aria-hidden />
              </button>
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto px-5 sm:px-6">
              {eligible === null ? (
                <Loading text="Buscando materiales pagados…" />
              ) : eligible.length === 0 ? (
                <p className="rounded-2xl bg-[#FFC700]/10 px-4 py-3 text-[13px] text-slate-600">{notEligible || 'No hay materiales pagados con sobrantes para devolver.'}</p>
              ) : (
                <ul className="space-y-3 pb-2">
                  {drafts.map((d) => {
                    const qty = parseFloat(d.qty) || 0
                    const step = /unidad/i.test(d.src.unit) ? 1 : 0.5
                    return (
                      <li key={d.key} className={`rounded-2xl p-3.5 ring-1 transition ${qty > 0 ? 'bg-[#1D63B8]/6 ring-[#1D63B8]/30' : 'bg-white/40 ring-[#0A2540]/8'}`}>
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-extrabold text-[#0A2540]">{d.src.name}</p>
                            <p className="text-[11.5px] text-slate-500">
                              {d.src.providerName} · pagaste {formatARS(d.src.unitPrice)} por {d.src.unit} · podés devolver hasta <b>{d.src.remaining} {d.src.unit}</b>
                            </p>
                          </div>
                          {qty > 0 && <span className="shrink-0 text-sm font-extrabold tabular-nums text-[#0A2540]">{formatARS(qty * d.src.unitPrice)}</span>}
                        </div>
                        <div className="mt-2.5 grid grid-cols-2 gap-2">
                          <label className="block">
                            <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">Cantidad ({d.src.unit})</span>
                            <input
                              type="number" min={0} max={d.src.remaining} step={step} inputMode="decimal"
                              value={d.qty}
                              onChange={(e) => updateDraft(d.key, { qty: e.target.value })}
                              placeholder="0"
                              className="homy-glass-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm"
                            />
                          </label>
                          <label className="block">
                            <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">Estado</span>
                            <select
                              value={d.condition}
                              onChange={(e) => updateDraft(d.key, { condition: e.target.value as DraftItem['condition'] })}
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
              {providers.length > 1 && (
                <p className="mb-2 rounded-xl bg-red-500/8 px-3 py-2 text-[12px] font-bold text-red-700">Elegiste materiales de {providers.length} proveedores: hacé un pedido por proveedor.</p>
              )}
              <p className="text-[13px] text-slate-600">
                Reembolso estimado: <b className="text-[#0A2540] tabular-nums">{formatARS(estimated)}</b> <span className="text-slate-400">(lo confirma el proveedor)</span>
              </p>
              {active.some((d) => d.src.paymentMethod === 'mercadopago') && (
                <p className="mt-1 text-[11.5px] leading-snug text-slate-400">Se reembolsa el precio de lo que devolvés. El cargo de servicio HomIA (1%) que pagaste con Mercado Pago no se devuelve.</p>
              )}
              <button
                type="button"
                disabled={busy || active.length === 0 || providers.length > 1 || (eligible?.length ?? 0) === 0}
                onClick={() => void submit()}
                className="homy-btn-primary mt-3 w-full px-6 py-3.5 text-[15px] disabled:opacity-50"
              >
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />} {busy ? 'Enviando…' : 'Enviar pedido de devolución'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* lightbox */}
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
            <AlertDialogDescription>Le avisamos al proveedor. Podés volver a pedirlo mientras estés dentro de los 30 días del pago.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Volver</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); if (cancelTarget) void cancelReturn(cancelTarget) }} className="bg-red-600 text-white hover:bg-red-700">
              {busy ? 'Cancelando…' : 'Sí, cancelar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
