// Calendario del profesional (D21 + franja horaria D23) — consultas a la base. La lógica pura vive en schedule.ts.
import 'server-only'
import type { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import {
  JORNADA_DEFAULT, addDays, busyRangesOf, dateToKey, dayIntervals, dayStatus, dayToDate, freeSlots,
  freeThisWeek, jornadaOf, nextDayWithRoom, todayKey,
  type BusyRange, type Jornada, type DayInterval, type DayKey, type FreeSlot, type ScheduleRole, type ScheduleStatus, type TimeKey,
} from '@/lib/schedule'

type ScheduleCols = {
  startDate: Date | null
  endDate: Date | null
  dailyStart: string | null
  dailyEnd: string | null
  scheduleStatus: string | null
  scheduleProposedBy: string | null
  scheduleNote: string | null
  scheduleUpdatedAt: Date | null
  prevStartDate: Date | null
  prevEndDate: Date | null
  prevDailyStart: string | null
  prevDailyEnd: string | null
}

export const SCHEDULE_SELECT = {
  startDate: true, endDate: true, dailyStart: true, dailyEnd: true, scheduleStatus: true, scheduleProposedBy: true,
  scheduleNote: true, scheduleUpdatedAt: true, prevStartDate: true, prevEndDate: true, prevDailyStart: true, prevDailyEnd: true,
} as const

const k = (d: Date | null) => (d ? dateToKey(d) : null)

/** Vista de las fechas de un proyecto para sus dos partes (días "AAAA-MM-DD", horas "HH:MM"; sin franja = todo el día). */
export function scheduleView(p: ScheduleCols) {
  return {
    status: (p.scheduleStatus as ScheduleStatus | null) || null,
    proposedBy: (p.scheduleProposedBy as ScheduleRole | null) || null,
    startDate: k(p.startDate),
    endDate: k(p.endDate),
    dailyStart: (p.dailyStart as TimeKey | null) || null,
    dailyEnd: (p.dailyEnd as TimeKey | null) || null,
    prevStartDate: k(p.prevStartDate),
    prevEndDate: k(p.prevEndDate),
    prevDailyStart: (p.prevDailyStart as TimeKey | null) || null,
    prevDailyEnd: (p.prevDailyEnd as TimeKey | null) || null,
    note: p.scheduleNote,
    updatedAt: p.scheduleUpdatedAt,
  }
}

export function rangesOfRow(p: ScheduleCols): BusyRange[] {
  return busyRangesOf({
    scheduleStatus: p.scheduleStatus,
    startDate: k(p.startDate),
    endDate: k(p.endDate),
    dailyStart: p.dailyStart,
    dailyEnd: p.dailyEnd,
    prevStartDate: k(p.prevStartDate),
    prevEndDate: k(p.prevEndDate),
    prevDailyStart: p.prevDailyStart,
    prevDailyEnd: p.prevDailyEnd,
  })
}

/** ¿El proyecto nació de una oferta aceptada de ESTE profesional? (bolsa o asistente con oferta, D16) */
export async function bidAcceptedFor(p: { jobId: string | null; professionalId: string }): Promise<boolean> {
  if (!p.jobId) return false
  const job = await db.jobPost.findUnique({ where: { id: p.jobId }, select: { selectedBidId: true } })
  if (!job?.selectedBidId) return false
  const bid = await db.jobBid.findUnique({ where: { id: job.selectedBidId }, select: { professionalId: true, status: true } })
  return !!bid && bid.professionalId === p.professionalId && bid.status === 'aceptado'
}

/** Filtro de proyectos ACTIVOS con fechas de un profesional que tocan [from, to] (también los que están en reprogramación). */
export function scheduledWhere(professionalId: string, from: DayKey, to: DayKey): Prisma.ProjectWhereInput {
  const fromD = dayToDate(from)
  const toD = dayToDate(to)
  return {
    professionalId,
    status: 'activo',
    scheduleStatus: { in: ['propuesta', 'acordada'] },
    OR: [
      { startDate: { lte: toD }, endDate: { gte: fromD } },
      { prevStartDate: { lte: toD }, prevEndDate: { gte: fromD } },
    ],
  }
}

export async function scheduledProjectsOf(professionalId: string, from: DayKey, to: DayKey) {
  return db.project.findMany({
    where: scheduledWhere(professionalId, from, to),
    select: { id: true, title: true, ...SCHEDULE_SELECT },
    orderBy: { startDate: 'asc' },
    take: 500,
  })
}

/** Un día con trabajos, tal como lo ve cualquiera (sin título, cliente, dirección ni nota). */
export type DiaPublico = {
  dia: DayKey
  estado: 'con_lugar' | 'completo'
  /** franjas ocupadas UNIDAS por estado (00:00–24:00 = todo el día) */
  franjas: DayInterval[]
  /** huecos libres dentro de la jornada del profesional */
  libres: FreeSlot[]
}

/** Días con trabajos entre from y to (los que no aparecen están libres), según la jornada del profesional. */
export function publicDays(all: BusyRange[], from: DayKey, to: DayKey, jornada: Jornada = JORNADA_DEFAULT): DiaPublico[] {
  const out: DiaPublico[] = []
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const rs = all.filter((r) => r.start <= d && d <= r.end)
    if (!rs.length) continue
    const franjas = dayIntervals(d, rs)
    out.push({
      dia: d,
      estado: dayStatus(d, rs, jornada) === 'completo' ? 'completo' : 'con_lugar',
      franjas,
      libres: freeSlots(franjas, jornada.desde, jornada.hasta),
    })
  }
  return out
}

