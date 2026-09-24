import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { buildCartView, canBuy } from '@/lib/cart-server'
import { qtyMatchesStep } from '@/lib/units'
import { puedeOperar } from '@/lib/plans'
import { round2 } from '@/lib/fees'

// ── CARRITO del usuario logueado (vive en la base: sincroniza entre dispositivos) ──
// GET              → contenido agrupado por proveedor, con totales y problemas por línea
// POST   { stockId, quantity }   → agrega (suma a lo que ya había de esa oferta)
// PATCH  { stockId, quantity }   → fija la cantidad de una línea
// DELETE ?stockId=<id>           → saca una línea · DELETE sin parámetros → vacía el carrito
// Solo clientes y profesionales compran. El visitante usa localStorage + /api/cart/preview.

const MAX_LINES = 60

async function auth() {
  const user = await getSessionUser()
  if (!user) return { error: fail('Necesitás iniciar sesión para usar el carrito', 401) }
  if (!canBuy(user.roles)) return { error: fail('El carrito es para clientes y profesionales', 403) }
  return { user }
}

async function view(userId: string) {
  const rows = await db.cartItem.findMany({ where: { userId }, orderBy: { createdAt: 'asc' } })
  return buildCartView(rows, userId)
}

export async function GET() {
  const a = await auth()
  if (a.error) return a.error
  return ok({ cart: await view(a.user.id) })
}

const lineSchema = z.object({
  stockId: z.string().min(1, 'Falta el producto'),
  quantity: z.coerce.number().positive('La cantidad tiene que ser mayor a cero').max(100000),
})

/** Valida una línea contra la oferta: existe, proveedor operando, no es propia, stock y paso. */
async function checkLine(userId: string, stockId: string, quantity: number) {
  const s = await db.providerStock.findUnique({ where: { id: stockId }, include: { element: true, provider: true } })
  if (!s) return { error: fail('Esa oferta ya no existe', 404) }
  if (s.provider.userId === userId) return { error: fail('Es un producto tuyo: no podés agregarlo a tu carrito', 400) }
  if (!puedeOperar(s.provider)) return { error: fail('Este proveedor no está operando por ahora', 409) }
  if (s.status === 'agotado' || s.quantity <= 0) return { error: fail('Ese producto está sin stock en este momento', 409) }
  if (!qtyMatchesStep(quantity, s.element.unit)) {
    return { error: fail(`Ese producto se vende por ${s.element.unit}: elegí una cantidad válida`, 400) }
  }
  if (quantity > s.quantity) {
    return { error: fail(`Solo quedan ${s.quantity} ${s.element.unit} disponibles`, 409, { available: s.quantity }) }
  }
  return { stock: s }
}

export async function POST(req: NextRequest) {
  const a = await auth()
  if (a.error) return a.error
  const parsed = await parseBody(req, lineSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data

  const existing = await db.cartItem.findUnique({ where: { userId_stockId: { userId: a.user.id, stockId: d.stockId } } })
  if (!existing && (await db.cartItem.count({ where: { userId: a.user.id } })) >= MAX_LINES) {
    return fail(`Tu carrito llegó al máximo de ${MAX_LINES} productos: confirmá un pedido o sacá alguno`, 409)
  }
  const quantity = round2((existing?.quantity || 0) + d.quantity)
  const c = await checkLine(a.user.id, d.stockId, quantity)
  if (c.error) return c.error

  await db.cartItem.upsert({
    where: { userId_stockId: { userId: a.user.id, stockId: d.stockId } },
    create: { userId: a.user.id, stockId: d.stockId, quantity },
    update: { quantity },
  })
  return ok({ cart: await view(a.user.id), added: { stockId: d.stockId, quantity, name: c.stock.element.name } }, 201)
}

export async function PATCH(req: NextRequest) {
  const a = await auth()
  if (a.error) return a.error
  const parsed = await parseBody(req, lineSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data
  const existing = await db.cartItem.findUnique({ where: { userId_stockId: { userId: a.user.id, stockId: d.stockId } } })
  if (!existing) return fail('Ese producto no está en tu carrito', 404)
  const c = await checkLine(a.user.id, d.stockId, d.quantity)
  if (c.error) return c.error
  await db.cartItem.update({ where: { id: existing.id }, data: { quantity: d.quantity } })
  return ok({ cart: await view(a.user.id) })
}

export async function DELETE(req: NextRequest) {
  const a = await auth()
  if (a.error) return a.error
  const stockId = req.nextUrl.searchParams.get('stockId')
  if (stockId) {
    const del = await db.cartItem.deleteMany({ where: { userId: a.user.id, stockId } })
    if (del.count === 0) return fail('Ese producto no está en tu carrito', 404)
  } else {
    await db.cartItem.deleteMany({ where: { userId: a.user.id } })
  }
  return ok({ cart: await view(a.user.id) })
}
