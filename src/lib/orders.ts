// Pedidos del carrito — reglas compartidas por POST /api/orders (carrito),
// POST /api/purchases (pedido de un solo producto, compatibilidad), el detalle
// del pedido, las ventas del proveedor, el cron de vencimientos, sobrantes y analítica.
//
// Un pedido (Order) se fracciona en un sub-pedido (Purchase) por proveedor con
// TODOS sus ítems (PurchaseItem). Cada sub-pedido sigue su propia máquina de
// estados (PATCH /api/purchases/[id]) y se paga por separado.
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { puedeOperar } from '@/lib/plans'
import { qtyMatchesStep } from '@/lib/units'
import { round2 } from '@/lib/fees'
import { logActivity } from '@/lib/activity'

// ─────────────────────────── ítems de un sub-pedido ───────────────────────────

export type PurchaseLine = {
  /** id del PurchaseItem, o `legacy:<purchaseId>` para compras históricas de un solo ítem */
  id: string
  legacy: boolean
  stockId: string | null
  elementId: string
  elementName: string
  unit: string
  quantity: number
  unitPrice: number
  total: number
}

type PurchaseForLines = {
  id: string
  stockId: string | null
  elementId: string | null
  elementName: string
  quantity: number | null
  unit: string
  unitPrice: number | null
  total: number
  items?: { id: string; stockId: string | null; elementId: string; elementName: string; unit: string; quantity: number; unitPrice: number; total: number }[]
}

/** Ítems de un sub-pedido; las compras históricas (sin items) se leen de sus campos de ítem único. */
export function purchaseLines(p: PurchaseForLines): PurchaseLine[] {
  if (p.items && p.items.length > 0) {
    return p.items.map((i) => ({
      id: i.id, legacy: false, stockId: i.stockId, elementId: i.elementId, elementName: i.elementName,
      unit: i.unit, quantity: i.quantity, unitPrice: i.unitPrice, total: i.total,
    }))
  }
  if (!p.elementId) return []
  const quantity = p.quantity ?? 0
  const unitPrice = p.unitPrice ?? 0
  return [{
    id: `legacy:${p.id}`, legacy: true, stockId: p.stockId, elementId: p.elementId, elementName: p.elementName,
    unit: p.unit, quantity, unitPrice, total: p.total || round2(quantity * unitPrice),
  }]
}

/** "Cemento × 2 bolsa" o "Cemento × 2 bolsa y 2 productos más". */
export function linesLabel(lines: { elementName: string; quantity: number; unit: string }[]): string {
  if (lines.length === 0) return 'Pedido'
  const first = `${lines[0].elementName} × ${lines[0].quantity} ${lines[0].unit}`
  if (lines.length === 1) return first
  const rest = lines.length - 1
  return `${first} y ${rest} producto${rest === 1 ? '' : 's'} más`
}

export const purchaseItemsInclude = { items: { orderBy: { createdAt: 'asc' as const } } }

// ─────────────────────────── número de pedido ───────────────────────────

/** Crea con número PED-AAAA-NNNNNN; si choca el @unique reintenta con el siguiente. */
export async function createWithOrderNumber<T>(create: (number: string) => Promise<T>): Promise<T | null> {
  const year = new Date().getFullYear()
  for (let attempt = 0; attempt < 6; attempt++) {
    const count = await db.order.count()
    const number = `PED-${year}-${String(count + 1 + attempt).padStart(6, '0')}`
    try {
      return await create(number)
    } catch (e) {
      const clash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
      if (!clash) throw e
    }
  }
  return null
}

// ─────────────────────────── validación de líneas ───────────────────────────

export type RequestedLine = { stockId: string; quantity: number }

export type LineProblem = { stockId: string; elementName: string; providerName: string; reason: string }

type StockFull = Prisma.ProviderStockGetPayload<{ include: { element: true; provider: true } }>

export type ValidatedLine = { stock: StockFull; quantity: number }

/**
 * Valida cada línea contra la base: oferta existente, proveedor operando, no es
 * el propio proveedor, stock suficiente y cantidad acorde a la unidad. Suma las
 * líneas repetidas de la misma oferta. Devuelve las válidas y los problemas.
 */
