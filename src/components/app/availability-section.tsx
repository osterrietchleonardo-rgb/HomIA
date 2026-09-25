'use client'
// "Disponibilidad" del perfil público del profesional (D21 + horarios D23): por día, "Libre",
// "Con lugar" (tiene trabajos pero le quedan horas dentro de su jornada) o "Completo", de los
// próximos 3 meses. Al tocar un día: las franjas ocupadas y las libres. Solo franjas anónimas y
// unidas: nunca qué trabajo es, para quién ni dónde (lo garantiza el endpoint, que no manda esos datos).
import { useEffect, useMemo, useState } from 'react'
import { CalendarDays, CalendarCheck2, CalendarClock } from 'lucide-react'
import MonthGrid, { MonthNav } from '@/components/app/month-grid'
import { longDay, shortDay, type DayInterval, type DayKey, type FreeSlot, type Jornada } from '@/lib/schedule'

type Dia = { dia: DayKey; estado: 'con_lugar' | 'completo'; franjas: DayInterval[]; libres: FreeSlot[] }
type Availability = {
  today: string; from: string; to: string
  jornada: Jornada
  dias: Dia[]
  proximoDiaConLugar: string | null
  disponibleEstaSemana: boolean
}

const franjaTxt = (f: { desde: string; hasta: string }) => (f.desde === '00:00' && f.hasta === '24:00' ? 'Todo el día' : `${f.desde}–${f.hasta}`)

