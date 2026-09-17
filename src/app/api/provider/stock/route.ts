import { NextRequest } from 'next/server'
import { ok, fail, body, parseJson } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

async function deriveStatus(stockId: string) {
  const s = await db.providerStock.findUnique({ where: { id: stockId } })
  if (!s) return
  let status = 'disponible'
  if (s.quantity <= 0) status = 'agotado'
  else if (s.quantity <= s.minStock) status = 'por_agotar'
  await db.providerStock.update({ where: { id: stockId }, data: { status } })
}

// GET: mi stock (proveedor) — con filtros por estado/categoría/búsqueda
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  if (!prov) return ok({ stock: [], isProvider: false })

  const sp = req.nextUrl.searchParams
  const status = sp.get('status') // disponible|por_agotar|agotado
  const cat = sp.get('cat')
  const q = (sp.get('q') || '').toLowerCase()

  const stock = await db.providerStock.findMany({
    where: { providerId: prov.id, ...(status ? { status } : {}) },
    include: { element: { include: { category: true } } },
    orderBy: { updatedAt: 'desc' },
  })

  const filtered = stock.filter((s) => {
    if (cat && s.element.category.slug !== cat) return false
    if (q) {
      const hay = [s.element.name, ...parseJson<string[]>(s.element.aliases, []), s.brand || ''].join(' ').toLowerCase()
      if (!hay.includes(q)) return false
    }
    return true
  })

  return ok({
    stock: filtered.map((s) => ({
      id: s.id,
      elementId: s.elementId,
      name: s.element.name,
      unit: s.element.unit,
      category: s.element.category.name,
      categorySlug: s.element.category.slug,
      aliases: parseJson<string[]>(s.element.aliases, []),
      brand: s.brand,
      price: s.price,
      quantity: s.quantity,
      minStock: s.minStock,
      status: s.status,
      updatedAt: s.updatedAt,
    })),
    isProvider: true,
  })
}

// POST: publicar precio/stock de un elemento estándar
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  if (!prov) return fail('Solo proveedores gestionan stock', 403)

  const d = await body<{ elementId: string; price: number; quantity: number; minStock?: number; brand?: string }>(req)
  if (!d.elementId || d.price === undefined) return fail('Elemento y precio son obligatorios')

  const el = await db.catalogElement.findUnique({ where: { id: d.elementId } })
  if (!el) return fail('Elemento no encontrado en el catálogo estándar', 404)

  const existing = await db.providerStock.findUnique({
    where: { providerId_elementId: { providerId: prov.id, elementId: d.elementId } },
  })
  if (existing) return fail('Ya tenés ese elemento. Editá la entrada existente.', 409)

  const stock = await db.providerStock.create({
    data: {
      providerId: prov.id,
      elementId: d.elementId,
      price: d.price,
      quantity: d.quantity || 0,
      minStock: d.minStock ?? 5,
      brand: d.brand || null,
      status: (d.quantity || 0) <= 0 ? 'agotado' : (d.quantity || 0) <= (d.minStock ?? 5) ? 'por_agotar' : 'disponible',
    },
  })
  await db.stockMovement.create({
    data: { stockId: stock.id, type: 'entrada', quantity: d.quantity || 0, note: 'Alta inicial' },
  })
  return ok({ stock }, 201)
}

// PATCH: actualizar cantidad/precio/minStock + registrar movimiento
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  if (!prov) return fail('Solo proveedores gestionan stock', 403)

  const d = await body<{
    id: string
    price?: number
    quantity?: number
    minStock?: number
    brand?: string
    movementType?: 'entrada' | 'salida' | 'ajuste'
  }>(req)
  if (!d.id) return fail('Falta el id')

  const stock = await db.providerStock.findUnique({ where: { id: d.id } })
  if (!stock || stock.providerId !== prov.id) return fail('Entrada no encontrada', 404)

  const data: Record<string, unknown> = {}
  if (d.price !== undefined) data.price = d.price
  if (d.minStock !== undefined) data.minStock = d.minStock
  if (d.brand !== undefined) data.brand = d.brand
  if (d.quantity !== undefined) {
    data.quantity = d.quantity
    await db.stockMovement.create({
      data: {
        stockId: stock.id,
        type: d.movementType || (d.quantity > stock.quantity ? 'entrada' : 'salida'),
        quantity: d.quantity - stock.quantity,
        note: 'Actualización manual',
      },
    })
  }

  await db.providerStock.update({ where: { id: d.id }, data })
  await deriveStatus(d.id)
  const updated = await db.providerStock.findUnique({ where: { id: d.id }, include: { element: true } })
  return ok({ stock: updated })
}

// DELETE: quitar elemento del stock
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  if (!prov) return fail('Solo proveedores gestionan stock', 403)
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return fail('Falta el id')
  const stock = await db.providerStock.findUnique({ where: { id } })
  if (!stock || stock.providerId !== prov.id) return fail('Entrada no encontrada', 404)
  await db.providerStock.delete({ where: { id } })
  return ok({ success: true })
}
