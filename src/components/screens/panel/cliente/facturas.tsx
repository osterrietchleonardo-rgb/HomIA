'use client'
// Facturas del cliente + pago Mercado Pago
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, Loading } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { Wallet, ReceiptText, CircleCheck, ArrowLeft, FileDown } from 'lucide-react'

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

type Invoice = { id: string; number: string; total: number; status: string; issuedAt: string; laborCost: number; materialsCost: number }
type Project = { id: string; title: string }

export default function ClientInvoices() {
  const [invoices, setInvoices] = useState<(Invoice & { project?: Project })[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      try {
        // facturas de todos mis proyectos como cliente
        const resP = await fetch('/api/projects?role=cliente')
        if (resP.ok) {
          const projects = (await resP.json()).asClient as { id: string; invoices: Invoice[] }[]
          const all = projects.flatMap((p) => p.invoices.map((inv) => ({ ...inv, projectId: p.id })))
          // detalle por factura (para número de proyecto)
          setInvoices(all.map((i) => ({ ...i, project: { id: i.projectId, title: '' } })))
        }
      } finally { setLoading(false) }
    })()
  }, [])

  async function pay(inv: Invoice) {
    setBusy(true)
    try {
      const res = await fetch(`/api/invoices/${inv.id}`, { method: 'POST' })
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
          <p className="homy-page-sub">Todo lo que tenés que pagar y lo ya pagado</p>
        </div>
      </header>

      {invoices.length === 0 ? (
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <span className="homy-empty-icon homy-chip-gold" aria-hidden><ReceiptText className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">Sin facturas todavía</h3>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">
            Cuando tu profesional emita la factura del proyecto (materiales + mano de obra con detalle), la pagás acá con Mercado Pago.
          </p>
          <button onClick={() => navigate('/panel/cliente/proyectos')} className="homy-btn-dark mt-5 px-5 py-3 text-sm sm:py-2.5">Ver mis proyectos</button>
        </div>
      ) : (
        <div className="space-y-7">
          {/* total destacado */}
          <div className="homy-glass-featured flex flex-wrap items-center justify-between gap-4 rounded-3xl p-5 sm:p-6">
            {pendientes.length > 0 ? (
              <>
                <div className="min-w-0">
                  <p className="text-[0.68rem] font-extrabold uppercase tracking-[0.14em] text-[#FF5A1F]">Total por pagar</p>
                  <p className="mt-1 text-[2rem] font-extrabold leading-none tracking-tight text-[#0A2540] tabular-nums">{formatARS(totalPendiente)}</p>
                  <p className="mt-1.5 text-sm text-slate-500">
                    {pendientes.length} factura{pendientes.length > 1 ? 's' : ''} pendiente{pendientes.length > 1 ? 's' : ''} · pagás con Mercado Pago
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
                    <div className="min-w-0">
                      <p className="font-bold text-[#0A2540]">{inv.number}</p>
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
                      <button disabled={busy} onClick={() => pay(inv)} className="homy-btn-primary px-4 py-3 text-sm sm:py-2.5">
                        <Wallet className="size-4" aria-hidden /> Pagar con Mercado Pago
                      </button>
                    </div>
                  </div>
                ))}
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
                  <div key={inv.id} className="homy-row flex items-center justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <p className="font-bold text-[#0A2540]">{inv.number}</p>
                      <p className="text-xs text-slate-400">{formatDate(inv.issuedAt)}</p>
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
        <button onClick={() => navigate('/panel/cliente/proyectos')} className="homy-focus mt-7 inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-[#1D63B8] hover:underline">
          <ArrowLeft className="size-4" aria-hidden /> Ver mis proyectos
        </button>
      )}
    </div>
  )
}
