import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// GET: pipelines del usuario (crea default si no tiene)
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  let pipelines = await db.crmPipeline.findMany({
    where: { ownerId: user.id },
    include: { stages: { orderBy: { sortOrder: 'asc' } } },
    orderBy: { createdAt: 'asc' },
  })

  if (pipelines.length === 0) {
    const role = user.hasProvider && !user.hasProfessional ? 'proveedor' : 'profesional'
    const pipeline = await db.crmPipeline.create({
      data: { ownerId: user.id, ownerRole: role, name: role === 'proveedor' ? 'Clientes y Profesionales' : 'Clientes' },
    })
    const stages = role === 'proveedor'
      ? ['Nuevos contactos', 'Cotizando', 'Compra en curso', 'Cliente recurrente']
      : ['Consultas', 'Presupuesto enviado', 'En negociación', 'En obra', 'Cerrado / Facturado']
    const colors = ['#1D63B8', '#00A3E0', '#FF5A1F', '#FFC700', '#16A34A']
    for (let i = 0; i < stages.length; i++) {
      await db.crmStage.create({ data: { pipelineId: pipeline.id, name: stages[i], sortOrder: i, color: colors[i % colors.length] } })
    }
    pipelines = await db.crmPipeline.findMany({
      where: { ownerId: user.id },
      include: { stages: { orderBy: { sortOrder: 'asc' } } },
    })
  }

  // deals por pipeline
  const pipelineIds = pipelines.map((p) => p.id)
  const deals = await db.crmDeal.findMany({
    where: { pipelineId: { in: pipelineIds } },
    include: { counterparty: { select: { id: true, displayName: true, avatarUrl: true } } },
    orderBy: { position: 'asc' },
  })

  return ok({ pipelines, deals })
}

// POST: nuevo pipeline
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const { name, ownerRole } = await body<{ name: string; ownerRole?: string }>(req)
  if (!name) return fail('El nombre es obligatorio')
  const pipeline = await db.crmPipeline.create({
    data: { ownerId: user.id, ownerRole: ownerRole || (user.hasProvider ? 'proveedor' : 'profesional'), name },
  })
  const defaults = ['Contacto', 'En proceso', 'Cerrado']
  for (let i = 0; i < defaults.length; i++) {
    await db.crmStage.create({ data: { pipelineId: pipeline.id, name: defaults[i], sortOrder: i } })
  }
  return ok({ pipeline }, 201)
}
