'use client'
// Gestión de stock del proveedor — el corazón del panel: precios, cantidades, mínimos y estado derivado
import { useEffect, useState } from 'react'
import { StatusBadge, Loading } from '@/components/app/ui-bits'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus, Search, Minus, Check, Trash2, Info, Package, PackageOpen,
} from 'lucide-react'

type StockItem = {
  id: string; elementId: string; name: string; unit: string; category: string; categorySlug: string
  aliases: string[]; description: string | null; brand: string | null; price: number; quantity: number; minStock: number
  status: string; updatedAt: string
}

type CatalogCategory = {
  id: string; slug: string; name: string
  elements: { id: string; name: string; unit: string; aliases: string[]; description?: string }[]
}

type Draft = { price?: string; qty?: string }

const STATUS_OPTIONS = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'por_agotar', label: 'Por agotar' },
  { value: 'agotado', label: 'Agotado' },
]

export default function ProviderStock() {
  const [stock, setStock] = useState<StockItem[]>([])
  const [catalog, setCatalog] = useState<CatalogCategory[]>([])
  const [loading, setLoading] = useState(true)

  // filtros
  const [q, setQ] = useState('')
  const [cat, setCat] = useState('')
  const [statusF, setStatusF] = useState('')

  // alta de elemento
  const [open, setOpen] = useState(false)
  const [dlgCat, setDlgCat] = useState('')
  const [elementId, setElementId] = useState('')
  const [price, setPrice] = useState('')
  const [qty, setQty] = useState('')
  const [minStock, setMinStock] = useState('5')
  const [brand, setBrand] = useState('')
  const [busy, setBusy] = useState(false)

  // edición inline + borrado
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StockItem | null>(null)

  async function load() {
    const res = await fetch('/api/provider/stock')
    if (res.ok) setStock((await res.json()).stock || [])
  }

  useEffect(() => {
    (async () => {
      try {
        const [resS, resC] = await Promise.all([fetch('/api/provider/stock'), fetch('/api/catalog')])
        if (resS.ok) setStock((await resS.json()).stock || [])
        if (resC.ok) setCatalog((await resC.json()).categories || [])
      } finally { setLoading(false) }
    })()
  }, [])

  const catOptions = Object.entries(
    stock.reduce<Record<string, string>>((acc, s) => { acc[s.categorySlug] = s.category; return acc }, {})
  ).sort((a, b) => a[1].localeCompare(b[1]))

  const filtered = stock.filter((s) => {
    if (cat && s.categorySlug !== cat) return false
    if (statusF && s.status !== statusF) return false
    if (q) {
      const hay = [s.name, ...s.aliases, s.description || '', s.brand || '', s.category].join(' ').toLowerCase()
      if (!hay.includes(q.toLowerCase())) return false
    }
    return true
  })

  const countFor = (value: string) => (value === '' ? stock.length : stock.filter((s) => s.status === value).length)

  function setDraft(id: string, key: keyof Draft, value: string) {
    setDrafts((prev) => ({ ...prev, [id]: { ...prev[id], [key]: value } }))
  }
  function clearDraft(id: string, key: keyof Draft) {
    setDrafts((prev) => {
      const next = { ...prev }
      if (next[id]) { const d = { ...next[id] }; delete d[key]; next[id] = d }
      return next
    })
  }

  async function patch(id: string, data: Record<string, unknown>, okMsg?: string) {
    setSavingId(id)
    try {
      const res = await fetch('/api/provider/stock', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, ...data }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      const d = await res.json()
      if (d.stock) {
        setStock((prev) => prev.map((s) => s.id === id
          ? { ...s, price: d.stock.price, quantity: d.stock.quantity, minStock: d.stock.minStock, status: d.stock.status, brand: d.stock.brand }
          : s))
      }
      if (okMsg) toast.success(okMsg)
    } finally { setSavingId(null) }
  }

  function savePrice(item: StockItem) {
    const raw = drafts[item.id]?.price
    if (raw === undefined) return
    const n = Number(raw)
    if (raw === '' || Number.isNaN(n) || n < 0) { toast.error('Ingresá un precio válido'); return }
    if (n === item.price) { clearDraft(item.id, 'price'); return }
    patch(item.id, { price: n }, 'Precio actualizado')
    clearDraft(item.id, 'price')
  }

  function saveQty(item: StockItem) {
    const raw = drafts[item.id]?.qty
    if (raw === undefined) return
    const n = Number(raw)
    if (raw === '' || Number.isNaN(n) || n < 0) { toast.error('Ingresá una cantidad válida'); clearDraft(item.id, 'qty'); return }
    if (n === item.quantity) { clearDraft(item.id, 'qty'); return }
    patch(item.id, { quantity: n })
    clearDraft(item.id, 'qty')
  }

  function bump(item: StockItem, delta: number) {
    const next = Math.max(0, item.quantity + delta)
    if (next === item.quantity) return
    patch(item.id, { quantity: next })
  }

  function resetForm() {
    setDlgCat(''); setElementId(''); setPrice(''); setQty(''); setMinStock('5'); setBrand('')
  }

  async function publish() {
    const n = Number(price)
    const qn = Number(qty)
    const ms = Number(minStock)
    if (!elementId) { toast.error('Elegí un elemento del catálogo'); return }
    if (price === '' || Number.isNaN(n) || n <= 0) { toast.error('Ingresá un precio válido'); return }
    if (qty === '' || Number.isNaN(qn) || qn < 0) { toast.error('Ingresá una cantidad válida'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/provider/stock', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ elementId, price: n, quantity: qn, minStock: Number.isNaN(ms) ? 5 : ms, brand: brand.trim() || undefined }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      toast.success('Elemento publicado')
      setOpen(false)
      resetForm()
      load()
    } finally { setBusy(false) }
  }

  async function remove() {
    if (!deleteTarget) return
    const res = await fetch(`/api/provider/stock?id=${deleteTarget.id}`, { method: 'DELETE' })
    if (!res.ok) { toast.error((await res.json()).error); setDeleteTarget(null); return }
    toast.success('Elemento eliminado')
    setDeleteTarget(null)
    load()
  }

  const dlgElements = catalog.find((c) => c.slug === dlgCat)?.elements || []
  const chosenElement = dlgElements.find((e) => e.id === elementId)

  if (loading) return <Loading />

  return (
    <div className="homy-page">
      {/* Encabezado */}
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Catálogo propio</span>
          <h1 className="homy-page-title mt-1.5">Stock</h1>
          <p className="homy-page-sub">Precios y cantidades de los elementos estándar del catálogo.</p>
        </div>
        <button onClick={() => setOpen(true)} className="homy-btn-primary homy-focus min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
          <Plus className="size-4" /> Publicar elemento
        </button>
      </header>

      <div className="homy-stagger space-y-4">
        {/* cómo funciona el estado */}
        <div className="homy-glass-soft rounded-2xl p-4 flex gap-3 items-start">
          <span aria-hidden className="homy-icon-chip homy-chip-ai size-8 shrink-0 [&_svg]:size-4"><Info /></span>
          <p className="text-sm text-slate-600 leading-relaxed">
            El estado se calcula solo: si la cantidad baja del <strong>stock mínimo</strong> pasa a <strong>por agotar</strong>, y con <strong>0</strong> queda <strong>agotado</strong>. Repone desde acá cuando quieras.
          </p>
        </div>

        {/* filtros */}
        <div className="homy-glass rounded-2xl p-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search aria-hidden className="size-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre…"
                className="homy-glass-input w-full rounded-xl pl-10 pr-4 py-2.5 min-h-[44px] text-sm" aria-label="Buscar elemento por nombre" />
            </div>
            <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filtrar por categoría"
              className="homy-glass-input rounded-xl px-3 py-2.5 min-h-[44px] text-sm font-semibold text-[#0A2540]">
              <option value="">Todas las categorías</option>
              {catOptions.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
            </select>
          </div>
          <div role="group" aria-label="Filtrar por estado" className="flex gap-2 overflow-x-auto no-scrollbar mt-3.5 pt-3.5 border-t border-[#0A2540]/8">
            {[{ value: '', label: 'Todos' }, ...STATUS_OPTIONS].map((o) => (
              <button key={o.value} type="button" onClick={() => setStatusF(o.value)} aria-pressed={statusF === o.value}
                className="homy-tab min-h-[40px]">
                {o.label}
                <span className={`tabular-nums ${statusF === o.value ? 'text-[#66dfff]' : 'text-slate-400'}`}>{countFor(o.value)}</span>
              </button>
            ))}
          </div>
        </div>

        {/* listado */}
        {stock.length === 0 ? (
          <Empty
            icon={<PackageOpen className="size-7" />}
            title="Todavía no publicaste elementos"
            hint="Elegí elementos del catálogo estándar (tornillos, caños, cables…) y publicá tu precio y stock. Los profesionales te van a encontrar al buscar materiales."
            action={
              <button onClick={() => setOpen(true)} className="homy-btn-primary homy-focus min-h-[44px] px-5 py-2.5 text-sm">
                <Plus className="size-4" /> Publicar el primero
              </button>
            }
          />
        ) : filtered.length === 0 ? (
          <Empty
            icon={<Search className="size-7" />}
            title="Sin resultados"
            hint="Ningún elemento coincide con los filtros. Probá con otro nombre, categoría o estado."
            action={
              <button onClick={() => { setQ(''); setCat(''); setStatusF('') }} className="homy-btn-dark homy-focus min-h-[44px] px-5 py-2.5 text-sm">
                Limpiar filtros
              </button>
            }
          />
        ) : (
          <div className="homy-stagger grid grid-cols-1 xl:grid-cols-2 gap-3">
            {filtered.map((s) => (
              <article key={s.id} className="homy-glass homy-lift homy-card-glow rounded-2xl p-4 sm:p-5">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <span aria-hidden className="homy-icon-chip homy-chip-blue size-10 shrink-0 [&_svg]:size-5"><Package /></span>
                    <div className="min-w-0">
                      <p className="font-bold text-[#0A2540] leading-snug">{s.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {s.category}{s.brand ? ` · ${s.brand}` : ''} · se vende por {s.unit}
                      </p>
                    </div>
                  </div>
                  <StatusBadge status={s.status} />
                </div>

                <div className="grid sm:grid-cols-3 gap-3.5 mt-4">
                  {/* precio editable */}
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em]">Precio (ARS)</p>
                    <div className="flex gap-1.5 mt-1.5">
                      <input type="number" min={0} value={drafts[s.id]?.price ?? String(s.price)}
                        onChange={(e) => setDraft(s.id, 'price', e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') savePrice(s) }}
                        className="homy-glass-input w-full min-w-0 rounded-xl px-3 py-2.5 text-lg font-extrabold text-[#0A2540] text-right tabular-nums"
                        aria-label={`Precio de ${s.name}`} />
                      <button onClick={() => savePrice(s)} disabled={savingId === s.id} title="Guardar precio" aria-label={`Guardar precio de ${s.name}`}
                        className="homy-btn-dark homy-focus size-11 shrink-0 disabled:opacity-50">
                        <Check className="size-4" />
                      </button>
                    </div>
                  </div>

                  {/* cantidad con +1/-1 y edición */}
                  <div>
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em]">Cantidad ({s.unit})</p>
                    <div className="flex gap-1.5 mt-1.5">
                      <button onClick={() => bump(s, -1)} disabled={savingId === s.id} title="Restar 1" aria-label={`Restar 1 a ${s.name}`}
                        className="homy-glass-soft homy-focus rounded-xl size-11 grid place-items-center text-[#0A2540] hover:text-[#FF5A1F] disabled:opacity-50 transition shrink-0">
                        <Minus className="size-4" />
                      </button>
                      <input type="number" min={0} value={drafts[s.id]?.qty ?? String(s.quantity)}
                        onChange={(e) => setDraft(s.id, 'qty', e.target.value)}
                        onBlur={() => saveQty(s)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveQty(s) }}
                        className="homy-glass-input w-full min-w-0 rounded-xl px-1 py-2.5 text-sm font-bold text-[#0A2540] text-center tabular-nums"
                        aria-label={`Cantidad de ${s.name}`} />
                      <button onClick={() => bump(s, +1)} disabled={savingId === s.id} title="Sumar 1" aria-label={`Sumar 1 a ${s.name}`}
                        className="homy-glass-soft homy-focus rounded-xl size-11 grid place-items-center text-[#0A2540] hover:text-[#FF5A1F] disabled:opacity-50 transition shrink-0">
                        <Plus className="size-4" />
                      </button>
                    </div>
                  </div>

                  {/* mínimo + eliminar */}
                  <div className="flex sm:flex-col sm:items-end justify-between gap-2">
                    <div className="sm:text-right">
                      <p className="text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em]">Stock mínimo</p>
                      <p className="text-lg font-extrabold text-[#0A2540] mt-1.5 tabular-nums leading-none">
                        {s.minStock} <span className="text-xs font-semibold text-slate-400">{s.unit}</span>
                      </p>
                    </div>
                    <button onClick={() => setDeleteTarget(s)}
                      className="homy-glass-soft homy-focus rounded-xl min-h-[44px] px-3.5 text-slate-400 hover:text-red-600 flex items-center gap-1.5 text-sm font-bold transition shrink-0">
                      <Trash2 className="size-4" /> Eliminar
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {/* dialog publicar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2.5">
              <span aria-hidden className="homy-icon-chip homy-chip-blue size-8 [&_svg]:size-4"><Package /></span>
              Publicar elemento
            </DialogTitle>
            <DialogDescription>
              Elegí un elemento del catálogo estándar y publicá tu precio y stock. Los profesionales te van a encontrar al buscar materiales.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <label htmlFor="pub-cat" className="text-[13px] font-bold text-[#0A2540]">Categoría</label>
              <select id="pub-cat" value={dlgCat} onChange={(e) => { setDlgCat(e.target.value); setElementId('') }}
                className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-3 min-h-[44px] text-sm">
                <option value="">Elegí una categoría…</option>
                {catalog.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="pub-elem" className="text-[13px] font-bold text-[#0A2540]">Elemento</label>
              <select id="pub-elem" value={elementId} onChange={(e) => setElementId(e.target.value)} disabled={!dlgCat}
                className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-3 min-h-[44px] text-sm disabled:text-slate-400">
                <option value="">{dlgCat ? 'Elegí un elemento…' : 'Primero elegí una categoría'}</option>
                {dlgElements.map((el) => <option key={el.id} value={el.id}>{el.name} — por {el.unit}</option>)}
              </select>
              {chosenElement && (
                <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                  <p>Se vende por <strong>{chosenElement.unit}</strong></p>
                  {chosenElement.description && <p className="leading-relaxed">{chosenElement.description}</p>}
                  {chosenElement.aliases.length > 0 && (
                    <p className="text-slate-400">También conocido como: {chosenElement.aliases.slice(0, 4).join(', ')}</p>
                  )}
                </div>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pub-price" className="text-[13px] font-bold text-[#0A2540]">Precio (ARS)</label>
                <input id="pub-price" type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0"
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-3 min-h-[44px] text-sm text-right tabular-nums" />
              </div>
              <div>
                <label htmlFor="pub-qty" className="text-[13px] font-bold text-[#0A2540]">Cantidad</label>
                <input id="pub-qty" type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0"
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-3 min-h-[44px] text-sm" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="pub-min" className="text-[13px] font-bold text-[#0A2540]">Stock mínimo</label>
                <input id="pub-min" type="number" min={0} value={minStock} onChange={(e) => setMinStock(e.target.value)}
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-3 min-h-[44px] text-sm" />
              </div>
              <div>
                <label htmlFor="pub-brand" className="text-[13px] font-bold text-[#0A2540]">Marca <span className="text-slate-400 font-semibold">(opcional)</span></label>
                <input id="pub-brand" value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej: Acero San Martín"
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-3 min-h-[44px] text-sm" />
              </div>
            </div>
            <button onClick={publish} disabled={busy} className="homy-btn-primary homy-focus w-full min-h-[48px] disabled:opacity-60">
              {busy ? 'Publicando…' : 'Publicar elemento'}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* confirmación de borrado */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de aparecer en las búsquedas de materiales de los profesionales. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={remove} className="bg-red-600 hover:bg-red-700 text-white">Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

/* Estado vacío del panel: icono flotante + copy claro */
function Empty({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="homy-empty rounded-3xl border-2 border-dashed border-[#0A2540]/10">
      <span className="homy-empty-icon homy-icon-chip homy-chip-blue [&_svg]:size-7" aria-hidden>{icon}</span>
      <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">{title}</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
