import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import {
  alreadyReturnedQty, isHomiaUploadUrl, materialPaidOrigin, purchasePaidOrigin, withinReturnWindow, round2,
  RETURN_WINDOW_DAYS, type PaidOrigin,
} from '@/lib/leftovers'

// ── SOBRANTES: devolución de materiales pagados al proveedor que los vendió ──
// GET  ?role=solicitante|proveedor [&projectId=|&purchaseId=] → mis devoluciones
// POST { projectId? | purchaseId?, items[] } → nueva solicitud (un solo proveedor)

const returnInclude = {
  items: { include: { element: { select: { id: true, name: true, unit: true } } }, orderBy: { id: 'asc' as const } },
  requester: { select: { id: true, displayName: true, avatarUrl: true, verificationStatus: true } },
  provider: { select: { id: true, businessName: true, userId: true, user: { select: { avatarUrl: true } } } },
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const sp = req.nextUrl.searchParams
  const role = sp.get('role') === 'proveedor' ? 'proveedor' : 'solicitante'
  const projectId = sp.get('projectId') || undefined
  const purchaseId = sp.get('purchaseId') || undefined

  let where: Record<string, unknown>
  if (role === 'proveedor') {
    const prov = await db.providerProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
    if (!prov) return fail('Solo los proveedores reciben devoluciones', 403)
    where = { providerId: prov.id }
  } else {
    where = { requesterId: user.id }
  }
  if (projectId) where.projectId = projectId
  if (purchaseId) where.purchaseId = purchaseId

  const rows = await db.leftoverReturn.findMany({
    where,
    include: returnInclude,
    orderBy: { requestedAt: 'desc' },
    take: 100,
  })

  // origen legible (título del proyecto o elemento de la compra)
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x))]
  const purchaseIds = [...new Set(rows.map((r) => r.purchaseId).filter((x): x is string => !!x))]
  const [projects, purchases] = await Promise.all([
    projectIds.length ? db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, title: true, clientId: true } }) : [],
    purchaseIds.length ? db.purchase.findMany({ where: { id: { in: purchaseIds } }, select: { id: true, elementName: true, quantity: true, unit: true } }) : [],
  ])
  const pMap = new Map(projects.map((p) => [p.id, p]))
  const cMap = new Map(purchases.map((p) => [p.id, p]))

  return ok({
    returns: rows.map((r) => ({
      ...r,
      origin: r.projectId
        ? {
            kind: 'proyecto', id: r.projectId, label: pMap.get(r.projectId)?.title || 'Proyecto',
            // el proveedor no tiene pantalla de proyecto; el solicitante entra por su panel (cliente o profesional)
            href: role === 'proveedor' ? '/panel/proveedor/cobros?tab=devoluciones'
              : `/panel/${pMap.get(r.projectId)?.clientId === user.id ? 'cliente' : 'profesional'}/proyectos/${r.projectId}`,
          }
        : r.purchaseId
          ? { kind: 'compra', id: r.purchaseId, label: cMap.get(r.purchaseId) ? `Compra: ${cMap.get(r.purchaseId)!.elementName} × ${cMap.get(r.purchaseId)!.quantity} ${cMap.get(r.purchaseId)!.unit}` : 'Compra directa', href: '/panel/cliente/materiales?tab=compras' }
          : null,
    })),
  })
}

