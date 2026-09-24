'use client'
// Materiales del cliente (y del profesional) — marketplace de insumos sin contratar
// a nadie: buscás lo que necesitás, ves TODAS las ofertas con precio, stock, reseñas
// y distancia del proveedor, pedís (reserva 48 h o compra con 7 días para retirar),
// el proveedor aprueba, pagás (Mercado Pago del proveedor o efectivo al retirar) y
// después de la entrega calificás la compra.
import { useCallback, useEffect, useRef, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useLocation, useSession } from '@/lib/store'
import { Loading, EmptyState, UAvatar, UStars, VerifyBadge } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { formatDistance } from '@/lib/geo'
import ReviewForm from '../review-form'
import SobrantesSection from '../sobrantes-section'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Search, Package, ShoppingBag, Store, MapPin, X, Star, Send, MessageCircle,
  Banknote, CircleCheck, Hourglass, Undo2, Truck, Trophy, CreditCard, Ban, Clock,
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
type Comparable = {
  stockId: string; elementId: string; elementName: string; unit: string; price: number; quantity: number
  brand: string | null; providerId: string; providerName: string; providerCity?: string | null
  providerUserId?: string; distanceKm?: number
}
type Charge = { id: string; number: string; status: string; method: string | null; paidAt: string | null; amount: number }
type Purchase = {
  id: string; elementName: string; quantity: number; unit: string; unitPrice: number; total: number
  status: string; type: 'compra' | 'reserva'; note?: string | null; chargeId?: string | null; createdAt: string; updatedAt?: string
  rejectionReason?: string | null; reservationExpiresAt?: string | null; paymentMethod?: string | null
  charge?: Charge | null
  provider?: { id: string; businessName: string; userId: string; mpOauthStatus?: string }
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
  pendiente_aprobacion: { label: 'Esperando al proveedor', icon: Hourglass, tone: 'text-[#B98A00] bg-[#FFC700]/12 ring-[#FFC700]/35' },
  aprobado: { label: 'Aprobado: pagá para retirar', icon: CircleCheck, tone: 'text-[#1D63B8] bg-[#1D63B8]/10 ring-[#1D63B8]/30' },
  rechazado: { label: 'Rechazado por el proveedor', icon: Ban, tone: 'text-red-600 bg-red-500/10 ring-red-500/30' },
  entregado: { label: 'Entregado: falta el pago', icon: Truck, tone: 'text-[#FF5A1F] bg-[#FF5A1F]/10 ring-[#FF5A1F]/30' },
  pagado: { label: 'Pagado', icon: CircleCheck, tone: 'text-[#0e9f6e] bg-[#0e9f6e]/10 ring-[#0e9f6e]/30' },
  cancelado: { label: 'Cancelado', icon: Undo2, tone: 'text-slate-500 bg-slate-500/10 ring-slate-400/30' },
}
const PENDING_STATES = ['pendiente_aprobacion', 'aprobado']

type Tab = 'buscar' | 'compras' | 'comparables'

async function readJson(res: Response): Promise<Record<string, any>> {
  try { return await res.json() } catch { return {} }
}

