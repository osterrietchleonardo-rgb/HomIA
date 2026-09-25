import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPayment, cancelPreapproval, verifyWebhookSignature, ensureFreshSellerToken, refundPayment, type MpPaymentInfo } from '@/lib/mercadopago'
import { planTransicion } from '@/lib/plans'
import { round2, serviceFeeFor } from '@/lib/fees'
import { logActivity } from '@/lib/activity'
import { parseJson } from '@/lib/api'
import { notificar, notificarVarios } from '@/lib/notify'
import { registrarEvento } from '@/lib/analytics/server'
import { procesarAvisoSuscripcion, registrarCobroPorPago, registrarActivacion, registrarEventoPlan, traerPreapproval, aplicarBajaSuscripcion, MpSubError } from '@/lib/suscripciones-mp'

// Webhook de Mercado Pago (Checkout Pro + Suscripciones).
// Confirma pagos de facturas de proyecto (invoice:<id>, o <invoiceId> histórico),
// cobros de materiales (charge:<id>), compras/sub-pedidos (purchase:<id>) y
// suscripciones de proveedor (plan:provider:<providerId>:<basic|pro>).
//
// Desde el carrito (2026-09) facturas, cobros y compras se cobran con el token
// OAuth del VENDEDOR: la notification_url trae ?ref=<tipo>:<id> para consultar
// el pago con el token de quien cobró (profesional o proveedor). El monto
// esperado es subtotal + cargo de servicio HomIA (1%), ±1 peso.
//
// Reglas:
//  · firma x-signature verificada contra MP_WEBHOOK_SECRET o MP_SUB_WEBHOOK_SECRET
//    (si no valida se loguea y se sigue: la confianza está en re-consultar el pago a MP);
//  · solo `payment` y `subscription_preapproval`; el resto → 200 sin acción;
//  · nunca se marca pagado si la moneda no es ARS o el monto no cuadra (±1 peso):
//    queda registrado como `monto_invalido`;
//  · lo que ya estaba pagado no se toca (reintentos de MP son idempotentes);
//  · error de MP (red/404) → 200 `deferred` (MP reintenta solo); error de DB → 500.
export const maxDuration = 60

const AMOUNT_TOLERANCE = 1

/** Error al consultar a Mercado Pago (red, 404, token): no es culpa nuestra. */
class MpFetchError extends Error {
  constructor(message: string, readonly cause?: unknown) {
    super(message)
    this.name = 'MpFetchError'
  }
}

async function mpCall<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn()
  } catch (e) {
    throw new MpFetchError(e instanceof Error ? e.message : 'Error consultando Mercado Pago', e)
  }
}

type WebhookBody = {
  type?: string
  topic?: string
  action?: string
  live_mode?: boolean
  data?: { id?: string | number }
  id?: string | number
}

function amountMatches(paid: number, expected: number): boolean {
  return Number.isFinite(paid) && Number.isFinite(expected) && Math.abs(paid - expected) <= AMOUNT_TOLERANCE
}

function amountValid(payment: MpPaymentInfo, expected: number): boolean {
  return payment.currencyId === 'ARS' && amountMatches(payment.transactionAmount, expected)
}

/** Monto esperado de un pago MP = subtotal + cargo de servicio HomIA (1%).
 *  También se acepta el subtotal solo: preferencias creadas antes del cargo. */
function feeAwareValid(payment: MpPaymentInfo, subtotal: number, storedFee: number): boolean {
  const withFee = round2(subtotal + (storedFee > 0 ? storedFee : serviceFeeFor(subtotal)))
  return amountValid(payment, withFee) || amountValid(payment, subtotal)
}

/** Cargo efectivamente cobrado (lo pagado menos el subtotal), nunca negativo. */
function paidFee(payment: MpPaymentInfo, subtotal: number): number {
  return Math.max(0, round2(payment.transactionAmount - subtotal))
}

/** Registro idempotente del pago por `mpPaymentId` (factura, cobro o compra).
 *  Si el monto/moneda no cuadra, queda con status `monto_invalido`. */
