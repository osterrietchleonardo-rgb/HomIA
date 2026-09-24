// Calendario del profesional y acuerdo de fechas de un proyecto (D21, 24/09/2026).
// Funciones PURAS (sin base): las usan el servidor, la UI y los tests.
//
// Zona horaria: las fechas del trabajo son DÍAS, no instantes. Viajan como "AAAA-MM-DD" y se
// guardan en la base al MEDIODÍA UTC de ese día (09:00 en Argentina). Así ningún corrimiento
// de zona horaria (UTC-3 en Argentina, UTC en Vercel) cambia el día: para leer el día basta
// con tomar los primeros 10 caracteres del ISO. "Hoy" se calcula siempre en hora argentina.

export const TZ_AR = 'America/Argentina/Buenos_Aires'
export type DayKey = string // "AAAA-MM-DD"

export type ScheduleStatus = 'propuesta' | 'acordada'
export type ScheduleRole = 'profesional' | 'cliente'

/** Rango de días ocupados, sin datos del proyecto (lo que ven terceros). */
export type BusyRange = { start: DayKey; end: DayKey; estado: 'ocupado' | 'por_confirmar' }

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
/** Duración máxima de un trabajo y hasta cuándo se puede agendar. */
export const MAX_DURACION_DIAS = 365
export const MAX_ANTICIPACION_DIAS = 730

export function isDayKey(s: unknown): s is DayKey {
  if (typeof s !== 'string' || !DAY_RE.test(s)) return false
  const d = new Date(`${s}T12:00:00.000Z`)
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s
}

/** Día de hoy en Argentina. */
export function todayKey(now: Date = new Date()): DayKey {
  // en-CA formatea como AAAA-MM-DD
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ_AR, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now)
}

/** "AAAA-MM-DD" → Date al mediodía UTC (lo que se guarda en la base). */
export function dayToDate(k: DayKey): Date {
  return new Date(`${k}T12:00:00.000Z`)
}

/** Date o ISO guardado → "AAAA-MM-DD". Para fechas guardadas al mediodía UTC. */
export function dateToKey(d: Date | string): DayKey {
  const iso = typeof d === 'string' ? d : d.toISOString()
  // un ISO de otra hora se normaliza al día argentino
  if (iso.length >= 19 && iso.slice(11, 19) !== '12:00:00') return todayKey(new Date(iso))
  return iso.slice(0, 10)
}

export function addDays(k: DayKey, n: number): DayKey {
  const d = dayToDate(k)
  d.setUTCDate(d.getUTCDate() + n)
  return d.toISOString().slice(0, 10)
}

/** Días entre a y b (b - a). */
export function diffDays(a: DayKey, b: DayKey): number {
  return Math.round((dayToDate(b).getTime() - dayToDate(a).getTime()) / 86_400_000)
}

/** 0 = domingo … 6 = sábado. */
export function weekday(k: DayKey): number {
  return dayToDate(k).getUTCDay()
}

/** ¿Se tocan dos rangos de días (inclusive)? */
export function rangesOverlap(aStart: DayKey, aEnd: DayKey, bStart: DayKey, bEnd: DayKey): boolean {
  return aStart <= bEnd && bStart <= aEnd
}

export function dayInRanges(k: DayKey, ranges: { start: DayKey; end: DayKey }[]): boolean {
  return ranges.some((r) => r.start <= k && k <= r.end)
}

/** Primer día desde `from` que no cae en ningún rango (ocupado o por confirmar). */
export function nextFreeDay(ranges: { start: DayKey; end: DayKey }[], from: DayKey, maxDays = 180): DayKey | null {
  const sorted = [...ranges].sort((a, b) => (a.start < b.start ? -1 : 1))
  let k = from
  while (diffDays(from, k) <= maxDays) {
    const hit = sorted.find((r) => r.start <= k && k <= r.end)
    if (!hit) return k
    // saltar hasta el día siguiente al fin del rango que lo cubre
    k = addDays(hit.end, 1)
  }
  return null
}

