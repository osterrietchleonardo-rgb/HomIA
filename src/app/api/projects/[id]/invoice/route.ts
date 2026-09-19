import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'

// GET: facturas del proyecto
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const invoices = await db.invoice.findMany({
    where: { projectId: id },
    include: { items: true },
    orderBy: { issuedAt: 'desc' },
  })
  return ok({ invoices })
}

// POST: generar factura automática con detalle explícito (materiales aprobados + mano de obra)
export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const project = await db.project.findUnique({
    where: { id },
    include: {
      materials: { where: { status: 'aprobado' } },
      invoices: { select: { id: true } },
    },
  })
  if (!project) return fail('Proyecto no encontrado', 404)
  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })
  if (!pro || project.professionalId !== pro.id) {
    return fail('Solo el profesional del proyecto emite la factura', 403)
  }
  if (project.invoices.length >= 99) return fail('Límite de facturas alcanzado')

  // ── Modo de pago de materiales ──
  // pro_adelanta: el profesional adelantó los materiales → van en la factura junto con la mano de obra.
  // cliente_paga_proveedor: el cliente paga los materiales directamente al proveedor →
  // la factura del profesional cubre SOLO mano de obra (los materiales salen por cobro del proveedor).
  const clientePagaMateriales = project.materialsPaymentMode === 'cliente_paga_proveedor'
  const materialsForInvoice = clientePagaMateriales ? [] : project.materials

  // Número secuencial HOM-2026-000001
  const year = new Date().getFullYear()
  const count = await db.invoice.count()
  const number = `HOM-${year}-${String(count + 1).padStart(6, '0')}`

  const items = materialsForInvoice.map((m) => ({
    kind: 'material',
    description: `${m.name} — ${m.quantity} ${m.unit} x ${m.unitPrice}`,
    quantity: m.quantity,
    unitPrice: m.unitPrice,
    subtotal: Math.round(m.quantity * m.unitPrice * 100) / 100,
  }))
  if (project.laborCost > 0) {
    items.push({
      kind: 'mano_obra',
      description: 'Mano de obra',
      quantity: 1,
      unitPrice: project.laborCost,
      subtotal: project.laborCost,
    })
  }
  if (items.length === 0) {
    return fail(clientePagaMateriales
      ? 'No hay mano de obra para facturar (en este modo los materiales los cobra el proveedor directamente al cliente)'
      : 'No hay materiales aprobados ni mano de obra para facturar')
  }
  const materialsCost = items.filter((i) => i.kind === 'material').reduce((a, i) => a + i.subtotal, 0)
  const total = materialsCost + project.laborCost

  const invoice = await db.invoice.create({
    data: {
      projectId: id,
      number,
      clientId: project.clientId,
      professionalId: project.professionalId,
      laborCost: project.laborCost,
      materialsCost,
      total,
      items: { create: items },
    },
    include: { items: true },
  })

  await db.notification.create({
    data: {
      userId: project.clientId,
      type: 'factura_emitida',
      title: 'Nueva factura',
      body: `${number} por ${total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })} — "${project.title}"${clientePagaMateriales ? ' (solo mano de obra: los materiales los pagás al proveedor)' : ''}`,
      link: `#/panel/cliente/facturas`,
    },
  })

  return ok({ invoice }, 201)
}
