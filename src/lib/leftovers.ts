// Sobrantes — reglas compartidas entre POST /api/returns, GET /api/returns/eligible
// y PATCH /api/returns/[id]. Un pedido de devolución agrupa ítems de UN solo vendedor
// y UN solo pago de origen; el reembolso vuelve por el mismo medio con el que se pagó.
// Si el pago fue por Mercado Pago e incluyó el cargo de servicio HomIA (1%), se
// reembolsa solo el precio de los ítems devueltos: el cargo de servicio no se devuelve.
//
// D14 (24/09/2026, Leonardo): "Devuelve la plata quien la cobró, y los materiales vuelven
// a quien se los vendió al cliente".
//   · Pata "cliente": el comprador devuelve a quien le cobró. Compra directa y cobro del
//     proveedor (modo cliente_paga_proveedor) → vendedor = PROVEEDOR (los ítems vuelven a su
//     stock). Materiales cobrados en la factura del profesional (modo pro_adelanta) →
//     vendedor = PROFESIONAL (no vuelven al stock de nadie; reembolsa desde su cuenta).
//   · Pata "profesional_a_proveedor" (opcional): el profesional le devuelve al proveedor lo
//     que le compró para el proyecto. Ese pago fue por fuera de HomIA, así que el reembolso
//     también: el proveedor marca cómo lo devolvió y el profesional confirma.
import { db } from '@/lib/db'

export const RETURN_WINDOW_DAYS = 30
export const RETURN_TIPOS = ['cliente', 'profesional_a_proveedor'] as const
export type ReturnTipo = (typeof RETURN_TIPOS)[number]
export const OUTSIDE_REFUND_METHODS = ['efectivo', 'transferencia', 'saldo_a_favor'] as const
export const OUTSIDE_REFUND_LABEL: Record<string, string> = {
  efectivo: 'en efectivo',
  transferencia: 'por transferencia',
  saldo_a_favor: 'como saldo a favor en el local',
}
export const RETURN_ACTIVE_STATUSES = ['solicitada', 'aceptada', 'aceptada_parcial', 'recibida', 'reembolsada', 'reembolso_fallido']

/** Foto de sobrante: solo subidas reales de HomIA (bucket público o legado /uploads). */
export function isHomiaUploadUrl(url: string): boolean {
  if (typeof url !== 'string' || url.length > 600) return false
  if (url.startsWith('/uploads/')) return true
  const base = (process.env.SUPABASE_PROJECT_URL || process.env.SUPABASE_API_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/+$/, '')
  if (base && url.startsWith(`${base}/storage/v1/object/public/homia-uploads/`)) return true
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/storage\/v1\/object\/public\/homia-uploads\//i.test(url)
}

export type PaidOrigin = {
  chargeId: string | null
  invoiceId: string | null
  paymentMethod: 'mercadopago' | 'efectivo' | null
  mpPaymentId: string | null
  paidAt: Date | null
  /** monto total del pago original */
  paidAmount: number
  /** cargo de servicio HomIA (1%) incluido en el pago: NO se reembolsa */
  serviceFee: number
  /** ya reembolsado por MP sobre ese pago */
  refundedAmount: number
}

/** Tope de reembolso de un pago: lo pagado sin el cargo de servicio, menos lo ya reembolsado. */
export function refundableOf(o: { paidAmount: number; serviceFee: number; refundedAmount: number }): number {
  return round2(Math.max(0, o.paidAmount - o.serviceFee - o.refundedAmount))
}

/** Cantidad ya devuelta (aceptada o, si sigue en curso, pedida) de un material, un
 *  ítem de compra (carrito, multi-ítem) o una compra histórica de un solo ítem.
 *  Cada pata lleva su propia cuenta: lo que el cliente le devuelve al profesional no
 *  descuenta de lo que el profesional le puede devolver al proveedor (y al revés). */
