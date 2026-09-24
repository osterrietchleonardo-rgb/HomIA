import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'

// Materiales del proyecto.
//   POST  (pro):     propone un material. NO reserva stock: el stock se reserva recién cuando el cliente aprueba.
//   PATCH (ambos):   aprobar (cliente, reserva stock atómica) · rechazar (cliente, libera si estaba aprobado)
//                    · reemplazar (pro, libera si estaba aprobado) · eliminar (pro, solo propuesto).
// Transiciones válidas: propuesto → aprobado|rechazado|reemplazado|eliminado;
//                       aprobado → rechazado|reemplazado solo si todavía no se facturó (invoicedAt null);
//                       rechazado → reemplazado (alternativa del profesional).

type Db = Prisma.TransactionClient

/** '' | 'none' | null | undefined → null */
function normalizeProviderId(v: string | null | undefined): string | null {
  const s = (v || '').trim()
  return !s || s === 'none' ? null : s
}

/** Un profesional solo propone materiales de proveedores con los que tiene una cuenta de retiro activa
 *  y que tienen stock suficiente del elemento. No descuenta nada. */
async function validateProviderStock(input: { providerId: string; elementId: string | null; professionalId: string; quantity: number }) {
  if (!input.elementId) return fail('Para elegir un proveedor, elegí el elemento del catálogo')
  const provider = await db.providerProfile.findUnique({ where: { id: input.providerId }, select: { id: true, businessName: true } })
  if (!provider) return fail('Proveedor no encontrado', 404)
  const link = await db.providerLink.findFirst({
    where: { providerId: input.providerId, professionalId: input.professionalId, active: true },
    select: { id: true },
  })
  if (!link) return fail(`Necesitás una cuenta de retiro activa con ${provider.businessName} para proponer sus materiales`, 403)
  const stock = await db.providerStock.findUnique({
    where: { providerId_elementId: { providerId: input.providerId, elementId: input.elementId } },
    select: { quantity: true },
  })
  if (!stock) return fail(`${provider.businessName} no tiene este elemento en stock`, 409)
  if (stock.quantity < input.quantity) {
    return fail(`${provider.businessName} tiene ${stock.quantity} en stock: no alcanza para ${input.quantity}`, 409)
  }
  return null
}

async function deriveStockStatus(tx: Db, stockId: string) {
  const s = await tx.providerStock.findUnique({ where: { id: stockId } })
  if (!s) return
  let status = 'disponible'
  if (s.quantity <= 0) status = 'agotado'
  else if (s.quantity <= s.minStock) status = 'por_agotar'
  await tx.providerStock.update({ where: { id: stockId }, data: { status } })
}

/** Devuelve al proveedor el stock reservado de un material aprobado. */
async function releaseStock(tx: Db, m: { providerId: string | null; elementId: string | null; quantity: number; name: string }, note: string) {
  if (!m.providerId || !m.elementId) return
  const stock = await tx.providerStock.findUnique({
    where: { providerId_elementId: { providerId: m.providerId, elementId: m.elementId } },
    select: { id: true },
  })
  if (!stock) return
  await tx.providerStock.update({ where: { id: stock.id }, data: { quantity: { increment: m.quantity } } })
  await tx.stockMovement.create({ data: { stockId: stock.id, type: 'liberacion', quantity: m.quantity, note } })
  await deriveStockStatus(tx, stock.id)
}

async function recalcMaterialsCost(tx: Db, projectId: string) {
  const approved = await tx.projectMaterial.findMany({ where: { projectId, status: 'aprobado' }, select: { quantity: true, unitPrice: true } })
  const total = Math.round(approved.reduce((a, m) => a + m.quantity * m.unitPrice, 0) * 100) / 100
  await tx.project.update({ where: { id: projectId }, data: { materialsCost: total } })
  return total
}

const proposeSchema = z.object({
  elementId: z.string().min(1).optional(),
  name: z.string().trim().max(160).optional(),
  providerId: z.string().max(80).nullable().optional(),
  quantity: z.number().positive('La cantidad tiene que ser mayor a 0').max(1_000_000),
  unit: z.string().trim().max(30).optional(),
  unitPrice: z.number().positive('El precio unitario tiene que ser mayor a 0').max(1_000_000_000),
  note: z.string().trim().max(500).optional(),
})

