import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { rateLimit, ipRateKey } from '@/lib/rate-limit'
import { problemaDeContrasena } from '@/lib/password-policy'
import { hashTokenReset, estadoToken, MENSAJE_TOKEN } from '@/lib/password-reset'

// GET  /api/auth/password/reset?token=…  → ¿el link sirve? (para avisar antes de tipear)
// POST /api/auth/password/reset { token, password } → cambia la contraseña.
// No inicia sesión: después hay que ingresar con la nueva.
// Nota: la sesión es un JWT sin estado (30 días); no hay mecanismo para cerrar las sesiones
// abiertas en otros dispositivos al cambiar la contraseña.

const tokenSchema = z.string({ message: 'Falta el código del link' }).trim().min(20, 'El link está incompleto').max(200, 'El link no es válido')

const schema = z.object({
  token: tokenSchema,
  password: z.string({ message: 'Escribí la nueva contraseña' }),
})

export async function GET(req: NextRequest) {
  const rl = rateLimit(ipRateKey(req, 'reset'), 60, 15 * 60 * 1000)
  if (!rl.allowed) return fail('Hiciste muchos intentos seguidos. Esperá unos minutos.', 429)
  const t = tokenSchema.safeParse(req.nextUrl.searchParams.get('token') || '')
  if (!t.success) return fail(MENSAJE_TOKEN.invalido, 400, { code: 'invalido' })
  const row = await db.passwordReset.findUnique({ where: { tokenHash: hashTokenReset(t.data) }, select: { usedAt: true, expiresAt: true } })
  const estado = estadoToken(row)
  if (estado !== 'valido') return fail(MENSAJE_TOKEN[estado], 400, { code: estado })
  return ok({ ok: true })
}

export async function POST(req: NextRequest) {
  const rl = rateLimit(ipRateKey(req, 'reset'), 60, 15 * 60 * 1000)
  if (!rl.allowed) return fail('Hiciste muchos intentos seguidos. Esperá unos minutos.', 429)
  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error
  const { token, password } = parsed.data

  const tokenHash = hashTokenReset(token)
  const row = await db.passwordReset.findUnique({ where: { tokenHash }, select: { id: true, userId: true, usedAt: true, expiresAt: true } })
  const estado = estadoToken(row)
  if (estado !== 'valido' || !row) return fail(MENSAJE_TOKEN[estado === 'valido' ? 'invalido' : estado], 400, { code: estado })

  const problema = problemaDeContrasena(password)
  if (problema) return fail(problema, 400, { code: 'contrasena' })

  const passwordHash = await hashPassword(password)
  const ahora = new Date()
  const cambiado = await db.$transaction(async (tx) => {
    // "tomar" el token dentro de la transacción: dos envíos simultáneos no lo usan dos veces
    const taken = await tx.passwordReset.updateMany({
      where: { id: row.id, usedAt: null, expiresAt: { gt: ahora } },
      data: { usedAt: ahora },
    })
    if (taken.count === 0) return false
    await tx.user.update({ where: { id: row.userId }, data: { passwordHash } })
    // los otros links pendientes de la misma cuenta dejan de servir
    await tx.passwordReset.updateMany({ where: { userId: row.userId, usedAt: null }, data: { usedAt: ahora } })
    return true
  })
  if (!cambiado) return fail(MENSAJE_TOKEN.usado, 400, { code: 'usado' })

  return ok({ ok: true, message: 'Listo: ya podés ingresar con tu nueva contraseña' })
}
