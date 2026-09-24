import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { isHomiaUploadUrl } from '@/lib/leftovers'

/** Fotos de reseña: máx 4, solo subidas reales de HomIA (bucket público de
 *  Supabase o legado `/uploads/…`), extensión de imagen. Una URL de un sitio
 *  cualquiera (pixel de rastreo, imagen ajena) se descarta. */
function sanitizePhotos(arr: unknown): string[] {
  if (!Array.isArray(arr)) return []
  return arr
    .filter((p): p is string => typeof p === 'string' && p.length < 500 && isHomiaUploadUrl(p) && /\.(jpg|jpeg|png|webp)$/i.test(p))
    .slice(0, 4)
}

// POST: dejar reseña 360° (cliente→profesional, profesional→cliente, cliente→proveedor).
// REGLA DE CONFIANZA: solo pueden reseñarse participantes reales de una obra,
// y recién cuando la obra finalizó. Toda reseña exige un proyecto real.
export async function POST(req: NextRequest) {
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para reseñar', 401)

  const d = await body<{
    targetUserId: string
    rating: number
    comment: string
    photos?: string[] // URLs de /api/uploads que avalan la reseña
    context?: string // proyecto|obra|compra
    projectId?: string
    workId?: string
    purchaseId?: string // reseña de una compra directa de insumos
  }>(req)
  if (!d.targetUserId || !d.rating || typeof d.comment !== 'string' || !d.comment.trim()) {
    return fail('Faltan puntaje o comentario')
  }
  // estrellas enteras (el modelo es Int: 4.5 o "5" terminaban en error de base)
  if (typeof d.rating !== 'number' || !Number.isInteger(d.rating) || d.rating < 1 || d.rating > 5) {
    return fail('El puntaje va de 1 a 5 estrellas (enteras)')
  }
  if (typeof d.targetUserId !== 'string') return fail('Destinatario inválido')
  d.comment = d.comment.trim()
  if (d.comment.length > 2000) return fail('El comentario puede tener hasta 2000 caracteres')
  if (d.targetUserId === user.id) return fail('No podés reseñarte a vos mismo')

  // ── Regla 0: reseña por compra directa de insumos ──
  // El cliente que le compró a un proveedor (pedido entregado/pagado, con o sin
  // proyecto) puede calificar esa compra. Es la vía cuando NO hubo obra.
  if (d.context === 'compra' || (!d.projectId && d.purchaseId)) {
    if (!d.purchaseId) {
      return fail('Esta reseña califica una compra: indicá qué compra querés calificar', 403)
    }
    const purchase = await db.purchase.findUnique({
      where: { id: d.purchaseId },
      include: { provider: { select: { userId: true, businessName: true } } },
    })
    if (!purchase) return fail('Compra no encontrada', 404)
    if (purchase.clientId !== user.id) {
      return fail('Solo quien hizo la compra puede dejar la reseña', 403)
    }
    if (purchase.provider.userId !== d.targetUserId) {
      return fail('Solo podés calificar al proveedor de esa compra', 403)
    }
    if (!['entregado', 'pagado'].includes(purchase.status)) {
      return fail('La reseña se habilita cuando el proveedor entrega tu pedido', 403)
    }
    const dup = await db.review.findFirst({ where: { authorId: user.id, purchaseId: purchase.id } })
    if (dup) return fail('Ya dejaste una reseña por esta compra', 409)

    const photos = sanitizePhotos(d.photos)

    const review = await db.review.create({
      data: {
        authorId: user.id,
        targetUserId: d.targetUserId,
        rating: d.rating,
        comment: d.comment,
        photos: JSON.stringify(photos),
        context: 'compra',
        purchaseId: purchase.id,
      },
    })
    const agg = await db.review.aggregate({
      where: { targetUserId: d.targetUserId },
      _avg: { rating: true },
      _count: { rating: true },
    })
    await db.user.update({
      where: { id: d.targetUserId },
      data: { rating: Math.round((agg._avg.rating || 0) * 10) / 10, reviewsCount: agg._count.rating || 0 },
    })
    await db.providerProfile.updateMany({
      where: { userId: d.targetUserId },
      data: { rating: Math.round((agg._avg.rating || 0) * 10) / 10, reviewsCount: agg._count.rating || 0 },
    })
    await db.notification.create({
      data: {
        userId: d.targetUserId,
        type: 'nueva_reseña',
        title: 'Nueva reseña de una compra',
        body: `${user.displayName} calificó su compra de ${purchase.elementName} con ${d.rating}★`,
        link: '#/panel/proveedor/cobros',
      },
    })
    return ok({ review }, 201)
  }

  // ── Regla 1: el resto de las reseñas nace de un proyecto real ──
  if (!d.projectId) {
    return fail('Las reseñas se dejan desde un proyecto real: entrá al proyecto finalizado y dejala desde ahí', 403)
  }
  const project = await db.project.findUnique({
    where: { id: d.projectId },
    include: {
      pro: { select: { id: true, userId: true } },
      materials: { where: { status: 'aprobado' }, select: { provider: { select: { userId: true } } } },
    },
  })
  if (!project) return fail('Proyecto no encontrado', 404)

  // ── Regla 2: solo participantes de ESA obra ──
  const providerUserIds = [...new Set(project.materials.map((m) => m.provider?.userId).filter(Boolean))] as string[]
  const isClientOfProject = project.clientId === user.id
  const isProOfProject = project.pro.userId === user.id
  const allowedTargets: string[] = []
  if (isClientOfProject) {
    // el cliente reseña al profesional de la obra y a cada proveedor con materiales aprobados
    allowedTargets.push(project.pro.userId, ...providerUserIds)
  }
  if (isProOfProject) {
    // el profesional reseña al cliente de la obra
    allowedTargets.push(project.clientId)
  }
  if (!allowedTargets.includes(d.targetUserId)) {
    return fail('Solo podés reseñar a quienes participaron de esta obra: tu profesional, tus proveedores o tu cliente', 403)
  }

  // ── Regla 3: el momento es el final de la obra ──
  if (project.stage !== 'finalizado' && project.status !== 'finalizado') {
    return fail('La reseña se habilita cuando la obra termina: finalicen el proyecto y después calificá', 403)
  }

  // fotos: máx 4, solo rutas de subida reales de HomIA
  const photos = sanitizePhotos(d.photos)

  const target = await db.user.findUnique({ where: { id: d.targetUserId } })
  if (!target) return fail('Usuario no encontrado', 404)

  // única reseña por proyecto + autor + destinatario (así el cliente puede
  // reseñar al profesional Y al proveedor del mismo proyecto)
  if (d.projectId) {
    const dup = await db.review.findFirst({
      where: { authorId: user.id, projectId: d.projectId, targetUserId: d.targetUserId },
    })
    if (dup) return fail('Ya dejaste una reseña en este proyecto', 409)
  }

  const review = await db.review.create({
    data: {
      authorId: user.id,
      targetUserId: d.targetUserId,
      rating: d.rating,
      comment: d.comment,
      photos: JSON.stringify(photos),
      context: d.context || 'proyecto',
      projectId: d.projectId || null,
      workId: d.workId || null,
    },
  })

  // recalcula rating promedio del target
  const agg = await db.review.aggregate({
    where: { targetUserId: d.targetUserId },
    _avg: { rating: true },
    _count: { rating: true },
  })
  const avg = agg._avg.rating || 0
  const count = agg._count.rating || 0
  await db.user.update({
    where: { id: d.targetUserId },
    data: { rating: Math.round(avg * 10) / 10, reviewsCount: count },
  })
  await db.professionalProfile.updateMany({ where: { userId: d.targetUserId }, data: { rating: Math.round(avg * 10) / 10, reviewsCount: count } })
  await db.providerProfile.updateMany({ where: { userId: d.targetUserId }, data: { rating: Math.round(avg * 10) / 10, reviewsCount: count } })

  await db.notification.create({
    data: {
      userId: d.targetUserId,
      type: 'nueva_reseña',
      title: 'Nueva reseña',
      body: `${user.displayName} te calificó con ${d.rating}★${photos.length ? ` con ${photos.length} foto${photos.length > 1 ? 's' : ''}` : ''}`,
      // al detalle del proyecto en el panel del rol reseñado (el proveedor no tiene
      // detalle de proyecto: sus reseñas de obra se siguen desde Cobros)
      link: d.targetUserId === project.pro.userId
        ? `#/panel/profesional/proyectos/${project.id}`
        : d.targetUserId === project.clientId
          ? `#/panel/cliente/proyectos/${project.id}`
          : '#/panel/proveedor/cobros',
    },
  })

  return ok({ review }, 201)
}

