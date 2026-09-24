import ZAI from '@/lib/ai'
import { readFile } from 'fs/promises'
import path from 'path'

// ─────────────────────────────────────────────────────────────────────────
// Verificación de identidad por DNI con IA de visión (HomIA).
// Analiza frente + dorso: ¿es un documento?, ¿legible?, ¿los datos
// coinciden entre caras?, ¿parece real? → dictamen JSON con confianza.
//
// Mapeo a estado (KYC por niveles — nunca auto-rechazo por sospecha):
//   · rechazado    → no es un documento O frente/dorso de titulares distintos
//   · en_revision  → ilegible, confianza baja o el modelo no afirmó mismoTitular
//   · verificado   → documento válido + legible + mismoTitular === true explícito
//                    + confianza ≥ 0.7 (si pareceReal=false, queda la reserva en notas)
// El dictamen completo del modelo queda almacenado en IdentityDocument.aiVerdict.
//
// Las fotos viven en el bucket PRIVADO `dni-docs` de Supabase: se descargan con
// el service role y se mandan al modelo como data URL (nunca URL pública).
// ─────────────────────────────────────────────────────────────────────────

export type DniVerdict = {
  esDocumento: boolean
  pareceReal: boolean
  legible: boolean
  /** true / false, o null si el modelo no lo afirmó explícitamente */
  mismoTitular: boolean | null
  tipo: string
  confianza: number
  motivo: string
  /** nombre y apellido que se leen en el documento (o null) */
  nombreDetectado: string | null
  /** número de DNI que se lee en el documento, solo dígitos (o null) */
  dniDetectado: string | null
}

export type DniAnalysis = {
  status: 'verificado' | 'en_revision' | 'rechazado'
  score: number
  verdict: DniVerdict | null
  notes: string
}

export const DNI_BUCKET = 'dni-docs'
const PUBLIC_BUCKET = 'homia-uploads'
const FETCH_TIMEOUT_MS = 15_000

const PROMPT = `Analizá estas dos fotos de un documento de identidad (frente y dorso) y respondé SOLO JSON, sin markdown:
{"esDocumento":bool,"pareceReal":bool,"legible":bool,"mismoTitular":bool,"tipo":"dni|pasaporte|otro|desconocido","confianza":0.0-1.0,"motivo":"explicación breve en español","nombreDetectado":"nombre y apellido tal como se leen o null","dniDetectado":"número de documento solo dígitos o null"}
Criterios: esDocumento=si es un documento de identidad; pareceReal=si parece un documento físico real y no una plantilla/render/pantalla; legible=si los datos se leen bien; mismoTitular=true SOLO si podés confirmar que los datos (nombre/DNI/CUIL) coinciden entre frente y dorso, false si no coinciden; nombreDetectado y dniDetectado=lo que se lee en el documento (null si no se lee). No inventes datos.`

/** Extrae el primer objeto JSON de una respuesta (tolera fences ```json). */
function extractJson(raw: string): DniVerdict | null {
  const cleaned = raw.replace(/```json/gi, '```').replace(/```/g, ' ').trim()
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const v = JSON.parse(m[0]) as Record<string, unknown>
    if (typeof v.esDocumento !== 'boolean') return null
    const nombre = typeof v.nombreDetectado === 'string' ? v.nombreDetectado.trim().slice(0, 120) : ''
    const dniDigits = typeof v.dniDetectado === 'string' || typeof v.dniDetectado === 'number'
      ? String(v.dniDetectado).replace(/\D/g, '')
      : ''
    return {
      esDocumento: v.esDocumento === true,
      pareceReal: v.pareceReal === true,
      legible: v.legible === true,
      // solo un booleano explícito cuenta; cualquier otra cosa es "no lo sé"
      mismoTitular: typeof v.mismoTitular === 'boolean' ? v.mismoTitular : null,
      tipo: typeof v.tipo === 'string' ? v.tipo : 'desconocido',
      confianza: typeof v.confianza === 'number' ? Math.min(1, Math.max(0, v.confianza)) : 0,
      motivo: typeof v.motivo === 'string' ? v.motivo.slice(0, 500) : '',
      nombreDetectado: nombre || null,
      dniDetectado: dniDigits.length >= 6 && dniDigits.length <= 11 ? dniDigits : null,
    }
  } catch {
    return null
  }
}

function mimeFromPath(p: string): string {
  const low = p.toLowerCase().split('?')[0]
  return low.endsWith('.png') ? 'image/png' : low.endsWith('.webp') ? 'image/webp' : 'image/jpeg'
}

function supabaseBase(): string | null {
  const url = (process.env.SUPABASE_PROJECT_URL || '').replace(/\/+$/, '')
  return url || null
}

