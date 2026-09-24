// Mapa FIJO de secciones válidas de la app (espejo de las rutas de app-root.tsx).
// Guardarraíl de Homy: un link solo puede ser (a) una de estas secciones o
// (b) un link que devolvió una herramienta en la misma corrida. Nada más.
import type { RolHomy } from './tipos'

export type Seccion = { ruta: string; nombre: string; rol: 'publico' | 'cliente' | 'profesional' | 'proveedor' }

const comunes = (rol: 'cliente' | 'profesional' | 'proveedor'): Seccion[] => [
  { ruta: `/panel/${rol}/directorio`, nombre: 'Directorio', rol },
  { ruta: `/panel/${rol}/mensajes`, nombre: 'Mensajes', rol },
  { ruta: `/panel/${rol}/verificacion`, nombre: 'Verificación de identidad (DNI)', rol },
  { ruta: `/panel/${rol}/ayuda`, nombre: 'Centro de ayuda', rol },
]

export const SECCIONES: Seccion[] = [
  { ruta: '/', nombre: 'Inicio de HomIA', rol: 'publico' },
  { ruta: '/buscar', nombre: 'Buscador con mapa', rol: 'publico' },
  { ruta: '/directorio', nombre: 'Directorio de profesionales y proveedores', rol: 'publico' },
  { ruta: '/materiales', nombre: 'Materiales (marketplace)', rol: 'publico' },
  { ruta: '/carrito', nombre: 'Carrito', rol: 'publico' },
  { ruta: '/ayuda', nombre: 'Centro de ayuda', rol: 'publico' },
  { ruta: '/registrarse', nombre: 'Crear cuenta gratis', rol: 'publico' },
  { ruta: '/ingresar', nombre: 'Ingresar', rol: 'publico' },
  // cliente
  { ruta: '/panel/cliente', nombre: 'Inicio del cliente', rol: 'cliente' },
  { ruta: '/panel/cliente/publicar', nombre: 'Publicar trabajo', rol: 'cliente' },
  { ruta: '/panel/cliente/trabajos', nombre: 'Mis trabajos', rol: 'cliente' },
  { ruta: '/panel/cliente/materiales', nombre: 'Materiales (buscar y comprar)', rol: 'cliente' },
  { ruta: '/panel/cliente/pedidos', nombre: 'Mis pedidos de materiales', rol: 'cliente' },
  { ruta: '/panel/cliente/proyectos', nombre: 'Proyectos', rol: 'cliente' },
  { ruta: '/panel/cliente/facturas', nombre: 'Facturas', rol: 'cliente' },
  { ruta: '/panel/cliente/perfil', nombre: 'Mi perfil', rol: 'cliente' },
  ...comunes('cliente'),
  // profesional
  { ruta: '/panel/profesional', nombre: 'Inicio del profesional', rol: 'profesional' },
  { ruta: '/panel/profesional/bolsa', nombre: 'Bolsa de trabajos', rol: 'profesional' },
  { ruta: '/panel/profesional/materiales', nombre: 'Materiales', rol: 'profesional' },
  { ruta: '/panel/profesional/pedidos', nombre: 'Mis pedidos de materiales', rol: 'profesional' },
  { ruta: '/panel/profesional/proyectos', nombre: 'Proyectos', rol: 'profesional' },
  { ruta: '/panel/profesional/cobros', nombre: 'Cobros (facturas, cobrado y pendiente, conectar Mercado Pago)', rol: 'profesional' },
  { ruta: '/panel/profesional/presupuestos', nombre: 'Mis ofertas (presupuestos)', rol: 'profesional' },
  { ruta: '/panel/profesional/crm', nombre: 'CRM clientes', rol: 'profesional' },
  { ruta: '/panel/profesional/obras', nombre: 'Mis obras', rol: 'profesional' },
  { ruta: '/panel/profesional/vinculaciones', nombre: 'Cuentas de retiro (vinculaciones)', rol: 'profesional' },
  { ruta: '/panel/profesional/devoluciones', nombre: 'Devoluciones de sobrantes', rol: 'profesional' },
  { ruta: '/panel/profesional/perfil', nombre: 'Mi perfil', rol: 'profesional' },
  ...comunes('profesional'),
  // proveedor
  { ruta: '/panel/proveedor', nombre: 'Inicio del proveedor', rol: 'proveedor' },
  { ruta: '/panel/proveedor/stock', nombre: 'Stock', rol: 'proveedor' },
  { ruta: '/panel/proveedor/cobros', nombre: 'Cobros (y conectar Mercado Pago)', rol: 'proveedor' },
  { ruta: '/panel/proveedor/plan', nombre: 'Mi plan', rol: 'proveedor' },
  { ruta: '/panel/proveedor/crm', nombre: 'CRM', rol: 'proveedor' },
  { ruta: '/panel/proveedor/vinculaciones', nombre: 'Vinculaciones', rol: 'proveedor' },
  { ruta: '/panel/proveedor/perfil', nombre: 'Mi perfil', rol: 'proveedor' },
  ...comunes('proveedor'),
]

