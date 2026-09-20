import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { planState } from '@/lib/plans'

// PATCH /api/purchases/[id] — ciclo de vida de una compra directa:
//   proveedor: aceptar | entregar (emite cobro PRV al cliente) | cancelar
//   cliente:   cancelar (mientras no esté entregada)
// La entrega emite un ProviderCharge de venta directa (projectId null) y el
// pago corre por los rieles existentes: /api/charges/[id] (MP o efectivo).
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const purchase = await db.purchase.findUnique({
    where: { id },
    include: {
      provider: true,
      client: { select: { id: true, displayName: true } },
    },
  })
  if (!purchase) return fail('Compra no encontrada', 404)

  const isClient = purchase.clientId === user.id
  const isProvider = purchase.provider.userId === user.id
  if (!isClient && !isProvider) return fail('No tenés acceso a esta compra', 403)

  const d = await body<{ action?: 'aceptar' | 'entregar' | 'cancelar'; total?: number }>(req)

  // ── cancelar (cualquiera de las dos partes, antes de la entrega) ──
  if (d.action === 'cancelar') {
    if (['entregado', 'pagado'].includes(purchase.status)) {
      return fail('La compra ya fue entregada: no se puede cancelar, coordiná con la otra parte')
    }
    if (purchase.status === 'cancelado') return fail('Esta compra ya está cancelada')
    await db.purchase.update({ where: { id }, data: { status: 'cancelado' } })
    const otherId = isClient ? purchase.provider.userId : purchase.clientId
    await db.notification.create({
      data: {
        userId: otherId,
        type: 'compra_cancelada',
        title: 'Pedido cancelado',
        body: `${user.displayName} canceló el pedido de ${purchase.elementName} × ${purchase.quantity} ${purchase.unit}.`,
        link: isClient ? '#/panel/proveedor/cobros?tab=ventas' : '#/panel/cliente/materiales?tab=compras',
      },
    })
    return ok({ success: true, status: 'cancelado' })
  }

  if (!isProvider) return fail('Solo el proveedor puede gestionar tu pedido', 403)

  // ── Trial vencido sin plan: el proveedor no puede gestionar ventas ──
  const state = planState(purchase.provider)
  if (!state.activo) {
    return fail('Tu prueba gratis terminó: elegí un plan (Básico US$50/mes o PRO US$100/mes) para seguir vendiendo', 403, {
      needsPlan: true,
    })
  }

  // ── aceptar ──
  if (d.action === 'aceptar') {
    if (purchase.status !== 'solicitado') return fail('Solo se aceptan pedidos nuevos')
    await db.purchase.update({ where: { id }, data: { status: 'aceptado' } })
    await db.notification.create({
      data: {
        userId: purchase.clientId,
        type: 'compra_aceptada',
        title: 'Tu pedido fue aceptado',
        body: `${purchase.provider.businessName} aceptó tu pedido de ${purchase.elementName}. Te avisa cuando lo tengas listo.`,
        link: '#/panel/cliente/materiales?tab=compras',
      },
    })
    return ok({ success: true, status: 'aceptado' })
  }

  // ── entregar → emite el cobro de venta directa ──
  if (d.action === 'entregar') {
    if (!['solicitado', 'aceptado'].includes(purchase.status)) {
      return fail('Este pedido ya fue entregado o cancelado')
    }
    if (purchase.chargeId) return fail('Este pedido ya tiene un cobro emitido')
    // precio final: el de la oferta, o el que el proveedor coordina al entregar
    let finalTotal = purchase.total
    if (finalTotal <= 0) {
      if (!d.total || d.total <= 0) {
        return fail('Este pedido se pidió sin precio (a coordinar): pasanos el precio final acordado para emitir el cobro', 400, { needsPrice: true })
      }
      finalTotal = Math.round(d.total * 100) / 100
      await db.purchase.update({ where: { id }, data: { unitPrice: Math.round((finalTotal / purchase.quantity) * 100) / 100, total: finalTotal } })
    }

    const year = new Date().getFullYear()
    const count = await db.providerCharge.count()
    const number = `PRV-${year}-${String(count + 1).padStart(6, '0')}`

    const charge = await db.providerCharge.create({
      data: {
        projectId: null, // venta directa: sin proyecto
        providerId: purchase.providerId,
        clientId: purchase.clientId,
        number,
        description: `${purchase.elementName} × ${purchase.quantity} ${purchase.unit} (compra directa)`,
        materialIds: '[]',
        amount: finalTotal,
      },
    })
    await db.purchase.update({ where: { id }, data: { status: 'entregado', chargeId: charge.id } })
    await db.notification.create({
      data: {
        userId: purchase.clientId,
        type: 'compra_entregada',
        title: 'Tu pedido está listo',
        body: `${purchase.provider.businessName} entregó ${purchase.elementName}. Pagá el cobro ${number} con Mercado Pago o acordá efectivo.`,
        link: '#/panel/cliente/materiales?tab=compras',
      },
    })
    return ok({ success: true, status: 'entregado', charge })
  }

  return fail('Acción no reconocida: aceptar | entregar | cancelar')
}
