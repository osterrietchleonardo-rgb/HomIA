import { NextRequest, NextResponse } from 'next/server'
import { ok, fail } from '@/lib/api'
import { requireAdmin } from '@/lib/admin'
import { aCsv } from '@/lib/analytics/core'
import { buscarUsuarios, fichaUsuario } from '@/lib/analytics/metricas'

// GET /api/admin/metricas/usuario?q=<email o nombre>  → hasta 20 usuarios
// GET /api/admin/metricas/usuario?id=<userId>[&csv=linea|sesiones] → ficha completa (uso + negocio)
// Solo administradores (sesión de /admin). Nunca el texto de los mensajes: solo que se mandó y cuándo.
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  // D29: solo la sesión de admin de /admin (cookie homia_admin); sin ella 404
  const adm = await requireAdmin()
  if (adm.response) return adm.response

  const sp = req.nextUrl.searchParams
  const id = (sp.get('id') || '').trim()
  if (id) {
    if (!/^[\w-]{1,64}$/.test(id)) return fail('Usuario inválido', 400)
    const ficha = await fichaUsuario(id)
    if (!ficha) return fail('No encontramos ese usuario', 404)
    const csv = sp.get('csv')
    if (csv === 'linea' || csv === 'sesiones') {
      const body = csv === 'linea'
        ? aCsv(['Fecha', 'Fuente', 'Tipo', 'Detalle', 'Pantalla', 'Activo', 'Id activo'], ficha.linea.map((l) => [l.fecha, l.fuente, l.tipo, l.detalle, l.path, l.entityType, l.entityId]))
        : aCsv(['Inicio', 'Última actividad', 'Minutos activos', 'Pantallas', 'Eventos', 'Entrada', 'Origen', 'Dispositivo'], ficha.sesiones.map((s) => [s.inicio, s.ultima, s.minutos, s.vistas, s.eventos, s.entrada, s.origen, s.dispositivo]))
      return new NextResponse(body, { headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="homia-usuario-${id}-${csv}.csv"`, 'Cache-Control': 'no-store' } })
    }
    return ok(ficha)
  }
  const q = (sp.get('q') || '').trim()
  if (q.length < 2 || q.length > 80) return fail('Escribí al menos 2 letras del email o del nombre', 400)
  return ok({ usuarios: await buscarUsuarios(q) })
}
