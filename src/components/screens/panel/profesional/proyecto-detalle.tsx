'use client'
// Detalle de proyecto (vista profesional): etapas, propuesta de materiales, alternativas, cuentas de retiro y facturación
import { useEffect, useState } from 'react'
import { navigate, Link } from '@/lib/router'
import { PageHeader, StatusBadge, Loading, EmptyState, UAvatar } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { ArrowRight, Receipt, Truck, Plus, RefreshCcw, Phone, Mail } from 'lucide-react'

const STAGES = ['presupuesto', 'materiales', 'ejecucion', 'revision', 'finalizado']
const STAGE_LABEL: Record<string, string> = {
  presupuesto: 'Presupuesto',
  materiales: 'Materiales',
  ejecucion: 'Ejecución',
  revision: 'Revisión',
  finalizado: 'Finalizado',
}

type Material = {
  id: string; name: string; elementId: string | null; elementName: string
  unit: string; quantity: number; unitPrice: number; subtotal: number
  status: string; note: string | null; providerId: string | null; providerName: string | null; createdAt: string
}
type Invoice = { id: string; number: string; total: number; status: string; issuedAt: string }
type RetiroLink = {
  id: string; accountLabel: string; notes: string | null; active: boolean
  provider: { id: string; businessName: string; city: string | null }
}
type Project = {
  id: string; title: string; description: string | null; stage: string; status: string
  laborCost: number; materialsCost: number; createdAt: string
  job: { id: string; title: string } | null
  client: { id: string; displayName: string; avatarUrl: string | null; phone: string | null; email: string | null }
  professional: { id: string; displayName: string; personType: string }
}
type CatalogElement = { id: string; name: string; unit: string }
type CatalogCategory = { slug: string; name: string; elements: CatalogElement[] }
type ComparableStock = {
  stockId: string; price: number; quantity: number; status: string
  providerId: string; providerName: string; providerCity: string | null
}

