'use client'
// Checklist de primeros pasos por rol — glass claro con progreso real.
// Cada tarea se verifica con datos del sistema (no es decorativa) y lleva
// directo a donde se hace. Descartable; el descarte persiste por usuario+rol.
import { useState } from 'react'
import { navigate } from '@/lib/router'
import { startTour } from '@/components/help/tour-overlay'
import { type TourRole } from '@/lib/tour-content'
import { CircleCheck, Circle, ChevronDown, ChevronUp, X, Compass, LifeBuoy, Play } from 'lucide-react'

export type OnboardingTask = {
  id: string
  label: string
  desc: string
  done: boolean
  /** a dónde navegar para hacerla */
  href?: string
  cta: string
  /** si aún no se puede hacer (ej: reseñar sin obra finalizada) se muestra como hint */
  blocked?: boolean
}

export default function OnboardingCard({ role, tasks }: { role: string; tasks: OnboardingTask[] }) {
  const storageKey = `homy_onboarding_done_${role}`
  const [dismissed, setDismissed] = useState(() => {
    if (typeof window === 'undefined') return false
    return localStorage.getItem(storageKey) === '1'
  })
  const [expanded, setExpanded] = useState(true)

  if (dismissed) return null
  const doneCount = tasks.filter((t) => t.done).length
  const pct = tasks.length ? Math.round((doneCount / tasks.length) * 100) : 0
  const allDone = doneCount === tasks.length

  function dismiss() {
    localStorage.setItem(storageKey, '1')
    setDismissed(true)
  }

  return (
    <section className="homy-glass relative overflow-hidden rounded-3xl p-5 sm:p-6" aria-label="Primeros pasos en HomIA">
      <span aria-hidden className="pointer-events-none absolute -right-14 -top-16 size-48 rounded-full bg-[#00C4FF]/14 blur-3xl" />
      <div className="relative flex items-center gap-3">
        <span className="homy-icon-chip homy-chip-blue size-10 shrink-0 [&_svg]:size-5" aria-hidden><Compass /></span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-extrabold tracking-tight text-[#0A2540] sm:text-lg">
            {allDone ? '¡Todo listo, tu cuenta está 100% configurada!' : 'Tus primeros pasos en HomIA'}
          </h2>
          <p className="text-xs font-semibold text-slate-500 sm:text-[13px]">
            {doneCount} de {tasks.length} completados — así sacás el máximo a la plataforma
          </p>
        </div>
        {/* controles compactos siempre visibles: colapsar y cerrar */}
        <div className="flex shrink-0 items-center gap-1.5">
          <button type="button" onClick={() => setExpanded((v) => !v)} aria-expanded={expanded}
            className="homy-focus grid size-9 place-items-center rounded-full homy-glass-soft text-slate-500 transition hover:text-[#0A2540]"
            title={expanded ? 'Colapsar' : 'Expandir'}>
            {expanded ? <ChevronUp className="size-4" aria-hidden /> : <ChevronDown className="size-4" aria-hidden />}
          </button>
          <button type="button" onClick={dismiss} aria-label="Ocultar checklist"
            className="homy-focus grid size-9 place-items-center rounded-full homy-glass-soft text-slate-400 transition hover:text-[#0A2540]"
            title="Ocultar">
            <X className="size-4" aria-hidden />
          </button>
        </div>
      </div>

      {/* Tour y Guía en su propia fila: en el celu nunca aprietan el título
          y quedan a la altura del pulgar (fix de texto amontonado en móvil) */}
      <div className="relative mt-3 flex gap-2">
        <button type="button" onClick={() => startTour({ role: role as TourRole })}
          className="homy-focus inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full bg-[#1D63B8] px-3.5 py-2 text-xs font-bold text-white shadow-[0_10px_22px_-10px_rgba(29,99,184,0.8)] transition hover:brightness-110">
          <Play className="size-4" aria-hidden /> Ver tour guiado
        </button>
        <button type="button" onClick={() => navigate('/ayuda')}
          className="homy-focus inline-flex min-h-[40px] flex-1 items-center justify-center gap-1.5 rounded-full homy-glass-soft px-3.5 py-2 text-xs font-bold text-[#1D63B8] transition hover:bg-[#1D63B8]/10">
          <LifeBuoy className="size-4" aria-hidden /> Abrir la guía
        </button>
      </div>

      {/* barra de progreso */}
      <div className="relative mt-4 h-2 w-full overflow-hidden rounded-full bg-[#0A2540]/8" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
        <div className="h-full rounded-full bg-gradient-to-r from-[#1D63B8] to-[#00C4FF] transition-all duration-700" style={{ width: `${pct}%` }} />
      </div>

      {expanded && (
        <ul className="relative mt-4 grid gap-2 sm:grid-cols-2">
          {tasks.map((t) => (
            <li key={t.id}
              className={`homy-glass-soft flex items-start gap-3 rounded-2xl p-3.5 ${t.done ? 'opacity-70' : ''}`}>
              {t.done ? (
                <CircleCheck className="mt-0.5 size-5 shrink-0 text-[#0e9f6e]" aria-hidden />
              ) : (
                <Circle className="mt-0.5 size-5 shrink-0 text-slate-300" aria-hidden />
              )}
              <div className="min-w-0 flex-1">
                <p className={`text-sm font-bold leading-snug ${t.done ? 'text-slate-400 line-through' : 'text-[#0A2540]'}`}>{t.label}</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{t.desc}</p>
                {!t.done && t.href && (
                  <button type="button" onClick={() => navigate(t.href!)}
                    className="homy-focus mt-2 inline-flex min-h-[34px] items-center gap-1 rounded-full bg-[#1D63B8]/10 px-3.5 py-1.5 text-xs font-extrabold text-[#1D63B8] transition hover:bg-[#1D63B8] hover:text-white">
                    {t.cta} →
                  </button>
                )}
                {!t.done && t.blocked && (
                  <span className="mt-2 block text-[11px] font-semibold italic text-slate-400">{t.cta}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
