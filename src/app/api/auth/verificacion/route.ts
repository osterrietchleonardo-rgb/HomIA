import { ok } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { disponibilidad } from '@/lib/verificacion-server'
import { formatearCelular, normalizarCelular } from '@/lib/registro'

// GET /api/auth/verificacion (D26)
// Público: si hoy se pueden mandar códigos por mail. Con sesión, además el estado del usuario: el
// email verificado o no y el celular estandarizado (el celular no se verifica por código desde el
// 25/09/2026: solo se muestra como quedó guardado).
export async function GET() {
  const disp = disponibilidad()
  const user = await getSessionUser()
  if (!user) return ok({ disponible: disp, cuenta: null })
  const u = await db.user.findUnique({
    where: { id: user.id },
    select: { email: true, emailVerifiedAt: true, phone: true, phoneE164: true },
  })
  if (!u) return ok({ disponible: disp, cuenta: null })
  // cuentas anteriores a D26 tienen `phone` sin `phoneE164`: si el número se puede estandarizar se
  // muestra estandarizado (se guarda la próxima vez que guarde su perfil); si no, se pide revisarlo
  const viejo = !u.phoneE164 && u.phone ? normalizarCelular(u.phone) : null
  return ok({
    disponible: disp,
    cuenta: {
      email: u.email,
      emailVerificado: !!u.emailVerifiedAt,
      emailVerificadoEl: u.emailVerifiedAt,
      celular: u.phoneE164 ? formatearCelular(u.phoneE164) : viejo?.ok ? viejo.mostrar : u.phone || null,
      // un teléfono viejo que no se puede estandarizar: se pide corregirlo en "Mi perfil"
      celularNormalizado: !!u.phoneE164 || !!viejo?.ok,
    },
  })
}