async function recordPayment(
  payment: MpPaymentInfo,
  target: { invoiceId?: string; chargeId?: string; purchaseId?: string },
  valid: boolean,
  collector: 'vendedor' | 'plataforma'
) {
  const status = valid ? payment.status : 'monto_invalido'
  await db.payment.upsert({
    where: { mpPaymentId: payment.id },
    create: {
      invoiceId: target.invoiceId ?? null,
      chargeId: target.chargeId ?? null,
      purchaseId: target.purchaseId ?? null,
      method: 'mercadopago',
      mpPaymentId: payment.id,
      collector,
      status,
      amount: payment.transactionAmount,
      refundedAmount: payment.transactionAmountRefunded ?? 0,
      mpApplicationFee: payment.applicationFee ?? null,
      mpApprovedAt: payment.approvedAt ?? null,
    },
    update: {
      status,
      amount: payment.transactionAmount,
      refundedAmount: payment.transactionAmountRefunded ?? 0,
      ...(payment.applicationFee != null ? { mpApplicationFee: payment.applicationFee } : {}),
      ...(payment.approvedAt ? { mpApprovedAt: payment.approvedAt } : {}),
    },
  })
}

export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const bodyData = (await req.json().catch(() => ({}))) as WebhookBody

  // (b) tipo de notificación
  const rawType = String(bodyData.type || sp.get('type') || bodyData.topic || sp.get('topic') || '').toLowerCase()
  const type: 'payment' | 'subscription_preapproval' | 'subscription_authorized_payment' | null =
    rawType === 'payment' ? 'payment' : rawType === 'subscription_preapproval' ? 'subscription_preapproval'
      : rawType === 'subscription_authorized_payment' ? 'subscription_authorized_payment' : null
  if (!type) return NextResponse.json({ received: true, ignored: true })

  // (c) firma
  const dataIdQuery = sp.get('data.id') || sp.get('id')
  const dataId = dataIdQuery || (bodyData.data?.id != null ? String(bodyData.data.id) : null)
  const secrets = [process.env.MP_WEBHOOK_SECRET, process.env.MP_SUB_WEBHOOK_SECRET].filter(
    (s): s is string => typeof s === 'string' && s.length > 0
  )
  if (secrets.length === 0) {
    console.warn('[mp webhook] sin MP_WEBHOOK_SECRET ni MP_SUB_WEBHOOK_SECRET: se acepta sin verificar firma')
  } else {
    const valid = verifyWebhookSignature({
      xSignature: req.headers.get('x-signature'),
      xRequestId: req.headers.get('x-request-id'),
      dataId: dataIdQuery || dataId,
      secrets,
    })
    // La firma es defensa en profundidad: el pago SIEMPRE se re-consulta a
    // Mercado Pago con nuestro token y se valida monto, moneda y referencia, así
    // que un aviso falso no puede marcar nada como pagado. MP no firma con la
    // clave de la app las notificaciones de `notification_url` de preferencias
    // ni las de usuarios de prueba: rechazarlas perdería pagos reales.
    if (!valid) {
      console.warn('[mp webhook] firma no verificada; se sigue con verificación contra la API de MP', {
        tieneFirma: !!req.headers.get('x-signature'),
        requestId: req.headers.get('x-request-id'),
        dataId,
        type,
      })
    }
  }

  if (!dataId) return NextResponse.json({ received: true })

  // D30: cobro mensual de una suscripción de proveedor (evento "Planes y suscripciones" →
  // subscription_authorized_payment). Se re-consulta a MP y se guarda en SubscriptionCharge
  // (idempotente por mpPaymentId). Nunca 200 si no quedó guardado: 503 para que MP reintente.
  if (type === 'subscription_authorized_payment') {
    const r = await procesarAvisoSuscripcion(String(dataId))
    if (r.status !== 200) console.error('[mp webhook] cobro de suscripción sin guardar: MP reintenta', { dataId, motivo: r.body.motivo })
    return NextResponse.json(r.body, { status: r.status })
  }

  // (d) entorno del pago
  const live = bodyData.live_mode !== false

  try {
    if (type === 'payment') {
      await handlePayment(String(dataId), live, sp.get('ref'))
    } else {
      await handlePreapproval(String(dataId), live)
    }
    return NextResponse.json({ received: true })
  } catch (e) {
    if (e instanceof MpFetchError) {
      // (g) MP no respondió / 404: devolvemos 200 para que MP reintente con su
      // propio backoff y no nos martille por un bug o un pago ajeno.
      console.error('[mp webhook] error consultando Mercado Pago:', e.message)
      return NextResponse.json({ received: true, deferred: true })
    }
    console.error('[mp webhook] error de base de datos:', e)
    return NextResponse.json({ received: false }, { status: 500 })
  }
}

