import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { getAdminSession } from '@/lib/admin'
import { firmarFotos, refsDeFotos, vistaFeedback } from '@/lib/feedback-server'

// GET /api/feedback/[id] — un envío. Solo el autor o un administrador; para cualquier
// otro responde 404 (no se revela que el envío existe).
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  // D29: el administrador entra con su propia sesión (/admin), sin cuenta de usuario
  const admin = await getAdminSession()
  const user = admin ? null : await getSessionUser()
  if (!user && !admin) return fail('Necesitás iniciar sesión', 401)
  const { id } = await ctx.params
  const f = await db.feedback.findUnique({ where: { id } })
  if (!f || (!admin && f.userId !== user?.id)) return fail('No encontramos ese envío', 404)
  const firmas = await firmarFotos(refsDeFotos([f]))
  return ok({ item: vistaFeedback(f, firmas) })
}
