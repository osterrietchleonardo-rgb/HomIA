// Tests SIN RED del súper agente Homy: modelo y fuente de datos son dobles
// (datos plausibles, PLAYBOOK §12.14). Correr con:
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/homy/__tests__/*.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { correrAgente, MAX_VUELTAS } from '../loop'
import { crearHerramientas, registroVacio, type Contexto } from '../herramientas'
import { campoParcial, type LlamarModelo, type ParamsLlamada, type RespuestaModelo } from '../openai'
import { FRASES_PROHIBIDAS, PROMPT_ESTATICO, bloqueDinamico } from '../prompt'
import { compararOfertas, puntajeBayesiano } from '../ranking'
import { linkPermitido } from '../rutas'
import type { FuenteDatos } from '../datos'
import type { EventoHomy } from '../tipos'

// ── Doble de datos (plausibles, como la base real) ──
const datos: FuenteDatos = {
  async elementos() {
    return [
      { id: 'el_teflon', nombre: 'Cinta teflón', aliases: ['teflon'], descripcion: 'Cinta para sellar roscas de caños y canillas.', unidad: 'unidad', rubro: 'plomeria', rubroNombre: 'Plomería' },
      { id: 'el_cuerito', nombre: 'Cuerito para canilla', aliases: ['cuerito', 'arandela de canilla'], descripcion: 'Arandela de goma que cierra la canilla: si gotea, casi siempre es esto.', unidad: 'unidad', rubro: 'plomeria', rubroNombre: 'Plomería' },
      { id: 'el_cemento', nombre: 'Cemento Portland 50kg', aliases: ['cemento'], descripcion: 'Cemento para hormigón y mezclas.', unidad: 'bolsa', rubro: 'albanileria', rubroNombre: 'Albañilería' },
    ]
  },
  async ofertas(ids) {
    const base = {
      marca: 'Dexel', cantidad: 50, estado: 'disponible', ciudad: 'Buenos Aires', lat: -34.62, lng: -58.44,
      rating: 4.5, resenas: 2, operativo: true, aceptaMercadoPago: false,
    }
    const todas = [
      { ...base, stockId: 'st_teflon_a', elementoId: 'el_teflon', elementoNombre: 'Cinta teflón', unidad: 'unidad', precio: 350, proveedorId: 'pv_ferrer', proveedor: 'Ferretería Ferrer', verificado: false, recomendado: true },
      { ...base, stockId: 'st_teflon_b', elementoId: 'el_teflon', elementoNombre: 'Cinta teflón', unidad: 'unidad', precio: 420, proveedorId: 'pv_sosa', proveedor: 'Sanitarios Sosa', verificado: true, recomendado: false },
      { ...base, stockId: 'st_cemento', elementoId: 'el_cemento', elementoNombre: 'Cemento Portland 50kg', unidad: 'bolsa', precio: 6900, proveedorId: 'pv_ferrer', proveedor: 'Ferretería Ferrer', verificado: false, recomendado: true },
    ]
    return todas.filter((o) => ids.includes(o.elementoId))
  },
  async profesionales() {
    return [
      { id: 'pr_matias', nombre: 'Matías Ferrer', rubros: ['plomeria', 'gasistas'], habilidades: [], bio: '', ciudad: 'Buenos Aires', lat: -34.6172, lng: -58.44, verificado: false, rating: 5, resenas: 2, obras: 3, experiencia: 8 },
    ]
  },
  async trabajosAbiertos() {
    return [{ id: 'jb_fuga', titulo: 'Fuga de agua en cocina', descripcion: 'Pierde la canilla', rubro: 'plomeria', urgencia: 'alta', presupuestoMin: 40000, presupuestoMax: 60000, ciudad: 'Buenos Aires', lat: -34.6, lng: -58.43, presupuestos: 1, creado: new Date() }]
  },
  async pendientes() {
    return [{ cantidad: 1, texto: 'pedido(s) de materiales aprobado(s) listo(s) para pagar', ruta: '/panel/cliente/materiales?tab=compras' }]
  },
  async rubrosDelProfesional() { return ['plomeria'] },
}

const ctxVisitante: Contexto = { rol: 'visitante', rolesUsuario: [], userId: null, nombre: null, puerta: 'home_buscador', pagina: '/', lat: null, lng: null }
const ctxCliente: Contexto = { ...ctxVisitante, rol: 'cliente', rolesUsuario: ['cliente'], userId: 'u1', nombre: 'Valentina Ríos', puerta: 'panel' }

// ── Doble del modelo: guion de respuestas; cada paso ve el input acumulado ──
type Llamada = { name: string; args: unknown }
function modeloGuionado(guion: Array<(p: ParamsLlamada) => Llamada[]>): { llamar: LlamarModelo; vistas: ParamsLlamada[] } {
  const vistas: ParamsLlamada[] = []
  let i = 0
  const llamar: LlamarModelo = async (p) => {
    vistas.push({ ...p, input: [...p.input] })
    const paso = guion[Math.min(i, guion.length - 1)]
    i++
    const llamadas = paso(p).map((l, k) => ({ call_id: `c${i}_${k}`, name: l.name, arguments: JSON.stringify(l.args) }))
    for (const l of llamadas) if (l.name === 'responder') p.onArgsDelta?.('responder', l.arguments.slice(0, 30))
    const r: RespuestaModelo = {
      output: llamadas.map((l) => ({ type: 'function_call', ...l })),
      llamadas,
      uso: { entrada: 1000, cache: 800, salida: 50, razon: 10 },
      estado: 'completed',
      motivoIncompleto: null,
    }
    return r
  }
  return { llamar, vistas }
}

const salidas = (p: ParamsLlamada) => p.input.filter((x) => x.type === 'function_call_output').map((x) => String(x.output))
const responder = (o: Partial<Record<string, unknown>> = {}): Llamada => ({
  name: 'responder',
  args: {
    mensaje: 'Para una canilla que gotea casi siempre alcanza con cambiar el cuerito y sellar con teflón.',
    tarjetas: [], acciones: [{ etiqueta: 'Ver materiales', href: '/materiales' }], sugerencias: [], pregunta_aclaracion: null,
    evidencia: 'sugerir_materiales devolvió cuerito y teflón', ...o,
  },
})

function correr(ctx: Contexto, llamar: LlamarModelo, extra: Partial<Parameters<typeof correrAgente>[0]> = {}) {
  const reg = registroVacio()
  const eventos: EventoHomy[] = []
  const p = correrAgente({
    ctx, historial: [], pregunta: 'se me gotea la canilla qué necesito', herramientas: crearHerramientas(ctx, datos, reg), reg, llamar,
    emitir: (e) => eventos.push(e), ...extra,
  })
  return { p, reg, eventos }
}

test('camino feliz: busca, compara y responde con tarjetas reales; registra pasos y streamea texto', async () => {
  const { llamar } = modeloGuionado([
    () => [{ name: 'sugerir_materiales', args: { necesidad: 'canilla que gotea cuerito teflon', rubro: 'plomeria' } }],
    () => [{ name: 'buscar_proveedores_con_stock', args: { elementos: ['el_cuerito', 'el_teflon'] } }],
    () => [responder({ tarjetas: ['elemento:el_cuerito', 'material:st_teflon_b', 'material:st_teflon_a'], mensaje: 'Cambiá el cuerito y usá teflón: Sanitarios Sosa lo tiene a $420.' })],
  ])
  const { p, eventos } = correr(ctxCliente, llamar)
  const r = await p
  assert.equal(r.resultado, 'ok')
  assert.equal(r.vueltas, 3)
  assert.deepEqual(r.pasos.map((x) => x.herramienta), ['sugerir_materiales', 'buscar_proveedores_con_stock', 'responder'])
  assert.equal(r.final.tarjetas.length, 3)
  const teflon = r.final.tarjetas.find((t) => t.tipo === 'material' && t.id === 'st_teflon_b')
  assert.ok(teflon && teflon.tipo === 'material' && teflon.precio === 420, 'la tarjeta la arma el código con el precio real')
  assert.ok(eventos.some((e) => e.t === 'paso'), 'emite pasos legibles')
  assert.ok(eventos.some((e) => e.t === 'texto'), 'streamea el mensaje')
  // el ranking lo pone el código: verificado primero aunque el otro sea PRO y más barato
  const salidaProv = r.pasos.find((x) => x.herramienta === 'buscar_proveedores_con_stock')
  assert.equal(salidaProv?.estado, 'encontrado')
})

test('exige la herramienta responder: sin ella agota las vueltas y devuelve respaldo sin inventar', async () => {
  const { llamar, vistas } = modeloGuionado([() => []])
  const r = await correr(ctxVisitante, llamar).p
  assert.equal(r.resultado, 'agoto_vueltas')
  assert.equal(vistas.length, MAX_VUELTAS)
  assert.equal(r.final.degradado, true)
  assert.equal(r.final.tarjetas.length, 0)
})

test('corta a las 6 vueltas aunque el modelo siga buscando', async () => {
  let n = 0
  const { llamar, vistas } = modeloGuionado([() => [{ name: 'como_funciona_homia', args: { tema: `pagos ${n++}` } }]])
  const r = await correr(ctxVisitante, llamar).p
  assert.equal(vistas.length, 6)
  assert.equal(r.vueltas, 6)
  assert.equal(r.resultado, 'agoto_vueltas')
  assert.equal(r.pasos.filter((x) => x.herramienta === 'como_funciona_homia').length, 6)
})

test('rechaza links no permitidos y el modelo se corrige en el mismo loop', async () => {
  const { llamar, vistas } = modeloGuionado([
    () => [responder({ acciones: [{ etiqueta: 'Comprá acá', href: 'https://ofertas-truchas.com' }] })],
    () => [responder()],
  ])
  const r = await correr(ctxCliente, llamar).p
  assert.equal(r.resultado, 'ok')
  assert.match(salidas(vistas[1]).join(' '), /no es una sección válida/)
  assert.equal(r.pasos[0].estado, 'rechazado')
})

test('rechaza un perfil con id que no salió de una herramienta', async () => {
  const { llamar, vistas } = modeloGuionado([
    () => [responder({ acciones: [{ etiqueta: 'Ver plomero', href: '/profesional/pr_inventado' }] })],
    () => [responder()],
  ])
  await correr(ctxCliente, llamar).p
  assert.match(salidas(vistas[1]).join(' '), /pr_inventado/)
})

test('rechaza entidades (tarjetas) que no devolvió ninguna herramienta', async () => {
  const { llamar, vistas } = modeloGuionado([
    () => [responder({ tarjetas: ['profesional:plomeria-rapida-srl'] })],
    () => [responder()],
  ])
  const r = await correr(ctxCliente, llamar).p
  assert.match(salidas(vistas[1]).join(' '), /no salió de ninguna herramienta/)
  assert.equal(r.final.tarjetas.length, 0)
})

test('rechaza montos que no se leyeron y frases prohibidas', async () => {
  const { llamar, vistas } = modeloGuionado([
    () => [responder({ mensaje: 'Como inteligencia artificial te digo que la visita sale $15.000.' })],
    () => [responder()],
  ])
  await correr(ctxCliente, llamar).p
  const err = salidas(vistas[1]).join(' ')
  assert.match(err, /\$15\.000/)
  assert.match(err, /frases prohibidas/)
})

test('responder junto con otra herramienta en la misma vuelta se rechaza', async () => {
  const { llamar, vistas } = modeloGuionado([
    () => [{ name: 'buscar_profesionales', args: { rubro: 'plomeria', necesidad: null, zona: 'Palermo' } }, responder({ tarjetas: ['profesional:pr_matias'] })],
    () => [responder({ tarjetas: ['profesional:pr_matias'] })],
  ])
  const r = await correr(ctxCliente, llamar).p
  assert.match(salidas(vistas[1]).join(' '), /No respondas en la misma vuelta/)
  assert.equal(r.final.tarjetas[0].tipo, 'profesional')
})

test('buscar_proveedores_con_stock no acepta ids que no salieron de sugerir_materiales', async () => {
  const { llamar, vistas } = modeloGuionado([
    () => [{ name: 'buscar_proveedores_con_stock', args: { elementos: ['el_cemento'] } }],
    () => [responder()],
  ])
  await correr(ctxCliente, llamar).p
  assert.match(salidas(vistas[1]).join(' '), /no salieron de sugerir_materiales/)
})

test('visitante: las secciones con cuenta se convierten en registro con "volver"', async () => {
  const { llamar } = modeloGuionado([
    () => [{ name: 'sugerir_materiales', args: { necesidad: 'cemento', rubro: null } }],
    () => [{ name: 'buscar_proveedores_con_stock', args: { elementos: ['el_cemento'] } }],
    () => [responder({ tarjetas: ['material:st_cemento'], acciones: [{ etiqueta: 'Comprar', href: '/panel/cliente/materiales?stock=st_cemento&q=Cemento%20Portland%2050kg' }], mensaje: 'Ferretería Ferrer lo tiene a $6.900 la bolsa.' })],
  ])
  const r = await correr(ctxVisitante, llamar).p
  assert.equal(r.resultado, 'ok')
  assert.match(r.final.acciones[0].href, /^\/registrarse\?volver=%2Fpanel%2Fcliente%2Fmateriales/)
  const t = r.final.tarjetas[0]
  assert.ok(t.tipo === 'material' && t.hrefCarrito.startsWith('/registrarse?volver='))
})

test('mis_pendientes solo existe con cuenta', () => {
  assert.equal(crearHerramientas(ctxVisitante, datos, registroVacio()).mis_pendientes, undefined)
  assert.ok(crearHerramientas(ctxCliente, datos, registroVacio()).mis_pendientes)
})

test('el cupo se descuenta justo antes de la 1ª llamada al modelo; si falla, no se llama', async () => {
  let llamadas = 0
  const llamar: LlamarModelo = async () => { llamadas++; throw new Error('no debería llamarse') }
  await assert.rejects(correr(ctxVisitante, llamar, { alLlamarIA: async () => { throw new Error('cupo agotado') } }).p, /cupo agotado/)
  assert.equal(llamadas, 0)
  let cobros = 0
  const { llamar: ok } = modeloGuionado([() => [{ name: 'como_funciona_homia', args: { tema: 'pagos' } }], () => [responder()]])
  await correr(ctxVisitante, ok, { alLlamarIA: async () => { cobros++ } }).p
  assert.equal(cobros, 1, 'una consulta = un descuento, aunque el loop haga varias llamadas')
})

test('rechaza decir "verificado" de alguien que no lo está (pasó en la evaluación con un gasista)', async () => {
  const { llamar, vistas } = modeloGuionado([
    () => [{ name: 'buscar_profesionales', args: { rubro: 'gasistas', necesidad: null, zona: null } }],
    () => [responder({ tarjetas: ['profesional:pr_matias'], mensaje: 'Encontré a Matías Ferrer, gasista verificado en Buenos Aires.' })],
    () => [responder({ tarjetas: ['profesional:pr_matias'], mensaje: 'Encontré a Matías Ferrer, gasista en Buenos Aires (todavía no verificado).' })],
  ])
  const r = await correr(ctxCliente, llamar).p
  assert.match(salidas(vistas[2]).join(' '), /NO lo está/)
  assert.equal(r.resultado, 'ok')
})

test('sugerir_materiales: a igual parecido, primero el que tiene stock', async () => {
  const d2: FuenteDatos = {
    ...datos,
    async elementos() {
      return ['blanco 25kg', 'de fragua rápida 5kg', 'hidrófugo', 'Portland 25kg', 'Portland 40kg', 'Portland 50kg'].map((n, k) => ({
        id: k === 5 ? 'el_cemento' : `el_c${k}`, nombre: `Cemento ${n}`, aliases: [], descripcion: 'Cemento.', unidad: 'bolsa', rubro: 'albanileria', rubroNombre: 'Albañilería',
      }))
    },
  }
  const reg = registroVacio()
  const h = crearHerramientas(ctxVisitante, d2, reg).sugerir_materiales
  const r = await h.ejecutar({ necesidad: 'cemento', rubro: null })
  const primero = JSON.parse(r.salida).elementos[0]
  assert.equal(primero.id, 'el_cemento')
  assert.equal(primero.proveedores_con_stock, 1)
})

test('ranking: verificado > reseñas bayesianas > precio; PRO solo desempata', () => {
  const base = { rating: 4.5, resenas: 2, precio: 100, distanciaKm: 1, recomendado: false }
  assert.ok(compararOfertas({ ...base, verificado: true }, { ...base, verificado: false, recomendado: true, precio: 1 }) < 0)
  assert.ok(puntajeBayesiano(4.8, 40) > puntajeBayesiano(5, 1))
  assert.ok(compararOfertas({ ...base, verificado: false, recomendado: true }, { ...base, verificado: false }) < 0)
})

test('streaming: extrae el mensaje parcial del JSON que se está generando', () => {
  assert.equal(campoParcial('{"mensaje":"Hola, cambi', 'mensaje'), 'Hola, cambi')
  assert.equal(campoParcial('{"mensaje":"Dijo \\"sí\\"\\ny', 'mensaje'), 'Dijo "sí"\ny')
  assert.equal(campoParcial('{"tarjetas":[', 'mensaje'), null)
})

test('links: secciones del rol sí, de otro rol no, ids solo si los devolvió una herramienta', () => {
  assert.ok(linkPermitido('/panel/cliente/facturas', 'cliente', ['cliente'], new Set()))
  assert.ok(!linkPermitido('/panel/proveedor/cobros', 'cliente', ['cliente'], new Set()))
  assert.ok(!linkPermitido('/proveedor/pv_x', 'cliente', ['cliente'], new Set()))
  assert.ok(linkPermitido('/proveedor/pv_x', 'cliente', ['cliente'], new Set(['/proveedor/pv_x'])))
  assert.ok(!linkPermitido('javascript:alert(1)', 'cliente', ['cliente'], new Set()))
  assert.ok(!linkPermitido('/panel/cliente/facturas?evil=1', 'cliente', ['cliente'], new Set()))
})

test('prompt: cada frase prohibida aparece UNA sola vez (en su lista), fuera de los ejemplos MAL', () => {
  const sinEjemplosMal = PROMPT_ESTATICO.split('\n').filter((l) => !l.startsWith('MAL:')).join('\n').toLowerCase()
  for (const f of FRASES_PROHIBIDAS) {
    const n = sinEjemplosMal.split(f.toLowerCase()).length - 1
    assert.equal(n, 1, `"${f}" aparece ${n} veces`)
  }
})

test('prompt: lo estático no tiene datos dinámicos; el bloque dinámico sí', () => {
  assert.ok(!/\d{2}\/\d{2}\/\d{4}/.test(PROMPT_ESTATICO))
  const d = bloqueDinamico(ctxCliente, new Date('2026-09-24T15:00:00Z'))
  assert.match(d, /cliente con cuenta/)
  assert.match(d, /panel de cliente/)
  assert.match(d, /24\/09\/2026/)
})
