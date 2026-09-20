'use client'
// Perfil de proveedor (requiere sesión): catálogo/stock, reseñas desglosadas
// (texto + fotos), contacto, favoritos y compartir.
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState, UAvatar, UStars, VerifyBadge, StatusBadge } from '@/components/app/ui-bits'
import { ProfileGate } from '@/components/app/profile-gate'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { ChevronLeft, MapPin, Lock, Store, Search, Star, Package, Crown, SendHorizonal, Heart, Share2, MessageCircleOff, Camera, X } from 'lucide-react'

type Profile = {
  id: string; userId: string; displayName: string; avatarUrl: string | null
  businessName: string; kind?: string; cuit: string | null; description: string | null
  address: string | null; city: string | null; verified: boolean; verificationStatus?: string; rating: number
  reviewsCount: number; memberSince: string; subscription?: string; proSince?: string | null
}

// Etiqueta legible del rubro del negocio (mismo vocabulario que el editor de perfil)
const PROVIDER_KIND_LABELS: Record<string, string> = {
  corralon: 'Corralón', ferreteria: 'Ferretería', electricidad: 'Casa de electricidad',
  pintura: 'Pinturería', sanitarios: 'Sanitarios', gas: 'Casa de gas',
  maderera: 'Maderera', carpinteria: 'Carpintería', aberturas: 'Aberturas',
  techos: 'Techos', jardin: 'Jardinería', limpieza: 'Limpieza',
  climatizacion: 'Climatización', herramientas: 'Herramientas', muebles: 'Muebles',
  pisos: 'Pisos', seguridad: 'Seguridad · Industrial', multi: 'Multiproducto',
}
type Stock = {
  id: string; name: string; category: string; categorySlug: string; brand: string | null
  unit: string; price: number; quantity: number; status: string
}
type Review = { id: string; rating: number; comment: string; photos: string; createdAt: string; author: { displayName: string; verificationStatus?: string } }

