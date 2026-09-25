import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail } from '@/lib/api'
import { requireAdmin } from '@/lib/admin'
import { fichaProveedor } from '@/lib/ingresos-admin'

// GET /api/admin/ingresos/proveedor?id=<providerId> — ficha de cuenta de un proveedor (D30):
// estado, suscripción en MP y la línea de tiempo completa (alta, prueba, cobros, cambios, bajas).
// Solo con la sesión de /admin (D29); sin ella 404.
export const dynamic = 'force-dynamic'

const query = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{8,40}$/) })

export async function GET(req: NextRequest) {
  const adm = await requireAdmin()
  if (adm.response) return adm.response
  const q = query.safeParse({ id: req.nextUrl.searchParams.get('id') || '' })
  if (!q.success) return fail('Proveedor inválido', 400)
  const ficha = await fichaProveedor(q.data.id)
  if (!ficha) return fail('No encontramos ese proveedor', 404)
  return ok(ficha)
}
