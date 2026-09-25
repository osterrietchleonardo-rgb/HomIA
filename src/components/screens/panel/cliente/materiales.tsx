'use client'
// Materiales del cliente (y del profesional) — marketplace de insumos sin contratar
// a nadie: buscás lo que necesitás, ves TODAS las ofertas con precio, stock, reseñas
// y distancia del proveedor y las sumás al CARRITO (de uno o varios proveedores).
// Con stock: "Agregar al carrito" (compra directa: sin aprobación, se paga enseguida)
// o "Reservar" (la aprueba el proveedor); sin stock solo "Reservar" (D15). Pagás con
// Mercado Pago (cargo de servicio HomIA del 1%) o efectivo al retirar y calificás.
// La solapa "Mis pedidos" muestra lo mismo que /panel/<rol>/pedidos (sin duplicar lógica).
import { useCallback, useEffect, useRef, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useLocation, useSession } from '@/lib/store'
import { Loading, EmptyState, UAvatar, UStars, VerifyBadge } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { formatDistance } from '@/lib/geo'
import { addToCart, useCart } from '@/lib/cart'
import { OrdersList } from '../pedidos'
import { toast } from 'sonner'
import {
  Search, Package, ShoppingBag, Store, MapPin, X, MessageCircle, Trophy, ShoppingCart, Loader2, Clock,
} from 'lucide-react'

