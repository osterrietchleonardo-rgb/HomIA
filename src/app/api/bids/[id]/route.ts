import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'

// PATCH: aceptar o rechazar presupuesto (dueño del trabajo)
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const { action } = await body<{ action: 'aceptar' | 'rechazar' | 'retirar' }>(req)
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const bid = await db.jobBid.findUnique({
    where: { id },
    include: { job: true, professional: { include: { user: true } } },
  })
  if (!bid) return fail('Presupuesto no encontrado', 404)

  if (action === 'retirar') {
    if (bid.professional.userId !== user.id) return fail('No es tu presupuesto', 403)
    await db.jobBid.update({ where: { id }, data: { status: 'retirado' } })
    return ok({ success: true })
  }

  if (bid.job.userId !== user.id) return fail('Solo el dueño del trabajo puede decidir', 403)
  if (bid.job.status !== 'abierto') return fail('El trabajo ya no está abierto')

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
    return ok({ success: true })
  }

  if (action === 'aceptar') {
    // Aceptar → crea el proyecto y cierra el trabajo
    const otherBids = await db.jobBid.findMany({ where: { jobId: bid.jobId, id: { not: id } } })
    const project = await db.project.create({
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
    await db.jobBid.update({ where: { id }, data: { status: 'aceptado' } })
    await db.jobBid.updateMany({ where: { jobId: bid.jobId, id: { not: id } }, data: { status: 'rechazado' } })
    await db.jobPost.update({
      where: { id: bid.jobId },
      data: { status: 'en_proceso', selectedBidId: id },
    })
    await db.notification.createMany({
      data: [
        {
          userId: bid.professional.userId,
          type: 'presupuesto_aceptado',
          title: '¡Aceptaron tu presupuesto!',
          body: `"${bid.job.title}" → se creó el proyecto. Coordiná materiales y cronograma.`,
          link: `#/panel/profesional/proyectos/${project.id}`,
        },
        {
          userId: bid.job.userId,
          type: 'proyecto_creado',
          title: 'Proyecto creado',
          body: `Podés seguir el avance, aprobar materiales y ver facturas.`,
          link: `#/panel/cliente/proyectos/${project.id}`,
        },
      ],
    })
    return ok({ project })
  }

  return fail('Acción inválida')
}
