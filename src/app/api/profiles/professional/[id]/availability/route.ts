// Disponibilidad PÚBLICA de un profesional (D21): la ven visitantes, clientes y proveedores.
// Privacidad: solo rangos de días anónimos y unidos ("ocupado" = fechas acordadas,
// "por_confirmar" = fechas propuestas). Nunca título, cliente, dirección, nota ni ids de proyectos.
// Ventana: por defecto hoy + 3 meses; máximo 6 meses; no antes del mes en curso.
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { addDays, diffDays, isDayKey, todayKey } from '@/lib/schedule'
import { availabilityOf } from '@/lib/schedule-server'
import { whereUsuarioPublico } from '@/lib/visibility'

const day = z.string().refine(isDayKey, 'Fecha inválida: usá el formato AAAA-MM-DD')
const querySchema = z.object({ from: day.optional(), to: day.optional() })
const MAX_VENTANA = 186 // ≈ 6 meses

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const q = querySchema.safeParse(Object.fromEntries(req.nextUrl.searchParams))
  if (!q.success) return fail(q.error.issues[0]?.message || 'Parámetros inválidos')

  // Misma regla que el resto de lo público (D20, src/lib/visibility.ts): cuentas eliminadas y,
  // con HIDE_DEMO_USERS=1, las demo → 404.
  const pro = await db.professionalProfile.findFirst({ where: { id, user: whereUsuarioPublico() }, select: { id: true } })
  if (!pro) return fail('Profesional no encontrado', 404)

  const today = todayKey()
  const monthStart = `${today.slice(0, 7)}-01`
  let from = q.data.from || today
  if (from < monthStart) from = monthStart
  const to = q.data.to || addDays(today, 91)
  if (to < from) return fail('El fin de la ventana no puede ser anterior al inicio')
  if (diffDays(from, to) > MAX_VENTANA) return fail('La disponibilidad se consulta de a 6 meses como máximo')

  const a = await availabilityOf(pro.id, from, to)
  return ok({ today, ...a })
}
