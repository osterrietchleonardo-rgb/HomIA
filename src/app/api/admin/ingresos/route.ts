import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireAdmin } from '@/lib/admin'
import { aCsv } from '@/lib/analytics/core'
import { parsearPeriodo } from '@/lib/analytics/metricas'
import { calcularIngresos } from '@/lib/ingresos-admin'

// GET /api/admin/ingresos — "Ingresos de HomIA" (D30): suscripciones de proveedores + cargo de
// servicio 1%, estado de cuenta por proveedor, movimiento por fecha, churn y conversión.
//   ?periodo=hoy|7|30|90|rango[&desde=AAAA-MM-DD&hasta=AAAA-MM-DD]&gran=dia|semana|mes
//   [&prueba=incluir][&proveedor=<texto>][&plan=basic|pro][&estado=<estado MP>]
//   [&fuente=suscripcion|cargo][&estadoCuenta=<estado>][&csv=<tabla>]
// Solo con la sesión de /admin (D29): a cualquier otro 404, igual que si no existiera.
// Solo lectura: a Mercado Pago se lo consulta con los tokens del servidor (sin OAuth ni conexión).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const query = z.object({
  gran: z.enum(['dia', 'semana', 'mes']).default('dia'),
  proveedor: z.string().trim().max(80).optional(),
  plan: z.enum(['basic', 'pro']).optional(),
  estado: z.string().regex(/^[a-z_]{1,30}$/).optional(),
  fuente: z.enum(['suscripcion', 'cargo']).optional(),
  estadoCuenta: z.enum(['al_dia', 'en_deuda', 'sin_cobro', 'en_prueba', 'prueba_vencida', 'baja']).optional(),
  csv: z.enum(['cobros', 'cargos', 'cuentas', 'proximos', 'movimiento', 'mensual', 'ranking_proveedores', 'ranking_vendedores']).optional(),
})

export async function GET(req: NextRequest) {
  const adm = await requireAdmin()
  if (adm.response) return adm.response

  const sp = req.nextUrl.searchParams
  const val = (k: string) => sp.get(k) || undefined
  const q = query.safeParse({
    gran: val('gran'), proveedor: val('proveedor'), plan: val('plan'), estado: val('estado'),
    fuente: val('fuente'), estadoCuenta: val('estadoCuenta'), csv: val('csv'),
  })
  if (!q.success) return fail('Parámetros inválidos', 400)
  const per = parsearPeriodo(sp)

  let data: Awaited<ReturnType<typeof calcularIngresos>>
  try {
    data = await calcularIngresos({ desde: per.desde, hasta: per.hasta, incluirPrueba: !per.excluirPrueba, ...q.data })
  } catch (e) {
    console.error('[admin/ingresos]', e)
    return fail('No pudimos calcular los ingresos. Probá de nuevo en un rato.', 500)
  }

  if (q.data.csv) {
    const t = data.tablas[q.data.csv]
    if (!t) return fail('Esa tabla no existe con estos filtros', 404)
    // fechas ISO → fecha y hora de Argentina para el contador
    const fmt = (v: string | number | null) =>
      typeof v === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(v)
        ? new Date(v).toLocaleString('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
        : v
    const nombre = `homia-ingresos-${q.data.csv}-${per.desde.toISOString().slice(0, 10)}.csv`
    return new NextResponse(aCsv(t.columnas, t.filas.map((f) => f.map(fmt))), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nombre}"`,
        'Cache-Control': 'no-store',
      },
    })
  }
  return ok(data)
}
