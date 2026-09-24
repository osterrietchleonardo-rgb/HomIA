// Mercado Pago HomIA — pagos reales (facturas, cobros, compras directas) y
// suscripciones de proveedor. Dos apps de MP de la MISMA cuenta cobradora:
//   · Checkout Pro   → MP_ACCESS_TOKEN (+ MP_TEST_ACCESS_TOKEN para pagos de prueba)
//   · Suscripciones  → MP_SUB_ACCESS_TOKEN (+ MP_SUB_TEST_ACCESS_TOKEN)
// Las ventas directas del proveedor se cobran con SU token OAuth (nunca con el
// de la plataforma): si no está conectado, se lanza PROVIDER_NOT_CONNECTED.
import { createHmac } from 'crypto'
import { MercadoPagoConfig, Preference, Payment, PreApproval } from 'mercadopago'
import { PLAN_PRICE_ARS } from '@/lib/plans'
import { db } from '@/lib/db'

const MP_TOKEN = process.env.MP_ACCESS_TOKEN || ''
const MP_SUB_TOKEN = process.env.MP_SUB_ACCESS_TOKEN || ''
const MP_TEST_TOKEN = process.env.MP_TEST_ACCESS_TOKEN || ''
const MP_SUB_TEST_TOKEN = process.env.MP_SUB_TEST_ACCESS_TOKEN || ''
const MP_API = 'https://api.mercadopago.com'

/** Error de dominio: el proveedor no vinculó su cuenta de Mercado Pago. */
export const PROVIDER_NOT_CONNECTED = 'PROVIDER_NOT_CONNECTED'

export function mpConfigured(): boolean {
  return MP_TOKEN.length > 10
}

/** Suscripciones: usa la app de suscripciones o, si no está, la de Checkout Pro. */
export function mpSubConfigured(): boolean {
  return (MP_SUB_TOKEN || MP_TOKEN).length > 10
}

/** Cliente de Checkout Pro (token explícito o el de la plataforma). */
function client(token?: string) {
  const accessToken = token || MP_TOKEN
  if (!accessToken || accessToken.length <= 10) throw new Error('MP_ACCESS_TOKEN no configurada')
  return new MercadoPagoConfig({ accessToken })
}

/** Cliente de la app de Suscripciones (fallback: app de Checkout Pro). */
function subClient() {
  const accessToken = MP_SUB_TOKEN || MP_TOKEN
  if (!accessToken || accessToken.length <= 10) throw new Error('MP_SUB_ACCESS_TOKEN no configurada')
  return new MercadoPagoConfig({ accessToken })
}

type PreferenceBody = NonNullable<Parameters<Preference['create']>[0]['body']>

export type PreferenceResult = {
  id: string
  initPoint: string
}

export async function createInvoicePreference(input: {
  invoiceId: string
  invoiceNumber: string
  title: string
  total: number
  payerEmail: string
  baseUrl: string
}): Promise<PreferenceResult> {
  const mp = new Preference(client())
  const res = await mp.create({
    body: {
      items: [
        {
          id: input.invoiceId,
          title: input.title,
          description: `Factura ${input.invoiceNumber} — HomIA`,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: input.total,
        },
      ],
      payer: { email: input.payerEmail },
      external_reference: input.invoiceId,
      back_urls: {
        success: `${input.baseUrl}/panel/cliente/facturas?estado=pagado`,
        pending: `${input.baseUrl}/panel/cliente/facturas?estado=pendiente`,
        failure: `${input.baseUrl}/panel/cliente/facturas?estado=fallo`,
      },
      notification_url: `${input.baseUrl}/api/payments/webhook`,
      statement_descriptor: 'HOMIA',
    },
  })
  return {
    id: res.id || '',
    initPoint: (res.init_point || res.sandbox_init_point || '') as string,
  }
}

export type MpPaymentInfo = {
  id: string
  status: string
  statusDetail: string
  externalReference: string
  transactionAmount: number
  transactionAmountRefunded: number
  currencyId: string
  liveMode: boolean
}

