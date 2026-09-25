// Pedidos del carrito — reglas compartidas por POST /api/orders (carrito),
// POST /api/purchases (pedido de un solo producto, compatibilidad), el detalle
// del pedido, las ventas del proveedor, el cron de vencimientos, sobrantes y analítica.
//
// Un pedido (Order) se fracciona en un sub-pedido (Purchase) por proveedor con
// TODOS sus ítems (PurchaseItem). Cada sub-pedido sigue su propia máquina de
// estados (PATCH /api/purchases/[id]) y se paga por separado.
// D15 (24/09/2026): las COMPRAS (con stock) no se aprueban — nacen reservadas y listas
// para pagar; las RESERVAS (con o sin stock) las aprueba el proveedor. Ver order-rules.ts.
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { puedeOperar } from '@/lib/plans'
import { qtyMatchesStep } from '@/lib/units'
import { round2 } from '@/lib/fees'
import { logActivity } from '@/lib/activity'
import { COMPRA_PAGO_MS, fmtDeadline, type OrderLineMode } from '@/lib/order-rules'
import { notificar } from '@/lib/notify'
import { prefijoAnual, ultimoNumero, formatearNumero } from '@/lib/numeracion'

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

/**
 * Crea con número PED-AAAA-NNNNNN; si choca un @unique (el número del pedido o el de
 * un cobro creado en la misma transacción) reintenta con el siguiente.
 */
export async function createWithOrderNumber<T>(create: (number: string, attempt: number) => Promise<T>): Promise<T | null> {
  const prefijo = prefijoAnual('PED')
  for (let attempt = 0; attempt < 6; attempt++) {
    const ultimo = await ultimoNumero((a) => db.order.findFirst(a), prefijo)
    const number = formatearNumero(prefijo, ultimo + 1 + attempt)
    try {
      return await create(number, attempt)
    } catch (e) {
      const clash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
      if (!clash) throw e
    }
  }
  return null
}

// ─────────────────────────── validación de líneas ───────────────────────────

export type RequestedLine = { stockId: string; quantity: number; mode?: OrderLineMode }

export type LineProblem = { stockId: string; elementName: string; providerName: string; reason: string }

type StockFull = Prisma.ProviderStockGetPayload<{ include: { element: true; provider: true } }>

/** `inStock`: hay stock para la cantidad pedida. `mode`: compra (directa, solo con stock) o reserva. */
export type ValidatedLine = { stock: StockFull; quantity: number; inStock: boolean; mode: OrderLineMode }

/** Hay stock suficiente de una oferta para esa cantidad. */
export function stockCovers(s: { quantity: number; status: string }, quantity: number): boolean {
  return s.status !== 'agotado' && s.quantity > 0 && s.quantity >= quantity
}

/**
 * Valida cada línea contra la base: oferta existente, proveedor operando, no es el
 * propio proveedor y cantidad acorde a la unidad. Suma las líneas repetidas de la
 * misma oferta. Sin stock (o con menos del pedido) la línea solo se puede RESERVAR:
 * si se pidió como compra, es un problema que dice cuál y cuánto queda.
 * Sin `mode` explícito: compra si hay stock, reserva si no.
 */
