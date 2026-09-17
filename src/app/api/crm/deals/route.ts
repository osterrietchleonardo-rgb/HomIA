import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// POST: crear trato en el pipeline
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const d = await body<{
    pipelineId: string
    stageId: string
    title: string
    value?: number
    counterpartyId?: string
    note?: string
    jobId?: string
    projectId?: string
  }>(req)
  if (!d.pipelineId || !d.stageId || !d.title) return fail('Faltan datos del trato')

  const stage = await db.crmStage.findUnique({ where: { id: d.stageId }, include: { pipeline: true } })
  if (!stage || stage.pipeline.ownerId !== user.id) return fail('Etapa inválida', 403)

  const maxPos = await db.crmDeal.aggregate({ where: { stageId: d.stageId }, _max: { position: true } })
  const deal = await db.crmDeal.create({
    data: {
      pipelineId: d.pipelineId,
      stageId: d.stageId,
      title: d.title,
      value: d.value || 0,
      counterpartyId: d.counterpartyId || null,
      note: d.note || null,
      jobId: d.jobId || null,
      projectId: d.projectId || null,
      position: (maxPos._max.position ?? -1) + 1,
    },
    include: { counterparty: { select: { id: true, displayName: true, avatarUrl: true } } },
  })
  return ok({ deal }, 201)
}

// PATCH: mover trato de etapa / editar
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const d = await body<{ id: string; stageId?: string; value?: number; note?: string; title?: string }>(req)
  if (!d.id) return fail('Falta el id del trato')

  const deal = await db.crmDeal.findUnique({ where: { id: d.id }, include: { pipeline: true } })
  if (!deal || deal.pipeline.ownerId !== user.id) return fail('Trato no encontrado', 404)

  const data: Record<string, unknown> = {}
  if (d.stageId) {
    const stage = await db.crmStage.findUnique({ where: { id: d.stageId }, include: { pipeline: true } })
    if (!stage || stage.pipeline.ownerId !== user.id) return fail('Etapa inválida', 403)
    data.stageId = d.stageId
    const maxPos = await db.crmDeal.aggregate({ where: { stageId: d.stageId }, _max: { position: true } })
    data.position = (maxPos._max.position ?? -1) + 1
  }
  if (d.value !== undefined) data.value = d.value
  if (d.note !== undefined) data.note = d.note
  if (d.title !== undefined) data.title = d.title

  const updated = await db.crmDeal.update({
    where: { id: d.id },
    data,
    include: { counterparty: { select: { id: true, displayName: true, avatarUrl: true } } },
  })
  return ok({ deal: updated })
}

// DELETE: eliminar trato
export async function DELETE(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const sp = req.nextUrl.searchParams
  const id = sp.get('id')
  if (!id) return fail('Falta el id')
  const deal = await db.crmDeal.findUnique({ where: { id }, include: { pipeline: true } })
  if (!deal || deal.pipeline.ownerId !== user.id) return fail('Trato no encontrado', 404)
  await db.crmDeal.delete({ where: { id } })
  return ok({ success: true })
}
