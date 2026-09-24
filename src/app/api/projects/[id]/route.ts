import { NextRequest } from 'next/server'
import { z } from 'zod'
import type { Prisma } from '@prisma/client'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { scheduleBlockReason } from '@/lib/schedule'
import { bidAcceptedFor, scheduleView } from '@/lib/schedule-server'

// Orden de etapas: solo se avanza, nunca se retrocede.
const STAGES = ['presupuesto', 'materiales', 'ejecucion', 'revision', 'finalizado'] as const
type Stage = (typeof STAGES)[number]
const STAGE_LABEL: Record<Stage, string> = {
  presupuesto: 'Presupuesto',
  materiales: 'Materiales',
  ejecucion: 'Ejecución',
  revision: 'Revisión',
  finalizado: 'Finalizado',
}

function pairKey(a: string, b: string) {
  return a < b ? { userAId: a, userBId: b } : { userAId: b, userBId: a }
}

// Detalle de proyecto: materiales, facturas, participantes, eventos
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const project = await db.project.findUnique({
    where: { id },
    include: {
      client: { select: { id: true, displayName: true, avatarUrl: true, phone: true, email: true, verificationStatus: true } },
      pro: { include: { user: { select: { id: true, displayName: true, avatarUrl: true, phone: true, email: true, verificationStatus: true } } } },
      materials: {
        include: {
          provider: { include: { user: { select: { id: true, displayName: true } } } },
          element: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      invoices: { orderBy: { issuedAt: 'desc' } },
      charges: { orderBy: { createdAt: 'desc' } },
      job: { select: { id: true, title: true } },
    },
  })
  if (!project) return fail('Proyecto no encontrado', 404)

  const isClient = project.clientId === user.id
  const isPro = project.pro.userId === user.id
  if (!isClient && !isPro) return fail('No tenés acceso a este proyecto', 403)

  // cuenta de retiro vinculada con el proveedor (si el profesional la tiene)
  const providerIds = [...new Set(project.materials.map((m) => m.providerId).filter(Boolean))] as string[]
  const links = providerIds.length
    ? await db.providerLink.findMany({
        where: { professionalId: project.professionalId, providerId: { in: providerIds }, active: true },
        // solo datos públicos del proveedor: nunca los tokens OAuth de Mercado Pago
        include: { provider: { select: { id: true, businessName: true, city: true, kind: true, user: { select: { displayName: true } } } } },
      })
    : []

  // subcontratación (D16): se consulta aparte y solo para quien la puede ver
  const sub = await subcontractInfo(project.id, isClient, isPro, user.id)

  // conversación cliente↔profesional (si el cliente ya la abrió): atajo "Abrir chat"
  const conv = await db.conversation.findUnique({
    where: { userAId_userBId: pairKey(project.clientId, project.pro.userId) },
    select: { id: true },
  })

  // fechas del trabajo (D21): estado del acuerdo y, si todavía no se puede, por qué
  const scheduleBlocked = scheduleBlockReason({
    status: project.status, stage: project.stage, laborCost: project.laborCost,
    bidAccepted: project.stage === 'presupuesto' && project.laborCost > 0 ? await bidAcceptedFor(project) : false,
  })

  return ok({
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      stage: project.stage,
      laborCost: project.laborCost,
      budgetMin: project.budgetMin,
      budgetMax: project.budgetMax,
      materialsCost: project.materialsCost,
      materialsPaymentMode: project.materialsPaymentMode,
      conversationId: conv?.id || null,
      createdAt: project.createdAt,
      schedule: scheduleView(project),
      scheduleBlocked,
      job: project.job,
      // "Parte del proyecto <título>": solo si quien mira es el cliente de esta subcontratación
      // Y además el profesional a cargo del proyecto original. El subcontratado no lo ve.
      parentProject: sub.parentProject,
      // "Subcontrataciones": solo para el profesional a cargo. El cliente original nunca ve
      // las subcontrataciones ni sus montos.
      subcontracts: sub.subcontracts,
      client: project.client,
      // brief de la contratación guiada (wizard del directorio)
      urgency: project.urgency,
      address: project.address,
      deadline: project.deadline,
      photos: project.photos ? JSON.parse(project.photos) as string[] : [],
      professional: {
        id: project.pro.id,
        userId: project.pro.userId,
        displayName: project.pro.user.displayName,
        avatarUrl: project.pro.user.avatarUrl,
        verificationStatus: project.pro.user.verificationStatus,
        personType: project.pro.personType,
        companyName: project.pro.companyName,
        phone: project.pro.user.phone,
        email: project.pro.user.email,
        // ¿cobra la factura por Mercado Pago? (solo el estado; el token nunca sale)
        mpConnected: project.pro.mpOauthStatus === 'connected' && !!project.pro.mpOauthAccessToken,
      },
    },
    role: isClient ? 'cliente' : 'profesional',
    materials: project.materials.map((m) => ({
      id: m.id,
      name: m.name,
      elementId: m.elementId,
      elementName: m.element?.name || m.name,
      unit: m.unit,
      quantity: m.quantity,
      unitPrice: m.unitPrice,
      subtotal: m.quantity * m.unitPrice,
      status: m.status,
      note: m.note,
      providerId: m.providerId,
      providerName: m.provider?.businessName || null,
      providerUserId: m.provider?.user?.id || null,
      alternativeOfId: m.alternativeOfId,
      invoicedAt: m.invoicedAt,
      createdAt: m.createdAt,
    })),
    links,
    invoices: project.invoices,
    charges: project.charges.map((c) => ({
      id: c.id,
      number: c.number,
      description: c.description,
      amount: c.amount,
      serviceFee: c.serviceFee,
      status: c.status,
      method: c.method,
      createdAt: c.createdAt,
      providerName: project.materials.find((m) => m.providerId === c.providerId)?.provider?.businessName || null,
      providerMpConnected: (() => {
        const pv = project.materials.find((m) => m.providerId === c.providerId)?.provider
        return !!pv && pv.mpOauthStatus === 'connected' && !!pv.mpOauthAccessToken
      })(),
    })),
  })
}

