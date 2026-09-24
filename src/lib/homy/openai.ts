// Cliente de la Responses API de OpenAI para el súper agente Homy.
// gpt-5.6-luna con razonamiento NO acepta function tools en /chat/completions:
// usamos POST /v1/responses con tools nativas, streaming SSE, store:false y
// devolvemos los items de razonamiento cifrados en el turno siguiente.
// Timeout por llamada ~45 s y 1 reintento (solo si todavía no se emitió nada).
import 'server-only'

export const HOMY_MODEL = process.env.HOMY_MODEL || 'gpt-5.6-luna'
export const HOMY_EFFORT = (process.env.HOMY_REASONING_EFFORT || 'low') as 'low' | 'medium'

/** Precio de lista por 1M tokens (developers.openai.com/api/docs/models/gpt-5.6-luna, 2026-09-24). */
export const PRECIO_USD_1M: Record<string, { entrada: number; cache: number; salida: number }> = {
  'gpt-5.6-luna': { entrada: 0.2, cache: 0.02, salida: 1.2 },
}

export type ItemEntrada = Record<string, unknown>

export type Uso = { entrada: number; cache: number; salida: number; razon: number }

export type LlamadaFuncion = { call_id: string; name: string; arguments: string }

export type RespuestaModelo = {
  output: ItemEntrada[]
  llamadas: LlamadaFuncion[]
  uso: Uso
  estado: string
  motivoIncompleto: string | null
}

export type ParamsLlamada = {
  instructions: string
  input: ItemEntrada[]
  tools: unknown[]
  /** delta de argumentos de una llamada en curso (para streamear "responder") */
  onArgsDelta?: (name: string, argsHastaAhora: string) => void
  signal?: AbortSignal
}

/** Firma inyectable: los tests pasan un doble sin red. */
export type LlamarModelo = (p: ParamsLlamada) => Promise<RespuestaModelo>

export function costoUsd(uso: Uso, modelo = HOMY_MODEL): number {
  const p = PRECIO_USD_1M[modelo]
  if (!p) return 0
  const noCache = Math.max(0, uso.entrada - uso.cache)
  // el razonamiento se factura como salida (ya viene incluido en output_tokens)
  return (noCache * p.entrada + uso.cache * p.cache + uso.salida * p.salida) / 1_000_000
}

class ErrorReintentable extends Error {}

