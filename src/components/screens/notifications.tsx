'use client'
// Notificaciones HomIA
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading } from '@/components/app/ui-bits'
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
          <h2 className="text-xl font-extrabold text-[#0A2540] mt-4 tracking-tight">Ingresá para ver tus notificaciones</h2>
          <p className="text-sm text-slate-500 mt-2">Presupuestos, aprobaciones de materiales, facturas y más.</p>
          <button onClick={() => navigate('/ingresar?volver=/notificaciones')} className="homy-btn-primary homy-focus mt-6 w-full py-3 min-h-[44px] text-sm">
            Ingresar
          </button>
        </div>
      </div>
    )
  }

  const unread = items.filter((n) => !n.read)
  const read = items.filter((n) => n.read)

  return (
    <div>
      <div className="max-w-2xl mx-auto">
        <div className="mb-4 -ml-2">
          <button onClick={() => navigate(`/panel/${user?.roles?.[0] || 'cliente'}`)} className="homy-focus inline-flex items-center gap-1.5 rounded-full min-h-[44px] px-3 text-sm font-semibold text-slate-500 hover:text-[#1D63B8] transition-colors">
            <ChevronLeft className="size-4" aria-hidden /> Volver al panel
          </button>
        </div>
        <div className="homy-page-head">
          <div className="min-w-0">
            <p className="homy-eyebrow">Centro de actividad</p>
            <h1 className="homy-page-title mt-1">Notificaciones</h1>
            <p className="homy-page-sub">Todo lo que pasa en tus trabajos y proyectos, avisado acá.</p>
          </div>
          {unread.length > 0 && (
            <span className="homy-pill homy-badge-pop shrink-0">
              <span className="homy-pill-dot bg-[#00C4FF]" aria-hidden />
              {unread.length} nueva{unread.length === 1 ? '' : 's'}
            </span>
          )}
        </div>
        {loading ? (
          <Loading />
        ) : items.length === 0 ? (
          <div className="homy-empty homy-glass-soft">
            <span className="homy-empty-icon homy-icon-chip homy-chip-blue" aria-hidden><BellRing className="size-6" /></span>
            <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">Todo tranquilo</h3>
            <p className="text-sm text-slate-500 mt-1.5 max-w-sm">Acá te avisamos cuando recibas presupuestos, aprobaciones de materiales, facturas y más.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {unread.length > 0 && (
              <section aria-label="Notificaciones no leídas">
                <div className="homy-section-head">
                  <h2 className="homy-section-title">
                    <span className="homy-icon-chip homy-chip-ai size-8 shrink-0 [&_svg]:size-4" aria-hidden><BellRing /></span>
                    No leídas
                    <span className="homy-pill tabular-nums">{unread.length}</span>
                  </h2>
                </div>
                <div className="homy-stagger space-y-2.5">
                  {unread.map((n) => <NotifRow key={n.id} n={n} unread />)}
                </div>
              </section>
            )}
            {read.length > 0 && (
              <section aria-label="Notificaciones leídas">
                <div className="homy-section-head">
                  <h2 className="homy-section-title">
                    <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><Bell /></span>
                    Leídas
                    <span className="homy-pill tabular-nums">{read.length}</span>
                  </h2>
                </div>
                <div className="space-y-2.5">
                  {read.map((n) => <NotifRow key={n.id} n={n} />)}
                </div>
              </section>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

/* Fila de notificación: no leída = vidrio pleno + barra y punto azul; leída = vidrio susurrado */
function NotifRow({ n, unread = false }: { n: Notification; unread?: boolean }) {
  const meta = NOTIF_ICON[n.type] || { icon: Bell, tone: 'homy-chip-blue' }
  const Icon = meta.icon
  return (
    <button
      onClick={() => { if (n.link?.startsWith('#')) { window.location.hash = n.link } else if (n.link) { navigate(n.link.replace(/^#/, '')) } }}
      className={
        unread
          ? 'relative overflow-hidden w-full text-left rounded-2xl homy-glass homy-lift homy-card-glow p-4 pl-5 flex items-start gap-3.5'
          : 'w-full text-left rounded-2xl homy-row p-4 flex items-start gap-3.5'
      }
    >
      {unread && <span aria-hidden className="absolute left-0 top-3 bottom-3 w-1 rounded-full bg-gradient-to-b from-[#00C4FF] to-[#1D63B8]" />}
      <span className={`homy-icon-chip size-10 shrink-0 [&_svg]:size-4 ${meta.tone}`} aria-hidden><Icon /></span>
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <p className={`min-w-0 flex items-center gap-2 ${unread ? 'font-extrabold text-[#0A2540]' : 'font-bold text-[#0A2540]/75'}`}>
            <span className="truncate">{n.title}</span>
            {unread && <span className="size-2 rounded-full bg-[#00C4FF] shrink-0 homy-badge-pop" aria-label="No leída" />}
          </p>
          <span className="text-xs text-slate-400 shrink-0">{timeAgo(n.createdAt)}</span>
        </div>
        {n.body && <p className={`text-sm mt-0.5 leading-relaxed ${unread ? 'text-slate-600' : 'text-slate-400'}`}>{n.body}</p>}
      </div>
    </button>
  )
}
