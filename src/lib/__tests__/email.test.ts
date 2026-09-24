// Tests SIN RED de src/lib/email.ts y src/lib/password-reset.ts: `fetch` es un doble.
// Correr con:
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/email.test.ts
import { test, beforeEach, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { sendEmail, renderEmail, linkAbsoluto } from '../email'
import { nuevoTokenReset, hashTokenReset, estadoToken } from '../password-reset'
import { problemaDeContrasena } from '../password-policy'

type Llamada = { url: string; init: RequestInit }
const fetchReal = globalThis.fetch
const envReal = { ...process.env }
let llamadas: Llamada[] = []

function dobleFetch(resp: () => Response | Promise<Response>) {
  llamadas = []
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    llamadas.push({ url: String(url), init: init || {} })
    return resp()
  }) as typeof fetch
}

beforeEach(() => {
  process.env.APP_URL = 'https://www.somoshomia.com'
  process.env.EMAIL_FROM = 'HomIA <avisos@somoshomia.com>'
  delete process.env.RESEND_API_URL
})
afterEach(() => {
  globalThis.fetch = fetchReal
  process.env = { ...envReal }
})

const contenido = {
  to: 'proveedor@ejemplo.com',
  subject: 'Nueva compra: stock reservado',
  heading: 'Nueva compra: stock reservado',
  paragraphs: ['Hola, Juan:', 'Ana compró Caño PVC <110mm> (5 × $1.600). Preparalo.'],
  button: { label: 'Ver la venta', url: 'https://www.somoshomia.com/#/panel/proveedor/cobros?tab=ventas' },
  unsubscribeFooter: true,
}

test('sin RESEND_API_KEY: no llama a la red y devuelve no_configurado (no tira)', async () => {
  delete process.env.RESEND_API_KEY
  dobleFetch(() => new Response('{}', { status: 200 }))
  const r = await sendEmail(contenido)
  assert.deepEqual(r, { ok: false, reason: 'no_configurado' })
  assert.equal(llamadas.length, 0)
})

