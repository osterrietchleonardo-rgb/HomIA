import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { analyzeDniImages } from '@/lib/dni-ai'

// Verificación de identidad por DNI + IA.
// GET: mi estado de verificación + último documento con dictamen de IA.
// POST: registra frente+dorso (URLs de /api/uploads), corre el modelo de
// visión sobre las DOS fotos y actualiza el estado público del usuario.

function publicStatus(status: string) {
  // Estado que ve TODO el mundo junto al nombre
  return status === 'verificado' ? 'verificado' : status === 'en_revision' ? 'en_revision' : status === 'rechazado' ? 'rechazado' : 'none'
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const doc = await db.identityDocument.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  return ok({
    verificationStatus: publicStatus(user.verificationStatus || 'none'),
    verifiedAt: user.verifiedAt || null,
    document: doc
      ? {
          id: doc.id, type: doc.type, frontUrl: doc.frontUrl, backUrl: doc.backUrl,
          status: doc.status, aiNotes: doc.aiNotes, aiScore: doc.aiScore,
          aiVerdict: doc.aiVerdict ? JSON.parse(doc.aiVerdict) : null,
          createdAt: doc.createdAt,
        }
      : null,
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const d = await body<{ frontUrl?: string; backUrl?: string; type?: string }>(req)
  if (!d.frontUrl || !d.backUrl) return fail('Subí la foto del frente y del dorso del DNI')
  for (const u of [d.frontUrl, d.backUrl]) {
    if (!/^\/uploads\/[a-zA-Z0-9_-]+\/[a-zA-Z0-9_/-]+\.(jpg|jpeg|png|webp)$/i.test(u)) {
      return fail('Las imágenes deben venir de la subida de HomIA (/uploads/…)')
    }
  }

  // 1) registrar la subida (queda en revisión hasta que hable la IA)
  const doc = await db.identityDocument.create({
    data: {
      userId: user.id,
      type: d.type || 'dni',
      frontUrl: d.frontUrl,
      backUrl: d.backUrl,
      status: 'en_revision',
    },
  })
  await db.user.update({ where: { id: user.id }, data: { verificationStatus: 'en_revision', verifiedAt: null } })

  // 2) el modelo de IA analiza las DOS fotos (frente + dorso)
  const analysis = await analyzeDniImages(d.frontUrl, d.backUrl)
  await db.identityDocument.update({
    where: { id: doc.id },
    data: {
      status: analysis.status,
      aiVerdict: analysis.verdict ? JSON.stringify(analysis.verdict) : null,
      aiScore: analysis.score,
      aiNotes: analysis.notes,
    },
  })
  await db.user.update({
    where: { id: user.id },
    data: {
      verificationStatus: analysis.status,
      verifiedAt: analysis.status === 'verificado' ? new Date() : null,
    },
  })

  // 3) notificar el resultado
  const title = analysis.status === 'verificado' ? 'Identidad verificada ✓' : analysis.status === 'rechazado' ? 'Verificación rechazada' : 'Documento en revisión'
  await db.notification.create({
    data: {
      userId: user.id,
      type: 'verificacion',
      title,
      body: analysis.status === 'verificado'
        ? 'La IA validó tu DNI: tu cuenta ya muestra la insignia de verificado.'
        : analysis.notes,
      link: `/panel/${user.roles[0] || 'cliente'}/verificacion`,
    },
  })

  return ok({
    status: analysis.status,
    aiScore: analysis.score,
    aiNotes: analysis.notes,
    aiVerdict: analysis.verdict,
    documentId: doc.id,
  }, 201)
}
