'use client'
// Ayuda flotante HomIA — el botón ? que nunca se va de la pantalla.
// Abre un panel rápido con 3 pestañas por rol:
//   · Tour: repetir el recorrido guiado (completo o sección por sección)
//   · ¿Cómo hago…?: guías paso a paso de cada acción del rol
//   · Me trabé: soluciones a los atascos típicos ("¿por qué no puedo…?")
// Se oculta mientras el tour corre y en las pantallas de login/registro.
import { useEffect, useState } from 'react'
import { useRoute, navigate, Link } from '@/lib/router'
import { useSession } from '@/lib/store'
import { TOURS, ROLE_TOUR_META, type TourRole } from '@/lib/tour-content'
import { HOWTOS, TROUBLES } from '@/lib/howto-content'
import { startTour } from '@/components/help/tour-overlay'
import {
  LifeBuoy, X, Play, ListChecks, Wrench, ChevronDown, ChevronRight,
  Compass, User, HardHat, Boxes, ArrowRight,
} from 'lucide-react'

const STATE_EVENT = 'homy:tour-state'
const ROLE_ICON: Record<TourRole, React.ComponentType<{ className?: string }>> = {
  cliente: User, profesional: HardHat, proveedor: Boxes,
}

export default function HelpDock() {
  const route = useRoute()
  const { user } = useSession()
  const [open, setOpen] = useState(false)
  const [tab, setTab] = useState<'tour' | 'como' | 'trabe'>('tour')
  const [tourActive, setTourActive] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [hint, setHint] = useState(false)

  // ocultarse mientras el tour corre
  useEffect(() => {
    const h = (e: Event) => setTourActive(!!(e as CustomEvent).detail?.active)
    window.addEventListener(STATE_EVENT, h)
    return () => window.removeEventListener(STATE_EVENT, h)
  }, [])

  // puntito pulsante hasta la primera vez que lo abren (post-mount para no romper hidratación)
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    try { if (localStorage.getItem('homy_dock_hint') !== '1') setHint(true) } catch { /* privado */ }
  }, [])

  const role: TourRole | null = (() => {
    const s = route.segments
    if (s[0] === 'panel' && s[1] && (s[1] === 'cliente' || s[1] === 'profesional' || s[1] === 'proveedor')) {
      return s[1] as TourRole
    }
    const r = user?.roles?.find((x) => x === 'cliente' || x === 'profesional' || x === 'proveedor')
    return (r as TourRole) || null
  })()

  const authPage = route.path.startsWith('/ingresar') || route.path.startsWith('/registrarse')
  if (tourActive || authPage) return null

  function openPanel() {
    setOpen(true)
    setExpanded(null)
    setHint(false)
    try { localStorage.setItem('homy_dock_hint', '1') } catch { /* privado */ }
  }

  const meta = role ? ROLE_TOUR_META[role] : null
  const Icon = role ? ROLE_ICON[role] : LifeBuoy

  return (
    <>
      {/* botón flotante */}
      <button
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-expanded={open}
        aria-label="Ayuda: tour guiado, cómo hacer cada cosa y soluciones si te trabás"
        className="homy-focus group fixed bottom-[4.9rem] right-4 z-40 grid size-14 place-items-center rounded-full homy-glass-dark text-white shadow-[0_16px_40px_-12px_rgba(10,37,64,0.65)] transition hover:scale-105 lg:bottom-6"
      >
        <LifeBuoy className="size-6" aria-hidden />
        {hint && <span aria-hidden className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full bg-[#FF5A1F] ring-2 ring-white"><span className="absolute inset-0 animate-ping rounded-full bg-[#FF5A1F]/70" /></span>}
      </button>

      {/* panel rápido */}
      {open && (
        <div
          role="dialog"
          aria-label="Centro de ayuda rápido"
          className="homy-glass-strong fixed bottom-[8.9rem] left-3 right-3 z-40 flex max-h-[min(74vh,580px)] flex-col overflow-hidden rounded-3xl shadow-[0_30px_80px_-24px_rgba(10,37,64,0.6)] sm:left-auto sm:w-[25rem] lg:bottom-[5.3rem]"
        >
          {/* header */}
          <div className="flex items-center gap-2.5 px-4 pt-4">
            <span className="homy-icon-chip homy-chip-blue size-9 shrink-0 [&_svg]:size-4.5" aria-hidden><Icon /></span>
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#1D63B8]">
                {meta ? `Ayuda · ${meta.label}` : 'Ayuda HomIA'}
              </p>
              <h3 className="truncate text-[15px] font-extrabold tracking-tight text-[#0A2540]">
                {meta ? meta.tourTitle : '¿Cómo te ayudamos?'}
              </h3>
            </div>
            <button onClick={() => setOpen(false)} aria-label="Cerrar ayuda"
              className="homy-focus grid size-8 shrink-0 place-items-center rounded-full homy-glass-soft text-slate-400 transition hover:text-[#0A2540]">
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {!role ? (
            /* sin sesión: guía mínima pública */
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <p className="text-sm leading-relaxed text-slate-600">
                En HomIA cada rol tiene su panel con recorrido guiado, guías paso a paso y soluciones si te trabás.
                Creá tu cuenta gratis y te llevamos de la mano.
              </p>
              <ul className="mt-3 space-y-2 text-sm font-semibold text-[#0A2540]">
                <li className="homy-glass-soft flex items-center gap-2 rounded-2xl px-3.5 py-2.5"><User className="size-4 shrink-0 text-[#1D63B8]" aria-hidden /> Cliente: publicás, comparás y contratás con escrow</li>
                <li className="homy-glass-soft flex items-center gap-2 rounded-2xl px-3.5 py-2.5"><HardHat className="size-4 shrink-0 text-[#FF5A1F]" aria-hidden /> Profesional: presupuestás y cobrás protegido</li>
                <li className="homy-glass-soft flex items-center gap-2 rounded-2xl px-3.5 py-2.5"><Boxes className="size-4 shrink-0 text-[#0092c4]" aria-hidden /> Proveedor: tu stock es tu vidriera</li>
              </ul>
            </div>
          ) : (
            <>
              {/* tabs */}
              <div className="px-4 pb-1 pt-3">
                <div className="grid grid-cols-3 gap-1 rounded-2xl bg-[#0A2540]/5 p-1" role="tablist" aria-label="Secciones de ayuda">
                  {([
                    { id: 'tour', label: 'Tour', icon: Play },
                    { id: 'como', label: '¿Cómo hago?', icon: ListChecks },
                    { id: 'trabe', label: 'Me trabé', icon: Wrench },
                  ] as const).map((t) => (
                    <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setExpanded(null) }}
                      className={`homy-focus inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-extrabold transition ${
                        tab === t.id ? 'bg-white text-[#0A2540] shadow-sm' : 'text-slate-500 hover:text-[#0A2540]'
                      }`}>
                      <t.icon className="size-3.5" aria-hidden /> {t.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-3">
                {tab === 'tour' && (
                  <div className="space-y-2">
                    <p className="px-1 pb-1 text-[12.5px] leading-relaxed text-slate-500">{meta!.tourSub}</p>
                    <button onClick={() => { setOpen(false); startTour({ role }) }}
                      className="homy-focus flex min-h-[46px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#1D63B8] to-[#2b7fd0] px-4 text-sm font-extrabold text-white shadow-[0_12px_26px_-12px_rgba(29,99,184,0.8)] transition hover:brightness-110">
                      <Play className="size-4" aria-hidden /> Empezar recorrido completo ({TOURS[role].length} paradas)
                    </button>
                    <p className="px-1 pt-1.5 text-[11px] font-bold uppercase tracking-[0.12em] text-slate-400">O mirá solo la sección que quieras</p>
                    {TOURS[role].filter((s) => s.route && s.target).map((s) => (
                      <button key={s.id} onClick={() => { setOpen(false); startTour({ role, stepId: s.id }) }}
                        className="homy-focus group flex min-h-[44px] w-full items-center gap-2 rounded-2xl homy-glass-soft px-3.5 py-2.5 text-left transition hover:bg-white">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-[#0A2540]">{s.title}</span>
                        </span>
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-[#1D63B8]/10 px-2.5 py-1 text-[11px] font-extrabold text-[#1D63B8] transition group-hover:bg-[#1D63B8] group-hover:text-white">
                          Ver <ChevronRight className="size-3" aria-hidden />
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {tab === 'como' && (
                  <div className="space-y-2">
                    <p className="px-1 pb-1 text-[12.5px] leading-relaxed text-slate-500">Cada acción del rol, paso a paso. Sin adivinar dónde se hace.</p>
                    {HOWTOS[role].map((h) => (
                      <div key={h.id} className="homy-glass-soft overflow-hidden rounded-2xl">
                        <button onClick={() => setExpanded(expanded === h.id ? null : h.id)} aria-expanded={expanded === h.id}
                          className="homy-focus flex min-h-[48px] w-full items-center gap-2 px-3.5 py-2.5 text-left">
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-bold leading-snug text-[#0A2540]">{h.title}</span>
                            <span className="mt-0.5 block text-[11px] font-semibold text-slate-400">Lleva {h.time}</span>
                          </span>
                          {expanded === h.id
                            ? <ChevronDown className="size-4 shrink-0 rotate-180 text-slate-400" aria-hidden />
                            : <ChevronDown className="size-4 shrink-0 text-slate-400" aria-hidden />}
                        </button>
                        {expanded === h.id && (
                          <div className="px-3.5 pb-3.5">
                            <ol className="space-y-1.5">
                              {h.steps.map((s, i) => (
                                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-slate-600">
                                  <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-[#1D63B8]/12 text-[10px] font-extrabold text-[#1D63B8]">{i + 1}</span>
                                  {s}
                                </li>
                              ))}
                            </ol>
                            {h.href && (
                              <button onClick={() => { setOpen(false); navigate(h.href!) }}
                                className="homy-focus mt-3 inline-flex min-h-[38px] w-full items-center justify-center gap-1.5 rounded-full bg-[#1D63B8] px-4 text-xs font-extrabold text-white transition hover:brightness-110">
                                {h.cta || 'Llevame ahí'} <ArrowRight className="size-3.5" aria-hidden />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {tab === 'trabe' && (
                  <div className="space-y-2">
                    <p className="px-1 pb-1 text-[12.5px] leading-relaxed text-slate-500">Los atascos más comunes, con el porqué y la salida. No hay problema sin botón.</p>
                    {TROUBLES[role].map((t) => (
                      <div key={t.id} className="homy-glass-soft overflow-hidden rounded-2xl">
                        <button onClick={() => setExpanded(expanded === t.id ? null : t.id)} aria-expanded={expanded === t.id}
                          className="homy-focus flex min-h-[48px] w-full items-center gap-2 px-3.5 py-2.5 text-left">
                          <Wrench className="size-4 shrink-0 text-[#FF5A1F]" aria-hidden />
                          <span className="min-w-0 flex-1 text-[13px] font-bold leading-snug text-[#0A2540]">{t.q}</span>
                          <ChevronDown className={`size-4 shrink-0 text-slate-400 transition ${expanded === t.id ? 'rotate-180' : ''}`} aria-hidden />
                        </button>
                        {expanded === t.id && (
                          <div className="space-y-2 px-3.5 pb-3.5 text-[12.5px] leading-relaxed">
                            <p className="text-slate-500"><span className="font-extrabold text-slate-600">¿Por qué pasa? </span>{t.why}</p>
                            <p className="rounded-2xl bg-[#0e9f6e]/10 px-3 py-2.5 text-[#0A2540]"><span className="font-extrabold">Qué hacer: </span>{t.fix}</p>
                            {t.href && (
                              <button onClick={() => { setOpen(false); navigate(t.href!) }}
                                className="homy-focus inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#1D63B8]/10 px-3.5 text-xs font-extrabold text-[#1D63B8] transition hover:bg-[#1D63B8] hover:text-white">
                                {t.hrefLabel || 'Ir'} <ArrowRight className="size-3.5" aria-hidden />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* footer */}
              <div className="border-t border-[#0A2540]/8 p-3">
                <Link to="/ayuda" onClick={() => setOpen(false)}
                  className="homy-focus flex min-h-[42px] w-full items-center justify-center gap-2 rounded-2xl homy-glass-soft px-4 text-xs font-extrabold text-[#1D63B8] transition hover:bg-[#1D63B8]/10">
                  <Compass className="size-4" aria-hidden /> Centro de ayuda completo (mapa de todo) <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              </div>
            </>
          )}
        </div>
      )}
    </>
  )
}
