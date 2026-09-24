'use client'
// Atajo a las reseñas de un perfil: "★ 4,5 · 12 reseñas". Al tocarlo hace scroll
// suave hasta la sección de reseñas (por id) y le pasa el foco para que los
// lectores de pantalla y el teclado sigan desde ahí. Sin reseñas no es un link.
import { Star } from 'lucide-react'

/** 4.5 → "4,5" · 4 → "4" */
export function formatRating(r: number): string {
  return r.toLocaleString('es-AR', { maximumFractionDigits: 1 })
}

export function scrollToSection(id: string) {
  const el = document.getElementById(id)
  if (!el) return
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' })
  if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1')
  el.focus({ preventScroll: true })
}

export default function ReviewsShortcut({
  rating, count, targetId, dark = false, className = '',
}: { rating: number; count: number; targetId: string; dark?: boolean; className?: string }) {
  if (!count) {
    return (
      <span className={`inline-flex min-h-[44px] items-center gap-1.5 text-sm font-semibold ${dark ? 'text-slate-300' : 'text-slate-500'} ${className}`}>
        <Star className={`size-4 shrink-0 ${dark ? 'text-slate-400' : 'text-slate-300'}`} aria-hidden />
        Sin reseñas todavía
      </span>
    )
  }
  const label = `${count} reseña${count === 1 ? '' : 's'}`
  return (
    <button
      type="button"
      onClick={() => scrollToSection(targetId)}
      aria-label={`Ver las ${label} (promedio ${formatRating(rating)} de 5)`}
      className={`homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm font-bold transition hover:translate-y-[-1px] ${
        dark
          ? 'border border-white/15 bg-white/[0.08] text-white hover:bg-white/15'
          : 'homy-glass-soft text-[#0A2540] hover:bg-white/80'
      } ${className}`}
    >
      <Star className="size-4 shrink-0 fill-[#FFC700] text-[#FFC700]" aria-hidden />
      <span className="tabular-nums">{formatRating(rating)}</span>
      <span aria-hidden className={dark ? 'text-slate-300' : 'text-slate-400'}>·</span>
      <span className={`underline decoration-dotted underline-offset-4 ${dark ? 'text-slate-200' : 'text-[#1D63B8]'}`}>{label}</span>
    </button>
  )
}
