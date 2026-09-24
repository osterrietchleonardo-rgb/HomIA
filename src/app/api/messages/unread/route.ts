import { ok, requireAuth } from '@/lib/api'
import { db } from '@/lib/db'

// Total de mensajes no leídos para el badge de "Mensajes" en sidebar/topbar.
// Una sola consulta (antes: listar mis conversaciones y después contar).
export async function GET() {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const me = auth.user.id

  const rows = await db.$queryRaw<{ total: number }[]>`
    SELECT count(*)::int AS total
    FROM "Message" m
    JOIN "Conversation" c ON c.id = m."conversationId"
    WHERE (c."userAId" = ${me} OR c."userBId" = ${me})
      AND m."senderId" <> ${me} AND m."readAt" IS NULL
  `
  return ok({ total: Number(rows[0]?.total) || 0 })
}
