import { NextRequest } from 'next/server'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { sesionConRol, movimientoSchema, validarMovimiento, movimientoPropio, vistaMovimiento } from '@/lib/finanzas/servidor'
import { claveDia } from '@/lib/finanzas/calculos'

// PATCH  /api/finanzas/movimientos/[id]  → edita (campos parciales; se valida el resultado completo).
//        Terminar un recurrente = { recurringUntil: "AAAA-MM-DD" }.
// DELETE /api/finanzas/movimientos/[id]  → baja lógica (deletedAt).
// Solo el dueño (sesión): uno ajeno responde 404 igual que uno inexistente.

const patchSchema = movimientoSchema.partial()

async function propio(id: string) {
  const user = await getSessionUser()
  if (!user) return { response: fail('Necesitás iniciar sesión para ver tus finanzas', 401) }
  const e = await movimientoPropio(id, user.id)
  if (!e) return { response: fail('No encontramos ese movimiento', 404) }
  const s = await sesionConRol(e.role)
  if ('response' in s) return { response: s.response }
  return { e, user: s.user, rol: s.rol }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const p = await propio(id)
  if ('response' in p) return p.response
  const parsed = await parseBody(req, patchSchema)
  if (parsed.error) return parsed.error
  const e = p.e
  const merged = {
    type: e.type, category: e.category, description: e.description, amount: e.amount, interestAmount: e.interestAmount,
    date: claveDia(e.date), paymentMethod: e.paymentMethod, recurring: e.recurring, recurringUntil: e.recurringUntil ? claveDia(e.recurringUntil) : null,
    projectId: e.projectId, usefulLifeMonths: e.usefulLifeMonths, status: e.status, attachmentUrl: e.attachmentUrl,
    ...parsed.data,
  }
  const full = movimientoSchema.safeParse(merged)
  if (!full.success) return fail(full.error.issues[0]?.message || 'Datos inválidos', 400)
  const v = await validarMovimiento(full.data, p.rol, p.user.id)
  if ('error' in v) return fail(v.error, 400)
  const upd = await db.financeEntry.update({ where: { id: e.id }, data: v.data })
  return ok({ movimiento: vistaMovimiento(upd) })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const p = await propio(id)
  if ('response' in p) return p.response
  await db.financeEntry.update({ where: { id: p.e.id }, data: { deletedAt: new Date() } })
  return ok({ success: true })
}
