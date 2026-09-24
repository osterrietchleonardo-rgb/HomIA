import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { z } from 'zod'
import { ok, fail, requireAuth, body, parseJson } from '@/lib/api'
import { db } from '@/lib/db'

// Hilo de conversación.
// GET  → mensajes ascendentes (los últimos 300) y marca leídos los que me mandaron.
//        Con `?after=<ISO>` devuelve SOLO los mensajes con fecha >= after (cursor
//        del polling: el cliente ya tiene el resto y deduplica por id) + `readUpTo`,
//        la fecha del último mensaje MÍO que el otro ya leyó (acuse de lectura).
// POST → envía un mensaje y notifica al destinatario.
//
// Rendimiento: con el pooler de Supabase (pgbouncer) cada consulta de Prisma cuesta
// ~4 idas y vueltas. El GET resuelve todo (acceso, datos del otro, perfil público,
// marcar leídos, mensajes y acuse) en UNA sola sentencia SQL.

const MAX_MESSAGES = 300

const querySchema = z.object({
  after: z.string().datetime({ message: 'after tiene que ser una fecha ISO' }).optional(),
})

type ThreadRow = {
  convId: string
  member: boolean
  otherId: string
  otherName: string | null
  otherAvatarUrl: string | null
  otherRoles: string | null
  otherVerification: string | null
  otherCreatedAt: Date | null
  proId: string | null
  provId: string | null
  readUpTo: Date | null
  id: string | null
  senderId: string | null
  body: string | null
  readAt: Date | null
  createdAt: Date | null
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const me = auth.user.id
  const { id } = await params
  if (!id) return fail('Falta el identificador de la conversación', 400)

  const parsed = querySchema.safeParse({ after: req.nextUrl.searchParams.get('after') || undefined })
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Parámetros inválidos', 400)
  const after = parsed.data.after

  // "timestamp without time zone" guarda la hora UTC: el ISO con Z se castea tal cual.
  const nowIso = new Date().toISOString()
  const afterFilter = after ? Prisma.sql`AND x."createdAt" >= ${after}::timestamp` : Prisma.empty

  // acuse de lectura primero (CTE que modifica: corre aunque nadie lea su salida;
  // solo si soy parte de la conversación)
  const rows = await db.$queryRaw<ThreadRow[]>`
    WITH cv AS (
      SELECT c.id,
             (c."userAId" = ${me} OR c."userBId" = ${me}) AS member,
             CASE WHEN c."userAId" = ${me} THEN c."userBId" ELSE c."userAId" END AS "otherId"
      FROM "Conversation" c WHERE c.id = ${id}
    ), upd AS (
      UPDATE "Message" SET "readAt" = ${nowIso}::timestamp
      WHERE "conversationId" = (SELECT id FROM cv WHERE member)
        AND "senderId" <> ${me} AND "readAt" IS NULL
      RETURNING id
    )
    SELECT cv.id AS "convId", cv.member, cv."otherId",
           o."displayName" AS "otherName", o."avatarUrl" AS "otherAvatarUrl", o.roles AS "otherRoles",
           o."verificationStatus" AS "otherVerification", o."createdAt" AS "otherCreatedAt",
           (SELECT p.id FROM "ProfessionalProfile" p WHERE p."userId" = cv."otherId" LIMIT 1) AS "proId",
           (SELECT v.id FROM "ProviderProfile" v WHERE v."userId" = cv."otherId" LIMIT 1) AS "provId",
           (SELECT max(r."createdAt") FROM "Message" r
             WHERE r."conversationId" = cv.id AND r."senderId" = ${me} AND r."readAt" IS NOT NULL) AS "readUpTo",
           m.id, m."senderId", m.body, m."readAt", m."createdAt"
    FROM cv
    LEFT JOIN "User" o ON o.id = cv."otherId"
    LEFT JOIN LATERAL (
      SELECT x.id, x."senderId", x.body, x."readAt", x."createdAt" FROM "Message" x
      WHERE cv.member AND x."conversationId" = cv.id ${afterFilter}
      ORDER BY x."createdAt" DESC, x.id DESC
      LIMIT ${MAX_MESSAGES}
    ) m ON true
  `

  if (rows.length === 0) return fail('Conversación no encontrada', 404)
  const head = rows[0]
  if (!head.member) return fail('No tenés acceso a esta conversación', 403)

  const messages = rows
    .filter((r) => r.id && r.senderId && r.createdAt)
    .map((r) => ({ id: r.id as string, senderId: r.senderId as string, body: r.body || '', readAt: r.readAt, createdAt: r.createdAt as Date }))
    .reverse()

  return ok({
    conversation: {
      id: head.convId,
      otherUserId: head.otherId,
      otherName: head.otherName || 'Usuario',
      otherAvatarUrl: head.otherAvatarUrl || null,
      otherRoles: parseJson<string[]>(head.otherRoles, []),
      otherVerification: head.otherVerification || 'none',
      otherProfileHref: head.proId ? `/profesional/${head.proId}` : head.provId ? `/proveedor/${head.provId}` : null,
      otherMemberSince: head.otherCreatedAt || null,
    },
    messages,
    readUpTo: head.readUpTo,
    incremental: !!after,
    me,
  })
}

const sendSchema = z.object({
  body: z.string({ message: 'El mensaje está vacío' }).trim().min(1, 'El mensaje está vacío').max(4000, 'El mensaje es demasiado largo'),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const me = auth.user.id
  const { id } = await params
  if (!id) return fail('Falta el identificador de la conversación', 400)

  const parsed = sendSchema.safeParse(await body(req))
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'El mensaje está vacío', 400)
  const text = parsed.data.body

  const conv = await db.conversation.findUnique({ where: { id }, select: { id: true, userAId: true, userBId: true } })
  if (!conv) return fail('Conversación no encontrada', 404)
  if (conv.userAId !== me && conv.userBId !== me) return fail('No tenés acceso a esta conversación', 403)
  const otherId = conv.userAId === me ? conv.userBId : conv.userAId

  // mensaje + fecha de la conversación + aviso al otro, en una sola transacción
  // (una ida al pooler en vez de tres). El nombre sale de la sesión.
  const now = new Date()
  const [message] = await db.$transaction([
    db.message.create({
      data: { conversationId: id, senderId: me, body: text, createdAt: now },
      select: { id: true, senderId: true, body: true, readAt: true, createdAt: true },
    }),
    db.conversation.update({ where: { id }, data: { lastMessageAt: now }, select: { id: true } }),
    db.notification.create({
      data: {
        userId: otherId,
        type: 'message',
        title: `Nuevo mensaje de ${auth.user.displayName || 'un usuario de HomIA'}`,
        body: text.length > 90 ? `${text.slice(0, 90)}…` : text,
        link: `#/mensajes?c=${id}`,
      },
      select: { id: true },
    }),
  ])

  return ok({ message }, 201)
}
