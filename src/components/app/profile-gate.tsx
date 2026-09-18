'use client'
// Gate de acceso para perfiles y mensajes: "el detalle se ve con cuenta".
// Misma gramática visual que el AuthGate del app-root (vidrio + ambiente).
import { navigate } from '@/lib/router'
import { ShieldCheck, BadgeCheck, Sparkles, CornerDownRight, ArrowLeft } from 'lucide-react'

export function ProfileGate({ path, kind }: { path: string; kind?: string }) {
  const subject = kind === 'proveedor' ? 'este proveedor' : kind === 'profesional' ? 'este profesional' : 'esta persona'
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4 py-14">
      <div className="homy-glass relative w-full max-w-md overflow-hidden rounded-3xl">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 right-[-12%] size-60 rounded-full bg-ai/15 blur-3xl" />
          <div className="absolute -bottom-28 left-[-12%] size-60 rounded-full bg-action/10 blur-3xl" />
        </div>
        <div className="homy-stagger relative z-10 p-7 text-center sm:p-9">
          <span className="homy-icon-chip homy-chip-blue mx-auto size-14">
            <ShieldCheck className="size-7" aria-hidden />
          </span>
          <p className="homy-eyebrow mt-5">Acceso requerido</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-navy sm:text-[1.7rem]">
            Ingresá para ver {subject}
          </h2>
          <p className="mx-auto mt-2.5 max-w-sm text-sm leading-relaxed text-slate-500">
            Los perfiles con toda su experiencia, precios y contacto son para la comunidad de HomIA. Crear tu cuenta tarda menos de 1 minuto y es gratis.
          </p>
          <div className="mt-4 flex justify-center">
            <span className="homy-pill max-w-full">
              <CornerDownRight className="size-3.5 shrink-0 text-[#1D63B8]" aria-hidden />
              <span className="truncate font-mono text-[11px] font-semibold text-slate-600">{path}</span>
            </span>
          </div>
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              onClick={() => navigate(`/registrarse?volver=${encodeURIComponent(path)}`)}
              className="homy-btn-primary w-full px-6 py-3.5 text-[15px]"
            >
              Crear cuenta gratis
            </button>
            <button
              onClick={() => navigate(`/ingresar?volver=${encodeURIComponent(path)}`)}
              className="homy-btn-dark w-full px-6 py-3.5 text-[15px]"
            >
              Ya tengo cuenta
            </button>
            <button
              onClick={() => navigate('/directorio')}
              className="mx-auto mt-1 inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm font-semibold text-slate-500 hover:text-[#1D63B8] transition"
            >
              <ArrowLeft className="size-4" aria-hidden /> Ver el directorio completo
            </button>
          </div>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] font-bold text-slate-400" aria-label="Confianza HomIA">
            <li className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-[#1D63B8]" aria-hidden />Escrow</li>
            <li className="flex items-center gap-1.5"><BadgeCheck className="size-3.5 text-[#0e9f6e]" aria-hidden />Verificación</li>
            <li className="flex items-center gap-1.5"><Sparkles className="size-3.5 text-[#0092c4]" aria-hidden />IA</li>
          </ul>
        </div>
      </div>
    </div>
  )
}
