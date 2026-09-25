// Sugerencias de los usuarios (D25, 25/09/2026): reglas puras, sin base ni red.
// Las usan la API (/api/feedback, /api/admin/feedback), las pantallas y los tests.
// Todo el texto en español rioplatense (lo ve el usuario).
import { z } from 'zod'

export const FEEDBACK_BUCKET = 'feedback-evidencias'
/** folder de /api/uploads que va al bucket privado de evidencias */
export const FEEDBACK_UPLOAD_FOLDER = 'sugerencias'
export const MAX_FOTOS = 4
export const TOPE_DIARIO = 10

export type RolFeedback = 'cliente' | 'profesional' | 'proveedor'
export const ROLES_FEEDBACK: RolFeedback[] = ['cliente', 'profesional', 'proveedor']

// ── Tipos ────────────────────────────────────────────────────────────────────
export const TIPOS = [
  { id: 'sugerencia', label: 'Sugerencia', ayuda: 'Una idea para que HomIA funcione mejor.' },
  { id: 'queja', label: 'Queja', ayuda: 'Algo que te molestó o no salió como esperabas.' },
  { id: 'mejora', label: 'Mejora', ayuda: 'Algo que ya existe y podría ser más fácil o más claro.' },
  { id: 'oportunidad', label: 'Oportunidad', ayuda: 'Algo nuevo que HomIA podría ofrecer (un servicio, un negocio).' },
  { id: 'problema', label: 'Problema técnico', ayuda: 'Algo no funciona: un error, un botón que no anda, una pantalla rota.' },
  { id: 'otro', label: 'Otro', ayuda: 'Cualquier otra cosa que nos quieras contar.' },
] as const
export type TipoFeedback = (typeof TIPOS)[number]['id']
export const TIPO_IDS = TIPOS.map((t) => t.id) as [TipoFeedback, ...TipoFeedback[]]
export const tipoLabel = (id: string) => TIPOS.find((t) => t.id === id)?.label || id

// ── Estados ──────────────────────────────────────────────────────────────────
export const ESTADOS = [
  { id: 'recibida', label: 'Recibida', ayuda: 'La recibimos y todavía no la miramos.' },
  { id: 'en_revision', label: 'En revisión', ayuda: 'La estamos analizando.' },
  { id: 'planificada', label: 'Planificada', ayuda: 'La vamos a hacer: está en los planes.' },
  { id: 'resuelta', label: 'Resuelta', ayuda: 'Ya está hecha o solucionada.' },
  { id: 'descartada', label: 'Descartada', ayuda: 'Por ahora no la vamos a hacer.' },
] as const
export type EstadoFeedback = (typeof ESTADOS)[number]['id']
export const ESTADO_IDS = ESTADOS.map((e) => e.id) as [EstadoFeedback, ...EstadoFeedback[]]
export const estadoLabel = (id: string) => ESTADOS.find((e) => e.id === id)?.label || id

// ── Áreas (¿sobre qué?) según el rol ─────────────────────────────────────────
export const AREAS = [
  { id: 'busqueda', label: 'Búsqueda y mapa', roles: ['cliente', 'profesional', 'proveedor'] },
  { id: 'directorio', label: 'Directorio', roles: ['cliente', 'profesional', 'proveedor'] },
  { id: 'publicar', label: 'Publicar trabajo', roles: ['cliente'] },
  { id: 'contratar', label: 'Contratar', roles: ['cliente'] },
  { id: 'bolsa', label: 'Bolsa de trabajos y ofertas', roles: ['profesional'] },
  { id: 'proyectos', label: 'Proyectos', roles: ['cliente', 'profesional'] },
  { id: 'materiales', label: 'Materiales y carrito', roles: ['cliente', 'profesional'] },
  { id: 'pedidos', label: 'Pedidos', roles: ['cliente', 'profesional', 'proveedor'] },
  { id: 'stock', label: 'Stock', roles: ['proveedor'] },
  { id: 'pagos', label: 'Pagos y Mercado Pago', roles: ['cliente', 'profesional', 'proveedor'] },
  { id: 'facturas', label: 'Facturas y cobros', roles: ['cliente', 'profesional', 'proveedor'] },
  { id: 'mensajes', label: 'Mensajes', roles: ['cliente', 'profesional', 'proveedor'] },
  { id: 'resenas', label: 'Reseñas', roles: ['cliente', 'profesional', 'proveedor'] },
  { id: 'sobrantes', label: 'Sobrantes y devoluciones', roles: ['cliente', 'profesional', 'proveedor'] },
  { id: 'calendario', label: 'Calendario y fechas', roles: ['cliente', 'profesional'] },
  { id: 'finanzas', label: 'Finanzas', roles: ['profesional', 'proveedor'] },
  { id: 'crm', label: 'CRM', roles: ['profesional', 'proveedor'] },
  { id: 'plan', label: 'Mi plan', roles: ['proveedor'] },
  { id: 'verificacion', label: 'Verificación de identidad', roles: ['cliente', 'profesional', 'proveedor'] },
  { id: 'homy', label: 'Homy (asistente)', roles: ['cliente', 'profesional', 'proveedor'] },
  { id: 'perfil', label: 'Mi perfil y cuenta', roles: ['cliente', 'profesional', 'proveedor'] },
  { id: 'otra', label: 'Otra', roles: ['cliente', 'profesional', 'proveedor'] },
] as const
export type AreaFeedback = (typeof AREAS)[number]['id']
export const AREA_IDS = AREAS.map((a) => a.id) as [AreaFeedback, ...AreaFeedback[]]
export const areaLabel = (id: string) => AREAS.find((a) => a.id === id)?.label || id
export function areasDelRol(rol: string) {
  return AREAS.filter((a) => (a.roles as readonly string[]).includes(rol))
}