export async function validateLines(userId: string, requested: RequestedLine[]): Promise<{ lines: ValidatedLine[]; problems: LineProblem[] }> {
  const merged = new Map<string, { quantity: number; mode?: OrderLineMode }>()
  for (const r of requested) {
    const prev = merged.get(r.stockId)
    merged.set(r.stockId, { quantity: round2((prev?.quantity || 0) + r.quantity), mode: r.mode ?? prev?.mode })
  }
  const stocks = await db.providerStock.findMany({
    where: { id: { in: [...merged.keys()] } },
    include: { element: true, provider: true },
  })
  const byId = new Map(stocks.map((s) => [s.id, s]))
  const lines: ValidatedLine[] = []
  const problems: LineProblem[] = []
  for (const [stockId, { quantity, mode }] of merged) {
    const s = byId.get(stockId)
    if (!s) {
      problems.push({ stockId, elementName: 'Producto', providerName: '', reason: 'Esta oferta ya no existe' })
      continue
    }
    const base = { stockId, elementName: s.element.name, providerName: s.provider.businessName }
    const inStock = stockCovers(s, quantity)
    const finalMode: OrderLineMode = mode ?? (inStock ? 'compra' : 'reserva')
    if (s.provider.userId === userId) problems.push({ ...base, reason: 'Es un producto tuyo: no podés pedírtelo' })
    else if (!puedeOperar(s.provider)) problems.push({ ...base, reason: 'El proveedor no está operando por ahora' })
    else if (!qtyMatchesStep(quantity, s.element.unit)) problems.push({ ...base, reason: `La cantidad no es válida para la unidad (${s.element.unit})` })
    else if (finalMode === 'compra' && !inStock) {
      problems.push({
        ...base,
        reason: s.quantity <= 0 || s.status === 'agotado'
          ? 'No hay stock para comprarlo ahora: podés reservarlo y el proveedor te avisa'
          : `Solo quedan ${s.quantity} ${s.element.unit} para comprar ahora: bajá la cantidad o reservalo`,
      })
    } else lines.push({ stock: s, quantity, inStock, mode: finalMode })
  }
  return { lines, problems }
}

// ─────────────────────────── alta del pedido ───────────────────────────

/** Un ítem de una COMPRA no alcanzó al reservar (se deshace todo). */
export class StockShortError extends Error {
  constructor(readonly line: { id?: string; stockId: string | null; elementName: string; quantity: number; unit: string }, readonly available: number) {
    super('STOCK_SHORT')
  }
}

export type CreatedOrder = {
  order: { id: string; number: string; clientId: string; note: string | null; createdAt: Date }
  purchases: Prisma.PurchaseGetPayload<{ include: { items: true } }>[]
}

export type CreateOrderResult =
  | ({ ok: true } & CreatedOrder)
  | { ok: false; reason: 'numbering' }
  | { ok: false; reason: 'stock'; item: { stockId: string | null; name: string; requested: number; available: number; unit: string } }

type Tx = Prisma.TransactionClient

/**
 * Crea el pedido en UNA transacción, con un sub-pedido por proveedor y por tipo:
 *  · COMPRA (ítems con stock): nace `aprobado` = lista para pagar, SIN aprobación del
 *    proveedor. Reserva atómica del stock de todos sus ítems (si uno no alcanza se
 *    deshace TODO el pedido) + cobro (ProviderCharge) emitido + 24 h para pagar.
 *  · RESERVA (con o sin stock): nace `pendiente_aprobacion` y no toca el stock.
 * Si un proveedor tiene ítems de los dos tipos, se crean dos sub-pedidos.
 * Después avisa a cada proveedor (notificación + mensaje en el chat que abre el
 * cliente) y registra la línea de tiempo.
 */