// ─────────────────────────── PAGOS ───────────────────────────

type SellerToken = { token: string | null; kind: 'purchase' | 'charge' | 'invoice'; id: string }

/** Token del vendedor que cobró según la referencia (proveedor o profesional). */
async function sellerTokenFor(ref: string): Promise<SellerToken | null> {
  const [kind, id] = ref.split(':')
  if (!id) return null
  if (kind === 'purchase') {
    const p = await db.purchase.findUnique({ where: { id }, select: { provider: { select: { mpOauthAccessToken: true } } } })
    return p ? { token: p.provider.mpOauthAccessToken, kind, id } : null
  }
  if (kind === 'charge') {
    const c = await db.providerCharge.findUnique({ where: { id }, select: { provider: { select: { mpOauthAccessToken: true } } } })
    return c ? { token: c.provider.mpOauthAccessToken, kind, id } : null
  }
  if (kind === 'invoice') {
    const i = await db.invoice.findUnique({ where: { id }, select: { professionalId: true } })
    if (!i) return null
    const pro = await db.professionalProfile.findUnique({ where: { id: i.professionalId }, select: { mpOauthAccessToken: true } })
    return { token: pro?.mpOauthAccessToken ?? null, kind, id }
  }
  return null
}

async function applyByRef(ref: string, payment: MpPaymentInfo, collector: 'vendedor' | 'plataforma') {
  if (ref.startsWith('purchase:')) {
    const purchase = await findPurchaseWithProvider(ref.slice('purchase:'.length))
    if (purchase) await applyPurchasePayment(purchase, payment, collector)
    return
  }
  if (ref.startsWith('charge:')) {
    await applyChargePayment(ref.slice('charge:'.length), payment, collector)
    return
  }
  // formato histórico: external_reference = <invoiceId>
  const invoiceId = ref.startsWith('invoice:') ? ref.slice('invoice:'.length) : ref
  await applyInvoicePayment(invoiceId, payment, collector)
}

async function handlePayment(paymentId: string, live: boolean, refHint: string | null) {
  // Pista en la notification_url (?ref=<tipo>:<id>): los pagos los cobra el
  // vendedor, así que se consultan con SU token (el de la plataforma no los ve).
  if (refHint && /^(purchase|charge|invoice):/.test(refHint)) {
    const seller = await sellerTokenFor(refHint)
    if (seller?.token) {
      console.info('[mp webhook] consultando el pago con el token del vendedor', { ref: refHint, paymentId })
      const payment = await mpCall(() => getPayment(paymentId, { accessToken: seller.token, live }))
      if (payment.externalReference === refHint) {
        await applyByRef(refHint, payment, 'vendedor')
        return
      }
      console.error('[mp webhook] la referencia del pago no coincide con la pista', { refHint, ext: payment.externalReference })
      return
    }
    console.warn('[mp webhook] el vendedor de la pista no tiene Mercado Pago conectado: se intenta con el token de la plataforma', { ref: refHint })
  }

  // Sin pista (preferencias históricas con token de la plataforma). Algunos avisos
  // (formato IPN `?topic=payment&id=`) no traen `live_mode`: si el pago no aparece
  // en el entorno supuesto, se busca en el otro (prueba ↔ producción).
  const payment = await mpCall(() => getPayment(paymentId, { live })).catch(async (e) => {
    if (!process.env.MP_TEST_ACCESS_TOKEN) throw e
    return mpCall(() => getPayment(paymentId, { live: !live }))
  })
  const ref = payment.externalReference
  if (!ref) return
  // D30: pago de una suscripción de proveedor (plan:provider:…) → registro del cobro con el token de Suscripciones
  if (ref.startsWith('plan:provider:')) {
    await registrarCobroPorPago(paymentId)
    return
  }

  if (ref.startsWith('purchase:')) {
    // el pago tiene que existir en la cuenta del proveedor (es quien cobra)
    const seller = await sellerTokenFor(ref)
    if (!seller?.token) {
      console.error('[mp webhook] compra sin proveedor conectado a MP', ref)
      return
    }
    const sellerPayment = await mpCall(() => getPayment(paymentId, { accessToken: seller.token, live }))
    await applyByRef(ref, sellerPayment, 'vendedor')
    return
  }
  await applyByRef(ref, payment, 'plataforma')
}