/** Consulta un pago. `live === false` → token de prueba (si existe); `accessToken`
 *  explícito (OAuth del proveedor) tiene prioridad sobre todo. */
export async function getPayment(
  paymentId: string,
  opts: { accessToken?: string | null; live?: boolean } = {}
): Promise<MpPaymentInfo> {
  const token = opts.accessToken || (opts.live === false && MP_TEST_TOKEN ? MP_TEST_TOKEN : undefined)
  const mp = new Payment(client(token))
  const res = await mp.get({ id: paymentId })
  return {
    id: String(res.id),
    status: String(res.status || ''),
    statusDetail: String(res.status_detail || ''),
    externalReference: String(res.external_reference || ''),
    transactionAmount: Number(res.transaction_amount || 0),
    transactionAmountRefunded: Number(res.transaction_amount_refunded || 0),
    currencyId: String(res.currency_id || ''),
    liveMode: res.live_mode !== false,
  }
}

// ── COBRO DE MATERIALES PROVEEDOR → CLIENTE ──
// En proyectos con modo "cliente_paga_proveedor", el proveedor emite el cobro
// por los materiales aprobados y el cliente lo paga (MP o efectivo).
// external_reference = "charge:<chargeId>" — el webhook lo distingue de facturas.
export async function createChargePreference(input: {
  chargeId: string
  chargeNumber: string
  title: string
  total: number
  payerEmail: string
  baseUrl: string
}): Promise<PreferenceResult> {
  const mp = new Preference(client())
  const res = await mp.create({
    body: {
      items: [
        {
          id: input.chargeId,
          title: input.title.slice(0, 250),
          description: `Cobro de materiales ${input.chargeNumber} — HomIA`,
          quantity: 1,
          currency_id: 'ARS',
          unit_price: input.total,
        },
      ],
      payer: { email: input.payerEmail },
      external_reference: `charge:${input.chargeId}`,
      back_urls: {
        success: `${input.baseUrl}/panel/cliente/proyectos?cobro=pagado`,
        pending: `${input.baseUrl}/panel/cliente/proyectos?cobro=pendiente`,
        failure: `${input.baseUrl}/panel/cliente/proyectos?cobro=fallo`,
      },
      notification_url: `${input.baseUrl}/api/payments/webhook`,
      statement_descriptor: 'HOMIA',
    },
  })
  return {
    id: res.id || '',
    initPoint: (res.init_point || res.sandbox_init_point || '') as string,
  }
}

// ── COMPRA DIRECTA EN MARKETPLACE ──
// Se cobra SIEMPRE con el token OAuth del proveedor (la plata va a su cuenta).
// Sin token → PROVIDER_NOT_CONNECTED: el caller responde 503 honesto y ofrece efectivo.
export async function createPurchasePreference(input: {
  purchaseId: string
  title: string
  total: number
  payerEmail: string
  baseUrl: string
  sellerAccessToken?: string | null
  marketplaceFee?: number
}): Promise<PreferenceResult> {
  if (!input.sellerAccessToken) throw new Error(PROVIDER_NOT_CONNECTED)
  const mp = new Preference(client(input.sellerAccessToken))

  const body: PreferenceBody = {
    items: [
      {
        id: input.purchaseId,
        title: input.title.slice(0, 250),
        description: 'Compra en Marketplace — HomIA',
        quantity: 1,
        currency_id: 'ARS',
        unit_price: input.total,
      },
    ],
    payer: { email: input.payerEmail },
    external_reference: `purchase:${input.purchaseId}`,
    back_urls: {
      success: `${input.baseUrl}/panel/cliente/materiales?compra=pagado`,
      pending: `${input.baseUrl}/panel/cliente/materiales?compra=pendiente`,
      failure: `${input.baseUrl}/panel/cliente/materiales?compra=fallo`,
    },
    notification_url: `${input.baseUrl}/api/payments/webhook`,
    statement_descriptor: 'HOMIA',
  }

  // comisión de la plataforma: solo tiene sentido con el token del vendedor
  if (input.marketplaceFee && input.marketplaceFee > 0) {
    body.marketplace_fee = input.marketplaceFee
  }

  const res = await mp.create({ body })

  return {
    id: res.id || '',
    initPoint: (res.init_point || res.sandbox_init_point || '') as string,
  }
}

