// Tests de la estandarización del registro (D26): email, celular con país, nombres y CUIT.
// Correr con:
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/registro.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarEmail, sugerirEmail, normalizarCelular, formatearCelular, mismoCelular,
  normalizarNombre, problemaNombre, normalizarCuit, normalizarDniOCuil,
  paisesCelular, esPaisCelular, paisDeCelular, ejemploCelular,
} from '../registro'

// ── email ──
test('email: trim y minúsculas', () => {
  const r = normalizarEmail('  Juan.Perez@Gmail.COM ')
  assert.deepEqual(r, { ok: true, email: 'juan.perez@gmail.com', sugerencia: null })
})

test('email: rechaza lo que no es un email, con mensaje claro', () => {
  for (const malo of ['', 'juan', 'juan@', 'juan@gmail', 'juan perez@gmail.com', 'juan@@gmail.com', 'juan..p@gmail.com', '.juan@gmail.com', 'juan@gmail.c']) {
    const r = normalizarEmail(malo)
    assert.equal(r.ok, false, `debería rechazar "${malo}"`)
  }
  const sinArroba = normalizarEmail('juangmail.com')
  assert.ok(!sinArroba.ok && /@/.test(sinArroba.error))
})

test('email: sugiere el dominio mal escrito sin corregirlo solo', () => {
  const casos: [string, string][] = [
    ['juan@gmial.com', 'juan@gmail.com'],
    ['juan@gmal.com', 'juan@gmail.com'],
    ['juan@gmail.con', 'juan@gmail.com'],
    ['juan@gmail.cm', 'juan@gmail.com'],
    ['juan@gmail.com.ar', 'juan@gmail.com'],
    ['ana@hotmial.com', 'ana@hotmail.com'],
    ['ana@hotmail.com.ra', 'ana@hotmail.com.ar'],
    ['ana@outlok.com', 'ana@outlook.com'],
    ['ana@yaho.com.ar', 'ana@yahoo.com.ar'],
    ['ana@icloud.co', 'ana@icloud.com'],
  ]
  for (const [entrada, esperado] of casos) {
    const r = normalizarEmail(entrada)
    assert.ok(r.ok, entrada)
    assert.equal(r.ok && r.email, entrada, 'no corrige solo')
    assert.equal(r.ok && r.sugerencia, esperado, entrada)
  }
})

test('email: no sugiere nada para dominios comunes ni para dominios propios', () => {
  for (const ok of ['a@gmail.com', 'a@hotmail.com.ar', 'a@vakdor.com', 'a@somoshomia.com', 'a@mi.com', 'a@homia.test', 'a@unlp.edu.ar']) {
    assert.equal(sugerirEmail(ok), null, ok)
  }
})

// ── celular: 15 formas reales de escribir un celular argentino ──
test('celular: 15 casos reales se normalizan a E.164 con el 9', () => {
  const casos: [string, string][] = [
    ['011 15 2345-6789', '+5491123456789'],
    ['11 2345 6789', '+5491123456789'],
    ['1123456789', '+5491123456789'],
    ['15 2345-6789 ', null as unknown as string], // sin código de área: no alcanza (se prueba abajo)
    ['+54 9 11 2345-6789', '+5491123456789'],
    ['+54 11 2345-6789', '+5491123456789'],
    ['5491123456789', '+5491123456789'],
    ['0054 9 11 2345 6789', '+5491123456789'],
    ['(011) 15-2345-6789', '+5491123456789'],
    ['0351 15 555-1234', '+5493515551234'],
    ['351 555 1234', '+5493515551234'],
    ['0341 156 123456', '+5493416123456'],
    ['(0221) 15 308-9334', '+5492213089334'],
    ['0261-155123456', '+5492615123456'],
    ['03492 15 50-1234', '+5493492501234'],
    ['+54 9 2255 45-6789', '+5492255456789'],
  ].filter(([, e]) => e !== null) as [string, string][]
  assert.equal(casos.length, 15)
  for (const [entrada, e164] of casos) {
    const r = normalizarCelular(entrada)
    assert.ok(r.ok, `${entrada} → ${!r.ok ? r.error : ''}`)
    assert.equal(r.ok && r.e164, e164, entrada)
  }
})