/** Disponibilidad ANÓNIMA (sin título, cliente, dirección, nota ni ids): días con franjas unidas. */
export async function availabilityOf(professionalId: string, from: DayKey, to: DayKey, jornada: Jornada = JORNADA_DEFAULT) {
  const rows = await scheduledProjectsOf(professionalId, from, to)
  const all = rows.flatMap(rangesOfRow)
  const today = todayKey()
  return {
    from, to,
    jornada,
    dias: publicDays(all, from, to, jornada),
    proximoDiaConLugar: nextDayWithRoom(all, today > from ? today : from, 366, jornada),
    disponibleEstaSemana: freeThisWeek(all, today, jornada),
  }
}

/**
 * Próximo día con lugar de varios profesionales en UNA consulta (Homy, listados). La jornada de
 * cada uno viene con el perfil que ya leyó quien llama (sin consulta extra).
 */
export async function nextFreeForPros(pros: { id: string; workdayStart?: string | null; workdayEnd?: string | null }[]): Promise<Map<string, { proximoDiaConLugar: DayKey | null; disponibleEstaSemana: boolean }>> {
  const out = new Map<string, { proximoDiaConLugar: DayKey | null; disponibleEstaSemana: boolean }>()
  const professionalIds = pros.map((p) => p.id)
  if (professionalIds.length === 0) return out
  const today = todayKey()
  const rows = await db.project.findMany({
    where: {
      professionalId: { in: professionalIds },
      status: 'activo',
      scheduleStatus: { in: ['propuesta', 'acordada'] },
      OR: [{ endDate: { gte: dayToDate(today) } }, { prevEndDate: { gte: dayToDate(today) } }],
    },
    select: { professionalId: true, ...SCHEDULE_SELECT },
    take: 2000,
  })
  const by = new Map<string, BusyRange[]>()
  for (const r of rows) {
    const list = by.get(r.professionalId) || []
    list.push(...rangesOfRow(r))
    by.set(r.professionalId, list)
  }
  for (const p of pros) {
    const rs = by.get(p.id) || []
    const j = jornadaOf(p.workdayStart, p.workdayEnd)
    out.set(p.id, { proximoDiaConLugar: nextDayWithRoom(rs, today, 366, j), disponibleEstaSemana: freeThisWeek(rs, today, j) })
  }
  return out
}