// Subcontratación (D16), aparte del detalle principal: si falla, el detalle del proyecto se
// sigue viendo (sin las secciones de subcontratación) y el error queda en el log.
//   parentProject: solo si quien mira es el cliente de la subcontratación Y el profesional a
//                  cargo del proyecto original (el que subcontrató).
//   subcontracts:  solo si quien mira es el profesional a cargo del proyecto original.
async function subcontractInfo(projectId: string, isClient: boolean, isPro: boolean, userId: string) {
  const out: {
    parentProject: { id: string; title: string } | null
    subcontracts: { id: string; title: string; stage: string; status: string; laborCost: number; createdAt: Date; proName: string }[]
  } = { parentProject: null, subcontracts: [] }
  try {
    if (isClient) {
      const own = await db.project.findUnique({
        where: { id: projectId },
        select: { parent: { select: { id: true, title: true, pro: { select: { userId: true } } } } },
      })
      if (own?.parent && own.parent.pro.userId === userId) out.parentProject = { id: own.parent.id, title: own.parent.title }
    }
    if (isPro) {
      const subs = await db.project.findMany({
        where: { parentProjectId: projectId },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true, title: true, stage: true, status: true, laborCost: true, createdAt: true,
          pro: { select: { companyName: true, user: { select: { displayName: true } } } },
        },
      })
      out.subcontracts = subs.map((s) => ({
        id: s.id, title: s.title, stage: s.stage, status: s.status, laborCost: s.laborCost, createdAt: s.createdAt,
        proName: s.pro.companyName || s.pro.user.displayName,
      }))
    }
  } catch (e) {
    console.error('[projects/[id]] no se pudo leer la subcontratación', e)
  }
  return out
}