export async function alreadyReturnedQty(key: { materialId?: string | null; purchaseId?: string | null; purchaseItemId?: string | null }, excludeReturnId?: string, tipo: ReturnTipo = 'cliente'): Promise<number> {
  const where = key.materialId
    ? { materialId: key.materialId }
    : key.purchaseItemId
      ? { purchaseItemId: key.purchaseItemId }
      : key.purchaseId
        ? { purchaseId: key.purchaseId, purchaseItemId: null }
        : null
  if (!where) return 0
  const items = await db.leftoverItem.findMany({
    where: {
      ...where,
      status: { not: 'rechazado' },
      return: { tipo, status: { in: RETURN_ACTIVE_STATUSES }, ...(excludeReturnId ? { id: { not: excludeReturnId } } : {}) },
    },
    select: { qtyRequested: true, qtyAccepted: true, qtyReceived: true },
  })
  return items.reduce((a, i) => a + (i.qtyReceived ?? i.qtyAccepted ?? i.qtyRequested), 0)
}

/** Pago original de una compra directa (charge + Payment). */
export async function purchasePaidOrigin(purchase: {
  id: string; chargeId: string | null; paymentMethod: string | null; mpPaymentId: string | null; total: number; serviceFee: number; updatedAt: Date
}): Promise<PaidOrigin> {
  const charge = purchase.chargeId ? await db.providerCharge.findUnique({ where: { id: purchase.chargeId } }) : null
  const payment = await db.payment.findFirst({
    where: {
      OR: [{ purchaseId: purchase.id }, ...(purchase.chargeId ? [{ chargeId: purchase.chargeId }] : [])],
      status: { in: ['approved', 'confirmado'] },
    },
    orderBy: { createdAt: 'desc' },
  })
  const method = (purchase.paymentMethod || charge?.method || payment?.method || null) as PaidOrigin['paymentMethod']
  return {
    chargeId: purchase.chargeId,
    invoiceId: null,
    paymentMethod: method,
    mpPaymentId: method === 'mercadopago' ? (purchase.mpPaymentId || charge?.mpPaymentId || payment?.mpPaymentId || null) : null,
    paidAt: payment?.confirmedAt || charge?.paidAt || payment?.createdAt || purchase.updatedAt,
    paidAmount: payment?.amount ?? charge?.amount ?? purchase.total,
    serviceFee: method === 'mercadopago' ? purchase.serviceFee || charge?.serviceFee || 0 : 0,
    refundedAmount: payment?.refundedAmount ?? 0,
  }
}

type MaterialRow = { id: string; invoicedAt: Date | null; providerId: string | null }
type InvoiceRow = { id: string; status: string; paymentMethod: string | null; mpPaymentId: string | null; paidAt: Date | null; issuedAt: Date; total: number; serviceFee: number }
type ChargeRow = { id: string; status: string; method: string | null; mpPaymentId: string | null; paidAt: Date | null; amount: number; serviceFee: number; materialIds: string }

