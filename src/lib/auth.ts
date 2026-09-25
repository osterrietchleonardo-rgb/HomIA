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

type SessionRow = {
  id: string; email: string; displayName: string; roles: string; avatarUrl: string | null
  verificationStatus: string; verifiedAt: Date | null; lat: number | null; lng: number | null
  searchRadiusKm: number; hasProfessional: boolean; hasProvider: boolean
}

/** Solo el id del JWT de la sesión, SIN consultar la base (métricas de uso, D27: quien lo use
 *  tiene que confirmar en su propia consulta que el usuario existe y no está eliminado). */
export async function getSessionUserIdFromCookie(): Promise<string | null> {
  try {
    const token = (await cookies()).get(COOKIE)?.value
    if (!token) return null
    const { payload } = await jwtVerify(token, SECRET)
    return typeof payload.sub === 'string' && payload.sub ? payload.sub : null
  } catch {
    return null
  }
}

export async function getSessionUser(): Promise<SessionUser | null> {
  try {
    const store = await cookies()
    const token = store.get(COOKIE)?.value
    if (!token) return null
    // Token inválido/expirado → null silencioso (es el caso normal de "no logueado").
    let userId: string | undefined
    try {
      const { payload } = await jwtVerify(token, SECRET)
      userId = payload.sub
    } catch {
      return null
    }
    if (!userId) return null
    // Error de DB → se loguea (no es un "no logueado": es infraestructura caída).
    // UNA sola consulta (con el pooler, cada consulta de Prisma son ~4 idas y vueltas
    // a la base; findUnique + include de 2 relaciones eran 3 consultas por pedido).
    // Esto corre en CADA pedido autenticado de la app.
    let user: SessionRow | undefined
    try {
      const rows = await db.$queryRaw<SessionRow[]>`
        SELECT u.id, u.email, u."displayName", u.roles, u."avatarUrl", u."verificationStatus",
               u."verifiedAt", u.lat, u.lng, u."searchRadiusKm",
               EXISTS (SELECT 1 FROM "ProfessionalProfile" p WHERE p."userId" = u.id) AS "hasProfessional",
               EXISTS (SELECT 1 FROM "ProviderProfile" v WHERE v."userId" = u.id) AS "hasProvider"
        FROM "User" u
        WHERE u.id = ${userId}
          -- una cuenta eliminada ("Eliminar mi cuenta", D19) no tiene sesión aunque la cookie siga viva
          AND u."deletedAt" IS NULL
        LIMIT 1`
      user = rows[0]
    } catch (e) {
      console.error('[auth] DB error', e)
      return null
    }
    if (!user) return null
    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: parseRoles(user.roles),
      avatarUrl: user.avatarUrl,
      verificationStatus: user.verificationStatus,
      verifiedAt: user.verifiedAt,
      hasProfessional: !!user.hasProfessional,
      hasProvider: !!user.hasProvider,
      lat: user.lat,
      lng: user.lng,
      radiusKm: user.searchRadiusKm,
    }
  } catch {
    return null
  }
}
