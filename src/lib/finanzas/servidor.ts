// Finanzas (D24): helpers de las rutas /api/finanzas/*. El dueño SIEMPRE sale de la
// sesión (getSessionUser), nunca del body ni del query (anti-IDOR); el rol se valida
// contra los roles de la sesión y su perfil.
import 'server-only'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail } from '@/lib/api'
import { getSessionUser, type SessionUser } from '@/lib/auth'
import { categoria, TIPOS_MOVIMIENTO, METODOS_PAGO, type RolFinanzas, type TipoMovimiento } from './conceptos'
import { periodo, claveDia, inicioDia, type Periodo, type Preset } from './calculos'

export const rolSchema = z.enum(['profesional', 'proveedor'], { message: 'role tiene que ser profesional o proveedor' })

/** Sesión + rol con perfil. Devuelve el usuario o la respuesta de error (401/403). */
export async function sesionConRol(role: unknown): Promise<{ user: SessionUser; rol: RolFinanzas } | { response: Response }> {
  const user = await getSessionUser()
  if (!user) return { response: fail('Necesitás iniciar sesión para ver tus finanzas', 401) }
  const r = rolSchema.safeParse(role)
  if (!r.success) return { response: fail(r.error.issues[0].message, 400) }
  const tienePerfil = r.data === 'profesional' ? user.hasProfessional : user.hasProvider
  if (!user.roles.includes(r.data) || !tienePerfil) {
    return { response: fail(`Finanzas es del perfil ${r.data === 'profesional' ? 'profesional' : 'proveedor'}`, 403, { needsRole: r.data }) }
  }
  return { user, rol: r.data }
}

const diaRe = /^\d{4}-\d{2}-\d{2}$/
export const diaSchema = z.string().regex(diaRe, 'La fecha tiene que ser AAAA-MM-DD').refine((s) => !Number.isNaN(inicioDia(s).getTime()) && claveDia(inicioDia(s)) === s, 'Fecha inválida')

/** Día "AAAA-MM-DD" guardado al mediodía argentino (15:00 UTC): nunca se corre de día. */
export const diaADate = (s: string) => new Date(inicioDia(s).getTime() + 12 * 3600_000)

const PRESETS: Preset[] = ['mes', 'mes_anterior', '3m', '6m', '12m', 'anio', 'rango']

/** Período del query: ?periodo=mes|mes_anterior|3m|6m|12m|anio o ?desde=&hasta= (rango). */
export function periodoDeQuery(sp: URLSearchParams, hoy = new Date()): { p: Periodo } | { error: string } {
  const desde = sp.get('desde')
  const hasta = sp.get('hasta')
  const preset = (sp.get('periodo') || (desde && hasta ? 'rango' : 'mes')) as Preset
  if (!PRESETS.includes(preset)) return { error: 'periodo tiene que ser mes, mes_anterior, 3m, 6m, 12m, anio o rango' }
  if (preset === 'rango') {
    if (!desde || !hasta || !diaSchema.safeParse(desde).success || !diaSchema.safeParse(hasta).success) return { error: 'Para un rango mandá desde y hasta como AAAA-MM-DD' }
    if (desde > hasta) return { error: 'La fecha "desde" tiene que ser anterior a "hasta"' }
    if (inicioDia(hasta).getTime() - inicioDia(desde).getTime() > 5 * 366 * 86400_000) return { error: 'El rango puede ser de hasta 5 años' }
    return { p: periodo('rango', hoy, { desde, hasta }) }
  }
  return { p: periodo(preset, hoy) }
}

// ─────────────────────────── validación de un movimiento ───────────────────────────

const SUPABASE = (process.env.SUPABASE_PROJECT_URL || '').replace(/\/+$/, '')

export const movimientoSchema = z.object({
  type: z.enum(TIPOS_MOVIMIENTO as [TipoMovimiento, ...TipoMovimiento[]], { message: 'Tipo de movimiento inválido' }),
  category: z.string().min(1, 'Elegí una categoría').max(60),
  description: z.string().trim().min(1, 'Escribí una descripción corta').max(200, 'La descripción puede tener hasta 200 caracteres'),
  amount: z.number({ message: 'El monto tiene que ser un número' }).positive('El monto tiene que ser mayor a cero').max(1e11, 'El monto es demasiado grande'),
  interestAmount: z.number().min(0, 'El interés no puede ser negativo').nullable().optional(),
  date: diaSchema,
  paymentMethod: z.enum(METODOS_PAGO, { message: 'Medio de pago inválido' }).nullable().optional(),
  recurring: z.enum(['mensual']).nullable().optional(),
  recurringUntil: diaSchema.nullable().optional(),
  projectId: z.string().min(1).max(40).nullable().optional(),
  usefulLifeMonths: z.number().int('La vida útil va en meses enteros').min(1, 'La vida útil es de al menos 1 mes').max(600, 'La vida útil puede ser de hasta 600 meses').nullable().optional(),
  status: z.enum(['pagado', 'pendiente']).optional(),
  attachmentUrl: z.string().url('El comprobante tiene que ser una foto subida').max(500).nullable().optional(),
})
export type MovimientoInput = z.infer<typeof movimientoSchema>

