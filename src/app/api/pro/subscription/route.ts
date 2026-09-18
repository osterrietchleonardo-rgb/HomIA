import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { createProPreapproval, mpConfigured, MP_PRO_PRICE_ARS } from '@/lib/mercadopago'

// POST: el profesional inicia la suscripción al plan PRO → preapproval de Mercado Pago.
// El plan se activa cuando el webhook recibe el preapproval autorizado.
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })
  if (!pro) return fail('Solo los profesionales pueden suscribirse al plan PRO', 403)
  if (pro.subscription === 'pro') return fail('Tu plan PRO ya está activo')

  if (!mpConfigured()) {
    return fail('Mercado Pago no está configurado. Agregá MP_ACCESS_TOKEN en el archivo .env del servidor.', 503, { needsConfig: true })
  }

  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const pre = await createProPreapproval({
    professionalId: pro.id,
    payerEmail: user.email,
    baseUrl,
  })

  await db.professionalProfile.update({
    where: { id: pro.id },
    data: { mpPreapprovalId: pre.id },
  })

  return ok({ initPoint: pre.initPoint, preapprovalId: pre.id, price: MP_PRO_PRICE_ARS })
}
