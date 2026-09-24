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
// POST { lineTypes?: { [stockId]: 'compra' | 'reserva' }, types?: { [providerId]: 'compra' | 'reserva' }, note? }
//      → confirma TODO el carrito. Cada línea es COMPRA o RESERVA (D15, 24/09/2026):
//        · `lineTypes[stockId]` manda; si no, `types[providerId]` (compatibilidad); si no,
//          compra si hay stock y reserva si no.
//        · compra SIN stock suficiente → 409 que dice cuál, sin crear nada;
//        · compra: nace lista para pagar (stock reservado + cobro emitido, 24 h para pagar);
//        · reserva: la aprueba el proveedor (con o sin stock), no toca el stock;
//        · si un proveedor tiene de los dos tipos, se crean dos sub-pedidos.
//      Vacía del carrito lo pedido, avisa a cada proveedor (notificación + mensaje en el
//      chat que abre el cliente) y registra la línea de tiempo.

export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  return ok({ orders: await listOrders(user.id) })
}

const mode = z.enum(['compra', 'reserva'])
const schema = z.object({
  lineTypes: z.record(z.string(), mode).optional(),
  types: z.record(z.string(), mode).optional(),
  note: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para confirmar tu pedido', 401)
  if (!canBuy(user.roles)) return fail('Solo clientes y profesionales pueden hacer pedidos', 403)
  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error
  const { lineTypes = {}, types = {}, note } = parsed.data

  const rows = await db.cartItem.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'asc' },
    include: { stock: { select: { providerId: true } } },
  })
  if (rows.length === 0) return fail('Tu carrito está vacío', 400)

  const { lines, problems } = await validateLines(
    user.id,
    rows.map((r) => ({ stockId: r.stockId, quantity: r.quantity, mode: lineTypes[r.stockId] ?? (r.stock ? types[r.stock.providerId] : undefined) }))
  )
  if (problems.length > 0) {
    const p = problems[0]
    return fail(
      `No se puede confirmar: ${p.elementName}${p.providerName ? ` (${p.providerName})` : ''} — ${p.reason}. Ajustalo en el carrito`,
      409,
      { problems }
    )
  }

  const created = await createOrder({ user, lines, note, source: 'carrito' })
  if (!created.ok && created.reason === 'stock') {
    const i = created.item
    return fail(
      `No se puede confirmar: ${i.name} — solo quedan ${i.available} ${i.unit} para comprar ahora (pediste ${i.requested}). No se creó nada: bajá la cantidad o reservalo`,
      409,
      { problems: [{ stockId: i.stockId, elementName: i.name, providerName: '', reason: `Solo quedan ${i.available} ${i.unit}` }], item: i }
    )
  }
  if (!created.ok) return fail('No pudimos numerar tu pedido: probá de nuevo en unos segundos', 503)

  // el carrito se vacía de lo que se pidió (si agregó algo en paralelo, queda)
  await db.cartItem.deleteMany({ where: { userId: user.id, stockId: { in: lines.map((l) => l.stock.id) } } })

  return ok({
    order: { id: created.order.id, number: created.order.number },
    purchases: created.purchases.map((p) => ({
      id: p.id, providerId: p.providerId, total: p.total, status: p.status, type: p.type, items: p.items,
      chargeId: p.chargeId, reservationExpiresAt: p.reservationExpiresAt,
    })),
  }, 201)
}
