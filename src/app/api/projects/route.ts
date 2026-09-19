import { NextRequest } from 'next/server'
import { ok, requireAuth, body, fail, parseJson } from '@/lib/api'
import { db } from '@/lib/db'

// GET: mis proyectos (como cliente o como profesional)
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const role = req.nextUrl.searchParams.get('role') // cliente|profesional|all

  const asClient = await db.project.findMany({
    where: { clientId: auth.user.id },
    include: {
      pro: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
      materials: { select: { id: true, status: true, provider: { select: { user: { select: { id: true } } } } } },
      invoices: { select: { id: true, number: true, total: true, status: true, paymentMethod: true } },
      job: { select: { id: true } },
    },
    orderBy: { updatedAt: 'desc' },
  })
  const proProfile = await db.professionalProfile.findUnique({ where: { userId: auth.user.id } })
  const asPro = proProfile
    ? await db.project.findMany({
        where: { professionalId: proProfile.id },
        include: {
          client: { select: { id: true, displayName: true, avatarUrl: true } },
          materials: { select: { id: true, status: true, provider: { select: { user: { select: { id: true } } } } } },
          invoices: { select: { id: true, number: true, total: true, status: true, paymentMethod: true } },
          job: { select: { id: true } },
        },
        orderBy: { updatedAt: 'desc' },
      })
    : []

  // reseñas que ya escribí, por proyecto — para calcular canReview (reseñas 360°)
  const myReviews = await db.review.findMany({
    where: { authorId: auth.user.id, projectId: { not: null } },
    select: { projectId: true, targetUserId: true },
  })
  const reviewedByProject = new Map<string, Set<string>>()
  for (const r of myReviews) {
    if (!reviewedByProject.has(r.projectId!)) reviewedByProject.set(r.projectId!, new Set())
    reviewedByProject.get(r.projectId!)!.add(r.targetUserId)
  }

  // destinatarios de reseña de un proyecto: cliente → pro + proveedores con materiales;
  // profesional → cliente
  type ProjLike = {
    id: string; stage: string
    client?: { id: string } | null
    pro?: { user?: { id: string } | null } | null
    materials: { provider?: { user?: { id: string } | null } | null }[]
  }
  const reviewTargets = (p: ProjLike, viewer: 'cliente' | 'profesional'): string[] => {
    if (p.stage !== 'finalizado') return []
    if (viewer === 'profesional') return p.client ? [p.client.id] : []
    const ids = new Set<string>()
    if (p.pro?.user?.id) ids.add(p.pro.user.id)
    for (const m of p.materials) {
      const pid = m.provider?.user?.id
      if (pid) ids.add(pid)
    }
    return [...ids]
  }
  const canReview = (p: ProjLike, viewer: 'cliente' | 'profesional') => {
    const done = reviewedByProject.get(p.id) || new Set<string>()
    return reviewTargets(p, viewer).some((t) => !done.has(t))
  }

  return ok({
    asClient: role === 'profesional' ? [] : asClient.map((p) => ({
      ...serializeProject(p, 'cliente'),
      canReview: canReview(p, 'cliente'),
    })),
    asPro: asPro.map((p) => ({
      ...serializeProject(p, 'profesional'),
      canReview: canReview(p, 'profesional'),
    })),
  })
}

function serializeProject(p: {
  id: string; title: string; description: string | null; status: string; stage: string
  laborCost: number; materialsCost: number; createdAt: Date; updatedAt: Date; jobId: string | null
  materials: { id: string; status: string }[]
  invoices: { id: string; number: string; total: number; status: string; paymentMethod: string | null }[]
  job: { id: string } | null
}, _r: string) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status,
    stage: p.stage,
    laborCost: p.laborCost,
    materialsCost: p.materialsCost,
    materialsPending: p.materials.filter((m) => m.status === 'propuesto').length,
    invoices: p.invoices,
    jobId: p.jobId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}

// POST: crear proyecto directo (sin bolsa) — cliente contrata profesional, o profesional subcontrata
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const d = await body<{
    professionalProfileId?: string
    counterpartyUserId?: string // si un profesional contrata a otro
    title: string
    description?: string
    laborCost?: number
    urgency?: string // ya | esta_semana | normal
    address?: string
    city?: string
    deadline?: string // ISO
    photos?: string[]
    firstMessage?: string // opcional: abre chat cliente→profesional con el brief
  }>(req)

  if (!d.title) return fail('El título es obligatorio')
  const mePro = await db.professionalProfile.findUnique({ where: { userId: auth.user.id } })

  let professionalId = ''
  let clientId = ''
  let proUserId = ''
  if (d.professionalProfileId) {
    const pro = await db.professionalProfile.findUnique({ where: { id: d.professionalProfileId }, select: { id: true, userId: true } })
    if (!pro) return fail('Profesional no encontrado', 404)
    professionalId = pro.id
    proUserId = pro.userId
    clientId = auth.user.id
  } else if (d.counterpartyUserId && mePro) {
    // subcontratación: yo (profesional) contrato a otro profesional
    const otherPro = await db.professionalProfile.findUnique({ where: { userId: d.counterpartyUserId }, select: { id: true, userId: true } })
    if (!otherPro) return fail('El otro usuario no tiene perfil profesional', 404)
    professionalId = otherPro.id
    proUserId = otherPro.userId
    clientId = auth.user.id
  } else {
    return fail('Indicá el profesional a contratar')
  }

  let deadline: Date | null = null
  if (d.deadline) {
    const parsed = new Date(d.deadline)
    if (!isNaN(parsed.getTime())) deadline = parsed
  }

  const project = await db.project.create({
    data: {
      clientId,
      professionalId,
      title: d.title,
      description: d.description || null,
      laborCost: d.laborCost || 0,
      stage: 'presupuesto',
      urgency: d.urgency || null,
      address: d.address || null,
      deadline,
      photos: d.photos && d.photos.length > 0 ? JSON.stringify(d.photos) : null,
    },
  })

  // Notificar al profesional contratado (visita su panel → Proyectos)
  if (proUserId) {
    await db.notification.create({
      data: {
        userId: proUserId,
        type: 'contratacion',
        title: 'Te contrataron para un trabajo',
        body: `${auth.user.displayName} te contrató: ${d.title}`,
        link: `/panel/profesional/proyectos/${project.id}`,
      },
    })
  }

  // Opcional: abrir conversación cliente→profesional con el brief (el cliente puede iniciar)
  let conversationId: string | null = null
  if (d.firstMessage && d.firstMessage.trim() && proUserId) {
    const a = clientId < proUserId ? clientId : proUserId
    const b = clientId < proUserId ? proUserId : clientId
    const conv = await db.conversation.upsert({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      create: { userAId: a, userBId: b },
      update: {},
    })
    await db.message.create({
      data: { conversationId: conv.id, senderId: clientId, body: d.firstMessage.trim().slice(0, 2000) },
    })
    await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } })
    await db.notification.create({
      data: {
        userId: proUserId,
        type: 'message',
        title: 'Nuevo mensaje de ' + auth.user.displayName,
        body: d.firstMessage.trim().slice(0, 120),
        link: `/mensajes?c=${conv.id}`,
      },
    })
    conversationId = conv.id
  }

  return ok({ project, conversationId }, 201)
}
