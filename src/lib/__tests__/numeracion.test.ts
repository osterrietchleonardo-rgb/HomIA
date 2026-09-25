import { test } from 'node:test'
import assert from 'node:assert/strict'
import { prefijoAnual, ultimoNumero, formatearNumero, type BuscarUltimo } from '../numeracion'

// Simula findFirst({ where: startsWith, orderBy: desc }) sobre una lista de números existentes
const buscarEn = (numeros: string[]): BuscarUltimo => async (a) => {
  const f = numeros.filter((n) => n.startsWith(a.where.number.startsWith)).sort().reverse()
  return f.length ? { number: f[0] } : null
}

test('prefijo y formato con ceros', () => {
  assert.equal(prefijoAnual('PED', new Date(2026, 8, 25)), 'PED-2026-')
  assert.equal(formatearNumero('PED-2026-', 42), 'PED-2026-000042')
})

test('con huecos por borrados sigue desde el mayor, no desde la cantidad', async () => {
  // quedan 2 pedidos pero el último es el 150: count()+1 = 3 chocaba siempre
  const n = await ultimoNumero(buscarEn(['PED-2026-000003', 'PED-2026-000150']), 'PED-2026-')
  assert.equal(n, 150)
  assert.equal(formatearNumero('PED-2026-', n + 1), 'PED-2026-000151')
})

test('año nuevo o sin comprobantes arranca en 1; otros años no cuentan', async () => {
  assert.equal(await ultimoNumero(buscarEn(['PED-2025-000900']), 'PED-2026-'), 0)
  assert.equal(await ultimoNumero(buscarEn([]), 'PRV-2026-'), 0)
})

test('un número raro no rompe la numeración', async () => {
  assert.equal(await ultimoNumero(buscarEn(['HOM-2026-abc']), 'HOM-2026-'), 0)
})
