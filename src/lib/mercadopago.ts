// Mercado Pago HomIA — pagos reales de facturas (sin Stripe)
// Configurar MP_ACCESS_TOKEN en .env (credenciales de test o producción de mercadopago.com)
import { MercadoPagoConfig, Preference, Payment } from 'mercadopago'

const MP_TOKEN = process.env.MP_ACCESS_TOKEN || ''

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
