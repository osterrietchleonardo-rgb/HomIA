'use client'
// Finanzas (D24): piezas compartidas de la pantalla (montos que reflowean, "¿Qué es esto?",
// botón "?" con la explicación, etiqueta de automático) y el tipo de la respuesta de la API.
import { useState } from 'react'
import { ChevronDown, HelpCircle, Sparkles } from 'lucide-react'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { concepto } from '@/lib/finanzas/conceptos'
import type { Reporte, MovVista } from '@/lib/finanzas/calculos'
import type { LineaStock } from '@/lib/finanzas/calculos'

export type Rol = 'profesional' | 'proveedor'

export type DatosFinanzas = {
  rol: Rol
  hoy: string
  reporte: Reporte
  movimientos: MovVista[]
  config: { saldoInicial: number | null; fechaSaldoInicial: string | null; costoEstimadoPct: number | null; primerUsoHecho: boolean }
  obras: { id: string; title: string; status: string }[]
  stock: LineaStock[]
  sugerenciaSuscripcion: { plan: 'basic' | 'pro'; monto: number } | null
  cantidadMovimientosManuales: number
}

/** "$ 1.234.567" con signo menos tipográfico; nunca NaN. */
export function ars(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  const s = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(Math.abs(Math.round(n)))
  return n < -0.5 ? `−${s}` : s
}
export function pctTxt(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`
}
export function numTxt(n: number | null | undefined, sufijo = ''): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—'
  return `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })}${sufijo}`
}
export function fechaTxt(iso: string | null | undefined): string {
  if (!iso) return '—'
  const [y, m, d] = iso.slice(0, 10).split('-')
  return `${d}/${m}/${y}`
}

/** Explicación del glosario detrás de un "?" (toque en el celu, clic en escritorio). */
export function Ayuda({ id, texto, titulo, className = '' }: { id?: string; texto?: string; titulo?: string; className?: string }) {
  const c = id ? concepto(id) : undefined
  const nombre = titulo || c?.nombre || 'Qué es esto'
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`¿Qué es ${nombre}?`}
          className={`homy-focus inline-grid size-7 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-[#1D63B8]/10 hover:text-[#1D63B8] ${className}`}>
          <HelpCircle className="size-4" aria-hidden />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-[min(20rem,calc(100vw-2rem))] text-[13px] leading-relaxed text-slate-600">
        <p className="font-extrabold text-[#0A2540]">{nombre}</p>
        {texto ? <p className="mt-1">{texto}</p> : null}
        {c && <p className="mt-1">{c.queEs}</p>}
        {c?.comoSeCalcula && <p className="mt-1.5"><b className="font-bold text-[#0A2540]">Cómo se calcula:</b> {c.comoSeCalcula}</p>}
        {c?.queHacer && <p className="mt-1.5"><b className="font-bold text-[#0A2540]">Qué hacer:</b> {c.queHacer}</p>}
      </PopoverContent>
    </Popover>
  )
}

/** Renglón desplegable: "¿Qué es esto?" con la explicación y la cuenta hecha con los números reales. */
export function QueEs({ id, cuenta, abierto = false }: { id: string; cuenta?: string; abierto?: boolean }) {
  const [open, setOpen] = useState(abierto)
  const c = concepto(id)
  if (!c) return null
  return (
    <div className="mt-1">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="homy-focus inline-flex min-h-[32px] items-center gap-1 rounded-lg text-xs font-bold text-[#1D63B8] hover:underline">
        ¿Qué es esto? <ChevronDown className={`size-3.5 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
      </button>
      {open && (
        <div className="mt-1 space-y-1.5 rounded-xl bg-[#1D63B8]/6 px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-600">
          <p>{c.queEs}</p>
          {cuenta && <p className="rounded-lg bg-white/70 px-2.5 py-1.5 font-semibold text-[#0A2540] [overflow-wrap:anywhere]">Tu cuenta: {cuenta}</p>}
          {c.queHacer && <p><b className="font-bold text-[#0A2540]">Qué hacer:</b> {c.queHacer}</p>}
        </div>
      )}
    </div>
  )
}

export function Automatico() {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-[#00C4FF]/12 px-2 py-0.5 text-[10.5px] font-extrabold text-[#0078a8]">
      <Sparkles className="size-3" aria-hidden /> Automático · viene de HomIA
    </span>
  )
}

/** Tarjeta de cifra: el número se achica para entrar (no parte ni desborda). */
export function Cifra({ label, valor, sub, tono = 'text-[#0A2540]', ayuda }: { label: string; valor: string; sub?: React.ReactNode; tono?: string; ayuda?: string }) {
  return (
    <div className="homy-glass homy-num-cell rounded-2xl p-4">
      <p className="flex items-start justify-between gap-1 text-[0.68rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">
        <span className="min-w-0 pt-1.5">{label}</span>
        {ayuda && <Ayuda id={ayuda} className="-mr-1.5 -mt-0.5" />}
      </p>
      <p className={`mt-1 font-extrabold leading-tight ${tono}`}>
        <span className="homy-num-adapt" style={{ fontSize: 'clamp(1.05rem, 11cqw, 1.7rem)' }}>{valor}</span>
      </p>
      {sub && <div className="mt-1 text-xs leading-snug text-slate-500">{sub}</div>}
    </div>
  )
}

/** Renglón de un estado: concepto a la izquierda, monto a la derecha; si no entra, el monto baja de renglón. */
export function Renglon({ label, monto, fuerte = false, signo, children, ayuda }: {
  label: React.ReactNode; monto: number; fuerte?: boolean; signo?: '+' | '−' | '='; children?: React.ReactNode; ayuda?: string
}) {
  return (
    <div className={`py-2.5 ${fuerte ? 'border-t border-[#0A2540]/10' : ''}`}>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
        <span className={`flex min-w-0 items-center gap-1 ${fuerte ? 'font-extrabold text-[#0A2540]' : 'text-[14px] font-semibold text-slate-600'}`}>
          {signo && <span className="w-3 shrink-0 text-center text-slate-400" aria-hidden>{signo}</span>}
          <span className="min-w-0">{label}</span>
          {ayuda && <Ayuda id={ayuda} />}
        </span>
        <span className={`homy-num ml-auto ${fuerte ? 'text-[17px] font-extrabold' : 'text-[15px] font-bold'} ${monto < -0.5 ? 'text-[#c2410c]' : 'text-[#0A2540]'}`}>{ars(monto)}</span>
      </div>
      {children}
    </div>
  )
}
