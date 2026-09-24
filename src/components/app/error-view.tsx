'use client'
// Vista amable de "Algo salió mal" (la usan src/app/error.tsx y src/app/global-error.tsx).
// Sin detalles técnicos: el detalle queda en la consola (console.error en cada página de error).
import { RotateCcw, House } from 'lucide-react'

export function ErrorView({ onRetry }: { onRetry: () => void }) {
  return (
    <main className="homy-page grid min-h-[100dvh] place-items-center px-4 py-10">
      <section className="homy-glass-strong w-full max-w-md rounded-[28px] p-6 text-center sm:p-8" role="alert" aria-live="assertive">
        <span className="homy-icon-chip homy-chip-orange mx-auto size-14 [&_svg]:size-7" aria-hidden>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M3 10.5 12 3l9 7.5" />
            <path d="M5 9.5V20a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V9.5" />
            <path d="M12 11v4" />
            <path d="M12 18h.01" />
          </svg>
        </span>
        <h1 className="mt-5 text-2xl font-extrabold tracking-tight text-[#0A2540]">Algo salió mal</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">
          Tuvimos un problema al mostrar esta pantalla. Probá de nuevo: si sigue pasando, volvé al inicio y entrá otra vez en un rato.
        </p>
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <button type="button" onClick={onRetry} className="homy-btn-primary homy-focus min-h-[48px] w-full px-5 text-[15px]">
            <RotateCcw className="size-4.5" aria-hidden /> Reintentar
          </button>
          <a href="/" className="homy-glass-soft homy-focus inline-flex min-h-[48px] w-full items-center justify-center gap-2 rounded-full px-5 text-[15px] font-bold text-[#1D63B8]">
            <House className="size-4.5" aria-hidden /> Ir al inicio
          </a>
        </div>
      </section>
    </main>
  )
}
