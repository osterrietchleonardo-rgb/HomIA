import { NextRequest } from 'next/server'
import { ok, fail, body, appUrl, parseJson } from '@/lib/api'
import { db } from '@/lib/db'
import { createSellerPreference } from '@/lib/mercadopago'
import { serviceFeeFor, totalWithMp } from '@/lib/fees'
import { sellerTokenOr503, mpDown } from '@/lib/seller-pay'
import { logActivity } from '@/lib/activity'
import { fmt } from '@/lib/orders'
import { LEGACY_PREFIX } from '@/lib/order-view'

// GET: detalle de un cobro (partes del proyecto: cliente o proveedor dueño)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const charge = await db.providerCharge.findUnique({
    where: { id },
    include: {
      project: { select: { id: true, title: true, materialsPaymentMode: true } },
      provider: { include: { user: { select: { displayName: true, email: true } } } },
      client: { select: { id: true, displayName: true, email: true } },
    },
  })
  if (!charge) return fail('Cobro no encontrado', 404)
  if (charge.clientId !== user.id && charge.provider.userId !== user.id) {
    return fail('No tenés acceso a este cobro', 403)
  }
  // los tokens OAuth nunca salen al navegador: solo si el proveedor cobra por MP
  const { mpOauthAccessToken, mpOauthStatus } = charge.provider
  return ok({
    charge: {
      ...charge,
      project: charge.project || null, // null → venta directa (compra sin proyecto)
      provider: {
        id: charge.provider.id,
        businessName: charge.provider.businessName,
        displayName: charge.provider.user.displayName,
        email: charge.provider.user.email,
        mpConnected: mpOauthStatus === 'connected' && !!mpOauthAccessToken,
      },
      client: charge.client,
      mpServiceFee: serviceFeeFor(charge.amount),
    },
  })
}

// POST: el cliente liquida el cobro del proveedor.
//   method=mercadopago → preferencia de pago real; el webhook confirma.
//   method=efectivo    → queda acordado; el proveedor confirma cuando cobra.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const charge = await db.providerCharge.findUnique({
    where: { id },
    include: {
      project: { select: { title: true } },
      provider: { include: { user: { select: { displayName: true } } } },
    },
  })
  if (!charge) return fail('Cobro no encontrado', 404)
  if (charge.clientId !== user.id) return fail('Solo el cliente paga este cobro', 403)
  if (charge.status !== 'pendiente') return fail('Este cobro ya no está pendiente')
  const titulo = charge.project ? `Materiales — ${charge.project.title}` : 'Compra de materiales — HomIA'

  const d = await body<{ method?: 'mercadopago' | 'efectivo' }>(req)
  if (d.method !== 'mercadopago' && d.method !== 'efectivo') return fail('Elegí el método de pago: mercadopago o efectivo')

  if (d.method === 'efectivo') {
    // en efectivo no hay cargo de servicio
    await db.providerCharge.update({
      where: { id: charge.id },
      data: { status: 'acordada_efectivo', method: 'efectivo', serviceFee: 0 },
    })
    if (charge.projectId) {
      await logActivity({ projectId: charge.projectId, actorId: user.id, actorRole: 'cliente', type: 'cobro_efectivo_acordado', message: `${user.displayName} acordó pagar el cobro ${charge.number} (${fmt(charge.amount)}) en efectivo.` })
    }
    await db.notification.create({
      data: {
        userId: charge.provider.userId,
        type: 'cobro_efectivo_acordado',
        title: 'Pago en efectivo acordado',
        body: `El cliente acordó pagar tu cobro ${charge.number} en efectivo. Confirmá cuando recibas el dinero.`,
        link: '#/panel/proveedor/cobros',
      },
    })
    return ok({ method: 'efectivo', status: 'acordada_efectivo' })
  }

  // Mercado Pago: con el token del PROVEEDOR (la plata va a su cuenta) + cargo de servicio 1%
  const tk = await sellerTokenOr503(charge.provider, 'provider', charge.provider.businessName)
  if (tk.error) return tk.error
  const fee = serviceFeeFor(charge.amount)
  let preference: { id: string; initPoint: string }
  try {
    preference = await createSellerPreference({
      kind: 'charge',
      id: charge.id,
      items: [{ id: charge.id, title: `${titulo} (${charge.number})`, quantity: 1, unitPrice: charge.amount }],
      serviceFee: fee,
      payerEmail: user.email,
      baseUrl: appUrl(),
      sellerAccessToken: tk.token,
      backPath: charge.projectId ? `/panel/cliente/proyectos/${charge.projectId}` : '/panel/cliente/pedidos',
    })
  } catch (e) {
    console.error('[charges] createSellerPreference', e)
    return mpDown()
  }
  await db.providerCharge.update({
    where: { id: charge.id },
    data: { mpPreferenceId: preference.id, method: 'mercadopago', serviceFee: fee },
  })
  if (charge.projectId) {
    await logActivity({ projectId: charge.projectId, actorId: user.id, actorRole: 'cliente', type: 'pago_mp_iniciado', message: `${user.displayName} inició el pago del cobro ${charge.number} con Mercado Pago: ${fmt(charge.amount)} + cargo de servicio ${fmt(fee)}.` })
  }
  return ok({ initPoint: preference.initPoint, preferenceId: preference.id, serviceFee: fee, totalMp: totalWithMp(charge.amount) })
}

