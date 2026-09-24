// El nodo agéntico del grafo de Homy: loop ≤ 6 vueltas con herramientas de
// solo lectura y respuesta final por la herramienta obligatoria "responder",
// validada con schema + guardarraíles en código. Modelo y herramientas son
// inyectables (tests sin red).
import { PROMPT_ESTATICO, bloqueDinamico } from './prompt'
import { RESPONDER_DEF, type Contexto, type Herramienta, type Registro } from './herramientas'
import { validarRespuesta } from './guardarrailes'
import { campoParcial, type ItemEntrada, type LlamarModelo, type Uso } from './openai'
import type { Accion, EventoHomy, RespuestaFinal, Tarjeta } from './tipos'

export const MAX_VUELTAS = 6

export type Paso = { herramienta: string; input: unknown; resumen: string; ms: number; estado: string }

export type ResultadoLoop = {
  final: RespuestaFinal
  pasos: Paso[]
  uso: Uso
  vueltas: number
  resultado: 'ok' | 'agoto_vueltas'
  evidencia: string | null
}

export type OpcionesLoop = {
  ctx: Contexto
  historial: { rol: 'user' | 'homy'; texto: string }[]
  pregunta: string
  herramientas: Record<string, Herramienta>
  reg: Registro
  llamar: LlamarModelo
  emitir: (ev: EventoHomy) => void
  /** se dispara JUSTO ANTES de la primera llamada real al modelo (cupo). Puede lanzar. */
  alLlamarIA?: () => Promise<void>
  maxVueltas?: number
  ahora?: Date
}

const usoVacio = (): Uso => ({ entrada: 0, cache: 0, salida: 0, razon: 0 })

export async function correrAgente(o: OpcionesLoop): Promise<ResultadoLoop> {
  const max = o.maxVueltas ?? MAX_VUELTAS
  const pasos: Paso[] = []
  const uso = usoVacio()
  const tools = [...Object.values(o.herramientas).map((h) => h.definicion), RESPONDER_DEF]
  const input: ItemEntrada[] = [
    ...o.historial.slice(-8).map((m) => ({ role: m.rol === 'user' ? 'user' : 'assistant', content: m.texto })),
    { role: 'developer', content: bloqueDinamico(o.ctx, o.ahora) },
    { role: 'user', content: o.pregunta },
  ]
  const yaConsultado = new Set<string>()

  for (let vuelta = 0; vuelta < max; vuelta++) {
    if (vuelta === 0 && o.alLlamarIA) await o.alLlamarIA()

    // streaming del "mensaje" de responder a medida que el modelo lo escribe
    let enviado = ''
    const res = await o.llamar({
      instructions: PROMPT_ESTATICO,
      input,
      tools,
      onArgsDelta: (name, args) => {
        if (name !== 'responder') return
        const m = campoParcial(args, 'mensaje')
        if (m != null && m.length > enviado.length && m.startsWith(enviado)) {
          o.emitir({ t: 'texto', delta: m.slice(enviado.length) })
          enviado = m
        }
      },
    })
    uso.entrada += res.uso.entrada
    uso.cache += res.uso.cache
    uso.salida += res.uso.salida
    uso.razon += res.uso.razon
    if (res.estado === 'incomplete') throw new Error(`respuesta truncada del modelo (${res.motivoIncompleto || 'sin motivo'})`)

    input.push(...res.output)
    if (res.llamadas.length === 0) {
      pasos.push({ herramienta: '(texto suelto)', input: null, resumen: 'terminó sin llamar responder', ms: 0, estado: 'rechazado' })
      input.push({ role: 'developer', content: 'Tenés que contestar llamando la herramienta responder.' })
      continue
    }

    const hayOtras = res.llamadas.some((l) => l.name !== 'responder')
    const salidas = await Promise.all(
      res.llamadas.map(async (l): Promise<{ call_id: string; output: string; final?: ResultadoLoop }> => {
        if (l.name === 'responder') {
          if (hayOtras) {
            if (enviado) { o.emitir({ t: 'texto_reinicio' }); enviado = '' }
            pasos.push({ herramienta: 'responder', input: null, resumen: 'rechazada: llamada junto con otras herramientas', ms: 0, estado: 'rechazado' })
            return { call_id: l.call_id, output: 'No respondas en la misma vuelta en que buscás: mirá primero lo que devolvieron las otras herramientas y llamá responder en la vuelta siguiente.' }
          }
          const v = validarRespuesta(l.arguments, o.ctx, o.reg)
          if (!v.ok) {
            if (enviado) { o.emitir({ t: 'texto_reinicio' }); enviado = '' }
            pasos.push({ herramienta: 'responder', input: null, resumen: v.motivo.slice(0, 200), ms: 0, estado: 'rechazado' })
            return { call_id: l.call_id, output: v.motivo }
          }
          pasos.push({ herramienta: 'responder', input: { tarjetas: v.modelo.tarjetas, acciones: v.modelo.acciones }, resumen: v.final.mensaje.slice(0, 200), ms: 0, estado: 'ok' })
          return {
            call_id: l.call_id,
            output: 'ok',
            final: { final: v.final, pasos, uso, vueltas: vuelta + 1, resultado: 'ok', evidencia: v.modelo.evidencia },
          }
        }

        const h = o.herramientas[l.name]
        if (!h) {
          pasos.push({ herramienta: l.name, input: null, resumen: 'herramienta desconocida', ms: 0, estado: 'error' })
          return { call_id: l.call_id, output: `La herramienta "${l.name}" no existe. Usá solo las que tenés.` }
        }
        let crudo: unknown
        try { crudo = JSON.parse(l.arguments || '{}') } catch { crudo = null }
        const p = h.entrada.safeParse(crudo)
        if (!p.success) {
          pasos.push({ herramienta: l.name, input: crudo, resumen: 'argumentos inválidos', ms: 0, estado: 'error' })
          return { call_id: l.call_id, output: `Argumentos inválidos: ${p.error.issues.map((i) => i.message).join('; ')}` }
        }
        const clave = `${l.name}:${JSON.stringify(p.data)}`
        if (yaConsultado.has(clave)) {
          pasos.push({ herramienta: l.name, input: p.data, resumen: 'repetida', ms: 0, estado: 'repetida' })
          return { call_id: l.call_id, output: 'Ya hiciste esta misma consulta: el resultado está más arriba. No la repitas.' }
        }
        yaConsultado.add(clave)
        o.emitir({ t: 'paso', texto: h.progreso(p.data) })
        const t0 = Date.now()
        try {
          const r = await h.ejecutar(p.data)
          pasos.push({ herramienta: l.name, input: p.data, resumen: r.resumen.slice(0, 200), ms: Date.now() - t0, estado: r.estado })
          if (r.progresoDespues) o.emitir({ t: 'paso', texto: r.progresoDespues })
          return { call_id: l.call_id, output: r.salida }
        } catch (e) {
          pasos.push({ herramienta: l.name, input: p.data, resumen: `error: ${(e as Error).message}`.slice(0, 200), ms: Date.now() - t0, estado: 'error' })
          return {
            call_id: l.call_id,
            output: JSON.stringify({ estado: 'error', nota: 'La consulta falló de nuestro lado. NO afirmes que no existe: decí que ahora no se pudo consultar y ofrecé la sección correspondiente.' }),
          }
        }
      })
    )
    const terminado = salidas.find((s) => s.final)
    if (terminado?.final) return terminado.final
    for (const s of salidas) input.push({ type: 'function_call_output', call_id: s.call_id, output: s.output })
  }

  // agotó las vueltas: respaldo determinista con lo que las herramientas sí trajeron
  o.emitir({ t: 'texto_reinicio' })
  return {
    final: armarRespaldo(o.ctx, o.reg, 'No llegué a cerrar una respuesta completa, pero esto es lo que encontré en HomIA:'),
    pasos,
    uso,
    vueltas: max,
    resultado: 'agoto_vueltas',
    evidencia: null,
  }
}

