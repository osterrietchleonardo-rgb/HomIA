import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, requireAuth, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { isHomiaUploadUrl } from '@/lib/leftovers'

const userSelect = { id: true, displayName: true, avatarUrl: true, verificationStatus: true } as const
const listInclude = {
  client: { select: userSelect },
  pro: { select: { id: true, userId: true, user: { select: userSelect } } },
  materials: { select: { id: true, status: true, provider: { select: { user: { select: { id: true } } } } } },
  invoices: {
    select: { id: true, number: true, total: true, status: true, paymentMethod: true, issuedAt: true, laborCost: true, materialsCost: true },
    orderBy: { issuedAt: 'desc' as const },
  },
  job: { select: { id: true } },
}

// GET: mis proyectos (como cliente o como profesional)
export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const role = req.nextUrl.searchParams.get('role') // cliente|profesional|all

  const asClient = role === 'profesional'
    ? []
    : await db.project.findMany({
        where: { clientId: auth.user.id },
        include: listInclude,
        orderBy: { updatedAt: 'desc' },
      })
  const proProfile = await db.professionalProfile.findUnique({ where: { userId: auth.user.id } })
  const asPro = proProfile
    ? await db.project.findMany({
        where: { professionalId: proProfile.id },
        include: listInclude,
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
    asClient: asClient.map((p) => ({
      ...serializeProject(p),
      canReview: canReview(p, 'cliente'),
    })),
    asPro: asPro.map((p) => ({
      ...serializeProject(p),
      canReview: canReview(p, 'profesional'),
    })),
  })
}

type UserLite = { id: string; displayName: string; avatarUrl: string | null; verificationStatus: string }
type SerializableProject = {
  id: string; title: string; description: string | null; status: string; stage: string
  laborCost: number; budgetMin: number | null; budgetMax: number | null; materialsCost: number
  materialsPaymentMode: string; deadline: Date | null
  createdAt: Date; updatedAt: Date; jobId: string | null
  client: UserLite
  pro: { id: string; userId: string; user: UserLite }
  materials: { id: string; status: string }[]
  invoices: {
    id: string; number: string; total: number; status: string; paymentMethod: string | null
    issuedAt: Date; laborCost: number; materialsCost: number
  }[]
  job: { id: string } | null
}

// Forma única del proyecto para los listados de cliente y profesional.
// `laborCost === 0` significa "sin cotizar"; budgetMin/Max es el brief del cliente (referencia).
function serializeProject(p: SerializableProject) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status,
    stage: p.stage,
    laborCost: p.laborCost,
    budgetMin: p.budgetMin,
    budgetMax: p.budgetMax,
    materialsCost: p.materialsCost,
    materialsPaymentMode: p.materialsPaymentMode,
    deadline: p.deadline,
    materialsPending: p.materials.filter((m) => m.status === 'propuesto').length,
    client: {
      id: p.client.id,
      displayName: p.client.displayName,
      avatarUrl: p.client.avatarUrl,
      verificationStatus: p.client.verificationStatus,
    },
    pro: {
      id: p.pro.id,
      userId: p.pro.userId,
      user: {
        displayName: p.pro.user.displayName,
        avatarUrl: p.pro.user.avatarUrl,
        verificationStatus: p.pro.user.verificationStatus,
      },
    },
    invoices: p.invoices.map((i) => ({
      id: i.id,
      number: i.number,
      total: i.total,
      status: i.status,
      paymentMethod: i.paymentMethod,
      issuedAt: i.issuedAt,
      laborCost: i.laborCost,
      materialsCost: i.materialsCost,
    })),
    jobId: p.jobId,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
  }
}

