'use client'
// Cobros de materiales + Ventas directas del proveedor.
// · Mercado Pago: el proveedor conecta SU cuenta (OAuth) para cobrar las ventas
//   directas ahí mismo. Sin conexión, sus clientes solo pueden pagarle en efectivo.
// · Cobros: proyectos con modo "el cliente paga los materiales al proveedor" —
//   el proveedor emite el cobro y el cliente paga con Mercado Pago o efectivo.
// · Ventas: tu parte de cada pedido del carrito (uno o más productos). D15 (24/09/2026):
//   - COMPRAS (con stock): llegan ya "por pagar" con el stock reservado y el cobro emitido,
//     SIN botón de aprobar: preparás, entregás o cancelás con motivo (libera el stock; si ya
//     estaba pagada por MP se devuelve completa desde tu cuenta de MP).
//   - RESERVAS (con o sin stock): Aprobar / Rechazar. Sin stock, al aprobar indicás
//     "Disponible aproximadamente el …" y después la marcás disponible (ahí se reserva y
//     arrancan las 48 h). El cliente paga (MP con el 1% que paga él, o efectivo) → entregar
//     → reseña. Cada acción queda en la línea de tiempo.
import { useCallback, useEffect, useState } from 'react'
import { useRoute, navigate } from '@/lib/router'
import { StatusBadge, Loading, UAvatar, VerifyBadge } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { fmtDeadline, fmtDay } from '@/lib/order-rules'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  HandCoins, Store, CircleCheck, Hourglass, Banknote, ReceiptText, Info, Wallet,
  ShoppingBag, Truck, Undo2, MessageCircle, CreditCard, Link2, Unlink, CircleAlert, Clock, RefreshCw, History,
} from 'lucide-react'
import { ClientSummaryButton } from '@/components/app/client-summary'
import DevolucionesTab from './devoluciones-tab'
import type { LeftoverReturnRow } from '../sobrantes-section'

type PendingMaterial = { id: string; name: string; quantity: number; unit: string; unitPrice: number; subtotal: number }
type PendingGroup = {
  projectId: string; projectTitle: string; clientName: string; clientId: string
  materials: PendingMaterial[]; amount: number; bloqueado: boolean
}
type Charge = {
  id: string; number: string; description: string; amount: number; status: string; method: string | null
  createdAt: string; paidAt: string | null
  project: { id: string; title: string } | null
  client: { id: string; displayName: string }
}
type SaleCharge = { id: string; number: string; status: string; method: string | null; paidAt: string | null; amount: number }
type SaleLine = { id: string; legacy: boolean; stockId: string | null; elementName: string; unit: string; quantity: number; unitPrice: number; total: number }
type SaleEvent = { id: string; actorRole: string; actorName: string | null; type: string; message: string; createdAt: string }
type Sale = {
  id: string; elementName: string; quantity: number | null; unit: string; unitPrice: number | null; total: number; serviceFee: number; status: string
  type: 'compra' | 'reserva'; note: string | null; chargeId: string | null; createdAt: string
  stockId: string | null; paymentMethod: string | null; rejectionReason: string | null; reservationExpiresAt: string | null
  availableFrom: string | null
  orderNumber: string | null
  lines: SaleLine[]
  events: SaleEvent[]
  charge?: SaleCharge | null
  client: { id: string; displayName: string; avatarUrl: string | null; verificationStatus: string }
}
type StockLite = { id: string; quantity: number; unit: string }
type CobrosTab = 'cobros' | 'ventas' | 'devoluciones'
type MpOauth = { status: 'connected' | 'disconnected' | 'expired'; expiresAt: string | null }

const SALE_META: Record<string, { label: string; tone: string }> = {
  pendiente_aprobacion: { label: 'Reserva para aprobar', tone: 'bg-[#FFC700]/12 text-[#B98A00] ring-[#FFC700]/40' },
  esperando_stock: { label: 'Aprobada: esperando tu stock', tone: 'bg-[#FFC700]/12 text-[#B98A00] ring-[#FFC700]/40' },
  aprobado: { label: 'Por pagar', tone: 'bg-[#1D63B8]/10 text-[#1D63B8] ring-[#1D63B8]/30' },
  entregado: { label: 'Entregado: falta el pago', tone: 'bg-[#FF5A1F]/10 text-[#FF5A1F] ring-[#FF5A1F]/30' },
  pagado: { label: 'Pagado', tone: 'bg-[#0e9f6e]/10 text-[#0e9f6e] ring-[#0e9f6e]/30' },
  rechazado: { label: 'Rechazado', tone: 'bg-slate-500/10 text-slate-500 ring-slate-400/30' },
  cancelado: { label: 'Cancelado', tone: 'bg-slate-500/10 text-slate-500 ring-slate-400/30' },
}

async function readJson(res: Response): Promise<Record<string, any>> {
  try { return await res.json() } catch { return {} }
}

function chargeLabel(c: { status: string; method: string | null } | null | undefined): string {
  if (!c) return 'Sin cobro emitido'
  if (c.status === 'pagada') return c.method === 'efectivo' ? 'Cobrado en efectivo' : 'Cobrado por Mercado Pago'
  if (c.status === 'acordada_efectivo') return 'Efectivo acordado: confirmá al recibirlo'
  if (c.status === 'anulada') return 'Cobro anulado'
  if (c.status === 'reembolsada') return 'Pago devuelto al cliente'
  return c.method === 'mercadopago' ? 'Esperando pago por Mercado Pago' : 'Esperando que el cliente elija cómo pagar'
}

