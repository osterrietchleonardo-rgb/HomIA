import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

function nextInvoiceNumber(): string {
  return `HOM-${new Date().getFullYear()}-${String(Date.now()).slice(-6)}`
}

// POST: el cliente da conformidad → libera el pago en garantía al profesional.
// Marca el escrow como released y liquida la factura del proyecto:
// si ya existe una factura pendiente la marca pagada con el payment id del
// escrow; si no existe, genera la factura final automáticamente (pagada).
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const project = await db.project.findUnique({
    where: { id },
    include: { invoices: { orderBy: { issuedAt: 'desc' } } },
  })
  if (!project) return fail('Proyecto no encontrado', 404)
  if (project.clientId !== user.id) return fail('Solo el cliente del proyecto puede liberar el pago', 403)
  if (project.escrowStatus !== 'retained') {
    return fail('El pago todavía no está en garantía')
  }

  const total = Math.round((project.laborCost + project.materialsCost) * 100) / 100

  // 1) liquidar facturación
  const pending = project.invoices.find((i) => i.status === 'pendiente')
  let invoice
  if (pending) {
    invoice = await db.invoice.update({
      where: { id: pending.id },
      data: {
        status: 'pagada',
        mpPaymentId: project.escrowPaymentId,
        paidAt: new Date(),
      },
    })
  } else if (project.invoices.length === 0) {
    const materialsCost = Math.round(project.materialsCost * 100) / 100
    invoice = await db.invoice.create({
      data: {
        projectId: project.id,
        number: nextInvoiceNumber(),
        clientId: project.clientId,
        professionalId: project.professionalId,
        laborCost: project.laborCost,
        materialsCost,
        total: total || materialsCost + project.laborCost,
        status: 'pagada',
        mpPaymentId: project.escrowPaymentId,
        paidAt: new Date(),
        items: {
          create: [
            ...(materialsCost > 0
              ? [{
                  kind: 'material',
                  description: 'Materiales del proyecto',
                  quantity: 1,
                  unitPrice: materialsCost,
                  subtotal: materialsCost,
                }]
              : []),
            ...(project.laborCost > 0
              ? [{
                  kind: 'mano_obra',
                  description: 'Mano de obra',
                  quantity: 1,
                  unitPrice: project.laborCost,
                  subtotal: project.laborCost,
                }]
              : []),
          ],
        },
      },
    })
  } else {
    // ya existía una factura pagada (flujo normal) — el escrow la respalda
    invoice = project.invoices[0]
  }

  // 2) liberar escrow
  await db.project.update({
    where: { id: project.id },
    data: { escrowStatus: 'released', escrowReleasedAt: new Date() },
  })

  // 3) notificar al profesional
  const pro = await db.professionalProfile.findUnique({
    where: { id: project.professionalId },
    select: { userId: true },
  })
  if (pro) {
    await db.notification.create({
      data: {
        userId: pro.userId,
        type: 'escrow_liberado',
        title: 'Pago liberado',
        body: `El cliente dio conformidad en "${project.title}" y liberó ${total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })}.`,
        link: `#/panel/profesional/proyectos/${project.id}`,
      },
    })
  }

  return ok({ escrowStatus: 'released', invoice })
}
