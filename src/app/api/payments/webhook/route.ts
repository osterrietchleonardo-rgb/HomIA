import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getPayment, getPreapproval, verifyWebhookSignature, type MpPaymentInfo } from '@/lib/mercadopago'

// Webhook de Mercado Pago (Checkout Pro + Suscripciones).
// Confirma pagos de facturas de proyecto (external_reference = <invoiceId>),
// cobros de materiales (charge:<id>), compras directas (purchase:<id>) y
// suscripciones de proveedor (plan:provider:<providerId>:<basic|pro>).
//
// Reglas:
//  · firma x-signature válida contra MP_WEBHOOK_SECRET o MP_SUB_WEBHOOK_SECRET
//    (si NINGUNO está configurado, se acepta con console.warn);
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

/** Registro idempotente del pago por `mpPaymentId` (factura, cobro o compra).
 *  Si el monto/moneda no cuadra, queda con status `monto_invalido`. */
async function recordPayment(
  payment: MpPaymentInfo,
  target: { invoiceId?: string; chargeId?: string; purchaseId?: string },
  valid: boolean
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
      status,
      amount: payment.transactionAmount,
      refundedAmount: payment.transactionAmountRefunded ?? 0,
    },
    update: {
      status,
      amount: payment.transactionAmount,
      refundedAmount: payment.transactionAmountRefunded ?? 0,
    },
  })
}

export async function POST(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const bodyData = (await req.json().catch(() => ({}))) as WebhookBody

  // (b) tipo de notificación
  const rawType = String(bodyData.type || sp.get('type') || bodyData.topic || sp.get('topic') || '').toLowerCase()
  const type: 'payment' | 'subscription_preapproval' | null =
    rawType === 'payment' ? 'payment' : rawType === 'subscription_preapproval' ? 'subscription_preapproval' : null
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
    if (!valid) return NextResponse.json({ error: 'Firma inválida' }, { status: 401 })
  }

  if (!dataId) return NextResponse.json({ received: true })

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

async function handlePayment(paymentId: string, live: boolean, refHint: string | null) {
  // Pista opcional en la notification_url (?ref=purchase:<id>): los pagos de
  // compra directa los cobra el proveedor, así que hay que consultarlos con SU token.
  if (refHint && refHint.startsWith('purchase:')) {
    const purchase = await findPurchaseWithProvider(refHint.slice('purchase:'.length))
    if (purchase?.provider.mpOauthAccessToken) {
      const payment = await mpCall(() =>
        getPayment(paymentId, { accessToken: purchase.provider.mpOauthAccessToken, live })
      )
      if (payment.externalReference === refHint) {
        await applyPurchasePayment(purchase, payment)
        return
      }
    }
  }

  const payment = await mpCall(() => getPayment(paymentId, { live }))
  const ref = payment.externalReference
  if (!ref) return

  if (ref.startsWith('purchase:')) {
    const purchase = await findPurchaseWithProvider(ref.slice('purchase:'.length))
    if (!purchase) return
    // el pago tiene que existir en la cuenta del proveedor (es quien cobra)
    if (!purchase.provider.mpOauthAccessToken) {
      console.error('[mp webhook] compra sin proveedor conectado a MP', purchase.id)
      return
    }
    const sellerPayment = await mpCall(() =>
      getPayment(paymentId, { accessToken: purchase.provider.mpOauthAccessToken, live })
    )
    await applyPurchasePayment(purchase, sellerPayment)
    return
  }

  if (ref.startsWith('charge:')) {
    await applyChargePayment(ref.slice('charge:'.length), payment)
    return
  }

  // formato histórico: external_reference = <invoiceId>
  const invoiceId = ref.startsWith('invoice:') ? ref.slice('invoice:'.length) : ref
  await applyInvoicePayment(invoiceId, payment)
}

function findPurchaseWithProvider(purchaseId: string) {
  return db.purchase.findUnique({
    where: { id: purchaseId },
    include: {
      provider: {
        select: { id: true, userId: true, mpOauthAccessToken: true },
      },
    },
  })
}

type PurchaseWithProvider = NonNullable<Awaited<ReturnType<typeof findPurchaseWithProvider>>>

async function applyPurchasePayment(purchase: PurchaseWithProvider, payment: MpPaymentInfo) {
  const valid = amountValid(payment, purchase.total)
  await recordPayment(payment, { purchaseId: purchase.id, chargeId: purchase.chargeId ?? undefined }, valid)
  if (!valid) {
    console.error('[mp webhook] compra: monto/moneda no cuadra', {
      purchaseId: purchase.id, esperado: purchase.total, pagado: payment.transactionAmount, moneda: payment.currencyId,
    })
    return
  }
  if (payment.status !== 'approved') return
  if (purchase.status === 'pagado') return // ya estaba pagada: no se toca

  await db.purchase.update({
    where: { id: purchase.id },
    data: { status: 'pagado', paymentMethod: 'mercadopago', mpPaymentId: payment.id },
  })
  // si la compra tiene un cobro asociado, también queda pagado
  if (purchase.chargeId) {
    await db.providerCharge.updateMany({
      where: { id: purchase.chargeId, status: { not: 'pagada' } },
      data: { status: 'pagada', method: 'mercadopago', mpPaymentId: payment.id, paidAt: new Date() },
    })
  }
  await db.notification.createMany({
    data: [
      {
        userId: purchase.clientId,
        type: 'compra_pagada_cliente',
        title: 'Pago confirmado',
        body: `El pago por tu pedido de ${purchase.elementName} fue aprobado.`,
        link: '#/panel/cliente/materiales?tab=compras',
      },
      {
        userId: purchase.provider.userId,
        type: 'compra_pagada_prov',
        title: 'Cobro acreditado por Mercado Pago',
        body: `El cliente pagó el pedido de ${purchase.elementName} con Mercado Pago: el cobro ya está acreditado en tu cuenta. Coordiná la entrega.`,
        link: '#/panel/proveedor/cobros?tab=ventas',
      },
    ],
  })
}

