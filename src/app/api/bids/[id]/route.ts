import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

const schema = z.object({
  action: z.enum(['aceptar', 'rechazar', 'retirar'], { message: 'Acción inválida' }),
})

// PATCH: aceptar/rechazar (dueño del trabajo) o retirar (profesional autor).
// Máquina de estados: todas las transiciones salen SOLO de `pendiente`.
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error
  const { action } = parsed.data

  const bid = await db.jobBid.findUnique({
    where: { id },
    include: { job: true, professional: { include: { user: true } } },
  })
  if (!bid) return fail('Presupuesto no encontrado', 404)

  const STATUS_LABEL: Record<string, string> = {
    pendiente: 'pendiente', aceptado: 'aceptada', rechazado: 'rechazada', retirado: 'retirada',
  }

  if (action === 'retirar') {
    if (bid.professional.userId !== user.id) return fail('No es tu presupuesto', 403)
    if (bid.status !== 'pendiente') {
      return fail(`Solo podés retirar una oferta pendiente (esta ya está ${STATUS_LABEL[bid.status] || bid.status})`, 409)
    }
    await db.jobBid.update({ where: { id }, data: { status: 'retirado' } })
    return ok({ success: true, status: 'retirado' })
  }

  if (bid.job.userId !== user.id) return fail('Solo el dueño del trabajo puede decidir', 403)
  if (bid.job.status !== 'abierto') return fail('El trabajo ya no está abierto', 409)
  if (bid.status !== 'pendiente') {
    return fail(`Esta oferta ya está ${STATUS_LABEL[bid.status] || bid.status}`, 409)
  }

  if (action === 'rechazar') {
    await db.jobBid.update({ where: { id }, data: { status: 'rechazado' } })
    await db.notification.create({
      data: {
        userId: bid.professional.userId,
        type: 'presupuesto_rechazado',
        title: 'Presupuesto rechazado',
        body: `Tu presupuesto para "${bid.job.title}" fue rechazado`,
        link: '#/panel/profesional/presupuestos',
      },
    })
    return ok({ success: true, status: 'rechazado' })
  }

  // aceptar → proyecto + cierre del trabajo + rechazo del resto, todo o nada
  const project = await db.$transaction(async (tx) => {
    // re-chequeo dentro de la transacción: dos aceptaciones simultáneas no crean dos proyectos
    const fresh = await tx.jobBid.findUnique({ where: { id }, select: { status: true } })
    if (!fresh || fresh.status !== 'pendiente') throw new Error('BID_NOT_PENDING')
    const job = await tx.jobPost.findUnique({ where: { id: bid.jobId }, select: { status: true } })
    if (!job || job.status !== 'abierto') throw new Error('JOB_NOT_OPEN')

    const created = await tx.project.create({
      data: {
        jobId: bid.jobId,
        clientId: bid.job.userId,
        professionalId: bid.professionalId,
        title: bid.job.title,
        description: bid.job.description,
        laborCost: bid.amount,
        status: 'activo',
        stage: 'presupuesto',
      },
    })
    await tx.jobBid.update({ where: { id }, data: { status: 'aceptado' } })
    await tx.jobBid.updateMany({
      where: { jobId: bid.jobId, id: { not: id }, status: 'pendiente' },
      data: { status: 'rechazado' },
    })
    await tx.jobPost.update({
      where: { id: bid.jobId },
      data: { status: 'en_proceso', selectedBidId: id },
    })
    await tx.notification.createMany({
      data: [
        {
          userId: bid.professional.userId,
          type: 'presupuesto_aceptado',
          title: '¡Aceptaron tu presupuesto!',
          body: `"${bid.job.title}" → se creó el proyecto. Coordiná materiales y cronograma.`,
          link: `#/panel/profesional/proyectos/${created.id}`,
        },
        {
          userId: bid.job.userId,
          type: 'proyecto_creado',
          title: 'Proyecto creado',
          body: `Podés seguir el avance, aprobar materiales y ver facturas.`,
          link: `#/panel/cliente/proyectos/${created.id}`,
        },
      ],
    })
    return created
  }).catch((e: unknown) => {
    const msg = e instanceof Error ? e.message : ''
    if (msg === 'BID_NOT_PENDING') return 'BID_NOT_PENDING' as const
    if (msg === 'JOB_NOT_OPEN') return 'JOB_NOT_OPEN' as const
    throw e
  })

  if (project === 'BID_NOT_PENDING') return fail('Este presupuesto ya fue decidido', 409)
  if (project === 'JOB_NOT_OPEN') return fail('El trabajo ya no está abierto', 409)
  return ok({ project })
}
