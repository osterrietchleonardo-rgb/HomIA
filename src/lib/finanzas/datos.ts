// Finanzas (D24): arma la entrada de calculos.ts con datos REALES de la base.
// Todo en paralelo (con el pooler cada consulta Prisma son ~4 idas a la base): 8-9
// consultas simultáneas por pedido, filtradas por el usuario de la sesión.
//
// De dónde sale cada automático (ver LOGICA-HOMIA §16):
//  · Profesional: facturas de sus proyectos (Invoice; emitida = issuedAt, cobrada = paidAt con
//    status pagada); devoluciones de sobrantes que reembolsó como vendedor (restan ventas) y las
//    que le reembolsaron como comprador (reintegros); materiales que compró en HomIA (cobros de
//    proveedor pagados donde es el cliente y sin proyecto) y subcontratos por HomIA (facturas de
//    un proyecto hijo, D16, donde es el cliente).
//  · Proveedor: sus cobros (ProviderCharge; emitido = createdAt, cobrado = paidAt con status
//    pagada; anulada y reembolsada no cuentan) con sus líneas (PurchaseItem o ProjectMaterial)
//    para el costo de lo vendido; devoluciones de sobrantes reembolsadas; su stock con unitCost.
import 'server-only'
import { db } from '@/lib/db'
import { parseJson } from '@/lib/api'
import type {
  EntradaFinanzas, VentaAuto, DevolucionAuto, CostoAuto, Movimiento, LineaStock, ConfigFinanzas,
} from './calculos'
import type { RolFinanzas, TipoMovimiento } from './conceptos'

export type Tags = Record<string, string> // chargeId → projectId | 'personal'

export type ConfigRow = {
  openingCash: number | null
  openingDate: Date | null
  estimatedCostPct: number | null
  onboardedAt: Date | null
  tags: Tags
}

export async function leerConfig(userId: string, role: RolFinanzas): Promise<ConfigRow> {
  const c = await db.financeConfig.findUnique({ where: { userId_role: { userId, role } } })
  return {
    openingCash: c?.openingCash ?? null,
    openingDate: c?.openingDate ?? null,
    estimatedCostPct: c?.estimatedCostPct ?? null,
    onboardedAt: c?.onboardedAt ?? null,
    tags: parseJson<Tags>(c?.tags, {}),
  }
}

function aConfig(c: ConfigRow): ConfigFinanzas {
  return { saldoInicial: c.openingCash, fechaSaldoInicial: c.openingDate, costoEstimadoPct: c.estimatedCostPct }
}

export function aMovimiento(r: {
  id: string; type: string; category: string; description: string; amount: number; interestAmount: number | null; date: Date
  paymentMethod: string | null; recurring: string | null; recurringUntil: Date | null; projectId: string | null
  usefulLifeMonths: number | null; status: string; attachmentUrl: string | null
}): Movimiento {
  return {
    id: r.id, type: r.type as TipoMovimiento, category: r.category, description: r.description, amount: r.amount,
    interestAmount: r.interestAmount, date: r.date, paymentMethod: r.paymentMethod,
    recurring: r.recurring === 'mensual' ? 'mensual' : null, recurringUntil: r.recurringUntil, projectId: r.projectId,
    usefulLifeMonths: r.usefulLifeMonths, status: r.status === 'pendiente' ? 'pendiente' : 'pagado', attachmentUrl: r.attachmentUrl,
  }
}

const ENTRY_SELECT = {
  id: true, type: true, category: true, description: true, amount: true, interestAmount: true, date: true, paymentMethod: true,
  recurring: true, recurringUntil: true, projectId: true, usefulLifeMonths: true, status: true, attachmentUrl: true,
} as const

export type Extra = {
  config: ConfigRow
  /** proveedor: plan vigente (para sugerir la suscripción como gasto, nunca cargarla sola) */
  plan?: { subscription: string; proSince: Date | null } | null
  /** para el formulario: obras propias */
  obras: { id: string; title: string; status: string }[]
  /** proveedor: líneas de stock (para la carga de costos) */
  stock: LineaStock[]
}

export async function cargarEntrada(userId: string, rol: RolFinanzas, hoy = new Date()): Promise<{ entrada: EntradaFinanzas; extra: Extra }> {
  return rol === 'profesional' ? cargarProfesional(userId, hoy) : cargarProveedor(userId, hoy)
}

