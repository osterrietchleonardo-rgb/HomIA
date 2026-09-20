'use client'
// Cobros de materiales + Ventas directas del proveedor.
// · Cobros: proyectos con modo "el cliente paga los materiales al proveedor" —
//   el proveedor emite el cobro y el cliente paga con Mercado Pago o efectivo.
// · Ventas: pedidos directos del marketplace (sin proyecto) — aceptar → entregar
//   (emite el cobro) → el cliente paga → deja reseña.
import { useEffect, useState } from 'react'
import { useRoute, navigate } from '@/lib/router'
import { StatusBadge, Loading, UAvatar, VerifyBadge } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import {
  HandCoins, Store, CircleCheck, Hourglass, Banknote, ReceiptText, Info, Wallet,
  ShoppingBag, Truck, Undo2, MessageCircle,
} from 'lucide-react'
import { ClientSummaryButton } from '@/components/app/client-summary'

type PendingMaterial = { id: string; name: string; quantity: number; unit: string; unitPrice: number; subtotal: number }
type PendingGroup = {
  projectId: string; projectTitle: string; clientName: string; clientId: string
  materials: PendingMaterial[]; amount: number; bloqueado: boolean
}
type Charge = {
  id: string; number: string; description: string; amount: number; status: string; method: string | null; createdAt: string
  project: { id: string; title: string } | null
  client: { id: string; displayName: string }
}
type Sale = {
  id: string; elementName: string; quantity: number; unit: string; total: number; status: string
  note: string | null; chargeId: string | null; createdAt: string
  client: { id: string; displayName: string; avatarUrl: string | null; verificationStatus: string }
}