export default function AvailabilitySection({ professionalId }: { professionalId: string }) {
  const [data, setData] = useState<Availability | null>(null)
  const [error, setError] = useState(false)
  const [month, setMonth] = useState<string | null>(null)
  const [selected, setSelected] = useState<DayKey | null>(null)

  useEffect(() => {
    let alive = true
    fetch(`/api/profiles/professional/${professionalId}/availability`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: Availability) => { if (alive) { setData(d); setMonth(d.today.slice(0, 7)) } })
      .catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [professionalId])

  const byDay = useMemo(() => new Map((data?.dias || []).map((d) => [d.dia, d])), [data])
  if (error) return null // sin datos no se inventa disponibilidad
  const enVentana = (d: DayKey) => !!data && d >= data.today && d <= data.to
  const soloPorConfirmar = (d: Dia) => d.franjas.every((f) => f.estado === 'por_confirmar')
  const sel = selected ? byDay.get(selected) : undefined

  return (
    <section aria-labelledby="disponibilidad-titulo" data-testid="availability-section">
      <div className="homy-section-head">
        <h2 id="disponibilidad-titulo" className="homy-section-title">
          <span className="homy-icon-chip homy-chip-mint size-9 shrink-0 [&_svg]:size-[18px]" aria-hidden><CalendarDays /></span>
          Disponibilidad
        </h2>
        {data && (
          data.disponibleEstaSemana ? (
            <span className="homy-pill text-emerald-700"><CalendarCheck2 className="size-3.5" aria-hidden /> Con lugar esta semana</span>
          ) : data.proximoDiaConLugar ? (
            <span className="homy-pill"><CalendarClock className="size-3.5" aria-hidden /> Próximo día con lugar: {shortDay(data.proximoDiaConLugar)}</span>
          ) : (
            <span className="homy-pill">Sin días con lugar en los próximos meses</span>
          )
        )}
      </div>
      <div className="homy-glass rounded-3xl p-3 sm:p-5">
        {!data || !month ? (
          <p className="py-8 text-center text-sm text-slate-400">Cargando disponibilidad…</p>
        ) : (
          <>
            <MonthNav month={month} onChange={(m) => { setMonth(m); setSelected(null) }} min={data.today.slice(0, 7)} max={data.to.slice(0, 7)} className="mb-3" />
            <MonthGrid
              month={month}
              today={data.today}
              dayLabel={(d) => {
                const x = byDay.get(d)
                if (x) return x.estado === 'completo' ? 'completo' : soloPorConfirmar(x) ? 'con lugar, por confirmar' : 'con lugar'
                return enVentana(d) ? 'libre' : null
              }}
              numberClassName={(d) => (byDay.get(d)?.estado === 'completo' ? 'text-white' : null)}
              cellClassName={(d) => {
                const base = `min-h-[40px] sm:min-h-[48px] pb-1 ${selected === d ? 'ring-2 ring-[#1D63B8]' : ''}`
                const x = byDay.get(d)
                if (x?.estado === 'completo') return `${base} ${soloPorConfirmar(x) ? 'bg-amber-600/80' : 'bg-[#0A2540]/85'}`
                if (x) return `${base} ${soloPorConfirmar(x) ? 'border border-dashed border-amber-500 bg-amber-50' : 'bg-sky-100'}`
                // fuera de la ventana consultada no se sabe: sin color (no se promete "libre")
                return `${base} ${enVentana(d) ? 'bg-emerald-50/60' : ''}`
              }}
              renderDay={(d) => enVentana(d) ? (
                <button
                  type="button"
                  onClick={() => setSelected(selected === d ? null : d)}
                  aria-label={`Ver los horarios del ${longDay(d)}`}
                  className="homy-focus absolute inset-0 rounded-lg"
                  data-testid={`av-day-${d}`}
                >
                  {byDay.get(d)?.estado === 'con_lugar' && <span className="absolute inset-x-2 bottom-1 block h-1 rounded-full bg-sky-500/70" aria-hidden />}
                </button>
              ) : null}
            />
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] font-semibold text-slate-500">
              <span className="inline-flex items-center gap-1.5"><i className="block size-3 rounded bg-[#0A2540]/85" aria-hidden /> Completo</span>
              <span className="inline-flex items-center gap-1.5"><i className="block size-3 rounded bg-sky-100 ring-1 ring-sky-300" aria-hidden /> Con lugar</span>
              <span className="inline-flex items-center gap-1.5"><i className="block size-3 rounded border border-dashed border-amber-500 bg-amber-50" aria-hidden /> Por confirmar</span>
              <span className="inline-flex items-center gap-1.5"><i className="block size-3 rounded bg-emerald-50 ring-1 ring-emerald-200" aria-hidden /> Libre</span>
            </div>

            {/* horarios del día elegido */}
            {selected && (
              <div className="mt-4 border-t border-[#0A2540]/8 pt-3" aria-live="polite" data-testid="av-day-panel">
                <p className="text-sm font-extrabold capitalize text-[#0A2540]">
                  {longDay(selected)} · <span className="normal-case">{sel ? (sel.estado === 'completo' ? 'Completo' : 'Con lugar') : 'Libre'}</span>
                </p>
                {!sel ? (
                  <p className="mt-1 text-sm text-slate-500">No tiene trabajos agendados: libre en su jornada ({data.jornada.desde} a {data.jornada.hasta}).</p>
                ) : (
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Ocupado</p>
                      <ul className="mt-1 grid gap-1">
                        {sel.franjas.map((f) => (
                          <li key={`${f.estado}-${f.desde}`} className={`rounded-lg px-3 py-1.5 text-sm font-bold tabular-nums ${f.estado === 'ocupado' ? 'bg-[#0A2540]/85 text-white' : 'border border-dashed border-amber-500 bg-amber-50 text-amber-900'}`}>
                            {franjaTxt(f)}{f.estado === 'por_confirmar' ? ' · por confirmar' : ''}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="min-w-0">
                      <p className="text-[11px] font-extrabold uppercase tracking-[0.1em] text-slate-500">Libre en su jornada</p>
                      {sel.libres.length === 0 ? (
                        <p className="mt-1 text-sm text-slate-500">No le quedan horas libres ese día.</p>
                      ) : (
                        <ul className="mt-1 grid gap-1">
                          {sel.libres.map((l) => (
                            <li key={l.desde} className="rounded-lg bg-emerald-50 px-3 py-1.5 text-sm font-bold tabular-nums text-emerald-800 ring-1 ring-emerald-200">{l.desde}–{l.hasta}</li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}
            <p className="mt-3 text-xs leading-relaxed text-slate-500">
              Sale de su calendario en HomIA. “Completo” = no le quedan horas libres en su jornada ({data.jornada.desde} a {data.jornada.hasta}). Tocá un día para ver sus horarios. Es orientativa: el día y el horario de tu trabajo los acuerdan en el proyecto después de aprobar el presupuesto. Los detalles de cada trabajo son privados.
            </p>
          </>
        )}
      </div>
    </section>
  )
}
