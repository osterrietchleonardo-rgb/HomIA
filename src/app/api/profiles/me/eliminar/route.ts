import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody, requireAuth } from '@/lib/api'
import { db } from '@/lib/db'
import { verifyPassword, destroySession } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { operacionesAbiertas, borrarDniDelBucket, anonimizarCuenta } from '@/lib/account-deletion'

// "Eliminar mi cuenta" (Ley 25.326, derecho de supresión — D19).
// POST en una ruta propia (y no DELETE /api/profiles/me) para que sea explícito y no se
// dispare por error: exige escribir ELIMINAR y la contraseña actual.
//   403 contraseña incorrecta · 409 operaciones abiertas (con la lista) · 503 no se pudo
//   borrar el DNI del almacenamiento (no se toca nada) · 200 cuenta anonimizada y sesión cerrada.
export const maxDuration = 60

const Schema = z.object({
  confirm: z.string().trim().refine((v) => v === 'ELIMINAR', 'Escribí ELIMINAR (en mayúsculas) para confirmar'),
  password: z.string().min(1, 'Ingresá tu contraseña').max(200),
})

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const userId = auth.user.id

  const parsed = await parseBody(req, Schema)
  if (parsed.error) return parsed.error

  // tope contra adivinar la contraseña por esta vía: 5 intentos cada 15 minutos por cuenta
  const rl = rateLimit(`baja:${userId}`, 5, 15 * 60 * 1000)
  if (!rl.allowed) return fail(`Demasiados intentos. Esperá ${rl.retryAfterSec} segundos y probá de nuevo.`, 429)

  const user = await db.user.findUnique({ where: { id: userId }, select: { passwordHash: true, deletedAt: true } })
  if (!user || user.deletedAt) return fail('Necesitás iniciar sesión para hacer esto', 401)
  if (!(await verifyPassword(parsed.data.password, user.passwordHash))) {
    return fail('La contraseña no es correcta', 403)
  }

  const abiertas = await operacionesAbiertas(userId)
  if (abiertas.length) {
    return fail(
      'Antes de eliminar tu cuenta tenés que cerrar estas operaciones',
      409,
      { pendientes: abiertas }
    )
  }

  // primero el DNI del almacenamiento privado: si no se puede, no se toca nada
  const dni = await borrarDniDelBucket(userId)
  if (!dni.ok) return fail(dni.error, 503)

  await anonimizarCuenta(userId)
  await destroySession()
  return ok({ eliminada: true, dniArchivosBorrados: dni.archivos })
}
