'use client'
// Tarjeta "Fechas del trabajo" del detalle de proyecto (D21 + horario D23), para el profesional y el cliente.
// El profesional propone inicio + fin estimado y el horario de cada día (o todo el día); la otra
// parte acepta, rechaza o propone otra; lo acordado se puede reprogramar (sigue vigente hasta que
// el otro decida). Si el horario choca con otro trabajo ACORDADO del profesional, la API responde
// 409 y se muestra acá mismo (en el diálogo o en la tarjeta).
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, CalendarCheck2, CalendarClock, CalendarX2, Check, Clock, Loader2, Pencil, TriangleAlert, X, Info } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  JORNADA_DEFAULT, diffDays, longDay, schedulesCollide, scheduleText, slotText, timeOptions, todayKey, validateSlot,
  type DayKey, type Jornada, type TimeKey,
} from '@/lib/schedule'

export type ScheduleInfo = {
  status: 'propuesta' | 'acordada' | null
  proposedBy: 'profesional' | 'cliente' | null
  startDate: DayKey | null
  endDate: DayKey | null
  /** franja de cada día ("HH:MM"); null = todo el día */
  dailyStart?: TimeKey | null
  dailyEnd?: TimeKey | null
  prevStartDate: DayKey | null
  prevEndDate: DayKey | null
  prevDailyStart?: TimeKey | null
  prevDailyEnd?: TimeKey | null
  note: string | null
  updatedAt: string | null
}

type SendResult = { ok: boolean; error?: string; choque?: boolean }

type Role = 'profesional' | 'cliente'
const NET_ERROR = 'No pudimos conectar con HomIA. Revisá tu conexión y probá de nuevo.'

function rangeText(a: DayKey, b: DayKey) {
  const dias = diffDays(a, b) + 1
  return { texto: a === b ? longDay(a) : `${longDay(a)} → ${longDay(b)}`, dias: `${dias} día${dias === 1 ? '' : 's'}` }
}

