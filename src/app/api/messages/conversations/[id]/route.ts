import { NextRequest } from 'next/server'
import { ok, fail, requireAuth, body } from '@/lib/api'
import { db } from '@/lib/db'

// Hilo de conversación — GET devuelve mensajes ascendentes (y marca leídos),
// POST envía un mensaje y notifica al destinatario.

async function loadConvFor(id: string, me: string) {
  const conv = await db.conversation.findUnique({ where: { id } })
  if (!conv) return { ok: false as const, error: 'Conversación no encontrada', status: 404 as const }
  if (conv.userAId !== me && conv.userBId !== me) return { ok: false as const, error: 'No tenés acceso a esta conversación', status: 403 as const }
  return { ok: true as const, conv }
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const me = auth.user.id
  const { id } = await params
  if (!id) return fail('Falta el identificador de la conversación', 400)

  const loaded = await loadConvFor(id, me)
  if (!loaded.ok) return fail(loaded.error, loaded.status)
  const conv = loaded.conv
  const otherId = conv.userAId === me ? conv.userBId : conv.userAId

  // acuse de lectura primero: mi GET implica que vi el hilo
  await db.message.updateMany({
    where: { conversationId: id, senderId: { not: me }, readAt: null },
    data: { readAt: new Date() },
  })

  const [other, messages] = await Promise.all([
    db.user.findUnique({
      where: { id: otherId },
      select: { id: true, displayName: true, avatarUrl: true, roles: true, createdAt: true, verificationStatus: true },
    }),
    db.message.findMany({
      where: { conversationId: id },
      orderBy: { createdAt: 'asc' },
      take: 300,
      select: { id: true, senderId: true, body: true, readAt: true, createdAt: true },
    }),
  ])

  const pro = await db.professionalProfile.findFirst({ where: { userId: otherId }, select: { id: true } })
  const prov = pro ? null : await db.providerProfile.findFirst({ where: { userId: otherId }, select: { id: true } })

  return ok({
    conversation: {
      id: conv.id,
      otherUserId: otherId,
      otherName: other?.displayName || 'Usuario',
      otherAvatarUrl: other?.avatarUrl || null,
      otherRoles: other ? JSON.parse(other.roles) as string[] : [],
      otherVerification: other?.verificationStatus || 'none',
      otherProfileHref: pro ? `/profesional/${pro.id}` : prov ? `/proveedor/${prov.id}` : null,
      otherMemberSince: other?.createdAt || null,
    },
    messages,
    me,
  })
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const me = auth.user.id
  const { id } = await params
  if (!id) return fail('Falta el identificador de la conversación', 400)

  const loaded = await loadConvFor(id, me)
  if (!loaded.ok) return fail(loaded.error, loaded.status)
  const conv = loaded.conv
  const otherId = conv.userAId === me ? conv.userBId : conv.userAId

  const d = await body<{ body?: string }>(req)
  const text = (d.body || '').trim()
  if (!text) return fail('El mensaje está vacío')
  if (text.length > 4000) return fail('El mensaje es demasiado largo')

  const meUser = await db.user.findUnique({ where: { id: me }, select: { displayName: true } })
  const message = await db.message.create({
    data: { conversationId: id, senderId: me, body: text },
    select: { id: true, senderId: true, body: true, readAt: true, createdAt: true },
  })
  await db.conversation.update({ where: { id }, data: { lastMessageAt: message.createdAt } })

  await db.notification.create({
    data: {
      userId: otherId,
      type: 'message',
      title: `Nuevo mensaje de ${meUser?.displayName || 'un usuario de HomIA'}`,
      body: text.length > 90 ? `${text.slice(0, 90)}…` : text,
      link: `#/mensajes?c=${id}`,
    },
  })

  return ok({ message }, 201)
}
