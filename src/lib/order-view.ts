// Vista de pedidos para el cliente (lista y detalle con seguimiento). Arma cada
// sub-pedido con sus ítems, su cobro, si el proveedor cobra por Mercado Pago y
// el resumen "2 de 3 proveedores pagados · Falta pagar $X". Las compras
// históricas (sin pedido) se muestran como un pedido virtual `legacy-<purchaseId>`.
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { purchaseLines, type PurchaseLine } from '@/lib/orders'
import { round2, serviceFeeFor } from '@/lib/fees'

export const LEGACY_PREFIX = 'legacy-'

const purchaseInclude = {
  items: { orderBy: { createdAt: 'asc' as const } },
  provider: {
    select: {
      id: true, businessName: true, userId: true, city: true, address: true, mpOauthStatus: true, mpOauthAccessToken: true,
      user: { select: { avatarUrl: true, verificationStatus: true } },
    },
  },
} satisfies Prisma.PurchaseInclude

type PurchaseRow = Prisma.PurchaseGetPayload<{ include: typeof purchaseInclude }>

type ChargeLite = { id: string; number: string; status: string; method: string | null; paidAt: Date | null; amount: number; serviceFee: number }

export type SubOrderView = {
  id: string
  status: string
  type: string
  total: number
  serviceFee: number
  /** cargo que correspondería si paga por MP (para mostrar antes de elegir) */
  mpServiceFee: number
  paymentMethod: string | null
  paid: boolean
  active: boolean
  note: string | null
  rejectionReason: string | null
  reservationExpiresAt: Date | null
  approvedAt: Date | null
  createdAt: Date
  updatedAt: Date
  label: string
  items: PurchaseLine[]
  charge: ChargeLite | null
  provider: { id: string; businessName: string; userId: string; city: string | null; address: string | null; avatarUrl: string | null; verificationStatus: string; mpConnected: boolean }
}

export type OrderSummary = {
  providers: number
  activeProviders: number
  paidProviders: number
  pendingAmount: number
  total: number
  status: 'esperando' | 'en_curso' | 'completo' | 'cerrado'
}

export type OrderView = {
  id: string
  number: string
  legacy: boolean
  note: string | null
  createdAt: Date
  purchases: SubOrderView[]
  summary: OrderSummary
}

const INACTIVE = ['rechazado', 'cancelado']

function subView(p: PurchaseRow, charge: ChargeLite | null): SubOrderView {
  const paid = p.status === 'pagado' || charge?.status === 'pagada'
  return {
    id: p.id,
    status: p.status,
    type: p.type,
    total: p.total,
    serviceFee: p.serviceFee,
    mpServiceFee: serviceFeeFor(p.total),
    paymentMethod: p.paymentMethod,
    paid,
    active: !INACTIVE.includes(p.status),
    note: p.note,
    rejectionReason: p.rejectionReason,
    reservationExpiresAt: p.reservationExpiresAt,
    approvedAt: p.approvedAt,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    label: p.elementName,
    items: purchaseLines(p),
    charge,
    provider: {
      id: p.provider.id,
      businessName: p.provider.businessName,
      userId: p.provider.userId,
      city: p.provider.city,
      address: p.provider.address,
      avatarUrl: p.provider.user.avatarUrl,
      verificationStatus: p.provider.user.verificationStatus,
      mpConnected: p.provider.mpOauthStatus === 'connected' && !!p.provider.mpOauthAccessToken,
    },
  }
}

export function summarize(subs: SubOrderView[]): OrderSummary {
  const active = subs.filter((s) => s.active)
  const paid = active.filter((s) => s.paid)
  const pendingAmount = round2(active.filter((s) => !s.paid).reduce((a, s) => a + s.total, 0))
  const allDone = active.length > 0 && active.every((s) => s.paid && ['pagado'].includes(s.status))
  return {
    providers: subs.length,
    activeProviders: active.length,
    paidProviders: paid.length,
    pendingAmount,
    total: round2(active.reduce((a, s) => a + s.total, 0)),
    status: active.length === 0 ? 'cerrado' : allDone ? 'completo' : subs.every((s) => s.status === 'pendiente_aprobacion') ? 'esperando' : 'en_curso',
  }
}

async function chargesFor(purchases: { chargeId: string | null }[]) {
  const ids = purchases.map((p) => p.chargeId).filter((x): x is string => !!x)
  const rows = ids.length
    ? await db.providerCharge.findMany({
        where: { id: { in: ids } },
        select: { id: true, number: true, status: true, method: true, paidAt: true, amount: true, serviceFee: true },
      })
    : []
  return new Map(rows.map((c) => [c.id, c]))
}