// ── Validación ───────────────────────────────────────────────────────────────

/** Path privado válido: "feedback-evidencias/<userId>/sugerencias/<archivo>.(jpg|png|webp)" del propio usuario. */
export function esFotoPropia(ref: string, userId: string): boolean {
  if (typeof ref !== 'string' || !userId || !/^[A-Za-z0-9_-]{1,60}$/.test(userId)) return false
  const re = new RegExp(`^${FEEDBACK_BUCKET}/${userId}/${FEEDBACK_UPLOAD_FOLDER}/[A-Za-z0-9_-]{1,80}\\.(jpg|jpeg|png|webp)$`)
  return re.test(ref)
}

const textoLimpio = (min: number, max: number, campo: string) =>
  z
    .string({ error: `Falta ${campo}` })
    .transform((s) => s.replace(/\r\n/g, '\n').trim())
    .pipe(
      z
        .string()
        .min(min, min <= 1 ? `Falta ${campo}` : `${campo[0].toUpperCase()}${campo.slice(1)}: escribí al menos ${min} caracteres`)
        .max(max, `${campo[0].toUpperCase()}${campo.slice(1)}: máximo ${max} caracteres`)
    )

const contextoSchema = z
  .object({
    pantalla: z.string().max(300).optional(),
    navegador: z.string().max(400).optional(),
    dispositivo: z.string().max(120).optional(),
    fecha: z.string().max(60).optional(),
    zonaHoraria: z.string().max(60).optional(),
  })
  .strict()
export type ContextoFeedback = z.infer<typeof contextoSchema>

/** Esquema del alta. Los paths de fotos se validan contra el usuario de la sesión. */
export function crearFeedbackSchema(userId: string) {
  return z.object({
    role: z.enum(['cliente', 'profesional', 'proveedor'], { error: 'Elegí desde qué panel escribís' }),
    type: z.enum(TIPO_IDS, { error: 'Elegí el tipo' }),
    area: z.enum(AREA_IDS, { error: 'Elegí sobre qué parte de HomIA es' }),
    title: textoLimpio(4, 120, 'el título'),
    description: textoLimpio(10, 4000, 'la descripción'),
    photos: z
      .array(z.string().max(300).refine((p) => esFotoPropia(p, userId), 'Las fotos tienen que subirse desde esta cuenta'))
      .max(MAX_FOTOS, `Podés adjuntar hasta ${MAX_FOTOS} fotos`)
      .optional()
      .default([])
      .refine((arr) => new Set(arr).size === arr.length, 'Hay una foto repetida'),
    context: contextoSchema.nullable().optional(),
    contactOk: z.boolean().optional().default(true),
  }).refine((d) => areasDelRol(d.role).some((a) => a.id === d.area), { message: 'Esa sección no corresponde a ese panel', path: ['area'] })
}

export const actualizarFeedbackSchema = z
  .object({
    status: z.enum(ESTADO_IDS, { error: 'Estado inválido' }).optional(),
    adminResponse: z
      .string()
      .transform((s) => s.trim())
      .pipe(z.string().max(4000, 'La respuesta: máximo 4000 caracteres'))
      .optional(),
  })
  .refine((d) => d.status !== undefined || d.adminResponse !== undefined, { message: 'Nada para actualizar' })

// ── Tope diario ──────────────────────────────────────────────────────────────

/** Inicio del día de hoy en hora argentina (UTC-3, sin horario de verano) como instante UTC. */
export function inicioDelDiaAR(ahora: Date = new Date()): Date {
  const ar = new Date(ahora.getTime() - 3 * 3600_000)
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), ar.getUTCDate()) + 3 * 3600_000)
}

/** ¿Puede mandar otra? `enviadasHoy` = cuántas creó desde inicioDelDiaAR(). */
export function superaTope(enviadasHoy: number, tope = TOPE_DIARIO): boolean {
  return enviadasHoy >= tope
}

export const MENSAJE_TOPE = `Llegaste al máximo de ${TOPE_DIARIO} envíos por día. Probá de nuevo mañana.`

// ── Administración ───────────────────────────────────────────────────────────

// El administrador ya no es una cuenta de usuario (D29): entra a /admin con ADMIN_EMAIL y
// ADMIN_PASSWORD y las APIs /api/admin/* usan requireAdmin() de src/lib/admin.ts.

/** Casilla del equipo de HomIA que recibe cada envío nuevo. */
export function casillaEquipo(titularEmail: string): string {
  return (process.env.FEEDBACK_EMAIL || '').trim() || titularEmail
}

/** Link de la SPA a "Mis sugerencias" del rol. */
export const linkMisSugerencias = (rol: string) => `/panel/${ROLES_FEEDBACK.includes(rol as RolFeedback) ? rol : 'cliente'}/sugerencias`
export const LINK_BANDEJA = '/admin/sugerencias' // área /admin independiente del rol (D29)
