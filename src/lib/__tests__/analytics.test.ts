// Tests de las reglas puras de métricas de uso (src/lib/analytics/core.ts y schema.ts, D27).
// Sin red ni base. Correr con:
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/analytics.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarRuta, entidadDeRuta, parsearDataEntity, rolDeRuta, etiquetaDe, limpiarTexto, limpiarBusqueda,
  mensajeError, resumirDispositivo, dominioReferrer, utmDe, tramoActivo, sumarLatidos, sesionVencida,
  armarEmbudo, armarCohortes, mediana, aCsv, TOPE_TRAMO_MS, INACTIVIDAD_MS, SESION_INACTIVA_MS,
} from '../analytics/core'
import { loteSchema, MAX_EVENTOS_LOTE } from '../analytics/schema'

const CUID = 'cmg1a2b3c4d5e6f7g8h9i0jkl'

test('normalizarRuta: saca ids, query y mayúsculas; acepta el hash de la SPA', () => {
  assert.equal(normalizarRuta(`#/panel/cliente/proyectos/${CUID}?tab=materiales`), '/panel/cliente/proyectos/:id')
  assert.equal(normalizarRuta('/panel/profesional/pedidos/PED-2026-000123'), '/panel/profesional/pedidos/:id')
  assert.equal(normalizarRuta('#/buscar?q=plomero juan'), '/buscar')
  assert.equal(normalizarRuta('/trabajo/123456'), '/trabajo/:id')
  assert.equal(normalizarRuta('/proveedor/5f0c6f0e-8a8a-4b4b-9c9c-1234567890ab'), '/proveedor/:id')
  assert.equal(normalizarRuta(''), '/')
  assert.equal(normalizarRuta('/Panel/Cliente'), '/panel/cliente')
  assert.equal(normalizarRuta('/api/projects/' + CUID + '/invoice'), '/api/projects/:id/invoice')
})

test('entidadDeRuta: proyecto, pedido, trabajo y rutas de la API', () => {
  assert.deepEqual(entidadDeRuta(`#/panel/cliente/proyectos/${CUID}`), { entityType: 'project', entityId: CUID })
  assert.deepEqual(entidadDeRuta(`/panel/profesional/pedidos/${CUID}`), { entityType: 'order', entityId: CUID })
  assert.deepEqual(entidadDeRuta(`#/trabajo/${CUID}`), { entityType: 'job', entityId: CUID })
  assert.deepEqual(entidadDeRuta(`/api/invoices/${CUID}/pdf`), { entityType: 'invoice', entityId: CUID })
  assert.deepEqual(entidadDeRuta(`/api/messages/conversations/${CUID}`), { entityType: 'conversation', entityId: CUID })
  assert.equal(entidadDeRuta('/panel/cliente/proyectos'), null)
  assert.equal(entidadDeRuta('/directorio'), null)
  assert.deepEqual(parsearDataEntity(`project:${CUID}`), { entityType: 'project', entityId: CUID })
  assert.equal(parsearDataEntity('hacker:1; drop table'), null)
  assert.equal(parsearDataEntity('desconocido:abc'), null)
})

test('rolDeRuta: solo dentro del panel', () => {
  assert.equal(rolDeRuta('/panel/proveedor/stock'), 'proveedor')
  assert.equal(rolDeRuta('#/panel/cliente'), 'cliente')
  assert.equal(rolDeRuta('/panel/admin/metricas'), null)
  assert.equal(rolDeRuta('/buscar'), null)
})

test('etiquetaDe: data-track > aria-label > title > texto corto; nunca el valor de un campo', () => {
  assert.equal(etiquetaDe({ tag: 'button', dataTrack: 'pagar con MP', ariaLabel: 'x', texto: 'Pagar' }), 'pagar con MP')
  assert.equal(etiquetaDe({ tag: 'button', ariaLabel: 'Enviar mensaje', texto: '' }), 'Enviar mensaje')
  assert.equal(etiquetaDe({ tag: 'button', texto: '  Publicar   trabajo ' }), 'Publicar trabajo')
  // un campo: solo el tipo de control, nunca su contenido
  assert.equal(etiquetaDe({ tag: 'input', esCampo: true, tipoCampo: 'password', texto: 'MiClave123' }), 'campo:password')
  assert.equal(etiquetaDe({ tag: 'select', esCampo: true }), 'campo:select')
})

