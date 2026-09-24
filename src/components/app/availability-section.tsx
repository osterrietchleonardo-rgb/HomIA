'use client'
// "Disponibilidad" del perfil público del profesional (D21): días ocupados (fechas acordadas)
// y por confirmar (propuestas) de los próximos 3 meses. Solo rangos anónimos: nunca qué
// trabajo es, para quién ni dónde (lo garantiza el endpoint, que no manda esos datos).
import { useEffect, useState } from 'react'
import { CalendarDays, CalendarCheck2, CalendarClock } from 'lucide-react'
import MonthGrid, { MonthNav } from '@/components/app/month-grid'
import { dayInRanges, shortDay, type BusyRange } from '@/lib/schedule'

type Availability = {
  today: string; from: string; to: string
  ranges: BusyRange[]
  proximaFechaLibre: string | null
  disponibleEstaSemana: boolean
}

export default function AvailabilitySection({ professionalId }: { professionalId: string }) {
  const [data, setData] = useState<Availability | null>(null)
  const [error, setError] = useState(false)
  const [month, setMonth] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/profiles/professional/${professionalId}/availability`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Availability) => { if (alive) { setData(d); setMonth(d.today.slice(0, 7)) } })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [professionalId])

  if (error) return null // sin datos no se inventa disponibilidad
  const ocupados = data?.ranges.filter((r) => r.estado === 'ocupado') || []
  const porConfirmar = data?.ranges.filter((r) => r.estado === 'por_confirmar') || []

  return (
    <section aria-labelledby="disponibilidad-titulo" data-testid="availability-section">
      <div className="homy-section-head">
        <h2 id="disponibilidad-titulo" className="homy-section-title">
          <span className="homy-icon-chip homy-chip-mint size-9 shrink-0 [&_svg]:size-[18px]" aria-hidden><CalendarDays /></span>
          Disponibilidad
        </h2>
        {data && (
          data.disponibleEstaSemana ? (
            <span className="homy-pill text-emerald-700"><CalendarCheck2 className="size-3.5" aria-hidden /> Disponible esta semana</span>
          ) : data.proximaFechaLibre ? (
            <span className="homy-pill"><CalendarClock className="size-3.5" aria-hidden /> Próxima fecha libre: {shortDay(data.proximaFechaLibre)}</span>
          ) : (
            <span className="homy-pill">Sin días libres en los próximos meses</span>
          )
        )}
      </div>
      <div className="homy-glass rounded-3xl p-3 sm:p-5">
        {!data || !month ? (
          <p className="py-8 text-center text-sm text-slate-400">Cargando disponibilidad…</p>
        ) : (
          <>
            <MonthNav month={month} onChange={setMonth} min={data.today.slice(0, 7)} max={data.to.slice(0, 7)} className="mb-3" />
            <MonthGrid
              month={month}
              today={data.today}
              dayLabel={(d) => dayInRanges(d, ocupados) ? 'ocupado' : dayInRanges(d, porConfirmar) ? 'por confirmar' : d >= data.today && d <= data.to ? 'libre' : null}
              numberClassName={(d) => (dayInRanges(d, ocupados) ? 'text-white' : null)}
              cellClassName={(d) => {
                const base = 'min-h-[40px] sm:min-h-[48px] pb-1'
                if (dayInRanges(d, ocupados)) return `${base} bg-[#0A2540]/85`
                if (dayInRanges(d, porConfirmar)) return `${base} border border-dashed border-amber-500 bg-amber-50`
                // fuera de la ventana consultada no se sabe: sin color (no se promete "libre")
                return `${base} ${d >= data.today && d <= data.to ? 'bg-emerald-50/60' : ''}`
              }}
            />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1.5"><i className="block size-3 rounded bg-[#0A2540]/85" aria-hidden /> Ocupado</span>
              <span className="inline-flex items-center gap-1.5"><i className="block size-3 rounded border border-dashed border-amber-500 bg-amber-50" aria-hidden /> Por confirmar</span>
              <span className="inline-flex items-center gap-1.5"><i className="block size-3 rounded bg-emerald-50 ring-1 ring-emerald-200" aria-hidden /> Libre</span>
            </div>
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Sale de su calendario en HomIA. Es orientativa: la fecha de tu trabajo la acuerdan en el proyecto después de aprobar el presupuesto. Los detalles de cada trabajo son privados.
            </p>
          </>
        )}
      </div>
    </section>
  )
}
