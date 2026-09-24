'use client'
// Grilla mensual liviana (sin librerías): semanas de lunes a domingo, hoy resaltado y
// navegación de mes. La usan el Calendario del profesional y la Disponibilidad del perfil
// público. Los días son "AAAA-MM-DD" (ver src/lib/schedule.ts): nada de zonas horarias acá.
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { addDays, weekday, type DayKey } from '@/lib/schedule'

const DOW = ['L', 'M', 'M', 'J', 'V', 'S', 'D']
const DOW_LARGO = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo']
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

/** "2026-09" → "septiembre 2026" */
export function monthLabel(month: string): string {
  const m = Number(month.slice(5, 7))
  return `${MESES[m - 1]} ${month.slice(0, 4)}`
}

export function shiftMonth(month: string, delta: number): string {
  const y = Number(month.slice(0, 4))
  const m = Number(month.slice(5, 7)) - 1 + delta
  const d = new Date(Date.UTC(y, m, 1, 12))
  return d.toISOString().slice(0, 7)
}

/** Primer y último día visibles de la grilla (semanas completas de lunes a domingo). */
export function gridBounds(month: string): { first: DayKey; last: DayKey; monthStart: DayKey; monthEnd: DayKey } {
  const monthStart = `${month}-01`
  const monthEnd = addDays(`${shiftMonth(month, 1)}-01`, -1)
  const lead = (weekday(monthStart) + 6) % 7 // lunes = 0
  const first = addDays(monthStart, -lead)
  const trail = 6 - ((weekday(monthEnd) + 6) % 7)
  const last = addDays(monthEnd, trail)
  return { first, last, monthStart, monthEnd }
}

export function MonthNav({
  month, onChange, min, max, className = '',
}: { month: string; onChange: (m: string) => void; min?: string; max?: string; className?: string }) {
  const prev = shiftMonth(month, -1)
  const next = shiftMonth(month, 1)
  const canPrev = !min || prev >= min
  const canNext = !max || next <= max
  return (
    <div className={`flex items-center justify-between gap-2 ${className}`}>
      <button
        type="button" onClick={() => canPrev && onChange(prev)} disabled={!canPrev}
        aria-label={`Mes anterior (${monthLabel(prev)})`}
        className="homy-focus homy-glass-soft grid size-11 shrink-0 place-items-center rounded-xl text-[#0A2540] transition hover:text-[#1D63B8] disabled:opacity-35"
      >
        <ChevronLeft className="size-5" aria-hidden />
      </button>
      <p className="min-w-0 truncate text-center text-base font-extrabold capitalize tracking-tight text-[#0A2540]" aria-live="polite">{monthLabel(month)}</p>
      <button
        type="button" onClick={() => canNext && onChange(next)} disabled={!canNext}
        aria-label={`Mes siguiente (${monthLabel(next)})`}
        className="homy-focus homy-glass-soft grid size-11 shrink-0 place-items-center rounded-xl text-[#0A2540] transition hover:text-[#1D63B8] disabled:opacity-35"
      >
        <ChevronRight className="size-5" aria-hidden />
      </button>
    </div>
  )
}

export default function MonthGrid({
  month, today, renderDay, dayLabel, cellClassName, numberClassName,
}: {
  month: string
  today: DayKey
  /** contenido extra de la celda (marcas, puntos, barras) */
  renderDay?: (day: DayKey, inMonth: boolean) => React.ReactNode
  /** texto accesible del día (ej. "ocupado") */
  dayLabel?: (day: DayKey) => string | null
  cellClassName?: (day: DayKey, inMonth: boolean) => string
  /** color del número del día (ej. blanco sobre un día ocupado) */
  numberClassName?: (day: DayKey) => string | null
}) {
  const { first, last, monthStart, monthEnd } = gridBounds(month)
  const days: DayKey[] = []
  for (let d = first; d <= last; d = addDays(d, 1)) days.push(d)
  return (
    <div role="grid" aria-label={`Calendario de ${monthLabel(month)}`} className="w-full">
      <div role="row" className="grid grid-cols-7 gap-1 pb-1">
        {DOW.map((d, i) => (
          <span key={i} role="columnheader" aria-label={DOW_LARGO[i]} className="text-center text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{d}</span>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {days.map((d) => {
          const inMonth = d >= monthStart && d <= monthEnd
          const isToday = d === today
          const extra = dayLabel?.(d)
          return (
            <div
              key={d}
              role="gridcell"
              aria-label={`${Number(d.slice(8, 10))} de ${MESES[Number(d.slice(5, 7)) - 1]}${isToday ? ', hoy' : ''}${extra ? `, ${extra}` : ''}`}
              className={`relative min-w-0 rounded-lg ${inMonth ? '' : 'opacity-40'} ${cellClassName?.(d, inMonth) || ''}`}
            >
              <span className={`mx-auto mt-1 grid size-6 place-items-center rounded-full text-[12px] font-bold tabular-nums ${isToday ? 'bg-[#FF5A1F] text-white shadow-sm' : numberClassName?.(d) || 'text-[#0A2540]'}`}>
                {Number(d.slice(8, 10))}
              </span>
              {renderDay?.(d, inMonth)}
            </div>
          )
        })}
      </div>
    </div>
  )
}
