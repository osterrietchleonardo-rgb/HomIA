import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

/** Valida los campos libres de un trato (antes un valor no numérico o una
 *  contraparte inexistente terminaban en 500). */
function dealFieldsError(d: { value?: unknown; note?: unknown; counterpartyId?: unknown }): string | null {
  if (d.value !== undefined && d.value !== null && (typeof d.value !== 'number' || !Number.isFinite(d.value) || d.value < 0 || d.value > 1_000_000_000)) {
    return 'El valor del trato tiene que ser un número positivo'
  }
  if (d.note !== undefined && d.note !== null && (typeof d.note !== 'string' || d.note.length > 2000)) return 'La nota puede tener hasta 2000 caracteres'
  if (d.counterpartyId !== undefined && d.counterpartyId !== null && typeof d.counterpartyId !== 'string') return 'Contraparte inválida'
  return null
}

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
  if (!d.stageId || typeof d.title !== 'string' || !d.title.trim()) return fail('Faltan datos del trato')
  if (d.title.length > 160) return fail('El título puede tener hasta 160 caracteres')
  const invalid = dealFieldsError(d)
  if (invalid) return fail(invalid)

  const stage = await db.crmStage.findUnique({ where: { id: d.stageId }, include: { pipeline: true } })
  if (!stage || stage.pipeline.ownerId !== user.id) return fail('Etapa inválida', 403)
  if (d.counterpartyId) {
    const cp = await db.user.findUnique({ where: { id: d.counterpartyId }, select: { id: true } })
    if (!cp) return fail('La contraparte del trato no existe')
  }

  const maxPos = await db.crmDeal.aggregate({ where: { stageId: d.stageId }, _max: { position: true } })
  const deal = await db.crmDeal.create({
    data: {
      // el pipeline sale SIEMPRE de la etapa validada (nunca del body: evita colgar
      // un trato en el pipeline de otro usuario)
      pipelineId: stage.pipelineId,
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
  const invalid = dealFieldsError(d)
  if (invalid) return fail(invalid)
  if (d.title !== undefined && (typeof d.title !== 'string' || !d.title.trim() || d.title.length > 160)) return fail('Título inválido')

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
  if (d.value !== undefined && d.value !== null) data.value = d.value
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
