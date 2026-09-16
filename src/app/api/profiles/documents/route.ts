import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// POST: guardar documento de identidad (DNI frente/reverso) — privado
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const { type, frontUrl, backUrl } = await body<{ type?: string; frontUrl?: string; backUrl?: string }>(req)
  const doc = await db.identityDocument.create({
    data: {
      userId: user.id,
      type: type || 'dni',
      frontUrl: frontUrl || null,
      backUrl: backUrl || null,
      status: 'en_revision',
    },
  })
  return ok({ document: { id: doc.id } }, 201)
}
