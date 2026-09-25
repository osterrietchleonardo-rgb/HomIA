import { NextRequest, after } from 'next/server'
import { ok, fail, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import {
  crearFeedbackSchema, inicioDelDiaAR, superaTope, MENSAJE_TOPE, TOPE_DIARIO,
} from '@/lib/feedback'
import { firmarFotos, refsDeFotos, vistaFeedback, avisarAlEquipo } from '@/lib/feedback-server'

// Sugerencias (D25).
// GET  → mis envíos (solo los del usuario de la sesión), con fotos firmadas 10 min.
// POST → nuevo envío (sugerencia, queja, mejora, oportunidad, problema técnico u otro).
//        Tope: 10 por día (hora argentina) por usuario → 429. Mail al equipo de HomIA.

export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const filas = await db.feedback.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
    take: 100,
  })
  const firmas = await firmarFotos(refsDeFotos(filas))
  const enviadasHoy = filas.filter((f) => f.createdAt >= inicioDelDiaAR()).length
  return ok({
    items: filas.map((f) => vistaFeedback(f, firmas)),
    // D29: la bandeja vive en /admin con ingreso propio; desde el panel del usuario no hay acceso
    isAdmin: false,
    quedanHoy: Math.max(0, TOPE_DIARIO - enviadasHoy),
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para mandar una sugerencia', 401)
  const { data, error } = await parseBody(req, crearFeedbackSchema(user.id))
  if (error) return error
  if (!user.roles.includes(data.role)) return fail('Ese panel no es tuyo', 403)

  const enviadasHoy = await db.feedback.count({ where: { userId: user.id, createdAt: { gte: inicioDelDiaAR() } } })
  if (superaTope(enviadasHoy)) return fail(MENSAJE_TOPE, 429)

  // el contexto técnico solo se guarda para "problema técnico"; el navegador sale del
  // encabezado real del pedido (no de lo que diga el formulario)
  let context: string | null = null
  if (data.type === 'problema') {
    const ua = (req.headers.get('user-agent') || '').slice(0, 400)
    context = JSON.stringify({ ...(data.context || {}), navegador: ua || data.context?.navegador || undefined })
  }

  const f = await db.feedback.create({
    data: {
      userId: user.id,
      role: data.role,
      type: data.type,
      area: data.area,
      title: data.title,
      description: data.description,
      photos: JSON.stringify(data.photos),
      context,
      contactOk: data.contactOk,
    },
  })

  const aviso = {
    id: f.id, role: f.role, type: f.type, area: f.area, title: f.title, description: f.description,
    photos: data.photos.length,
    autor: data.contactOk ? `${user.displayName} <${user.email}>` : user.displayName,
    contactOk: data.contactOk,
  }
  try {
    after(() => avisarAlEquipo(aviso))
  } catch {
    void avisarAlEquipo(aviso).catch(() => {})
  }

  const firmas = await firmarFotos(data.photos)
  return ok({ item: vistaFeedback(f, firmas), quedanHoy: Math.max(0, TOPE_DIARIO - enviadasHoy - 1) }, 201)
}
