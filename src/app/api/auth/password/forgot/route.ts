import { NextRequest, after } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody, appUrl } from '@/lib/api'
import { db } from '@/lib/db'
import { rateLimit, ipRateKey } from '@/lib/rate-limit'
import { sendEmail, emailConfigurado } from '@/lib/email'
import { nuevoTokenReset, RESET_TTL_MS, RESET_MAX_POR_HORA } from '@/lib/password-reset'

// POST /api/auth/password/forgot { email }
// Siempre responde lo mismo, exista o no la cuenta (no revela qué emails están registrados).
// Máximo 3 pedidos por cuenta por hora (contados en PasswordReset). El mail sale en segundo
// plano, así la respuesta tarda lo mismo con o sin cuenta.
const MENSAJE = 'Si ese email tiene una cuenta, te mandamos un link para crear una nueva contraseña'
// Sin servicio de mail configurado (RESEND_API_KEY) no se puede cumplir "te mandamos un link":
// se dice la verdad, igual para todos los emails (no revela cuáles tienen cuenta) y no se crean
// tokens que nadie va a recibir. Fallback honesto (AGENTS.md §1).
const SIN_MAIL = 'Todavía no podemos mandar mails para recuperar la contraseña. Probá de nuevo más tarde.'

const schema = z.object({
  email: z.string({ message: 'Escribí tu email' }).trim().toLowerCase().max(200, 'El email es demasiado largo').email('El email no parece válido'),
})

export async function POST(req: NextRequest) {
  // anti-abuso por conexión (además del tope por cuenta)
  const rl = rateLimit(ipRateKey(req, 'forgot'), 20, 60 * 60 * 1000)
  if (!rl.allowed) return fail('Hiciste muchos pedidos seguidos. Probá de nuevo en un rato.', 429)

  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error
  const { email } = parsed.data
  if (!emailConfigurado()) return fail(SIN_MAIL, 503, { needsConfig: true })

  const user = await db.user.findUnique({ where: { email }, select: { id: true, email: true, displayName: true } })
  if (!user) return ok({ ok: true, message: MENSAJE })

  const desde = new Date(Date.now() - 60 * 60 * 1000)
  const recientes = await db.passwordReset.count({ where: { userId: user.id, createdAt: { gte: desde } } })
  if (recientes >= RESET_MAX_POR_HORA) {
    console.warn('[forgot] tope de pedidos por hora alcanzado', user.id)
    return ok({ ok: true, message: MENSAJE })
  }

  const { token, tokenHash } = nuevoTokenReset()
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 64) || null
  await db.passwordReset.create({
    data: { userId: user.id, tokenHash, expiresAt: new Date(Date.now() + RESET_TTL_MS), ip },
  })

  const link = `${appUrl()}/#/restablecer?token=${token}`
  const nombre = (user.displayName || '').trim().split(/\s+/)[0] || ''
  const enviar = async () => {
    const r = await sendEmail({
      to: user.email,
      subject: 'Creá una nueva contraseña para HomIA',
      heading: 'Creá una nueva contraseña',
      paragraphs: [
        nombre ? `Hola, ${nombre}:` : 'Hola:',
        'Recibimos un pedido para crear una nueva contraseña para tu cuenta de HomIA. Tocá el botón y elegí la nueva.',
      ],
      button: { label: 'Crear nueva contraseña', url: link },
      note: 'El link vence en 1 hora y sirve una sola vez. Si no lo pediste, ignorá este mail: tu contraseña sigue siendo la misma.',
      unsubscribeFooter: false,
    })
    if (!r.ok) console.error('[forgot] no salió el mail de recuperación', user.id, r.reason)
  }
  try {
    after(enviar)
  } catch {
    void enviar().catch(() => {})
  }
  return ok({ ok: true, message: MENSAJE })
}
