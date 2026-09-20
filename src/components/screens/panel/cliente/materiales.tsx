'use client'
// Materiales del cliente — marketplace de insumos sin contratar a nadie:
// buscás lo que necesitás, ves TODAS las ofertas con precio, stock, reseñas y
// distancia del proveedor, pedís el producto (abre el chat) y seguís tus
// compras hasta pagar (Mercado Pago o efectivo) y reseñar al proveedor.
import { useCallback, useEffect, useRef, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useLocation } from '@/lib/store'
import { Loading, EmptyState, UAvatar, UStars, VerifyBadge } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { formatDistance } from '@/lib/geo'
import ReviewForm from '../review-form'
import { toast } from 'sonner'
import {
  Search, Package, ShoppingBag, Store, MapPin, X, Star, Send, MessageCircle,
  Banknote, CircleCheck, Hourglass, Undo2, Truck, Boxes,
} from 'lucide-react'

type Offer = {
  stockId: string; elementId: string; price: number; quantity: number; brand: string | null
  providerId: string; businessName: string; kind: string
  providerUserId: string; providerAvatar: string | null; providerCity: string | null
  providerRating: number; providerReviews: number; providerVerified: boolean
  planPro: boolean; distanceKm?: number
}
type Result = {
  elementId: string; name: string; description: string; aliases: string[]; unit: string
  categorySlug: string; categoryName: string
  offersCount: number; minPrice: number | null; maxPrice: number | null; hasPro: boolean
  offers: Offer[]
}
type Purchase = {
  id: string; elementName: string; quantity: number; unit: string; total: number
  status: string; note?: string | null; chargeId?: string | null; createdAt: string
  provider?: { id: string; businessName: string; userId: string }
  client?: { id: string; displayName: string }
}

const CATEGORY_TABS = [
  { slug: '', name: 'Todo' }, { slug: 'plomeria', name: 'Plomería' },
  { slug: 'gasistas', name: 'Gas' }, { slug: 'electricistas', name: 'Electricidad' },
  { slug: 'albanileria', name: 'Albañilería' }, { slug: 'durlock', name: 'Durlock' },
  { slug: 'pintura', name: 'Pintura' }, { slug: 'herreria', name: 'Ferretería' },
  { slug: 'herramientas', name: 'Herramientas' }, { slug: 'maderera', name: 'Maderera' },
  { slug: 'carpinteria', name: 'Carpintería' }, { slug: 'techos', name: 'Techos' },
  { slug: 'cerramientos', name: 'Aberturas' }, { slug: 'pisos', name: 'Pisos' },
  { slug: 'aislacion', name: 'Aislación' }, { slug: 'iluminacion', name: 'Iluminación' },
  { slug: 'climatizacion', name: 'Clima' }, { slug: 'jardineria', name: 'Jardín' },
  { slug: 'limpieza', name: 'Limpieza' }, { slug: 'muebles', name: 'Muebles' },
  { slug: 'seguridad', name: 'Seguridad' },
]

const STATUS_META: Record<string, { label: string; icon: typeof Hourglass; tone: string }> = {
  solicitado: { label: 'Pedido enviado', icon: Hourglass, tone: 'text-[#B98A00] bg-[#FFC700]/12 ring-[#FFC700]/35' },
  aceptado: { label: 'Aceptado por el proveedor', icon: CircleCheck, tone: 'text-[#1D63B8] bg-[#1D63B8]/10 ring-[#1D63B8]/30' },
  entregado: { label: 'Listo para pagar', icon: Truck, tone: 'text-[#FF5A1F] bg-[#FF5A1F]/10 ring-[#FF5A1F]/30' },
  pagado: { label: 'Pagado', icon: CircleCheck, tone: 'text-[#0e9f6e] bg-[#0e9f6e]/10 ring-[#0e9f6e]/30' },
  cancelado: { label: 'Cancelado', icon: Undo2, tone: 'text-slate-500 bg-slate-500/10 ring-slate-400/30' },
}

