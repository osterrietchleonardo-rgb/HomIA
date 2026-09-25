import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { sesionConRol } from '@/lib/finanzas/servidor'

// PUT /api/finanzas/costos { items: [{ stockId, unitCost | null }] } — proveedor: costo de compra por
// unidad de sus productos (para el costo de lo vendido y el valor del stock). Solo su propio stock.
const schema = z.object({
  items: z.array(z.object({
    stockId: z.string().min(1).max(40),
    unitCost: z.number().min(0, 'El costo no puede ser negativo').max(1e10).nullable(),
  })).min(1, 'Mandá al menos un producto').max(500, 'Hasta 500 productos por vez'),
})

export async function PUT(req: NextRequest) {
  const s = await sesionConRol('proveedor')
  if ('response' in s) return s.response
  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error
  const ids = [...new Set(parsed.data.items.map((i) => i.stockId))]
  const propios = await db.providerStock.findMany({ where: { id: { in: ids }, provider: { userId: s.user.id } }, select: { id: true } })
  if (propios.length !== ids.length) return fail('Alguno de esos productos no es de tu stock', 403)
  await db.$transaction(parsed.data.items.map((i) => db.providerStock.update({
    where: { id: i.stockId },
    data: { unitCost: i.unitCost === null ? null : Math.round(i.unitCost * 100) / 100 },
  })))
  return ok({ success: true, actualizados: parsed.data.items.length })
}
