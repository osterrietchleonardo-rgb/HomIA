import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody, appUrl } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { createProviderPlanPreapproval, mpSubConfigured } from '@/lib/mercadopago'
import { planState, PLAN_PRICE_ARS, PLAN_FEATURES, TRIAL_DAYS, esPlanPago, inicioPrimerCobro, calcularPagadoHasta } from '@/lib/plans'
import { registrarEvento } from '@/lib/analytics/server'

// ── Plan del proveedor — el único rol con suscripción de pago ──
// trial: 14 días gratis desde el alta · basic $50.000/mes · pro $100.000/mes
// D33: se cancela desde acá (POST /api/provider/plan/cancel) o desde Mercado Pago; lo pagado no se
// reintegra pero el plan sigue hasta el fin del período pago. Elegir un plan en la prueba no se come
// los días gratis (primer cobro al terminar la prueba).
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  if (!prov) return fail('Solo los proveedores tienen plan de suscripción', 403)

  const state = planState(prov)
  // Para el diálogo de "Cancelar suscripción": hasta cuándo seguiría con su plan si cancela hoy
  // (último cobro aprobado + 1 mes; sin cobros y con la prueba vigente → hasta el fin de la prueba).
  let finPeriodo: string | null = null
  const puedeCancelar = esPlanPago(prov) && !!prov.mpPreapprovalId && !prov.planPaidUntil
  if (puedeCancelar) {
    const cobros = await db.subscriptionCharge.findMany({
      where: { mpPreapprovalId: prov.mpPreapprovalId! },
      select: { status: true, paidAt: true, amount: true, refundedAmount: true },
    })
    const hasta = calcularPagadoHasta({ cobros })
    finPeriodo = hasta && hasta.getTime() > Date.now() ? hasta.toISOString() : null
  }
  const inicio = inicioPrimerCobro(prov)
  return ok({
    plan: state,
    preciosArs: PLAN_PRICE_ARS,
    features: PLAN_FEATURES,
    trialDays: TRIAL_DAYS,
    mpConfigured: mpSubConfigured(),
    businessName: prov.businessName,
    socioDesde: prov.proSince,
    mpPreapprovalId: prov.mpPreapprovalId,
    puedeCancelar,
    finPeriodo,
    /** si elige un plan ahora, el primer cobro de MP es este día (null = en el momento) */
    primerCobroSiElige: inicio ? inicio.toISOString() : null,
  })
}

const schema = z.object({
  plan: z.enum(['basic', 'pro'], { message: 'Elegí un plan válido: basic o pro' }),
})

// POST { plan: 'basic'|'pro' } → suscripción Mercado Pago (preapproval mensual)
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  if (!prov) return fail('Solo los proveedores pueden elegir un plan', 403)

  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error
  const { plan } = parsed.data
  // con la suscripción cancelada (sigue hasta planPaidUntil) puede volver a suscribirse al mismo plan
  if (prov.subscription === plan && !prov.planPaidUntil) return fail(`Ya estás en el plan ${plan === 'pro' ? 'PRO' : 'Básico'}`, 409)

  if (!mpSubConfigured()) {
    return fail('Las suscripciones por Mercado Pago no están disponibles por ahora. Escribinos desde Ayuda y lo resolvemos.', 503, { needsConfig: true })
  }

  // Cambio de plan SIN bloqueo: la suscripción vigente NO se cancela acá. Si la
  // cancelábamos antes de que el proveedor autorizara la nueva, el webhook
  // recibía `cancelled` de la vigente y lo degradaba mientras pagaba (o para
  // siempre si abandonaba el checkout). Ahora el webhook cancela la vieja recién
  // cuando llega `authorized` de la nueva.

  // D33: primer cobro al terminar la prueba (o lo ya pagado de un plan cancelado), nunca antes
  const inicio = inicioPrimerCobro(prov)

  // back_url: `${appUrl()}/panel/proveedor/plan?plan=ok` (lo arma mercadopago.ts a partir de baseUrl)
  let pre: { id: string; initPoint: string; priceArs: number }
  try {
    pre = await createProviderPlanPreapproval({
      profileId: prov.id,
      plan,
      payerEmail: user.email,
      baseUrl: appUrl(),
      startDate: inicio,
    })
  } catch (e) {
    console.error('[provider/plan] createProviderPlanPreapproval', e)
    return fail('Mercado Pago no respondió. Probá de nuevo en un rato.', 503)
  }
  if (!pre.initPoint) return fail('Mercado Pago no devolvió el link para suscribirte. Probá de nuevo en un rato.', 503)

  // `mpPreapprovalId` sigue apuntando a la suscripción VIGENTE hasta que la nueva
  // se autorice (lo actualiza el webhook). El webhook identifica al proveedor y al
  // plan por external_reference, así que no hace falta guardar la pendiente.

  // métricas (D27): pedido de cambio de plan (la activación la registra el webhook)
  registrarEvento(req, { name: 'plan_solicitado', userId: user.id, path: '/panel/proveedor/plan', props: { desde: prov.subscription, hacia: plan, primerCobroDiferido: !!inicio } })
  return ok({
    initPoint: pre.initPoint, init_point: pre.initPoint, preapprovalId: pre.id, plan, priceArs: PLAN_PRICE_ARS[plan],
    primerCobro: inicio ? inicio.toISOString() : null,
  }, 201)
}
