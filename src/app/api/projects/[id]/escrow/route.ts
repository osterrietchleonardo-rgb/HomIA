import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { createEscrowPreference, mpConfigured } from '@/lib/mercadopago'

// POST: el cliente inicia el escrow del proyecto → preferencia de Mercado Pago.
// Los fondos quedan en garantía hasta que el cliente dé conformidad (release).
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const project = await db.project.findUnique({ where: { id } })
  if (!project) return fail('Proyecto no encontrado', 404)
  if (project.clientId !== user.id) return fail('Solo el cliente del proyecto puede retener el pago', 403)
  if (project.escrowStatus !== 'none') return fail('El pago de este proyecto ya tiene un estado de garantía')
  if (project.status !== 'activo') return fail('El proyecto no está activo')

  // En modo "cliente_paga_proveedor" los materiales los paga el cliente directo
  // al proveedor: la garantía cubre solo la mano de obra del profesional.
  const garantia = project.materialsPaymentMode === 'cliente_paga_proveedor'
    ? project.laborCost
    : project.laborCost + project.materialsCost
  const total = Math.round(garantia * 100) / 100
  if (total <= 0) return fail('El proyecto todavía no tiene un presupuesto para retener')

  if (!mpConfigured()) {
    return fail('Mercado Pago no está configurado. Agregá MP_ACCESS_TOKEN en el archivo .env del servidor.', 503, { needsConfig: true })
  }

  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const preference = await createEscrowPreference({
    projectId: project.id,
    title: project.title,
    total,
    payerEmail: user.email,
    baseUrl,
  })

  return ok({ initPoint: preference.initPoint, preferenceId: preference.id, total })
}
