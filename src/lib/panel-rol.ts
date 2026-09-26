// Perfil activo del panel (cliente / profesional / proveedor).
//
// Dentro de /panel/<rol>/… el rol sale de la ruta. Las pantallas compartidas que también
// viven dentro del panel (/trabajo/<id>, /profesional/<id>, /buscar, /notificaciones,
// /directorio, /carrito…) no tienen el rol en la ruta: antes caían en `roles[0]`, que para
// casi todos es "cliente" (todo registro suma cliente), y un profesional que abría un trabajo
// de la bolsa veía "Perfil: Cliente". Ahora usan el ÚLTIMO perfil con el que la persona
// estuvo trabajando (se recuerda al entrar a /panel/<rol>), si todavía lo tiene.
// Sin React: la lógica pura (`elegirRolActivo`) tiene tests en src/lib/__tests__/panel-rol.test.ts.

export const ROLES_PANEL = ['cliente', 'profesional', 'proveedor'] as const
const CLAVE = 'homia_panel_rol'
let enMemoria: string | null = null

const esRolPanel = (r: string | null | undefined): r is string => !!r && (ROLES_PANEL as readonly string[]).includes(r)

/**
 * Regla pura: el rol de la ruta del panel manda; fuera del panel, el recordado (si el usuario
 * lo sigue teniendo); si no, el primero de sus roles; sin sesión, "cliente".
 */
export function elegirRolActivo(segments: string[], roles: string[] | undefined, recordado: string | null): string {
  if (segments[0] === 'panel' && segments[1]) return segments[1]
  if (esRolPanel(recordado) && roles?.includes(recordado)) return recordado
  return roles?.[0] || 'cliente'
}

/** Anota el perfil con el que se está trabajando (lo llama el panel al entrar a /panel/<rol>). */
export function recordarRolPanel(rol: string): void {
  if (!esRolPanel(rol)) return
  enMemoria = rol
  try { window.localStorage.setItem(CLAVE, rol) } catch { /* sin storage: queda en memoria */ }
}

function rolRecordado(): string | null {
  if (enMemoria) return enMemoria
  try {
    if (typeof window === 'undefined') return null
    enMemoria = window.localStorage.getItem(CLAVE)
  } catch { /* sin storage */ }
  return enMemoria
}

/** Rol activo para la ruta actual (ver `elegirRolActivo`). Solo en el navegador (lee el recordado). */
export function rolActivo(segments: string[], roles: string[] | undefined): string {
  return elegirRolActivo(segments, roles, rolRecordado())
}
