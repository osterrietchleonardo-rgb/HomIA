import { NextRequest } from 'next/server'
import { ok, fail, requireAuth, body, parseJson } from '@/lib/api'
import { db } from '@/lib/db'

// Bandeja de entrada HomIA — conversaciones 1:1 entre cualquier par de roles.
// GET: mis conversaciones con último mensaje + no leídos.
// POST: abrir (o reutilizar) conversación con targetUserId.
//   REGLA DE COMUNIDAD: profesionales y proveedores NO pueden iniciar el chat
//   con un cliente — son los clientes los que escriben primero. Si el hilo ya
//   existe (el cliente escribió antes), cualquiera puede seguir respondiendo.

function pair(a: string, b: string) {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a }
}

type InboxRow = {
  id: string
  lastMessageAt: Date
  otherId: string
  otherName: string | null
  otherAvatarUrl: string | null
  otherRoles: string | null
  otherVerification: string | null
  proId: string | null
  provId: string | null
  lastBody: string | null
  lastSenderId: string | null
  lastCreatedAt: Date | null
  unread: number
}

// Tope de conversaciones en la bandeja (las más recientes primero).
const INBOX_LIMIT = 200

export async function GET() {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const me = auth.user.id

  // UNA sola consulta: conversación + el otro usuario + su perfil público +
  // último mensaje (LATERAL … LIMIT 1) + no leídos. Antes eran 6 consultas y el
  // `include: { messages: { take: 1 } }` de Prisma traía TODOS los mensajes de
  // todas las conversaciones para quedarse con uno en memoria.
  // Con el pooler de Supabase (pgbouncer) cada consulta de Prisma cuesta ~4 idas
  // y vueltas a la base: el número de consultas es lo que pesa.
  const rows = await db.$queryRaw<InboxRow[]>`
    SELECT c.id, c."lastMessageAt",
           o.id AS "otherId", o."displayName" AS "otherName", o."avatarUrl" AS "otherAvatarUrl",
           o.roles AS "otherRoles", o."verificationStatus" AS "otherVerification",
           (SELECT p.id FROM "ProfessionalProfile" p WHERE p."userId" = o.id LIMIT 1) AS "proId",
           (SELECT v.id FROM "ProviderProfile" v WHERE v."userId" = o.id LIMIT 1) AS "provId",
           lm.body AS "lastBody", lm."senderId" AS "lastSenderId", lm."createdAt" AS "lastCreatedAt",
           (SELECT count(*) FROM "Message" u
             WHERE u."conversationId" = c.id AND u."senderId" <> ${me} AND u."readAt" IS NULL)::int AS unread
    FROM "Conversation" c
    JOIN "User" o ON o.id = CASE WHEN c."userAId" = ${me} THEN c."userBId" ELSE c."userAId" END
    LEFT JOIN LATERAL (
      SELECT m.body, m."senderId", m."createdAt" FROM "Message" m
      WHERE m."conversationId" = c.id
      ORDER BY m."createdAt" DESC, m.id DESC
      LIMIT 1
    ) lm ON true
    WHERE c."userAId" = ${me} OR c."userBId" = ${me}
    ORDER BY c."lastMessageAt" DESC
    LIMIT ${INBOX_LIMIT}
  `

  return ok({
    conversations: rows.map((r) => ({
      id: r.id,
      otherUserId: r.otherId,
      otherName: r.otherName || 'Usuario',
      otherAvatarUrl: r.otherAvatarUrl || null,
      otherRoles: parseJson<string[]>(r.otherRoles, []),
      otherVerification: r.otherVerification || 'none',
      otherProfileHref: r.proId ? `/profesional/${r.proId}` : r.provId ? `/proveedor/${r.provId}` : null,
      lastMessage: r.lastSenderId && r.lastCreatedAt
        ? {
            body: r.lastBody || '',
            senderId: r.lastSenderId,
            senderName: r.lastSenderId === me ? auth.user.displayName : r.otherName || 'Usuario',
            createdAt: r.lastCreatedAt,
            mine: r.lastSenderId === me,
          }
        : null,
      unread: Number(r.unread) || 0,
      lastMessageAt: r.lastMessageAt,
    })),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const me = auth.user.id
  const d = await body<{ targetUserId?: string }>(req)
  if (!d.targetUserId) return fail('Falta el destinatario')
  if (d.targetUserId === me) return fail('No podés iniciar una conversación con vos mismo')

  const target = await db.user.findUnique({ where: { id: d.targetUserId }, select: { id: true, roles: true, deletedAt: true } })
  // a una cuenta eliminada (D19) no se le puede escribir
  if (!target || target.deletedAt) return fail('Usuario no encontrado', 404)

  const key = pair(me, d.targetUserId)

  // ¿Ya existe el hilo? Reutilizar (responder siempre está permitido).
  const existing = await db.conversation.findUnique({ where: { userAId_userBId: key } })

  // Regla de comunidad "el cliente inicia": una conversación NUEVA solo se abre
  // hacia quien OFRECE algo (profesional o proveedor): quien escribe primero
  // actúa como cliente. A un usuario que solo es cliente nadie le escribe
  // primero; se le responde cuando él inicia. Se decide por el destinatario
  // porque todo registro recibe el rol cliente (los roles de quien escribe no
  // distinguen nada).
  const targetRoles = parseJson<string[]>(target.roles, [])
  const targetOfrece = targetRoles.includes('profesional') || targetRoles.includes('proveedor')
  if (!targetOfrece && !existing) {
    return fail('En HomIA los clientes escriben primero: cuando te contacte, vas a poder responderle sin problema.', 403, { clientesFirst: true })
  }

  const conv = existing || await db.conversation.create({ data: { ...key } })

  return ok({ conversation: { id: conv.id, targetUserId: d.targetUserId } }, existing ? 200 : 201)
}