export default function ScheduleCard({
  projectId, role, otherName, schedule, blocked, workday, onChanged,
}: {
  projectId: string
  role: Role
  /** nombre de la otra parte ("Juan", "tu cliente") */
  otherName: string
  schedule: ScheduleInfo | null | undefined
  /** motivo por el que todavía no se pueden acordar fechas (null = se puede) */
  blocked: string | null | undefined
  /** jornada del profesional: el diálogo la sugiere como horario */
  workday?: Jornada | null
  onChanged: () => void
}) {
  const s: ScheduleInfo = schedule || { status: null, proposedBy: null, startDate: null, endDate: null, prevStartDate: null, prevEndDate: null, note: null, updatedAt: null }
  const [busy, setBusy] = useState<string | null>(null)
  const [proposeOpen, setProposeOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [motivo, setMotivo] = useState('')
  // choque al aceptar (409): queda visible en la tarjeta hasta la próxima acción
  const [cardError, setCardError] = useState<string | null>(null)

  const other: Role = role === 'profesional' ? 'cliente' : 'profesional'
  const mine = s.status === 'propuesta' && s.proposedBy === role
  const theirs = s.status === 'propuesta' && s.proposedBy === other
  const reprogramando = s.status === 'propuesta' && !!s.prevStartDate && !!s.prevEndDate
  const canAct = !blocked

  /** `inline`: el error lo muestra quien llamó (el diálogo), sin toast. */
  async function send(body: Record<string, unknown>, key: string, okMsg: string, inline = false): Promise<SendResult> {
    setBusy(key)
    setCardError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({})) as { error?: string; choque?: boolean; solapamiento?: { cantidad: number } | null }
      if (!res.ok) {
        const error = d.error || 'No se pudieron actualizar las fechas'
        if (!inline) {
          toast.error(error)
          if (d.choque) setCardError(error)
        }
        return { ok: false, error, choque: !!d.choque }
      }
      toast.success(okMsg)
      const n = d.solapamiento?.cantidad || 0
      if (n > 0) {
        toast.warning(role === 'profesional'
          ? `Ojo: ese horario se cruza con ${n === 1 ? 'otra propuesta tuya' : `${n} propuestas tuyas`} todavía sin confirmar. Si se acepta${n === 1 ? '' : 'n'} antes, esta no se va a poder aceptar.`
          : 'El profesional tiene otra propuesta sin confirmar en ese horario. Si se confirma antes, van a tener que elegir otro.')
      }
      onChanged()
      return { ok: true }
    } catch {
      if (!inline) toast.error(NET_ERROR)
      return { ok: false, error: NET_ERROR }
    } finally { setBusy(null) }
  }

  const who = (r: Role | null) => (r === role ? 'Vos' : r === 'profesional' ? 'El profesional' : 'El cliente')

  // ── contenido según el estado ──
  let tone = 'homy-chip-blue'
  let Icon = CalendarDays
  let pill = 'Sin fechas'
  if (s.status === 'acordada') { tone = 'homy-chip-mint'; Icon = CalendarCheck2; pill = 'Acordadas' }
  else if (s.status === 'propuesta') { tone = 'homy-chip-gold'; Icon = CalendarClock; pill = reprogramando ? 'Reprogramación en revisión' : theirs ? 'Te toca responder' : 'Esperando respuesta' }
  else if (s.updatedAt && s.proposedBy) { Icon = CalendarX2; pill = 'Rechazadas' }

  return (
    <section className="homy-glass mb-5 rounded-3xl p-5" aria-label="Fechas del trabajo" data-testid="schedule-card">
      <div className="homy-section-head">
        <h2 className="homy-section-title">
          <span className={`homy-icon-chip ${tone} size-8 shrink-0 [&_svg]:size-4`} aria-hidden><Icon /></span>
          Fechas del trabajo
        </h2>
        <span className={`homy-pill ${theirs ? 'text-[#b45309]' : ''}`}>{pill}</span>
      </div>

      {/* fechas vigentes (acordadas) */}
      {s.status === 'acordada' && s.startDate && s.endDate && (
        <DateBox label="Acordadas" start={s.startDate} end={s.endDate} ds={s.dailyStart} de={s.dailyEnd} solid />
      )}
      {reprogramando && (
        <DateBox label="Vigentes (acordadas)" start={s.prevStartDate!} end={s.prevEndDate!} ds={s.prevDailyStart} de={s.prevDailyEnd} solid />
      )}
      {s.status === 'propuesta' && s.startDate && s.endDate && (
        <DateBox
          label={`${reprogramando ? 'Cambio propuesto' : 'Propuestas'} por ${who(s.proposedBy).toLowerCase()}`}
          start={s.startDate} end={s.endDate} ds={s.dailyStart} de={s.dailyEnd}
        />
      )}
      {cardError && (
        <p className="mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm leading-relaxed text-red-800" role="alert" data-testid="schedule-conflict">
          <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
          <span className="min-w-0 break-words">{cardError}</span>
        </p>
      )}
      {s.status === 'propuesta' && s.note && (
        <p className="homy-glass-soft mt-3 rounded-xl px-4 py-3 text-sm leading-relaxed text-slate-600">
          <span className="font-bold text-[#0A2540]">Nota: </span>{s.note}
        </p>
      )}

      {/* mensajes de estado */}
      {s.status === null && s.updatedAt && s.proposedBy && (
        <p className="mt-1 flex items-start gap-2 rounded-xl border border-red-100 bg-red-50 px-4 py-3 text-sm leading-relaxed text-slate-600">
          <CalendarX2 className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
          <span>
            {s.proposedBy === role ? 'Rechazaste las fechas propuestas.' : `${who(s.proposedBy)} rechazó las fechas propuestas.`}
            {s.note ? <> Motivo: <b className="font-semibold text-[#0A2540]">{s.note}</b></> : null}
            {role === 'profesional' ? ' Proponé otras cuando puedas.' : ' El profesional va a proponer otras.'}
          </span>
        </p>
      )}
      {blocked && s.status === null && (
        <p className="homy-glass-soft flex items-start gap-2.5 rounded-xl p-3.5 text-sm text-slate-500">
          <Info className="mt-0.5 size-4 shrink-0 text-slate-400" aria-hidden />
          {blocked}
        </p>
      )}
      {!blocked && s.status === null && (
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          {role === 'profesional'
            ? `Proponé cuándo arrancás, cuándo estimás terminar y en qué horario (o todo el día). ${otherName} las acepta, las rechaza o te propone otras.`
            : `${otherName} todavía no propuso fechas. Te avisamos cuando lo haga: vas a poder aceptarlas, rechazarlas o proponer otras.`}
        </p>
      )}
      {mine && (
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          Esperando que {otherName} {reprogramando ? 'acepte el cambio' : 'las acepte'}. Te avisamos cuando responda.
          {reprogramando && ' Mientras tanto siguen las fechas acordadas.'}
        </p>
      )}
      {theirs && (
        <p className="mt-3 text-sm font-semibold leading-relaxed text-[#0A2540]">
          {reprogramando ? `${otherName} pidió cambiar las fechas. Si rechazás, siguen las acordadas.` : `${otherName} te propuso estas fechas: aceptalas o proponé otras.`}
        </p>
      )}
      {s.status === 'acordada' && (
        <p className="mt-3 text-sm leading-relaxed text-slate-500">
          {role === 'profesional' ? 'Quedan marcadas en tu calendario y como ocupadas en tu perfil.' : 'Si necesitás moverlas, pedí una reprogramación: el profesional la acepta o la rechaza.'}
        </p>
      )}

      {/* acciones */}
      {canAct && (
        <div className="mt-4 flex flex-wrap gap-2">
          {theirs && (
            <button
              onClick={() => send({ accion: 'aceptar' }, 'aceptar', 'Fechas acordadas')}
              disabled={busy !== null}
              className="homy-btn-primary homy-focus min-h-[44px] px-5 text-sm disabled:opacity-50"
            >
              {busy === 'aceptar' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />}
              {reprogramando ? 'Aceptar el cambio' : 'Aceptar fechas'}
            </button>
          )}
          {(theirs || s.status === 'acordada' || mine || (s.status === null && role === 'profesional')) && (
            <button
              onClick={() => setProposeOpen(true)}
              disabled={busy !== null}
              className={`${s.status === null ? 'homy-btn-primary' : 'homy-btn-dark'} homy-focus min-h-[44px] px-5 text-sm disabled:opacity-50`}
            >
              {s.status === null ? <CalendarDays className="size-4" aria-hidden /> : <Pencil className="size-4" aria-hidden />}
              {s.status === null ? 'Proponer fechas' : theirs ? 'Proponer otras' : mine ? 'Cambiar mi propuesta' : 'Pedir reprogramar'}
            </button>
          )}
          {theirs && (
            <button
              onClick={() => { setMotivo(''); setRejectOpen(true) }}
              disabled={busy !== null}
              className="homy-glass-soft homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-slate-600 transition hover:text-red-500 disabled:opacity-50"
            >
              <X className="size-4" aria-hidden /> Rechazar
            </button>
          )}
        </div>
      )}

      {proposeOpen && <ProposeDialog
        open={proposeOpen}
        onOpenChange={setProposeOpen}
        role={role}
        projectId={projectId}
        initial={s.status && s.startDate && s.endDate ? { start: s.startDate, end: s.endDate, ds: s.dailyStart || null, de: s.dailyEnd || null } : null}
        workday={workday || JORNADA_DEFAULT}
        title={s.status === 'acordada' ? 'Pedir reprogramar' : theirs ? 'Proponer otras fechas' : mine ? 'Cambiar tu propuesta' : 'Proponer fechas'}
        busy={busy === 'proponer'}
        onSubmit={async (start, end, ds, de, nota) => {
          const r = await send({ accion: 'proponer', startDate: start, endDate: end, dailyStart: ds, dailyEnd: de, nota: nota || undefined }, 'proponer',
            s.status === 'acordada' ? `Le pediste a ${otherName} reprogramar` : `Fechas enviadas a ${otherName}`, true)
          if (r.ok) setProposeOpen(false)
          return r
        }}
      />}

      <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-[#0A2540]">{reprogramando ? 'Rechazar el cambio de fechas' : 'Rechazar las fechas'}</DialogTitle>
            <DialogDescription>
              {reprogramando ? 'Siguen las fechas acordadas.' : role === 'cliente' ? 'El profesional va a tener que proponer otras.' : 'Después proponé las tuyas.'} Contá el motivo si querés (le llega a {otherName}).
            </DialogDescription>
          </DialogHeader>
          <textarea
            value={motivo} onChange={(e) => setMotivo(e.target.value)} maxLength={500} rows={3}
            placeholder="Ej.: esa semana no estoy en casa"
            aria-label="Motivo del rechazo (opcional)"
            className="homy-glass-input w-full rounded-xl p-3 text-sm"
          />
          <DialogFooter className="gap-2">
            <button onClick={() => setRejectOpen(false)} className="homy-btn-ghost homy-focus min-h-[44px] px-5 text-sm">Volver</button>
            <button
              onClick={async () => { const r = await send({ accion: 'rechazar', motivo: motivo.trim() || undefined }, 'rechazar', reprogramando ? 'Siguen las fechas acordadas' : 'Rechazaste las fechas'); if (r.ok) setRejectOpen(false) }}
              disabled={busy !== null}
              className="homy-btn-dark homy-focus min-h-[44px] px-5 text-sm disabled:opacity-50"
            >
              {busy === 'rechazar' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <X className="size-4" aria-hidden />}
              Rechazar
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  )
}

