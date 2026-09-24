import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { puedeOperar } from '@/lib/plans'

// ── COMPRAS DIRECTAS DE INSUMOS ──
// El cliente pide un producto desde el marketplace (sin proyecto ni profesional):
// POST crea la compra + abre el chat (el cliente siempre inicia) con el detalle.
// Flujo: pendiente_aprobacion → (proveedor aprueba: reserva stock + emite cobro)
// aprobado → el cliente paga (MP o efectivo) → el proveedor entrega → pagado
// → queda habilitada la reseña del proveedor por su compra.

type ChargeLite = { id: string; number: string; status: string; method: string | null; paidAt: Date | null; amount: number }

/** Adjunta a cada compra el cobro asociado (estado, método, fecha de pago). */
async function attachCharges<T extends { chargeId: string | null }>(purchases: T[]) {
  const ids = purchases.map((p) => p.chargeId).filter((x): x is string => !!x)
  const charges = ids.length
    ? await db.providerCharge.findMany({
        where: { id: { in: ids } },
        select: { id: true, number: true, status: true, method: true, paidAt: true, amount: true },
      })
    : []
  const map = new Map<string, ChargeLite>(charges.map((c) => [c.id, c]))
  return purchases.map((p) => ({ ...p, charge: p.chargeId ? map.get(p.chargeId) || null : null }))
}

// GET: mis compras (cliente) o mis ventas (proveedor)
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
        client: { select: { id: true, displayName: true, avatarUrl: true, verificationStatus: true } },
      },
      take: 100,
    })
    return ok({ purchases: await attachCharges(purchases) })
  }

  const purchases = await db.purchase.findMany({
    where: { clientId: user.id },
    orderBy: { createdAt: 'desc' },
    include: {
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
  type: z.enum(['compra', 'reserva']).default('compra'),
  note: z.string().max(500).optional(),
})

// POST: el cliente pide un producto (desde el marketplace)
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para pedir un producto', 401)

  const parsed = await parseBody(req, createSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data

  const stock = await db.providerStock.findUnique({
    where: { id: d.stockId },
    include: { element: true, provider: true },
  })
  if (!stock) return fail('Esa oferta ya no existe', 404)
  const element = stock.element
  const provider = stock.provider

  if (provider.userId === user.id) return fail('No podés pedirte productos a vos mismo')
  if (!puedeOperar(provider)) return fail('Este proveedor no está operando por ahora', 409)
  // "por_agotar" es un aviso de stock bajo para el proveedor: todavía se vende
  if (stock.status === 'agotado' || stock.quantity <= 0) return fail('Ese producto está sin stock en este momento', 409)
  if (stock.quantity < d.quantity) {
    return fail(`Solo quedan ${stock.quantity} ${element.unit} disponibles`, 409, { available: stock.quantity })
  }

  const unitPrice = stock.price
  const total = Math.round(unitPrice * d.quantity * 100) / 100
  const note = d.note?.trim() || null

  const purchase = await db.purchase.create({
    data: {
      clientId: user.id,
      providerId: provider.id,
      stockId: stock.id,
      elementId: element.id,
      elementName: element.name,
      quantity: d.quantity,
      unit: element.unit,
      unitPrice,
      total,
      note,
      type: d.type,
      status: 'pendiente_aprobacion',
    },
  })

  // El chat lo abre SIEMPRE el cliente (regla de la plataforma) — va con el detalle del pedido
  const conv = await findOrCreateConversation(user.id, provider.userId)
  await db.message.create({
    data: {
      conversationId: conv.id,
      senderId: user.id,
      body: `🛒 ${d.type === 'reserva' ? 'Reserva' : 'Pedido'} desde Materiales:\n${element.name} × ${d.quantity} ${element.unit}${unitPrice ? ` · ${formatARS(unitPrice)} c/u (${formatARS(total)} total)` : ' · a coordinar precio'}${note ? `\nNota: ${note}` : ''}`,
    },
  })
  await db.notification.create({
    data: {
      userId: provider.userId,
      type: 'nueva_compra',
      title: d.type === 'reserva' ? 'Nueva reserva de un cliente' : 'Nuevo pedido de un cliente',
      body: `${user.displayName} pidió ${element.name} × ${d.quantity} ${element.unit}. Gestionalo en Ventas.`,
      link: '#/panel/proveedor/cobros?tab=ventas',
    },
  })

  return ok({ purchase }, 201)
}

function formatARS(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
}

async function findOrCreateConversation(a: string, b: string) {
  const [u1, u2] = [a, b].sort()
  const existing = await db.conversation.findFirst({
    where: { userAId: u1, userBId: u2 },
  })
  if (existing) return existing
  return db.conversation.create({ data: { userAId: u1, userBId: u2 } })
}