/** Pedidos del cliente (más recientes primero), incluidas las compras históricas sin pedido. */
export async function listOrders(clientId: string): Promise<OrderView[]> {
  const [orders, legacy] = await Promise.all([
    db.order.findMany({
      where: { clientId },
      orderBy: { createdAt: 'desc' },
      take: 60,
      include: { purchases: { include: purchaseInclude, orderBy: { createdAt: 'asc' } } },
    }),
    db.purchase.findMany({ where: { clientId, orderId: null }, include: purchaseInclude, orderBy: { createdAt: 'desc' }, take: 60 }),
  ])
  const charges = await chargesFor([...orders.flatMap((o) => o.purchases), ...legacy])
  const views: OrderView[] = orders.map((o) => {
    const subs = o.purchases.map((p) => subView(p, p.chargeId ? charges.get(p.chargeId) || null : null))
    return { id: o.id, number: o.number, legacy: false, note: o.note, createdAt: o.createdAt, purchases: subs, summary: summarize(subs) }
  })
  for (const p of legacy) {
    const subs = [subView(p, p.chargeId ? charges.get(p.chargeId) || null : null)]
    views.push({ id: `${LEGACY_PREFIX}${p.id}`, number: 'Compra anterior', legacy: true, note: p.note, createdAt: p.createdAt, purchases: subs, summary: summarize(subs) })
  }
  return views.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
}

/** Detalle de un pedido del cliente (o null si no existe / no es suyo). */
export async function getOrderView(id: string, clientId: string): Promise<{ view: OrderView; events: EventView[] } | 'not_found' | 'forbidden'> {
  if (id.startsWith(LEGACY_PREFIX)) {
    const p = await db.purchase.findUnique({ where: { id: id.slice(LEGACY_PREFIX.length) }, include: purchaseInclude })
    if (!p || p.orderId) return 'not_found'
    if (p.clientId !== clientId) return 'forbidden'
    const charges = await chargesFor([p])
    const subs = [subView(p, p.chargeId ? charges.get(p.chargeId) || null : null)]
    const events = await eventsFor({ purchaseIds: [p.id] })
    return { view: { id, number: 'Compra anterior', legacy: true, note: p.note, createdAt: p.createdAt, purchases: subs, summary: summarize(subs) }, events }
  }
  const o = await db.order.findUnique({
    where: { id },
    include: { purchases: { include: purchaseInclude, orderBy: { createdAt: 'asc' } } },
  })
  if (!o) return 'not_found'
  if (o.clientId !== clientId) return 'forbidden'
  const charges = await chargesFor(o.purchases)
  const subs = o.purchases.map((p) => subView(p, p.chargeId ? charges.get(p.chargeId) || null : null))
  const events = await eventsFor({ orderId: o.id, purchaseIds: o.purchases.map((p) => p.id) })
  return { view: { id: o.id, number: o.number, legacy: false, note: o.note, createdAt: o.createdAt, purchases: subs, summary: summarize(subs) }, events }
}

export type EventView = { id: string; purchaseId: string | null; actorRole: string; actorName: string | null; type: string; message: string; createdAt: Date }

/** Eventos de la línea de tiempo, en orden cronológico, con el nombre de quien actuó. */
export async function eventsFor(where: { orderId?: string; purchaseIds?: string[] }): Promise<EventView[]> {
  const or: Prisma.ActivityEventWhereInput[] = []
  if (where.orderId) or.push({ orderId: where.orderId })
  if (where.purchaseIds?.length) or.push({ purchaseId: { in: where.purchaseIds } })
  if (!or.length) return []
  const rows = await db.activityEvent.findMany({ where: { OR: or }, orderBy: { createdAt: 'asc' }, take: 300 })
  const actorIds = [...new Set(rows.map((r) => r.actorId).filter((x): x is string => !!x))]
  const users = actorIds.length ? await db.user.findMany({ where: { id: { in: actorIds } }, select: { id: true, displayName: true } }) : []
  const names = new Map(users.map((u) => [u.id, u.displayName]))
  return rows.map((r) => ({
    id: r.id,
    purchaseId: r.purchaseId,
    actorRole: r.actorRole,
    actorName: r.actorId ? names.get(r.actorId) || null : null,
    type: r.type,
    message: r.message,
    createdAt: r.createdAt,
  }))
}
