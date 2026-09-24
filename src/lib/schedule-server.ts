// Calendario del profesional (D21) — consultas a la base. La lógica pura vive en schedule.ts.
import 'server-only'
import { db } from '@/lib/db'
import {
  busyRangesOf, dateToKey, dayToDate, freeThisWeek, mergeRanges, nextFreeDay, todayKey,
  type BusyRange, type DayKey, type ScheduleRole, type ScheduleStatus,
} from '@/lib/schedule'

type ScheduleCols = {
  startDate: Date | null
  endDate: Date | null
  scheduleStatus: string | null
  scheduleProposedBy: string | null
  scheduleNote: string | null
  scheduleUpdatedAt: Date | null
  prevStartDate: Date | null
  prevEndDate: Date | null
}

export const SCHEDULE_SELECT = {
  startDate: true, endDate: true, scheduleStatus: true, scheduleProposedBy: true, scheduleNote: true,
  scheduleUpdatedAt: true, prevStartDate: true, prevEndDate: true,
} as const

const k = (d: Date | null) => (d ? dateToKey(d) : null)

/** Vista de las fechas de un proyecto para sus dos partes (días como "AAAA-MM-DD"). */
export function scheduleView(p: ScheduleCols) {
  return {
    status: (p.scheduleStatus as ScheduleStatus | null) || null,
    proposedBy: (p.scheduleProposedBy as ScheduleRole | null) || null,
    startDate: k(p.startDate),
    endDate: k(p.endDate),
    prevStartDate: k(p.prevStartDate),
    prevEndDate: k(p.prevEndDate),
    note: p.scheduleNote,
    updatedAt: p.scheduleUpdatedAt,
  }
}

export function rangesOfRow(p: ScheduleCols): BusyRange[] {
  return busyRangesOf({
    scheduleStatus: p.scheduleStatus,
    startDate: k(p.startDate),
    endDate: k(p.endDate),
    prevStartDate: k(p.prevStartDate),
    prevEndDate: k(p.prevEndDate),
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

/** Proyectos ACTIVOS con fechas de un profesional que tocan [from, to] (también los que están en reprogramación). */
export async function scheduledProjectsOf(professionalId: string, from: DayKey, to: DayKey) {
  const fromD = dayToDate(from)
  const toD = dayToDate(to)
  return db.project.findMany({
    where: {
      professionalId,
      status: 'activo',
      scheduleStatus: { in: ['propuesta', 'acordada'] },
      OR: [
        { startDate: { lte: toD }, endDate: { gte: fromD } },
        { prevStartDate: { lte: toD }, prevEndDate: { gte: fromD } },
      ],
    },
    select: { id: true, title: true, ...SCHEDULE_SELECT },
    orderBy: { startDate: 'asc' },
    take: 500,
  })
}

/** Disponibilidad ANÓNIMA (sin título, cliente, dirección ni nota): solo rangos unidos. */
export async function availabilityOf(professionalId: string, from: DayKey, to: DayKey) {
  const rows = await scheduledProjectsOf(professionalId, from, to)
  const all = rows.flatMap(rangesOfRow)
  const ranges = mergeRanges(all)
    .filter((r) => r.end >= from && r.start <= to)
    .map((r) => ({ ...r, start: r.start < from ? from : r.start, end: r.end > to ? to : r.end }))
  const today = todayKey()
  return {
    from, to, ranges,
    proximaFechaLibre: nextFreeDay(all, today > from ? today : from, 366),
    disponibleEstaSemana: freeThisWeek(all, today),
  }
}

/** Próxima fecha libre de varios profesionales en UNA consulta (Homy, listados). */
export async function nextFreeForPros(professionalIds: string[]): Promise<Map<string, { proximaFechaLibre: DayKey | null; disponibleEstaSemana: boolean }>> {
  const out = new Map<string, { proximaFechaLibre: DayKey | null; disponibleEstaSemana: boolean }>()
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
  for (const id of professionalIds) {
    const rs = by.get(id) || []
    out.set(id, { proximaFechaLibre: nextFreeDay(rs, today, 366), disponibleEstaSemana: freeThisWeek(rs, today) })
  }
  return out
}