export async function validateLines(userId: string, requested: RequestedLine[]): Promise<{ lines: ValidatedLine[]; problems: LineProblem[] }> {
  const merged = new Map<string, number>()
  for (const r of requested) merged.set(r.stockId, round2((merged.get(r.stockId) || 0) + r.quantity))
  const stocks = await db.providerStock.findMany({
    where: { id: { in: [...merged.keys()] } },
    include: { element: true, provider: true },
  })
  const byId = new Map(stocks.map((s) => [s.id, s]))
  const lines: ValidatedLine[] = []
  const problems: LineProblem[] = []
  for (const [stockId, quantity] of merged) {
    const s = byId.get(stockId)
    if (!s) {
      problems.push({ stockId, elementName: 'Producto', providerName: '', reason: 'Esta oferta ya no existe' })
      continue
    }
    const base = { stockId, elementName: s.element.name, providerName: s.provider.businessName }
    if (s.provider.userId === userId) problems.push({ ...base, reason: 'Es un producto tuyo: no podés pedírtelo' })
    else if (!puedeOperar(s.provider)) problems.push({ ...base, reason: 'El proveedor no está operando por ahora' })
    else if (s.status === 'agotado' || s.quantity <= 0) problems.push({ ...base, reason: 'Se quedó sin stock' })
    else if (!qtyMatchesStep(quantity, s.element.unit)) problems.push({ ...base, reason: `La cantidad no es válida para la unidad (${s.element.unit})` })
    else if (s.quantity < quantity) problems.push({ ...base, reason: `Solo quedan ${s.quantity} ${s.element.unit}` })
    else lines.push({ stock: s, quantity })
  }
  return { lines, problems }
}

// ─────────────────────────── alta del pedido ───────────────────────────

export type CreatedOrder = {
  order: { id: string; number: string; clientId: string; note: string | null; createdAt: Date }
  purchases: Prisma.PurchaseGetPayload<{ include: { items: true } }>[]
}

/**
 * Crea el pedido con un sub-pedido por proveedor (en una transacción). No toca
 * el stock: se reserva recién cuando el proveedor aprueba. Después avisa a cada
 * proveedor (notificación + mensaje en el chat que abre el cliente) y registra
 * la línea de tiempo.
 */