function findPurchaseWithProvider(purchaseId: string) {
  return db.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      provider: { select: { id: true, userId: true, businessName: true, mpOauthAccessToken: true, mpOauthRefreshToken: true, mpOauthExpiresAt: true, mpOauthStatus: true } },
      client: { select: { roles: true } },
    },
  })
}

type PurchaseWithProvider = NonNullable<Awaited<ReturnType<typeof findPurchaseWithProvider>>>

async function applyPurchasePayment(purchase: PurchaseWithProvider, payment: MpPaymentInfo, collector: 'vendedor' | 'plataforma') {
  const valid = feeAwareValid(payment, purchase.total, purchase.serviceFee)
  await recordPayment(payment, { purchaseId: purchase.id, chargeId: purchase.chargeId ?? undefined }, valid, collector)
  if (!valid) {
    console.error('[mp webhook] compra: monto/moneda no cuadra', {
      purchaseId: purchase.id, esperado: round2(purchase.total + purchase.serviceFee), pagado: payment.transactionAmount, moneda: payment.currencyId,
    })
    return
  }
  if (payment.status !== 'approved') return
  if (purchase.status === 'pagado') return // ya estaba pagada: no se toca
  // pago que llegó tarde a una compra ya cancelada (p. ej. venció a las 24 h y el stock se
  // liberó): no se "resucita" la compra — se devuelve el pago completo con el token del proveedor
  if (purchase.status === 'cancelado' || purchase.status === 'rechazado') {
    await refundLatePayment(purchase, payment)
    return
  }

  const fee = paidFee(payment, purchase.total)
  // condicional: dos avisos simultáneos no duplican notificaciones ni eventos
  const upd = await db.purchase.updateMany({
    where: { id: purchase.id, status: { not: 'pagado' } },
    data: { status: 'pagado', paymentMethod: 'mercadopago', mpPaymentId: payment.id, serviceFee: fee },
  })
  if (upd.count === 0) return
  // si la compra tiene un cobro asociado, también queda pagado
  if (purchase.chargeId) {
    await db.providerCharge.updateMany({
      where: { id: purchase.chargeId, status: { not: 'pagada' } },
      data: { status: 'pagada', method: 'mercadopago', mpPaymentId: payment.id, paidAt: new Date(), serviceFee: fee },
    })
  }
  const panel = parseJson<string[]>(purchase.client.roles, []).includes('cliente') ? 'cliente' : 'profesional'
  const orderKey = purchase.orderId || `legacy-${purchase.id}`
  await notificarVarios({
    data: [
      {
        userId: purchase.clientId,
        type: 'compra_pagada_cliente',
        title: 'Pago confirmado',
        body: `El pago de tu pedido a ${purchase.provider.businessName} (${purchase.elementName}) fue aprobado.`,
        link: `#/panel/${panel}/pedidos/${orderKey}`,
      },
      {
        userId: purchase.provider.userId,
        type: 'compra_pagada_prov',
        title: 'Pago aprobado en tu Mercado Pago',
        body: `El cliente pagó el pedido de ${purchase.elementName} con Mercado Pago. Pago aprobado en tu Mercado Pago: Mercado Pago lo libera según tus plazos (lo ves en "Dinero a liberar") y descuenta su comisión. Coordiná la entrega.`,
        link: '#/panel/proveedor/cobros?tab=ventas',
      },
    ],
  })
  await logActivity({
    orderId: purchase.orderId, purchaseId: purchase.id, actorId: null, actorRole: 'sistema', type: 'pagado',
    message: `Mercado Pago aprobó el pago: ${purchase.total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })}${fee > 0 ? ` + cargo de servicio ${fee.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })}` : ''}.`,
    data: { mpPaymentId: payment.id, amount: payment.transactionAmount },
  })
}

