'use client'
// Notificaciones HomIA
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState } from '@/components/app/ui-bits'
import { timeAgo } from '@/lib/format'
import { Bell, ChevronLeft } from 'lucide-react'

type Notification = { id: string; type: string; title: string; body: string | null; link: string | null; read: boolean; createdAt: string }

export default function NotificationsScreen() {
  const { user, loading: sessionLoading } = useSession()
  const [items, setItems] = useState<Notification[]>([])
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/notifications')
      const data = await res.json()
      setItems(data.notifications || [])
      await fetch('/api/notifications', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ all: true }) })
    } finally { setLoading(false) }
  }

  useEffect(() => {
    if (!sessionLoading) {
      if (user) load()
      else setLoading(false)
    }
  }, [sessionLoading, user])

  if (!sessionLoading && !user) {
    return (
      <div className="min-h-screen bg-chalk flex items-center justify-center px-4">
        <div className="max-w-sm rounded-3xl bg-white border border-slate-200 shadow-xl p-8 text-center">
          <Bell className="size-10 text-[#1D63B8] mx-auto" />
          <h2 className="text-xl font-extrabold text-[#0A2540] mt-3">Ingresá para ver tus notificaciones</h2>
          <button onClick={() => navigate('/ingresar?volver=/notificaciones')} className="mt-5 w-full rounded-xl bg-[#FF5A1F] text-white font-bold py-3">
            Ingresar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-chalk">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={() => navigate('/')} className="text-sm text-slate-500 hover:text-[#1D63B8] flex items-center gap-1 mb-4">
          <ChevronLeft className="size-4" /> Inicio
        </button>
        <h1 className="text-2xl font-extrabold text-[#0A2540] mb-5">Notificaciones</h1>
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState icon="🔔" title="Todo tranquilo" hint="Acá te avisamos cuando recibas presupuestos, aprobaciones de materiales, facturas y más." />
        ) : (
          <div className="space-y-2">
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => { if (n.link?.startsWith('#')) { window.location.hash = n.link } else if (n.link) { navigate(n.link.replace(/^#/, '')) } }}
                className={`w-full text-left rounded-2xl border p-4 transition hover:shadow-md ${n.read ? 'bg-white border-slate-200' : 'bg-[#00C4FF]/5 border-[#00C4FF]/40'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-[#0A2540]">{n.title}</p>
                  <span className="text-xs text-slate-400 shrink-0">{timeAgo(n.createdAt)}</span>
                </div>
                {n.body && <p className="text-sm text-slate-500 mt-0.5">{n.body}</p>}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
