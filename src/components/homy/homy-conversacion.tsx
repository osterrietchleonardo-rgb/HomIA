'use client'
// Conversación con el súper agente Homy (la usan el botón flotante de la home y
// la mascota del panel). Streaming: pasos en vivo, texto que se escribe, tarjetas.
import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Loader2, RotateCcw, Send } from 'lucide-react'
import { Homy } from '@/components/homy/homy-character'
import { AccionesHomy, TarjetasHomy } from '@/components/homy/homy-tarjetas'
import { rutaActual, useHomy, type OpcionesPregunta, type Turno } from '@/components/homy/homy-store'
import { navigate } from '@/lib/router'
import { useLocation } from '@/lib/store'
import { cn } from '@/lib/utils'

type Props = {
  puerta: OpcionesPregunta['puerta']
  rolPanel?: OpcionesPregunta['rolPanel']
  bienvenida: string
  sugerenciasIniciales: string[]
  onNavegar?: () => void
  /** foco al input al montar (al abrir el panel) */
  autoFocus?: boolean
}

function Burbuja({ t, ultima, onSugerencia, onNavegar }: { t: Turno; ultima: boolean; onSugerencia: (s: string) => void; onNavegar?: () => void }) {
  if (t.rol === 'user') {
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-3xl rounded-br-lg bg-[#0A2540] px-4 py-2.5 text-[14px] font-medium leading-relaxed text-white shadow-md">{t.texto}</p>
      </div>
    )
  }
  const pensando = t.estado === 'streaming' && !t.texto
  return (
    <div className="flex flex-col items-start" data-homy-turno={t.estado}>
      <div className="w-full max-w-[94%] rounded-3xl rounded-bl-lg border border-[#0A2540]/8 bg-white px-4 py-3 text-[14px] leading-relaxed text-[#0A2540]/90 shadow-sm">
        {t.estado === 'streaming' && (t.pasos?.length ?? 0) > 0 && (
          <ul className="mb-1.5 space-y-0.5" aria-hidden>
            {t.pasos!.slice(-3).map((p, i, arr) => (
              <li key={`${p}-${i}`} className="flex items-center gap-1.5 text-[12px] font-semibold text-slate-500">
                {i === arr.length - 1 && pensando ? <Loader2 className="size-3 animate-spin text-[#00C4FF]" /> : <span className="size-1.5 rounded-full bg-[#00C4FF]" />}
                {p}
              </li>
            ))}
          </ul>
        )}
        {pensando && !(t.pasos?.length) && (
          <span className="flex items-center gap-2 text-[12.5px] font-semibold text-slate-500">
            <span className="flex gap-1" aria-hidden>
              {[0, 1, 2].map((i) => <span key={i} className="size-2 animate-dot-bounce rounded-full bg-[#00C4FF]" style={{ animationDelay: `${i * 0.16}s` }} />)}
            </span>
            Pensando…
          </span>
        )}
        {t.texto && <p className="whitespace-pre-line">{t.texto}{t.estado === 'streaming' && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-[#00C4FF] align-middle" aria-hidden />}</p>}
        {t.pregunta && t.estado === 'listo' && !t.texto.includes(t.pregunta) && <p className="mt-2 font-bold text-[#0A2540]">{t.pregunta}</p>}
        {t.degradado && <p className="mt-1.5 text-[11px] text-slate-400">Respuesta armada sin IA (búsqueda directa en HomIA).</p>}
        {t.tarjetas && <TarjetasHomy tarjetas={t.tarjetas} onNavegar={onNavegar} />}
        {t.acciones && <AccionesHomy acciones={t.acciones} onNavegar={onNavegar} />}
      </div>
      {ultima && t.estado === 'listo' && (t.sugerencias?.length ?? 0) > 0 && (
        <div className="mt-2 flex max-w-[94%] flex-wrap gap-1.5">
          {t.sugerencias!.map((s) => (
            <button key={s} type="button" onClick={() => onSugerencia(s)}
              className="homy-focus rounded-full border border-[#1D63B8]/20 bg-white/85 px-3 py-1.5 text-[12px] font-semibold text-[#1D63B8] transition hover:border-[#1D63B8]/45 active:scale-[0.97]">
              {s}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

export function HomyConversacion({ puerta, rolPanel, bienvenida, sugerenciasIniciales, onNavegar, autoFocus }: Props) {
  const { turnos, ocupado, cupo, preguntar, cargarHistorial, nuevaConversacion } = useHomy()
  const location = useLocation()
  const [texto, setTexto] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => { void cargarHistorial() }, [cargarHistorial])
  useEffect(() => { if (autoFocus) inputRef.current?.focus() }, [autoFocus])
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: 'smooth' })
  }, [turnos])

  const enviar = (t: string) => {
    if (!t.trim() || ocupado) return
    setTexto('')
    void preguntar(t, { puerta, rolPanel, pagina: rutaActual(), lat: location.lat, lng: location.lng })
  }
  const onSubmit = (e: FormEvent) => { e.preventDefault(); enviar(texto) }

  const ultimoHomy = [...turnos].reverse().find((t) => t.rol === 'homy')
  const anuncio = ultimoHomy
    ? ultimoHomy.estado === 'streaming'
      ? ultimoHomy.pasos?.[ultimoHomy.pasos.length - 1] || 'Homy está pensando'
      : ultimoHomy.texto
    : ''
  const pocas = cupo && cupo.restantes > 0 && cupo.restantes <= 3

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div ref={scrollRef} role="log" aria-label="Conversación con Homy" aria-busy={ocupado} className="homy-scroll min-h-0 flex-1 space-y-3 overflow-y-auto px-3.5 py-3.5">
        {turnos.length === 0 && (
          <div className="flex flex-col items-start gap-2.5">
            <div className="flex items-start gap-2">
              <Homy size={34} state="idle" />
              <p className="max-w-[88%] rounded-3xl rounded-tl-lg border border-[#0A2540]/8 bg-white px-4 py-3 text-[14px] leading-relaxed text-[#0A2540]/90 shadow-sm">{bienvenida}</p>
            </div>
            <div className="flex flex-wrap gap-1.5 pl-1">
              {sugerenciasIniciales.map((s) => (
                <button key={s} type="button" onClick={() => enviar(s)}
                  className="homy-focus rounded-full border border-[#1D63B8]/20 bg-white/85 px-3 py-1.5 text-[12px] font-semibold text-[#1D63B8] transition hover:border-[#1D63B8]/45 active:scale-[0.97]">
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {turnos.map((t) => (
          <Burbuja key={t.id} t={t} ultima={t === ultimoHomy} onSugerencia={enviar} onNavegar={onNavegar} />
        ))}
      </div>
      <p className="sr-only" aria-live="polite">{anuncio}</p>

      <div className="border-t border-[#0A2540]/8 bg-white/70 p-2.5">
        {pocas && (
          <p className="mb-2 rounded-xl bg-[#FF5A1F]/8 px-3 py-1.5 text-[11.5px] font-semibold text-[#9a3412]" data-homy-cupo>
            Te queda{cupo!.restantes === 1 ? '' : 'n'} {cupo!.restantes} consulta{cupo!.restantes === 1 ? '' : 's'} hoy
            {cupo!.tipo === 'visitante' ? (
              <>
                {' '}sin cuenta.{' '}
                <button type="button" onClick={() => { onNavegar?.(); navigate(`/registrarse?volver=${encodeURIComponent(rutaActual())}`) }} className="font-extrabold underline">
                  Creá tu cuenta gratis
                </button>{' '}y tenés 60 por día.
              </>
            ) : '.'}
          </p>
        )}
        <form onSubmit={onSubmit} className="flex items-center gap-2 rounded-full border border-[#0A2540]/12 bg-white py-1.5 pl-4 pr-1.5 focus-within:border-[#1D63B8]/45">
          <input
            ref={inputRef}
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            placeholder="Escribile a Homy…"
            aria-label="Mensaje para Homy"
            maxLength={600}
            className="h-9 min-w-0 flex-1 bg-transparent text-[14px] text-[#0A2540] outline-none placeholder:text-slate-400"
          />
          {turnos.length > 0 && !ocupado && (
            <button type="button" onClick={nuevaConversacion} aria-label="Empezar una conversación nueva" title="Conversación nueva"
              className="homy-focus grid size-9 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-slate-100 hover:text-[#0A2540]">
              <RotateCcw className="size-4" aria-hidden />
            </button>
          )}
          <button type="submit" disabled={ocupado || texto.trim().length < 2} aria-label="Enviar mensaje"
            className={cn('homy-focus grid size-9 shrink-0 place-items-center rounded-full bg-[#FF5A1F] text-white transition hover:brightness-110 active:scale-95 disabled:opacity-40')}>
            {ocupado ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
          </button>
        </form>
      </div>
    </div>
  )
}
