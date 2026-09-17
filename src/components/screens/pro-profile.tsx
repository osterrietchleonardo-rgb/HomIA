'use client'
// Perfil público de profesional: obras, reseñas, contratar directo
import { useEffect, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState, UAvatar, UStars } from '@/components/app/ui-bits'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { ChevronLeft, BadgeCheck, MapPin, HardHat, Briefcase, Star, ArrowUpRight, ImageOff, Search, Images } from 'lucide-react'

type Profile = {
  id: string; userId: string; displayName: string; avatarUrl: string | null; city: string | null
  personType: string; professions: string[]; skills: string[]; experienceYears: number
  bio: string | null; companyName: string | null; companyWebsite: string | null
  employeesCount: number | null; serviceRadiusKm: number; verified: boolean
  rating: number; reviewsCount: number; worksCount: number; memberSince: string
}
type Work = { id: string; title: string; description: string; photos: string; createdAt: string }
type Review = { id: string; rating: number; comment: string; reply: string | null; createdAt: string; author: { displayName: string } }

export default function ProProfileScreen({ id }: { id: string }) {
  const route = useRoute()
  const { user, refresh } = useSession()
  const [data, setData] = useState<{ profile: Profile; works: Work[]; reviews: Review[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/profiles/professional/${id}`)
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    })()
  }, [id])

  async function hire() {
    if (!user) {
      toast('Registrate para contratar', {
        description: 'Necesitás una cuenta para crear un proyecto con este profesional.',
        action: { label: 'Registrarme', onClick: () => navigate(`/registrarse?volver=/profesional/${id}`) },
      })
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ professionalProfileId: id, title: `Proyecto con ${data?.profile.companyName || data?.profile.displayName}` }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      toast.success('Proyecto creado. Coordiná con el profesional.')
      navigate(`/panel/cliente/proyectos/${d.project.id}`)
    } finally { setBusy(false) }
  }

  if (loading) return <div className="min-h-screen"><Loading /></div>
  if (!data) return <div className="min-h-screen pt-20 px-4"><EmptyState icon={<Search />} title="Profesional no encontrado" /></div>

  const p = data.profile
  const parsedWorks = data.works.map((w) => ({ ...w, photoList: safePhotos(w.photos) }))

  return (
    <div className="min-h-screen">
      {/* banda navy con profundidad */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0A2540] via-[#0D3050] to-[#14406B]">
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(58% 90% at 88% -10%, rgba(0,196,255,0.18) 0%, transparent 62%), radial-gradient(45% 70% at -5% 110%, rgba(255,90,31,0.14) 0%, transparent 55%)' }} />
        <div className="relative max-w-4xl mx-auto pt-6 pb-14 sm:pb-16 px-4">
          <div className="mb-5 -ml-3.5">
            <button onClick={() => navigate('/buscar?mode=cliente')} className="homy-focus inline-flex items-center gap-1.5 rounded-full min-h-[44px] px-4 text-slate-300 hover:text-white text-sm font-semibold bg-white/[0.06] hover:bg-white/10 border border-white/10 transition">
              <ChevronLeft className="size-4" aria-hidden /> Volver
            </button>
          </div>
          <div className="flex flex-wrap items-start gap-4 sm:gap-5">
            <UAvatar name={p.displayName} url={p.avatarUrl} size={84} />
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-[1.7rem] font-extrabold text-white tracking-tight leading-tight">{p.companyName || p.displayName}</h1>
                {p.verified && <BadgeCheck aria-label="Verificado" className="size-5 shrink-0 text-[#66DFFF]" />}
                {p.personType === 'empresa' && <span className="homy-pill text-[#0A2540]">Empresa</span>}
              </div>
              <p className="text-[#66DFFF] capitalize text-sm font-semibold mt-1">{p.professions.join(' · ') || 'Profesional'}</p>
              <div className="flex items-center gap-2 mt-2.5">
                <Star className="size-4 shrink-0 fill-[#FFC700] text-[#FFC700]" aria-hidden />
                <span className="text-sm text-white font-bold tabular-nums">{p.rating > 0 ? p.rating : 'Nuevo en HomIA'}</span>
                {p.rating > 0 && <span className="text-sm text-slate-300">· {p.reviewsCount} reseñas</span>}
              </div>
              <p className="text-xs text-slate-400 mt-1.5 flex items-center gap-1 flex-wrap">
                <MapPin aria-hidden className="size-3 shrink-0" /> {p.city || '—'} · radio {p.serviceRadiusKm} km · miembro desde {formatDate(p.memberSince)}
              </p>
            </div>
            <div className="w-full sm:w-auto shrink-0">
              <button onClick={hire} disabled={busy} className="homy-btn-primary homy-focus w-full sm:w-auto px-7 py-3 min-h-[44px] text-sm disabled:opacity-60">
                {busy ? 'Creando…' : 'Contratar'}
              </button>
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

        {/* reseñas */}
        <section>
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-[18px]" aria-hidden><Star /></span>
              Reseñas
              <span className="homy-pill tabular-nums">{data.reviews.length}</span>
            </h2>
            {p.rating > 0 && (
              <span className="homy-pill">
                <Star className="size-3 fill-[#FFC700] text-[#FFC700]" aria-hidden />
                {p.rating} promedio
              </span>
            )}
          </div>
          {data.reviews.length === 0 ? (
            <EmptyState icon={<Star />} title="Sin reseñas todavía." />
          ) : (
            <div className="homy-stagger space-y-3.5">
              {data.reviews.map((r) => (
                <article key={r.id} className="homy-glass rounded-2xl p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <UAvatar name={r.author.displayName} size={36} />
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-[#0A2540] truncate">{r.author.displayName}</p>
                        <UStars rating={r.rating} size="text-xs" />
                      </div>
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">{formatDate(r.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-3 leading-relaxed">{r.comment}</p>
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
    </div>
  )
}

function safePhotos(json: string): string[] {
  try { return JSON.parse(json) as string[] } catch { return [] }
}
