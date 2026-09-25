// Tests de la estandarización del registro (D26): email, celular argentino, nombres y CUIT.
// Correr con:
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/registro.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  normalizarEmail, sugerirEmail, normalizarCelular, formatearCelular, mismoCelular,
  normalizarNombre, problemaNombre, normalizarCuit, normalizarDniOCuil,
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
  const malos = ['', '123', '15 2345-6789', 'once 2345 6789', '11 2345 678', '11 2345 67890', '+598 99 123 456', '+1 202 555 0143', '0800 333 4444']
  for (const m of malos) {
    const r = normalizarCelular(m)
    assert.equal(r.ok, false, `debería rechazar "${m}"`)
    assert.ok(!r.ok && r.error.length > 10, m)
  }
  const uy = normalizarCelular('+598 99 123 456')
  assert.ok(!uy.ok && /Argentina/.test(uy.error))
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
