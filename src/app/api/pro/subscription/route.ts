import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// LEGADO: HomIA dejó de vender suscripciones a profesionales.
// Solo los proveedores tienen planes de pago.
// Las preapprovals ya existentes siguen gestionándose por el webhook.
export async function POST(_req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })
  if (!pro) return fail('Solo los profesionales tienen perfil PRO', 403)

  return fail('HomIA es gratis para profesionales: los planes de pago son solo para proveedores', 403, { soloProveedores: true })
}

export async function GET() {
  return ok({ free: true, message: 'Usar HomIA es gratis para clientes y profesionales. Los planes de pago son solo para proveedores.' })
}