function DateBox({ label, start, end, ds, de, solid = false }: { label: string; start: DayKey; end: DayKey; ds?: TimeKey | null; de?: TimeKey | null; solid?: boolean }) {
  const r = rangeText(start, end)
  const horario = slotText(ds, de, start !== end)
  return (
    <div className={`mt-3 rounded-2xl px-4 py-3 ${solid ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'border-2 border-dashed border-amber-300 bg-amber-50/60'}`} data-testid="schedule-datebox">
      <p className={`text-[10.5px] font-extrabold uppercase tracking-[0.12em] ${solid ? 'text-emerald-700' : 'text-amber-700'}`}>{label}</p>
      <p className="mt-0.5 break-words text-base font-extrabold capitalize text-[#0A2540]">{r.texto}</p>
      <p className="mt-0.5 flex items-start gap-1.5 text-sm font-bold text-[#0A2540]" data-testid="schedule-horario">
        <Clock className="mt-0.5 size-3.5 shrink-0 text-slate-500" aria-hidden />
        <span className="min-w-0 first-letter:uppercase">{horario}</span>
      </p>
      <p className="text-xs font-semibold text-slate-500">{r.dias} · inicio y fin estimado</p>
    </div>
  )
}

type CalHit = { title: string; estado: string; start: DayKey; end: DayKey; dailyStart: TimeKey | null; dailyEnd: TimeKey | null }
const HORAS = timeOptions()

