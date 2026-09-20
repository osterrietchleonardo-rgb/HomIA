import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { createProviderPlanPreapproval, mpConfigured } from '@/lib/mercadopago'
import { planState, PLAN_PRICE_USD, MP_PLAN_PRICE_ARS, PLAN_FEATURES, TRIAL_DAYS, type ProviderPlan } from '@/lib/plans'

// ── Plan del proveedor — el único rol con suscripción de pago ──
// trial: 14 días gratis desde el alta · basic US$50/mes · pro US$100/mes
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  if (!prov) return fail('Solo los proveedores tienen plan de suscripción', 403)

  const state = planState(prov)
  return ok({
    plan: state,
    precios: PLAN_PRICE_USD,
    preciosArs: MP_PLAN_PRICE_ARS,
    features: PLAN_FEATURES,
    trialDays: TRIAL_DAYS,
    mpConfigured: mpConfigured(),
    businessName: prov.businessName,
    socioDesde: prov.proSince,
  })
}

// POST { plan: 'basic'|'pro' } → suscripción Mercado Pago (preapproval mensual)
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  if (!prov) return fail('Solo los proveedores pueden elegir un plan', 403)

  const d = await body<{ plan?: ProviderPlan }>(req)
  if (d.plan !== 'basic' && d.plan !== 'pro') {
    return fail('Elegí un plan válido: basic (US$50/mes) o pro (US$100/mes)')
  }
  if (prov.subscription === d.plan) return fail(`Ya estás en el plan ${d.plan === 'pro' ? 'PRO' : 'Básico'}`)

  if (!mpConfigured()) {
    return fail('Mercado Pago no está configurado. Agregá MP_ACCESS_TOKEN en el archivo .env del servidor.', 503, { needsConfig: true })
  }

  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const pre = await createProviderPlanPreapproval({
    profileId: prov.id,
    plan: d.plan,
    payerEmail: user.email,
    baseUrl,
  })

  await db.providerProfile.update({
    where: { id: prov.id },
    data: { mpPreapprovalId: pre.id },
  })

  return ok({ initPoint: pre.initPoint, preapprovalId: pre.id, plan: d.plan, priceArs: MP_PLAN_PRICE_ARS[d.plan] }, 201)
}
