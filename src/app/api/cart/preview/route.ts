import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, parseBody } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { buildCartView } from '@/lib/cart-server'

// POST /api/cart/preview { items: [{ stockId, quantity }] }
// Carrito del VISITANTE (sin cuenta): vive en su localStorage y acá solo se
// enriquece con los datos públicos actuales de cada oferta (los mismos que ya
// muestra el marketplace): precio, stock, proveedor y problemas por línea.
// No escribe nada en la base.
const schema = z.object({
  items: z.array(z.object({
    stockId: z.string().min(1).max(60),
    quantity: z.coerce.number().positive().max(100000),
  })).max(60),
})

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error
  const user = await getSessionUser()
  const rows = parsed.data.items.map((i) => ({ id: i.stockId, stockId: i.stockId, quantity: i.quantity }))
  return ok({ cart: await buildCartView(rows, user?.id ?? null) })
}
