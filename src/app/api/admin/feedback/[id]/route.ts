import { NextRequest } from 'next/server'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { requireAdmin } from '@/lib/admin'
import { notificar } from '@/lib/notify'
import { actualizarFeedbackSchema, estadoLabel, linkMisSugerencias } from '@/lib/feedback'
import { firmarFotos, refsDeFotos, vistaFeedback } from '@/lib/feedback-server'

// PATCH /api/admin/feedback/[id] — el administrador cambia el estado y/o responde.
// Si algo cambió, el autor recibe una notificación en la app y un mail
// (tipos sugerencia_respuesta / sugerencia_estado en src/lib/notify.ts).
// No admin → 404.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  // D29: solo la sesión de admin de /admin; sin ella 404
  const adm = await requireAdmin()
  if (adm.response) return adm.response
  const { data, error } = await parseBody(req, actualizarFeedbackSchema)
  if (error) return error
  const { id } = await params
  const f = await db.feedback.findUnique({ where: { id } })
  if (!f) return fail('No encontramos ese envío', 404)

  const nuevoEstado = data.status !== undefined && data.status !== f.status ? data.status : undefined
  const respuesta = data.adminResponse !== undefined ? data.adminResponse || null : undefined
  const nuevaRespuesta = respuesta !== undefined && respuesta !== f.adminResponse ? respuesta : undefined
  if (nuevoEstado === undefined && nuevaRespuesta === undefined) {
    const firmas = await firmarFotos(refsDeFotos([f]))
    return ok({ item: vistaFeedback(f, firmas), changed: false })
  }

  const actualizado = await db.feedback.update({
    where: { id },
    data: {
      ...(nuevoEstado !== undefined ? { status: nuevoEstado } : {}),
      ...(nuevaRespuesta !== undefined ? { adminResponse: nuevaRespuesta, respondedAt: nuevaRespuesta ? new Date() : null } : {}),
    },
  })

  const estadoFinal = estadoLabel(actualizado.status)
  const link = `#${linkMisSugerencias(f.role)}?id=${f.id}`
  if (nuevaRespuesta) {
    await notificar({
      data: {
        userId: f.userId,
        type: 'sugerencia_respuesta',
        title: 'Te respondimos tu sugerencia',
        // la respuesta sale firmada por el equipo (el admin no es una persona con cuenta, D29)
        body: `"${f.title}" · Estado: ${estadoFinal}. Equipo HomIA: ${nuevaRespuesta.length > 300 ? `${nuevaRespuesta.slice(0, 300)}…` : nuevaRespuesta}`,
        link,
      },
    })
  } else if (nuevoEstado !== undefined) {
    await notificar({
      data: {
        userId: f.userId,
        type: 'sugerencia_estado',
        title: `Tu sugerencia está: ${estadoFinal}`,
        body: `"${f.title}" pasó a ${estadoFinal.toLowerCase()}.`,
        link,
      },
    })
  }

  const firmas = await firmarFotos(refsDeFotos([actualizado]))
  return ok({ item: vistaFeedback(actualizado, firmas), changed: true })
}