async function cargarProfesional(userId: string, hoy: Date) {
  const [config, entries, invoices, returns, charges, subInvoices, bids, projects] = await Promise.all([
    leerConfig(userId, 'profesional'),
    db.financeEntry.findMany({ where: { userId, role: 'profesional', deletedAt: null }, select: ENTRY_SELECT, orderBy: { date: 'asc' }, take: 5000 }),
    db.invoice.findMany({
      where: { project: { pro: { userId } } },
      select: { id: true, number: true, projectId: true, clientId: true, laborCost: true, materialsCost: true, total: true, status: true, issuedAt: true, paidAt: true, project: { select: { title: true } } },
      take: 5000,
    }),
    db.leftoverReturn.findMany({
      where: { status: 'reembolsada', OR: [{ professional: { userId }, sellerKind: 'profesional' }, { requesterId: userId }] },
      select: { id: true, requesterId: true, sellerKind: true, professionalId: true, refundTotal: true, refundedAt: true, receivedAt: true, respondedAt: true, requestedAt: true, projectId: true, chargeId: true, tipo: true, professional: { select: { userId: true } } },
      take: 2000,
    }),
    // cobros de proveedores que pagó como cliente: compras de HomIA (sin proyecto)
    db.providerCharge.findMany({
      where: { clientId: userId, status: 'pagada', projectId: null },
      select: { id: true, number: true, description: true, amount: true, paidAt: true, createdAt: true, provider: { select: { businessName: true } } },
      take: 5000,
    }),
    // subcontratos (D16): facturas de proyectos hijos de sus obras, donde él es el cliente
    db.invoice.findMany({
      where: { clientId: userId, project: { parent: { pro: { userId } } } },
      select: { id: true, number: true, total: true, issuedAt: true, paidAt: true, status: true, project: { select: { title: true, parentProjectId: true } } },
      take: 2000,
    }),
    db.jobBid.findMany({ where: { professional: { userId } }, select: { status: true, createdAt: true }, take: 5000 }),
    db.project.findMany({ where: { pro: { userId } }, select: { id: true, title: true, status: true }, orderBy: { createdAt: 'desc' }, take: 1000 }),
  ])

  const ventas: VentaAuto[] = invoices.map((i) => ({
    id: i.id, kind: 'factura', numero: i.number, descripcion: i.project.title, total: i.total, manoObra: i.laborCost, materiales: i.materialsCost,
    emitida: i.issuedAt, cobradaEn: i.status === 'pagada' ? i.paidAt ?? i.issuedAt : null, clienteId: i.clientId, projectId: i.projectId,
    link: `/panel/profesional/proyectos/${i.projectId}`,
  }))
  const devoluciones: DevolucionAuto[] = returns.flatMap((r): DevolucionAuto[] => {
    const vendedor = r.sellerKind === 'profesional' && r.professional?.userId === userId
    const tag = r.chargeId ? config.tags[r.chargeId] : undefined
    // reintegro de una compra marcada "no es del negocio": tampoco cuenta
    if (!vendedor && tag === 'personal') return []
    return [{
      id: r.id, kind: vendedor ? 'venta' : 'reintegro', monto: r.refundTotal,
      fecha: r.refundedAt || r.receivedAt || r.respondedAt || r.requestedAt,
      descripcion: vendedor ? 'Reembolso a tu cliente por sobrantes' : r.tipo === 'profesional_a_proveedor' ? 'Te reembolsó tu proveedor (sobrantes)' : 'Reembolso de sobrantes que devolviste',
      link: vendedor ? '/panel/profesional/devoluciones' : r.projectId ? `/panel/profesional/proyectos/${r.projectId}` : '/panel/profesional/pedidos',
      projectId: r.projectId ?? (tag && tag !== 'personal' ? tag : null),
    }]
  })
  const costosAuto: CostoAuto[] = [
    ...charges.map((c): CostoAuto => {
      const tag = config.tags[c.id]
      return {
        id: c.id, kind: 'compra_homia', monto: c.amount, fecha: c.paidAt ?? c.createdAt, pagadoEn: c.paidAt ?? c.createdAt,
        descripcion: `${c.number} · ${c.provider.businessName}: ${c.description}`, link: '/panel/profesional/pedidos',
        projectId: tag && tag !== 'personal' ? tag : null, personal: tag === 'personal',
      }
    }),
    ...subInvoices.map((i): CostoAuto => ({
      id: i.id, kind: 'subcontrato_homia', monto: i.total, fecha: i.issuedAt, pagadoEn: i.status === 'pagada' ? i.paidAt ?? i.issuedAt : null,
      descripcion: `${i.number} · ${i.project.title}`, link: i.project.parentProjectId ? `/panel/profesional/proyectos/${i.project.parentProjectId}` : '/panel/profesional/proyectos',
      projectId: i.project.parentProjectId, personal: false,
    })),
  ]
  return {
    entrada: {
      rol: 'profesional' as const, hoy, config: aConfig(config), ventas, devoluciones, costosAuto,
      movimientos: entries.map(aMovimiento), stock: [], ofertas: bids, obras: projects.map((p) => ({ id: p.id, title: p.title })),
    },
    extra: { config, plan: null, obras: projects, stock: [] },
  }
}