// POST: crear proyecto directo (sin bolsa) — cliente contrata profesional, o profesional subcontrata.
// El wizard manda el presupuesto estimado del cliente (budgetMin/Max) como referencia;
// la mano de obra arranca en 0 ("sin cotizar") y la cotiza el profesional en la etapa de presupuesto.
const createSchema = z.object({
  professionalProfileId: z.string().min(1).optional(),
  counterpartyUserId: z.string().min(1).optional(), // si un profesional contrata a otro
  title: z.string().trim().min(4, 'El título tiene que tener al menos 4 letras').max(120),
  description: z.string().trim().max(2000).optional(),
  budgetMin: z.number().nonnegative().max(1_000_000_000).optional(),
  budgetMax: z.number().nonnegative().max(1_000_000_000).optional(),
  // Rubro elegido en el wizard. Project no tiene campo para persistirlo: se acepta y se ignora
  // (pendiente: agregar `categorySlug` al schema si se quiere filtrar por rubro).
  categorySlug: z.string().max(60).optional(),
  urgency: z.enum(['ya', 'esta_semana', 'normal']).optional(),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  deadline: z.string().optional(), // ISO
  // fotos del trabajo: solo subidas reales de HomIA (bucket público o legado /uploads)
  photos: z.array(z.string().max(600).refine(isHomiaUploadUrl, 'Las fotos tienen que subirse desde HomIA')).max(4).optional(),
  firstMessage: z.string().trim().max(2000).optional(), // opcional: abre chat cliente→profesional con el brief
})

export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const parsed = await parseBody(req, createSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data

  const budgetMin = d.budgetMin && d.budgetMin > 0 ? d.budgetMin : null
  const budgetMax = d.budgetMax && d.budgetMax > 0 ? d.budgetMax : null
  if (budgetMin !== null && budgetMax !== null && budgetMax < budgetMin) {
    return fail('El presupuesto máximo tiene que ser mayor o igual al mínimo')
  }

  const mePro = await db.professionalProfile.findUnique({ where: { userId: auth.user.id } })

  let professionalId = ''
  let clientId = ''
  let proUserId = ''
  if (d.professionalProfileId) {
    const pro = await db.professionalProfile.findUnique({ where: { id: d.professionalProfileId }, select: { id: true, userId: true } })
    if (!pro) return fail('Profesional no encontrado', 404)
    if (pro.userId === auth.user.id) return fail('No podés contratarte a vos mismo')
    professionalId = pro.id
    proUserId = pro.userId
    clientId = auth.user.id
  } else if (d.counterpartyUserId && mePro) {
    // subcontratación: yo (profesional) contrato a otro profesional
    if (d.counterpartyUserId === auth.user.id) return fail('No podés contratarte a vos mismo')
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
    const parsedDate = new Date(d.deadline)
    if (!isNaN(parsedDate.getTime())) deadline = parsedDate
  }

  const project = await db.project.create({
    data: {
      clientId,
      professionalId,
      title: d.title,
      description: d.description || null,
      laborCost: 0, // sin cotizar: la define el profesional
      budgetMin,
      budgetMax,
      stage: 'presupuesto',
      urgency: d.urgency || null,
      address: d.address || null,
      deadline,
      photos: d.photos && d.photos.length > 0 ? JSON.stringify(d.photos) : null,
    },
  })

  // Notificar al profesional contratado (visita su panel → Proyectos)
  await db.notification.create({
    data: {
      userId: proUserId,
      type: 'contratacion',
      title: 'Te contrataron: cotizá la mano de obra para arrancar',
      body: `${auth.user.displayName} te contrató: ${d.title}`,
      link: `#/panel/profesional/proyectos/${project.id}`,
    },
  })

  // Opcional: abrir conversación cliente→profesional con el brief (el cliente puede iniciar)
  let conversationId: string | null = null
  const firstMessage = (d.firstMessage || '').trim()
  if (firstMessage) {
    const a = clientId < proUserId ? clientId : proUserId
    const b = clientId < proUserId ? proUserId : clientId
    const conv = await db.conversation.upsert({
      where: { userAId_userBId: { userAId: a, userBId: b } },
      create: { userAId: a, userBId: b },
      update: {},
    })
    await db.message.create({
      data: { conversationId: conv.id, senderId: clientId, body: firstMessage.slice(0, 2000) },
    })
    await db.conversation.update({ where: { id: conv.id }, data: { lastMessageAt: new Date() } })
    await db.notification.create({
      data: {
        userId: proUserId,
        type: 'message',
        title: 'Nuevo mensaje de ' + auth.user.displayName,
        body: firstMessage.slice(0, 120),
        link: `#/mensajes?c=${conv.id}`,
      },
    })
    conversationId = conv.id
  }

  return ok({ project, conversationId }, 201)
}
