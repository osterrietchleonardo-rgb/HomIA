import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { analyzeDniImages, signDniDocUrl, DNI_BUCKET, type DniAnalysis } from '@/lib/dni-ai'

// Verificación de identidad por DNI + IA.
// GET: mi estado de verificación + último documento (fotos como signed URL de
//      10 min, solo para el dueño).
// POST: registra frente+dorso (paths privados de /api/uploads folder=dni),
//       corre el modelo de visión sobre las DOS fotos y recién con el dictamen
//       actualiza el estado público del usuario. Máximo 3 intentos por día.
export const maxDuration = 60

const MAX_ATTEMPTS_PER_DAY = 3

function publicStatus(status: string) {
  // Estado que ve TODO el mundo junto al nombre
  return status === 'verificado' ? 'verificado' : status === 'en_revision' ? 'en_revision' : status === 'rechazado' ? 'rechazado' : 'none'
}

/** Path privado válido: "dni-docs/<userId>/dni/<archivo>.(jpg|jpeg|png|webp)" del usuario logueado. */
function ownDniPath(userId: string) {
  const re = new RegExp(`^${DNI_BUCKET}/${userId}/dni/[A-Za-z0-9_-]{1,80}\\.(jpg|jpeg|png|webp)$`)
  return z.string().max(300).regex(re, 'La foto tiene que subirse desde esta cuenta con folder=dni')
}

/** Normaliza DNI/CUIL a los dígitos del DNI (sin ceros a la izquierda). */
function dniDigits(value: string | null | undefined): string | null {
  const digits = (value || '').replace(/\D/g, '')
  if (!digits) return null
  // CUIL/CUIT: XX-DDDDDDDD-X → el DNI son los 8 del medio
  const core = digits.length === 11 ? digits.slice(2, 10) : digits
  const trimmed = core.replace(/^0+/, '')
  return trimmed.length >= 6 ? trimmed : null
}

export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const doc = await db.identityDocument.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  const [frontUrl, backUrl] = doc
    ? await Promise.all([
        doc.frontUrl ? signDniDocUrl(doc.frontUrl) : null,
        doc.backUrl ? signDniDocUrl(doc.backUrl) : null,
      ])
    : [null, null]
  return ok({
    verificationStatus: publicStatus(user.verificationStatus || 'none'),
    verifiedAt: user.verifiedAt || null,
    document: doc
      ? {
          id: doc.id, type: doc.type, frontUrl, backUrl,
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

  const parsed = await parseBody(
    req,
    z.object({
      frontUrl: ownDniPath(user.id),
      backUrl: ownDniPath(user.id),
      type: z.enum(['dni', 'pasaporte', 'cuit']).optional(),
    })
  )
  if (parsed.error) return parsed.error
  const d = parsed.data
  if (d.frontUrl === d.backUrl) return fail('Subí dos fotos distintas: el frente y el dorso del DNI')

  // límite diario de intentos (evita gastar visión y fuerza bruta de fotos)
  const startOfDay = new Date()
  startOfDay.setHours(0, 0, 0, 0)
  const attemptsToday = await db.identityDocument.count({
    where: { userId: user.id, createdAt: { gte: startOfDay } },
  })
  if (attemptsToday >= MAX_ATTEMPTS_PER_DAY) {
    return fail(`Ya hiciste ${MAX_ATTEMPTS_PER_DAY} intentos hoy. Probá de nuevo mañana o escribinos si necesitás ayuda.`, 429)
  }

  // 1) registrar la subida (el documento queda en revisión; el estado PÚBLICO
  //    del usuario no se toca hasta tener dictamen)
  const doc = await db.identityDocument.create({
    data: {
      userId: user.id,
      type: d.type || 'dni',
      frontUrl: d.frontUrl,
      backUrl: d.backUrl,
      status: 'en_revision',
    },
  })

  // 2) el modelo de IA analiza las DOS fotos (frente + dorso)
  let analysis: DniAnalysis = await analyzeDniImages(d.frontUrl, d.backUrl)

  // 2b) cruce con el DNI/CUIL declarado en el perfil profesional: si el modelo
  //     leyó un número distinto, se rechaza con nota clara
  const detected = analysis.verdict?.dniDetectado ? dniDigits(analysis.verdict.dniDetectado) : null
  if (detected) {
    const pro = await db.professionalProfile.findUnique({ where: { userId: user.id }, select: { dniCuil: true } })
    const declared = dniDigits(pro?.dniCuil)
    if (declared && declared !== detected) {
      analysis = {
        ...analysis,
        status: 'rechazado',
        notes: `El número de documento que se lee en las fotos (${detected}) no coincide con el DNI/CUIL cargado en tu perfil (${declared}). Revisá el dato del perfil o subí el documento correcto.`,
      }
    }
  }

  await db.identityDocument.update({
    where: { id: doc.id },
    data: {
      status: analysis.status,
      aiVerdict: analysis.verdict ? JSON.stringify(analysis.verdict) : null,
      aiScore: analysis.score,
      aiNotes: analysis.notes,
    },
  })

  // 3) estado público: verificado/rechazado siempre; en_revision solo si el
  //    usuario no estaba ya verificado (no se le quita la insignia por una foto dudosa)
  const current = user.verificationStatus || 'none'
  let publicNext: string | null = null
  if (analysis.status === 'verificado') publicNext = 'verificado'
  else if (analysis.status === 'rechazado') publicNext = 'rechazado'
  else if (current !== 'verificado') publicNext = 'en_revision'
  if (publicNext) {
    await db.user.update({
      where: { id: user.id },
      data: {
        verificationStatus: publicNext,
        verifiedAt: publicNext === 'verificado' ? new Date() : null,
      },
    })
  }

  // 4) notificar el resultado
  const title = analysis.status === 'verificado' ? 'Identidad verificada ✓' : analysis.status === 'rechazado' ? 'Verificación rechazada' : 'Documento en revisión'
  await db.notification.create({
    data: {
      userId: user.id,
      type: 'verificacion',
      title,
      body: analysis.status === 'verificado'
        ? 'La IA validó tu DNI: tu cuenta ya muestra la insignia de verificado.'
        : analysis.notes,
      link: `#/panel/${user.roles[0] || 'cliente'}/verificacion`,
    },
  })

  return ok({
    status: analysis.status,
    verificationStatus: publicStatus(publicNext || current),
    aiScore: analysis.score,
    aiNotes: analysis.notes,
    aiVerdict: analysis.verdict,
    documentId: doc.id,
    attemptsLeft: Math.max(0, MAX_ATTEMPTS_PER_DAY - attemptsToday - 1),
  }, 201)
}