// ── PATCH: máquina de estados del proyecto ──
//   stage: presupuesto → materiales → ejecucion → revision → finalizado (solo hacia adelante;
//          salir de presupuesto exige mano de obra cotizada; finalizado solo el cliente
//          y solo desde ejecucion/revision).
//   status: únicamente 'cancelado' (en presupuesto/materiales, con motivo, cualquiera de las partes).
//   laborCost: solo el profesional, solo en presupuesto.
//   materialsPaymentMode: inmutable una vez que hay factura o cobro de proveedor.
// Nada cambia si el proyecto no está activo.
const patchSchema = z.object({
  stage: z.enum(STAGES, 'Etapa inválida').optional(),
  status: z.literal('cancelado', 'El estado solo se puede cambiar a "cancelado"; para finalizar usá la etapa').optional(),
  materialsPaymentMode: z.enum(['pro_adelanta', 'cliente_paga_proveedor'], 'Modo de pago de materiales inválido').optional(),
  laborCost: z.number().positive('La mano de obra tiene que ser mayor a 0').max(1_000_000_000).optional(),
  cancelReason: z.string().trim().max(500).optional(),
})

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const parsed = await parseBody(req, patchSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data

  const project = await db.project.findUnique({
    where: { id },
    include: { pro: { select: { id: true, userId: true } } },
  })
  if (!project) return fail('Proyecto no encontrado', 404)
  const isClient = project.clientId === user.id
  const isPro = project.pro.userId === user.id
  if (!isClient && !isPro) return fail('Sin permiso', 403)

  if (project.status !== 'activo') {
    return fail(`El proyecto está ${project.status}: ya no se puede modificar`, 409)
  }

  const otherUserId = isClient ? project.pro.userId : project.clientId
  const otherRole = isClient ? 'profesional' : 'cliente'
  const projectLink = `#/panel/${otherRole}/proyectos/${id}`

  // ── Cancelación (exclusiva: no se combina con otros cambios) ──
  if (d.status === 'cancelado') {
    if (d.stage || d.laborCost !== undefined || d.materialsPaymentMode) {
      return fail('Para cancelar mandá solo el motivo, sin otros cambios')
    }
    if (project.stage !== 'presupuesto' && project.stage !== 'materiales') {
      return fail('Solo se puede cancelar en las etapas de presupuesto o materiales. Si la obra ya empezó, coordiná por el chat.', 409)
    }
    const reason = (d.cancelReason || '').trim()
    if (reason.length < 3) return fail('Contá brevemente el motivo de la cancelación')

    // Materiales aprobados con proveedor: su stock quedó reservado al aprobar → se libera.
    const reserved = await db.projectMaterial.findMany({
      where: { projectId: id, status: 'aprobado', providerId: { not: null }, elementId: { not: null } },
    })
    await db.$transaction(async (tx) => {
      for (const m of reserved) {
        const stock = await tx.providerStock.findUnique({
          where: { providerId_elementId: { providerId: m.providerId!, elementId: m.elementId! } },
        })
        if (!stock) continue
        await tx.providerStock.update({ where: { id: stock.id }, data: { quantity: { increment: m.quantity } } })
        await tx.stockMovement.create({
          data: { stockId: stock.id, type: 'liberacion', quantity: m.quantity, note: `Proyecto cancelado: ${project.title}` },
        })
        await deriveStockStatus(tx, stock.id)
      }
      await tx.project.update({ where: { id }, data: { status: 'cancelado' } })
    })

    const who = isClient ? 'El cliente' : 'El profesional'
    await db.notification.create({
      data: {
        userId: otherUserId,
        type: 'proyecto_cancelado',
        title: 'Proyecto cancelado',
        body: `${who} canceló "${project.title}". Motivo: ${reason}`,
        link: projectLink,
      },
    })
    // El motivo queda también en el chat, si el cliente ya lo abrió (no hay campo en el modelo).
    const conv = await db.conversation.findUnique({
      where: { userAId_userBId: pairKey(project.clientId, project.pro.userId) },
      select: { id: true },
    })
    if (conv) {
      await db.message.create({
        data: { conversationId: conv.id, senderId: user.id, body: `Cancelé el proyecto "${project.title}". Motivo: ${reason}`.slice(0, 2000) },
      })
      await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } })
    }
    return ok({ success: true, status: 'cancelado' })
  }

  if (d.stage === undefined && d.laborCost === undefined && d.materialsPaymentMode === undefined) {
    return fail('No hay nada para actualizar')
  }

  const data: Record<string, unknown> = {}
  const notifications: { type: string; title: string; body: string }[] = []
  let laborCost = project.laborCost

  // ── Cotización de mano de obra ──
  if (d.laborCost !== undefined) {
    if (!isPro) return fail('Solo el profesional del proyecto cotiza la mano de obra', 403)
    if (project.stage !== 'presupuesto') return fail('La mano de obra se cotiza en la etapa de presupuesto', 409)
    laborCost = Math.round(d.laborCost * 100) / 100
    data.laborCost = laborCost
    notifications.push({
      type: 'mano_obra_cotizada',
      title: 'Te cotizaron la mano de obra',
      body: `Te cotizaron la mano de obra: ${laborCost.toLocaleString('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })} — "${project.title}"`,
    })
  }

  // ── Modo de pago de materiales (inmutable con factura o cobro emitido) ──
  if (d.materialsPaymentMode !== undefined && d.materialsPaymentMode !== project.materialsPaymentMode) {
    const [invoiceCount, chargeCount] = await Promise.all([
      db.invoice.count({ where: { projectId: id } }),
      db.providerCharge.count({ where: { projectId: id } }),
    ])
    if (invoiceCount > 0 || chargeCount > 0) {
      return fail('Ya hay facturas o cobros emitidos en este proyecto: el modo de pago de materiales no se puede cambiar', 409)
    }
    data.materialsPaymentMode = d.materialsPaymentMode
    const modoLabel = d.materialsPaymentMode === 'pro_adelanta'
      ? 'El profesional adelanta los materiales y los cobra en la factura'
      : 'El cliente paga los materiales directamente al proveedor'
    notifications.push({
      type: 'modo_materiales',
      title: 'Modo de pago de materiales actualizado',
      body: `"${project.title}": ${modoLabel}.`,
    })
  }

  // ── Avance de etapa ──
  if (d.stage !== undefined) {
    const from = STAGES.indexOf(project.stage as Stage)
    const to = STAGES.indexOf(d.stage)
    if (to <= from) return fail(`El proyecto ya está en ${STAGE_LABEL[project.stage as Stage] || project.stage}: las etapas no retroceden`, 409)
    if (d.stage === 'finalizado') {
      if (!isClient) return fail('Solo el cliente puede dar por finalizada la obra', 403)
      if (project.stage !== 'ejecucion' && project.stage !== 'revision') {
        return fail('La obra se finaliza desde ejecución o revisión', 409)
      }
    }
    if (project.stage === 'presupuesto' && laborCost <= 0) {
      return fail('Antes de avanzar, el profesional tiene que cotizar la mano de obra', 409)
    }
    data.stage = d.stage
    if (d.stage === 'finalizado') {
      data.status = 'finalizado'
      notifications.push({
        type: 'proyecto_finalizado',
        title: 'Proyecto finalizado',
        body: `"${project.title}" finalizó. Publiquen la obra y dejen reseñas.`,
      })
    } else {
      notifications.push({
        type: 'proyecto_etapa',
        title: `Proyecto → ${STAGE_LABEL[d.stage]}`,
        body: `"${project.title}" pasó a la etapa ${STAGE_LABEL[d.stage].toLowerCase()}`,
      })
    }
  }

  if (Object.keys(data).length === 0) return ok({ success: true, unchanged: true })

  const updated = await db.project.update({ where: { id }, data })
  if (notifications.length) {
    await db.notification.createMany({
      data: notifications.map((n) => ({ ...n, userId: otherUserId, link: projectLink })),
    })
  }

  return ok({
    success: true,
    project: { id: updated.id, stage: updated.stage, status: updated.status, laborCost: updated.laborCost, materialsPaymentMode: updated.materialsPaymentMode },
  })
}

async function deriveStockStatus(tx: Prisma.TransactionClient, stockId: string) {
  const s = await tx.providerStock.findUnique({ where: { id: stockId } })
  if (!s) return
  let status = 'disponible'
  if (s.quantity <= 0) status = 'agotado'
  else if (s.quantity <= s.minStock) status = 'por_agotar'
  await tx.providerStock.update({ where: { id: stockId }, data: { status } })
}
