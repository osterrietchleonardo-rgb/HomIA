'use client'
// Perfil de profesional (requiere sesión): obras, reseñas desglosadas (texto +
// fotos que avalan cada opinión), contratar directo, contactar, favoritos y compartir.
import { useEffect, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState, UAvatar, UStars, VerifyBadge } from '@/components/app/ui-bits'
import { ProfileGate } from '@/components/app/profile-gate'
import ReviewsShortcut, { formatRating } from '@/components/app/reviews-shortcut'
import HireWizard, { type HireTarget } from '@/components/app/hire-wizard'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { ChevronLeft, MapPin, HardHat, Briefcase, Star, ArrowUpRight, ImageOff, Search, Images, SendHorizonal, Heart, Share2, MessageCircleOff, Camera, X } from 'lucide-react'

type Profile = {
  id: string; userId: string; displayName: string; avatarUrl: string | null; city: string | null
  personType: string; professions: string[]; skills: string[]; experienceYears: number
  bio: string | null; companyName: string | null; companyWebsite: string | null
  employeesCount: number | null; serviceRadiusKm: number; verified: boolean; verificationStatus?: string; subscription?: string
  rating: number; reviewsCount: number; worksCount: number; memberSince: string
}
type Work = { id: string; title: string; description: string; photos: string; createdAt: string }
type Review = { id: string; rating: number; comment: string; photos: string; reply: string | null; createdAt: string; author: { displayName: string; verificationStatus?: string } }

