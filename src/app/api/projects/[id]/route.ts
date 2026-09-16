import { NextRequest } from 'next/server'
import { ok, fail, body, parseJson } from '@/lib/api'
import { db } from '@/lib/db'

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
      client: { select: { id: true, displayName: true, avatarUrl: true, phone: true, email: true } },
      pro: { include: { user: { select: { id: true, displayName: true, avatarUrl: true, phone: true, email: true } } } },
      materials: {
        include: {
          provider: { include: { user: { select: { displayName: true } } } },
          element: true,
        },
        orderBy: { createdAt: 'asc' },
      },
      invoices: { orderBy: { issuedAt: 'desc' } },
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
        include: { provider: { include: { user: { select: { displayName: true } } } } },
      })
    : []

  return ok({
    project: {
      id: project.id,
      title: project.title,
      description: project.description,
      status: project.status,
      stage: project.stage,
      laborCost: project.laborCost,
      materialsCost: project.materialsCost,
      createdAt: project.createdAt,
      job: project.job,
      client: project.client,
      professional: {
        id: project.pro.id,
        userId: project.pro.userId,
        displayName: project.pro.user.displayName,
        avatarUrl: project.pro.user.avatarUrl,
        personType: project.pro.personType,
        companyName: project.pro.companyName,
        phone: project.pro.user.phone,
        email: project.pro.user.email,
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
      createdAt: m.createdAt,
    })),
    links,
    invoices: project.invoices,
  })
}

// PATCH: actualizar etapa/estado (finalizar proyecto dispara flujo de reseñas y obras)
export async function PATCH(
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
  const isClient = project.clientId === user.id
  const isPro = pro && project.professionalId === pro.id
  if (!isClient && !isPro) return fail('Sin permiso', 403)

  const d = await body<{ stage?: string; status?: string }>(req)
  const data: Record<string, unknown> = {}
  if (d.stage) {
    if (!['presupuesto', 'materiales', 'ejecucion', 'revision', 'finalizado'].includes(d.stage)) {
      return fail('Etapa inválida')
    }
    data.stage = d.stage
    if (d.stage === 'finalizado') data.status = 'finalizado'
  }
  if (d.status) data.status = d.status

  await db.project.update({ where: { id }, data })

  // Notificar a la contraparte
  const proProfile = await db.professionalProfile.findUnique({ where: { id: project.professionalId }, select: { userId: true } })
  const notifyUserId = isClient ? proProfile?.userId : project.clientId
  if (notifyUserId && d.stage === 'finalizado') {
    await db.notification.create({
      data: {
        userId: notifyUserId,
        type: 'proyecto_finalizado',
        title: 'Proyecto finalizado',
        body: `"${project.title}" finalizó. Publiquen la obra y dejen reseñas.`,
        link: `#/panel/${isClient ? 'cliente' : 'profesional'}/proyectos/${id}`,
      },
    })
  } else if (d.stage && notifyUserId) {
    await db.notification.create({
      data: {
        userId: notifyUserId,
        type: 'proyecto_etapa',
        title: `Proyecto → ${d.stage}`,
        body: `"${project.title}" pasó a la etapa ${d.stage}`,
        link: `#/panel/${isClient ? 'cliente' : 'profesional'}/proyectos/${id}`,
      },
    })
  }

  return ok({ success: true })
}