/** Parámetros de query que pueden viajar en un link (el resto se rechaza). */
const QUERY_OK = new Set(['tab', 'stock', 'q', 'mode', 'cat', 'volver', 'rol', 'compra'])

/** Rutas con ids que solo valen si el id salió de una herramienta. */
const RUTA_ENTIDAD = /^\/(profesional|proveedor|trabajo)\/([A-Za-z0-9_-]{6,40})$/

export type LinkNormalizado = { path: string; query: URLSearchParams }

/** Parsea un href interno. null si es externo, relativo raro o trae basura. */
export function normalizarHref(href: string): LinkNormalizado | null {
  const h = (href || '').trim().replace(/^#/, '')
  if (!h.startsWith('/') || h.startsWith('//') || /[\s<>"'`\\]/.test(h)) return null
  const [path, qs = ''] = h.split('?')
  const clean = path.length > 1 ? path.replace(/\/+$/, '') : path
  const query = new URLSearchParams(qs)
  for (const k of query.keys()) if (!QUERY_OK.has(k)) return null
  return { path: clean, query }
}

/** Forma canónica de un href (para comparar links de herramientas). */
export function canonHref(href: string): string {
  const n = normalizarHref(href)
  if (!n) return ''
  const qs = n.query.toString()
  return `${n.path}${qs ? `?${qs}` : ''}`
}

/** Secciones de la app que puede linkear este rol (visitante: todas, se convierten a registro). */
export function seccionesDelRol(rol: RolHomy, rolesUsuario: string[] = []): Seccion[] {
  if (rol === 'visitante') return SECCIONES
  const mios = new Set(['publico', ...rolesUsuario, rol])
  return SECCIONES.filter((s) => mios.has(s.rol))
}

export function requiereCuenta(path: string): boolean {
  return path.startsWith('/panel/') || path === '/panel' || path === '/mensajes' || path === '/notificaciones'
}

/**
 * ¿El link es válido para esta corrida? Acepta: sección fija del rol, o un link
 * que devolvió una herramienta (conjunto `deHerramientas`, comparado sin query).
 */
export function linkPermitido(href: string, rol: RolHomy, rolesUsuario: string[], deHerramientas: Set<string>): boolean {
  const n = normalizarHref(href)
  if (!n) return false
  // el registro con "volver" vale si el destino es válido
  if (n.path === '/registrarse' || n.path === '/ingresar') {
    const volver = n.query.get('volver')
    return !volver || linkPermitido(volver, rol === 'visitante' ? 'visitante' : rol, rolesUsuario, deHerramientas)
  }
  const exacto = canonHref(href)
  if (deHerramientas.has(exacto) || deHerramientas.has(n.path)) return true
  if (RUTA_ENTIDAD.test(n.path)) return false // un id que no salió de una herramienta
  return seccionesDelRol(rol, rolesUsuario).some((s) => s.ruta === n.path)
}

/** Visitante: lo que exige cuenta se convierte en "creá tu cuenta y volvés acá". */
export function adaptarParaVisitante(href: string): string {
  const n = normalizarHref(href)
  if (!n) return href
  if (!requiereCuenta(n.path)) return href
  const destino = `${n.path}${n.query.toString() ? `?${n.query.toString()}` : ''}`
  return `/registrarse?volver=${encodeURIComponent(destino)}`
}

/** Link al carrito (deep link del equipo de carrito: agrega el stock al carrito). */
export function linkCarrito(stockId: string, nombre: string, rol: RolHomy = 'cliente'): string {
  // el profesional compra desde SU panel de materiales (mismo componente); el resto, desde el del cliente
  const panel = rol === 'profesional' ? 'profesional' : 'cliente'
  return `/panel/${panel}/materiales?stock=${encodeURIComponent(stockId)}&q=${encodeURIComponent(nombre)}`
}
