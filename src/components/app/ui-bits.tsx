'use client'
// Componentes compartidos HomIA — nivel Signature
// (usados por los 3 paneles: al elevar acá, se eleva todo el sistema)
import { Avatar as ShadAvatar } from '@/components/ui/avatar'
import { Loader2, BadgeCheck, ShieldAlert, ShieldQuestion, ShieldX } from 'lucide-react'
import { initials, stars, URGENCY_COLOR, URGENCY_LABEL } from '@/lib/format'
import { cn } from '@/lib/utils'

/* Avatar con anillo de gradiente sutil */
export function UAvatar({ name, url, size = 40 }: { name: string; url?: string | null; size?: number }) {
  return (
    <span
      className="relative inline-grid shrink-0 place-items-center rounded-full"
      style={{ width: size + 4, height: size + 4, background: 'linear-gradient(135deg, #1d63b8 0%, #00c4ff 100%)', padding: 2 }}
      aria-hidden
    >
      <ShadAvatar className="border-0 bg-white" style={{ width: size, height: size }}>
        {url ? (
          <img src={url} alt={name} className="object-cover w-full h-full" />
        ) : (
          <span className="text-xs font-bold text-[#0A2540]">{initials(name)}</span>
        )}
      </ShadAvatar>
    </span>
  )
}

/* Insignia de verificación de identidad (DNI + IA) — la ve TODO el mundo
   junto al nombre. status: none (no subió DNI) | en_revision | verificado | rechazado */
export function VerifyBadge({
  status,
  dark = false,
  compact = true,
}: {
  status?: string | null
  dark?: boolean // sobre fondo navy (perfiles, topbar)
  compact?: boolean // true: solo ícono si verificado + pill corta si no
}) {
  const s = status || 'none'
  if (s === 'verificado') {
    return <BadgeCheck aria-label="Identidad verificada con DNI por IA" className={cn('shrink-0', compact ? 'size-4.5' : 'size-5', dark ? 'text-[#66DFFF]' : 'text-[#0e9f6e]')} />
  }
  if (s === 'en_revision') {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider ring-1', dark ? 'bg-[#FFC700]/15 text-[#FFC700] ring-[#FFC700]/40' : 'bg-[#FFC700]/12 text-[#8a6d00] ring-[#FFC700]/40')}
        title="Subió su DNI y el análisis de IA está en curso o en revisión"
      >
        <ShieldQuestion className="size-3" aria-hidden /> En revisión
      </span>
    )
  }
  if (s === 'rechazado') {
    return (
      <span
        className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider ring-1', dark ? 'bg-red-400/15 text-red-300 ring-red-400/40' : 'bg-red-500/10 text-red-600 ring-red-400/40')}
        title="El análisis de IA no pudo validar su documento"
      >
        <ShieldX className="size-3" aria-hidden /> No verificado
      </span>
    )
  }
  // none — no subió DNI: todos lo ven como “no verificado”
  return (
    <span
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider ring-1', dark ? 'bg-white/8 text-slate-300 ring-white/20' : 'bg-slate-500/8 text-slate-500 ring-slate-400/30')}
      title="Todavía no verificó su identidad con DNI + IA"
    >
      <ShieldAlert className="size-3" aria-hidden /> No verificado
    </span>
  )
}

export function UStars({ rating, size = 'text-sm' }: { rating: number; size?: string }) {
  return (
    <span className={`${size} tracking-wide`}>
      <span className="text-[#FFC700]">{stars(rating).split('').map((c, i) => (i < Math.round(rating) ? c : '☆')).join('')}</span>
    </span>
  )
}

/* Urgencia: pill de vidrio con punto de color */
export function UrgencyBadge({ urgency }: { urgency: string }) {
  const color = URGENCY_COLOR[urgency] || URGENCY_COLOR.normal
  const dot = /emerald|green/i.test(color)
    ? 'bg-emerald-500'
    : /red|rose/i.test(color)
      ? 'bg-red-500'
      : /amber|orange/i.test(color)
        ? 'bg-amber-500'
        : 'bg-[#1D63B8]'
  return (
    <span className="homy-pill">
      <span className={cn('homy-pill-dot', dot)} aria-hidden />
      {URGENCY_LABEL[urgency] || urgency}
    </span>
  )
}

