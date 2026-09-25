// Calendario del profesional y acuerdo de fechas de un proyecto (D21, 24/09/2026) con franja
// horaria diaria (D23, 25/09/2026). Funciones PURAS (sin base): las usan el servidor, la UI y los tests.
//
// Zona horaria: las fechas del trabajo son DÍAS, no instantes. Viajan como "AAAA-MM-DD" y se
// guardan en la base al MEDIODÍA UTC de ese día (09:00 en Argentina). Así ningún corrimiento
// de zona horaria (UTC-3 en Argentina, UTC en Vercel) cambia el día: para leer el día basta
// con tomar los primeros 10 caracteres del ISO. "Hoy" se calcula siempre en hora argentina.
//
// Franja horaria (D23): un proyecto ocupa, CADA día entre startDate y endDate (inclusive), la
// franja dailyStart–dailyEnd ("HH:MM", hora argentina, pasos de 15 min, fin > inicio, el mismo
// día: nada cruza la medianoche). Sin franja (null) = DÍA COMPLETO: así quedan los proyectos que
// ya tenían fechas antes de D23. Las horas son texto de reloj, no instantes: no hay zona que convertir.

export const TZ_AR = 'America/Argentina/Buenos_Aires'
export type DayKey = string // "AAAA-MM-DD"
export type TimeKey = string // "HH:MM"

export type ScheduleStatus = 'propuesta' | 'acordada'
export type ScheduleRole = 'profesional' | 'cliente'

/**
 * Rango de días ocupados, sin datos del proyecto. `dailyStart`/`dailyEnd` = franja de cada día
 * (null o ausente = día completo).
 */
export type BusyRange = {
  start: DayKey
  end: DayKey
  estado: 'ocupado' | 'por_confirmar'
  dailyStart?: TimeKey | null
  dailyEnd?: TimeKey | null
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/
/** Duración máxima de un trabajo y hasta cuándo se puede agendar. */
export const MAX_DURACION_DIAS = 365
export const MAX_ANTICIPACION_DIAS = 730

// ── Horas ──
/** Horas que ofrece el selector de la UI: todo el día de a 15 minutos (los trabajos NO quedan limitados a la jornada). */
export const HORA_MIN: TimeKey = '00:00'
export const HORA_MAX: TimeKey = '23:45'
/**
 * Jornada de referencia para decidir si un día está "completo" (D23): si lo ocupado cubre entera
 * la jornada, el día se muestra completo; si queda algún hueco adentro, "con lugar". Por defecto
 * 06:00–18:00 (Leonardo, 25/09/2026); cada profesional puede configurar la suya
 * (`ProfessionalProfile.workdayStart/workdayEnd`, null = por defecto).
 */
export const JORNADA_INICIO: TimeKey = '06:00'
export const JORNADA_FIN: TimeKey = '18:00'
export type Jornada = { desde: TimeKey; hasta: TimeKey }
export const JORNADA_DEFAULT: Jornada = { desde: JORNADA_INICIO, hasta: JORNADA_FIN }
/** Minutos de un día completo. */
const DIA_MIN = 24 * 60

const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/

export function isTimeKey(s: unknown): s is TimeKey {
  return typeof s === 'string' && TIME_RE.test(s)
}

/** "07:30" → 450. Acepta "24:00" (fin del día completo). */
export function toMinutes(t: TimeKey): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5))
}

/** 450 → "07:30" (1440 → "24:00"). */
export function fromMinutes(m: number): TimeKey {
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
}

/** Horas del selector: de HORA_MIN a HORA_MAX cada 15 minutos. */
export function timeOptions(from: TimeKey = HORA_MIN, to: TimeKey = HORA_MAX): TimeKey[] {
  const out: TimeKey[] = []
  for (let m = toMinutes(from); m <= toMinutes(to); m += 15) out.push(fromMinutes(m))
  return out
}

/** Jornada de un profesional: la suya si es válida, si no la de referencia (06:00–18:00). */
export function jornadaOf(ws?: string | null, we?: string | null): Jornada {
  if (ws && we && validateSlot(ws, we) === null) return { desde: ws, hasta: we }
  return { ...JORNADA_DEFAULT }
}