test('con clave: POST a Resend con Bearer, from, to, subject, html y texto plano', async () => {
  process.env.RESEND_API_KEY = 're_prueba_123'
  dobleFetch(() => new Response(JSON.stringify({ id: 'email_abc' }), { status: 200, headers: { 'content-type': 'application/json' } }))
  const r = await sendEmail(contenido)
  assert.deepEqual(r, { ok: true, id: 'email_abc' })
  assert.equal(llamadas.length, 1)
  const { url, init } = llamadas[0]
  assert.equal(url, 'https://api.resend.com/emails')
  assert.equal(init.method, 'POST')
  const h = init.headers as Record<string, string>
  assert.equal(h.Authorization, 'Bearer re_prueba_123')
  assert.equal(h['Content-Type'], 'application/json')
  assert.ok(init.signal, 'lleva timeout (AbortSignal)')
  const body = JSON.parse(String(init.body))
  assert.equal(body.from, 'HomIA <avisos@somoshomia.com>')
  assert.deepEqual(body.to, ['proveedor@ejemplo.com'])
  assert.equal(body.subject, 'Nueva compra: stock reservado')
  // HTML: marca, colores, botón con el link, texto escapado y pie de avisos
  assert.match(body.html, /Hom<span style="color:#FF5A1F;">IA<\/span>/)
  assert.match(body.html, /#0A2540/)
  assert.match(body.html, /href="https:\/\/www\.somoshomia\.com\/#\/panel\/proveedor\/cobros\?tab=ventas"/)
  assert.match(body.html, /Caño PVC &lt;110mm&gt;/)
  assert.doesNotMatch(body.html, /<110mm>/)
  assert.match(body.html, /Podés dejar de recibir avisos por mail desde tu perfil/)
  // texto plano alternativo
  assert.match(body.text, /Ver la venta: https:\/\/www\.somoshomia\.com\/#\/panel\/proveedor\/cobros\?tab=ventas/)
  assert.match(body.text, /Caño PVC <110mm>/)
  assert.match(body.text, /Podés dejar de recibir avisos por mail desde tu perfil/)
})

test('mail de cuenta (recuperar contraseña): sin el pie de "dejar de recibir avisos"', () => {
  const { html, text } = renderEmail({ ...contenido, unsubscribeFooter: false, note: 'El link vence en 1 hora' })
  assert.doesNotMatch(html, /dejar de recibir avisos/)
  assert.doesNotMatch(text, /dejar de recibir avisos/)
  assert.match(text, /El link vence en 1 hora/)
})

test('Resend responde error → { ok:false, reason:"error" } sin tirar', async () => {
  process.env.RESEND_API_KEY = 're_prueba_123'
  dobleFetch(() => new Response('{"message":"domain not verified"}', { status: 403 }))
  const r = await sendEmail(contenido)
  assert.equal(r.ok, false)
  assert.equal(!r.ok && r.reason, 'error')
})

test('falla de red → { ok:false, reason:"error" } sin tirar', async () => {
  process.env.RESEND_API_KEY = 're_prueba_123'
  dobleFetch(() => { throw new TypeError('fetch failed') })
  const r = await sendEmail(contenido)
  assert.equal(r.ok, false)
})

test('destinatario inválido → no llama a la red', async () => {
  process.env.RESEND_API_KEY = 're_prueba_123'
  dobleFetch(() => new Response('{}', { status: 200 }))
  const r = await sendEmail({ ...contenido, to: 'no-es-mail' })
  assert.equal(!r.ok && r.reason, 'destinatario_invalido')
  assert.equal(llamadas.length, 0)
})

test('cuentas de prueba (@homia.test) nunca van a Resend real; sí al doble local', async () => {
  process.env.RESEND_API_KEY = 're_prueba_123'
  dobleFetch(() => new Response('{"id":"x"}', { status: 200 }))
  const r = await sendEmail({ ...contenido, to: 'cliente@homia.test' })
  assert.equal(!r.ok && r.reason, 'destinatario_invalido')
  assert.equal(llamadas.length, 0)
  process.env.RESEND_API_URL = 'http://127.0.0.1:3199/emails'
  const r2 = await sendEmail({ ...contenido, to: 'cliente@homia.test' })
  assert.equal(r2.ok, true)
  assert.equal(llamadas[0].url, 'http://127.0.0.1:3199/emails')
})

test('linkAbsoluto convierte los links de la SPA a la URL pública', () => {
  assert.equal(linkAbsoluto('#/panel/cliente/facturas'), 'https://www.somoshomia.com/#/panel/cliente/facturas')
  assert.equal(linkAbsoluto('/panel/x'), 'https://www.somoshomia.com/#/panel/x')
  assert.equal(linkAbsoluto(null), 'https://www.somoshomia.com/#/notificaciones')
})

test('token de recuperación: 32 bytes base64url, hash sha256 hex, estados', () => {
  const { token, tokenHash } = nuevoTokenReset()
  assert.match(token, /^[A-Za-z0-9_-]{43}$/)
  assert.match(tokenHash, /^[0-9a-f]{64}$/)
  assert.equal(hashTokenReset(token), tokenHash)
  assert.notEqual(nuevoTokenReset().token, token)
  const futuro = new Date(Date.now() + 60_000)
  assert.equal(estadoToken(null), 'invalido')
  assert.equal(estadoToken({ usedAt: null, expiresAt: futuro }), 'valido')
  assert.equal(estadoToken({ usedAt: new Date(), expiresAt: futuro }), 'usado')
  assert.equal(estadoToken({ usedAt: null, expiresAt: new Date(Date.now() - 1) }), 'vencido')
})

test('política de contraseña igual al registro', () => {
  assert.equal(problemaDeContrasena('Nueva2026x'), null)
  assert.match(problemaDeContrasena('ab12') || '', /al menos 8/)
  assert.match(problemaDeContrasena('soloLetrasLargas') || '', /letras y números/)
  assert.match(problemaDeContrasena('12345678') || '', /letras y números/)
})