/** ¿Tiene algún día libre desde hoy hasta el domingo de esta semana? */
export function freeThisWeek(ranges: { start: DayKey; end: DayKey }[], today: DayKey): boolean {
  const wd = weekday(today)
  const sunday = addDays(today, wd === 0 ? 0 : 7 - wd)
  const nf = nextFreeDay(ranges, today, 14)
  return nf !== null && nf <= sunday
}

/** Une rangos solapados o contiguos del mismo estado (lo público no deja ver cuántos proyectos hay). */
export function mergeRanges(ranges: BusyRange[]): BusyRange[] {
  const out: BusyRange[] = []
  for (const estado of ['ocupado', 'por_confirmar'] as const) {
    const rs = ranges.filter((r) => r.estado === estado).sort((a, b) => (a.start < b.start ? -1 : 1))
    for (const r of rs) {
      const last = out.length ? out[out.length - 1] : null
      if (last && last.estado === estado && r.start <= addDays(last.end, 1)) {
        if (r.end > last.end) last.end = r.end
      } else out.push({ ...r })
    }
  }
  return out.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.estado === 'ocupado' ? -1 : 1))
}

// ── ¿Se pueden acordar fechas en este proyecto? ──
// "Presupuesto aprobado" en HomIA (no existe un botón de aceptar la cotización):
//   - el proyecto nació de una oferta que el cliente ACEPTÓ en la bolsa (o del asistente con la
//     oferta previa de ese profesional, D16), o
//   - la mano de obra está cotizada y el proyecto ya salió de la etapa `presupuesto`
//     (el cliente vio la cotización y la obra avanzó a materiales/ejecución/revisión).
export type ScheduleEligibilityInput = {
  status: string
  stage: string
  laborCost: number
  bidAccepted: boolean
}

export function scheduleBlockReason(p: ScheduleEligibilityInput): string | null {
  if (p.status !== 'activo' || p.stage === 'finalizado') return `El proyecto está ${p.status === 'activo' ? 'finalizado' : p.status}: ya no se pueden cambiar las fechas`
  if (p.laborCost <= 0) return 'Las fechas se acuerdan cuando el profesional cotiza la mano de obra y el presupuesto queda aprobado'
  if (p.stage === 'presupuesto' && !p.bidAccepted) return 'Las fechas se acuerdan con el presupuesto aprobado: primero el proyecto tiene que pasar a Materiales'
  return null
}

// ── Máquina de estados de las fechas ──
export type ScheduleState = {
  scheduleStatus: ScheduleStatus | null
  scheduleProposedBy: ScheduleRole | null
  startDate: DayKey | null
  endDate: DayKey | null
  // fechas acordadas que siguen vigentes mientras se revisa una reprogramación
  prevStartDate: DayKey | null
  prevEndDate: DayKey | null
  scheduleNote: string | null
}

export type ScheduleAction =
  | { accion: 'proponer'; startDate: DayKey; endDate: DayKey; nota?: string | null }
  | { accion: 'aceptar' }
  | { accion: 'rechazar'; motivo?: string | null }

export type TransitionResult =
  | { ok: true; next: ScheduleState; evento: 'propuesta' | 'contrapropuesta' | 'reprogramacion' | 'propuesta_editada' | 'aceptada' | 'rechazada' | 'reprogramacion_rechazada' }
  | { ok: false; status: 400 | 409; error: string }

/** Validación de un rango propuesto (día de hoy en Argentina). */
export function validateRange(start: DayKey, end: DayKey, today: DayKey): string | null {
  if (!isDayKey(start) || !isDayKey(end)) return 'Fecha inválida: usá el formato AAAA-MM-DD'
  if (start < today) return 'La fecha de inicio no puede ser anterior a hoy'
  if (end < start) return 'La fecha estimada de finalización no puede ser anterior al inicio'
  if (diffDays(start, end) > MAX_DURACION_DIAS) return `El trabajo no puede durar más de ${MAX_DURACION_DIAS} días`
  if (diffDays(today, start) > MAX_ANTICIPACION_DIAS) return 'La fecha de inicio es demasiado lejana'
  return null
}

