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
      pro: { include: { user: { select: { displayName: true, avatarUrl: true } } } },
      materials: { select: { id: true, status: true } },
      invoices: { select: { id: true, number: true, total: true, status: true } },
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
          materials: { select: { id: true, status: true } },
          invoices: { select: { id: true, number: true, total: true, status: true } },
          job: { select: { id: true } },
        },
        orderBy: { updatedAt: 'desc' },
      })
    : []

  return ok({
    asClient: role === 'profesional' ? [] : asClient.map((p) => serializeProject(p, 'cliente')),
    asPro: asPro.map((p) => serializeProject(p, 'profesional')),
  })
}

function serializeProject(p: {
  id: string; title: string; description: string | null; status: string; stage: string
  laborCost: number; materialsCost: number; createdAt: Date; updatedAt: Date; jobId: string | null
  materials: { id: string; status: string }[]
  invoices: { id: string; number: string; total: number; status: string }[]
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
  }>(req)

  if (!d.title) return fail('El título es obligatorio')
  const mePro = await db.professionalProfile.findUnique({ where: { userId: auth.user.id } })

  let professionalId = ''
  let clientId = ''
  if (d.professionalProfileId) {
    const pro = await db.professionalProfile.findUnique({ where: { id: d.professionalProfileId } })
    if (!pro) return fail('Profesional no encontrado', 404)
    professionalId = pro.id
    clientId = auth.user.id
  } else if (d.counterpartyUserId && mePro) {
    // subcontratación: yo (profesional) contrato a otro profesional
    const otherPro = await db.professionalProfile.findUnique({ where: { userId: d.counterpartyUserId } })
    if (!otherPro) return fail('El otro usuario no tiene perfil profesional', 404)
    professionalId = otherPro.id
    clientId = auth.user.id
  } else {
    return fail('Indicá el profesional a contratar')
  }

  const project = await db.project.create({
    data: {
      clientId,
      professionalId,
      title: d.title,
      description: d.description || null,
      laborCost: d.laborCost || 0,
      stage: 'presupuesto',
    },
  })
  return ok({ project }, 201)
}