/** Validación de la franja: las dos horas o ninguna (= todo el día); HH:MM de a 15 min; fin > inicio. */
export function validateSlot(a: TimeKey | null | undefined, b: TimeKey | null | undefined): string | null {
  const hasA = a != null && a !== ''
  const hasB = b != null && b !== ''
  if (!hasA && !hasB) return null
  if (!hasA || !hasB) return 'Indicá la hora de inicio y la de fin, o elegí "Todo el día"'
  if (!isTimeKey(a) || !isTimeKey(b)) return 'Hora inválida: usá el formato HH:MM (por ejemplo 07:00)'
  if (toMinutes(a) % 15 !== 0 || toMinutes(b) % 15 !== 0) return 'Las horas van de a 15 minutos (por ejemplo 07:00, 07:15, 07:30)'
  if (toMinutes(b) <= toMinutes(a)) return 'La hora de fin tiene que ser posterior a la de inicio (el mismo día)'
  return null
}

/** Franja en minutos; sin franja = día completo [0, 1440). */
export function slotMinutes(a?: TimeKey | null, b?: TimeKey | null): [number, number] {
  if (!a || !b) return [0, DIA_MIN]
  return [toMinutes(a), toMinutes(b)]
}

/** ¿Se cruzan dos franjas? Bordes que se tocan (12:00 y 12:00) no chocan; día completo choca con todo. */
export function slotsOverlap(aS?: TimeKey | null, aE?: TimeKey | null, bS?: TimeKey | null, bE?: TimeKey | null): boolean {
  const [a0, a1] = slotMinutes(aS, aE)
  const [b0, b1] = slotMinutes(bS, bE)
  return a0 < b1 && b0 < a1
}

export type Sched = { start: DayKey; end: DayKey; dailyStart?: TimeKey | null; dailyEnd?: TimeKey | null }

/** Dos trabajos chocan si se cruzan sus días Y sus franjas. */
export function schedulesCollide(a: Sched, b: Sched): boolean {
  return rangesOverlap(a.start, a.end, b.start, b.end) && slotsOverlap(a.dailyStart, a.dailyEnd, b.dailyStart, b.dailyEnd)
}

/**
 * Con qué trabajos choca un candidato. Regla D23: contra lo ACORDADO ("ocupado") bloquea; contra
 * lo PROPUESTO ("por_confirmar") solo avisa (tal vez no se acepte). Un mismo proyecto aparece a lo
 * sumo una vez y, si bloquea, no se repite en los avisos.
 */
export function findCollisions<T extends Sched & { id: string; estado: 'ocupado' | 'por_confirmar' }>(cand: Sched, items: T[]): { bloquean: T[]; avisan: T[] } {
  const bloquean: T[] = []
  const avisan: T[] = []
  const seen = new Set<string>()
  for (const it of items.filter((x) => x.estado === 'ocupado')) {
    if (!seen.has(it.id) && schedulesCollide(cand, it)) { bloquean.push(it); seen.add(it.id) }
  }
  for (const it of items.filter((x) => x.estado === 'por_confirmar')) {
    if (!seen.has(it.id) && schedulesCollide(cand, it)) { avisan.push(it); seen.add(it.id) }
  }
  return { bloquean, avisan }
}

// ── Días ──
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

// ── Ocupación de un día ──
export type DayInterval = { desde: TimeKey; hasta: TimeKey; estado: 'ocupado' | 'por_confirmar' }
export type FreeSlot = { desde: TimeKey; hasta: TimeKey }
export type DayEstado = 'libre' | 'con_lugar' | 'completo'

/** Une intervalos [ini, fin) en minutos que se pisan o se tocan. */
function unionMinutes(iv: [number, number][]): [number, number][] {
  const s = [...iv].sort((a, b) => a[0] - b[0])
  const out: [number, number][] = []
  for (const [a, b] of s) {
    const last = out[out.length - 1]
    if (last && a <= last[1]) last[1] = Math.max(last[1], b)
    else out.push([a, b])
  }
  return out
}

/**
 * Franjas ocupadas de un día, UNIDAS por estado (lo público no deja contar trabajos). Día completo
 * = 00:00–24:00. Ordenadas por hora.
 */
export function dayIntervals(k: DayKey, ranges: BusyRange[]): DayInterval[] {
  const out: DayInterval[] = []
  for (const estado of ['ocupado', 'por_confirmar'] as const) {
    const iv = ranges
      .filter((r) => r.estado === estado && r.start <= k && k <= r.end)
      .map((r) => slotMinutes(r.dailyStart, r.dailyEnd))
    for (const [a, b] of unionMinutes(iv)) out.push({ desde: fromMinutes(a), hasta: fromMinutes(b), estado })
  }
  return out.sort((x, y) => (x.desde < y.desde ? -1 : x.desde > y.desde ? 1 : x.estado === 'ocupado' ? -1 : 1))
}

