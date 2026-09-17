'use client'
// Perfil público de profesional: obras, reseñas, contratar directo
import { useEffect, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState, UAvatar, UStars, StatCard } from '@/components/app/ui-bits'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { ChevronLeft, BadgeCheck, MapPin, HardHat, Briefcase, Star, ArrowUpRight, ImageOff, Search } from 'lucide-react'

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
        <div className="relative max-w-4xl mx-auto pt-6 pb-12 px-4">
          <button onClick={() => navigate('/buscar?mode=cliente')} className="homy-focus text-slate-300 hover:text-white text-sm flex items-center gap-1.5 mb-4 transition-colors">
            <ChevronLeft className="size-4" /> Volver
          </button>
          <div className="flex flex-wrap items-start gap-4">
            <UAvatar name={p.displayName} url={p.avatarUrl} size={76} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-extrabold text-white tracking-tight">{p.companyName || p.displayName}</h1>
                {p.verified && <BadgeCheck aria-label="Verificado" className="size-5 text-[#66DFFF]" />}
                {p.personType === 'empresa' && <span className="homy-pill">Empresa</span>}
              </div>
              <p className="text-slate-300 capitalize text-sm mt-0.5">{p.professions.join(' · ') || 'Profesional'}</p>
              <div className="flex items-center gap-2 mt-2">
                <UStars rating={p.rating} />
                <span className="text-sm text-slate-300">{p.rating > 0 ? `${p.rating} · ${p.reviewsCount} reseñas` : 'Nuevo en HomIA'}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <MapPin aria-hidden className="size-3" /> {p.city || '—'} · radio {p.serviceRadiusKm} km · miembro desde {formatDate(p.memberSince)}
              </p>
            </div>
            <button onClick={hire} disabled={busy} className="homy-btn-primary homy-focus px-6 py-3 text-sm disabled:opacity-60">
              {busy ? 'Creando…' : 'Contratar'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-8 pb-16 space-y-6">
        {/* stats */}
        <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <StatCard label="Obras publicadas" value={p.worksCount} accent="#1D63B8" icon={<HardHat />} tone="blue" />
          <StatCard label="Años experiencia" value={p.experienceYears} accent="#B98A00" icon={<Briefcase />} tone="gold" />
          <StatCard label="Reseñas" value={p.reviewsCount} accent="#1D63B8" icon={<Star />} tone="ai" />
        </div>

        {/* bio + habilidades */}
        <div className="homy-glass rounded-3xl p-6">
          {p.bio && <p className="text-slate-600 leading-relaxed whitespace-pre-wrap">{p.bio}</p>}
          {p.skills.length > 0 && (
            <div className={`flex flex-wrap gap-2 ${p.bio ? 'mt-4' : ''}`}>
              {p.skills.map((s) => <span key={s} className="homy-glass-soft text-[#1D63B8] text-xs font-semibold px-3 py-1.5 rounded-full">{s}</span>)}
            </div>
          )}
          {p.companyWebsite && (
            <a href={p.companyWebsite.startsWith('http') ? p.companyWebsite : `https://${p.companyWebsite}`} target="_blank" rel="noreferrer" className={`inline-flex items-center gap-1 text-sm font-bold text-[#1D63B8] hover:underline ${p.bio || p.skills.length > 0 ? 'mt-3' : ''}`}>
              {p.companyWebsite} <ArrowUpRight aria-hidden className="size-3.5" />
            </a>
          )}
        </div>

        {/* obras */}
        <div>
          <h2 className="text-lg font-extrabold text-[#0A2540] mb-3">Trabajos realizados ({parsedWorks.length})</h2>
          {parsedWorks.length === 0 ? (
            <EmptyState icon={<ImageOff />} title="Todavía no publicó obras." />
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {parsedWorks.map((w) => (
                <div key={w.id} className="homy-glass homy-lift homy-card-glow rounded-2xl overflow-hidden">
                  {w.photoList.length > 0 && (
                    <img src={w.photoList[0]} alt={w.title} className="h-44 w-full object-cover" />
                  )}
                  <div className="p-4">
                    <p className="font-bold text-[#0A2540]">{w.title}</p>
                    <p className="text-sm text-slate-500 line-clamp-2 mt-1">{w.description}</p>
                    <p className="text-xs text-slate-400 mt-2">{formatDate(w.createdAt)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* reseñas */}
        <div>
          <h2 className="text-lg font-extrabold text-[#0A2540] mb-3">Reseñas ({data.reviews.length})</h2>
          {data.reviews.length === 0 ? (
            <EmptyState icon={<Star />} title="Sin reseñas todavía." />
          ) : (
            <div className="space-y-3">
              {data.reviews.map((r) => (
                <div key={r.id} className="homy-glass rounded-2xl p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <UAvatar name={r.author.displayName} size={34} />
                      <div>
                        <p className="text-sm font-bold text-[#0A2540]">{r.author.displayName}</p>
                        <UStars rating={r.rating} size="text-xs" />
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">{formatDate(r.createdAt)}</span>
                  </div>
                  <p className="text-sm text-slate-600 mt-2">{r.comment}</p>
                  {r.reply && (
                    <div className="mt-3 rounded-xl bg-[#1D63B8]/5 border-l-4 border-[#1D63B8] p-3">
                      <p className="text-xs font-bold text-[#1D63B8]">Respuesta del profesional</p>
                      <p className="text-sm text-slate-600">{r.reply}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function safePhotos(json: string): string[] {
  try { return JSON.parse(json) as string[] } catch { return [] }
}
