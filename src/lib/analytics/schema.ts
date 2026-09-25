// Métricas de uso (D27) — validación estricta del lote que manda el navegador.
// Todo lo que no cumple se rechaza entero (400): mejor perder un lote que guardar basura o datos
// personales. El usuario NUNCA viene en el cuerpo: sale de la cookie de sesión.
import { z } from 'zod'
import { TIPOS_ENTIDAD } from './core'

export const MAX_EVENTOS_LOTE = 50
export const MAX_BYTES_LOTE = 48 * 1024

const idCliente = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/, 'id inválido')
const texto = (max: number) => z.string().max(max)

// props: objeto plano chico (máx. 12 claves, valores simples y cortos)
const valorProp = z.union([z.string().max(120), z.number().finite(), z.boolean(), z.null()])
export const propsSchema = z
  .record(z.string().regex(/^[a-zA-Z_][a-zA-Z0-9_]{0,30}$/), valorProp)
  .refine((o) => Object.keys(o).length <= 12, 'demasiadas propiedades')
  .refine((o) => JSON.stringify(o).length <= 1000, 'propiedades demasiado largas')

export const eventoSchema = z.object({
  // heartbeat no se guarda como fila: suma tiempo activo a la sesión
  type: z.enum(['page_view', 'click', 'submit', 'dialog', 'search', 'error', 'heartbeat']),
  name: texto(80).min(1),
  path: texto(200).regex(/^\/[^\s]*$/, 'ruta inválida'),
  entityType: z.enum(TIPOS_ENTIDAD).optional().nullable(),
  entityId: z.string().regex(/^[\w-]{1,40}$/).optional().nullable(),
  role: z.enum(['cliente', 'profesional', 'proveedor']).optional().nullable(),
  props: propsSchema.optional().nullable(),
  at: z.number().int().positive().optional(),
}).strict()

export const loteSchema = z.object({
  anonId: idCliente,
  sessionId: idCliente,
  sesion: z.object({
    startedAt: z.number().int().positive().optional(),
    entryPath: texto(200).optional().nullable(),
    referrer: texto(80).optional().nullable(),
    utm: z.record(z.string().regex(/^utm_[a-z]{1,10}$/), z.string().max(60)).optional().nullable(),
    device: texto(60).optional().nullable(),
    screen: z.string().regex(/^\d{2,5}x\d{2,5}$/).optional().nullable(),
  }).strict().optional(),
  events: z.array(eventoSchema).min(1).max(MAX_EVENTOS_LOTE),
}).strict()

export type Lote = z.infer<typeof loteSchema>
export type EventoLote = z.infer<typeof eventoSchema>
