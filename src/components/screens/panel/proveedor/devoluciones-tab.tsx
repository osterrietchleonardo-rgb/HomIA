'use client'
// Tab "Devoluciones" de Cobros del proveedor: pedidos de devolución de sobrantes.
// solicitada → Aceptar todo / Aceptar algunos (cantidad y monto por ítem) / Rechazar (motivo)
// aceptada* → Marcar recibido (cantidades) → reembolso MP automático o efectivo en el mostrador.
import { useState } from 'react'
import { toast } from 'sonner'
import { formatARS, formatDate } from '@/lib/format'
import { Loading, UAvatar, VerifyBadge } from '@/components/app/ui-bits'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Undo2, CircleCheck, Ban, PackageCheck, Banknote, RefreshCw, X, SlidersHorizontal, CreditCard } from 'lucide-react'
import { RETURN_STATUS_META, CONDITION_LABEL, type LeftoverReturnRow, type LeftoverItemRow } from '../sobrantes-section'

async function readJson(res: Response): Promise<Record<string, any>> {
  try { return await res.json() } catch { return {} }
}

type EditRow = { id: string; include: boolean; qty: string; amount: string; amountTouched: boolean }

const PROVIDER_LABEL: Record<string, string> = {
  solicitada: 'Nueva: respondé',
  aceptada: 'Aceptada: esperando que la acerquen',
  aceptada_parcial: 'Aceptada en parte: esperando que la acerquen',
  recibida: 'Recibida: reembolsá en efectivo',
  reembolsada: 'Reembolsada',
  reembolso_fallido: 'Falló el reembolso',
  rechazada: 'Rechazada',
  cancelada: 'Cancelada por el cliente',
}

