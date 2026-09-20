import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { createChargePreference, mpConfigured } from '@/lib/mercadopago'

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
  return ok({
    charge: {
      ...charge,
      project: charge.project || null, // null → venta directa (compra sin proyecto)
      provider: {
        id: charge.provider.id,
        businessName: charge.provider.businessName,
        displayName: charge.provider.user.displayName,
        email: charge.provider.user.email,
      },
      client: charge.client,
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
  if (!d.method) return fail('Elegí el método de pago: mercadopago o efectivo')

  if (d.method === 'efectivo') {
    await db.providerCharge.update({
      where: { id: charge.id },
      data: { status: 'acordada_efectivo', method: 'efectivo' },
    })
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

  // Mercado Pago
  if (!mpConfigured()) {
    return fail('Mercado Pago no está configurado. Agregá MP_ACCESS_TOKEN en el archivo .env del servidor.', 503, { needsConfig: true })
  }
  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const preference = await createChargePreference({
    chargeId: charge.id,
    chargeNumber: charge.number,
    title: titulo,
    total: charge.amount,
    payerEmail: user.email,
    baseUrl,
  })
  await db.providerCharge.update({
    where: { id: charge.id },
    data: { mpPreferenceId: preference.id, method: 'mercadopago' },
  })
  return ok({ initPoint: preference.initPoint, preferenceId: preference.id })
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
    data: { status: 'pagada', method: 'efectivo', paidAt: new Date() },
  })
  // si el cobro nació de una compra directa, la compra queda pagada → habilita reseña
  if (charge.projectId == null) {
    await db.purchase.updateMany({ where: { chargeId: charge.id }, data: { status: 'pagado' } })
  }
  await db.notification.create({
    data: {
      userId: charge.clientId,
      type: 'cobro_efectivo_confirmado',
      title: 'Cobro en efectivo confirmado',
      body: `El proveedor confirmó que cobró ${charge.number} en efectivo. Quedó registrado como pagado.`,
      link: charge.projectId ? `#/panel/cliente/proyectos/${charge.projectId}` : '#/panel/cliente/materiales?tab=compras',
    },
  })
  return ok({ success: true, status: 'pagada' })
}
