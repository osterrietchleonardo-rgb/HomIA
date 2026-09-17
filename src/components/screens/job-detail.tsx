'use client'
// Detalle de trabajo publicado — profesional ve detalles y deja presupuesto; cliente ve sus presupuestos
import { useEffect, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState, UrgencyBadge, StatusBadge, UAvatar, UStars } from '@/components/app/ui-bits'
import { formatARS, formatDate, URGENCY_LABEL } from '@/lib/format'
import { toast } from 'sonner'
import { ChevronLeft, Send, Star, BadgeCheck, Search } from 'lucide-react'

type Job = {
  id: string; title: string; description: string; categorySlug: string; urgency: string
  budgetMin: number | null; budgetMax: number | null; address: string | null; city: string | null
  lat: number | null; lng: number | null; photos: string[]; status: string; createdAt: string
  client: { id: string; displayName: string; avatarUrl: string | null; city: string | null; memberSince: string }
  bidsCount: number; minBid: number | null; maxBid: number | null
}

type Bid = {
  id: string; amount: number; timelineDays: number; message: string | null; status: string; createdAt: string
  professional: {
    id: string; userId: string; displayName: string; avatarUrl: string | null
    professions: string[]; personType: string; companyName: string | null
    rating: number; reviewsCount: number; worksCount: number; verified: boolean; subscription: string
  }
}