// GET: reseñas recibidas (targetUserId público) o escritas por mí (mine=1).
// Filtro opcional por projectId — usado por los detalles de proyecto para
// saber si ya se reseñó a cada contraparte.
export async function GET(req: NextRequest) {
  const targetUserId = req.nextUrl.searchParams.get('targetUserId')
  const mine = req.nextUrl.searchParams.get('mine') === '1'
  const projectId = req.nextUrl.searchParams.get('projectId')
  const purchaseId = req.nextUrl.searchParams.get('purchaseId')
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()

  const where: { targetUserId?: string; authorId?: string; projectId?: string; purchaseId?: string } = {}
  if (mine) {
    if (!user) return ok({ reviews: [] })
    where.authorId = user.id
  } else {
    const target = targetUserId || user?.id
    if (!target) return ok({ reviews: [] })
    where.targetUserId = target
  }
  if (projectId) where.projectId = projectId
  if (purchaseId) where.purchaseId = purchaseId

  const reviews = await db.review.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, rating: true, comment: true, photos: true, context: true,
      projectId: true, workId: true, purchaseId: true, targetUserId: true, createdAt: true,
      author: { select: { id: true, displayName: true, avatarUrl: true } },
    },
  })
  return ok({ reviews: reviews.map((r) => ({ ...r, photos: r.photos ? JSON.parse(r.photos) as string[] : [] })) })
}
