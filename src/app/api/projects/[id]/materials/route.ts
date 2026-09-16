import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'

// POST: profesional propone material (elemento estándar, proveedor, cantidad, precio)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const project = await db.project.findUnique({ where: { id } })
  if (!project) return fail('Proyecto no encontrado', 404)
  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })
  if (!pro || project.professionalId !== pro.id) {
    return fail('Solo el profesional del proyecto puede proponer materiales', 403)
  }

  const d = await body<{
    elementId?: string
    name?: string
    providerId?: string
    quantity: number
    unit?: string
    unitPrice: number
    note?: string
  }>(req)
  if (!d.quantity || !d.unitPrice) return fail('Cantidad y precio son obligatorios')

  let name = d.name || ''
  let unit = d.unit || 'unidad'
  if (d.elementId) {
    const el = await db.catalogElement.findUnique({ where: { id: d.elementId } })
    if (el) { name = el.name; unit = el.unit }
  }
  if (!name) return fail('Indicá el material (elemento estándar o nombre)')

  // Si viene de stock de proveedor, reserva el stock
  if (d.providerId && d.elementId) {
    const stock = await db.providerStock.findUnique({ where: { providerId_elementId: { providerId: d.providerId, elementId: d.elementId } } })
    if (stock) {
      const newQty = stock.quantity - d.quantity
      await db.providerStock.update({
        where: { id: stock.id },
        data: { quantity: newQty },
      })
      await db.stockMovement.create({
        data: { stockId: stock.id, type: 'reserva', quantity: -d.quantity, note: `Proyecto ${project.title}` },
      })
      await deriveStockStatus(stock.id)
    }
  }

  const material = await db.projectMaterial.create({
    data: {
      projectId: id,
      elementId: d.elementId || null,
      name,
      providerId: d.providerId || null,
      quantity: d.quantity,
      unit,
      unitPrice: d.unitPrice,
      note: d.note || null,
    },
  })

  await db.notification.create({
    data: {
      userId: project.clientId,
      type: 'material_propuesto',
      title: 'Nuevos materiales por aprobar',
      body: `${name} x${d.quantity} — esperando tu aprobación en "${project.title}"`,
      link: `#/panel/cliente/proyectos/${id}`,
    },
  })

  return ok({ material }, 201)
}

// PATCH: cliente aprueba/rechaza; profesional reemplaza por alternativa más barata
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const d = await body<{
    materialId: string
    action: 'aprobar' | 'rechazar' | 'reemplazar'
    replacement?: { elementId?: string; name: string; providerId?: string; quantity: number; unitPrice: number; unit?: string }
  }>(req)
  if (!d.materialId || !d.action) return fail('Faltan datos')

  const project = await db.project.findUnique({ where: { id } })
  if (!project) return fail('Proyecto no encontrado', 404)
  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })
  const isClient = project.clientId === user.id
  const isPro = pro && project.professionalId === pro.id
  if (!isClient && !isPro) return fail('Sin permiso', 403)

  const material = await db.projectMaterial.findUnique({ where: { id: d.materialId } })
  if (!material) return fail('Material no encontrado', 404)

  if (d.action === 'aprobar' || d.action === 'rechazar') {
    if (!isClient) return fail('Solo el cliente aprueba o rechaza materiales', 403)
    await db.projectMaterial.update({
      where: { id: d.materialId },
      data: { status: d.action === 'aprobar' ? 'aprobado' : 'rechazado' },
    })
    // recalcula costo de materiales aprobados
    const approved = await db.projectMaterial.findMany({ where: { projectId: id, status: 'aprobado' } })
    const total = approved.reduce((a, m) => a + m.quantity * m.unitPrice, 0)
    await db.project.update({ where: { id }, data: { materialsCost: total } })
    const proProfile = await db.professionalProfile.findUnique({ where: { id: project.professionalId }, select: { userId: true } })
    if (proProfile) {
      await db.notification.create({
        data: {
          userId: proProfile.userId,
          type: `material_${d.action}`,
          title: `Material ${d.action === 'aprobar' ? 'aprobado' : 'rechazado'}`,
          body: `${material.name} — proyecto "${project.title}"`,
          link: `#/panel/profesional/proyectos/${id}`,
        },
      })
    }
    return ok({ success: true })
  }

  // reemplazar: el profesional sugiere alternativa (más barata) → vuelve a propuesto
  if (!isPro) return fail('Solo el profesional puede proponer alternativas', 403)
  if (!d.replacement) return fail('Falta la alternativa propuesta')
  await db.projectMaterial.update({ where: { id: d.materialId }, data: { status: 'reemplazado' } })
  const alt = await db.projectMaterial.create({
    data: {
      projectId: id,
      elementId: d.replacement.elementId || null,
      name: d.replacement.name,
      providerId: d.replacement.providerId || null,
      quantity: d.replacement.quantity,
      unit: d.replacement.unit || material.unit,
      unitPrice: d.replacement.unitPrice,
      alternativeOfId: d.materialId,
      note: 'Alternativa sugerida tras rechazo',
    },
  })
  await db.notification.create({
    data: {
      userId: project.clientId,
      type: 'material_alternativa',
      title: 'Alternativa de material sugerida',
      body: `${d.replacement.name} en lugar de ${material.name}`,
      link: `#/panel/cliente/proyectos/${id}`,
    },
  })
  return ok({ material: alt }, 201)
}

async function deriveStockStatus(stockId: string) {
  const s = await db.providerStock.findUnique({ where: { id: stockId } })
  if (!s) return
  let status = 'disponible'
  if (s.quantity <= 0) status = 'agotado'
  else if (s.quantity <= s.minStock) status = 'por_agotar'
  await db.providerStock.update({ where: { id: stockId }, data: { status } })
}
