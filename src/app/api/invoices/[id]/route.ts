import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { createInvoicePreference, mpConfigured } from '@/lib/mercadopago'

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
  return ok({ invoice, client, professional: pro ? { displayName: pro.user.displayName, companyName: pro.companyName, email: pro.user.email } : null })
}

// POST: iniciar pago con Mercado Pago → devuelve init_point para redirigir
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const invoice = await db.invoice.findUnique({ where: { id }, include: { items: true } })
  if (!invoice) return fail('Factura no encontrada', 404)
  if (invoice.clientId !== user.id) return fail('Solo el cliente paga la factura', 403)
  if (invoice.status === 'pagada') return fail('La factura ya está pagada')

  if (!mpConfigured()) {
    return fail('Mercado Pago no está configurado. Agregá MP_ACCESS_TOKEN en el archivo .env del servidor.', 503, { needsConfig: true })
  }

  const url = new URL(req.url)
  const baseUrl = `${url.protocol}//${url.host}`
  const preference = await createInvoicePreference({
    invoiceId: invoice.id,
    invoiceNumber: invoice.number,
    title: `Factura ${invoice.number} — ${invoice.items.length > 0 ? 'Proyecto HomIA' : 'HomIA'}`,
    total: invoice.total,
    payerEmail: user.email,
    baseUrl,
  })

  await db.invoice.update({ where: { id }, data: { mpPreferenceId: preference.id } })
  return ok({ initPoint: preference.initPoint, preferenceId: preference.id })
}
