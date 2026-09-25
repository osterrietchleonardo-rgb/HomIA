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
//  · cada sponsor aparece UNA vez por vuelta: cada copia ocupa al menos el ancho
//    de la pantalla (los ítems se reparten), así nunca se ve el mismo dos veces a la vez;
//  · banda azul oscuro que contrasta con la home; logo y marca sutiles.
//  · 0 sponsors → la sección no existe.
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { Link } from '@/lib/router'
import { ShieldCheck } from 'lucide-react'

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

function initials(name: string) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase() || '').join('') || 'H'
}

/** Ítem de la cinta: logo + marca (+ frase en desktop). También lo usa la vista
 *  previa de "Tu marca en la home" en el perfil del proveedor. */
export function SponsorChip({ s, showTagline = 'desktop' }: { s: Sponsor; showTagline?: 'desktop' | 'always' }) {
  return (
    <span className="group/chip flex items-center gap-3 px-2 py-1 opacity-80 transition-opacity duration-300 hover:opacity-100">
      <span className="grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-lg bg-white/95 ring-1 ring-white/10">
        {s.logoUrl ? (
          <img src={s.logoUrl} alt="" loading="lazy" draggable={false} className="max-h-full max-w-full object-contain p-1" />
        ) : (
          <span className="text-[13px] font-bold text-[#0A2540]" style={{ color: s.color || undefined }}>{initials(s.businessName)}</span>
        )}
      </span>
      <span className="min-w-0 text-left">
        <span className="flex items-center gap-1">
          <span className="whitespace-nowrap text-[14px] font-medium tracking-wide text-white/85">{s.businessName}</span>
          {s.verified && <ShieldCheck className="size-3.5 shrink-0 text-emerald-300/80" aria-label="Identidad verificada" />}
        </span>
        {s.tagline ? (
          <span className={`${showTagline === 'always' ? 'block' : 'hidden lg:block'} max-w-[240px] truncate text-[11.5px] font-light leading-snug text-white/50`}>{s.tagline}</span>
        ) : null}
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

  // una "vuelta" de la cinta = cada sponsor UNA vez (sin repetir para llenar)
  const loop = useMemo(() => sponsors ?? [], [sponsors])

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
          className="homy-focus block rounded-xl focus-visible:ring-white/60"
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
          Negocios con plan PRO en HomIA: aparecen primero, como Recomendados, cuando buscás materiales o proveedores.
        </p>
      </div>

      <div className={`homy-marquee mt-8 bg-[#0A2540] ${reduced ? 'is-reduced' : ''}`}>
        <div className="homy-marquee-track" style={{ '--homy-marquee-duration': `${duration}s` } as CSSProperties}>
          <ul ref={loopRef} className="homy-marquee-copy flex shrink-0 items-center gap-10 px-5" aria-label="Proveedores sponsors">
            {renderItems('a')}
          </ul>
          {!reduced && (
            <ul className="homy-marquee-copy flex shrink-0 items-center gap-10 px-5" aria-hidden="true">
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
  padding: 18px 0;
  -webkit-mask-image: linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%);
          mask-image: linear-gradient(90deg, transparent 0, #000 6%, #000 94%, transparent 100%);
}
/* cada copia ocupa al menos el ancho de la pantalla: un sponsor por vuelta,
   nunca dos veces a la vez; con pocos, se reparten a lo ancho */
.homy-marquee-copy { min-width: calc(100vw + 20rem); justify-content: space-around; }
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
.homy-marquee.is-reduced .homy-marquee-copy { min-width: 0; }
.homy-marquee.is-reduced li { scroll-snap-align: start; }
@media (prefers-reduced-motion: reduce) {
  .homy-marquee-track { animation: none; }
  .homy-marquee { overflow-x: auto; -webkit-mask-image: none; mask-image: none; }
}
`
