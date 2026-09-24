import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import {
  alreadyReturnedQty, isHomiaUploadUrl, materialPaidOrigin, purchasePaidOrigin, withinReturnWindow, round2,
  proLegStatus, sellerKindOf, RETURN_WINDOW_DAYS, type PaidOrigin,
} from '@/lib/leftovers'
import { purchaseLines } from '@/lib/orders'
import { logActivity } from '@/lib/activity'

// ── SOBRANTES: devolución de materiales a quien los vendió (D14, ver src/lib/leftovers.ts) ──
// GET  ?role=solicitante|proveedor|profesional [&tipo=cliente|profesional_a_proveedor] [&projectId=|&purchaseId=]
//      solicitante → las que pedí · proveedor → las que me piden a mí como proveedor ·
//      profesional → las que me piden mis clientes por materiales que les cobré en mi factura
// POST { tipo?: 'cliente' (default) | 'profesional_a_proveedor', projectId? | purchaseId?, parentReturnId?, items[] }

const returnInclude = {
  items: { include: { element: { select: { id: true, name: true, unit: true } } }, orderBy: { id: 'asc' as const } },
  requester: { select: { id: true, displayName: true, avatarUrl: true, verificationStatus: true } },
  provider: { select: { id: true, businessName: true, userId: true, user: { select: { avatarUrl: true } } } },
  professional: { select: { id: true, userId: true, companyName: true, user: { select: { displayName: true, avatarUrl: true } } } },
}

type ReturnWithSeller = {
  sellerKind: string
  provider: { businessName: string; userId: string } | null
  professional: { userId: string; companyName: string | null; user: { displayName: string } } | null
}
/** Nombre y usuario del vendedor (quien acepta, recibe y reembolsa). */
function sellerOf(r: ReturnWithSeller): { name: string; userId: string | null } {
  if (r.sellerKind === 'profesional' && r.professional) return { name: r.professional.companyName || r.professional.user.displayName, userId: r.professional.userId }
  return { name: r.provider?.businessName || 'Proveedor', userId: r.provider?.userId || null }
}

export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const sp = req.nextUrl.searchParams
  const roleParam = sp.get('role')
  const role = roleParam === 'proveedor' ? 'proveedor' : roleParam === 'profesional' ? 'profesional' : 'solicitante'
  const tipo = sp.get('tipo')
  const projectId = sp.get('projectId') || undefined
  const purchaseId = sp.get('purchaseId') || undefined

  let where: Record<string, unknown>
  if (role === 'proveedor') {
    const prov = await db.providerProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
    if (!prov) return fail('Solo los proveedores reciben devoluciones', 403)
    where = { providerId: prov.id, sellerKind: 'proveedor' }
  } else if (role === 'profesional') {
    const pro = await db.professionalProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
    if (!pro) return fail('Solo los profesionales reciben devoluciones de sus clientes', 403)
    where = { professionalId: pro.id, sellerKind: 'profesional' }
  } else {
    where = { requesterId: user.id }
  }
  if (tipo === 'cliente' || tipo === 'profesional_a_proveedor') where.tipo = tipo
  if (projectId) where.projectId = projectId
  if (purchaseId) where.purchaseId = purchaseId

  const rows = await db.leftoverReturn.findMany({
    where,
    include: { ...returnInclude, children: { select: { id: true, status: true, providerId: true } } },
    orderBy: { requestedAt: 'desc' },
    take: 100,
  })

  // origen legible (título del proyecto o elemento de la compra)
  const projectIds = [...new Set(rows.map((r) => r.projectId).filter((x): x is string => !!x))]
  const purchaseIds = [...new Set(rows.map((r) => r.purchaseId).filter((x): x is string => !!x))]
  const [projects, purchases] = await Promise.all([
    projectIds.length ? db.project.findMany({ where: { id: { in: projectIds } }, select: { id: true, title: true, clientId: true } }) : [],
    purchaseIds.length ? db.purchase.findMany({ where: { id: { in: purchaseIds } }, select: { id: true, elementName: true, orderId: true } }) : [],
  ])
  const pMap = new Map(projects.map((p) => [p.id, p]))
  const cMap = new Map(purchases.map((p) => [p.id, p]))

  const projectHref = (r: (typeof rows)[number]) => {
    if (role === 'proveedor') return '/panel/proveedor/cobros?tab=devoluciones'
    // el profesional (vendedor o solicitante al proveedor) entra por SU panel; el cliente por el suyo
    if (role === 'profesional' || r.tipo === 'profesional_a_proveedor') return `/panel/profesional/proyectos/${r.projectId}`
    return `/panel/${pMap.get(r.projectId!)?.clientId === user.id ? 'cliente' : 'profesional'}/proyectos/${r.projectId}`
  }

  return ok({
    returns: rows.map((r) => {
      const seller = sellerOf(r)
      return {
        ...r,
        sellerName: seller.name,
        sellerUserId: seller.userId,
        origin: r.projectId
          ? { kind: 'proyecto', id: r.projectId, label: pMap.get(r.projectId)?.title || 'Proyecto', href: projectHref(r) }
          : r.purchaseId
            ? {
                kind: 'compra', id: r.purchaseId,
                label: cMap.get(r.purchaseId) ? `Compra: ${cMap.get(r.purchaseId)!.elementName}` : 'Compra directa',
                href: role === 'proveedor' ? '/panel/proveedor/cobros?tab=ventas' : `/panel/${user.roles.includes('cliente') ? 'cliente' : 'profesional'}/pedidos/${cMap.get(r.purchaseId)?.orderId || `legacy-${r.purchaseId}`}`,
              }
            : null,
      }
    }),
  })
}

