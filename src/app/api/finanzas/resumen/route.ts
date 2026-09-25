import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { sesionConRol, periodoDeQuery } from '@/lib/finanzas/servidor'
import { cargarEntrada } from '@/lib/finanzas/datos'
import { reporte, movimientosDelPeriodo, claveDia } from '@/lib/finanzas/calculos'
import { PLAN_PRICE_ARS } from '@/lib/plans'

// GET /api/finanzas/resumen?role=profesional|proveedor&periodo=mes|mes_anterior|3m|6m|12m|anio
//                          (o &desde=AAAA-MM-DD&hasta=AAAA-MM-DD)
// Todo calculado en el servidor (src/lib/finanzas/calculos.ts) con datos reales de la base
// (src/lib/finanzas/datos.ts): 8 consultas en paralelo. Solo del usuario de la sesión.
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const s = await sesionConRol(sp.get('role'))
  if ('response' in s) return s.response
  const hoy = new Date()
  const per = periodoDeQuery(sp, hoy)
  if ('error' in per) return fail(per.error, 400)

  const t0 = Date.now()
  const { entrada, extra } = await cargarEntrada(s.user.id, s.rol, hoy)
  const tDatos = Date.now() - t0
  const r = reporte(entrada, per.p)
  const movimientos = movimientosDelPeriodo(entrada, per.p.desde, per.p.hasta)

  // Proveedor: la suscripción de HomIA NO tiene registro de pagos en la base (solo el plan):
  // se SUGIERE como gasto mensual a confirmar, nunca se carga sola.
  let sugerenciaSuscripcion: { plan: 'basic' | 'pro'; monto: number } | null = null
  if (s.rol === 'proveedor' && extra.plan && (extra.plan.subscription === 'basic' || extra.plan.subscription === 'pro')) {
    const yaCargada = entrada.movimientos.some((m) => m.category === 'suscripcion_homia')
    if (!yaCargada) sugerenciaSuscripcion = { plan: extra.plan.subscription, monto: PLAN_PRICE_ARS[extra.plan.subscription] }
  }

  return ok({
    rol: s.rol,
    hoy: claveDia(hoy),
    reporte: r,
    movimientos,
    config: {
      saldoInicial: extra.config.openingCash,
      fechaSaldoInicial: extra.config.openingDate ? claveDia(extra.config.openingDate) : null,
      costoEstimadoPct: extra.config.estimatedCostPct,
      primerUsoHecho: !!extra.config.onboardedAt,
    },
    obras: extra.obras,
    stock: extra.stock,
    sugerenciaSuscripcion,
    cantidadMovimientosManuales: entrada.movimientos.length,
    tiempos: { datosMs: tDatos, totalMs: Date.now() - t0 },
  })
}