export default function ClientMaterials() {
  const route = useRoute()
  const location = useLocation()
  const [tab, setTab] = useState<'buscar' | 'compras'>(route.query.tab === 'compras' ? 'compras' : 'buscar')
  const [q, setQ] = useState(route.query.q || '')
  const [cat, setCat] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchases, setPurchases] = useState<Purchase[] | null>(null)
  const [searched, setSearched] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)

  // diálogo de pedido
  const [dlg, setDlg] = useState<{ offer: Offer; elementName: string; unit: string } | null>(null)
  const [dlgQty, setDlgQty] = useState('1')
  const [dlgNote, setDlgNote] = useState('')
  const [busy, setBusy] = useState(false)
  // diálogo de reseña (comparte el formulario 360° con estrellas + comentario + fotos)
  const [rv, setRv] = useState<Purchase | null>(null)

  const loadPurchases = useCallback(async () => {
    try {
      const res = await fetch('/api/purchases')
      if (res.ok) setPurchases((await res.json()).purchases)
    } catch { /* silencioso */ }
  }, [])

  const search = useCallback(async (query: string, category: string) => {
    setLoading(true)
    try {
      const params = new URLSearchParams({ q: query, cat: category })
      if (location.lat && location.lng) {
        params.set('lat', String(location.lat))
        params.set('lng', String(location.lng))
        params.set('radius', String(location.radiusKm))
      }
      const res = await fetch(`/api/marketplace?${params}`)
      if (res.ok) {
        setResults((await res.json()).results)
        setSearched(true)
      }
    } finally {
      setLoading(false)
    }
  }, [location.lat, location.lng, location.radiusKm])

  useEffect(() => {
    if (tab !== 'buscar') return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => void search(q, cat), 350)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [q, cat, tab, search])

  useEffect(() => {
    if (tab === 'compras') loadPurchases()
  }, [tab, loadPurchases])

  async function pedir(e: React.FormEvent) {
    e.preventDefault()
    if (!dlg) return
    const qty = parseFloat(dlgQty)
    if (!qty || qty <= 0) { toast.error('Decinos cuánto necesitás'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId: dlg.offer.stockId, quantity: qty, note: dlgNote || undefined }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo enviar el pedido'); return }
      toast.success('Pedido enviado', { description: `${dlg.elementName} × ${qty} ${dlg.unit} — te respondió el chat directo con ${dlg.offer.businessName}.` })
      setDlg(null); setDlgQty('1'); setDlgNote('')
      void loadPurchases()
    } finally {
      setBusy(false)
    }
  }

  async function cancelar(p: Purchase) {
    if (!confirm('¿Cancelar este pedido?')) return
    const res = await fetch(`/api/purchases/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'cancelar' }),
    })
    const data = await res.json()
    if (!res.ok) { toast.error(data.error); return }
    toast.info('Pedido cancelado')
    void loadPurchases()
  }

  async function pagarCharge(p: Purchase, method: 'mercadopago' | 'efectivo') {
    if (!p.chargeId) return
    setBusy(true)
    try {
      const res = await fetch(`/api/charges/${p.chargeId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ method }),
      })
      const data = await res.json()
      if (!res.ok) {
        if (data.needsConfig) toast.error('Mercado Pago no configurado en el servidor')
        else toast.error(data.error)
        return
      }
      if (method === 'mercadopago' && data.initPoint) {
        window.open(data.initPoint, '_blank')
        toast.info('Te abrimos Mercado Pago para completar el pago')
      } else {
        toast.success('Efectivo acordado', { description: 'El proveedor confirma cuando recibe el pago.' })
      }
      void loadPurchases()
    } finally {
      setBusy(false)
    }
  }

  const hasReseña = async (p: Purchase) => {
    const res = await fetch(`/api/reviews?purchaseId=${p.id}`)
    if (!res.ok) return false
    return ((await res.json()).reviews || []).length > 0
  }

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <p className="homy-eyebrow">Materiales</p>
        <h1 className="homy-page-title mt-1.5">Comprá insumos directo a proveedores</h1>
        <p className="homy-page-sub">
          Buscá lo que necesitás — con o sin obra de por medio — y comprá a la ferretería, corralón o casa
          de tu rubro que mejor te convenga: precio, stock real, reseñas y distancia de cada uno.
        </p>
      </header>

      {/* tabs buscar / compras */}
      <div role="tablist" aria-label="Secciones de materiales" className="mb-5 flex gap-1 rounded-full bg-white/[0.06] ring-1 ring-[#0A2540]/10 p-1 w-fit max-w-full overflow-x-auto no-scrollbar">
        {(['buscar', 'compras'] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => { setTab(t); navigate(t === 'compras' ? '/panel/cliente/materiales?tab=compras' : '/panel/cliente/materiales', { replace: true }) }}
            className="homy-tab shrink-0"
          >
            {t === 'buscar' ? <Search className="size-4" aria-hidden /> : <ShoppingBag className="size-4" aria-hidden />}
            {t === 'buscar' ? 'Buscar materiales' : 'Mis compras'}
            {t === 'compras' && purchases && purchases.some((p) => ['entregado', 'solicitado'].includes(p.status)) && (
              <span className="homy-badge-pop ml-1 grid size-[18px] place-items-center rounded-full bg-[#FF5A1F] text-[10px] font-extrabold text-white">
                {purchases.filter((p) => ['entregado', 'solicitado'].includes(p.status)).length}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'buscar' ? (
        <>
          {/* buscador */}
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="¿Qué necesitás comprar? ej: cemento, membrana, cables…"
              aria-label="Buscar materiales"
              className="homy-glass-input w-full rounded-full py-3.5 pl-11 pr-10 text-[15px]"
            />
            {q && (
              <button onClick={() => setQ('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-white/70 hover:text-[#0A2540] transition">
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          {/* categorías */}
          <div className="mb-6 flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
            {CATEGORY_TABS.map((c) => (
              <button key={c.slug} onClick={() => setCat(c.slug)} aria-pressed={cat === c.slug} className="homy-tab shrink-0 min-h-[38px]">
                {c.name}
              </button>
            ))}
          </div>

          {loading && !results ? (
            <Loading text="Buscando ofertas…" />
          ) : results && results.length === 0 ? (
            <EmptyState
              icon={<Package />}
              title={searched ? 'No encontramos ese producto en stock' : 'Buscá lo que necesitás'}
              hint={searched ? 'Probá con otra palabra (ej: “cemento” en vez de “Loma Negra 50kg”) o mirá por categoría.' : 'Escribí el insumo que necesitás y te mostramos todas las ofertas de los proveedores de la comunidad.'}
            />
          ) : (
            <>
              {/* Ofertas con stock publicado: tarjetas completas con proveedores */}
              <div className="space-y-4">
                {results?.filter((r) => r.offersCount > 0).map((r) => (
                <article key={r.elementId} className="homy-glass homy-lift rounded-3xl p-4 sm:p-5">
                  {/* elemento + explicación */}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="text-[17px] font-extrabold text-[#0A2540] leading-snug">{r.name}</h3>
                      <p className="mt-0.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{r.categoryName} · se vende por {r.unit}</p>
                    </div>
                    {r.hasPro && (
                      <span className="shrink-0 rounded-full bg-gradient-to-r from-[#FFC700] to-[#ffd84d] px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-widest text-[#6b4d00] shadow-sm">
                        ★ Recomendado
                      </span>
                    )}
                  </div>
                  {r.description && <p className="mt-1.5 text-[13.5px] leading-relaxed text-slate-500">{r.description}</p>}

                  {/* ofertas por proveedor (siempre hay: esta lista solo muestra con stock) */}
                  {r.offers.length === 0 ? null : (
                    <ul className="mt-3 space-y-2.5">
                      {r.offers.map((o) => (
                        <li key={o.stockId} className={`rounded-2xl p-3.5 ring-1 transition ${o.planPro ? 'bg-[#FFC700]/8 ring-[#FFC700]/45' : 'bg-[#0A2540]/3 ring-[#0A2540]/8'}`}>
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div className="flex min-w-0 flex-1 items-start gap-3">
                              <UAvatar name={o.businessName} url={o.providerAvatar} size={40} />
                              <div className="min-w-0">
                                <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-extrabold text-[#0A2540] leading-snug">
                                  {o.businessName}
                                  <VerifyBadge status={o.providerVerified ? 'verificado' : 'none'} />
                                  {o.planPro && (
                                    <span className="rounded-full bg-gradient-to-r from-[#FFC700] to-[#ffd84d] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-[#6b4d00]">Recomendado</span>
                                  )}
                                </p>
                                <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-slate-500">
                                  <span className="inline-flex items-center gap-1"><MapPin className="size-3 shrink-0 text-[#FF5A1F]" aria-hidden />{o.providerCity || 'Argentina'}{o.distanceKm != null ? ` · ${formatDistance(o.distanceKm)}` : ''}</span>
                                  <span className="inline-flex items-center gap-1"><Store className="size-3 shrink-0 text-slate-400" aria-hidden />{o.providerReviews} reseñas</span>
                                </p>
                                <div className="mt-1 flex items-center gap-1.5">
                                  <UStars rating={o.providerRating} size="text-xs" />
                                  <span className="text-xs font-bold text-slate-600 tabular-nums">{o.providerRating > 0 ? o.providerRating : '—'}</span>
                                </div>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="homy-num-adapt text-[17px] font-extrabold text-[#0A2540] tabular-nums">{formatARS(o.price)}</p>
                              <p className="text-[11px] font-bold text-slate-400">por {r.unit} · stock: {o.quantity}</p>
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button
                              onClick={() => { setDlg({ offer: o, elementName: r.name, unit: r.unit }); setDlgQty('1'); setDlgNote('') }}
                              className="homy-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-xs"
                            >
                              <ShoppingBag className="size-3.5" aria-hidden /> Pedir este producto
                            </button>
                            <button
                              onClick={() => navigate(`/mensajes?c=nuevo:${o.providerUserId}`)}
                              className="homy-glass-soft inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-xs font-bold text-[#1D63B8] hover:bg-white transition"
                            >
                              <MessageCircle className="size-3.5" aria-hidden /> Preguntarle
                            </button>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              ))}
              </div>

              {/* Elementos que concuerdan pero hoy no tienen stock publicado:
                  quedan a un clic, sin diluir las ofertas reales */}
              {results && results.some((r) => r.offersCount === 0) && (
                <details className="homy-glass-soft group rounded-2xl px-4 py-3.5">
                  <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-[#1D63B8]">
                    <Package className="size-4 shrink-0 text-slate-400" aria-hidden />
                    Ver {results.filter((r) => r.offersCount === 0).length} elemento{results.filter((r) => r.offersCount === 0).length === 1 ? '' : 's'} similar{results.filter((r) => r.offersCount === 0).length === 1 ? '' : 'es'} sin stock publicado ahora
                    <span aria-hidden className="ml-auto text-xs text-slate-400 transition group-open:rotate-180">▾</span>
                  </summary>
                  <ul className="mt-3 space-y-1.5 border-t border-[#0A2540]/8 pt-3">
                    {results.filter((r) => r.offersCount === 0).map((r) => (
                      <li key={r.elementId} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                        <span className="font-bold text-[#0A2540]">{r.name}</span>
                        <span className="text-slate-400">· {r.categoryName}</span>
                        <span className="text-[12px] text-slate-400 min-w-0 flex-1 basis-full sm:basis-0">{r.description ? r.description.slice(0, 110) + (r.description.length > 110 ? '…' : '') : ''}</span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-3 text-[12px] text-slate-400">Cuando un proveedor publique stock de estos elementos, van a aparecer arriba con su precio.</p>
                </details>
              )}
            </>
          )}
        </>
      ) : (
        /* ── MIS COMPRAS ── */
        purchases === null ? (
          <Loading text="Cargando tus compras…" />
        ) : purchases.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag />}
            title="Todavía no hiciste compras"
            hint="Cuando pidas un insumo desde Buscar materiales, acá vas a seguir el pedido hasta el pago y la reseña."
          />
        ) : (
          <div className="space-y-3">
            <p className="homy-page-sub -mt-2">Así funciona: pedís → el proveedor acepta y entrega → pagás (Mercado Pago o efectivo) → calificás tu compra. Todo queda registrado.</p>
            {purchases.map((p) => (
              <PurchaseCard
                key={p.id}
                p={p}
                busy={busy}
                onCancel={() => cancelar(p)}
                onPay={(m) => pagarCharge(p, m)}
                onReview={() => setRv(p)}
                hasReview={hasReseña}
              />
            ))}
          </div>
        )
      )}

      {/* ── diálogo: pedir producto ── */}
      {dlg && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0A2540]/45 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Pedir producto">
          <form onSubmit={pedir} className="homy-glass-strong w-full max-w-md rounded-t-3xl p-5 sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="homy-eyebrow">Pedir producto</p>
                <h3 className="mt-0.5 text-lg font-extrabold text-[#0A2540]">{dlg.elementName}</h3>
                <p className="text-[13px] text-slate-500">{dlg.offer.businessName} · {formatARS(dlg.offer.price)} por {dlg.unit}</p>
              </div>
              <button type="button" onClick={() => setDlg(null)} aria-label="Cerrar" className="grid size-9 place-items-center rounded-full text-slate-400 hover:bg-white/70 hover:text-[#0A2540] transition">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <label className="mt-4 block text-xs font-extrabold uppercase tracking-wider text-slate-400" htmlFor="ped-cant">
              Cantidad ({dlg.unit})
            </label>
            <input
              id="ped-cant"
              type="number" min="0.5" step="0.5" inputMode="decimal"
              value={dlgQty}
              onChange={(e) => setDlgQty(e.target.value)}
              className="homy-glass-input mt-1.5 w-full rounded-2xl px-4 py-3 text-[15px]"
              autoFocus
            />
            <label className="mt-3 block text-xs font-extrabold uppercase tracking-wider text-slate-400" htmlFor="ped-nota">
              Aclaración (opcional)
            </label>
            <textarea
              id="ped-nota"
              value={dlgNote}
              onChange={(e) => setDlgNote(e.target.value)}
              rows={2}
              maxLength={400}
              placeholder="Marca, medida, color, cuándo lo necesitás…"
              className="homy-glass-input mt-1.5 w-full rounded-2xl px-4 py-3 text-sm"
            />
            <div className="mt-3 rounded-2xl bg-[#1D63B8]/8 px-4 py-3 text-[12.5px] leading-relaxed text-slate-600">
              Tu pedido y tu consulta van directo al <b>chat del proveedor</b> (vos siempre iniciás el contacto). El pago lo hacés después,
              cuando te avise que está listo: <b>Mercado Pago o efectivo</b>.
            </div>
            <button type="submit" disabled={busy} className="homy-btn-primary mt-4 w-full px-6 py-3.5 text-[15px] disabled:opacity-50">
              <Send className="size-4" aria-hidden /> Enviar pedido
            </button>
          </form>
        </div>
      )}

      {/* ── diálogo: reseña de compra (estrellas + comentario + fotos que avalan) ── */}
      {rv && rv.provider && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0A2540]/60 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label="Calificar compra">
          <div className="relative w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl">
            <button
              type="button"
              onClick={() => setRv(null)}
              aria-label="Cerrar"
              className="absolute right-3 top-3 z-10 grid size-9 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20 transition"
            >
              <X className="size-4" aria-hidden />
            </button>
            <ReviewForm
              targetUserId={rv.provider.userId}
              targetName={rv.provider.businessName}
              targetLabel="al proveedor"
              purchaseId={rv.id}
              onDone={() => { setRv(null); void loadPurchases() }}
            />
          </div>
        </div>
      )}
    </div>
  )
}

function PurchaseCard({ p, busy, onCancel, onPay, onReview, hasReview }: {
  p: Purchase
  busy: boolean
  onCancel: () => void
  onPay: (m: 'mercadopago' | 'efectivo') => void
  onReview: () => void
  hasReview: (p: Purchase) => Promise<boolean>
}) {
  const [reviewed, setReviewed] = useState(false)
  useEffect(() => {
    if (['entregado', 'pagado'].includes(p.status)) hasReview(p).then(setReviewed).catch(() => null)
  }, [p, hasReview])

  const meta = STATUS_META[p.status] || STATUS_META.solicitado
  const Icon = meta.icon
  const formatted = new Date(p.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })

  return (
    <article className="homy-glass rounded-3xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[16px] font-extrabold text-[#0A2540] leading-snug">{p.elementName} × {p.quantity} {p.unit}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {p.provider?.businessName} · {formatted}{p.note ? ` · “${p.note}”` : ''}
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold ring-1 ${meta.tone}`}>
          <Icon className="size-3.5" aria-hidden /> {meta.label}
        </span>
      </div>
      {p.total > 0 && (
        <p className="mt-1.5 text-sm font-extrabold text-[#0A2540] tabular-nums">{formatARS(p.total)}</p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {p.status === 'solicitado' && (
          <button onClick={onCancel} className="homy-glass-soft inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-xs font-bold text-slate-500 hover:text-red-600 transition">
            <Undo2 className="size-3.5" aria-hidden /> Cancelar pedido
          </button>
        )}
        {p.status === 'aceptado' && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#1D63B8]/8 px-4 py-2 text-xs font-bold text-[#1D63B8]">
            <Hourglass className="size-3.5" aria-hidden /> Esperando que prepare tu pedido
          </span>
        )}
        {p.status === 'entregado' && p.chargeId && (
          <>
            <button disabled={busy} onClick={() => onPay('mercadopago')} className="homy-btn-primary inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-xs">
              Pagar con Mercado Pago
            </button>
            <button disabled={busy} onClick={() => onPay('efectivo')} className="homy-btn-dark inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-xs">
              <Banknote className="size-3.5" aria-hidden /> Efectivo
            </button>
          </>
        )}
        {p.status === 'pagado' && !reviewed && (
          <button onClick={onReview} className="homy-btn-primary inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-xs">
            <Star className="size-3.5" aria-hidden /> Calificar tu compra
          </button>
        )}
        {p.status === 'pagado' && reviewed && (
          <span className="inline-flex items-center gap-1.5 rounded-full bg-[#0e9f6e]/10 px-4 py-2 text-xs font-bold text-[#0e9f6e]">
            <CircleCheck className="size-3.5" aria-hidden /> Ya calificaste esta compra
          </span>
        )}
        {p.provider && (
          <button onClick={() => navigate(`/mensajes?c=nuevo:${p.provider!.userId}`)} className="homy-glass-soft ml-auto inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-xs font-bold text-[#1D63B8] transition hover:bg-white">
            <MessageCircle className="size-3.5" aria-hidden /> Chatear
          </button>
        )}
      </div>
    </article>
  )
}