/** Descarga con timeout y devuelve data URL (o null). */
async function fetchAsDataUrl(url: string, headers: Record<string, string>, mime: string): Promise<string | null> {
  try {
    const res = await fetch(url, { headers, signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) })
    if (!res.ok) return null
    const buf = Buffer.from(await res.arrayBuffer())
    if (buf.length === 0) return null
    const ct = res.headers.get('content-type') || ''
    const finalMime = ct.startsWith('image/') ? ct.split(';')[0] : mime
    return `data:${finalMime};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/**
 * Convierte la referencia guardada en IdentityDocument a data URL:
 *   · "dni-docs/<path>"  → descarga privada con service role (bucket dni-docs)
 *   · https://<proyecto>/storage/v1/object/public/homia-uploads/… → fetch público
 *   · "/uploads/…"       → filesystem, SOLO en desarrollo (legado del sandbox)
 *   · cualquier otra cosa → null (no se manda al modelo nada que no controlemos)
 */
async function toDataUrl(ref: string): Promise<string | null> {
  const base = supabaseBase()
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE || ''

  if (ref.startsWith(`${DNI_BUCKET}/`)) {
    if (!base || !serviceRole) return null
    const objectPath = ref.slice(DNI_BUCKET.length + 1)
    if (!objectPath || objectPath.includes('..')) return null
    const url = `${base}/storage/v1/object/${DNI_BUCKET}/${objectPath.split('/').map(encodeURIComponent).join('/')}`
    return fetchAsDataUrl(url, { Authorization: `Bearer ${serviceRole}` }, mimeFromPath(objectPath))
  }

  if (base && ref.startsWith(`${base}/storage/v1/object/public/${PUBLIC_BUCKET}/`)) {
    return fetchAsDataUrl(ref, {}, mimeFromPath(ref))
  }

  if (ref.startsWith('/uploads/') && process.env.NODE_ENV === 'development') {
    try {
      const rel = ref.split('?')[0].replace(/^\/+/, '')
      const root = path.join(process.cwd(), 'public')
      const abs = path.join(root, rel)
      if (!abs.startsWith(root)) return null // path traversal
      const buf = await readFile(abs)
      return `data:${mimeFromPath(abs)};base64,${buf.toString('base64')}`
    } catch {
      return null
    }
  }

  return null
}

/**
 * Signed URL (por defecto 10 minutos) de un documento del bucket privado.
 * Solo para mostrarle al DUEÑO su propia foto. Devuelve null si falla.
 */
export async function signDniDocUrl(ref: string, expiresInSec = 600): Promise<string | null> {
  const base = supabaseBase()
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE || ''
  if (!base || !serviceRole || !ref.startsWith(`${DNI_BUCKET}/`)) return null
  const objectPath = ref.slice(DNI_BUCKET.length + 1)
  if (!objectPath || objectPath.includes('..')) return null
  try {
    const res = await fetch(
      `${base}/storage/v1/object/sign/${DNI_BUCKET}/${objectPath.split('/').map(encodeURIComponent).join('/')}`,
      {
        method: 'POST',
        headers: { Authorization: `Bearer ${serviceRole}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ expiresIn: expiresInSec }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      }
    )
    if (!res.ok) return null
    const data = (await res.json()) as { signedURL?: string }
    if (!data.signedURL) return null
    return data.signedURL.startsWith('http') ? data.signedURL : `${base}/storage/v1${data.signedURL}`
  } catch {
    return null
  }
}

/** Analiza frente + dorso con el modelo de visión y devuelve el dictamen mapeado a estado. */
export async function analyzeDniImages(frontRef: string, backRef: string): Promise<DniAnalysis> {
  const [front, back] = await Promise.all([toDataUrl(frontRef), toDataUrl(backRef)])
  if (!front || !back) {
    return {
      status: 'en_revision',
      score: 0,
      verdict: null,
      notes: 'No pudimos leer las imágenes subidas. El documento quedó en revisión — probá subirlo de nuevo.',
    }
  }

  try {
    const zai = await ZAI.create()
    const res = await zai.chat.completions.createVision({
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: front } },
          { type: 'image_url', image_url: { url: back } },
        ],
      }],
    })
    const raw = res.choices?.[0]?.message?.content ?? ''
    const verdict = extractJson(raw)
    if (!verdict) {
      return {
        status: 'en_revision',
        score: 0,
        verdict: null,
        notes: 'El análisis de IA no devolvió un dictamen claro. El documento quedó en revisión manual.',
      }
    }

    if (!verdict.esDocumento || verdict.mismoTitular === false) {
      return {
        status: 'rechazado',
        score: verdict.confianza,
        verdict,
        notes: `Rechazado por IA: ${verdict.motivo || 'las imágenes no corresponden a un documento válido o los datos no coinciden.'}`,
      }
    }
    // "verificado" exige que el modelo AFIRME mismoTitular (nunca por omisión)
    if (!verdict.legible || verdict.mismoTitular !== true || verdict.confianza < 0.7) {
      return {
        status: 'en_revision',
        score: verdict.confianza,
        verdict,
        notes: `IA con dudas (${Math.round(verdict.confianza * 100)}% de confianza): ${verdict.motivo || 'no pudo confirmar todos los datos'}. Quedó en revisión manual.`,
      }
    }
    return {
      status: 'verificado',
      score: verdict.confianza,
      verdict,
      notes: verdict.pareceReal
        ? `IA: documento real y consistente (${Math.round(verdict.confianza * 100)}% de confianza). ${verdict.motivo}`
        : `Verificado con reserva de IA (${Math.round(verdict.confianza * 100)}% de confianza): ${verdict.motivo}`,
    }
  } catch (e) {
    console.error('[dni-ai] modelo de visión no disponible:', e instanceof Error ? e.message : e)
    return {
      status: 'en_revision',
      score: 0,
      verdict: null,
      notes: 'El modelo de IA no está disponible en este momento. El documento quedó en revisión manual y será analizado ni bien vuelva.',
    }
  }
}