test('celular: muestra cómo quedó (+54 9 área número)', () => {
  const r = normalizarCelular('011 15 2345-6789')
  assert.ok(r.ok)
  assert.equal(r.ok && r.mostrar, '+54 9 11 2345-6789')
  assert.equal(formatearCelular('+5493515551234'), '+54 9 351 555-1234')
})

test('celular: rechaza lo que no es un celular válido con un mensaje claro', () => {
  const malos = ['', '123', '15 2345-6789', 'once 2345 6789', '11 2345 678', '11 2345 67890', '0800 333 4444']
  for (const m of malos) {
    const r = normalizarCelular(m)
    assert.equal(r.ok, false, `debería rechazar "${m}"`)
    assert.ok(!r.ok && r.error.length > 10, m)
  }
})

// ── celular de cualquier país (25/09/2026: se estandariza con país, no se verifica por código) ──
test('celular: el país por defecto es Argentina y devuelve el país', () => {
  const r = normalizarCelular('11 2345-6789')
  assert.ok(r.ok)
  assert.equal(r.ok && r.pais, 'AR')
  assert.equal(normalizarCelular('11 2345-6789', 'AR').ok, true)
})

test('celular: acepta celulares de otros países con el país elegido', () => {
  const casos: [string, string, string, string][] = [
    ['099 123 456', 'UY', '+59899123456', '+598 99 123 456'],
    ['99 123 456', 'UY', '+59899123456', '+598 99 123 456'],
    ['612 34 56 78', 'ES', '+34612345678', '+34 612 34 56 78'],
    ['(202) 555-0143', 'US', '+12025550143', '+1 202 555 0143'],
    ['55 1234 5678', 'MX', '+525512345678', '+52 55 1234 5678'],
    ['9 8765 4321', 'CL', '+56987654321', '+56 9 8765 4321'],
    ['11 96123-4567', 'BR', '+5511961234567', '+55 11 96123 4567'],
  ]
  for (const [entrada, pais, e164, mostrar] of casos) {
    const r = normalizarCelular(entrada, pais as never)
    assert.ok(r.ok, `${pais} ${entrada} → ${!r.ok ? r.error : ''}`)
    assert.equal(r.ok && r.e164, e164, entrada)
    assert.equal(r.ok && r.mostrar, mostrar, entrada)
    assert.equal(r.ok && r.pais, pais, entrada)
  }
})

test('celular: con + adelante se interpreta como internacional, sin importar el país elegido', () => {
  const uy = normalizarCelular('+598 99 123 456', 'AR')
  assert.ok(uy.ok)
  assert.equal(uy.ok && uy.e164, '+59899123456')
  assert.equal(uy.ok && uy.pais, 'UY')
  const us = normalizarCelular('+1 202 555 0143')
  assert.ok(us.ok && us.pais === 'US' && us.e164 === '+12025550143')
  const es = normalizarCelular('0034 612 34 56 78', 'AR')
  assert.ok(es.ok && es.pais === 'ES' && es.e164 === '+34612345678', 'con 00 también es internacional')
  // un celular argentino internacional elegido con otro país sigue la regla del 9
  const ar = normalizarCelular('+54 11 2345-6789', 'UY')
  assert.ok(ar.ok && ar.e164 === '+5491123456789' && ar.pais === 'AR' && ar.mostrar === '+54 9 11 2345-6789')
})

test('celular: número inválido para el país elegido, con el nombre del país', () => {
  const r = normalizarCelular('99 123', 'UY')
  assert.ok(!r.ok)
  assert.match(!r.ok ? r.error : '', /Número inválido para Uruguay: revisá la característica y la cantidad de números/)
  const es = normalizarCelular('12 34', 'ES')
  assert.ok(!es.ok && /España/.test(es.error))
  const intl = normalizarCelular('+598 99 123', 'AR')
  assert.ok(!intl.ok && intl.error.length > 10)
})

test('celular: el doble tipeo compara números del mismo país', () => {
  assert.equal(mismoCelular('099 123 456', '+598 99 123 456', 'UY'), true)
  assert.equal(mismoCelular('099 123 456', '099 123 457', 'UY'), false)
})

