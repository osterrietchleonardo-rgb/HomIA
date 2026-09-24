import { NextRequest } from 'next/server'
import { ok, fail, body, parseJson } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { esUsuarioPublico } from '@/lib/visibility'

/** Redondea a 2 decimales (~1 km): ubicación aproximada para anónimos. */
function coarse(v: number | null | undefined): number | null {
  if (typeof v !== 'number' || !Number.isFinite(v)) return null
  return Math.round(v * 100) / 100
}

// Detalle de trabajo. Público resumido; presupuestos solo del dueño.
// Sin sesión: sin dirección exacta, lat/lng aproximados y sin datos de contacto
// del cliente (el detalle público no filtra dónde vive nadie).
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const viewer = await getSessionUser()
  const job = await db.jobPost.findUnique({
    where: { id },
    include: {
      user: { select: { id: true, displayName: true, avatarUrl: true, city: true, createdAt: true, email: true, deletedAt: true } },
      bids: { select: { id: true, amount: true, professional: { select: { userId: true } } } },
    },
  })
  if (!job) return fail('Trabajo no encontrado', 404)
  // trabajo de una cuenta eliminada o (con HIDE_DEMO_USERS=1) demo: solo lo ven su dueño y
  // quienes ya ofertaron en él (src/lib/visibility.ts)
  if (!esUsuarioPublico(job.user)) {
    const involucrado = !!viewer && (viewer.id === job.userId || job.bids.some((b) => b.professional.userId === viewer.id))
    if (!involucrado) return fail('Trabajo no encontrado', 404)
  }
  const bids = await db.jobBid.count({ where: { jobId: id } })
  const isPublic = !viewer
  return ok({
    job: {
      id: job.id,
      title: job.title,
      description: job.description,
      categorySlug: job.categorySlug,
      urgency: job.urgency,
      budgetMin: job.budgetMin,
      budgetMax: job.budgetMax,
      address: isPublic ? null : job.address,
      city: job.city || job.user.city,
      lat: isPublic ? coarse(job.lat) : job.lat,
      lng: isPublic ? coarse(job.lng) : job.lng,
      photos: parseJson<string[]>(job.photos, []),
      status: job.status,
      createdAt: job.createdAt,
      client: {
        id: job.user.id,
        displayName: job.user.displayName,
        avatarUrl: job.user.avatarUrl,
        city: job.user.city,
        memberSince: job.user.createdAt,
      },
      bidsCount: bids,
      minBid: bids ? Math.min(...job.bids.map((b) => b.amount)) : null,
      maxBid: bids ? Math.max(...job.bids.map((b) => b.amount)) : null,
    },
  })
}

// PATCH: cerrar/cancelar/reabrir trabajo (solo dueño).
// Transiciones: abierto → cerrado|cancelado · cerrado|cancelado → abierto (solo si nunca se
// aceptó una oferta) · en_proceso → cerrado (la obra sigue por el proyecto). Un trabajo con
// oferta aceptada NO se reabre: se aceptaría otra oferta y quedarían dos proyectos.
const JOB_TRANSITIONS: Record<string, string[]> = {
  abierto: ['cerrado', 'cancelado'],
  cerrado: ['abierto'],
  cancelado: ['abierto'],
  en_proceso: ['cerrado'],
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { status } = await body<{ status: string }>(req)
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const job = await db.jobPost.findUnique({ where: { id } })
  if (!job) return fail('Trabajo no encontrado', 404)
  if (job.userId !== user.id) return fail('No es tu publicación', 403)
  if (typeof status !== 'string' || !['cerrado', 'cancelado', 'abierto'].includes(status)) return fail('Estado inválido')
  if (status === job.status) return ok({ success: true, unchanged: true })
  if (!(JOB_TRANSITIONS[job.status] || []).includes(status)) {
    return fail(
      job.status === 'en_proceso'
        ? 'Este trabajo ya tiene una oferta aceptada: seguilo desde el proyecto'
        : `No se puede pasar de ${job.status} a ${status}`,
      409
    )
  }
  if (status === 'abierto' && job.selectedBidId) {
    return fail('Este trabajo ya tuvo una oferta aceptada: publicá uno nuevo', 409)
  }
  await db.jobPost.update({ where: { id }, data: { status } })
  return ok({ success: true })
}
