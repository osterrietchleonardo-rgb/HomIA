// Sugerencias (D25): lo que necesita servidor — fotos privadas (URLs firmadas y borrado),
// forma pública de cada envío y el mail al equipo de HomIA.
import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { sendEmail, linkAbsoluto } from '@/lib/email'
import { TITULAR } from '@/lib/legal-content'
import { parseJson } from '@/lib/api'
import {
  FEEDBACK_BUCKET, LINK_BANDEJA, areaLabel, casillaEquipo, estadoLabel, tipoLabel, type ContextoFeedback,
} from '@/lib/feedback'

/** Las fotos se ven 10 minutos; después hay que volver a abrir el envío. */
export const FIRMA_SEGUNDOS = 600

function storage() {
  const url = process.env.SUPABASE_PROJECT_URL
  const key = process.env.SUPABASE_SERVICE_ROLE
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } }).storage
}

const objeto = (ref: string) => (ref.startsWith(`${FEEDBACK_BUCKET}/`) && !ref.includes('..') ? ref.slice(FEEDBACK_BUCKET.length + 1) : null)

/**
 * Firma en UNA llamada todas las fotos pedidas. Devuelve un mapa ref → URL firmada
 * (las que no se pudieron firmar quedan afuera: la pantalla muestra "no disponible").
 */
export async function firmarFotos(refs: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  const st = storage()
  const pares = refs.map((r) => [r, objeto(r)] as const).filter((p): p is readonly [string, string] => !!p[1])
  if (!st || !pares.length) return out
  try {
    const { data, error } = await st.from(FEEDBACK_BUCKET).createSignedUrls(pares.map((p) => p[1]), FIRMA_SEGUNDOS)
    if (error || !data) return out
    for (const d of data) {
      const par = pares.find((p) => p[1] === d.path)
      if (par && d.signedUrl) out.set(par[0], d.signedUrl)
    }
  } catch (e) {
    console.error('[feedback] no se pudieron firmar las fotos', e instanceof Error ? e.message : e)
  }
  return out
}

/**
 * Borra las fotos de evidencia de un usuario (baja de cuenta): las de sus envíos y también las
 * que subió y quitó antes de mandar (todo `feedback-evidencias/<userId>/sugerencias/`).
 * Best effort: loguea y sigue.
 */
export async function borrarFotosDeUsuario(userId: string, refs: string[]): Promise<void> {
  const st = storage()
  if (!st || !/^[A-Za-z0-9_-]{1,60}$/.test(userId)) return
  const paths = new Set(refs.map(objeto).filter((p): p is string => !!p && p.startsWith(`${userId}/`)))
  const { data } = await st.from(FEEDBACK_BUCKET).list(`${userId}/sugerencias`, { limit: 1000 })
  for (const it of data || []) if (it.id !== null) paths.add(`${userId}/sugerencias/${it.name}`)
  if (!paths.size) return
  const { error } = await st.from(FEEDBACK_BUCKET).remove([...paths])
  if (error) console.error('[feedback] no se pudieron borrar las fotos', userId, error.message)
}

type FilaFeedback = {
  id: string; userId: string; role: string; type: string; area: string; title: string; description: string
  photos: string; context: string | null; contactOk: boolean; status: string; adminResponse: string | null
  respondedAt: Date | null; createdAt: Date; updatedAt: Date
}

/** Forma que devuelve la API (fotos firmadas, etiquetas en español). */
export function vistaFeedback(f: FilaFeedback, firmas: Map<string, string>) {
  const photos = parseJson<string[]>(f.photos, [])
  return {
    id: f.id,
    role: f.role,
    type: f.type,
    typeLabel: tipoLabel(f.type),
    area: f.area,
    areaLabel: areaLabel(f.area),
    title: f.title,
    description: f.description,
    photos: photos.map((p) => ({ url: firmas.get(p) || null })),
    context: f.context ? parseJson<ContextoFeedback | null>(f.context, null) : null,
    contactOk: f.contactOk,
    status: f.status,
    statusLabel: estadoLabel(f.status),
    adminResponse: f.adminResponse,
    respondedAt: f.respondedAt,
    createdAt: f.createdAt,
    updatedAt: f.updatedAt,
  }
}

export const refsDeFotos = (filas: { photos: string }[]) => filas.flatMap((f) => parseJson<string[]>(f.photos, []))

/** Mail al equipo por cada envío nuevo (sin fotos: se ven en la bandeja). Nunca tira. */
export async function avisarAlEquipo(f: {
  id: string; role: string; type: string; area: string; title: string; description: string; photos: number
  autor: string; contactOk: boolean
}) {
  const to = casillaEquipo(TITULAR.email)
  if (!to) return
  const res = await sendEmail({
    to,
    subject: `Nueva ${tipoLabel(f.type).toLowerCase()} en HomIA: ${f.title}`.slice(0, 180),
    heading: `Nueva ${tipoLabel(f.type).toLowerCase()} de un ${f.role}`,
    paragraphs: [
      `Tipo: ${tipoLabel(f.type)} · Sección: ${areaLabel(f.area)} · Rol: ${f.role}`,
      `Título: ${f.title}`,
      f.description.length > 1500 ? `${f.description.slice(0, 1500)}…` : f.description,
      `De: ${f.autor}${f.contactOk ? ' (acepta que lo contacten)' : ' (prefiere que no lo contacten)'} · Fotos adjuntas: ${f.photos}`,
    ],
    button: { label: 'Abrir la bandeja', url: linkAbsoluto(`${LINK_BANDEJA}?id=${f.id}`) },
    note: 'Las fotos no se adjuntan al mail: se ven en la bandeja (almacenamiento privado).',
  })
  if (!res.ok && res.reason !== 'no_configurado') {
    console.error('[feedback] no salió el mail al equipo', res.reason, 'detail' in res ? res.detail : '')
  }
}
