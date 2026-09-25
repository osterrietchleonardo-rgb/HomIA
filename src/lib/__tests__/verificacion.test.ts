// Tests de los códigos de verificación (D26): vencimiento, intentos, reenvío, hash y el proveedor
// enchufable de SMS/WhatsApp (sin red: `fetch` es un doble).
// Correr con:
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/verificacion.test.ts
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import {
  nuevoCodigo, hashCodigo, hashesIguales, estadoCodigo, permisoEnvio, MENSAJE_CODIGO, TOPE_IP_HORA,
} from '../verificacion'
import { CODIGO } from '../registro'
import { proveedorCelular } from '../celular-proveedor'

const envReal = { ...process.env }
const fetchReal = globalThis.fetch
afterEach(() => {
  process.env = { ...envReal }
  globalThis.fetch = fetchReal
})

const T0 = new Date('2026-09-25T12:00:00Z')
const seg = (s: number) => new Date(T0.getTime() + s * 1000)

test('código: 6 cifras, aleatorio, con ceros a la izquierda', () => {
  const vistos = new Set<string>()
  for (let i = 0; i < 500; i++) {
    const c = nuevoCodigo()
    assert.match(c, /^\d{6}$/)
    vistos.add(c)
  }
  assert.ok(vistos.size > 490, 'no se repiten')
})

test('hash: HMAC con clave, distinto por canal/propósito/destino, nunca el código', () => {
  const h = hashCodigo('clave', 'email', 'registro', 'a@gmail.com', '123456')
  assert.match(h, /^[0-9a-f]{64}$/)
  assert.ok(!h.includes('123456'))
  assert.notEqual(h, hashCodigo('otra-clave', 'email', 'registro', 'a@gmail.com', '123456'))
  assert.notEqual(h, hashCodigo('clave', 'email', 'cuenta', 'a@gmail.com', '123456'))
  assert.notEqual(h, hashCodigo('clave', 'email', 'registro', 'b@gmail.com', '123456'))
  assert.notEqual(h, hashCodigo('clave', 'celular', 'registro', 'a@gmail.com', '123456'))
  assert.equal(hashesIguales(h, hashCodigo('clave', 'email', 'registro', 'a@gmail.com', '123456')), true)
  assert.equal(hashesIguales(h, hashCodigo('clave', 'email', 'registro', 'a@gmail.com', '123457')), false)
  assert.equal(hashesIguales(h, ''), false)
  assert.equal(hashesIguales('', ''), false)
})

test('estado: vigente, vencido a los 10 min, agotado a los 5 intentos, usado, sin código', () => {
  const fila = { codeHash: 'x', attempts: 0, usedAt: null as Date | null, createdAt: T0, expiresAt: seg(CODIGO.venceMin * 60) }
  assert.equal(CODIGO.venceMin, 10)
  assert.equal(CODIGO.maxIntentos, 5)
  assert.equal(estadoCodigo(null, T0), 'sin_codigo')
  assert.equal(estadoCodigo(fila, seg(599)), 'vigente')
  assert.equal(estadoCodigo(fila, seg(600)), 'vencido')
  assert.equal(estadoCodigo({ ...fila, attempts: 4 }, seg(10)), 'vigente')
  assert.equal(estadoCodigo({ ...fila, attempts: 5 }, seg(10)), 'agotado')
  assert.equal(estadoCodigo({ ...fila, usedAt: seg(5) }, seg(10)), 'usado')
  // el usado gana al vencido (mensaje correcto: "ya se usó")
  assert.equal(estadoCodigo({ ...fila, usedAt: seg(5) }, seg(9999)), 'usado')
  for (const k of ['sin_codigo', 'usado', 'vencido', 'agotado', 'incorrecto'] as const) assert.ok(MENSAJE_CODIGO[k].length > 10)
})

test('reenvío: espera de 60 s con cuenta regresiva', () => {
  assert.deepEqual(permisoEnvio({ ultimo: null, enviosDestinoHora: 0, enviosIpHora: 0 }, T0), { ok: true })
  const r = permisoEnvio({ ultimo: T0, enviosDestinoHora: 1, enviosIpHora: 1 }, seg(15))
  assert.equal(r.ok, false)
  assert.ok(!r.ok && r.motivo === 'espera' && r.esperarSeg === 45 && /45 segundos/.test(r.mensaje))
  assert.deepEqual(permisoEnvio({ ultimo: T0, enviosDestinoHora: 1, enviosIpHora: 1 }, seg(60)), { ok: true })
})

