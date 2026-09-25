import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireAdmin } from '@/lib/admin'
import { aCsv } from '@/lib/analytics/core'
import { calcularSeccion, parsearPeriodo, saludRegistro, SECCIONES } from '@/lib/analytics/metricas'

// GET /api/admin/metricas?seccion=usuarios|uso|embudos|retencion|negocio&periodo=hoy|7|30|90|rango
//   [&desde=AAAA-MM-DD&hasta=AAAA-MM-DD][&prueba=incluir][&csv=<tabla>]
// Solo administradores (sesión de /admin, D25/D27): a cualquier otro 404, igual que si no existiera.
export const dynamic = 'force-dynamic'
export const maxDuration = 30

const query = z.object({
  seccion: z.enum(SECCIONES).default('usuarios'),
  csv: z.string().regex(/^[a-z_]{1,40}$/).optional(),
})

export async function GET(req: NextRequest) {
  // D29: solo la sesión de admin de /admin (cookie homia_admin); sin ella 404
  const adm = await requireAdmin()
  if (adm.response) return adm.response

  const sp = req.nextUrl.searchParams
  const q = query.safeParse({ seccion: sp.get('seccion') || undefined, csv: sp.get('csv') || undefined })
  if (!q.success) return fail('Parámetros inválidos', 400)
  const filtro = parsearPeriodo(sp)

  const t0 = Date.now()
  const [seccion, salud] = await Promise.all([calcularSeccion(q.data.seccion, filtro), saludRegistro()])
  const ms = Date.now() - t0

  if (q.data.csv) {
    const t = seccion.tablas[q.data.csv]
    if (!t) return fail('Esa tabla no existe', 404)
    const nombre = `homia-${q.data.seccion}-${q.data.csv}-${filtro.desde.toISOString().slice(0, 10)}.csv`
    return new NextResponse(aCsv(t.columnas, t.filas), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${nombre}"`,
        'Cache-Control': 'no-store',
      },
    })
  }
  return ok({
    seccion: q.data.seccion,
    periodo: { desde: filtro.desde.toISOString(), hasta: filtro.hasta.toISOString(), excluirPrueba: filtro.excluirPrueba },
    registroDesde: salud.desde,
    salud: salud.porTipo,
    ms,
    ...seccion,
  })
}
