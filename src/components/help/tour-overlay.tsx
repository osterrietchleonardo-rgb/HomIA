'use client'
// Motor del tour guiado HomIA — overlay con foco (spotlight) sobre cada sección
// real de la plataforma. Los pasos navegan por la SPA, iluminan el elemento con
// data-tour correspondiente y explican qué se hace ahí. NO arranca solo: se
// ofrece desde el checklist de primeros pasos ("Ver tour guiado"), el botón de
// ayuda o el centro de ayuda (evento homy:start-tour).
import { useCallback, useEffect, useRef, useState } from 'react'
import { useRoute, navigate } from '@/lib/router'
import { TOURS, ROLE_TOUR_META, type TourRole, type TourStep } from '@/lib/tour-content'
import { toast } from 'sonner'
import {
  User, HardHat, Boxes, X, ChevronLeft, ChevronRight, Lightbulb, Compass,
} from 'lucide-react'

const START_EVENT = 'homy:start-tour'
const STATE_EVENT = 'homy:tour-state'

/** Arranca (o salta a un paso de) el tour de un rol desde cualquier componente. */
export function startTour(detail: { role: TourRole; stepId?: string }) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(START_EVENT, { detail }))
}

function markTourDone(role: string) {
  try { localStorage.setItem(`homy_tour_done_${role}`, '1') } catch { /* modo privado */ }
}

const ROLE_ICON: Record<TourRole, React.ComponentType<{ className?: string }>> = {
  cliente: User, profesional: HardHat, proveedor: Boxes,
}

type Run = { role: TourRole; index: number }

