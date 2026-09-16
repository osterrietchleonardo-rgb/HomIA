'use client'
// Perfil público de profesional: obras, reseñas, contratar directo
import { useEffect, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState, UAvatar, UStars, StatusBadge } from '@/components/app/ui-bits'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { ChevronLeft, BadgeCheck, MapPin } from 'lucide-react'

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
  if (!data) return <div className="min-h-screen pt-20"><EmptyState icon="🔎" title="Profesional no encontrado" /></div>

  const p = data.profile
  const parsedWorks = data.works.map((w) => ({ ...w, photoList: safePhotos(w.photos) }))

  return (
    <div className="min-h-screen">
      <div className="bg-[#0A2540] pt-6 pb-12 px-4">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => navigate('/buscar?mode=cliente')} className="text-slate-300 hover:text-white text-sm flex items-center gap-1 mb-4">
            <ChevronLeft className="size-4" /> Volver
          </button>
          <div className="flex flex-wrap items-start gap-4">
            <UAvatar name={p.displayName} url={p.avatarUrl} size={76} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-extrabold text-white">{p.companyName || p.displayName}</h1>
                {p.verified && <BadgeCheck className="size-5 text-[#00C4FF]" />}
                {p.personType === 'empresa' && <span className="rounded-full bg-white/10 text-white text-xs font-bold px-2.5 py-1">Empresa</span>}
              </div>
              <p className="text-slate-300 capitalize text-sm mt-0.5">{p.professions.join(' · ') || 'Profesional'}</p>
              <div className="flex items-center gap-2 mt-2">
                <UStars rating={p.rating} />
                <span className="text-sm text-slate-300">{p.rating > 0 ? `${p.rating} · ${p.reviewsCount} reseñas` : 'Nuevo en HomIA'}</span>
              </div>
              <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                <MapPin className="size-3" /> {p.city || '—'} · radio {p.serviceRadiusKm} km · miembro desde {formatDate(p.memberSince)}
              </p>
            </div>
            <button onClick={hire} disabled={busy} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] disabled:opacity-60 px-5 py-3 font-bold text-white shadow-lg transition">
              {busy ? 'Creando…' : 'Contratar'}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-6 pb-16 space-y-6">
        {/* bio + stats */}
        <div className="rounded-3xl homy-glass border border-slate-200 shadow-lg p-6">
          <div className="grid grid-cols-3 gap-3 text-center">
            <Stat value={p.worksCount} label="Obras publicadas" />
            <Stat value={p.experienceYears} label="Años experiencia" />
            <Stat value={p.reviewsCount} label="Reseñas" />
          </div>
          {p.bio && <p className="mt-4 text-slate-600 leading-relaxed whitespace-pre-wrap">{p.bio}</p>}
          {p.skills.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {p.skills.map((s) => <span key={s} className="rounded-full bg-[#1D63B8]/8 text-[#1D63B8] text-xs font-semibold px-3 py-1">{s}</span>)}
            </div>
          )}
          {p.companyWebsite && (
            <a href={p.companyWebsite.startsWith('http') ? p.companyWebsite : `https://${p.companyWebsite}`} target="_blank" rel="noreferrer" className="inline-block mt-3 text-sm font-bold text-[#1D63B8] hover:underline">
              {p.companyWebsite} ↗
            </a>
          )}
        </div>

        {/* obras */}
        <div>
          <h2 className="text-lg font-extrabold text-[#0A2540] mb-3">Trabajos realizados ({parsedWorks.length})</h2>
          {parsedWorks.length === 0 ? (
            <div className="rounded-2xl homy-glass border border-slate-200 p-6 text-sm text-slate-500">Todavía no publicó obras.</div>
          ) : (
            <div className="grid sm:grid-cols-2 gap-4">
              {parsedWorks.map((w) => (
                <div key={w.id} className="rounded-2xl homy-glass border border-slate-200 shadow-sm overflow-hidden">
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
            <div className="rounded-2xl homy-glass border border-slate-200 p-6 text-sm text-slate-500">Sin reseñas todavía.</div>
          ) : (
            <div className="space-y-3">
              {data.reviews.map((r) => (
                <div key={r.id} className="rounded-2xl homy-glass border border-slate-200 p-4">
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
                    <div className="mt-3 rounded-xl homy-glass-soft border-l-4 border-[#1D63B8] p-3">
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

function Stat({ value, label }: { value: number; label: string }) {
  return (
    <div className="rounded-2xl homy-glass-soft py-3">
      <p className="text-2xl font-extrabold text-[#0A2540]">{value}</p>
      <p className="text-xs text-slate-500 font-semibold uppercase">{label}</p>
    </div>
  )
}

function safePhotos(json: string): string[] {
  try { return JSON.parse(json) as string[] } catch { return [] }
}
