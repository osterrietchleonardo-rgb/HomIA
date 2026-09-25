import { ok } from '@/lib/api'
import { destroySession, getSessionUserIdFromCookie } from '@/lib/auth'
import { registrarEvento } from '@/lib/analytics/server'

export async function POST(req: Request) {
  // métricas (D27): cierre de sesión (el id sale del JWT, sin consulta extra; no demora la respuesta)
  const uid = await getSessionUserIdFromCookie()
  if (uid) registrarEvento(req, { name: 'logout', userId: uid, path: '/' })
  await destroySession()
  return ok({ success: true })
}