export default function ProProfileScreen({ id }: { id: string }) {
  const route = useRoute()
  const { user, loading: sessionLoading, refresh } = useSession()
  const [data, setData] = useState<{ profile: Profile; works: Work[]; reviews: Review[]; chatBlocked?: boolean } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [fav, setFav] = useState(false)
  const [zoom, setZoom] = useState<string | null>(null)
  const [hireOpen, setHireOpen] = useState(false)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/profiles/professional/${id}`)
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    })()
  }, [id])

  // estado de favorito de este profesional
  useEffect(() => {
    if (!user) return
    fetch('/api/favorites').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d?.ids && data?.profile.userId) setFav((d.ids as string[]).includes(data.profile.userId))
    }).catch(() => { /* silencioso */ })
  }, [user, data?.profile.userId])

  async function toggleFav() {
    if (!user || !data) {
      toast('Registrate para guardar favoritos', {
        action: { label: 'Registrarme', onClick: () => navigate(`/registrarse?volver=/profesional/${id}`) },
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
    const url = `${window.location.origin}/profesional/${id}`
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

  function hire() {
    if (!user) {
      toast('Registrate para contratar', {
        description: 'Necesitás una cuenta para crear un proyecto con este profesional.',
        action: { label: 'Registrarme', onClick: () => navigate(`/registrarse?volver=/profesional/${id}`) },
      })
      return
    }
    if (!data) return
    setHireOpen(true)
  }

  async function contact() {
    if (!data) return
    setBusy(true)
    try {
      const res = await fetch('/api/messages/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ targetUserId: data.profile.userId }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      navigate(`/mensajes?c=${d.conversation.id}`)
    } finally { setBusy(false) }
  }

  if (loading || sessionLoading) return <div className="min-h-screen"><Loading /></div>
  if (!user) return <ProfileGate path={`/profesional/${id}`} kind="profesional" />
  if (!data) return <div className="min-h-screen pt-20 px-4"><EmptyState icon={<Search />} title="Profesional no encontrado" /></div>

  const p = data.profile
  const parsedWorks = data.works.map((w) => ({ ...w, photoList: safePhotos(w.photos) }))
  const parsedReviews = data.reviews.map((r) => ({ ...r, photoList: safePhotos(r.photos) }))
  const chatBlocked = !!data.chatBlocked

  return (
    <div className="min-h-screen">
      {/* banda navy con profundidad */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0A2540] via-[#0D3050] to-[#14406B]">
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(58% 90% at 88% -10%, rgba(0,196,255,0.18) 0%, transparent 62%), radial-gradient(45% 70% at -5% 110%, rgba(255,90,31,0.14) 0%, transparent 55%)' }} />
        <div className="relative max-w-4xl mx-auto pt-6 pb-14 sm:pb-16 px-4">
          <div className="mb-5 -ml-3.5">
            <button onClick={() => { if (window.history.length > 1) window.history.back(); else navigate('/directorio') }} className="homy-focus inline-flex items-center gap-1.5 rounded-full min-h-[44px] px-4 text-slate-300 hover:text-white text-sm font-semibold bg-white/[0.06] hover:bg-white/10 border border-white/10 transition">
              <ChevronLeft className="size-4" aria-hidden /> Volver
            </button>
          </div>
          <div className="flex flex-wrap items-start gap-4 sm:gap-5">
            <UAvatar name={p.displayName} url={p.avatarUrl} size={84} />
            {/* fila propia en el celu: el nombre nunca se aplasta */}
            <div className="w-full min-w-0 sm:w-auto sm:flex-1">
              {/* El nombre SIEMPRE entero: en móvil ocupa la fila completa y el
                  badge de verificación baja debajo (nunca aprieta ni corta) */}
              <h1 className="min-w-0 break-words text-2xl font-extrabold leading-tight tracking-tight text-white sm:w-auto sm:text-[1.7rem]">{p.companyName || p.displayName}</h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                <VerifyBadge status={p.verificationStatus} dark compact={false} />
                {p.personType === 'empresa' && <span className="homy-pill text-[#0A2540]">Empresa</span>}
              </div>
              <p className="text-[#66DFFF] capitalize text-sm font-semibold mt-1">{p.professions.join(' · ') || 'Profesional'}</p>
              {/* atajo a las reseñas (scroll suave + foco en la sección) */}
              <div className="mt-2">
                <ReviewsShortcut rating={p.rating} count={p.reviewsCount} targetId="resenas-profesional" dark className="-ml-1" />
              </div>
              <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1 flex-wrap">
                <MapPin aria-hidden className="size-3 shrink-0" /> {p.city || '—'} · radio {p.serviceRadiusKm} km · miembro desde {formatDate(p.memberSince)}
              </p>
            </div>
            <div className="w-full sm:w-auto shrink-0">
              <div className="flex w-full flex-col gap-2.5 sm:w-auto sm:flex-row">
                {user && user.id !== p.userId && (
                  <button onClick={toggleFav} aria-pressed={fav} aria-label={fav ? 'Quitar de favoritos' : 'Guardar en favoritos'} className="homy-focus grid size-[46px] place-items-center rounded-full bg-white/[0.08] border border-white/15 text-white transition hover:bg-white/15">
                    <Heart className={`size-5 ${fav ? 'fill-red-400 text-red-400' : ''}`} aria-hidden />
                  </button>
                )}
                <button onClick={share} aria-label="Compartir perfil" className="homy-focus grid size-[46px] place-items-center rounded-full bg-white/[0.08] border border-white/15 text-white transition hover:bg-white/15">
                  <Share2 className="size-5" aria-hidden />
                </button>
                {user && user.id !== p.userId && !chatBlocked && (
                  <button onClick={contact} disabled={busy} className="homy-btn-dark homy-focus w-full px-6 py-3 min-h-[44px] text-sm disabled:opacity-60">
                    <SendHorizonal className="size-4" aria-hidden /> Contactar
                  </button>
                )}
                {user && user.id !== p.userId && (
                  <button onClick={hire} disabled={busy} className="homy-btn-primary homy-focus w-full sm:w-auto px-7 py-3 min-h-[44px] text-sm disabled:opacity-60">
                    Contratar
                  </button>
                )}
              </div>
              {chatBlocked && (
                <p className="mt-2.5 flex items-center justify-center gap-1.5 rounded-full bg-white/[0.07] border border-white/12 px-3.5 py-2 text-[11.5px] font-semibold text-slate-300 sm:justify-start">
                  <MessageCircleOff className="size-4 shrink-0 text-[#66DFFF]" aria-hidden />
                  En HomIA los clientes escriben primero — respondé cuando te contacten
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-8 pb-16 space-y-7">
        {/* stats */}
        <div className="homy-stagger grid grid-cols-3 gap-2.5 sm:gap-4">
          <div className="homy-kpi homy-glass homy-lift" style={{ ['--kpi-glow' as string]: '#00C4FF' }}>
            <div className="flex items-start justify-between gap-2">
              <p className="homy-kpi-label">Obras publicadas</p>
              <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><HardHat /></span>
            </div>
            <p className="homy-kpi-value mt-2">{p.worksCount}</p>
          </div>
          <div className="homy-kpi homy-glass homy-lift" style={{ ['--kpi-glow' as string]: '#FFC700' }}>
            <div className="flex items-start justify-between gap-2">
              <p className="homy-kpi-label">Años experiencia</p>
              <span className="homy-icon-chip homy-chip-gold size-8 shrink-0 [&_svg]:size-4" aria-hidden><Briefcase /></span>
            </div>
            <p className="homy-kpi-value mt-2">{p.experienceYears}</p>
          </div>
          <div className="homy-kpi homy-glass homy-lift" style={{ ['--kpi-glow' as string]: '#1D63B8' }}>
            <div className="flex items-start justify-between gap-2">
              <p className="homy-kpi-label">Reseñas</p>
              <span className="homy-icon-chip homy-chip-ai size-8 shrink-0 [&_svg]:size-4" aria-hidden><Star /></span>
            </div>
            <p className="homy-kpi-value mt-2">{p.reviewsCount}</p>
          </div>
        </div>

        {/* bio + habilidades */}
        {(p.bio || p.skills.length > 0 || p.companyWebsite) && (
          <div className="homy-glass rounded-3xl p-5 sm:p-7">
            {p.bio && <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{p.bio}</p>}
            {p.skills.length > 0 && (
              <div className={`flex flex-wrap gap-2 ${p.bio ? 'mt-4' : ''}`}>
                {p.skills.map((s) => <span key={s} className="homy-glass-soft text-[#1D63B8] text-xs font-bold px-3.5 py-2 rounded-full">{s}</span>)}
              </div>
            )}
            {p.companyWebsite && (
              <a href={p.companyWebsite.startsWith('http') ? p.companyWebsite : `https://${p.companyWebsite}`} target="_blank" rel="noreferrer" className={`homy-focus inline-flex items-center gap-1.5 rounded-lg text-sm font-bold text-[#1D63B8] hover:underline underline-offset-2 ${p.bio || p.skills.length > 0 ? 'mt-4' : ''}`}>
                {p.companyWebsite} <ArrowUpRight aria-hidden className="size-3.5" />
              </a>
            )}
          </div>
        )}

        {/* obras */}
        <section>
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-orange size-9 shrink-0 [&_svg]:size-[18px]" aria-hidden><Images /></span>
              Trabajos realizados
              <span className="homy-pill tabular-nums">{parsedWorks.length}</span>
            </h2>
          </div>
          {parsedWorks.length === 0 ? (
            <EmptyState icon={<ImageOff />} title="Todavía no publicó obras." />
          ) : (
            <div className="homy-stagger grid sm:grid-cols-2 gap-4 sm:gap-5">
              {parsedWorks.map((w) => (
                <article key={w.id} className="homy-glass homy-lift homy-card-glow rounded-2xl overflow-hidden">
                  {w.photoList.length > 0 && (
                    <img src={w.photoList[0]} alt={w.title} className="h-44 sm:h-48 w-full object-cover" />
                  )}
                  <div className="p-5">
                    <p className="font-bold text-[#0A2540] leading-snug">{w.title}</p>
                    <p className="text-sm text-slate-500 line-clamp-2 mt-1.5 leading-relaxed">{w.description}</p>
                    <p className="text-xs text-slate-400 mt-2.5">{formatDate(w.createdAt)}</p>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        {/* reseñas desglosadas: estrellas + comentario + fotos que avalan */}
        <section id="resenas-profesional" aria-labelledby="resenas-profesional-titulo" className="scroll-mt-24 rounded-3xl outline-none focus-visible:ring-2 focus-visible:ring-[#1D63B8]/40">
          <div className="homy-section-head">
            <h2 id="resenas-profesional-titulo" className="homy-section-title">
              <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-[18px]" aria-hidden><Star /></span>
              Reseñas
              <span className="homy-pill tabular-nums">{parsedReviews.length}</span>
            </h2>
            {p.rating > 0 && (
              <span className="homy-pill">
                <Star className="size-3 fill-[#FFC700] text-[#FFC700]" aria-hidden />
                {formatRating(p.rating)} promedio
              </span>
            )}
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
                        <Camera className="size-3" aria-hidden /> foto{r.photoList.length > 1 ? 's' : ''} de la obra
                      </span>
                    </div>
                  )}
                  {r.reply && (
                    <div className="mt-3.5 rounded-xl bg-[#1D63B8]/5 border-l-4 border-[#1D63B8] p-3.5">
                      <p className="text-xs font-bold text-[#1D63B8]">Respuesta del profesional</p>
                      <p className="text-sm text-slate-600 mt-0.5">{r.reply}</p>
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      </div>

      {/* wizard de contratación completa */}
      <HireWizard
        open={hireOpen}
        onClose={() => setHireOpen(false)}
        target={{
          id: p.id, userId: p.userId, displayName: p.displayName, companyName: p.companyName,
          avatarUrl: p.avatarUrl, city: p.city, professions: p.professions, verificationStatus: p.verificationStatus,
        } as HireTarget}
      />

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
