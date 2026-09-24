'use client'
// Tarjeta "Fechas del trabajo" del detalle de proyecto (D21), para el profesional y el cliente.
// El profesional propone inicio + fin estimado; la otra parte acepta, rechaza o propone otra;
// lo acordado se puede reprogramar (sigue vigente hasta que el otro decida).
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { CalendarDays, CalendarCheck2, CalendarClock, CalendarX2, Check, Loader2, Pencil, TriangleAlert, X, Info } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { diffDays, longDay, rangesOverlap, todayKey, type DayKey } from '@/lib/schedule'

export type ScheduleInfo = {
  status: 'propuesta' | 'acordada' | null
  proposedBy: 'profesional' | 'cliente' | null
  startDate: DayKey | null
  endDate: DayKey | null
  prevStartDate: DayKey | null
  prevEndDate: DayKey | null
  note: string | null
  updatedAt: string | null
}

type Role = 'profesional' | 'cliente'
const NET_ERROR = 'No pudimos conectar con HomIA. Revisá tu conexión y probá de nuevo.'

function rangeText(a: DayKey, b: DayKey) {
  const dias = diffDays(a, b) + 1
  return { texto: a === b ? longDay(a) : `${longDay(a)} → ${longDay(b)}`, dias: `${dias} día${dias === 1 ? '' : 's'}` }
}