// ── PLANES DE PROVEEDOR (basic | pro) ──
// Único rol con suscripción de pago. external_reference =
// "plan:provider:<profileId>:<plan>" — el webhook activa el plan elegido.
export async function createProviderPlanPreapproval(input: {
  profileId: string
  plan: 'basic' | 'pro'
  payerEmail: string
  baseUrl: string
}): Promise<{ id: string; initPoint: string; priceArs: number }> {
  const priceArs = PLAN_PRICE_ARS[input.plan]
  const mp = new PreApproval(subClient())
  const res = await mp.create({
    body: {
      reason:
        input.plan === 'pro'
          ? 'HomIA Plan PRO: sponsor en la home y Recomendado' // MP: máx. 60 caracteres
          : 'HomIA Plan Básico: uso completo de la app',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: priceArs,
        currency_id: 'ARS',
      },
      payer_email: input.payerEmail,
      external_reference: `plan:provider:${input.profileId}:${input.plan}`,
      back_url: `${input.baseUrl}/panel/proveedor/plan?plan=ok`,
    },
  })
  return { id: res.id || '', initPoint: (res.init_point || '') as string, priceArs }
}

export async function getPreapproval(
  preapprovalId: string,
  opts: { live?: boolean } = {}
): Promise<{ id: string; status: string; externalReference: string }> {
  const config =
    opts.live === false && MP_SUB_TEST_TOKEN
      ? new MercadoPagoConfig({ accessToken: MP_SUB_TEST_TOKEN })
      : subClient()
  const mp = new PreApproval(config)
  const res = await mp.get({ id: preapprovalId })
  return {
    id: String(res.id),
    status: String(res.status || ''),
    externalReference: String(res.external_reference || ''),
  }
}

/** Cancela una suscripción (cambio de plan o baja). */
export async function cancelPreapproval(preapprovalId: string): Promise<{ id: string; status: string }> {
  const mp = new PreApproval(subClient())
  const res = await mp.update({ id: preapprovalId, body: { status: 'cancelled' } })
  return { id: String(res.id), status: String(res.status || 'cancelled') }
}

/** Reembolso (total o parcial) de un pago. `accessToken` = token OAuth del
 *  vendedor si el pago fue cobrado por él. Idempotente por `idempotencyKey`. */
export async function refundPayment(input: {
  paymentId: string
  amount?: number
  accessToken?: string | null
  idempotencyKey: string
}): Promise<{ id: string; status: string }> {
  const token = input.accessToken || MP_TOKEN
  if (!token || token.length <= 10) throw new Error('MP_ACCESS_TOKEN no configurada')
  const res = await fetch(`${MP_API}/v1/payments/${encodeURIComponent(input.paymentId)}/refunds`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      'X-Idempotency-Key': input.idempotencyKey,
    },
    body: JSON.stringify(typeof input.amount === 'number' && input.amount > 0 ? { amount: input.amount } : {}),
    signal: AbortSignal.timeout(20_000),
  })
  const data = (await res.json().catch(() => ({}))) as { id?: number | string; status?: string; message?: string }
  if (!res.ok) {
    throw new Error(`MP refund ${res.status}: ${data.message || 'error desconocido'}`)
  }
  return { id: String(data.id ?? ''), status: String(data.status || '') }
}

/**
 * Verifica la firma del webhook según el manifest oficial de MP:
 *   id:<data.id>;request-id:<x-request-id>;ts:<ts>;
 * (cada parte se incluye solo si existe). HMAC-SHA256 hex con el secret de la app.
 * `x-signature` viene como "ts=...,v1=...". Si data.id es alfanumérico, va en minúsculas.
 * Valida contra al menos uno de los `secrets` (Checkout Pro y Suscripciones).
 */
