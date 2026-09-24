'use client'
// Gestión de stock del proveedor — el corazón del panel: precios, cantidades, mínimos y estado derivado
// El picker de elementos es un combobox con búsqueda difusa (sin acentos ni
// mayúsculas, por aliases y descripción) y permite AGREGAR AL CATÁLOGO el
// elemento faltante con explicación generada por IA (N7.1.1 + N7.1.2).
import { useEffect, useRef, useState } from 'react'
import { StatusBadge, Loading } from '@/components/app/ui-bits'
import { toast } from 'sonner'
import { apiFetch } from '@/lib/api-client'
import { matchTerms, matchScore } from '@/lib/search-match'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Plus, Search, Minus, Check, Trash2, Info, Package, PackageOpen, Sparkles, Loader2, Upload, Camera,
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type StockItem = {
  id: string; elementId: string; name: string; unit: string; category: string; categorySlug: string
  aliases: string[]; description: string | null; brand: string | null; imageUrl?: string | null; price: number; quantity: number; minStock: number
  status: string; updatedAt: string
}

type CatalogCategory = {
  id: string; slug: string; name: string
  elements: { id: string; name: string; unit: string; aliases: string[]; description?: string }[]
}

const UNIT_OPTIONS = ['unidad', 'metro', 'm2', 'm3', 'kg', 'litro', 'bolsa', 'paquete', 'caja', 'rollo', 'placa', 'par', 'juego', 'pack', 'tira', 'tambor', 'barra', 'bobina', 'millar', 'lata']

type Draft = { price?: string; qty?: string; min?: string; brand?: string }

const STATUS_OPTIONS = [
  { value: 'disponible', label: 'Disponible' },
  { value: 'por_agotar', label: 'Por agotar' },
  { value: 'agotado', label: 'Agotado' },
]

