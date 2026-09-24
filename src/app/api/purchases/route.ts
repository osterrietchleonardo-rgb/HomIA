import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { createOrder, validateLines, purchaseLines } from '@/lib/orders'
import { eventsFor } from '@/lib/order-view'
import { serviceFeeFor } from '@/lib/fees'

// ── SUB-PEDIDOS DE MATERIALES (compras a un proveedor) ──
// Desde el carrito, cada pedido se fracciona en un sub-pedido (Purchase) por
// proveedor con todos sus ítems. Flujo de cada sub-pedido:
// · compra (con stock): nace `aprobado` = por pagar (stock reservado + cobro emitido,
//   SIN aprobación del proveedor; D15) → el cliente paga → el proveedor entrega → pagado
// · reserva (con o sin stock): pendiente_aprobacion → el proveedor aprueba (reserva + cobro,
//   o `esperando_stock` con fecha si no tiene) → aprobado → pago → entrega → pagado
// → queda habilitada la reseña del proveedor por esa compra.
//
// GET              → mis compras (cliente) · ?as=proveedor → mis ventas con ítems y línea de tiempo
// POST { stockId, quantity, type?, note? } → pedido de UN producto sin pasar por el carrito
//      (compatibilidad): crea un pedido con un solo sub-pedido, con las mismas reglas.

type ChargeLite = { id: string; number: string; status: string; method: string | null; paidAt: Date | null; amount: number; serviceFee: number }

/** Adjunta a cada compra el cobro asociado (estado, método, fecha de pago). */
async function attachCharges<T extends { chargeId: string | null }>(purchases: T[]) {
  const ids = purchases.map((p) => p.chargeId).filter((x): x is string => !!x)
  const charges = ids.length
    ? await db.providerCharge.findMany({
        where: { id: { in: ids } },
        select: { id: true, number: true, status: true, method: true, paidAt: true, amount: true, serviceFee: true },
      })
    : []
  const map = new Map<string, ChargeLite>(charges.map((c) => [c.id, c]))
  return purchases.map((p) => ({ ...p, charge: p.chargeId ? map.get(p.chargeId) || null : null }))
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const asProvider = req.nextUrl.searchParams.get('as') === 'proveedor'

  if (asProvider) {
    const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
    if (!prov) return fail('Solo los proveedores tienen ventas', 403)
    const purchases = await db.purchase.findMany({
      where: { providerId: prov.id },
      orderBy: { createdAt: 'desc' },
      include: {
        items: { orderBy: { createdAt: 'asc' } },
        order: { select: { id: true, number: true } },
        client: { select: { id: true, displayName: true, avatarUrl: true, verificationStatus: true } },
      },
      take: 100,
    })
    // el proveedor ve SOLO la línea de tiempo de sus sub-pedidos
    const events = await eventsFor({ purchaseIds: purchases.map((p) => p.id) })
    const byPurchase = new Map<string, typeof events>()
    for (const e of events) {
      if (!e.purchaseId) continue
      const arr = byPurchase.get(e.purchaseId) || []
      arr.push(e)
      byPurchase.set(e.purchaseId, arr)
    }
    const withCharge = await attachCharges(purchases)
    return ok({
      purchases: withCharge.map((p) => ({
        ...p,
        orderNumber: p.order?.number || null,
        lines: purchaseLines(p),
        events: byPurchase.get(p.id) || [],
      })),
    })
  }

  const purchases = await db.purchase.findMany({
    where: { clientId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
      items: { orderBy: { createdAt: 'asc' } },
      provider: {
        include: { user: { select: { displayName: true, avatarUrl: true, verificationStatus: true } } },
      },
    },
    take: 100,
  })
  const withCharge = await attachCharges(purchases)
  return ok({
    purchases: withCharge.map((p) => ({
      ...p,
      lines: purchaseLines(p),
      mpServiceFee: serviceFeeFor(p.total),
      provider: {
        id: p.provider.id,
        businessName: p.provider.businessName,
        kind: p.provider.kind,
        userId: p.provider.userId,
        avatarUrl: p.provider.user.avatarUrl,
        verificationStatus: p.provider.user.verificationStatus,
        mpOauthStatus: p.provider.mpOauthStatus,
      },
    })),
  })
}

const createSchema = z.object({
  stockId: z.string().min(1, 'Falta el producto que querés pedir'),
  quantity: z.coerce.number().positive('Decinos cuántas unidades necesitás'),
  // sin tipo: compra si hay stock, reserva si no (D15)
  type: z.enum(['compra', 'reserva']).optional(),
  note: z.string().max(500).optional(),
})

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para pedir un producto', 401)

  const parsed = await parseBody(req, createSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data

  const { lines, problems } = await validateLines(user.id, [{ stockId: d.stockId, quantity: d.quantity, mode: d.type }])
  if (problems.length > 0) {
    const p = problems[0]
    if (p.reason === 'Esta oferta ya no existe') return fail('Esa oferta ya no existe', 404)
    if (p.reason.startsWith('Es un producto tuyo')) return fail('No podés pedirte productos a vos mismo')
    if (p.reason.startsWith('La cantidad no es válida')) return fail(p.reason, 400)
    return fail(p.reason, 409)
  }

  const created = await createOrder({ user, lines, note: d.note, source: 'directo' })
  if (!created.ok && created.reason === 'stock') {
    return fail(`Solo quedan ${created.item.available} ${created.item.unit} de ${created.item.name} para comprar ahora: bajá la cantidad o reservalo`, 409, { item: created.item })
  }
  if (!created.ok) return fail('No pudimos numerar tu pedido: probá de nuevo en unos segundos', 503)
  return ok({ purchase: created.purchases[0], order: { id: created.order.id, number: created.order.number } }, 201)
}
