'use client'
// Notificaciones HomIA
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState } from '@/components/app/ui-bits'
import { timeAgo } from '@/lib/format'
import { Bell, BellRing, ChevronLeft, FileText, Package, PackageCheck, PackageX, ArrowLeftRight, ReceiptText, CircleCheck, Milestone, Trophy, type LucideIcon } from 'lucide-react'

type Notification = { id: string; type: string; title: string; body: string | null; link: string | null; read: boolean; createdAt: string }

/* Iconografía decorativa por tipo de notificación (fallback: campana) */
const NOTIF_ICON: Record<string, { icon: LucideIcon; tone: string }> = {
  nuevo_presupuesto: { icon: FileText, tone: 'homy-chip-blue' },
  material_propuesto: { icon: Package, tone: 'homy-chip-gold' },
  material_alternativa: { icon: ArrowLeftRight, tone: 'homy-chip-ai' },
  material_aprobar: { icon: PackageCheck, tone: 'homy-chip-mint' },
  material_aprobado: { icon: PackageCheck, tone: 'homy-chip-mint' },
  material_rechazar: { icon: PackageX, tone: 'homy-chip-navy' },
  material_rechazado: { icon: PackageX, tone: 'homy-chip-navy' },
  factura_emitida: { icon: ReceiptText, tone: 'homy-chip-gold' },
  factura_pagada: { icon: CircleCheck, tone: 'homy-chip-mint' },
  proyecto_etapa: { icon: Milestone, tone: 'homy-chip-blue' },
  proyecto_finalizado: { icon: Trophy, tone: 'homy-chip-mint' },
}

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
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-sm rounded-3xl homy-glass-strong shadow-xl p-8 text-center">
          <span className="homy-icon-chip homy-chip-blue size-14 mx-auto [&_svg]:size-6" aria-hidden><Bell /></span>
          <h2 className="text-xl font-extrabold text-[#0A2540] mt-4">Ingresá para ver tus notificaciones</h2>
          <button onClick={() => navigate('/ingresar?volver=/notificaciones')} className="homy-btn-primary mt-5 w-full py-3 text-sm">
            Ingresar
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen">
      <div className="max-w-2xl mx-auto px-4 py-8">
        <button onClick={() => navigate('/')} className="text-sm text-slate-500 hover:text-[#1D63B8] transition-colors flex items-center gap-1 mb-4">
          <ChevronLeft className="size-4" aria-hidden /> Inicio
        </button>
        <h1 className="text-2xl font-extrabold text-[#0A2540] tracking-tight mb-5">Notificaciones</h1>
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <EmptyState icon={<BellRing />} title="Todo tranquilo" hint="Acá te avisamos cuando recibas presupuestos, aprobaciones de materiales, facturas y más." />
        ) : (
          <div className="space-y-2.5">
            {items.map((n) => {
              const meta = NOTIF_ICON[n.type] || { icon: Bell, tone: 'homy-chip-blue' }
              const Icon = meta.icon
              return (
                <button
                  key={n.id}
                  onClick={() => { if (n.link?.startsWith('#')) { window.location.hash = n.link } else if (n.link) { navigate(n.link.replace(/^#/, '')) } }}
                  className="relative overflow-hidden w-full text-left rounded-2xl homy-glass homy-lift homy-card-glow p-4 pl-5 flex items-start gap-3.5"
                >
                  {!n.read && <span aria-hidden className="absolute left-0 top-3 bottom-3 w-1 rounded-full bg-gradient-to-b from-[#00C4FF] to-[#1D63B8]" />}
                  <span className={`homy-icon-chip size-10 shrink-0 [&_svg]:size-4 ${meta.tone}`} aria-hidden><Icon /></span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-[#0A2540]">{n.title}</p>
                      <span className="text-xs text-slate-400 shrink-0">{timeAgo(n.createdAt)}</span>
                    </div>
                    {n.body && <p className="text-sm text-slate-500 mt-0.5 leading-relaxed">{n.body}</p>}
                  </div>
                </button>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