async function applyChargePayment(chargeId: string, payment: MpPaymentInfo) {
  const charge = await db.providerCharge.findUnique({
    where: { id: chargeId },
    include: { provider: { select: { userId: true } } },
  })
  if (!charge) return

  const valid = amountValid(payment, charge.amount)
  await recordPayment(payment, { chargeId: charge.id }, valid)
  if (!valid) {
    console.error('[mp webhook] cobro: monto/moneda no cuadra', {
      chargeId: charge.id, esperado: charge.amount, pagado: payment.transactionAmount, moneda: payment.currencyId,
    })
    return
  }
  if (payment.status !== 'approved') return
  if (charge.status === 'pagada') return // ya estaba pagado: no se toca

  await db.providerCharge.update({
    where: { id: charge.id },
    data: { status: 'pagada', method: 'mercadopago', mpPaymentId: payment.id, paidAt: new Date() },
  })
  // si el cobro nació de una compra directa, la compra queda pagada → habilita reseña
  if (charge.projectId == null) {
    await db.purchase.updateMany({ where: { chargeId: charge.id }, data: { status: 'pagado' } })
  }
  await db.notification.createMany({
    data: [
      {
        userId: charge.provider.userId,
        type: 'cobro_pagado',
        title: 'Cobro de materiales pagado',
        body: `El cliente pagó tu cobro ${charge.number} con Mercado Pago.`,
        link: '#/panel/proveedor/cobros',
      },
      {
        userId: charge.clientId,
        type: 'cobro_pagado',
        title: 'Pago del cobro acreditado',
        body: `Tu pago de ${charge.number} quedó acreditado para el proveedor.`,
        link: charge.projectId ? `#/panel/cliente/proyectos/${charge.projectId}` : '#/panel/cliente/materiales?tab=compras',
      },
    ],
  })
}

async function applyInvoicePayment(invoiceId: string, payment: MpPaymentInfo) {
  const invoice = await db.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) return

  const valid = amountValid(payment, invoice.total)
  await recordPayment(payment, { invoiceId: invoice.id }, valid)

  if (!valid) {
    console.error('[mp webhook] factura: monto/moneda no cuadra', {
      invoiceId: invoice.id, esperado: invoice.total, pagado: payment.transactionAmount, moneda: payment.currencyId,
    })
    return
  }
  if (payment.status !== 'approved') return
  if (invoice.status === 'pagada') return // ya estaba pagada: no se toca

  await db.invoice.update({
    where: { id: invoice.id },
    data: { status: 'pagada', paymentMethod: 'mercadopago', mpPaymentId: payment.id, paidAt: new Date() },
  })
  const pro = await db.professionalProfile.findUnique({
    where: { id: invoice.professionalId },
    select: { userId: true },
  })
  if (pro) {
    await db.notification.create({
      data: {
        userId: pro.userId,
        type: 'factura_pagada',
        title: 'Factura pagada',
        body: `${invoice.number} fue pagada por Mercado Pago`,
        link: '#/panel/profesional/facturas',
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

async function handlePreapproval(preapprovalId: string, live: boolean) {
  const pre = await mpCall(() => getPreapproval(preapprovalId, { live }))
  const planRef = parsePlanReference(pre.externalReference || '')
  if (!planRef) return

  const prov = await db.providerProfile.findUnique({
    where: { id: planRef.profileId },
    select: { id: true, userId: true, subscription: true, mpPreapprovalId: true },
  })
  if (!prov) return

  if (pre.status === 'authorized') {
    const yaActivo = prov.subscription === planRef.plan && prov.mpPreapprovalId === pre.id
    await db.providerProfile.update({
      where: { id: prov.id },
      data: {
        subscription: planRef.plan,
        mpPreapprovalId: pre.id,
        ...(planRef.plan === 'pro' && !yaActivo ? { proSince: new Date() } : {}),
      },
    })
    if (!yaActivo) {
      await db.notification.create({
        data: {
          userId: prov.userId,
          type: 'pro_activa',
          title: planRef.plan === 'pro' ? 'Plan PRO activo' : 'Plan Básico activo',
          body:
            planRef.plan === 'pro'
              ? 'Tu Plan PRO está activo: analítica del negocio, tarjeta Recomendado y sponsor en la home.'
              : 'Tu Plan Básico está activo: usá la plataforma sin límites.',
          link: '#/panel/proveedor/plan',
        },
      })
    }
    return
  }

  if (pre.status === 'cancelled' || pre.status === 'paused') {
    // Solo si la suscripción cancelada es la vigente (un cambio de plan cancela la
    // anterior y NO debe pisar el plan nuevo).
    if (prov.mpPreapprovalId && prov.mpPreapprovalId !== pre.id) return
    // Sin plan de pago vuelve a "trial" ya consumido → se le pide elegir plan
    await db.providerProfile.update({
      where: { id: prov.id },
      data: { subscription: 'trial', trialEndsAt: new Date(0) },
    })
    await db.notification.create({
      data: {
        userId: prov.userId,
        type: 'plan_cancelado',
        title: pre.status === 'paused' ? 'Suscripción pausada' : 'Suscripción cancelada',
        body: 'Tu plan dejó de estar activo. Para seguir operando en HomIA, elegí un plan.',
        link: '#/panel/proveedor/plan',
      },
    })
  }
}
