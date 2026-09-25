'use client'
// Shell premium compartido por Ingresar y Crear cuenta.
// Desktop: split-screen — panel de marca (vidrio nocturno) + formulario en vidrio.
// Mobile: apilado con marca compacta.
import { navigate } from '@/lib/router'
import { Homy, HomIAWordmark } from '@/components/homy/homy-character'
import { ArrowLeft, BadgeCheck, Recycle, ShieldCheck, Sparkles } from 'lucide-react'

const VALUE_PROPS = [
  {
    icon: Sparkles,
    title: 'Contalo como te salga',
    desc: 'Escribís qué pasó con tus palabras y Homy te dice qué hace falta, quién lo tiene y a qué precio.',
    tone: 'homy-chip-ai',
  },
  {
    icon: ShieldCheck,
    title: 'Pagás cuando está terminado',
    desc: 'Por Mercado Pago o en efectivo, sin adelantos. La plata va directo a quien hizo el trabajo.',
    tone: 'homy-chip-blue',
  },
  {
    icon: BadgeCheck,
    title: 'Sabés a quién le abrís la puerta',
    desc: 'Ves si validó su DNI, sus estrellas y las reseñas con fotos de otros clientes.',
    tone: 'homy-chip-mint',
  },
]

export function AuthShell({
  headline,
  sub,
  children,
  homyState = 'happy',
}: {
  headline: React.ReactNode
  sub: string
  children: React.ReactNode
  homyState?: 'happy' | 'thinking' | 'idle' | 'listening'
}) {
  return (
    <div className="homy-screen min-h-screen w-full lg:grid lg:grid-cols-[1.05fr_1fr]">
      {/* Panel de marca (desktop): fijo a la altura de la pantalla, no se mueve nunca; solo scrollea
          el lado del formulario (antes crecía con la página y el titular bajaba al pasar de paso) */}
      <aside className="relative hidden overflow-hidden p-10 xl:p-14 lg:sticky lg:top-0 lg:flex lg:h-screen lg:flex-col lg:justify-between lg:self-start homy-glass-dark rounded-none border-0 border-r border-white/8">
        {/* decoración */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-32 -right-24 size-[420px] rounded-full bg-ai/10 blur-3xl" />
          <div className="absolute -bottom-40 -left-20 size-[380px] rounded-full bg-action/10 blur-3xl" />
          <span className="animate-float-slow absolute left-[16%] top-[24%] size-2 rounded-full bg-ai/40" />
          <span className="animate-float absolute right-[22%] top-[52%] size-1.5 rounded-full bg-gold/50 [animation-delay:1.4s]" />
        </div>

        <button onClick={() => navigate('/')} className="relative z-10 flex w-fit items-center gap-2.5 transition-opacity hover:opacity-85">
          <Homy size={44} state={homyState} />
          <HomIAWordmark className="text-2xl text-white" />
        </button>

        <div className="relative z-10 max-w-lg">
          <h2 className="text-balance text-4xl font-extrabold leading-[1.1] tracking-tight text-white xl:text-[2.9rem]">
            {headline}
          </h2>
          <p className="mt-4 text-[15px] leading-relaxed text-white/60">{sub}</p>

          <ul className="mt-10 space-y-5">
            {VALUE_PROPS.map((p) => (
              <li key={p.title} className="flex items-start gap-3.5">
                <span className={`homy-icon-chip size-10 shrink-0 ${p.tone} !rounded-xl`}>
                  <p.icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="text-[15px] font-bold text-white">{p.title}</p>
                  <p className="mt-0.5 text-[13.5px] leading-relaxed text-white/55">{p.desc}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="relative z-10 flex items-center gap-3 text-[13px] font-semibold text-white/50">
          <Recycle className="size-4 text-ai" aria-hidden />
          ¿Te sobró material? Se lo devolvés a quien te lo vendió y te reintegran la plata.
        </div>
      </aside>

      {/* Lado del formulario */}
      <main className="relative flex min-h-screen flex-col items-center justify-center px-4 py-10 sm:px-8">
        <button
          onClick={() => navigate('/')}
          className="absolute left-4 top-5 inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[13px] font-semibold text-navy/55 transition-colors hover:text-navy sm:left-6"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Volver al inicio
        </button>

        {/* Marca compacta (mobile) */}
        <div className="mb-8 flex items-center gap-2.5 lg:hidden">
          <Homy size={46} state={homyState} />
          <HomIAWordmark className="text-[1.7rem]" />
        </div>

        <div className="w-full max-w-[30rem]">{children}</div>
      </main>
    </div>
  )
}
