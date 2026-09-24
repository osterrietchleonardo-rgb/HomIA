'use client'
// Resumen de reputación del CLIENTE — para que profesionales y proveedores
// vean con quién van a trabajar: reseñas que recibió de otros pros, obras
// finalizadas, compras realizadas, antigüedad y verificación.
import { useEffect, useId, useState } from 'react'
import { Loading, UAvatar, UStars, VerifyBadge } from '@/components/app/ui-bits'
import { formatDate } from '@/lib/format'
import ReviewsShortcut from '@/components/app/reviews-shortcut'
import { ShieldCheck, FolderKanban, ShoppingBag, Star, X } from 'lucide-react'

type Summary = {
  client: {
    id: string; displayName: string; avatarUrl: string | null; city: string | null
    memberSince: string; verificationStatus: string; rating: number; reviewsCount: number
    esCliente: boolean
  }
  stats: { proyectosFinalizados: number; proyectosActivos: number; comprasRealizadas: number }
  reviews: {
    id: string; rating: number; comment: string; context: string; createdAt: string; photos?: string[]
    author: { id: string; displayName: string; avatarUrl: string | null }
  }[]
}

export function useClientSummary(userId: string | null | undefined) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    async function run() {
      if (!userId) {
        setSummary(null); setError(null)
        return
      }
      setLoading(true); setError(null)
      try {
        const r = await fetch(`/api/users/${userId}/client-summary`)
        const d = await r.json()
        if (!alive) return
        if (!r.ok) setError(d.error || 'No se pudo cargar la reputación')
        else setSummary(d)
      } catch {
        if (alive) setError('No se pudo cargar la reputación')
      } finally {
        if (alive) setLoading(false)
      }
    }
    void run()
    return () => { alive = false }
  }, [userId])
  return { summary, loading, error }
}

