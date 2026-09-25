// Área /admin con ingreso propio (D29) — sesión de administración para las APIs.
// Único punto de verdad: TODA API de administración (/api/admin/*) llama a requireAdmin().
// Sin la cookie `homia_admin` válida → 404 (no se revela que la ruta existe). La sesión de
// usuario (`homy_session`) no sirve para esto, ni al revés.
import 'server-only'
import { cookies, headers } from 'next/headers'
import { fail } from '@/lib/api'
import { COOKIE_ADMIN, DURACION_ADMIN_S, firmarTokenAdmin, verificarTokenAdmin } from './admin-core'

const SECRETO = process.env.AUTH_SECRET || 'homy-dev-secret-cambiar-en-produccion-9f2a'

/** ¿Hay una sesión de administración válida en este pedido? */
export async function getAdminSession(): Promise<{ admin: true } | null> {
  try {
    const token = (await cookies()).get(COOKIE_ADMIN)?.value
    return (await verificarTokenAdmin(token, SECRETO)) ? { admin: true } : null
  } catch {
    return null
  }
}

/** Para las APIs: `{ ok: true }` o `{ response }` 404 listo para devolver. */
export async function requireAdmin(): Promise<{ ok: true; response?: undefined } | { ok?: undefined; response: ReturnType<typeof fail> }> {
  return (await getAdminSession()) ? { ok: true } : { response: fail('No encontrado', 404) }
}

/** Abre la sesión de admin: cookie httpOnly propia, SameSite=Strict, Secure en HTTPS, 12 h. */
export async function crearSesionAdmin() {
  const token = await firmarTokenAdmin(SECRETO)
  const proto = ((await headers()).get('x-forwarded-proto') || '').split(',')[0].trim()
  ;(await cookies()).set(COOKIE_ADMIN, token, {
    httpOnly: true,
    sameSite: 'strict',
    secure: proto === 'https',
    maxAge: DURACION_ADMIN_S,
    path: '/',
  })
}

export async function cerrarSesionAdmin() {
  ;(await cookies()).delete(COOKIE_ADMIN)
}
