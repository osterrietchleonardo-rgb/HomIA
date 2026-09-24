'use client'
// Homy flotante — el ÚNICO botón flotante de la app (montado en app-root para
// todas las pantallas). Abre un panel con dos vistas:
//   · Homy: chat con el súper agente, especializado en el rol y la pantalla actual
//   · Guías: lo que ya existía (tour, "¿Cómo hago…?", "Me trabé", videos)
// Se oculta mientras corre el tour, en login/registro y en la home de la SPA
// (ahí vive el botón flotante de la home, que es el mismo agente).
import { useEffect, useRef, useState } from 'react'
import { useRoute, navigate, Link } from '@/lib/router'
import { useSession } from '@/lib/store'
import { TOURS, ROLE_TOUR_META, type TourRole } from '@/lib/tour-content'
import { HOWTOS, TROUBLES } from '@/lib/howto-content'
import { videosForRole, type VideoRole } from '@/lib/videos-content'
import { openVideo } from '@/components/help/video-modal'
import { startTour } from '@/components/help/tour-overlay'
import { Homy } from '@/components/homy/homy-character'
import { HomyConversacion } from '@/components/homy/homy-conversacion'
import { useDuenioHomy, useHomy } from '@/components/homy/homy-store'
import { sugerenciasPara } from '@/components/homy/sugerencias'
import {
  X, Play, ListChecks, Wrench, ChevronDown, ChevronRight,
  Compass, User, HardHat, Boxes, ArrowRight, Clapperboard, Sparkles, LifeBuoy,
} from 'lucide-react'

const STATE_EVENT = 'homy:tour-state'

