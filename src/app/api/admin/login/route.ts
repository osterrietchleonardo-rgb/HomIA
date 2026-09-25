import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { ipDe } from '@/lib/homy/cupo'
import { crearLimitadorFallos, verificarCredenciales } from '@/lib/admin-core'
import { crearSesionAdmin, getAdminSession } from '@/lib/admin'
import { registrarEvento } from '@/lib/analytics/server'

// Ingreso al área /admin (D29): ADMIN_EMAIL + ADMIN_PASSWORD del servidor, sin cuenta de usuario.
// POST { email, password } → cookie httpOnly `homia_admin` (12 h). Mensaje genérico si falla.
// Anti fuerza bruta: 5 fallos por IP cada 15 min → 429 (en memoria de cada instancia; en Vercel
// además va una regla de Firewall para /api/admin/login, como la del login).
// GET → { admin: boolean } (para que la SPA sepa si mostrar el ingreso o el panel).
export const dynamic = 'force-dynamic'

const limitador = crearLimitadorFallos()
const schema = z.object({
  email: z.string().trim().min(1, 'Escribí el email').max(200),
  password: z.string().min(1, 'Escribí la contraseña').max(500),
})

export async function GET() {
  return ok({ admin: !!(await getAdminSession()) })
}

export async function POST(req: NextRequest) {
  const ip = ipDe(req.headers)
  if (limitador.bloqueado(ip)) {
    return fail('Demasiados intentos. Esperá 15 minutos y volvé a probar.', 429)
  }
  const { data, error } = await parseBody(req, schema)
  if (error) return error
  const r = verificarCredenciales(data.email, data.password)
  if (r === 'no_configurado') {
    return fail('El acceso de administración no está configurado', 503, { needsConfig: true })
  }
  if (r !== 'ok') {
    limitador.fallo(ip)
    // métricas (D27): sin el email ni la contraseña tipeados, solo la huella de la IP
    registrarEvento(req, { name: 'admin_login_fallido', path: '/admin' })
    return fail('Email o contraseña incorrectos', 401)
  }
  await crearSesionAdmin()
  registrarEvento(req, { name: 'admin_login_ok', path: '/admin' })
  return ok({ admin: true })
}
