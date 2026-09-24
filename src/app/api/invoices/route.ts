import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, requireAuth } from '@/lib/api'
import { db } from '@/lib/db'

// GET /api/invoices?mine=1[&estado=pendientes|cobradas|todas]
// Cobros del PROFESIONAL: las facturas que emitió en TODOS sus proyectos, con el
// resumen (cobrado este mes, pendiente de cobro, cantidad pendiente).
// Solo las del profesional de la sesión (el dueño sale de la sesión, nunca del
// query). Sin tokens ni datos sensibles: del cliente solo el nombre.

const querySchema = z.object({
  mine: z.literal('1', { message: 'Falta mine=1: este listado es solo de tus facturas' }),
  estado: z.enum(['pendientes', 'cobradas', 'todas'], { message: 'estado tiene que ser pendientes, cobradas o todas' }).default('todas'),
})

/** Inicio del mes calendario en Argentina (UTC-3, sin horario de verano), como Date UTC. */
function inicioMesArgentina(now = new Date()): Date {
  const ar = new Date(now.getTime() - 3 * 3600_000)
  return new Date(Date.UTC(ar.getUTCFullYear(), ar.getUTCMonth(), 1, 3, 0, 0))
}

export async function GET(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response

  const sp = req.nextUrl.searchParams
  const parsed = querySchema.safeParse({ mine: sp.get('mine') ?? undefined, estado: sp.get('estado') ?? undefined })
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Parámetros inválidos', 400)

  const pro = await db.professionalProfile.findUnique({ where: { userId: auth.user.id }, select: { id: true } })
  if (!pro) return fail('Los cobros de facturas son del perfil profesional', 403, { needsRole: 'profesional' })

  const invoices = await db.invoice.findMany({
    where: { professionalId: pro.id },
    orderBy: { issuedAt: 'desc' },
    take: 500,
    select: {
      id: true, number: true, issuedAt: true, paidAt: true, status: true, paymentMethod: true,
      laborCost: true, materialsCost: true, total: true, serviceFee: true,
      project: { select: { id: true, title: true, client: { select: { displayName: true } } } },
      payments: { select: { method: true, status: true } },
    },
  })

  const desde = inicioMesArgentina()
  const rows = invoices.map((inv) => {
    const cobrada = inv.status === 'pagada'
    const efectivoAcordado = !cobrada && inv.payments.some((p) => p.method === 'efectivo' && p.status === 'acordado')
    return {
      id: inv.id,
      number: inv.number,
      issuedAt: inv.issuedAt,
      paidAt: inv.paidAt,
      status: inv.status,
      paymentMethod: inv.paymentMethod,
      laborCost: inv.laborCost,
      materialsCost: inv.materialsCost,
      total: inv.total,
      // cargo de servicio HomIA (1%) que pagó el CLIENTE aparte (solo Mercado Pago)
      serviceFee: inv.paymentMethod === 'mercadopago' ? inv.serviceFee : 0,
      efectivoAcordado,
      project: { id: inv.project.id, title: inv.project.title },
      clientName: inv.project.client?.displayName || 'Cliente',
    }
  })

  const pendientes = rows.filter((r) => r.status !== 'pagada')
  const resumen = {
    cobradoMes: rows.filter((r) => r.status === 'pagada' && r.paidAt && r.paidAt >= desde).reduce((a, r) => a + r.total, 0),
    pendienteTotal: pendientes.reduce((a, r) => a + r.total, 0),
    pendientesCount: pendientes.length,
    efectivoPorConfirmar: pendientes.filter((r) => r.efectivoAcordado).length,
    total: rows.length,
  }

  const estado = parsed.data.estado
  const lista = estado === 'pendientes' ? pendientes : estado === 'cobradas' ? rows.filter((r) => r.status === 'pagada') : rows

  return ok({ invoices: lista, resumen, mesDesde: desde })
}