const STATUS_STYLES: Record<string, string> = {
  abierto: 'bg-emerald-500',
  en_proceso: 'bg-[#1D63B8]',
  cerrado: 'bg-slate-400',
  cancelado: 'bg-red-500',
  activo: 'bg-[#1D63B8]',
  finalizado: 'bg-emerald-500',
  pendiente: 'bg-amber-500',
  aceptado: 'bg-emerald-500',
  rechazado: 'bg-red-500',
  pagada: 'bg-emerald-500',
  disponible: 'bg-emerald-500',
  por_agotar: 'bg-amber-500',
  agotado: 'bg-red-500',
  propuesto: 'bg-amber-500',
  aprobado: 'bg-emerald-500',
  reemplazado: 'bg-slate-400',
}

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  return (
    <span className="homy-pill">
      <span className={cn('homy-pill-dot', STATUS_STYLES[status] || 'bg-slate-400')} aria-hidden />
      {(label || status).replace(/_/g, ' ')}
    </span>
  )
}

/* Carga: núcleo IA dual */
export function Loading({ text = 'Cargando…' }: { text?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-14 gap-3 text-slate-500">
      <span className="relative grid place-items-center">
        <span className="absolute size-10 rounded-full border-2 border-[#00C4FF]/15" aria-hidden />
        <Loader2 className="size-7 animate-spin text-[#00C4FF]" aria-hidden />
      </span>
      <p className="text-sm font-medium">{text}</p>
    </div>
  )
}

/* Estado vacío diseñado: icono en anillo de gradiente + jerarquía clara.
   Acepta ReactNode (lucide) o string (compat con emojis heredados — en migración). */
export function EmptyState({
  icon = '🔍',
  title,
  hint,
  action,
}: {
  icon?: React.ReactNode
  title: string
  hint?: string
  action?: React.ReactNode
}) {
  const isNode = typeof icon !== 'string'
  return (
    <div className="homy-glass-soft flex flex-col items-center justify-center py-12 px-6 text-center rounded-3xl border border-dashed border-[#0A2540]/12">
      <span
        className="mb-4 grid size-16 place-items-center rounded-2xl"
        style={{
          background: 'linear-gradient(140deg, #e8f2fd 0%, #d4e7fa 100%)',
          boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.6), 0 10px 22px -12px rgba(29,99,184,0.4)',
        }}
        aria-hidden
      >
        {isNode ? (
          <span className="text-[#1D63B8] [&_svg]:size-7">{icon}</span>
        ) : (
          <span className="text-2xl">{icon}</span>
        )}
      </span>
      <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">{title}</h3>
      {hint && <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{hint}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* Encabezado de página con jerarquía editorial */
export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
      <div className="min-w-0">
        <h1 className="text-[1.55rem] sm:text-[1.7rem] font-extrabold text-[#0A2540] tracking-tight leading-tight">{title}</h1>
        {subtitle && <p className="text-sm text-slate-500 mt-1">{subtitle}</p>}
      </div>
      {right}
    </div>
  )
}

/* Stat card Signature: chip de icono + número protagonista + hint */
export function StatCard({
  label,
  value,
  hint,
  accent = '#1D63B8',
  icon,
  tone = 'blue',
}: {
  label: string
  value: string | number
  hint?: string
  accent?: string
  icon?: React.ReactNode
  tone?: 'blue' | 'orange' | 'ai' | 'gold' | 'mint'
}) {
  const chipTone: Record<string, string> = {
    blue: 'homy-chip-blue',
    orange: 'homy-chip-orange',
    ai: 'homy-chip-ai',
    gold: 'homy-chip-gold',
    mint: 'homy-chip-mint',
  }
  return (
    <div className="homy-glass homy-lift homy-card-glow relative overflow-hidden rounded-2xl p-4 sm:p-5">
      {/* brillo de esquina decorativo */}
      <span
        aria-hidden
        className="pointer-events-none absolute -top-10 -right-10 size-28 rounded-full opacity-60"
        style={{ background: `radial-gradient(circle, ${accent}14 0%, transparent 70%)` }}
      />
      <div className="flex items-start justify-between gap-2">
        <p className="text-[0.68rem] font-bold text-slate-500 uppercase tracking-[0.09em] leading-snug">{label}</p>
        {icon && (
          <span className={cn('homy-icon-chip size-8 shrink-0', chipTone[tone])} aria-hidden>
            <span className="[&_svg]:size-4">{icon}</span>
          </span>
        )}
      </div>
      <p className="homy-num-adapt text-[1.65rem] font-extrabold mt-1.5 tracking-tight leading-none" style={{ color: accent }}>
        {value}
      </p>
      {hint && <p className="text-xs text-slate-400 mt-1.5 leading-snug">{hint}</p>}
    </div>
  )
}
