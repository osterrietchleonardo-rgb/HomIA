'use client'
// Facturas del cliente + elección de método de pago: Mercado Pago (a la cuenta del
// profesional, + cargo de servicio HomIA del 1% que paga el cliente) o efectivo sin
// cargo (lo confirma el profesional). Si el profesional no conectó MP, solo efectivo.
import { useEffect, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { StatusBadge, Loading } from '@/components/app/ui-bits'
import { formatARS, formatARSCents, formatDate } from '@/lib/format'
import { MpFeeBreakdown, NoMpNotice, PaidFeeLine } from '@/components/app/mp-fee'
import { totalWithMp } from '@/lib/fees'
import { toast } from 'sonner'
import { Wallet, ReceiptText, CircleCheck, ArrowLeft, FileDown, Banknote, Undo2, Hourglass, RefreshCcw, Loader2 } from 'lucide-react'

function verPdf(id: string, number_: string) {
  // abre el PDF real generado por el servidor (cookies httpOnly viajan solas)
  const w = window.open(`/api/invoices/${id}/pdf`, '_blank')
  if (!w) {
    // popup bloqueado → descarga directa
    const a = document.createElement('a')
    a.href = `/api/invoices/${id}/pdf`
    a.download = `Factura-${number_}.pdf`
    document.body.appendChild(a)
    a.click()
    a.remove()
  }
}

type Invoice = {
  id: string; number: string; total: number; serviceFee?: number; status: string; issuedAt: string
  laborCost: number; materialsCost: number; paymentMethod?: string | null
  project: { id: string; title: string }
  pro: { name: string; mpConnected: boolean }
}
type ProjectRow = {
  id: string; title: string; invoices: Omit<Invoice, 'project' | 'pro'>[]
  pro?: { mpConnected?: boolean; user?: { displayName?: string } }
}

const MP_NO_CONFIG = 'El pago con Mercado Pago no está disponible: podés pagar en efectivo'
const NET_ERROR = 'No pudimos conectar con HomIA. Revisá tu conexión y probá de nuevo.'

export default function ClientInvoices() {
  const route = useRoute()
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  // vuelta de Mercado Pago: ?pago=ok (nuevo) o ?estado=pagado|pendiente (back_urls actuales)
  const pagoParam = route.query.pago || route.query.estado
  const confirmingPayment = pagoParam === 'ok' || pagoParam === 'pagado' || pagoParam === 'pendiente'
  const paymentFailed = pagoParam === 'fallo'

  async function load() {
    setError(null)
    try {
      // facturas de todos mis proyectos como cliente (el serializer trae issuedAt, laborCost, materialsCost y title)
      const res = await fetch('/api/projects?role=cliente')
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'No pudimos cargar tus facturas'); return }
      const projects = (d.asClient || []) as ProjectRow[]
      const all = projects.flatMap((p) => (p.invoices || []).map((inv) => ({
        ...inv,
        project: { id: p.id, title: p.title },
        pro: { name: p.pro?.user?.displayName || 'El profesional', mpConnected: !!p.pro?.mpConnected },
      })))
      all.sort((a, b) => new Date(b.issuedAt).getTime() - new Date(a.issuedAt).getTime())
      setInvoices(all)
    } catch {
      setError(NET_ERROR)
    }
  }

  useEffect(() => {
    (async () => {
      try { await load() } finally { setLoading(false) }
    })()
  }, [])

  async function payMP(inv: Invoice) {
    setBusy(inv.id)
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, { method: 'POST' })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        if (data.needsConfig) toast.info(data.error || MP_NO_CONFIG)
        else toast.error(data.error || 'No se pudo iniciar el pago')
        return
      }
      if (data.initPoint) window.location.href = data.initPoint
    } catch {
      toast.error(NET_ERROR)
    } finally { setBusy(null) }
  }

  async function cashAction(inv: Invoice, action: 'acordar' | 'cancelar') {
    setBusy(inv.id)
    try {
      const res = await fetch(`/api/invoices/${inv.id}/cash`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(data.error || 'No se pudo actualizar el acuerdo'); return }
      if (action === 'acordar') {
        toast.success('Efectivo acordado', { description: 'El profesional ve el acuerdo y confirma cuando recibe el dinero.' })
      } else {
        toast.info('Acuerdo cancelado: podés elegir otro método de pago')
      }
      await load()
    } catch {
      toast.error(NET_ERROR)
    } finally { setBusy(null) }
  }

  if (loading) return <Loading />
  const pendientes = invoices.filter((i) => i.status === 'pendiente')
  const pagadas = invoices.filter((i) => i.status === 'pagada')
  const totalPendiente = pendientes.reduce((a, i) => a + i.total, 0)

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Pagos</span>
          <h1 className="homy-page-title mt-1.5">Facturas</h1>
          <p className="homy-page-sub">Todo lo que tenés que pagar y lo ya pagado. Pagás con Mercado Pago (+1% de cargo de servicio) o en efectivo.</p>
        </div>
      </header>

      {confirmingPayment && (
        <div className="mb-5 flex flex-wrap items-center gap-3 rounded-2xl bg-[#1D63B8]/8 p-4" role="status">
          <span className="homy-icon-chip homy-chip-blue size-9 shrink-0 [&_svg]:size-4" aria-hidden><Hourglass /></span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-[#0A2540]">Estamos confirmando tu pago</p>
            <p className="text-xs text-slate-500">Mercado Pago nos avisa en unos segundos; la factura pasa a “pagada” sola. Si sigue pendiente, actualizá.</p>
          </div>
          <button onClick={() => { setLoading(true); load().finally(() => setLoading(false)) }} className="homy-glass-soft homy-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold text-[#1D63B8]">
            <RefreshCcw className="size-3.5" aria-hidden /> Actualizar
          </button>
        </div>
      )}
      {paymentFailed && (
        <div className="mb-5 rounded-2xl border border-red-100 bg-red-50 p-4 text-sm text-slate-600" role="status">
          <span className="font-extrabold text-[#0A2540]">El pago no se completó.</span> Podés intentar de nuevo con Mercado Pago o acordar efectivo con tu profesional.
        </div>
      )}

      {error ? (
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <span className="homy-empty-icon homy-chip-gold" aria-hidden><ReceiptText className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">No pudimos cargar tus facturas</h3>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{error}</p>
          <button onClick={() => { setLoading(true); load().finally(() => setLoading(false)) }} className="homy-btn-primary mt-5 px-5 py-3 text-sm sm:py-2.5">
            <RefreshCcw className="size-4" aria-hidden /> Reintentar
          </button>
        </div>
      ) : invoices.length === 0 ? (
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <span className="homy-empty-icon homy-chip-gold" aria-hidden><ReceiptText className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">Sin facturas todavía</h3>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
            Cuando tu profesional emita la factura del proyecto (mano de obra y, si corresponde, materiales con detalle), la pagás acá con Mercado Pago o efectivo.
          </p>
          <button onClick={() => navigate('/panel/cliente/proyectos')} className="homy-btn-dark mt-5 px-5 py-3 text-sm sm:py-2.5">Ver mis proyectos</button>
        </div>
      ) : (
        <div className="space-y-7">
          {/* total destacado */}
          <div className="homy-glass-featured flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5 sm:p-6">
            {pendientes.length > 0 ? (
              <>
                <div className="homy-num-cell min-w-0 flex-1">
                  <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[#FF5A1F]">Total por pagar</p>
                  <p className="mt-1 font-extrabold leading-none tracking-tight text-[#0A2540]"><span className="homy-num-adapt" style={{ fontSize: 'clamp(1.25rem, 8cqw, 2rem)' }}>{formatARS(totalPendiente)}</span></p>
                  <p className="mt-1.5 text-sm text-slate-500">
                    {pendientes.length} factura{pendientes.length > 1 ? 's' : ''} pendiente{pendientes.length > 1 ? 's' : ''} · Mercado Pago o efectivo
                  </p>
                </div>
                <span className="homy-icon-chip homy-chip-orange size-14 shrink-0 [&_svg]:size-6" aria-hidden><Wallet /></span>
              </>
            ) : (
              <>
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[#0e9f6e]">Todo al día</p>
                  <p className="mt-1 text-[2rem] font-extrabold leading-none tracking-tight text-[#0A2540]">Sin deuda</p>
                  <p className="mt-1.5 text-sm text-slate-500">No tenés facturas pendientes de pago.</p>
                </div>
                <span className="homy-icon-chip homy-chip-mint size-14 shrink-0 [&_svg]:size-6" aria-hidden><CircleCheck /></span>
              </>
            )}
          </div>

          {pendientes.length > 0 && (
            <section>
              <div className="homy-section-head">
                <h2 className="homy-section-title">
                  <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-4" aria-hidden><ReceiptText /></span>
                  Por pagar
                </h2>
                <span className="homy-pill">{pendientes.length}</span>
              </div>
              <div className="space-y-2.5 homy-stagger">
                {pendientes.map((inv) => (
                  <div key={inv.id} className="homy-row homy-lift flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[#0A2540]">{inv.number}</p>
                      {inv.project.title && (
                        <button onClick={() => navigate(`/panel/cliente/proyectos/${inv.project.id}`)} className="homy-focus block max-w-full truncate rounded py-2.5 text-left text-xs font-bold text-[#1D63B8] hover:underline">
                          {inv.project.title}
                        </button>
                      )}
                      <p className="text-xs text-slate-400">Emitida {formatDate(inv.issuedAt)} · mano de obra {formatARS(inv.laborCost)} + materiales {formatARS(inv.materialsCost)}</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3">
                      <p className="text-xl font-extrabold text-[#0A2540] tabular-nums">{formatARS(inv.total)}</p>
                      <button
                        onClick={() => verPdf(inv.id, inv.number)}
                        aria-label={`Ver factura ${inv.number} en PDF`}
                        title="Ver / descargar PDF"
                        className="homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-xl homy-glass-soft px-4 py-3 text-sm font-bold text-[#1D63B8] transition hover:bg-[#1D63B8]/10 sm:py-2.5"
                      >
                        <FileDown className="size-4" aria-hidden /> PDF
                      </button>
                      {inv.paymentMethod === 'efectivo' ? (
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1D63B8]/10 px-3.5 py-2 text-xs font-extrabold text-[#1D63B8]">
                            <Hourglass className="size-3.5" aria-hidden /> Efectivo acordado — esperando confirmación del profesional
                          </span>
                          <button disabled={busy !== null} onClick={() => cashAction(inv, 'cancelar')} className="homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-xl homy-glass-soft px-4 py-3 text-sm font-bold text-slate-500 transition hover:text-red-500 disabled:opacity-60 sm:py-2.5">
                            <Undo2 className="size-4" aria-hidden /> Cancelar acuerdo
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-wrap items-center gap-2">
                          {inv.pro.mpConnected && (
                            <button disabled={busy !== null} onClick={() => payMP(inv)} className="homy-btn-primary min-h-[44px] px-4 py-3 text-sm disabled:opacity-60 sm:py-2.5">
                              {busy === inv.id ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Wallet className="size-4" aria-hidden />} Pagar {formatARSCents(totalWithMp(inv.total))} con Mercado Pago
                            </button>
                          )}
                          <button
                            disabled={busy !== null}
                            onClick={() => cashAction(inv, 'acordar')}
                            title="Acordás pagar en efectivo y el profesional confirma cuando cobra"
                            className="homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-xl homy-glass-soft px-4 py-3 text-sm font-bold text-[#0A2540] transition hover:bg-[#0A2540]/10 disabled:opacity-60 sm:py-2.5"
                          >
                            <Banknote className="size-4" aria-hidden /> Efectivo
                          </button>
                        </div>
                      )}
                    </div>
                    {inv.paymentMethod !== 'efectivo' && (
                      <div className="basis-full">
                        {inv.pro.mpConnected ? <MpFeeBreakdown subtotal={inv.total} className="max-w-sm" /> : <NoMpNotice name={inv.pro.name} />}
                      </div>
                    )}
                  </div>
                ))}
                <p className="homy-glass-soft rounded-xl px-4 py-3 text-xs leading-relaxed text-slate-500">
                  ¿Cómo pagás? Con <span className="font-bold text-[#0A2540]">Mercado Pago</span> la plata va a la cuenta del profesional, el pago queda registrado al instante y se suma el cargo de servicio HomIA (1%). Con <span className="font-bold text-[#0A2540]">Efectivo</span> no hay cargo: el profesional confirma en su panel cuando recibe el dinero y la factura queda pagada.
                </p>
              </div>
            </section>
          )}

          {pagadas.length > 0 && (
            <section>
              <div className="homy-section-head">
                <h2 className="homy-section-title">
                  <span className="homy-icon-chip homy-chip-mint size-9 shrink-0 [&_svg]:size-4" aria-hidden><CircleCheck /></span>
                  Pagadas
                </h2>
                <span className="homy-pill">{pagadas.length}</span>
              </div>
              <div className="space-y-2.5 homy-stagger">
                {pagadas.map((inv) => (
                  // flex-wrap + base 11rem: en el celu monto/PDF/estado bajan de línea en vez de
                  // partir el número de factura en tres renglones
                  <div key={inv.id} className="homy-row flex flex-wrap items-center justify-between gap-3 p-4">
                    <div className="min-w-0 flex-[1_1_11rem]">
                      <p className="font-bold text-[#0A2540]">{inv.number}</p>
                      {inv.project.title && <p className="line-clamp-1 text-xs font-semibold text-slate-500">{inv.project.title}</p>}
                      <p className="text-xs text-slate-400">{formatDate(inv.issuedAt)}{inv.paymentMethod ? ` · ${inv.paymentMethod === 'mercadopago' ? 'Mercado Pago' : 'efectivo'}` : ''}</p>
                      {inv.paymentMethod === 'mercadopago' && <PaidFeeLine subtotal={inv.total} fee={inv.serviceFee || 0} />}
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="font-bold tabular-nums">{formatARS(inv.total)}</p>
                      <button
                        onClick={() => verPdf(inv.id, inv.number)}
                        aria-label={`Ver factura ${inv.number} en PDF`}
                        title="Ver / descargar PDF"
                        className="homy-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-xl homy-glass-soft px-3.5 py-2 text-xs font-bold text-[#1D63B8] transition hover:bg-[#1D63B8]/10"
                      >
                        <FileDown className="size-4" aria-hidden /> PDF
                      </button>
                      <StatusBadge status="pagada" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {invoices.length > 0 && (
        <button onClick={() => navigate('/panel/cliente/proyectos')} className="homy-focus mt-7 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg text-sm font-bold text-[#1D63B8] hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Ver mis proyectos
        </button>
      )}
    </div>
  )
}