export default function ProviderCharges() {
  const route = useRoute()
  const [tab, setTab] = useState<CobrosTab>(
    route.query.tab === 'ventas' ? 'ventas' : route.query.tab === 'devoluciones' ? 'devoluciones' : 'cobros'
  )
  const [returns, setReturns] = useState<LeftoverReturnRow[] | null>(null)
  const [charges, setCharges] = useState<Charge[]>([])
  const [pending, setPending] = useState<PendingGroup[]>([])
  const [sales, setSales] = useState<Sale[] | null>(null)
  const [mp, setMp] = useState<MpOauth | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState(false)

  // diálogos
  const [approveTarget, setApproveTarget] = useState<Sale | null>(null)
  const [approvePrice, setApprovePrice] = useState('')
  // stock disponible por oferta de cada ítem del pedido (undefined = consultando)
  const [approveStock, setApproveStock] = useState<Record<string, StockLite> | null | undefined>(undefined)
  const [approveDate, setApproveDate] = useState('')
  const [rejectTarget, setRejectTarget] = useState<Sale | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [cancelTarget, setCancelTarget] = useState<Sale | null>(null)
  const [cancelReason, setCancelReason] = useState('')
  const [disconnectOpen, setDisconnectOpen] = useState(false)

  const load = useCallback(async () => {
    setLoadError(false)
    try {
      const [resC, resS, resMe, resR] = await Promise.all([
        fetch('/api/provider/charges'),
        fetch('/api/purchases?as=proveedor'),
        fetch('/api/profiles/me'),
        fetch('/api/returns?role=proveedor'),
      ])
      const [dC, dS, dMe, dR] = await Promise.all([readJson(resC), readJson(resS), readJson(resMe), readJson(resR)])
      setReturns(resR.ok ? (dR.returns || []) : [])
      if (!resC.ok || !resS.ok) {
        setLoadError(true)
        toast.error(dC.error || dS.error || 'No pudimos cargar tus cobros')
        return
      }
      setCharges(dC.charges || [])
      setPending(dC.pending || [])
      setSales(dS.purchases || [])
      if (resMe.ok) {
        const prov = dMe.user?.provider
        setMp({
          status: (prov?.mpOauthStatus as MpOauth['status']) || 'disconnected',
          expiresAt: prov?.mpOauthExpiresAt || null,
        })
      }
    } catch {
      setLoadError(true)
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void load() }, [load])

  // vuelta del OAuth de Mercado Pago: ?mp=conectado|error|cancelado
  useEffect(() => {
    const r = route.query.mp
    if (!r) return
    if (r === 'conectado') toast.success('Mercado Pago conectado', { description: 'Tus clientes ya pueden pagarte las ventas directas por Mercado Pago.' })
    else if (r === 'cancelado') toast.info('No conectaste Mercado Pago', { description: 'Podés hacerlo cuando quieras desde esta pantalla.' })
    else toast.error('No pudimos conectar tu Mercado Pago', { description: 'Probá de nuevo en un rato. Mientras tanto, tus clientes te pagan en efectivo.' })
    navigate(tab === 'cobros' ? '/panel/proveedor/cobros' : `/panel/proveedor/cobros?tab=${tab}`, { replace: true })
  }, [route.query.mp, tab])

  async function emitCharge(projectId: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/provider/charges', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No pudimos emitir el cobro'); return }
      toast.success(`Cobro ${d.charge?.number || ''} emitido`, { description: 'El cliente lo ve en su proyecto y elige cómo pagarlo.' })
      void load()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally { setBusy(false) }
  }

  async function confirmCash(chargeId: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/charges/${chargeId}`, { method: 'PATCH' })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No pudimos confirmar el cobro'); return }
      toast.success('Cobro confirmado: quedó registrado como pagado')
      void load()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally { setBusy(false) }
  }

  async function saleAction(sale: Sale, body: Record<string, unknown>): Promise<boolean> {
    setBusy(true)
    try {
      const res = await fetch(`/api/purchases/${sale.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const d = await readJson(res)
      if (!res.ok) {
        if (d.needsPlan) toast.error(d.error, { description: 'Elegí tu plan en la sección Mi plan.' })
        else toast.error(d.error || 'No pudimos procesar la acción')
        return false
      }
      return true
    } catch {
      toast.error('No pudimos conectar. Reintentá')
      return false
    } finally { setBusy(false) }
  }

  async function openApprove(sale: Sale) {
    setApproveTarget(sale)
    setApprovePrice(sale.lines.length === 1 && sale.lines[0].unitPrice > 0 ? String(sale.lines[0].unitPrice) : '')
    setApproveStock(undefined)
    setApproveDate('')
    if (sale.lines.every((l) => !l.stockId)) { setApproveStock(null); return }
    try {
      const res = await fetch('/api/provider/stock')
      const d = await readJson(res)
      const map: Record<string, StockLite> = {}
      for (const row of (d.stock as StockLite[] | undefined) || []) map[row.id] = { id: row.id, quantity: row.quantity, unit: row.unit }
      setApproveStock(map)
    } catch { setApproveStock(null) }
  }

  async function doApprove() {
    if (!approveTarget) return
    const price = parseFloat(approvePrice)
    const needsPrice = approveTarget.total <= 0 && approveTarget.lines.length === 1
    if (needsPrice && (!price || price <= 0)) { toast.error('Fijá el precio unitario para aprobar el pedido'); return }
    const body: Record<string, unknown> = { action: 'aprobar' }
    if (price > 0) body.unitPrice = price
    const sinStock = !!approveStock && approveTarget.lines.some((l) => !!l.stockId && (!approveStock[l.stockId] || approveStock[l.stockId].quantity < l.quantity))
    if (sinStock) {
      if (!approveDate) { toast.error('Indicá cuándo vas a tener el producto (fecha aproximada)'); return }
      body.availableFrom = approveDate
    }
    const ok = await saleAction(approveTarget, body)
    if (!ok) return
    toast.success(sinStock ? 'Reserva aprobada sin stock' : 'Reserva aprobada', {
      description: sinStock ? 'Le avisamos al cliente la fecha aproximada. Cuando lo tengas, marcala "disponible".' : 'Reservamos el stock y le avisamos al cliente que tiene 48 h para pagar y retirarlo.',
    })
    setApproveTarget(null)
    void load()
  }

  async function doReject() {
    if (!rejectTarget) return
    const ok = await saleAction(rejectTarget, { action: 'rechazar', reason: rejectReason.trim() || undefined })
    if (!ok) return
    toast.info('Reserva rechazada')
    setRejectTarget(null); setRejectReason('')
    void load()
  }

  async function doDeliver(sale: Sale) {
    const ok = await saleAction(sale, { action: 'entregar' })
    if (!ok) return
    const paid = sale.charge?.status === 'pagada' || sale.status === 'pagado'
    toast.success('Marcado como entregado', {
      description: paid ? 'Venta completa: el cliente ya puede calificarte.' : 'Falta el pago: confirmalo cuando lo recibas.',
    })
    void load()
  }

  async function doCancel() {
    if (!cancelTarget) return
    if (cancelReason.trim().length < 3) { toast.error('Contale al cliente por qué cancelás'); return }
    const ok = await saleAction(cancelTarget, { action: 'cancelar', reason: cancelReason.trim() })
    if (!ok) return
    const paid = cancelTarget.charge?.status === 'pagada' || cancelTarget.status === 'pagado'
    toast.info('Venta cancelada', {
      description: paid
        ? (cancelTarget.charge?.method || cancelTarget.paymentMethod) === 'mercadopago' ? 'Mercado Pago le devuelve el pago completo al cliente desde tu cuenta.' : 'Devolvele el efectivo al cliente en mano.'
        : 'El stock reservado volvió a tu inventario.',
    })
    setCancelTarget(null); setCancelReason('')
    void load()
  }

  async function doAvailable(sale: Sale) {
    const ok = await saleAction(sale, { action: 'disponible' })
    if (!ok) return
    toast.success('Reserva disponible', { description: 'Reservamos el stock y le avisamos al cliente: tiene 48 h para pagar y retirarlo.' })
    void load()
  }

  async function disconnectMp() {
    setBusy(true)
    try {
      const res = await fetch('/api/mp/oauth', { method: 'DELETE' })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No pudimos desconectar Mercado Pago'); return }
      toast.success('Mercado Pago desconectado', { description: 'Tus clientes solo pueden pagarte en efectivo hasta que vuelvas a conectar.' })
      setDisconnectOpen(false)
      void load()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally { setBusy(false) }
  }

  if (loading) return <Loading />
  if (loadError) {
    return (
      <div className="homy-page">
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <span className="homy-empty-icon homy-chip-orange" aria-hidden><CircleAlert className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">No pudimos cargar tus cobros</h3>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">Revisá tu conexión y volvé a intentar.</p>
          <button onClick={() => { setLoading(true); void load() }} className="homy-btn-primary mt-4 min-h-[44px] px-5 text-sm">
            <RefreshCw className="size-4" aria-hidden /> Reintentar
          </button>
        </div>
      </div>
    )
  }

  const abiertos = charges.filter((c) => c.status === 'pendiente' || c.status === 'acordada_efectivo')
  const pagados = charges.filter((c) => c.status === 'pagada')
  const pendingReturns = returns ? returns.filter((r) => r.status === 'solicitada').length : 0
  const pendingSales = sales ? sales.filter((s) => ['pendiente_aprobacion', 'esperando_stock', 'aprobado'].includes(s.status)).length : 0
  const mpExpires = mp?.expiresAt ? new Date(mp.expiresAt) : null

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Ventas y cobranzas</span>
          <h1 className="homy-page-title mt-1.5">Cobros y ventas</h1>
          <p className="homy-page-sub">Cobrale materiales al cliente en proyectos, y gestioná los pedidos directos que te hacen desde el marketplace</p>
        </div>
      </header>

      {/* ── Mercado Pago del proveedor (OAuth) ── */}
      <section className={`homy-glass rounded-3xl p-4 sm:p-5 mb-5 ${mp?.status === 'connected' ? 'ring-1 ring-[#0e9f6e]/30' : 'ring-1 ring-[#FFC700]/40'}`}>
        <div className="flex flex-wrap items-center gap-3">
          <span aria-hidden className={`homy-icon-chip size-11 shrink-0 [&_svg]:size-5 ${mp?.status === 'connected' ? 'homy-chip-mint' : 'homy-chip-gold'}`}><CreditCard /></span>
          {/* base 14rem: en el celu el botón baja a su propia línea en vez de
              aplastar el texto a una palabra por renglón */}
          <div className="min-w-0 flex-[1_1_14rem]">
            <h2 className="text-[15px] font-extrabold text-[#0A2540]">Cobrá con tu Mercado Pago</h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">
              {mp?.status === 'connected' ? (
                <><b className="text-[#0e9f6e]">Conectado</b>{mpExpires ? ` hasta ${mpExpires.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}` : ''}. La plata de tus ventas y cobros entra en tu cuenta: cobrás el 100% de tu precio (el cliente paga aparte el cargo de servicio HomIA del 1%).</>
              ) : mp?.status === 'expired' ? (
                <><b className="text-[#FF5A1F]">Vencido: volvé a conectar.</b> Sin conexión, tus clientes solo pueden pagarte en efectivo.</>
              ) : (
                <><b>No conectado.</b> Sin conexión, tus clientes solo pueden pagarte en efectivo.</>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {mp?.status === 'connected' ? (
              <button disabled={busy} onClick={() => setDisconnectOpen(true)} className="homy-glass-soft inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm font-bold text-slate-500 hover:text-red-600 transition disabled:opacity-50">
                <Unlink className="size-4" aria-hidden /> Desconectar
              </button>
            ) : (
              <button onClick={() => { window.location.href = '/api/mp/oauth/connect?kind=provider' }} className="homy-btn-primary min-h-[44px] px-5 text-sm">
                <Link2 className="size-4" aria-hidden /> {mp?.status === 'expired' ? 'Volver a conectar' : 'Conectar Mercado Pago'}
              </button>
            )}
          </div>
        </div>
      </section>

      <div role="tablist" aria-label="Secciones de cobros" className="mb-5 flex gap-1 rounded-full bg-white/[0.06] ring-1 ring-[#0A2540]/10 p-1 w-fit max-w-full overflow-x-auto no-scrollbar">
        {(['cobros', 'ventas', 'devoluciones'] as const).map((t) => {
          const badge = t === 'ventas' ? pendingSales : t === 'devoluciones' ? pendingReturns : 0
          return (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            data-tour={`tab-${t}`}
            onClick={() => { setTab(t); navigate(t === 'cobros' ? '/panel/proveedor/cobros' : `/panel/proveedor/cobros?tab=${t}`, { replace: true }) }}
            className="homy-tab shrink-0"
          >
            {t === 'cobros' ? <HandCoins className="size-4" aria-hidden /> : t === 'ventas' ? <ShoppingBag className="size-4" aria-hidden /> : <Undo2 className="size-4" aria-hidden />}
            {t === 'cobros' ? 'Cobros de proyectos' : t === 'ventas' ? 'Ventas (pedidos)' : 'Devoluciones'}
            {badge > 0 && (
              <span className="homy-badge-pop ml-1 grid size-[18px] place-items-center rounded-full bg-[#FF5A1F] text-[10px] font-extrabold text-white">
                {badge}
              </span>
            )}
          </button>
          )
        })}
      </div>

      {tab === 'devoluciones' && (
        <DevolucionesTab returns={returns} mpConnected={mp?.status === 'connected'} onChanged={() => void load()} />
      )}

      {tab === 'cobros' && (
        <>
          {pending.length === 0 && charges.length === 0 && (
            <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
              <span className="homy-empty-icon homy-chip-ai" aria-hidden><HandCoins className="size-6" /></span>
              <h3 className="font-extrabold tracking-tight text-[#0A2540]">Sin cobros por ahora</h3>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
                Cuando un profesional incluya tus materiales en un proyecto con modo <span className="font-bold">“el cliente paga al proveedor”</span> y el cliente los apruebe, vas a poder emitir el cobro acá. Los cobros de tus ventas directas también aparecen en esta lista.
              </p>
            </div>
          )}

          {pending.length > 0 && (
            <section className="mb-7">
              <div className="homy-section-head">
                <h2 className="homy-section-title">
                  <span className="homy-icon-chip homy-chip-ai size-9 shrink-0 [&_svg]:size-4" aria-hidden><Store /></span>
                  Materiales por cobrar
                </h2>
                <span className="homy-pill">{pending.length}</span>
              </div>
              <div className="space-y-2.5 homy-stagger">
                {pending.map((g) => (
                  <div key={g.projectId} className="homy-row homy-lift p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-[#0A2540]">{g.projectTitle}</p>
                        <p className="text-xs text-slate-400">Cliente: {g.clientName}</p>
                      </div>
                      <p className="homy-num-adapt text-xl font-extrabold text-[#0A2540] tabular-nums">{formatARS(g.amount)}</p>
                    </div>
                    <div className="mt-2.5 divide-y divide-[#0A2540]/5">
                      {g.materials.map((m) => (
                        <div key={m.id} className="flex items-center justify-between gap-2 py-1.5 text-sm">
                          <p className="min-w-0 truncate text-slate-600">{m.name} · {m.quantity} {m.unit} × {formatARS(m.unitPrice)}</p>
                          <p className="font-bold tabular-nums text-[#0A2540]">{formatARS(m.subtotal)}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      {g.bloqueado ? (
                        <p className="flex items-center gap-1.5 text-xs font-bold text-[#1D63B8]">
                          <Hourglass className="size-3.5" aria-hidden /> Ya tenés un cobro abierto para este proyecto — esperá el pago
                        </p>
                      ) : (
                        <p className="flex items-center gap-1.5 text-xs text-slate-500">
                          <Info className="size-3.5 shrink-0" aria-hidden /> El cliente elige pagar con Mercado Pago o acordar efectivo
                        </p>
                      )}
                      <button disabled={busy || g.bloqueado} onClick={() => emitCharge(g.projectId)} className="homy-btn-primary px-4 py-2.5 text-sm disabled:opacity-50">
                        <HandCoins className="mr-1 inline size-4" aria-hidden /> Emitir cobro al cliente
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {abiertos.length > 0 && (
            <section className="mb-7">
              <div className="homy-section-head">
                <h2 className="homy-section-title">
                  <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-4" aria-hidden><Hourglass /></span>
                  Cobros esperando pago
                </h2>
                <span className="homy-pill">{abiertos.length}</span>
              </div>
              <div className="space-y-2.5 homy-stagger">
                {abiertos.map((c) => (
                  <div key={c.id} className="homy-row flex flex-wrap items-center justify-between gap-2 p-4">
                    <div className="min-w-0">
                      <p className="font-bold text-[#0A2540]">{c.number} · {c.project ? c.project.title : 'Venta directa'}</p>
                      <p className="text-xs text-slate-400 line-clamp-1">Para {c.client.displayName} · {c.description}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="homy-num-adapt font-extrabold tabular-nums">{formatARS(c.amount)}</p>
                      {c.status === 'pendiente' ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-3 py-1.5 text-[11px] font-extrabold text-slate-500">
                            <Wallet className="size-3.5" aria-hidden /> {c.method === 'mercadopago' ? 'Esperando pago por Mercado Pago' : 'Esperando pago del cliente'}
                          </span>
                          <StatusBadge status="pendiente" />
                        </>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1D63B8]/10 px-3 py-1.5 text-[11px] font-extrabold text-[#1D63B8]">
                            <Banknote className="size-3.5" aria-hidden /> Efectivo acordado
                          </span>
                          <button disabled={busy} onClick={() => confirmCash(c.id)} className="homy-btn-primary min-h-[44px] px-4 py-2 text-sm disabled:opacity-50">
                            <CircleCheck className="mr-1 inline size-4" aria-hidden /> Confirmar cobro en efectivo
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}

          {pagados.length > 0 && (
            <section>
              <div className="homy-section-head">
                <h2 className="homy-section-title">
                  <span className="homy-icon-chip homy-chip-mint size-9 shrink-0 [&_svg]:size-4" aria-hidden><CircleCheck /></span>
                  Cobros cobrados
                </h2>
                <span className="homy-pill">{pagados.length}</span>
              </div>
              <div className="space-y-2.5 homy-stagger">
                {pagados.map((c) => (
                  <div key={c.id} className="homy-row flex flex-wrap items-center justify-between gap-2 p-4">
                    <div className="min-w-0">
                      <p className="font-bold text-[#0A2540]">{c.number} · {c.project ? c.project.title : 'Venta directa'}</p>
                      <p className="text-xs text-slate-400 line-clamp-1">
                        {c.client.displayName} · cobrado {formatDate(c.paidAt || c.createdAt)}{c.method ? ` · ${c.method === 'efectivo' ? 'en efectivo' : 'por Mercado Pago'}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="homy-num-adapt font-bold tabular-nums">{formatARS(c.amount)}</p>
                      <ReceiptText className="size-4 text-slate-300" aria-hidden />
                      <StatusBadge status="pagada" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}

      {tab === 'ventas' && (
        <>
          {!sales || sales.length === 0 ? (
            <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
              <span className="homy-empty-icon homy-chip-gold" aria-hidden><ShoppingBag className="size-6" /></span>
              <h3 className="font-extrabold tracking-tight text-[#0A2540]">Todavía no tenés pedidos</h3>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
                Los clientes y profesionales suman tus productos a su <b>carrito</b> desde Materiales o tu perfil. Las <b>compras</b> con stock te llegan ya reservadas y listas para cobrar; las <b>reservas</b> las aprobás vos. Todo se gestiona acá: cobrar → entregar → reseña.
              </p>
            </div>
          ) : (
            <>
              <p className="homy-page-sub -mt-2 mb-4"><b>Compras</b>: llegan con tu stock ya reservado y el cobro emitido, sin que tengas que aprobar nada; el cliente tiene 24 h para pagar por Mercado Pago o elegir efectivo (con efectivo, 7 días para retirar). Vos preparás y entregás; si no podés cumplir, cancelás con un motivo. <b>Reservas</b>: las aprobás o rechazás; si no tenés stock, al aprobar indicás cuándo lo vas a tener. Mirá la reputación del cliente.</p>
              <div className="space-y-3">
                {sales.map((v) => {
                  const meta = SALE_META[v.status] || SALE_META.cancelado
                  const cashAgreed = v.charge?.status === 'acordada_efectivo'
                  const chargePaid = v.charge?.status === 'pagada'
                  const expires = v.reservationExpiresAt ? new Date(v.reservationExpiresAt) : null
                  return (
                    <article key={v.id} className="homy-row homy-lift p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <UAvatar name={v.client.displayName} url={v.client.avatarUrl} size={42} />
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-x-1.5 text-[15px] font-extrabold text-[#0A2540] leading-snug">
                              {v.orderNumber ? `Pedido ${v.orderNumber}` : v.elementName}
                              {v.lines.length > 1 && <span className="text-[12px] font-bold text-slate-400">· {v.lines.length} productos</span>}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                              {v.client.displayName}
                              <VerifyBadge status={v.client.verificationStatus} />
                              · {formatDate(v.createdAt)} · {v.type === 'reserva' ? 'reserva' : 'compra directa'}
                              {v.note ? ` · “${v.note}”` : ''}
                            </p>
                            <ClientSummaryButton userId={v.client.id} label="Reputación del cliente" />
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="homy-num-adapt text-lg font-extrabold text-[#0A2540] tabular-nums">{v.total > 0 ? formatARS(v.total) : 'A coordinar'}</p>
                          <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold ring-1 ${meta.tone}`}>
                            {v.status === 'aprobado' && chargePaid ? 'Pagada: falta entregar' : v.status === 'aprobado' && cashAgreed ? 'Efectivo al retirar' : v.status === 'aprobado' && v.type === 'reserva' ? 'Reservada: por pagar' : meta.label}
                          </span>
                        </div>
                      </div>

                      {/* ítems del pedido */}
                      <ul className="mt-2.5 divide-y divide-[#0A2540]/6 rounded-2xl bg-white/45 px-3 ring-1 ring-[#0A2540]/8">
                        {v.lines.map((l) => (
                          <li key={l.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 py-1.5 text-[13px]">
                            <span className="min-w-0 flex-[1_1_11rem] font-bold text-[#0A2540]">{l.elementName}</span>
                            <span className="text-[12px] text-slate-500 tabular-nums">{l.quantity} {l.unit} × {formatARS(l.unitPrice)}</span>
                            <span className="homy-num-adapt ml-auto font-extrabold tabular-nums text-[#0A2540]">{formatARS(l.total)}</span>
                          </li>
                        ))}
                      </ul>

                      {/* método de pago + estado del cobro */}
                      {!['pendiente_aprobacion', 'esperando_stock', 'rechazado', 'cancelado'].includes(v.status) && (
                        <p className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-slate-500">
                          <span className="inline-flex items-center gap-1 font-bold text-[#0A2540]">
                            {v.paymentMethod === 'mercadopago' ? <CreditCard className="size-3.5" aria-hidden /> : <Banknote className="size-3.5" aria-hidden />}
                            {v.paymentMethod === 'mercadopago' ? 'Mercado Pago' : v.paymentMethod === 'efectivo' ? 'Efectivo' : 'Método a elegir por el cliente'}
                          </span>
                          <span>· {chargeLabel(v.charge)}{v.charge?.number ? ` (${v.charge.number})` : ''}</span>
                          {chargePaid && v.charge?.paidAt && <span>· cobrado {formatDate(v.charge.paidAt)}</span>}
                        </p>
                      )}
                      {v.paymentMethod === 'mercadopago' && (
                        <p className="mt-1 text-[11.5px] text-slate-400">Cobrás {formatARS(v.total)} (el 100% de tu precio). El cliente paga aparte el cargo de servicio HomIA (1%).</p>
                      )}
                      {v.status === 'aprobado' && expires && !chargePaid && (
                        <p className="mt-1 flex items-center gap-1.5 text-[12px] text-slate-400">
                          <Clock className="size-3.5 shrink-0" aria-hidden /> Si no se paga, se cancela sola el {fmtDeadline(expires)} y el stock vuelve a tu inventario
                        </p>
                      )}
                      {v.status === 'esperando_stock' && (
                        <p className="mt-2 flex items-center gap-1.5 text-[12px] font-semibold text-[#8a6700]">
                          <Clock className="size-3.5 shrink-0" aria-hidden /> Le dijiste al cliente que lo tenés aproximadamente el {v.availableFrom ? fmtDay(v.availableFrom) : '—'}. Cuando lo tengas, marcala disponible: ahí se reserva el stock.
                        </p>
                      )}
                      {v.type !== 'reserva' && v.status === 'aprobado' && !chargePaid && (
                        <p className="mt-1 text-[11.5px] text-slate-400">Compra directa: tu stock ya está reservado para este cliente. No hace falta aprobarla.</p>
                      )}
                      {v.status === 'rechazado' && v.rejectionReason && (
                        <p className="mt-1.5 text-[12px] text-slate-500">Motivo: {v.rejectionReason}</p>
                      )}

                      <div className="mt-3 flex flex-wrap gap-2">
                        {v.status === 'pendiente_aprobacion' && (
                          <>
                            <button disabled={busy} onClick={() => void openApprove(v)} className="homy-btn-primary min-h-[44px] px-4 py-2 text-sm disabled:opacity-50">
                              <CircleCheck className="mr-1 inline size-4" aria-hidden /> {v.type === 'reserva' ? 'Aprobar reserva' : 'Aprobar pedido'}
                            </button>
                            <button disabled={busy} onClick={() => { setRejectTarget(v); setRejectReason('') }} className="homy-glass-soft min-h-[44px] px-4 py-2 text-sm font-bold text-slate-500 hover:text-red-600 rounded-full transition disabled:opacity-50">
                              <Undo2 className="mr-1 inline size-4" aria-hidden /> Rechazar
                            </button>
                          </>
                        )}
                        {v.status === 'aprobado' && (
                          <>
                            {cashAgreed && v.chargeId && (
                              <button disabled={busy} onClick={() => confirmCash(v.chargeId!)} className="homy-btn-primary min-h-[44px] px-4 py-2 text-sm disabled:opacity-50">
                                <Banknote className="mr-1 inline size-4" aria-hidden /> Confirmar cobro en efectivo
                              </button>
                            )}
                            <button disabled={busy} onClick={() => void doDeliver(v)} className={`${cashAgreed ? 'homy-btn-dark' : 'homy-btn-primary'} min-h-[44px] px-4 py-2 text-sm disabled:opacity-50`}>
                              <Truck className="mr-1 inline size-4" aria-hidden /> Entregado
                            </button>
                            <button disabled={busy} onClick={() => { setCancelTarget(v); setCancelReason('') }} className="homy-glass-soft min-h-[44px] px-4 py-2 text-sm font-bold text-slate-500 hover:text-red-600 rounded-full transition disabled:opacity-50">
                              <Undo2 className="mr-1 inline size-4" aria-hidden /> {chargePaid ? 'Cancelar y devolver' : 'Cancelar'}
                            </button>
                          </>
                        )}
                        {v.status === 'esperando_stock' && (
                          <>
                            <button disabled={busy} onClick={() => void doAvailable(v)} className="homy-btn-primary min-h-[44px] px-4 py-2 text-sm disabled:opacity-50">
                              <CircleCheck className="mr-1 inline size-4" aria-hidden /> Ya lo tengo: disponible
                            </button>
                            <button disabled={busy} onClick={() => { setCancelTarget(v); setCancelReason('') }} className="homy-glass-soft min-h-[44px] px-4 py-2 text-sm font-bold text-slate-500 hover:text-red-600 rounded-full transition disabled:opacity-50">
                              <Undo2 className="mr-1 inline size-4" aria-hidden /> Cancelar
                            </button>
                          </>
                        )}
                        {v.status === 'pagado' && !v.events.some((e) => e.type === 'entregado') && (
                          <>
                            <button disabled={busy} onClick={() => void doDeliver(v)} className="homy-btn-primary min-h-[44px] px-4 py-2 text-sm disabled:opacity-50">
                              <Truck className="mr-1 inline size-4" aria-hidden /> Entregado
                            </button>
                            <button disabled={busy} onClick={() => { setCancelTarget(v); setCancelReason('') }} className="homy-glass-soft min-h-[44px] px-4 py-2 text-sm font-bold text-slate-500 hover:text-red-600 rounded-full transition disabled:opacity-50">
                              <Undo2 className="mr-1 inline size-4" aria-hidden /> Cancelar y devolver
                            </button>
                          </>
                        )}
                        {v.status === 'entregado' && cashAgreed && v.chargeId && (
                          <button disabled={busy} onClick={() => confirmCash(v.chargeId!)} className="homy-btn-primary min-h-[44px] px-4 py-2 text-sm disabled:opacity-50">
                            <Banknote className="mr-1 inline size-4" aria-hidden /> Confirmar cobro en efectivo
                          </button>
                        )}
                        {v.status === 'entregado' && !cashAgreed && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-4 py-2 text-xs font-extrabold text-slate-500">
                            <Wallet className="size-3.5" aria-hidden /> Esperando el pago del cliente
                          </span>
                        )}
                        {v.status === 'pagado' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0e9f6e]/10 px-4 py-2 text-xs font-extrabold text-[#0e9f6e]">
                            <CircleCheck className="size-3.5" aria-hidden /> Venta cobrada — el cliente puede calificarte
                          </span>
                        )}
                        <button onClick={() => navigate(`/mensajes?c=nuevo:${v.client.id}`)} className="homy-glass-soft ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-[#1D63B8] transition hover:bg-white">
                          <MessageCircle className="size-3.5" aria-hidden /> Chatear
                        </button>
                      </div>

                      {/* línea de tiempo de ESTA parte del pedido (el proveedor no ve la de otros) */}
                      {v.events.length > 0 && (
                        <details className="group mt-3 rounded-2xl bg-[#0A2540]/[0.03] px-3 py-2">
                          <summary className="flex min-h-[36px] cursor-pointer list-none items-center gap-1.5 text-[12.5px] font-bold text-slate-600">
                            <History className="size-3.5 text-[#1D63B8]" aria-hidden /> Línea de tiempo ({v.events.length})
                            <span aria-hidden className="ml-auto text-xs text-slate-400 transition group-open:rotate-180">▾</span>
                          </summary>
                          <ol className="mt-1.5 space-y-2 border-l-2 border-[#1D63B8]/15 pb-1 pl-3">
                            {[...v.events].reverse().map((e) => (
                              <li key={e.id}>
                                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
                                  {new Date(e.createdAt).toLocaleString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {e.actorRole === 'proveedor' ? 'Vos' : e.actorRole === 'sistema' ? 'HomIA' : e.actorName || 'Cliente'}
                                </p>
                                <p className="text-[12.5px] leading-snug text-[#0A2540]">{e.message}</p>
                              </li>
                            ))}
                          </ol>
                        </details>
                      )}
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ── Dialog: aceptar pedido (precio unitario + stock disponible) ── */}
      <Dialog open={!!approveTarget} onOpenChange={(o) => { if (!o && !busy) setApproveTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{approveTarget?.type === 'reserva' ? 'Aprobar reserva' : 'Aprobar pedido'}{approveTarget?.orderNumber ? ` ${approveTarget.orderNumber}` : ''}</DialogTitle>
            <DialogDescription>
              {approveTarget ? `${approveTarget.lines.length} producto${approveTarget.lines.length === 1 ? '' : 's'} para ${approveTarget.client.displayName}.` : ''} Si tenés stock de todo, lo reservamos junto y el cliente tiene 48 h para pagar y retirar. Si falta algo, indicá cuándo lo vas a tener: no se descuenta nada hasta que la marques disponible.
            </DialogDescription>
          </DialogHeader>
          {approveTarget && (
            <div className="space-y-3">
              <ul className="max-h-[40dvh] divide-y divide-[#0A2540]/8 overflow-y-auto rounded-xl bg-[#0A2540]/4 px-3">
                {approveTarget.lines.map((l) => {
                  const st = l.stockId && approveStock ? approveStock[l.stockId] : undefined
                  const short = !!st && st.quantity < l.quantity
                  return (
                    <li key={l.id} className="py-2 text-[13px]">
                      <p className="font-bold text-[#0A2540]">{l.elementName} × {l.quantity} {l.unit}</p>
                      <p className="text-[12px] text-slate-500">
                        Stock: {approveStock === undefined ? 'consultando…' : !st ? 'no encontrado' : <b className={short ? 'text-red-600' : 'text-[#0e9f6e]'}>{st.quantity} {st.unit}</b>}
                        {short && ' — no alcanza'}
                      </p>
                    </li>
                  )
                })}
              </ul>
              {approveTarget.lines.length === 1 && (
                <>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-400" htmlFor="apr-precio">
                    Precio unitario {approveTarget.total <= 0 ? '(obligatorio)' : '(podés ajustarlo)'}
                  </label>
                  <input
                    id="apr-precio"
                    type="number" min="1" step="0.01" inputMode="decimal"
                    value={approvePrice}
                    onChange={(e) => setApprovePrice(e.target.value)}
                    placeholder="Ej: 12500"
                    className="homy-glass-input w-full rounded-2xl px-4 py-3 text-[15px]"
                  />
                </>
              )}
              {approveTarget.type === 'reserva' && !!approveStock && approveTarget.lines.some((l) => !!l.stockId && (!approveStock[l.stockId] || approveStock[l.stockId].quantity < l.quantity)) && (
                <>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-400" htmlFor="apr-fecha">
                    Disponible aproximadamente el…
                  </label>
                  <input
                    id="apr-fecha"
                    type="date"
                    min={new Date().toISOString().slice(0, 10)}
                    value={approveDate}
                    onChange={(e) => setApproveDate(e.target.value)}
                    className="homy-glass-input w-full rounded-2xl px-4 py-3 text-[15px]"
                  />
                  <p className="text-[12px] text-slate-500">No tenés stock suficiente: el cliente ve esta fecha y le avisamos cuando la marques disponible.</p>
                </>
              )}
              <p className="text-[12.5px] text-slate-500 tabular-nums">
                Total del cobro: <b className="text-[#0A2540]">{formatARS(approveTarget.lines.length === 1 && parseFloat(approvePrice) > 0 ? parseFloat(approvePrice) * approveTarget.lines[0].quantity : approveTarget.total)}</b>
              </p>
            </div>
          )}
          <DialogFooter>
            <button type="button" disabled={busy} onClick={() => setApproveTarget(null)} className="homy-glass-soft min-h-[44px] rounded-full px-4 text-sm font-bold text-slate-500">Volver</button>
            <button
              type="button"
              disabled={busy || (approveTarget?.type !== 'reserva' && !!approveStock && approveTarget != null && approveTarget.lines.some((l) => !!l.stockId && !!approveStock[l.stockId] && approveStock[l.stockId].quantity < l.quantity))}
              onClick={() => void doApprove()}
              className="homy-btn-primary min-h-[44px] px-5 text-sm disabled:opacity-50"
            >
              <CircleCheck className="size-4" aria-hidden /> {busy ? 'Aprobando…' : approveTarget?.type === 'reserva' && !!approveStock && approveTarget.lines.some((l) => !!l.stockId && (!approveStock[l.stockId] || approveStock[l.stockId].quantity < l.quantity)) ? 'Aprobar sin stock' : 'Aprobar y reservar todo'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: rechazar pedido (motivo) ── */}
      <Dialog open={!!rejectTarget} onOpenChange={(o) => { if (!o && !busy) setRejectTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Rechazar la reserva entera</DialogTitle>
            <DialogDescription>
              {rejectTarget ? `${rejectTarget.elementName}. ` : ''}Se rechazan todos los productos de la reserva. Contale al cliente por qué: le llega en la notificación y en su pedido.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder="Ej: sin stock de esa medida hasta la semana que viene"
            className="homy-glass-input w-full rounded-2xl px-4 py-3 text-sm"
            autoFocus
          />
          <DialogFooter>
            <button type="button" disabled={busy} onClick={() => setRejectTarget(null)} className="homy-glass-soft min-h-[44px] rounded-full px-4 text-sm font-bold text-slate-500">Volver</button>
            <button type="button" disabled={busy} onClick={() => void doReject()} className="min-h-[44px] rounded-full bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
              {busy ? 'Rechazando…' : 'Rechazar reserva'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── Dialog: cancelar una venta (motivo obligatorio) ── */}
      <Dialog open={!!cancelTarget} onOpenChange={(o) => { if (!o && !busy) setCancelTarget(null) }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{cancelTarget && (cancelTarget.charge?.status === 'pagada' || cancelTarget.status === 'pagado') ? 'Cancelar y devolver el pago' : 'Cancelar la venta'}</DialogTitle>
            <DialogDescription>
              {cancelTarget ? `${cancelTarget.elementName}. ` : ''}
              {cancelTarget && (cancelTarget.charge?.status === 'pagada' || cancelTarget.status === 'pagado')
                ? (cancelTarget.charge?.method || cancelTarget.paymentMethod) === 'mercadopago'
                  ? 'El cliente ya pagó por Mercado Pago: se le devuelve el pago completo desde tu cuenta. '
                  : 'El cliente ya te pagó en efectivo: devolvéselo en mano. '
                : ''}
              El stock reservado vuelve a tu inventario. Contale al cliente por qué: le llega en la notificación y en su pedido.
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            rows={3}
            maxLength={400}
            placeholder="Ej: se rompió la bolsa en el depósito y no me quedan"
            className="homy-glass-input w-full rounded-2xl px-4 py-3 text-sm"
            autoFocus
          />
          <DialogFooter>
            <button type="button" disabled={busy} onClick={() => setCancelTarget(null)} className="homy-glass-soft min-h-[44px] rounded-full px-4 text-sm font-bold text-slate-500">Volver</button>
            <button type="button" disabled={busy || cancelReason.trim().length < 3} onClick={() => void doCancel()} className="min-h-[44px] rounded-full bg-red-600 px-5 text-sm font-bold text-white hover:bg-red-700 disabled:opacity-50">
              {busy ? 'Cancelando…' : 'Cancelar venta'}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ── AlertDialog: desconectar Mercado Pago ── */}
      <AlertDialog open={disconnectOpen} onOpenChange={(o) => { if (!busy) setDisconnectOpen(o) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar Mercado Pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Tus clientes van a poder pagarte solo en efectivo hasta que vuelvas a conectar tu cuenta. Los pagos ya iniciados no se ven afectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Volver</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void disconnectMp() }} className="bg-red-600 text-white hover:bg-red-700">
              {busy ? 'Desconectando…' : 'Sí, desconectar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