export async function createOrder(input: {
  user: { id: string; displayName: string }
  lines: ValidatedLine[]
  note?: string | null
  source: 'carrito' | 'directo'
}): Promise<CreateOrderResult> {
  const groups = new Map<string, { providerId: string; mode: OrderLineMode; lines: ValidatedLine[] }>()
  for (const l of input.lines) {
    const key = `${l.stock.providerId}:${l.mode}`
    const g = groups.get(key) || { providerId: l.stock.providerId, mode: l.mode, lines: [] }
    g.lines.push(l)
    groups.set(key, g)
  }
  // orden estable: por proveedor, primero la compra y después la reserva
  const ordered = [...groups.values()].sort((a, b) => a.providerId.localeCompare(b.providerId) || (a.mode === 'compra' ? -1 : 1))
  const note = input.note?.trim() || null
  let created: CreatedOrder | null
  try {
    created = await createWithOrderNumber((number, attempt) =>
      db.$transaction(async (tx) => {
        const now = new Date()
        const order = await tx.order.create({ data: { number, clientId: input.user.id, note } })
        const purchases: CreatedOrder['purchases'] = []
        let chargeBase: number | null = null
        let chargeSeq = 0
        for (const g of ordered) {
          const items = g.lines.map((l) => ({
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
          const compra = g.mode === 'compra'
          const p = await tx.purchase.create({
            data: {
              orderId: order.id,
              clientId: input.user.id,
              providerId: g.providerId,
              // compatibilidad: con un solo ítem se completan también los campos históricos
              stockId: single?.stockId ?? null,
              elementId: single?.elementId ?? null,
              quantity: single?.quantity ?? null,
              unitPrice: single?.unitPrice ?? null,
              unit: single?.unit ?? 'unidad',
              elementName: linesLabel(items),
              total,
              note,
              type: g.mode,
              status: compra ? 'aprobado' : 'pendiente_aprobacion',
              ...(compra ? { approvedAt: now, reservationExpiresAt: new Date(now.getTime() + COMPRA_PAGO_MS) } : {}),
              items: { create: items },
            },
            include: { items: true },
          })
          if (compra) {
            await reserveItems(tx, p.items, `Compra ${p.id} de ${input.user.displayName}`)
            if (chargeBase === null) chargeBase = await ultimoNumero((a) => tx.providerCharge.findFirst(a), prefijoAnual('PRV'))
            const chargeNumber = formatearNumero(prefijoAnual('PRV'), chargeBase + 1 + attempt + chargeSeq++)
            const charge = await tx.providerCharge.create({
              data: {
                number: chargeNumber,
                providerId: g.providerId,
                clientId: input.user.id,
                projectId: null,
                amount: total,
                status: 'pendiente',
                materialIds: '[]',
                description: `Compra ${number}: ${p.elementName}`.slice(0, 500),
              },
            })
            const withCharge = await tx.purchase.update({ where: { id: p.id }, data: { chargeId: charge.id }, include: { items: true } })
            purchases.push(withCharge)
          } else {
            purchases.push(p)
          }
        }
        return { order, purchases }
      }, { timeout: 30_000, maxWait: 10_000 })
    )
  } catch (e) {
    if (e instanceof StockShortError) {
      return { ok: false, reason: 'stock', item: { stockId: e.line.stockId, name: e.line.elementName, requested: e.line.quantity, available: e.available, unit: e.line.unit } }
    }
    throw e
  }
  if (!created) return { ok: false, reason: 'numbering' }

  // avisos (fuera de la transacción: un aviso que falla no deshace el pedido)
  const provs = new Map(input.lines.map((l) => [l.stock.providerId, l.stock.provider]))
  const sinStock = new Set(input.lines.filter((l) => !l.inStock).map((l) => l.stock.id))
  const nCompras = created.purchases.filter((p) => p.type === 'compra').length
  const nReservas = created.purchases.length - nCompras
  const partes = [nCompras ? `${nCompras} compra${nCompras === 1 ? '' : 's'} directa${nCompras === 1 ? '' : 's'}` : '', nReservas ? `${nReservas} reserva${nReservas === 1 ? '' : 's'}` : ''].filter(Boolean).join(' y ')
  await logActivity({
    orderId: created.order.id, actorId: input.user.id, actorRole: 'cliente', type: 'pedido_creado',
    message: `${input.user.displayName} confirmó el pedido ${created.order.number}: ${partes}.`,
  })
  // Los avisos a cada proveedor (chat, notificación, línea de tiempo) son independientes
  // entre sí: salen EN PARALELO. En serie, con la base lejos, sumaban varios segundos.
  const created_ = created
  await Promise.all(created_.purchases.map(async (p) => {
    const prov = provs.get(p.providerId)
    if (!prov) return
    const lines = purchaseLines(p)
    const compra = p.type === 'compra'
    const faltan = lines.filter((l) => l.stockId && sinStock.has(l.stockId))
    const hasta = p.reservationExpiresAt ? fmtDeadline(p.reservationExpiresAt) : ''
    try {
      const conv = await findOrCreateConversation(input.user.id, prov.userId)
      const detalle = lines.map((l) => `• ${l.elementName} × ${l.quantity} ${l.unit} · ${fmt(l.unitPrice)} c/u${l.stockId && sinStock.has(l.stockId) ? ' (sin stock: pido que me lo consigas)' : ''}`).join('\n')
      await db.message.create({
        data: {
          conversationId: conv.id,
          senderId: input.user.id,
          body: `🛒 ${compra ? 'Compra' : 'Reserva'} ${created.order.number}${input.source === 'carrito' ? ' desde el carrito' : ' desde Materiales'}:\n${detalle}\nTotal: ${fmt(p.total)}${note ? `\nNota: ${note}` : ''}`,
        },
      })
      await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } })
      await notificar({
        data: {
          userId: prov.userId,
          type: 'nueva_compra',
          title: compra ? 'Nueva compra: stock reservado' : 'Nueva reserva de un cliente',
          body: compra
            ? `${input.user.displayName} compró ${p.elementName} (${fmt(p.total)}). Ya reservamos tu stock: te paga por Mercado Pago o en efectivo al retirar. Preparalo.`
            : `${input.user.displayName} quiere reservar ${p.elementName} (${fmt(p.total)}).${faltan.length ? ' Incluye productos que hoy no tenés en stock: al aprobar, indicá cuándo los vas a tener.' : ''} Aprobala o rechazala en Ventas.`,
          link: '#/panel/proveedor/cobros?tab=ventas',
        },
      })
    } catch (e) {
      console.error('[orders] aviso al proveedor', p.id, e)
    }
    await logActivity({
      orderId: created.order.id, purchaseId: p.id, actorId: input.user.id, actorRole: 'cliente',
      type: compra ? 'compra_confirmada' : 'subpedido_creado',
      message: compra
        ? `Compra directa a ${prov.businessName}: ${lines.length} producto${lines.length === 1 ? '' : 's'} por ${fmt(p.total)}. El stock quedó reservado; hay tiempo hasta el ${hasta} para pagar por Mercado Pago o elegir efectivo al retirar.`
        : `Reserva a ${prov.businessName}: ${lines.length} producto${lines.length === 1 ? '' : 's'} por ${fmt(p.total)}${faltan.length ? ` (${faltan.length === lines.length ? 'sin stock hoy' : `${faltan.length} sin stock hoy`})` : ''}. Espera la aprobación del proveedor.`,
      data: { items: lines.map((l) => ({ name: l.elementName, qty: l.quantity, unit: l.unit, price: l.unitPrice })) },
    })
  }))
  return { ok: true, ...created }
}

/**
 * Reserva atómica del stock de varios ítems dentro de una transacción: descuenta con
 * `updateMany` condicional (quantity >= pedido), registra el movimiento `reserva` y
 * recalcula el estado. Si uno no alcanza lanza StockShortError y la transacción se deshace.
 */
export async function reserveItems(
  tx: Tx,
  items: { id?: string; stockId: string | null; elementName: string; quantity: number; unit: string }[],
  note: string
) {
  for (const l of items) {
    if (!l.stockId) throw new StockShortError(l, 0)
    const r = await tx.providerStock.updateMany({
      where: { id: l.stockId, quantity: { gte: l.quantity } },
      data: { quantity: { decrement: l.quantity } },
    })
    if (r.count === 0) {
      const s = await tx.providerStock.findUnique({ where: { id: l.stockId }, select: { quantity: true } })
      throw new StockShortError(l, Math.max(0, s?.quantity ?? 0))
    }
    await tx.stockMovement.create({ data: { stockId: l.stockId, type: 'reserva', quantity: l.quantity, note } })
    await refreshStockStatus(l.stockId, tx)
  }
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
