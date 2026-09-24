// Tipos compartidos del súper agente Homy (servidor ↔ cliente).
// Sin dependencias de servidor: lo importan también los componentes.

/** Por dónde entró la consulta. Define cupo, contexto y sugerencias. */
export type Puerta = 'home_buscador' | 'home_flotante' | 'panel' | 'buscar'

/** Quién pregunta (del JWT, nunca del body). */
export type RolHomy = 'visitante' | 'cliente' | 'profesional' | 'proveedor'

export type TarjetaProveedor = {
  tipo: 'proveedor'
  id: string
  nombre: string
  ciudad: string | null
  verificado: boolean
  rating: number
  resenas: number
  recomendado: boolean
  distanciaKm: number | null
  href: string
}

/** Oferta concreta: un material en stock de un proveedor. id = stockId. */
export type TarjetaMaterial = {
  tipo: 'material'
  id: string
  elementoId: string
  nombre: string
  marca: string | null
  precio: number
  unidad: string
  estadoStock: string
  proveedorId: string
  proveedor: string
  verificado: boolean
  recomendado: boolean
  rating: number
  resenas: number
  distanciaKm: number | null
  hrefProveedor: string
  /** deep link que agrega al carrito (visitante: registro con volver) */
  hrefCarrito: string
  aceptaMercadoPago: boolean
}

export type TarjetaProfesional = {
  tipo: 'profesional'
  id: string
  nombre: string
  rubros: string[]
  ciudad: string | null
  verificado: boolean
  rating: number
  resenas: number
  obras: number
  distanciaKm: number | null
  href: string
}

export type TarjetaTrabajo = {
  tipo: 'trabajo'
  id: string
  titulo: string
  rubro: string
  urgencia: string
  presupuestoMin: number | null
  presupuestoMax: number | null
  ciudad: string | null
  presupuestos: number
  distanciaKm: number | null
  href: string
}

/** Material sugerido del catálogo (conocimiento, no vitrina). */
export type TarjetaElemento = {
  tipo: 'elemento'
  id: string
  nombre: string
  paraQueSirve: string
  unidad: string
  rubro: string
  conStock: number
}

export type Tarjeta = TarjetaProveedor | TarjetaMaterial | TarjetaProfesional | TarjetaTrabajo | TarjetaElemento

export type Accion = { etiqueta: string; href: string }

export type Cupo = { limite: number; usadas: number; restantes: number; tipo: 'visitante' | 'usuario' }

export type RespuestaFinal = {
  mensaje: string
  tarjetas: Tarjeta[]
  acciones: Accion[]
  sugerencias: string[]
  pregunta: string | null
  /** true si la respuesta la armó el código sin IA (falla del modelo) */
  degradado: boolean
}

/** Eventos del stream NDJSON de POST /api/homy/agent. */
export type EventoHomy =
  | { t: 'inicio'; sessionId: string | null; cupo: Cupo | null }
  | { t: 'paso'; texto: string }
  | { t: 'texto'; delta: string }
  | { t: 'texto_reinicio' }
  | ({ t: 'final'; sessionId: string | null; cupo: Cupo | null; runId: string | null } & RespuestaFinal)
  | { t: 'limite'; mensaje: string; acciones: Accion[]; cupo: Cupo }
  | { t: 'error'; mensaje: string }

/** Mensaje persistido que devuelve GET /api/homy/agent?sessionId= */
export type TurnoGuardado = {
  id: string
  rol: 'user' | 'homy'
  texto: string
  tarjetas?: Tarjeta[]
  acciones?: Accion[]
  sugerencias?: string[]
}
