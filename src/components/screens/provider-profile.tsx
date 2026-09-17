'use client'
// Perfil público de proveedor: catálogo/stock, reseñas, contacto gated
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState, UAvatar, UStars, StatusBadge } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { ChevronLeft, MapPin, Lock, Store, Search, Star, BadgeCheck, Package } from 'lucide-react'

type Profile = {
  id: string; userId: string; displayName: string; avatarUrl: string | null
  businessName: string; cuit: string | null; description: string | null
  address: string | null; city: string | null; verified: boolean; rating: number
  reviewsCount: number; memberSince: string
}
type Stock = {
  id: string; name: string; category: string; categorySlug: string; brand: string | null
  unit: string; price: number; quantity: number; status: string
}
type Review = { id: string; rating: number; comment: string; createdAt: string; author: { displayName: string } }

export default function ProviderProfileScreen({ id }: { id: string }) {
  const { user } = useSession()
  const [data, setData] = useState<{ profile: Profile; stock: Stock[]; reviews: Review[] } | null>(null)
  const [loading, setLoading] = useState(true)
  const [q, setQ] = useState('')

  useEffect(() => {
    (async () => {
      setLoading(true)
      try {
        const res = await fetch(`/api/profiles/provider/${id}`)
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    })()
  }, [id])

  if (loading) return <div className="min-h-screen"><Loading /></div>
  if (!data) return <div className="min-h-screen pt-20 px-4"><EmptyState icon={<Store />} title="Proveedor no encontrado" /></div>

  const p = data.profile
  const filtered = data.stock.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()))
  const categories = [...new Set(data.stock.map((s) => s.categorySlug))]

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
            <div className="flex-1 min-w-[240px]">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl sm:text-[1.7rem] font-extrabold text-white tracking-tight leading-tight">{p.businessName}</h1>
                {p.verified && <BadgeCheck aria-label="Verificado" className="size-5 shrink-0 text-[#66DFFF]" />}
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
              <p className="text-[0.65rem] text-slate-300 uppercase font-bold tracking-wider">Elementos publicados</p>
              <p className="text-3xl font-extrabold text-[#66DFFF] tabular-nums leading-none mt-1">{data.stock.length}</p>
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
                    <p className="text-lg font-extrabold text-[#16A34A] tabular-nums text-right">{formatARS(s.price)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* reseñas */}
        <section>
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-[18px]" aria-hidden><Star /></span>
              Reseñas
              <span className="homy-pill tabular-nums">{data.reviews.length}</span>
            </h2>
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
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  )
}
