// Línea de tiempo trazable (ActivityEvent): quién hizo qué y cuándo, sobre un
// pedido, un sub-pedido de proveedor o un proyecto. Solo se agregan filas y
// registrar un evento NUNCA rompe el flujo principal (try/catch silencioso).
import { db } from '@/lib/db'

export type ActorRole = 'cliente' | 'profesional' | 'proveedor' | 'sistema'

export type ActivityInput = {
  orderId?: string | null
  purchaseId?: string | null
  projectId?: string | null
  actorId?: string | null
  actorRole: ActorRole
  type: string
  message: string
  data?: Record<string, unknown> | null
}

export async function logActivity(ev: ActivityInput): Promise<void> {
  try {
    await db.activityEvent.create({
      data: {
        orderId: ev.orderId ?? null,
        purchaseId: ev.purchaseId ?? null,
        projectId: ev.projectId ?? null,
        actorId: ev.actorId ?? null,
        actorRole: ev.actorRole,
        type: ev.type,
        message: ev.message.slice(0, 500),
        data: ev.data ? JSON.stringify(ev.data).slice(0, 4000) : null,
      },
    })
  } catch (e) {
    console.error('[activity] no se pudo registrar el evento', ev.type, e)
  }
}

/** Varios eventos a la vez (ej. uno por sub-pedido al confirmar el carrito). */
export async function logActivities(evs: ActivityInput[]): Promise<void> {
  for (const ev of evs) await logActivity(ev)
}
