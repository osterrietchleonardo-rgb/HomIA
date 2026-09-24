'use client'
// Mis pedidos (cliente y profesional) — cada pedido del carrito con el avance de
// pago por proveedor: "2 de 3 proveedores pagados · Falta pagar $X". Las compras
// anteriores al carrito aparecen como "Compra anterior". Se usa como pantalla
// (/panel/<rol>/pedidos) y embebida en la solapa "Mis pedidos" de Materiales.
import { useCallback, useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { Loading, EmptyState } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { ShoppingBag, ChevronRight, Store, CircleCheck, Hourglass, Ban } from 'lucide-react'

export type SubOrderLite = {
  id: string; status: string; type: string; total: number; paid: boolean; active: boolean
  provider: { id: string; businessName: string }
  items: { id: string; elementName: string; quantity: number; unit: string }[]
}
export type OrderLite = {
  id: string; number: string; legacy: boolean; createdAt: string
  purchases: SubOrderLite[]
  summary: { providers: number; activeProviders: number; paidProviders: number; pendingAmount: number; total: number; status: 'esperando' | 'en_curso' | 'completo' | 'cerrado' }
}

const ORDER_STATUS: Record<OrderLite['summary']['status'], { label: string; tone: string; icon: typeof Hourglass }> = {
  esperando: { label: 'Esperando a los proveedores', tone: 'text-[#B98A00] bg-[#FFC700]/12 ring-[#FFC700]/35', icon: Hourglass },
  en_curso: { label: 'En curso', tone: 'text-[#1D63B8] bg-[#1D63B8]/10 ring-[#1D63B8]/30', icon: Hourglass },
  completo: { label: 'Completo', tone: 'text-[#0e9f6e] bg-[#0e9f6e]/10 ring-[#0e9f6e]/30', icon: CircleCheck },
  cerrado: { label: 'Sin proveedores activos', tone: 'text-slate-500 bg-slate-500/10 ring-slate-400/30', icon: Ban },
}

/** "2 de 3 proveedores pagados · Falta pagar $X" */
export function paymentLine(s: OrderLite['summary']): string {
  if (s.activeProviders === 0) return 'Ningún proveedor sigue activo en este pedido'
  const base = `${s.paidProviders} de ${s.activeProviders} proveedor${s.activeProviders === 1 ? '' : 'es'} pagado${s.activeProviders === 1 ? '' : 's'}`
  return s.pendingAmount > 0 ? `${base} · Falta pagar ${formatARS(s.pendingAmount)}` : `${base} · Todo pagado`
}

async function fetchOrders(): Promise<{ orders: OrderLite[] } | { error: string }> {
  try {
    const res = await fetch('/api/orders')
    const d = await res.json().catch(() => ({}))
    if (!res.ok) return { error: d.error || 'No pudimos cargar tus pedidos' }
    return { orders: d.orders || [] }
  } catch {
    return { error: 'No pudimos conectar. Reintentá' }
  }
}

export function OrdersList({ role, embedded = false }: { role: 'cliente' | 'profesional'; embedded?: boolean }) {
  const [orders, setOrders] = useState<OrderLite[] | null>(null)
  const [error, setError] = useState(false)

  const apply = useCallback((r: Awaited<ReturnType<typeof fetchOrders>>) => {
    if ('orders' in r) { setOrders(r.orders); setError(false) }
    else { setError(true); toast.error(r.error) }
  }, [])
  const load = useCallback(async () => apply(await fetchOrders()), [apply])
  useEffect(() => {
    let alive = true
    void fetchOrders().then((r) => { if (alive) apply(r) })
    return () => { alive = false }
  }, [apply])

  if (orders === null) {
    return error
      ? <EmptyState icon={<ShoppingBag />} title="No pudimos cargar tus pedidos" hint="Revisá tu conexión y volvé a intentar." action={<button onClick={() => void load()} className="homy-btn-primary min-h-[44px] px-5 text-sm">Reintentar</button>} />
      : <Loading text="Cargando tus pedidos…" />
  }
  if (orders.length === 0) {
    return (
      <EmptyState
        icon={<ShoppingBag />}
        title="Todavía no hiciste pedidos"
        hint="Agregá materiales al carrito (de uno o varios proveedores) y confirmalos: acá seguís cada parte hasta el pago y la entrega."
        action={<button onClick={() => navigate(`/panel/${role}/materiales`)} className="homy-btn-primary min-h-[44px] px-5 text-sm">Buscar materiales</button>}
      />
    )
  }

  return (
    <div className="space-y-3">
      {!embedded && (
        <p className="homy-page-sub -mt-1">Lo que comprás con stock queda reservado al confirmar y lo pagás enseguida (Mercado Pago o efectivo al retirar); lo que reservás lo aprueba cada proveedor. Después retirás y calificás.</p>
      )}
      {orders.map((o) => {
        const meta = ORDER_STATUS[o.summary.status]
        const Icon = meta.icon
        const productos = o.purchases.reduce((a, p) => a + p.items.length, 0)
        return (
          <button
            key={o.id}
            onClick={() => navigate(`/panel/${role}/pedidos/${o.id}`)}
            className="homy-glass homy-lift block w-full rounded-3xl p-4 text-left sm:p-5"
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-[16px] font-extrabold leading-snug text-[#0A2540]">{o.legacy ? 'Compra anterior' : `Pedido ${o.number}`}</p>
                <p className="mt-0.5 text-xs text-slate-500">{formatDate(o.createdAt)} · {productos} producto{productos === 1 ? '' : 's'} · {o.purchases.length} proveedor{o.purchases.length === 1 ? '' : 'es'}</p>
              </div>
              <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold ring-1 ${meta.tone}`}>
                <Icon className="size-3.5" aria-hidden /> {meta.label}
              </span>
            </div>
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {o.purchases.map((p) => (
                <li key={p.id} className={`inline-flex max-w-full items-center gap-1 rounded-full px-2.5 py-1 text-[11.5px] font-bold ${p.paid ? 'bg-[#0e9f6e]/10 text-[#0e9f6e]' : p.active ? 'bg-[#0A2540]/5 text-slate-600' : 'bg-slate-500/8 text-slate-400 line-through'}`}>
                  <Store className="size-3 shrink-0" aria-hidden /><span className="truncate">{p.provider.businessName}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <p className="min-w-0 text-[13px] font-semibold text-slate-600">{paymentLine(o.summary)}</p>
              <ChevronRight className="size-4 shrink-0 text-slate-400" aria-hidden />
            </div>
          </button>
        )
      })}
    </div>
  )
}

export default function OrdersScreen({ role }: { role: 'cliente' | 'profesional' }) {
  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <p className="homy-eyebrow">Materiales</p>
          <h1 className="homy-page-title mt-1.5">Mis pedidos</h1>
          <p className="homy-page-sub">Seguí cada pedido por proveedor: pago de tus compras, aprobación de tus reservas, retiro y reseña. Todo queda registrado.</p>
        </div>
      </header>
      <OrdersList role={role} />
    </div>
  )
}
