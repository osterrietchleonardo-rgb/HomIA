// Calendario del profesional (D21 + horarios D23): SUS proyectos con fechas (y franja horaria) en
// una ventana de días, los que todavía no tienen fechas (presupuesto aprobado), las propuestas del
// cliente que esperan su respuesta y SU jornada de trabajo. PATCH: cambiar la jornada.
// Solo el propio profesional (sale de la sesión, nunca de la query ni del body).
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { JORNADA_DEFAULT, addDays, dayToDate, diffDays, isDayKey, jornadaOf, todayKey, validateSlot } from '@/lib/schedule'
import { SCHEDULE_SELECT, rangesOfRow, scheduleView } from '@/lib/schedule-server'

const day = z.string().refine(isDayKey, 'Fecha inválida: usá el formato AAAA-MM-DD')
const querySchema = z.object({ from: day.optional(), to: day.optional() })
const MAX_VENTANA = 190

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id }, select: { id: true, workdayStart: true, workdayEnd: true } })
  if (!pro) return fail('El calendario es para profesionales', 403, { needsRole: 'profesional' })

  const q = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!q.success) return fail(q.error.issues[0]?.message || 'Parámetros inválidos')
  const today = todayKey()
  const from = q.data.from || `${today.slice(0, 7)}-01`
  const to = q.data.to || addDays(from, 41)
  if (to < from) return fail('El fin de la ventana no puede ser anterior al inicio')
  if (diffDays(from, to) > MAX_VENTANA) return fail(`La ventana puede tener hasta ${MAX_VENTANA} días`)

  const fromD = dayToDate(from)
  const toD = dayToDate(to)
  const [withDates, sinFechaRows] = await Promise.all([
    db.project.findMany({
      where: {
        professionalId: pro.id,
        status: { in: ['activo', 'finalizado'] },
        scheduleStatus: { in: ['propuesta', 'acordada'] },
        OR: [
          { startDate: { lte: toD }, endDate: { gte: fromD } },
          { prevStartDate: { lte: toD }, prevEndDate: { gte: fromD } },
        ],
      },
      select: { id: true, title: true, stage: true, status: true, client: { select: { displayName: true } }, ...SCHEDULE_SELECT },
      orderBy: { startDate: 'asc' },
      take: 300,
    }),
    db.project.findMany({
      where: { professionalId: pro.id, status: 'activo', stage: { not: 'finalizado' }, scheduleStatus: null, laborCost: { gt: 0 } },
      select: { id: true, title: true, stage: true, jobId: true, scheduleProposedBy: true, scheduleNote: true, client: { select: { displayName: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ])

  // "sin fecha todavía": presupuesto aprobado (salió de presupuesto, o nació de SU oferta aceptada)
  const jobIds = sinFechaRows.filter((p) => p.stage === 'presupuesto' && p.jobId).map((p) => p.jobId!)
  const accepted = jobIds.length
    ? await db.jobBid.findMany({ where: { jobId: { in: jobIds }, professionalId: pro.id, status: 'aceptado' }, select: { jobId: true } })
    : []
  const acceptedJobs = new Set(accepted.map((b) => b.jobId))
  const sinFecha = sinFechaRows
    .filter((p) => p.stage !== 'presupuesto' || (p.jobId && acceptedJobs.has(p.jobId)))
    .map((p) => ({
      id: p.id, title: p.title, stage: p.stage, clientName: p.client.displayName,
      // si la última propuesta fue rechazada, quién y por qué
      rechazadaPor: p.scheduleProposedBy, motivo: p.scheduleNote,
    }))

  const projects = withDates.map((p) => ({
    id: p.id,
    title: p.title,
    stage: p.stage,
    status: p.status,
    clientName: p.client.displayName,
    schedule: scheduleView(p),
    ranges: rangesOfRow(p),
  }))

  return ok({
    from, to, today,
    // jornada del profesional (null en la base = 06:00–18:00) y si es la de referencia
    jornada: jornadaOf(pro.workdayStart, pro.workdayEnd),
    jornadaPorDefecto: !pro.workdayStart || !pro.workdayEnd,
    projects,
    sinFecha,
    // propuestas del cliente que esperan tu respuesta (dentro o fuera de la ventana)
    pendientes: await db.project.count({ where: { professionalId: pro.id, status: 'activo', scheduleStatus: 'propuesta', scheduleProposedBy: 'cliente' } }),
  })
}

// ── Mi jornada (D23): desde/hasta "HH:MM" de a 15 min, fin > inicio; las dos en null = volver a 06:00–18:00 ──
const jornadaSchema = z.object({
  workdayStart: z.string().max(5, 'Hora inválida: usá el formato HH:MM (por ejemplo 06:00)').nullable(),
  workdayEnd: z.string().max(5, 'Hora inválida: usá el formato HH:MM (por ejemplo 18:00)').nullable(),
}).superRefine((d, ctx) => {
  if ((d.workdayStart === null) !== (d.workdayEnd === null)) {
    ctx.addIssue({ code: 'custom', message: 'Indicá la hora de inicio y la de fin de tu jornada', path: ['workdayStart'] })
    return
  }
  const e = validateSlot(d.workdayStart, d.workdayEnd)
  if (e) ctx.addIssue({ code: 'custom', message: e.replace('o elegí "Todo el día"', 'de tu jornada'), path: ['workdayStart'] })
})

export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!pro) return fail('La jornada de trabajo es para profesionales', 403, { needsRole: 'profesional' })
  const parsed = await parseBody(req, jornadaSchema)
  if (parsed.error) return parsed.error
  const { workdayStart, workdayEnd } = parsed.data
  // guardar la de referencia como null (así, si cambia el valor por defecto, lo sigue)
  const esDefault = workdayStart === JORNADA_DEFAULT.desde && workdayEnd === JORNADA_DEFAULT.hasta
  const upd = await db.professionalProfile.update({
    where: { id: pro.id },
    data: { workdayStart: esDefault ? null : workdayStart, workdayEnd: esDefault ? null : workdayEnd },
    select: { workdayStart: true, workdayEnd: true },
  })
  return ok({ success: true, jornada: jornadaOf(upd.workdayStart, upd.workdayEnd), jornadaPorDefecto: !upd.workdayStart || !upd.workdayEnd })
}
