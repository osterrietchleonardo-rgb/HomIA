import { ok } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { disponibilidad } from '@/lib/verificacion-server'
import { formatearCelular } from '@/lib/registro'

// GET /api/auth/verificacion (D26)
// Público: qué se puede verificar hoy (email por mail; celular solo si hay proveedor de SMS o
// WhatsApp configurado). Con sesión, además el estado del usuario: email y celular verificados o no.
export async function GET() {
  const disp = disponibilidad()
  const user = await getSessionUser()
  if (!user) return ok({ disponible: disp, cuenta: null })
  const u = await db.user.findUnique({
    where: { id: user.id },
    select: { email: true, emailVerifiedAt: true, phone: true, phoneE164: true, phoneVerifiedAt: true },
  })
  if (!u) return ok({ disponible: disp, cuenta: null })
  return ok({
    disponible: disp,
    cuenta: {
      email: u.email,
      emailVerificado: !!u.emailVerifiedAt,
      emailVerificadoEl: u.emailVerifiedAt,
      celular: u.phoneE164 ? formatearCelular(u.phoneE164) : u.phone || null,
      // un teléfono viejo que no se pudo normalizar no se puede verificar hasta corregirlo
      celularNormalizado: !!u.phoneE164,
      celularVerificado: !!u.phoneVerifiedAt && !!u.phoneE164,
      celularVerificadoEl: u.phoneVerifiedAt,
    },
  })
}