export default function ClientMaterials({ role = 'cliente' }: { role?: 'cliente' | 'profesional' }) {
  const route = useRoute()
  const location = useLocation()
  const { user } = useSession()
  const basePath = `/panel/${role}/materiales`
  // la pestaña Comparables es del panel profesional (y solo si la sesión tiene ese rol)
  const showComparables = role === 'profesional' && (!user || user.roles.includes('profesional'))
  const tabs: Tab[] = showComparables ? ['buscar', 'comparables', 'compras'] : ['buscar', 'compras']

  const [tab, setTab] = useState<Tab>(
    route.query.tab === 'compras' ? 'compras' : route.query.tab === 'comparables' && showComparables ? 'comparables' : 'buscar'
  )
  const [q, setQ] = useState(route.query.q || '')
  const [cat, setCat] = useState('')
  const [results, setResults] = useState<Result[] | null>(null)
  const [loading, setLoading] = useState(true)
  const [purchases, setPurchases] = useState<Purchase[] | null>(null)
  const [purchasesError, setPurchasesError] = useState(false)
  const [searched, setSearched] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  // deep link: ?stock=<id> abre el diálogo de pedido de esa oferta apenas carguen los resultados
  const pendingStock = useRef<string | null>(route.query.stock || null)
  const pendingType = useRef<'compra' | 'reserva'>(route.query.tipo === 'reserva' ? 'reserva' : 'compra')

  // Comparables (solo profesionales)
  const [comparables, setComparables] = useState<Comparable[]>([])
  const [averagePrice, setAveragePrice] = useState(0)
  const [loadingCmp, setLoadingCmp] = useState(false)

  // diálogo de pedido
  const [dlg, setDlg] = useState<{ offer: Offer; elementName: string; unit: string; type: 'compra' | 'reserva' } | null>(null)
  const [dlgQty, setDlgQty] = useState('1')
  const [dlgNote, setDlgNote] = useState('')
  const [busy, setBusy] = useState(false)
  // confirmación de cancelación (AlertDialog del design system)
  const [cancelTarget, setCancelTarget] = useState<Purchase | null>(null)
  // proveedores que respondieron "sin MP" en esta sesión: mostrar solo efectivo
  const [mpUnavailable, setMpUnavailable] = useState<Set<string>>(new Set())
  // diálogo de reseña (comparte el formulario 360° con estrellas + comentario + fotos)
  const [rv, setRv] = useState<Purchase | null>(null)

  const loadPurchases = useCallback(async () => {
    try {
      const res = await fetch('/api/purchases')
      const data = await readJson(res)
      if (!res.ok) { setPurchasesError(true); toast.error(data.error || 'No pudimos cargar tus compras'); return }
      setPurchases(data.purchases || [])
      setPurchasesError(false)
    } catch {
      setPurchasesError(true)
      toast.error('No pudimos conectar. Reintentá')
    }
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
      const data = await readJson(res)
      if (!res.ok) { toast.error(data.error || 'No pudimos buscar ofertas'); return }
      setResults(data.results || [])
      setSearched(true)
    } catch {
      toast.error('No pudimos conectar. Reintentá')
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
    if (tab === 'compras') void loadPurchases()
  }, [tab, loadPurchases])

  // contador del tab "Mis compras" aunque todavía no se haya abierto
  useEffect(() => { void loadPurchases() }, [loadPurchases])

  // deep link ?stock=<id>: abrir el pedido de esa oferta cuando aparezca en los resultados
  useEffect(() => {
    const target = pendingStock.current
    if (!target || !results) return
    for (const r of results) {
      const o = r.offers.find((x) => x.stockId === target)
      if (o) {
        pendingStock.current = null
        setDlg({ offer: o, elementName: r.name, unit: r.unit, type: pendingType.current })
        setDlgQty('1'); setDlgNote('')
        return
      }
    }
    if (searched && !loading) {
      pendingStock.current = null
      toast.info('Esa oferta ya no está disponible', { description: 'Mirá las alternativas de otros proveedores.' })
    }
  }, [results, searched, loading])

  const searchComparables = useCallback(async (query: string) => {
    setLoadingCmp(true)
    try {
      const params = new URLSearchParams({ q: query })
      if (location.lat && location.lng) {
        params.set('lat', String(location.lat))
        params.set('lng', String(location.lng))
      }
      const res = await fetch(`/api/comparables?${params}`)
      const data = await readJson(res)
      if (!res.ok) { toast.error(data.error || 'No pudimos comparar precios'); return }
      setComparables(data.results || [])
      setAveragePrice(data.averagePrice || 0)
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally { setLoadingCmp(false) }
  }, [location.lat, location.lng])

  useEffect(() => {
    if (tab !== 'comparables') return
    if (debounce.current) clearTimeout(debounce.current)
    debounce.current = setTimeout(() => void searchComparables(q), 350)
    return () => { if (debounce.current) clearTimeout(debounce.current) }
  }, [q, tab, searchComparables])

  // Mejor precio por elemento (agrupa por elemento y se queda con el más barato)
  const bestPerElement = comparables.length > 0 ? (() => {
    const map = new Map<string, Comparable>()
    for (const r of comparables) {
      const cur = map.get(r.elementId)
      if (!cur || r.price < cur.price) map.set(r.elementId, r)
    }
    return [...map.values()].sort((a, b) => a.price - b.price)
  })() : []
  const cheapestStockId = bestPerElement[0]?.stockId

  function goTab(t: Tab) {
    setTab(t)
    navigate(t === 'buscar' ? basePath : `${basePath}?tab=${t}`, { replace: true })
  }

  function openOrder(offer: Offer, elementName: string, unit: string, type: 'compra' | 'reserva') {
    setDlg({ offer, elementName, unit, type })
    setDlgQty('1'); setDlgNote('')
  }

  const qtyStep = dlg && /unidad/i.test(dlg.unit) ? 1 : 0.5

  async function pedir(e: React.FormEvent) {
    e.preventDefault()
    if (!dlg) return
    const qty = parseFloat(dlgQty)
    if (!qty || qty <= 0) { toast.error('Decinos cuánto necesitás'); return }
    if (qty > dlg.offer.quantity) { toast.error(`Este proveedor tiene ${dlg.offer.quantity} ${dlg.unit} disponibles`); return }
    if (qtyStep === 1 && !Number.isInteger(qty)) { toast.error('Este producto se vende por unidad entera'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/purchases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ stockId: dlg.offer.stockId, quantity: qty, type: dlg.type, note: dlgNote.trim() || undefined }),
      })
      const data = await readJson(res)
      if (!res.ok) { toast.error(data.error || 'No se pudo enviar el pedido'); return }
      toast.success(dlg.type === 'reserva' ? 'Reserva enviada' : 'Pedido enviado', {
        description: `${dlg.elementName} × ${qty} ${dlg.unit}. Le avisamos a ${dlg.offer.businessName}: te responde por chat.`,
      })
      setDlg(null); setDlgQty('1'); setDlgNote('')
      void loadPurchases()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(false)
    }
  }

  async function patchPurchase(p: Purchase, body: Record<string, unknown>) {
    const res = await fetch(`/api/purchases/${p.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    const data = await readJson(res)
    return { res, data }
  }

  async function cancelar(p: Purchase) {
    setBusy(true)
    try {
      const { res, data } = await patchPurchase(p, { action: 'cancelar' })
      if (!res.ok) { toast.error(data.error || 'No se pudo cancelar'); return }
      toast.info('Pedido cancelado')
      void loadPurchases()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(false)
      setCancelTarget(null)
    }
  }

  async function pagarMP(p: Purchase) {
    setBusy(true)
    try {
      const { res, data } = await patchPurchase(p, { action: 'pagar_mp' })
      if (!res.ok) {
        if (res.status === 503 && data.needsConfig) {
          toast.info(data.error || 'Este proveedor todavía no conectó Mercado Pago. Podés pagar en efectivo al retirar')
          setMpUnavailable((prev) => new Set(prev).add(p.provider?.id || p.id))
        } else {
          toast.error(data.error || 'No pudimos iniciar el pago')
        }
        return
      }
      const url = data.initPoint || data.init_point
      if (!url) { toast.error('Mercado Pago no devolvió el link de pago. Probá de nuevo'); return }
      window.location.href = url
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(false)
    }
  }

  async function pagarEfectivo(p: Purchase) {
    setBusy(true)
    try {
      const { res, data } = await patchPurchase(p, { action: 'pagar_efectivo' })
      if (!res.ok) { toast.error(data.error || 'No pudimos registrar el pago'); return }
      toast.success('Pagás en efectivo al retirar', { description: 'El proveedor confirma el cobro cuando recibe el dinero.' })
      void loadPurchases()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(false)
    }
  }

  const hasReseña = useCallback(async (p: Purchase) => {
    try {
      const res = await fetch(`/api/reviews?mine=1&purchaseId=${encodeURIComponent(p.id)}`)
      if (!res.ok) return false
      return (((await res.json()).reviews as unknown[]) || []).length > 0
    } catch { return false }
  }, [])

  const pendingCount = purchases ? purchases.filter((p) => PENDING_STATES.includes(p.status)).length : 0

  return (
    <div className="homy-page">
      <header className="homy-page-head" style={{ position: 'relative' }}>
        <p className="homy-eyebrow">Materiales</p>
        <h1 className="homy-page-title mt-1.5">Comprá insumos directo a proveedores</h1>
        <p className="homy-page-sub">
          Buscá lo que necesitás — con o sin obra de por medio — y comprá a la ferretería, corralón o casa
          de tu rubro que mejor te convenga: precio, stock real, reseñas y distancia de cada uno.
        </p>
      </header>

      {/* tabs buscar / comparables / compras */}
      <div role="tablist" aria-label="Secciones de materiales" className="mb-5 flex gap-1 rounded-full bg-white/[0.06] ring-1 ring-[#0A2540]/10 p-1 w-fit max-w-full overflow-x-auto no-scrollbar">
        {tabs.map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => goTab(t)}
            className="homy-tab shrink-0"
          >
            {t === 'buscar' ? <Search className="size-4" aria-hidden /> : t === 'comparables' ? <Trophy className="size-4" aria-hidden /> : <ShoppingBag className="size-4" aria-hidden />}
            {t === 'buscar' ? 'Buscar materiales' : t === 'comparables' ? 'Comparables' : 'Mis compras'}
            {t === 'compras' && pendingCount > 0 && (
              <span className="homy-badge-pop ml-1 grid size-[18px] place-items-center rounded-full bg-[#FF5A1F] text-[10px] font-extrabold text-white">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === 'buscar' || tab === 'comparables' ? (
        <>
          {/* buscador y categorías compartidos */}
          <div className="relative mb-3">
            <Search className="pointer-events-none absolute left-4 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tab === 'comparables' ? 'Buscar material para comparar precios…' : '¿Qué necesitás comprar? ej: cemento, membrana, cables…'}
              aria-label="Buscar materiales"
              className="homy-glass-input w-full rounded-full py-3.5 pl-11 pr-10 text-[15px]"
            />
            {q && (
              <button onClick={() => setQ('')} aria-label="Limpiar búsqueda" className="absolute right-2 top-1/2 grid size-9 -translate-y-1/2 place-items-center rounded-full text-slate-400 hover:bg-white/70 hover:text-[#0A2540] transition">
                <X className="size-4" aria-hidden />
              </button>
            )}
          </div>
          {tab === 'buscar' && (
            <div className="mb-6 flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
              {CATEGORY_TABS.map((c) => (
                <button key={c.slug} onClick={() => setCat(c.slug)} aria-pressed={cat === c.slug} className="homy-tab shrink-0 min-h-[38px]">
                  {c.name}
                </button>
              ))}
            </div>
          )}

          {tab === 'buscar' ? (
            loading && !results ? (
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

                      {r.offers.length > 0 && (
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
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                <button
                                  onClick={() => openOrder(o, r.name, r.unit, 'reserva')}
                                  className="homy-glass-soft inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[12px] font-bold text-[#1D63B8] transition hover:bg-white"
                                >
                                  <Clock className="size-3.5" aria-hidden /> Reservar
                                </button>
                                <button
                                  onClick={() => openOrder(o, r.name, r.unit, 'compra')}
                                  className="homy-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[12px]"
                                >
                                  <ShoppingBag className="size-3.5" aria-hidden /> Comprar
                                </button>
                                <button
                                  onClick={() => navigate(`/mensajes?c=nuevo:${o.providerUserId}`)}
                                  className="homy-glass-soft inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[12px] font-bold text-[#1D63B8] hover:bg-white transition ml-auto"
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

                {/* Elementos que concuerdan pero hoy no tienen stock publicado */}
                {results && results.some((r) => r.offersCount === 0) && (
                  <details className="homy-glass-soft group mt-4 rounded-2xl px-4 py-3.5">
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
            )
          ) : (
            /* ── TAB: COMPARABLES (profesionales) ── */
            <section className="mt-4">
              <div className="homy-section-head">
                <h2 className="homy-section-title">
                  <span className="homy-icon-chip homy-chip-gold size-7 [&_svg]:size-3.5" aria-hidden><Trophy /></span>
                  Mejor precio por elemento
                </h2>
                {bestPerElement.length > 0 && (
                  <p className="text-xs text-slate-400 tabular-nums hidden sm:flex items-center gap-1.5">
                    {bestPerElement.length} elemento{bestPerElement.length === 1 ? '' : 's'} · promedio general {formatARS(averagePrice)}
                  </p>
                )}
              </div>
              {loadingCmp ? (
                <Loading text="Comparando precios entre proveedores…" />
              ) : bestPerElement.length === 0 ? (
                <EmptyState
                  icon={<Trophy />}
                  title="Nada para comparar todavía"
                  hint="Cuando haya stock cargado en dos o más proveedores, acá ves el mejor precio por elemento."
                />
              ) : (
                <div className="homy-stagger grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {bestPerElement.map((c) => (
                    <div key={c.stockId}
                      className={`homy-glass homy-lift homy-card-glow rounded-2xl p-4 ${c.stockId === cheapestStockId ? 'outline-2 outline-offset-2 outline-emerald-500/60' : ''}`}>
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-bold text-[#0A2540] leading-snug">{c.elementName}</p>
                        {c.stockId === cheapestStockId && (
                          <span className="homy-pill shrink-0"><span className="homy-pill-dot bg-emerald-500" aria-hidden />Mejor precio</span>
                        )}
                      </div>
                      {c.brand && <p className="text-xs text-slate-400 mt-0.5">{c.brand}</p>}
                      <p className="mt-2 text-xl font-extrabold text-emerald-600 tabular-nums">
                        {formatARS(c.price)}<span className="text-xs font-semibold text-slate-400"> /{c.unit}</span>
                      </p>
                      <div className="flex items-center justify-between gap-2 mt-2.5 text-xs text-slate-400">
                        <span className="homy-glass-soft rounded-full px-2.5 py-1 inline-flex items-center gap-1.5 font-semibold min-w-0">
                          <Store className="size-3.5 shrink-0" aria-hidden />
                          <span className="line-clamp-1">{c.providerName}</span>
                        </span>
                      </div>
                      <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1">
                        <MapPin className="size-3.5 shrink-0" aria-hidden />
                        {c.distanceKm !== undefined ? formatDistance(c.distanceKm) : (c.providerCity || 'distancia no disponible')}
                        {' · '}stock: {c.quantity}
                      </p>
                      <button
                        onClick={() => openOrder({
                          stockId: c.stockId, elementId: c.elementId, price: c.price, quantity: c.quantity, brand: c.brand,
                          providerId: c.providerId, businessName: c.providerName, kind: '', providerUserId: c.providerUserId || '',
                          providerAvatar: null, providerCity: c.providerCity || null, providerRating: 0, providerReviews: 0,
                          providerVerified: false, planPro: false, distanceKm: c.distanceKm,
                        }, c.elementName, c.unit, 'compra')}
                        className="homy-btn-primary mt-3 w-full min-h-[38px] text-xs"
                      >
                        <ShoppingBag className="size-3.5 mr-1.5 inline" aria-hidden /> Pedir al mejor precio
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        /* ── MIS COMPRAS ── */
        purchases === null ? (
          purchasesError ? (
            <EmptyState
              icon={<ShoppingBag />}
              title="No pudimos cargar tus compras"
              hint="Revisá tu conexión y volvé a intentar."
              action={<button onClick={() => void loadPurchases()} className="homy-btn-primary min-h-[44px] px-5 text-sm">Reintentar</button>}
            />
          ) : <Loading text="Cargando tus compras…" />
        ) : purchases.length === 0 ? (
          <EmptyState
            icon={<ShoppingBag />}
            title="Todavía no hiciste compras"
            hint="Cuando pidas un insumo desde Buscar materiales, acá vas a seguir el pedido hasta el pago y la reseña."
          />
        ) : (
          <div className="space-y-3">
            <p className="homy-page-sub -mt-2">Así funciona: pedís → el proveedor aprueba y te reserva el stock → pagás (Mercado Pago o efectivo al retirar) → retirás → calificás tu compra. Todo queda registrado.</p>
            {purchases.map((p) => (
              <PurchaseCard
                key={p.id}
                p={p}
                busy={busy}
                mpHidden={mpUnavailable.has(p.provider?.id || p.id)}
                onCancel={() => setCancelTarget(p)}
                onPayMP={() => pagarMP(p)}
                onPayCash={() => pagarEfectivo(p)}
                onReview={() => setRv(p)}
                hasReview={hasReseña}
              />
            ))}
          </div>
        )
      )}

      {/* ── diálogo: pedir producto ── */}
      {dlg && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0A2540]/45 p-0 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={dlg.type === 'reserva' ? 'Reservar producto' : 'Comprar producto'}>
          <form onSubmit={pedir} className="homy-glass-strong w-full max-w-md max-h-[92dvh] overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl sm:p-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="homy-eyebrow">{dlg.type === 'reserva' ? 'Reservar producto' : 'Comprar producto'}</p>
                <h3 className="mt-0.5 text-lg font-extrabold text-[#0A2540]">{dlg.elementName}</h3>
                <p className="text-[13px] text-slate-500">{dlg.offer.businessName} · {formatARS(dlg.offer.price)} por {dlg.unit} · stock: {dlg.offer.quantity}</p>
              </div>
              <button type="button" onClick={() => setDlg(null)} aria-label="Cerrar" className="grid size-9 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/70 hover:text-[#0A2540] transition">
                <X className="size-4" aria-hidden />
              </button>
            </div>

            {/* tipo de pedido */}
            <div role="radiogroup" aria-label="Tipo de pedido" className="mt-4 grid grid-cols-2 gap-2">
              {(['reserva', 'compra'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={dlg.type === t}
                  onClick={() => setDlg({ ...dlg, type: t })}
                  className={`rounded-2xl px-3 py-2.5 text-left ring-1 transition ${dlg.type === t ? 'bg-[#1D63B8]/10 ring-[#1D63B8]/40' : 'bg-white/40 ring-[#0A2540]/10 hover:bg-white/70'}`}
                >
                  <span className="flex items-center gap-1.5 text-sm font-extrabold text-[#0A2540]">
                    {t === 'reserva' ? <Clock className="size-3.5 text-[#1D63B8]" aria-hidden /> : <ShoppingBag className="size-3.5 text-[#FF5A1F]" aria-hidden />}
                    {t === 'reserva' ? 'Reserva' : 'Compra'}
                  </span>
                  <span className="mt-0.5 block text-[11.5px] leading-snug text-slate-500">
                    {t === 'reserva' ? 'Te lo guardan 48 h.' : '7 días para retirar.'}
                  </span>
                </button>
              ))}
            </div>

            <label className="mt-4 block text-xs font-extrabold uppercase tracking-wider text-slate-400" htmlFor="ped-cant">
              Cantidad ({dlg.unit})
            </label>
            <input
              id="ped-cant"
              type="number" min={qtyStep} max={dlg.offer.quantity} step={qtyStep} inputMode="decimal"
              value={dlgQty}
              onChange={(e) => setDlgQty(e.target.value)}
              className="homy-glass-input mt-1.5 w-full rounded-2xl px-4 py-3 text-[15px]"
              autoFocus
              required
            />
            {parseFloat(dlgQty) > 0 && (
              <p className="mt-1 text-[12px] text-slate-500 tabular-nums">Total estimado: <b className="text-[#0A2540]">{formatARS(dlg.offer.price * parseFloat(dlgQty))}</b></p>
            )}
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
              <b>Reserva:</b> te lo guardan 48 h. <b>Compra:</b> 7 días para retirar. El pedido va al <b>chat del proveedor</b> (vos siempre
              iniciás el contacto). Cuando lo apruebe, pagás con <b>Mercado Pago o efectivo al retirar</b>.
            </div>
            <button type="submit" disabled={busy} className="homy-btn-primary mt-4 w-full px-6 py-3.5 text-[15px] disabled:opacity-50">
              <Send className="size-4" aria-hidden /> {busy ? 'Enviando…' : dlg.type === 'reserva' ? 'Enviar reserva' : 'Enviar pedido'}
            </button>
          </form>
        </div>
      )}

      {/* ── confirmación de cancelación ── */}
      <AlertDialog open={!!cancelTarget} onOpenChange={(o) => { if (!o && !busy) setCancelTarget(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Cancelar este pedido?</AlertDialogTitle>
            <AlertDialogDescription>
              {cancelTarget ? `${cancelTarget.elementName} × ${cancelTarget.quantity} ${cancelTarget.unit} en ${cancelTarget.provider?.businessName || 'el proveedor'}. ` : ''}
              {cancelTarget?.status === 'aprobado' ? 'El stock que te reservaron vuelve al proveedor y el cobro se anula.' : 'Le avisamos al proveedor. Podés volver a pedirlo cuando quieras.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Volver</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); if (cancelTarget) void cancelar(cancelTarget) }} className="bg-red-600 text-white hover:bg-red-700">
              {busy ? 'Cancelando…' : 'Sí, cancelar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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

function PurchaseCard({ p, busy, mpHidden, onCancel, onPayMP, onPayCash, onReview, hasReview }: {
  p: Purchase
  busy: boolean
  mpHidden: boolean
  onCancel: () => void
  onPayMP: () => void
  onPayCash: () => void
  onReview: () => void
  hasReview: (p: Purchase) => Promise<boolean>
}) {
  const [reviewed, setReviewed] = useState<boolean | null>(null)
  const reviewable = p.status === 'entregado' || p.status === 'pagado'
  useEffect(() => {
    if (reviewable) hasReview(p).then(setReviewed).catch(() => setReviewed(false))
  }, [p, reviewable, hasReview])

  const meta = STATUS_META[p.status] || STATUS_META.pendiente_aprobacion
  const Icon = meta.icon
  const formatted = new Date(p.createdAt).toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  const chargeStatus = p.charge?.status
  const cashAgreed = chargeStatus === 'acordada_efectivo'
  const chargePaid = chargeStatus === 'pagada'
  const mpConnected = p.provider?.mpOauthStatus === 'connected' && !mpHidden
  const expires = p.reservationExpiresAt ? new Date(p.reservationExpiresAt) : null
  // ventana de devolución: 30 días desde el pago (charge.paidAt; si no hay, la última actualización)
  const paidRef = p.charge?.paidAt || p.updatedAt || null
  const [now] = useState(() => Date.now())
  const canReturn = p.status === 'pagado' && !!paidRef && now - new Date(paidRef).getTime() <= 30 * 86400000

  return (
    <article className="homy-glass rounded-3xl p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-[16px] font-extrabold text-[#0A2540] leading-snug">{p.elementName} × {p.quantity} {p.unit}</h3>
          <p className="mt-0.5 text-xs text-slate-500">
            {p.provider?.businessName} · {formatted} · {p.type === 'reserva' ? 'reserva' : 'compra'}{p.note ? ` · “${p.note}”` : ''}
          </p>
        </div>
        <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-extrabold ring-1 ${meta.tone}`}>
          <Icon className="size-3.5" aria-hidden /> {meta.label}
        </span>
      </div>
      {p.total > 0 && (
        <p className="mt-1.5 text-sm font-extrabold text-[#0A2540] tabular-nums">{formatARS(p.total)}</p>
      )}
      {p.status === 'rechazado' && p.rejectionReason && (
        <p className="mt-1.5 rounded-xl bg-red-500/8 px-3 py-2 text-[12.5px] text-red-700">Motivo: {p.rejectionReason}</p>
      )}
      {p.status === 'aprobado' && expires && (
        <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-slate-500">
          <Clock className="size-3.5 shrink-0" aria-hidden />
          {p.type === 'reserva' ? 'Te lo guardan hasta el' : 'Retiralo antes del'} {expires.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })} a las {expires.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })}
        </p>
      )}
      {p.status === 'aprobado' && cashAgreed && (
        <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#1D63B8]/8 px-3 py-1.5 text-[12px] font-bold text-[#1D63B8]">
          <Banknote className="size-3.5" aria-hidden /> Pagás en efectivo al retirar — el proveedor confirma el cobro
        </p>
      )}
      {p.status === 'aprobado' && chargePaid && (
        <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-[#0e9f6e]/10 px-3 py-1.5 text-[12px] font-bold text-[#0e9f6e]">
          <CircleCheck className="size-3.5" aria-hidden /> Pago confirmado — pasá a retirarlo
        </p>
      )}
      {p.status === 'entregado' && (
        <p className="mt-1.5 text-[12px] text-slate-500">
          {cashAgreed ? 'Acordaste efectivo: el proveedor confirma el cobro cuando recibe el dinero.' : 'Coordiná el pago con el proveedor por chat.'}
        </p>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {p.status === 'pendiente_aprobacion' && (
          <button disabled={busy} onClick={onCancel} className="homy-glass-soft inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-xs font-bold text-slate-500 hover:text-red-600 transition disabled:opacity-50">
            <Undo2 className="size-3.5" aria-hidden /> Cancelar
          </button>
        )}
        {p.status === 'aprobado' && !cashAgreed && !chargePaid && (
          <>
            {mpConnected ? (
              <button disabled={busy} onClick={onPayMP} className="homy-btn-primary inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-xs disabled:opacity-50">
                <CreditCard className="size-3.5" aria-hidden /> Pagar con Mercado Pago
              </button>
            ) : (
              <span className="inline-flex items-center rounded-full bg-slate-500/8 px-3 py-2 text-[11.5px] font-semibold text-slate-500">
                Este proveedor cobra en efectivo al retirar
              </span>
            )}
            <button disabled={busy} onClick={onPayCash} className="homy-btn-dark inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-xs disabled:opacity-50">
              <Banknote className="size-3.5" aria-hidden /> Pagar en efectivo al retirar
            </button>
          </>
        )}
        {p.status === 'aprobado' && !chargePaid && (
          <button disabled={busy} onClick={onCancel} className="homy-glass-soft inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-xs font-bold text-slate-500 hover:text-red-600 transition disabled:opacity-50">
            <Undo2 className="size-3.5" aria-hidden /> Cancelar
          </button>
        )}
        {reviewable && reviewed === false && (
          <button onClick={onReview} className="homy-btn-primary inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-xs">
            <Star className="size-3.5" aria-hidden /> Calificar compra
          </button>
        )}
        {reviewable && reviewed === true && (
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
      {/* sobrantes: compras pagadas dentro de los 30 días (o con devoluciones ya pedidas) */}
      {p.status === 'pagado' && (
        <SobrantesSection purchaseId={p.id} canRequest={canReturn} compact />
      )}
    </article>
  )
}
