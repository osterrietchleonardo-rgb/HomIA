import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// ── COMPRAS DIRECTAS DE INSUMOS ──
// El cliente pide un producto desde el marketplace (sin proyecto ni profesional):
// POST crea la compra + abre el chat (el cliente siempre inicia) con el detalle.
// El proveedor acepta → entrega → emite el cobro → el cliente paga (MP o efectivo)
// → queda habilitada la reseña del proveedor por su compra.

// GET: mis compras (cliente) o mis ventas (proveedor)
export async function GET(req: NextRequest) {
  const { getSessionUser } = await import('@/lib/auth')
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
    return ok({ purchases })
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
  return ok({
    purchases: purchases.map((p) => ({
      ...p,
      provider: {
        id: p.provider.id,
        businessName: p.provider.businessName,
        kind: p.provider.kind,
        userId: p.provider.userId,
        avatarUrl: p.provider.user.avatarUrl,
        verificationStatus: p.provider.user.verificationStatus,
      },
    })),
  })
}

// POST: el cliente pide un producto (desde el marketplace)
export async function POST(req: NextRequest) {
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para pedir un producto', 401)

  const d = await body<{
    stockId?: string
    elementId?: string
    providerId?: string
    quantity?: number
    note?: string
  }>(req)

  if (!d.quantity || d.quantity <= 0) return fail('Decinos cuántas unidades necesitás')

  // Resolver el elemento: por stock exacto o por elemento del catálogo
  type StockRow = NonNullable<Awaited<ReturnType<typeof db.providerStock.findUnique>>>
  type ElementRow = NonNullable<Awaited<ReturnType<typeof db.catalogElement.findUnique>>>
  type ProviderRow = NonNullable<Awaited<ReturnType<typeof db.providerProfile.findUnique>>>
  let stock: (StockRow & { element: ElementRow; provider: ProviderRow }) | null = null
  let element: ElementRow | null = null
  let provider: ProviderRow | null = null

  if (d.stockId) {
    stock = await db.providerStock.findUnique({
      where: { id: d.stockId },
      include: { element: true, provider: true },
    })
    if (!stock) return fail('Esa oferta ya no existe', 404)
    if (stock.quantity <= 0 || stock.status !== 'disponible') return fail('Ese producto está sin stock en este momento')
    element = stock.element
    provider = stock.provider
  } else if (d.elementId) {
    element = await db.catalogElement.findUnique({ where: { id: d.elementId } })
    if (!element) return fail('Elemento del catálogo no encontrado', 404)
    provider = await db.providerProfile.findUnique({ where: { id: d.providerId || '' } })
    if (!provider) return fail('Falta el proveedor del pedido')
  } else {
    return fail('Falta el producto que querés pedir')
  }

  if (provider.userId === user.id) return fail('No podés pedirte productos a vos mismo')

  const unitPrice = stock ? stock.price : 0
  const total = Math.round(unitPrice * d.quantity * 100) / 100

  const purchase = await db.purchase.create({
    data: {
      clientId: user.id,
      providerId: provider.id,
      stockId: stock?.id || null,
      elementId: element.id,
      elementName: element.name,
      quantity: d.quantity,
      unit: element.unit,
      unitPrice,
      total,
      note: d.note?.slice(0, 500) || null,
      status: 'solicitado',
    },
  })

  // El chat lo abre SIEMPRE el cliente (regla de la plataforma) — va con el detalle del pedido
  const conv = await findOrCreateConversation(user.id, provider.userId)
  await db.message.create({
    data: {
      conversationId: conv.id,
      senderId: user.id,
      body: `🛒 Pedido desde Materiales:\n${element.name} × ${d.quantity} ${element.unit}${unitPrice ? ` · ${formatARS(unitPrice)} c/u (${formatARS(total)} total)` : ' · a coordinar precio'}${d.note ? `\nNota: ${d.note}` : ''}`,
    },
  })
  await db.notification.create({
    data: {
      userId: provider.userId,
      type: 'nueva_compra',
      title: 'Nuevo pedido de un cliente',
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
