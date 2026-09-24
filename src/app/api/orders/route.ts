import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { canBuy } from '@/lib/cart-server'
import { createOrder, validateLines } from '@/lib/orders'
import { listOrders } from '@/lib/order-view'

// ── PEDIDOS DEL CARRITO ──
// GET  → mis pedidos (cliente o profesional que compra), con el resumen de pago por proveedor
// POST { types?: { [providerId]: 'compra' | 'reserva' }, note? } → confirma TODO el carrito:
//      valida stock y plan de cada proveedor, crea el pedido con un sub-pedido por proveedor,
//      vacía el carrito, avisa a cada proveedor (notificación + mensaje en el chat que abre
//      el cliente) y registra la línea de tiempo. El stock NO se toca hasta que el proveedor aprueba.

export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  return ok({ orders: await listOrders(user.id) })
}

const schema = z.object({
  types: z.record(z.string(), z.enum(['compra', 'reserva'])).optional(),
  note: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para confirmar tu pedido', 401)
  if (!canBuy(user.roles)) return fail('Solo clientes y profesionales pueden hacer pedidos', 403)
  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error

  const rows = await db.cartItem.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } })
  if (rows.length === 0) return fail('Tu carrito está vacío', 400)

  const { lines, problems } = await validateLines(user.id, rows.map((r) => ({ stockId: r.stockId, quantity: r.quantity })))
  if (problems.length > 0) {
    const p = problems[0]
    return fail(
      `No se puede confirmar: ${p.elementName}${p.providerName ? ` (${p.providerName})` : ''} — ${p.reason}. Sacalo o ajustalo en el carrito`,
      409,
      { problems }
    )
  }

  const created = await createOrder({ user, lines, types: parsed.data.types, note: parsed.data.note, source: 'carrito' })
  if (!created) return fail('No pudimos numerar tu pedido: probá de nuevo en unos segundos', 503)

  // el carrito se vacía de lo que se pidió (si agregó algo en paralelo, queda)
  await db.cartItem.deleteMany({ where: { userId: user.id, stockId: { in: lines.map((l) => l.stock.id) } } })

  return ok({
    order: { id: created.order.id, number: created.order.number },
    purchases: created.purchases.map((p) => ({ id: p.id, providerId: p.providerId, total: p.total, status: p.status, type: p.type, items: p.items })),
  }, 201)
}
