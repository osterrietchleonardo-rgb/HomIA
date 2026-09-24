'use client'
// Detalle y seguimiento de un pedido (cliente o profesional que compra).
// Cada proveedor con su parte: ítems, cantidades, precios, subtotal y estado.
// D15: una COMPRA (con stock) llega ya "Por pagar" — "Pagás ahora", con el plazo de 24 h
// (7 días si elegís efectivo); una RESERVA espera la aprobación del proveedor (y, si no
// tenía stock, la fecha aproximada en que lo tiene).
// El cliente paga DE A UNO, en el orden que quiera, eligiendo en cada uno Mercado
// Pago (con el cargo de servicio HomIA del 1%) o efectivo al retirar (sin cargo).
// Arriba el resumen "2 de 3 proveedores pagados · Falta pagar $X" y abajo la
// línea de tiempo con cada acción (quién, qué, cuándo).
import { useCallback, useEffect, useState } from 'react'
import { navigate, useRoute, Link } from '@/lib/router'
import { Loading, EmptyState, UAvatar, VerifyBadge } from '@/components/app/ui-bits'
import { formatARS, formatARSCents, formatDate } from '@/lib/format'
import { fmtDeadline, fmtDay } from '@/lib/order-rules'
import { SERVICE_FEE_LABEL } from '@/lib/fees'
import ReviewForm from './review-form'
import SobrantesSection from './sobrantes-section'
import { paymentLine, type OrderLite } from './pedidos'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ArrowLeft, Banknote, Ban, CircleCheck, Clock, CreditCard, Hourglass, Loader2, MessageCircle,
  ShoppingBag, Star, Truck, Undo2, X, History, Store,
} from 'lucide-react'

type Line = { id: string; elementName: string; quantity: number; unit: string; unitPrice: number; total: number }
type Sub = {
  id: string; status: string; type: string; total: number; serviceFee: number; mpServiceFee: number
  paymentMethod: string | null; paid: boolean; active: boolean; note: string | null; rejectionReason: string | null
  reservationExpiresAt: string | null; availableFrom: string | null; createdAt: string; label: string
  items: Line[]
  charge: { id: string; number: string; status: string; method: string | null; paidAt: string | null; amount: number; serviceFee: number } | null
  provider: { id: string; businessName: string; userId: string; city: string | null; address: string | null; avatarUrl: string | null; verificationStatus: string; mpConnected: boolean }
}
type Order = Omit<OrderLite, 'purchases'> & { note: string | null; purchases: Sub[] }
type Ev = { id: string; purchaseId: string | null; actorRole: string; actorName: string | null; type: string; message: string; createdAt: string }

export const SUB_STATUS: Record<string, { label: string; icon: typeof Hourglass; tone: string }> = {
  pendiente_aprobacion: { label: 'Esperando aprobación', icon: Hourglass, tone: 'text-[#B98A00] bg-[#FFC700]/12 ring-[#FFC700]/35' },
  esperando_stock: { label: 'Aprobada: esperando stock', icon: Clock, tone: 'text-[#B98A00] bg-[#FFC700]/12 ring-[#FFC700]/35' },
  aprobado: { label: 'Por pagar', icon: CreditCard, tone: 'text-[#1D63B8] bg-[#1D63B8]/10 ring-[#1D63B8]/30' },
  rechazado: { label: 'Rechazado', icon: Ban, tone: 'text-red-600 bg-red-500/10 ring-red-500/30' },
  entregado: { label: 'Entregado: falta el pago', icon: Truck, tone: 'text-[#FF5A1F] bg-[#FF5A1F]/10 ring-[#FF5A1F]/30' },
  pagado: { label: 'Pagado', icon: CircleCheck, tone: 'text-[#0e9f6e] bg-[#0e9f6e]/10 ring-[#0e9f6e]/30' },
  cancelado: { label: 'Cancelado', icon: Undo2, tone: 'text-slate-500 bg-slate-500/10 ring-slate-400/30' },
}

const ROLE_LABEL: Record<string, string> = { cliente: 'Vos', profesional: 'Vos', proveedor: 'Proveedor', sistema: 'HomIA' }

