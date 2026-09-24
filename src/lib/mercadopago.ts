// Mercado Pago HomIA — pagos reales (facturas, cobros, compras directas) y
// suscripciones de proveedor. Dos apps de MP de la MISMA cuenta cobradora:
//   · Checkout Pro   → MP_ACCESS_TOKEN (+ MP_TEST_ACCESS_TOKEN para pagos de prueba)
//   · Suscripciones  → MP_SUB_ACCESS_TOKEN (+ MP_SUB_TEST_ACCESS_TOKEN)
// Compras, facturas y cobros se cobran SIEMPRE con el token OAuth del vendedor
// (proveedor o profesional; nunca con el de la plataforma) + cargo de servicio
// HomIA (1%) como marketplace_fee. Sin token → PROVIDER_NOT_CONNECTED.
import { createHmac } from 'crypto'
import { MercadoPagoConfig, Preference, Payment, PreApproval } from 'mercadopago'
import { PLAN_PRICE_ARS } from '@/lib/plans'
import { SERVICE_FEE_LABEL, round2 } from '@/lib/fees'
import { db } from '@/lib/db'

const MP_TOKEN = process.env.MP_ACCESS_TOKEN || ''
const MP_SUB_TOKEN = process.env.MP_SUB_ACCESS_TOKEN || ''
const MP_TEST_TOKEN = process.env.MP_TEST_ACCESS_TOKEN || ''
const MP_SUB_TEST_TOKEN = process.env.MP_SUB_TEST_ACCESS_TOKEN || ''
const MP_API = 'https://api.mercadopago.com'

/** Error de dominio: el vendedor (proveedor o profesional) no vinculó su cuenta de Mercado Pago. */
export const PROVIDER_NOT_CONNECTED = 'PROVIDER_NOT_CONNECTED'
export const SELLER_NOT_CONNECTED = PROVIDER_NOT_CONNECTED

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

// ── PREFERENCIAS DE PAGO CON EL TOKEN DEL VENDEDOR ──
// Decisión del dueño (2026-09-24): el dinero va SIEMPRE a la cuenta de quien vende
// (compras → proveedor; factura de proyecto → profesional; cobro de materiales →
// proveedor). Toda preferencia se crea con el token OAuth del vendedor y lleva:
//   · los ítems reales (lo que cobra el vendedor, el 100% de su precio),
//   · un ítem "Cargo de servicio HomIA (1%)" que paga el cliente,
//   · `marketplace_fee` = ese cargo (MP lo acredita en la cuenta de HomIA).
// Sin token del vendedor → SELLER_NOT_CONNECTED: el caller responde 503 honesto y ofrece efectivo.
// external_reference = "<tipo>:<id>" y la notification_url lleva ?ref= con lo mismo:
// el webhook necesita saber de antemano qué token usar para consultar el pago.

export type SellerPrefItem = { id: string; title: string; quantity: number; unitPrice: number }
export type SellerPrefKind = 'purchase' | 'invoice' | 'charge'

const BACK_PATHS: Record<SellerPrefKind, (id: string) => string> = {
  purchase: () => '/panel/cliente/pedidos',
  invoice: () => '/panel/cliente/facturas',
  charge: () => '/panel/cliente/proyectos',
}

/** MP exige cantidades enteras: una línea fraccionada (2,5 m) va como 1 × total de la línea. */
export function toMpItems(items: SellerPrefItem[]) {
  return items.map((i) => {
    const entera = Number.isInteger(i.quantity) && i.quantity > 0
    return {
      id: i.id.slice(0, 250),
      title: (entera ? i.title : `${i.title} × ${i.quantity}`).slice(0, 250),
      quantity: entera ? i.quantity : 1,
      currency_id: 'ARS',
      unit_price: entera ? round2(i.unitPrice) : round2(i.unitPrice * i.quantity),
    }
  })
}

