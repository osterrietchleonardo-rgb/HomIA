'use client'
// Detalle de proyecto (vista profesional): cotización de mano de obra, etapas, propuesta de
// materiales (combobox difuso sobre el catálogo), alternativas, cuentas de retiro y facturación.
import { useEffect, useState } from 'react'
import { navigate, Link, useRoute } from '@/lib/router'
import { StatusBadge, Loading, UAvatar, VerifyBadge } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { matchScore } from '@/lib/search-match'
import { toast } from 'sonner'
import {
  ArrowRight, Receipt, Truck, Plus, RefreshCcw, Phone, Mail, ArrowLeft,
  FolderOpen, Package, ClipboardPen, CircleX, History, Check, FileText, CircleCheck,
  Store, Banknote, Hourglass, Search, MessageSquare, Loader2, FileDown, Trash2, HandCoins, Info,
} from 'lucide-react'
import { ClientSummaryButton } from '@/components/app/client-summary'
import ReviewForm from '@/components/screens/panel/review-form'
import ProSobrantes from '@/components/screens/panel/profesional/sobrantes-pro'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'

const STAGES = ['presupuesto', 'materiales', 'ejecucion', 'revision', 'finalizado']
const STAGE_LABEL: Record<string, string> = {
  presupuesto: 'Presupuesto',
  materiales: 'Materiales',
  ejecucion: 'Ejecución',
  revision: 'Revisión',
  finalizado: 'Finalizado',
}
const NET_ERROR = 'No pudimos conectar con HomIA. Revisá tu conexión y probá de nuevo.'

type Material = {
  id: string; name: string; elementId: string | null; elementName: string
  unit: string; quantity: number; unitPrice: number; subtotal: number
  status: string; note: string | null; providerId: string | null; providerName: string | null
  invoicedAt: string | null; createdAt: string
}
type Invoice = { id: string; number: string; total: number; status: string; issuedAt: string; paymentMethod: string | null; laborCost: number; materialsCost: number }
type RetiroLink = {
  id: string; accountLabel: string; notes: string | null; active: boolean
  provider: { id: string; businessName: string; city: string | null }
}
type Project = {
  id: string; title: string; description: string | null; stage: string; status: string
  laborCost: number; budgetMin: number | null; budgetMax: number | null; materialsCost: number
  materialsPaymentMode: string; conversationId: string | null; createdAt: string
  urgency?: string | null; address?: string | null; deadline?: string | null; photos?: string[]
  job: { id: string; title: string } | null
  client: { id: string; displayName: string; avatarUrl: string | null; phone: string | null; email: string | null; verificationStatus?: string }
  professional: { id: string; displayName: string; personType: string }
}
type Data = { project: Project; role: string; materials: Material[]; links: RetiroLink[]; invoices: Invoice[] }
type CatalogElement = { id: string; name: string; unit: string; aliases: string[]; description: string | null }
type CatalogCategory = { slug: string; name: string; elements: CatalogElement[] }
type ComparableStock = {
  stockId: string; price: number; quantity: number; status: string
  providerId: string; providerName: string; providerCity: string | null
}

async function readJson(res: Response): Promise<Record<string, unknown> & { error?: string }> {
  try { return await res.json() } catch { return {} }
}