// POST: profesional propone material (elemento estándar, proveedor, cantidad, precio)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const parsed = await parseBody(req, proposeSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data

  const project = await db.project.findUnique({ where: { id } })
  if (!project) return fail('Proyecto no encontrado', 404)
  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })
  if (!pro || project.professionalId !== pro.id) {
    return fail('Solo el profesional del proyecto puede proponer materiales', 403)
  }
  if (project.status !== 'activo') return fail(`El proyecto está ${project.status}: no se pueden proponer materiales`, 409)

  let name = d.name || ''
  let unit = d.unit || 'unidad'
  let elementId: string | null = null
  if (d.elementId) {
    const el = await db.catalogElement.findUnique({ where: { id: d.elementId } })
    if (!el) return fail('El elemento del catálogo no existe', 404)
    elementId = el.id
    name = el.name
    unit = el.unit
  }
  if (!name) return fail('Indicá el material (elemento estándar o nombre)')

  const providerId = normalizeProviderId(d.providerId)
  if (providerId) {
    const err = await validateProviderStock({ providerId, elementId, professionalId: pro.id, quantity: d.quantity })
    if (err) return err
  }

  const material = await db.projectMaterial.create({
    data: {
      projectId: id,
      elementId,
      name,
      providerId,
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

const decideSchema = z.object({
  materialId: z.string().min(1),
  action: z.enum(['aprobar', 'rechazar', 'reemplazar', 'eliminar'], 'Acción inválida'),
  note: z.string().trim().max(500).optional(), // motivo del rechazo (cliente)
  replacement: z.object({
    elementId: z.string().min(1).optional(),
    name: z.string().trim().min(1).max(160),
    providerId: z.string().max(80).nullable().optional(),
    quantity: z.number().positive().max(1_000_000),
    unitPrice: z.number().positive().max(1_000_000_000),
    unit: z.string().trim().max(30).optional(),
  }).optional(),
})

// PATCH: cliente aprueba/rechaza; profesional reemplaza por alternativa o elimina una propuesta
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const parsed = await parseBody(req, decideSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data

  const project = await db.project.findUnique({ where: { id }, include: { pro: { select: { id: true, userId: true } } } })
  if (!project) return fail('Proyecto no encontrado', 404)
  const isClient = project.clientId === user.id
  const isPro = project.pro.userId === user.id
  if (!isClient && !isPro) return fail('Sin permiso', 403)
  if (project.status !== 'activo') return fail(`El proyecto está ${project.status}: los materiales ya no se modifican`, 409)

  // IDOR: el material tiene que pertenecer a ESTE proyecto
  const material = await db.projectMaterial.findFirst({ where: { id: d.materialId, projectId: id } })
  if (!material) return fail('Material no encontrado en este proyecto', 404)

  const proLink = `#/panel/profesional/proyectos/${id}`
  const clientLink = `#/panel/cliente/proyectos/${id}`

  // ── aprobar (cliente): reserva de stock atómica ──
  if (d.action === 'aprobar') {
    if (!isClient) return fail('Solo el cliente aprueba materiales', 403)
    if (material.status !== 'propuesto') return fail(`Este material ya está ${material.status}`, 409)

    const result = await db.$transaction(async (tx) => {
      if (material.providerId && material.elementId) {
        // updateMany condicional: si no alcanza el stock, count === 0 y no se toca nada
        const upd = await tx.providerStock.updateMany({
          where: { providerId: material.providerId, elementId: material.elementId, quantity: { gte: material.quantity } },
          data: { quantity: { decrement: material.quantity } },
        })
        if (upd.count === 0) return { conflict: true as const }
        const stock = await tx.providerStock.findUnique({
          where: { providerId_elementId: { providerId: material.providerId, elementId: material.elementId } },
          select: { id: true },
        })
        if (stock) {
          await tx.stockMovement.create({
            data: { stockId: stock.id, type: 'reserva', quantity: -material.quantity, note: `Proyecto ${project.title}` },
          })
          await deriveStockStatus(tx, stock.id)
        }
      }
      await tx.projectMaterial.update({ where: { id: material.id }, data: { status: 'aprobado' } })
      const materialsCost = await recalcMaterialsCost(tx, id)
      return { conflict: false as const, materialsCost }
    })
    if (result.conflict) {
      return fail('El proveedor ya no tiene stock suficiente; pedile una alternativa', 409)
    }
    await db.notification.create({
      data: {
        userId: project.pro.userId,
        type: 'material_aprobar',
        title: 'Material aprobado',
        body: `${material.name} — proyecto "${project.title}"`,
        link: proLink,
      },
    })
    return ok({ success: true, materialsCost: result.materialsCost })
  }

  // ── rechazar (cliente): desde propuesto o aprobado (si no está facturado) ──
  if (d.action === 'rechazar') {
    if (!isClient) return fail('Solo el cliente rechaza materiales', 403)
    if (material.status !== 'propuesto' && material.status !== 'aprobado') {
      return fail(`Este material ya está ${material.status}`, 409)
    }
    if (material.status === 'aprobado' && material.invoicedAt) {
      return fail('Este material ya está incluido en una factura: no se puede rechazar', 409)
    }
    const reason = (d.note || '').trim()
    const result = await db.$transaction(async (tx) => {
      if (material.status === 'aprobado') {
        await releaseStock(tx, material, `Rechazado por el cliente: ${project.title}`)
      }
      await tx.projectMaterial.update({
        where: { id: material.id },
        data: {
          status: 'rechazado',
          note: reason ? [material.note, `Motivo del rechazo: ${reason}`].filter(Boolean).join(' · ').slice(0, 500) : material.note,
        },
      })
      const materialsCost = await recalcMaterialsCost(tx, id)
      return { materialsCost }
    })
    await db.notification.create({
      data: {
        userId: project.pro.userId,
        type: 'material_rechazar',
        title: 'Material rechazado',
        body: `${material.name} — proyecto "${project.title}"${reason ? `. Motivo: ${reason}` : ''}`,
        link: proLink,
      },
    })
    return ok({ success: true, materialsCost: result.materialsCost })
  }

  // ── eliminar (pro): solo propuestas que el cliente todavía no decidió ──
  if (d.action === 'eliminar') {
    if (!isPro) return fail('Solo el profesional elimina sus propuestas', 403)
    if (material.status !== 'propuesto') return fail('Solo se pueden eliminar materiales todavía no decididos por el cliente', 409)
    await db.projectMaterial.delete({ where: { id: material.id } })
    return ok({ success: true })
  }

  // ── reemplazar (pro): el original queda "reemplazado" y se crea la alternativa como propuesta ──
  if (!isPro) return fail('Solo el profesional puede proponer alternativas', 403)
  if (!d.replacement) return fail('Falta la alternativa propuesta')
  if (!['propuesto', 'rechazado', 'aprobado'].includes(material.status)) {
    return fail(`Este material ya está ${material.status}`, 409)
  }
  if (material.status === 'aprobado' && material.invoicedAt) {
    return fail('Este material ya está incluido en una factura: no se puede reemplazar', 409)
  }
  const r = d.replacement
  let altName = r.name
  let altUnit = r.unit || material.unit
  let altElementId: string | null = null
  if (r.elementId) {
    const el = await db.catalogElement.findUnique({ where: { id: r.elementId } })
    if (!el) return fail('El elemento del catálogo no existe', 404)
    altElementId = el.id
    altName = el.name
    altUnit = el.unit
  }
  const altProviderId = normalizeProviderId(r.providerId)
  if (altProviderId) {
    const err = await validateProviderStock({ providerId: altProviderId, elementId: altElementId, professionalId: project.pro.id, quantity: r.quantity })
    if (err) return err
  }

  const alt = await db.$transaction(async (tx) => {
    if (material.status === 'aprobado') {
      await releaseStock(tx, material, `Reemplazado por alternativa: ${project.title}`)
    }
    await tx.projectMaterial.update({ where: { id: material.id }, data: { status: 'reemplazado' } })
    const created = await tx.projectMaterial.create({
      data: {
        projectId: id,
        elementId: altElementId,
        name: altName,
        providerId: altProviderId,
        quantity: r.quantity,
        unit: altUnit,
        unitPrice: r.unitPrice,
        alternativeOfId: material.id,
        note: material.status === 'rechazado' ? 'Alternativa sugerida tras rechazo' : `Alternativa a ${material.name}`,
      },
    })
    await recalcMaterialsCost(tx, id)
    return created
  })
  await db.notification.create({
    data: {
      userId: project.clientId,
      type: 'material_alternativa',
      title: 'Alternativa de material sugerida',
      body: `${altName} en lugar de ${material.name}`,
      link: clientLink,
    },
  })
  return ok({ material: alt }, 201)
}
