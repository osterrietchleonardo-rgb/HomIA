import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'

// POST: flujo de pago en EFECTIVO de una factura.
//   acordar   (cliente)     → el cliente elige efectivo; queda "acordado" a la vista de ambos.
//   confirmar (profesional) → el profesional confirma que cobró el dinero; la factura queda pagada.
//   cancelar  (cliente)     → el cliente vuelve atrás del acuerdo (solo si no fue confirmado).
// Así ninguna parte queda a ciegas: el estado del efectivo es visible para los dos.
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const invoice = await db.invoice.findUnique({ where: { id }, include: { project: { select: { title: true } } } })
  if (!invoice) return fail('Factura no encontrada', 404)

  const pro = await db.professionalProfile.findUnique({ where: { id: invoice.professionalId }, select: { userId: true } })
  const isClient = invoice.clientId === user.id
  const isPro = pro ? pro.userId === user.id : false
  if (!isClient && !isPro) return fail('Sin permiso sobre esta factura', 403)

  const d = await body<{ action?: 'acordar' | 'confirmar' | 'cancelar' }>(req)
  // cualquier otra acción caía en "cancelar" y borraba el acuerdo de efectivo
  if (d.action !== 'acordar' && d.action !== 'confirmar' && d.action !== 'cancelar') {
    return fail('Acción inválida (acordar | confirmar | cancelar)')
  }

  const acuerdoPendiente = await db.payment.findFirst({
    where: { invoiceId: invoice.id, method: 'efectivo', status: 'acordado' },
  })
  const yaPagada = invoice.status === 'pagada'

  if (d.action === 'acordar') {
    if (!isClient) return fail('Solo el cliente puede elegir el método de pago', 403)
    if (yaPagada) return fail('La factura ya está pagada')
    if (acuerdoPendiente) return fail('Ya hay un pago en efectivo acordado para esta factura')
    await db.payment.create({
      data: { invoiceId: invoice.id, method: 'efectivo', status: 'acordado', amount: invoice.total },
    })
    await db.invoice.update({ where: { id: invoice.id }, data: { paymentMethod: 'efectivo' } })
    if (pro) {
      await db.notification.create({
        data: {
          userId: pro.userId,
          type: 'factura_efectivo_acordado',
          title: 'Pago en efectivo acordado',
          body: `El cliente acordó pagar ${invoice.number} en efectivo. Confirmá el cobro desde el proyecto cuando recibas el dinero.`,
          link: `#/panel/profesional/proyectos/${invoice.projectId}`,
        },
      })
    }
    return ok({ success: true, method: 'efectivo', status: 'acordado' })
  }

  if (d.action === 'confirmar') {
    if (!isPro) return fail('Solo el profesional confirma el cobro en efectivo', 403)
    if (yaPagada) return fail('La factura ya está pagada')
    if (!acuerdoPendiente) return fail('No hay un pago en efectivo acordado por el cliente')
    await db.payment.update({
      where: { id: acuerdoPendiente.id },
      data: { status: 'confirmado', confirmedAt: new Date() },
    })
    await db.invoice.update({
      where: { id: invoice.id },
      data: { status: 'pagada', paidAt: new Date(), paymentMethod: 'efectivo' },
    })
    await db.notification.create({
      data: {
        userId: invoice.clientId,
        type: 'factura_efectivo_confirmado',
        title: 'Cobro en efectivo confirmado',
        body: `El profesional confirmó que cobró ${invoice.number} en efectivo. La factura quedó pagada.`,
        link: '#/panel/cliente/facturas',
      },
    })
    return ok({ success: true, method: 'efectivo', status: 'confirmado' })
  }

  // cancelar
  if (!isClient) return fail('Solo el cliente puede cancelar el acuerdo de efectivo', 403)
  if (yaPagada) return fail('La factura ya está pagada')
  if (!acuerdoPendiente) return fail('No hay acuerdo de efectivo activo')
  await db.payment.delete({ where: { id: acuerdoPendiente.id } })
  await db.invoice.update({ where: { id: invoice.id }, data: { paymentMethod: null } })
  if (pro) {
    await db.notification.create({
      data: {
        userId: pro.userId,
        type: 'factura_efectivo_cancelado',
        title: 'Acuerdo de efectivo cancelado',
        body: `El cliente canceló el pago en efectivo de ${invoice.number} ("${invoice.project.title}"). Sigue pendiente.`,
        link: `#/panel/profesional/proyectos/${invoice.projectId}`,
      },
    })
  }
  return ok({ success: true, method: null })
}
