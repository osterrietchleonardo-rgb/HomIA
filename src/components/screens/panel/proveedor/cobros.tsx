'use client'
// Cobros de materiales del proveedor al cliente.
// En proyectos con modo "el cliente paga los materiales al proveedor", el
// proveedor emite el cobro por los materiales aprobados y el cliente lo paga
// con Mercado Pago o acuerda efectivo (que el proveedor confirma acá mismo).
import { useEffect, useState } from 'react'
import { StatusBadge, Loading } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import {
  HandCoins, Store, CircleCheck, Hourglass, Banknote, ReceiptText, Info, Wallet,
} from 'lucide-react'

type PendingMaterial = { id: string; name: string; quantity: number; unit: string; unitPrice: number; subtotal: number }
type PendingGroup = {
  projectId: string; projectTitle: string; clientName: string; clientId: string
  materials: PendingMaterial[]; amount: number; bloqueado: boolean
}
type Charge = {
  id: string; number: string; description: string; amount: number; status: string; method: string | null; createdAt: string
  project: { id: string; title: string }
  client: { id: string; displayName: string }
}

export default function ProviderCharges() {
  const [charges, setCharges] = useState<Charge[]>([])
  const [pending, setPending] = useState<PendingGroup[]>([])
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

  useEffect(() => {
    (async () => {
      try { await load() } finally { setLoading(false) }
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

  if (loading) return <Loading />
  const abiertos = charges.filter((c) => c.status !== 'pagada')
  const pagados = charges.filter((c) => c.status === 'pagada')

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Cobranzas</span>
          <h1 className="homy-page-title mt-1.5">Cobros de materiales</h1>
          <p className="homy-page-sub">Cobrale los materiales directamente al cliente en los proyectos acordados así</p>
        </div>
      </header>

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
                  <p className="font-bold text-[#0A2540]">{c.number} · {c.project.title}</p>
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
                  <p className="font-bold text-[#0A2540]">{c.number} · {c.project.title}</p>
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
    </div>
  )
}
