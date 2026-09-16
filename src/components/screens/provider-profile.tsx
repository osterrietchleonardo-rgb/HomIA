'use client'
// Perfil público de proveedor: catálogo/stock, reseñas, contacto gated
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState, UAvatar, UStars, StatusBadge } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { ChevronLeft, MapPin, Lock } from 'lucide-react'

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

  if (loading) return <div className="min-h-screen bg-chalk"><Loading /></div>
  if (!data) return <div className="min-h-screen bg-chalk pt-20"><EmptyState icon="🏪" title="Proveedor no encontrado" /></div>

  const p = data.profile
  const filtered = data.stock.filter((s) => !q || s.name.toLowerCase().includes(q.toLowerCase()))
  const categories = [...new Set(data.stock.map((s) => s.categorySlug))]

  return (
    <div className="min-h-screen bg-chalk">
      <div className="bg-[#0A2540] pt-6 pb-12 px-4">
        <div className="max-w-4xl mx-auto">
          <button onClick={() => navigate('/buscar?mode=profesional')} className="text-slate-300 hover:text-white text-sm flex items-center gap-1 mb-4">
            <ChevronLeft className="size-4" /> Volver
          </button>
          <div className="flex flex-wrap items-start gap-4">
            <UAvatar name={p.businessName} url={p.avatarUrl} size={76} />
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-extrabold text-white">{p.businessName}</h1>
              <p className="text-slate-300 text-sm mt-0.5 flex items-center gap-1">
                <MapPin className="size-3.5" /> {p.city || p.address || '—'}
              </p>
              <div className="flex items-center gap-2 mt-2">
                <UStars rating={p.rating} />
                <span className="text-sm text-slate-300">{p.rating > 0 ? `${p.rating} · ${p.reviewsCount} reseñas` : 'Nuevo en HomIA'}</span>
              </div>
            </div>
            <div className="text-right">
              <p className="text-xs text-slate-400 uppercase font-semibold">Elementos publicados</p>
              <p className="text-3xl font-extrabold text-[#00C4FF]">{data.stock.length}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 -mt-6 pb-16 space-y-6">
        {p.description && (
          <div className="rounded-3xl bg-white border border-slate-200 shadow-lg p-6">
            <p className="text-slate-600 leading-relaxed">{p.description}</p>
          </div>
        )}

        {/* stock */}
        <div>
          <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
            <h2 className="text-lg font-extrabold text-[#0A2540]">Catálogo con stock ({filtered.length})</h2>
            <input
              value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar elemento…"
              className="rounded-full border border-slate-300 px-4 py-2 text-sm outline-none focus:border-[#1D63B8]"
            />
          </div>
          <div className="flex flex-wrap gap-2 mb-3">
            {categories.map((c) => <span key={c} className="rounded-full bg-slate-100 text-slate-600 text-xs font-semibold px-3 py-1 capitalize">{c}</span>)}
          </div>
          {!user ? (
            <div className="rounded-3xl bg-gradient-to-br from-amber-50 to-white border border-amber-200 p-8 text-center">
              <Lock className="size-8 text-amber-500 mx-auto" />
              <p className="font-extrabold text-[#0A2540] mt-2">Registrate para ver precios y stock</p>
              <p className="text-sm text-slate-500 mt-1">Los precios son visibles para profesionales con cuenta (gratis, 1 minuto).</p>
              <button onClick={() => navigate('/registrarse?rol=profesional')} className="mt-4 rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] px-6 py-3 font-bold text-white transition">
                Crear cuenta gratis
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl bg-white border border-slate-200 p-6 text-sm text-slate-500">Sin elementos que coincidan.</div>
          ) : (
            <div className="rounded-3xl bg-white border border-slate-200 shadow-sm divide-y divide-slate-100 overflow-hidden">
              {filtered.map((s) => (
                <div key={s.id} className="flex items-center justify-between gap-3 p-4 hover:bg-slate-50 transition">
                  <div className="min-w-0">
                    <p className="font-bold text-[#0A2540] truncate">{s.name}</p>
                    <p className="text-xs text-slate-400">{s.category}{s.brand ? ` · ${s.brand}` : ''} · stock: {s.quantity} {s.unit}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <StatusBadge status={s.status} />
                    <p className="text-lg font-extrabold text-[#16A34A]">{formatARS(s.price)}</p>
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
            <div className="rounded-2xl bg-white border border-slate-200 p-6 text-sm text-slate-500">Sin reseñas todavía.</div>
          ) : (
            <div className="space-y-3">
              {data.reviews.map((r) => (
                <div key={r.id} className="rounded-2xl bg-white border border-slate-200 p-4">
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
