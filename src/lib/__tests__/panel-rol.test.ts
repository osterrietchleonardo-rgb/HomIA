// Tests del perfil activo del panel (src/lib/panel-rol.ts). Sin red ni base. Correr con:
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/panel-rol.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { elegirRolActivo } from '../panel-rol'

const PRO = ['cliente', 'profesional']

test('dentro de /panel/<rol> manda la ruta', () => {
  assert.equal(elegirRolActivo(['panel', 'profesional', 'bolsa'], PRO, 'cliente'), 'profesional')
  assert.equal(elegirRolActivo(['panel', 'cliente'], PRO, 'profesional'), 'cliente')
})

test('fuera del panel (ej. /trabajo/<id> desde la bolsa) sigue el último perfil usado', () => {
  assert.equal(elegirRolActivo(['trabajo', 'abc'], PRO, 'profesional'), 'profesional')
  assert.equal(elegirRolActivo(['directorio'], PRO, 'profesional'), 'profesional')
})

test('sin perfil recordado, o uno que el usuario ya no tiene, vuelve al primero de sus roles', () => {
  assert.equal(elegirRolActivo(['trabajo', 'abc'], PRO, null), 'cliente')
  assert.equal(elegirRolActivo(['trabajo', 'abc'], PRO, 'proveedor'), 'cliente')
  assert.equal(elegirRolActivo(['trabajo', 'abc'], PRO, 'admin'), 'cliente')
})

test('sin sesión: cliente', () => {
  assert.equal(elegirRolActivo(['trabajo', 'abc'], undefined, 'profesional'), 'cliente')
})
