// Tests de las reglas puras de Sugerencias (src/lib/feedback.ts, D25). Sin red ni base.
// Correr con:
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/feedback.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  esFotoPropia, crearFeedbackSchema, actualizarFeedbackSchema,
  inicioDelDiaAR, superaTope, areasDelRol, TOPE_DIARIO, MAX_FOTOS, casillaEquipo, linkMisSugerencias,
} from '../feedback'

const UID = 'cmabc123xyz'
const foto = (n: number, uid = UID) => `feedback-evidencias/${uid}/sugerencias/a1b2c3d4e5f6a7b${n}.jpg`
const base = { role: 'cliente', type: 'sugerencia', area: 'directorio', title: 'Filtro por barrio', description: 'Estaría bueno poder filtrar por barrio.' }

// (D29) el test de esAdmin/ADMIN_EMAILS se reemplazó por src/lib/__tests__/admin.test.ts:
// el administrador entra a /admin con ADMIN_EMAIL + ADMIN_PASSWORD, sin cuenta de usuario.

test('esFotoPropia: solo paths privados del propio usuario', () => {
  assert.equal(esFotoPropia(foto(1), UID), true)
  assert.equal(esFotoPropia(foto(1, 'otroUsuario9'), UID), false, 'foto de otro usuario (IDOR)')
  assert.equal(esFotoPropia(`dni-docs/${UID}/dni/abc.jpg`, UID), false, 'otro bucket')
  assert.equal(esFotoPropia(`https://x.supabase.co/storage/v1/object/public/homia-uploads/${UID}/sugerencias/a.jpg`, UID), false, 'URL pública')
  assert.equal(esFotoPropia(`feedback-evidencias/${UID}/sugerencias/../../x.jpg`, UID), false, 'path traversal')
  assert.equal(esFotoPropia(`feedback-evidencias/${UID}/sugerencias/a.gif`, UID), false, 'extensión no permitida')
  assert.equal(esFotoPropia(foto(1), ''), false)
})

test('crearFeedbackSchema: acepta un envío válido y normaliza', () => {
  const r = crearFeedbackSchema(UID).safeParse({ ...base, title: '  Filtro por barrio  ', photos: [foto(1), foto(2)] })
  assert.equal(r.success, true)
  if (r.success) {
    assert.equal(r.data.title, 'Filtro por barrio')
    assert.equal(r.data.contactOk, true, 'por defecto se puede contactar')
    assert.deepEqual(r.data.photos, [foto(1), foto(2)])
  }
  const sinFotos = crearFeedbackSchema(UID).safeParse(base)
  assert.equal(sinFotos.success, true)
  if (sinFotos.success) assert.deepEqual(sinFotos.data.photos, [])
})

test('crearFeedbackSchema: rechaza lo inválido con mensajes en castellano', () => {
  const s = crearFeedbackSchema(UID)
  const msg = (x: unknown) => { const r = s.safeParse(x); return r.success ? '' : r.error.issues[0].message }
  assert.match(msg({ ...base, title: 'ab' }), /al menos 4/)
  assert.match(msg({ ...base, description: 'corto' }), /al menos 10/)
  assert.match(msg({ ...base, type: 'spam' }), /tipo/)
  assert.match(msg({ ...base, area: 'stock' }), /no corresponde/, 'Stock es solo del proveedor')
  assert.match(msg({ ...base, photos: [1, 2, 3, 4, 5].map((n) => foto(n)) }), new RegExp(`hasta ${MAX_FOTOS}`))
  assert.match(msg({ ...base, photos: [foto(1, 'otroUsuario9')] }), /desde esta cuenta/)
  assert.match(msg({ ...base, photos: [foto(1), foto(1)] }), /repetida/)
  assert.equal(s.safeParse({ ...base, role: 'admin' }).success, false)
  assert.equal(s.safeParse({ ...base, context: { pantalla: '#/x', extra: 'no' } }).success, false, 'contexto con campos de más')
})

test('áreas por rol', () => {
  const ids = (r: string) => areasDelRol(r).map((a) => a.id)
  assert.ok(ids('proveedor').includes('stock') && ids('proveedor').includes('plan'))
  assert.ok(!ids('cliente').includes('stock'))
  assert.ok(ids('cliente').includes('contratar') && ids('profesional').includes('calendario'))
  for (const r of ['cliente', 'profesional', 'proveedor']) assert.ok(ids(r).includes('otra'))
})

test('actualizarFeedbackSchema: estado válido y/o respuesta', () => {
  assert.equal(actualizarFeedbackSchema.safeParse({ status: 'planificada' }).success, true)
  assert.equal(actualizarFeedbackSchema.safeParse({ adminResponse: '  Gracias  ' }).success, true)
  assert.equal(actualizarFeedbackSchema.safeParse({ status: 'borrada' }).success, false)
  assert.equal(actualizarFeedbackSchema.safeParse({}).success, false)
  assert.equal(actualizarFeedbackSchema.safeParse({ adminResponse: 'x'.repeat(4001) }).success, false)
})

test('tope diario: inicio del día en hora argentina', () => {
  // 25/09 01:00 AR = 25/09 04:00 UTC → el día empieza 25/09 03:00 UTC
  assert.equal(inicioDelDiaAR(new Date('2026-09-25T04:00:00Z')).toISOString(), '2026-09-25T03:00:00.000Z')
  // 25/09 23:30 AR = 26/09 02:30 UTC → sigue siendo el 25 en Argentina
  assert.equal(inicioDelDiaAR(new Date('2026-09-26T02:30:00Z')).toISOString(), '2026-09-25T03:00:00.000Z')
  assert.equal(TOPE_DIARIO, 10)
  assert.equal(superaTope(9), false)
  assert.equal(superaTope(10), true)
  assert.equal(superaTope(11), true)
})

test('casilla del equipo y links', () => {
  const antes = process.env.FEEDBACK_EMAIL
  delete process.env.FEEDBACK_EMAIL
  assert.equal(casillaEquipo('business@vakdor.com'), 'business@vakdor.com')
  process.env.FEEDBACK_EMAIL = 'equipo@homia.test'
  assert.equal(casillaEquipo('business@vakdor.com'), 'equipo@homia.test')
  if (antes === undefined) delete process.env.FEEDBACK_EMAIL
  else process.env.FEEDBACK_EMAIL = antes
  assert.equal(linkMisSugerencias('proveedor'), '/panel/proveedor/sugerencias')
  assert.equal(linkMisSugerencias('hacker'), '/panel/cliente/sugerencias')
})
