import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { createProviderPlanPreapproval, mpConfigured } from '@/lib/mercadopago'
import { MP_PLAN_PRICE_ARS } from '@/lib/plans'

// LEGADO → reemplazado por /api/provider/plan (planes basic | pro).
// Se mantiene por compatibilidad: sin body asume PRO; con { plan } delega.
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  if (!prov) return fail('Solo los proveedores tienen suscripción de pago', 403)
  if (prov.subscription === 'pro') return fail('Tu plan PRO ya está activo')

  let plan: 'basic' | 'pro' = 'pro'
  try {
    const d = await body<{ plan?: 'basic' | 'pro' }>(req)
    if (d.plan === 'basic' || d.plan === 'pro') plan = d.plan
  } catch { /* sin body → pro */ }
  if (prov.subscription === plan) return fail('Ya estás en ese plan')

  if (!mpConfigured()) {
    return fail('Mercado Pago no está configurado. Agregá MP_ACCESS_TOKEN en el archivo .env del servidor.', 503, { needsConfig: true })
  }

  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const pre = await createProviderPlanPreapproval({
    profileId: prov.id,
    plan,
    payerEmail: user.email,
    baseUrl,
  })

  await db.providerProfile.update({
    where: { id: prov.id },
    data: { mpPreapprovalId: pre.id },
  })

  return ok({ initPoint: pre.initPoint, preapprovalId: pre.id, price: MP_PLAN_PRICE_ARS[plan], plan })
}