export default function ScheduleCard({
  projectId, role, otherName, schedule, blocked, onChanged,
}: {
  projectId: string
  role: Role
  /** nombre de la otra parte ("Juan", "tu cliente") */
  otherName: string
  schedule: ScheduleInfo | null | undefined
  /** motivo por el que todavía no se pueden acordar fechas (null = se puede) */
  blocked: string | null | undefined
  onChanged: () => void
}) {
  const s: ScheduleInfo = schedule || { status: null, proposedBy: null, startDate: null, endDate: null, prevStartDate: null, prevEndDate: null, note: null, updatedAt: null }
  const [busy, setBusy] = useState<string | null>(null)
  const [proposeOpen, setProposeOpen] = useState(false)
  const [rejectOpen, setRejectOpen] = useState(false)
  const [motivo, setMotivo] = useState('')

  const other: Role = role === 'profesional' ? 'cliente' : 'profesional'
  const mine = s.status === 'propuesta' && s.proposedBy === role
  const theirs = s.status === 'propuesta' && s.proposedBy === other
  const reprogramando = s.status === 'propuesta' && !!s.prevStartDate && !!s.prevEndDate
  const canAct = !blocked

  async function send(body: Record<string, unknown>, key: string, okMsg: string): Promise<boolean> {
    setBusy(key)
    try {
      const res = await fetch(`/api/projects/${projectId}/schedule`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      const d = await res.json().catch(() => ({})) as { error?: string; solapamiento?: { cantidad: number } | null }
      if (!res.ok) { toast.error(d.error || 'No se pudieron actualizar las fechas'); return false }
      toast.success(okMsg)
      const n = d.solapamiento?.cantidad || 0
      if (n > 0) {
        toast.warning(role === 'profesional'
          ? `Ojo: se superpone con ${n} trabajo${n === 1 ? '' : 's'} tuyo${n === 1 ? '' : 's'} en ese período. Podés llevarlos en paralelo si te organizás.`
          : `El profesional ya tiene ${n} trabajo${n === 1 ? '' : 's'} en parte de ese período. Si te preocupa, consultale por el chat.`)
      }
      onChanged()
      return true
    } catch {
      toast.error(NET_ERROR)
      return false
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
        <DateBox label="Acordadas" start={s.startDate} end={s.endDate} solid />
      )}
      {reprogramando && (
        <DateBox label="Vigentes (acordadas)" start={s.prevStartDate!} end={s.prevEndDate!} solid />
      )}
      {s.status === 'propuesta' && s.startDate && s.endDate && (
        <DateBox
          label={`${reprogramando ? 'Cambio propuesto' : 'Propuestas'} por ${who(s.proposedBy).toLowerCase()}`}
          start={s.startDate} end={s.endDate}
        />
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
            ? `Proponé cuándo arrancás y cuándo estimás terminar. ${otherName} las acepta, las rechaza o te propone otras.`
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
        initial={s.status === 'propuesta' && s.startDate && s.endDate ? { start: s.startDate, end: s.endDate } : s.status === 'acordada' && s.startDate && s.endDate ? { start: s.startDate, end: s.endDate } : null}
        title={s.status === 'acordada' ? 'Pedir reprogramar' : theirs ? 'Proponer otras fechas' : mine ? 'Cambiar tu propuesta' : 'Proponer fechas'}
        busy={busy === 'proponer'}
        onSubmit={async (start, end, nota) => {
          const okd = await send({ accion: 'proponer', startDate: start, endDate: end, nota: nota || undefined }, 'proponer',
            s.status === 'acordada' ? `Le pediste a ${otherName} reprogramar` : `Fechas enviadas a ${otherName}`)
          if (okd) setProposeOpen(false)
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
              onClick={async () => { const okd = await send({ accion: 'rechazar', motivo: motivo.trim() || undefined }, 'rechazar', reprogramando ? 'Siguen las fechas acordadas' : 'Rechazaste las fechas'); if (okd) setRejectOpen(false) }}
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

function DateBox({ label, start, end, solid = false }: { label: string; start: DayKey; end: DayKey; solid?: boolean }) {
  const r = rangeText(start, end)
  return (
    <div className={`mt-3 rounded-2xl px-4 py-3 ${solid ? 'bg-emerald-50 ring-1 ring-emerald-200' : 'border-2 border-dashed border-amber-300 bg-amber-50/60'}`}>
      <p className={`text-[10.5px] font-extrabold uppercase tracking-[0.12em] ${solid ? 'text-emerald-700' : 'text-amber-700'}`}>{label}</p>
      <p className="mt-0.5 break-words text-base font-extrabold capitalize text-[#0A2540]">{r.texto}</p>
      <p className="text-xs font-semibold text-slate-500">{r.dias} · inicio y fin estimado</p>
    </div>
  )
}

function ProposeDialog({
  open, onOpenChange, role, projectId, initial, title, busy, onSubmit,
}: {
  open: boolean
  onOpenChange: (v: boolean) => void
  role: Role
  projectId: string
  initial: { start: DayKey; end: DayKey } | null
  title: string
  busy: boolean
  onSubmit: (start: DayKey, end: DayKey, nota: string) => void
}) {
  const today = todayKey()
  // el diálogo se monta al abrirse: arranca con la propuesta vigente (o hoy)
  const st0 = initial && initial.start >= today ? initial.start : today
  const [start, setStart] = useState(st0)
  const [end, setEnd] = useState(initial && initial.end >= st0 ? initial.end : st0)
  const [nota, setNota] = useState('')
  // superposición calculada para un rango concreto ("inicio|fin"): si cambió el rango, no se muestra
  const [overlapFor, setOverlapFor] = useState<{ key: string; hits: { title: string; estado: string }[] } | null>(null)
  const overlaps = overlapFor && overlapFor.key === `${start}|${end}` ? overlapFor.hits : null

  // aviso en vivo de superposición: solo el profesional (con su propio calendario)
  useEffect(() => {
    if (!open || role !== 'profesional' || !start || !end || end < start) return
    const ctrl = new AbortController()
    const t = setTimeout(() => {
      fetch(`/api/professional/calendar?from=${start}&to=${end}`, { signal: ctrl.signal })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: { projects?: { id: string; title: string; status: string; ranges: { start: string; end: string; estado: string }[] }[] } | null) => {
          if (!d?.projects) return
          const hits = d.projects
            .filter((p) => p.id !== projectId && p.status === 'activo')
            .flatMap((p) => p.ranges.filter((r) => rangesOverlap(r.start, r.end, start, end)).slice(0, 1).map((r) => ({ title: p.title, estado: r.estado })))
          setOverlapFor({ key: `${start}|${end}`, hits })
        })
        .catch(() => { /* sin aviso si falla: el servidor igual avisa al enviar */ })
    }, 250)
    return () => { clearTimeout(t); ctrl.abort() }
  }, [open, role, start, end, projectId])

  const error = !start || !end ? 'Elegí las dos fechas'
    : start < today ? 'El inicio no puede ser anterior a hoy'
    : end < start ? 'El fin estimado no puede ser anterior al inicio'
    : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-[#0A2540]">{title}</DialogTitle>
          <DialogDescription>
            {role === 'profesional' ? 'Cuándo arrancás y cuándo estimás terminar. El cliente las acepta, las rechaza o te propone otras.' : 'Proponé cuándo te queda bien. El profesional las acepta, las rechaza o te propone otras.'}
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
        {!error && start && end && (
          <p className="text-xs font-semibold text-slate-500">{rangeText(start, end).dias} de trabajo · {rangeText(start, end).texto}</p>
        )}
        {error && <p className="text-xs font-bold text-red-500" role="alert">{error}</p>}
        {overlaps && overlaps.length > 0 && (
          <div className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-3 text-sm text-amber-900" role="status">
            <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden />
            <span>
              Se superpone con {overlaps.length} trabajo{overlaps.length === 1 ? '' : 's'} ese período
              ({overlaps.slice(0, 3).map((o) => `${o.title}${o.estado === 'por_confirmar' ? ' — por confirmar' : ''}`).join(', ')}{overlaps.length > 3 ? '…' : ''}).
              No te bloquea: podés llevarlos en paralelo.
            </span>
          </div>
        )}
        <textarea
          value={nota} onChange={(e) => setNota(e.target.value)} maxLength={500} rows={2}
          placeholder="Nota opcional (ej.: arranco a las 8, necesito que haya alguien en casa)"
          aria-label="Nota opcional"
          className="homy-glass-input w-full rounded-xl p-3 text-sm"
        />
        <DialogFooter className="gap-2">
          <button onClick={() => onOpenChange(false)} className="homy-btn-ghost homy-focus min-h-[44px] px-5 text-sm">Volver</button>
          <button
            onClick={() => !error && onSubmit(start, end, nota.trim())}
            disabled={!!error || busy}
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
