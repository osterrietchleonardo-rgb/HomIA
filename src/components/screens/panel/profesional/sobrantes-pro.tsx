'use client'
// Sobrantes en el proyecto del profesional (D14, 24/09/2026):
//   · "Tu cliente te pidió devolver": devoluciones de materiales que cobró en su factura
//     (él es el vendedor) → se gestionan en Devoluciones → "De mis clientes".
//   · "Devolver a tus proveedores": un botón "Pedir devolución a <proveedor>" por proveedor con
//     materiales en el proyecto (pago por fuera de HomIA). Si el cliente ya le devolvió
//     sobrantes, el diálogo ofrece precargarlos y deja vinculada la devolución de origen.
//   · En modo "el cliente paga los materiales al proveedor", además puede devolver como comprador
//     (flujo de siempre, <SobrantesSection tipo="cliente">).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Link } from '@/lib/router'
import { formatARS } from '@/lib/format'
import { Loading } from '@/components/app/ui-bits'
import { Undo2, Store, ArrowRight } from 'lucide-react'
import SobrantesSection, {
  ReturnRequestDialog, RequesterReturnList, RETURN_STATUS_META,
  type EligibleItem, type LeftoverReturnRow, type PrefillItem,
} from '../sobrantes-section'

async function readJson(res: Response): Promise<Record<string, any>> {
  try { return await res.json() } catch { return {} }
}