const CON_ESTADO: TipoMovimiento[] = ['gasto', 'costo_directo', 'inversion', 'compra_mercaderia', 'otro_ingreso']
const CON_RECURRENTE: TipoMovimiento[] = ['gasto', 'costo_directo', 'otro_ingreso', 'pago_prestamo', 'retiro', 'compra_mercaderia']

/** Reglas de negocio de un movimiento ya parseado. Devuelve el error en español o los datos a guardar. */
export type DatosMovimiento = {
  type: TipoMovimiento; category: string; description: string; amount: number; interestAmount: number | null; date: Date
  paymentMethod: string | null; recurring: string | null; recurringUntil: Date | null; projectId: string | null
  usefulLifeMonths: number | null; status: string; attachmentUrl: string | null
}

export async function validarMovimiento(m: MovimientoInput, rol: RolFinanzas, userId: string, hoy = new Date()): Promise<{ error: string } | { data: DatosMovimiento }> {
  const cat = categoria(m.category)
  if (!cat || cat.tipo !== m.type || !cat.roles.includes(rol)) return { error: 'Esa categoría no corresponde a ese tipo de movimiento' }
  if (m.date > claveDia(hoy)) return { error: 'La fecha no puede ser futura: cargá lo que ya pasó (los gastos mensuales se repiten solos)' }
  if (m.type === 'pago_prestamo' && (m.interestAmount ?? 0) > m.amount) return { error: 'El interés no puede ser mayor que la cuota' }
  if (m.recurring && !CON_RECURRENTE.includes(m.type)) return { error: 'Ese tipo de movimiento no se repite todos los meses' }
  if (m.recurringUntil && !m.recurring) return { error: 'Solo un movimiento mensual tiene fecha de fin' }
  if (m.recurringUntil && m.recurringUntil < m.date) return { error: 'La fecha de fin tiene que ser posterior al inicio' }
  if (m.status === 'pendiente' && !CON_ESTADO.includes(m.type)) return { error: 'Ese movimiento no puede quedar pendiente' }
  if (m.projectId) {
    if (rol !== 'profesional') return { error: 'Solo el profesional asigna movimientos a una obra' }
    const own = await db.project.findFirst({ where: { id: m.projectId, pro: { userId } }, select: { id: true } })
    if (!own) return { error: 'Esa obra no es tuya' }
  }
  if (m.attachmentUrl) {
    const prefijo = `${SUPABASE}/storage/v1/object/public/homia-uploads/${userId}/`
    if (!SUPABASE || !m.attachmentUrl.startsWith(prefijo)) return { error: 'El comprobante tiene que ser una foto que subiste desde HomIA' }
  }
  return {
    data: {
      type: m.type,
      category: m.category,
      description: m.description,
      amount: Math.round(m.amount * 100) / 100,
      interestAmount: m.type === 'pago_prestamo' ? Math.round((m.interestAmount ?? 0) * 100) / 100 : null,
      date: diaADate(m.date),
      paymentMethod: m.paymentMethod ?? null,
      recurring: m.recurring ?? null,
      recurringUntil: m.recurringUntil ? diaADate(m.recurringUntil) : null,
      projectId: m.projectId ?? null,
      usefulLifeMonths: m.type === 'inversion' ? (m.usefulLifeMonths ?? cat.vidaUtilMeses ?? 36) : null,
      status: CON_ESTADO.includes(m.type) ? (m.status ?? 'pagado') : 'pagado',
      attachmentUrl: m.attachmentUrl ?? null,
    },
  }
}

/** Movimiento propio (no dado de baja) o null: 404 igual para ajeno e inexistente (no filtra existencia). */
export function movimientoPropio(id: string, userId: string) {
  return db.financeEntry.findFirst({ where: { id, userId, deletedAt: null } })
}

/** Movimiento como lo ve el navegador (fechas "AAAA-MM-DD"). */
export function vistaMovimiento(e: {
  id: string; role: string; type: string; category: string; description: string; amount: number; interestAmount: number | null; date: Date
  paymentMethod: string | null; recurring: string | null; recurringUntil: Date | null; projectId: string | null; usefulLifeMonths: number | null
  status: string; attachmentUrl: string | null; createdAt: Date
}) {
  return {
    id: e.id, role: e.role, type: e.type, category: e.category, description: e.description, amount: e.amount, interestAmount: e.interestAmount,
    date: claveDia(e.date), paymentMethod: e.paymentMethod, recurring: e.recurring, recurringUntil: e.recurringUntil ? claveDia(e.recurringUntil) : null,
    projectId: e.projectId, usefulLifeMonths: e.usefulLifeMonths, status: e.status, attachmentUrl: e.attachmentUrl, createdAt: e.createdAt,
  }
}
