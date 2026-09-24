// Respaldo honesto SIN IA: si el modelo falla (caído, timeout tras reintento,
// sin clave), Homy igual busca con las MISMAS herramientas reales y lo dice.
// Nunca un error mudo ni contenido inventado.
import { armarRespaldo } from './loop'
import { buscarConocimiento } from './conocimiento'
import { adaptarParaVisitante } from './rutas'
import type { Contexto, Herramienta, Registro } from './herramientas'
import type { RespuestaFinal } from './tipos'
import type { Paso } from './loop'

export type Intencion = 'contratar' | 'trabajar' | 'materiales' | 'ayuda'

/** Heurística determinista de intención (español rioplatense). */
export function detectarIntencion(texto: string): Intencion {
  const t = texto.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  if (!t.trim()) return 'ayuda'
  if (/(cuanto cuesta ser|como funciona|como se paga|como pago|plan|suscrip|comision|cargo|sobr[ao]|devol|verific|resen|mercado pago|registr|cuenta|carrito|pedido|cobr)/.test(t)) return 'ayuda'
  if (/(que hay para|hay trabajos?|busco (trabajo|laburo|changa)|trabajos? de|soy (plomero|electricista|gasista|pintor|albanil|carpintero))/.test(t)) return 'trabajar'
  if (/(precio|cuanto (sale|cuesta)|comprar|donde (compro|consigo)|que necesito|material|cemento|cano|canilla|teflon|cable|termica|latex|pintura|ladrillo|arena|membrana|llave de paso|gotea|pierde)/.test(t)) return 'materiales'
  if (/(plomer|gasista|electricista|albanil|pintor|carpinter|herrero|jardiner|cerrajer|techista|necesito (un|una)|busco (un|una)|contratar)/.test(t)) return 'contratar'
  return 'ayuda'
}

export async function responderSinIA(
  ctx: Contexto,
  pregunta: string,
  herramientas: Record<string, Herramienta>,
  reg: Registro,
  pasos: Paso[]
): Promise<RespuestaFinal> {
  const correr = async (nombre: string, input: unknown) => {
    const h = herramientas[nombre]
    if (!h) return null
    const t0 = Date.now()
    try {
      const r = await h.ejecutar(h.entrada.parse(input))
      pasos.push({ herramienta: `${nombre} (sin IA)`, input, resumen: r.resumen, ms: Date.now() - t0, estado: r.estado })
      return r
    } catch (e) {
      pasos.push({ herramienta: `${nombre} (sin IA)`, input, resumen: `error: ${(e as Error).message}`.slice(0, 200), ms: Date.now() - t0, estado: 'error' })
      return null
    }
  }
  const intencion = detectarIntencion(pregunta)
  if (intencion === 'materiales') {
    await correr('sugerir_materiales', { necesidad: pregunta, rubro: null })
    const ids = [...reg.elementosVistos].slice(0, 3)
    if (ids.length) await correr('buscar_proveedores_con_stock', { elementos: ids })
  } else if (intencion === 'contratar') {
    await correr('buscar_profesionales', { rubro: null, necesidad: pregunta, zona: pregunta })
  } else if (intencion === 'trabajar') {
    await correr('buscar_trabajos', { rubro: pregunta.length < 60 ? pregunta : null, zona: pregunta })
  } else {
    await correr('como_funciona_homia', { tema: pregunta })
  }
  const r = armarRespaldo(
    ctx,
    reg,
    'Ahora no puedo interpretar tu consulta con IA, así que busqué directo en HomIA. Esto es lo que encontré:'
  )
  if (intencion === 'ayuda') {
    const ayuda = ctx.rol === 'visitante' ? '/ayuda' : `/panel/${ctx.rol}/ayuda`
    const hit = buscarConocimiento(pregunta, ctx.rol, 1)[0]
    r.mensaje = hit
      ? `Ahora no puedo interpretar tu consulta con IA; te dejo lo que dice la guía de HomIA sobre «${hit.titulo}»: ${hit.texto.slice(0, 600)}`
      : 'Ahora no puedo interpretar tu consulta con IA. Mientras tanto, en el Centro de ayuda está explicado cada paso de HomIA.'
    r.acciones = [
      ...(hit?.ruta ? [{ etiqueta: 'Ir a la sección', href: ctx.rol === 'visitante' ? adaptarParaVisitante(hit.ruta) : hit.ruta }] : []),
      { etiqueta: 'Centro de ayuda', href: ayuda },
    ]
  }
  return r
}