// PATCH: el proveedor confirma que cobró el efectivo acordado
export async function PATCH(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const charge = await db.providerCharge.findUnique({
    where: { id },
    include: { provider: { select: { userId: true } }, project: { select: { title: true } } },
  })
  if (!charge) return fail('Cobro no encontrado', 404)
  if (charge.provider.userId !== user.id) return fail('Solo el proveedor confirma el cobro', 403)
  if (charge.status === 'pagada') return fail('Este cobro ya está pagado')
  if (charge.status !== 'acordada_efectivo') {
    return fail('Solo se confirma un cobro con efectivo acordado')
  }

  await db.providerCharge.update({
    where: { id: charge.id },
    data: { status: 'pagada', method: 'efectivo', paidAt: new Date(), serviceFee: 0 },
  })
  // si el cobro nació de una compra (sub-pedido), la compra queda pagada → habilita reseña
  // (Purchase no tiene paidAt: la fecha de cobro vive en charge.paidAt)
  let link = charge.projectId ? `#/panel/cliente/proyectos/${charge.projectId}` : '#/panel/cliente/pedidos'
  if (charge.projectId == null) {
    const p = await db.purchase.findFirst({
      where: { chargeId: charge.id },
      select: { id: true, orderId: true, client: { select: { roles: true } } },
    })
    await db.purchase.updateMany({
      where: { chargeId: charge.id, status: { notIn: ['cancelado', 'rechazado'] } },
      data: { status: 'pagado', paymentMethod: 'efectivo', serviceFee: 0 },
    })
    if (p) {
      const panel = parseJson<string[]>(p.client.roles, []).includes('cliente') ? 'cliente' : 'profesional'
      link = `#/panel/${panel}/pedidos/${p.orderId || `${LEGACY_PREFIX}${p.id}`}`
      await logActivity({ orderId: p.orderId, purchaseId: p.id, actorId: user.id, actorRole: 'proveedor', type: 'pagado', message: `${user.displayName} confirmó que cobró ${fmt(charge.amount)} en efectivo.` })
    }
  } else {
    await logActivity({ projectId: charge.projectId, actorId: user.id, actorRole: 'proveedor', type: 'pagado', message: `${user.displayName} confirmó que cobró ${charge.number} (${fmt(charge.amount)}) en efectivo.` })
  }
  await db.notification.create({
    data: {
      userId: charge.clientId,
      type: 'cobro_efectivo_confirmado',
      title: 'Cobro en efectivo confirmado',
      body: `El proveedor confirmó que cobró ${charge.number} en efectivo. Quedó registrado como pagado.`,
      link,
    },
  })
  return ok({ success: true, status: 'pagada' })
}
