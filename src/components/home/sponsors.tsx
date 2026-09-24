'use client'
// Cinta de sponsors de la home — proveedores con Plan PRO ACTIVO.
// Una banda horizontal que se desplaza como cinta transportadora (marquee
// infinito) con el logo y la marca de cada uno. Si un proveedor deja de pagar
// o baja a Básico, la API deja de devolverlo y sale de la cinta en el acto.
//
// Detalles:
//  · loop sin salto: el contenido se renderiza 2 veces y se anima translateX
//    de 0 a -50% (la segunda copia es aria-hidden y no recibe foco);
//  · velocidad constante (~40 px/s): la duración se calcula con el ancho real;
//  · pausa con hover y con foco (teclado);
//  · prefers-reduced-motion → sin animación, scroll horizontal manual;
//  · con 1-3 sponsors se repiten los necesarios para llenar la cinta;
//  · 0 sponsors → la sección no existe.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from '@/lib/router'
import { Crown, ShieldCheck } from 'lucide-react'

export type Sponsor = {
  id: string
  href: string
  businessName: string
  logoUrl: string | null
  hasBrandLogo?: boolean
  tagline: string | null
  color: string | null
  city?: string | null
  verified?: boolean
}

const SPEED_PX_PER_S = 40
const MIN_ITEMS = 10 // ítems mínimos por vuelta para que la cinta llene pantallas anchas

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || 'H'
}

/** Ítem de la cinta: logo + marca (+ frase en desktop). También lo usa la vista
 *  previa de "Tu marca en la home" en el perfil del proveedor. */
