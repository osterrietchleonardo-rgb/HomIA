import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody, parseJson } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { planState, mensajePlanInactivo } from '@/lib/plans'
import { matchTerms } from '@/lib/search-match'

// D33: publicar, editar o borrar stock es negocio nuevo → requiere plan activo (ver/listar, no)
const PLAN_VENCIDO = (st: ReturnType<typeof planState>) => mensajePlanInactivo(st, 'publicar o editar tu stock')

// números reales y finitos (nada de strings, negativos ni Infinity en precios/cantidades)
const money = z.number({ message: 'El precio tiene que ser un número' }).finite().positive('El precio tiene que ser mayor a 0').max(1_000_000_000)
const qty = z.number({ message: 'La cantidad tiene que ser un número' }).finite().min(0, 'La cantidad no puede ser negativa').max(10_000_000)
const brand = z.string().trim().max(80, 'La marca puede tener hasta 80 caracteres')
const imageUrl = z.string().trim().max(500)

const createSchema = z.object({
  elementId: z.string().min(1, 'Elegí el elemento del catálogo'),
  price: money,
  quantity: qty.optional(),
  minStock: qty.optional(),
  brand: brand.optional(),
  imageUrl: imageUrl.optional(),
})

const patchSchema = z.object({
  id: z.string().min(1, 'Falta el id'),
  price: money.optional(),
  quantity: qty.optional(),
  minStock: qty.optional(),
  brand: brand.optional(),
  imageUrl: imageUrl.optional(),
  movementType: z.enum(['entrada', 'salida', 'ajuste']).optional(),
})

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
  const q = (sp.get('q') || '').trim()

  const stock = await db.providerStock.findMany({
    where: { providerId: prov.id, ...(status ? { status } : {}) },
    include: { element: { include: { category: true } } },
    orderBy: { updatedAt: 'desc' },
  })

  const filtered = stock.filter((s) => {
    if (cat && s.element.category.slug !== cat) return false
    if (q) {
      // búsqueda difusa (sin acentos, singular/plural, por alias y marca): "cano" encuentra "Caño"
      const hay = [s.element.name, ...parseJson<string[]>(s.element.aliases, []), s.brand || ''].join(' ')
      if (!matchTerms(q, hay)) return false
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
      description: s.element.description || null,
      brand: s.brand,
      imageUrl: s.imageUrl,
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
  const st = planState(prov)
  if (!st.activo) {
    return fail(PLAN_VENCIDO(st), 403, { needsPlan: true })
  }

  const parsed = await parseBody(req, createSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data

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
      imageUrl: d.imageUrl || null,
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
  const st = planState(prov)
  if (!st.activo) {
    return fail(PLAN_VENCIDO(st), 403, { needsPlan: true })
  }

  const parsed = await parseBody(req, patchSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data

  const stock = await db.providerStock.findUnique({ where: { id: d.id } })
  if (!stock || stock.providerId !== prov.id) return fail('Entrada no encontrada', 404)

  const data: Record<string, unknown> = {}
  if (d.price !== undefined) data.price = d.price
  if (d.minStock !== undefined) data.minStock = d.minStock
  if (d.brand !== undefined) data.brand = d.brand
  if (d.imageUrl !== undefined) data.imageUrl = d.imageUrl
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
  const st = planState(prov)
  if (!st.activo) {
    return fail(PLAN_VENCIDO(st), 403, { needsPlan: true })
  }
  const id = req.nextUrl.searchParams.get('id')
  if (!id) return fail('Falta el id')
  const stock = await db.providerStock.findUnique({ where: { id } })
  if (!stock || stock.providerId !== prov.id) return fail('Entrada no encontrada', 404)
  await db.providerStock.delete({ where: { id } })
  return ok({ success: true })
}
