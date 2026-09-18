// Autenticación real HomIA: bcrypt + JWT en cookie httpOnly
import 'server-only'
import bcrypt from 'bcryptjs'
import { SignJWT, jwtVerify } from 'jose'
import { cookies, headers } from 'next/headers'
import { db } from '@/lib/db'

const RAW_SECRET = process.env.AUTH_SECRET

// Fail-fast: en producción NO se arranca con un secreto conocido/publicado
// (cualquiera podría falsificar cookies de sesión).
if (!RAW_SECRET && process.env.NODE_ENV === 'production') {
  throw new Error(
    'AUTH_SECRET no está definida. Generá una clave aleatoria (openssl rand -base64 48) ' +
    'y agregala al archivo .env del servidor antes de arrancar en producción.'
  )
}
const SECRET = new TextEncoder().encode(
  RAW_SECRET || 'homy-dev-secret-cambiar-en-produccion-9f2a'
)
const COOKIE = 'homy_session'
const MAX_AGE = 60 * 60 * 24 * 30 // 30 días

export type SessionUser = {
  id: string
  email: string
  displayName: string
  roles: string[]
  avatarUrl?: string | null
  verificationStatus?: string
  verifiedAt?: Date | null
  hasProfessional: boolean
  hasProvider: boolean
  lat?: number | null
  lng?: number | null
  radiusKm?: number | null
}

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 10)
}

export async function verifyPassword(pw: string, hash: string) {
  return bcrypt.compare(pw, hash)
}

export async function createSession(userId: string) {
  const token = await new SignJWT({ sub: userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime(`${MAX_AGE}s`)
    .sign(SECRET)
  const store = await cookies()
  // Cookie Secure automática: si el request llega por https (proxy con
  // x-forwarded-proto), la cookie viaja solo por https. En http local sigue OK.
  const h = await headers()
  const proto = (h.get('x-forwarded-proto') || '').split(',')[0].trim()
  store.set(COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: proto === 'https',
    maxAge: MAX_AGE,
    path: '/',
  })
}

export async function destroySession() {
  const store = await cookies()
  store.delete(COOKIE)
}

export function parseRoles(json: string | null | undefined): string[] {
  try {
    const arr = JSON.parse(json || '[]')
    return Array.isArray(arr) ? arr : []
  } catch {
    return []
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies()
    const token = store.get(COOKIE)?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, SECRET)
    const userId = payload.sub as string
    if (!userId) return null
    const user = await db.user.findUnique({
      where: { id: userId },
      include: { professional: { select: { id: true } }, provider: { select: { id: true } } },
    })
    if (!user) return null
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: parseRoles(user.roles),
      avatarUrl: user.avatarUrl,
      verificationStatus: user.verificationStatus,
      verifiedAt: user.verifiedAt,
      hasProfessional: !!user.professional,
      hasProvider: !!user.provider,
      lat: user.lat,
      lng: user.lng,
      radiusKm: user.searchRadiusKm,
    }
  } catch {
    return null
  }
}
