import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { rateLimit, ipRateKey } from '@/lib/rate-limit'
import { normalizarEmail, normalizarCelular } from '@/lib/registro'
import { enviarCodigo, ipCliente } from '@/lib/verificacion-server'

// POST /api/auth/verificacion/enviar { canal, proposito, destino? } (D26)
//  - proposito "registro" (sin cuenta todavía): destino = el email o celular que se está registrando.
//    La respuesta es la misma exista o no una cuenta con ese email (sin enumeración).
//  - proposito "cuenta" (con sesión): el destino sale de la cuenta, nunca del body.
// Límites: 1 código cada 60 s y 5 por hora por destino, 30 por hora por conexión (en la base,
// sirven con varias instancias de Vercel) → 429 con `esperarSeg`.
const schema = z.object({
  canal: z.enum(['email', 'celular'], { message: 'Canal inválido' }),
  proposito: z.enum(['registro', 'cuenta'], { message: 'Propósito inválido' }),
  destino: z.string().max(200, 'Demasiado largo').optional(),
})

export async function POST(req: NextRequest) {
  // freno rápido en memoria (el límite de verdad es el de la base)
  const rl = rateLimit(ipRateKey(req, 'verif-enviar'), 40, 60 * 60 * 1000)
  if (!rl.allowed) return fail('Se pidieron muchos códigos desde tu conexión. Probá de nuevo en un rato.', 429)

  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error
  const { canal, proposito } = parsed.data
  const ip = ipCliente(req)

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
    const r = await enviarCodigo({ canal, proposito, destino, ip })
    if (!r.ok) return fail(r.error, r.status, r.extra)
    return ok({ ok: true, venceEnSeg: r.venceEnSeg, reenviarEnSeg: r.reenviarEnSeg, canal: r.canalNombre })
  }

  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para hacer esto', 401)
  const u = await db.user.findUnique({
    where: { id: user.id },
    select: { email: true, emailVerifiedAt: true, phoneE164: true, phoneVerifiedAt: true },
  })
  if (!u) return fail('Necesitás iniciar sesión para hacer esto', 401)
  let destino: string
  if (canal === 'email') {
    if (u.emailVerifiedAt) return ok({ ok: true, yaVerificado: true })
    destino = u.email
  } else {
    if (!u.phoneE164) return fail('Primero cargá tu celular en "Mi perfil" y guardalo', 400, { campo: 'celular' })
    if (u.phoneVerifiedAt) return ok({ ok: true, yaVerificado: true })
    destino = u.phoneE164
  }
  const r = await enviarCodigo({ canal, proposito, destino, userId: user.id, ip })
  if (!r.ok) return fail(r.error, r.status, r.extra)
  return ok({ ok: true, venceEnSeg: r.venceEnSeg, reenviarEnSeg: r.reenviarEnSeg, canal: r.canalNombre })
}