/** Huecos libres entre `from` y `to` (HH:MM) dada la ocupación del día (cualquier estado). */
export function freeSlots(intervals: { desde: TimeKey; hasta: TimeKey }[], from: TimeKey, to: TimeKey): FreeSlot[] {
  const lo = toMinutes(from)
  const hi = toMinutes(to)
  const busy = unionMinutes(intervals.map((i) => [toMinutes(i.desde), toMinutes(i.hasta)] as [number, number]))
  const out: FreeSlot[] = []
  let cur = lo
  for (const [a, b] of busy) {
    if (b <= cur) continue
    if (a >= hi) break
    if (a > cur) out.push({ desde: fromMinutes(cur), hasta: fromMinutes(Math.min(a, hi)) })
    cur = Math.max(cur, b)
    if (cur >= hi) break
  }
  if (cur < hi) out.push({ desde: fromMinutes(cur), hasta: fromMinutes(hi) })
  return out
}

/**
 * Estado de un día: "libre" (sin trabajos), "completo" (lo ocupado —acordado o propuesto, criterio
 * conservador— cubre entera la jornada del profesional, por defecto 06:00–18:00) o "con_lugar" (hay
 * trabajos pero quedan horas libres dentro de la jornada). Un trabajo fuera de la jornada cuenta
 * como trabajo (el día deja de estar "libre") pero no la llena.
 */
export function dayStatus(k: DayKey, ranges: BusyRange[], jornada: Jornada = JORNADA_DEFAULT): DayEstado {
  const iv = dayIntervals(k, ranges)
  if (iv.length === 0) return 'libre'
  return freeSlots(iv, jornada.desde, jornada.hasta).length === 0 ? 'completo' : 'con_lugar'
}

/** Primer día desde `from` que NO está completo (libre o con lugar). */
export function nextDayWithRoom(ranges: BusyRange[], from: DayKey, maxDays = 180, jornada: Jornada = JORNADA_DEFAULT): DayKey | null {
  for (let i = 0; i <= maxDays; i++) {
    const k = addDays(from, i)
    const rs = ranges.filter((r) => r.start <= k && k <= r.end)
    if (rs.length === 0 || dayStatus(k, rs, jornada) !== 'completo') return k
  }
  return null
}

/** ¿Tiene algún día con lugar desde hoy hasta el domingo de esta semana? */
export function freeThisWeek(ranges: BusyRange[], today: DayKey, jornada: Jornada = JORNADA_DEFAULT): boolean {
  const wd = weekday(today)
  const sunday = addDays(today, wd === 0 ? 0 : 7 - wd)
  const nf = nextDayWithRoom(ranges, today, 14, jornada)
  return nf !== null && nf <= sunday
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
  // franja diaria (null = todo el día)
  dailyStart: TimeKey | null
  dailyEnd: TimeKey | null
  // fechas (y franja) acordadas que siguen vigentes mientras se revisa una reprogramación
  prevStartDate: DayKey | null
  prevEndDate: DayKey | null
  prevDailyStart: TimeKey | null
  prevDailyEnd: TimeKey | null
  scheduleNote: string | null
}

