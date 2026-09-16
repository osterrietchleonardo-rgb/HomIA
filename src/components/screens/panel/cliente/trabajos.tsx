'use client'
// Mis trabajos (cliente): publicaciones + presupuestos recibidos
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatusBadge, UrgencyBadge, UAvatar, UStars, EmptyState, Loading } from '@/components/app/ui-bits'
import { formatARS, formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { Plus } from 'lucide-react'

type Bid = {
  id: string; amount: number; timelineDays: number; message: string | null; status: string; createdAt: string
  professional: {
    id: string; displayName: string; avatarUrl: string | null; professions: string[]
    personType: string; companyName: string | null; rating: number; reviewsCount: number; worksCount: number; verified: boolean; subscription: string
  }
}
type Job = {
  id: string; title: string; description: string; status: string; urgency: string; categorySlug: string
  budgetMin: number | null; budgetMax: number | null; createdAt: string
  bids: Bid[]
}

export default function MyJobs() {
  const [jobs, setJobs] = useState<Job[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/jobs?mine=1')
      if (res.ok) setJobs((await res.json()).jobs || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

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
        toast.success('Presupuesto aceptado → proyecto creado')
        navigate(`/panel/cliente/proyectos/${data.project.id}`)
      } else {
        toast.success('Listo')
        load()
      }
    } finally { setBusy(false) }
  }

  async function closeJob(jobId: string, status: 'cerrado' | 'abierto') {
    const res = await fetch(`/api/jobs/${jobId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
    })
    if (res.ok) { toast.success(status === 'cerrado' ? 'Publicación cerrada' : 'Reabierta'); load() }
  }

  if (loading) return <Loading />

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Mis trabajos"
        subtitle="Publicaciones y presupuestos que te mandaron"
        right={
          <button onClick={() => navigate('/panel/cliente/publicar')} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white font-bold px-5 py-2.5 flex items-center gap-2 transition">
            <Plus className="size-4" /> Publicar
          </button>
        }
      />
      {jobs.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-6">
          <EmptyState icon="📢" title="Todavía no publicaste trabajos" hint="Publicá qué necesitás y empezá a recibir presupuestos."
            action={<button onClick={() => navigate('/panel/cliente/publicar')} className="rounded-xl bg-[#FF5A1F] text-white font-bold px-5 py-2.5">Publicar ahora</button>} />
        </div>
      ) : (
        <div className="space-y-4">
          {jobs.map((job) => (
            <div key={job.id} className="rounded-3xl bg-white border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-5 border-b border-slate-100">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <StatusBadge status={job.status} />
                      <UrgencyBadge urgency={job.urgency} />
                      <span className="text-xs font-semibold uppercase text-[#1D63B8]">{job.categorySlug}</span>
                    </div>
                    <h3 className="font-extrabold text-[#0A2540]">{job.title}</h3>
                    <p className="text-sm text-slate-500 mt-0.5">{formatDate(job.createdAt)}{job.budgetMin ? ` · presupuesto ${formatARS(job.budgetMin)}${job.budgetMax ? `–${formatARS(job.budgetMax)}` : ''}` : ''}</p>
                  </div>
                  {job.status === 'abierto' && job.bids.length > 0 && (
                    <button onClick={() => closeJob(job.id, 'cerrado')} className="text-xs font-bold text-slate-400 hover:text-red-500 transition">cerrar</button>
                  )}
                  {job.status === 'cerrado' && (
                    <button onClick={() => closeJob(job.id, 'abierto')} className="text-xs font-bold text-[#1D63B8] hover:underline">reabrir</button>
                  )}
                </div>
              </div>
              <div className="divide-y divide-slate-100">
                {job.bids.length === 0 ? (
                  <p className="p-4 text-sm text-slate-500">Esperando presupuestos de profesionales…</p>
                ) : (
                  job.bids.map((b) => (
                    <div key={b.id} className="p-4 flex flex-wrap items-start gap-3">
                      <UAvatar name={b.professional.displayName} url={b.professional.avatarUrl} size={44} />
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <button onClick={() => navigate(`/profesional/${b.professional.id}`)} className="font-bold text-[#0A2540] hover:text-[#1D63B8]">
                            {b.professional.companyName || b.professional.displayName} {b.professional.subscription === 'pro' && '⭐'}
                          </button>
                          {b.professional.verified && <span className="text-[#00C4FF] text-xs font-bold">✓</span>}
                        </div>
                        <div className="flex items-center gap-2">
                          <UStars rating={b.professional.rating} />
                          <span className="text-xs text-slate-500">{b.professional.rating > 0 ? `${b.professional.rating} (${b.professional.reviewsCount})` : 'Nuevo'} · {b.professional.worksCount} obras</span>
                        </div>
                        {b.message && <p className="text-sm text-slate-600 mt-2 bg-slate-50 rounded-xl p-2.5">{b.message}</p>}
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-lg font-extrabold text-[#FF5A1F]">{formatARS(b.amount)}</p>
                        <p className="text-xs text-slate-400 mb-2">en {b.timelineDays} días</p>
                        <StatusBadge status={b.status} />
                        {b.status === 'pendiente' && job.status === 'abierto' && (
                          <div className="flex gap-1.5 mt-2 justify-end">
                            <button disabled={busy} onClick={() => decide(b.id, 'rechazar')} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold text-slate-600 hover:border-red-400 hover:text-red-500 transition">Rechazar</button>
                            <button disabled={busy} onClick={() => decide(b.id, 'aceptar')} className="rounded-lg bg-[#16A34A] hover:bg-[#15803d] px-3 py-1.5 text-xs font-bold text-white transition">Aceptar</button>
                          </div>
                        )}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
