import { NextRequest } from 'next/server'
import { ok, fail, appUrl } from '@/lib/api'
import { db } from '@/lib/db'
import { createSellerPreference } from '@/lib/mercadopago'
import { serviceFeeFor, totalWithMp } from '@/lib/fees'
import { sellerTokenOr503, mpDown } from '@/lib/seller-pay'
import { logActivity } from '@/lib/activity'
import { fmt } from '@/lib/orders'

// GET: detalle de factura
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const invoice = await db.invoice.findUnique({
    where: { id },
    include: { items: true, project: { select: { id: true, title: true } }, payments: true },
  })
  if (!invoice) return fail('Factura no encontrada', 404)
  const client = await db.user.findUnique({ where: { id: invoice.clientId }, select: { id: true, displayName: true, email: true } })
  const pro = await db.professionalProfile.findUnique({
    where: { id: invoice.professionalId },
    include: { user: { select: { displayName: true, email: true } } },
  })
  // permiso: solo las partes de la factura (cliente o profesional)
  const isClient = user.id === invoice.clientId
  const isPro = pro ? user.id === pro.userId : false
  if (!isClient && !isPro) return fail('No tenés acceso a esta factura', 403)
  return ok({
    invoice: { ...invoice, mpServiceFee: serviceFeeFor(invoice.total) },
    client,
    professional: pro
      ? {
          displayName: pro.user.displayName,
          companyName: pro.companyName,
          email: pro.user.email,
          // solo el estado: los tokens OAuth nunca salen al navegador
          mpConnected: pro.mpOauthStatus === 'connected' && !!pro.mpOauthAccessToken,
        }
      : null,
  })
}

// POST: iniciar pago con Mercado Pago → devuelve init_point para redirigir.
// La preferencia se crea con el token del PROFESIONAL (la plata va a su cuenta)
// y suma el cargo de servicio HomIA (1%) que paga el cliente.
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const invoice = await db.invoice.findUnique({ where: { id }, include: { items: true, project: { select: { title: true } } } })
  if (!invoice) return fail('Factura no encontrada', 404)
  if (invoice.clientId !== user.id) return fail('Solo el cliente paga la factura', 403)
  if (invoice.status === 'pagada') return fail('La factura ya está pagada')

  const pro = await db.professionalProfile.findUnique({
    where: { id: invoice.professionalId },
    include: { user: { select: { displayName: true } } },
  })
  if (!pro) return fail('El profesional de esta factura ya no existe', 409)
  const tk = await sellerTokenOr503(pro, 'professional', pro.companyName || pro.user.displayName)
  if (tk.error) return tk.error

  const fee = serviceFeeFor(invoice.total)
  // ítems reales de la factura (mano de obra y materiales); si no hay, uno solo por el total
  const items = invoice.items.length
    ? invoice.items.map((i) => ({ id: i.id, title: i.kind === 'mano_obra' ? `Mano de obra — ${invoice.project.title}` : i.description, quantity: i.quantity, unitPrice: i.unitPrice }))
    : [{ id: invoice.id, title: `Factura ${invoice.number}`, quantity: 1, unitPrice: invoice.total }]
  // si la suma de los ítems no coincide con el total (redondeos), va una sola línea por el total
  const sum = items.reduce((a, i) => a + Math.round(i.unitPrice * i.quantity * 100) / 100, 0)
  const prefItems = Math.abs(sum - invoice.total) <= 0.01 ? items : [{ id: invoice.id, title: `Factura ${invoice.number}`, quantity: 1, unitPrice: invoice.total }]

  let preference: { id: string; initPoint: string }
  try {
    preference = await createSellerPreference({
      kind: 'invoice',
      id: invoice.id,
      items: prefItems,
      serviceFee: fee,
      payerEmail: user.email,
      baseUrl: appUrl(),
      sellerAccessToken: tk.token,
      backPath: '/panel/cliente/facturas',
    })
  } catch (e) {
    console.error('[invoices] createSellerPreference', e)
    return mpDown()
  }

  // si el cliente había acordado pagar en efectivo y ahora elige Mercado Pago,
  // el acuerdo de efectivo se cancela (solo puede liquidarse por un método).
  // Recién acá: si MP no está disponible, el acuerdo de efectivo sigue en pie.
  await db.payment.deleteMany({
    where: { invoiceId: invoice.id, method: 'efectivo', status: 'acordado' },
  })

  await db.invoice.update({ where: { id }, data: { mpPreferenceId: preference.id, paymentMethod: 'mercadopago', serviceFee: fee } })
  await logActivity({
    projectId: invoice.projectId, actorId: user.id, actorRole: 'cliente', type: 'pago_mp_iniciado',
    message: `${user.displayName} inició el pago de la factura ${invoice.number} con Mercado Pago: ${fmt(invoice.total)} + cargo de servicio ${fmt(fee)}.`,
  })
  return ok({ initPoint: preference.initPoint, preferenceId: preference.id, serviceFee: fee, totalMp: totalWithMp(invoice.total) })
}
