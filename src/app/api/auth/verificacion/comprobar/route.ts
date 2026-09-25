import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { rateLimit, ipRateKey } from '@/lib/rate-limit'
import { normalizarEmail, normalizarCelular } from '@/lib/registro'
import { comprobarCodigo, firmarComprobante } from '@/lib/verificacion-server'

// POST /api/auth/verificacion/comprobar { canal, proposito, destino?, codigo } (D26)
//  - "registro": si el código es correcto devuelve `comprobante` (JWT de 30 min) para crear la cuenta.
//  - "cuenta" (con sesión): si es correcto marca el email o el celular de la cuenta como verificado.
// Errores: 400 `motivo` = incorrecto (con `intentosRestantes`) | vencido | usado | sin_codigo;
// 429 `motivo` = agotado (5 intentos) o demasiados intentos desde la conexión.
const schema = z.object({
  canal: z.enum(['email', 'celular'], { message: 'Canal inválido' }),
  proposito: z.enum(['registro', 'cuenta'], { message: 'Propósito inválido' }),
  destino: z.string().max(200, 'Demasiado largo').optional(),
  codigo: z.string({ message: 'Escribí el código' }).trim().regex(/^\d{6}$/, 'El código tiene 6 números'),
})

export async function POST(req: NextRequest) {
  // además de los 5 intentos por código: freno por conexión contra probar muchos emails a la vez
  const rl = rateLimit(ipRateKey(req, 'verif-comprobar'), 60, 15 * 60 * 1000)
  if (!rl.allowed) return fail('Demasiados intentos desde tu conexión. Esperá unos minutos.', 429)

  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error
  const { canal, proposito, codigo } = parsed.data

  if (proposito === 'registro') {
    const raw = parsed.data.destino ?? ''
    let destino: string
    if (canal === 'email') {
      const e = normalizarEmail(raw)
      if (!e.ok) return fail(e.error, 400, { campo: 'email' })
      destino = e.email
    } else {
      const c = normalizarCelular(raw)
      if (!c.ok) return fail(c.error, 400, { campo: 'celular' })
      destino = c.e164
    }
    const r = await comprobarCodigo({ canal, proposito, destino, codigo })
    if (!r.ok) return fail(r.error, r.status, r.extra)
    return ok({ ok: true, comprobante: await firmarComprobante(canal, destino, r.id) })
  }

  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para hacer esto', 401)
  const u = await db.user.findUnique({ where: { id: user.id }, select: { email: true, phoneE164: true } })
  if (!u) return fail('Necesitás iniciar sesión para hacer esto', 401)
  const destino = canal === 'email' ? u.email : u.phoneE164
  if (!destino) return fail('Primero cargá tu celular en "Mi perfil" y guardalo', 400, { campo: 'celular' })
  const r = await comprobarCodigo({ canal, proposito, destino, codigo, userId: user.id })
  if (!r.ok) return fail(r.error, r.status, r.extra)
  // solo si el dato sigue siendo el mismo que se verificó (si cambió el celular en el medio, no)
  const hecho = await db.user.updateMany({
    where: canal === 'email' ? { id: user.id, email: destino } : { id: user.id, phoneE164: destino },
    data: canal === 'email' ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() },
  })
  if (hecho.count !== 1) return fail('Tu dato cambió mientras lo verificabas: pedí un código nuevo', 409)
  return ok({ ok: true, verificado: true })
}
