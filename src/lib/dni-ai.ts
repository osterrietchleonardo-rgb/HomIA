import ZAI from '@/lib/ai'
import { readFile } from 'fs/promises'
import path from 'path'

// ─────────────────────────────────────────────────────────────────────────
// Verificación de identidad por DNI con IA de visión (HomIA).
// Analiza frente + dorso: ¿es un documento?, ¿legible?, ¿los datos
// coinciden entre caras?, ¿parece real? → dictamen JSON con confianza.
//
// Mapeo a estado ( KYC por niveles — nunca auto-rechazo por sospecha):
//   · rechazado    → no es un documento O frente/dorso de titulares distintos
//   · en_revision  → ilegible o confianza baja (IA no concluyente)
//   · verificado   → documento válido + legible + consistente + confianza ≥ 0.7
//                    (si además pareceReal=false, se guarda la reserva en notas)
// El dictamen completo del modelo queda almacenado en IdentityDocument.aiVerdict.
// ─────────────────────────────────────────────────────────────────────────

export type DniVerdict = {
  esDocumento: boolean
  pareceReal: boolean
  legible: boolean
  mismoTitular: boolean
  tipo: string
  confianza: number
  motivo: string
}

export type DniAnalysis = {
  status: 'verificado' | 'en_revision' | 'rechazado'
  score: number
  verdict: DniVerdict | null
  notes: string
}

const MODEL = 'glm-4.5v'
const PROMPT = `Analizá estas dos fotos de un documento de identidad (frente y dorso) y respondé SOLO JSON, sin markdown:
{"esDocumento":bool,"pareceReal":bool,"legible":bool,"mismoTitular":bool,"tipo":"dni|pasaporte|otro|desconocido","confianza":0.0-1.0,"motivo":"explicación breve en español"}
Criterios: esDocumento=si es un documento de identidad; pareceReal=si parece un documento físico real y no una plantilla/render/pantalla; legible=si los datos se leen bien; mismoTitular=si los datos (nombre/DNI/CUIL) coinciden entre frente y dorso.`

/** Extrae el primer objeto JSON de una respuesta (tolera fences ```json). */
function extractJson(raw: string): DniVerdict | null {
  const cleaned = raw.replace(/```json/gi, '```').replace(/```/g, ' ').trim()
  const m = cleaned.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const v = JSON.parse(m[0]) as Record<string, unknown>
    if (typeof v.esDocumento !== 'boolean') return null
    return {
      esDocumento: v.esDocumento === true,
      pareceReal: v.pareceReal === true,
      legible: v.legible === true,
      mismoTitular: v.mismoTitular !== false,
      tipo: typeof v.tipo === 'string' ? v.tipo : 'desconocido',
      confianza: typeof v.confianza === 'number' ? Math.min(1, Math.max(0, v.confianza)) : 0,
      motivo: typeof v.motivo === 'string' ? v.motivo.slice(0, 500) : '',
    }
  } catch {
    return null
  }
}

/** Lee un archivo servido desde /public (URLs tipo /uploads/...) y lo devuelve como data URL. */
async function toDataUrl(url: string): Promise<string | null> {
  try {
    const rel = url.split('?')[0].replace(/^\/+/, '')
    const abs = path.join(process.cwd(), 'public', rel)
    if (!abs.startsWith(path.join(process.cwd(), 'public'))) return null // path traversal
    const buf = await readFile(abs)
    const ext = abs.toLowerCase().endsWith('.png') ? 'image/png' : abs.toLowerCase().endsWith('.webp') ? 'image/webp' : 'image/jpeg'
    return `data:${ext};base64,${buf.toString('base64')}`
  } catch {
    return null
  }
}

/** Analiza frente + dorso con el modelo de visión y devuelve el dictamen mapeado a estado. */
export async function analyzeDniImages(frontUrl: string, backUrl: string): Promise<DniAnalysis> {
  const [front, back] = await Promise.all([toDataUrl(frontUrl), toDataUrl(backUrl)])
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
      model: MODEL,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: PROMPT },
          { type: 'image_url', image_url: { url: front } },
          { type: 'image_url', image_url: { url: back } },
        ],
      }],
      thinking: { type: 'disabled' },
    } as never)
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

    const legibleYConsistente = verdict.legible && verdict.mismoTitular
    if (!verdict.esDocumento || !verdict.mismoTitular) {
      return {
        status: 'rechazado',
        score: verdict.confianza,
        verdict,
        notes: `Rechazado por IA: ${verdict.motivo || 'las imágenes no corresponden a un documento válido o los datos no coinciden.'}`,
      }
    }
    if (!legibleYConsistente || verdict.confianza < 0.7) {
      return {
        status: 'en_revision',
        score: verdict.confianza,
        verdict,
        notes: `IA con dudas (${Math.round(verdict.confianza * 100)}% de confianza): ${verdict.motivo}. Quedó en revisión manual.`,
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
  } catch {
    return {
      status: 'en_revision',
      score: 0,
      verdict: null,
      notes: 'El modelo de IA no está disponible en este momento. El documento quedó en revisión manual y será analizado ni bien vuelva.',
    }
  }
}