type Offer = {
  stockId: string; elementId: string; price: number; quantity: number; inStock?: boolean; brand: string | null
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
  { slug: 'seguridad', name: 'Seguridad' }, { slug: 'electrodomesticos', name: 'Electro' },
  { slug: 'plagas', name: 'Plagas' },
]

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
  const [searched, setSearched] = useState(false)
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null)
  // deep link: ?stock=<id> agrega esa oferta al carrito apenas carguen los resultados
  const pendingStock = useRef<string | null>(route.query.stock || null)
  // oferta que se está agregando (spinner en su botón)
  const [adding, setAdding] = useState<string | null>(null)
  const cartMode = useCart((s) => s.mode)

  // Comparables (solo profesionales)
  const [comparables, setComparables] = useState<Comparable[]>([])
  const [averagePrice, setAveragePrice] = useState(0)
  const [loadingCmp, setLoadingCmp] = useState(false)

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

  // deep link ?stock=<id>: abrir el pedido de esa oferta cuando aparezca en los resultados
  useEffect(() => {
    const target = pendingStock.current
    if (!target || !results) return
    for (const r of results) {
      const o = r.offers.find((x) => x.stockId === target)
      if (o) {
        pendingStock.current = null
        void addToCart(o.stockId, 1, r.name, { mode: o.inStock === false ? 'reserva' : undefined })
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

  async function agregar(offer: Offer, elementName: string, mode?: 'reserva') {
    if (cartMode === 'sin_carrito') {
      toast.info('El carrito es para clientes y profesionales')
      return
    }
    setAdding(offer.stockId)
    try {
      await addToCart(offer.stockId, 1, elementName, { mode: mode ?? (offer.inStock === false ? 'reserva' : undefined) })
    } finally {
      setAdding(null)
    }
  }

  return (
    <div className="homy-page">
      <header className="homy-page-head" style={{ position: 'relative' }}>
        <div className="min-w-0">
          <p className="homy-eyebrow">Materiales</p>
          <h1 className="homy-page-title mt-1.5">Comprá insumos directo a proveedores</h1>
          <p className="homy-page-sub">
            Buscá lo que necesitás — con o sin obra de por medio — y comprá a la ferretería, corralón o casa
            de tu rubro que mejor te convenga: precio, stock real, reseñas y distancia de cada uno.
          </p>
        </div>
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
            {t === 'buscar' ? 'Buscar materiales' : t === 'comparables' ? 'Comparables' : 'Mis pedidos'}
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
                  {results?.filter((r) => r.offers.length > 0).map((r) => (
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
                                {/* base 14rem: en el celu el precio baja de línea y el proveedor no queda en una columna de 100px */}
                                <div className="flex min-w-0 flex-[1_1_14rem] items-start gap-3">
                                  <UAvatar name={o.businessName} url={o.providerAvatar} size={40} />
                                  <div className="min-w-0">
                                    <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-extrabold text-[#0A2540] leading-snug">
                                      {o.businessName}
                                      <VerifyBadge status={o.providerVerified ? 'verificado' : 'none'} />
                                      {o.planPro && (
                                        <span className="rounded-full bg-gradient-to-r from-[#FFC700] to-[#ffd84d] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-[#6b4d00] shadow-sm" title="Proveedor Recomendado de HomIA (Plan PRO activo)">★ Recomendado</span>
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
                                  <p className="text-[11px] font-bold text-slate-400">por {r.unit} · {o.inStock === false ? 'sin stock' : `stock: ${o.quantity}`}</p>
                                </div>
                              </div>
                              {o.inStock === false && (
                                <p className="mt-2 text-[12px] font-semibold text-[#1D63B8]">Sin stock: podés reservarlo y el proveedor te avisa</p>
                              )}
                              <div className="mt-3 flex flex-wrap items-center gap-2">
                                {o.inStock !== false && (
                                  <button
                                    onClick={() => void agregar(o, r.name)}
                                    disabled={adding === o.stockId}
                                    className="homy-btn-primary inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[12px] disabled:opacity-60"
                                  >
                                    {adding === o.stockId ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : <ShoppingCart className="size-3.5" aria-hidden />} Agregar al carrito
                                  </button>
                                )}
                                <button
                                  onClick={() => void agregar(o, r.name, 'reserva')}
                                  disabled={adding === o.stockId}
                                  className={`${o.inStock === false ? 'homy-btn-dark' : 'homy-glass-soft text-[#1D63B8] hover:bg-white'} inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[12px] font-bold disabled:opacity-60`}
                                >
                                  <Clock className="size-3.5" aria-hidden /> Reservar
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
                {results && results.some((r) => r.offers.length === 0) && (
                  <details className="homy-glass-soft group mt-4 rounded-2xl px-4 py-3.5">
                    <summary className="flex cursor-pointer list-none items-center gap-2 text-sm font-bold text-slate-600 transition hover:text-[#1D63B8]">
                      <Package className="size-4 shrink-0 text-slate-400" aria-hidden />
                      Ver {results.filter((r) => r.offers.length === 0).length} elemento{results.filter((r) => r.offers.length === 0).length === 1 ? '' : 's'} similar{results.filter((r) => r.offers.length === 0).length === 1 ? '' : 'es'} que ningún proveedor publica ahora
                      <span aria-hidden className="ml-auto text-xs text-slate-400 transition group-open:rotate-180">▾</span>
                    </summary>
                    <ul className="mt-3 space-y-1.5 border-t border-[#0A2540]/8 pt-3">
                      {results.filter((r) => r.offers.length === 0).map((r) => (
                        <li key={r.elementId} className="flex flex-wrap items-baseline gap-x-2 text-[13px]">
                          <span className="font-bold text-[#0A2540]">{r.name}</span>
                          <span className="text-slate-400">· {r.categoryName}</span>
                          <span className="text-[12px] text-slate-400 min-w-0 flex-1 basis-full sm:basis-0">{r.description ? r.description.slice(0, 110) + (r.description.length > 110 ? '…' : '') : ''}</span>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-3 text-[12px] text-slate-400">Cuando un proveedor publique estos elementos, van a aparecer arriba con su precio.</p>
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
                        onClick={() => void agregar({
                          stockId: c.stockId, elementId: c.elementId, price: c.price, quantity: c.quantity, brand: c.brand,
                          providerId: c.providerId, businessName: c.providerName, kind: '', providerUserId: c.providerUserId || '',
                          providerAvatar: null, providerCity: c.providerCity || null, providerRating: 0, providerReviews: 0,
                          providerVerified: false, planPro: false, distanceKm: c.distanceKm,
                        }, c.elementName)}
                        disabled={adding === c.stockId}
                        className="homy-btn-primary mt-3 w-full min-h-[40px] text-xs disabled:opacity-60"
                      >
                        <ShoppingCart className="size-3.5 mr-1.5 inline" aria-hidden /> Agregar al carrito
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </section>
          )}
        </>
      ) : (
        /* ── MIS PEDIDOS: la misma lista que /panel/<rol>/pedidos ── */
        <OrdersList role={role} embedded />
      )}

    </div>
  )
}