export function scheduleTransition(s: ScheduleState, a: ScheduleAction, actor: ScheduleRole, today: DayKey): TransitionResult {
  const clean = (t?: string | null) => {
    const v = (t || '').trim()
    return v ? v.slice(0, 500) : null
  }
  if (a.accion === 'proponer') {
    const err = validateRange(a.startDate, a.endDate, today)
    if (err) return { ok: false, status: 400, error: err }
    const base = { scheduleStatus: 'propuesta' as const, scheduleProposedBy: actor, startDate: a.startDate, endDate: a.endDate, scheduleNote: clean(a.nota) }
    if (s.scheduleStatus === null) {
      if (actor !== 'profesional') return { ok: false, status: 409, error: 'Las fechas las propone primero el profesional. Cuando te las mande, podés aceptarlas o proponer otras.' }
      return { ok: true, evento: 'propuesta', next: { ...base, prevStartDate: null, prevEndDate: null } }
    }
    if (s.scheduleStatus === 'propuesta') {
      const evento = s.scheduleProposedBy === actor ? 'propuesta_editada' : 'contrapropuesta'
      return { ok: true, evento, next: { ...base, prevStartDate: s.prevStartDate, prevEndDate: s.prevEndDate } }
    }
    // acordada → reprogramación: la fecha acordada sigue vigente hasta que el otro decida
    return { ok: true, evento: 'reprogramacion', next: { ...base, prevStartDate: s.startDate, prevEndDate: s.endDate } }
  }
  if (s.scheduleStatus !== 'propuesta') {
    return { ok: false, status: 409, error: s.scheduleStatus === 'acordada' ? 'Las fechas ya están acordadas: no hay ninguna propuesta pendiente' : 'No hay ninguna propuesta de fechas pendiente' }
  }
  if (s.scheduleProposedBy === actor) {
    return { ok: false, status: 409, error: 'No podés aceptar ni rechazar tu propia propuesta: la decide la otra parte' }
  }
  if (a.accion === 'aceptar') {
    return {
      ok: true, evento: 'aceptada',
      next: { ...s, scheduleStatus: 'acordada', prevStartDate: null, prevEndDate: null },
    }
  }
  // rechazar
  if (s.prevStartDate && s.prevEndDate) {
    // se rechaza una reprogramación: vuelven a regir las fechas acordadas antes
    return {
      ok: true, evento: 'reprogramacion_rechazada',
      next: { scheduleStatus: 'acordada', scheduleProposedBy: s.scheduleProposedBy === 'profesional' ? 'cliente' : 'profesional', startDate: s.prevStartDate, endDate: s.prevEndDate, prevStartDate: null, prevEndDate: null, scheduleNote: null },
    }
  }
  // sin fechas: queda anotado quién rechazó (scheduleProposedBy) y el motivo (scheduleNote)
  return {
    ok: true, evento: 'rechazada',
    next: { scheduleStatus: null, scheduleProposedBy: actor, startDate: null, endDate: null, prevStartDate: null, prevEndDate: null, scheduleNote: clean(a.motivo) },
  }
}

/** Rangos que ocupan a un profesional según el estado de las fechas de un proyecto. */
export function busyRangesOf(p: { scheduleStatus: string | null; startDate: DayKey | null; endDate: DayKey | null; prevStartDate: DayKey | null; prevEndDate: DayKey | null }): BusyRange[] {
  const out: BusyRange[] = []
  if (!p.startDate || !p.endDate) return out
  if (p.scheduleStatus === 'acordada') out.push({ start: p.startDate, end: p.endDate, estado: 'ocupado' })
  else if (p.scheduleStatus === 'propuesta') {
    out.push({ start: p.startDate, end: p.endDate, estado: 'por_confirmar' })
    if (p.prevStartDate && p.prevEndDate) out.push({ start: p.prevStartDate, end: p.prevEndDate, estado: 'ocupado' })
  }
  return out
}

/** "14/10" */
export function shortDay(k: DayKey): string {
  return `${k.slice(8, 10)}/${k.slice(5, 7)}`
}

/** "mar 14 oct" */
export function longDay(k: DayKey): string {
  return new Intl.DateTimeFormat('es-AR', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(dayToDate(k))
}