export default function DevolucionesTab({ returns, mpConnected, onChanged }: {
  returns: LeftoverReturnRow[] | null
  mpConnected: boolean
  onChanged: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [zoom, setZoom] = useState<string | null>(null)
  const [acceptTarget, setAcceptTarget] = useState<LeftoverReturnRow | null>(null)
  const [acceptRows, setAcceptRows] = useState<EditRow[]>([])
  const [rejectTarget, setRejectTarget] = useState<LeftoverReturnRow | null>(null)
  const [rejectNote, setRejectNote] = useState('')
  const [receiveTarget, setReceiveTarget] = useState<LeftoverReturnRow | null>(null)
  const [receiveQty, setReceiveQty] = useState<Record<string, string>>({})

  async function act(r: LeftoverReturnRow, body: Record<string, unknown>): Promise<Record<string, any> | null> {
    setBusy(true)
    try {
      const res = await fetch(`/api/returns/${r.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No pudimos procesar la devolución'); return null }
      return d
    } catch {
      toast.error('No pudimos conectar. Reintentá')
      return null
    } finally { setBusy(false) }
  }

  async function acceptAll(r: LeftoverReturnRow) {
    const d = await act(r, { action: 'aceptar' })
    if (!d) return
    toast.success('Devolución aceptada', { description: `Reembolso acordado: ${formatARS(d.refundTotal)}. Marcala como recibida cuando te acerquen los sobrantes.` })
    onChanged()
  }

  function openAcceptSome(r: LeftoverReturnRow) {
    setAcceptTarget(r)
    setAcceptRows(r.items.map((i) => ({
      id: i.id, include: true, qty: String(i.qtyRequested), amount: String(round2(i.unitPricePaid * i.qtyRequested)), amountTouched: false,
    })))
  }

  function editRow(id: string, patch: Partial<EditRow>, item: LeftoverItemRow) {
    setAcceptRows((prev) => prev.map((row) => {
      if (row.id !== id) return row
      const next = { ...row, ...patch }
      // si cambia la cantidad y el monto no fue tocado a mano, recalcular el monto sugerido
      if (patch.qty !== undefined && !next.amountTouched) next.amount = String(round2(item.unitPricePaid * (parseFloat(next.qty) || 0)))
      return next
    }))
  }

  async function submitAcceptSome() {
    if (!acceptTarget) return
    const items = acceptRows
      .filter((r) => r.include && parseFloat(r.qty) > 0)
      .map((r) => ({ id: r.id, qtyAccepted: parseFloat(r.qty), refundAmount: parseFloat(r.amount) || 0 }))
    if (items.length === 0) { toast.error('No aceptaste ningún ítem: usá "Rechazar" con un motivo'); return }
    const d = await act(acceptTarget, { action: 'aceptar', items })
    if (!d) return
    toast.success(d.status === 'aceptada' ? 'Devolución aceptada' : 'Devolución aceptada en parte', { description: `Reembolso acordado: ${formatARS(d.refundTotal)}.` })
    setAcceptTarget(null)
    onChanged()
  }

  async function submitReject() {
    if (!rejectTarget) return
    if (!rejectNote.trim()) { toast.error('Contale al cliente por qué no la aceptás'); return }
    const d = await act(rejectTarget, { action: 'rechazar', note: rejectNote.trim() })
    if (!d) return
    toast.info('Devolución rechazada')
    setRejectTarget(null); setRejectNote('')
    onChanged()
  }

  function openReceive(r: LeftoverReturnRow) {
    setReceiveTarget(r)
    setReceiveQty(Object.fromEntries(r.items.filter((i) => i.status === 'aceptado').map((i) => [i.id, String(i.qtyAccepted ?? 0)])))
  }

  async function submitReceive() {
    if (!receiveTarget) return
    const items = Object.entries(receiveQty).map(([id, q]) => ({ id, qtyReceived: parseFloat(q) || 0 }))
    const d = await act(receiveTarget, { action: 'recibir', items })
    if (!d) return
    if (d.status === 'reembolsada') toast.success('Recibido y reembolsado por Mercado Pago', { description: `${formatARS(d.refundTotal)} vuelven al medio de pago del cliente. El stock ya volvió a tu inventario.` })
    else if (d.status === 'reembolso_fallido') toast.error('Recibido, pero falló el reembolso por Mercado Pago', { description: d.error || 'Reintentalo desde la tarjeta.' })
    else toast.success('Sobrantes recibidos', { description: `Devolvé ${formatARS(d.refundTotal)} en efectivo en el mostrador y marcalo acá. El stock ya volvió a tu inventario.` })
    setReceiveTarget(null)
    onChanged()
  }

  async function cashRefund(r: LeftoverReturnRow) {
    const d = await act(r, { action: 'reembolsar_efectivo' })
    if (!d) return
    toast.success('Reembolso en efectivo registrado')
    onChanged()
  }

  async function retry(r: LeftoverReturnRow) {
    const d = await act(r, { action: 'reintentar_reembolso' })
    if (!d) return
    toast.success('Reembolso enviado a Mercado Pago')
    onChanged()
  }

  if (returns === null) return <Loading text="Cargando devoluciones…" />
  if (returns.length === 0) {
    return (
      <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
        <span className="homy-empty-icon homy-chip-mint" aria-hidden><Undo2 className="size-6" /></span>
        <h3 className="font-extrabold tracking-tight text-[#0A2540]">Sin pedidos de devolución</h3>
        <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
          Cuando un cliente o profesional quiera devolverte materiales que le sobraron (hasta 30 días después del pago), lo ves acá con fotos,
          cantidades y estado. Vos decidís qué aceptar y cuánto reembolsar.
        </p>
      </div>
    )
  }

  const acceptTotal = acceptRows.filter((r) => r.include && parseFloat(r.qty) > 0).reduce((a, r) => a + (parseFloat(r.amount) || 0), 0)

  return (
    <>
      <p className="homy-page-sub -mt-2 mb-4">
        Así funciona: aceptás (todo o en parte) y fijás el reembolso → el cliente te acerca los sobrantes → marcás recibido y el stock vuelve a tu
        inventario → si pagó con Mercado Pago el reembolso sale solo; si pagó en efectivo, se lo devolvés en el mostrador y lo marcás acá.
      </p>
      <div className="space-y-3">
        {returns.map((r) => {
          const meta = RETURN_STATUS_META[r.status] || RETURN_STATUS_META.solicitada
          const Icon = meta.icon
          const estimated = r.items.reduce((a, i) => a + i.unitPricePaid * i.qtyRequested, 0)
          return (
            <article key={r.id} className="homy-row p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 items-start gap-3">
                  <UAvatar name={r.requester.displayName} url={r.requester.avatarUrl} size={42} />
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-x-1.5 text-[15px] font-extrabold text-[#0A2540] leading-snug">
                      {r.requester.displayName} <VerifyBadge status={r.requester.verificationStatus || 'none'} />
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {r.origin?.label || 'Devolución'} · pedido el {formatDate(r.requestedAt)} · pagó {r.paymentMethod === 'mercadopago' ? 'con Mercado Pago' : r.paymentMethod === 'efectivo' ? 'en efectivo' : '—'}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="homy-num-adapt text-lg font-extrabold text-[#0A2540] tabular-nums">{formatARS(r.status === 'solicitada' ? estimated : r.refundTotal)}</p>
                  <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold ring-1 ${meta.tone}`}>
                    <Icon className="size-3.5" aria-hidden /> {PROVIDER_LABEL[r.status] || meta.label}
                  </span>
                </div>
              </div>

              <ul className="mt-3 space-y-2">
                {r.items.map((it) => (
                  <li key={it.id} className="flex items-start gap-2.5 rounded-xl bg-[#0A2540]/3 p-2.5">
                    <button type="button" onClick={() => setZoom(it.photoUrl)} className="shrink-0 overflow-hidden rounded-lg ring-1 ring-[#0A2540]/10" aria-label={`Ampliar foto de ${it.element.name}`}>
                      <img src={it.photoUrl} alt="" className="size-14 object-cover" />
                    </button>
                    <div className="min-w-0 flex-1 text-[12.5px] text-slate-600">
                      <p className="font-extrabold text-[#0A2540]">{it.element.name}</p>
                      <p>
                        Pide devolver {it.qtyRequested} {it.element.unit} · {CONDITION_LABEL[it.condition] || it.condition} · pagó {formatARS(it.unitPricePaid)} c/u
                      </p>
                      {it.qtyAccepted != null && it.status === 'aceptado' && (
                        <p>Aceptaste {it.qtyAccepted} {it.element.unit}{it.qtyReceived != null ? ` · recibiste ${it.qtyReceived}` : ''} · reembolso {formatARS(it.refundAmount ?? 0)}</p>
                      )}
                      {it.status === 'rechazado' && r.status !== 'rechazada' && <p className="text-slate-400">No aceptado</p>}
                      {it.note && <p className="italic text-slate-500">“{it.note}”</p>}
                    </div>
                  </li>
                ))}
              </ul>

              {/* estado del reembolso */}
              {r.status === 'reembolsada' && (
                <p className="mt-2.5 inline-flex items-center gap-1.5 rounded-full bg-[#0e9f6e]/10 px-3 py-1.5 text-[12px] font-bold text-[#0e9f6e]">
                  {r.paymentMethod === 'mercadopago' ? <CreditCard className="size-3.5" aria-hidden /> : <Banknote className="size-3.5" aria-hidden />}
                  {r.paymentMethod === 'mercadopago' ? `Reembolsado por Mercado Pago el ${formatDate(r.refundedAt)}` : `Reembolsado en efectivo el ${formatDate(r.refundedAt)}`}
                </p>
              )}
              {r.status === 'reembolsada' && r.paymentMethod !== 'mercadopago' && (
                <p className="mt-1 text-[12px] font-semibold text-slate-500">
                  {r.refundConfirmedAt
                    ? (r.refundConfirmedBy === 'automatico' ? 'Reembolso confirmado automáticamente (pasaron 72 h).' : 'El cliente confirmó que recibió el reembolso.')
                    : 'Esperando que el cliente confirme que recibió el efectivo (se confirma solo a las 72 h).'}
                </p>
              )}
              {r.status === 'reembolso_fallido' && (
                <p className="mt-2.5 rounded-xl bg-red-500/8 px-3 py-2 text-[12px] text-red-700">
                  Falló el reembolso por Mercado Pago{r.providerNote ? `: ${r.providerNote}` : ''}.{!mpConnected ? ' Revisá que tu cuenta de Mercado Pago siga conectada.' : ''}
                </p>
              )}
              {r.status === 'rechazada' && r.providerNote && <p className="mt-2 text-[12px] text-slate-500">Motivo: {r.providerNote}</p>}

              <div className="mt-3 flex flex-wrap gap-2">
                {r.status === 'solicitada' && (
                  <>
                    <button disabled={busy} onClick={() => void acceptAll(r)} className="homy-btn-primary px-4 py-2 text-sm disabled:opacity-50">
                      <CircleCheck className="mr-1 inline size-4" aria-hidden /> Aceptar todo
                    </button>
                    <button disabled={busy} onClick={() => openAcceptSome(r)} className="homy-glass-soft rounded-full px-4 py-2 text-sm font-bold text-[#1D63B8] disabled:opacity-50">
                      <SlidersHorizontal className="mr-1 inline size-4" aria-hidden /> Aceptar algunos
                    </button>
                    <button disabled={busy} onClick={() => { setRejectTarget(r); setRejectNote('') }} className="homy-glass-soft rounded-full px-4 py-2 text-sm font-bold text-slate-500 hover:text-red-600 transition disabled:opacity-50">
                      <Ban className="mr-1 inline size-4" aria-hidden /> Rechazar
                    </button>
                  </>
                )}
                {(r.status === 'aceptada' || r.status === 'aceptada_parcial') && (
                  <button disabled={busy} onClick={() => openReceive(r)} className="homy-btn-primary px-4 py-2 text-sm disabled:opacity-50">
                    <PackageCheck className="mr-1 inline size-4" aria-hidden /> Marcar recibido
                  </button>
                )}
                {r.status === 'recibida' && (
                  <>
                    <p className="w-full text-[12.5px] text-slate-600">Reembolsá <b>{formatARS(r.refundTotal)}</b> en efectivo en el mostrador y marcá acá.</p>
                    <button disabled={busy} onClick={() => void cashRefund(r)} className="homy-btn-primary px-4 py-2 text-sm disabled:opacity-50">
                      <Banknote className="mr-1 inline size-4" aria-hidden /> Ya lo reembolsé en efectivo
                    </button>
                  </>
                )}
                {r.status === 'reembolso_fallido' && (
                  <button disabled={busy} onClick={() => void retry(r)} className="homy-btn-primary px-4 py-2 text-sm disabled:opacity-50">
                    <RefreshCw className="mr-1 inline size-4" aria-hidden /> Reintentar reembolso
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </div>

      {/* ── Dialog: aceptar algunos ── */}
      <Dialog open={!!acceptTarget} onOpenChange={(o) => { if (!o && !busy) setAcceptTarget(null) }}>
        <DialogContent className="max-h-[92dvh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Aceptar algunos ítems</DialogTitle>
            <DialogDescription>
              Ajustá la cantidad y el monto a reembolsar por ítem. Si aplicás un descuento por manipulación, el cliente lo ve. Lo que destildes queda rechazado.
            </DialogDescription>
          </DialogHeader>
          {acceptTarget && (
            <ul className="space-y-2.5">
              {acceptTarget.items.map((it) => {
                const row = acceptRows.find((r) => r.id === it.id)
                if (!row) return null
                const max = round2(it.unitPricePaid * (parseFloat(row.qty) || 0))
                return (
                  <li key={it.id} className={`rounded-2xl p-3 ring-1 ${row.include ? 'bg-[#1D63B8]/6 ring-[#1D63B8]/25' : 'bg-white/40 ring-[#0A2540]/8 opacity-70'}`}>
                    <label className="flex items-center gap-2 text-sm font-extrabold text-[#0A2540]">
                      <input type="checkbox" checked={row.include} onChange={(e) => editRow(it.id, { include: e.target.checked }, it)} className="size-4 accent-[#1D63B8]" />
                      {it.element.name} <span className="font-semibold text-slate-400">· pidió {it.qtyRequested} {it.element.unit}</span>
                    </label>
                    {row.include && (
                      <div className="mt-2 grid grid-cols-2 gap-2">
                        <label className="block">
                          <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">Cantidad</span>
                          <input type="number" min={0} max={it.qtyRequested} step="any" inputMode="decimal" value={row.qty}
                            onChange={(e) => editRow(it.id, { qty: e.target.value }, it)}
                            className="homy-glass-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm" />
                        </label>
                        <label className="block">
                          <span className="text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">Reembolso (máx. {formatARS(max)})</span>
                          <input type="number" min={0} max={max} step="0.01" inputMode="decimal" value={row.amount}
                            onChange={(e) => editRow(it.id, { amount: e.target.value, amountTouched: true }, it)}
                            className="homy-glass-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm" />
                        </label>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
          <p className="text-[13px] text-slate-600">Reembolso total: <b className="tabular-nums text-[#0A2540]">{formatARS(acceptTotal)}</b></p>
          <DialogFooter>
            <button type="button" disabled={busy} onClick={() => setAcceptTarget(null)} className="homy-glass-soft min-h-[44px] rounded-full px-4 text-sm font-bold text-slate-500">Volver</button>
            <button type="button" disabled={busy} onClick={() => void submitAcceptSome()} className="homy-btn-primary min-h-[44px] px-5 text-sm disabled:opacity-50">
              <CircleCheck className="size-4" aria-hidden /> {busy ? 'Guardando…' : 'Aceptar selección'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: rechazar ── */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o && !busy) setRejectTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar devolución</DialogTitle>
            <DialogDescription>Contale al cliente por qué: le llega en la notificación.</DialogDescription>
          </DialogHeader>
          <textarea value={rejectNote} onChange={(e) => setRejectNote(e.target.value)} rows={3} maxLength={400} autoFocus
            placeholder="Ej: el material está cortado a medida y no se puede revender"
            aria-label="Motivo del rechazo"
            className="homy-glass-input w-full rounded-2xl px-4 py-3 text-sm" />
          <DialogFooter>
            <button type="button" disabled={busy} onClick={() => setRejectTarget(null)} className="homy-glass-soft min-h-[44px] rounded-full px-4 text-sm font-bold text-slate-500">Volver</button>
            <button type="button" disabled={busy} onClick={() => void submitReject()} className="min-h-[44px] rounded-full bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
              {busy ? 'Rechazando…' : 'Rechazar devolución'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: marcar recibido ── */}
      <Dialog open={!!receiveTarget} onOpenChange={(o) => { if (!o && !busy) setReceiveTarget(null) }}>
        <DialogContent className="max-h-[92dvh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Marcar sobrantes recibidos</DialogTitle>
            <DialogDescription>
              Confirmá cuánto recibiste de cada ítem. Vuelve a tu stock y el reembolso se ajusta a lo recibido.
              {receiveTarget?.paymentMethod === 'mercadopago' ? ' Como pagó con Mercado Pago, el reembolso sale automáticamente.' : ' Como pagó en efectivo, después lo reembolsás en el mostrador.'}
            </DialogDescription>
          </DialogHeader>
          {receiveTarget && (
            <ul className="space-y-2">
              {receiveTarget.items.filter((i) => i.status === 'aceptado').map((it) => (
                <li key={it.id} className="flex items-center justify-between gap-3 rounded-xl bg-[#0A2540]/3 p-2.5">
                  <span className="min-w-0 text-[13px] text-slate-600"><b className="text-[#0A2540]">{it.element.name}</b> · aceptaste {it.qtyAccepted} {it.element.unit}</span>
                  <input type="number" min={0} max={it.qtyAccepted ?? 0} step="any" inputMode="decimal"
                    value={receiveQty[it.id] ?? ''} aria-label={`Cantidad recibida de ${it.element.name}`}
                    onChange={(e) => setReceiveQty((p) => ({ ...p, [it.id]: e.target.value }))}
                    className="homy-glass-input w-24 shrink-0 rounded-xl px-3 py-2 text-sm" />
                </li>
              ))}
            </ul>
          )}
          <DialogFooter>
            <button type="button" disabled={busy} onClick={() => setReceiveTarget(null)} className="homy-glass-soft min-h-[44px] rounded-full px-4 text-sm font-bold text-slate-500">Volver</button>
            <button type="button" disabled={busy} onClick={() => void submitReceive()} className="homy-btn-primary min-h-[44px] px-5 text-sm disabled:opacity-50">
              <PackageCheck className="size-4" aria-hidden /> {busy ? 'Procesando…' : 'Confirmar recepción'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {zoom && (
        <div role="dialog" aria-modal="true" aria-label="Foto ampliada" onClick={() => setZoom(null)} className="fixed inset-0 z-[60] grid place-items-center bg-[#0A2540]/85 p-4 backdrop-blur-sm">
          <img src={zoom} alt="Foto del sobrante" className="max-h-[88dvh] max-w-full rounded-2xl object-contain shadow-2xl" />
          <button type="button" onClick={() => setZoom(null)} aria-label="Cerrar" className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/15 text-white hover:bg-white/25">
            <X className="size-5" aria-hidden />
          </button>
        </div>
      )}
    </>
  )
}

function round2(n: number) {
  return Math.round(n * 100) / 100
}
