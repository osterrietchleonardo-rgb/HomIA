import { ok } from '@/lib/api'
import { cerrarSesionAdmin, getAdminSession } from '@/lib/admin'
import { registrarEvento } from '@/lib/analytics/server'

// POST /api/admin/logout — cierra la sesión de administración (D29). No toca la sesión de usuario.
export async function POST(req: Request) {
  if (await getAdminSession()) registrarEvento(req, { name: 'admin_logout', path: '/admin' })
  await cerrarSesionAdmin()
  return ok({ admin: false })
}
