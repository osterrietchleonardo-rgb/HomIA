// Sobrantes — reglas compartidas entre POST /api/returns, GET /api/returns/eligible
// y PATCH /api/returns/[id]. Un pedido de devolución agrupa ítems pagados a UN solo
// proveedor; el reembolso vuelve por el mismo medio con el que se pagó.
// Si el pago fue por Mercado Pago e incluyó el cargo de servicio HomIA (1%), se
// reembolsa solo el precio de los ítems devueltos: el cargo de servicio no se devuelve.
import { db } from '@/lib/db'

export const RETURN_WINDOW_DAYS = 30
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
 *  ítem de compra (carrito, multi-ítem) o una compra histórica de un solo ítem. */
export async function alreadyReturnedQty(key: { materialId?: string | null; purchaseId?: string | null; purchaseItemId?: string | null }, excludeReturnId?: string): Promise<number> {
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
      return: { status: { in: RETURN_ACTIVE_STATUSES }, ...(excludeReturnId ? { id: { not: excludeReturnId } } : {}) },
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

export function withinReturnWindow(paidAt: Date | null): boolean {
  if (!paidAt) return false
  return Date.now() - paidAt.getTime() <= RETURN_WINDOW_DAYS * 86400000
}

export function round2(n: number) {
  return Math.round(n * 100) / 100
}
