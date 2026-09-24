// Guardarraíles en CÓDIGO de la respuesta final de Homy (PLAYBOOK §12.6, §12.10).
// Si algo falla, el motivo vuelve al modelo como resultado de la herramienta
// "responder" y el modelo se corrige dentro del mismo loop.
import { FRASES_PROHIBIDAS } from './prompt'
import { adaptarParaVisitante, linkPermitido } from './rutas'
import { montosDeTexto, RespuestaSchema, type Contexto, type Registro, type RespuestaModelo } from './herramientas'
import type { Accion, RespuestaFinal, Tarjeta } from './tipos'

export type Veredicto = { ok: true; final: RespuestaFinal; modelo: RespuestaModelo } | { ok: false; motivo: string }

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

/** Frases prohibidas presentes en un texto (comparación sin acentos ni mayúsculas). */
export function frasesProhibidasEn(texto: string): string[] {
  const t = norm(texto)
  return FRASES_PROHIBIDAS.filter((f) => t.includes(norm(f)))
}

/** Si ya hay una oferta (material), sobran la tarjeta de su proveedor y la de su elemento. */
export function sinRedundantes(tarjetas: Tarjeta[]): Tarjeta[] {
  const provs = new Set(tarjetas.flatMap((t) => (t.tipo === 'material' ? [t.proveedorId] : [])))
  const elems = new Set(tarjetas.flatMap((t) => (t.tipo === 'material' ? [t.elementoId] : [])))
  return tarjetas.filter((t) => !(t.tipo === 'proveedor' && provs.has(t.id)) && !(t.tipo === 'elemento' && elems.has(t.id)))
}

/**
 * "Verificado" y "Recomendado" son datos, no adjetivos: si una frase se los
 * atribuye a alguien que según la herramienta NO lo es, se rechaza.
 */
export function insigniasFalsas(mensaje: string, reg: Registro): string[] {
  const quienes = new Map<string, { verificado: boolean; recomendado: boolean }>()
  for (const t of reg.entidades.values()) {
    if (t.tipo === 'profesional') quienes.set(norm(t.nombre), { verificado: t.verificado, recomendado: false })
    if (t.tipo === 'proveedor') quienes.set(norm(t.nombre), { verificado: t.verificado, recomendado: t.recomendado })
    if (t.tipo === 'material') quienes.set(norm(t.proveedor), { verificado: t.verificado, recomendado: t.recomendado })
  }
  const out: string[] = []
  for (const frase of norm(mensaje).split(/[.!?;\n]+/)) {
    const citados = [...quienes.entries()].filter(([n]) => {
      const partes = n.replace(/[()]/g, ' ').split(/\s+/).filter((p) => p.length >= 4)
      return frase.includes(n) || (partes.length >= 2 && frase.includes(`${partes[0]} ${partes[1]}`))
    })
    if (!citados.length) continue
    const niegaVer = /no (esta |figura como |aparece como )?verificad|sin verificar|todavia no .*verific/.test(frase)
    if (/\bverificad[oa]s?\b/.test(frase) && !niegaVer && citados.every(([, v]) => !v.verificado)) {
      out.push(`dijiste que ${citados.map(([n]) => n).join(', ')} está verificado y según la herramienta NO lo está (decí "no verificado" o no lo menciones)`)
    }
    const niegaReco = /no (es |esta |figura como )?recomendad/.test(frase)
    if (/\brecomendad[oa]s?\b/.test(frase) && !niegaReco && citados.every(([, v]) => !v.recomendado)) {
      out.push(`dijiste "Recomendado" de ${citados.map(([n]) => n).join(', ')} y según la herramienta no lo es`)
    }
  }
  return out
}

export function validarRespuesta(argumentos: string, ctx: Contexto, reg: Registro): Veredicto {
  let crudo: unknown
  try {
    crudo = JSON.parse(argumentos)
  } catch {
    return { ok: false, motivo: 'Los argumentos de responder no son JSON válido. Volvé a llamar responder.' }
  }
  const p = RespuestaSchema.safeParse(crudo)
  if (!p.success) {
    return { ok: false, motivo: `Respuesta inválida: ${p.error.issues.map((i) => `${i.path.join('.') || 'respuesta'}: ${i.message}`).join('; ')}. Corregilo.` }
  }
  const r = p.data
  const problemas: string[] = []

  // 1) Tarjetas: solo entidades que devolvió una herramienta en ESTA corrida
  const tarjetas: Tarjeta[] = []
  const vistas = new Set<string>()
  for (const ref of r.tarjetas) {
    const t = reg.entidades.get(ref.trim())
    if (!t) problemas.push(`la tarjeta "${ref}" no salió de ninguna herramienta en esta conversación (usá las refs exactas que devolvieron)`)
    else if (!vistas.has(ref)) { vistas.add(ref); tarjetas.push(t) }
  }

  // 2) Links: sección fija del rol o link devuelto por una herramienta
  const acciones: Accion[] = []
  for (const a of r.acciones) {
    if (!linkPermitido(a.href, ctx.rol, ctx.rolesUsuario, reg.links)) {
      problemas.push(`el link "${a.href}" no es una sección válida para este usuario ni lo devolvió una herramienta`)
    } else {
      acciones.push({ etiqueta: a.etiqueta, href: ctx.rol === 'visitante' ? adaptarParaVisitante(a.href) : a.href })
    }
  }

  // 3) Mensaje: sin URLs, sin frases prohibidas, sin montos que no se leyeron
  if (/https?:\/\/|www\.|#\/|\/panel\/|\/registrarse/i.test(r.mensaje)) {
    problemas.push('el mensaje tiene URLs o rutas: sacalas, los links van solo en "acciones"')
  }
  const textoVisible = `${r.mensaje} ${r.pregunta_aclaracion || ''} ${r.sugerencias.join(' ')}`
  const prohibidas = frasesProhibidasEn(textoVisible)
  if (prohibidas.length) problemas.push(`usaste frases prohibidas (${prohibidas.join(', ')}): reformulá desde HomIA`)
  const inventados = montosDeTexto(textoVisible).filter((m) => ![...reg.montos].some((x) => Math.abs(x - m) <= 1))
  if (inventados.length) {
    problemas.push(`los montos ${inventados.map((m) => `$${m.toLocaleString('es-AR')}`).join(', ')} no salieron de ninguna herramienta (no calcules ni inventes precios: citá los leídos o sacalos)`)
  }

  problemas.push(...insigniasFalsas(r.mensaje, reg))

  if (problemas.length) return { ok: false, motivo: `Rechazado por el sistema: ${problemas.join('; ')}. Corregí y volvé a llamar responder.` }

  return {
    ok: true,
    modelo: r,
    final: {
      mensaje: r.mensaje.trim(),
      tarjetas: sinRedundantes(tarjetas),
      acciones,
      sugerencias: r.sugerencias,
      pregunta: r.pregunta_aclaracion?.trim() || null,
      degradado: false,
    },
  }
}
