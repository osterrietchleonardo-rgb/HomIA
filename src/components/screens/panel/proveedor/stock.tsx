'use client'
// Gestión de stock del proveedor — el corazón del panel: precios, cantidades, mínimos y estado derivado
import { useEffect, useState } from 'react'
import { PageHeader, StatusBadge, Loading, EmptyState } from '@/components/app/ui-bits'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus, Search, Minus, Check, Trash2, Info, Package,
} from 'lucide-react'

type StockItem = {
  id: string; elementId: string; name: string; unit: string; category: string; categorySlug: string
  aliases: string[]; brand: string | null; price: number; quantity: number; minStock: number
  status: string; updatedAt: string
}

type CatalogCategory = {
  id: string; slug: string; name: string
  elements: { id: string; name: string; unit: string; aliases: string[] }[]
}

type Draft = { price?: string; qty?: string }

const STATUS_OPTIONS = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'por_agotar', label: 'Por agotar' },
  { value: 'agotado', label: 'Agotado' },
]

function rowTone(status: string): string {
  if (status === 'agotado') return 'border-red-300 bg-red-50/40'
  if (status === 'por_agotar') return 'border-amber-300 bg-amber-50/40'
  return 'border-slate-200 bg-white'
}

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
    if (q && !s.name.toLowerCase().includes(q.toLowerCase())) return false
    return true
  })

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
    patch(item.id, { price: n }, 'Precio actualizado ✓')
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
      toast.success('Elemento publicado ✓')
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
    <div>
      <PageHeader
        title="Stock"
        subtitle="Precios y cantidades de los elementos estándar del catálogo"
        right={
          <button onClick={() => setOpen(true)} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white font-bold px-5 py-2.5 flex items-center gap-2 transition shadow-lg shadow-[#FF5A1F]/20">
            <Plus className="size-4" /> Publicar elemento
          </button>
        }
      />

      {/* cómo funciona el estado */}
      <div className="rounded-2xl bg-[#1D63B8]/5 border border-[#1D63B8]/25 p-3.5 mb-4 flex gap-2.5 text-sm text-slate-600">
        <Info className="size-4 text-[#1D63B8] shrink-0 mt-0.5" />
        <p>
          El estado se calcula solo: si la cantidad baja del <strong>stock mínimo</strong> pasa a <strong>por agotar</strong>, y con <strong>0</strong> queda <strong>agotado</strong>. Repone desde acá cuando quieras.
        </p>
      </div>

      {/* filtros */}
      <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-4 mb-4 flex flex-col sm:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="size-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nombre…"
            className="w-full rounded-xl border border-slate-300 pl-10 pr-4 py-2.5 text-sm outline-none focus:border-[#1D63B8] focus:ring-2 focus:ring-[#1D63B8]/20" aria-label="Buscar elemento por nombre" />
        </div>
        <select value={cat} onChange={(e) => setCat(e.target.value)} aria-label="Filtrar por categoría"
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-[#0A2540] outline-none focus:border-[#1D63B8]">
          <option value="">Todas las categorías</option>
          {catOptions.map(([slug, name]) => <option key={slug} value={slug}>{name}</option>)}
        </select>
        <select value={statusF} onChange={(e) => setStatusF(e.target.value)} aria-label="Filtrar por estado"
          className="rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-[#0A2540] outline-none focus:border-[#1D63B8]">
          <option value="">Todos los estados</option>
          {STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </div>

      {/* listado */}
      {stock.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <EmptyState icon="📦" title="Todavía no publicaste elementos"
            hint="Elegí elementos del catálogo estándar (tornillos, caños, cables…) y publicá tu precio y stock. Los profesionales te van a encontrar al buscar materiales."
            action={
              <button onClick={() => setOpen(true)} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white font-bold px-5 py-2.5 mx-auto flex items-center gap-2 transition">
                <Plus className="size-4" /> Publicar el primero
              </button>
            } />
        </div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
          <EmptyState icon="🔍" title="Sin resultados"
            hint="Ningún elemento coincide con los filtros. Probá con otro nombre, categoría o estado."
            action={
              <button onClick={() => { setQ(''); setCat(''); setStatusF('') }} className="rounded-xl border border-slate-300 text-[#0A2540] font-bold px-5 py-2.5 hover:border-[#1D63B8] transition">
                Limpiar filtros
              </button>
            } />
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((s) => (
            <div key={s.id} className={`rounded-2xl border p-4 shadow-sm transition ${rowTone(s.status)}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-[#0A2540]">{s.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {s.category}{s.brand ? ` · ${s.brand}` : ''} · se vende por {s.unit}
                  </p>
                </div>
                <StatusBadge status={s.status} />
              </div>

              <div className="grid sm:grid-cols-3 gap-3 mt-3">
                {/* precio editable */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Precio (ARS)</label>
                  <div className="flex gap-1.5 mt-1">
                    <input type="number" min={0} value={drafts[s.id]?.price ?? String(s.price)}
                      onChange={(e) => setDraft(s.id, 'price', e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') savePrice(s) }}
                      className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]"
                      aria-label={`Precio de ${s.name}`} />
                    <button onClick={() => savePrice(s)} disabled={savingId === s.id} title="Guardar precio" aria-label={`Guardar precio de ${s.name}`}
                      className="rounded-xl bg-[#1D63B8] hover:bg-[#164e8c] disabled:opacity-50 text-white px-3.5 transition shrink-0">
                      <Check className="size-4" />
                    </button>
                  </div>
                </div>

                {/* cantidad con +1/-1 y edición */}
                <div>
                  <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Cantidad ({s.unit})</label>
                  <div className="flex gap-1.5 mt-1">
                    <button onClick={() => bump(s, -1)} disabled={savingId === s.id} title="Restar 1" aria-label={`Restar 1 a ${s.name}`}
                      className="rounded-xl border border-slate-300 bg-white w-11 grid place-items-center hover:border-[#FF5A1F] hover:text-[#FF5A1F] disabled:opacity-50 transition shrink-0">
                      <Minus className="size-4" />
                    </button>
                    <input type="number" min={0} value={drafts[s.id]?.qty ?? String(s.quantity)}
                      onChange={(e) => setDraft(s.id, 'qty', e.target.value)}
                      onBlur={() => saveQty(s)}
                      onKeyDown={(e) => { if (e.key === 'Enter') saveQty(s) }}
                      className="w-full min-w-0 rounded-xl border border-slate-300 bg-white px-2 py-2.5 text-sm text-center outline-none focus:border-[#1D63B8]"
                      aria-label={`Cantidad de ${s.name}`} />
                    <button onClick={() => bump(s, +1)} disabled={savingId === s.id} title="Sumar 1" aria-label={`Sumar 1 a ${s.name}`}
                      className="rounded-xl border border-slate-300 bg-white w-11 grid place-items-center hover:border-[#FF5A1F] hover:text-[#FF5A1F] disabled:opacity-50 transition shrink-0">
                      <Plus className="size-4" />
                    </button>
                  </div>
                </div>

                {/* mínimo + eliminar */}
                <div className="flex sm:flex-col sm:items-end justify-between gap-2">
                  <div>
                    <label className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Stock mínimo</label>
                    <p className="text-sm font-extrabold text-[#0A2540] mt-1">{s.minStock} {s.unit}</p>
                  </div>
                  <button onClick={() => setDeleteTarget(s)}
                    className="rounded-xl border border-slate-200 bg-white text-slate-400 hover:text-red-500 hover:border-red-300 px-3 py-2 flex items-center gap-1.5 text-sm font-semibold transition">
                    <Trash2 className="size-4" /> Eliminar
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* dialog publicar */}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><Package className="size-5 text-[#1D63B8]" /> Publicar elemento</DialogTitle>
            <DialogDescription>
              Elegí un elemento del catálogo estándar y publicá tu precio y stock. Los profesionales te van a encontrar al buscar materiales.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3.5">
            <div>
              <label className="text-sm font-semibold text-[#0A2540]">Categoría</label>
              <select value={dlgCat} onChange={(e) => { setDlgCat(e.target.value); setElementId('') }}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]">
                <option value="">Elegí una categoría…</option>
                {catalog.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-sm font-semibold text-[#0A2540]">Elemento</label>
              <select value={elementId} onChange={(e) => setElementId(e.target.value)} disabled={!dlgCat}
                className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8] disabled:bg-slate-50 disabled:text-slate-400">
                <option value="">{dlgCat ? 'Elegí un elemento…' : 'Primero elegí una categoría'}</option>
                {dlgElements.map((el) => <option key={el.id} value={el.id}>{el.name} ({el.unit})</option>)}
              </select>
              {chosenElement && (
                <p className="text-xs text-slate-400 mt-1">
                  Se vende por {chosenElement.unit}{chosenElement.aliases.length > 0 ? ` · también conocido como: ${chosenElement.aliases.slice(0, 3).join(', ')}` : ''}
                </p>
              )}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold text-[#0A2540]">Precio (ARS)</label>
                <input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
              </div>
              <div>
                <label className="text-sm font-semibold text-[#0A2540]">Cantidad</label>
                <input type="number" min={0} value={qty} onChange={(e) => setQty(e.target.value)} placeholder="0"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-semibold text-[#0A2540]">Stock mínimo</label>
                <input type="number" min={0} value={minStock} onChange={(e) => setMinStock(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
              </div>
              <div>
                <label className="text-sm font-semibold text-[#0A2540]">Marca <span className="text-slate-400 font-normal">(opcional)</span></label>
                <input value={brand} onChange={(e) => setBrand(e.target.value)} placeholder="Ej: Acero San Martín"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
              </div>
            </div>
            <button onClick={publish} disabled={busy}
              className="w-full rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] disabled:opacity-60 text-white font-bold py-3 transition">
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
