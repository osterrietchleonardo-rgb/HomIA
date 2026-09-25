import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { esPlanPago, planState } from '@/lib/plans'
import { aplicarBajaSuscripcion, cancelarPreapprovalMp } from '@/lib/suscripciones-mp'
import { registrarEvento } from '@/lib/analytics/server'

// ── Cancelar la suscripción desde HomIA (D33) ──
// POST { confirmar: true } → cancela la preapproval en Mercado Pago (app Suscripciones) y aplica la
// baja igual que el webhook: con período pago vigente el plan sigue hasta `planPaidUntil` (lo pagado
// no se reintegra); sin período pago (elegido en la prueba, antes del primer cobro) vuelve a la prueba.
// Solo el proveedor dueño (la suscripción sale de la sesión, nunca del body). Idempotente: si ya
// estaba cancelada responde 200 con la misma fecha.
const schema = z.object({
  confirmar: z.literal(true, { message: 'Confirmá la cancelación' }),
})

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const prov = await db.providerProfile.findUnique({
    where: { userId: user.id },
    select: { id: true, subscription: true, mpPreapprovalId: true, planPaidUntil: true, trialEndsAt: true, createdAt: true },
  })
  if (!prov) return fail('Solo los proveedores tienen suscripción', 403)

  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error

  // ya cancelada con período vigente → misma respuesta (idempotente)
  if (esPlanPago(prov) && prov.planPaidUntil) {
    return ok({ cancelada: true, yaEstaba: true, plan: planState(prov), accesoHasta: prov.planPaidUntil.toISOString() })
  }
  // ya cancelada antes del primer cobro (volvió a la prueba): también 200
  if (!esPlanPago(prov) && prov.mpPreapprovalId) {
    const baja = await db.subscriptionEvent.findUnique({ where: { dedupeKey: `baja:${prov.mpPreapprovalId}` }, select: { id: true } })
    if (baja) return ok({ cancelada: true, yaEstaba: true, plan: planState(prov), accesoHasta: null })
  }
  if (!esPlanPago(prov) || !prov.mpPreapprovalId) {
    return fail('No tenés una suscripción de Mercado Pago para cancelar.', 409)
  }

  const preId = prov.mpPreapprovalId
  let pre: Awaited<ReturnType<typeof cancelarPreapprovalMp>>
  try {
    pre = await cancelarPreapprovalMp(preId)
  } catch (e) {
    console.error('[provider/plan/cancel] Mercado Pago', e instanceof Error ? e.message : e)
    return fail('Mercado Pago no respondió y la suscripción sigue activa. Probá de nuevo en un rato, o cancelala desde Mercado Pago → Suscripciones.', 503)
  }
  if (!pre) {
    return fail('No encontramos tu suscripción en Mercado Pago. Revisá en Mercado Pago → Suscripciones o escribinos desde Ayuda.', 502)
  }

  const r = await aplicarBajaSuscripcion({ providerId: prov.id, preapprovalId: preId, status: 'cancelled', motivo: 'webhook', source: 'homia', pre })
  const actual = await db.providerProfile.findUnique({
    where: { id: prov.id },
    select: { subscription: true, planPaidUntil: true, trialEndsAt: true, createdAt: true },
  })
  registrarEvento(req, { name: 'plan_cancelado', userId: user.id, path: '/panel/proveedor/plan', props: { desde: prov.subscription, conPeriodoPago: r.kind === 'programar_baja' } })
  return ok({
    cancelada: true,
    yaEstaba: false,
    plan: actual ? planState(actual) : null,
    accesoHasta: actual?.planPaidUntil ? actual.planPaidUntil.toISOString() : null,
  })
}