export function ClientSummaryBody({ userId }: { userId: string }) {
  const { summary, loading, error } = useClientSummary(userId)
  const reviewsId = `resenas-cliente-${useId().replace(/:/g, '')}`
  if (loading) return <Loading text="Cargando reputación…" />
  if (error) return <p className="px-1 py-6 text-center text-sm text-slate-500">{error}</p>
  if (!summary) return null
  const { client, stats, reviews } = summary

  return (
    <div className="space-y-4">
      {/* ficha */}
      <div className="flex items-start gap-3.5">
        <UAvatar name={client.displayName} url={client.avatarUrl} size={56} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[16px] font-extrabold text-[#0A2540] leading-snug break-words">
            {client.displayName}
            <VerifyBadge status={client.verificationStatus} />
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            {client.city || 'Argentina'} · en HomIA desde {formatDate(client.memberSince)}
          </p>
          {/* atajo a sus reseñas (scroll suave dentro del panel + foco) */}
          <div className="mt-1">
            <ReviewsShortcut rating={client.rating} count={client.reviewsCount} targetId={reviewsId} className="-ml-1" />
          </div>
        </div>
      </div>

      {/* cifras */}
      <div className="grid grid-cols-3 gap-2">
        <div className="homy-num-cell rounded-2xl bg-[#0A2540]/4 px-3 py-2.5 text-center">
          <FolderKanban className="mx-auto size-4 text-[#1D63B8]" aria-hidden />
          <p className="homy-num-adapt mt-1 text-lg font-extrabold text-[#0A2540] tabular-nums">{stats.proyectosFinalizados}</p>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">obras finalizadas</p>
        </div>
        <div className="homy-num-cell rounded-2xl bg-[#0A2540]/4 px-3 py-2.5 text-center">
          <ShoppingBag className="mx-auto size-4 text-[#FF5A1F]" aria-hidden />
          <p className="homy-num-adapt mt-1 text-lg font-extrabold text-[#0A2540] tabular-nums">{stats.comprasRealizadas}</p>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">compras a proveedores</p>
        </div>
        <div className="homy-num-cell rounded-2xl bg-[#0A2540]/4 px-3 py-2.5 text-center">
          <Star className="mx-auto size-4 text-[#B98A00]" aria-hidden />
          <p className="homy-num-adapt mt-1 text-lg font-extrabold text-[#0A2540] tabular-nums">{stats.proyectosActivos}</p>
          <p className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400">proyectos activos</p>
        </div>
      </div>

      {/* reseñas recibidas como cliente */}
      <div id={reviewsId} aria-labelledby={`${reviewsId}-titulo`} className="-mx-1.5 scroll-mt-4 rounded-2xl px-1.5 py-1 outline-none focus-visible:ring-2 focus-visible:ring-[#1D63B8]/40">
        <p id={`${reviewsId}-titulo`} className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">Lo que dicen los profesionales que trabajaron con él/ella</p>
        {reviews.length === 0 ? (
          <p className="mt-2 rounded-2xl bg-[#0A2540]/4 px-4 py-3 text-[13px] leading-relaxed text-slate-500">
            Todavía no recibió reseñas. Si es su primer trabajo, el historial se va a construir a medida que trabajen juntos.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {reviews.map((r) => (
              <li key={r.id} className="rounded-2xl bg-[#0A2540]/3 px-3.5 py-3 ring-1 ring-[#0A2540]/6">
                <div className="flex items-center gap-2">
                  <UStars rating={r.rating} size="text-xs" />
                  <span className="text-xs font-bold text-slate-600">{r.author.displayName}</span>
                  <span className="ml-auto text-[10px] font-bold uppercase tracking-wider text-slate-400">
                    {r.context === 'compra' ? 'compra' : 'obra'}
                  </span>
                </div>
                {r.comment && <p className="mt-1.5 text-[13px] leading-relaxed text-slate-600">{r.comment}</p>}
                {r.photos && r.photos.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {r.photos.slice(0, 4).map((ph, j) => (
                      <a key={j} href={ph} target="_blank" rel="noreferrer" className="homy-focus overflow-hidden rounded-lg ring-1 ring-[#0A2540]/8" aria-label={`Ver foto ${j + 1} de la reseña`}>
                        <img src={ph} alt={`Foto ${j + 1} de la reseña de ${r.author.displayName}`} className="size-14 object-cover" />
                      </a>
                    ))}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="flex items-start gap-2 rounded-2xl bg-[#1D63B8]/8 px-4 py-3 text-[12.5px] leading-relaxed text-slate-600">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-[#1D63B8]" aria-hidden />
        Usá esta reputación para decidir con quién trabajás: la verificación de identidad y las reseñas reales son de la comunidad HomIA.
      </p>
    </div>
  )
}

/** Botón + drawer para ver la reputación del cliente (chat, proyecto, CRM). */
export function ClientSummaryButton({ userId, label = 'Reputación del cliente' }: { userId: string; label?: string }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="homy-focus inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full homy-glass-soft px-3.5 py-2 text-xs font-bold text-[#1D63B8] hover:translate-y-[-1px] transition sm:px-4"
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden />
        <span className="hidden sm:inline">{label}</span>
        <span className="sm:hidden">Reputación</span>
      </button>
      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#0A2540]/45 backdrop-blur-sm sm:items-center sm:p-6" role="dialog" aria-modal="true" aria-label={label}>
          <div className="homy-glass-strong max-h-[86dvh] w-full max-w-md overflow-y-auto rounded-t-3xl p-5 sm:rounded-3xl sm:p-6">
            <div className="mb-4 flex items-center justify-between gap-3">
              <p className="homy-eyebrow">Con quién vas a trabajar</p>
              <button onClick={() => setOpen(false)} aria-label="Cerrar" className="homy-focus grid size-11 place-items-center rounded-full text-slate-400 hover:bg-white/70 hover:text-[#0A2540] transition">
                <X className="size-4" aria-hidden />
              </button>
            </div>
            <ClientSummaryBody userId={userId} />
          </div>
        </div>
      )}
    </>
  )
}
