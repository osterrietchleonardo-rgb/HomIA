'use client'
// Sponsors de confianza — proveedores con Plan PRO: su logo y marca en la home.
// Es el tercer beneficio del PRO, junto a la analítica y la tarjeta Recomendado.
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { UAvatar, UStars } from '@/components/app/ui-bits'
import { Crown, ShieldCheck } from 'lucide-react'

type Sponsor = {
  id: string; href: string; businessName: string; kind: string; city: string | null
  avatarUrl: string | null; verified: boolean; rating: number; reviewsCount: number; stockCount: number
}

export function Sponsors() {
  const [sponsors, setSponsors] = useState<Sponsor[] | null>(null)

  useEffect(() => {
    fetch('/api/sponsors')
      .then(async (r) => { if (r.ok) setSponsors((await r.json()).sponsors || []) })
      .catch(() => setSponsors([]))
  }, [])

  if (sponsors === null || sponsors.length === 0) return null // sin PRO activos, la sección no existe

  return (
    <section aria-label="Proveedores sponsors de confianza" className="relative mx-auto max-w-7xl px-4 py-14 sm:py-16">
      <div className="mx-auto max-w-2xl text-center">
        <p className="homy-eyebrow">Sponsors de nuestra confianza</p>
        <h2 className="mt-2 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">
          Proveedores <span className="text-[#B98A00]">Plan PRO</span> de la comunidad
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[15px] leading-relaxed text-slate-500">
          Negocios que confían en HomIA y aparecen como recomendados en todas las búsquedas de la plataforma.
        </p>
      </div>

      <div className="homy-stagger mt-9 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {sponsors.map((s) => (
          <button
            key={s.id}
            onClick={() => navigate(s.href)}
            className="homy-glass homy-lift homy-card-glow homy-focus group flex w-full items-center gap-3.5 rounded-3xl p-4 text-left ring-1 ring-[#FFC700]/50"
            aria-label={`Abrir ${s.businessName}, proveedor sponsor`}
          >
            <UAvatar name={s.businessName} url={s.avatarUrl} size={52} />
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-1.5">
                <span className="truncate text-[15px] font-extrabold text-navy">{s.businessName}</span>
                {s.verified && <ShieldCheck className="size-4 shrink-0 text-[#0e9f6e]" aria-label="Verificado" />}
              </span>
              <span className="mt-0.5 flex items-center gap-1.5 text-xs text-slate-400">
                <UStars rating={s.rating} size="text-xs" />
                <span className="tabular-nums">{s.rating > 0 ? s.rating : '—'} · {s.reviewsCount} reseñas</span>
              </span>
              <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#FFC700] to-[#ffd84d] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-[#6b4d00]">
                <Crown className="size-2.5" aria-hidden /> Sponsor
              </span>
            </span>
          </button>
        ))}
      </div>
    </section>
  )
}