export default function JobDetailScreen({ id }: { id: string }) {
  const route = useRoute()
  const { user, refresh } = useSession()
  const [job, setJob] = useState<Job | null>(null)
  const [bids, setBids] = useState<Bid[]>([])
  const [isOwner, setIsOwner] = useState(false)
  const [myBid, setMyBid] = useState<Bid | null>(null)
  const [loading, setLoading] = useState(true)
  const [bidAmount, setBidAmount] = useState('')
  const [bidDays, setBidDays] = useState('7')
  const [bidMessage, setBidMessage] = useState('')
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch(`/api/jobs/${id}`)
      if (res.ok) {
        const data = await res.json()
        setJob(data.job)
      }
      if (user) {
        const resBids = await fetch(`/api/jobs/${id}/bids`)
        if (resBids.ok) {
          const data = await resBids.json()
          setBids(data.bids || [])
          setIsOwner(data.isOwner)
          const mine = (data.bids as Bid[]).find((b) => user.hasProfessional && b)
          if (mine && !data.isOwner) setMyBid(mine)
        }
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load()   }, [id, user?.id])

  async function sendBid() {
    if (!user) { navigate(`/ingresar?volver=/trabajo/${id}`); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/jobs/${id}/bids`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount: parseFloat(bidAmount), timelineDays: parseInt(bidDays), message: bidMessage }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error || 'No se pudo enviar'); return }
      toast.success('¡Presupuesto enviado! El cliente lo va a revisar.')
      await refresh()
      load()
    } finally { setBusy(false) }
  }

  async function decide(bidId: string, action: 'aceptar' | 'rechazar') {
    setBusy(true)
    try {
      const res = await fetch(`/api/bids/${bidId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      if (action === 'aceptar' && data.project) {
        toast.success('Presupuesto aceptado. Proyecto creado.')
        navigate(`/panel/cliente/proyectos/${data.project.id}`)
      } else {
        toast.success(action === 'rechazar' ? 'Presupuesto rechazado' : 'Listo')
        load()
      }
    } finally { setBusy(false) }
  }

  if (loading) return <div className="min-h-screen"><Loading /></div>
  if (!job) {
    return (
      <div className="min-h-screen pt-20 px-4">
        <EmptyState icon={<Search />} title="Trabajo no encontrado" action={<BackHome />} />
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      {/* banda navy con profundidad */}
      <div className="relative overflow-hidden bg-gradient-to-br from-[#0A2540] via-[#0D3050] to-[#14406B]">
        <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(58% 90% at 88% -10%, rgba(0,196,255,0.18) 0%, transparent 62%), radial-gradient(45% 70% at -5% 110%, rgba(255,90,31,0.14) 0%, transparent 55%)' }} />
        <div className="relative max-w-3xl mx-auto pt-6 pb-12 sm:pb-16 px-4">
          <button onClick={() => navigate('/buscar?mode=profesional')} className="homy-focus text-slate-300 hover:text-white text-sm flex items-center gap-1.5 mb-3 transition-colors">
            <ChevronLeft className="size-4" /> Volver a resultados
          </button>
          <div className="flex flex-wrap items-center gap-2 mb-2.5">
            <StatusBadge status={job.status} />
            <UrgencyBadge urgency={job.urgency} />
            <span className="text-xs font-semibold uppercase tracking-wide text-[#66DFFF]">{job.categorySlug}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">{job.title}</h1>
          <p className="text-sm text-slate-300 mt-2">{job.city || 'Sin ubicación'} · publicado {formatDate(job.createdAt)}</p>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 -mt-8 pb-16">
        {/* descripción */}
        <div className="homy-glass homy-lift rounded-3xl p-5 sm:p-6">
          <div className="flex flex-col sm:flex-row sm:items-start gap-3 sm:gap-4">
            <UAvatar name={job.client.displayName} url={job.client.avatarUrl} size={52} />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-[#0A2540]">{job.client.displayName}</p>
              <p className="text-xs text-slate-400">Cliente desde {formatDate(job.client.memberSince)}</p>
            </div>
            <div className="sm:ml-auto sm:text-right shrink-0 sm:pl-4 sm:border-l border-[#0A2540]/8">
              <p className="text-xs text-slate-400 uppercase font-semibold">Presupuesto del cliente</p>
              <p className="font-extrabold text-[#0A2540] tabular-nums">
                {job.budgetMin ? `${formatARS(job.budgetMin)}${job.budgetMax ? ` – ${formatARS(job.budgetMax)}` : ''}` : 'A convenir'}
              </p>
            </div>
          </div>
          <p className="mt-4 text-slate-600 leading-relaxed whitespace-pre-wrap">{job.description}</p>
          {job.photos && job.photos.length > 0 && (
            <div className="grid grid-cols-3 gap-2 mt-4">
              {job.photos.map((p) => (
                <img key={p} src={p} alt="Foto del trabajo" className="rounded-xl object-cover h-28 w-full border border-[#0A2540]/8" />
              ))}
            </div>
          )}
        </div>

        {/* cliente: lista de presupuestos */}
        {user && isOwner && (
          <div className="mt-6">
            <h2 className="font-extrabold text-[#0A2540] text-lg mb-3">Presupuestos recibidos ({bids.length})</h2>
            {bids.length === 0 ? (
              <div className="homy-glass-soft rounded-2xl p-6 text-sm text-slate-500">
                Todavía no hay presupuestos. Te avisamos cuando un profesional oferte.
              </div>
            ) : (
              <div className="space-y-3">
                {bids.map((b) => (
                  <div key={b.id} className="homy-glass homy-lift rounded-2xl p-5">
                    <div className="flex items-start gap-3">
                      <UAvatar name={b.professional.displayName} url={b.professional.avatarUrl} size={46} />
                      <div className="flex-1 min-w-0">
                        <span className="flex items-center gap-1.5 min-w-0">
                          <button onClick={() => navigate(`/profesional/${b.professional.id}`)} className="font-bold text-[#0A2540] hover:text-[#1D63B8] truncate">
                            {b.professional.companyName || b.professional.displayName}
                          </button>
                          {b.professional.subscription === 'pro' && (
                            <Star aria-label="Suscripción Pro" className="size-3.5 shrink-0 text-[#FFC700] fill-[#FFC700]" />
                          )}
                        </span>
                        <div className="flex items-center gap-2 flex-wrap">
                          <UStars rating={b.professional.rating} />
                          <span className="text-xs text-slate-500">{b.professional.rating > 0 ? `${b.professional.rating} (${b.professional.reviewsCount})` : 'Nuevo'}</span>
                          {b.professional.verified && (
                            <span className="text-[#1D63B8] text-xs font-bold inline-flex items-center gap-1">
                              <BadgeCheck className="size-3.5" /> verificado
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-xl font-extrabold text-[#FF5A1F] tabular-nums">{formatARS(b.amount)}</p>
                        <p className="text-xs text-slate-400">en {b.timelineDays} días</p>
                      </div>
                    </div>
                    {b.message && <p className="text-sm text-slate-600 mt-3 homy-glass-soft rounded-xl p-3">{b.message}</p>}
                    <div className="flex flex-wrap items-center justify-between gap-2 mt-4">
                      <StatusBadge status={b.status} />
                      {b.status === 'pendiente' && job.status === 'abierto' && (
                        <div className="flex gap-2">
                          <button disabled={busy} onClick={() => decide(b.id, 'rechazar')} className="rounded-xl border border-[#0A2540]/15 px-4 py-2 text-sm font-bold text-slate-600 hover:border-red-400 hover:text-red-500 transition">
                            Rechazar
                          </button>
                          <button disabled={busy} onClick={() => decide(b.id, 'aceptar')} className="rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white px-5 py-2 text-sm font-bold transition shadow-lg shadow-emerald-600/25">
                            Aceptar y crear proyecto
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* profesional: formulario de presupuesto */}
        {user && user.hasProfessional && !isOwner && (
          <div className="mt-6 homy-glass rounded-3xl p-6">
            <h2 className="font-extrabold text-[#0A2540] text-lg">{myBid ? 'Tu presupuesto' : 'Dejar presupuesto'}</h2>
            {myBid && <p className="text-xs text-slate-400 mb-2 tabular-nums">Ya ofertaste: {formatARS(myBid.amount)} — podés editarlo.</p>}
            <div className="grid sm:grid-cols-3 gap-3 mt-3">
              <div>
                <label className="text-sm font-semibold text-[#0A2540]">Monto (ARS) *</label>
                <input type="number" value={bidAmount} onChange={(e) => setBidAmount(e.target.value)} placeholder="85000" min="1"
                  className="homy-glass-input mt-1 w-full rounded-xl px-4 py-3 text-right tabular-nums" />
              </div>
              <div>
                <label className="text-sm font-semibold text-[#0A2540]">Plazo (días)</label>
                <input type="number" value={bidDays} onChange={(e) => setBidDays(e.target.value)} min="1"
                  className="homy-glass-input mt-1 w-full rounded-xl px-4 py-3 tabular-nums" />
              </div>
              <div className="sm:col-span-1">
                <label className="text-sm font-semibold text-[#0A2540]">Mensaje</label>
                <input value={bidMessage} onChange={(e) => setBidMessage(e.target.value)} placeholder="Cómo lo vas a hacer…"
                  className="homy-glass-input mt-1 w-full rounded-xl px-4 py-3" />
              </div>
            </div>
            <button
              onClick={sendBid} disabled={busy || !bidAmount}
              className="homy-btn-primary mt-4 w-full py-3.5 disabled:opacity-50"
            >
              <Send className="size-4" /> {myBid ? 'Actualizar presupuesto' : 'Enviar presupuesto'}
            </button>
          </div>
        )}

        {/* sin sesión: gate */}
        {!user && (
          <div className="mt-6 homy-glass-dark rounded-3xl relative overflow-hidden p-6 sm:p-8 text-center">
            <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 100% at 50% 0%, rgba(0,196,255,0.16) 0%, transparent 60%)' }} />
            <div className="relative">
              <p className="text-white font-extrabold text-lg">¿Sos profesional? Dejá tu presupuesto</p>
              <p className="text-slate-300 text-sm mt-1">Creá tu cuenta gratis y ofertá este y todos los trabajos de tu rubro.</p>
              <button onClick={() => navigate(`/registrarse?rol=profesional&volver=/trabajo/${id}`)} className="homy-btn-primary mt-4 px-6 py-3 text-sm">
                Registrarme como profesional
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

function BackHome() {
  return (
    <button onClick={() => navigate('/')} className="homy-btn-dark homy-focus px-6 py-3 text-sm">
      Volver al inicio
    </button>
  )
}
