// Carrito — armado del contenido (servidor). Lo usan GET /api/cart (usuario
// logueado, carrito en la base) y POST /api/cart/preview (visitante: el carrito
// vive en su localStorage y acá solo se enriquece con precio/stock actuales).
// Cada línea trae su problema si lo hay: el carrito no se puede confirmar
// mientras quede alguna línea con problema.
import { db } from '@/lib/db'
import { puedeOperar } from '@/lib/plans'
import { qtyStepFor } from '@/lib/units'
import { round2, serviceFeeFor } from '@/lib/fees'

export type CartProblem = 'no_existe' | 'sin_stock' | 'stock_insuficiente' | 'proveedor_inactivo' | 'propio'

export type CartLine = {
  id: string // id del CartItem (logueado) o el stockId (visitante)
  stockId: string
  quantity: number
  price: number
  lineTotal: number
  available: number
  step: number
  brand: string | null
  imageUrl: string | null
  element: { id: string; name: string; unit: string; categoryName: string } | null
  problem: CartProblem | null
  problemText: string | null
}

export type CartGroup = {
  provider: { id: string; businessName: string; userId: string; avatarUrl: string | null; city: string | null; mpConnected: boolean; operating: boolean }
  items: CartLine[]
  subtotal: number
  serviceFee: number
  blocked: boolean
}

export type CartView = {
  groups: CartGroup[]
  orphans: CartLine[] // ofertas que ya no existen
  count: number // cantidad de líneas
  subtotal: number
  serviceFee: number
  totalMp: number
  blocked: boolean
}

const PROBLEM_TEXT: Record<CartProblem, string> = {
  no_existe: 'Esta oferta ya no existe: sacala del carrito',
  sin_stock: 'Se quedó sin stock: sacalo del carrito',
  stock_insuficiente: 'No hay stock para esa cantidad: bajala',
  proveedor_inactivo: 'El proveedor dejó de operar: sacalo del carrito',
  propio: 'Es un producto tuyo: no podés comprártelo',
}

export async function buildCartView(rows: { id: string; stockId: string; quantity: number }[], viewerUserId: string | null): Promise<CartView> {
  const stocks = rows.length
    ? await db.providerStock.findMany({
        where: { id: { in: rows.map((r) => r.stockId) } },
        include: {
          element: { include: { category: { select: { name: true } } } },
          provider: { include: { user: { select: { avatarUrl: true } } } },
        },
      })
    : []
  const byId = new Map(stocks.map((s) => [s.id, s]))
  const groups = new Map<string, CartGroup>()
  const orphans: CartLine[] = []

  for (const r of rows) {
    const s = byId.get(r.stockId)
    if (!s) {
      orphans.push({
        id: r.id, stockId: r.stockId, quantity: r.quantity, price: 0, lineTotal: 0, available: 0, step: 1,
        brand: null, imageUrl: null, element: null, problem: 'no_existe', problemText: PROBLEM_TEXT.no_existe,
      })
      continue
    }
    const operating = puedeOperar(s.provider)
    let problem: CartProblem | null = null
    if (viewerUserId && s.provider.userId === viewerUserId) problem = 'propio'
    else if (!operating) problem = 'proveedor_inactivo'
    else if (s.status === 'agotado' || s.quantity <= 0) problem = 'sin_stock'
    else if (s.quantity < r.quantity) problem = 'stock_insuficiente'
    const line: CartLine = {
      id: r.id,
      stockId: s.id,
      quantity: r.quantity,
      price: s.price,
      lineTotal: round2(s.price * r.quantity),
      available: Math.max(0, s.quantity),
      step: qtyStepFor(s.element.unit),
      brand: s.brand,
      imageUrl: s.imageUrl,
      element: { id: s.element.id, name: s.element.name, unit: s.element.unit, categoryName: s.element.category.name },
      problem,
      problemText: problem ? PROBLEM_TEXT[problem] : null,
    }
    const g = groups.get(s.providerId) || {
      provider: {
        id: s.provider.id,
        businessName: s.provider.businessName,
        userId: s.provider.userId,
        avatarUrl: s.provider.user.avatarUrl,
        city: s.provider.city,
        mpConnected: s.provider.mpOauthStatus === 'connected' && !!s.provider.mpOauthAccessToken,
        operating,
      },
      items: [],
      subtotal: 0,
      serviceFee: 0,
      blocked: false,
    }
    g.items.push(line)
    groups.set(s.providerId, g)
  }

  const list = [...groups.values()].map((g) => {
    const subtotal = round2(g.items.reduce((a, i) => a + i.lineTotal, 0))
    return { ...g, subtotal, serviceFee: serviceFeeFor(subtotal), blocked: g.items.some((i) => !!i.problem) }
  })
  const subtotal = round2(list.reduce((a, g) => a + g.subtotal, 0))
  // cada proveedor se paga por separado: el cargo total es la suma de los cargos de cada uno
  const serviceFee = round2(list.reduce((a, g) => a + g.serviceFee, 0))
  return {
    groups: list,
    orphans,
    count: rows.length,
    subtotal,
    serviceFee,
    totalMp: round2(subtotal + serviceFee),
    blocked: orphans.length > 0 || list.some((g) => g.blocked),
  }
}

/** Solo clientes y profesionales compran (el proveedor puro no tiene carrito). */
export function canBuy(roles: string[]): boolean {
  return roles.includes('cliente') || roles.includes('profesional')
}
