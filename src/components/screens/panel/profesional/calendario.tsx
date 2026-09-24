'use client'
// Calendario del profesional (D21): sus trabajos por fecha (acordados en sólido, propuestos
// punteados), días libres vs. ocupados del mes, próximos trabajos y proyectos con presupuesto
// aprobado que todavía no tienen fechas. Las fechas se acuerdan en el detalle de cada proyecto.
import { useEffect, useMemo, useState } from 'react'
import { navigate } from '@/lib/router'
import { Loading } from '@/components/app/ui-bits'
import MonthGrid, { MonthNav, gridBounds } from '@/components/app/month-grid'
import { addDays, dayInRanges, diffDays, longDay, todayKey, type BusyRange, type DayKey } from '@/lib/schedule'
import {
  CalendarDays, CalendarCheck2, CalendarClock, CalendarPlus, ArrowRight, RefreshCcw, BellRing, Sun,
} from 'lucide-react'

type CalProject = {
  id: string; title: string; stage: string; status: string; clientName: string
  schedule: { status: 'propuesta' | 'acordada' | null; proposedBy: 'profesional' | 'cliente' | null; startDate: string | null; endDate: string | null; prevStartDate: string | null; prevEndDate: string | null }
  ranges: BusyRange[]
}
type SinFecha = { id: string; title: string; stage: string; clientName: string; rechazadaPor: string | null; motivo: string | null }
type CalData = { from: string; to: string; today: string; projects: CalProject[]; sinFecha: SinFecha[]; pendientes: number }

const STAGE_LABEL: Record<string, string> = { presupuesto: 'Presupuesto', materiales: 'Materiales', ejecucion: 'Ejecución', revision: 'Revisión', finalizado: 'Finalizado' }
const NET_ERROR = 'No pudimos conectar con HomIA. Revisá tu conexión y probá de nuevo.'

async function fetchCal(from: string, to: string): Promise<CalData> {
  const res = await fetch(`/api/professional/calendar?from=${from}&to=${to}`)
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((d as { error?: string }).error || 'No pudimos cargar tu calendario')
  return d as CalData
}

/** Marcas de un día: una por proyecto (el rango "ocupado" manda sobre "por confirmar"). */
function marksOf(projects: CalProject[], day: DayKey) {
  const out: { p: CalProject; estado: 'ocupado' | 'por_confirmar' | 'finalizado' }[] = []
  for (const p of projects) {
    const hit = p.ranges.filter((r) => r.start <= day && day <= r.end)
    if (!hit.length) continue
    const estado = p.status !== 'activo' ? 'finalizado' : hit.some((r) => r.estado === 'ocupado') ? 'ocupado' : 'por_confirmar'
    out.push({ p, estado })
  }
  return out
}

const MARK_CLS = {
  ocupado: 'bg-[#1D63B8] text-white',
  por_confirmar: 'border border-dashed border-amber-500 bg-amber-50 text-amber-800',
  finalizado: 'bg-slate-200 text-slate-600',
} as const
const DOT_CLS = {
  ocupado: 'bg-[#1D63B8]',
  por_confirmar: 'border border-dashed border-amber-500 bg-amber-100',
  finalizado: 'bg-slate-300',
} as const