const itemSchema = z.object({
  materialId: z.string().min(1).optional(),
  purchaseId: z.string().min(1).optional(),
  purchaseItemId: z.string().min(1).optional(),
  elementId: z.string().min(1, 'Falta el elemento del catálogo'),
  qty: z.coerce.number().positive('La cantidad tiene que ser mayor a cero'),
  condition: z.enum(['sin_abrir', 'abierto_sin_usar'], { message: 'Indicá el estado: sin abrir o abierto sin usar' }),
  photoUrl: z.string().min(1, 'La foto del sobrante es obligatoria'),
  note: z.string().max(400).optional(),
})
const createSchema = z.object({
  tipo: z.enum(['cliente', 'profesional_a_proveedor'], { message: 'Tipo de devolución inválido' }).optional(),
  projectId: z.string().min(1).optional(),
  purchaseId: z.string().min(1).optional(),
  parentReturnId: z.string().min(1).optional(),
  items: z.array(itemSchema).min(1, 'Agregá al menos un ítem a devolver').max(30),
})

type PreparedItem = {
  elementId: string; materialId: string | null; purchaseId: string | null; purchaseItemId?: string | null
  qtyRequested: number; unitPricePaid: number; condition: string; photoUrl: string; note: string | null
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const parsed = await parseBody(req, createSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data
  const tipo = d.tipo || 'cliente'
  if (!!d.projectId === !!d.purchaseId) return fail('Indicá el origen: un proyecto o una compra directa (uno solo)')
  for (const it of d.items) {
    if (!isHomiaUploadUrl(it.photoUrl)) return fail('La foto tiene que subirse desde HomIA (usá el botón de la app)')
  }
  if (tipo === 'profesional_a_proveedor') return createProToProvider(user, d)
  if (d.parentReturnId) return fail('Solo una devolución del profesional al proveedor se vincula a otra devolución', 400)

  let sellerKind: 'proveedor' | 'profesional' = 'proveedor'
  let providerId: string | null = null
  let professionalId: string | null = null
  let origin: PaidOrigin
  let originLabel: string
  let requesterRole: 'cliente' | 'profesional' = 'cliente'
  const prepared: PreparedItem[] = []

  if (d.purchaseId) {
    // ── origen: compra (sub-pedido de un proveedor, con uno o más ítems) ──
    const purchase = await db.purchase.findUnique({ where: { id: d.purchaseId }, include: { items: { orderBy: { createdAt: 'asc' } } } })
    if (!purchase) return fail('Compra no encontrada', 404)
    if (purchase.clientId !== user.id) return fail('Solo quien hizo la compra puede devolver sobrantes', 403)
    if (purchase.status !== 'pagado') return fail('Solo se devuelven sobrantes de compras pagadas', 409)
    origin = await purchasePaidOrigin(purchase)
    if (!withinReturnWindow(origin.paidAt)) return fail(`Las devoluciones se piden hasta ${RETURN_WINDOW_DAYS} días después del pago`, 409)
    providerId = purchase.providerId
    originLabel = purchase.elementName
    const lines = purchaseLines(purchase)
    // cada ítem pedido se asigna a un ítem de la compra (por purchaseItemId o por elemento)
    const sumByLine = new Map<string, number>()
    for (const it of d.items) {
      if (it.purchaseId && it.purchaseId !== purchase.id) return fail('El ítem no corresponde a esta compra', 400)
      const line = it.purchaseItemId
        ? lines.find((l) => l.id === it.purchaseItemId)
        : lines.find((l) => l.elementId === it.elementId)
      if (!line) return fail(it.purchaseItemId ? 'El ítem no corresponde a esta compra' : 'El ítem no corresponde al elemento de esta compra', 400)
      if (line.elementId !== it.elementId) return fail('El elemento no coincide con el ítem de la compra', 400)
      const acc = round2((sumByLine.get(line.id) || 0) + it.qty)
      sumByLine.set(line.id, acc)
      const ya = await alreadyReturnedQty(line.legacy ? { purchaseId: purchase.id } : { purchaseItemId: line.id })
      const restante = round2(line.quantity - ya)
      if (acc > restante + 1e-9) return fail(`Podés devolver hasta ${restante} ${line.unit} de "${line.elementName}"`, 409, { remaining: restante })
      prepared.push({
        elementId: line.elementId, materialId: null, purchaseId: purchase.id, purchaseItemId: line.legacy ? null : line.id,
        qtyRequested: it.qty, unitPricePaid: line.unitPrice, condition: it.condition, photoUrl: it.photoUrl, note: it.note?.trim() || null,
      })
    }
  } else {
    // ── origen: proyecto ──
    const project = await db.project.findUnique({
      where: { id: d.projectId! },
      include: {
        pro: { select: { id: true, userId: true } },
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
    requesterRole = isClient ? 'cliente' : 'profesional'

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
      const o = await materialPaidOrigin(m, project.invoices, project.charges)
      if (!o) return fail(`"${m.name}" todavía no está pagado: la devolución se pide sobre materiales pagados`, 409)
      if (!withinReturnWindow(o.paidAt)) return fail(`Las devoluciones se piden hasta ${RETURN_WINDOW_DAYS} días después del pago ("${m.name}")`, 409)
      // D14: si el material lo cobró el profesional en su factura, él es el vendedor: no puede pedírselo a sí mismo
      if (o.invoiceId && isPro) {
        return fail(`"${m.name}" se lo cobraste al cliente en tu factura: para devolvérselo al proveedor usá "Pedir devolución al proveedor"`, 409)
      }
      if (!firstOrigin) firstOrigin = o
      else if (firstOrigin.chargeId !== o.chargeId || firstOrigin.invoiceId !== o.invoiceId) {
        return fail('Los ítems tienen que pertenecer al mismo pago (misma factura o cobro). Hacé un pedido por cada pago', 409)
      }
      // con vendedor proveedor, un pedido = un proveedor; con vendedor profesional, todos los de su factura
      if (!o.invoiceId) {
        if (provId && provId !== m.providerId) return fail('Un pedido de devolución agrupa ítems de un solo proveedor. Hacé un pedido por proveedor', 409)
        provId = m.providerId
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
    if (!firstOrigin) return fail('No hay ítems válidos para devolver')
    for (const p of prepared) {
      if (!p.elementId) return fail('Un material no tiene elemento de catálogo asociado: no se puede devolver', 409)
    }
    origin = firstOrigin
    sellerKind = sellerKindOf(origin)
    if (sellerKind === 'profesional') {
      // la factura la emitió el profesional del proyecto
      const inv = project.invoices.find((i) => i.id === origin.invoiceId)
      professionalId = inv?.professionalId || project.pro.id
    } else {
      if (!provId) return fail('No hay ítems válidos para devolver')
      providerId = provId
    }
  }

  // vendedor: quien acepta, recibe y reembolsa
  let sellerUserId: string
  let sellerName: string
  let sellerLink: string
  if (sellerKind === 'profesional') {
    const pro = await db.professionalProfile.findUnique({ where: { id: professionalId! }, select: { id: true, userId: true, companyName: true, user: { select: { displayName: true } } } })
    if (!pro) return fail('Profesional no encontrado', 404)
    sellerUserId = pro.userId
    sellerName = pro.companyName || pro.user.displayName
    sellerLink = '#/panel/profesional/devoluciones?tab=clientes'
  } else {
    const provider = await db.providerProfile.findUnique({ where: { id: providerId! }, select: { id: true, userId: true, businessName: true } })
    if (!provider) return fail('Proveedor no encontrado', 404)
    sellerUserId = provider.userId
    sellerName = provider.businessName
    sellerLink = '#/panel/proveedor/cobros?tab=devoluciones'
  }
  if (sellerUserId === user.id) return fail('No podés devolverte sobrantes a vos mismo')

  const created = await db.leftoverReturn.create({
    data: {
      requesterId: user.id,
      tipo: 'cliente',
      sellerKind,
      providerId,
      professionalId,
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
      userId: sellerUserId,
      type: 'devolucion_solicitada',
      title: 'Te pidieron devolver sobrantes',
      body: `${user.displayName} quiere devolver ${n} ítem${n === 1 ? '' : 's'} de ${originLabel} (hasta ${formatARS(estimado)}). Revisalo y aceptá, ajustá o rechazá.`,
      link: sellerLink,
    },
  })
  await chatNote(user.id, sellerUserId, `↩️ Te pedí devolver sobrantes (${n} ítem${n === 1 ? '' : 's'}) de ${originLabel}. Lo ves en ${sellerKind === 'profesional' ? 'Devoluciones' : 'Cobros → Devoluciones'}.`)
  await logActivity({
    projectId: d.projectId || null,
    purchaseId: d.purchaseId || null,
    actorId: user.id,
    actorRole: requesterRole,
    type: 'devolucion_solicitada',
    message: `${user.displayName} pidió devolver ${n} ítem${n === 1 ? '' : 's'} de sobrantes a ${sellerName} (hasta ${formatARS(estimado)}).`,
    data: { returnId: created.id, tipo: 'cliente', sellerKind },
  })

  return ok({ return: { ...created, sellerName, sellerUserId } }, 201)
}

/**
 * Pata profesional → proveedor (D14): el profesional del proyecto le devuelve al proveedor
 * materiales que le compró para ese proyecto (pago por fuera de HomIA). Tope por material:
 * lo que ese proveedor le vendió (cantidad aprobada) menos lo ya pedido en devoluciones
 * profesional → proveedor activas. Un pedido = un solo proveedor.
 */
async function createProToProvider(
  user: { id: string; displayName: string },
  d: z.infer<typeof createSchema>,
) {
  if (!d.projectId) return fail('La devolución al proveedor se pide desde un proyecto', 400)
  const project = await db.project.findUnique({
    where: { id: d.projectId },
    include: { pro: { select: { id: true, userId: true } }, materials: true, charges: { select: { status: true, materialIds: true } } },
  })
  if (!project) return fail('Proyecto no encontrado', 404)
  if (project.pro.userId !== user.id) return fail('Solo el profesional del proyecto puede pedirle la devolución al proveedor', 403)

  // devolución del cliente que la originó (opcional): tiene que ser de este proyecto y el vendedor, este profesional
  let parentReturnId: string | null = null
  if (d.parentReturnId) {
    const parent = await db.leftoverReturn.findUnique({ where: { id: d.parentReturnId }, select: { id: true, projectId: true, sellerKind: true, professionalId: true, tipo: true } })
    if (!parent || parent.projectId !== project.id || parent.sellerKind !== 'profesional' || parent.professionalId !== project.pro.id || parent.tipo !== 'cliente') {
      return fail('La devolución de origen no corresponde a este proyecto', 400)
    }
    parentReturnId = parent.id
  }

  let provId: string | null = null
  const prepared: PreparedItem[] = []
  const sumByMaterial = new Map<string, number>()
  for (const it of d.items) {
    if (!it.materialId) return fail('Cada ítem tiene que indicar el material del proyecto (materialId)', 400)
    const m = project.materials.find((x) => x.id === it.materialId)
    if (!m) return fail('Material no encontrado en este proyecto', 404)
    const stt = proLegStatus(m, project, project.charges)
    if (!stt.ok) return fail(`"${m.name}" no se puede devolver al proveedor: ${stt.reason}`, 409)
    if (it.elementId !== m.elementId) return fail(`El elemento no coincide con el material "${m.name}"`, 400)
    if (provId && provId !== m.providerId) return fail('Un pedido de devolución agrupa ítems de un solo proveedor. Hacé un pedido por proveedor', 409)
    provId = m.providerId
    const acc = round2((sumByMaterial.get(m.id) || 0) + it.qty)
    sumByMaterial.set(m.id, acc)
    const ya = await alreadyReturnedQty({ materialId: m.id }, undefined, 'profesional_a_proveedor')
    const restante = round2(m.quantity - ya)
    if (acc > restante + 1e-9) {
      return fail(`Podés pedirle a tu proveedor hasta ${restante} ${m.unit} de "${m.name}" (lo que te vendió para este proyecto menos lo ya pedido)`, 409, { remaining: restante, materialId: m.id })
    }
    prepared.push({
      elementId: m.elementId!, materialId: m.id, purchaseId: null,
      qtyRequested: it.qty, unitPricePaid: m.unitPrice, condition: it.condition, photoUrl: it.photoUrl, note: it.note?.trim() || null,
    })
  }
  if (!provId) return fail('No hay ítems válidos para devolver')
  const provider = await db.providerProfile.findUnique({ where: { id: provId }, select: { id: true, userId: true, businessName: true } })
  if (!provider) return fail('Proveedor no encontrado', 404)
  if (provider.userId === user.id) return fail('No podés devolverte sobrantes a vos mismo')

  const created = await db.leftoverReturn.create({
    data: {
      requesterId: user.id,
      tipo: 'profesional_a_proveedor',
      sellerKind: 'proveedor',
      providerId: provider.id,
      parentReturnId,
      projectId: project.id,
      // el pago profesional → proveedor fue por fuera de HomIA: no hay pago de origen en la plataforma
      paymentMethod: null,
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
      title: 'Un profesional te pide devolver materiales',
      body: `${user.displayName} quiere devolverte ${n} ítem${n === 1 ? '' : 's'} que te compró para el proyecto "${project.title}" (hasta ${formatARS(estimado)}). Revisalo y aceptá, ajustá o rechazá.`,
      link: '#/panel/proveedor/cobros?tab=devoluciones',
    },
  })
  await chatNote(user.id, provider.userId, `↩️ Te pedí devolver ${n} ítem${n === 1 ? '' : 's'} que te compré para "${project.title}". Lo ves en Cobros → Devoluciones.`)
  await logActivity({
    projectId: project.id, actorId: user.id, actorRole: 'profesional', type: 'devolucion_a_proveedor_solicitada',
    message: `${user.displayName} le pidió a ${provider.businessName} devolver ${n} ítem${n === 1 ? '' : 's'} de sobrantes.`,
    data: { returnId: created.id, tipo: 'profesional_a_proveedor', parentReturnId },
  })
  return ok({ return: { ...created, sellerName: provider.businessName, sellerUserId: provider.userId } }, 201)
}

/** Mensaje automático solo si ya existe la conversación (el cliente siempre inicia: acá no se abre ninguna). */
async function chatNote(fromId: string, toId: string, body: string) {
  const [a, b] = [fromId, toId].sort()
  const conv = await db.conversation.findFirst({ where: { userAId: a, userBId: b }, select: { id: true } })
  if (conv) await db.message.create({ data: { conversationId: conv.id, senderId: fromId, body } })
}

function formatARS(n: number) {
  return n.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })
}