async function refundLatePayment(purchase: PurchaseWithProvider, payment: MpPaymentInfo) {
  const panel = parseJson<string[]>(purchase.client.roles, []).includes('cliente') ? 'cliente' : 'profesional'
  const orderKey = purchase.orderId || `legacy-${purchase.id}`
  let ok = false
  try {
    const token = await ensureFreshSellerToken(purchase.provider)
    await refundPayment({ paymentId: payment.id, accessToken: token, idempotencyKey: `purchase-late-${payment.id}` })
    await db.payment.updateMany({ where: { mpPaymentId: payment.id }, data: { refundedAmount: payment.transactionAmount } })
    ok = true
  } catch (e) {
    console.error('[mp webhook] no se pudo devolver el pago tardío de una compra cancelada', purchase.id, payment.id, e)
  }
  const monto = payment.transactionAmount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 2 })
  await db.notification.createMany({
    data: [
      {
        userId: purchase.clientId,
        type: 'compra_pago_devuelto',
        title: ok ? 'Te devolvimos el pago' : 'Pago de una compra cancelada',
        body: ok
          ? `Tu pago de ${monto} llegó cuando la compra de ${purchase.elementName} ya estaba cancelada: Mercado Pago te lo devuelve completo.`
          : `Tu pago de ${monto} llegó cuando la compra de ${purchase.elementName} ya estaba cancelada y no pudimos devolverlo solos: escribile a ${purchase.provider.businessName} para que te lo reintegre.`,
        link: `#/panel/${panel}/pedidos/${orderKey}`,
      },
      {
        userId: purchase.provider.userId,
        type: 'compra_pago_devuelto',
        title: ok ? 'Pago devuelto de una compra cancelada' : 'Devolvé un pago de una compra cancelada',
        body: ok
          ? `Llegó un pago de ${monto} por ${purchase.elementName}, que ya estaba cancelada: se devolvió completo al cliente desde tu Mercado Pago.`
          : `Llegó un pago de ${monto} por ${purchase.elementName}, que ya estaba cancelada, y no pudimos devolverlo automáticamente (revisá tu conexión de Mercado Pago). Devolvéselo al cliente desde tu cuenta.`,
        link: '#/panel/proveedor/cobros?tab=ventas',
      },
    ],
  })
  await logActivity({
    orderId: purchase.orderId, purchaseId: purchase.id, actorId: null, actorRole: 'sistema', type: ok ? 'pago_devuelto' : 'pago_tardio',
    message: ok
      ? `Llegó un pago de ${monto} con la compra ya cancelada: se devolvió completo por Mercado Pago.`
      : `Llegó un pago de ${monto} con la compra ya cancelada y no se pudo devolver automáticamente: el proveedor tiene que reintegrarlo.`,
    data: { mpPaymentId: payment.id, amount: payment.transactionAmount },
  })
}

