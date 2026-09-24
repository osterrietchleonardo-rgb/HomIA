import { NextRequest } from 'next/server'
import { Prisma } from '@prisma/client'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'

async function loadParty(userId: string, projectId: string) {
  const project = await db.project.findUnique({
    where: { id: projectId },
    include: { pro: { select: { id: true, userId: true } } },
  })
  if (!project) return { project: null, isClient: false, isPro: false }
  return { project, isClient: project.clientId === userId, isPro: project.pro.userId === userId }
}

// GET: facturas del proyecto (solo las partes)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const { project, isClient, isPro } = await loadParty(user.id, id)
  if (!project) return fail('Proyecto no encontrado', 404)
  if (!isClient && !isPro) return fail('No tenés acceso a este proyecto', 403)

  const invoices = await db.invoice.findMany({
    where: { projectId: id },
    include: { items: true },
    orderBy: { issuedAt: 'desc' },
  })
  return ok({ invoices })
}

// POST: el profesional emite la factura con detalle explícito.
//   - una sola factura `pendiente` por proyecto a la vez
//   - la mano de obra se factura una única vez (si ninguna factura previa la incluyó)
//   - materiales: solo `aprobado` y todavía no facturados (invoicedAt null), según materialsPaymentMode;
//     quedan marcados invoicedAt en la misma transacción
//   - número HOM-<año>-<n> con reintento ante colisión (P2002)
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
      pro: { select: { id: true, userId: true } },
      materials: { where: { status: 'aprobado', invoicedAt: null }, orderBy: { createdAt: 'asc' } },
      invoices: { select: { id: true, status: true, laborCost: true } },
    },
  })
  if (!project) return fail('Proyecto no encontrado', 404)
  if (project.pro.userId !== user.id) return fail('Solo el profesional del proyecto emite la factura', 403)
  if (project.status !== 'activo' && project.status !== 'finalizado') {
    return fail(`El proyecto está ${project.status}: no se puede facturar`, 409)
  }
  if (project.invoices.some((i) => i.status === 'pendiente')) {
    return fail('Ya hay una factura pendiente de pago', 409)
  }
  if (project.invoices.length >= 99) return fail('Límite de facturas alcanzado')

  // ── Modo de pago de materiales ──
  // pro_adelanta: el profesional adelantó los materiales → van en la factura junto con la mano de obra.
  // cliente_paga_proveedor: el cliente paga los materiales directamente al proveedor →
  // la factura del profesional cubre SOLO mano de obra (los materiales salen por cobro del proveedor).
  const clientePagaMateriales = project.materialsPaymentMode === 'cliente_paga_proveedor'
  const materialsForInvoice = clientePagaMateriales ? [] : project.materials

  const laborAlreadyInvoiced = project.invoices.some((i) => i.laborCost > 0)
  const includeLabor = project.laborCost > 0 && !laborAlreadyInvoiced

  if (!includeLabor && materialsForInvoice.length === 0) {
    if (project.laborCost <= 0 && !clientePagaMateriales) {
      return fail('Todavía no cotizaste la mano de obra y no hay materiales aprobados sin facturar')
    }
    if (project.laborCost <= 0) {
      return fail('Todavía no cotizaste la mano de obra (en este modo los materiales los cobra el proveedor directamente al cliente)')
    }
    return fail(laborAlreadyInvoiced
      ? 'La mano de obra ya fue facturada y no hay materiales aprobados sin facturar'
      : 'No hay materiales aprobados ni mano de obra para facturar')
  }

  const items = materialsForInvoice.map((m) => ({
    kind: 'material',
    description: `${m.name} — ${m.quantity} ${m.unit} x ${m.unitPrice}`,
    quantity: m.quantity,
    unitPrice: m.unitPrice,
    subtotal: Math.round(m.quantity * m.unitPrice * 100) / 100,
  }))
  const laborCost = includeLabor ? project.laborCost : 0
  if (includeLabor) {
    items.push({
      kind: 'mano_obra',
      description: 'Mano de obra',
      quantity: 1,
      unitPrice: project.laborCost,
      subtotal: project.laborCost,
    })
  }
  const materialsCost = Math.round(items.filter((i) => i.kind === 'material').reduce((a, i) => a + i.subtotal, 0) * 100) / 100
  const total = Math.round((materialsCost + laborCost) * 100) / 100
  const materialIds = materialsForInvoice.map((m) => m.id)
  const year = new Date().getFullYear()

  // Número secuencial HOM-2026-000001: count + 1 dentro de la transacción; si otro
  // profesional emitió en el mismo instante, colisiona el @unique y reintentamos.
  let invoice: Prisma.InvoiceGetPayload<{ include: { items: true } }> | null = null
  let lastError: unknown = null
  for (let attempt = 0; attempt < 3 && !invoice; attempt++) {
    try {
      invoice = await db.$transaction(async (tx) => {
        const count = await tx.invoice.count()
        const number = `HOM-${year}-${String(count + 1 + attempt).padStart(6, '0')}`
        const created = await tx.invoice.create({
          data: {
            projectId: id,
            number,
            clientId: project.clientId,
            professionalId: project.professionalId,
            laborCost,
            materialsCost,
            total,
            items: { create: items },
          },
          include: { items: true },
        })
        if (materialIds.length) {
          await tx.projectMaterial.updateMany({
            where: { id: { in: materialIds }, projectId: id, invoicedAt: null },
            data: { invoicedAt: new Date() },
          })
        }
        return created
      })
    } catch (e) {
      lastError = e
      const isUniqueClash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
      if (!isUniqueClash) throw e
    }
  }
  if (!invoice) {
    console.error('[invoice] no se pudo asignar número único', lastError)
    return fail('No pudimos numerar la factura: probá de nuevo en unos segundos', 503)
  }

  await db.notification.create({
    data: {
      userId: project.clientId,
      type: 'factura_emitida',
      title: 'Nueva factura',
      body: `${invoice.number} por ${total.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })} — "${project.title}"${clientePagaMateriales ? ' (solo mano de obra: los materiales los pagás al proveedor)' : ''}`,
      link: `#/panel/cliente/facturas`,
    },
  })

  return ok({ invoice }, 201)
}