/** Pago original de un material de proyecto: cobro del proveedor (modo B) o factura del profesional (modo A). */
export async function materialPaidOrigin(material: MaterialRow, invoices: InvoiceRow[], charges: ChargeRow[]): Promise<PaidOrigin | null> {
  // 1) cobro del proveedor pagado que incluya el material
  const charge = charges.find((c) => {
    if (c.status !== 'pagada') return false
    try { return (JSON.parse(c.materialIds || '[]') as string[]).includes(material.id) } catch { return false }
  })
  if (charge) {
    const payment = await db.payment.findFirst({ where: { chargeId: charge.id, status: { in: ['approved', 'confirmado'] } }, orderBy: { createdAt: 'desc' } })
    const method = (charge.method || payment?.method || null) as PaidOrigin['paymentMethod']
    return {
      chargeId: charge.id,
      invoiceId: null,
      paymentMethod: method,
      mpPaymentId: method === 'mercadopago' ? (charge.mpPaymentId || payment?.mpPaymentId || null) : null,
      paidAt: payment?.confirmedAt || charge.paidAt || payment?.createdAt || null,
      paidAmount: payment?.amount ?? charge.amount,
      serviceFee: method === 'mercadopago' ? charge.serviceFee : 0,
      refundedAmount: payment?.refundedAmount ?? 0,
    }
  }
  // 2) factura pagada que incluyó el material (invoicedAt ≈ issuedAt)
  if (!material.invoicedAt) return null
  const paid = invoices
    .filter((i) => i.status === 'pagada')
    .sort((a, b) => Math.abs(a.issuedAt.getTime() - material.invoicedAt!.getTime()) - Math.abs(b.issuedAt.getTime() - material.invoicedAt!.getTime()))
  const invoice = paid.find((i) => i.issuedAt.getTime() >= material.invoicedAt!.getTime() - 5 * 60_000) || paid[0]
  if (!invoice) return null
  const payment = await db.payment.findFirst({ where: { invoiceId: invoice.id, status: { in: ['approved', 'confirmado'] } }, orderBy: { createdAt: 'desc' } })
  const method = (invoice.paymentMethod || payment?.method || null) as PaidOrigin['paymentMethod']
  return {
    chargeId: null,
    invoiceId: invoice.id,
    paymentMethod: method,
    mpPaymentId: method === 'mercadopago' ? (invoice.mpPaymentId || payment?.mpPaymentId || null) : null,
    paidAt: payment?.confirmedAt || invoice.paidAt || payment?.createdAt || null,
    paidAmount: payment?.amount ?? invoice.total,
    serviceFee: method === 'mercadopago' ? invoice.serviceFee : 0,
    refundedAmount: payment?.refundedAmount ?? 0,
  }
}

/** Vendedor de la pata "cliente" según el pago de origen: factura del profesional → profesional; cobro/compra → proveedor. */
export function sellerKindOf(origin: Pick<PaidOrigin, 'invoiceId'>): 'proveedor' | 'profesional' {
  return origin.invoiceId ? 'profesional' : 'proveedor'
}

type ProLegMaterial = { id: string; status: string; providerId: string | null; elementId: string | null; invoicedAt: Date | null; updatedAt: Date }
type ProLegCharge = { status: string; materialIds: string }

/**
 * Pata profesional → proveedor: ¿el profesional le compró este material al proveedor?
 * Sí cuando está aprobado, tiene proveedor y elemento, y NO lo pagó el cliente al proveedor
 * con un cobro (modo cliente_paga_proveedor): o el proyecto está en modo pro_adelanta o el
 * material ya se facturó al cliente. Plazo: 30 días desde que lo facturó al cliente o, si
 * todavía no lo facturó, desde la última actualización del material (su aprobación).
 */
export function proLegStatus(m: ProLegMaterial, project: { materialsPaymentMode: string }, charges: ProLegCharge[]): { ok: true; since: Date } | { ok: false; reason: string } {
  if (m.status !== 'aprobado') return { ok: false, reason: 'no está aprobado en el proyecto' }
  if (!m.providerId) return { ok: false, reason: 'no tiene proveedor asignado' }
  if (!m.elementId) return { ok: false, reason: 'no tiene elemento de catálogo asociado' }
  const paidByClient = charges.some((c) => {
    if (c.status === 'anulada' || c.status === 'cancelada') return false
    try { return (JSON.parse(c.materialIds || '[]') as string[]).includes(m.id) } catch { return false }
  })
  if (paidByClient) return { ok: false, reason: 'lo paga el cliente directo al proveedor: la devolución la pide el cliente' }
  if (project.materialsPaymentMode !== 'pro_adelanta' && !m.invoicedAt) return { ok: false, reason: 'en este proyecto el cliente paga los materiales al proveedor' }
  const since = m.invoicedAt ?? m.updatedAt
  if (!withinReturnWindow(since)) return { ok: false, reason: `pasaron más de ${RETURN_WINDOW_DAYS} días` }
  return { ok: true, since }
}

export function withinReturnWindow(paidAt: Date | null): boolean {
  if (!paidAt) return false
  return Date.now() - paidAt.getTime() <= RETURN_WINDOW_DAYS * 86400000
}

export function round2(n: number) {
  return Math.round(n * 100) / 100
}