export default function ProProjectDetail({ id }: { id: string }) {
  const route = useRoute()
  const [data, setData] = useState<Data | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  // una acción en curso a la vez, identificada por clave (no bloquea toda la pantalla)
  const [busy, setBusy] = useState<string | null>(null)
  // reseña 360°: ¿ya califiqué al cliente en este proyecto?
  const [reviewedClient, setReviewedClient] = useState(false)

  // cotización de mano de obra
  const [laborInput, setLaborInput] = useState('')
  // cancelación con motivo
  const [cancelOpen, setCancelOpen] = useState(false)
  const [cancelReason, setCancelReason] = useState('')

  // formulario de material (combobox difuso sobre el catálogo)
  const [catalog, setCatalog] = useState<CatalogCategory[]>([])
  const [elemQuery, setElemQuery] = useState('')
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
    setError(null)
    try {
      const res = await fetch(`/api/projects/${id}`)
      const d = await readJson(res)
      if (!res.ok) { setError(d.error || 'No pudimos cargar el proyecto'); return }
      const fresh = d as unknown as Data
      setData(fresh)
      setLaborInput(fresh.project.laborCost > 0 ? String(fresh.project.laborCost) : '')
      const resRev = await fetch(`/api/reviews?mine=1&projectId=${id}`)
      if (resRev.ok) {
        const r = await readJson(resRev)
        setReviewedClient(((r.reviews as { targetUserId: string }[] | undefined) || []).some((x) => x.targetUserId === fresh.project.client.id))
      }
    } catch {
      setError(NET_ERROR)
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [id])

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/catalog')
        if (res.ok) setCatalog(((await readJson(res)).categories as CatalogCategory[] | undefined) || [])
      } catch {
        toast.error('No pudimos cargar el catálogo de materiales')
      }
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
          const d = await readJson(res)
          const results = (d.results as ComparableStock[] | undefined) || []
          setStockOptions(results)
          const best = d.best as { price: number } | null | undefined
          if (best) setUnitPrice(String(best.price))
        }
      } catch {
        toast.error('No pudimos consultar el stock de los proveedores')
      } finally { setLoadingStock(false) }
    })()
  }, [elementId])

  async function patchProject(body: Record<string, unknown>, key: string, okMsg: string) {
    setBusy(key)
    try {
      const res = await fetch(`/api/projects/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No se pudo actualizar el proyecto'); return false }
      toast.success(okMsg)
      load()
      return true
    } catch {
      toast.error(NET_ERROR)
      return false
    } finally { setBusy(null) }
  }

  async function quoteLabor() {
    const amount = parseFloat(laborInput)
    if (!amount || amount <= 0) { toast.error('Indicá un monto de mano de obra mayor a 0'); return }
    await patchProject({ laborCost: amount }, 'labor', `Mano de obra cotizada: ${formatARS(amount)}. El cliente ya lo ve.`)
  }

  async function cancelProject() {
    if (cancelReason.trim().length < 3) { toast.error('Contá brevemente el motivo'); return }
    const okd = await patchProject({ status: 'cancelado', cancelReason: cancelReason.trim() }, 'cancelar', 'Proyecto cancelado: el cliente ya fue avisado')
    if (okd) { setCancelOpen(false); setCancelReason('') }
  }

  async function proposeMaterial() {
    const qty = parseFloat(quantity)
    const price = parseFloat(unitPrice)
    if (!elementId) { toast.error('Elegí un material del catálogo'); return }
    if (!qty || qty <= 0) { toast.error('Indicá una cantidad válida'); return }
    if (!price || price <= 0) { toast.error('Indicá un precio unitario válido'); return }
    setBusy('propose')
    try {
      const res = await fetch(`/api/projects/${id}/materials`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementId, providerId: providerId || null, quantity: qty, unitPrice: price, note: note || undefined }),
      })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No se pudo proponer el material'); return }
      toast.success('Material propuesto: el cliente lo va a aprobar')
      setElementId(''); setElemQuery(''); setProviderId(''); setQuantity('1'); setUnitPrice(''); setNote(''); setStockOptions([])
      load()
    } catch {
      toast.error(NET_ERROR)
    } finally { setBusy(null) }
  }

  async function materialAction(materialId: string, body: Record<string, unknown>, okMsg: string) {
    setBusy(`material:${materialId}`)
    try {
      const res = await fetch(`/api/projects/${id}/materials`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ materialId, ...body }),
      })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No se pudo actualizar el material'); return false }
      toast.success(okMsg)
      load()
      return true
    } catch {
      toast.error(NET_ERROR)
      return false
    } finally { setBusy(null) }
  }

  async function deleteProposal(m: Material) {
    await materialAction(m.id, { action: 'eliminar' }, `Quitaste ${m.name} de la propuesta`)
  }

  async function suggestAlternative(original: Material) {
    const qty = parseFloat(altQty)
    const price = parseFloat(altPrice)
    if (!altName.trim()) { toast.error('Indicá el nombre de la alternativa'); return }
    if (!qty || qty <= 0) { toast.error('Cantidad inválida'); return }
    if (!price || price <= 0) { toast.error('Precio inválido'); return }
    const okd = await materialAction(original.id, {
      action: 'reemplazar',
      replacement: { elementId: original.elementId || undefined, name: altName.trim(), quantity: qty, unitPrice: price },
    }, 'Alternativa enviada al cliente')
    if (okd) { setAltFor(null); setAltName(''); setAltQty('1'); setAltPrice('') }
  }

  async function issueInvoice() {
    setBusy('invoice')
    try {
      const res = await fetch(`/api/projects/${id}/invoice`, { method: 'POST' })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No se pudo emitir la factura'); return }
      const inv = d.invoice as { number: string; total: number }
      toast.success(`Factura ${inv.number} emitida`, { description: `Total: ${formatARS(inv.total)} — el cliente la paga con Mercado Pago o en efectivo.` })
      load()
    } catch {
      toast.error(NET_ERROR)
    } finally { setBusy(null) }
  }

  async function setMaterialsMode(mode: 'pro_adelanta' | 'cliente_paga_proveedor') {
    await patchProject({ materialsPaymentMode: mode }, 'mode', 'Modo actualizado: el cliente lo ve en su panel')
  }

  async function confirmCash(inv: Invoice) {
    setBusy(`invoice:${inv.id}`)
    try {
      const res = await fetch(`/api/invoices/${inv.id}/cash`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'confirmar' }),
      })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No se pudo confirmar el cobro'); return }
      toast.success(`Cobro de ${inv.number} confirmado: factura pagada`)
      load()
    } catch {
      toast.error(NET_ERROR)
    } finally { setBusy(null) }
  }

  // Combobox: ranking difuso (matchScore sobre nombre + aliases + descripción), mismo patrón que proveedor/stock.tsx
  const pool = catalog.flatMap((c) => c.elements.map((e) => ({ ...e, categoryName: c.name })))
  const nq = elemQuery.trim()
  const ranked = nq.length >= 2 && !elementId
    ? pool
        .map((e) => ({ e, s: matchScore(nq, [e.name, ...(e.aliases || []), e.description || ''].join(' ')) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
        .slice(0, 12)
        .map((x) => x.e)
    : []
  const selectedElement = pool.find((e) => e.id === elementId)

  if (loading) return <Loading />
  if (!data) return (
    <div className="homy-page">
      <div>
        <Empty
          icon={<FolderOpen className="size-7" />}
          title={error ? 'No pudimos cargar el proyecto' : 'Proyecto no encontrado'}
          hint={error || 'Puede que el proyecto no exista o que no tengas acceso.'}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {error && <button onClick={load} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm"><RefreshCcw className="size-4" aria-hidden /> Reintentar</button>}
              <button onClick={() => navigate('/panel/profesional/proyectos')} className="homy-btn-dark min-h-[44px] px-5 py-2.5 text-sm">Volver a mis proyectos</button>
            </div>
          }
        />
      </div>
    </div>
  )

  const p = data.project
  const isActive = p.status === 'activo'
  const isCancelled = p.status === 'cancelado'
  const quoted = p.laborCost > 0
  const stageIdx = STAGES.indexOf(p.stage)
  const nextStage = stageIdx >= 0 && stageIdx < STAGES.length - 1 ? STAGES[stageIdx + 1] : null
  const canAdvance = isActive && nextStage !== null && nextStage !== 'finalizado'
  const advanceBlocked = p.stage === 'presupuesto' && !quoted
  const canCancel = isActive && (p.stage === 'presupuesto' || p.stage === 'materiales')
  const proposed = data.materials.filter((m) => m.status === 'propuesto')
  const rejected = data.materials.filter((m) => m.status === 'rechazado')
  const others = data.materials.filter((m) => m.status === 'aprobado' || m.status === 'reemplazado')
  const total = p.laborCost + p.materialsCost
  const progress = stageIdx > 0 ? Math.round((stageIdx / (STAGES.length - 1)) * 100) : 0
  const pendingInvoice = data.invoices.find((i) => i.status === 'pendiente') || null
  const budgetLabel = p.budgetMin && p.budgetMax
    ? `${formatARS(p.budgetMin)} – ${formatARS(p.budgetMax)}`
    : p.budgetMin ? `Desde ${formatARS(p.budgetMin)}`
    : p.budgetMax ? `Hasta ${formatARS(p.budgetMax)}`
    : null

  return (
    <div className="homy-page">
      <div>
        <Link to="/panel/profesional/proyectos"
          className="mb-3 inline-flex items-center gap-1.5 text-xs font-bold text-slate-400 transition-colors hover:text-[#1D63B8]">
          <ArrowLeft className="size-3.5" aria-hidden /> Volver a mis proyectos
        </Link>

        {/* Encabezado */}
        <header className="homy-page-head">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="homy-eyebrow">Proyecto · {STAGE_LABEL[p.stage] || p.stage}</span>
              <StatusBadge status={p.status} />
            </div>
            <h1 className="homy-page-title mt-1.5">{p.title}</h1>
            <p className="homy-page-sub">Para {p.client.displayName} · creado el {formatDate(p.createdAt)}</p>
          </div>
          {canCancel && p.stage === 'materiales' && (
            <button onClick={() => setCancelOpen(true)} disabled={busy !== null} className="homy-glass-soft homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 transition hover:text-red-500 disabled:opacity-50">
              <CircleX className="size-4" aria-hidden /> Cancelar proyecto
            </button>
          )}
        </header>

        {isCancelled && (
          <div className="mb-5 rounded-3xl border border-red-100 bg-red-50 p-5" aria-label="Proyecto cancelado">
            <p className="flex items-center gap-2 font-extrabold text-[#0A2540]">
              <CircleX className="size-5 text-red-500" aria-hidden /> Este proyecto fue cancelado
            </p>
            <p className="mt-1 text-sm leading-relaxed text-slate-600">El motivo quedó en las notificaciones y en el chat. Los materiales reservados volvieron al stock del proveedor.</p>
          </div>
        )}

        {/* qué pidió el cliente */}
        {p.description && (
          <div className="homy-glass mb-5 rounded-3xl p-4 sm:p-5">
            <p className="flex items-center gap-2 text-sm font-extrabold text-[#0A2540]">
              <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><FileText /></span>
              Qué pidió el cliente
            </p>
            <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-slate-600">{p.description}</p>
          </div>
        )}

        {/* brief de la contratación (si vino del wizard del directorio) */}
        {(p.urgency || p.address || p.deadline || (p.photos && p.photos.length > 0)) && (
          <div className="homy-glass mb-5 rounded-3xl p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="flex items-center gap-2 text-sm font-extrabold text-[#0A2540]">
                <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><FileText /></span>
                Cuándo y dónde
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

        {/* cotización de mano de obra (etapa presupuesto) */}
        {isActive && p.stage === 'presupuesto' && (
          <div className="homy-glass homy-glass-featured mb-5 rounded-3xl p-5">
            <h2 className="mb-1 flex items-center gap-2.5 font-extrabold tracking-tight text-[#0A2540]">
              <span className="homy-icon-chip homy-chip-gold size-8 [&_svg]:size-4" aria-hidden><HandCoins /></span>
              Cotizá la mano de obra
            </h2>
            <p className="mb-4 text-sm text-slate-500">
              {budgetLabel
                ? <>El cliente estimó <strong className="text-[#0A2540]">{budgetLabel}</strong> como referencia. Vos definís el precio cerrado de tu trabajo (sin materiales).</>
                : 'El cliente no estimó un presupuesto. Definí el precio cerrado de tu trabajo (sin materiales).'}
            </p>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
              <label className="block min-w-0 flex-1">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Mano de obra (ARS)</span>
                <span className="relative mt-1.5 block">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">$</span>
                  <input
                    type="number" min="0" step="any" inputMode="numeric" value={laborInput} onChange={(e) => setLaborInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); quoteLabor() } }}
                    placeholder="0" className="homy-glass-input homy-num min-h-[44px] w-full rounded-xl py-2.5 pl-8 pr-3 text-sm"
                  />
                </span>
              </label>
              <button disabled={busy !== null || !(parseFloat(laborInput) > 0)} onClick={quoteLabor} className="homy-btn-primary min-h-[44px] shrink-0 px-5 py-2.5 text-sm disabled:opacity-50">
                {busy === 'labor' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
                {quoted ? 'Actualizar cotización' : 'Enviar cotización'}
              </button>
            </div>
            {quoted && (
              <p className="mt-3 text-xs font-bold text-emerald-600">
                Cotizaste {formatARS(p.laborCost)}. Ya podés avanzar a Materiales.
              </p>
            )}
            <div className="mt-4 border-t border-[#0A2540]/8 pt-3">
              <button onClick={() => setCancelOpen(true)} disabled={busy !== null} className="homy-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-bold text-slate-500 transition hover:text-red-500 disabled:opacity-50">
                <CircleX className="size-4" aria-hidden /> No puedo tomar este trabajo
              </button>
            </div>
          </div>
        )}

        {/* etapas */}
        <div className="homy-glass mb-5 rounded-3xl p-5">
          <div className="homy-progress mb-4" role="img" aria-label={`Progreso del proyecto: etapa ${STAGE_LABEL[p.stage] || p.stage}`}>
            <i style={{ width: `${progress}%` }} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {STAGES.map((s, i) => (
                <div key={s} className="flex items-center gap-1.5">
                  <span className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold transition ${p.stage === s ? 'bg-gradient-to-br from-[#103455] to-[#0A2540] text-white shadow-lg shadow-[#0A2540]/25 ring-1 ring-[#00C4FF]/35' : stageIdx > i ? 'bg-emerald-100 text-emerald-700' : 'homy-glass-soft text-slate-400'}`}>
                    {stageIdx > i && <Check className="size-3" aria-hidden />}
                    {STAGE_LABEL[s]}
                  </span>
                  {i < STAGES.length - 1 && <ArrowRight className="size-3 shrink-0 text-slate-300" aria-hidden />}
                </div>
              ))}
            </div>
            {canAdvance && nextStage && (
              <button
                disabled={busy !== null || advanceBlocked}
                onClick={() => patchProject({ stage: nextStage }, 'stage', `Proyecto en ${STAGE_LABEL[nextStage]}`)}
                title={advanceBlocked ? 'Primero cotizá la mano de obra' : undefined}
                className="homy-btn-primary min-h-[44px] px-4 py-2 text-sm disabled:opacity-50"
              >
                {busy === 'stage' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <ArrowRight className="size-4" aria-hidden />}
                Avanzar a {STAGE_LABEL[nextStage]}
              </button>
            )}
          </div>
          {isActive && advanceBlocked && (
            <p className="mt-3 text-xs font-semibold text-slate-500">Para avanzar a Materiales, primero cotizá la mano de obra.</p>
          )}
          {isActive && (p.stage === 'ejecucion' || p.stage === 'revision') && (
            <p className="mt-3 flex items-start gap-2 text-xs font-semibold text-slate-500">
              <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              {p.stage === 'revision'
                ? 'La obra está en revisión: el cliente la da por finalizada desde su panel.'
                : 'Cuando termines, pasá a Revisión: el cliente revisa y da por finalizada la obra.'}
            </p>
          )}
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <MiniStat label="Estimado del cliente" value={budgetLabel || 'Sin estimar'} muted={!budgetLabel} />
            <MiniStat label="Mano de obra" value={quoted ? formatARS(p.laborCost) : 'Sin cotizar'} muted={!quoted} />
            <MiniStat label="Materiales aprobados" value={formatARS(p.materialsCost)} />
            <MiniStat label="Total del proyecto" value={formatARS(total)} accent />
          </div>
        </div>

        {/* cliente + contacto + chat + reputación del cliente */}
        <div className="homy-glass mb-5 flex flex-wrap items-center justify-between gap-3 rounded-3xl p-4 sm:p-5">
          <div className="flex min-w-0 items-center gap-3">
            <UAvatar name={p.client.displayName} url={p.client.avatarUrl} size={46} />
            <div className="min-w-0">
              <p className="flex items-center gap-1.5 font-bold text-[#0A2540]">
                <span className="line-clamp-1">{p.client.displayName}</span>
                {p.client.verificationStatus && <VerifyBadge status={p.client.verificationStatus} compact />}
              </p>
              <p className="text-xs text-slate-500">Tu cliente en este proyecto</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {p.conversationId ? (
              <button onClick={() => navigate(`/mensajes?c=${p.conversationId}`)} className="homy-btn-primary min-h-[44px] px-4 py-2 text-sm">
                <MessageSquare className="size-4" aria-hidden /> Abrir chat
              </button>
            ) : (
              <span className="homy-glass-soft inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold text-slate-500" title="En HomIA el cliente escribe primero">
                <MessageSquare className="size-4" aria-hidden /> El cliente todavía no abrió el chat
              </span>
            )}
            <ClientSummaryButton userId={p.client.id} label="Ver reputación" />
            {p.client.phone && (
              <a href={`tel:${p.client.phone}`} className="homy-glass-soft flex min-h-[44px] items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold text-[#0A2540] transition hover:text-[#1D63B8]">
                <Phone className="size-4" aria-hidden /> Llamar
              </a>
            )}
            {p.client.email && (
              <a href={`mailto:${p.client.email}`} className="homy-glass-soft flex min-h-[44px] items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold text-[#0A2540] transition hover:text-[#1D63B8]">
                <Mail className="size-4" aria-hidden /> Email
              </a>
            )}
          </div>
        </div>

        {/* quién paga los materiales: modo elegido por el profesional, visible para el cliente */}
        <div className="homy-glass mb-5 rounded-3xl p-5" aria-label="Modo de pago de materiales">
          <h2 className="mb-1 flex items-center gap-2.5 font-extrabold tracking-tight text-[#0A2540]">
            <span className="homy-icon-chip homy-chip-ai size-8 [&_svg]:size-4" aria-hidden><Store /></span>
            ¿Quién paga los materiales?
          </h2>
          <p className="mb-3 text-xs text-slate-400">
            {data.invoices.length > 0
              ? 'Ya emitiste una factura: el modo quedó fijo para este proyecto.'
              : 'Elegí cómo van a circular los materiales: el cliente ve esta configuración en su panel.'}
          </p>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <button
              onClick={() => p.materialsPaymentMode !== 'pro_adelanta' && setMaterialsMode('pro_adelanta')}
              disabled={busy !== null || !isActive || data.invoices.length > 0}
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
              disabled={busy !== null || !isActive || data.invoices.length > 0}
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
        {isActive && (
          <div className="homy-glass mb-5 rounded-3xl p-5">
            <h2 className="mb-1 flex items-center gap-2.5 font-extrabold tracking-tight text-[#0A2540]">
              <span className="homy-icon-chip homy-chip-orange size-8 [&_svg]:size-4" aria-hidden><Plus /></span>
              Proponer material al cliente
            </h2>
            <p className="mb-4 text-sm text-slate-500">Buscá en el catálogo estándar; si un proveedor vinculado lo tiene en stock, te autocompletamos el mejor precio. El stock se reserva recién cuando el cliente aprueba.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="block sm:col-span-2">
                <label htmlFor="mat-elem-search" className="text-xs font-bold uppercase tracking-wide text-slate-500">Material (catálogo estándar)</label>
                <div className="relative mt-1.5">
                  <Search aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
                  <input id="mat-elem-search" value={elemQuery}
                    onChange={(e) => { setElemQuery(e.target.value); setElementId('') }}
                    placeholder="Escribí: caño, cable, cemento…"
                    className="homy-glass-input min-h-[44px] w-full rounded-xl py-2.5 pl-10 pr-4 text-sm"
                    autoComplete="off" role="combobox" aria-expanded={ranked.length > 0} aria-controls="mat-elem-results" />
                </div>
                {ranked.length > 0 && (
                  <ul id="mat-elem-results" role="listbox" aria-label="Resultados del catálogo" className="mt-2 max-h-56 divide-y divide-[#0A2540]/6 overflow-y-auto rounded-xl border border-[#0A2540]/10 bg-white/70">
                    {ranked.map((el) => (
                      <li key={el.id}>
                        <button type="button" role="option" aria-selected={false}
                          onClick={() => { setElementId(el.id); setElemQuery(el.name) }}
                          className="w-full px-3.5 py-2.5 text-left transition hover:bg-[#1D63B8]/6">
                          <span className="block text-sm font-bold text-[#0A2540]">{el.name}</span>
                          <span className="mt-0.5 block text-[11px] text-slate-500">{el.categoryName} · se vende por {el.unit}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {!elementId && nq.length >= 2 && ranked.length === 0 && (
                  <p className="mt-1.5 text-xs text-slate-500">No encontramos “{nq}” en el catálogo. Probá con otro nombre.</p>
                )}
                {!elementId && nq.length < 2 && (
                  <p className="mt-1.5 text-xs text-slate-500">Escribí dos letras o más para buscar entre {pool.length} elementos.</p>
                )}
                {selectedElement && (
                  <p className="mt-1.5 text-xs text-slate-500">
                    <strong className="text-[#0A2540]">{selectedElement.name}</strong> · {selectedElement.categoryName} · se vende por {selectedElement.unit}
                    {selectedElement.description ? ` — ${selectedElement.description}` : ''}
                  </p>
                )}
              </div>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">
                  Proveedor {loadingStock && <RefreshCcw className="inline size-3 animate-spin text-[#00C4FF]" aria-hidden />}
                </span>
                <div className="mt-1.5">
                  <Select value={providerId || 'none'} onValueChange={(val) => {
                    const next = val === 'none' ? '' : val
                    setProviderId(next)
                    const stock = stockOptions.find((s) => s.providerId === next)
                    if (stock) setUnitPrice(String(stock.price))
                  }} disabled={!elementId || stockOptions.length === 0}>
                    <SelectTrigger className="homy-glass-input w-full cursor-pointer rounded-xl border-none px-3 py-2.5 text-sm disabled:text-slate-400">
                      <SelectValue placeholder="Sin proveedor (compro por mi cuenta)" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">Sin proveedor (compro por mi cuenta)</SelectItem>
                      {stockOptions.map((s) => (
                        <SelectItem key={s.stockId} value={s.providerId}>
                          {s.providerName} — {formatARS(s.price)}/{selectedElement?.unit || 'u'} (stock {s.quantity})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                {elementId && !loadingStock && stockOptions.length === 0 && (
                  <p className="mt-1.5 text-xs text-slate-500">Ningún proveedor lo tiene en stock: lo comprás por tu cuenta.</p>
                )}
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Cantidad {selectedElement ? `(${selectedElement.unit})` : ''}</span>
                <input type="number" min="0" step="any" value={quantity} onChange={(e) => setQuantity(e.target.value)}
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm tabular-nums" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Precio unitario (ARS)</span>
                <input type="number" min="0" step="any" value={unitPrice} onChange={(e) => setUnitPrice(e.target.value)}
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm tabular-nums" />
              </label>
              <label className="block">
                <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Nota para el cliente (opcional)</span>
                <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Ej: marca recomendada, alternativa más duradera…"
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" />
              </label>
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
              <p className="text-sm font-bold text-[#0A2540] tabular-nums">
                Subtotal: {formatARS((parseFloat(quantity) || 0) * (parseFloat(unitPrice) || 0))}
              </p>
              <button disabled={busy !== null || !elementId} onClick={proposeMaterial} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50">
                {busy === 'propose' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Plus className="size-4" aria-hidden />}
                Proponer al cliente
              </button>
            </div>
          </div>
        )}

        {/* propuestos (esperando cliente) */}
        {proposed.length > 0 && (
          <div className="homy-glass homy-glass-featured mb-5 rounded-3xl p-5">
            <h2 className="mb-3 flex items-center gap-2.5 font-extrabold tracking-tight text-[#0A2540]">
              <span className="homy-icon-chip homy-chip-gold size-8 [&_svg]:size-4" aria-hidden><ClipboardPen /></span>
              Esperando aprobación del cliente ({proposed.length})
            </h2>
            <div className="space-y-2">
              {proposed.map((m) => (
                <div key={m.id} className="flex flex-wrap items-start justify-between gap-2 rounded-2xl homy-glass p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-bold text-[#0A2540]">{m.name}</p>
                    <p className="text-sm text-slate-500 tabular-nums">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}{m.providerName ? ` · ${m.providerName}` : ' · sin proveedor'}</p>
                    {m.note && <p className="mt-1 text-xs text-slate-400">{m.note}</p>}
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-lg font-extrabold text-[#0A2540] tabular-nums">{formatARS(m.subtotal)}</p>
                    <div className="mt-1 flex items-center justify-end gap-2">
                      <StatusBadge status={m.status} />
                      {isActive && (
                        <button disabled={busy !== null} onClick={() => deleteProposal(m)} title="Quitar esta propuesta" aria-label={`Eliminar ${m.name}`}
                          className="homy-focus inline-flex min-h-[36px] items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-slate-400 transition hover:text-red-500 disabled:opacity-50">
                          {busy === `material:${m.id}` ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />} Eliminar
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* rechazados → sugerir alternativa */}
        {rejected.length > 0 && (
          <div className="mb-5 rounded-3xl border border-red-100 bg-red-50 p-5">
            <h2 className="mb-3 flex items-center gap-2.5 font-extrabold tracking-tight text-[#0A2540]">
              <span className="homy-icon-chip homy-chip-orange size-8 [&_svg]:size-4" aria-hidden><CircleX /></span>
              Rechazados por el cliente ({rejected.length})
            </h2>
            <div className="space-y-3">
              {rejected.map((m) => (
                <div key={m.id} className="rounded-2xl border border-red-100 bg-white p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="font-bold text-[#0A2540]">{m.name}</p>
                      <p className="text-sm text-slate-500 tabular-nums">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}</p>
                      {m.note && <p className="mt-1 text-xs text-slate-500">{m.note}</p>}
                    </div>
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={m.status} />
                      {isActive && altFor !== m.id && (
                        <button onClick={() => { setAltFor(m.id); setAltName(m.name); setAltQty(String(m.quantity)); setAltPrice('') }}
                          className="min-h-[44px] rounded-full border-2 border-[#1D63B8] px-4 py-2 text-sm font-bold text-[#1D63B8] transition hover:bg-[#1D63B8] hover:text-white">
                          Sugerir alternativa
                        </button>
                      )}
                    </div>
                  </div>
                  {altFor === m.id && (
                    <div className="mt-3 grid gap-3 rounded-2xl homy-glass p-4 sm:grid-cols-3">
                      <label className="block sm:col-span-3">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Alternativa</span>
                        <input value={altName} onChange={(e) => setAltName(e.target.value)} placeholder="Nombre del material alternativo"
                          className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Cantidad ({m.unit})</span>
                        <input type="number" min="0" step="any" value={altQty} onChange={(e) => setAltQty(e.target.value)}
                          className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm tabular-nums" />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Precio unitario</span>
                        <input type="number" min="0" step="any" value={altPrice} onChange={(e) => setAltPrice(e.target.value)} placeholder={`antes ${m.unitPrice}`}
                          className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm tabular-nums" />
                      </label>
                      <div className="flex flex-wrap items-end gap-2">
                        <button disabled={busy !== null} onClick={() => suggestAlternative(m)} className="homy-btn-dark min-h-[44px] px-4 py-2.5 text-sm disabled:opacity-50">
                          {busy === `material:${m.id}` ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Enviar alternativa
                        </button>
                        <button onClick={() => setAltFor(null)} className="homy-glass-soft min-h-[44px] rounded-full px-4 py-2.5 text-sm font-bold text-slate-500 transition hover:text-red-500">
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
          <div className="homy-glass mb-5 rounded-3xl p-5">
            <h2 className="mb-3 flex items-center gap-2.5 font-extrabold tracking-tight text-[#0A2540]">
              <span className="homy-icon-chip homy-chip-blue size-8 [&_svg]:size-4" aria-hidden><History /></span>
              Historial de materiales
            </h2>
            <div className="divide-y divide-[#0A2540]/6">
              {others.map((m) => {
                const counts = m.status === 'aprobado'
                return (
                  // flex-wrap + base 11rem: con "facturado" + precio el texto quedaba en una columna de 50px
                  <div key={m.id} className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 py-2.5">
                    <div className="min-w-0 flex-[1_1_11rem]">
                      <p className={`line-clamp-1 text-sm font-semibold ${counts ? 'text-[#0A2540]' : 'text-slate-400 line-through'}`}>{m.name}</p>
                      <p className="text-xs text-slate-400 tabular-nums">{m.quantity} {m.unit} × {formatARS(m.unitPrice)}{m.providerName ? ` · ${m.providerName}` : ''}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
                      <StatusBadge status={m.status} />
                      {counts && m.invoicedAt && <span className="homy-pill"><span className="homy-pill-dot bg-emerald-500" aria-hidden />facturado</span>}
                      {counts && <p className="text-sm font-bold tabular-nums">{formatARS(m.subtotal)}</p>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* cuentas de retiro vinculadas */}
        <div className="homy-glass mb-5 rounded-3xl p-5">
          <h2 className="mb-1 flex items-center gap-2.5 font-extrabold tracking-tight text-[#0A2540]">
            <span className="homy-icon-chip homy-chip-ai size-8 [&_svg]:size-4" aria-hidden><Truck /></span>
            Cuentas de retiro vinculadas
          </h2>
          <p className="mb-3 text-sm text-slate-500">Con estas cuentas podés retirar materiales en los proveedores y proponer su stock en este proyecto.</p>
          {data.links.length === 0 ? (
            <p className="text-sm text-slate-500">
              Todavía no tenés cuentas de retiro activas con los proveedores de este proyecto.{' '}
              <Link to="/panel/profesional/vinculaciones" className="font-bold text-[#1D63B8] hover:underline">Vinculate acá</Link>.
            </p>
          ) : (
            <div className="space-y-2">
              {data.links.map((l) => (
                <div key={l.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl homy-glass-soft p-3.5">
                  <div className="min-w-0">
                    <p className="line-clamp-1 font-mono text-sm font-bold text-[#0A2540]">{l.accountLabel}</p>
                    <p className="line-clamp-1 text-xs text-slate-400">Proveedor: {l.provider.businessName}{l.provider.city ? ` · ${l.provider.city}` : ''}</p>
                  </div>
                  <StatusBadge status={l.active ? 'activo' : 'cerrado'} label={l.active ? 'activa' : 'inactiva'} />
                </div>
              ))}
            </div>
          )}
        </div>

        {/* sobrantes (D14): devoluciones del cliente (él es el vendedor) y pedidos a sus proveedores */}
        <div className="mb-5"><ProSobrantes projectId={id} materialsPaymentMode={p.materialsPaymentMode} autoOpen={route.query.devolver === '1'} /></div>
        {/* facturación */}
        <div className="homy-glass rounded-3xl p-5">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="flex items-center gap-2.5 font-extrabold tracking-tight text-[#0A2540]">
              <span className="homy-icon-chip homy-chip-navy size-8 [&_svg]:size-4" aria-hidden><Receipt /></span>
              Facturas ({data.invoices.length})
            </h2>
            {!isCancelled && (
              <button
                disabled={busy !== null || pendingInvoice !== null}
                onClick={issueInvoice}
                title={pendingInvoice ? `Esperá el pago de ${pendingInvoice.number} antes de emitir otra` : undefined}
                className="homy-btn-dark min-h-[44px] px-4 py-2.5 text-sm disabled:opacity-50"
              >
                {busy === 'invoice' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Receipt className="size-4" aria-hidden />}
                Emitir factura
              </button>
            )}
          </div>
          {pendingInvoice && (
            <p className="mb-3 flex items-start gap-2 rounded-xl bg-amber-50 p-3 text-xs font-semibold text-amber-800">
              <Hourglass className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              Hay una factura pendiente de pago ({pendingInvoice.number}). Podés emitir la siguiente cuando el cliente la pague.
            </p>
          )}
          <p className="mb-3 text-xs text-slate-400">
            {p.materialsPaymentMode === 'cliente_paga_proveedor'
              ? 'Facturás solo tu mano de obra: los materiales los paga el cliente directamente a cada proveedor (cobros aparte).'
              : 'La factura incluye los materiales aprobados todavía no facturados + la mano de obra (una sola vez).'}{' '}
            El cliente elige pagar con Mercado Pago o en efectivo (vos confirmás cuando lo cobrás).
          </p>
          {data.invoices.length === 0 ? (
            <div className="homy-glass-soft flex items-center gap-2 rounded-xl p-4 text-sm text-slate-500">
              <Package className="size-4 shrink-0 text-slate-400" aria-hidden />
              Todavía no emitiste facturas para este proyecto.
            </div>
          ) : (
            <div className="space-y-2">
              {data.invoices.map((inv) => (
                <div key={inv.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl homy-glass-soft p-3.5">
                  <div className="min-w-0">
                    <p className="font-mono text-sm font-bold text-[#0A2540]">{inv.number}</p>
                    <p className="text-xs text-slate-400">{formatDate(inv.issuedAt)} · mano de obra {formatARS(inv.laborCost)} + materiales {formatARS(inv.materialsCost)}</p>
                  </div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <p className="font-extrabold tabular-nums">{formatARS(inv.total)}</p>
                    <a
                      href={`/api/invoices/${inv.id}/pdf`} target="_blank" rel="noopener noreferrer"
                      aria-label={`Ver factura ${inv.number} en PDF`} title="Ver / descargar PDF"
                      className="homy-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-xl homy-glass px-3.5 py-2 text-xs font-bold text-[#1D63B8] transition hover:bg-[#1D63B8]/10"
                    >
                      <FileDown className="size-4" aria-hidden /> PDF
                    </a>
                    {inv.status === 'pendiente' && inv.paymentMethod === 'efectivo' ? (
                      <button disabled={busy !== null} onClick={() => confirmCash(inv)} className="homy-btn-primary min-h-[40px] px-3.5 py-2 text-xs disabled:opacity-50">
                        {busy === `invoice:${inv.id}` ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Banknote className="size-4" aria-hidden />} Confirmar cobro en efectivo
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

      {/* cancelar con motivo */}
      <Dialog open={cancelOpen} onOpenChange={(o) => { if (busy !== 'cancelar') setCancelOpen(o) }}>
        <DialogContent className="homy-glass-strong rounded-3xl">
          <DialogHeader>
            <DialogTitle className="text-[#0A2540]">{p.stage === 'presupuesto' ? 'No puedo tomar este trabajo' : 'Cancelar el proyecto'}</DialogTitle>
            <DialogDescription className="text-slate-600">
              Se cancela para vos y para {p.client.displayName}; los materiales reservados vuelven al stock del proveedor. Contale el motivo: le llega por notificación y por el chat.
            </DialogDescription>
          </DialogHeader>
          <label htmlFor="pro-cancel-reason" className="text-xs font-extrabold uppercase tracking-[0.1em] text-[#0A2540]/70">Motivo</label>
          <textarea
            id="pro-cancel-reason" value={cancelReason} onChange={(e) => setCancelReason(e.target.value.slice(0, 500))}
            rows={3} placeholder="Ej: no tengo agenda estas semanas, queda fuera de mi zona, no es mi rubro…"
            className="homy-glass-input w-full resize-none rounded-xl px-3.5 py-3 text-sm leading-relaxed"
          />
          <DialogFooter>
            <button type="button" disabled={busy === 'cancelar'} onClick={() => setCancelOpen(false)} className="homy-glass-soft homy-focus min-h-[44px] rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600">Volver</button>
            <button type="button" disabled={busy === 'cancelar' || cancelReason.trim().length < 3} onClick={cancelProject} className="homy-btn-dark min-h-[44px] rounded-xl px-4 py-2.5 text-sm disabled:opacity-50">
              {busy === 'cancelar' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CircleX className="size-4" aria-hidden />} Cancelar proyecto
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function MiniStat({ label, value, accent, muted }: { label: string; value: string; accent?: boolean; muted?: boolean }) {
  return (
    <div className="homy-glass-soft homy-num-cell rounded-2xl px-4 py-3">
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-400">{label}</p>
      {muted ? (
        <p className="text-sm font-bold leading-snug text-slate-500">{value}</p>
      ) : (
        <p className={`font-extrabold ${accent ? 'text-[#FF5A1F]' : 'text-[#0A2540]'}`}>
          <span className="homy-num-adapt">{value}</span>
        </p>
      )}
    </div>
  )
}

/* Estado vacío diseñado: icono flotante + copy + acción */
function Empty({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
      <span className="homy-empty-icon homy-chip-blue" aria-hidden>{icon}</span>
      <h3 className="text-lg font-bold tracking-tight text-[#0A2540]">{title}</h3>
      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