export default function ProviderProfileScreen({ id }: { id: string }) {
  const { user, loading: sessionLoading } = useSession()
  const [data, setData] = useState<{ profile: Profile; stock: Stock[]; reviews: Review[]; chatBlocked?: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [q, setQ] = useState('')
  const [fav, setFav] = useState(false)
  const [zoom, setZoom] = useState<string | null>(null)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/profiles/provider/${id}`)
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    })()
  }, [id])

  // estado de favorito de este proveedor
  useEffect(() => {
    if (!user) return
    fetch('/api/favorites').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.ids && data?.profile.userId) setFav((d.ids as string[]).includes(data.profile.userId))
    }).catch(() => { /* silencioso */ })
  }, [user, data?.profile.userId])

  async function toggleFav() {
    if (!user || !data) {
      toast('Registrate para guardar favoritos', {
        action: { label: 'Registrarme', onClick: () => navigate(`/registrarse?volver=/proveedor/${id}`) },
      })
      return
    }
    const res = await fetch('/api/favorites', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ targetUserId: data.profile.userId }),
    })
    const d = await res.json()
    if (!res.ok) { toast.error(d.error); return }
    setFav(!!d.favorito)
    toast.success(d.favorito ? 'Agregado a tus favoritos' : 'Quitado de tus favoritos')
  }

  function share() {
    const url = `${window.location.origin}/proveedor/${id}`
    const done = () => toast.success('Enlace copiado — compartilo con quien quieras')
    const fallback = () => {
      try {
        const ta = document.createElement('textarea')
        ta.value = url
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
        done()
      } catch { toast.error(`No se pudo copiar: ${url}`) }
    }
    navigator.clipboard?.writeText(url).then(done, fallback)
  }

  if (loading || sessionLoading) return <div className="min-h-screen"><Loading /></div>
  if (!user) return <ProfileGate path={`/proveedor/${id}`} kind="proveedor" />
  if (!data) return <div className="min-h-screen pt-20 px-4"><EmptyState icon={<Store />} title="Proveedor no encontrado" /></div>

  const p = data.profile
  const chatBlocked = !!data.chatBlocked
  const parsedReviews = data.reviews.map((r) => ({ ...r, photoList: safePhotos(r.photos) }))
  const filtered = data.stock.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()))
  const categories = [...new Set(data.stock.map((s) => s.categorySlug))]

  async function contact() {
    setBusy(true)
    try {
      const res = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: p.userId }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      navigate(`/mensajes?c=${d.conversation.id}`)
    } finally { setBusy(false) }
  }

  return (
    <div className="min-h-screen">
      {/* banda navy con profundidad */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0A2540] via-[#0D3050] to-[#14406B]">
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(58% 90% at 88% -10%, rgba(0,196,255,0.18) 0%, transparent 62%), radial-gradient(45% 70% at -5% 110%, rgba(255,90,31,0.14) 0%, transparent 55%)' }} />
        <div className="relative max-w-4xl mx-auto pt-6 pb-14 sm:pb-16 px-4">
          <div className="mb-5 -ml-3.5">
            <button onClick={() => navigate('/buscar?mode=profesional')} className="homy-focus inline-flex items-center gap-1.5 rounded-full min-h-[44px] px-4 text-slate-300 hover:text-white text-sm font-semibold bg-white/[0.06] hover:bg-white/10 border border-white/10 transition">
              <ChevronLeft className="size-4" aria-hidden /> Volver
            </button>
          </div>
          <div className="flex flex-wrap items-start gap-4 sm:gap-5">
            <UAvatar name={p.businessName} url={p.avatarUrl} size={84} />
            {/* fila propia en el celu: ni el KPI ni el avatar pueden aplastar el nombre */}
            <div className="w-full min-w-0 sm:w-auto sm:flex-1">
              {/* El nombre SIEMPRE entero: en móvil ocupa la fila completa y el
                  badge de verificación baja debajo (nunca aprieta ni corta) */}
              <h1 className="min-w-0 break-words text-2xl font-extrabold leading-tight tracking-tight text-white sm:w-auto sm:text-[1.7rem]">{p.businessName}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <VerifyBadge status={p.verificationStatus} dark compact={false} />
                {p.kind && p.kind !== 'multi' && PROVIDER_KIND_LABELS[p.kind] && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-[#66DFFF]/30 bg-[#00C4FF]/12 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-[#66DFFF]" title="Rubro del negocio">
                    {PROVIDER_KIND_LABELS[p.kind]}
                  </span>
                )}
                {p.subscription === 'pro' && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full border border-[#FFC700]/40 bg-gradient-to-r from-[#FFC700]/25 to-[#ffd84d]/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-[#FFC700]"
                    title="Proveedor sponsor de confianza: destacado Recomendado en directorio y materiales"
                  >
                    <Crown aria-hidden className="size-3" /> ★ Recomendado
                  </span>
                )}
              </div>
              <p className="text-slate-300 text-sm mt-1.5 flex items-center gap-1.5">
                <MapPin aria-hidden className="size-3.5 shrink-0" /> {p.city || p.address || '—'}
              </p>
              <div className="flex items-center gap-2 mt-2.5">
                <Star className="size-4 shrink-0 fill-[#FFC700] text-[#FFC700]" aria-hidden />
                <span className="text-sm text-white font-bold tabular-nums">{p.rating > 0 ? p.rating : 'Nuevo en HomIA'}</span>
                {p.rating > 0 && <span className="text-sm text-slate-300">· {p.reviewsCount} reseñas</span>}
              </div>
            </div>
            <div className="homy-glass-dark rounded-2xl px-5 py-3.5 text-left shrink-0">
              <div className="flex items-center gap-4">
                <div>
                  <p className="text-[0.65rem] text-slate-300 uppercase font-bold tracking-wider">Elementos publicados</p>
                  <p className="text-3xl font-extrabold text-[#66DFFF] tabular-nums leading-none mt-1">{data.stock.length}</p>
                </div>
                {user.id !== p.userId && !chatBlocked && (
                  <button onClick={contact} disabled={busy} className="homy-btn-primary homy-focus px-6 py-3 min-h-[44px] text-sm disabled:opacity-60">
                    <SendHorizonal className="size-4" aria-hidden /> Contactar
                  </button>
                )}
              </div>
              {chatBlocked && (
                <p className="mt-2.5 flex max-w-60 items-center gap-1.5 text-[11px] font-semibold text-slate-300">
                  <MessageCircleOff className="size-4 shrink-0 text-[#66DFFF]" aria-hidden />
                  En HomIA los clientes escriben primero
                </p>
              )}
              <div className="mt-3 flex items-center gap-2">
                {user.id !== p.userId && (
                  <button onClick={toggleFav} aria-pressed={fav} aria-label={fav ? 'Quitar de favoritos' : 'Guardar en favoritos'} className="homy-focus grid size-9 place-items-center rounded-full bg-white/[0.08] border border-white/15 text-white transition hover:bg-white/15">
                    <Heart className={`size-4 ${fav ? 'fill-red-400 text-red-400' : ''}`} aria-hidden />
                  </button>
                )}
                <button onClick={share} aria-label="Compartir perfil" className="homy-focus grid size-9 place-items-center rounded-full bg-white/[0.08] border border-white/15 text-white transition hover:bg-white/15">
                  <Share2 className="size-4" aria-hidden />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-8 pb-16 space-y-7">
        {p.description && (
          <div className="homy-glass rounded-3xl p-5 sm:p-7">
            <p className="text-slate-600 leading-relaxed">{p.description}</p>
          </div>
        )}

        {/* catálogo con stock */}
        <div className="homy-glass rounded-3xl p-4 sm:p-6">
          <div className="homy-section-head flex-wrap">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-mint size-9 shrink-0 [&_svg]:size-[18px]" aria-hidden><Package /></span>
              Catálogo con stock
              <span className="homy-pill tabular-nums">{filtered.length}</span>
            </h2>
            <div className="relative w-full sm:w-auto sm:max-w-64">
              <Search aria-hidden className="size-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar elemento…"
                className="homy-glass-input w-full rounded-full pl-10 pr-4 py-2.5 text-sm"
              />
            </div>
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2 mb-4">
              {categories.map((c) => <span key={c} className="homy-pill capitalize">{c}</span>)}
            </div>
          )}
          {!user ? (
            <div className="homy-glass-featured rounded-2xl p-8 text-center">
              <span aria-hidden className="homy-icon-chip homy-chip-gold size-12 mx-auto [&_svg]:size-5"><Lock /></span>
              <p className="font-extrabold text-[#0A2540] mt-3">Registrate para ver precios y stock</p>
              <p className="text-sm text-slate-500 mt-1.5 max-w-sm mx-auto">Los precios son visibles para profesionales con cuenta (gratis, 1 minuto).</p>
              <button onClick={() => navigate('/registrarse?rol=profesional')} className="homy-btn-primary homy-focus mt-5 px-6 py-3 min-h-[44px] text-sm">
                Crear cuenta gratis
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="homy-glass-soft rounded-2xl p-6 text-sm text-slate-500 flex items-center justify-center gap-2">
              <Search className="size-4 shrink-0" aria-hidden /> Sin elementos que coincidan.
            </div>
          ) : (
            <div className="homy-stagger grid gap-3 sm:grid-cols-2">
              {filtered.map((s) => (
                <div key={s.id} className="homy-row flex flex-wrap items-center justify-between gap-2 sm:gap-3 p-4">
                  <div className="min-w-0 flex-1 basis-44">
                    <p className="font-bold text-[#0A2540] truncate">{s.name}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{s.category}{s.brand ? ` · ${s.brand}` : ''} · stock: {s.quantity} {s.unit}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={s.status} />
                    <p className="homy-num text-lg font-extrabold text-[#16A34A] text-right">{formatARS(s.price)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* reseñas desglosadas: estrellas + comentario + fotos que avalan */}
        <section>
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-[18px]" aria-hidden><Star /></span>
              Reseñas
              <span className="homy-pill tabular-nums">{parsedReviews.length}</span>
            </h2>
          </div>
          {parsedReviews.length === 0 ? (
            <EmptyState icon={<Star />} title="Sin reseñas todavía." />
          ) : (
            <div className="homy-stagger space-y-3.5">
              {parsedReviews.map((r) => (
                <article key={r.id} className="homy-glass rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UAvatar name={r.author.displayName} size={36} />
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-sm font-bold leading-snug text-[#0A2540]">
                          <span className="min-w-0 break-words">{r.author.displayName}</span>
                          {r.author.verificationStatus && r.author.verificationStatus !== 'none' && <VerifyBadge status={r.author.verificationStatus} />}
                        </p>
                        <UStars rating={r.rating} size="text-xs" />
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{formatDate(r.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-3 leading-relaxed">{r.comment}</p>
                  {r.photoList.length > 0 && (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {r.photoList.map((ph, j) => (
                        <button
                          key={j}
                          onClick={() => setZoom(ph)}
                          className="homy-focus group relative overflow-hidden rounded-xl ring-1 ring-[#0A2540]/8"
                          aria-label={`Ampliar foto ${j + 1} de la reseña`}
                        >
                          <img src={ph} alt={`Foto ${j + 1} de la reseña de ${r.author.displayName}`} className="h-20 w-20 object-cover transition-transform duration-300 group-hover:scale-105" />
                          <span className="absolute inset-0 grid place-items-center bg-[#0A2540]/0 transition group-hover:bg-[#0A2540]/25">
                            <Camera className="size-4 text-white opacity-0 transition group-hover:opacity-100" aria-hidden />
                          </span>
                        </button>
                      ))}
                      <span className="inline-flex items-center gap-1 self-end rounded-full homy-glass-soft px-2.5 py-1 text-[10px] font-bold text-slate-400">
                        <Camera className="size-3" aria-hidden /> foto{r.photoList.length > 1 ? 's' : ''} de la compra
                      </span>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* lightbox de fotos de reseñas */}
      {zoom && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Foto ampliada de la reseña"
          onClick={() => setZoom(null)}
          className="fixed inset-0 z-50 grid place-items-center bg-[#0A2540]/80 p-4 backdrop-blur-sm"
        >
          <img src={zoom} alt="Foto ampliada de la reseña" className="max-h-[85vh] max-w-full rounded-2xl shadow-2xl" />
          <button onClick={() => setZoom(null)} className="homy-focus absolute top-5 right-5 grid size-11 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20" aria-label="Cerrar">
            <X className="size-5" aria-hidden />
          </button>
        </div>
      )}
    </div>
  )
}

function safePhotos(json: string): string[] {
  try { return JSON.parse(json) as string[] } catch { return [] }
}
