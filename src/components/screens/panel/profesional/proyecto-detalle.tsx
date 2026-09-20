'use client'
// Detalle de proyecto (vista profesional): etapas, propuesta de materiales, alternativas, cuentas de retiro y facturación
import { useEffect, useState } from 'react'
import { navigate, Link } from '@/lib/router'
import { StatusBadge, Loading, UAvatar } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import {
  ArrowRight, Receipt, Truck, Plus, RefreshCcw, Phone, Mail, ArrowLeft,
  FolderOpen, Package, ClipboardPen, CircleX, History, Check, FileText, CircleCheck,
  Store, Banknote, Hourglass,
} from 'lucide-react'
import ReviewForm from '../review-form'
import { ClientSummaryButton } from '@/components/app/client-summary'

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
type Invoice = { id: string; number: string; total: number; status: string; issuedAt: string; paymentMethod: string | null }
type RetiroLink = {
  id: string; accountLabel: string; notes: string | null; active: boolean
  provider: { id: string; businessName: string; city: string | null }
}
type Project = {
  id: string; title: string; description: string | null; stage: string; status: string
  laborCost: number; materialsCost: number; materialsPaymentMode: string; createdAt: string
  urgency?: string | null; address?: string | null; deadline?: string | null; photos?: string[]
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
  // reseña 360°: ¿ya califiqué al cliente en este proyecto?
  const [reviewedClient, setReviewedClient] = useState(false)

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
      const fresh = res.ok ? await res.json() : null
      if (fresh) setData(fresh)
      const resRev = await fetch(`/api/reviews?mine=1&projectId=${id}`)
      if (resRev.ok && fresh) {
        const d = await resRev.json()
        setReviewedClient((d.reviews || []).some((r: { targetUserId: string }) => r.targetUserId === fresh.project.client.id))
      }
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
      toast.success(stage === 'finalizado' ? '¡Obra finalizada!' : 'Etapa actualizada')
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
      toast.success(`Factura ${d.invoice.number} emitida`, { description: `Total: ${formatARS(d.invoice.total)} — el cliente la paga con Mercado Pago o en efectivo.` })
      load()
    } finally { setBusy(false) }
  }

  async function setMaterialsMode(mode: 'pro_adelanta' | 'cliente_paga_proveedor') {
    setBusy(true)
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialsPaymentMode: mode }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      toast.success('Modo actualizado — el cliente lo ve en su panel')
      load()
    } finally { setBusy(false) }
  }

  async function confirmCash(inv: Invoice) {
    setBusy(true)
    try {
      const res = await fetch(`/api/invoices/${inv.id}/cash`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirmar' }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      toast.success(`Cobro de ${inv.number} confirmado — factura pagada`)
      load()
    } finally { setBusy(false) }
  }

  if (loading) return <Loading />
  if (!data) return (
    <div className="homy-page">
      <div>
        <Empty
          icon={<FolderOpen className="size-7" />}
          title="Proyecto no encontrado"
          hint="Puede que el proyecto no exista o que no tengas acceso."
          action={<button onClick={() => navigate('/panel/profesional/proyectos')} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm">Volver a mis proyectos</button>}
        />
      </div>
    </div>
  )

  const p = data.project
  const stageIdx = STAGES.indexOf(p.stage)
  const nextStage = stageIdx >= 0 && stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null
  const proposed = data.materials.filter((m) => m.status === 'propuesto')
  const rejected = data.materials.filter((m) => m.status === 'rechazado')
  const others = data.materials.filter((m) => m.status === 'aprobado' || m.status === 'reemplazado')
  const selectedElement = catalog.flatMap((c) => c.elements).find((e) => e.id === elementId)
  const total = p.laborCost + p.materialsCost
  const progress = stageIdx > 0 ? Math.round((stageIdx / (STAGES.length - 1)) * 100) : 0

  return (
    <div className="homy-page">
      <div>
        <Link to="/panel/profesional/proyectos"
          className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 hover:text-[#1D63B8] transition-colors mb-3">
          <ArrowLeft className="size-3.5" aria-hidden /> Volver a mis proyectos
        </Link>

        {/* Encabezado */}
        <header className="homy-page-head">
          <div className="min-w-0">
            <span className="homy-eyebrow">Proyecto · {STAGE_LABEL[p.stage] || p.stage}</span>
            <h1 className="homy-page-title mt-1.5">{p.title}</h1>
            <p className="homy-page-sub">Para {p.client.displayName} · creado el {formatDate(p.createdAt)}</p>
          </div>
        </header>

        {/* brief de la contratación (si vino del wizard del directorio) */}
        {(p.urgency || p.address || p.deadline || (p.photos && p.photos.length > 0)) && (
          <div className="homy-glass rounded-3xl p-4 sm:p-5 mb-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-extrabold text-[#0A2540]">
                <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><FileText /></span>
                Brief del cliente
              </p>
              {p.urgency && (
                <span className="homy-pill">{({ ya: 'Lo antes posible', esta_semana: 'Próximas semanas', normal: 'Fecha flexible' } as Record<string, string>)[p.urgency] || p.urgency}</span>
              )}
            </div>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {p.deadline && (
                <div className="homy-glass-soft rounded-xl px-4 py-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Fecha deseada</p>
                  <p className="mt-0.5 text-sm font-bold text-[#0A2540]">{formatDate(p.deadline)}</p>
                </div>
              )}
              {p.address && (
                <div className="homy-glass-soft rounded-xl px-4 py-3">
                  <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Dirección del trabajo</p>
                  <p className="mt-0.5 text-sm font-bold text-[#0A2540]">{p.address}</p>
                </div>
              )}
            </div>
            {p.photos && p.photos.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {p.photos.map((ph, i) => (
                  <img key={ph} src={ph} alt={`Foto ${i + 1} del brief del cliente`} className="h-20 w-20 rounded-xl object-cover ring-1 ring-[#0A2540]/10" />
                ))}
              </div>
            )}
          </div>
        )}

        {/* etapas */}
        <div className="homy-glass rounded-3xl p-5 mb-5">
          <div className="homy-progress mb-4" role="img" aria-label={`Progreso del proyecto: etapa ${STAGE_LABEL[p.stage] || p.stage}`}>
            <i style={{ width: `${progress}%` }} />
          </div>
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex gap-1.5 flex-wrap items-center">
              {STAGES.map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition ${p.stage === s ? 'bg-gradient-to-br from-[#103455] to-[#0A2540] text-white shadow-lg shadow-[#0A2540]/25 ring-1 ring-[#00C4FF]/35' : stageIdx > i ? 'bg-emerald-100 text-emerald-700' : 'homy-glass-soft text-slate-400'}`}>
                    {stageIdx > i && <Check className="size-3" aria-hidden />}
                    {STAGE_LABEL[s]}
                  </span>
                  {i < STAGES.length - 1 && <ArrowRight className="size-3 text-slate-300 shrink-0" aria-hidden />}
                </div>
              ))}
            </div>
            {p.status !== 'finalizado' && (
              <div className="flex gap-2 flex-wrap">
                {nextStage && nextStage !== 'finalizado' && (
                  <button disabled={busy} onClick={() => setStage(nextStage)} className="homy-btn-primary min-h-[44px] px-4 py-2 text-sm disabled:opacity-50">
                    Avanzar a {STAGE_LABEL[nextStage]}
                  </button>
                )}
                {(p.stage === 'revision' || p.stage === 'ejecucion') && (
                  <button disabled={busy} onClick={() => setStage('finalizado')} className="homy-btn-dark min-h-[44px] px-4 py-2 text-sm disabled:opacity-50">
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

        {/* cliente + contacto + reputación del cliente (reseñas que recibió de otros pros) */}
        <div className="homy-glass rounded-3xl p-4 sm:p-5 mb-5 flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <UAvatar name={p.client.displayName} url={p.client.avatarUrl} size={46} />
            <div className="min-w-0">
              <p className="font-bold text-[#0A2540] line-clamp-1">{p.client.displayName}</p>
              <p className="text-xs text-slate-500">Tu cliente en este proyecto</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <ClientSummaryButton userId={p.client.id} label="Ver reputación" />
            {p.client.phone && (
              <a href={`tel:${p.client.phone}`} className="homy-glass-soft rounded-full px-4 py-2.5 min-h-[44px] text-sm font-bold text-[#0A2540] transition hover:text-[#1D63B8] flex items-center gap-1.5">
                <Phone className="size-4" aria-hidden /> {p.client.phone}
              </a>
            )}
            {p.client.email && (
              <a href={`mailto:${p.client.email}`} className="homy-glass-soft rounded-full px-4 py-2.5 min-h-[44px] text-sm font-bold text-[#0A2540] transition hover:text-[#1D63B8] flex items-center gap-1.5">
                <Mail className="size-4" aria-hidden /> Email
              </a>
            )}
          </div>
        </div>

        {/* quién paga los materiales: modo elegido por el profesional, visible para el cliente */}
        <div className="homy-glass rounded-3xl p-5 mb-5" aria-label="Modo de pago de materiales">
          <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-1">
            <span className="homy-icon-chip homy-chip-ai size-8 [&_svg]:size-4" aria-hidden><Store /></span>
            ¿Quién paga los materiales?
          </h2>
          <p className="text-xs text-slate-400 mb-3">Elegí cómo van a circular los materiales: el cliente ve esta configuración en su panel.</p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <button
              onClick={() => p.materialsPaymentMode !== 'pro_adelanta' && setMaterialsMode('pro_adelanta')}
              disabled={busy || p.status !== 'activo'}
              aria-pressed={p.materialsPaymentMode === 'pro_adelanta'}
              className={`homy-focus rounded-2xl p-4 text-left transition ${p.materialsPaymentMode === 'pro_adelanta' ? 'bg-gradient-to-br from-[#1D63B8]/15 to-[#00C4FF]/10 ring-2 ring-[#1D63B8]/50' : 'homy-glass-soft hover:ring-1 hover:ring-[#1D63B8]/30 disabled:opacity-60'}`}
            >
              <p className="flex items-center gap-1.5 text-sm font-extrabold text-[#0A2540]">
                {p.materialsPaymentMode === 'pro_adelanta' && <Check className="size-4 text-[#1D63B8]" aria-hidden />}
                Los adelanto yo y los cobro en la factura
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Vos comprás los materiales, se los llevás y los cobrás junto con tu mano de obra al finalizar.</p>
            </button>
            <button
              onClick={() => p.materialsPaymentMode !== 'cliente_paga_proveedor' && setMaterialsMode('cliente_paga_proveedor')}
              disabled={busy || p.status !== 'activo'}
              aria-pressed={p.materialsPaymentMode === 'cliente_paga_proveedor'}
              className={`homy-focus rounded-2xl p-4 text-left transition ${p.materialsPaymentMode === 'cliente_paga_proveedor' ? 'bg-gradient-to-br from-[#1D63B8]/15 to-[#00C4FF]/10 ring-2 ring-[#1D63B8]/50' : 'homy-glass-soft hover:ring-1 hover:ring-[#1D63B8]/30 disabled:opacity-60'}`}
            >
              <p className="flex items-center gap-1.5 text-sm font-extrabold text-[#0A2540]">
                {p.materialsPaymentMode === 'cliente_paga_proveedor' && <Check className="size-4 text-[#1D63B8]" aria-hidden />}
                El cliente paga los materiales al proveedor
              </p>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">Vos gestionás los materiales con el proveedor y el cliente se los paga directamente. Tu factura cubre solo mano de obra.</p>
            </button>
          </div>
        </div>

        {/* formulario de materiales */}
        {p.status !== 'finalizado' && (
          <div className="homy-glass rounded-3xl p-5 mb-5">
            <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-1">
              <span className="homy-icon-chip homy-chip-orange size-8 [&_svg]:size-4" aria-hidden><Plus /></span>
              Proponer material al cliente
            </h2>
            <p className="text-sm text-slate-500 mb-4">Elegí del catálogo estándar; si un proveedor lo tiene en stock, te autocompletamos el mejor precio.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Material (catálogo estándar)</span>
                <select value={elementId} onChange={(e) => setElementId(e.target.value)}
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm cursor-pointer">
                  <option value="">Elegí un material…</option>
                  {catalog.map((c) => (
                    <optgroup key={c.slug} label={c.name}>
                      {c.elements.map((el) => <option key={el.id} value={el.id}>{el.name}</option>)}
                    </optgroup>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                  Proveedor {loadingStock && <RefreshCcw className="inline size-3 animate-spin text-[#00C4FF]" aria-hidden />}
                </span>
                <select value={providerId} onChange={(e) => {
                  setProviderId(e.target.value)
                  const stock = stockOptions.find((s) => s.providerId === e.target.value)
                  if (stock) setUnitPrice(String(stock.price))
                }} disabled={!elementId || stockOptions.length === 0}
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm cursor-pointer disabled:text-slate-400">
                  <option value="">Sin proveedor (compro por mi cuenta)</option>
                  {stockOptions.map((s) => (
                    <option key={s.stockId} value={s.providerId}>
                      {s.providerName} — {formatARS(s.price)}/{selectedElement?.unit || 'u'} (stock {s.quantity})
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Cantidad {selectedElement ? `(${selectedElement.unit})` : ''}</span>
                <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm tabular-nums" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Precio unitario (ARS)</span>
                <input type="number" min="0" step="any" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm tabular-nums" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Nota para el cliente (opcional)</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: marca recomendada, alternativa más duradera…"
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" />
              </label>
            </div>
            <div className="flex items-center justify-between mt-4 flex-wrap gap-2">
              <p className="text-sm font-bold text-[#0A2540] tabular-nums">
                Subtotal: {formatARS((parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0))}
              </p>
              <button disabled={busy} onClick={proposeMaterial} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50">
                Proponer al cliente
              </button>
            </div>
          </div>
        )}

        {/* propuestos (esperando cliente) */}
        {proposed.length > 0 && (
          <div className="homy-glass homy-glass-featured rounded-3xl p-5 mb-5">
            <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-3">
              <span className="homy-icon-chip homy-chip-gold size-8 [&_svg]:size-4" aria-hidden><ClipboardPen /></span>
              Esperando aprobación del cliente ({proposed.length})
            </h2>
            <div className="space-y-2">
              {proposed.map((m) => (
                <div key={m.id} className="rounded-2xl homy-glass p-4 flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0A2540]">{m.name}</p>
                    <p className="text-sm text-slate-500 tabular-nums">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}{m.providerName ? ` · ${m.providerName}` : ' · sin proveedor'}</p>
                    {m.note && <p className="text-xs text-slate-400 mt-1">{m.note}</p>}
                  </div>
                  <div className="text-right shrink-0">
                    <p className="text-lg font-extrabold text-[#0A2540] tabular-nums">{formatARS(m.subtotal)}</p>
                    <div className="mt-1"><StatusBadge status={m.status} /></div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* rechazados → sugerir alternativa */}
        {rejected.length > 0 && (
          <div className="rounded-3xl border border-red-100 bg-red-50 p-5 mb-5">
            <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-3">
              <span className="homy-icon-chip homy-chip-orange size-8 [&_svg]:size-4" aria-hidden><CircleX /></span>
              Rechazados por el cliente ({rejected.length})
            </h2>
            <div className="space-y-3">
              {rejected.map((m) => (
                <div key={m.id} className="rounded-2xl border border-red-100 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-bold text-[#0A2540]">{m.name}</p>
                      <p className="text-sm text-slate-500 tabular-nums">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}</p>
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <StatusBadge status={m.status} />
                      {altFor !== m.id && (
                        <button onClick={() => { setAltFor(m.id); setAltName(m.name); setAltQty(String(m.quantity)); setAltPrice('') }}
                          className="rounded-full border-2 border-[#1D63B8] text-[#1D63B8] hover:bg-[#1D63B8] hover:text-white text-sm font-bold px-4 py-2 min-h-[44px] transition">
                          Sugerir alternativa más barata
                        </button>
                      )}
                    </div>
                  </div>
                  {altFor === m.id && (
                    <div className="mt-3 rounded-2xl homy-glass p-4 grid gap-3 sm:grid-cols-3">
                      <label className="block sm:col-span-3">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Alternativa</span>
                        <input value={altName} onChange={(e) => setAltName(e.target.value)} placeholder="Nombre del material alternativo"
                          className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Cantidad ({m.unit})</span>
                        <input type="number" min="0" step="any" value={altQty} onChange={(e) => setAltQty(e.target.value)}
                          className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm tabular-nums" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Precio unitario</span>
                        <input type="number" min="0" step="any" value={altPrice} onChange={(e) => setAltPrice(e.target.value)} placeholder={`antes ${m.unitPrice}`}
                          className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm tabular-nums" />
                      </label>
                      <div className="flex items-end gap-2 flex-wrap">
                        <button disabled={busy} onClick={() => suggestAlternative(m)} className="homy-btn-dark min-h-[44px] px-4 py-2.5 text-sm disabled:opacity-50">
                          Enviar alternativa
                        </button>
                        <button onClick={() => setAltFor(null)} className="homy-glass-soft rounded-full min-h-[44px] text-slate-500 text-sm font-bold px-4 py-2.5 hover:text-red-500 transition">
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
          <div className="homy-glass rounded-3xl p-5 mb-5">
            <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-3">
              <span className="homy-icon-chip homy-chip-blue size-8 [&_svg]:size-4" aria-hidden><History /></span>
              Historial de materiales
            </h2>
            <div className="divide-y divide-[#0A2540]/6">
              {others.map((m) => (
                <div key={m.id} className="py-2.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-[#0A2540] line-clamp-1">{m.name}</p>
                    <p className="text-xs text-slate-400 tabular-nums">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}{m.providerName ? ` · ${m.providerName}` : ''}</p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <StatusBadge status={m.status} />
                    <p className="text-sm font-bold tabular-nums">{formatARS(m.subtotal)}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* cuentas de retiro vinculadas */}
        <div className="homy-glass rounded-3xl p-5 mb-5">
          <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-1">
            <span className="homy-icon-chip homy-chip-ai size-8 [&_svg]:size-4" aria-hidden><Truck /></span>
            Cuentas de retiro vinculadas
          </h2>
          <p className="text-sm text-slate-500 mb-3">Con estas cuentas podés retirar materiales en los proveedores y se facturan a este proyecto.</p>
          {data.links.length === 0 ? (
            <p className="text-sm text-slate-500">
              Todavía no tenés cuentas de retiro activas con los proveedores de este proyecto.{' '}
              <Link to="/panel/profesional/vinculaciones" className="text-[#1D63B8] font-bold hover:underline">Vinculame acá</Link>.
            </p>
          ) : (
            <div className="space-y-2">
              {data.links.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl homy-glass-soft p-3.5">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0A2540] font-mono text-sm line-clamp-1">{l.accountLabel}</p>
                    <p className="text-xs text-slate-400 line-clamp-1">Proveedor: {l.provider.businessName}{l.provider.city ? ` · ${l.provider.city}` : ''}</p>
                  </div>
                  <StatusBadge status={l.active ? 'activo' : 'cerrado'} label={l.active ? 'activa' : 'inactiva'} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* facturación */}
        <div className="homy-glass rounded-3xl p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight">
              <span className="homy-icon-chip homy-chip-navy size-8 [&_svg]:size-4" aria-hidden><Receipt /></span>
              Facturas ({data.invoices.length})
            </h2>
            {p.status !== 'finalizado' && (
              <button disabled={busy} onClick={issueInvoice} className="homy-btn-dark min-h-[44px] px-4 py-2.5 text-sm disabled:opacity-50">
                Emitir factura
              </button>
            )}
          </div>
          <p className="text-xs text-slate-400 mb-3">
            {p.materialsPaymentMode === 'cliente_paga_proveedor'
              ? 'Facturás solo tu mano de obra: los materiales los paga el cliente directamente a cada proveedor (cobros aparte).'
              : 'La factura incluye los materiales aprobados + mano de obra.'}{' '}
            El cliente elige pagar con Mercado Pago (respaldado) o en efectivo (vos confirmás cuando lo cobrás).
          </p>
          {data.invoices.length === 0 ? (
            <div className="homy-glass-soft rounded-xl p-4 flex items-center gap-2 text-sm text-slate-500">
              <Package className="size-4 shrink-0 text-slate-400" aria-hidden />
              Todavía no emitiste facturas para este proyecto.
            </div>
          ) : (
            <div className="space-y-2">
              {data.invoices.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl homy-glass-soft p-3.5">
                  <div>
                    <p className="font-bold text-[#0A2540] font-mono text-sm">{inv.number}</p>
                    <p className="text-xs text-slate-400">{formatDate(inv.issuedAt)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-3">
                    <p className="font-extrabold tabular-nums">{formatARS(inv.total)}</p>
                    {inv.status === 'pendiente' && inv.paymentMethod === 'efectivo' && (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1D63B8]/10 px-3 py-1.5 text-[11px] font-extrabold text-[#1D63B8]">
                        <Hourglass className="size-3" aria-hidden /> Efectivo acordado
                      </span>
                    )}
                    {inv.status === 'pendiente' && inv.paymentMethod === 'efectivo' ? (
                      <button disabled={busy} onClick={() => confirmCash(inv)} className="homy-btn-primary min-h-[40px] px-3.5 py-2 text-xs">
                        <Banknote className="mr-1 inline size-4" aria-hidden /> Confirmar cobro en efectivo
                      </button>
                    ) : (
                      <StatusBadge status={inv.status} />
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* reseña 360°: el profesional califica al cliente cuando la obra termina */}
      {p.stage === 'finalizado' && (
        reviewedClient ? (
          <section className="homy-glass mt-5 flex flex-wrap items-center gap-3 rounded-3xl p-5">
            <span className="homy-icon-chip homy-chip-mint size-10 shrink-0 [&_svg]:size-5" aria-hidden><CircleCheck /></span>
            <div className="min-w-0 flex-1">
              <h2 className="text-base font-extrabold tracking-tight text-[#0A2540]">Ya calificaste a {p.client.displayName}</h2>
              <p className="text-sm text-slate-500">Gracias por dejar tu reseña: así la comunidad conoce cómo fue trabajar con este cliente.</p>
            </div>
          </section>
        ) : (
          <div className="mt-5">
            <ReviewForm
              targetUserId={p.client.id}
              targetName={p.client.displayName}
              targetLabel="al cliente"
              projectId={id}
              onDone={load}
            />
          </div>
        )
      )}
    </div>
  )
}

function MiniStat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl homy-glass-soft px-4 py-3">
      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-[0.12em]">{label}</p>
      <p className={`text-lg font-extrabold tabular-nums ${accent ? 'text-[#FF5A1F]' : 'text-[#0A2540]'}`}>{value}</p>
    </div>
  )
}

/* Estado vacío diseñado: icono flotante + copy + acción */
function Empty({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
      <span className="homy-empty-icon homy-chip-blue" aria-hidden>{icon}</span>
      <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">{title}</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
