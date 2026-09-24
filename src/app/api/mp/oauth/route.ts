import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// DELETE: el proveedor desvincula su cuenta de Mercado Pago (limpia los 4
// campos mpOauth*). Sin conexión, sus clientes solo pueden pagarle en efectivo.
export async function DELETE() {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const provider = await db.providerProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
  if (!provider) return fail('Solo los proveedores pueden desvincular Mercado Pago', 403)

  await db.providerProfile.update({
    where: { id: provider.id },
    data: {
      mpOauthAccessToken: null,
      mpOauthRefreshToken: null,
      mpOauthExpiresAt: null,
      mpOauthStatus: 'disconnected',
    },
  })
  return ok({ success: true, mpOauthStatus: 'disconnected' })
}
