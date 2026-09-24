import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { verifyPassword, createSession, parseRoles } from '@/lib/auth'
import { db } from '@/lib/db'
import { rateLimit, loginRateKey, ipRateKey } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  const { email, password } = await body<{ email: string; password: string }>(req)
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password) {
    return fail('Email y contraseña son obligatorios')
  }

  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { professional: { select: { id: true } }, provider: { select: { id: true } } },
  })

  // anti fuerza bruta: solo los intentos FALLIDOS consumen el límite
  // (10 fallos por email+IP, 30 fallos por IP, ventana de 15 minutos)
  // una cuenta eliminada (D19) nunca vuelve a entrar (además su email y su contraseña ya se reemplazaron)
  const passwordOk = user && !user.deletedAt ? await verifyPassword(password, user.passwordHash) : false
  if (!user || !passwordOk) {
    const perEmail = rateLimit(`loginfail:${loginRateKey(req, email)}`, 10, 15 * 60 * 1000)
    const perIp = rateLimit(`loginfail:${ipRateKey(req, 'login')}`, 30, 15 * 60 * 1000)
    if (!perIp.allowed) {
      return fail('Demasiados intentos incorrectos desde tu conexión. Esperá unos minutos y volvé a probar.', 429)
    }
    if (!perEmail.allowed) {
      return fail(`Demasiados intentos fallidos para este email. Esperá ${perEmail.retryAfterSec} segundos y probá de nuevo.`, 429)
    }
    return fail('Email o contraseña incorrectos', 401)
  }
  await createSession(user.id)
  return ok({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: parseRoles(user.roles),
      avatarUrl: user.avatarUrl,
      hasProfessional: !!user.professional,
      hasProvider: !!user.provider,
    },
  })
}
