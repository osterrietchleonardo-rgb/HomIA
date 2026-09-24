import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

function sanitizeWorkPhotos(list: unknown): string[] {
  return Array.isArray(list)
    ? list.filter((p): p is string => typeof p === 'string' && p.length < 500 && /^(https?:\/\/.+|\/uploads\/.+)\.(jpg|jpeg|png|webp)$/i.test(p)).slice(0, 4)
    : []
}

const patchSchema = z.object({
  title: z.string().trim().min(3, 'El título tiene que tener al menos 3 letras').max(120, 'El título puede tener hasta 120 caracteres').optional(),
  description: z.string().trim().min(10, 'Contá un poco más de la obra (mínimo 10 caracteres)').max(4000, 'La descripción puede tener hasta 4000 caracteres').optional(),
  photos: z.array(z.string()).max(4, 'Máximo 4 fotos por obra').optional(),
  categorySlug: z.string().max(60).nullable().optional(),
})

async function loadOwnWork(id: string) {
  const user = await getSessionUser()
  if (!user) return { error: fail('Necesitás iniciar sesión', 401) }
  const work = await db.completedWork.findUnique({ where: { id } })
  if (!work || !work.visible) return { error: fail('Obra no encontrada', 404) }
  if (work.authorId !== user.id) return { error: fail('Solo quien publicó la obra puede modificarla', 403) }
  return { user, work }
}

// PATCH: editar título, descripción, fotos o categoría (solo autor)
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await loadOwnWork(id)
  if (r.error) return r.error
  const parsed = await parseBody(req, patchSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data
  const data: { title?: string; description?: string; photos?: string; categorySlug?: string | null } = {}
  if (d.title !== undefined) data.title = d.title
  if (d.description !== undefined) data.description = d.description
  if (d.photos !== undefined) data.photos = JSON.stringify(sanitizeWorkPhotos(d.photos))
  if (d.categorySlug !== undefined) data.categorySlug = d.categorySlug || null
  if (Object.keys(data).length === 0) return fail('No hay cambios para guardar', 400)
  const work = await db.completedWork.update({ where: { id }, data })
  return ok({ work })
}

// DELETE: baja lógica (visible=false) y descuenta del contador del perfil (solo autor)
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const r = await loadOwnWork(id)
  if (r.error) return r.error
  await db.completedWork.update({ where: { id }, data: { visible: false } })
  // obras viejas del profesional pueden no tener professionalId (se sumaron al contador igual)
  const proWhere = r.work.professionalId
    ? { id: r.work.professionalId }
    : r.work.authorRole === 'profesional' ? { userId: r.user.id } : null
  if (proWhere) {
    await db.professionalProfile.updateMany({
      where: { ...proWhere, worksCount: { gt: 0 } },
      data: { worksCount: { decrement: 1 } },
    })
  }
  return ok({ success: true })
}