export type ScheduleAction =
  | { accion: 'proponer'; startDate: DayKey; endDate: DayKey; dailyStart?: TimeKey | null; dailyEnd?: TimeKey | null; nota?: string | null }
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
    const err = validateRange(a.startDate, a.endDate, today) || validateSlot(a.dailyStart, a.dailyEnd)
    if (err) return { ok: false, status: 400, error: err }
    const base = {
      scheduleStatus: 'propuesta' as const, scheduleProposedBy: actor, startDate: a.startDate, endDate: a.endDate,
      dailyStart: a.dailyStart || null, dailyEnd: a.dailyEnd || null, scheduleNote: clean(a.nota),
    }
    if (s.scheduleStatus === null) {
      if (actor !== 'profesional') return { ok: false, status: 409, error: 'Las fechas las propone primero el profesional. Cuando te las mande, podés aceptarlas o proponer otras.' }
      return { ok: true, evento: 'propuesta', next: { ...base, prevStartDate: null, prevEndDate: null, prevDailyStart: null, prevDailyEnd: null } }
    }
    if (s.scheduleStatus === 'propuesta') {
      const evento = s.scheduleProposedBy === actor ? 'propuesta_editada' : 'contrapropuesta'
      return { ok: true, evento, next: { ...base, prevStartDate: s.prevStartDate, prevEndDate: s.prevEndDate, prevDailyStart: s.prevDailyStart, prevDailyEnd: s.prevDailyEnd } }
    }
    // acordada → reprogramación: la fecha (y la franja) acordada sigue vigente hasta que el otro decida
    return { ok: true, evento: 'reprogramacion', next: { ...base, prevStartDate: s.startDate, prevEndDate: s.endDate, prevDailyStart: s.dailyStart, prevDailyEnd: s.dailyEnd } }
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
      next: { ...s, scheduleStatus: 'acordada', prevStartDate: null, prevEndDate: null, prevDailyStart: null, prevDailyEnd: null },
    }
  }
  // rechazar
  if (s.prevStartDate && s.prevEndDate) {
    // se rechaza una reprogramación: vuelven a regir las fechas (y la franja) acordadas antes
    return {
      ok: true, evento: 'reprogramacion_rechazada',
      next: {
        scheduleStatus: 'acordada', scheduleProposedBy: s.scheduleProposedBy === 'profesional' ? 'cliente' : 'profesional',
        startDate: s.prevStartDate, endDate: s.prevEndDate, dailyStart: s.prevDailyStart, dailyEnd: s.prevDailyEnd,
        prevStartDate: null, prevEndDate: null, prevDailyStart: null, prevDailyEnd: null, scheduleNote: null,
      },
    }
  }
  // sin fechas: queda anotado quién rechazó (scheduleProposedBy) y el motivo (scheduleNote)
  return {
    ok: true, evento: 'rechazada',
    next: {
      scheduleStatus: null, scheduleProposedBy: actor, startDate: null, endDate: null, dailyStart: null, dailyEnd: null,
      prevStartDate: null, prevEndDate: null, prevDailyStart: null, prevDailyEnd: null, scheduleNote: clean(a.motivo),
    },
  }
}

/** Rangos que ocupan a un profesional según el estado de las fechas de un proyecto. */
export function busyRangesOf(p: {
  scheduleStatus: string | null; startDate: DayKey | null; endDate: DayKey | null; prevStartDate: DayKey | null; prevEndDate: DayKey | null
  dailyStart?: TimeKey | null; dailyEnd?: TimeKey | null; prevDailyStart?: TimeKey | null; prevDailyEnd?: TimeKey | null
}): BusyRange[] {
  const out: BusyRange[] = []
  if (!p.startDate || !p.endDate) return out
  const cur = { start: p.startDate, end: p.endDate, dailyStart: p.dailyStart || null, dailyEnd: p.dailyEnd || null }
  if (p.scheduleStatus === 'acordada') out.push({ ...cur, estado: 'ocupado' })
  else if (p.scheduleStatus === 'propuesta') {
    out.push({ ...cur, estado: 'por_confirmar' })
    if (p.prevStartDate && p.prevEndDate) out.push({ start: p.prevStartDate, end: p.prevEndDate, dailyStart: p.prevDailyStart || null, dailyEnd: p.prevDailyEnd || null, estado: 'ocupado' })
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

/** "07:00–12:00" o "Todo el día". */
export function slotLabel(a?: TimeKey | null, b?: TimeKey | null): string {
  return a && b ? `${a}–${b}` : 'Todo el día'
}

/** "de 07:00 a 12:00 cada día" / "de 07:00 a 12:00" / "todo el día". */
export function slotText(a: TimeKey | null | undefined, b: TimeKey | null | undefined, multiDay: boolean): string {
  if (!a || !b) return 'todo el día'
  return `de ${a} a ${b}${multiDay ? ' cada día' : ''}`
}

/** "del 03/10 al 05/10, de 07:00 a 12:00 cada día" / "el 03/10, todo el día". */
export function scheduleText(start: DayKey, end: DayKey, a?: TimeKey | null, b?: TimeKey | null): string {
  const multi = start !== end
  const dias = multi ? `del ${shortDay(start)} al ${shortDay(end)}` : `el ${shortDay(start)}`
  return `${dias}, ${slotText(a, b, multi)}`
}
