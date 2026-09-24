'use client'
// Devoluciones del profesional (D14, 24/09/2026):
//   · "De mis clientes": sobrantes de materiales que les cobró en su factura (modo pro_adelanta).
//     Él es el vendedor: acepta (todo o parte, con monto), rechaza con motivo, marca recibido y
//     reembolsa (Mercado Pago desde su cuenta si la factura se pagó por MP, o efectivo en mano).
//   · "A mis proveedores": lo que él les pidió devolver (pago por fuera de HomIA): estado y
//     "Recibí el reembolso" cuando el proveedor marca cómo se lo devolvió.
import { useCallback, useEffect, useState } from 'react'
import { useRoute, navigate } from '@/lib/router'
import { toast } from 'sonner'
import { Loading } from '@/components/app/ui-bits'
import { Undo2, Users, Store } from 'lucide-react'
import DevolucionesTab from '../proveedor/devoluciones-tab'
import { RequesterReturnList, type LeftoverReturnRow } from '../sobrantes-section'

type Tab = 'clientes' | 'proveedores'

async function readJson(res: Response): Promise<Record<string, any>> {
  try { return await res.json() } catch { return {} }
}

export default function ProDevoluciones() {
  const route = useRoute()
  // la pestaña sale de la URL: un aviso con ?tab=… la cambia aunque ya estés en esta pantalla
  const tab: Tab = route.query.tab === 'proveedores' ? 'proveedores' : 'clientes'
  const [fromClients, setFromClients] = useState<LeftoverReturnRow[] | null>(null)
  const [toProviders, setToProviders] = useState<LeftoverReturnRow[] | null>(null)
  const [mpConnected, setMpConnected] = useState(false)

  const load = useCallback(async () => {
    try {
      const [resC, resP, resMe] = await Promise.all([
        fetch('/api/returns?role=profesional'),
        fetch('/api/returns?role=solicitante&tipo=profesional_a_proveedor'),
        fetch('/api/profiles/me'),
      ])
      const [dC, dP, dMe] = await Promise.all([readJson(resC), readJson(resP), readJson(resMe)])
      if (!resC.ok || !resP.ok) toast.error(dC.error || dP.error || 'No pudimos cargar tus devoluciones')
      setFromClients(resC.ok ? (dC.returns || []) : [])
      setToProviders(resP.ok ? (dP.returns || []) : [])
      if (resMe.ok) setMpConnected(dMe.user?.professional?.mpOauthStatus === 'connected')
    } catch {
      toast.error('No pudimos conectar. Reintentá')
      setFromClients((p) => p ?? [])
      setToProviders((p) => p ?? [])
    }
  }, [])

  // carga inicial: el setState ocurre después del fetch
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const pendingClients = fromClients ? fromClients.filter((r) => r.status === 'solicitada').length : 0
  const pendingProviders = toProviders ? toProviders.filter((r) => r.status === 'reembolsada' && !r.refundConfirmedAt).length : 0

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Sobrantes</span>
          <h1 className="homy-page-title mt-1.5">Devoluciones</h1>
          <p className="homy-page-sub">
            Si le cobraste los materiales al cliente en tu factura, la devolución de sobrantes es con vos. Y si querés, se los devolvés a tu proveedor.
          </p>
        </div>
      </header>

      <div role="tablist" aria-label="Devoluciones" className="mb-5 flex gap-1 rounded-full bg-white/[0.06] ring-1 ring-[#0A2540]/10 p-1 w-fit max-w-full overflow-x-auto no-scrollbar">
        {(['clientes', 'proveedores'] as const).map((t) => {
          const badge = t === 'clientes' ? pendingClients : pendingProviders
          return (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => navigate(`/panel/profesional/devoluciones?tab=${t}`, { replace: true })}
              className="homy-tab min-h-[44px] shrink-0"
            >
              {t === 'clientes' ? <Users className="size-4" aria-hidden /> : <Store className="size-4" aria-hidden />}
              {t === 'clientes' ? 'De mis clientes' : 'A mis proveedores'}
              {badge > 0 && (
                <span className="homy-badge-pop ml-1 grid size-[18px] place-items-center rounded-full bg-[#FF5A1F] text-[10px] font-extrabold text-white">
                  {badge}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {tab === 'clientes' && (
        <DevolucionesTab viewer="profesional" returns={fromClients} mpConnected={mpConnected} onChanged={() => void load()} />
      )}

      {tab === 'proveedores' && (
        toProviders === null ? <Loading text="Cargando devoluciones…" /> : toProviders.length === 0 ? (
          <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
            <span className="homy-empty-icon homy-chip-mint" aria-hidden><Undo2 className="size-6" /></span>
            <h3 className="font-extrabold tracking-tight text-[#0A2540]">Todavía no le pediste devoluciones a un proveedor</h3>
            <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
              Desde cada proyecto, en Sobrantes, tocá “Pedir devolución a …” para devolverle a tu proveedor lo que le compraste
              (o lo que te devolvió tu cliente). Como le pagaste por fuera de HomIA, te devuelve la plata por fuera y lo marca acá.
            </p>
          </div>
        ) : (
          <section className="homy-glass rounded-3xl p-4 sm:p-5">
            <p className="text-[12.5px] leading-relaxed text-slate-500">
              El proveedor acepta, recibe los materiales y te devuelve la plata por fuera de HomIA (efectivo, transferencia o saldo a favor). Cuando lo marque, confirmá que lo recibiste.
            </p>
            <RequesterReturnList returns={toProviders} onChanged={() => void load()} showOrigin />
          </section>
        )
      )}
    </div>
  )
}
