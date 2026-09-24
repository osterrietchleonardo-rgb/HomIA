// Visibilidad pública de usuarios (D20, 24/09/2026).
//
// Dos reglas, un solo lugar:
//   1. Una cuenta ELIMINADA (User.deletedAt, "Eliminar mi cuenta") nunca aparece en lo público.
//   2. Con HIDE_DEMO_USERS=1 (se prende en Vercel el día del lanzamiento) tampoco aparecen
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

/** true si hay que esconder las cuentas demo (@homia.test) de lo público. */
export function ocultarDemo(): boolean {
  return (process.env.HIDE_DEMO_USERS || '').trim() === '1'
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