export default function TourOverlay() {
  const route = useRoute()
  const [run, setRun] = useState<Run | null>(null)
  const [rect, setRect] = useState<DOMRect | null>(null)
  // clave del paso cuyo ancla no está en pantalla (ej: en el celu vive dentro de "Más")
  const [missingKey, setMissingKey] = useState<string | null>(null)
  // en el celu, la sección del menú vive dentro de «Más»: se ilumina ese botón
  const [viaMas, setViaMas] = useState(false)
  const runRef = useRef<Run | null>(null)
  // alto real de la tarjeta (para ubicarla sin que se salga de la pantalla): lo mide un
  // ResizeObserver, porque cambia con el texto de cada paso
  const [cardH, setCardH] = useState(330)
  const roRef = useRef<ResizeObserver | null>(null)
  const cardRef = useCallback((node: HTMLDivElement | null) => {
    roRef.current?.disconnect()
    roRef.current = null
    if (!node || typeof ResizeObserver === 'undefined') return
    const medir = () => setCardH((h) => (Math.abs(node.offsetHeight - h) > 2 ? node.offsetHeight : h))
    roRef.current = new ResizeObserver(medir)
    roRef.current.observe(node)
  }, [])

  const step: TourStep | null = run ? (TOURS[run.role]?.[run.index] ?? null) : null

  // Mientras el tour corre: ocultar dock (evento) y bloquear el scroll del body.
  useEffect(() => {
    runRef.current = run
    window.dispatchEvent(new CustomEvent(STATE_EVENT, { detail: { active: !!run } }))
    document.documentElement.style.overflow = run ? 'hidden' : ''
    return () => { document.documentElement.style.overflow = '' }
  }, [run])

  // Medir el target del paso actual (null → tarjeta centrada).
  const measureOnce = useCallback((): boolean => {
    const r = runRef.current
    if (!r) return false
    const st = TOURS[r.role]?.[r.index]
    if (!st) return false
    if (!st.target) { setRect(null); setViaMas(false); return true }
    // data-tour (desktop) o data-tour-m (bottom-nav móvil): elegir el visible
    const visible = (sel: string) => {
      for (const cand of Array.from(document.querySelectorAll<HTMLElement>(sel))) {
        const r = cand.getBoundingClientRect()
        if (r.width >= 2 || r.height >= 2) return cand
      }
      return null
    }
    let el = visible(`[data-tour="${st.target}"], [data-tour-m="${st.target}"]`)
    // sección del menú que en el celu no está en la barra inferior: iluminar «Más»
    const mas = !el && st.target.startsWith('nav-') ? visible('[data-tour-m="nav-mas"]') : null
    if (mas) el = mas
    setViaMas(!!mas)
    if (!el) { setRect(null); return false }
    const rc = el.getBoundingClientRect()
    if (rc.width < 2 && rc.height < 2) { setRect(null); return false }
    // fuera de la pantalla, aunque sea en parte (ej. la pestaña «Devoluciones» en una fila que
    // scrollea de costado en el celu): llevarlo al centro
    const afuera = rc.top < 0 || rc.bottom > window.innerHeight || rc.left < 0 || rc.right > window.innerWidth
    if (afuera && rc.height < window.innerHeight && rc.width < window.innerWidth) {
      el.scrollIntoView({ block: 'center', inline: 'center', behavior: 'auto' })
      setRect(el.getBoundingClientRect())
      return true
    }
    setRect(rc)
    return true
  }, [])

  // Al cambiar el paso (o la ruta tras navegar): medir con reintentos — las
  // pantallas cargan datos async y el target puede tardar en existir.
  useEffect(() => {
    if (!run || !step) return
    if (step.route && route.path !== step.route) {
      navigate(step.route)
      return // el effect se re-ejecuta cuando route.path se actualiza
    }
    let alive = true
    let tries = 0
    const key = `${run.role}:${run.index}:${route.path}`
    const tick = () => {
      if (!alive) return
      if (measureOnce()) return
      // hasta ~6 s: la pantalla puede tardar en traer sus datos y dibujar el elemento
      if (tries > 55) { if (step.target) setMissingKey(key); return }
      tries += 1
      setTimeout(tick, 110)
    }
    const t0 = setTimeout(tick, 0)
    return () => { alive = false; clearTimeout(t0) }
  }, [run, route.path, measureOnce])

  // Reposicionar en scroll/resize (el foco sigue al elemento).
  useEffect(() => {
    if (!run) return
    const re = () => measureOnce()
    window.addEventListener('resize', re)
    window.addEventListener('scroll', re, true)
    return () => {
      window.removeEventListener('resize', re)
      window.removeEventListener('scroll', re, true)
    }
  }, [run, measureOnce])

  const end = useCallback((skipped: boolean) => {
    const r = runRef.current
    if (r) {
      markTourDone(r.role)
      toast.success(skipped
        ? 'Tour salteado: lo repetís cuando quieras desde el botón de ayuda.'
        : '¡Listo! Guardamos tu recorrido: lo repetís desde el botón de ayuda.')
    }
    setRun(null)
    setRect(null)
  }, [])

  const goNext = useCallback(() => {
    const r = runRef.current
    if (!r) return
    const total = TOURS[r.role]?.length || 0
    if (r.index + 1 >= total) end(false)
    else setRun({ role: r.role, index: r.index + 1 })
  }, [end])

  const goPrev = useCallback(() => {
    const r = runRef.current
    if (r && r.index > 0) setRun({ role: r.role, index: r.index - 1 })
  }, [])

  // Teclado: ← → para moverse, Esc para salir.
  useEffect(() => {
    if (!run) return
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') end(true)
      else if (e.key === 'ArrowRight') goNext()
      else if (e.key === 'ArrowLeft') goPrev()
    }
    window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [run, goNext, goPrev, end])

  // Escuchar pedidos de arranque desde el dock / checklist / centro de ayuda.
  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent).detail || {}
      const role = d.role as TourRole
      if (!TOURS[role]) return
      const steps = TOURS[role]
      const idx = d.stepId ? steps.findIndex((x) => x.id === d.stepId) : 0
      setRun({ role, index: idx >= 0 ? idx : 0 })
    }
    window.addEventListener(START_EVENT, h)
    return () => window.removeEventListener(START_EVENT, h)
  }, [])

  if (!run || !step) return null

  const meta = ROLE_TOUR_META[run.role]
  const Icon = ROLE_ICON[run.role]
  const total = TOURS[run.role].length
  const isLast = run.index === total - 1
  const vw = rect ? window.innerWidth : 0
  const compact = rect ? vw < 640 : false
  // en móvil (sin sidebar) las secciones que no están en la barra inferior viven en "Más"
  const isMobile = typeof window !== 'undefined' && window.innerWidth < 1024
  const missing = !rect && missingKey === `${run.role}:${run.index}:${route.path}`
  const hint = viaMas
    ? 'En el celu, esta sección está dentro de «Más» (abajo a la derecha)'
    : missing && isMobile ? 'Abrí «Más» (abajo a la derecha) para encontrar esta sección' : null
  // en el celu la tarjeta va abajo, salvo que el foco esté en la mitad de abajo (barra
  // inferior, «Más»): ahí va arriba para no taparlo
  const compactArriba = compact && !!rect && rect.top > window.innerHeight / 2

  // Posición de la tarjeta: debajo del foco si hay lugar, si no arriba.
  let cardStyle: React.CSSProperties = {}
  if (rect && !compact) {
    const cardW = 350
    const vh = window.innerHeight
    const left = Math.max(12, Math.min(rect.left + rect.width / 2 - cardW / 2, vw - cardW - 12))
    if (rect.bottom + cardH + 26 <= vh) cardStyle = { top: rect.bottom + 14, left } // abajo del foco
    else if (rect.top - cardH - 26 >= 0) cardStyle = { top: rect.top - cardH - 14, left } // arriba
    else {
      // ni arriba ni abajo (ej. un ítem bajo del menú lateral): al costado, dentro de la pantalla
      const top = Math.max(12, Math.min(rect.top + rect.height / 2 - cardH / 2, vh - cardH - 12))
      const derecha = rect.right + 16 + cardW <= vw - 12
      cardStyle = { top, left: derecha ? rect.right + 16 : Math.max(12, rect.left - cardW - 16) }
    }
  }

  return (
    <>
      {/* con foco: bloquea clicks sobre la app (el oscurecido lo pinta el foco).
          Sin foco (tarjeta centrada) la app sigue usable detrás. */}
      {rect && <div className="fixed inset-0 z-[61] bg-transparent" aria-hidden />}
      {rect && (
        <div
          aria-hidden
          className="pointer-events-none fixed z-[62] transition-all duration-300"
          style={{
            top: rect.top - 6,
            left: rect.left - 6,
            width: rect.width + 12,
            height: rect.height + 12,
            borderRadius: 18,
            boxShadow: '0 0 0 9999px rgba(7,18,36,0.68), 0 0 0 3px rgba(0,196,255,0.85), 0 0 34px rgba(0,196,255,0.35)',
          }}
        />
      )}

      <div
        role="dialog"
        aria-modal={!!rect}
        aria-label={`Tour guiado: ${step.title}`}
        className={
          compact
            ? `fixed inset-x-2 z-[63] ${compactArriba ? 'top-3' : 'bottom-3'}`
            : rect
              ? 'fixed z-[63] w-[350px]'
              : 'pointer-events-none fixed inset-0 z-[63] flex items-center justify-center px-4'
        }
        style={cardStyle}
      >
        <div ref={cardRef} className="homy-glass-strong pointer-events-auto max-h-[86vh] w-full max-w-md overflow-y-auto rounded-3xl p-5 shadow-[0_30px_80px_-24px_rgba(10,37,64,0.55)]">
          <div className="flex items-center gap-2.5">
            <span className="homy-icon-chip homy-chip-blue size-9 shrink-0 [&_svg]:size-4.5" aria-hidden><Icon /></span>
            <div className="min-w-0 flex-1">
              {/* flex-wrap: en el celu el "paso N de M" baja a su propia línea
                  en vez de desbordar la tarjeta */}
              <p className="flex flex-wrap items-center gap-x-1 text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#1D63B8]">
                <Compass className="size-3 shrink-0" aria-hidden /> Recorrido {meta.label} <span className="text-[#0A2540]/35">· paso {run.index + 1} de {total}</span>
              </p>
              <h3 className="mt-0.5 line-clamp-2 text-[15px] font-extrabold leading-snug tracking-tight text-[#0A2540]">{step.title}</h3>
            </div>
            <button onClick={() => end(true)} aria-label="Salir del tour"
              className="homy-focus grid size-8 shrink-0 place-items-center rounded-full homy-glass-soft text-slate-400 transition hover:text-[#0A2540]">
              <X className="size-4" aria-hidden />
            </button>
          </div>

          <p className="mt-3 text-[13.5px] leading-relaxed text-slate-600">{step.body}</p>

          {hint && (
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-[#FFC700]/15 px-3 py-2.5 text-xs font-bold leading-relaxed text-[#0A2540]">
              <Compass className="mt-0.5 size-4 shrink-0 text-[#B98A00]" aria-hidden />
              <span className="min-w-0">{hint}</span>
            </p>
          )}

          {step.tip && (
            <p className="mt-3 flex items-start gap-2 rounded-2xl bg-[#00C4FF]/10 px-3 py-2.5 text-xs font-semibold leading-relaxed text-[#0A2540] [overflow-wrap:anywhere]">
              <Lightbulb className="mt-0.5 size-4 shrink-0 text-[#0092c4]" aria-hidden />
              <span className="min-w-0">{step.tip}</span>
            </p>
          )}

          {/* progreso */}
          <div className="mt-4 flex items-center gap-1.5" aria-hidden>
            {TOURS[run.role].map((s, i) => (
              <span key={s.id} className={`h-1.5 rounded-full transition-all duration-300 ${i === run.index ? 'w-6 bg-[#1D63B8]' : 'w-1.5 bg-[#0A2540]/15'}`} />
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            {run.index > 0 ? (
              <button onClick={goPrev} className="homy-btn-ghost min-h-[40px] flex-1 px-4 text-sm">
                <ChevronLeft className="size-4" aria-hidden /> Anterior
              </button>
            ) : (
              <button onClick={() => end(true)} className="homy-btn-ghost min-h-[40px] flex-1 px-4 text-sm">Saltar</button>
            )}
            <button onClick={goNext} className="homy-btn-dark min-h-[40px] flex-[1.4] px-4 text-sm">
              {isLast ? 'Entendido, ¡a operar!' : 'Siguiente'} <ChevronRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      </div>
    </>
  )
}