export default function HelpDock() {
  const route = useRoute()
  const { user } = useSession()
  useDuenioHomy()
  const ocupado = useHomy((s) => s.ocupado)
  const [open, setOpen] = useState(false)
  const [vista, setVista] = useState<'homy' | 'guias'>('homy')
  const [tab, setTab] = useState<'tour' | 'como' | 'trabe' | 'videos'>('tour')
  const [tourActive, setTourActive] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [hint, setHint] = useState(false)
  const botonRef = useRef<HTMLButtonElement>(null)

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

  // Esc cierra y devuelve el foco al botón
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setOpen(false); botonRef.current?.focus() }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  const s = route.segments
  const enPanel = s[0] === 'panel' && (s[1] === 'cliente' || s[1] === 'profesional' || s[1] === 'proveedor')
  const role: TourRole | null = (() => {
    if (!user) return null
    if (enPanel) return s[1] as TourRole
    const r = user.roles?.find((x) => x === 'cliente' || x === 'profesional' || x === 'proveedor')
    return (r as TourRole) || null
  })()
  const pantalla = enPanel ? s[2] || '' : ''

  const authPage = route.path.startsWith('/ingresar') || route.path.startsWith('/registrarse')
  const homeSpa = s.length === 0 // la home tiene su propio botón de Homy (mismo agente)
  if (tourActive || authPage || homeSpa) return null

  function openPanel() {
    setOpen(true)
    setExpanded(null)
    setHint(false)
    try { localStorage.setItem('homy_dock_hint', '1') } catch { /* privado */ }
  }
  const cerrar = () => setOpen(false)

  const meta = role ? ROLE_TOUR_META[role] : null
  const nombre = user?.displayName?.split(' ')[0]
  const bienvenida = role
    ? `¡Hola${nombre ? `, ${nombre}` : ''}! Soy Homy. Te ayudo con todo lo de tu panel de ${meta!.label.toLowerCase()}: qué hace cada sección, cómo se hace cada cosa y qué tenés pendiente.`
    : '¡Hola! Soy Homy. Preguntame qué necesita tu casa o cómo funciona HomIA y te respondo con datos reales.'

  return (
    <>
      {/* botón flotante único: la mascota */}
      <button
        ref={botonRef}
        onClick={() => (open ? setOpen(false) : openPanel())}
        aria-expanded={open}
        aria-label={open ? 'Cerrar a Homy' : 'Abrir a Homy: asistente y ayuda'}
        data-homy-fab
        className="homy-focus group fixed bottom-[5.9rem] right-4 z-40 grid size-14 place-items-center rounded-full border border-white/80 bg-white/90 shadow-[0_16px_40px_-12px_rgba(10,37,64,0.55)] backdrop-blur-md transition hover:scale-105 lg:bottom-6"
      >
        {open ? <X className="size-6 text-[#0A2540]" aria-hidden /> : <Homy size={40} state={ocupado ? 'thinking' : 'idle'} />}
        {hint && !open && <span aria-hidden className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full bg-[#FF5A1F] ring-2 ring-white"><span className="absolute inset-0 animate-ping rounded-full bg-[#FF5A1F]/70" /></span>}
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="Homy: asistente y ayuda"
          data-homy-panel
          className="homy-glass-strong !bg-[#f6f8fb] fixed bottom-[10rem] left-3 right-3 z-40 flex h-[min(640px,calc(100dvh-14rem))] flex-col overflow-hidden rounded-3xl shadow-[0_30px_80px_-24px_rgba(10,37,64,0.6)] sm:left-auto sm:w-[25rem] lg:bottom-[5.3rem] lg:h-[min(660px,calc(100dvh-8rem))]"
        >
          {/* header */}
          <div className="flex items-center gap-2.5 px-4 pt-3.5">
            <Homy size={34} state={ocupado ? 'thinking' : 'idle'} />
            <div className="min-w-0 flex-1">
              <p className="text-[10.5px] font-extrabold uppercase tracking-[0.14em] text-[#1D63B8]">
                {meta ? `Homy · ${meta.label}` : 'Homy · HomIA'}
              </p>
              <h3 className="truncate text-[15px] font-extrabold tracking-tight text-[#0A2540]">
                {vista === 'homy' ? 'Preguntame lo que quieras' : meta ? meta.tourTitle : '¿Cómo te ayudamos?'}
              </h3>
            </div>
            <button onClick={() => { setOpen(false); botonRef.current?.focus() }} aria-label="Cerrar"
              className="homy-focus grid size-9 shrink-0 place-items-center rounded-full homy-glass-soft text-slate-400 transition hover:text-[#0A2540]">
              <X className="size-4" aria-hidden />
            </button>
          </div>

          {/* Homy | Guías */}
          <div className="px-4 pb-1 pt-2.5">
            <div className="grid grid-cols-2 gap-1 rounded-2xl bg-[#0A2540]/5 p-1" role="tablist" aria-label="Homy o guías">
              {([
                { id: 'homy', label: 'Homy', icon: Sparkles },
                { id: 'guias', label: 'Guías y tour', icon: LifeBuoy },
              ] as const).map((t) => (
                <button key={t.id} role="tab" aria-selected={vista === t.id} onClick={() => { setVista(t.id); setExpanded(null) }}
                  className={`homy-focus inline-flex min-h-[38px] items-center justify-center gap-1.5 rounded-xl px-2 text-xs font-extrabold transition ${
                    vista === t.id ? 'bg-white text-[#0A2540] shadow-sm' : 'text-slate-500 hover:text-[#0A2540]'
                  }`}>
                  <t.icon className="size-3.5" aria-hidden /> {t.label}
                </button>
              ))}
            </div>
          </div>

          {vista === 'homy' ? (
            <HomyConversacion
              puerta="panel"
              rolPanel={role}
              autoFocus
              bienvenida={bienvenida}
              sugerenciasIniciales={sugerenciasPara(role ?? 'visitante', pantalla)}
              onNavegar={cerrar}
            />
          ) : !role ? (
            /* sin sesión: guía mínima pública */
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              <p className="text-sm leading-relaxed text-slate-600">
                En HomIA cada rol tiene su panel con recorrido guiado, guías paso a paso y soluciones si te trabás.
                Creá tu cuenta gratis y te llevamos de la mano.
              </p>
              <ul className="mt-3 space-y-2 text-sm font-semibold text-[#0A2540]">
                <li className="homy-glass-soft flex items-center gap-2 rounded-2xl px-3.5 py-2.5"><User className="size-4 shrink-0 text-[#1D63B8]" aria-hidden /> Cliente: publicás, comparás, contratás y pagás al finalizar</li>
                <li className="homy-glass-soft flex items-center gap-2 rounded-2xl px-3.5 py-2.5"><HardHat className="size-4 shrink-0 text-[#FF5A1F]" aria-hidden /> Profesional: presupuestás y cobrás por Mercado Pago o efectivo</li>
                <li className="homy-glass-soft flex items-center gap-2 rounded-2xl px-3.5 py-2.5"><Boxes className="size-4 shrink-0 text-[#0092c4]" aria-hidden /> Proveedor: tu stock es tu vidriera</li>
              </ul>
              <Link to="/ayuda" onClick={cerrar}
                className="homy-focus mt-3 flex min-h-[42px] w-full items-center justify-center gap-2 rounded-2xl homy-glass-soft px-4 text-xs font-extrabold text-[#1D63B8] transition hover:bg-[#1D63B8]/10">
                <Compass className="size-4" aria-hidden /> Centro de ayuda <ArrowRight className="size-3.5" aria-hidden />
              </Link>
            </div>
          ) : (
            <>
              {/* tabs de guías */}
              <div className="px-4 pb-1 pt-1.5">
                <div className="grid grid-cols-4 gap-1 rounded-2xl bg-[#0A2540]/5 p-1" role="tablist" aria-label="Secciones de ayuda">
                  {([
                    { id: 'tour', label: 'Tour', icon: Play },
                    { id: 'como', label: '¿Cómo hago?', icon: ListChecks },
                    { id: 'trabe', label: 'Me trabé', icon: Wrench },
                    { id: 'videos', label: 'Videos', icon: Clapperboard },
                  ] as const).map((t) => (
                    <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => { setTab(t.id); setExpanded(null) }}
                      className={`homy-focus inline-flex min-h-[38px] items-center justify-center gap-1 rounded-xl px-1.5 text-[11px] font-extrabold transition sm:text-xs ${
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
                    {TOURS[role].filter((st) => st.route && st.target).map((st) => (
                      <button key={st.id} onClick={() => { setOpen(false); startTour({ role, stepId: st.id }) }}
                        className="homy-focus group flex min-h-[44px] w-full items-center gap-2 rounded-2xl homy-glass-soft px-3.5 py-2.5 text-left transition hover:bg-white">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-bold text-[#0A2540]">{st.title}</span>
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
                          <ChevronDown className={`size-4 shrink-0 text-slate-400 transition ${expanded === h.id ? 'rotate-180' : ''}`} aria-hidden />
                        </button>
                        {expanded === h.id && (
                          <div className="px-3.5 pb-3.5">
                            <ol className="space-y-1.5">
                              {h.steps.map((st, i) => (
                                <li key={i} className="flex gap-2 text-[12.5px] leading-relaxed text-slate-600">
                                  <span className="mt-0.5 grid size-4.5 shrink-0 place-items-center rounded-full bg-[#1D63B8]/12 text-[10px] font-extrabold text-[#1D63B8]">{i + 1}</span>
                                  {st}
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

                {tab === 'videos' && (
                  <div className="space-y-2">
                    <p className="px-1 pb-1 text-[12.5px] leading-relaxed text-slate-500">
                      Videitos cortos con voz: cada sección y cada acción del rol, explicada para mirar donde estés.
                    </p>
                    {videosForRole(role as VideoRole).map((v) => (
                      <button key={v.id} onClick={() => openVideo(v)}
                        className="homy-focus group flex w-full items-center gap-3 rounded-2xl homy-glass-soft p-2 text-left transition hover:bg-white">
                        <span className="relative block w-24 shrink-0 overflow-hidden rounded-xl" aria-hidden>
                          <img src={`/videos/${v.id}.jpg`} alt="" className="aspect-video w-full object-cover" loading="lazy" />
                          <span className="absolute inset-0 grid place-items-center bg-[#0A2540]/25 transition group-hover:bg-[#1D63B8]/40">
                            <span className="grid size-7 place-items-center rounded-full bg-white/90 text-[#1D63B8] shadow">
                              <Play className="size-3.5 fill-current" aria-hidden />
                            </span>
                          </span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-bold leading-snug text-[#0A2540]">{v.title}</span>
                          <span className="mt-0.5 block text-[11.5px] font-semibold leading-snug text-slate-500">{v.desc}</span>
                        </span>
                      </button>
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

              <div className="border-t border-[#0A2540]/8 p-3">
                <Link to="/ayuda" onClick={cerrar}
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