/** Acciones por defecto de cada rol (secciones fijas, siempre válidas). */
export function accionesPorDefecto(ctx: Contexto): Accion[] {
  switch (ctx.rol) {
    case 'cliente':
      return [
        { etiqueta: 'Buscar profesionales', href: '/panel/cliente/directorio' },
        { etiqueta: 'Ver materiales', href: '/panel/cliente/materiales' },
      ]
    case 'profesional':
      return [
        { etiqueta: 'Bolsa de trabajos', href: '/panel/profesional/bolsa' },
        { etiqueta: 'Centro de ayuda', href: '/panel/profesional/ayuda' },
      ]
    case 'proveedor':
      return [
        { etiqueta: 'Mi stock', href: '/panel/proveedor/stock' },
        { etiqueta: 'Centro de ayuda', href: '/panel/proveedor/ayuda' },
      ]
    default:
      return [
        { etiqueta: 'Crear cuenta gratis', href: '/registrarse' },
        { etiqueta: 'Ver el directorio', href: '/directorio' },
      ]
  }
}

/** Respuesta sin IA a partir de lo que las herramientas registraron (nada inventado). */
export function armarRespaldo(ctx: Contexto, reg: Registro, intro: string): RespuestaFinal {
  const prioridad: Tarjeta['tipo'][] = ['material', 'profesional', 'trabajo', 'elemento', 'proveedor']
  const tarjetas = [...reg.entidades.values()]
    .sort((a, b) => prioridad.indexOf(a.tipo) - prioridad.indexOf(b.tipo))
    .slice(0, 6)
  return {
    mensaje: tarjetas.length
      ? intro
      : 'Ahora no pude armar la respuesta. Probá de nuevo en un momento o entrá directo a la sección que necesitás.',
    tarjetas,
    acciones: accionesPorDefecto(ctx),
    sugerencias: [],
    pregunta: null,
    degradado: true,
  }
}
