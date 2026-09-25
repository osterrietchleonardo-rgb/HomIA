import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody, parseJson } from '@/lib/api'
import { db } from '@/lib/db'
import { sesionConRol, rolSchema, diaSchema } from '@/lib/finanzas/servidor'
import { claveDia, inicioDia } from '@/lib/finanzas/calculos'

// PUT /api/finanzas/config { role, saldoInicial?, fechaSaldoInicial?, costoEstimadoPct?, primerUsoHecho?, asignar? }
//   · saldoInicial + fechaSaldoInicial: la caja del negocio al cierre de ese día (se carga una vez; se puede corregir).
//   · costoEstimadoPct (proveedor): "compro al X% del precio de venta", 1-99, o null para borrarlo.
//   · asignar (profesional): { chargeId, destino: <projectId propio> | "personal" | null } para una compra de HomIA.
const schema = z.object({
  role: rolSchema,
  saldoInicial: z.number().min(-1e11).max(1e11).nullable().optional(),
  fechaSaldoInicial: diaSchema.nullable().optional(),
  costoEstimadoPct: z.number().min(1, 'El porcentaje va de 1 a 99').max(99, 'El porcentaje va de 1 a 99').nullable().optional(),
  primerUsoHecho: z.boolean().optional(),
  asignar: z.object({ chargeId: z.string().min(1).max(40), destino: z.string().min(1).max(40).nullable() }).optional(),
})

export async function PUT(req: NextRequest) {
  const parsed = await parseBody(req, schema)
  if (parsed.error) {
    // sin sesión, 401 aunque el body esté mal
    const s0 = await sesionConRol('profesional')
    if ('response' in s0 && s0.response.status === 401) return s0.response
    return parsed.error
  }
  const d = parsed.data
  const s = await sesionConRol(d.role)
  if ('response' in s) return s.response
  const userId = s.user.id
  const hoy = claveDia(new Date())

  const data: { openingCash?: number | null; openingDate?: Date | null; estimatedCostPct?: number | null; onboardedAt?: Date; tags?: string } = {}
  if (d.saldoInicial !== undefined) {
    if (d.saldoInicial === null) {
      data.openingCash = null
      data.openingDate = null
    } else {
      const f = d.fechaSaldoInicial || hoy
      if (f > hoy) return fail('La fecha del saldo inicial no puede ser futura', 400)
      data.openingCash = Math.round(d.saldoInicial * 100) / 100
      // "saldo al CIERRE de ese día": lo que pasó ese mismo día ya está adentro del saldo
      // (evita contar dos veces un gasto pagado hoy y cargado en el primer uso)
      data.openingDate = new Date(inicioDia(f).getTime() + 86400_000 - 1)
    }
  }
  if (d.costoEstimadoPct !== undefined) {
    if (s.rol !== 'proveedor') return fail('El margen estimado es del proveedor', 400)
    data.estimatedCostPct = d.costoEstimadoPct
  }
  if (d.primerUsoHecho) data.onboardedAt = new Date()

  if (d.asignar) {
    if (s.rol !== 'profesional') return fail('Asignar compras a una obra es del profesional', 400)
    const charge = await db.providerCharge.findFirst({ where: { id: d.asignar.chargeId, clientId: userId, projectId: null }, select: { id: true } })
    if (!charge) return fail('No encontramos esa compra', 404)
    const destino = d.asignar.destino
    if (destino && destino !== 'personal') {
      const own = await db.project.findFirst({ where: { id: destino, pro: { userId } }, select: { id: true } })
      if (!own) return fail('Esa obra no es tuya', 403)
    }
    const actual = await db.financeConfig.findUnique({ where: { userId_role: { userId, role: s.rol } }, select: { tags: true } })
    const tags = parseJson<Record<string, string>>(actual?.tags, {})
    if (destino) tags[charge.id] = destino
    else delete tags[charge.id]
    data.tags = JSON.stringify(tags)
  }
  const c = await db.financeConfig.upsert({
    where: { userId_role: { userId, role: s.rol } },
    create: { userId, role: s.rol, ...data },
    update: data,
  })
  return ok({
    config: {
      saldoInicial: c.openingCash, fechaSaldoInicial: c.openingDate ? claveDia(c.openingDate) : null,
      costoEstimadoPct: c.estimatedCostPct, primerUsoHecho: !!c.onboardedAt,
    },
  })
}