function ProposeDialog({
  open, onOpenChange, role, projectId, initial, workday, title, busy, onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  role: Role
  projectId: string
  initial: { start: DayKey; end: DayKey; ds: TimeKey | null; de: TimeKey | null } | null
  workday: Jornada
  title: string
  busy: boolean
  onSubmit: (start: DayKey, end: DayKey, ds: TimeKey | null, de: TimeKey | null, nota: string) => Promise<SendResult>
}) {
  const today = todayKey()
  // el diálogo se monta al abrirse: arranca con la propuesta vigente (o hoy) y su horario (o la jornada)
  const st0 = initial && initial.start >= today ? initial.start : today
  const [start, setStart] = useState(st0)
  const [end, setEnd] = useState(initial && initial.end >= st0 ? initial.end : st0)
  const [modo, setModo] = useState<'todo' | 'franja'>(initial?.ds && initial?.de ? 'franja' : 'todo')
  const [desde, setDesde] = useState<TimeKey>(initial?.ds || workday.desde)
  const [hasta, setHasta] = useState<TimeKey>(initial?.de || workday.hasta)
  const [nota, setNota] = useState('')
  const [serverError, setServerError] = useState<{ key: string; msg: string } | null>(null)
  const ds = modo === 'franja' ? desde : null
  const de = modo === 'franja' ? hasta : null
  const key = `${start}|${end}|${ds}|${de}`
  // choque calculado para una combinación concreta de días y horario: si cambió, no se muestra
  const [hitsFor, setHitsFor] = useState<{ key: string; hits: CalHit[] } | null>(null)
  const hits = hitsFor && hitsFor.key === key ? hitsFor.hits : null
  const bloquean = (hits || []).filter((h) => h.estado === 'ocupado')
  const avisan = (hits || []).filter((h) => h.estado !== 'ocupado')
  const srvErr = serverError && serverError.key === key ? serverError.msg : null

  // choque en vivo: solo el profesional (con su propio calendario). El servidor igual lo verifica al enviar.
  useEffect(() => {
    if (!open || role !== 'profesional' || !start || !end || end < start) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/professional/calendar?from=${start}&to=${end}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { projects?: { id: string; title: string; status: string; ranges: { start: string; end: string; estado: string; dailyStart?: string | null; dailyEnd?: string | null }[] }[] } | null) => {
          if (!d?.projects) return
          const cand = { start, end, dailyStart: ds, dailyEnd: de }
          const found: CalHit[] = []
          for (const p of d.projects) {
            if (p.id === projectId || p.status !== 'activo') continue
            const rs = p.ranges.filter((r) => schedulesCollide(cand, r))
            const r = rs.find((x) => x.estado === 'ocupado') || rs[0]
            if (r) found.push({ title: p.title, estado: r.estado, start: r.start, end: r.end, dailyStart: r.dailyStart || null, dailyEnd: r.dailyEnd || null })
          }
          setHitsFor({ key: `${start}|${end}|${ds}|${de}`, hits: found })
        })
        .catch(() => { /* sin aviso si falla: el servidor igual verifica al enviar */ })
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [open, role, start, end, ds, de, projectId])

  const error = !start || !end ? 'Elegí las dos fechas'
    : start < today ? 'El inicio no puede ser anterior a hoy'
    : end < start ? 'El fin estimado no puede ser anterior al inicio'
    : modo === 'franja' ? validateSlot(desde, hasta)
    : null
  const multi = start !== end
  const esJornada = modo === 'franja' && desde === workday.desde && hasta === workday.hasta

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#0A2540]">{title}</DialogTitle>
          <DialogDescription>
            {role === 'profesional' ? 'Cuándo arrancás, cuándo estimás terminar y en qué horario. El cliente las acepta, las rechaza o te propone otras.' : 'Proponé cuándo te queda bien y en qué horario. El profesional las acepta, las rechaza o te propone otras.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Inicio</span>
            <input
              type="date" value={start} min={today}
              onChange={(e) => { const v = e.target.value; setStart(v); if (v && end && end < v) setEnd(v) }}
              className="homy-glass-input mt-1.5 min-h-[44px] w-full rounded-xl px-3 text-sm"
              data-testid="schedule-start"
            />
          </label>
          <label className="block min-w-0">
            <span className="text-xs font-bold uppercase tracking-wide text-slate-500">Fin estimado</span>
            <input
              type="date" value={end} min={start || today}
              onChange={(e) => setEnd(e.target.value)}
              className="homy-glass-input mt-1.5 min-h-[44px] w-full rounded-xl px-3 text-sm"
              data-testid="schedule-end"
            />
          </label>
        </div>

        {/* horario de cada día */}
        <fieldset className="min-w-0">
          <legend className="text-xs font-bold uppercase tracking-wide text-slate-500">Horario de trabajo{multi ? ' (cada día)' : ''}</legend>
          <div className="mt-1.5 grid grid-cols-2 gap-2" role="radiogroup">
            <button
              type="button" role="radio" aria-checked={modo === 'todo'} onClick={() => setModo('todo')}
              className={`homy-focus min-h-[44px] rounded-xl px-3 text-sm font-bold transition ${modo === 'todo' ? 'bg-[#0A2540] text-white' : 'homy-glass-soft text-slate-600'}`}
              data-testid="schedule-mode-todo"
            >
              Todo el día
            </button>
            <button
              type="button" role="radio" aria-checked={modo === 'franja'} onClick={() => setModo('franja')}
              className={`homy-focus min-h-[44px] rounded-xl px-3 text-sm font-bold transition ${modo === 'franja' ? 'bg-[#0A2540] text-white' : 'homy-glass-soft text-slate-600'}`}
              data-testid="schedule-mode-franja"
            >
              Elegir horario
            </button>
          </div>
          {modo === 'franja' && (
            <div className="mt-2 grid grid-cols-2 gap-2">
              <label className="block min-w-0">
                <span className="text-[11px] font-bold text-slate-500">Desde</span>
                <select
                  value={desde} onChange={(e) => setDesde(e.target.value)}
                  className="homy-glass-input mt-1 min-h-[44px] w-full rounded-xl px-3 text-sm tabular-nums"
                  data-testid="schedule-desde"
                >
                  {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
              <label className="block min-w-0">
                <span className="text-[11px] font-bold text-slate-500">Hasta</span>
                <select
                  value={hasta} onChange={(e) => setHasta(e.target.value)}
                  className="homy-glass-input mt-1 min-h-[44px] w-full rounded-xl px-3 text-sm tabular-nums"
                  data-testid="schedule-hasta"
                >
                  {HORAS.map((h) => <option key={h} value={h}>{h}</option>)}
                </select>
              </label>
            </div>
          )}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
            <span>{role === 'profesional' ? 'Tu jornada' : 'Jornada habitual del profesional'}: {workday.desde} a {workday.hasta}.</span>
            {!esJornada && (
              <button type="button" onClick={() => { setModo('franja'); setDesde(workday.desde); setHasta(workday.hasta) }} className="homy-focus inline-flex min-h-[44px] items-center font-bold text-[#1D63B8] underline-offset-2 hover:underline">
                Usar ese horario
              </button>
            )}
          </p>
        </fieldset>

        {!error && start && end && (
          <p className="text-xs font-semibold text-slate-500" data-testid="schedule-resumen">{rangeText(start, end).dias} de trabajo · {scheduleText(start, end, ds, de)}</p>
        )}
        {error && <p className="text-xs font-bold text-red-500" role="alert">{error}</p>}
        {bloquean.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800" role="alert" data-testid="schedule-live-block">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
            <span className="min-w-0 break-words">
              Ese horario choca con {bloquean.length === 1 ? 'un trabajo ya acordado' : `${bloquean.length} trabajos ya acordados`}:{' '}
              {bloquean.slice(0, 3).map((o) => `«${o.title}» (${scheduleText(o.start, o.end, o.dailyStart, o.dailyEnd)})`).join('; ')}{bloquean.length > 3 ? '…' : ''}.
              Elegí otro día u horario.
            </span>
          </div>
        )}
        {bloquean.length === 0 && avisan.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900" role="status">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <span className="min-w-0 break-words">
              Se cruza con {avisan.length === 1 ? 'una propuesta tuya' : `${avisan.length} propuestas tuyas`} sin confirmar
              ({avisan.slice(0, 3).map((o) => `«${o.title}»`).join(', ')}{avisan.length > 3 ? '…' : ''}). No te bloquea, pero la que se acepte primero se queda con el horario.
            </span>
          </div>
        )}
        {srvErr && (
          <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-800" role="alert" data-testid="schedule-server-error">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-red-500" aria-hidden />
            <span className="min-w-0 break-words">{srvErr}</span>
          </div>
        )}
        <textarea
          value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} rows={2}
          placeholder="Nota opcional (ej.: necesito que haya alguien en casa)"
          aria-label="Nota opcional"
          className="homy-glass-input w-full rounded-xl p-3 text-sm"
        />
        <DialogFooter className="gap-2">
          <button onClick={() => onOpenChange(false)} className="homy-btn-ghost homy-focus min-h-[44px] px-5 text-sm">Volver</button>
          <button
            onClick={async () => {
              if (error || bloquean.length) return
              const r = await onSubmit(start, end, ds, de, nota.trim())
              if (!r.ok) setServerError({ key, msg: r.error || 'No se pudieron enviar las fechas' })
            }}
            disabled={!!error || bloquean.length > 0 || busy}
            className="homy-btn-primary homy-focus min-h-[44px] px-5 text-sm disabled:opacity-50"
            data-testid="schedule-submit"
          >
            {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <CalendarDays className="size-4" aria-hidden />}
            Enviar fechas
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
