import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { getOrderView } from '@/lib/order-view'

// GET /api/orders/[id] → detalle y seguimiento del pedido (SOLO el cliente dueño).
// Cada proveedor ve únicamente su sub-pedido, desde /api/purchases?as=proveedor.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const r = await getOrderView(id, user.id)
  if (r === 'not_found') return fail('Pedido no encontrado', 404)
  if (r === 'forbidden') return fail('No tenés acceso a este pedido', 403)
  return ok({ order: r.view, events: r.events })
}
