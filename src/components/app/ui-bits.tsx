'use client'
// Componentes compartidos HomIA
import { Avatar as ShadAvatar } from '@/components/ui/avatar'
import { Badge } from '@/components/ui/badge'
import { initials, stars, URGENCY_COLOR, URGENCY_LABEL } from '@/lib/format'

export function UAvatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  return (
    <ShadAvatar className="border border-slate-200 shadow-sm" style={{ width: size, height: size }}>
      {url ? (
         
        <img src={url} alt={name} className="object-cover w-full h-full" />
      ) : (
        <span className="text-xs font-bold text-[#0A2540]">{initials(name)}</span>
      )}
    </ShadAvatar>
  )
}

export function UStars({ rating, size = 'text-sm' }: { rating: number; size?: string }) {
  return (
    <span className={`${size} tracking-wide`}>
      <span className="text-[#FFC700]">{stars(rating).split('').map((c, i) => (i < Math.round(rating) ? c : '☆')).join('')}</span>
    </span>
  )
}

export function UrgencyBadge({ urgency }: { urgency: string }) {
  return (
    <Badge className={`${URGENCY_COLOR[urgency] || URGENCY_COLOR.normal} border-0 font-semibold`} variant="outline">
      {URGENCY_LABEL[urgency] || urgency}
    </Badge>
  )
}

const STATUS_STYLES: Record<string, string> = {
  abierto: 'bg-emerald-100 text-emerald-700',
  en_proceso: 'bg-[#1D63B8]/10 text-[#1D63B8]',
  cerrado: 'bg-slate-100 text-slate-600',
  cancelado: 'bg-red-100 text-red-600',
  activo: 'bg-[#1D63B8]/10 text-[#1D63B8]',
  finalizado: 'bg-emerald-100 text-emerald-700',
  pendiente: 'bg-amber-100 text-amber-700',
  aceptado: 'bg-emerald-100 text-emerald-700',
  rechazado: 'bg-red-100 text-red-600',
  pagada: 'bg-emerald-100 text-emerald-700',
  disponible: 'bg-emerald-100 text-emerald-700',
  por_agotar: 'bg-amber-100 text-amber-700',
  agotado: 'bg-red-100 text-red-600',
  propuesto: 'bg-amber-100 text-amber-700',
  aprobado: 'bg-emerald-100 text-emerald-700',
  reemplazado: 'bg-slate-100 text-slate-500',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <Badge variant="outline" className={`border-0 font-semibold ${STATUS_STYLES[status] || 'bg-slate-100 text-slate-600'}`}>
      {(label || status).replace(/_/g, ' ')}
    </Badge>
  )
}

export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-500">
      <div className="w-8 h-8 rounded-full border-[3px] border-[#00C4FF]/25 border-t-[#00C4FF] animate-spin" />
      <p className="text-sm">{text}</p>
    </div>
  )
}

export function EmptyState({
  icon = '🔍',
  title,
  hint,
  action,
}: {
  icon?: string
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      <div className="text-4xl mb-3">{icon}</div>
      <h3 className="font-bold text-[#0A2540] text-lg">{title}</h3>
      {hint && <p className="text-sm text-slate-500 mt-1 max-w-md">{hint}</p>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-5">
      <div>
        <h1 className="text-2xl font-extrabold text-[#0A2540] tracking-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

export function StatCard({ label, value, hint, accent = '#1D63B8' }: { label: string; value: string | number; hint?: string; accent?: string }) {
  return (
    <div className="rounded-2xl bg-white border border-slate-200/80 p-4 shadow-sm">
      <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-extrabold mt-1" style={{ color: accent }}>{value}</p>
      {hint && <p className="text-xs text-slate-400 mt-1">{hint}</p>}
    </div>
  )
}
