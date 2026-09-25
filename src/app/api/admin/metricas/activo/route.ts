import { NextRequest, NextResponse } from 'next/server'
import { ok, fail } from '@/lib/api'
import { requireAdmin } from '@/lib/admin'
import { aCsv, TIPOS_ENTIDAD } from '@/lib/analytics/core'
import { fichaActivo } from '@/lib/analytics/metricas'

// GET /api/admin/metricas/activo?tipo=project&id=<id>[&csv=linea] → quién hizo qué y cuándo con ese activo
// (hechos de negocio + uso registrado). Solo administradores (sesión de /admin).
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // D29: solo la sesión de admin de /admin (cookie homia_admin); sin ella 404
  const adm = await requireAdmin()
  if (adm.response) return adm.response

  const sp = req.nextUrl.searchParams
  const tipo = sp.get('tipo') || ''
  const id = (sp.get('id') || '').trim()
  if (!(TIPOS_ENTIDAD as readonly string[]).includes(tipo) || !/^[\w-]{1,64}$/.test(id)) return fail('Activo inválido', 400)
  const ficha = await fichaActivo(tipo, id)
  if (!ficha) return fail('No encontramos ese activo', 404)
  if (sp.get('csv') === 'linea') {
    return new NextResponse(aCsv(['Fecha', 'Fuente', 'Quién', 'Rol', 'Qué', 'Detalle'], ficha.linea.map((l) => [l.fecha, l.fuente, l.quien, l.rol, l.que, l.detalle])), {
      headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="homia-${tipo}-${id}.csv"`, 'Cache-Control': 'no-store' },
    })
  }
  return ok(ficha)
}