type LineaVenta = { chargeId: string; elementId: string | null; nombre: string; cantidad: number; precioUnitario: number }

async function cargarProveedor(userId: string, hoy: Date) {
  const [config, entries, charges, items, materials, stock, returns, prov] = await Promise.all([
    leerConfig(userId, 'proveedor'),
    db.financeEntry.findMany({ where: { userId, role: 'proveedor', deletedAt: null }, select: ENTRY_SELECT, orderBy: { date: 'asc' }, take: 5000 }),
    db.providerCharge.findMany({
      where: { provider: { userId }, status: { notIn: ['anulada', 'reembolsada'] } },
      select: { id: true, number: true, description: true, projectId: true, clientId: true, amount: true, status: true, createdAt: true, paidAt: true, materialIds: true },
      take: 10000,
    }),
    db.purchaseItem.findMany({
      where: { purchase: { provider: { userId }, chargeId: { not: null } } },
      select: { elementId: true, elementName: true, quantity: true, unitPrice: true, purchase: { select: { chargeId: true } } },
      take: 20000,
    }),
    db.projectMaterial.findMany({
      where: { provider: { userId } },
      select: { id: true, elementId: true, name: true, quantity: true, unitPrice: true },
      take: 20000,
    }),
    db.providerStock.findMany({
      where: { provider: { userId } },
      select: { id: true, elementId: true, price: true, quantity: true, unitCost: true, brand: true, element: { select: { name: true, category: { select: { name: true } } } } },
      orderBy: { element: { name: 'asc' } },
      take: 5000,
    }),
    db.leftoverReturn.findMany({
      where: { provider: { userId }, status: 'reembolsada' },
      select: { id: true, refundTotal: true, refundedAt: true, receivedAt: true, respondedAt: true, requestedAt: true, tipo: true, projectId: true, items: { select: { elementId: true, qtyReceived: true, qtyAccepted: true } } },
      take: 2000,
    }),
    db.providerProfile.findUnique({ where: { userId }, select: { subscription: true, proSince: true } }),
  ])

  const lineas = new Map<string, LineaVenta[]>()
  const push = (l: LineaVenta) => { lineas.set(l.chargeId, [...(lineas.get(l.chargeId) || []), l]) }
  for (const it of items) {
    if (it.purchase.chargeId) push({ chargeId: it.purchase.chargeId, elementId: it.elementId, nombre: it.elementName, cantidad: it.quantity, precioUnitario: it.unitPrice })
  }
  const matById = new Map(materials.map((m) => [m.id, m]))
  for (const c of charges) {
    if (!c.projectId) continue
    for (const mid of parseJson<string[]>(c.materialIds, [])) {
      const m = matById.get(mid)
      if (m) push({ chargeId: c.id, elementId: m.elementId, nombre: m.name, cantidad: m.quantity, precioUnitario: m.unitPrice })
    }
  }
  const ventas: VentaAuto[] = charges.map((c) => ({
    id: c.id, kind: 'cobro', numero: c.number, descripcion: c.description, total: c.amount, emitida: c.createdAt,
    cobradaEn: c.status === 'pagada' ? c.paidAt ?? c.createdAt : null, clienteId: c.clientId, projectId: c.projectId,
    link: '/panel/proveedor/cobros?tab=ventas', lineas: lineas.get(c.id) || [],
  }))
  const devoluciones: DevolucionAuto[] = returns.map((r) => ({
    id: r.id, kind: 'venta', monto: r.refundTotal, fecha: r.refundedAt || r.receivedAt || r.respondedAt || r.requestedAt,
    descripcion: r.tipo === 'profesional_a_proveedor' ? 'Reembolso a un profesional por sobrantes (venta por fuera de HomIA)' : 'Reembolso a un cliente por sobrantes',
    link: '/panel/proveedor/cobros', projectId: null,
    lineas: r.items.map((i) => ({ elementId: i.elementId, cantidad: i.qtyReceived ?? i.qtyAccepted ?? 0 })).filter((i) => i.cantidad > 0),
  }))
  const lineasStock: LineaStock[] = stock.map((s) => ({ id: s.id, elementId: s.elementId, nombre: s.element.name, detalle: s.brand || s.element.category?.name || null, cantidad: s.quantity, precio: s.price, costo: s.unitCost }))
  return {
    entrada: {
      rol: 'proveedor' as const, hoy, config: aConfig(config), ventas, devoluciones, costosAuto: [],
      movimientos: entries.map(aMovimiento), stock: lineasStock, ofertas: [], obras: [],
    },
    extra: { config, plan: prov ? { subscription: prov.subscription, proSince: prov.proSince } : null, obras: [], stock: lineasStock },
  }
}
