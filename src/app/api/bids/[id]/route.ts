import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { assertJobOpen, closeJobWithHire, HireError } from '@/lib/job-hire'
import { avisarPorMail, type AvisoData } from '@/lib/notify'

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

  // aceptar → proyecto + cierre del trabajo + rechazo del resto, todo o nada.
  // El cierre del trabajo (oferta aceptada, resto rechazado con aviso, trabajo en_proceso) vive en
  // `src/lib/job-hire.ts`: lo comparte con "Contratar" eligiendo un trabajo publicado (D16).
  // el mail al profesional sale recién después del commit (nunca por algo que se revirtió)
  let avisoPro: AvisoData | null = null
  const project = await db.$transaction(async (tx) => {
    // re-chequeo dentro de la transacción: dos aceptaciones simultáneas no crean dos proyectos
    await assertJobOpen(tx, bid.jobId)

    const created = await tx.project.create({
      data: {
        jobId: bid.jobId,
        clientId: bid.job.userId,
        professionalId: bid.professionalId,
        title: bid.job.title,
        description: bid.job.description,
        laborCost: bid.amount,
        // el brief del trabajo publicado pasa al proyecto (antes el detalle decía "Sin estimar")
        budgetMin: bid.job.budgetMin,
        budgetMax: bid.job.budgetMax,
        address: bid.job.address,
        lat: bid.job.lat,
        lng: bid.job.lng,
        photos: bid.job.photos && bid.job.photos !== '[]' ? bid.job.photos : null,
        status: 'activo',
        stage: 'presupuesto',
      },
    })
    // la oferta queda aceptada; el resto de las pendientes, rechazadas… y cada profesional se entera
    await closeJobWithHire(tx, {
      jobId: bid.jobId,
      acceptedBidId: id,
      rejectedTitle: 'El cliente eligió otra oferta',
      rejectedBody: `"${bid.job.title}" ya tiene profesional. Tu oferta quedó rechazada: seguí buscando en la bolsa.`,
    })
    avisoPro = {
      userId: bid.professional.userId,
      type: 'presupuesto_aceptado',
      title: '¡Aceptaron tu presupuesto!',
      body: `"${bid.job.title}" → se creó el proyecto. Coordiná materiales y cronograma.`,
      link: `#/panel/profesional/proyectos/${created.id}`,
    }
    await tx.notification.createMany({
      data: [
        avisoPro,
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
    if (e instanceof HireError) return e.code
    throw e
  })

  if (project === 'BID_NOT_PENDING') return fail('Este presupuesto ya fue decidido', 409)
  if (project === 'JOB_NOT_OPEN') return fail('El trabajo ya no está abierto', 409)
  if (avisoPro) avisarPorMail([avisoPro])
  return ok({ project })
}