test('etiquetaDe: texto largo (contenido cargado por alguien) no se guarda; números y emails se tapan', () => {
  const tarjeta = etiquetaDe({ tag: 'a', texto: 'Juan Pérez Plomero matriculado en Palermo 5 estrellas', href: `#/profesional/${CUID}` })
  assert.equal(tarjeta, 'link:/profesional/:id')
  assert.ok(!tarjeta.includes('Juan'))
  const chat = etiquetaDe({ tag: 'button', texto: 'María Gómez Hola te paso el presupuesto mañana temprano' })
  assert.equal(chat, 'button:sin-etiqueta')
  assert.equal(etiquetaDe({ tag: 'button', texto: 'Pagar $ 12.500' }), 'Pagar $#')
  assert.equal(limpiarTexto('escribime a ana@mail.com o al 11 4455-6677'), 'escribime a [email] o al #')
  assert.ok(etiquetaDe({ tag: 'button', dataTrack: 'x'.repeat(200) }).length <= 60)
})

test('limpiarBusqueda: conserva números cortos, tapa teléfonos, DNI y emails', () => {
  assert.equal(limpiarBusqueda('  Caño   110 '), 'caño 110')
  assert.equal(limpiarBusqueda('plomero 11 4455 6677'), 'plomero #')
  assert.equal(limpiarBusqueda('dni 30123456'), 'dni #')
  assert.equal(limpiarBusqueda('juan@x.com'), '[email]')
})

test('mensajeError sin datos personales y recortado', () => {
  assert.equal(mensajeError(new TypeError('falló para ana@mail.com id 123456')), 'TypeError: falló para [email] id #')
  assert.ok(mensajeError('x'.repeat(500)).length <= 160)
})

test('resumirDispositivo, dominioReferrer y utm', () => {
  assert.equal(resumirDispositivo('Mozilla/5.0 (Linux; Android 14; SM-A546E) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36'), 'celu · Chrome · Android')
  assert.equal(resumirDispositivo('Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1'), 'celu · Safari · iOS')
  assert.equal(resumirDispositivo('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36 Edg/126.0'), 'compu · Edge · Windows')
  assert.equal(dominioReferrer('https://www.google.com/search?q=plomero+palermo'), 'google.com')
  assert.equal(dominioReferrer('https://www.somoshomia.com/#/buscar', 'www.somoshomia.com'), null)
  assert.equal(dominioReferrer('no es url'), null)
  assert.deepEqual(utmDe('?utm_source=instagram&utm_campaign=lanzamiento&x=1'), { utm_source: 'instagram', utm_campaign: 'lanzamiento' })
  assert.equal(utmDe('?q=1'), null)
  // bug visto en el recorrido visual: "e2e" quedaba "e#e"
  assert.deepEqual(utmDe('?utm_source=e2e&utm_campaign=Promo2026&utm_term=11 4455 6677'), { utm_source: 'e2e', utm_campaign: 'promo2026', utm_term: '#' })
})

test('tiempo activo: solo con la pestaña visible, con interacción reciente y con tope por latido', () => {
  const t0 = 1_000_000
  assert.equal(tramoActivo({ ahora: t0 + 30_000, ultimoTick: t0, visible: true, ultimaInteraccion: t0 + 10_000 }), 30_000)
  assert.equal(tramoActivo({ ahora: t0 + 30_000, ultimoTick: t0, visible: false, ultimaInteraccion: t0 }), 0)
  // pestaña dormida 10 min: no se inventa tiempo
  assert.equal(tramoActivo({ ahora: t0 + 600_000, ultimoTick: t0, visible: true, ultimaInteraccion: t0 + 599_000 }), TOPE_TRAMO_MS)
  // visible pero nadie tocó nada hace más de 5 min
  assert.equal(tramoActivo({ ahora: t0 + INACTIVIDAD_MS + 31_000, ultimoTick: t0 + INACTIVIDAD_MS, visible: true, ultimaInteraccion: t0 }), 0)
  // 10 latidos de 30 s = 5 minutos; un latido trucho de 1 hora cuenta como el tope
  assert.equal(sumarLatidos(Array(10).fill(30_000)), 300_000)
  assert.equal(sumarLatidos([3_600_000, -5, Number.NaN]), TOPE_TRAMO_MS)
  assert.ok(sumarLatidos(Array(50).fill(35_000)) <= 600_000)
})

test('sesión: se corta tras 30 minutos sin actividad', () => {
  assert.equal(sesionVencida(null, 1), true)
  assert.equal(sesionVencida(1_000, 1_000 + SESION_INACTIVA_MS - 1), false)
  assert.equal(sesionVencida(1_000, 1_000 + SESION_INACTIVA_MS + 1), true)
})