async function unaLlamada(p: ParamsLlamada, emitio: { v: boolean }): Promise<RespuestaModelo> {
  const key = process.env.AI_API_KEY
  if (!key) throw new Error('IA no configurada (falta AI_API_KEY)')
  const base = (process.env.AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, '')
  const timeout = AbortSignal.timeout(45_000)
  const signal = p.signal ? AbortSignal.any([p.signal, timeout]) : timeout
  let res: Response
  try {
    res = await fetch(`${base}/responses`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        model: HOMY_MODEL,
        instructions: p.instructions,
        input: p.input,
        tools: p.tools,
        tool_choice: 'required',
        parallel_tool_calls: true,
        reasoning: { effort: HOMY_EFFORT },
        max_output_tokens: 4000,
        store: false,
        include: ['reasoning.encrypted_content'],
        stream: true,
        prompt_cache_key: 'homy-superagente-v1',
      }),
      signal,
    })
  } catch (e) {
    throw new ErrorReintentable(`red: ${(e as Error).message}`)
  }
  if (!res.ok || !res.body) {
    const detalle = await res.text().catch(() => '')
    const msg = `IA respondió ${res.status}: ${detalle.slice(0, 300)}`
    if (res.status === 429 || res.status >= 500) throw new ErrorReintentable(msg)
    throw new Error(msg)
  }

  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  const args = new Map<string, { name: string; txt: string }>() // item_id → args parciales
  let final: Record<string, unknown> | null = null
  let fallo: string | null = null
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buf += dec.decode(value, { stream: true })
      let idx: number
      while ((idx = buf.indexOf('\n\n')) !== -1) {
        const bloque = buf.slice(0, idx)
        buf = buf.slice(idx + 2)
        const linea = bloque.split('\n').find((l) => l.startsWith('data: '))
        if (!linea) continue
        const data = linea.slice(6).trim()
        if (!data || data === '[DONE]') continue
        let ev: Record<string, unknown>
        try { ev = JSON.parse(data) } catch { continue }
        const tipo = ev.type as string
        if (tipo === 'response.output_item.added') {
          const item = ev.item as { id?: string; type?: string; name?: string }
          if (item?.type === 'function_call' && item.id) args.set(item.id, { name: item.name || '', txt: '' })
        } else if (tipo === 'response.function_call_arguments.delta') {
          const a = args.get(ev.item_id as string)
          if (a) {
            a.txt += (ev.delta as string) || ''
            if (p.onArgsDelta) {
              // solo "responder" llega al usuario: después de eso ya no se reintenta
              if (a.name === 'responder') emitio.v = true
              p.onArgsDelta(a.name, a.txt)
            }
          }
        } else if (tipo === 'response.completed' || tipo === 'response.incomplete') {
          final = ev.response as Record<string, unknown>
        } else if (tipo === 'response.failed' || tipo === 'error') {
          const r = (ev.response as { error?: { message?: string } } | undefined)?.error?.message || (ev as { message?: string }).message
          fallo = r || 'la IA falló'
        }
      }
    }
  } catch (e) {
    if (emitio.v) throw new Error(`stream cortado: ${(e as Error).message}`)
    throw new ErrorReintentable(`stream cortado: ${(e as Error).message}`)
  }
  if (fallo) throw (emitio.v ? new Error(fallo) : new ErrorReintentable(fallo))
  if (!final) throw (emitio.v ? new Error('stream sin respuesta final') : new ErrorReintentable('stream sin respuesta final'))

  const output = (final.output as ItemEntrada[]) || []
  const u = (final.usage || {}) as { input_tokens?: number; output_tokens?: number; input_tokens_details?: { cached_tokens?: number }; output_tokens_details?: { reasoning_tokens?: number } }
  return {
    output,
    llamadas: output
      .filter((o) => o.type === 'function_call')
      .map((o) => ({ call_id: String(o.call_id), name: String(o.name), arguments: String(o.arguments ?? '') })),
    uso: {
      entrada: u.input_tokens || 0,
      cache: u.input_tokens_details?.cached_tokens || 0,
      salida: u.output_tokens || 0,
      razon: u.output_tokens_details?.reasoning_tokens || 0,
    },
    estado: String(final.status || ''),
    motivoIncompleto: (final.incomplete_details as { reason?: string } | null)?.reason || null,
  }
}

/** Llamada real con 1 reintento ante fallas transitorias (si todavía no se streameó nada). */
export const llamarModeloOpenAI: LlamarModelo = async (p) => {
  const emitio = { v: false }
  try {
    return await unaLlamada(p, emitio)
  } catch (e) {
    if (!(e instanceof ErrorReintentable) || emitio.v || p.signal?.aborted) throw e
    await new Promise((r) => setTimeout(r, 600))
    return unaLlamada(p, emitio)
  }
}

/**
 * Extrae el valor (posiblemente incompleto) del campo string `campo` de un JSON
 * que se está generando: permite streamear "mensaje" de la llamada a responder.
 */
export function campoParcial(json: string, campo: string): string | null {
  const k = json.indexOf(`"${campo}"`)
  if (k === -1) return null
  let i = json.indexOf(':', k + campo.length + 2)
  if (i === -1) return null
  i++
  while (i < json.length && /\s/.test(json[i])) i++
  if (json[i] !== '"') return null
  i++
  let out = ''
  while (i < json.length) {
    const c = json[i]
    if (c === '"') return out
    if (c === '\\') {
      if (i + 1 >= json.length) return out
      const n = json[i + 1]
      if (n === 'u') {
        if (i + 5 >= json.length) return out
        out += String.fromCharCode(parseInt(json.slice(i + 2, i + 6), 16))
        i += 6
        continue
      }
      out += n === 'n' ? '\n' : n === 't' ? '\t' : n === 'r' ? '' : n
      i += 2
      continue
    }
    out += c
    i++
  }
  return out
}
