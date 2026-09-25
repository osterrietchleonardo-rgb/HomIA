// Área /admin con ingreso propio (D29) — reglas puras, sin next/headers (se testean con node --test).
// El administrador NO es una cuenta de usuario ni un rol: entra con ADMIN_EMAIL y ADMIN_PASSWORD
// (variables de entorno del servidor) y recibe una cookie propia `homia_admin`, independiente de
// la sesión de usuario `homy_session`.
import { createHash, timingSafeEqual } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'

export const COOKIE_ADMIN = 'homia_admin'
export const DURACION_ADMIN_S = 12 * 60 * 60 // 12 h
export const MAX_FALLOS_ADMIN = 5
export const VENTANA_FALLOS_MS = 15 * 60 * 1000
const AUDIENCIA = 'homia-admin'

/** Credenciales configuradas (email en minúsculas); null si falta alguna. */
export function credencialesAdmin(env: Record<string, string | undefined> = process.env): { email: string; password: string } | null {
  const email = (env.ADMIN_EMAIL || '').trim().toLowerCase()
  const password = env.ADMIN_PASSWORD || ''
  if (!email || !password) return null
  return { email, password }
}

const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest()
/** Comparación en tiempo constante (hash sha256 de ambos lados: mismo largo siempre). */
export function igualSeguro(a: string, b: string): boolean {
  return timingSafeEqual(sha(a), sha(b))
}

/**
 * ¿Coinciden con ADMIN_EMAIL y ADMIN_PASSWORD? Compara SIEMPRE las dos (sin cortar antes) para no
 * revelar cuál falló ni por el tiempo de respuesta.
 */
export function verificarCredenciales(email: string, password: string, env: Record<string, string | undefined> = process.env): 'ok' | 'mal' | 'no_configurado' {
  const c = credencialesAdmin(env)
  if (!c) return 'no_configurado'
  const okEmail = igualSeguro(String(email || '').trim().toLowerCase(), c.email)
  const okPass = igualSeguro(String(password || ''), c.password)
  return okEmail && okPass ? 'ok' : 'mal'
}

function clave(secret: string) {
  return new TextEncoder().encode(secret)
}

/** JWT de la sesión de admin (`sub: 'admin'`, audiencia propia, vence en 12 h). */
export async function firmarTokenAdmin(secret: string, ahora = Date.now()): Promise<string> {
  return new SignJWT({ sub: 'admin' })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience(AUDIENCIA)
    .setIssuedAt(Math.floor(ahora / 1000))
    .setExpirationTime(Math.floor(ahora / 1000) + DURACION_ADMIN_S)
    .sign(clave(secret))
}

/** ¿Token de admin válido? Un JWT de sesión de usuario (sin la audiencia `homia-admin`) NO sirve. */
export async function verificarTokenAdmin(token: string | null | undefined, secret: string): Promise<boolean> {
  if (!token) return false
  try {
    const { payload } = await jwtVerify(token, clave(secret), { audience: AUDIENCIA })
    return payload.sub === 'admin'
  } catch {
    return false
  }
}

/** Contador de fallos por IP en memoria (ventana fija). En Vercel se suma una regla de Firewall. */
export function crearLimitadorFallos(max = MAX_FALLOS_ADMIN, ventanaMs = VENTANA_FALLOS_MS) {
  const fallos = new Map<string, { n: number; hasta: number }>()
  return {
    bloqueado(ip: string, ahora = Date.now()): boolean {
      const f = fallos.get(ip)
      if (!f || f.hasta <= ahora) return false
      return f.n >= max
    },
    fallo(ip: string, ahora = Date.now()) {
      const f = fallos.get(ip)
      if (!f || f.hasta <= ahora) fallos.set(ip, { n: 1, hasta: ahora + ventanaMs })
      else f.n++
    },
  }
}