export async function createSellerPreference(input: {
  kind: SellerPrefKind
  id: string
  items: SellerPrefItem[]
  serviceFee: number
  payerEmail: string
  baseUrl: string
  sellerAccessToken: string | null | undefined
  /** ruta del panel a la que vuelve el cliente (default según el tipo) */
  backPath?: string
}): Promise<PreferenceResult> {
  if (!input.sellerAccessToken) throw new Error(SELLER_NOT_CONNECTED)
  const mp = new Preference(client(input.sellerAccessToken))
  const ref = `${input.kind}:${input.id}`
  const back = input.backPath || BACK_PATHS[input.kind](input.id)
  const sep = back.includes('?') ? '&' : '?'
  const items = toMpItems(input.items)
  if (input.serviceFee > 0) {
    items.push({ id: 'cargo-servicio-homia', title: SERVICE_FEE_LABEL, quantity: 1, currency_id: 'ARS', unit_price: round2(input.serviceFee) })
  }
  const body: PreferenceBody = {
    items,
    payer: { email: input.payerEmail },
    external_reference: ref,
    back_urls: {
      success: `${input.baseUrl}${back}${sep}pago=ok`,
      pending: `${input.baseUrl}${back}${sep}pago=pendiente`,
      failure: `${input.baseUrl}${back}${sep}pago=fallo`,
    },
    notification_url: `${input.baseUrl}/api/payments/webhook?ref=${encodeURIComponent(ref)}`,
    statement_descriptor: 'HOMIA',
  }
  if (input.serviceFee > 0) body.marketplace_fee = round2(input.serviceFee)
  const res = await mp.create({ body })
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

/** ¿El vendedor tiene Mercado Pago conectado? (solo estado, sin tocar a MP) */
export function sellerMpConnected(s: { mpOauthStatus: string; mpOauthAccessToken?: string | null } | null | undefined): boolean {
  return !!s && s.mpOauthStatus === 'connected' && (s.mpOauthAccessToken === undefined || !!s.mpOauthAccessToken)
}

/**
 * Devuelve un access token OAuth vigente del vendedor. Si vence en menos de 7
 * días y hay refresh token, lo renueva contra MP y persiste los campos. Si la
 * renovación falla, marca `mpOauthStatus = 'expired'` y lanza PROVIDER_NOT_CONNECTED.
 */
export async function ensureFreshSellerToken(provider: SellerOauth, kind: 'provider' | 'professional' = 'provider'): Promise<string> {
  // el mismo perfil se actualiza en su tabla (ProviderProfile o ProfessionalProfile)
  const save = (data: { mpOauthStatus: string; mpOauthAccessToken?: string; mpOauthRefreshToken?: string | null; mpOauthExpiresAt?: Date }) =>
    kind === 'professional'
      ? db.professionalProfile.update({ where: { id: provider.id }, data })
      : db.providerProfile.update({ where: { id: provider.id }, data })
  if (!provider.mpOauthAccessToken || provider.mpOauthStatus !== 'connected') {
    throw new Error(PROVIDER_NOT_CONNECTED)
  }
  const expiresAt = provider.mpOauthExpiresAt ? provider.mpOauthExpiresAt.getTime() : 0
  const needsRefresh = expiresAt < Date.now() + SEVEN_DAYS_MS
  if (!needsRefresh) return provider.mpOauthAccessToken
  if (!provider.mpOauthRefreshToken) {
    // vencido o por vencer y sin cómo renovarlo
    if (expiresAt < Date.now()) {
      await save({ mpOauthStatus: 'expired' })
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
    await save({
      mpOauthAccessToken: data.access_token,
      mpOauthRefreshToken: data.refresh_token || provider.mpOauthRefreshToken,
      mpOauthExpiresAt: new Date(Date.now() + expiresIn * 1000),
      mpOauthStatus: 'connected',
    })
    return data.access_token
  } catch (e) {
    console.error('[mp] no se pudo renovar el token OAuth del vendedor', kind, provider.id, e)
    await save({ mpOauthStatus: 'expired' }).catch(() => undefined)
    throw new Error(PROVIDER_NOT_CONNECTED)
  }
}
