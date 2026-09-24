import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// DELETE ?kind=provider|professional: el vendedor desvincula su cuenta de Mercado
// Pago (limpia los 4 campos mpOauth*). Sin conexión, sus clientes solo pueden
// pagarle en efectivo. Sin `kind` se asume proveedor (compatibilidad).
const CLEARED = {
  mpOauthAccessToken: null,
  mpOauthRefreshToken: null,
  mpOauthExpiresAt: null,
  mpOauthStatus: 'disconnected',
}

export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const kind = req.nextUrl.searchParams.get('kind') === 'professional' ? 'professional' : 'provider'

  if (kind === 'professional') {
    const pro = await db.professionalProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
    if (!pro) return fail('Solo los profesionales pueden desvincular su Mercado Pago de cobro', 403)
    await db.professionalProfile.update({ where: { id: pro.id }, data: CLEARED })
    return ok({ success: true, mpOauthStatus: 'disconnected' })
  }

  const provider = await db.providerProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!provider) return fail('Solo los proveedores pueden desvincular Mercado Pago', 403)
  await db.providerProfile.update({ where: { id: provider.id }, data: CLEARED })
  return ok({ success: true, mpOauthStatus: 'disconnected' })
}
