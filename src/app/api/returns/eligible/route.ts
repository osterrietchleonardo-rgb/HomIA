import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { alreadyReturnedQty, materialPaidOrigin, purchasePaidOrigin, withinReturnWindow, round2, RETURN_WINDOW_DAYS } from '@/lib/leftovers'

// GET /api/returns/eligible?projectId=|purchaseId=
// Qué materiales pagados puede devolver el usuario y cuánto le queda por devolver.
// Misma regla que POST /api/returns: origen pagado, ≤ 30 días, cantidad restante.
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const sp = req.nextUrl.searchParams
  const projectId = sp.get('projectId')
  const purchaseId = sp.get('purchaseId')
  if (!!projectId === !!purchaseId) return fail('Indicá projectId o purchaseId (uno solo)')

  type Eligible = {
    materialId: string | null; purchaseId: string | null; elementId: string; name: string; unit: string
    quantity: number; remaining: number; unitPrice: number
    providerId: string; providerName: string; paymentMethod: string | null; paidAt: Date | null; chargeId: string | null; invoiceId: string | null
  }
  const items: Eligible[] = []
  let notEligibleReason: string | null = null

  if (purchaseId) {
    const purchase = await db.purchase.findUnique({ where: { id: purchaseId }, include: { provider: { select: { id: true, businessName: true } } } })
    if (!purchase) return fail('Compra no encontrada', 404)
    if (purchase.clientId !== user.id) return fail('No tenés acceso a esta compra', 403)
    if (purchase.status !== 'pagado') notEligibleReason = 'Solo se devuelven sobrantes de compras pagadas'
    else {
      const o = await purchasePaidOrigin(purchase)
      if (!withinReturnWindow(o.paidAt)) notEligibleReason = `Pasaron más de ${RETURN_WINDOW_DAYS} días del pago`
      else {
        const ya = await alreadyReturnedQty({ purchaseId: purchase.id })
        const remaining = round2(purchase.quantity - ya)
        if (remaining > 0) {
          items.push({
            materialId: null, purchaseId: purchase.id, elementId: purchase.elementId, name: purchase.elementName, unit: purchase.unit,
            quantity: purchase.quantity, remaining, unitPrice: purchase.unitPrice,
            providerId: purchase.provider.id, providerName: purchase.provider.businessName,
            paymentMethod: o.paymentMethod, paidAt: o.paidAt, chargeId: o.chargeId, invoiceId: o.invoiceId,
          })
        } else notEligibleReason = 'Ya devolviste todo lo comprado'
      }
    }
    return ok({ items, notEligibleReason, windowDays: RETURN_WINDOW_DAYS })
  }

  const project = await db.project.findUnique({
    where: { id: projectId! },
    include: {
      pro: { select: { userId: true } },
      materials: { include: { provider: { select: { id: true, businessName: true } }, element: { select: { id: true, name: true } } } },
      invoices: true,
      charges: true,
    },
  })
  if (!project) return fail('Proyecto no encontrado', 404)
  if (project.clientId !== user.id && project.pro.userId !== user.id) return fail('No tenés acceso a este proyecto', 403)

  for (const m of project.materials) {
    if (m.status !== 'aprobado' || !m.providerId || !m.provider || !m.elementId) continue
    const o = await materialPaidOrigin(m, project.invoices, project.charges)
    if (!o || !withinReturnWindow(o.paidAt)) continue
    const ya = await alreadyReturnedQty({ materialId: m.id })
    const remaining = round2(m.quantity - ya)
    if (remaining <= 0) continue
    items.push({
      materialId: m.id, purchaseId: null, elementId: m.elementId, name: m.element?.name || m.name, unit: m.unit,
      quantity: m.quantity, remaining, unitPrice: m.unitPrice,
      providerId: m.provider.id, providerName: m.provider.businessName,
      paymentMethod: o.paymentMethod, paidAt: o.paidAt, chargeId: o.chargeId, invoiceId: o.invoiceId,
    })
  }
  if (items.length === 0) notEligibleReason = 'No hay materiales pagados con sobrantes para devolver (o pasaron más de 30 días del pago)'
  return ok({ items, notEligibleReason, windowDays: RETURN_WINDOW_DAYS })
}