export default function ProCalendar() {
  const today = todayKey()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [data, setData] = useState<CalData | null>(null)
  const [upcoming, setUpcoming] = useState<CalData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DayKey | null>(null)

  const bounds = useMemo(() => gridBounds(month), [month])

  const [nonce, setNonce] = useState(0)
  useEffect(() => {
    let alive = true
    fetchCal(bounds.first, bounds.last)
      .then((d) => { if (alive) setData(d) })
      .catch((e) => { if (alive) setError(e instanceof Error && e.message !== 'Failed to fetch' ? e.message : NET_ERROR) })
    return () => { alive = false }
  }, [bounds, nonce])
  function changeMonth(m: string) { setData(null); setError(null); setSelected(null); setMonth(m) }
  function retry() { setData(null); setError(null); setNonce((n) => n + 1) }
  useEffect(() => {
    fetchCal(today, addDays(today, 180)).then(setUpcoming).catch(() => setUpcoming(null))
  }, [today])

  // resumen del mes: días ocupados (acordados), por confirmar y libres
  const resumen = useMemo(() => {
    if (!data) return null
    const activos = data.projects.filter((p) => p.status === 'activo')
    const ocup = activos.flatMap((p) => p.ranges.filter((r) => r.estado === 'ocupado'))
    const prop = activos.flatMap((p) => p.ranges.filter((r) => r.estado === 'por_confirmar'))
    let o = 0, c = 0, total = 0
    for (let d = bounds.monthStart; d <= bounds.monthEnd; d = addDays(d, 1)) {
      total++
      if (dayInRanges(d, ocup)) o++
      else if (dayInRanges(d, prop)) c++
    }
    return { ocupados: o, porConfirmar: c, libres: total - o - c }
  }, [data, bounds])

  const proximos = useMemo(() => {
    if (!upcoming) return []
    return upcoming.projects
      .filter((p) => p.status === 'activo' && p.schedule.startDate && p.schedule.endDate && p.schedule.endDate >= today)
      .sort((a, b) => (a.schedule.startDate! < b.schedule.startDate! ? -1 : 1))
  }, [upcoming, today])

  const sinFecha = (upcoming || data)?.sinFecha || []
  const pendientes = (upcoming || data)?.pendientes || 0
  const dayMarks = selected && data ? marksOf(data.projects, selected) : []

  return (
    <div className="homy-page pb-44 lg:pb-10">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Agenda</span>
          <h1 className="homy-page-title mt-1.5">Calendario</h1>
          <p className="homy-page-sub">Tus trabajos por fecha: lo acordado con cada cliente, lo que está por confirmar y lo que falta agendar.</p>
        </div>
      </header>

      <div className="space-y-6">
        {pendientes > 0 && (
          <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-4" role="status">
            <BellRing className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
            <p className="text-sm leading-relaxed text-amber-900">
              <b>{pendientes} cliente{pendientes === 1 ? '' : 's'} te propuso{pendientes === 1 ? '' : 'ieron'} fechas.</b> Entrá al proyecto (marcado “Te toca responder” abajo) para aceptarlas o proponer otras.
            </p>
          </div>
        )}

        {/* resumen del mes */}
        <section aria-label="Resumen del mes" className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <Kpi icon={<CalendarCheck2 />} tone="text-[#1D63B8]" label="Ocupados" value={resumen?.ocupados} hint="días acordados" />
          <Kpi icon={<CalendarClock />} tone="text-amber-600" label="Propuestos" value={resumen?.porConfirmar} hint="días por confirmar" />
          <Kpi icon={<Sun />} tone="text-emerald-600" label="Libres" value={resumen?.libres} hint="días del mes" />
        </section>

        {/* mes */}
        <section className="homy-glass rounded-3xl p-3 sm:p-5" aria-label="Calendario mensual">
          <MonthNav month={month} onChange={changeMonth} className="mb-3" />
          {error ? (
            <div className="grid place-items-center gap-3 py-10 text-center">
              <p className="text-sm text-slate-500">{error}</p>
              <button onClick={retry} className="homy-btn-primary min-h-[44px] px-5 text-sm"><RefreshCcw className="size-4" aria-hidden /> Reintentar</button>
            </div>
          ) : !data ? (
            <Loading text="Cargando tu calendario…" />
          ) : (
            <MonthGrid
              month={month}
              today={today}
              dayLabel={(d) => {
                const m = marksOf(data.projects, d)
                return m.length ? `${m.length} trabajo${m.length === 1 ? '' : 's'}` : null
              }}
              cellClassName={(d) => `min-h-[54px] sm:min-h-[92px] ${selected === d ? 'ring-2 ring-[#1D63B8]' : ''} ${marksOf(data.projects, d).length ? 'bg-white/70' : 'bg-white/30'}`}
              renderDay={(d) => {
                const m = marksOf(data.projects, d)
                return (
                  <button
                    type="button"
                    onClick={() => setSelected(selected === d ? null : d)}
                    aria-label={`Ver los trabajos del ${longDay(d)}`}
                    className="homy-focus absolute inset-0 rounded-lg"
                  >
                    {/* móvil: puntos */}
                    <span className="absolute inset-x-0 bottom-1.5 flex justify-center gap-0.5 sm:hidden" aria-hidden>
                      {m.slice(0, 3).map((x) => <i key={x.p.id} className={`block size-1.5 rounded-full ${DOT_CLS[x.estado]}`} />)}
                      {m.length > 3 && <i className="block text-[9px] font-extrabold not-italic leading-none text-slate-500">+</i>}
                    </span>
                    {/* escritorio: barras con título */}
                    <span className="absolute inset-x-1 top-8 hidden flex-col gap-0.5 sm:flex" aria-hidden>
                      {m.slice(0, 2).map((x) => (
                        <span key={x.p.id} className={`block truncate rounded px-1.5 py-0.5 text-left text-[10.5px] font-bold leading-tight ${MARK_CLS[x.estado]}`}>{x.p.title}</span>
                      ))}
                      {m.length > 2 && <span className="block text-left text-[10px] font-bold text-slate-500">+{m.length - 2} más</span>}
                    </span>
                  </button>
                )
              }}
            />
          )}
          {/* leyenda */}
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5 text-[11.5px] font-semibold text-slate-500">
            <span className="inline-flex items-center gap-1.5"><i className={`block h-2.5 w-4 rounded ${DOT_CLS.ocupado}`} aria-hidden /> Acordado</span>
            <span className="inline-flex items-center gap-1.5"><i className={`block h-2.5 w-4 rounded ${DOT_CLS.por_confirmar}`} aria-hidden /> Por confirmar</span>
            <span className="inline-flex items-center gap-1.5"><i className={`block h-2.5 w-4 rounded ${DOT_CLS.finalizado}`} aria-hidden /> Finalizado</span>
            <span className="inline-flex items-center gap-1.5"><i className="block size-2.5 rounded-full bg-[#FF5A1F]" aria-hidden /> Hoy</span>
          </div>
          {/* trabajos del día elegido */}
          {selected && (
            <div className="mt-4 border-t border-[#0A2540]/8 pt-3" aria-live="polite">
              <p className="mb-2 text-sm font-extrabold capitalize text-[#0A2540]">{longDay(selected)}</p>
              {dayMarks.length === 0 ? (
                <p className="text-sm text-slate-500">Día libre: no tenés trabajos agendados.</p>
              ) : (
                <ul className="grid gap-2">
                  {dayMarks.map((x) => <ProjectRow key={x.p.id} p={x.p} estado={x.estado} today={today} />)}
                </ul>
              )}
            </div>
          )}
        </section>

        {/* próximos trabajos */}
        <section aria-labelledby="cal-proximos">
          <div className="homy-section-head">
            <h2 id="cal-proximos" className="homy-section-title">
              <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><CalendarDays /></span>
              Próximos trabajos
              <span className="homy-pill tabular-nums">{proximos.length}</span>
            </h2>
          </div>
          {!upcoming ? <Loading text="Cargando…" /> : proximos.length === 0 ? (
            <p className="homy-glass-soft rounded-2xl p-4 text-sm text-slate-500">No tenés trabajos con fecha en los próximos 6 meses. Cuando acuerdes fechas con un cliente, aparecen acá.</p>
          ) : (
            <ul className="grid gap-2">
              {proximos.map((p) => {
                const pend = p.schedule.status === 'propuesta'
                return <ProjectRow key={p.id} p={p} estado={pend ? 'por_confirmar' : 'ocupado'} today={today} />
              })}
            </ul>
          )}
        </section>

        {/* sin fecha todavía */}
        <section aria-labelledby="cal-sinfecha">
          <div className="homy-section-head">
            <h2 id="cal-sinfecha" className="homy-section-title">
              <span className="homy-icon-chip homy-chip-gold size-8 shrink-0 [&_svg]:size-4" aria-hidden><CalendarPlus /></span>
              Sin fecha todavía
              <span className="homy-pill tabular-nums">{sinFecha.length}</span>
            </h2>
          </div>
          {sinFecha.length === 0 ? (
            <p className="homy-glass-soft rounded-2xl p-4 text-sm text-slate-500">Todos tus proyectos con presupuesto aprobado tienen fechas propuestas o acordadas.</p>
          ) : (
            <ul className="grid gap-2">
              {sinFecha.map((p) => (
                <li key={p.id} className="homy-glass flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4">
                  <div className="min-w-0 flex-[1_1_14rem]">
                    <p className="break-words font-extrabold text-[#0A2540]">{p.title}</p>
                    <p className="text-xs text-slate-500">Cliente: {p.clientName} · {STAGE_LABEL[p.stage] || p.stage}</p>
                    {p.rechazadaPor === 'cliente' && (
                      <p className="mt-1 text-xs font-semibold text-red-600">El cliente rechazó tus fechas{p.motivo ? `: ${p.motivo}` : ''}</p>
                    )}
                  </div>
                  <button onClick={() => navigate(`/panel/profesional/proyectos/${p.id}`)} className="homy-btn-primary homy-focus min-h-[44px] px-4 text-sm">
                    <CalendarPlus className="size-4" aria-hidden /> Proponer fechas
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}

function Kpi({ icon, tone, label, value, hint }: { icon: React.ReactNode; tone: string; label: string; value: number | undefined; hint: string }) {
  return (
    <div className="homy-glass min-w-0 rounded-2xl p-3 sm:p-4">
      <p className={`flex items-start gap-1 text-[10.5px] font-extrabold uppercase leading-tight tracking-[0.04em] sm:tracking-[0.1em] sm:text-[0.68rem] ${tone}`}>
        <span className="mt-px shrink-0 [&_svg]:size-3.5" aria-hidden>{icon}</span> <span className="min-w-0">{label}</span>
      </p>
      <p className="homy-num mt-1 text-2xl font-extrabold text-[#0A2540]">{value ?? '—'}</p>
      <p className="text-[11px] leading-tight text-slate-500">{hint}</p>
    </div>
  )
}

function ProjectRow({ p, estado, today }: { p: CalProject; estado: 'ocupado' | 'por_confirmar' | 'finalizado'; today: DayKey }) {
  const s = p.schedule
  const start = s.startDate!
  const end = s.endDate!
  const enCurso = start <= today && today <= end
  const falta = diffDays(today, start)
  const teToca = s.status === 'propuesta' && s.proposedBy === 'cliente'
  return (
    <li>
      <button
        onClick={() => navigate(`/panel/profesional/proyectos/${p.id}`)}
        className={`homy-focus flex min-h-[44px] w-full items-center gap-3 rounded-2xl p-3.5 text-left transition hover:ring-1 hover:ring-[#1D63B8]/30 ${estado === 'por_confirmar' ? 'border-2 border-dashed border-amber-300 bg-amber-50/50' : 'homy-glass'}`}
      >
        <span className={`w-1.5 self-stretch rounded-full ${DOT_CLS[estado]}`} aria-hidden />
        <span className="min-w-0 flex-1">
          <span className="block break-words text-sm font-extrabold text-[#0A2540]">{p.title}</span>
          <span className="block text-xs capitalize text-slate-500">{start === end ? longDay(start) : `${longDay(start)} → ${longDay(end)}`}</span>
          <span className="block text-xs text-slate-500">
            {p.clientName} · {estado === 'por_confirmar' ? (teToca ? 'Te toca responder' : 'Esperando al cliente') : estado === 'finalizado' ? 'Finalizado' : enCurso ? 'En curso' : falta > 0 ? `Arranca en ${falta} día${falta === 1 ? '' : 's'}` : 'Acordado'}
            {s.prevStartDate ? ' · reprogramación en revisión' : ''}
          </span>
        </span>
        {teToca && <span className="shrink-0 rounded-full bg-amber-100 px-2 py-0.5 text-[10.5px] font-extrabold text-amber-800">Responder</span>}
        <ArrowRight className="size-4 shrink-0 text-[#1D63B8]" aria-hidden />
      </button>
    </li>
  )
}
