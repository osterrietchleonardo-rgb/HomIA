import { NextRequest } from 'next/server'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { sesionConRol, movimientoSchema, validarMovimiento, rolSchema, vistaMovimiento } from '@/lib/finanzas/servidor'

// GET  /api/finanzas/movimientos?role=  → movimientos cargados a mano (sin los dados de baja), del más nuevo al más viejo.
// POST /api/finanzas/movimientos        → alta { role, type, category, description, amount, date, … } (zod + reglas en servidor.ts).
// El dueño sale de la sesión: nunca se acepta userId del body.

export async function GET(req: NextRequest) {
  const s = await sesionConRol(req.nextUrl.searchParams.get('role'))
  if ('response' in s) return s.response
  const rows = await db.financeEntry.findMany({ where: { userId: s.user.id, role: s.rol, deletedAt: null }, orderBy: [{ date: 'desc' }, { createdAt: 'desc' }], take: 1000 })
  return ok({ movimientos: rows.map(vistaMovimiento) })
}

const altaSchema = movimientoSchema.extend({ role: rolSchema })

export async function POST(req: NextRequest) {
  const parsed = await parseBody(req, altaSchema)
  if (parsed.error) {
    // sin sesión manda el 401 aunque el body esté mal
    const s0 = await sesionConRol('profesional')
    if ('response' in s0 && s0.response.status === 401) return s0.response
    return parsed.error
  }
  const s = await sesionConRol(parsed.data.role)
  if ('response' in s) return s.response
  const v = await validarMovimiento(parsed.data, s.rol, s.user.id)
  if ('error' in v) return fail(v.error, 400)
  const count = await db.financeEntry.count({ where: { userId: s.user.id, role: s.rol, deletedAt: null } })
  if (count >= 5000) return fail('Llegaste al máximo de 5.000 movimientos cargados', 409)
  const e = await db.financeEntry.create({ data: { ...v.data, userId: s.user.id, role: s.rol } })
  return ok({ movimiento: vistaMovimiento(e) }, 201)
}
