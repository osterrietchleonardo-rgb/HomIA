/**
 * Cliente de IA portable — reemplazo 1:1 de `z-ai-web-dev-sdk` fuera del sandbox.
 *
 * Expone la MISMA interfaz que usan hoy los call-sites del proyecto
 * (src/lib/dni-ai.ts y src/app/api/catalog/route.ts). El súper agente Homy NO
 * usa este shim: va por la Responses API en src/lib/homy/openai.ts (HOMY_MODEL).
 *
 *   const zai = await ZAI.create()
 *   await zai.chat.completions.create({ messages, temperature? })
 *   await zai.chat.completions.createVision({ messages, ... })
 *
 * y responde con la misma forma OpenAI: { choices: [{ message: { content } }] }
 *
 * Funciona contra CUALQUIER endpoint OpenAI-compatible (config por .env):
 *   OpenAI:     AI_BASE_URL=https://api.openai.com/v1                          AI_MODEL=gpt-4o-mini
 *   GLM (Z.ai): AI_BASE_URL=https://api.z.ai/api/paas/v4                       AI_MODEL=glm-4.6
 *   OpenRouter: AI_BASE_URL=https://openrouter.ai/api/v1                       AI_MODEL=meta-llama/llama-3.3-70b-instruct
 *   Gemini:     AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai  AI_MODEL=gemini-2.0-flash
 *
 * El modelo SIEMPRE sale de las variables de entorno (se ignora el `model`
 * que llegue hardcodeado en los call-sites, p.ej. el 'glm-4.5v' de dni-ai):
 *   - AI_MODEL         texto (chat, agente, catálogo)
 *   - AI_VISION_MODEL  visión (verificación de DNI); si no se define usa AI_MODEL
 *
 * Los call-sites ya tienen fallback honesto si la IA falla, así que este
 * módulo tira errores claros en lugar de inventar contenido.
 */

const BASE_URL = (process.env.AI_BASE_URL ?? 'https://api.openai.com/v1').replace(/\/+$/, '')
const API_KEY = process.env.AI_API_KEY ?? ''
const TEXT_MODEL = process.env.AI_MODEL ?? 'gpt-4o-mini'
const VISION_MODEL = process.env.AI_VISION_MODEL ?? TEXT_MODEL

type OpenAiShape = { choices: Array<{ message?: { content?: string } }> }

async function callChat(body: Record<string, unknown>): Promise<OpenAiShape> {
  if (!API_KEY) {
    throw new Error(
      'IA no configurada: definí AI_API_KEY (y opcionalmente AI_BASE_URL / AI_MODEL / AI_VISION_MODEL) en las variables de entorno.'
    )
  }

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${API_KEY}`,
    },
    body: JSON.stringify(body),
    // margen para visión (DNI) en serverless; los call-sites tienen fallback
    signal: AbortSignal.timeout(45_000),
  })

  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`IA respondió ${res.status}: ${detail.slice(0, 300)}`)
  }

  const data = (await res.json()) as { choices?: Array<{ message?: { content?: string } }> }
  return { choices: data?.choices ?? [] }
}

type CreateOpts = {
  messages: unknown
  temperature?: number
  model?: string // se ignora: el modelo sale de AI_MODEL / AI_VISION_MODEL
  [key: string]: unknown // parámetros extra (p.ej. `thinking`) se descartan sin romper
}

export default {
  create: async () => ({
    chat: {
      completions: {
        create: (opts: CreateOpts) =>
          callChat({
            model: TEXT_MODEL,
            messages: opts.messages,
            ...(typeof opts.temperature === 'number' ? { temperature: opts.temperature } : {}),
          }),
        createVision: (opts: CreateOpts) =>
          callChat({
            model: VISION_MODEL,
            messages: opts.messages,
          }),
      },
    },
  }),
}