export async function createOrder(input: {
  user: { id: string; displayName: string }
  lines: ValidatedLine[]
  types?: Record<string, 'compra' | 'reserva'>
  note?: string | null
  source: 'carrito' | 'directo'
}): Promise<CreatedOrder | null> {
  const groups = new Map<string, ValidatedLine[]>()
  for (const l of input.lines) {
    const g = groups.get(l.stock.providerId) || []
    g.push(l)
    groups.set(l.stock.providerId, g)
  }
  const note = input.note?.trim() || null

  const created = await createWithOrderNumber((number) =>
    db.$transaction(async (tx) => {
      const order = await tx.order.create({ data: { number, clientId: input.user.id, note } })
      const purchases: CreatedOrder['purchases'] = []
      for (const [providerId, group] of groups) {
        const items = group.map((l) => ({
          stockId: l.stock.id,
          elementId: l.stock.elementId,
          elementName: l.stock.element.name,
          unit: l.stock.element.unit,
          quantity: l.quantity,
          unitPrice: l.stock.price,
          total: round2(l.stock.price * l.quantity),
        }))
        const total = round2(items.reduce((a, i) => a + i.total, 0))
        const single = items.length === 1 ? items[0] : null
        const p = await tx.purchase.create({
          data: {
            orderId: order.id,
            clientId: input.user.id,
            providerId,
            // compatibilidad: con un solo ítem se completan también los campos históricos
            stockId: single?.stockId ?? null,
            elementId: single?.elementId ?? null,
            quantity: single?.quantity ?? null,
            unitPrice: single?.unitPrice ?? null,
            unit: single?.unit ?? 'unidad',
            elementName: linesLabel(items),
            total,
            note,
            type: input.types?.[providerId] === 'reserva' ? 'reserva' : 'compra',
            status: 'pendiente_aprobacion',
            items: { create: items },
          },
          include: { items: true },
        })
        purchases.push(p)
      }
      return { order, purchases }
    })
  )
  if (!created) return null

  // avisos (fuera de la transacción: un aviso que falla no deshace el pedido)
  const provs = new Map(input.lines.map((l) => [l.stock.providerId, l.stock.provider]))
  await logActivity({
    orderId: created.order.id, actorId: input.user.id, actorRole: 'cliente', type: 'pedido_creado',
    message: `${input.user.displayName} confirmó el pedido ${created.order.number} con ${created.purchases.length} proveedor${created.purchases.length === 1 ? '' : 'es'}.`,
  })
  for (const p of created.purchases) {
    const prov = provs.get(p.providerId)
    if (!prov) continue
    const lines = purchaseLines(p)
    const tipo = p.type === 'reserva' ? 'Reserva' : 'Pedido'
    try {
      const conv = await findOrCreateConversation(input.user.id, prov.userId)
      const detalle = lines.map((l) => `• ${l.elementName} × ${l.quantity} ${l.unit} · ${fmt(l.unitPrice)} c/u`).join('\n')
      await db.message.create({
        data: {
          conversationId: conv.id,
          senderId: input.user.id,
          body: `🛒 ${tipo} ${created.order.number}${input.source === 'carrito' ? ' desde el carrito' : ' desde Materiales'}:\n${detalle}\nTotal: ${fmt(p.total)}${note ? `\nNota: ${note}` : ''}`,
        },
      })
      await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } })
      await db.notification.create({
        data: {
          userId: prov.userId,
          type: 'nueva_compra',
          title: p.type === 'reserva' ? 'Nueva reserva de un cliente' : 'Nuevo pedido de un cliente',
          body: `${input.user.displayName} te pidió ${p.elementName} (${fmt(p.total)}). Aprobalo o rechazalo en Ventas.`,
          link: '#/panel/proveedor/cobros?tab=ventas',
        },
      })
    } catch (e) {
      console.error('[orders] aviso al proveedor', p.id, e)
    }
    await logActivity({
      orderId: created.order.id, purchaseId: p.id, actorId: input.user.id, actorRole: 'cliente', type: 'subpedido_creado',
      message: `${tipo} a ${prov.businessName}: ${lines.length} producto${lines.length === 1 ? '' : 's'} por ${fmt(p.total)}. Espera la aprobación del proveedor.`,
      data: { items: lines.map((l) => ({ name: l.elementName, qty: l.quantity, unit: l.unit, price: l.unitPrice })) },
    })
  }
  return created
}

export async function findOrCreateConversation(a: string, b: string) {
  const [u1, u2] = [a, b].sort()
  const existing = await db.conversation.findFirst({ where: { userAId: u1, userBId: u2 } })
  if (existing) return existing
  try {
    return await db.conversation.create({ data: { userAId: u1, userBId: u2 } })
  } catch {
    // carrera con otro alta simultánea (unique userA/userB)
    const again = await db.conversation.findFirst({ where: { userAId: u1, userBId: u2 } })
    if (again) return again
    throw new Error('No se pudo abrir la conversación')
  }
}

/** Moneda para avisos y línea de tiempo: centavos solo si existen ($ 203.980 · $ 42,35). */
export function fmt(n: number) {
  const cents = Math.round(Math.abs(n) * 100) % 100 !== 0
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 })
}

// ─────────────────────────── stock de un sub-pedido ───────────────────────────

type Tx = Prisma.TransactionClient

/** Recalcula el estado derivado del stock (disponible | por_agotar | agotado). */
export async function refreshStockStatus(stockId: string, client: Tx | typeof db = db) {
  const s = await client.providerStock.findUnique({ where: { id: stockId }, select: { quantity: true, minStock: true } })
  if (!s) return
  const status = s.quantity <= 0 ? 'agotado' : s.quantity <= s.minStock ? 'por_agotar' : 'disponible'
  await client.providerStock.update({ where: { id: stockId }, data: { status } })
}

/** Devuelve al stock todos los ítems reservados de un sub-pedido (cancelación o vencimiento). */
export async function releaseLines(lines: PurchaseLine[], note: string) {
  for (const l of lines) {
    if (!l.stockId) continue
    const exists = await db.providerStock.findUnique({ where: { id: l.stockId }, select: { id: true } })
    if (!exists) continue
    await db.providerStock.update({ where: { id: l.stockId }, data: { quantity: { increment: l.quantity } } })
    await db.stockMovement.create({ data: { stockId: l.stockId, type: 'liberacion', quantity: l.quantity, note } })
    await refreshStockStatus(l.stockId)
  }
}