async function applyChargePayment(chargeId: string, payment: MpPaymentInfo, collector: 'vendedor' | 'plataforma') {
  const charge = await db.providerCharge.findUnique({
    where: { id: chargeId },
    include: { provider: { select: { userId: true } } },
  })
  if (!charge) return

  const valid = feeAwareValid(payment, charge.amount, charge.serviceFee)
  await recordPayment(payment, { chargeId: charge.id }, valid, collector)
  if (!valid) {
    console.error('[mp webhook] cobro: monto/moneda no cuadra', {
      chargeId: charge.id, esperado: round2(charge.amount + charge.serviceFee), pagado: payment.transactionAmount, moneda: payment.currencyId,
    })
    return
  }
  if (payment.status !== 'approved') return
  if (charge.status === 'pagada') return // ya estaba pagado: no se toca

  const fee = paidFee(payment, charge.amount)
  const upd = await db.providerCharge.updateMany({
    where: { id: charge.id, status: { not: 'pagada' } },
    data: { status: 'pagada', method: 'mercadopago', mpPaymentId: payment.id, paidAt: new Date(), serviceFee: fee },
  })
  if (upd.count === 0) return
  // si el cobro nació de una compra directa, la compra queda pagada → habilita reseña
  if (charge.projectId == null) {
    await db.purchase.updateMany({ where: { chargeId: charge.id }, data: { status: 'pagado', paymentMethod: 'mercadopago', serviceFee: fee } })
  } else {
    await logActivity({ projectId: charge.projectId, actorRole: 'sistema', type: 'pagado', message: `Mercado Pago aprobó el pago del cobro ${charge.number}.`, data: { mpPaymentId: payment.id } })
  }
  await notificarVarios({
    data: [
      {
        userId: charge.provider.userId,
        type: 'cobro_pagado',
        title: 'Cobro de materiales pagado',
        body: `El cliente pagó tu cobro ${charge.number} con Mercado Pago. Pago aprobado en tu Mercado Pago: Mercado Pago lo libera según tus plazos (lo ves en "Dinero a liberar") y descuenta su comisión.`,
        link: '#/panel/proveedor/cobros',
      },
      {
        userId: charge.clientId,
        type: 'cobro_pagado',
        title: 'Pago del cobro aprobado',
        body: `Tu pago de ${charge.number} fue aprobado: le llega al proveedor por Mercado Pago.`,
        link: charge.projectId ? `#/panel/cliente/proyectos/${charge.projectId}` : '#/panel/cliente/pedidos',
      },
    ],
  }, { mailSoloA: [charge.provider.userId] })
}

async function applyInvoicePayment(invoiceId: string, payment: MpPaymentInfo, collector: 'vendedor' | 'plataforma') {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) return

  const valid = feeAwareValid(payment, invoice.total, invoice.serviceFee)
  await recordPayment(payment, { invoiceId: invoice.id }, valid, collector)

  if (!valid) {
    console.error('[mp webhook] factura: monto/moneda no cuadra', {
      invoiceId: invoice.id, esperado: round2(invoice.total + invoice.serviceFee), pagado: payment.transactionAmount, moneda: payment.currencyId,
    })
    return
  }
  if (payment.status !== 'approved') return
  if (invoice.status === 'pagada') return // ya estaba pagada: no se toca

  const fee = paidFee(payment, invoice.total)
  const upd = await db.invoice.updateMany({
    where: { id: invoice.id, status: { not: 'pagada' } },
    data: { status: 'pagada', paymentMethod: 'mercadopago', mpPaymentId: payment.id, paidAt: new Date(), serviceFee: fee },
  })
  if (upd.count === 0) return
  await logActivity({ projectId: invoice.projectId, actorRole: 'sistema', type: 'pagado', message: `Mercado Pago aprobó el pago de la factura ${invoice.number}.`, data: { mpPaymentId: payment.id } })
  const pro = await db.professionalProfile.findUnique({
    where: { id: invoice.professionalId },
    select: { userId: true },
  })
  if (pro) {
    await notificar({
      data: {
        userId: pro.userId,
        type: 'factura_pagada',
        title: 'Factura pagada',
        body: `${invoice.number} fue pagada por Mercado Pago. Pago aprobado en tu Mercado Pago: Mercado Pago lo libera según tus plazos (lo ves en "Dinero a liberar") y descuenta su comisión.`,
        link: `#/panel/profesional/proyectos/${invoice.projectId}`,
      },
    })
  }
}

// ─────────────────────────── SUSCRIPCIONES ───────────────────────────

// Único formato válido: "plan:provider:<providerId>:<basic|pro>"
function parsePlanReference(ref: string): { profileId: string; plan: 'basic' | 'pro' } | null {
  const m = /^plan:provider:([^:]+):(basic|pro)$/.exec(ref)
  if (m) return { profileId: m[1], plan: m[2] as 'basic' | 'pro' }
  return null
}

