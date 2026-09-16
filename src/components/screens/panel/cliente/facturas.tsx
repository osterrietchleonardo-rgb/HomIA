'use client'
// Facturas del cliente + pago Mercado Pago
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatusBadge, Loading, EmptyState } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { Wallet } from 'lucide-react'

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

  return (
    <div className="max-w-3xl">
      <PageHeader title="Facturas" subtitle="Todo lo que tenés que pagar y lo ya pagado" />

      {invoices.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-6">
          <EmptyState icon="🧾" title="Sin facturas todavía"
            hint="Cuando tu profesional emita la factura del proyecto (materiales + mano de obra con detalle), la pagás acá con Mercado Pago." />
        </div>
      ) : (
        <>
          {pendientes.length > 0 && (
            <section className="mb-6">
              <h2 className="font-extrabold text-[#0A2540] mb-3">Por pagar ({pendientes.length})</h2>
              <div className="space-y-2">
                {pendientes.map((inv) => (
                  <div key={inv.id} className="rounded-2xl bg-white border border-slate-200 p-4 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-[#0A2540]">{inv.number}</p>
                      <p className="text-xs text-slate-400">Emitida {formatDate(inv.issuedAt)} · mano de obra {formatARS(inv.laborCost)} + materiales {formatARS(inv.materialsCost)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="text-xl font-extrabold text-[#0A2540]">{formatARS(inv.total)}</p>
                      <button disabled={busy} onClick={() => pay(inv)} className="rounded-xl bg-[#009EE3] hover:bg-[#0082bb] text-white text-sm font-bold px-4 py-2.5 transition flex items-center gap-2">
                        <Wallet className="size-4" /> Pagar con Mercado Pago
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
          {pagadas.length > 0 && (
            <section>
              <h2 className="font-extrabold text-[#0A2540] mb-3">Pagadas ({pagadas.length})</h2>
              <div className="space-y-2">
                {pagadas.map((inv) => (
                  <div key={inv.id} className="rounded-2xl bg-white border border-emerald-200 p-4 flex items-center justify-between gap-3">
                    <div>
                      <p className="font-bold text-[#0A2540]">{inv.number}</p>
                      <p className="text-xs text-slate-400">{formatDate(inv.issuedAt)}</p>
                    </div>
                    <div className="flex items-center gap-3">
                      <p className="font-bold">{formatARS(inv.total)}</p>
                      <StatusBadge status="pagada" />
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
      <button onClick={() => navigate('/panel/cliente/proyectos')} className="mt-6 text-sm font-bold text-[#1D63B8] hover:underline">← Ver mis proyectos</button>
    </div>
  )
}
