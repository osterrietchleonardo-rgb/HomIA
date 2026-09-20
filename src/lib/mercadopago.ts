// Mercado Pago HomIA — pagos reales de facturas, escrow y suscripción PRO (sin Stripe)
// Configurar MP_ACCESS_TOKEN en .env (credenciales de test o producción de mercadopago.com)
import { MercadoPagoConfig, Preference, Payment, PreApproval } from 'mercadopago'
import { MP_PLAN_PRICE_ARS } from '@/lib/plans'

const MP_TOKEN = process.env.MP_ACCESS_TOKEN || ''

// Precio mensual del plan PRO de profesional — LEGADO (ya no se vende: solo los
// proveedores tienen suscripción de pago). Se mantiene por preapprovals existentes.
export const MP_PRO_PRICE_ARS = Number(process.env.MP_PRO_PRICE_ARS || 4999)

export function mpConfigured(): boolean {
  return MP_TOKEN.length > 10
}

function client() {
  if (!mpConfigured()) throw new Error('MP_ACCESS_TOKEN no configurada')
  return new MercadoPagoConfig({ accessToken: MP_TOKEN })
}

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
        success: `${input.baseUrl}/#/panel/cliente/facturas?estado=pagado`,
        pending: `${input.baseUrl}/#/panel/cliente/facturas?estado=pendiente`,
        failure: `${input.baseUrl}/#/panel/cliente/facturas?estado=fallo`,
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

export async function getPayment(paymentId: string) {
  const mp = new Payment(client())
  const res = await mp.get({ id: paymentId })
  return {
    id: String(res.id),
    status: res.status as string,
    statusDetail: res.status_detail as string,
    externalReference: res.external_reference as string,
    transactionAmount: res.transaction_amount as number,
  }
}

// ── COBRO DE MATERIALES PROVEEDOR → CLIENTE ──
// En proyectos con modo "cliente_paga_proveedor", el proveedor emite el cobro
// por los materiales aprobados y el cliente lo paga (MP o efectivo).
// external_reference = "charge:<chargeId>" — el webhook lo distingue de facturas/escrow.
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
        success: `${input.baseUrl}/#/panel/cliente/proyectos?cobro=pagado`,
        pending: `${input.baseUrl}/#/panel/cliente/proyectos?cobro=pendiente`,
        failure: `${input.baseUrl}/#/panel/cliente/proyectos?cobro=fallo`,
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

// ─────────────────────────── ESCROW ───────────────────────────
// El cliente deposita el total del proyecto en garantía. Los fondos
// los recibe la plataforma (collector) y se "liberan" al profesional
// cuando el cliente da conformidad (genera la factura pagada).

export async function createEscrowPreference(input: {
  projectId: string
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
          id: `escrow-${input.projectId}`,
          title: `Garantía del proyecto — ${input.title}`.slice(0, 250),
          description: 'Pago protegido: se libera al profesional cuando des conformidad',
          quantity: 1,
          currency_id: 'ARS',
          unit_price: input.total,
        },
      ],
      payer: { email: input.payerEmail },
      external_reference: `escrow:${input.projectId}`,
      back_urls: {
        success: `${input.baseUrl}/#/panel/cliente/proyectos/${input.projectId}?escrow=iniciado`,
        pending: `${input.baseUrl}/#/panel/cliente/proyectos/${input.projectId}?escrow=pendiente`,
        failure: `${input.baseUrl}/#/panel/cliente/proyectos/${input.projectId}?escrow=fallo`,
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

// ── SUSCRIPCIÓN PRO (profesionales y proveedores) ──
// external_reference = "pro:<kind>:<profileId>" — el webhook la usa para
// activar/desactivar el plan en el perfil correcto.
// (Legado: "provider_pro:<id>" sigue siendo aceptado por el webhook.)
export async function createProPreapproval(input: {
  kind: 'provider' | 'professional'
  profileId: string
  payerEmail: string
  baseUrl: string
}): Promise<{ id: string; initPoint: string }> {
  const mp = new PreApproval(client())
  const res = await mp.create({
    body: {
      reason: 'Plan PRO HomIA — tu negocio destacado con badge PRO y prioridad en el motor IA',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: MP_PRO_PRICE_ARS,
        currency_id: 'ARS',
      },
      payer_email: input.payerEmail,
      external_reference: `pro:${input.kind}:${input.profileId}`,
      back_url: `${input.baseUrl}/#/panel/${input.kind === 'provider' ? 'proveedor' : 'profesional'}/perfil`,
    },
  })
  return {
    id: res.id || '',
    initPoint: (res.init_point || '') as string,
  }
}

// ── PLANES DE PROVEEDOR (basic | pro) ──
// Único rol con suscripción de pago. external_reference =
// "plan:provider:<profileId>:<plan>" — el webhook activa el plan elegido.
// (Legado: "pro:provider:<id>" y "provider_pro:<id>" siguen activando PRO.)
export async function createProviderPlanPreapproval(input: {
  profileId: string
  plan: 'basic' | 'pro'
  payerEmail: string
  baseUrl: string
}): Promise<{ id: string; initPoint: string; priceArs: number }> {
  const priceArs = MP_PLAN_PRICE_ARS[input.plan]
  const mp = new PreApproval(client())
  const res = await mp.create({
    body: {
      reason:
        input.plan === 'pro'
          ? 'Plan PRO HomIA — analítica del negocio, tarjeta Recomendado y sponsor en la home'
          : 'Plan Básico HomIA — uso completo de la plataforma para tu negocio',
      auto_recurring: {
        frequency: 1,
        frequency_type: 'months',
        transaction_amount: priceArs,
        currency_id: 'ARS',
      },
      payer_email: input.payerEmail,
      external_reference: `plan:provider:${input.profileId}:${input.plan}`,
      back_url: `${input.baseUrl}/#/panel/proveedor/plan`,
    },
  })
  return { id: res.id || '', initPoint: (res.init_point || '') as string, priceArs }
}

export async function getPreapproval(preapprovalId: string) {
  const mp = new PreApproval(client())
  const res = await mp.get({ id: preapprovalId })
  return {
    id: String(res.id),
    status: res.status as string,
    externalReference: res.external_reference as string,
  }
}
