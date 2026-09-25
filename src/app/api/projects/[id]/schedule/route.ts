// Fechas del trabajo (D21 + franja horaria D23): el profesional propone inicio + fin estimado y,
// opcionalmente, el horario de cada día; el cliente acepta, rechaza o propone otra; cualquiera de
// los dos puede reprogramar lo acordado. Máquina de estados pura en src/lib/schedule.ts.
//
// No pisarse (D23): si el horario choca con otro trabajo ACORDADO del mismo profesional → 409
// (al proponer y al aceptar; al aceptar se re-verifica dentro de la transacción con el perfil del
// profesional bloqueado, así dos aceptaciones simultáneas que se pisan no pasan las dos). Si solo
// choca con PROPUESTAS pendientes → avisa y no bloquea.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { logActivity } from '@/lib/activity'
import { notificar } from '@/lib/notify'
import {
  dayToDate, findCollisions, isDayKey, scheduleBlockReason, scheduleText, scheduleTransition, todayKey, validateSlot,
  type BusyRange, type ScheduleRole, type ScheduleState, type ScheduleStatus,
} from '@/lib/schedule'
import { SCHEDULE_SELECT, bidAcceptedFor, rangesOfRow, scheduleView, scheduledWhere } from '@/lib/schedule-server'

const day = z.string().refine(isDayKey, 'Fecha inválida: usá el formato AAAA-MM-DD')
const hora = z.string().max(5, 'Hora inválida: usá el formato HH:MM (por ejemplo 07:00)').optional().nullable()
const schema = z.discriminatedUnion('accion', [
  z.object({
    accion: z.literal('proponer'),
    startDate: day,
    endDate: day,
    // franja de cada día ("HH:MM", de a 15 min); sin las dos = todo el día
    dailyStart: hora,
    dailyEnd: hora,
    nota: z.string().trim().max(500, 'La nota puede tener hasta 500 caracteres').optional().nullable(),
  })
    .refine((d) => d.endDate >= d.startDate, { message: 'La fecha estimada de finalización no puede ser anterior al inicio', path: ['endDate'] })
    .superRefine((d, ctx) => {
      const e = validateSlot(d.dailyStart, d.dailyEnd)
      if (e) ctx.addIssue({ code: 'custom', message: e, path: ['dailyStart'] })
    }),
  z.object({ accion: z.literal('aceptar') }),
  z.object({ accion: z.literal('rechazar'), motivo: z.string().trim().max(500, 'El motivo puede tener hasta 500 caracteres').optional().nullable() }),
], { error: 'Acción inválida: proponer, aceptar o rechazar' })

function pairKey(a: string, b: string) {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a }
}

type Hit = BusyRange & { id: string; title: string }
/** Lo que se muestra de un choque: fechas y horario; el título solo al profesional (dueño de su agenda). */
function hitView(h: Hit, isPro: boolean) {
  return {
    startDate: h.start, endDate: h.end, dailyStart: h.dailyStart || null, dailyEnd: h.dailyEnd || null, estado: h.estado,
    ...(isPro ? { id: h.id, title: h.title } : {}),
  }
}