export function verifyWebhookSignature(input: {
  xSignature: string | null
  xRequestId: string | null
  dataId: string | null
  secrets: string[]
}): boolean {
  const secrets = input.secrets.filter((s) => typeof s === 'string' && s.length > 0)
  if (secrets.length === 0) return false
  if (!input.xSignature) return false

  let ts = ''
  let v1 = ''
  for (const part of input.xSignature.split(',')) {
    const [k, ...rest] = part.split('=')
    const key = (k || '').trim()
    const value = rest.join('=').trim()
    if (key === 'ts') ts = value
    else if (key === 'v1') v1 = value
  }
  if (!ts || !v1) return false

  let dataId = input.dataId || ''
  if (dataId && /[a-zA-Z]/.test(dataId)) dataId = dataId.toLowerCase()

  let manifest = ''
  if (dataId) manifest += `id:${dataId};`
  if (input.xRequestId) manifest += `request-id:${input.xRequestId};`
  manifest += `ts:${ts};`

  return secrets.some((secret) => {
    const expected = createHmac('sha256', secret).update(manifest).digest('hex')
    return expected.length === v1.length && timingSafeEqualHex(expected, v1.toLowerCase())
  })
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

// ── OAUTH DEL PROVEEDOR: refresh de token ──
type SellerOauth = {
  id: string
  mpOauthAccessToken: string | null
  mpOauthRefreshToken: string | null
  mpOauthExpiresAt: Date | null
  mpOauthStatus: string
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Devuelve un access token OAuth vigente del proveedor. Si vence en menos de 7
 * días y hay refresh token, lo renueva contra MP y persiste los campos. Si la
 * renovación falla, marca `mpOauthStatus = 'expired'` y lanza PROVIDER_NOT_CONNECTED.
 */
export async function ensureFreshSellerToken(provider: SellerOauth): Promise<string> {
  if (!provider.mpOauthAccessToken || provider.mpOauthStatus !== 'connected') {
    throw new Error(PROVIDER_NOT_CONNECTED)
  }
  const expiresAt = provider.mpOauthExpiresAt ? provider.mpOauthExpiresAt.getTime() : 0
  const needsRefresh = expiresAt < Date.now() + SEVEN_DAYS_MS
  if (!needsRefresh) return provider.mpOauthAccessToken
  if (!provider.mpOauthRefreshToken) {
    // vencido o por vencer y sin cómo renovarlo
    if (expiresAt < Date.now()) {
      await db.providerProfile.update({ where: { id: provider.id }, data: { mpOauthStatus: 'expired' } })
      throw new Error(PROVIDER_NOT_CONNECTED)
    }
    return provider.mpOauthAccessToken
  }

  try {
    const res = await fetch(`${MP_API}/oauth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.MP_CLIENT_ID,
        client_secret: process.env.MP_CLIENT_SECRET,
        grant_type: 'refresh_token',
        refresh_token: provider.mpOauthRefreshToken,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    const data = (await res.json().catch(() => ({}))) as {
      access_token?: string
      refresh_token?: string
      expires_in?: number
    }
    if (!res.ok || !data.access_token) throw new Error(`MP refresh ${res.status}`)
    const expiresIn = Number.isFinite(Number(data.expires_in)) && Number(data.expires_in) > 0
      ? Number(data.expires_in)
      : 15552000
    await db.providerProfile.update({
      where: { id: provider.id },
      data: {
        mpOauthAccessToken: data.access_token,
        mpOauthRefreshToken: data.refresh_token || provider.mpOauthRefreshToken,
        mpOauthExpiresAt: new Date(Date.now() + expiresIn * 1000),
        mpOauthStatus: 'connected',
      },
    })
    return data.access_token
  } catch (e) {
    console.error('[mp] no se pudo renovar el token OAuth del proveedor', provider.id, e)
    await db.providerProfile.update({ where: { id: provider.id }, data: { mpOauthStatus: 'expired' } })
    throw new Error(PROVIDER_NOT_CONNECTED)
  }
}