export function SponsorChip({ s, showTagline = 'desktop' }: { s: Sponsor; showTagline?: 'desktop' | 'always' }) {
  const accent = s.color || '#FFC700'
  return (
    <span
      className="flex h-[76px] w-[228px] items-center gap-3 rounded-2xl bg-white/85 px-3.5 shadow-[0_6px_20px_-12px_rgba(10,37,64,0.35)] ring-1 ring-[#0A2540]/8 backdrop-blur sm:w-[260px] lg:w-[300px]"
      style={{ borderLeft: `4px solid ${accent}` } as CSSProperties}
    >
      <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-white ring-1 ring-[#0A2540]/6">
        {s.logoUrl ? (
          <img src={s.logoUrl} alt="" loading="lazy" draggable={false} className="max-h-full max-w-full object-contain p-1" />
        ) : (
          <span className="text-sm font-extrabold text-[#0A2540]" style={{ color: s.color || undefined }}>{initials(s.businessName)}</span>
        )}
      </span>
      <span className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1">
          <span className="truncate text-[14px] font-extrabold leading-tight text-[#0A2540]">{s.businessName}</span>
          {s.verified && <ShieldCheck className="size-3.5 shrink-0 text-[#0e9f6e]" aria-label="Identidad verificada" />}
        </span>
        {s.tagline ? (
          <span className={`${showTagline === 'always' ? 'block' : 'hidden lg:block'} mt-0.5 truncate text-[12px] leading-snug text-slate-500`}>{s.tagline}</span>
        ) : null}
        <span className="mt-1 inline-flex items-center gap-1 rounded-full bg-gradient-to-r from-[#FFC700] to-[#ffd84d] px-1.5 py-px text-[8.5px] font-extrabold uppercase tracking-widest text-[#6b4d00]">
          <Crown className="size-2.5" aria-hidden /> Recomendado
        </span>
      </span>
    </span>
  )
}

export function Sponsors() {
  const [sponsors, setSponsors] = useState<Sponsor[] | null>(null)
  const [reduced, setReduced] = useState(false)
  const [duration, setDuration] = useState(60)
  const loopRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    let alive = true
    fetch('/api/sponsors')
      .then(async (r) => { if (alive) setSponsors(r.ok ? ((await r.json()).sponsors || []) : []) })
      .catch(() => { if (alive) setSponsors([]) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  // una "vuelta" de la cinta: con pocos sponsors se repiten hasta llenarla
  const loop = useMemo(() => {
    if (!sponsors?.length) return []
    if (reduced) return sponsors // sin animación no hace falta repetir
    const reps = Math.max(1, Math.ceil(MIN_ITEMS / sponsors.length))
    return Array.from({ length: reps }, () => sponsors).flat()
  }, [sponsors, reduced])

  // velocidad constante: duración = ancho de una vuelta / velocidad
  useEffect(() => {
    const el = loopRef.current
    if (!el || reduced) return
    const measure = () => setDuration(Math.max(8, el.scrollWidth / SPEED_PX_PER_S))
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [loop, reduced])

  if (sponsors === null || sponsors.length === 0) return null // sin PRO activos, la sección no existe

  const renderItems = (copy: 'a' | 'b') =>
    loop.map((s, i) => (
      <li key={`${copy}-${s.id}-${i}`} className="shrink-0">
        <Link
          to={s.href}
          tabIndex={copy === 'b' ? -1 : undefined}
          aria-label={copy === 'b' ? undefined : `${s.businessName}${s.tagline ? `: ${s.tagline}` : ''} (proveedor recomendado, ver perfil)`}
          className="homy-focus block rounded-2xl transition-transform duration-200 hover:-translate-y-0.5"
        >
          <SponsorChip s={s} />
        </Link>
      </li>
    ))

  return (
    <section aria-labelledby="homy-sponsors-title" className="relative overflow-hidden py-12 sm:py-16">
      <style>{MARQUEE_CSS}</style>
      <div className="mx-auto max-w-2xl px-4 text-center">
        <p className="homy-eyebrow">Sponsors de HomIA</p>
        <h2 id="homy-sponsors-title" className="mt-2 text-2xl font-extrabold tracking-tight text-navy sm:text-4xl">
          Proveedores <span className="text-[#B98A00]">recomendados</span> de la comunidad
        </h2>
        <p className="mx-auto mt-3 max-w-xl text-[14px] leading-relaxed text-slate-500 sm:text-[15px]">
          Negocios con plan PRO en HomIA: aparecen primeros y como Recomendados cuando buscás materiales o proveedores.
        </p>
      </div>

      <div className={`homy-marquee mt-8 ${reduced ? 'is-reduced' : ''}`}>
        <div className="homy-marquee-track" style={{ '--homy-marquee-duration': `${duration}s` } as CSSProperties}>
          <ul ref={loopRef} className="flex shrink-0 gap-3 pr-3" aria-label="Proveedores sponsors">
            {renderItems('a')}
          </ul>
          {!reduced && (
            <ul className="flex shrink-0 gap-3 pr-3" aria-hidden="true">
              {renderItems('b')}
            </ul>
          )}
        </div>
      </div>
    </section>
  )
}

// Keyframes y estados de la cinta (scoped por clase; no dependen de globals.css).
const MARQUEE_CSS = `
.homy-marquee {
  position: relative;
  width: 100%;
  overflow: hidden;
  padding: 6px 0 10px;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%);
}
.homy-marquee-track {
  display: flex;
  width: max-content;
  animation: homy-marquee var(--homy-marquee-duration, 60s) linear infinite;
  will-change: transform;
}
.homy-marquee:hover .homy-marquee-track,
.homy-marquee:focus-within .homy-marquee-track {
  animation-play-state: paused;
}
@keyframes homy-marquee {
  from { transform: translate3d(0, 0, 0); }
  to { transform: translate3d(-50%, 0, 0); }
}
.homy-marquee.is-reduced {
  overflow-x: auto;
  scroll-snap-type: x proximity;
  -webkit-overflow-scrolling: touch;
  padding-left: 16px;
  padding-right: 16px;
  -webkit-mask-image: none;
          mask-image: none;
}
.homy-marquee.is-reduced .homy-marquee-track { animation: none; }
.homy-marquee.is-reduced li { scroll-snap-align: start; }
@media (prefers-reduced-motion: reduce) {
  .homy-marquee-track { animation: none; }
  .homy-marquee { overflow-x: auto; -webkit-mask-image: none; mask-image: none; }
}
`
