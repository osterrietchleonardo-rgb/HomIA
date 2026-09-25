'use client'
// Calendario del profesional (D21 + horarios D23): sus trabajos por fecha y horario (acordados en
// sólido, propuestos punteados), el estado de cada día según SU jornada (libre / con lugar /
// completo), la agenda del día como línea de tiempo con los huecos libres, próximos trabajos y
// proyectos con presupuesto aprobado que todavía no tienen fechas. Las fechas se acuerdan en el
// detalle de cada proyecto; la jornada se cambia acá ("Mi jornada").
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import { Loading } from '@/components/app/ui-bits'
import MonthGrid, { MonthNav, gridBounds } from '@/components/app/month-grid'
import {
  JORNADA_DEFAULT, addDays, dayIntervals, dayStatus, diffDays, freeSlots, fromMinutes, longDay, slotLabel, slotMinutes,
  slotText, timeOptions, toMinutes, todayKey, validateSlot,
  type BusyRange, type DayEstado, type DayKey, type Jornada, type TimeKey,
} from '@/lib/schedule'
import {
  CalendarDays, CalendarCheck2, CalendarPlus, ArrowRight, RefreshCcw, BellRing, Sun, Clock, Loader2, CalendarRange,
} from 'lucide-react'

type CalProject = {
  id: string; title: string; stage: string; status: string; clientName: string
  schedule: {
    status: 'propuesta' | 'acordada' | null; proposedBy: 'profesional' | 'cliente' | null
    startDate: string | null; endDate: string | null; dailyStart: string | null; dailyEnd: string | null
    prevStartDate: string | null; prevEndDate: string | null
  }
  ranges: BusyRange[]
}
type SinFecha = { id: string; title: string; stage: string; clientName: string; rechazadaPor: string | null; motivo: string | null }
type CalData = { from: string; to: string; today: string; jornada: Jornada; jornadaPorDefecto: boolean; projects: CalProject[]; sinFecha: SinFecha[]; pendientes: number }

const STAGE_LABEL: Record<string, string> = { presupuesto: 'Presupuesto', materiales: 'Materiales', ejecucion: 'Ejecución', revision: 'Revisión', finalizado: 'Finalizado' }
const NET_ERROR = 'No pudimos conectar con HomIA. Revisá tu conexión y probá de nuevo.'
const HORAS = timeOptions()

async function fetchCal(from: string, to: string): Promise<CalData> {
  const res = await fetch(`/api/professional/calendar?from=${from}&to=${to}`)
  const d = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error((d as { error?: string }).error || 'No pudimos cargar tu calendario')
  return d as CalData
}

type Estado = 'ocupado' | 'por_confirmar' | 'finalizado'
type Mark = { p: CalProject; estado: Estado; ds: TimeKey | null; de: TimeKey | null }

/** Marcas de un día: una por proyecto (el rango "ocupado" manda sobre "por confirmar"), ordenadas por hora. */
function marksOf(projects: CalProject[], day: DayKey): Mark[] {
  const out: Mark[] = []
  for (const p of projects) {
    const hit = p.ranges.filter((r) => r.start <= day && day <= r.end)
    if (!hit.length) continue
    const r = hit.find((x) => x.estado === 'ocupado') || hit[0]
    const estado: Estado = p.status !== 'activo' ? 'finalizado' : r.estado
    out.push({ p, estado, ds: r.dailyStart || null, de: r.dailyEnd || null })
  }
  return out.sort((a, b) => slotMinutes(a.ds, a.de)[0] - slotMinutes(b.ds, b.de)[0] || (a.p.title < b.p.title ? -1 : 1))
}