async function handlePreapproval(preapprovalId: string, _live: boolean) {
  void _live
  // Como en pagos: se busca en producción y, si no aparece, en prueba (traerPreapproval). Se consulta
  // con fetch (no con el SDK) para leer también `summarized` / `next_payment_date` (D33) y para que
  // el E2E pueda usar el doble de MP.
  const mp = await mpCall(async () => {
    const r = await traerPreapproval(preapprovalId)
    if (!r) throw new MpSubError('suscripción no encontrada en Mercado Pago', 404)
    return r
  })
  const pre = { id: String(mp.id || preapprovalId), status: String(mp.status || '') }
  const planRef = parsePlanReference(String(mp.external_reference || ''))
  if (!planRef) return

  const prov = await db.providerProfile.findUnique({
    where: { id: planRef.profileId },
    select: { id: true, userId: true, subscription: true, mpPreapprovalId: true, trialEndsAt: true, createdAt: true, planPaidUntil: true },
  })
  if (!prov) return

  // D33: cancelada / pausada → misma función que el cron y "Cancelar suscripción" en HomIA: con
  // período pago vigente conserva el plan hasta `planPaidUntil`; sin período pago vuelve a la prueba.
  if (pre.status === 'cancelled' || pre.status === 'paused') {
    const r = await aplicarBajaSuscripcion({ providerId: prov.id, preapprovalId: pre.id, status: pre.status, motivo: 'webhook', source: 'webhook', pre: mp })
    if (r.kind !== 'ignorar' && r.aplicado) {
      registrarEvento(null, { name: 'plan_degradado', userId: prov.userId, path: '/panel/proveedor/plan', props: { desde: prov.subscription, motivo: r.kind === 'programar_baja' ? 'mercadopago_con_periodo_pago' : 'mercadopago' } })
    }
    return
  }

  // Qué hacer lo decide `planTransicion` (lib/plans, pura y compartida con el
  // cron de reconciliación). Acá solo se aplica contra la base y Mercado Pago.
  const t = planTransicion(prov, pre, planRef.plan)
  if (t.kind !== 'activar') return

  {
    // D30: el movimiento del plan se registra ANTES del update (idempotente por dedupeKey): si el
    // update falla, el reintento de MP lo vuelve a intentar sin duplicarlo.
    await registrarActivacion({ providerId: prov.id, anterior: prov.subscription, nuevo: planRef.plan, preapprovalId: pre.id, trialEndsAt: prov.trialEndsAt, source: 'webhook' })
    // Update condicional (idempotente ante avisos duplicados/concurrentes): si
    // otro aviso ya dejó este plan con esta suscripción, no se notifica de nuevo.
    const upd = await db.providerProfile.updateMany({
      where: {
        id: prov.id,
        OR: [
          { subscription: { not: t.data.subscription } },
          { mpPreapprovalId: { not: t.data.mpPreapprovalId } },
          { mpPreapprovalId: null },
        ],
      },
      data: t.data,
    })
    // Cambio de plan: recién ahora que la nueva está autorizada se cancela la
    // vieja. Se hace DESPUÉS de guardar la nueva como vigente: así el aviso
    // `cancelled` de la vieja (que MP manda enseguida) ya no coincide con la
    // vigente y no degrada al proveedor mientras paga.
    if (t.cancelarAnterior) {
      try {
        await cancelPreapproval(t.cancelarAnterior)
        await registrarEventoPlan({ providerId: prov.id, type: 'reemplazada', fromPlan: prov.subscription, mpPreapprovalId: t.cancelarAnterior, dedupeKey: `reemp:${t.cancelarAnterior}`, occurredAt: new Date(), source: 'webhook', motivo: 'cambio de plan' })
        console.info('[mp webhook] suscripción anterior cancelada por cambio de plan', { vieja: t.cancelarAnterior, nueva: pre.id })
      } catch (e) {
        console.error('[mp webhook] no se pudo cancelar la suscripción anterior', t.cancelarAnterior, e)
      }
    }
    if (upd.count > 0 && t.notificacion) {
      await db.notification.create({ data: { userId: prov.userId, ...t.notificacion } })
    }
    // métricas (D27): cambio de plan efectivo (idempotente: solo si el update cambió algo)
    if (upd.count > 0) registrarEvento(null, { name: 'plan_activado', userId: prov.userId, path: '/panel/proveedor/plan', props: { desde: prov.subscription, hacia: t.data.subscription ?? null } })
  }
}