export default function ProProjectDetail({ id }: { id: string }) {
  const [data, setData] = useState<{ project: Project; role: string; materials: Material[]; links: RetiroLink[]; invoices: Invoice[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // formulario de material
  const [catalog, setCatalog] = useState<CatalogCategory[]>([])
  const [elementId, setElementId] = useState('')
  const [providerId, setProviderId] = useState('')
  const [quantity, setQuantity] = useState('1')
  const [unitPrice, setUnitPrice] = useState('')
  const [note, setNote] = useState('')
  const [stockOptions, setStockOptions] = useState<ComparableStock[]>([])
  const [loadingStock, setLoadingStock] = useState(false)

  // alternativa para material rechazado
  const [altFor, setAltFor] = useState<string | null>(null)
  const [altName, setAltName] = useState('')
  const [altQty, setAltQty] = useState('1')
  const [altPrice, setAltPrice] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/projects/${id}`)
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/catalog')
      if (res.ok) setCatalog((await res.json()).categories || [])
    })()
  }, [])

  // al elegir elemento, traemos stock de proveedores para autocompletar el mejor precio
  useEffect(() => {
    setProviderId('')
    setStockOptions([])
    if (!elementId) return
    setLoadingStock(true)
    ;(async () => {
      try {
        const res = await fetch(`/api/comparables?elementId=${elementId}`)
        if (res.ok) {
          const d = await res.json()
          const results: ComparableStock[] = d.results || []
          setStockOptions(results)
          if (d.best) setUnitPrice(String(d.best.price))
        }
      } finally { setLoadingStock(false) }
    })()
  }, [elementId])

  async function setStage(stage: string) {
    setBusy(true)
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ stage }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      toast.success(stage === 'finalizado' ? '¡Obra finalizada! 🎉' : 'Etapa actualizada')
      load()
    } finally { setBusy(false) }
  }

  async function proposeMaterial() {
    const qty = parseFloat(quantity)
    const price = parseFloat(unitPrice)
    if (!elementId) { toast.error('Elegí un material del catálogo'); return }
    if (!qty || qty <= 0) { toast.error('Indicá una cantidad válida'); return }
    if (!price || price <= 0) { toast.error('Indicá un precio unitario válido'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/projects/${id}/materials`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementId, providerId: providerId || undefined, quantity: qty, unitPrice: price, note: note || undefined }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      toast.success('Material propuesto — el cliente lo va a aprobar')
      setElementId(''); setProviderId(''); setQuantity('1'); setUnitPrice(''); setNote(''); setStockOptions([])
      load()
    } finally { setBusy(false) }
  }

  async function suggestAlternative(original: Material) {
    const qty = parseFloat(altQty)
    const price = parseFloat(altPrice)
    if (!altName.trim()) { toast.error('Indicá el nombre de la alternativa'); return }
    if (!qty || qty <= 0) { toast.error('Cantidad inválida'); return }
    if (!price || price <= 0) { toast.error('Precio inválido'); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/projects/${id}/materials`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          materialId: original.id, action: 'reemplazar',
          replacement: { elementId: original.elementId || undefined, name: altName.trim(), quantity: qty, unitPrice: price },
        }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      toast.success('Alternativa enviada al cliente')
      setAltFor(null); setAltName(''); setAltQty('1'); setAltPrice('')
      load()
    } finally { setBusy(false) }
  }

  async function issueInvoice() {
    setBusy(true)
    try {
      const res = await fetch(`/api/projects/${id}/invoice`, { method: 'POST' })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      toast.success(`Factura ${d.invoice.number} emitida`, { description: `Total: ${formatARS(d.invoice.total)} — el cliente la paga con Mercado Pago.` })
      load()
    } finally { setBusy(false) }
  }

  if (loading) return <Loading />
  if (!data) return <EmptyState icon="📁" title="Proyecto no encontrado" hint="Puede que el proyecto no exista o que no tengas acceso." action={<button onClick={() => navigate('/panel/profesional/proyectos')} className="rounded-xl bg-[#FF5A1F] text-white font-bold px-5 py-2.5">Volver a mis proyectos</button>} />

  const p = data.project
  const stageIdx = STAGES.indexOf(p.stage)
  const nextStage = stageIdx >= 0 && stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null
  const proposed = data.materials.filter((m) => m.status === 'propuesto')
  const rejected = data.materials.filter((m) => m.status === 'rechazado')
  const others = data.materials.filter((m) => m.status === 'aprobado' || m.status === 'reemplazado')
  const selectedElement = catalog.flatMap((c) => c.elements).find((e) => e.id === elementId)
  const total = p.laborCost + p.materialsCost

  return (
    <div className="max-w-4xl">
      <PageHeader title={p.title} subtitle={`Proyecto para ${p.client.displayName} · creado el ${formatDate(p.createdAt)}`} />

      {/* etapas */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-5 shadow-sm">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div className="flex gap-2 flex-wrap">
            {STAGES.map((s, i) => (
              <div key={s} className="flex items-center gap-2">
                <span className={`rounded-full px-3 py-1 text-xs font-bold ${p.stage === s ? 'bg-[#1D63B8] text-white' : stageIdx > i ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-400'}`}>
                  {STAGE_LABEL[s]}
                </span>
                {i < STAGES.length - 1 && <ArrowRight className="size-3 text-slate-300" />}
              </div>
            ))}
          </div>
          {p.status !== 'finalizado' && (
            <div className="flex gap-2">
              {nextStage && nextStage !== 'finalizado' && (
                <button disabled={busy} onClick={() => setStage(nextStage)} className="rounded-xl bg-[#1D63B8] hover:bg-[#175096] text-white text-sm font-bold px-4 py-2 transition disabled:opacity-50">
                  Avanzar a {STAGE_LABEL[nextStage]}
                </button>
              )}
              {(p.stage === 'revision' || p.stage === 'ejecucion') && (
                <button disabled={busy} onClick={() => setStage('finalizado')} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2 transition disabled:opacity-50">
                  Finalizar obra
                </button>
              )}
            </div>
          )}
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 mt-4">
          <MiniStat label="Mano de obra" value={formatARS(p.laborCost)} />
          <MiniStat label="Materiales aprobados" value={formatARS(p.materialsCost)} />
          <MiniStat label="Total del proyecto" value={formatARS(total)} accent />
        </div>
      </div>

      {/* cliente + contacto */}
      <div className="rounded-2xl bg-white border border-slate-200 p-4 mb-5 shadow-sm flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3">
          <UAvatar name={p.client.displayName} url={p.client.avatarUrl} size={46} />
          <div>
            <p className="font-bold text-[#0A2540]">{p.client.displayName}</p>
            <p className="text-xs text-slate-500">Tu cliente en este proyecto</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {p.client.phone && (
            <a href={`tel:${p.client.phone}`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-[#0A2540] hover:border-[#1D63B8] transition flex items-center gap-1.5">
              <Phone className="size-4" /> {p.client.phone}
            </a>
          )}
          {p.client.email && (
            <a href={`mailto:${p.client.email}`} className="rounded-xl border border-slate-300 px-4 py-2 text-sm font-bold text-[#0A2540] hover:border-[#1D63B8] transition flex items-center gap-1.5">
              <Mail className="size-4" /> Email
            </a>
          )}
        </div>
      </div>

      {/* formulario de materiales */}
      {p.status !== 'finalizado' && (
        <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-5 shadow-sm">
          <h2 className="font-extrabold text-[#0A2540] mb-1 flex items-center gap-2"><Plus className="size-5 text-[#FF5A1F]" /> Proponer material al cliente</h2>
          <p className="text-sm text-slate-500 mb-4">Elegí del catálogo estándar; si un proveedor lo tiene en stock, te autocompletamos el mejor precio.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase">Material (catálogo estándar)</span>
              <select value={elementId} onChange={(e) => setElementId(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8] cursor-pointer">
                <option value="">Elegí un material…</option>
                {catalog.map((c) => (
                  <optgroup key={c.slug} label={c.name}>
                    {c.elements.map((el) => <option key={el.id} value={el.id}>{el.name}</option>)}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase">
                Proveedor {loadingStock && <RefreshCcw className="inline size-3 animate-spin text-[#00C4FF]" />}
              </span>
              <select value={providerId} onChange={(e) => {
                setProviderId(e.target.value)
                const stock = stockOptions.find((s) => s.providerId === e.target.value)
                if (stock) setUnitPrice(String(stock.price))
              }} disabled={!elementId || stockOptions.length === 0}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8] cursor-pointer disabled:bg-slate-50 disabled:text-slate-400">
                <option value="">Sin proveedor (compro por mi cuenta)</option>
                {stockOptions.map((s) => (
                  <option key={s.stockId} value={s.providerId}>
                    {s.providerName} — {formatARS(s.price)}/{selectedElement?.unit || 'u'} (stock {s.quantity})
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase">Cantidad {selectedElement ? `(${selectedElement.unit})` : ''}</span>
              <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase">Precio unitario (ARS)</span>
              <input type="number" min="0" step="any" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Nota para el cliente (opcional)</span>
              <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: marca recomendada, alternativa más duradera…"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
            </label>
          </div>
          <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
            <p className="text-sm font-bold text-[#0A2540]">
              Subtotal: {formatARS((parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0))}
            </p>
            <button disabled={busy} onClick={proposeMaterial} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white font-bold px-5 py-2.5 transition disabled:opacity-50">
              Proponer al cliente
            </button>
          </div>
        </div>
      )}

      {/* propuestos (esperando cliente) */}
      {proposed.length > 0 && (
        <div className="rounded-3xl border-2 border-amber-300 bg-amber-50/50 p-5 mb-5">
          <h2 className="font-extrabold text-[#0A2540] mb-3">Esperando aprobación del cliente ({proposed.length})</h2>
          <div className="space-y-2">
            {proposed.map((m) => (
              <div key={m.id} className="rounded-2xl bg-white border border-amber-200 p-4 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-bold text-[#0A2540]">{m.name}</p>
                  <p className="text-sm text-slate-500">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}{m.providerName ? ` · ${m.providerName}` : ' · sin proveedor'}</p>
                  {m.note && <p className="text-xs text-slate-400 mt-1">{m.note}</p>}
                </div>
                <div className="text-right">
                  <p className="text-lg font-extrabold text-[#0A2540]">{formatARS(m.subtotal)}</p>
                  <StatusBadge status={m.status} />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* rechazados → sugerir alternativa */}
      {rejected.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-5 shadow-sm">
          <h2 className="font-extrabold text-[#0A2540] mb-3">Rechazados por el cliente ({rejected.length})</h2>
          <div className="space-y-3">
            {rejected.map((m) => (
              <div key={m.id} className="rounded-2xl border border-red-100 bg-red-50/40 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-bold text-[#0A2540]">{m.name}</p>
                    <p className="text-sm text-slate-500">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={m.status} />
                    {altFor !== m.id && (
                      <button onClick={() => { setAltFor(m.id); setAltName(m.name); setAltQty(String(m.quantity)); setAltPrice('') }}
                        className="rounded-xl border border-[#1D63B8] text-[#1D63B8] hover:bg-[#1D63B8] hover:text-white text-sm font-bold px-4 py-2 transition">
                        Sugerir alternativa más barata
                      </button>
                    )}
                  </div>
                </div>
                {altFor === m.id && (
                  <div className="mt-3 rounded-xl bg-white border border-slate-200 p-4 grid gap-3 sm:grid-cols-3">
                    <label className="block sm:col-span-3">
                      <span className="text-xs font-semibold text-slate-500 uppercase">Alternativa</span>
                      <input value={altName} onChange={(e) => setAltName(e.target.value)} placeholder="Nombre del material alternativo"
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-500 uppercase">Cantidad ({m.unit})</span>
                      <input type="number" min="0" step="any" value={altQty} onChange={(e) => setAltQty(e.target.value)}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
                    </label>
                    <label className="block">
                      <span className="text-xs font-semibold text-slate-500 uppercase">Precio unitario</span>
                      <input type="number" min="0" step="any" value={altPrice} onChange={(e) => setAltPrice(e.target.value)} placeholder={`antes ${m.unitPrice}`}
                        className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
                    </label>
                    <div className="flex items-end gap-2">
                      <button disabled={busy} onClick={() => suggestAlternative(m)} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-bold px-4 py-2.5 transition disabled:opacity-50">
                        Enviar alternativa
                      </button>
                      <button onClick={() => setAltFor(null)} className="rounded-xl border border-slate-300 text-slate-500 text-sm font-bold px-4 py-2.5 hover:border-red-300 transition">
                        Cancelar
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* aprobados / reemplazados */}
      {others.length > 0 && (
        <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-5 shadow-sm">
          <h2 className="font-extrabold text-[#0A2540] mb-3">Historial de materiales</h2>
          <div className="divide-y divide-slate-100">
            {others.map((m) => (
              <div key={m.id} className="py-2.5 flex items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-[#0A2540] truncate">{m.name}</p>
                  <p className="text-xs text-slate-400">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}{m.providerName ? ` · ${m.providerName}` : ''}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <StatusBadge status={m.status} />
                  <p className="text-sm font-bold">{formatARS(m.subtotal)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* cuentas de retiro vinculadas */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-5 shadow-sm">
        <h2 className="font-extrabold text-[#0A2540] mb-1 flex items-center gap-2"><Truck className="size-5 text-[#1D63B8]" /> Cuentas de retiro vinculadas</h2>
        <p className="text-sm text-slate-500 mb-3">Con estas cuentas podés retirar materiales en los proveedores y se facturan a este proyecto.</p>
        {data.links.length === 0 ? (
          <p className="text-sm text-slate-500">
            Todavía no tenés cuentas de retiro activas con los proveedores de este proyecto.{' '}
            <Link to="/panel/profesional/vinculaciones" className="text-[#1D63B8] font-bold hover:underline">Vinculame acá</Link>.
          </p>
        ) : (
          <div className="space-y-2">
            {data.links.map((l) => (
              <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3.5">
                <div>
                  <p className="font-bold text-[#0A2540]">{l.accountLabel}</p>
                  <p className="text-xs text-slate-400">Proveedor: {l.provider.businessName}{l.provider.city ? ` · ${l.provider.city}` : ''}</p>
                </div>
                <StatusBadge status={l.active ? 'activo' : 'cerrado'} label={l.active ? 'activa' : 'inactiva'} />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* facturación */}
      <div className="rounded-2xl bg-white border border-slate-200 p-5 mb-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <h2 className="font-extrabold text-[#0A2540] flex items-center gap-2"><Receipt className="size-5 text-[#1D63B8]" /> Facturas ({data.invoices.length})</h2>
          {p.status !== 'finalizado' && (
            <button disabled={busy} onClick={issueInvoice} className="rounded-xl bg-[#0A2540] hover:bg-[#0d3357] text-white text-sm font-bold px-4 py-2.5 transition disabled:opacity-50">
              Emitir factura
            </button>
          )}
        </div>
        <p className="text-xs text-slate-400 mb-3">La factura incluye los materiales aprobados + mano de obra. El cliente la paga con Mercado Pago desde su panel.</p>
        {data.invoices.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no emitiste facturas para este proyecto.</p>
        ) : (
          <div className="space-y-2">
            {data.invoices.map((inv) => (
              <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 p-3.5">
                <div>
                  <p className="font-bold text-[#0A2540]">{inv.number}</p>
                  <p className="text-xs text-slate-400">{formatDate(inv.issuedAt)}</p>
                </div>
                <div className="flex items-center gap-3">
                  <p className="font-extrabold">{formatARS(inv.total)}</p>
                  <StatusBadge status={inv.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-slate-50 px-4 py-3">
      <p className="text-xs text-slate-400 font-semibold uppercase">{label}</p>
      <p className={`text-lg font-extrabold ${accent ? 'text-[#FF5A1F]' : 'text-[#0A2540]'}`}>{value}</p>
    </div>
  )
}