async function readJson(res: Response): Promise<Record<string, unknown> & { error?: string; needsConfig?: boolean; initPoint?: string }> {
  try { return await res.json() } catch { return {} }
}

export default function OrderDetail({ id, role }: { id: string; role: 'cliente' | 'profesional' }) {
  const route = useRoute()
  const [order, setOrder] = useState<Order | null>(null)
  const [events, setEvents] = useState<Ev[]>([])
  const [status, setStatus] = useState<'loading' | 'ok' | 'notfound' | 'error'>('loading')
  const [busy, setBusy] = useState<string | null>(null)
  const [cancelTarget, setCancelTarget] = useState<Sub | null>(null)
  const [rv, setRv] = useState<Sub | null>(null)
  const [reviewed, setReviewed] = useState<Record<string, boolean>>({})
  const [mpHidden, setMpHidden] = useState<Set<string>>(new Set())
  const pago = route.query.pago

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/orders/${encodeURIComponent(id)}`)
      const d = await readJson(res)
      if (res.status === 404 || res.status === 403) { setStatus('notfound'); return }
      if (!res.ok) { setStatus('error'); toast.error(d.error || 'No pudimos cargar el pedido'); return }
      setOrder(d.order as Order)
      setEvents((d.events as Ev[]) || [])
      setStatus('ok')
    } catch {
      setStatus('error')
    }
  }, [id])
  useEffect(() => { void load() }, [load])

  // reseñas ya hechas (para no ofrecer calificar dos veces)
  useEffect(() => {
    if (!order) return
    const targets = order.purchases.filter((p) => p.status === 'entregado' || p.status === 'pagado')
    void Promise.all(targets.map(async (p) => {
      try {
        const r = await fetch(`/api/reviews?mine=1&purchaseId=${encodeURIComponent(p.id)}`)
        const d = r.ok ? await r.json() : { reviews: [] }
        return [p.id, ((d.reviews as unknown[]) || []).length > 0] as const
      } catch { return [p.id, false] as const }
    })).then((pairs) => setReviewed(Object.fromEntries(pairs)))
  }, [order])

  async function act(p: Sub, body: Record<string, unknown>) {
    const res = await fetch(`/api/purchases/${p.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    return { res, d: await readJson(res) }
  }

  async function payMP(p: Sub) {
    setBusy(p.id)
    try {
      const { res, d } = await act(p, { action: 'pagar_mp' })
      if (!res.ok) {
        if (res.status === 503 && d.needsConfig) {
          toast.info(d.error || `${p.provider.businessName} todavía no conectó Mercado Pago: podés pagar en efectivo`)
          setMpHidden((prev) => new Set(prev).add(p.id))
        } else toast.error(d.error || 'No pudimos iniciar el pago')
        return
      }
      if (!d.initPoint) { toast.error('Mercado Pago no devolvió el link de pago. Probá de nuevo'); return }
      window.location.href = d.initPoint
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(null)
    }
  }

  async function payCash(p: Sub) {
    setBusy(p.id)
    try {
      const { res, d } = await act(p, { action: 'pagar_efectivo' })
      if (!res.ok) { toast.error(d.error || 'No pudimos registrar el pago'); return }
      toast.success('Pagás en efectivo al retirar', { description: `${p.provider.businessName} confirma el cobro cuando recibe el dinero.` })
      await load()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(null)
    }
  }

  async function cancel(p: Sub) {
    setBusy(p.id)
    try {
      const { res, d } = await act(p, { action: 'cancelar' })
      if (!res.ok) { toast.error(d.error || 'No se pudo cancelar'); return }
      toast.info(`Cancelaste la parte de ${p.provider.businessName}`)
      await load()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(null)
      setCancelTarget(null)
    }
  }

  if (status === 'loading') return <div className="homy-page"><Loading text="Cargando tu pedido…" /></div>
  if (status === 'notfound' || !order) {
    return (
      <div className="homy-page">
        <EmptyState
          icon={<ShoppingBag />}
          title={status === 'notfound' ? 'No encontramos este pedido' : 'No pudimos cargar el pedido'}
          hint={status === 'notfound' ? 'Puede que el link esté mal o que el pedido no sea tuyo.' : 'Revisá tu conexión y volvé a intentar.'}
          action={<button onClick={() => navigate(`/panel/${role}/pedidos`)} className="homy-btn-primary min-h-[44px] px-5 text-sm">Ver mis pedidos</button>}
        />
      </div>
    )
  }

  const s = order.summary
  const progress = s.activeProviders ? Math.round((s.paidProviders / s.activeProviders) * 100) : 0
  const provName = new Map(order.purchases.map((p) => [p.id, p.provider.businessName]))

  return (
    <div className="homy-page">
      <Link to={`/panel/${role}/pedidos`} className="mb-3 inline-flex min-h-[40px] items-center gap-1.5 text-[13px] font-bold text-[#1D63B8]">
        <ArrowLeft className="size-4" aria-hidden /> Mis pedidos
      </Link>
      <header className="homy-page-head">
        <div className="min-w-0">
          <p className="homy-eyebrow">Seguimiento</p>
          <h1 className="homy-page-title mt-1.5">{order.legacy ? 'Compra anterior' : `Pedido ${order.number}`}</h1>
          <p className="homy-page-sub">Hecho el {formatDate(order.createdAt)}{order.note ? ` · “${order.note}”` : ''}</p>
        </div>
      </header>

      {pago === 'ok' && <Banner tone="ok">Mercado Pago está confirmando tu pago: en unos segundos la parte del proveedor pasa a “Pagado”. Si no cambia, actualizá.</Banner>}
      {pago === 'pendiente' && <Banner tone="info">Tu pago quedó pendiente en Mercado Pago. Te avisamos cuando se acredite.</Banner>}
      {pago === 'fallo' && <Banner tone="warn">El pago no se completó. Podés intentar de nuevo o elegir efectivo al retirar.</Banner>}

      {/* resumen del pago por proveedor */}
      <section className="homy-glass mb-4 rounded-3xl p-4 sm:p-5" aria-label="Resumen del pedido">
        <p className="text-[15px] font-extrabold text-[#0A2540]">{paymentLine(s)}</p>
        <div className="homy-progress mt-2.5 h-2 overflow-hidden rounded-full bg-[#0A2540]/8" role="progressbar" aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} aria-label="Proveedores pagados">
          <div className="h-full rounded-full bg-gradient-to-r from-[#0e9f6e] to-[#34d399] transition-all" style={{ width: `${progress}%` }} />
        </div>
        <p className="mt-2 text-[12px] text-slate-500">Total del pedido: <b className="text-[#0A2540] tabular-nums">{formatARS(s.total)}</b>. Pagás a cada proveedor por separado, en el orden que quieras.</p>
      </section>

      <div className="space-y-4">
        {order.purchases.map((p) => (
          <SubCard
            key={p.id}
            p={p}
            busy={busy === p.id}
            anyBusy={busy !== null}
            mpHidden={mpHidden.has(p.id)}
            reviewed={reviewed[p.id]}
            onPayMP={() => void payMP(p)}
            onPayCash={() => void payCash(p)}
            onCancel={() => setCancelTarget(p)}
            onReview={() => setRv(p)}
          />
        ))}
      </div>

      {/* línea de tiempo */}
      <section className="homy-glass mt-5 rounded-3xl p-4 sm:p-5" aria-label="Línea de tiempo">
        <h2 className="homy-section-title"><History className="size-4 text-[#1D63B8]" aria-hidden /> Línea de tiempo</h2>
        {events.length === 0 ? (
          <p className="mt-2 text-[13px] text-slate-500">Todavía no hay movimientos registrados.</p>
        ) : (
          <ol className="mt-3 space-y-3 border-l-2 border-[#1D63B8]/15 pl-4">
            {[...events].reverse().map((e) => (
              <li key={e.id} className="relative">
                <span aria-hidden className="absolute -left-[1.4rem] top-1.5 size-2.5 rounded-full bg-[#1D63B8] ring-4 ring-white/80" />
                <p className="text-[11.5px] font-bold uppercase tracking-wider text-slate-400">
                  {new Date(e.createdAt).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                  {' · '}{e.actorRole === 'proveedor' ? (e.purchaseId ? provName.get(e.purchaseId) : null) || 'Proveedor' : ROLE_LABEL[e.actorRole] || e.actorRole}
                </p>
                <p className="text-[13.5px] leading-snug text-[#0A2540]">{e.message}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o && !busy) setCancelTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar la parte de {cancelTarget?.provider.businessName}?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget?.status === 'aprobado' ? 'El stock que te reservaron vuelve al proveedor y el cobro se anula. ' : 'Le avisamos al proveedor. '}
              El resto del pedido sigue igual.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Volver</AlertDialogCancel>
            <AlertDialogAction disabled={!!busy} onClick={(e) => { e.preventDefault(); if (cancelTarget) void cancel(cancelTarget) }} className="bg-red-600 text-white hover:bg-red-700">
              {busy ? 'Cancelando…' : 'Sí, cancelar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {rv && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0A2540]/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Calificar compra">
          <div className="relative max-h-[92dvh] w-full max-w-md overflow-y-auto rounded-t-3xl sm:rounded-3xl">
            <button type="button" onClick={() => setRv(null)} aria-label="Cerrar" className="absolute right-3 top-3 z-10 grid size-10 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20">
              <X className="size-4" aria-hidden />
            </button>
            <ReviewForm
              targetUserId={rv.provider.userId}
              targetName={rv.provider.businessName}
              targetLabel="al proveedor"
              purchaseId={rv.id}
              onDone={() => { setRv(null); void load() }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function Banner({ tone, children }: { tone: 'ok' | 'info' | 'warn'; children: React.ReactNode }) {
  const cls = tone === 'ok' ? 'bg-[#0e9f6e]/10 text-[#0b7a55]' : tone === 'info' ? 'bg-[#1D63B8]/8 text-[#1D63B8]' : 'bg-[#FF5A1F]/10 text-[#b8410f]'
  return <p className={`mb-4 rounded-2xl px-4 py-3 text-[13px] font-semibold ${cls}`} role="status">{children}</p>
}

function SubCard({ p, busy, anyBusy, mpHidden, reviewed, onPayMP, onPayCash, onCancel, onReview }: {
  p: Sub; busy: boolean; anyBusy: boolean; mpHidden: boolean; reviewed: boolean | undefined
  onPayMP: () => void; onPayCash: () => void; onCancel: () => void; onReview: () => void
}) {
  const meta = SUB_STATUS[p.status] || SUB_STATUS.pendiente_aprobacion
  const Icon = meta.icon
  const cashAgreed = p.charge?.status === 'acordada_efectivo'
  const chargePaid = p.charge?.status === 'pagada'
  const payable = (p.status === 'aprobado' || p.status === 'entregado') && !chargePaid
  const mpOk = p.provider.mpConnected && !mpHidden
  const expires = p.reservationExpiresAt ? new Date(p.reservationExpiresAt) : null
  const reviewable = p.status === 'entregado' || p.status === 'pagado'
  const [now] = useState(() => Date.now())
  const paidRef = p.charge?.paidAt || null
  const canReturn = p.status === 'pagado' && (!paidRef || now - new Date(paidRef).getTime() <= 30 * 86400000)
  const totalMp = Math.round((p.total + p.mpServiceFee) * 100) / 100

  return (
    <article className="homy-glass rounded-3xl p-4 sm:p-5" aria-label={`Parte de ${p.provider.businessName}`}>
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <UAvatar name={p.provider.businessName} url={p.provider.avatarUrl} size={38} />
          <div className="min-w-0">
            <p className="flex flex-wrap items-center gap-x-1.5 text-[15px] font-extrabold leading-snug text-[#0A2540]">
              <span className="min-w-0 break-words">{p.provider.businessName}</span>
              <VerifyBadge status={p.provider.verificationStatus} />
            </p>
            <p className="text-[11.5px] text-slate-500">
              {p.type === 'reserva' ? 'Reserva' : 'Compra directa'}{p.provider.address || p.provider.city ? ` · ${p.provider.address || p.provider.city}` : ''}
            </p>
          </div>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold ring-1 ${meta.tone}`}>
          <Icon className="size-3.5" aria-hidden /> {chargePaid && p.status !== 'pagado' ? 'Pagado: falta retirar' : p.status === 'aprobado' && cashAgreed ? 'Efectivo al retirar' : p.status === 'aprobado' && p.type === 'reserva' ? 'Reservado: falta el pago' : meta.label}
        </span>
      </div>

      {/* ítems */}
      <ul className="mt-3 divide-y divide-[#0A2540]/8 rounded-2xl bg-white/45 px-3 ring-1 ring-[#0A2540]/8">
        {p.items.map((l) => (
          <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-2">
            <span className="min-w-0 flex-[1_1_12rem] text-[13.5px] font-bold text-[#0A2540]">{l.elementName}</span>
            <span className="text-[12px] text-slate-500 tabular-nums">{l.quantity} {l.unit} × {formatARS(l.unitPrice)}</span>
            <span className="homy-num-adapt ml-auto text-[13.5px] font-extrabold text-[#0A2540] tabular-nums">{formatARS(l.total)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex items-center justify-between text-[13.5px]">
        <span className="font-bold text-slate-500">Subtotal</span>
        <span className="homy-num-adapt font-extrabold text-[#0A2540] tabular-nums">{formatARS(p.total)}</span>
      </div>
      {chargePaid && p.charge?.method === 'mercadopago' && p.serviceFee > 0 && (
        <p className="mt-0.5 text-right text-[12px] text-slate-500">+ {SERVICE_FEE_LABEL}: {formatARSCents(p.serviceFee)} · pagaste {formatARSCents(p.total + p.serviceFee)} con Mercado Pago</p>
      )}

      {p.status === 'rechazado' && (
        <p className="mt-2 rounded-xl bg-red-500/8 px-3 py-2 text-[12.5px] text-red-700">{p.rejectionReason ? `Motivo: ${p.rejectionReason}` : 'El proveedor no pudo tomar este pedido.'}</p>
      )}
      {p.status === 'cancelado' && p.rejectionReason && (
        <p className="mt-2 rounded-xl bg-slate-500/8 px-3 py-2 text-[12.5px] text-slate-600">{p.rejectionReason}</p>
      )}
      {p.status === 'pendiente_aprobacion' && (
        <p className="mt-2 text-[12.5px] text-slate-500">
          {p.type === 'reserva'
            ? `${p.provider.businessName} tiene que aprobar tu reserva: si tiene stock te lo guarda 48 h, y si no, te dice cuándo lo tiene.`
            : `${p.provider.businessName} tiene que aprobar este pedido (anterior a la compra directa): ahí te reserva el stock y podés pagar.`}
        </p>
      )}
      {p.status === 'esperando_stock' && (
        <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-[#FFC700]/12 px-3 py-2 text-[12.5px] font-semibold text-[#8a6700]">
          <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          <span>{p.provider.businessName} aprobó tu reserva y lo tendría disponible aproximadamente el {p.availableFrom ? fmtDay(p.availableFrom) : '—'}. Te avisamos cuando esté para retirar: ahí tenés 48 h para pagar y retirarlo.</span>
        </p>
      )}
      {p.status === 'aprobado' && expires && !chargePaid && (
        <p className="mt-2 flex items-start gap-1.5 text-[12.5px] font-semibold text-[#0A2540]">
          <Clock className="mt-0.5 size-3.5 shrink-0 text-[#FF5A1F]" aria-hidden />
          <span>
            {p.type === 'reserva'
              ? `Te lo guardan hasta el ${fmtDeadline(expires)}: pagalo y retiralo antes.`
              : cashAgreed
                ? `Retiralo y pagalo en efectivo antes del ${fmtDeadline(expires)}. Si no, la compra se cancela sola y el stock se libera.`
                : `Pagá antes del ${fmtDeadline(expires)} (o elegí efectivo al retirar). Si no, la compra se cancela sola y el stock se libera.`}
          </span>
        </p>
      )}
      {cashAgreed && !chargePaid && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#1D63B8]/8 px-3 py-1.5 text-[12px] font-bold text-[#1D63B8]">
          <Banknote className="size-3.5" aria-hidden /> Pagás {formatARS(p.total)} en efectivo al retirar — el proveedor confirma el cobro
        </p>
      )}
      {chargePaid && p.status !== 'pagado' && (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-[#0e9f6e]/10 px-3 py-1.5 text-[12px] font-bold text-[#0e9f6e]">
          <CircleCheck className="size-3.5" aria-hidden /> Pago confirmado — pasá a retirarlo
        </p>
      )}

      {/* pagar: de a un proveedor, eligiendo el medio */}
      {payable && !cashAgreed && (
        <div className="mt-3 rounded-2xl bg-[#0A2540]/[0.035] p-3 ring-1 ring-[#0A2540]/8">
          {p.type !== 'reserva' && p.status === 'aprobado' && (
            <p className="mb-1 inline-flex items-center gap-1.5 rounded-full bg-[#FF5A1F]/10 px-2.5 py-1 text-[11.5px] font-extrabold text-[#b8410f]">
              <ShoppingBag className="size-3.5" aria-hidden /> Pagás ahora · compra con stock reservado
            </p>
          )}
          <p className="text-[12px] font-extrabold uppercase tracking-wider text-slate-400">¿Cómo le pagás a {p.provider.businessName}?</p>
          {mpOk ? (
            <dl className="mt-2 space-y-0.5 text-[12.5px]">
              <div className="flex justify-between gap-2"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums text-slate-600">{formatARS(p.total)}</dd></div>
              <div className="flex justify-between gap-2"><dt className="min-w-0 text-slate-500">{SERVICE_FEE_LABEL}</dt><dd className="shrink-0 tabular-nums text-slate-600">{formatARSCents(p.mpServiceFee)}</dd></div>
              <div className="flex justify-between gap-2 font-extrabold"><dt className="text-[#0A2540]">Total con Mercado Pago</dt><dd className="tabular-nums text-[#1D63B8]">{formatARSCents(totalMp)}</dd></div>
            </dl>
          ) : (
            <p className="mt-2 text-[12.5px] font-semibold text-slate-600">{p.provider.businessName} todavía no conectó Mercado Pago: podés pagar en efectivo.</p>
          )}
          <div className="mt-2.5 flex flex-col gap-2 sm:flex-row">
            {mpOk && (
              <button disabled={anyBusy} onClick={onPayMP} className="homy-btn-primary min-h-[44px] flex-1 px-4 text-[13px] disabled:opacity-50">
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CreditCard className="size-4" aria-hidden />} Pagar {formatARSCents(totalMp)} con Mercado Pago
              </button>
            )}
            <button disabled={anyBusy} onClick={onPayCash} className="homy-btn-dark min-h-[44px] flex-1 px-4 text-[13px] disabled:opacity-50">
              <Banknote className="size-4" aria-hidden /> Efectivo al retirar ({formatARS(p.total)}, sin cargo)
            </button>
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {(p.status === 'pendiente_aprobacion' || p.status === 'esperando_stock' || (p.status === 'aprobado' && !chargePaid)) && (
          <button disabled={anyBusy} onClick={onCancel} className="homy-glass-soft inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-xs font-bold text-slate-500 transition hover:text-red-600 disabled:opacity-50">
            <Undo2 className="size-3.5" aria-hidden /> Cancelar esta parte
          </button>
        )}
        {reviewable && reviewed === false && (
          <button onClick={onReview} className="homy-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-xs">
            <Star className="size-3.5" aria-hidden /> Calificar a {p.provider.businessName.length > 18 ? 'este proveedor' : p.provider.businessName}
          </button>
        )}
        {reviewable && reviewed === true && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0e9f6e]/10 px-4 py-2 text-xs font-bold text-[#0e9f6e]">
            <CircleCheck className="size-3.5" aria-hidden /> Ya calificaste esta compra
          </span>
        )}
        <button onClick={() => navigate(`/mensajes?c=nuevo:${p.provider.userId}`)} className="homy-glass-soft ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-xs font-bold text-[#1D63B8] transition hover:bg-white">
          <MessageCircle className="size-3.5" aria-hidden /> Chatear
        </button>
        <button onClick={() => navigate(`/proveedor/${p.provider.id}`)} className="homy-glass-soft inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-xs font-bold text-[#1D63B8] transition hover:bg-white">
          <Store className="size-3.5" aria-hidden /> Ver local
        </button>
      </div>

      {p.status === 'pagado' && <SobrantesSection purchaseId={p.id} canRequest={canReturn} compact />}
    </article>
  )
}
