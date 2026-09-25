// Tests del ingreso propio del área /admin (src/lib/admin-core.ts y admin-rutas.ts, D29).
// Sin red ni base. Correr con:
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/admin.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { SignJWT } from 'jose'
import {
  credencialesAdmin, verificarCredenciales, igualSeguro, firmarTokenAdmin, verificarTokenAdmin,
  crearLimitadorFallos, DURACION_ADMIN_S,
} from '../admin-core'
import { rutaAdminNueva } from '../admin-rutas'

const ENV = { ADMIN_EMAIL: ' Admin@HomIA.test ', ADMIN_PASSWORD: 'Una clave larga y única 2026!' }

test('credenciales: faltan variables → no configurado (fallback honesto)', () => {
  assert.equal(credencialesAdmin({}), null)
  assert.equal(credencialesAdmin({ ADMIN_EMAIL: 'a@b.c' }), null)
  assert.equal(credencialesAdmin({ ADMIN_PASSWORD: 'x' }), null)
  assert.equal(verificarCredenciales('a@b.c', 'x', {}), 'no_configurado')
  assert.equal(verificarCredenciales('a@b.c', 'x', { ADMIN_EMAIL: 'a@b.c', ADMIN_PASSWORD: '' }), 'no_configurado')
  assert.deepEqual(credencialesAdmin(ENV), { email: 'admin@homia.test', password: ENV.ADMIN_PASSWORD })
})

test('verificarCredenciales: email sin importar mayúsculas/espacios; contraseña exacta', () => {
  assert.equal(verificarCredenciales('admin@homia.test', ENV.ADMIN_PASSWORD, ENV), 'ok')
  assert.equal(verificarCredenciales('  ADMIN@homia.TEST ', ENV.ADMIN_PASSWORD, ENV), 'ok')
  assert.equal(verificarCredenciales('admin@homia.test', ENV.ADMIN_PASSWORD.toUpperCase(), ENV), 'mal')
  assert.equal(verificarCredenciales('admin@homia.test', `${ENV.ADMIN_PASSWORD} `, ENV), 'mal')
  assert.equal(verificarCredenciales('otro@homia.test', ENV.ADMIN_PASSWORD, ENV), 'mal')
  assert.equal(verificarCredenciales('', '', ENV), 'mal')
  assert.equal(igualSeguro('abc', 'abc'), true)
  assert.equal(igualSeguro('abc', 'abcd'), false, 'largos distintos no tiran (hash de los dos lados)')
})

test('token de admin: firma, vence a las 12 h y un JWT de usuario no sirve', async () => {
  const secreto = 'secreto-de-prueba-1234567890'
  const t = await firmarTokenAdmin(secreto)
  assert.equal(await verificarTokenAdmin(t, secreto), true)
  assert.equal(await verificarTokenAdmin(t, 'otro-secreto-xxxxxxxxxxxx'), false)
  assert.equal(await verificarTokenAdmin('', secreto), false)
  assert.equal(await verificarTokenAdmin('basura.basura.basura', secreto), false)
  // vencido: firmado hace 12 h + 1 s
  const viejo = await firmarTokenAdmin(secreto, Date.now() - (DURACION_ADMIN_S + 1) * 1000)
  assert.equal(await verificarTokenAdmin(viejo, secreto), false)
  // la cookie de sesión de un usuario (sub = userId, sin audiencia de admin) no abre /admin
  const deUsuario = await new SignJWT({ sub: 'cmuser123' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(secreto))
  assert.equal(await verificarTokenAdmin(deUsuario, secreto), false)
  const subAdminSinAudiencia = await new SignJWT({ sub: 'admin' }).setProtectedHeader({ alg: 'HS256' }).setIssuedAt().setExpirationTime('1h').sign(new TextEncoder().encode(secreto))
  assert.equal(await verificarTokenAdmin(subAdminSinAudiencia, secreto), false)
})

test('limitador: 5 fallos por IP en 15 min bloquean; otra IP no; vence la ventana', () => {
  const l = crearLimitadorFallos(5, 15 * 60_000)
  const t = 1_000_000
  for (let i = 0; i < 4; i++) l.fallo('1.1.1.1', t)
  assert.equal(l.bloqueado('1.1.1.1', t), false)
  l.fallo('1.1.1.1', t)
  assert.equal(l.bloqueado('1.1.1.1', t + 1000), true)
  assert.equal(l.bloqueado('2.2.2.2', t + 1000), false)
  assert.equal(l.bloqueado('1.1.1.1', t + 15 * 60_000 + 1), false)
})

test('rutas viejas del panel → área /admin', () => {
  assert.equal(rutaAdminNueva('/panel/admin/sugerencias', 'id=abc'), '/admin/sugerencias?id=abc')
  assert.equal(rutaAdminNueva('/panel/admin/metricas'), '/admin/metricas')
  assert.equal(rutaAdminNueva('/panel/admin'), '/admin/metricas')
  assert.equal(rutaAdminNueva('/panel/cliente'), null)
  assert.equal(rutaAdminNueva('/panel/admin/otra'), null)
})
