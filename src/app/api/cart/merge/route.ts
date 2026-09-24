import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { buildCartView, canBuy } from '@/lib/cart-server'
import { qtyMatchesStep, qtyStepFor } from '@/lib/units'
import { round2 } from '@/lib/fees'

// POST /api/cart/merge { items: [{ stockId, quantity }] }
// Al iniciar sesión, el carrito del visitante (localStorage) se fusiona con el de
// la cuenta: por cada oferta se suma la cantidad, con tope en el stock disponible.
// Lo que ya no se puede comprar (oferta borrada, propia) se descarta y se informa.
const schema = z.object({
  items: z.array(z.object({
    stockId: z.string().min(1),
    quantity: z.coerce.number().positive().max(100000),
  })).max(60),
})

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  if (!canBuy(user.roles)) return fail('El carrito es para clientes y profesionales', 403)
  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error

  const incoming = new Map<string, number>()
  for (const i of parsed.data.items) incoming.set(i.stockId, round2((incoming.get(i.stockId) || 0) + i.quantity))
  const stocks = incoming.size
    ? await db.providerStock.findMany({ where: { id: { in: [...incoming.keys()] } }, include: { element: true, provider: true } })
    : []
  const byId = new Map(stocks.map((s) => [s.id, s]))
  const existing = await db.cartItem.findMany({ where: { userId: user.id } })
  const exMap = new Map(existing.map((e) => [e.stockId, e]))

  let merged = 0
  const skipped: string[] = []
  for (const [stockId, qty] of incoming) {
    const s = byId.get(stockId)
    if (!s || s.provider.userId === user.id) { skipped.push(stockId); continue }
    let quantity = round2((exMap.get(stockId)?.quantity || 0) + qty)
    // con tope en lo disponible (si hay algo); la línea queda marcada si no alcanza
    if (s.quantity > 0 && quantity > s.quantity) quantity = s.quantity
    if (!qtyMatchesStep(quantity, s.element.unit)) {
      const step = qtyStepFor(s.element.unit)
      quantity = Math.max(step, Math.floor(quantity / step) * step)
    }
    await db.cartItem.upsert({
      where: { userId_stockId: { userId: user.id, stockId } },
      create: { userId: user.id, stockId, quantity },
      update: { quantity },
    })
    merged++
  }
  const rows = await db.cartItem.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } })
  return ok({ cart: await buildCartView(rows, user.id), merged, skipped })
}