test('armarEmbudo: % del paso anterior y del inicio, sin dividir por cero', () => {
  const e = armarEmbudo([{ paso: 'Visitantes', n: 200 }, { paso: 'Registro', n: 20 }, { paso: 'Proyecto', n: 5 }, { paso: 'Pago', n: 0 }])
  assert.deepEqual(e.map((x) => [x.pctAnterior, x.pctInicio]), [[null, null], [10, 10], [25, 2.5], [0, 0]])
  const vacio = armarEmbudo([{ paso: 'a', n: 0 }, { paso: 'b', n: 0 }])
  assert.equal(vacio[1].pctAnterior, null)
})

test('armarCohortes: % que volvió por semana y null para semanas que no pasaron', () => {
  const filas = [
    { cohorte: '2026-09-01', usuarios: 10, semana: 0, activos: 0 },
    { cohorte: '2026-09-01', usuarios: 10, semana: 1, activos: 5 },
    { cohorte: '2026-09-01', usuarios: 10, semana: 3, activos: 2 },
    { cohorte: '2026-09-15', usuarios: 4, semana: 1, activos: 1 },
  ]
  const c = armarCohortes(filas, 4, '2026-09-22')
  assert.equal(c[0].cohorte, '2026-09-15')
  assert.deepEqual(c[0].semanas, [25, null, null, null])
  assert.deepEqual(c[1].semanas, [50, 0, 20, null])
  assert.equal(c[1].usuarios, 10)
})

test('mediana y CSV (separador ;, BOM, comillas y sin inyección de fórmulas)', () => {
  assert.equal(mediana([5, 1, 3]), 3)
  assert.equal(mediana([4, 1, 3, 2]), 2.5)
  assert.equal(mediana([]), null)
  const csv = aCsv(['Término', 'Veces'], [['caño; 110', 3], ['=HYPERLINK("x")', 1.5], [null, 0]])
  assert.ok(csv.startsWith('﻿Término;Veces\r\n'))
  assert.ok(csv.includes('"caño; 110";3'))
  assert.ok(csv.includes(`"'=HYPERLINK(""x"")";1,5`))
  assert.ok(csv.includes(';0\r\n'))
})

test('loteSchema: acepta un lote válido y rechaza lo que no cumple', () => {
  const ev = { type: 'click', name: 'Publicar trabajo', path: '/panel/cliente/publicar', props: { tag: 'button' } }
  const ok = loteSchema.safeParse({ anonId: 'e2e-abcdef1234', sessionId: 'sesion12345', events: [ev] })
  assert.equal(ok.success, true)
  // el usuario nunca viene en el cuerpo
  assert.equal(loteSchema.safeParse({ anonId: 'e2e-abcdef1234', sessionId: 'sesion12345', userId: 'otro', events: [ev] }).success, false)
  assert.equal(loteSchema.safeParse({ anonId: 'e2e-abcdef1234', sessionId: 'sesion12345', events: [{ ...ev, userId: 'x' }] }).success, false)
  assert.equal(loteSchema.safeParse({ anonId: 'corto', sessionId: 'sesion12345', events: [ev] }).success, false)
  assert.equal(loteSchema.safeParse({ anonId: 'e2e-abcdef1234', sessionId: 'sesion12345', events: [] }).success, false)
  assert.equal(loteSchema.safeParse({ anonId: 'e2e-abcdef1234', sessionId: 'sesion12345', events: Array(MAX_EVENTOS_LOTE + 1).fill(ev) }).success, false)
  assert.equal(loteSchema.safeParse({ anonId: 'e2e-abcdef1234', sessionId: 'sesion12345', events: [{ ...ev, type: 'server' }] }).success, false)
  assert.equal(loteSchema.safeParse({ anonId: 'e2e-abcdef1234', sessionId: 'sesion12345', events: [{ ...ev, path: 'sin barra' }] }).success, false)
  assert.equal(loteSchema.safeParse({ anonId: 'e2e-abcdef1234', sessionId: 'sesion12345', events: [{ ...ev, props: { texto: 'x'.repeat(500) } }] }).success, false)
  assert.equal(loteSchema.safeParse({ anonId: 'e2e-abcdef1234', sessionId: 'sesion12345', events: [{ ...ev, props: { anidado: { a: 1 } } }] }).success, false)
})