test('reenvío: tope de 5 códigos por hora por destino', () => {
  const r = permisoEnvio({ ultimo: seg(-120), enviosDestinoHora: 5, enviosIpHora: 5, primeroDeLaHora: seg(-50 * 60) }, T0)
  assert.ok(!r.ok && r.motivo === 'tope_destino' && /10 minutos/.test(r.mensaje), JSON.stringify(r))
  assert.deepEqual(permisoEnvio({ ultimo: seg(-120), enviosDestinoHora: 4, enviosIpHora: 4 }, T0), { ok: true })
})

test('reenvío: tope por conexión', () => {
  const r = permisoEnvio({ ultimo: null, enviosDestinoHora: 0, enviosIpHora: TOPE_IP_HORA }, T0)
  assert.ok(!r.ok && r.motivo === 'tope_ip')
})

test('celular: sin proveedor configurado no hay envío (fallback honesto)', () => {
  delete process.env.PHONE_VERIFY_PROVIDER
  assert.equal(proveedorCelular(), null)
  process.env.PHONE_VERIFY_PROVIDER = 'twilio' // elegido pero sin credenciales
  delete process.env.TWILIO_ACCOUNT_SID
  assert.equal(proveedorCelular(), null)
  process.env.PHONE_VERIFY_PROVIDER = 'palomas'
  assert.equal(proveedorCelular(), null)
})

test('celular: Twilio arma el SMS con el código', async () => {
  process.env.PHONE_VERIFY_PROVIDER = 'twilio'
  process.env.TWILIO_ACCOUNT_SID = 'AC123'
  process.env.TWILIO_AUTH_TOKEN = 'tok'
  process.env.TWILIO_SMS_FROM = 'MG999'
  const llamadas: { url: string; init: RequestInit }[] = []
  globalThis.fetch = (async (url: string, init: RequestInit) => {
    llamadas.push({ url: String(url), init })
    return new Response('{"sid":"SM1"}', { status: 201 })
  }) as typeof fetch
  const p = proveedorCelular()
  assert.equal(p?.canal, 'sms')
  const r = await p!.enviarCodigo('+5491123456789', '042137')
  assert.deepEqual(r, { ok: true })
  assert.equal(llamadas[0].url, 'https://api.twilio.com/2010-04-01/Accounts/AC123/Messages.json')
  const body = new URLSearchParams(String(llamadas[0].init.body))
  assert.equal(body.get('To'), '+5491123456789')
  assert.equal(body.get('MessagingServiceSid'), 'MG999')
  assert.match(body.get('Body') || '', /042137/)
  assert.match(String((llamadas[0].init.headers as Record<string, string>).Authorization), /^Basic /)
})

test('celular: WhatsApp Cloud API con plantilla de autenticación; error → resultado, no excepción', async () => {
  process.env.PHONE_VERIFY_PROVIDER = 'whatsapp'
  process.env.WHATSAPP_TOKEN = 'EAAG'
  process.env.WHATSAPP_PHONE_NUMBER_ID = '1055'
  process.env.WHATSAPP_OTP_TEMPLATE = 'codigo_homia'
  let cuerpo: Record<string, unknown> = {}
  globalThis.fetch = (async (_url: string, init: RequestInit) => {
    cuerpo = JSON.parse(String(init.body))
    return new Response('{"error":{"message":"template"}}', { status: 400 })
  }) as typeof fetch
  const p = proveedorCelular()
  assert.equal(p?.canal, 'whatsapp')
  const r = await p!.enviarCodigo('+5491123456789', '042137')
  assert.equal(r.ok, false)
  assert.equal(cuerpo.to, '5491123456789')
  assert.equal((cuerpo.template as { name: string }).name, 'codigo_homia')
  assert.match(JSON.stringify(cuerpo), /042137/)
})

test('mail del código: el código se ve grande en el HTML y en el texto, escapado', async () => {
  const { renderEmail } = await import('../email')
  const { html, text } = renderEmail({
    to: 'a@gmail.com', subject: '042137 es tu código de HomIA', heading: 'Confirmá tu email',
    paragraphs: ['Hola:'], codigo: '042137', note: 'Vence en 10 minutos.', unsubscribeFooter: false,
  })
  assert.match(html, /font-size:32px[^>]*>042137</)
  assert.match(text, /Código: 042137/)
  const x = renderEmail({ to: 'a@gmail.com', subject: 's', heading: 'h', paragraphs: ['p'], codigo: '<b>' })
  assert.ok(!x.html.includes('<b>') && x.html.includes('&lt;b&gt;'))
})