class Conflicto extends Error {
  constructor(public hits: Hit[]) { super('choque') }
}
class Cambiaron extends Error {}

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error
  const action = parsed.data

  const project = await db.project.findUnique({
    where: { id },
    select: {
      id: true, title: true, status: true, stage: true, laborCost: true, jobId: true, clientId: true, professionalId: true,
      pro: { select: { userId: true } },
      ...SCHEDULE_SELECT,
    },
  })
  if (!project) return fail('Proyecto no encontrado', 404)
  const isClient = project.clientId === user.id
  const isPro = project.pro.userId === user.id
  if (!isClient && !isPro) return fail('No tenés acceso a este proyecto', 403)
  const actor: ScheduleRole = isPro ? 'profesional' : 'cliente'

  const block = scheduleBlockReason({
    status: project.status, stage: project.stage, laborCost: project.laborCost,
    bidAccepted: project.stage === 'presupuesto' ? await bidAcceptedFor(project) : false,
  })
  if (block) return fail(block, 409)

  const view = scheduleView(project)
  const state: ScheduleState = {
    scheduleStatus: view.status, scheduleProposedBy: view.proposedBy,
    startDate: view.startDate, endDate: view.endDate, dailyStart: view.dailyStart, dailyEnd: view.dailyEnd,
    prevStartDate: view.prevStartDate, prevEndDate: view.prevEndDate, prevDailyStart: view.prevDailyStart, prevDailyEnd: view.prevDailyEnd,
    scheduleNote: view.note,
  }
  const today = todayKey()
  const tr = scheduleTransition(state, action, actor, today)
  if (!tr.ok) return fail(tr.error, tr.status)
  const n = tr.next
  const now = new Date()
  // al proponer y al aceptar, el horario nuevo no puede pisar otro trabajo ACORDADO del profesional
  const chequear = (tr.evento !== 'rechazada' && tr.evento !== 'reprogramacion_rechazada') && !!n.startDate && !!n.endDate
  const cand = { start: n.startDate!, end: n.endDate!, dailyStart: n.dailyStart, dailyEnd: n.dailyEnd }

  let avisos: Hit[] = []
  try {
    await db.$transaction(async (tx) => {
      if (chequear) {
        // Bloquea la agenda del profesional hasta el commit: otra aceptación que se pise espera y,
        // al re-verificar, ve esta ya acordada.
        await tx.$queryRaw`SELECT id FROM "ProfessionalProfile" WHERE id = ${project.professionalId} FOR UPDATE`
        const others = (await tx.project.findMany({
          where: scheduledWhere(project.professionalId, cand.start, cand.end),
          select: { id: true, title: true, ...SCHEDULE_SELECT },
          take: 500,
        })).filter((o) => o.id !== id)
        const items: Hit[] = others.flatMap((o) => rangesOfRow(o).map((r) => ({ ...r, id: o.id, title: o.title })))
        const c = findCollisions(cand, items)
        if (c.bloquean.length) throw new Conflicto(c.bloquean)
        avisos = action.accion === 'proponer' ? c.avisan : []
      }
      // Concurrencia optimista: solo se escribe si nadie tocó las fechas desde que las leímos
      // (dos "Aceptar" simultáneos del mismo proyecto → el segundo recibe 409).
      const res = await tx.project.updateMany({
        where: { id, status: 'activo', scheduleStatus: project.scheduleStatus, scheduleUpdatedAt: project.scheduleUpdatedAt },
        data: {
          scheduleStatus: n.scheduleStatus as ScheduleStatus | null,
          scheduleProposedBy: n.scheduleProposedBy,
          startDate: n.startDate ? dayToDate(n.startDate) : null,
          endDate: n.endDate ? dayToDate(n.endDate) : null,
          dailyStart: n.dailyStart,
          dailyEnd: n.dailyEnd,
          prevStartDate: n.prevStartDate ? dayToDate(n.prevStartDate) : null,
          prevEndDate: n.prevEndDate ? dayToDate(n.prevEndDate) : null,
          prevDailyStart: n.prevDailyStart,
          prevDailyEnd: n.prevDailyEnd,
          scheduleNote: n.scheduleNote,
          scheduleUpdatedAt: now,
        },
      })
      if (res.count === 0) throw new Cambiaron()
    }, { timeout: 15_000 })
  } catch (e) {
    if (e instanceof Cambiaron) return fail('Las fechas cambiaron mientras tanto. Recargá el proyecto y volvé a intentar.', 409)
    if (e instanceof Conflicto) {
      const lista = e.hits.slice(0, 3).map((h) => (isPro ? `«${h.title}» (${scheduleText(h.start, h.end, h.dailyStart, h.dailyEnd)})` : scheduleText(h.start, h.end, h.dailyStart, h.dailyEnd)))
      const mas = e.hits.length > 3 ? ` y ${e.hits.length - 3} más` : ''
      const acepta = tr.evento === 'aceptada'
      const msg = isPro
        ? `${acepta ? 'No podés aceptar: ese horario' : 'Ese horario'} choca con ${e.hits.length === 1 ? 'otro trabajo tuyo ya acordado' : 'otros trabajos tuyos ya acordados'}: ${lista.join('; ')}${mas}. ${acepta ? 'Proponé otro día u horario.' : 'Elegí otro día u horario.'}`
        : `El profesional ya tiene ese horario ocupado (${lista.join('; ')}${mas}). ${acepta ? 'No se puede aceptar: proponé otro día u horario.' : 'Elegí otro día u horario.'}`
      return fail(msg, 409, { choque: true, conflictos: e.hits.map((h) => hitView(h, isPro)) })
    }
    throw e
  }

  // Aviso de superposición con PROPUESTAS pendientes del profesional (no bloquea: tal vez no se acepten)
  const solapamiento = action.accion === 'proponer'
    ? { cantidad: avisos.length, ...(isPro ? { proyectos: avisos.map((h) => hitView(h, true)) } : {}) }
    : null

  // ── avisos: notificación al otro, mensaje en el chat (si existe) y línea de tiempo ──
  const quien = isPro ? 'El profesional' : 'El cliente'
  const rango = n.startDate && n.endDate ? scheduleText(n.startDate, n.endDate, n.dailyStart, n.dailyEnd) : ''
  const otherUserId = isPro ? project.clientId : project.pro.userId
  const otherRole = isPro ? 'cliente' : 'profesional'
  const link = `#/panel/${otherRole}/proyectos/${id}`
  const motivo = action.accion === 'rechazar' && action.motivo ? ` Motivo: ${action.motivo}` : ''
  const nota = action.accion === 'proponer' && action.nota ? ` Nota: ${action.nota}` : ''
  const txt: Record<typeof tr.evento, { type: string; title: string; body: string; chat: string }> = {
    propuesta: { type: 'fechas_propuestas', title: 'Te propusieron fechas', body: `${quien} propuso hacer "${project.title}" ${rango}. Aceptalas o proponé otras.${nota}`, chat: `Propuse hacer el trabajo ${rango}.${nota}` },
    contrapropuesta: { type: 'fechas_propuestas', title: 'Te propusieron otras fechas', body: `${quien} propuso otras fechas para "${project.title}": ${rango}.${nota}`, chat: `Propuse otras fechas para el trabajo: ${rango}.${nota}` },
    propuesta_editada: { type: 'fechas_propuestas', title: 'Cambiaron la propuesta de fechas', body: `${quien} cambió su propuesta de fechas para "${project.title}": ${rango}.${nota}`, chat: `Cambié mi propuesta de fechas: ${rango}.${nota}` },
    reprogramacion: { type: 'fechas_reprogramacion', title: 'Piden reprogramar el trabajo', body: `${quien} pidió pasar "${project.title}" a: ${rango}. Hasta que respondas siguen las fechas acordadas.${nota}`, chat: `Pedí reprogramar el trabajo: ${rango}.${nota}` },
    aceptada: { type: 'fechas_acordadas', title: 'Fechas acordadas', body: `${quien} aceptó las fechas de "${project.title}": ${rango}.`, chat: `Acepté las fechas del trabajo: ${rango}.` },
    rechazada: { type: 'fechas_rechazadas', title: 'Rechazaron las fechas', body: `${quien} rechazó las fechas propuestas para "${project.title}".${motivo}${isClient ? ' Proponé otras desde el proyecto.' : ''}`, chat: `Rechacé las fechas propuestas.${motivo}` },
    reprogramacion_rechazada: { type: 'fechas_acordadas', title: 'Siguen las fechas acordadas', body: `${quien} no aceptó reprogramar "${project.title}": sigue ${rango}.${motivo}`, chat: `No acepté reprogramar: seguimos con lo acordado (${rango}).${motivo}` },
  }
  const t = txt[tr.evento]
  try {
    // notify.ts: aviso en la app y, para propuestas y reprogramaciones, también por mail
    await notificar({ data: { userId: otherUserId, type: t.type, title: t.title, body: t.body.slice(0, 1000), link } })
    const conv = await db.conversation.findUnique({ where: { userAId_userBId: pairKey(project.clientId, project.pro.userId) }, select: { id: true } })
    if (conv) {
      await db.message.create({ data: { conversationId: conv.id, senderId: user.id, body: `Fechas del trabajo: ${t.chat}`.slice(0, 2000) } })
      await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: now } })
    }
  } catch (e) {
    console.error('[projects/schedule] no se pudo avisar', e)
  }
  await logActivity({
    projectId: id, actorId: user.id, actorRole: actor, type: t.type,
    message: `${user.displayName}: ${t.chat}`,
    data: { evento: tr.evento, startDate: n.startDate, endDate: n.endDate, dailyStart: n.dailyStart, dailyEnd: n.dailyEnd },
  })

  return ok({
    success: true,
    evento: tr.evento,
    schedule: scheduleView({
      ...n,
      startDate: n.startDate ? dayToDate(n.startDate) : null, endDate: n.endDate ? dayToDate(n.endDate) : null,
      prevStartDate: n.prevStartDate ? dayToDate(n.prevStartDate) : null, prevEndDate: n.prevEndDate ? dayToDate(n.prevEndDate) : null,
      scheduleUpdatedAt: now,
    }),
    solapamiento,
  })
}