/** Rangos de los proyectos ACTIVOS (los finalizados no ocupan). */
function activeRanges(projects: CalProject[]): BusyRange[] {
  return projects.filter((p) => p.status === 'activo').flatMap((p) => p.ranges)
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
const DAY_LABEL: Record<DayEstado, string> = { libre: 'Libre', con_lugar: 'Con lugar', completo: 'Completo' }
const DAY_CHIP: Record<DayEstado, string> = {
  libre: 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200',
  con_lugar: 'bg-sky-50 text-sky-800 ring-1 ring-sky-200',
  completo: 'bg-[#0A2540] text-white',
}

export default function ProCalendar() {
  const today = todayKey()
  const [month, setMonth] = useState(today.slice(0, 7))
  const [data, setData] = useState<CalData | null>(null)
  const [upcoming, setUpcoming] = useState<CalData | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DayKey | null>(null)
  const [jornadaLocal, setJornadaLocal] = useState<{ j: Jornada; def: boolean } | null>(null)

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

  const jornada: Jornada = jornadaLocal?.j || data?.jornada || upcoming?.jornada || JORNADA_DEFAULT
  const jornadaDef = jornadaLocal ? jornadaLocal.def : (data || upcoming)?.jornadaPorDefecto ?? true
  const ranges = useMemo(() => (data ? activeRanges(data.projects) : []), [data])

  // resumen del mes según la jornada: días completos, con lugar y libres
  const resumen = useMemo(() => {
    if (!data) return null
    let completos = 0, conLugar = 0, total = 0
    for (let d = bounds.monthStart; d <= bounds.monthEnd; d = addDays(d, 1)) {
      total++
      const e = dayStatus(d, ranges, jornada)
      if (e === 'completo') completos++
      else if (e === 'con_lugar') conLugar++
    }
    return { completos, conLugar, libres: total - completos - conLugar }
  }, [data, bounds, ranges, jornada])

  const proximos = useMemo(() => {
    if (!upcoming) return []
    return upcoming.projects
      .filter((p) => p.status === 'activo' && p.schedule.startDate && p.schedule.endDate && p.schedule.endDate >= today)
      .sort((a, b) => (a.schedule.startDate! < b.schedule.startDate! ? -1 : a.schedule.startDate! > b.schedule.startDate! ? 1 : slotMinutes(a.schedule.dailyStart, a.schedule.dailyEnd)[0] - slotMinutes(b.schedule.dailyStart, b.schedule.dailyEnd)[0]))
  }, [upcoming, today])

  const sinFecha = (upcoming || data)?.sinFecha || []
  const pendientes = (upcoming || data)?.pendientes || 0
  const dayMarks = selected && data ? marksOf(data.projects, selected) : []
  const selEstado = selected && data ? dayStatus(selected, ranges, jornada) : null

  return (
    <div className="homy-page pb-44 lg:pb-10">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Agenda</span>
          <h1 className="homy-page-title mt-1.5">Calendario</h1>
          <p className="homy-page-sub">Tus trabajos por fecha y horario: lo acordado con cada cliente, lo que está por confirmar, las horas libres y lo que falta agendar.</p>
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

        <MiJornada jornada={jornada} porDefecto={jornadaDef} onSaved={(j, def) => setJornadaLocal({ j, def })} />

        {/* resumen del mes */}
        <section aria-label="Resumen del mes" className="grid grid-cols-3 gap-2.5 sm:gap-3">
          <Kpi icon={<CalendarCheck2 />} tone="text-[#0A2540]" label="Completos" value={resumen?.completos} hint="sin horas libres" />
          <Kpi icon={<CalendarRange />} tone="text-sky-700" label="Con lugar" value={resumen?.conLugar} hint="quedan horas" />
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
                if (!m.length) return null
                const e = dayStatus(d, ranges, jornada)
                return `${m.length} trabajo${m.length === 1 ? '' : 's'}${e === 'libre' ? '' : `, ${DAY_LABEL[e].toLowerCase()}`}`
              }}
              cellClassName={(d) => `min-h-[58px] sm:min-h-[116px] ${selected === d ? 'ring-2 ring-[#1D63B8]' : ''} ${marksOf(data.projects, d).length ? 'bg-white/70' : 'bg-white/30'}`}
              renderDay={(d) => {
                const m = marksOf(data.projects, d)
                const e = m.length ? dayStatus(d, ranges, jornada) : 'libre'
                const soloPropuesto = m.length > 0 && m.every((x) => x.estado === 'por_confirmar')
                return (
                  <button
                    type="button"
                    onClick={() => setSelected(selected === d ? null : d)}
                    aria-label={`Ver la agenda del ${longDay(d)}`}
                    className="homy-focus absolute inset-0 rounded-lg"
                    data-testid={`cal-day-${d}`}
                  >
                    {/* móvil: cantidad de trabajos, con el color del estado del día */}
                    {m.length > 0 && (
                      <span
                        className={`absolute inset-x-1 bottom-1 block truncate rounded px-0.5 text-center text-[10px] font-extrabold leading-4 sm:hidden ${
                          e === 'completo' ? 'bg-[#0A2540] text-white' : soloPropuesto ? 'border border-dashed border-amber-500 bg-amber-50 text-amber-800' : 'bg-sky-100 text-sky-800'
                        }`}
                        aria-hidden
                      >
                        {m.length}{e === 'completo' ? ' ●' : ''}
                      </span>
                    )}
                    {/* escritorio: estado del día + barras con la hora de inicio y el título */}
                    {m.length > 0 && (
                      <span className={`absolute bottom-1 left-1.5 hidden rounded px-1 text-[9.5px] font-extrabold uppercase tracking-wide sm:block ${e === 'completo' ? 'text-[#0A2540]' : 'text-sky-700'}`} aria-hidden>
                        {e === 'completo' ? 'Completo' : 'Con lugar'}
                      </span>
                    )}
                    <span className="absolute inset-x-1 top-8 hidden flex-col gap-0.5 sm:flex" aria-hidden>
                      {m.slice(0, 3).map((x) => (
                        <span key={x.p.id} className={`block truncate rounded px-1.5 py-0.5 text-left text-[10.5px] font-bold leading-tight ${MARK_CLS[x.estado]}`}>
                          {x.ds ? <span className="tabular-nums">{x.ds} </span> : null}{x.p.title}
                        </span>
                      ))}
                      {m.length > 3 && <span className="block text-left text-[10px] font-bold text-slate-500">+{m.length - 3} más</span>}
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
            <span className="inline-flex items-center gap-1.5"><i className="block h-2.5 w-4 rounded bg-[#0A2540]" aria-hidden /> Día completo</span>
            <span className="inline-flex items-center gap-1.5"><i className="block h-2.5 w-4 rounded bg-sky-100 ring-1 ring-sky-200" aria-hidden /> Con lugar</span>
            <span className="inline-flex items-center gap-1.5"><i className="block size-2.5 rounded-full bg-[#FF5A1F]" aria-hidden /> Hoy</span>
          </div>
          <p className="mt-1.5 text-[11.5px] text-slate-500">El número de cada día es la cantidad de trabajos. “Completo” = no te quedan horas libres en tu jornada ({jornada.desde} a {jornada.hasta}).</p>

          {/* agenda del día elegido */}
          {selected && data && (
            <div className="mt-4 border-t border-[#0A2540]/8 pt-3" aria-live="polite" data-testid="cal-day-panel">
              <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-extrabold capitalize text-[#0A2540]">{longDay(selected)}</p>
                {selEstado && <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-extrabold ${DAY_CHIP[selEstado]}`}>{DAY_LABEL[selEstado]}</span>}
              </div>
              {dayMarks.length === 0 ? (
                <p className="text-sm text-slate-500">Día libre: no tenés trabajos agendados.</p>
              ) : (
                <>
                  <ul className="grid gap-2">
                    {dayMarks.map((x) => <ProjectRow key={x.p.id} p={x.p} estado={x.estado} today={today} franja={slotLabel(x.ds, x.de)} />)}
                  </ul>
                  <DayAgenda day={selected} projects={data.projects} jornada={jornada} />
                </>
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

/** "Mi jornada: 06:00 a 18:00 · Cambiar" — decide cuándo un día está completo. */
function MiJornada({ jornada, porDefecto, onSaved }: { jornada: Jornada; porDefecto: boolean; onSaved: (j: Jornada, def: boolean) => void }) {
  const [edit, setEdit] = useState(false)
  const [desde, setDesde] = useState(jornada.desde)
  const [hasta, setHasta] = useState(jornada.hasta)
  const [busy, setBusy] = useState(false)
  const err = validateSlot(desde, hasta)

  async function save(body: { workdayStart: string | null; workdayEnd: string | null }) {
    setBusy(true)
    try {
      const res = await fetch('/api/professional/calendar', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
      const d = await res.json().catch(() => ({})) as { error?: string; jornada?: Jornada; jornadaPorDefecto?: boolean }
      if (!res.ok || !d.jornada) { toast.error(d.error || 'No se pudo guardar tu jornada'); return }
      onSaved(d.jornada, !!d.jornadaPorDefecto)
      toast.success(`Tu jornada quedó de ${d.jornada.desde} a ${d.jornada.hasta}`)
      setEdit(false)
    } catch {
      toast.error(NET_ERROR)
    } finally { setBusy(false) }
  }

  return (
    <section className="homy-glass-soft rounded-2xl p-3.5 sm:p-4" aria-label="Mi jornada" data-testid="mi-jornada">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="flex min-w-0 items-center gap-2 text-sm text-[#0A2540]">
          <Clock className="size-4 shrink-0 text-[#1D63B8]" aria-hidden />
          <span><b>Mi jornada:</b> <span className="tabular-nums">{jornada.desde} a {jornada.hasta}</span>{porDefecto ? <span className="text-slate-500"> (la de referencia)</span> : null}</span>
        </p>
        {!edit && (
          <button type="button" onClick={() => { setDesde(jornada.desde); setHasta(jornada.hasta); setEdit(true) }} className="homy-focus min-h-[44px] rounded-xl px-3 text-sm font-bold text-[#1D63B8] hover:underline" data-testid="jornada-cambiar">
            Cambiar
          </button>
        )}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">Sirve para marcar cada día como completo o con lugar, en tu calendario y en tu perfil. Tus trabajos pueden estar en cualquier horario.</p>
      {edit && (
        <div className="mt-3 grid gap-2">
          <div className="grid grid-cols-2 gap-2">
            <label className="block min-w-0">
              <span className="text-[11px] font-bold text-slate-500">Desde</span>
              <select value={desde} onChange={(e) => setDesde(e.target.value)} className="homy-glass-input mt-1 min-h-[44px] w-full rounded-xl px-3 text-sm tabular-nums" data-testid="jornada-desde">
                {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
            <label className="block min-w-0">
              <span className="text-[11px] font-bold text-slate-500">Hasta</span>
              <select value={hasta} onChange={(e) => setHasta(e.target.value)} className="homy-glass-input mt-1 min-h-[44px] w-full rounded-xl px-3 text-sm tabular-nums" data-testid="jornada-hasta">
                {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
              </select>
            </label>
          </div>
          {err && <p className="text-xs font-bold text-red-500" role="alert">{err}</p>}
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!!err || busy} onClick={() => save({ workdayStart: desde, workdayEnd: hasta })} className="homy-btn-primary homy-focus min-h-[44px] px-4 text-sm disabled:opacity-50" data-testid="jornada-guardar">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Guardar
            </button>
            {!porDefecto && (
              <button type="button" disabled={busy} onClick={() => save({ workdayStart: null, workdayEnd: null })} className="homy-glass homy-focus min-h-[44px] rounded-xl px-4 text-sm font-bold text-slate-600 disabled:opacity-50">
                Volver a {JORNADA_DEFAULT.desde}–{JORNADA_DEFAULT.hasta}
              </button>
            )}
            <button type="button" onClick={() => setEdit(false)} className="homy-btn-ghost homy-focus min-h-[44px] px-4 text-sm">Cancelar</button>
          </div>
        </div>
      )}
    </section>
  )
}

const PX_HORA = 44

/**
 * Agenda del día: línea de tiempo vertical con la jornada (se extiende si un trabajo cae afuera),
 * un bloque por trabajo en su horario (acordado sólido, propuesto punteado; los que se cruzan van
 * uno al lado del otro) y los huecos libres en verde.
 */
function DayAgenda({ day, projects, jornada }: { day: DayKey; projects: CalProject[]; jornada: Jornada }) {
  // bloques: todos los rangos que tocan el día (en una reprogramación, el acordado y el propuesto)
  const blocks = projects.flatMap((p) => p.ranges
    .filter((r) => r.start <= day && day <= r.end)
    .map((r) => {
      const full = !r.dailyStart || !r.dailyEnd
      const [a, b] = slotMinutes(r.dailyStart, r.dailyEnd)
      return { p, estado: (p.status !== 'activo' ? 'finalizado' : r.estado) as Estado, full, a, b, ds: r.dailyStart || null, de: r.dailyEnd || null }
    }))
  const franjas = blocks.filter((x) => !x.full)
  // rango visible: la jornada, extendida a horas enteras si un trabajo cae fuera
  const lo = Math.floor(Math.min(toMinutes(jornada.desde), ...franjas.map((x) => x.a)) / 60) * 60
  const hi = Math.ceil(Math.max(toMinutes(jornada.hasta), ...franjas.map((x) => x.b)) / 60) * 60
  const clip = (m: number) => Math.min(hi, Math.max(lo, m))
  const items = blocks.map((x) => ({ ...x, a: x.full ? lo : clip(x.a), b: x.full ? hi : clip(x.b) })).sort((x, y) => x.a - y.a || y.b - x.b)
  // carriles: los que se cruzan van uno al lado del otro
  const laneEnd: number[] = []
  const placed = items.map((x) => {
    let lane = laneEnd.findIndex((e) => e <= x.a)
    if (lane === -1) { lane = laneEnd.length; laneEnd.push(x.b) } else laneEnd[lane] = x.b
    return { ...x, lane }
  })
  const lanes = Math.max(1, laneEnd.length)
  const activos = activeRanges(projects).filter((r) => r.start <= day && day <= r.end)
  const libres = freeSlots(dayIntervals(day, activos), fromMinutes(lo), fromMinutes(hi))
  const top = (m: number) => ((m - lo) / 60) * PX_HORA
  const horas: number[] = []
  for (let m = lo; m <= hi; m += 60) horas.push(m)

  return (
    <div className="mt-4" data-testid="cal-agenda">
      <p className="mb-2 text-xs font-extrabold uppercase tracking-[0.1em] text-slate-500">Agenda del día</p>
      <div className="relative flex" style={{ height: top(hi) + 8 }}>
        {/* horas */}
        <div className="relative w-11 shrink-0" aria-hidden>
          {horas.map((m) => (
            <span key={m} className="absolute -translate-y-1/2 text-[10.5px] font-bold tabular-nums text-slate-400" style={{ top: top(m) }}>{fromMinutes(m)}</span>
          ))}
        </div>
        <div className="relative min-w-0 flex-1 border-l border-[#0A2540]/10">
          {horas.map((m) => <div key={m} className="absolute inset-x-0 border-t border-dashed border-[#0A2540]/8" style={{ top: top(m) }} aria-hidden />)}
          {/* jornada */}
          <div className="absolute inset-x-0 bg-[#1D63B8]/[0.03]" style={{ top: top(toMinutes(jornada.desde)), height: top(toMinutes(jornada.hasta)) - top(toMinutes(jornada.desde)) }} aria-hidden />
          {/* huecos libres */}
          {libres.map((l) => {
            const h = top(toMinutes(l.hasta)) - top(toMinutes(l.desde))
            return (
              <div key={l.desde} className="absolute inset-x-1 flex items-center overflow-hidden rounded-lg border border-dashed border-emerald-300 bg-emerald-50/70 px-2" style={{ top: top(toMinutes(l.desde)) + 1, height: Math.max(h - 2, 4) }} data-testid="cal-libre">
                {h >= 18 && <span className="truncate text-[11px] font-bold text-emerald-700">Libre · {l.desde}–{l.hasta}</span>}
              </div>
            )
          })}
          {/* trabajos */}
          {placed.map((x, i) => {
            const h = top(x.b) - top(x.a)
            const w = 100 / lanes
            return (
              <button
                key={`${x.p.id}-${i}`}
                type="button"
                onClick={() => navigate(`/panel/profesional/proyectos/${x.p.id}`)}
                className={`homy-focus absolute overflow-hidden rounded-lg px-2 py-1 text-left shadow-sm ${MARK_CLS[x.estado]}`}
                style={{ top: top(x.a) + 1, height: Math.max(h - 2, 14), left: `calc(${x.lane * w}% + 4px)`, width: `calc(${w}% - 8px)` }}
                data-testid="cal-bloque"
                aria-label={`${x.p.title}: ${x.full ? 'todo el día' : `de ${x.ds} a ${x.de}`}${x.estado === 'por_confirmar' ? ', por confirmar' : ''}`}
              >
                <span className="block truncate text-[11px] font-extrabold leading-tight tabular-nums">{x.full ? 'Todo el día' : `${x.ds}–${x.de}`}</span>
                {h >= 34 && <span className="block truncate text-[11.5px] font-bold leading-tight">{x.p.title}</span>}
                {h >= 50 && <span className="block truncate text-[10.5px] leading-tight opacity-80">{x.p.clientName}{x.estado === 'por_confirmar' ? ' · por confirmar' : ''}</span>}
              </button>
            )
          })}
        </div>
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

function ProjectRow({ p, estado, today, franja }: { p: CalProject; estado: Estado; today: DayKey; franja?: string }) {
  const s = p.schedule
  const start = s.startDate!
  const end = s.endDate!
  const enCurso = start <= today && today <= end
  const falta = diffDays(today, start)
  const teToca = s.status === 'propuesta' && s.proposedBy === 'cliente'
  const horario = franja ?? slotText(s.dailyStart, s.dailyEnd, start !== end)
  return (
    <li>
      <button
        onClick={() => navigate(`/panel/profesional/proyectos/${p.id}`)}
        className={`homy-focus flex min-h-[44px] w-full items-center gap-3 rounded-2xl p-3.5 text-left transition hover:ring-1 hover:ring-[#1D63B8]/30 ${estado === 'por_confirmar' ? 'border-2 border-dashed border-amber-300 bg-amber-50/50' : 'homy-glass'}`}
      >
        <span className={`w-1.5 self-stretch rounded-full ${DOT_CLS[estado]}`} aria-hidden />
        <span className="min-w-0 flex-1">
          {franja !== undefined && <span className="block text-xs font-extrabold tabular-nums text-[#1D63B8]">{franja}</span>}
          <span className="block break-words text-sm font-extrabold text-[#0A2540]">{p.title}</span>
          <span className="block text-xs capitalize text-slate-500">{start === end ? longDay(start) : `${longDay(start)} → ${longDay(end)}`}</span>
          {franja === undefined && <span className="block text-xs text-slate-500"><span className="inline-block first-letter:uppercase">{horario}</span></span>}
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
