'use client'
// Perfil público de proveedor: catálogo/stock, reseñas, contacto gated
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState, UAvatar, UStars, StatusBadge } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { ChevronLeft, MapPin, Lock, Store, Search, Star } from 'lucide-react'

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
        <div className="relative max-w-4xl mx-auto pt-6 pb-12 px-4">
          <button onClick={() => navigate('/buscar?mode=profesional')} className="homy-focus text-slate-300 hover:text-white text-sm flex items-center gap-1.5 mb-4 transition-colors">
            <ChevronLeft className="size-4" /> Volver
          </button>
          <div className="flex flex-wrap items-start gap-4">
            <UAvatar name={p.businessName} url={p.avatarUrl} size={76} />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold text-white tracking-tight">{p.businessName}</h1>
              <p className="text-slate-300 text-sm mt-0.5 flex items-center gap-1">
                <MapPin aria-hidden className="size-3.5" /> {p.city || p.address || '—'}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <UStars rating={p.rating} />
                <span className="text-sm text-slate-300">{p.rating > 0 ? `${p.rating} · ${p.reviewsCount} reseñas` : 'Nuevo en HomIA'}</span>
              </div>
            </div>
            <div className="w-full sm:w-auto text-left sm:text-right mt-1 sm:mt-0">
              <p className="text-xs text-slate-300 uppercase font-semibold">Elementos publicados</p>
              <p className="text-3xl font-extrabold text-[#66DFFF] tabular-nums">{data.stock.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-8 pb-16 space-y-6">
        {p.description && (
          <div className="homy-glass rounded-3xl p-6">
            <p className="text-slate-600 leading-relaxed">{p.description}</p>
          </div>
        )}

        {/* stock — la sección completa vive en una tarjeta: puede flotar sobre el navy */}
        <div className="homy-glass rounded-3xl p-4 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-extrabold text-[#0A2540]">Catálogo con stock ({filtered.length})</h2>
            <div className="relative w-full sm:w-auto sm:max-w-64">
              <Search aria-hidden className="size-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar elemento…"
                className="homy-glass-input w-full rounded-full pl-9 pr-4 py-2 text-sm"
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {categories.map((c) => <span key={c} className="homy-pill capitalize">{c}</span>)}
          </div>
          {!user ? (
            <div className="rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-amber-50/40 to-transparent p-8 text-center">
              <span aria-hidden className="homy-icon-chip homy-chip-gold size-12 mx-auto">
                <Lock className="size-5" />
              </span>
              <p className="font-extrabold text-[#0A2540] mt-2">Registrate para ver precios y stock</p>
              <p className="text-sm text-slate-500 mt-1">Los precios son visibles para profesionales con cuenta (gratis, 1 minuto).</p>
              <button onClick={() => navigate('/registrarse?rol=profesional')} className="homy-btn-primary mt-4 px-6 py-3 text-sm">
                Crear cuenta gratis
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="homy-glass-soft rounded-2xl p-6 text-sm text-slate-500">Sin elementos que coincidan.</div>
          ) : (
            <div className="homy-glass-soft rounded-2xl divide-y divide-[#0A2540]/8 overflow-hidden">
              {filtered.map((s) => (
                <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 sm:gap-3 p-4 hover:bg-white/60 transition">
                  <div className="min-w-0 flex-1 basis-48">
                    <p className="font-bold text-[#0A2540] truncate">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.category}{s.brand ? ` · ${s.brand}` : ''} · stock: {s.quantity} {s.unit}</p>
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
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
