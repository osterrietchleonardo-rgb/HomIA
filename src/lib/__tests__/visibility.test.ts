import { test } from 'node:test'
import assert from 'node:assert/strict'
import { ocultarDemo } from '../visibility'

test('en el sitio publicado las cuentas de prueba nunca se ven', () => {
  assert.equal(ocultarDemo({ VERCEL_ENV: 'production' }), true)
  assert.equal(ocultarDemo({ VERCEL_ENV: 'production', HIDE_DEMO_USERS: '0' }), true)
})

test('fuera de producción depende de HIDE_DEMO_USERS (las suites E2E corren con 0)', () => {
  assert.equal(ocultarDemo({}), false)
  assert.equal(ocultarDemo({ HIDE_DEMO_USERS: '1' }), true)
  assert.equal(ocultarDemo({ VERCEL_ENV: 'preview', HIDE_DEMO_USERS: '0' }), false)
})
