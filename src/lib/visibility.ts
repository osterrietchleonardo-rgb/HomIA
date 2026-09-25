// Visibilidad pública de usuarios (D20, 24/09/2026).
//
// Dos reglas, un solo lugar:
//   1. Una cuenta ELIMINADA (User.deletedAt, "Eliminar mi cuenta") nunca aparece en lo público.
//   2. En producción siempre (y en local con HIDE_DEMO_USERS=1) tampoco aparecen
//      las cuentas de demostración y de prueba (email terminado en @homia.test): así el
//      primer cliente real no ve profesionales, proveedores, trabajos ni reseñas falsos.
//      Las cuentas demo siguen pudiendo iniciar sesión y usar su panel.
// Sin la variable (o en 0), todo se ve como siempre salvo las cuentas eliminadas.
//
// Se usa en TODAS las superficies públicas y de descubrimiento: directorio, búsqueda,
// pines del mapa, marketplace, comparables, sponsors, perfiles públicos, bolsa de trabajos
// y las herramientas de datos del agente Homy.
import type { Prisma } from '@prisma/client'

export const DEMO_EMAIL_SUFFIX = '@homia.test'

/**
 * true si hay que esconder las cuentas de prueba (@homia.test) de lo público.
 * En el sitio publicado (VERCEL_ENV=production) SIEMPRE: la base es una sola y las suites E2E crean
 * cuentas @homia.test mientras corren (25/09/2026 se vio "[E2E] Corralón" en la cinta de la home).
 * Fuera de producción, solo con HIDE_DEMO_USERS=1 (las suites corren sin él para verse a sí mismas).
 */
export function ocultarDemo(env: { HIDE_DEMO_USERS?: string; VERCEL_ENV?: string } = process.env as { HIDE_DEMO_USERS?: string; VERCEL_ENV?: string }): boolean {
  if (env.VERCEL_ENV === 'production') return true
  return (env.HIDE_DEMO_USERS || '').trim() === '1'
}

/** `where` de Prisma sobre `User`: solo usuarios que se pueden mostrar en lo público. */
export function whereUsuarioPublico(): Prisma.UserWhereInput {
  if (ocultarDemo()) {
    return { deletedAt: null, NOT: { email: { endsWith: DEMO_EMAIL_SUFFIX, mode: 'insensitive' } } }
  }
  return { deletedAt: null }
}

/** Misma regla que `whereUsuarioPublico`, para un usuario ya leído de la base. */
export function esUsuarioPublico(u: { email: string; deletedAt: Date | null }): boolean {
  if (u.deletedAt) return false
  if (ocultarDemo() && u.email.toLowerCase().endsWith(DEMO_EMAIL_SUFFIX)) return false
  return true
}