test('celular: lista de países con bandera, nombre y código, AR primero', () => {
  const lista = paisesCelular('es')
  assert.ok(lista.length > 200)
  assert.deepEqual(lista.slice(0, 8).map((p) => p.iso), ['AR', 'UY', 'CL', 'PY', 'BO', 'MX', 'ES', 'US'])
  const ar = lista[0]
  assert.equal(ar.nombre, 'Argentina')
  assert.equal(ar.codigo, '54')
  assert.equal(ar.bandera, '🇦🇷')
  // el resto en orden alfabético
  const resto = lista.slice(8).map((p) => p.nombre)
  assert.deepEqual(resto, [...resto].sort((a, b) => a.localeCompare(b, 'es')))
})

test('celular: país válido, país de un E.164 y ejemplo por país', () => {
  assert.equal(esPaisCelular('UY'), true)
  assert.equal(esPaisCelular('XX'), false)
  assert.equal(esPaisCelular('ar'), false, 'ISO-2 en mayúsculas')
  assert.equal(esPaisCelular(undefined), false)
  assert.equal(paisDeCelular('+5491123456789'), 'AR')
  assert.equal(paisDeCelular('+59899123456'), 'UY')
  assert.equal(paisDeCelular(null), null)
  assert.equal(paisDeCelular('basura'), null)
  assert.equal(ejemploCelular('AR'), '11 2345-6789')
  assert.equal(ejemploCelular('UY'), '094 231 234')
  assert.equal(ejemploCelular('ES'), '612 34 56 78')
})

test('celular: formato para mostrar (guion final solo en Argentina)', () => {
  assert.equal(formatearCelular('+59899123456'), '+598 99 123 456')
  assert.equal(formatearCelular('+5491123456789'), '+54 9 11 2345-6789')
})

test('celular: el doble tipeo compara números, no texto', () => {
  assert.equal(mismoCelular('11 2345-6789', '011 15 2345 6789'), true)
  assert.equal(mismoCelular('11 2345-6789', '11 2345-6788'), false)
  assert.equal(mismoCelular('', ''), false)
})

// ── nombres ──
test('nombre: mayúsculas iniciales razonables', () => {
  assert.equal(normalizarNombre('  juan   PÉREZ '), 'Juan Pérez')
  assert.equal(normalizarNombre('maría josé de la fuente'), 'María José de la Fuente')
  assert.equal(normalizarNombre("o'connor"), "O'Connor")
  assert.equal(normalizarNombre('ana-lía'), 'Ana-Lía')
  assert.equal(normalizarNombre('McDonald'), 'McDonald', 'lo mezclado queda como está')
  assert.equal(normalizarNombre('[E2E] Cliente'), '[E2E] Cliente', 'símbolos y números quedan como están')
  assert.equal(normalizarNombre('DE LA TORRE'), 'De la Torre')
})

test('nombre: problemas', () => {
  assert.match(problemaNombre('', 'nombre') || '', /Escribí tu nombre/)
  assert.match(problemaNombre('a', 'apellido') || '', /2 letras/)
  assert.equal(problemaNombre('Li', 'apellido'), null)
  assert.match(problemaNombre('x'.repeat(41), 'nombre') || '', /largo/)
})

// ── CUIT ──
test('CUIT: dígito verificador y formato', () => {
  assert.deepEqual(normalizarCuit('20123456786'), { ok: true, cuit: '20-12345678-6', digitos: '20123456786' })
  assert.equal(normalizarCuit('20-12345678-6').ok, true)
  assert.equal(normalizarCuit('30-71234567-1').ok, true, 'CUIT de empresa')
  assert.equal(normalizarCuit('20-12345678-5').ok, false, 'dígito verificador mal')
  assert.equal(normalizarCuit('12-12345678-6').ok, false, 'prefijo inválido')
  assert.equal(normalizarCuit('2012345678').ok, false, 'faltan números')
})

test('DNI o CUIL', () => {
  assert.deepEqual(normalizarDniOCuil('30.123.456'), { ok: true, valor: '30123456' })
  assert.deepEqual(normalizarDniOCuil('20-12345678-6'), { ok: true, valor: '20-12345678-6' })
  assert.equal(normalizarDniOCuil('123').ok, false)
  assert.equal(normalizarDniOCuil('20-12345678-5').ok, false)
})
