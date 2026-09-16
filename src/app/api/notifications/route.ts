import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// GET: notificaciones del usuario
export async function GET() {
  const user = await getSessionUser()
  if (!user) return ok({ notifications: [], unread: 0 })
  const notifications = await db.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const unread = await db.notification.count({ where: { userId: user.id, read: false } })
  return ok({ notifications, unread })
}

// PATCH: marcar leídas (una o todas)
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const { id, all } = await body<{ id?: string; all?: boolean }>(req)
  if (all) {
    await db.notification.updateMany({ where: { userId: user.id, read: false }, data: { read: true } })
  } else if (id) {
    await db.notification.updateMany({ where: { id, userId: user.id }, data: { read: true } })
  }
  return ok({ success: true })
}