export default function ProviderCharges() {
  const route = useRoute()
  const [tab, setTab] = useState<'cobros' | 'ventas'>(route.query.tab === 'ventas' ? 'ventas' : 'cobros')
  const [charges, setCharges] = useState<Charge[]>([])
  const [pending, setPending] = useState<PendingGroup[]>([])
  const [sales, setSales] = useState<Sale[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function load() {
    const res = await fetch('/api/provider/charges')
    if (res.ok) {
      const d = await res.json()
      setCharges(d.charges || [])
      setPending(d.pending || [])
    }
  }

  async function loadSales() {
    const res = await fetch('/api/purchases?as=proveedor')
    if (res.ok) setSales((await res.json()).purchases || [])
  }

  useEffect(() => {
    (async () => {
      try {
        await load()
        await loadSales()
      } finally { setLoading(false) }
    })()
  }, [])

  async function emitCharge(projectId: string) {
    setBusy(true)
    try {
      const res = await fetch('/api/provider/charges', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      toast.success(`Cobro ${d.charge.number} emitido`, { description: 'El cliente lo ve en su proyecto y elige cómo pagarlo.' })
      load()
    } finally { setBusy(false) }
  }

  async function confirmCash(chargeId: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/charges/${chargeId}`, { method: 'PATCH' })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      toast.success('Cobro confirmado: quedó registrado como pagado')
      load()
    } finally { setBusy(false) }
  }

  async function saleAction(saleId: string, action: 'aceptar' | 'entregar' | 'cancelar', total?: number) {
    setBusy(true)
    try {
      const res = await fetch(`/api/purchases/${saleId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(total != null ? { action, total } : { action }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.needsPrice) {
          const inp = prompt('Este pedido se pidió sin precio (a coordinar). Ingresá el precio final acordado en $:', '')
          if (inp && parseFloat(inp) > 0) { setBusy(false); return saleAction(saleId, action, parseFloat(inp)) }
          toast.info('Necesitás el precio final para emitir el cobro. Coordinalo por chat.')
          return
        }
        if (d.needsPlan) {
          toast.error(d.error, { description: 'Elegí tu plan en la sección Mi plan.' })
          return
        }
        toast.error(d.error)
        return
      }
      if (action === 'aceptar') toast.success('Pedido aceptado', { description: 'El cliente lo ve en Mis compras. Cuando esté listo, marcalo como entregado.' })
      if (action === 'entregar') toast.success(`Pedido entregado — cobro ${d.charge?.number || ''} emitido`, { description: 'El cliente paga con Mercado Pago o efectivo, como elija.' })
      if (action === 'cancelar') toast.info('Pedido cancelado')
      load()
      loadSales()
    } finally { setBusy(false) }
  }

  if (loading) return <Loading />
  const abiertos = charges.filter((c) => c.status !== 'pagada')
  const pagados = charges.filter((c) => c.status === 'pagada')

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Ventas y cobranzas</span>
          <h1 className="homy-page-title mt-1.5">Cobros y ventas</h1>
          <p className="homy-page-sub">Cobrale materiales al cliente en proyectos, y gestioná los pedidos directos que te hacen desde el marketplace</p>
        </div>
      </header>

      <div role="tablist" aria-label="Secciones de cobros" className="mb-5 flex gap-1 rounded-full bg-white/[0.06] ring-1 ring-[#0A2540]/10 p-1 w-fit max-w-full overflow-x-auto no-scrollbar">
        {(['cobros', 'ventas'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => { setTab(t); navigate(t === 'ventas' ? '/panel/proveedor/cobros?tab=ventas' : '/panel/proveedor/cobros', { replace: true }) }}
            className="homy-tab shrink-0"
          >
            {t === 'cobros' ? <HandCoins className="size-4" aria-hidden /> : <ShoppingBag className="size-4" aria-hidden />}
            {t === 'cobros' ? 'Cobros de proyectos' : 'Ventas directas'}
            {t === 'ventas' && sales && sales.some((s2) => ['solicitado', 'aceptado'].includes(s2.status)) && (
              <span className="homy-badge-pop ml-1 grid size-[18px] place-items-center rounded-full bg-[#FF5A1F] text-[10px] font-extrabold text-white">
                {sales.filter((s2) => ['solicitado', 'aceptado'].includes(s2.status)).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'cobros' && (
        <>
          {pending.length === 0 && charges.length === 0 && (
            <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
              <span className="homy-empty-icon homy-chip-ai" aria-hidden><HandCoins className="size-6" /></span>
              <h3 className="font-extrabold tracking-tight text-[#0A2540]">Sin cobros por ahora</h3>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
                Cuando un profesional incluya tus materiales en un proyecto con modo <span className="font-bold">“el cliente paga al proveedor”</span> y el cliente los apruebe, vas a poder emitir el cobro acá.
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
                      <p className="text-xl font-extrabold text-[#0A2540] tabular-nums">{formatARS(g.amount)}</p>
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
                      <p className="font-extrabold tabular-nums">{formatARS(c.amount)}</p>
                      {c.status === 'pendiente' ? (
                        <>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-3 py-1.5 text-[11px] font-extrabold text-slate-500">
                            <Wallet className="size-3.5" aria-hidden /> Esperando pago del cliente
                          </span>
                          <StatusBadge status="pendiente" />
                        </>
                      ) : (
                        <>
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1D63B8]/10 px-3 py-1.5 text-[11px] font-extrabold text-[#1D63B8]">
                            <Banknote className="size-3.5" aria-hidden /> Efectivo acordado
                          </span>
                          <button disabled={busy} onClick={() => confirmCash(c.id)} className="homy-btn-primary px-4 py-2 text-sm">
                            <CircleCheck className="mr-1 inline size-4" aria-hidden /> Confirmar cobro
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
                        {c.client.displayName} · cobrado {formatDate(c.createdAt)}{c.method ? ` · ${c.method === 'efectivo' ? 'en efectivo' : 'Mercado Pago'}` : ''}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-3">
                      <p className="font-bold tabular-nums">{formatARS(c.amount)}</p>
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
              <h3 className="font-extrabold tracking-tight text-[#0A2540]">Todavía no tenés pedidos directos</h3>
              <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
                Los clientes pueden pedirte insumos desde la sección <b>Materiales</b> de su panel, sin proyecto de por medio. Cuando llegue el primero, lo gestionás acá: aceptar → entregar → cobrar → reseña.
              </p>
            </div>
          ) : (
            <>
              <p className="homy-page-sub -mt-2 mb-4">Así funciona un pedido directo: lo aceptás → lo entregás (se emite el cobro al cliente) → te lo paga (Mercado Pago o efectivo) → te califica. Mirá la reputación del cliente antes de aceptar.</p>
              <div className="space-y-3">
                {sales.map((v) => {
                  const meta = v.status === 'solicitado' ? { label: 'Pedido nuevo', tone: 'bg-[#FFC700]/12 text-[#B98A00] ring-[#FFC700]/40' }
                    : v.status === 'aceptado' ? { label: 'Aceptado — preparalo', tone: 'bg-[#1D63B8]/10 text-[#1D63B8] ring-[#1D63B8]/30' }
                    : v.status === 'entregado' ? { label: 'Entregado — esperando pago', tone: 'bg-[#FF5A1F]/10 text-[#FF5A1F] ring-[#FF5A1F]/30' }
                    : v.status === 'pagado' ? { label: 'Pagado', tone: 'bg-[#0e9f6e]/10 text-[#0e9f6e] ring-[#0e9f6e]/30' }
                    : { label: 'Cancelado', tone: 'bg-slate-500/10 text-slate-500 ring-slate-400/30' }
                  return (
                    <article key={v.id} className="homy-row homy-lift p-4">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="flex min-w-0 items-start gap-3">
                          <UAvatar name={v.client.displayName} url={v.client.avatarUrl} size={42} />
                          <div className="min-w-0">
                            <p className="flex flex-wrap items-center gap-x-1.5 text-[15px] font-extrabold text-[#0A2540] leading-snug">
                              {v.elementName} × {v.quantity} {v.unit}
                            </p>
                            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-slate-500">
                              {v.client.displayName}
                              <VerifyBadge status={v.client.verificationStatus} />
                              · {formatDate(v.createdAt)}
                              {v.note ? ` · “${v.note}”` : ''}
                            </p>
                            <ClientSummaryButton userId={v.client.id} label="Reputación del cliente" />
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="homy-num-adapt text-lg font-extrabold text-[#0A2540] tabular-nums">{v.total > 0 ? formatARS(v.total) : 'A coordinar'}</p>
                          <span className={`mt-1 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold ring-1 ${meta.tone}`}>
                            {meta.label}
                          </span>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {v.status === 'solicitado' && (
                          <>
                            <button disabled={busy} onClick={() => saleAction(v.id, 'aceptar')} className="homy-btn-primary px-4 py-2 text-sm disabled:opacity-50">
                              <CircleCheck className="mr-1 inline size-4" aria-hidden /> Aceptar pedido
                            </button>
                            <button disabled={busy} onClick={() => saleAction(v.id, 'cancelar')} className="homy-glass-soft px-4 py-2 text-sm font-bold text-slate-500 hover:text-red-600 rounded-full transition">
                              <Undo2 className="mr-1 inline size-4" aria-hidden /> Rechazar
                            </button>
                          </>
                        )}
                        {v.status === 'aceptado' && (
                          <button disabled={busy} onClick={() => saleAction(v.id, 'entregar')} className="homy-btn-primary px-4 py-2 text-sm disabled:opacity-50">
                            <Truck className="mr-1 inline size-4" aria-hidden /> Entregado — emitir cobro
                          </button>
                        )}
                        {v.status === 'entregado' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-500/10 px-4 py-2 text-xs font-extrabold text-slate-500">
                            <Wallet className="size-3.5" aria-hidden /> Esperando que el cliente pague ({v.chargeId ? 'cobro emitido' : 'sin cobro'})
                          </span>
                        )}
                        {v.status === 'pagado' && (
                          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0e9f6e]/10 px-4 py-2 text-xs font-extrabold text-[#0e9f6e]">
                            <CircleCheck className="size-3.5" aria-hidden /> Venta cobrada — el cliente puede calificarte
                          </span>
                        )}
                        <button onClick={() => navigate(`/mensajes?c=nuevo:${v.client.id}`)} className="homy-glass-soft ml-auto inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-[#1D63B8] transition hover:bg-white">
                          <MessageCircle className="size-3.5" aria-hidden /> Chatear
                        </button>
                      </div>
                    </article>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}