export default function ProviderStock() {
  const [stock, setStock] = useState<StockItem[]>([])
  const [catalog, setCatalog] = useState<CatalogCategory[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

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

  // combobox del picker + alta de elemento faltante con IA
  const [elemQuery, setElemQuery] = useState('')
  const [addingEl, setAddingEl] = useState(false)
  const [newElName, setNewElName] = useState('')
  const [newElCat, setNewElCat] = useState('')
  const [newElUnit, setNewElUnit] = useState('unidad')
  const [aiBusy, setAiBusy] = useState(false)

  // edición inline + borrado
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [savingId, setSavingId] = useState<string | null>(null)
  const [deleteTarget, setDeleteTarget] = useState<StockItem | null>(null)
  const [deleting, setDeleting] = useState(false)

  async function load() {
    const r = await apiFetch<{ stock: StockItem[] }>('/api/provider/stock')
    if (r.ok) { setStock(r.data?.stock || []); setLoadError(null) }
  }

  useEffect(() => {
    (async () => {
      try {
        const [rS, rC] = await Promise.all([
          apiFetch<{ stock: StockItem[] }>('/api/provider/stock', { silent: true }),
          apiFetch<{ categories: CatalogCategory[] }>('/api/catalog', { silent: true }),
        ])
        if (rS.ok) setStock(rS.data?.stock || [])
        else setLoadError(rS.error)
        if (rC.ok) setCatalog(rC.data?.categories || [])
      } finally { setLoading(false) }
    })()
  }, [])

  const catOptions = Object.entries(
    stock.reduce<Record<string, string>>((acc, s) => { acc[s.categorySlug] = s.category; return acc }, {})
  ).sort((a, b) => a[1].localeCompare(b[1]))

  const filtered = stock.filter((s) => {
    if (cat && s.categorySlug !== cat) return false
    if (statusF && s.status !== statusF) return false
    if (q && !matchTerms(q, [s.name, ...s.aliases, s.description || '', s.brand || '', s.category].join(' '))) return false
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
      const r = await apiFetch<{ stock?: StockItem }>('/api/provider/stock', { method: 'PATCH', json: { id, ...data } })
      if (!r.ok) return
      const st = r.data?.stock
      if (st) {
        setStock((prev) => prev.map((s) => s.id === id
          ? { ...s, price: st.price, quantity: st.quantity, minStock: st.minStock, status: st.status, brand: st.brand, imageUrl: st.imageUrl }
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

  function saveMin(item: StockItem) {
    const raw = drafts[item.id]?.min
    if (raw === undefined) return
    const n = Number(raw)
    if (raw === '' || Number.isNaN(n) || n < 0 || !Number.isInteger(n)) { toast.error('Ingresá un stock mínimo válido (número entero)'); clearDraft(item.id, 'min'); return }
    if (n === item.minStock) { clearDraft(item.id, 'min'); return }
    patch(item.id, { minStock: n }, 'Stock mínimo actualizado')
    clearDraft(item.id, 'min')
  }

  function saveBrand(item: StockItem) {
    const raw = drafts[item.id]?.brand
    if (raw === undefined) return
    const v = raw.trim()
    if (v.length > 80) { toast.error('La marca puede tener hasta 80 caracteres'); return }
    if (v === (item.brand || '')) { clearDraft(item.id, 'brand'); return }
    patch(item.id, { brand: v }, v ? 'Marca actualizada' : 'Marca quitada')
    clearDraft(item.id, 'brand')
  }

  function bump(item: StockItem, delta: number) {
    const next = Math.max(0, item.quantity + delta)
    if (next === item.quantity) return
    patch(item.id, { quantity: next })
  }

  function resetForm() {
    setDlgCat(''); setElementId(''); setPrice(''); setQty(''); setMinStock('5'); setBrand('')
    setElemQuery(''); setAddingEl(false); setNewElName(''); setNewElCat(''); setNewElUnit('unidad')
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
    if (!deleteTarget || deleting) return
    setDeleting(true)
    try {
      const r = await apiFetch(`/api/provider/stock?id=${deleteTarget.id}`, { method: 'DELETE' })
      if (!r.ok) return
      toast.success('Elemento eliminado')
      setDeleteTarget(null)
      load()
    } finally { setDeleting(false) }
  }

  async function reloadCatalog() {
    const res = await fetch('/api/catalog')
    if (res.ok) setCatalog((await res.json()).categories || [])
  }

  // N7.1.2 — alta de elemento faltante con explicación generada por IA
  async function createMissingElement() {
    const name = newElName.trim()
    if (name.length < 3) { toast.error('Escribí el nombre técnico del elemento'); return }
    if (!newElCat) { toast.error('Elegí la categoría del elemento'); return }
    setAiBusy(true)
    try {
      const cat = catalog.find((c) => c.id === newElCat)
      const res = await fetch('/api/catalog', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, categoryId: newElCat, unit: newElUnit }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error || 'No pudimos agregar el elemento'); return }
      await reloadCatalog()
      setElementId(d.element.id)
      setElemQuery(d.element.name)
      setAddingEl(false)
      toast.success(d.message || (d.existing ? 'Ya existía: te lo seleccionamos' : 'Elemento agregado al catálogo con explicación de la IA'), {
        description: cat ? `Categoría: ${cat.name}` : undefined,
      })
    } finally { setAiBusy(false) }
  }

  // Pool del combobox: si hay categoría elegida → solo esa; si no, TODO el catálogo.
  // Ranking por matchScore (tokens sin acentos ni mayúsculas sobre nombre + aliases + descripción).
  const pool = (dlgCat ? catalog.filter((c) => c.slug === dlgCat) : catalog).flatMap((c) =>
    c.elements.map((e) => ({ ...e, categoryName: c.name, categoryId: c.id }))
  )
  const nq = elemQuery.trim()
  const ranked = nq.length >= 2
    ? pool
        .map((e) => ({ e, s: matchScore(nq, [e.name, ...e.aliases, e.description || ''].join(' ')) }))
        .filter((x) => x.s > 0)
        .sort((a, b) => b.s - a.s || a.e.name.localeCompare(b.e.name))
        .slice(0, 12)
        .map((x) => x.e)
    : []
  const chosenElement = pool.find((e) => e.id === elementId)

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
            <div className="shrink-0">
              <Select value={cat || 'todas'} onValueChange={(v) => setCat(v === 'todas' ? '' : v)}>
                <SelectTrigger className="homy-glass-input rounded-xl px-3 py-2.5 min-h-[44px] text-sm font-semibold text-[#0A2540] border-none" aria-label="Filtrar por categoría">
                  <SelectValue placeholder="Todas las categorías" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="todas">Todas las categorías</SelectItem>
                  {catOptions.map(([slug, name]) => <SelectItem key={slug} value={slug}>{name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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
        {loadError ? (
          <Empty
            icon={<Info className="size-7" />}
            title="No pudimos cargar tu stock"
            hint={loadError}
            action={
              <button onClick={() => { load() }} className="homy-btn-dark homy-focus min-h-[44px] px-5 py-2.5 text-sm">
                Reintentar
              </button>
            }
          />
        ) : stock.length === 0 ? (
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
                    <MaterialPhotoUploader
                      initialUrl={s.imageUrl}
                      name={s.name}
                      onUpload={async (url) => {
                        await patch(s.id, { imageUrl: url }, 'Foto de material actualizada')
                      }}
                    />
                    <div className="min-w-0">
                      <p className="font-bold text-[#0A2540] leading-snug">{s.name}</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {s.category} · se vende por {s.unit}
                      </p>
                      <input value={drafts[s.id]?.brand ?? (s.brand || '')}
                        onChange={(e) => setDraft(s.id, 'brand', e.target.value)}
                        onBlur={() => saveBrand(s)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveBrand(s) }}
                        placeholder="Marca (opcional)" maxLength={80}
                        disabled={savingId === s.id}
                        aria-label={`Marca de ${s.name}`}
                        className="homy-glass-input mt-1.5 w-full max-w-[220px] rounded-lg px-2.5 py-1.5 min-h-[36px] text-xs font-semibold text-[#0A2540] disabled:opacity-60" />
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
                      <label htmlFor={`min-${s.id}`} className="block text-[11px] font-bold text-slate-400 uppercase tracking-[0.12em]">Stock mínimo</label>
                      <input id={`min-${s.id}`} type="number" min={0} step={1} inputMode="numeric"
                        value={drafts[s.id]?.min ?? String(s.minStock)}
                        onChange={(e) => setDraft(s.id, 'min', e.target.value)}
                        onBlur={() => saveMin(s)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveMin(s) }}
                        disabled={savingId === s.id}
                        className="homy-glass-input mt-1.5 w-24 rounded-xl px-3 py-2.5 min-h-[44px] text-sm font-bold text-[#0A2540] text-center tabular-nums disabled:opacity-60" />
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
              <label htmlFor="pub-cat" className="text-[13px] font-bold text-[#0A2540]">Categoría <span className="text-slate-400 font-semibold">(opcional, para acotar)</span></label>
              <div className="mt-1.5">
                <Select value={dlgCat || 'todas'} onValueChange={(v) => setDlgCat(v === 'todas' ? '' : v)}>
                  <SelectTrigger id="pub-cat" className="homy-glass-input w-full rounded-xl px-3 py-3 min-h-[44px] text-sm border-none">
                    <SelectValue placeholder="Todas las categorías" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="todas">Todas las categorías</SelectItem>
                    {catalog.map((c) => <SelectItem key={c.slug} value={c.slug}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <label htmlFor="pub-elem-search" className="text-[13px] font-bold text-[#0A2540]">Elemento</label>
              <div className="relative mt-1.5">
                <Search aria-hidden className="size-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input id="pub-elem-search" value={elemQuery}
                  onChange={(e) => { setElemQuery(e.target.value); setElementId('') }}
                  placeholder="Escribí: tornillo, membrana, cable…"
                  className="homy-glass-input w-full rounded-xl pl-10 pr-4 py-3 min-h-[44px] text-sm"
                  autoComplete="off" />
              </div>
              {/* Resultados difusos: sin mayúsculas, sin acentos, por aliases y descripción */}
              {!elementId && nq.length >= 2 && ranked.length > 0 && (
                <ul role="listbox" aria-label="Resultados del catálogo" className="mt-2 max-h-56 overflow-y-auto rounded-xl border border-[#0A2540]/10 divide-y divide-[#0A2540]/6 bg-white/70">
                  {ranked.map((el) => (
                    <li key={el.id}>
                      <button type="button" role="option" aria-selected={elementId === el.id}
                        onClick={() => setElementId(el.id)}
                        className="w-full text-left px-3.5 py-2.5 hover:bg-[#1D63B8]/6 transition">
                        <span className="block text-sm font-bold text-[#0A2540]">{el.name}</span>
                        <span className="block text-[11px] text-slate-500 mt-0.5">{el.categoryName} · se vende por {el.unit}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              {/* Ofrecer el alta con IA SIEMPRE que haya una búsqueda (los resultados
                  difusos pueden no ser exactamente lo que el proveedor vende) */}
              {!elementId && nq.length >= 3 && (
                <button type="button"
                  onClick={() => {
                    setAddingEl(true)
                    setNewElName(nq.charAt(0).toUpperCase() + nq.slice(1))
                    setNewElCat(dlgCat ? (catalog.find((c) => c.slug === dlgCat)?.id || '') : '')
                  }}
                  className="mt-2 w-full rounded-xl border-2 border-dashed border-[#1D63B8]/30 bg-[#1D63B8]/4 px-3.5 py-2.5 text-left text-[13px] font-bold text-[#1D63B8] hover:bg-[#1D63B8]/8 transition flex items-center gap-2">
                  <Sparkles className="size-4 shrink-0" aria-hidden />
                  {ranked.length > 0 ? `¿No es lo que buscás? Agregar “${nq}” al catálogo con IA` : `No encontramos “${nq}”: agregarlo al catálogo con IA`}
                </button>
              )}
              {!elementId && nq.length < 2 && (
                <p className="text-xs text-slate-500 mt-1.5">Escribí dos letras o más para buscar entre {pool.length} elementos del catálogo.</p>
              )}
              {elementId && chosenElement && (
                <div className="text-xs text-slate-500 mt-1.5 space-y-0.5">
                  <p><strong className="text-[#0A2540]">{chosenElement.name}</strong> · {chosenElement.categoryName}</p>
                  <p>Se vende por <strong>{chosenElement.unit}</strong></p>
                  {chosenElement.description && <p className="leading-relaxed">{chosenElement.description}</p>}
                  {chosenElement.aliases.length > 0 && (
                    <p className="text-slate-400">También conocido como: {chosenElement.aliases.slice(0, 4).join(', ')}</p>
                  )}
                </div>
              )}
            </div>
            {/* Alta de elemento faltante con IA */}
            {addingEl && (
              <div className="rounded-xl border border-[#1D63B8]/25 bg-[#1D63B8]/5 p-4 space-y-3">
                <p className="text-[13px] font-bold text-[#0A2540] flex items-center gap-1.5">
                  <Sparkles className="size-4 text-[#0092c4]" aria-hidden /> Nuevo elemento del catálogo
                </p>
                <div>
                  <label htmlFor="new-el-name" className="text-[13px] font-bold text-[#0A2540]">Nombre técnico</label>
                  <input id="new-el-name" value={newElName} onChange={(e) => setNewElName(e.target.value)}
                    placeholder="Ej: Tarugo Fischer 8mm"
                    className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-3 min-h-[44px] text-sm" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="new-el-cat" className="text-[13px] font-bold text-[#0A2540]">Categoría</label>
                    <div className="mt-1.5">
                      <Select value={newElCat} onValueChange={setNewElCat}>
                        <SelectTrigger id="new-el-cat" className="homy-glass-input w-full rounded-xl px-3 py-3 min-h-[44px] text-sm border-none">
                          <SelectValue placeholder="Elegí…" />
                        </SelectTrigger>
                        <SelectContent>
                          {catalog.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div>
                    <label htmlFor="new-el-unit" className="text-[13px] font-bold text-[#0A2540]">Unidad de venta</label>
                    <div className="mt-1.5">
                      <Select value={newElUnit} onValueChange={setNewElUnit}>
                        <SelectTrigger id="new-el-unit" className="homy-glass-input w-full rounded-xl px-3 py-3 min-h-[44px] text-sm border-none">
                          <SelectValue placeholder="Elegí unidad" />
                        </SelectTrigger>
                        <SelectContent>
                          {UNIT_OPTIONS.map((u) => <SelectItem key={u} value={u}>{u}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 leading-relaxed">La IA genera la descripción natural y los aliases para que clientes, profesionales y otros proveedores lo encuentren aunque lo busquen con otro nombre.</p>
                <div className="flex gap-2">
                  <button type="button" onClick={createMissingElement} disabled={aiBusy}
                    className="homy-btn-primary homy-focus flex-1 min-h-[44px] text-[13px] disabled:opacity-60">
                    {aiBusy ? 'Generando con IA…' : 'Agregar al catálogo'}
                  </button>
                  <button type="button" onClick={() => setAddingEl(false)} disabled={aiBusy}
                    className="homy-glass-soft homy-focus rounded-xl min-h-[44px] px-4 text-sm font-bold text-slate-500">
                    Cancelar
                  </button>
                </div>
              </div>
            )}
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
      <AlertDialog open={!!deleteTarget} onOpenChange={(v) => { if (!v && !deleting) setDeleteTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Eliminar “{deleteTarget?.name}”?</AlertDialogTitle>
            <AlertDialogDescription>
              Deja de aparecer en las búsquedas de materiales de los profesionales. Esta acción no se puede deshacer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); remove() }} disabled={deleting} className="bg-red-600 hover:bg-red-700 text-white disabled:opacity-60">{deleting ? 'Eliminando…' : 'Eliminar'}</AlertDialogAction>
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

function MaterialPhotoUploader({ initialUrl, name, onUpload }: { initialUrl?: string | null, name: string, onUpload: (url: string) => Promise<void> }) {
  const [loading, setLoading] = useState(false)
  const ref = useRef<HTMLInputElement>(null)

  const handleFile = async (files: FileList | null) => {
    if (!files || files.length === 0) return
    const file = files[0]
    setLoading(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      const res = await fetch('/api/uploads', { method: 'POST', body: formData })
      if (!res.ok) throw new Error()
      const data = await res.json()
      await onUpload(data.url)
    } catch {
      toast.error('No se pudo subir la foto del material')
    } finally {
      setLoading(false)
    }
  }

  return (
    <button type="button" disabled={loading} aria-label={initialUrl ? `Cambiar foto de ${name}` : `Subir foto de ${name}`} aria-busy={loading}
      className="homy-focus relative size-12 shrink-0 rounded-xl overflow-hidden group cursor-pointer border border-[#0A2540]/10 bg-white disabled:cursor-wait"
      onClick={() => ref.current?.click()}>
      {initialUrl ? (
        <img src={initialUrl} alt="" className="object-cover w-full h-full" />
      ) : (
        <span aria-hidden className="homy-icon-chip homy-chip-blue size-full flex items-center justify-center [&_svg]:size-5 rounded-none">
          <Camera className="text-[#1D63B8]" />
        </span>
      )}
      <span aria-hidden className={`absolute inset-0 bg-black/50 flex items-center justify-center transition-opacity ${loading ? 'opacity-100' : 'opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'}`}>
        {loading ? <Loader2 className="size-5 text-white animate-spin" /> : <Upload className="size-5 text-white" />}
      </span>
      <input ref={ref} type="file" className="hidden" accept="image/jpeg,image/png,image/webp" tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        onChange={(e) => { handleFile(e.target.files); e.target.value = '' }} />
    </button>
  )
}
