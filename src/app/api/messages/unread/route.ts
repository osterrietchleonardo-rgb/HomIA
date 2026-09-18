import { ok, requireAuth } from '@/lib/api'
import { db } from '@/lib/db'

// Total de mensajes no leídos para el badge de "Mensajes" en sidebar/topbar
export async function GET() {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const me = auth.user.id

  const convs = await db.conversation.findMany({
    where: { OR: [{ userAId: me }, { userBId: me }] },
    select: { id: true },
  })
  const total = convs.length
    ? await db.message.count({
        where: { conversationId: { in: convs.map((c) => c.id) }, senderId: { not: me }, readAt: null },
      })
    : 0

  return ok({ total })
}
