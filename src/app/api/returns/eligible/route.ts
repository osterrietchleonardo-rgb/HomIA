import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { alreadyReturnedQty, materialPaidOrigin, purchasePaidOrigin, withinReturnWindow, round2, proLegStatus, sellerKindOf, RETURN_WINDOW_DAYS } from '@/lib/leftovers'
import { purchaseLines } from '@/lib/orders'

// GET /api/returns/eligible?projectId=|purchaseId= [&tipo=cliente|profesional_a_proveedor]
// Qué materiales pagados puede devolver el usuario y cuánto le queda por devolver.
// Misma regla que POST /api/returns: origen pagado, ≤ 30 días, cantidad restante.
// Cada ítem dice a quién se devuelve (sellerKind + sellerName): proveedor, o el profesional
// cuando el material se cobró en su factura (D14).
// tipo=profesional_a_proveedor (solo el profesional del proyecto): lo que puede pedirle a
// cada proveedor + `prefill` con lo que ya le devolvió el cliente (para precargar).
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const sp = req.nextUrl.searchParams
  const projectId = sp.get('projectId')
  const purchaseId = sp.get('purchaseId')
  const tipo = sp.get('tipo') === 'profesional_a_proveedor' ? 'profesional_a_proveedor' : 'cliente'
  if (!!projectId === !!purchaseId) return fail('Indicá projectId o purchaseId (uno solo)')
  if (tipo === 'profesional_a_proveedor' && !projectId) return fail('La devolución al proveedor se pide desde un proyecto')

  type Eligible = {
    materialId: string | null; purchaseId: string | null; purchaseItemId: string | null; elementId: string; name: string; unit: string
    quantity: number; remaining: number; unitPrice: number
    providerId: string; providerName: string; paymentMethod: string | null; paidAt: Date | null; chargeId: string | null; invoiceId: string | null
    sellerKind: 'proveedor' | 'profesional'; sellerName: string
  }
  const items: Eligible[] = []
  let notEligibleReason: string | null = null

  if (purchaseId) {
    const purchase = await db.purchase.findUnique({
      where: { id: purchaseId },
      include: { provider: { select: { id: true, businessName: true } }, items: { orderBy: { createdAt: 'asc' } } },
    })
    if (!purchase) return fail('Compra no encontrada', 404)
    if (purchase.clientId !== user.id) return fail('No tenés acceso a esta compra', 403)
    let serviceFee = 0
    if (purchase.status !== 'pagado') notEligibleReason = 'Solo se devuelven sobrantes de compras pagadas'
    else {
      const o = await purchasePaidOrigin(purchase)
      serviceFee = o.serviceFee
      if (!withinReturnWindow(o.paidAt)) notEligibleReason = `Pasaron más de ${RETURN_WINDOW_DAYS} días del pago`
      else {
        // compras del carrito: un elegible por ítem (PurchaseItem); históricas: el ítem único
        for (const l of purchaseLines(purchase)) {
          const ya = await alreadyReturnedQty(l.legacy ? { purchaseId: purchase.id } : { purchaseItemId: l.id })
          const remaining = round2(l.quantity - ya)
          if (remaining <= 0) continue
          items.push({
            materialId: null, purchaseId: purchase.id, purchaseItemId: l.legacy ? null : l.id, elementId: l.elementId, name: l.elementName, unit: l.unit,
            quantity: l.quantity, remaining, unitPrice: l.unitPrice,
            providerId: purchase.provider.id, providerName: purchase.provider.businessName,
            paymentMethod: o.paymentMethod, paidAt: o.paidAt, chargeId: o.chargeId, invoiceId: o.invoiceId,
            sellerKind: 'proveedor', sellerName: purchase.provider.businessName,
          })
        }
        if (items.length === 0) notEligibleReason = 'Ya devolviste todo lo comprado'
      }
    }
    // el cargo de servicio HomIA (1%) de un pago por MP no se reembolsa: la UI lo aclara
    return ok({ items, notEligibleReason, windowDays: RETURN_WINDOW_DAYS, serviceFee })
  }

  const project = await db.project.findUnique({
    where: { id: projectId! },
    include: {
      pro: { select: { id: true, userId: true, companyName: true, user: { select: { displayName: true } } } },
      materials: { include: { provider: { select: { id: true, businessName: true } }, element: { select: { id: true, name: true } } } },
      invoices: true,
      charges: true,
    },
  })
  if (!project) return fail('Proyecto no encontrado', 404)
  if (project.clientId !== user.id && project.pro.userId !== user.id) return fail('No tenés acceso a este proyecto', 403)
  const isPro = project.pro.userId === user.id
  const proName = project.pro.companyName || project.pro.user.displayName

  if (tipo === 'profesional_a_proveedor') {
    if (!isPro) return fail('Solo el profesional del proyecto le pide devoluciones al proveedor', 403)
    for (const m of project.materials) {
      if (!m.provider || !m.elementId) continue
      const stt = proLegStatus(m, project, project.charges)
      if (!stt.ok) continue
      const ya = await alreadyReturnedQty({ materialId: m.id }, undefined, 'profesional_a_proveedor')
      const remaining = round2(m.quantity - ya)
      if (remaining <= 0) continue
      items.push({
        materialId: m.id, purchaseId: null, purchaseItemId: null, elementId: m.elementId, name: m.element?.name || m.name, unit: m.unit,
        quantity: m.quantity, remaining, unitPrice: m.unitPrice,
        providerId: m.provider.id, providerName: m.provider.businessName,
        // el pago profesional → proveedor fue por fuera de HomIA
        paymentMethod: null, paidAt: stt.since, chargeId: null, invoiceId: null,
        sellerKind: 'proveedor', sellerName: m.provider.businessName,
      })
    }
    // lo que el cliente ya le devolvió (recibido) en este proyecto, para precargar el pedido
    const received = await db.leftoverReturn.findMany({
      where: { projectId: project.id, tipo: 'cliente', sellerKind: 'profesional', professionalId: project.pro.id, status: { in: ['recibida', 'reembolsada', 'reembolso_fallido'] } },
      include: { items: true },
      orderBy: { receivedAt: 'desc' },
      take: 20,
    })
    const prefill = received.flatMap((r) => r.items
      .filter((i) => i.status === 'aceptado' && (i.qtyReceived ?? 0) > 0 && !!i.materialId)
      .map((i) => ({ returnId: r.id, receivedAt: r.receivedAt, materialId: i.materialId!, qty: i.qtyReceived!, condition: i.condition, photoUrl: i.photoUrl, note: i.note })))
    if (items.length === 0) notEligibleReason = 'No hay materiales que le hayas comprado a un proveedor para este proyecto con cantidad por devolver (o pasaron más de 30 días)'
    return ok({ items, prefill, notEligibleReason, windowDays: RETURN_WINDOW_DAYS, serviceFee: 0 })
  }

  let projectFee = 0
  let proSellerSkipped = false
  for (const m of project.materials) {
    if (m.status !== 'aprobado' || !m.providerId || !m.provider || !m.elementId) continue
    const o = await materialPaidOrigin(m, project.invoices, project.charges)
    if (!o || !withinReturnWindow(o.paidAt)) continue
    const sellerKind = sellerKindOf(o)
    // el profesional no se devuelve a sí mismo lo que cobró en su factura (usa la pata al proveedor)
    if (sellerKind === 'profesional' && isPro) { proSellerSkipped = true; continue }
    if (o.serviceFee > projectFee) projectFee = o.serviceFee
    const ya = await alreadyReturnedQty({ materialId: m.id })
    const remaining = round2(m.quantity - ya)
    if (remaining <= 0) continue
    items.push({
      materialId: m.id, purchaseId: null, purchaseItemId: null, elementId: m.elementId, name: m.element?.name || m.name, unit: m.unit,
      quantity: m.quantity, remaining, unitPrice: m.unitPrice,
      providerId: m.provider.id, providerName: m.provider.businessName,
      paymentMethod: o.paymentMethod, paidAt: o.paidAt, chargeId: o.chargeId, invoiceId: o.invoiceId,
      sellerKind, sellerName: sellerKind === 'profesional' ? proName : m.provider.businessName,
    })
  }
  if (items.length === 0) {
    notEligibleReason = proSellerSkipped
      ? 'Los materiales de este proyecto se los cobraste al cliente en tu factura: para devolvérselos a tu proveedor usá "Pedir devolución al proveedor"'
      : 'No hay materiales pagados con sobrantes para devolver (o pasaron más de 30 días del pago)'
  }
  return ok({ items, notEligibleReason, windowDays: RETURN_WINDOW_DAYS, serviceFee: projectFee })
}
