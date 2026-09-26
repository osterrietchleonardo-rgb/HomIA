'use client'
// Directorio HomIA — todos los profesionales y proveedores de la comunidad,
// ordenados por reseñas positivas. Lista pública (home + paneles);
// abrir una tarjeta requiere sesión (el perfil hace el gate).
// Las insignias de verificación (DNI + IA) se ven junto a cada nombre:
// quien no subió su DNI aparece como "No verificado" para todos.
import { useEffect, useRef, useState } from 'react'
import { navigate } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState, UAvatar, UStars, VerifyBadge } from '@/components/app/ui-bits'
import HireWizard, { type HireTarget } from '@/components/app/hire-wizard'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { Search, Star, MapPin, HardHat, Package, ArrowRight, Users, Store, Heart, SlidersHorizontal, Compass, BriefcaseBusiness } from 'lucide-react'
import { motion } from 'framer-motion'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { trackBusqueda } from '@/lib/analytics/tracker'
import { categoryName } from '@/lib/categories'

type ProCard = {
  kind: 'profesional'; id: string; userId: string; href: string; name: string
  avatarUrl: string | null; city: string | null; verified: boolean; verificationStatus: string; isPro: boolean
  rating: number; reviewsCount: number; professions: string[]; worksCount: number
  experienceYears: number; avgBid: number | null; bidsCount: number; memberSince: string
}
type ProvCard = {
  kind: 'proveedor'; id: string; userId: string; href: string; name: string
  avatarUrl: string | null; city: string | null; verified: boolean; verificationStatus: string; isPro: boolean
  rating: number; reviewsCount: number; businessName: string; provKind?: string; description: string | null
  stockCount: number; avgPrice: number | null; categories: string[]; memberSince: string
}
type Card = ProCard | ProvCard
type Category = { slug: string; name: string; icon: string }

// Etiquetas legibles del tipo de negocio del proveedor (ProviderProfile.kind)
const KIND_LABELS: Record<string, string> = {
  corralon: 'Corralón', ferreteria: 'Ferretería', electricidad: 'Casa de electricidad',
  pintura: 'Pinturería', sanitarios: 'Sanitarios', gas: 'Casa de gas',
  maderera: 'Maderera', carpinteria: 'Carpintería', aberturas: 'Aberturas',
  techos: 'Techos', jardin: 'Jardinería', limpieza: 'Limpieza',
  climatizacion: 'Climatización', herramientas: 'Herramientas', muebles: 'Muebles',
  pisos: 'Pisos', seguridad: 'Seguridad · Industrial', multi: 'Multiproducto',
}

const KINDS = [
  { v: 'all', label: 'Todos', icon: Users },
  { v: 'profesional', label: 'Profesionales', icon: HardHat },
  { v: 'proveedor', label: 'Proveedores', icon: Store },
] as const

const SORTS = [
  { v: 'reviews', label: 'Más reseñas positivas' },
  { v: 'rating', label: 'Mejor puntuación' },
  { v: 'works', label: 'Más experiencia' },
  { v: 'recent', label: 'Más recientes' },
] as const

const RATINGS = [
  { v: '0', label: 'Cualquiera' },
  { v: '3', label: '3★ +' },
  { v: '4', label: '4★ +' },
  { v: '4.5', label: '4.5★ +' },
] as const

// buckets de precio promedio de presupuestos (profesionales)
const BID_BUCKETS = [
  { v: 'todos', label: 'Todo precio', min: null, max: null },
  { v: 'b1', label: 'Hasta $100 mil', min: null, max: 100000 },
  { v: 'b2', label: '$100 mil – $300 mil', min: 100000, max: 300000 },
  { v: 'b3', label: 'Más de $300 mil', min: 300000, max: null },
] as const

// buckets de precio promedio de stock (proveedores)
const PRICE_BUCKETS = [
  { v: 'todos', label: 'Todo precio', min: null, max: null },
  { v: 'p1', label: 'Hasta $20 mil', min: null, max: 20000 },
  { v: 'p2', label: '$20 mil – $60 mil', min: 20000, max: 60000 },
  { v: 'p3', label: 'Más de $60 mil', min: 60000, max: null },
] as const

