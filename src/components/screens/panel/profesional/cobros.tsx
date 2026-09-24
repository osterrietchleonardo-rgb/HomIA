'use client'
// Cobros del PROFESIONAL: un solo lugar para conectar su Mercado Pago, ver lo
// cobrado y lo pendiente, y seguir TODAS sus facturas (de todos los proyectos):
// descargar el PDF y confirmar los cobros en efectivo. Abajo, los accesos a
// comprar materiales y a sus pedidos.
import { useCallback, useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { Loading } from '@/components/app/ui-bits'
import MpConnectCard from '@/components/app/mp-connect-card'
import { formatARS, formatARSCents, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import {
  Wallet, Hourglass, ReceiptText, FileDown, Banknote, CircleCheck, RefreshCcw, Boxes, ShoppingBag, ArrowRight, CreditCard, Loader2,
} from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type Row = {
  id: string; number: string; issuedAt: string; paidAt: string | null; status: string
  paymentMethod: string | null; laborCost: number; materialsCost: number; total: number; serviceFee: number
  efectivoAcordado: boolean; project: { id: string; title: string }; clientName: string
}
type Resumen = { cobradoMes: number; pendienteTotal: number; pendientesCount: number; efectivoPorConfirmar: number; total: number }
type Filtro = 'pendientes' | 'cobradas' | 'todas'

const FILTROS: { key: Filtro; label: string }[] = [
  { key: 'pendientes', label: 'Pendientes' },
  { key: 'cobradas', label: 'Cobradas' },
  { key: 'todas', label: 'Todas' },
]
const NET_ERROR = 'No pudimos conectar con HomIA. Revisá tu conexión y probá de nuevo.'

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

/** Cómo se cobró (o cómo está por cobrarse) cada factura, en palabras simples. */
function metodo(r: Row): { label: string; tone: string; detail?: string } {
  if (r.status === 'pagada') {
    if (r.paymentMethod === 'mercadopago') {
      return {
        label: 'Cobrada por Mercado Pago', tone: 'bg-emerald-50 text-emerald-700',
        detail: r.serviceFee > 0 ? `Cobraste el 100%: el cargo de servicio HomIA (1%, ${formatARSCents(r.serviceFee)}) lo pagó el cliente aparte.` : 'Cobraste el 100% de la factura.',
      }
    }
    if (r.paymentMethod === 'efectivo') return { label: 'Cobrada en efectivo', tone: 'bg-emerald-50 text-emerald-700', detail: 'Confirmaste que recibiste el dinero.' }
    return { label: 'Pagada', tone: 'bg-emerald-50 text-emerald-700' }
  }
  if (r.efectivoAcordado) return { label: 'Efectivo acordado', tone: 'bg-[#1D63B8]/10 text-[#1D63B8]', detail: 'El cliente eligió pagarte en efectivo. Confirmá cuando recibas el dinero.' }
  if (r.paymentMethod === 'mercadopago') return { label: 'Pago por Mercado Pago en curso', tone: 'bg-amber-50 text-amber-700', detail: 'El cliente inició el pago; se marca cobrada sola cuando Mercado Pago lo aprueba.' }
  return { label: 'Esperando el pago', tone: 'bg-amber-50 text-amber-700', detail: 'El cliente todavía no eligió cómo pagar (Mercado Pago o efectivo).' }
}

export default function ProCobros() {
  const [filtro, setFiltro] = useState<Filtro>('pendientes')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [confirmar, setConfirmar] = useState<Row | null>(null)

  const load = useCallback(async () => {
    setError(null)
    try {
      const res = await fetch('/api/invoices?mine=1&estado=todas')
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'No pudimos cargar tus facturas'); return }
      setRows(d.invoices as Row[])
      setResumen(d.resumen as Resumen)
    } catch {
      setError(NET_ERROR)
    }
  }, [])
  useEffect(() => { void load() }, [load])

  async function confirmarEfectivo(r: Row) {
    setBusy(r.id)
    try {
      const res = await fetch(`/api/invoices/${r.id}/cash`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirmar' }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'No se pudo confirmar el cobro'); return }
      toast.success('Cobro en efectivo confirmado', { description: `${r.number} quedó cobrada. Le avisamos al cliente.` })
      setConfirmar(null)
      await load()
    } catch {
      toast.error(NET_ERROR)
    } finally { setBusy(null) }
  }

  const visibles = (rows || []).filter((r) => filtro === 'todas' || (filtro === 'cobradas' ? r.status === 'pagada' : r.status !== 'pagada'))
  const count = (f: Filtro) => (rows || []).filter((r) => f === 'todas' || (f === 'cobradas' ? r.status === 'pagada' : r.status !== 'pagada')).length

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Plata</span>
          <h1 className="homy-page-title mt-1.5">Cobros</h1>
          <p className="homy-page-sub">Tu Mercado Pago, lo cobrado, lo pendiente y todas tus facturas.</p>
        </div>
      </header>

      <div className="space-y-6">
        {/* 1. conexión de Mercado Pago (el OAuth vuelve a esta pantalla) */}
        <MpConnectCard kind="professional" returnPath="/panel/profesional/cobros" />

        {/* 2. resumen */}
        {error ? (
          <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
            <span className="homy-empty-icon homy-chip-gold" aria-hidden><ReceiptText className="size-6" /></span>
            <h3 className="font-extrabold tracking-tight text-[#0A2540]">No pudimos cargar tus cobros</h3>
            <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{error}</p>
            <button onClick={() => { setRows(null); void load() }} className="homy-btn-primary mt-5 min-h-[44px] px-5 text-sm">
              <RefreshCcw className="size-4" aria-hidden /> Reintentar
            </button>
          </div>
        ) : rows === null || resumen === null ? (
          <Loading text="Cargando tus cobros…" />
        ) : (
          <>
            <section aria-label="Resumen de cobros" className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <div className="homy-glass homy-num-cell rounded-2xl p-4">
                <p className="flex items-center gap-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[#0e9f6e]"><CircleCheck className="size-3.5" aria-hidden /> Cobrado este mes</p>
                <p className="mt-1.5 font-extrabold leading-tight text-[#0A2540]"><span className="homy-num-adapt" style={{ fontSize: 'clamp(1.05rem, 11cqw, 1.75rem)' }}>{formatARS(resumen.cobradoMes)}</span></p>
              </div>
              <div className="homy-glass homy-num-cell rounded-2xl p-4">
                <p className="flex items-center gap-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[#FF5A1F]"><Hourglass className="size-3.5" aria-hidden /> Pendiente de cobro</p>
                <p className="mt-1.5 font-extrabold leading-tight text-[#0A2540]"><span className="homy-num-adapt" style={{ fontSize: 'clamp(1.05rem, 11cqw, 1.75rem)' }}>{formatARS(resumen.pendienteTotal)}</span></p>
              </div>
              <div className="homy-glass col-span-2 rounded-2xl p-4 sm:col-span-1">
                <p className="flex items-center gap-1.5 text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-slate-500"><ReceiptText className="size-3.5" aria-hidden /> Facturas pendientes</p>
                <p className="mt-1.5 text-[1.75rem] font-extrabold leading-tight text-[#0A2540] tabular-nums">{resumen.pendientesCount}</p>
                {resumen.efectivoPorConfirmar > 0 && (
                  <p className="mt-0.5 text-xs font-bold text-[#1D63B8]">{resumen.efectivoPorConfirmar} en efectivo para confirmar</p>
                )}
              </div>
            </section>

            {/* 3. facturas de todos los proyectos */}
            <section aria-labelledby="cobros-facturas">
              <div className="homy-section-head flex-wrap">
                <h2 id="cobros-facturas" className="homy-section-title">
                  <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-4" aria-hidden><Wallet /></span>
                  Tus facturas
                </h2>
                <div role="tablist" aria-label="Filtrar facturas" className="flex flex-wrap gap-1.5">
                  {FILTROS.map((f) => (
                    <button
                      key={f.key}
                      role="tab"
                      aria-selected={filtro === f.key}
                      onClick={() => setFiltro(f.key)}
                      className={`homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm font-bold transition ${
                        filtro === f.key ? 'bg-[#0A2540] text-white' : 'homy-glass-soft text-slate-600 hover:text-[#0A2540]'
                      }`}
                    >
                      {f.label} <span className={`tabular-nums ${filtro === f.key ? 'text-white/70' : 'text-slate-400'}`}>{count(f.key)}</span>
                    </button>
                  ))}
                </div>
              </div>

              {rows.length === 0 ? (
                <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
                  <span className="homy-empty-icon homy-chip-gold" aria-hidden><ReceiptText className="size-6" /></span>
                  <h3 className="font-extrabold tracking-tight text-[#0A2540]">Todavía no emitiste facturas</h3>
                  <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
                    La factura se emite desde cada proyecto cuando terminás el trabajo. Cuando el cliente la pague, la vas a ver acá.
                  </p>
                  <button onClick={() => navigate('/panel/profesional/proyectos')} className="homy-btn-dark mt-5 min-h-[44px] px-5 text-sm">Ver mis proyectos</button>
                </div>
              ) : visibles.length === 0 ? (
                <p className="homy-glass-soft rounded-2xl px-4 py-5 text-center text-sm text-slate-500">
                  {filtro === 'pendientes' ? 'No tenés facturas pendientes de cobro. ¡Todo al día!' : 'No hay facturas cobradas todavía.'}
                </p>
              ) : (
                <ul className="space-y-2.5">
                  {visibles.map((r) => {
                    const m = metodo(r)
                    return (
                      <li key={r.id} className="homy-row flex flex-wrap items-start justify-between gap-3 p-4">
                        <div className="min-w-0 flex-[1_1_16rem]">
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <span className="font-extrabold text-[#0A2540]">{r.number}</span>
                            <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${m.tone}`}>{m.label}</span>
                          </p>
                          <button
                            onClick={() => navigate(`/panel/profesional/proyectos/${r.project.id}`)}
                            className="homy-focus mt-0.5 block min-h-[44px] max-w-full truncate rounded text-left text-sm font-bold text-[#1D63B8] hover:underline"
                          >
                            {r.project.title}
                          </button>
                          <p className="text-xs text-slate-500">
                            Cliente: <b className="font-semibold text-slate-600">{r.clientName}</b> · emitida {formatDate(r.issuedAt)}
                            {r.paidAt ? ` · cobrada ${formatDate(r.paidAt)}` : ''}
                          </p>
                          {m.detail && <p className="mt-1 text-xs leading-relaxed text-slate-500">{m.detail}</p>}
                        </div>
                        <div className="flex flex-wrap items-center gap-2.5">
                          <p className="homy-num text-xl font-extrabold text-[#0A2540]">{formatARS(r.total)}</p>
                          <button
                            onClick={() => verPdf(r.id, r.number)}
                            aria-label={`Descargar la factura ${r.number} en PDF`}
                            className="homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-xl homy-glass-soft px-4 text-sm font-bold text-[#1D63B8] transition hover:bg-[#1D63B8]/10"
                          >
                            <FileDown className="size-4" aria-hidden /> PDF
                          </button>
                          {r.efectivoAcordado && r.status !== 'pagada' && (
                            <button
                              disabled={busy !== null}
                              onClick={() => setConfirmar(r)}
                              className="homy-btn-primary min-h-[44px] px-4 text-sm disabled:opacity-60"
                            >
                              <Banknote className="size-4" aria-hidden /> Confirmar cobro en efectivo
                            </button>
                          )}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </section>
          </>
        )}

        {/* 4. comprar materiales y pedidos */}
        <section aria-label="Materiales" className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <button onClick={() => navigate('/panel/profesional/materiales')} className="homy-glass homy-lift homy-focus flex min-h-[44px] items-center gap-3 rounded-2xl p-4 text-left">
            <span className="homy-icon-chip homy-chip-mint size-11 shrink-0 [&_svg]:size-5" aria-hidden><Boxes /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold text-[#0A2540]">Comprar materiales</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">Buscá entre todos los proveedores y armá tu carrito para tus obras.</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-slate-300" aria-hidden />
          </button>
          <button onClick={() => navigate('/panel/profesional/pedidos')} className="homy-glass homy-lift homy-focus flex min-h-[44px] items-center gap-3 rounded-2xl p-4 text-left">
            <span className="homy-icon-chip homy-chip-blue size-11 shrink-0 [&_svg]:size-5" aria-hidden><ShoppingBag /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold text-[#0A2540]">Mis pedidos</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">Seguí lo que les compraste a los proveedores: pago, preparación y entrega.</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-slate-300" aria-hidden />
          </button>
        </section>

        <p className="flex items-start gap-2 rounded-2xl bg-[#1D63B8]/8 px-4 py-3 text-[12.5px] leading-relaxed text-slate-600">
          <CreditCard className="mt-0.5 size-4 shrink-0 text-[#1D63B8]" aria-hidden />
          Si el cliente paga por Mercado Pago, la plata entra directo en tu cuenta y cobrás el 100% de la factura: el cargo de servicio HomIA del 1% lo paga el cliente aparte. En efectivo no hay cargo.
        </p>
      </div>

      <AlertDialog open={!!confirmar} onOpenChange={(o) => { if (!o && !busy) setConfirmar(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Ya recibiste el efectivo?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirmar ? `Vas a marcar ${confirmar.number} (${formatARS(confirmar.total)}) como cobrada en efectivo. Le avisamos al cliente y no se puede deshacer.` : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Todavía no</AlertDialogCancel>
            <AlertDialogAction disabled={!!busy} onClick={(e) => { e.preventDefault(); if (confirmar) void confirmarEfectivo(confirmar) }}>
              {busy ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Confirmando…</> : 'Sí, lo cobré'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
