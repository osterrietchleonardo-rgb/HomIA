// Rutas del área /admin (D29). Sin dependencias de servidor: lo usa la SPA.
export const RUTA_ADMIN = '/admin'
export const RUTA_ADMIN_METRICAS = '/admin/metricas'
export const RUTA_ADMIN_SUGERENCIAS = '/admin/sugerencias'
export const RUTA_ADMIN_INGRESOS = '/admin/ingresos' // D30

/** Rutas viejas (dentro del panel de un rol) → nuevas. Devuelve null si no es una ruta vieja. */
export function rutaAdminNueva(path: string, query = ''): string | null {
  const m = path.match(/^\/panel\/admin(?:\/(metricas|sugerencias))?\/?$/)
  if (!m) return null
  return `${m[1] ? `/admin/${m[1]}` : RUTA_ADMIN_METRICAS}${query ? `?${query}` : ''}`
}