export default function ProSobrantes({ projectId, materialsPaymentMode, autoOpen = false }: {
  projectId: string
  materialsPaymentMode: string
  /** abrir el pedido al proveedor al entrar (link "Devolvérselos a mi proveedor") */
  autoOpen?: boolean
}) {
  const [fromClient, setFromClient] = useState<LeftoverReturnRow[] | null>(null)
  const [toProviders, setToProviders] = useState<LeftoverReturnRow[] | null>(null)
  const [eligible, setEligible] = useState<EligibleItem[] | null>(null)
  const [prefill, setPrefill] = useState<PrefillItem[]>([])
  const [notEligible, setNotEligible] = useState<string | null>(null)
  const [dialogProvider, setDialogProvider] = useState<{ id: string; name: string } | null>(null)
  // "Devolvérselos a mi proveedor": abrir el pedido una sola vez al entrar
  const autoOpened = useRef(false)

  const load = useCallback(async () => {
    try {
      const q = `projectId=${encodeURIComponent(projectId)}`
      const [resC, resP, resE] = await Promise.all([
        fetch(`/api/returns?role=profesional&${q}`),
        fetch(`/api/returns?role=solicitante&tipo=profesional_a_proveedor&${q}`),
        fetch(`/api/returns/eligible?tipo=profesional_a_proveedor&${q}`),
      ])
      const [dC, dP, dE] = await Promise.all([readJson(resC), readJson(resP), readJson(resE)])
      setFromClient(resC.ok ? (dC.returns || []) : [])
      setToProviders(resP.ok ? (dP.returns || []) : [])
      setEligible(resE.ok ? (dE.items || []) : [])
      setPrefill(resE.ok ? (dE.prefill || []) : [])
      setNotEligible(resE.ok ? (dE.notEligibleReason || null) : (dE.error || null))
      if (autoOpen && !autoOpened.current && resE.ok) {
        autoOpened.current = true
        const items: EligibleItem[] = dE.items || []
        const pre: PrefillItem[] = dE.prefill || []
        // el primer proveedor con algo que te devolvió el cliente (o el primero)
        const first = items.find((e) => pre.some((x) => x.materialId === e.materialId)) || items[0]
        if (first) setDialogProvider({ id: first.providerId, name: first.providerName })
      }
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    }
  }, [projectId, autoOpen])

  // carga inicial: el setState ocurre después del fetch
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  // proveedores con materiales que le puede devolver
  const providers = useMemo(() => (eligible
    ? [...new Map(eligible.map((e) => [e.providerId, { id: e.providerId, name: e.providerName }])).values()]
    : []), [eligible])
  // elegibles del proveedor elegido (memo: el diálogo arma borradores cuando cambia la lista)
  const dialogEligible = useMemo(
    () => (dialogProvider && eligible ? eligible.filter((e) => e.providerId === dialogProvider.id) : null),
    [dialogProvider, eligible],
  )

  const loading = fromClient === null || toProviders === null || eligible === null
  const clientPending = (fromClient || []).filter((r) => ['solicitada', 'aceptada', 'aceptada_parcial', 'recibida', 'reembolso_fallido'].includes(r.status)).length

  return (
    <>
      <section className="homy-glass rounded-3xl p-4 sm:p-5" aria-label="Sobrantes">
        <h2 className="homy-section-title">
          <span className="homy-icon-chip homy-chip-mint size-8 [&_svg]:size-4" aria-hidden><Undo2 /></span>
          Sobrantes
        </h2>
        {loading ? <Loading text="Cargando sobrantes…" /> : (
          <>
            {/* devoluciones del cliente (él es el vendedor) */}
            {fromClient!.length > 0 && (
              <div className="mt-3 rounded-2xl bg-[#1D63B8]/6 p-3.5 ring-1 ring-[#1D63B8]/20">
                <p className="text-sm font-extrabold text-[#0A2540]">Tu cliente te pidió devolver sobrantes</p>
                <ul className="mt-1.5 space-y-1">
                  {fromClient!.map((r) => {
                    const meta = RETURN_STATUS_META[r.status] || RETURN_STATUS_META.solicitada
                    const total = r.status === 'solicitada' ? r.items.reduce((a, i) => a + i.unitPricePaid * i.qtyRequested, 0) : r.refundTotal
                    return (
                      <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-slate-600">
                        <span>{r.items.length} ítem{r.items.length === 1 ? '' : 's'} · <b className="tabular-nums text-[#0A2540]">{formatARS(total)}</b></span>
                        <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-extrabold ring-1 ${meta.tone}`}>{meta.label}</span>
                      </li>
                    )
                  })}
                </ul>
                <Link to="/panel/profesional/devoluciones?tab=clientes" className="homy-btn-primary mt-2.5 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-[12.5px]">
                  <ArrowRight className="size-4" aria-hidden /> {clientPending > 0 ? 'Responder en Devoluciones' : 'Ver en Devoluciones'}
                </Link>
              </div>
            )}

            {/* devolver a sus proveedores (pago por fuera de HomIA) */}
            <p className="mt-3 text-[12.5px] leading-relaxed text-slate-500">
              ¿Te sobró material que le compraste a un proveedor para esta obra (o te lo devolvió tu cliente)? Pedile la devolución:
              como le pagaste por fuera de HomIA, te devuelve la plata por fuera (efectivo, transferencia o saldo a favor) y lo marca en la app.
            </p>
            {providers.length > 0 ? (
              <div className="mt-2.5 flex flex-wrap gap-2">
                {providers.map((p) => (
                  <button key={p.id} type="button" onClick={() => setDialogProvider(p)} className="homy-glass-soft inline-flex min-h-[44px] max-w-full items-center gap-1.5 rounded-full px-4 text-[12.5px] font-bold text-[#1D63B8] transition hover:bg-white">
                    <Store className="size-4 shrink-0" aria-hidden /> <span className="truncate">Pedir devolución a {p.name}</span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-2 rounded-xl bg-[#FFC700]/10 px-3 py-2 text-[12.5px] text-slate-600">{notEligible || 'No hay materiales de proveedores para devolver en este proyecto.'}</p>
            )}
            {toProviders!.length > 0 && <RequesterReturnList returns={toProviders!} onChanged={() => void load()} />}
          </>
        )}
      </section>

      {/* modo B: el profesional también puede devolver como comprador (flujo de siempre);
          en modo pro_adelanta solo aparece si tiene devoluciones viejas como comprador */}
      <SobrantesSection projectId={projectId} canRequest={materialsPaymentMode === 'cliente_paga_proveedor'} tipo="cliente" />

      <ReturnRequestDialog
        open={!!dialogProvider}
        onClose={() => setDialogProvider(null)}
        eligible={dialogEligible}
        notEligible={notEligible}
        projectId={projectId}
        tipo="profesional_a_proveedor"
        title={dialogProvider ? `Pedir devolución a ${dialogProvider.name}` : 'Pedir devolución'}
        subtitle="Indicá cuánto le devolvés de cada material, su estado y una foto. El proveedor confirma el monto."
        prefill={prefill}
        onCreated={() => void load()}
      />
    </>
  )
}