export default function DirectoryScreen({ embedded = false }: { embedded?: boolean }) {
  const { user } = useSession()
  const [cards, setCards] = useState<Card[] | null>(null)
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [kind, setKind] = useState<'all' | 'profesional' | 'proveedor'>('all')
  const [cat, setCat] = useState('')
  const [sort, setSort] = useState<string>('reviews')
  const [minRating, setMinRating] = useState('0')
  const [bucket, setBucket] = useState('todos') // presupuesto (pro) o stock (prov)
  const [q, setQ] = useState('')
  const [favs, setFavs] = useState<Set<string>>(new Set())
  const [onlyFavs, setOnlyFavs] = useState(false)
  const [hireTarget, setHireTarget] = useState<HireTarget | null>(null)
  const qTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // favoritos del usuario (para el corazón y el filtro “Mis favoritos”)
  useEffect(() => {
    if (!user) { setFavs(new Set()); return }
    fetch('/api/favorites').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.ids) setFavs(new Set(d.ids as string[]))
    }).catch(() => { /* silencioso */ })
  }, [user])

  async function load(k = kind, c = cat, s = sort, mr = minRating, b = bucket, query = q) {
    const sp = new URLSearchParams()
    if (k !== 'all') sp.set('kind', k)
    if (c) sp.set('cat', c)
    if (s) sp.set('sort', s)
    if (mr !== '0') sp.set('minRating', mr)
    if (b && b !== 'todos') {
      const isProv = k === 'proveedor'
      const table = isProv ? PRICE_BUCKETS : BID_BUCKETS
      const found = table.find((x) => x.v === b)
      if (found && found.min != null) sp.set(isProv ? 'priceMin' : 'bidMin', String(found.min))
      if (found && found.max != null) sp.set(isProv ? 'priceMax' : 'bidMax', String(found.max))
    }
    if (query) sp.set('q', query)
    try {
      const res = await fetch(`/api/directory?${sp.toString()}`)
      if (res.ok) {
        const d = await res.json()
        setCards(d.directory)
        setCategories(d.categories)
        // métricas (D27): solo si hay término o filtros (el listado inicial no es una búsqueda)
        trackBusqueda('directorio', query || '', Array.isArray(d.directory) ? d.directory.length : 0, { tipo: k, cat: c, orden: s === 'reviews' ? null : s, estrellas: mr === '0' ? null : mr, precio: b })
      }
    } finally { setLoading(false) }
  }

  useEffect(() => { load() /* inicial */   }, [])

  function onFilter(next: Partial<{ k: typeof kind; c: string; s: string; mr: string; b: string }>) {
    const nk = next.k ?? kind
    const nc = next.c ?? cat
    const ns = next.s ?? sort
    const nmr = next.mr ?? minRating
    const nb = next.b ?? bucket
    setKind(nk); setCat(nc); setSort(ns); setMinRating(nmr); setBucket(nb)
    setLoading(true)
    load(nk, nc, ns, nmr, nb)
  }

  function onQ(v: string) {
    setQ(v)
    if (qTimer.current) clearTimeout(qTimer.current)
    qTimer.current = setTimeout(() => { setLoading(true); load(kind, cat, sort, minRating, bucket, v) }, 350)
  }

  const priceBuckets = kind === 'proveedor' ? PRICE_BUCKETS : BID_BUCKETS

  async function toggleFav(e: React.MouseEvent, targetUserId: string) {
    e.stopPropagation()
    if (!user) {
      navigate('/registrarse?volver=/directorio')
      return
    }
    try {
      const res = await fetch('/api/favorites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      setFavs((prev) => {
        const next = new Set(prev)
        if (d.favorito) next.add(targetUserId)
        else next.delete(targetUserId)
        return next
      })
      toast.success(d.favorito ? 'Agregado a tus favoritos' : 'Quitado de tus favoritos')
    } catch { toast.error('No se pudo actualizar — intentá de nuevo') }
  }

  function tryHire(e: React.MouseEvent, c: ProCard) {
    e.stopPropagation()
    if (!user) {
      toast('Registrate para contratar', {
        description: 'Necesitás una cuenta para crear un proyecto con este profesional.',
        action: { label: 'Registrarme', onClick: () => navigate('/registrarse?volver=/directorio') },
      })
      return
    }
    if (user.id === c.userId) { toast('No podés contratarte a vos mismo'); return }
    setHireTarget({
      id: c.id, userId: c.userId, displayName: c.name, companyName: null,
      avatarUrl: c.avatarUrl, city: c.city, professions: c.professions, verificationStatus: c.verificationStatus,
    })
  }

  return (
    <div className={embedded ? 'homy-page' : 'min-h-screen'}>
      {/* banda de encabezado — dentro del panel es la cabecera anclada del app-shell
          (.homy-page-head: queda fija arriba y solo scrollea el contenido, como en las demás pantallas) */}
      {embedded ? (
        <header className="homy-page-head">
          <div className="min-w-0">
            <span className="homy-eyebrow">Directorio HomIA</span>
            <h1 className="homy-page-title mt-1.5">Toda la comunidad, en un solo lugar</h1>
            <p className="homy-page-sub">Profesionales y proveedores de tu zona, ordenados por sus reseñas.</p>
          </div>
        </header>
      ) : (
        <div className="relative max-w-7xl mx-auto pt-8 pb-8 px-4 sm:px-6 lg:px-8">
          <p className="homy-eyebrow">Directorio HomIA</p>
          <h1 className="mt-2 text-3xl sm:text-4xl font-extrabold tracking-tight text-navy leading-tight">
            Toda la comunidad, en un solo lugar
          </h1>
          <p className="mt-3 max-w-2xl text-[15px] leading-relaxed text-slate-500">
            Profesionales y proveedores de tu zona, ordenados por sus reseñas. Abrí una tarjeta para ver toda su experiencia y escribirle por mensaje directo.
          </p>
        </div>
      )}

      {/* filtros + grid */}
      <div className={embedded ? '' : 'max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pb-16'}>
        <div className={embedded ? '' : '-mt-6'}>
          {/* buscador + tipo */}
          <div className={`homy-glass rounded-3xl p-4 sm:p-5 ${embedded ? 'mb-5' : 'homy-stagger relative shadow-[0_18px_50px_-24px_rgba(10,37,64,0.35)] mb-5'}`}>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="relative flex-1">
                <Search aria-hidden className="size-4.5 text-slate-400 absolute left-4 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  value={q}
                  onChange={(e) => onQ(e.target.value)}
                  placeholder="Buscar por nombre, oficio, negocio o ciudad…"
                  className="homy-glass-input w-full rounded-full pl-11 pr-4 py-3 text-sm"
                  aria-label="Buscar en el directorio"
                />
              </div>
              <div className="flex max-w-full flex-wrap items-center gap-1.5 rounded-2xl bg-[#0A2540]/4 p-1" role="tablist" aria-label="Tipo de miembro">
                {KINDS.map((k) => {
                  const Icon = k.icon
                  const active = kind === k.v
                  return (
                    <button
                      key={k.v}
                      role="tab"
                      aria-selected={active}
                      onClick={() => onFilter({ k: k.v })}
                      className={`homy-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-4 text-[13px] font-bold transition-all duration-300 ${
                        active
                          ? 'bg-gradient-to-r from-[#1D63B8] to-[#2b7fd0] text-white shadow-[0_10px_22px_-10px_rgba(29,99,184,0.8)]'
                          : 'text-slate-500 hover:bg-white/70 hover:text-[#0A2540]'
                      }`}
                    >
                      <Icon className="size-4" aria-hidden /> {k.label}
                    </button>
                  )
                })}
              </div>
            </div>

            {/* rubros */}
            <div className="mt-3.5 flex flex-wrap gap-1.5" role="group" aria-label="Filtrar por rubro">
              <button
                onClick={() => onFilter({ c: '' })}
                className={`homy-focus rounded-full px-3.5 py-1.5 text-xs font-bold min-h-[32px] transition ${cat === '' ? 'bg-[#0A2540] text-white shadow-[0_8px_18px_-8px_rgba(10,37,64,0.6)]' : 'homy-glass-soft text-slate-500 hover:text-[#0A2540]'}`}
              >
                Todos los rubros
              </button>
              {categories.map((c) => (
                <button
                  key={c.slug}
                  onClick={() => onFilter({ c: c.slug })}
                  className={`homy-focus rounded-full px-3.5 py-1.5 text-xs font-bold min-h-[32px] transition ${cat === c.slug ? 'bg-[#0A2540] text-white shadow-[0_8px_18px_-8px_rgba(10,37,64,0.6)]' : 'homy-glass-soft text-slate-500 hover:text-[#0A2540]'}`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            {/* orden + rating + precio */}
            <div className="mt-3.5 flex flex-wrap items-center gap-x-4 gap-y-2.5">
              <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-400">
                <SlidersHorizontal className="size-3.5" aria-hidden />
                <span className="sr-only sm:not-sr-only">Ordenar</span>
                <Select value={sort} onValueChange={(val) => onFilter({ s: val })}>
                  <SelectTrigger className="homy-glass-input rounded-full px-3.5 py-2 text-xs font-bold text-slate-600 border-none min-w-[140px]">
                    <SelectValue placeholder="Ordenar directorio" />
                  </SelectTrigger>
                  <SelectContent>
                    {SORTS.map((s) => <SelectItem key={s.v} value={s.v}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </label>
              <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Rating mínimo">
                {RATINGS.map((r) => (
                  <button
                    key={r.v}
                    onClick={() => onFilter({ mr: r.v })}
                    className={`homy-focus inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-xs font-bold min-h-[32px] transition ${minRating === r.v ? 'bg-[#FFC700]/20 text-[#8a6d00] ring-1 ring-[#FFC700]/50' : 'homy-glass-soft text-slate-500 hover:text-[#0A2540]'}`}
                  >
                    <Star className="size-3 fill-[#FFC700] text-[#FFC700]" aria-hidden /> {r.label}
                  </button>
                ))}
              </div>
              {kind !== 'all' && (
                <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label={kind === 'proveedor' ? 'Precio promedio de stock' : 'Precio promedio de presupuestos'}>
                  {priceBuckets.map((b) => (
                    <button
                      key={b.v}
                      onClick={() => onFilter({ b: b.v })}
                      className={`homy-focus rounded-full px-3 py-1.5 text-xs font-bold min-h-[32px] transition ${bucket === b.v ? 'bg-[#1D63B8]/12 text-[#1D63B8] ring-1 ring-[#1D63B8]/30' : 'homy-glass-soft text-slate-500 hover:text-[#0A2540]'}`}
                    >
                      {b.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* contador */}
          {(() => { const shown = onlyFavs ? (cards || []).filter((c) => favs.has(c.userId)) : (cards || [])
          return (
          <>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2.5">
            <p className="text-[13px] font-semibold text-slate-400" aria-live="polite">
              {loading ? 'Buscando en la comunidad…' : `${shown.length} resultados · ${shown.filter((c) => c.kind === 'profesional').length} profesionales · ${shown.filter((c) => c.kind === 'proveedor').length} proveedores`}
            </p>
            {user && (
              <button
                onClick={() => setOnlyFavs((v) => !v)}
                aria-pressed={onlyFavs}
                className={`homy-focus inline-flex min-h-[34px] items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-bold transition ${onlyFavs ? 'bg-red-500/10 text-red-600 ring-1 ring-red-400/40' : 'homy-glass-soft text-slate-500 hover:text-[#0A2540]'}`}
              >
                <Heart className={`size-3.5 ${onlyFavs ? 'fill-red-500 text-red-500' : ''}`} aria-hidden />
                Mis favoritos {favs.size > 0 && <span className="tabular-nums">({favs.size})</span>}
              </button>
            )}
          </div>

          {/* grid de tarjetas */}
          {loading && !cards ? (
            <Loading />
          ) : shown.length === 0 ? (
            <EmptyState
              icon={<Compass />}
              title={onlyFavs ? 'Todavía no marcaste favoritos' : 'Nadie coincide con esos filtros'}
              hint={onlyFavs ? 'Tocá el corazón en cualquier tarjeta para guardarla acá.' : 'Probá con otro rubro, quitá el filtro de rating o ampliá la búsqueda.'}
            />
          ) : (
            <div className="homy-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {shown.map((c, i) => (
                <motion.article
                  key={`${c.kind}-${c.id}`}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: Math.min(i * 0.04, 0.4) }}
                  className="relative"
                >
                  {/* corazón favorito — botón hermano por encima de la tarjeta (HTML válido) */}
                  <button
                    onClick={(e) => toggleFav(e, c.userId)}
                    aria-label={favs.has(c.userId) ? `Quitar a ${c.name} de favoritos` : `Guardar a ${c.name} en favoritos`}
                    aria-pressed={favs.has(c.userId)}
                    className="homy-focus absolute top-3.5 right-3.5 z-20 grid size-9 place-items-center rounded-full homy-glass-strong transition-all duration-300 hover:scale-110"
                  >
                    <Heart className={`size-4 transition-colors ${favs.has(c.userId) ? 'fill-red-500 text-red-500' : 'text-slate-400'}`} aria-hidden />
                  </button>
                  {/* contratación directa en la tarjeta (solo profesionales) */}
                  {c.kind === 'profesional' && (
                    <button
                      onClick={(e) => tryHire(e, c)}
                      data-track="contratar desde el directorio"
                      // !absolute: .homy-btn-primary (sin capa) trae position: relative y le ganaba al utilitario
                      className="homy-btn-primary homy-focus !absolute bottom-3.5 right-4 z-20 inline-flex min-h-[38px] items-center gap-1.5 rounded-full px-4 text-xs shadow-[0_10px_24px_-10px_rgba(255,90,31,0.75)] transition-all duration-300 hover:scale-105"
                      aria-label={`Contratar a ${c.name}`}
                    >
                      <BriefcaseBusiness className="size-3.5" aria-hidden /> Contratar
                    </button>
                  )}
                  <button
                    onClick={() => navigate(c.href)}
                    className={`homy-glass homy-lift homy-card-glow homy-focus group flex w-full flex-col rounded-3xl p-5 text-left ${c.kind === 'proveedor' && c.isPro ? 'ring-2 ring-[#FFC700]/65 bg-[#FFC700]/6' : ''}`}
                    aria-label={`Abrir tarjeta de ${c.name}`}
                  >
                    <div className="flex items-start gap-3.5">
                      <UAvatar name={c.name} url={c.avatarUrl} size={56} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 pr-9">
                          {/* el nombre envuelve (nunca truncate): el badge baja debajo si no entra */}
                          <p className="min-w-0 break-words font-extrabold text-[#0A2540] leading-snug">{c.name}</p>
                          <VerifyBadge status={c.verificationStatus} />
                          {c.isPro && c.kind === 'proveedor' && (
                            <span className="rounded-full bg-gradient-to-r from-[#FFC700] to-[#ffd84d] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-[#6b4d00] shadow-sm">★ Recomendado</span>
                          )}
                        </div>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-slate-400">
                          <MapPin aria-hidden className="size-3 shrink-0" /> {c.city || 'Argentina'} · desde {formatDate(c.memberSince)}
                        </p>
                        <div className="mt-1.5 flex items-center gap-1.5">
                          <UStars rating={c.rating} size="text-xs" />
                          <span className="text-xs font-bold text-slate-500 tabular-nums">{c.rating > 0 ? c.rating : '—'}</span>
                          <span className="text-xs text-slate-400">· {c.reviewsCount} reseñas</span>
                        </div>
                      </div>
                    </div>

                    {/* chips de rubros — los proveedores muestran su tipo de negocio primero */}
                    <div className="mt-3.5 flex flex-wrap gap-1.5">
                      {c.kind === 'profesional'
                        ? c.professions.slice(0, 3).map((p) => (
                            <span key={p} className="homy-glass-soft rounded-full px-2.5 py-1 text-[11px] font-bold text-[#1D63B8]">{categoryName(categories, p)}</span>
                          ))
                        : (
                          <>
                            {c.provKind && c.provKind !== 'multi' && KIND_LABELS[c.provKind] && (
                              <span className="rounded-full bg-[#00C4FF]/12 px-2.5 py-1 text-[11px] font-extrabold text-[#0092c4] ring-1 ring-[#00C4FF]/30">{KIND_LABELS[c.provKind]}</span>
                            )}
                            {c.categories.slice(0, c.provKind && c.provKind !== 'multi' ? 2 : 3).map((p) => (
                              <span key={p} className="homy-glass-soft rounded-full px-2.5 py-1 text-[11px] font-bold text-[#1D63B8]">{categoryName(categories, p)}</span>
                            ))}
                          </>
                        )}
                      {(c.kind === 'profesional' ? c.professions.length : c.categories.length + (c.provKind && c.provKind !== 'multi' ? 1 : 0)) > 3 && (
                        <span className="homy-glass-soft rounded-full px-2.5 py-1 text-[11px] font-bold text-slate-400">
                          +{(c.kind === 'profesional' ? c.professions.length : c.categories.length + (c.provKind && c.provKind !== 'multi' ? 1 : 0)) - 3}
                        </span>
                      )}
                    </div>

                    {/* métricas — la cifra se adapta al ancho de la tarjeta, nunca salta de línea */}
                    <div className="mt-4 grid grid-cols-2 gap-2">
                      {c.kind === 'profesional' ? (
                        <>
                          <div className="homy-num-cell rounded-xl bg-[#0A2540]/3 px-3 py-2">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Trabajos realizados</p>
                            <p className="homy-num-adapt font-extrabold text-[#0A2540]">{c.worksCount} obras · {c.experienceYears} años</p>
                          </div>
                          <div className="homy-num-cell rounded-xl bg-[#0A2540]/3 px-3 py-2">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Presupuesto promedio</p>
                            <p className={`homy-num-adapt font-extrabold ${c.avgBid != null ? 'text-[#16A34A]' : 'text-slate-400 text-[11px] whitespace-normal'}`}>{c.avgBid != null ? formatARS(c.avgBid) : 'Sin ofertas aún'}</p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="homy-num-cell rounded-xl bg-[#0A2540]/3 px-3 py-2">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Catálogo</p>
                            <p className="homy-num-adapt font-extrabold text-[#0A2540]">{c.stockCount} materiales</p>
                          </div>
                          <div className="homy-num-cell rounded-xl bg-[#0A2540]/3 px-3 py-2">
                            <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">Precio promedio</p>
                            <p className={`homy-num-adapt font-extrabold ${c.avgPrice != null ? 'text-[#16A34A]' : 'text-slate-400 text-[11px] whitespace-normal'}`}>{c.avgPrice != null ? formatARS(c.avgPrice) : 'Sin stock aún'}</p>
                          </div>
                        </>
                      )}
                    </div>

                    <span className={`mt-4 inline-flex items-center gap-1.5 text-[13px] font-extrabold text-[#1D63B8] ${c.kind === 'profesional' ? 'pr-24' : ''}`}>
                      Ver perfil y contactar
                      <ArrowRight aria-hidden className="size-4 transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  </button>
                </motion.article>
              ))}
            </div>
          )}
          </>
          )})()}

          {/* wizard de contratación desde el directorio */}
      <HireWizard open={!!hireTarget} target={hireTarget} onClose={() => setHireTarget(null)} />

      {/* nota de acceso */}
          {!user && (
            <div className="homy-glass-featured mt-8 rounded-3xl p-6 text-center sm:p-7">
              <span aria-hidden className="homy-icon-chip homy-chip-blue size-12 mx-auto"><Users /></span>
              <p className="mt-3 font-extrabold text-[#0A2540]">¿Querés ver la experiencia completa y contactar?</p>
              <p className="mx-auto mt-1.5 max-w-md text-sm text-slate-500">Las tarjetas se abren con cuenta: toda la experiencia, reseñas, catálogo y mensajes directos. Es gratis y tarda 1 minuto.</p>
              <button onClick={() => navigate('/registrarse?volver=/directorio')} className="homy-btn-primary homy-focus mt-5 px-6 py-3 min-h-[44px] text-sm">
                Crear cuenta gratis
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
