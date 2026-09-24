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

export async function GET() {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const me = auth.user.id

  const convs = await db.conversation.findMany({
    where: { OR: [{ userAId: me }, { userBId: me }] },
    include: {
      messages: { orderBy: { createdAt: 'desc' }, take: 1, include: { sender: { select: { id: true, displayName: true } } } },
    },
    orderBy: { lastMessageAt: 'desc' },
  })

  const ids = convs.map((c) => c.id)
  const unreadAgg = ids.length
    ? await db.message.groupBy({
        by: ['conversationId'],
        where: { conversationId: { in: ids }, senderId: { not: me }, readAt: null },
        _count: { _all: true },
      })
    : []
  const unreadMap = new Map(unreadAgg.map((u) => [u.conversationId, u._count._all]))

  const otherIds = convs.map((c) => (c.userAId === me ? c.userBId : c.userAId))
  const others = await db.user.findMany({
    where: { id: { in: otherIds } },
    select: { id: true, displayName: true, avatarUrl: true, roles: true, verificationStatus: true },
  })
  const otherMap = new Map(others.map((o) => [o.id, o]))

  // href de perfil público del otro (si tiene perfil pro/prov)
  const proRows = await db.professionalProfile.findMany({ where: { userId: { in: otherIds } }, select: { id: true, userId: true } })
  const provRows = await db.providerProfile.findMany({ where: { userId: { in: otherIds } }, select: { id: true, userId: true } })
  const proMap = new Map(proRows.map((p) => [p.userId, `/profesional/${p.id}`]))
  const provMap = new Map(provRows.map((p) => [p.userId, `/proveedor/${p.id}`]))

  return ok({
    conversations: convs.map((c) => {
      const otherId = c.userAId === me ? c.userBId : c.userAId
      const other = otherMap.get(otherId)
      const last = c.messages[0]
      return {
        id: c.id,
        otherUserId: otherId,
        otherName: other?.displayName || 'Usuario',
        otherAvatarUrl: other?.avatarUrl || null,
        otherRoles: other ? JSON.parse(other.roles) as string[] : [],
        otherVerification: other?.verificationStatus || 'none',
        otherProfileHref: proMap.get(otherId) || provMap.get(otherId) || null,
        lastMessage: last ? { body: last.body, senderId: last.senderId, senderName: last.sender.displayName, createdAt: last.createdAt, mine: last.senderId === me } : null,
        unread: unreadMap.get(c.id) || 0,
        lastMessageAt: c.lastMessageAt,
      }
    }),
  })
}

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const me = auth.user.id
  const d = await body<{ targetUserId?: string }>(req)
  if (!d.targetUserId) return fail('Falta el destinatario')
  if (d.targetUserId === me) return fail('No podés iniciar una conversación con vos mismo')

  const target = await db.user.findUnique({ where: { id: d.targetUserId }, select: { id: true, roles: true } })
  if (!target) return fail('Usuario no encontrado', 404)

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