const itemSchema = z.object({
  materialId: z.string().min(1).optional(),
  purchaseId: z.string().min(1).optional(),
  elementId: z.string().min(1, 'Falta el elemento del catálogo'),
  qty: z.coerce.number().positive('La cantidad tiene que ser mayor a cero'),
  condition: z.enum(['sin_abrir', 'abierto_sin_usar'], { message: 'Indicá el estado: sin abrir o abierto sin usar' }),
  photoUrl: z.string().min(1, 'La foto del sobrante es obligatoria'),
  note: z.string().max(400).optional(),
})
const createSchema = z.object({
  projectId: z.string().min(1).optional(),
  purchaseId: z.string().min(1).optional(),
  items: z.array(itemSchema).min(1, 'Agregá al menos un ítem a devolver').max(30),
})

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const parsed = await parseBody(req, createSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data
  if (!!d.projectId === !!d.purchaseId) return fail('Indicá el origen: un proyecto o una compra directa (uno solo)')
  for (const it of d.items) {
    if (!isHomiaUploadUrl(it.photoUrl)) return fail('La foto tiene que subirse desde HomIA (usá el botón de la app)')
  }

  type PreparedItem = {
    elementId: string; materialId: string | null; purchaseId: string | null
    qtyRequested: number; unitPricePaid: number; condition: string; photoUrl: string; note: string | null
  }
  let providerId: string
  let origin: PaidOrigin
  let originLabel: string
  const prepared: PreparedItem[] = []

  if (d.purchaseId) {
    // ── origen: compra directa ──
    const purchase = await db.purchase.findUnique({ where: { id: d.purchaseId } })
    if (!purchase) return fail('Compra no encontrada', 404)
    if (purchase.clientId !== user.id) return fail('Solo quien hizo la compra puede devolver sobrantes', 403)
    if (purchase.status !== 'pagado') return fail('Solo se devuelven sobrantes de compras pagadas', 409)
    origin = await purchasePaidOrigin(purchase)
    if (!withinReturnWindow(origin.paidAt)) return fail(`Las devoluciones se piden hasta ${RETURN_WINDOW_DAYS} días después del pago`, 409)
    providerId = purchase.providerId
    originLabel = `${purchase.elementName} × ${purchase.quantity} ${purchase.unit}`
    // una compra = un elemento: se agrupan las cantidades pedidas
    const total = d.items.reduce((a, i) => a + i.qty, 0)
    for (const it of d.items) {
      if (it.elementId !== purchase.elementId) return fail('El ítem no corresponde al elemento de esta compra', 400)
      if (it.purchaseId && it.purchaseId !== purchase.id) return fail('El ítem no corresponde a esta compra', 400)
    }
    const ya = await alreadyReturnedQty({ purchaseId: purchase.id })
    const restante = round2(purchase.quantity - ya)
    if (total > restante + 1e-9) return fail(`Podés devolver hasta ${restante} ${purchase.unit} de esta compra`, 409, { remaining: restante })
    for (const it of d.items) {
      prepared.push({
        elementId: purchase.elementId, materialId: null, purchaseId: purchase.id,
        qtyRequested: it.qty, unitPricePaid: purchase.unitPrice, condition: it.condition, photoUrl: it.photoUrl, note: it.note?.trim() || null,
      })
    }
  } else {
    // ── origen: proyecto ──
    const project = await db.project.findUnique({
      where: { id: d.projectId! },
      include: {
        pro: { select: { userId: true } },
        materials: true,
        invoices: true,
        charges: true,
      },
    })
    if (!project) return fail('Proyecto no encontrado', 404)
    const isClient = project.clientId === user.id
    const isPro = project.pro.userId === user.id
    if (!isClient && !isPro) return fail('Solo el cliente o el profesional del proyecto pueden devolver sobrantes', 403)
    originLabel = project.title

    let provId: string | null = null
    let firstOrigin: PaidOrigin | null = null
    // acumulado por material dentro de este mismo pedido (evita pasar el tope sumando ítems)
    const sumByMaterial = new Map<string, number>()
    for (const it of d.items) {
      if (!it.materialId) return fail('Cada ítem de un proyecto tiene que indicar el material (materialId)', 400)
      const m = project.materials.find((x) => x.id === it.materialId)
      if (!m) return fail('Material no encontrado en este proyecto', 404)
      if (m.status !== 'aprobado') return fail(`"${m.name}" no está aprobado en el proyecto`, 409)
      if (!m.providerId) return fail(`"${m.name}" no tiene proveedor asignado: no se puede devolver`, 409)
      if (m.elementId && it.elementId !== m.elementId) return fail(`El elemento no coincide con el material "${m.name}"`, 400)
      if (provId && provId !== m.providerId) return fail('Un pedido de devolución agrupa ítems de un solo proveedor. Hacé un pedido por proveedor', 409)
      provId = m.providerId
      const o = await materialPaidOrigin(m, project.invoices, project.charges)
      if (!o) return fail(`"${m.name}" todavía no está pagado: la devolución se pide sobre materiales pagados`, 409)
      if (!withinReturnWindow(o.paidAt)) return fail(`Las devoluciones se piden hasta ${RETURN_WINDOW_DAYS} días después del pago ("${m.name}")`, 409)
      if (!firstOrigin) firstOrigin = o
      else if (firstOrigin.chargeId !== o.chargeId || firstOrigin.invoiceId !== o.invoiceId) {
        return fail('Los ítems tienen que pertenecer al mismo pago (misma factura o cobro). Hacé un pedido por cada pago', 409)
      }
      const acc = (sumByMaterial.get(m.id) || 0) + it.qty
      sumByMaterial.set(m.id, acc)
      const ya = await alreadyReturnedQty({ materialId: m.id })
      const restante = round2(m.quantity - ya)
      if (acc > restante + 1e-9) return fail(`Podés devolver hasta ${restante} ${m.unit} de "${m.name}"`, 409, { remaining: restante, materialId: m.id })
      prepared.push({
        elementId: it.elementId || m.elementId || '', materialId: m.id, purchaseId: null,
        qtyRequested: it.qty, unitPricePaid: m.unitPrice, condition: it.condition, photoUrl: it.photoUrl, note: it.note?.trim() || null,
      })
    }
    if (!provId || !firstOrigin) return fail('No hay ítems válidos para devolver')
    for (const p of prepared) {
      if (!p.elementId) return fail('Un material no tiene elemento de catálogo asociado: no se puede devolver', 409)
    }
    providerId = provId
    origin = firstOrigin
  }

  const provider = await db.providerProfile.findUnique({ where: { id: providerId }, select: { id: true, userId: true, businessName: true } })
  if (!provider) return fail('Proveedor no encontrado', 404)
  if (provider.userId === user.id) return fail('No podés devolverte sobrantes a vos mismo')

  const created = await db.leftoverReturn.create({
    data: {
      requesterId: user.id,
      providerId: provider.id,
      projectId: d.projectId || null,
      purchaseId: d.purchaseId || null,
      chargeId: origin.chargeId,
      invoiceId: origin.invoiceId,
      paymentMethod: origin.paymentMethod,
      mpPaymentId: origin.mpPaymentId,
      status: 'solicitada',
      items: { create: prepared },
    },
    include: returnInclude,
  })

  const n = prepared.length
  const estimado = round2(prepared.reduce((a, i) => a + i.qtyRequested * i.unitPricePaid, 0))
  await db.notification.create({
    data: {
      userId: provider.userId,
      type: 'devolucion_solicitada',
      title: 'Te pidieron devolver sobrantes',
      body: `${user.displayName} quiere devolver ${n} ítem${n === 1 ? '' : 's'} de ${originLabel} (hasta ${formatARS(estimado)}). Revisalo y aceptá, ajustá o rechazá.`,
      link: '#/panel/proveedor/cobros?tab=devoluciones',
    },
  })
  // mensaje automático solo si ya existe conversación entre ambos (el cliente siempre inicia)
  const [a, b] = [user.id, provider.userId].sort()
  const conv = await db.conversation.findFirst({ where: { userAId: a, userBId: b }, select: { id: true } })
  if (conv) {
    await db.message.create({
      data: {
        conversationId: conv.id,
        senderId: user.id,
        body: `↩️ Te pedí devolver sobrantes (${n} ítem${n === 1 ? '' : 's'}) de ${originLabel}. Lo ves en Cobros → Devoluciones.`,
      },
    })
  }

  return ok({ return: created }, 201)
}

function formatARS(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}
