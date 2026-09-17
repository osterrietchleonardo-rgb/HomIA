import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { verifyPassword, createSession, parseRoles } from '@/lib/auth'
import { db } from '@/lib/db'

export async function POST(req: NextRequest) {
  const { email, password } = await body<{ email: string; password: string }>(req)
  if (!email || !password) return fail('Email y contraseña son obligatorios')
  const user = await db.user.findUnique({
    where: { email: email.trim().toLowerCase() },
    include: { professional: { select: { id: true } }, provider: { select: { id: true } } },
  })
  if (!user || !(await verifyPassword(password, user.passwordHash))) {
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
