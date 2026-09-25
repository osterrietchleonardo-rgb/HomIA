#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// HomIA — Suite E2E integral de API (los 3 roles y los flujos entre roles).
//
// Uso (desde la raíz del repo, con el server levantado):
//   node scripts/e2e-integral.mjs                      → corre todo contra http://localhost:3031 y purga
//   E2E_BASE=http://localhost:3000 node scripts/e2e-integral.mjs
//   node scripts/e2e-integral.mjs --base http://localhost:3031 --no-purge   → deja los datos (para e2e-visual)
//   node scripts/e2e-integral.mjs --purge-only        → borra TODO lo creado por la suite (barrido por email)
//   node scripts/e2e-integral.mjs --only A,B,D        → solo esos flujos (A siempre corre: crea los usuarios)
//   node scripts/e2e-integral.mjs --mail-sink 3199    → levanta un doble de Resend en 3199 y verifica los mails
//   node scripts/e2e-integral.mjs --only U --mp-double 3172 → doble de la API de MP (server con MP_API_BASE_PRUEBAS=http://localhost:3172)
//     (el server tiene que correr con RESEND_API_KEY=re_test y RESEND_API_URL=http://127.0.0.1:3199/emails)
//     D26: toda alta necesita el código de 6 números del mail; con el doble se lee del mail, sin él
//     se arma por la base (helper `registrar`) y los checks de códigos que leen el mail no corren.
//
// La sección T (métricas) necesita el server con ANALYTICS_EN_DESARROLLO=1: fuera de producción no
// se registra uso (analytics/filtro.ts). Las cuentas demo ya no existen (borradas el 25/09/2026).
//
// El server tiene que correr con HIDE_DEMO_USERS distinto de 1 (los usuarios de la suite son
// @homia.test y con el flag prendido quedan ocultos de lo público — D20).
//
// Lee .env (DATABASE_URL, CRON_SECRET, SUPABASE_PROJECT_URL, SUPABASE_SERVICE_ROLE)
// para asserts de estado en DB, forzar vencimientos y purgar Storage.
//
// Crea sus propios usuarios `e2e-q-<rol>-<timestamp>@homia.test`, todo lo que crea
// lleva la marca [E2E], y al final purga TODO (usuarios, perfiles, stock, trabajos,
// ofertas, proyectos, materiales, facturas, pagos, cobros, compras, pedidos, carritos,
// eventos de la línea de tiempo, devoluciones, reseñas, obras, conversaciones, mensajes,
// notificaciones, CRM, favoritos, eventos de búsqueda, elementos de catálogo creados con
// IA y archivos de Storage).
// Nunca toca datos que no creó.
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config'
import pkg from '@prisma/client'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { writeFileSync, mkdirSync, readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'

const { PrismaClient } = pkg
const db = new PrismaClient()

// ── argumentos ──
const argv = process.argv.slice(2)
const argVal = (flag) => {
  const i = argv.indexOf(flag)
  return i >= 0 ? argv[i + 1] : undefined
}
const BASE = (argVal('--base') || process.env.E2E_BASE || 'http://localhost:3031').replace(/\/+$/, '')
const NO_PURGE = argv.includes('--no-purge')
const PURGE_ONLY = argv.includes('--purge-only')
const ONLY = (argVal('--only') || '').split(',').map((s) => s.trim().toUpperCase()).filter(Boolean)
const TS = Date.now()
const MARK = '[E2E]'
// prefijo de los usuarios descartables (E2E_EMAIL_PREFIX=e2e-s- → purga los del recorrido visual)
const EMAIL_PREFIX = process.env.E2E_EMAIL_PREFIX || 'e2e-q-'
const EMAIL_DOMAIN = '@homia.test'
const PASSWORD = 'E2eTest2026'
const CABA = { lat: -34.6037, lng: -58.3816 }
// IP ficticia por corrida: el rate-limit en memoria del registro es por IP (8/h)
const RUN_IP = `10.${(TS >> 16) & 255}.${(TS >> 8) & 255}.${TS & 255}`
const OUT_DIR = process.env.E2E_OUT || path.join(os.tmpdir(), 'homia-e2e')
mkdirSync(OUT_DIR, { recursive: true })
// versión vigente de los textos legales (la que el registro tiene que guardar, D19)
const LEGAL_VERSION = (readFileSync(path.join(process.cwd(), 'src/lib/legal-content.ts'), 'utf8').match(/LEGAL_VERSION\s*=\s*'([^']+)'/) || [])[1]
// cuentas E2E que la suite eliminó con "Eliminar mi cuenta" (quedan con email eliminado-<id>@homia.invalid):
// se anotan acá para que la purga las encuentre aunque ya no tengan el email de prueba
const DELETED_FILE = path.join(OUT_DIR, `deleted-users-${EMAIL_PREFIX.replace(/[^a-z0-9-]/gi, '')}.json`)
const readDeleted = () => { try { return existsSync(DELETED_FILE) ? JSON.parse(readFileSync(DELETED_FILE, 'utf8')) : [] } catch { return [] } }
const noteDeleted = (id) => { if (id) writeFileSync(DELETED_FILE, JSON.stringify([...new Set([...readDeleted(), id])])) }

// ─────────────────────────── reporte de checks ───────────────────────────
const FLOWS = {
  A: 'Auth y perfil', B: 'Proveedor: stock, catálogo IA, plan', C: 'Búsqueda y directorio', D: 'Trabajos y ofertas',
  E: 'Proyectos, materiales, facturas', F: 'Compra directa', G: 'Sobrantes', H: 'Reseñas', I: 'Mensajería',
  J: 'Notificaciones', K: 'Verificación DNI', L: 'Obras', M: 'CRM y favoritos', N: 'Seguridad transversal', O: 'IA',
  P: 'Carrito y pedidos multiproveedor', Q: 'Calendario y fechas del trabajo', R: 'Finanzas', S: 'Sugerencias',
  T: 'Métricas de uso y panel del admin', U: 'Ingresos de HomIA (suscripciones y cargo 1%)',
  V: 'Plan: cancelar, período pago, plan vencido (D33)',
}
const results = Object.fromEntries(Object.keys(FLOWS).map((k) => [k, { pass: 0, fail: 0, external: 0, items: [] }]))

/** Registra un check. `external` = archivo:línea de un bug en archivos de otro agente (no cuenta como falla propia). */
function check(flow, name, cond, detail = '', external = '') {
  const r = results[flow]
  if (cond) {
    r.pass++
  } else if (external) {
    r.external++
    r.items.push({ ok: false, external, name, detail })
    console.log(`  ⚠ [${flow}] ${name} — pendiente ajeno (${external}) ${detail}`)
    return false
  } else {
    r.fail++
    r.items.push({ ok: false, name, detail })
    console.log(`  ✗ [${flow}] ${name} — ${detail}`)
    return false
  }
  return true
}
const brief = (r) => `HTTP ${r.status} ${typeof r.data === 'string' ? r.data.slice(0, 160) : JSON.stringify(r.data)?.slice(0, 240)}`
const st = (flow, name, r, status, external = '') => check(flow, `${name} → ${status}`, r.status === status, brief(r), external)

// ─────────────────────────── cliente HTTP con cookies ───────────────────────────
class Actor {
  constructor(key, role) {
    this.key = key
    this.role = role
    this.cookie = ''
    this.email = `${EMAIL_PREFIX}${key}-${TS}${EMAIL_DOMAIN}`
    this.ip = RUN_IP
  }
}
const ANON = new Actor('anon', null)

async function http(actor, method, url, { json, form, headers = {}, raw = false } = {}) {
  const h = { ...headers }
  if (actor?.cookie) h.cookie = actor.cookie
  // D29: sesión de administración propia (cookie homia_admin), aparte de la de usuario
  if (actor?.adminCookie) h.cookie = [h.cookie, actor.adminCookie].filter(Boolean).join('; ')
  h['x-forwarded-for'] = actor?.ip || RUN_IP
  let body
  if (json !== undefined) {
    h['content-type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) body = form
  const res = await fetch(BASE + url, { method, headers: h, body, redirect: 'manual' })
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  for (const c of setCookies) {
    const ma = c.match(/^homia_admin=([^;]*)/)
    if (ma && actor && actor !== ANON) {
      actor.adminSetCookie = c
      actor.adminCookie = !ma[1] || /Max-Age=0/i.test(c) || /Expires=Thu, 01 Jan 1970/i.test(c) ? '' : `homia_admin=${ma[1]}`
    }
    const m = c.match(/^homy_session=([^;]*)/)
    if (m && actor && actor !== ANON) {
      const expired = !m[1] || /Max-Age=0/i.test(c) || /Expires=Thu, 01 Jan 1970/i.test(c)
      actor.cookie = expired ? '' : `homy_session=${m[1]}`
    }
  }
  const ct = res.headers.get('content-type') || ''
  let data = null
  let buf = null
  if (raw) buf = Buffer.from(await res.arrayBuffer())
  else if (ct.includes('json')) data = await res.json().catch(() => null)
  else data = await res.text().catch(() => '')
  return { status: res.status, data, buf, ct, headers: res.headers }
}
const get = (a, u, o) => http(a, 'GET', u, o)
const post = (a, u, json, o = {}) => http(a, 'POST', u, { ...o, json })
const patch = (a, u, json, o = {}) => http(a, 'PATCH', u, { ...o, json })
const put = (a, u, json, o = {}) => http(a, 'PUT', u, { ...o, json })
const del = (a, u, o) => http(a, 'DELETE', u, o)

async function jpeg(seed = 1) {
  return sharp({
    create: { width: 96, height: 72, channels: 3, background: { r: (seed * 53) % 255, g: (seed * 97) % 255, b: (seed * 29) % 255 } },
  }).jpeg({ quality: 80 }).toBuffer()
}
async function upload(actor, folder, seed = 1, { buffer, type = 'image/jpeg', name = 'e2e.jpg' } = {}) {
  const fd = new FormData()
  const b = buffer || (await jpeg(seed))
  fd.append('file', new Blob([b], { type }), name)
  fd.append('folder', folder)
  return http(actor, 'POST', '/api/uploads', { form: fd })
}

// ─────────────────────────── registro con email verificado (D26) ───────────────────────────
// Toda cuenta nueva necesita el código de 6 números que llega por mail. Con `--mail-sink` el
// código se lee del mail real (doble de Resend). Sin el doble, se usa la base: se reemplaza el
// hash del último código por el de uno conocido (misma clave que el server: AUTH_SECRET del .env)
// — solo para usuarios de prueba @homia.test; en producción no hay ningún atajo.
const { createHmac } = await import('node:crypto')
const CLAVE_CODIGOS = createHmac('sha256', process.env.AUTH_SECRET || 'homy-dev-secret-cambiar-en-produccion-9f2a').update('homia:codigos-verificacion').digest('hex')
const hashCodigoE2E = (canal, proposito, destino, codigo) => createHmac('sha256', CLAVE_CODIGOS).update(`${canal}:${proposito}:${destino}:${codigo}`, 'utf8').digest('hex')
const codigoDelAsunto = (m) => (m?.body?.subject || '').match(/^(\d{6}) es tu código de HomIA$/)?.[1] || null

/** Pide el código de registro para `email` y devuelve el código (del mail o puesto por la base). */
async function codigoRegistro(actor, email, { viaBase = false } = {}) {
  const desde = Date.now()
  if (MAIL_SINK_PORT && !viaBase) {
    const r = await post(actor, '/api/auth/verificacion/enviar', { canal: 'email', proposito: 'registro', destino: email })
    if (r.status !== 200) throw new Error(`no se pudo pedir el código para ${email}: ${brief(r)}`)
    const m = await waitMail(email.toLowerCase(), desde, { ms: 10_000 })
    const c = codigoDelAsunto(m)
    if (!c) throw new Error(`no llegó el mail con el código a ${email}`)
    return c
  }
  const codigo = '246810'
  await db.verificationCode.create({
    data: { channel: 'email', purpose: 'registro', target: email.toLowerCase(), codeHash: hashCodigoE2E('email', 'registro', email.toLowerCase(), codigo), expiresAt: new Date(Date.now() + 10 * 60_000), ip: actor.ip },
  })
  return codigo
}

/** Comprobante de email verificado (lo que pide el registro). */
async function comprobanteEmail(actor, email, opts = {}) {
  const codigo = await codigoRegistro(actor, email, opts)
  const r = await post(actor, '/api/auth/verificacion/comprobar', { canal: 'email', proposito: 'registro', destino: email, codigo })
  if (r.status !== 200 || !r.data?.comprobante) throw new Error(`código de ${email} rechazado: ${brief(r)}`)
  return r.data.comprobante
}

/**
 * Registra con el alta de D26 a partir de un payload "viejo" (displayName, city…): completa lo
 * obligatorio que falte (apellido, celular repetido, tipo de comercio, dirección) y verifica el
 * email. `displayName` "[E2E] Cliente Q" → nombre "[E2E]" + apellido "Cliente Q" (queda igual).
 */
async function registrar(actor, payload, opts = {}) {
  const { displayName = `${MARK} Usuario`, ...resto } = payload
  const [firstName, ...ap] = displayName.split(' ')
  const esProv = (payload.roles || []).includes('proveedor')
  const body = {
    phone: '11 2345-6789', phoneConfirm: '011 15 2345-6789', city: 'CABA',
    ...(esProv ? { kind: 'corralon', address: 'Av. Corrientes 1234' } : {}),
    ...resto,
    firstName, lastName: ap.join(' ') || 'E2E',
    emailToken: await comprobanteEmail(actor, payload.email, opts),
  }
  if (resto.phone && !resto.phoneConfirm) body.phoneConfirm = resto.phone
  return post(actor, '/api/auth/register', body)
}

// ─────────────────────────── estado compartido ───────────────────────────
const C = new Actor('cliente', 'cliente')
const P = new Actor('profesional', 'profesional')
const P2 = new Actor('profesional2', 'profesional')
const V = new Actor('proveedor', 'proveedor')
const S = {} // ids creados durante la corrida
const manifest = { ts: TS, base: BASE, catalogElementIds: [], identityDocIdsInsertedByDb: [] }

// Rutas SPA válidas (espejo de src/components/app/app-root.tsx → panelScreen)
const PANEL_PAGES = {
  cliente: ['', 'publicar', 'trabajos', 'materiales', 'pedidos', 'proyectos', 'facturas', 'perfil'],
  profesional: ['', 'bolsa', 'materiales', 'pedidos', 'proyectos', 'presupuestos', 'crm', 'obras', 'vinculaciones', 'devoluciones', 'cobros', 'calendario', 'finanzas', 'perfil'],
  proveedor: ['', 'stock', 'cobros', 'finanzas', 'plan', 'crm', 'vinculaciones', 'perfil'],
}
const PANEL_COMMON = ['directorio', 'mensajes', 'verificacion', 'ayuda', 'sugerencias']
const TOP_ROUTES = ['', 'buscar', 'ingresar', 'registrarse', 'notificaciones', 'directorio', 'materiales', 'mensajes', 'ayuda', 'carrito']
function linkProblem(link, roles) {
  if (!link) return null
  if (!link.startsWith('#/')) return `no empieza con "#/" (${link})`
  const p = link.slice(1).split('?')[0]
  const s = p.split('/').filter(Boolean)
  if (s.length === 0) return null
  if (['trabajo', 'profesional', 'proveedor'].includes(s[0])) return s[1] ? null : `falta id (${link})`
  if (s[0] === 'panel') {
    const role = s[1]
    if (!PANEL_PAGES[role]) return `rol inexistente (${link})`
    if (!roles.includes(role)) return `lleva al panel de "${role}" pero el destinatario no tiene ese rol (${link})`
    const page = s[2] || ''
    if (!PANEL_PAGES[role].includes(page) && !PANEL_COMMON.includes(page)) return `pantalla inexistente (${link})`
    return null
  }
  return TOP_ROUTES.includes(s[0]) ? null : `ruta inexistente (${link})`
}

// ═════════════════════════════ A. AUTH ═════════════════════════════
async function flowA() {
  const F = 'A'
  // acceptTerms: sin aceptar Términos y Privacidad no se crea la cuenta (D19)
  const base = { password: PASSWORD, lat: CABA.lat, lng: CABA.lng, city: 'CABA', howFoundUs: 'otro', acceptTerms: true }
  const payloads = {
    cliente: { ...base, email: C.email, displayName: `${MARK} Cliente Q`, roles: ['cliente'] },
    profesional: { ...base, email: P.email, displayName: `${MARK} Pro Q`, roles: ['profesional'], professions: ['pintura'], experienceYears: 5, bio: `${MARK} pintor de prueba` },
    profesional2: { ...base, email: P2.email, displayName: `${MARK} Pro2 Q`, roles: ['profesional'], professions: ['pintura'] },
    proveedor: { ...base, email: V.email, displayName: `${MARK} Proveedor Q`, roles: ['proveedor'], businessName: `${MARK} Corralón Q`, address: 'Av. Corrientes 1234' },
  }
  // D26: el cliente escribe su celular "a su manera" y el nombre en minúsculas: se guarda estandarizado
  payloads.cliente = { ...payloads.cliente, displayName: `${MARK} cliente q`, phone: '(011) 15-2345-6789', phoneConfirm: '+54 9 11 2345 6789' }
  await startMailSink()
  for (const [a, key] of [[C, 'cliente'], [P, 'profesional'], [P2, 'profesional2'], [V, 'proveedor']]) {
    const r = await registrar(a, payloads[key])
    st(F, `registro ${key}`, r, 201)
    check(F, `registro ${key} deja sesión (cookie)`, !!a.cookie)
    a.id = r.data?.user?.id
    check(F, `registro ${key} roles`, JSON.stringify(r.data?.user?.roles) === JSON.stringify(payloads[key].roles), brief(r))
    check(F, `registro ${key}: email verificado y celular estandarizado (Argentina por defecto, sin verificación por código)`, r.data?.user?.emailVerified === true && r.data?.user?.phoneCountry === 'AR' && !('phoneVerified' in (r.data?.user || {})), brief(r))
  }
  if (!C.id || !P.id || !P2.id || !V.id) throw new Error('No se pudieron crear los usuarios E2E')
  const uC0 = await db.user.findUnique({ where: { id: C.id }, select: { displayName: true, phone: true, phoneE164: true, emailVerifiedAt: true } })
  check(F, 'celular raro normalizado a E.164 (+549…) y mostrado "+54 9 11 2345-6789"', uC0?.phoneE164 === '+5491123456789' && uC0?.phone === '+54 9 11 2345-6789', JSON.stringify(uC0))
  check(F, 'nombre con mayúsculas iniciales ("cliente q" → "Cliente Q")', uC0?.displayName === `${MARK} Cliente Q`, uC0?.displayName)
  check(F, 'cuenta nueva: emailVerifiedAt guardado (la verificación de la cuenta es el email)', !!uC0?.emailVerifiedAt, JSON.stringify(uC0))
  const uV0 = await db.providerProfile.findUnique({ where: { userId: V.id }, select: { kind: true, address: true } })
  check(F, 'proveedor: tipo de comercio y dirección del local guardados', uV0?.kind === 'corralon' && uV0?.address === 'Av. Corrientes 1234', JSON.stringify(uV0))

  // validaciones (IPs distintas para no consumir el cupo del registro válido: 8 por IP por hora)
  const ipN = (n) => `10.${240 + n}.${(TS >> 8) & 255}.${TS & 255}`
  const bad = new Actor('bad', null)
  bad.ip = ipN(0)
  const bad2 = new Actor('bad2', null)
  bad2.ip = ipN(1)
  const bad3 = new Actor('bad3', null)
  bad3.ip = ipN(2)
  const mailNuevo = (k) => `${EMAIL_PREFIX}${k}-${TS}${EMAIL_DOMAIN}`
  const completo = { ...payloads.cliente, email: mailNuevo('bad1'), firstName: 'Ana', lastName: 'Prueba' }

  // obligatorios faltantes → 400 con TODO lo que falta
  const vacio = await post(bad, '/api/auth/register', { roles: ['proveedor'], acceptTerms: true })
  st(F, 'registro proveedor sin datos', vacio, 400)
  const faltanV = vacio.data?.faltan || []
  check(F, 'el 400 dice qué falta: nombre, apellido, email, celular, contraseña, ciudad, comercio, tipo y dirección', ['firstName', 'lastName', 'email', 'phone', 'password', 'city', 'businessName', 'kind', 'address'].every((k) => faltanV.includes(k)) && typeof vacio.data?.campos?.kind === 'string', brief(vacio))
  const sinRubro = await post(bad, '/api/auth/register', { ...completo, roles: ['profesional'] })
  check(F, 'profesional sin rubro → 400 con "professions"', sinRubro.status === 400 && sinRubro.data?.faltan?.includes('professions'), brief(sinRubro))
  st(F, 'registro con contraseña sin números', await post(bad, '/api/auth/register', { ...completo, password: 'soloLetrasLargas' }), 400)
  st(F, 'registro con contraseña corta', await post(bad, '/api/auth/register', { ...completo, password: 'ab12' }), 400)
  const emailMalo = await post(bad, '/api/auth/register', { ...completo, email: 'no-es-email' })
  check(F, 'registro con email inválido → 400 en "email"', emailMalo.status === 400 && !!emailMalo.data?.campos?.email, brief(emailMalo))
  st(F, 'registro proveedor sin nombre de negocio', await post(bad, '/api/auth/register', { ...payloads.proveedor, firstName: 'Ana', lastName: 'Prueba', email: mailNuevo('bad3'), businessName: '' }), 400)
  const celMalo = await post(bad, '/api/auth/register', { ...completo, phone: '15 2345-6789', phoneConfirm: '15 2345-6789' })
  check(F, 'celular sin código de área → 400 en "phone" con mensaje claro', celMalo.status === 400 && /código de área/.test(celMalo.data?.campos?.phone || ''), brief(celMalo))
  const celDistinto = await post(bad2, '/api/auth/register', { ...completo, phone: '11 2345-6789', phoneConfirm: '11 2345-6788' })
  check(F, 'celular repetido distinto → 400 en "phoneConfirm"', celDistinto.status === 400 && !!celDistinto.data?.campos?.phoneConfirm, brief(celDistinto))
  // 25/09/2026 (Leonardo): celular de cualquier país con `phoneCountry`; se estandariza, no se verifica
  const paisMalo = await post(bad2, '/api/auth/register', { ...completo, phoneCountry: 'XX', phone: '099 123 456', phoneConfirm: '099 123 456' })
  check(F, 'país del celular inválido (XX) → 400', paisMalo.status === 400 && /País del celular inválido/.test(paisMalo.data?.error || ''), brief(paisMalo))
  const paisMin = await post(bad2, '/api/auth/register', { ...completo, phoneCountry: 'uy', phone: '099 123 456', phoneConfirm: '099 123 456' })
  check(F, 'país del celular en minúsculas → 400 (ISO-2 en mayúsculas)', paisMin.status === 400 && /País del celular inválido/.test(paisMin.data?.error || ''), brief(paisMin))
  const uyMalo = await post(bad3, '/api/auth/register', { ...completo, phoneCountry: 'UY', phone: '99 123', phoneConfirm: '99 123' })
  check(F, 'número inválido para el país → 400 en "phone" con mensaje claro', uyMalo.status === 400 && /^Número inválido para Uruguay: revisá la característica y la cantidad de números$/.test(uyMalo.data?.campos?.phone || ''), brief(uyMalo))
  const esMalo = await post(bad3, '/api/auth/register', { ...completo, phoneCountry: 'ES', phone: '11 2345-6789', phoneConfirm: '11 2345-6789' })
  check(F, 'celular argentino con país España → 400 "inválido para España"', esMalo.status === 400 && /España/.test(esMalo.data?.campos?.phone || ''), brief(esMalo))
  const uyBien = await post(bad3, '/api/auth/register', { ...completo, phoneCountry: 'UY', phone: '099 123 456', phoneConfirm: '+598 99 123 456' })
  check(F, 'Uruguay escrito como allá y repetido con +598: el celular pasa (solo falta el código del mail)', uyBien.status === 400 && !uyBien.data?.campos?.phone && !uyBien.data?.campos?.phoneConfirm && uyBien.data?.needsEmailCode === true, brief(uyBien))
  const intl = await post(bad3, '/api/auth/register', { ...completo, phoneCountry: 'AR', phone: '+34 612 34 56 78', phoneConfirm: '+34612345678' })
  check(F, 'con + adelante manda el código de país escrito, aunque el país elegido sea otro', intl.status === 400 && !intl.data?.campos?.phone && !intl.data?.campos?.phoneConfirm, brief(intl))
  // alta real con celular de Uruguay (cuenta descartable, se purga al final)
  const UY = new Actor('uy', 'cliente')
  UY.ip = ipN(5)
  const eUy = mailNuevo('uy')
  const altaUy = await post(UY, '/api/auth/register', { ...completo, email: eUy, emailToken: await comprobanteEmail(UY, eUy), phoneCountry: 'UY', phone: '099 123 456', phoneConfirm: '+598 99 123 456' })
  st(F, 'alta con celular de Uruguay', altaUy, 201)
  const uUy = await db.user.findUnique({ where: { email: eUy }, select: { phone: true, phoneE164: true, phoneVerifiedAt: true } })
  check(F, 'Uruguay guardado estandarizado (+59899123456 / "+598 99 123 456"), sin marca de verificación', uUy?.phoneE164 === '+59899123456' && uUy?.phone === '+598 99 123 456' && uUy?.phoneVerifiedAt === null && altaUy.data?.user?.phoneCountry === 'UY', JSON.stringify(uUy))
  // Mi perfil: EE.UU. y España con `phoneCountry`; país inválido y número inválido → 400
  st(F, 'PUT perfil con país del celular inválido → 400', await put(UY, '/api/profiles/me', { phone: '202 555 0143', phoneCountry: 'ZZ' }), 400)
  const usMalo = await put(UY, '/api/profiles/me', { phone: '202 555', phoneCountry: 'US' })
  check(F, 'PUT perfil con número inválido para EE.UU. → 400 con el nombre del país', usMalo.status === 400 && /Número inválido para Estados Unidos/.test(usMalo.data?.error || ''), brief(usMalo))
  st(F, 'PUT perfil con celular de EE.UU.', await put(UY, '/api/profiles/me', { phone: '(202) 555-0143', phoneCountry: 'US' }), 200)
  const uUs = await db.user.findUnique({ where: { email: eUy }, select: { phone: true, phoneE164: true } })
  check(F, 'EE.UU. guardado estandarizado (+12025550143 / "+1 202 555 0143")', uUs?.phoneE164 === '+12025550143' && uUs?.phone === '+1 202 555 0143', JSON.stringify(uUs))
  st(F, 'PUT perfil con celular de España', await put(UY, '/api/profiles/me', { phone: '612 34 56 78', phoneCountry: 'ES' }), 200)
  const uEs = await db.user.findUnique({ where: { email: eUy }, select: { phone: true, phoneE164: true } })
  check(F, 'España guardado estandarizado (+34612345678 / "+34 612 34 56 78")', uEs?.phoneE164 === '+34612345678' && uEs?.phone === '+34 612 34 56 78', JSON.stringify(uEs))
  const estUy = await get(UY, '/api/auth/verificacion')
  check(F, 'la tarjeta "Email y celular" muestra el celular estandarizado, sin estado de verificación', estUy.data?.cuenta?.celular === '+34 612 34 56 78' && !('celularVerificado' in (estUy.data?.cuenta || {})) && !('celular' in (estUy.data?.disponible || {})), brief(estUy))
  const sinCodigo = await post(bad2, '/api/auth/register', completo)
  check(F, 'sin el código del mail no se crea la cuenta (needsEmailCode)', sinCodigo.status === 400 && sinCodigo.data?.needsEmailCode === true, brief(sinCodigo))
  const otroComp = await comprobanteEmail(bad2, mailNuevo('otro'))
  const compAjeno = await post(bad2, '/api/auth/register', { ...completo, emailToken: otroComp })
  check(F, 'el comprobante de OTRO email no sirve', compAjeno.status === 400 && compAjeno.data?.needsEmailCode === true, brief(compAjeno))
  const repetido = await post(bad2, '/api/auth/register', { ...completo, email: C.email })
  check(F, 'email ya registrado sin su código → 400 needsEmailCode (no revela que existe)', repetido.status === 400 && repetido.data?.needsEmailCode === true, brief(repetido))
  check(F, 'los registros inválidos no crean usuarios', (await db.user.count({ where: { email: { in: ['bad1', 'bad2', 'bad3', 'otro'].map(mailNuevo) } } })) === 0)

  // D19: aceptación de Términos y Política de Privacidad
  const { acceptTerms: _t, ...sinTerminos } = completo
  void _t
  const nt = await post(bad3, '/api/auth/register', { ...sinTerminos, email: mailNuevo('bad4') })
  st(F, 'registro sin aceptar los términos', nt, 400)
  check(F, 'registro sin términos avisa needsTerms', nt.data?.needsTerms === true, brief(nt))
  st(F, 'registro con acceptTerms no booleano', await post(bad3, '/api/auth/register', { ...completo, email: mailNuevo('bad5'), acceptTerms: 'true' }), 400)
  check(F, 'sin aceptar los términos no se crea la cuenta', (await db.user.count({ where: { email: { in: ['bad4', 'bad5'].map(mailNuevo) } } })) === 0)
  const terms = await db.user.findUnique({ where: { id: C.id }, select: { termsAcceptedAt: true, termsVersion: true } })
  check(F, 'registro guarda termsAcceptedAt y termsVersion = LEGAL_VERSION', !!terms?.termsAcceptedAt && terms?.termsVersion === LEGAL_VERSION && Date.now() - new Date(terms.termsAcceptedAt).getTime() < 10 * 60_000, `${JSON.stringify(terms)} esperado ${LEGAL_VERSION}`)

  await flowACodigos({ ipN, mailNuevo, completo })

  // DB: perfiles por rol, trial del proveedor, pipelines CRM
  const [uC, uP, uV] = await Promise.all([
    db.user.findUnique({ where: { id: C.id }, include: { professional: true, provider: true, pipelines: true } }),
    db.user.findUnique({ where: { id: P.id }, include: { professional: true, provider: true, pipelines: true } }),
    db.user.findUnique({ where: { id: V.id }, include: { professional: true, provider: true, pipelines: true } }),
  ])
  check(F, 'cliente sin perfiles de pro/proveedor', !uC.professional && !uC.provider)
  check(F, 'profesional con perfil y profesiones', !!uP.professional && uP.professional.professions.includes('pintura'))
  check(F, 'proveedor nace en trial', uV.provider?.subscription === 'trial')
  const trialDays = uV.provider?.trialEndsAt ? (new Date(uV.provider.trialEndsAt).getTime() - Date.now()) / 86400000 : 0
  check(F, 'trial de 14 días', trialDays > 13.9 && trialDays <= 14.01, `días=${trialDays}`)
  check(F, 'contraseña hasheada (bcrypt)', uC.passwordHash?.startsWith('$2'))
  check(F, 'pipelines CRM creados para pro y proveedor', uP.pipelines.length > 0 && uV.pipelines.length > 0)
  P.proId = uP.professional.id
  V.provId = uV.provider.id
  P2.proId = (await db.professionalProfile.findUnique({ where: { userId: P2.id } })).id

  // login / me / logout
  st(F, 'login con contraseña incorrecta', await post(ANON, '/api/auth/login', { email: C.email, password: 'Incorrecta123' }), 401)
  st(F, 'login sin datos', await post(ANON, '/api/auth/login', {}), 400)
  const tmp = new Actor('tmp', 'cliente')
  tmp.email = C.email
  const lg = await post(tmp, '/api/auth/login', { email: C.email.toUpperCase(), password: PASSWORD })
  st(F, 'login (email en mayúsculas)', lg, 200)
  check(F, 'login devuelve cookie httpOnly', !!tmp.cookie)
  const me = await get(tmp, '/api/auth/me')
  check(F, '/me con sesión devuelve al usuario', me.data?.user?.id === C.id, brief(me))
  check(F, '/me no expone el hash', !JSON.stringify(me.data).includes('passwordHash'))
  const meAnon = await get(ANON, '/api/auth/me')
  check(F, '/me sin sesión → user null', meAnon.status === 200 && meAnon.data?.user === null, brief(meAnon))
  st(F, 'logout', await post(tmp, '/api/auth/logout', {}), 200)
  const meAfter = await get(tmp, '/api/auth/me')
  check(F, 'después del logout /me → null', meAfter.data?.user === null, brief(meAfter))

  // perfil
  st(F, 'PUT perfil sin sesión', await put(ANON, '/api/profiles/me', { city: 'X' }), 401)
  st(F, 'PUT perfil nombre de 1 letra', await put(C, '/api/profiles/me', { displayName: 'a' }), 400)
  st(F, 'PUT perfil avatar externo', await put(C, '/api/profiles/me', { avatarUrl: 'https://evil.example.com/a.jpg' }), 400)
  st(F, 'PUT perfil lat fuera de rango', await put(C, '/api/profiles/me', { lat: 999 }), 400)
  st(F, 'cliente no edita datos de profesional', await put(C, '/api/profiles/me', { bio: 'x' }), 403)
  st(F, 'cliente no edita datos de proveedor', await put(C, '/api/profiles/me', { businessName: 'Hack SA' }), 403)
  // escritura parcial: el 403 no debería dejar cambios a medias
  const beforeCity = (await db.user.findUnique({ where: { id: C.id } })).city
  await put(C, '/api/profiles/me', { city: 'Ciudad cambiada', bio: 'x' })
  const afterCity = (await db.user.findUnique({ where: { id: C.id } })).city
  check(F, 'PUT rechazado (403) no deja cambios a medias en el usuario', afterCity === beforeCity, `city antes="${beforeCity}" después="${afterCity}"`, 'src/app/api/profiles/me/route.ts:152')
  if (afterCity !== beforeCity) await db.user.update({ where: { id: C.id }, data: { city: beforeCity } })
  check(F, 'no se creó perfil profesional para el cliente', !(await db.professionalProfile.findUnique({ where: { userId: C.id } })))
  st(F, 'PUT perfil con celular inválido', await put(C, '/api/profiles/me', { phone: '123' }), 400)
  st(F, 'PUT perfil sin celular (la cuenta tiene uno) → 400', await put(C, '/api/profiles/me', { phone: '' }), 400)
  st(F, 'PUT perfil cliente válido', await put(C, '/api/profiles/me', { displayName: `${MARK} Cliente Q`, city: 'CABA', phone: '1122334455' }), 200)
  const uCel = await db.user.findUnique({ where: { id: C.id } })
  check(F, 'perfil cliente persistido con el celular normalizado (sin phoneCountry = Argentina)', uCel.phoneE164 === '+5491122334455' && uCel.phone === '+54 9 11 2233-4455', `${uCel.phone} ${uCel.phoneE164}`)
  st(F, 'PUT perfil profesional válido', await put(P, '/api/profiles/me', { bio: `${MARK} Pintor con 5 años`, professions: ['pintura'], serviceRadiusKm: 20 }), 200)
  st(F, 'PUT perfil proveedor válido', await put(V, '/api/profiles/me', { description: `${MARK} corralón de prueba`, kind: 'Corralón' }), 200)
  const prov = await db.providerProfile.findUnique({ where: { id: V.provId } })
  check(F, 'tipo de negocio canonizado', prov.kind === 'corralon', `kind=${prov.kind}`)
  const meV = await get(V, '/api/profiles/me')
  check(F, 'GET perfil no expone tokens OAuth', meV.status === 200 && !JSON.stringify(meV.data).includes('mpOauthAccessToken'), brief(meV))

  await flowARecuperarYMails()
}

// ── A1. Códigos de verificación del email (D26, migración 0035). El celular no se verifica por
// código desde el 25/09/2026: el canal "celular" responde 400. ──
// Con `--mail-sink` se leen los códigos de los mails; sin el doble se prueba lo que no necesita
// leer el mail (límites, vencido, agotado vía base) y se avisa que el resto quedó sin probar.
async function flowACodigos({ ipN, mailNuevo, completo }) {
  const F = 'A'
  const enviar = (a, body) => post(a, '/api/auth/verificacion/enviar', body)
  const comprobar = (a, body) => post(a, '/api/auth/verificacion/comprobar', body)
  const ultimaFila = (target) => db.verificationCode.findFirst({ where: { target }, orderBy: { createdAt: 'desc' } })

  const disp = await get(ANON, '/api/auth/verificacion')
  check(F, 'qué se puede verificar: solo el email (el celular ya no figura)', disp.status === 200 && !('celular' in (disp.data?.disponible || {})) && disp.data?.cuenta === null && (MAIL_SINK_PORT ? disp.data?.disponible?.email === true : true), brief(disp))
  const cel400 = await enviar(ANON, { canal: 'celular', proposito: 'registro', destino: '11 2345-6789' })
  check(F, 'código al celular → 400 (el celular no se verifica por código)', cel400.status === 400 && /solo se verifica el email/.test(cel400.data?.error || ''), brief(cel400))
  const celComp = await comprobar(ANON, { canal: 'celular', proposito: 'registro', destino: '11 2345-6789', codigo: '123456' })
  check(F, 'comprobar un código de celular → 400', celComp.status === 400, brief(celComp))
  check(F, 'no se guarda ningún código de celular', (await db.verificationCode.count({ where: { target: '+5491123456789', purpose: 'registro' } })) === 0)
  st(F, 'enviar con email inválido', await enviar(ANON, { canal: 'email', proposito: 'registro', destino: 'juan@@gmail.com' }), 400)
  st(F, 'enviar con canal inválido', await enviar(ANON, { canal: 'paloma', proposito: 'registro', destino: 'a@gmail.com' }), 400)
  st(F, 'comprobar con código de letras', await comprobar(ANON, { canal: 'email', proposito: 'registro', destino: 'a@gmail.com', codigo: 'abc123' }), 400)
  st(F, 'verificar la cuenta sin sesión', await enviar(ANON, { canal: 'email', proposito: 'cuenta' }), 401)

  if (!MAIL_SINK_PORT) {
    console.log('  · (sin --mail-sink: los checks que leen el código del mail quedan sin correr)')
    return
  }
  const A1 = new Actor('cod', null)
  A1.ip = ipN(3)

  // ── código correcto / incorrecto / usado, espera de 60 s ──
  const e1 = mailNuevo('cod1')
  const t1 = Date.now()
  const s1 = await enviar(A1, { canal: 'email', proposito: 'registro', destino: `  ${e1.toUpperCase()} ` })
  check(F, 'enviar código (email con mayúsculas y espacios) → 200 con vence 600 s y reenvío 60 s', s1.status === 200 && s1.data?.venceEnSeg === 600 && s1.data?.reenviarEnSeg === 60, brief(s1))
  const m1 = await waitMail(e1, t1)
  const c1 = codigoDelAsunto(m1)
  check(F, 'llega el mail con el código de 6 números (asunto y cuerpo)', !!c1 && (m1.body.html || '').includes(c1) && (m1.body.text || '').includes(c1), m1?.body?.subject)
  check(F, 'el mail del código usa la plantilla de marca y dice que vence en 10 minutos', (m1?.body?.html || '').includes('cid:homia-logo') && /10 minutos/.test(m1?.body?.text || ''), '')
  const f1 = await ultimaFila(e1)
  check(F, 'en la base se guarda el hash (64 hex), nunca el código', !!f1 && /^[0-9a-f]{64}$/.test(f1.codeHash) && !f1.codeHash.includes(c1) && f1.attempts === 0, JSON.stringify(f1))
  const s1b = await enviar(A1, { canal: 'email', proposito: 'registro', destino: e1 })
  check(F, 'reenviar enseguida → 429 con la espera en segundos', s1b.status === 429 && s1b.data?.motivo === 'espera' && s1b.data?.esperarSeg > 50 && s1b.data?.esperarSeg <= 60, brief(s1b))
  const malo = c1 === '000000' ? '111111' : '000000'
  const w1 = await comprobar(A1, { canal: 'email', proposito: 'registro', destino: e1, codigo: malo })
  check(F, 'código incorrecto → 400 con intentos restantes (4)', w1.status === 400 && w1.data?.motivo === 'incorrecto' && w1.data?.intentosRestantes === 4, brief(w1))
  const ok1 = await comprobar(A1, { canal: 'email', proposito: 'registro', destino: e1, codigo: c1 })
  check(F, 'código correcto → 200 con comprobante', ok1.status === 200 && typeof ok1.data?.comprobante === 'string', brief(ok1))
  const re1 = await comprobar(A1, { canal: 'email', proposito: 'registro', destino: e1, codigo: c1 })
  check(F, 'el mismo código otra vez → 400 "ya se usó"', re1.status === 400 && re1.data?.motivo === 'usado', brief(re1))
  check(F, 'el comprobante no sirve como cookie de sesión', (await get(Object.assign(new Actor('tok', null), { cookie: `homy_session=${ok1.data?.comprobante}` }), '/api/auth/me')).data?.user === null)
  // con el comprobante se crea la cuenta; un segundo alta con el mismo comprobante → 409
  const E1 = new Actor('cod1', 'cliente')
  E1.ip = ipN(4)
  const alta = await post(E1, '/api/auth/register', { ...completo, email: e1, emailToken: ok1.data?.comprobante, phone: '0351 15 555-1234', phoneConfirm: '351 555 1234' })
  st(F, 'alta con el comprobante del código', alta, 201)
  check(F, 'alta: celular de Córdoba normalizado (+5493515551234)', alta.data?.user?.phone === '+54 9 351 555-1234', brief(alta))
  st(F, 'segunda alta con el mismo comprobante → 409 (la cuenta ya existe)', await post(E1, '/api/auth/register', { ...completo, email: e1, emailToken: ok1.data?.comprobante }), 409)

  // ── vencido ──
  const e2 = mailNuevo('cod2')
  const t2 = Date.now()
  st(F, 'enviar código (para vencer)', await enviar(A1, { canal: 'email', proposito: 'registro', destino: e2 }), 200)
  const c2 = codigoDelAsunto(await waitMail(e2, t2))
  await db.verificationCode.updateMany({ where: { target: e2 }, data: { expiresAt: new Date(Date.now() - 1000) } })
  const v2 = await comprobar(A1, { canal: 'email', proposito: 'registro', destino: e2, codigo: c2 || '123456' })
  check(F, 'código vencido (10 min) → 400 "venció"', v2.status === 400 && v2.data?.motivo === 'vencido' && /venci/.test(v2.data?.error || ''), brief(v2))

  // ── agotado (5 intentos) y reenvío después de la espera ──
  const e3 = mailNuevo('cod3')
  const t3 = Date.now()
  st(F, 'enviar código (para agotar)', await enviar(A1, { canal: 'email', proposito: 'registro', destino: e3 }), 200)
  const c3 = codigoDelAsunto(await waitMail(e3, t3))
  const mal3 = c3 === '000000' ? '111111' : '000000'
  let ult
  for (let i = 0; i < 5; i++) ult = await comprobar(A1, { canal: 'email', proposito: 'registro', destino: e3, codigo: mal3 })
  check(F, 'quinto intento incorrecto → 429 agotado', ult.status === 429 && ult.data?.motivo === 'agotado', brief(ult))
  const tarde = await comprobar(A1, { canal: 'email', proposito: 'registro', destino: e3, codigo: c3 })
  check(F, 'agotado: ni el código correcto sirve → 429', tarde.status === 429 && tarde.data?.motivo === 'agotado', brief(tarde))
  // pasó la espera de 60 s (se corre la fecha del código en la base) → código nuevo que sí sirve
  await db.verificationCode.updateMany({ where: { target: e3 }, data: { createdAt: new Date(Date.now() - 61_000) } })
  const t3b = Date.now()
  st(F, 'reenviar después de la espera', await enviar(A1, { canal: 'email', proposito: 'registro', destino: e3 }), 200)
  const c3b = codigoDelAsunto(await waitMail(e3, t3b))
  const ok3 = await comprobar(A1, { canal: 'email', proposito: 'registro', destino: e3, codigo: c3b })
  check(F, 'el código reenviado sirve', ok3.status === 200 && !!ok3.data?.comprobante, brief(ok3))

  // ── tope de 5 códigos por hora para el mismo email ──
  const e4 = mailNuevo('cod4')
  const hace = (min) => new Date(Date.now() - min * 60_000)
  await db.verificationCode.createMany({
    data: [50, 40, 30, 20, 10].map((m) => ({ channel: 'email', purpose: 'registro', target: e4, codeHash: 'x'.repeat(64), expiresAt: hace(m - 10), createdAt: hace(m), ip: '10.0.0.1' })),
  })
  const tope = await enviar(A1, { canal: 'email', proposito: 'registro', destino: e4 })
  check(F, '6.º código en la hora → 429 "Probá de nuevo en N minutos"', tope.status === 429 && tope.data?.motivo === 'tope_destino' && /minuto/.test(tope.data?.error || ''), brief(tope))

  // ── sin enumeración: email con cuenta → misma respuesta; le llega "ya tenés cuenta", no un código ──
  // (el código con el que C se registró hace segundos todavía cuenta para la espera de 60 s: se corre)
  await db.verificationCode.updateMany({ where: { target: C.email }, data: { createdAt: new Date(Date.now() - 61_000) } })
  const tC = Date.now()
  const sC = await enviar(A1, { canal: 'email', proposito: 'registro', destino: C.email })
  const sN = s1
  check(F, 'email con cuenta: misma respuesta que uno nuevo (200 y mismas claves)', sC.status === 200 && JSON.stringify(Object.keys(sC.data || {}).sort()) === JSON.stringify(Object.keys(sN.data || {}).sort()), `${brief(sC)} vs ${brief(sN)}`)
  const mC = await waitMail(C.email, tC)
  check(F, 'al dueño le llega "Ya tenés una cuenta" sin código', mC?.body?.subject === 'Ya tenés una cuenta en HomIA' && !/\b\d{6}\b/.test(mC?.body?.text || ''), mC?.body?.subject)
  const cC = await comprobar(A1, { canal: 'email', proposito: 'registro', destino: C.email, codigo: '123456' })
  check(F, 'email con cuenta: cualquier código da "incorrecto" como uno nuevo', cC.status === 400 && cC.data?.motivo === 'incorrecto', brief(cC))

  // ── verificar después, desde la cuenta (cuentas anteriores a D26) ──
  await db.user.update({ where: { id: C.id }, data: { emailVerifiedAt: null } })
  const est = await get(C, '/api/auth/verificacion')
  check(F, 'cuenta sin verificar: el estado lo dice (email no) y el celular va sin estado', est.data?.cuenta?.emailVerificado === false && !('celularVerificado' in (est.data?.cuenta || {})) && est.data?.cuenta?.email === C.email, brief(est))
  const tK = Date.now()
  const sK = await enviar(C, { canal: 'email', proposito: 'cuenta', destino: 'otro@gmail.com' })
  st(F, 'pedir código para verificar el email de la cuenta', sK, 200)
  const mK = await waitMail(C.email, tK)
  check(F, 'el código va al email de la cuenta (el destino del body se ignora)', !!codigoDelAsunto(mK) && mailsTo('otro@gmail.com').length === 0, mK?.body?.subject)
  const okK = await comprobar(C, { canal: 'email', proposito: 'cuenta', codigo: codigoDelAsunto(mK) })
  check(F, 'código correcto → la cuenta queda con email verificado', okK.status === 200 && okK.data?.verificado === true && !!(await db.user.findUnique({ where: { id: C.id } }))?.emailVerifiedAt, brief(okK))
  const ya = await enviar(C, { canal: 'email', proposito: 'cuenta' })
  check(F, 'ya verificado: no manda otro código', ya.status === 200 && ya.data?.yaVerificado === true, brief(ya))
  const celK = await enviar(C, { canal: 'celular', proposito: 'cuenta' })
  check(F, 'verificar el celular de la cuenta → 400 (no existe esa verificación)', celK.status === 400, brief(celK))
}

// ── A2. Recuperar contraseña y avisos por mail (D18, migración 0028) ──
// Con `--mail-sink <puerto>` la suite levanta un doble de Resend en ese puerto (el server tiene
// que correr con RESEND_API_KEY=<cualquiera> y RESEND_API_URL=http://127.0.0.1:<puerto>/emails)
// y verifica el contenido de los mails. Sin el doble, verifica todo lo demás (tokens, límites,
// reset, preferencia) y que nada se rompa sin mail configurado.
const MAIL_SINK_PORT = argVal('--mail-sink')
const sink = { mails: [], fail: false, server: null }
async function startMailSink() {
  if (!MAIL_SINK_PORT || sink.server) return
  const { createServer } = await import('node:http')
  sink.server = createServer((req, res) => {
    let raw = ''
    req.on('data', (c) => { raw += c })
    req.on('end', () => {
      if (sink.fail) { res.writeHead(500, { 'content-type': 'application/json' }); res.end('{"message":"falla simulada"}'); return }
      let body = null
      try { body = JSON.parse(raw) } catch { /* vacío */ }
      sink.mails.push({ at: Date.now(), auth: req.headers.authorization || '', body })
      res.writeHead(200, { 'content-type': 'application/json' })
      res.end(JSON.stringify({ id: `sink_${sink.mails.length}` }))
    })
  })
  await new Promise((ok) => sink.server.listen(Number(MAIL_SINK_PORT), '127.0.0.1', ok))
}
const mailsTo = (email) => sink.mails.filter((m) => m.body?.to?.includes(email))
async function waitMail(email, desde, { ms = 8000, subject } = {}) {
  const t0 = Date.now()
  while (Date.now() - t0 < ms) {
    const m = mailsTo(email).find((x) => x.at >= desde && (!subject || x.body?.subject === subject))
    if (m) return m
    await new Promise((r) => setTimeout(r, 200))
  }
  return null
}

async function flowARecuperarYMails() {
  const F = 'A'
  const { createHash, randomBytes } = await import('node:crypto')
  const sha = (t) => createHash('sha256').update(t, 'utf8').digest('hex')
  const MSG = 'Si ese email tiene una cuenta, te mandamos un link para crear una nueva contraseña'
  await startMailSink()
  const anonR = new Actor('anonr', null)
  anonR.ip = `10.251.${(TS >> 8) & 255}.${TS & 255}`

  // ── pedir el link: misma respuesta exista o no la cuenta ──
  const t0 = Date.now()
  st(F, 'olvidé mi contraseña con email inválido', await post(anonR, '/api/auth/password/forgot', { email: 'no-es-email' }), 400)
  // Sin servicio de mail (ni RESEND_API_KEY en el entorno ni doble de Resend) el pedido responde 503
  // honesto, igual para todos los emails, y no crea tokens. El resto del flujo (restablecer) se
  // prueba igual insertando el hash del token.
  const mailOn = !!MAIL_SINK_PORT || !!(process.env.RESEND_API_KEY || '').trim()
  if (!mailOn) {
    const n1 = await post(anonR, '/api/auth/password/forgot', { email: C.email })
    const n2 = await post(anonR, '/api/auth/password/forgot', { email: `${EMAIL_PREFIX}no-existe-${TS}${EMAIL_DOMAIN}` })
    check(F, 'sin mail configurado: olvidé mi contraseña → 503 needsConfig, el mismo para cuenta existente y sin cuenta',
      n1.status === 503 && n1.data?.needsConfig === true && n2.status === 503 && n1.data?.error === n2.data?.error, `${brief(n1)} ${brief(n2)}`)
    check(F, 'sin mail configurado: no se crean tokens de recuperación', (await db.passwordReset.count({ where: { userId: C.id } })) === 0)
  }
  if (mailOn) {
  const f1 = await post(anonR, '/api/auth/password/forgot', { email: C.email.toUpperCase() })
  check(F, 'olvidé mi contraseña (cuenta existente) → 200 con el mensaje neutro', f1.status === 200 && f1.data?.message === MSG, brief(f1))
  const f2 = await post(anonR, '/api/auth/password/forgot', { email: `${EMAIL_PREFIX}no-existe-${TS}${EMAIL_DOMAIN}` })
  check(F, 'olvidé mi contraseña (email sin cuenta) → 200 con el MISMO mensaje', f2.status === 200 && f2.data?.message === MSG, brief(f2))
  const rows1 = await db.passwordReset.findMany({ where: { userId: C.id } })
  check(F, 'se creó 1 pedido de recuperación con el HASH del token (sha256), no el token', rows1.length === 1 && /^[0-9a-f]{64}$/.test(rows1[0].tokenHash) && !rows1[0].usedAt, JSON.stringify(rows1))
  const ttl = rows1[0] ? (new Date(rows1[0].expiresAt).getTime() - Date.now()) / 60000 : 0
  check(F, 'el link vence en 1 hora', ttl > 58 && ttl <= 60.1, `min=${ttl}`)
  if (MAIL_SINK_PORT) {
    const m = await waitMail(C.email, t0)
    check(F, 'mail de recuperación enviado al usuario', !!m, `mails=${sink.mails.length}`)
    const link = (m?.body?.html || '').match(/href="([^"]*#\/restablecer\?token=([A-Za-z0-9_-]+))"/)
    check(F, 'el mail trae el link /#/restablecer?token=… y su hash es el guardado', !!link && sha(link[2]) === rows1[0]?.tokenHash, link?.[1] || '')
    check(F, 'mail de recuperación: asunto, texto plano, vence en 1 hora, sin pie de "dejar de recibir avisos"',
      m?.body?.subject === 'Creá una nueva contraseña para HomIA' && /restablecer\?token=/.test(m?.body?.text || '') && /vence en 1 hora/.test(m?.body?.text || '') && !/dejar de recibir avisos/.test(m?.body?.html || ''), JSON.stringify(m?.body?.subject))
    check(F, 'el mail sale con Authorization Bearer', /^Bearer .+/.test(m?.auth || ''))
    check(F, 'al email sin cuenta no se le manda nada', mailsTo(`${EMAIL_PREFIX}no-existe-${TS}${EMAIL_DOMAIN}`).length === 0)
  }

  // ── tope: 3 pedidos por cuenta por hora; el 4.º responde igual pero no crea nada ──
  for (let i = 0; i < 3; i++) await post(anonR, '/api/auth/password/forgot', { email: C.email })
  const f5 = await post(anonR, '/api/auth/password/forgot', { email: C.email })
  const nRows = await db.passwordReset.count({ where: { userId: C.id } })
  check(F, 'más de 3 pedidos por hora: sigue respondiendo 200 igual y no crea más tokens', f5.status === 200 && f5.data?.message === MSG && nRows === 3, `n=${nRows} ${brief(f5)}`)
  }

  // ── restablecer con un token conocido (se inserta su hash, como haría el pedido) ──
  const mk = async (expiresInMs) => {
    const token = randomBytes(32).toString('base64url')
    await db.passwordReset.create({ data: { userId: C.id, tokenHash: sha(token), expiresAt: new Date(Date.now() + expiresInMs) } })
    return token
  }
  const tok = await mk(3600_000)
  const g1 = await get(anonR, `/api/auth/password/reset?token=${tok}`)
  check(F, 'link válido: GET reset → 200', g1.status === 200, brief(g1))
  const weak = await post(anonR, '/api/auth/password/reset', { token: tok, password: 'solo-letras' })
  check(F, 'contraseña débil (sin números) → 400 y el token sigue sirviendo', weak.status === 400 && /letras y números/.test(weak.data?.error || '') && !(await db.passwordReset.findUnique({ where: { tokenHash: sha(tok) } }))?.usedAt, brief(weak))
  st(F, 'contraseña corta', await post(anonR, '/api/auth/password/reset', { token: tok, password: 'ab12' }), 400)
  const NEW_PW = 'Nueva2026e2e'
  const rs = await post(anonR, '/api/auth/password/reset', { token: tok, password: NEW_PW })
  check(F, 'restablecer con token válido → 200 y NO inicia sesión', rs.status === 200 && !anonR.cookie && !(rs.headers.get('set-cookie') || '').includes('homy_session'), brief(rs))
  const lNew = new Actor('lnew', 'cliente')
  st(F, 'ingresa con la contraseña NUEVA', await post(lNew, '/api/auth/login', { email: C.email, password: NEW_PW }), 200)
  st(F, 'NO ingresa con la contraseña vieja', await post(new Actor('lold', 'cliente'), '/api/auth/login', { email: C.email, password: PASSWORD }), 401)
  const pend = await db.passwordReset.count({ where: { userId: C.id, usedAt: null } })
  check(F, 'al usar un link se invalidan los otros pendientes de la cuenta', pend === 0, `pendientes=${pend}`)
  const reuse = await post(anonR, '/api/auth/password/reset', { token: tok, password: 'OtraMas2026' })
  check(F, 'link ya usado → 400 "ya se usó"', reuse.status === 400 && reuse.data?.code === 'usado' && /ya se usó/.test(reuse.data?.error || ''), brief(reuse))
  const tokOld = await mk(-60_000)
  const exp = await post(anonR, '/api/auth/password/reset', { token: tokOld, password: 'OtraMas2026' })
  check(F, 'link vencido → 400 "El link venció: pedí uno nuevo"', exp.status === 400 && exp.data?.code === 'vencido' && /venció/.test(exp.data?.error || ''), brief(exp))
  const gExp = await get(anonR, `/api/auth/password/reset?token=${tokOld}`)
  check(F, 'link vencido: GET reset → 400 vencido', gExp.status === 400 && gExp.data?.code === 'vencido', brief(gExp))
  const inv = await post(anonR, '/api/auth/password/reset', { token: randomBytes(32).toString('base64url'), password: 'OtraMas2026' })
  check(F, 'link inexistente → 400 inválido', inv.status === 400 && inv.data?.code === 'invalido', brief(inv))
  st(F, 'restablecer sin token', await post(anonR, '/api/auth/password/reset', { password: 'OtraMas2026' }), 400)
  // se vuelve a la contraseña de la suite (el resto de los flujos ingresa con ella)
  const tokBack = await mk(3600_000)
  st(F, 'restablecer de nuevo (vuelve a la contraseña de la suite)', await post(anonR, '/api/auth/password/reset', { token: tokBack, password: PASSWORD }), 200)
  st(F, 'ingresa otra vez con la contraseña de la suite', await post(new Actor('lback', 'cliente'), '/api/auth/login', { email: C.email, password: PASSWORD }), 200)

  // ── preferencia de avisos por mail ──
  st(F, 'PUT emailNotifications con tipo inválido', await put(V, '/api/profiles/me', { emailNotifications: 'no' }), 400)
  check(F, 'por defecto los avisos por mail están prendidos', (await db.user.findUnique({ where: { id: V.id } })).emailNotifications === true)
  st(F, 'apagar avisos por mail', await put(V, '/api/profiles/me', { emailNotifications: false }), 200)
  const meOff = await get(V, '/api/profiles/me')
  check(F, 'GET perfil devuelve emailNotifications=false', meOff.data?.user?.emailNotifications === false, brief(meOff))
  st(F, 'prender avisos por mail', await put(V, '/api/profiles/me', { emailNotifications: true }), 200)

  // ── mail de evento: nueva compra → el proveedor recibe el mail (salvo que lo haya apagado) ──
  const el = await db.catalogElement.findFirst({ where: { name: 'Cemento Portland 50kg' } }) || await db.catalogElement.findFirst({ where: { name: { notIn: ['Caño PVC desagüe 110mm', 'Membrana líquida 20kg', 'Látex interior 20L blanco', 'Caño PVC 63mm'] } }, orderBy: { name: 'asc' } })
  const sm = await post(V, '/api/provider/stock', { elementId: el.id, price: 1000, quantity: 50, brand: `${MARK} mails` })
  st(F, 'stock para la prueba de mails', sm, 201)
  const stockM = sm.data?.stock?.id
  const compras = []
  const comprar = async (label) => {
    const desde = Date.now()
    const r = await post(C, '/api/purchases', { stockId: stockM, quantity: 1, type: 'compra', note: `${MARK} ${label}` })
    if (r.data?.purchase?.id) compras.push(r.data.purchase.id)
    return { r, desde }
  }
  const c1 = await comprar('mail on')
  st(F, 'compra (avisos prendidos)', c1.r, 201)
  check(F, 'el proveedor tiene la notificación nueva_compra', (await db.notification.count({ where: { userId: V.id, type: 'nueva_compra' } })) === 1)
  if (MAIL_SINK_PORT) {
    const m = await waitMail(V.email, c1.desde, { subject: 'Nueva compra: stock reservado' })
    check(F, 'el proveedor recibe el mail "Nueva compra"', !!m, `mails a V=${mailsTo(V.email).length}`)
    const html = m?.body?.html || ''
    check(F, 'mail de compra: botón al panel con URL absoluta, texto plano y pie para apagar avisos',
      /href="https?:\/\/[^"]+\/#\/panel\/proveedor\/cobros\?tab=ventas"/.test(html) && /Ver la venta: https?:\/\//.test(m?.body?.text || '') && /Podés dejar de recibir avisos por mail desde tu perfil/.test(html), html.slice(0, 200))
    check(F, 'al cliente que compró no le llega mail por su propia compra', mailsTo(C.email).filter((x) => x.at >= c1.desde).length === 0)
  }
  await put(V, '/api/profiles/me', { emailNotifications: false })
  const c2 = await comprar('mail off')
  st(F, 'compra (avisos apagados)', c2.r, 201)
  check(F, 'con avisos apagados la notificación en la app igual se crea', (await db.notification.count({ where: { userId: V.id, type: 'nueva_compra' } })) === 2)
  if (MAIL_SINK_PORT) {
    await new Promise((r) => setTimeout(r, 3000))
    check(F, 'con emailNotifications=false el proveedor NO recibe mail', mailsTo(V.email).filter((x) => x.at >= c2.desde).length === 0, `mails=${mailsTo(V.email).length}`)
  }
  await put(V, '/api/profiles/me', { emailNotifications: true })
  if (MAIL_SINK_PORT) sink.fail = true
  const c3 = await comprar('mail falla')
  st(F, 'compra con el envío de mail fallando → igual 201', c3.r, 201)
  check(F, 'con el mail fallando la compra y su notificación quedan bien', (await db.notification.count({ where: { userId: V.id, type: 'nueva_compra' } })) === 3 && !!(await db.purchase.findUnique({ where: { id: c3.r.data?.purchase?.id || 'x' } })))
  if (MAIL_SINK_PORT) { await new Promise((r) => setTimeout(r, 1500)); sink.fail = false }
  // limpieza de la prueba (lo que quede lo borra la purga)
  for (const id of compras) await patch(C, `/api/purchases/${id}`, { action: 'cancelar' })
  await del(V, `/api/provider/stock?id=${stockM}`)
  await db.notification.deleteMany({ where: { userId: V.id, type: 'nueva_compra' } })
}

// ═══════════════ A (cont.). ELIMINAR MI CUENTA (D19, Ley 25.326) ═══════════════
// Usuarios propios (se eliminan en la prueba): un profesional con historial y un proveedor con stock.
const XP = new Actor('bajapro', 'profesional')
const XV = new Actor('bajaprov', 'proveedor')
async function flowBaja() {
  const F = 'A'
  try {
    await flowBajaInner(F)
  } catch (e) {
    check(F, 'eliminar cuenta: el flujo terminó sin excepciones', false, e instanceof Error ? `${e.message} ${e.stack?.split('\n')[1] || ''}` : String(e))
  }
}
async function flowBajaInner(F) {
  const BAJA_IP = `10.253.${(TS >> 8) & 255}.${TS & 255}`
  XP.ip = BAJA_IP
  XV.ip = BAJA_IP
  const base = { password: PASSWORD, lat: CABA.lat, lng: CABA.lng, city: 'CABA', howFoundUs: 'otro', acceptTerms: true, phone: '1133334444', address: 'Calle Falsa 123', birthday: '1990-01-01' }
  const rp = await registrar(XP, { ...base, email: XP.email, displayName: `${MARK} Pro Baja`, roles: ['profesional'], professions: ['pintura'], bio: `${MARK} pintor que se va` })
  st(F, 'baja: registro del profesional', rp, 201)
  XP.id = rp.data?.user?.id
  const rv = await registrar(XV, { ...base, email: XV.email, displayName: `${MARK} Prov Baja`, roles: ['proveedor'], businessName: `${MARK} Corralón Baja` })
  st(F, 'baja: registro del proveedor', rv, 201)
  XV.id = rv.data?.user?.id
  if (!XP.id || !XV.id) throw new Error('No se pudieron crear los usuarios de la baja')
  XP.proId = (await db.professionalProfile.findUnique({ where: { userId: XP.id } }))?.id
  XV.provId = (await db.providerProfile.findUnique({ where: { userId: XV.id } }))?.id

  // stock del proveedor y visibilidad ANTES de la baja
  const el = await db.catalogElement.findFirst({ where: { active: true, name: { contains: 'Caño' } }, orderBy: { name: 'asc' } })
  const sk = await post(XV, '/api/provider/stock', { elementId: el.id, price: 4321, quantity: 7, minStock: 1, brand: `${MARK} baja` })
  st(F, 'baja: el proveedor publica stock', sk, 201)
  const stockId = sk.data?.stock?.id
  const offerIn = (r) => (r.data?.results || []).some((e) => (e.offers || []).some((o) => o.stockId === stockId))
  const inDir = async (id) => JSON.stringify((await get(C, '/api/directory')).data).includes(id)
  check(F, 'baja: antes, el profesional está en el directorio', await inDir(XP.proId))
  check(F, 'baja: antes, el proveedor está en el directorio', await inDir(XV.provId))
  check(F, 'baja: antes, su oferta está en el marketplace', offerIn(await get(C, `/api/marketplace?q=${encodeURIComponent(el.name)}`)))
  check(F, 'baja: antes, el profesional sale en la búsqueda', JSON.stringify((await get(C, `/api/search?mode=cliente&q=pintura&lat=${CABA.lat}&lng=${CABA.lng}&radius=25`)).data).includes(XP.proId))

  // datos personales que se tienen que borrar: DNI (bucket privado), carrito, favorito, notificación
  const f1 = await upload(XP, 'dni', 41)
  const f2 = await upload(XP, 'dni', 42)
  st(F, 'baja: sube frente del DNI', f1, 201)
  st(F, 'baja: sube dorso del DNI', f2, 201)
  await db.identityDocument.create({ data: { userId: XP.id, frontUrl: f1.data?.url, backUrl: f2.data?.url, status: 'en_revision', aiNotes: `${MARK} baja` } })
  st(F, 'baja: carrito del profesional', await post(XP, '/api/cart', { stockId, quantity: 1 }), 201, '')
  await db.favorite.create({ data: { userId: XP.id, targetUserId: P.id } })
  await db.notification.create({ data: { userId: XP.id, type: 'e2e', title: `${MARK} aviso baja` } })

  // historial con otros: un proyecto donde el profesional que se va es CLIENTE de P
  const proj = await db.project.create({ data: { clientId: XP.id, professionalId: P.proId, title: `${MARK} Obra de la baja`, status: 'activo', laborCost: 1000 } })

  // validaciones
  st(F, 'baja sin sesión', await post(ANON, '/api/profiles/me/eliminar', { confirm: 'ELIMINAR', password: PASSWORD }), 401)
  st(F, 'baja sin escribir ELIMINAR', await post(XP, '/api/profiles/me/eliminar', { confirm: 'eliminar', password: PASSWORD }), 400)
  st(F, 'baja con contraseña incorrecta', await post(XP, '/api/profiles/me/eliminar', { confirm: 'ELIMINAR', password: 'Incorrecta123' }), 403)
  const r409 = await post(XP, '/api/profiles/me/eliminar', { confirm: 'ELIMINAR', password: PASSWORD })
  st(F, 'baja con un proyecto activo', r409, 409)
  check(F, 'el 409 lista lo que hay que cerrar (proyecto activo como cliente)', (r409.data?.pendientes || []).some((p) => p.tipo === 'proyectos_cliente' && p.cantidad === 1 && p.ruta), brief(r409))
  check(F, 'con el 409 no se tocó nada', (await db.user.findUnique({ where: { id: XP.id } }))?.deletedAt === null && (await db.identityDocument.count({ where: { userId: XP.id } })) === 1)

  // se cierra el proyecto (finalizado, con factura pagada y reseña del que se va)
  await db.project.update({ where: { id: proj.id }, data: { status: 'finalizado', stage: 'finalizado' } })
  const inv = await db.invoice.create({ data: { projectId: proj.id, number: `E2E-BAJA-${TS}`, clientId: XP.id, professionalId: P.proId, laborCost: 1000, total: 1000, status: 'pagada', paymentMethod: 'efectivo', paidAt: new Date() } })
  const rev = await db.review.create({ data: { authorId: XP.id, targetUserId: P.id, projectId: proj.id, rating: 5, comment: `${MARK} reseña de alguien que se va` } })

  const ok1 = await post(XP, '/api/profiles/me/eliminar', { confirm: 'ELIMINAR', password: PASSWORD })
  st(F, 'baja del profesional', ok1, 200)
  noteDeleted(XP.id)
  check(F, 'la baja borra la cookie de sesión', !XP.cookie)
  const u = await db.user.findUnique({ where: { id: XP.id }, include: { professional: true } })
  check(F, 'anonimizado: email eliminado-<id>@homia.invalid', u?.email === `eliminado-${XP.id}@homia.invalid`, u?.email)
  check(F, 'anonimizado: nombre "Usuario eliminado"', u?.displayName === 'Usuario eliminado', u?.displayName)
  check(F, 'anonimizado: teléfono, dirección, foto, ubicación y cumpleaños en null', [u?.phone, u?.address, u?.avatarUrl, u?.lat, u?.lng, u?.birthday, u?.city].every((v) => v === null), JSON.stringify({ phone: u?.phone, address: u?.address, lat: u?.lat, birthday: u?.birthday }))
  check(F, 'anonimizado: deletedAt puesto y contraseña reemplazada', !!u?.deletedAt && !!u?.passwordHash?.startsWith('$2'))
  check(F, 'anonimizado: roles conservados', JSON.parse(u?.roles || '[]').includes('profesional'))
  check(F, 'anonimizado: perfil profesional sin datos personales', u?.professional && u.professional.bio === null && u.professional.lat === null)
  check(F, 'baja: DNI borrado de la base', (await db.identityDocument.count({ where: { userId: XP.id } })) === 0)
  const url = process.env.SUPABASE_PROJECT_URL
  const key = process.env.SUPABASE_SERVICE_ROLE
  if (url && key) {
    const sb = createClient(url, key, { auth: { persistSession: false } })
    const { data: left } = await sb.storage.from('dni-docs').list(`${XP.id}/dni`, { limit: 100 })
    check(F, 'baja: fotos del DNI borradas del bucket privado', (left || []).length === 0, `quedan ${(left || []).length}`)
  }
  check(F, 'baja: carrito, favoritos y notificaciones borrados', (await db.cartItem.count({ where: { userId: XP.id } })) === 0 && (await db.favorite.count({ where: { userId: XP.id } })) === 0 && (await db.notification.count({ where: { userId: XP.id } })) === 0)
  check(F, 'baja: se conservan proyecto, factura y reseña de otros', !!(await db.project.findUnique({ where: { id: proj.id } })) && !!(await db.invoice.findUnique({ where: { id: inv.id } })) && !!(await db.review.findUnique({ where: { id: rev.id } })))
  const ppP = await get(C, `/api/profiles/professional/${P.proId}`)
  check(F, 'la reseña del que se fue muestra "Usuario eliminado"', (ppP.data?.reviews || []).some((r) => r.id === rev.id && r.author?.displayName === 'Usuario eliminado'), brief(ppP))
  const meX = await get(XP, '/api/auth/me')
  check(F, 'después de la baja /me → null', meX.data?.user === null, brief(meX))
  st(F, 'login con el email viejo falla', await post(ANON, '/api/auth/login', { email: XP.email, password: PASSWORD }), 401)
  check(F, 'baja: el profesional ya no está en el directorio', !(await inDir(XP.proId)))
  check(F, 'baja: el profesional ya no sale en la búsqueda', !JSON.stringify((await get(C, `/api/search?mode=cliente&q=pintura&lat=${CABA.lat}&lng=${CABA.lng}&radius=25`)).data).includes(XP.proId))
  check(F, 'baja: el profesional ya no está en los pines', !JSON.stringify((await get(C, `/api/search/pins?mode=cliente&lat=${CABA.lat}&lng=${CABA.lng}&radius=25`)).data).includes(XP.proId))
  st(F, 'baja: su perfil público da 404', await get(C, `/api/profiles/professional/${XP.proId}`), 404)
  // ya verificado que se conservan: se sacan para no alterar los totales de P en los flujos siguientes (Cobros, reseñas)
  await db.review.deleteMany({ where: { id: rev.id } })
  await db.invoice.deleteMany({ where: { id: inv.id } })
  await db.project.deleteMany({ where: { id: proj.id } })

  // proveedor sin operaciones: se va y se lleva su stock publicado. Antes, C le abre un chat
  // (el cliente inicia) para probar que después de la baja ese hilo ya no acepta mensajes.
  const chatXV = await post(C, '/api/messages/conversations', { targetUserId: XV.id })
  const convXV = chatXV.data?.conversation?.id
  const ok2 = await post(XV, '/api/profiles/me/eliminar', { confirm: 'ELIMINAR', password: PASSWORD })
  st(F, 'baja del proveedor', ok2, 200)
  noteDeleted(XV.id)
  check(F, 'baja: el stock publicado del proveedor se quitó', (await db.providerStock.count({ where: { providerId: XV.provId } })) === 0)
  check(F, 'baja: el proveedor quedó como "Proveedor eliminado"', (await db.providerProfile.findUnique({ where: { id: XV.provId } }))?.businessName === 'Proveedor eliminado')
  check(F, 'baja: la oferta ya no está en el marketplace', !offerIn(await get(C, `/api/marketplace?q=${encodeURIComponent(el.name)}`)))
  check(F, 'baja: el proveedor ya no está en el directorio', !(await inDir(XV.provId)))
  st(F, 'baja: el perfil del proveedor da 404', await get(C, `/api/profiles/provider/${XV.provId}`), 404)
  st(F, 'baja: no se puede escribirle a una cuenta eliminada', await post(C, '/api/messages/conversations', { targetUserId: XV.id }), 404)
  const msgX = convXV ? await post(C, `/api/messages/conversations/${convXV}`, { body: `${MARK} hola` }) : { status: 0 }
  check(F, 'baja: un chat que ya existía no acepta mensajes nuevos a la cuenta eliminada (409)', msgX.status === 409 && msgX.data?.cuentaEliminada === true, `conv=${convXV} ${brief(msgX)}`)
}

// ═════════════════════════════ B. PROVEEDOR ═════════════════════════════
async function flowB() {
  const F = 'B'
  const cat = await get(ANON, '/api/catalog')
  st(F, 'catálogo público', cat, 200)
  const allEls = (cat.data?.categories || []).flatMap((c) => c.elements.map((e) => ({ ...e, categoryId: c.id, categorySlug: c.slug })))
  check(F, 'catálogo con 22 categorías (D28)', cat.data?.categories?.length === 22, `n=${cat.data?.categories?.length}`)
  check(F, 'catálogo con más de 1000 elementos', allEls.length > 1000, `n=${allEls.length}`)
  const norm = (s) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  // búsqueda difusa como el combobox: "cano pvc desague" sin acentos encuentra "Caño PVC desagüe 110mm"
  const hit = allEls.filter((e) => ['cano', 'pvc', 'desague'].every((t) => norm(`${e.name} ${e.aliases.join(' ')}`).includes(t)))
  S.E1 = hit.find((e) => e.name === 'Caño PVC desagüe 110mm') || hit[0]
  check(F, 'búsqueda difusa sin acentos encuentra el caño', !!S.E1, `hits=${hit.length}`)
  S.E2 = allEls.find((e) => e.name === 'Membrana líquida 20kg')
  S.E3 = allEls.find((e) => e.name === 'Látex interior 20L blanco')
  S.E4 = allEls.find((e) => e.name === 'Caño PVC 63mm')
  if (!S.E1 || !S.E2 || !S.E3 || !S.E4) throw new Error('Faltan elementos base del catálogo (¿corriste el seeder?)')

  // alta de stock
  st(F, 'alta de stock sin sesión', await post(ANON, '/api/provider/stock', { elementId: S.E1.id, price: 1 }), 401)
  st(F, 'alta de stock como cliente', await post(C, '/api/provider/stock', { elementId: S.E1.id, price: 1 }), 403)
  st(F, 'alta de stock sin precio', await post(V, '/api/provider/stock', { elementId: S.E1.id }), 400)
  st(F, 'alta de stock con precio negativo', await post(V, '/api/provider/stock', { elementId: S.E1.id, price: -10, quantity: 5 }), 400)
  st(F, 'alta de stock con cantidad no numérica', await post(V, '/api/provider/stock', { elementId: S.E1.id, price: 10, quantity: 'muchos' }), 400)
  st(F, 'alta de stock con elemento inexistente', await post(V, '/api/provider/stock', { elementId: 'no-existe', price: 10, quantity: 5 }), 404)
  const s1 = await post(V, '/api/provider/stock', { elementId: S.E1.id, price: 1500, quantity: 100, minStock: 5, brand: `${MARK} Tigre` })
  st(F, 'alta de stock caño', s1, 201)
  S.stock1 = s1.data?.stock?.id
  st(F, 'alta duplicada del mismo elemento', await post(V, '/api/provider/stock', { elementId: S.E1.id, price: 1500, quantity: 1 }), 409)
  const s2 = await post(V, '/api/provider/stock', { elementId: S.E2.id, price: 25000, quantity: 3, minStock: 5 })
  st(F, 'alta de stock membrana (poco stock)', s2, 201)
  S.stock2 = s2.data?.stock?.id
  check(F, 'stock con poca cantidad queda "por_agotar"', s2.data?.stock?.status === 'por_agotar', brief(s2))
  const s3 = await post(V, '/api/provider/stock', { elementId: S.E3.id, price: 2000, quantity: 50, minStock: 2, brand: `${MARK} Alba` })
  st(F, 'alta de stock látex', s3, 201)
  S.stock3 = s3.data?.stock?.id
  const s4 = await post(V, '/api/provider/stock', { elementId: S.E4.id, price: 900, quantity: 10 })
  st(F, 'alta de stock para borrar', s4, 201)
  S.stock4 = s4.data?.stock?.id
  check(F, 'movimiento de entrada inicial registrado', (await db.stockMovement.count({ where: { stockId: S.stock1, type: 'entrada' } })) === 1)

  // edición
  const ed = await patch(V, '/api/provider/stock', { id: S.stock1, price: 1600, quantity: 120, minStock: 10, brand: `${MARK} Tigre Plus` })
  st(F, 'editar precio/cantidad/mínimo/marca', ed, 200)
  const dbS1 = await db.providerStock.findUnique({ where: { id: S.stock1 } })
  check(F, 'edición persistida en DB', dbS1.price === 1600 && dbS1.quantity === 120 && dbS1.minStock === 10 && dbS1.brand === `${MARK} Tigre Plus`, JSON.stringify(dbS1))
  check(F, 'edición registra movimiento (+20)', (await db.stockMovement.count({ where: { stockId: S.stock1, quantity: 20 } })) === 1)
  st(F, 'editar con precio negativo', await patch(V, '/api/provider/stock', { id: S.stock1, price: -1 }), 400)
  st(F, 'editar stock ajeno (cliente)', await patch(C, '/api/provider/stock', { id: S.stock1, price: 1 }), 403)
  const sAgot = await patch(V, '/api/provider/stock', { id: S.stock4, quantity: 0 })
  check(F, 'cantidad 0 → agotado', sAgot.data?.stock?.status === 'agotado', brief(sAgot))

  // listado con búsqueda difusa (sin acento y por alias)
  const lq = await get(V, '/api/provider/stock?q=cano')
  check(F, 'mi stock: búsqueda "cano" (sin ñ) encuentra el caño', (lq.data?.stock || []).some((s) => s.id === S.stock1), brief(lq))
  const la = await get(V, '/api/provider/stock?q=cloacal')
  check(F, 'mi stock: búsqueda por alias "cloacal"', (la.data?.stock || []).some((s) => s.id === S.stock1), brief(la))
  const lc = await get(V, `/api/provider/stock?cat=${S.E3.categorySlug}`)
  check(F, 'mi stock: filtro por categoría', (lc.data?.stock || []).length >= 1 && lc.data.stock.every((s) => s.categorySlug === S.E3.categorySlug), brief(lc))

  // borrado
  st(F, 'borrar stock sin id', await del(V, '/api/provider/stock'), 400)
  st(F, 'borrar stock inexistente', await del(V, '/api/provider/stock?id=no-existe'), 404)
  st(F, 'borrar stock', await del(V, `/api/provider/stock?id=${S.stock4}`), 200)
  check(F, 'stock borrado de la DB', !(await db.providerStock.findUnique({ where: { id: S.stock4 } })))

  // alta de elemento con IA
  const catId = allEls.find((e) => e.id === S.E3.id).categoryId
  st(F, 'alta IA como cliente', await post(C, '/api/catalog', { name: 'Algo nuevo', categoryId: catId }), 403)
  st(F, 'alta IA sin sesión', await post(ANON, '/api/catalog', { name: 'Algo nuevo', categoryId: catId }), 401)
  st(F, 'alta IA con datos inválidos', await post(V, '/api/catalog', { name: 'ab', categoryId: catId }), 400)
  st(F, 'alta IA con categoría inexistente', await post(V, '/api/catalog', { name: 'Elemento válido', categoryId: 'nope' }), 400)
  const dup = await post(V, '/api/catalog', { name: 'latex interior 20l blanco', categoryId: catId })
  check(F, 'anti-duplicado (sin acentos/mayúsculas) devuelve el existente', dup.status === 200 && dup.data?.existing === true && dup.data?.element?.id === S.E3.id, brief(dup))
  const newName = `E2E-Q Pintura zqxv ${String(TS).slice(-5)}`
  const ai = await post(V, '/api/catalog', { name: newName, categoryId: catId })
  check(F, 'alta de elemento nuevo con IA', ai.status === 200 && ai.data?.existing === false && !!ai.data?.element?.id, brief(ai))
  if (ai.data?.element?.id) manifest.catalogElementIds.push(ai.data.element.id)
  check(F, 'elemento nuevo con descripción y unidad', (ai.data?.element?.description || '').length >= 20 && !!ai.data?.element?.unit, brief(ai))
  const ai2 = await post(V, '/api/catalog', { name: newName.toUpperCase(), categoryId: catId })
  check(F, 'segundo alta del mismo nombre → existente (no duplica)', ai2.data?.existing === true && ai2.data?.element?.id === ai.data?.element?.id, brief(ai2))

  // plan y analítica
  const plan = await get(V, '/api/provider/plan')
  st(F, 'plan del proveedor', plan, 200)
  check(F, 'plan en trial activo con días restantes', plan.data?.plan?.plan === 'trial' && plan.data?.plan?.activo === true && plan.data?.plan?.trialDaysLeft >= 13, brief(plan))
  st(F, 'plan como cliente', await get(C, '/api/provider/plan'), 403)
  const an = await get(V, '/api/provider/analytics')
  check(F, 'analítica en trial → 403 needsPro', an.status === 403 && an.data?.needsPro === true, brief(an))
  st(F, 'analítica sin sesión', await get(ANON, '/api/provider/analytics'), 401)
}

// ═════════════════════════════ C. BÚSQUEDA ═════════════════════════════
async function flowC() {
  const F = 'C'
  const loc = `&lat=${CABA.lat}&lng=${CABA.lng}&radius=25`
  const sc = await get(C, `/api/search?mode=cliente&q=pintura${loc}`)
  st(F, 'search cliente', sc, 200)
  check(F, 'search cliente trae al profesional E2E', JSON.stringify(sc.data).includes(P.proId), brief(sc))
  const sp = await get(P, `/api/search?mode=profesional&q=caño${loc}`)
  st(F, 'search profesional', sp, 200)
  check(F, 'search profesional trae el stock de caño E2E', JSON.stringify(sp.data).includes(S.stock1), brief(sp))
  const pins = await get(C, `/api/search/pins?mode=cliente${loc}`)
  st(F, 'pins del mapa', pins, 200)
  check(F, 'pins incluyen al profesional E2E', JSON.stringify(pins.data).includes(P.proId), brief(pins))
  const dp = await get(C, '/api/directory?kind=profesional&cat=pintura')
  st(F, 'directorio profesionales por rubro', dp, 200)
  check(F, 'directorio incluye al pro E2E', JSON.stringify(dp.data).includes(P.proId), brief(dp))
  const dv = await get(C, '/api/directory?kind=proveedor')
  check(F, 'directorio incluye al proveedor E2E', JSON.stringify(dv.data).includes(V.provId), brief(dv))
  const dq = await get(C, '/api/directory?kind=profesional&cat=plomeria')
  check(F, 'filtro de rubro excluye al pro E2E (pinta, no plomería)', dq.status === 200 && !JSON.stringify(dq.data).includes(P.proId), brief(dq))
  const dpm = await get(C, '/api/directory?kind=proveedor&priceMin=999999999')
  check(F, 'filtro de precio responde', dpm.status === 200, brief(dpm))

  const offerOf = (r, stockId) => (r.data?.results || []).some((e) => (e.offers || []).some((o) => o.stockId === stockId))
  const m1 = await get(C, '/api/marketplace?q=caño')
  st(F, 'marketplace "caño"', m1, 200)
  check(F, 'marketplace "caño" trae la oferta E2E', offerOf(m1, S.stock1), `results=${m1.data?.results?.length}`)
  const m2 = await get(C, '/api/marketplace?q=cano')
  check(F, 'marketplace "cano" (sin ñ) trae la oferta E2E', offerOf(m2, S.stock1), `results=${m2.data?.results?.length}`)
  const m3 = await get(C, '/api/marketplace?q=cloacal')
  check(F, 'marketplace por alias "cloacal" trae la oferta E2E', offerOf(m3, S.stock1), `results=${m3.data?.results?.length}`)
  const m4 = await get(C, '/api/marketplace?q=membrana liquida')
  check(F, 'marketplace muestra stock "por agotar" (quedan 3, se puede comprar)', offerOf(m4, S.stock2), `results=${m4.data?.results?.length}`, 'src/app/api/marketplace/route.ts:56,58,90')
  const sev = await db.searchEvent.count({ where: { userId: C.id, mode: 'materiales' } })
  check(F, 'marketplace registra la búsqueda para analítica', sev >= 3, `eventos=${sev}`)

  const pp = await get(C, `/api/profiles/professional/${P.proId}`)
  st(F, 'perfil público del profesional', pp, 200)
  st(F, 'perfil del profesional sin sesión', await get(ANON, `/api/profiles/professional/${P.proId}`), 401)
  st(F, 'perfil de profesional inexistente', await get(C, '/api/profiles/professional/no-existe'), 404)
  const pv = await get(C, `/api/profiles/provider/${V.provId}`)
  st(F, 'perfil público del proveedor', pv, 200)
  check(F, 'perfil del proveedor lista su stock', (pv.data?.stock || []).some((s) => s.id === S.stock1), brief(pv))
  const jobs = await get(ANON, '/api/jobs')
  st(F, 'bolsa de trabajos pública', jobs, 200)

  // D20: esta suite necesita el server con HIDE_DEMO_USERS distinto de 1 (sus usuarios son @homia.test).
  // Con el flag apagado, las cuentas demo se ven como siempre. La prueba con el flag prendido
  // está aparte: scratch/visibilidad-demo.mjs (levanta el server con HIDE_DEMO_USERS=1).
  const demoPro = await db.professionalProfile.findFirst({ where: { user: { email: 'profesional@homia.test' } }, select: { id: true } })
  if (demoPro) {
    const dd = await get(C, '/api/directory?kind=profesional')
    check(F, 'con HIDE_DEMO_USERS apagado, el profesional demo está en el directorio', JSON.stringify(dd.data).includes(demoPro.id), 'si falla: el server corre con HIDE_DEMO_USERS=1')
    st(F, 'con HIDE_DEMO_USERS apagado, el perfil demo se ve', await get(C, `/api/profiles/professional/${demoPro.id}`), 200)
  }
}

// ═════════════════════════════ I. MENSAJERÍA ═════════════════════════════
async function flowI() {
  const F = 'I'
  const r1 = await post(P2, '/api/messages/conversations', { targetUserId: C.id })
  check(F, 'profesional NO puede iniciar chat con un cliente', r1.status === 403 && r1.data?.clientesFirst === true, brief(r1))
  // Cliente propio de esta sección: con C, V ya puede tener un hilo abierto por una compra de C
  // (sección A, mails), y entonces el POST devuelve ese hilo en vez de 403, que es lo correcto.
  const CI = new Actor('clientei', 'cliente')
  CI.ip = `10.253.${(TS >> 8) & 255}.${TS & 255}`
  st(F, 'registro de un cliente sin chats previos', await registrar(CI, { email: CI.email, password: PASSWORD, displayName: `${MARK} Cliente I`, roles: ['cliente'], howFoundUs: 'otro', acceptTerms: true }), 201)
  CI.id = (await db.user.findUnique({ where: { email: CI.email } }))?.id
  const r2 = await post(V, '/api/messages/conversations', { targetUserId: CI.id })
  check(F, 'proveedor NO puede iniciar chat con un cliente', r2.status === 403 && r2.data?.clientesFirst === true, brief(r2))
  st(F, 'iniciar chat sin sesión', await post(ANON, '/api/messages/conversations', { targetUserId: P.id }), 401)
  st(F, 'iniciar chat consigo mismo', await post(C, '/api/messages/conversations', { targetUserId: C.id }), 400)
  st(F, 'iniciar chat con usuario inexistente', await post(C, '/api/messages/conversations', { targetUserId: 'no-existe' }), 404)
  const conv = await post(C, '/api/messages/conversations', { targetUserId: P.id })
  st(F, 'cliente inicia chat con profesional', conv, 201)
  S.convCP = conv.data?.conversation?.id
  const again = await post(C, '/api/messages/conversations', { targetUserId: P.id })
  check(F, 'reabrir el mismo chat reutiliza la conversación', again.status === 200 && again.data?.conversation?.id === S.convCP, brief(again))
  st(F, 'mensaje vacío', await post(C, `/api/messages/conversations/${S.convCP}`, { body: '   ' }), 400)
  st(F, 'cliente envía mensaje', await post(C, `/api/messages/conversations/${S.convCP}`, { body: `${MARK} Hola, necesito pintar un ambiente` }), 201)
  const u1 = await get(P, '/api/messages/unread')
  check(F, 'profesional tiene 1 no leído', u1.data?.total === 1, brief(u1))
  const th = await get(P, `/api/messages/conversations/${S.convCP}`)
  st(F, 'profesional abre el hilo', th, 200)
  check(F, 'el hilo trae el mensaje', (th.data?.messages || []).length === 1, brief(th))
  check(F, 'abrir el hilo marca leído (readAt)', !!(await db.message.findFirst({ where: { conversationId: S.convCP } }))?.readAt)
  const u2 = await get(P, '/api/messages/unread')
  check(F, 'no leídos del profesional vuelven a 0', u2.data?.total === 0, brief(u2))
  st(F, 'profesional responde en el hilo existente', await post(P, `/api/messages/conversations/${S.convCP}`, { body: `${MARK} ¡Hola! Te paso presupuesto` }), 201)
  const u3 = await get(C, '/api/messages/unread')
  check(F, 'cliente tiene 1 no leído', u3.data?.total === 1, brief(u3))
  const list = await get(C, '/api/messages/conversations')
  const item = (list.data?.conversations || []).find((c) => c.id === S.convCP)
  check(F, 'bandeja del cliente con último mensaje y no leídos', item?.unread === 1 && item?.lastMessage?.mine === false && item?.otherProfileHref === `/profesional/${P.proId}`, JSON.stringify(item))
  st(F, 'tercero no ve la conversación', await get(P2, `/api/messages/conversations/${S.convCP}`), 403)
  st(F, 'tercero no escribe en la conversación', await post(P2, `/api/messages/conversations/${S.convCP}`, { body: 'hola' }), 403)
  st(F, 'conversación inexistente', await get(C, '/api/messages/conversations/no-existe'), 404)
  st(F, 'bandeja sin sesión', await get(ANON, '/api/messages/conversations'), 401)
  const pp = await post(P, '/api/messages/conversations', { targetUserId: P2.id })
  check(F, 'entre profesionales se puede iniciar', pp.status === 201 || pp.status === 200, brief(pp))

  // ── cursor de mensajes nuevos (?after=), no leídos, acuse y orden ──
  const full = await get(C, `/api/messages/conversations/${S.convCP}`)
  const fullMsgs = full.data?.messages || []
  check(F, 'hilo en orden ascendente', fullMsgs.length === 2 && fullMsgs.every((m, i) => i === 0 || m.createdAt >= fullMsgs[i - 1].createdAt), brief(full))
  const cursor = fullMsgs[fullMsgs.length - 1]?.createdAt
  st(F, 'cliente envía 1/2', await post(C, `/api/messages/conversations/${S.convCP}`, { body: `${MARK} nuevo 1` }), 201)
  st(F, 'cliente envía 2/2', await post(C, `/api/messages/conversations/${S.convCP}`, { body: `${MARK} nuevo 2` }), 201)
  const uP = await get(P, '/api/messages/unread')
  check(F, 'no leídos del profesional = 2', uP.data?.total === 2, brief(uP))
  const inboxP = await get(P, '/api/messages/conversations')
  const itP = (inboxP.data?.conversations || []).find((c) => c.id === S.convCP)
  check(F, 'bandeja: no leídos y último mensaje por conversación', itP?.unread === 2 && itP?.lastMessage?.body === `${MARK} nuevo 2` && itP?.lastMessage?.mine === false, JSON.stringify(itP))
  check(F, 'bandeja ordenada por último mensaje', (inboxP.data?.conversations || [])[0]?.id === S.convCP, JSON.stringify((inboxP.data?.conversations || []).map((c) => c.id)))
  const inc = await get(P, `/api/messages/conversations/${S.convCP}?after=${encodeURIComponent(cursor)}`)
  const incBodies = (inc.data?.messages || []).map((m) => m.body)
  check(F, 'cursor ?after= trae solo lo nuevo (y el borde)', inc.status === 200 && inc.data?.incremental === true && incBodies.length === 3 && incBodies[1] === `${MARK} nuevo 1` && incBodies[2] === `${MARK} nuevo 2`, brief(inc))
  const uP2 = await get(P, '/api/messages/unread')
  check(F, 'pedir lo nuevo marca leído (no leídos = 0)', uP2.data?.total === 0, brief(uP2))
  const incC = await get(C, `/api/messages/conversations/${S.convCP}?after=${encodeURIComponent(cursor)}`)
  const lastC = (incC.data?.messages || []).slice(-1)[0]
  check(F, 'acuse de lectura: readUpTo cubre el último mensaje del cliente', !!incC.data?.readUpTo && !!lastC && incC.data.readUpTo >= lastC.createdAt, brief(incC))
  const leidos = await db.message.count({ where: { conversationId: S.convCP, senderId: C.id, readAt: null } })
  check(F, 'readAt guardado en la base para los mensajes leídos', leidos === 0, `sin leer=${leidos}`)
  const readRow = await db.message.findFirst({ where: { conversationId: S.convCP, body: `${MARK} nuevo 2` } })
  check(F, 'readAt en hora UTC (no corrida por zona horaria)', !!readRow?.readAt && Math.abs(readRow.readAt.getTime() - Date.now()) < 5 * 60_000, `${readRow?.readAt?.toISOString()}`)
  st(F, 'cursor inválido → 400', await get(P, `/api/messages/conversations/${S.convCP}?after=ayer`), 400)
  st(F, 'tercero con cursor → 403', await get(P2, `/api/messages/conversations/${S.convCP}?after=${encodeURIComponent(cursor)}`), 403)
  st(F, 'mensaje de más de 4000 caracteres', await post(C, `/api/messages/conversations/${S.convCP}`, { body: 'x'.repeat(4001) }), 400)
  if (pp.data?.conversation?.id) {
    await post(P, `/api/messages/conversations/${pp.data.conversation.id}`, { body: `${MARK} hola colega` })
    const inboxP2 = await get(P, '/api/messages/conversations')
    check(F, 'la conversación con el mensaje más nuevo sube primera', (inboxP2.data?.conversations || [])[0]?.id === pp.data.conversation.id, JSON.stringify((inboxP2.data?.conversations || []).map((c) => c.id)))
  }
}

// ═════════════════════════════ D. TRABAJOS ═════════════════════════════
async function flowD() {
  const F = 'D'
  const job = { title: `${MARK} Pintar living 20m2`, description: `${MARK} Pintura de living con látex blanco, 2 manos`, categorySlug: 'pintura', urgency: 'normal', budgetMin: 10000, budgetMax: 50000, address: 'Calle Falsa 123', lat: CABA.lat, lng: CABA.lng }
  st(F, 'publicar sin sesión', await post(ANON, '/api/jobs', job), 401)
  st(F, 'publicar sin título', await post(C, '/api/jobs', { ...job, title: '' }), 400)
  st(F, 'publicar con mínimo > máximo', await post(C, '/api/jobs', { ...job, budgetMin: 60000 }), 400)
  st(F, 'publicar con presupuesto negativo', await post(C, '/api/jobs', { ...job, budgetMin: -5 }), 400)
  st(F, 'publicar con rubro inexistente', await post(C, '/api/jobs', { ...job, categorySlug: 'rubro-que-no-existe' }), 400)
  st(F, 'publicar con ubicación inválida', await post(C, '/api/jobs', { ...job, lat: 'acá' }), 400)
  st(F, 'publicar con urgencia inválida', await post(C, '/api/jobs', { ...job, urgency: 'ayer' }), 400)
  const jobPhoto = (await upload(C, 'jobs', 31)).data?.url
  const r = await post(C, '/api/jobs', { ...job, photos: [jobPhoto, 'https://evil.example.com/a.jpg'] })
  st(F, 'cliente publica trabajo (con foto)', r, 201)
  S.job = r.data?.job?.id
  check(F, 'fotos del trabajo: solo subidas de HomIA', JSON.stringify(JSON.parse(r.data?.job?.photos || '[]')) === JSON.stringify([jobPhoto]), r.data?.job?.photos)
  check(F, 'trabajo abierto en DB', (await db.jobPost.findUnique({ where: { id: S.job } }))?.status === 'abierto')
  check(F, 'profesionales del rubro notificados', !!(await db.notification.findFirst({ where: { userId: P.id, type: 'nuevo_trabajo', link: `#/trabajo/${S.job}` } })))

  const pub = await get(ANON, `/api/jobs/${S.job}`)
  st(F, 'detalle público del trabajo', pub, 200)
  check(F, 'detalle público sin dirección exacta ni coords precisas', pub.data?.job?.address === null && pub.data?.job?.lat === Math.round(CABA.lat * 100) / 100, brief(pub))
  const priv = await get(P, `/api/jobs/${S.job}`)
  check(F, 'detalle con sesión trae la dirección', priv.data?.job?.address === 'Calle Falsa 123', brief(priv))
  st(F, 'detalle de trabajo inexistente', await get(P, '/api/jobs/no-existe'), 404)
  const bolsa = await get(P, `/api/jobs?cat=pintura&lat=${CABA.lat}&lng=${CABA.lng}&radius=25`)
  check(F, 'el profesional lo ve en la bolsa', (bolsa.data?.jobs || []).some((j) => j.id === S.job), brief(bolsa))
  const mine = await get(C, '/api/jobs?mine=1')
  check(F, 'mis trabajos (cliente)', (mine.data?.jobs || []).some((j) => j.id === S.job), brief(mine))

  // ofertas
  st(F, 'cliente no puede ofertar', await post(C, `/api/jobs/${S.job}/bids`, { amount: 1000 }), 403)
  st(F, 'oferta con monto 0', await post(P, `/api/jobs/${S.job}/bids`, { amount: 0 }), 400)
  st(F, 'oferta con monto en texto', await post(P, `/api/jobs/${S.job}/bids`, { amount: 'mil' }), 400)
  st(F, 'oferta con plazo inválido', await post(P, `/api/jobs/${S.job}/bids`, { amount: 1000, timelineDays: 'mañana' }), 400)
  const b1 = await post(P, `/api/jobs/${S.job}/bids`, { amount: 30000, timelineDays: 5, message: `${MARK} Incluye enduido` })
  st(F, 'profesional oferta', b1, 201)
  S.bidP = b1.data?.bid?.id
  check(F, 'cliente notificado de la oferta', !!(await db.notification.findFirst({ where: { userId: C.id, type: 'nuevo_presupuesto' } })))
  const b1e = await post(P, `/api/jobs/${S.job}/bids`, { amount: 32000, message: '' })
  st(F, 'profesional edita la oferta', b1e, 200)
  const dbBid = await db.jobBid.findUnique({ where: { id: S.bidP } })
  check(F, 'editar con mensaje vacío no pisa el anterior', dbBid.message === `${MARK} Incluye enduido` && dbBid.amount === 32000, JSON.stringify(dbBid))
  st(F, 'otro no puede retirar la oferta', await patch(P2, `/api/bids/${S.bidP}`, { action: 'retirar' }), 403)
  st(F, 'profesional retira la oferta', await patch(P, `/api/bids/${S.bidP}`, { action: 'retirar' }), 200)
  st(F, 'retirar dos veces', await patch(P, `/api/bids/${S.bidP}`, { action: 'retirar' }), 409)
  st(F, 'no se acepta una oferta retirada', await patch(C, `/api/bids/${S.bidP}`, { action: 'aceptar' }), 409)
  const b1r = await post(P, `/api/jobs/${S.job}/bids`, { amount: 31000 })
  check(F, 're-oferta reactiva como pendiente', b1r.status === 200 && b1r.data?.bid?.status === 'pendiente' && b1r.data?.bid?.id === S.bidP, brief(b1r))
  const b2 = await post(P2, `/api/jobs/${S.job}/bids`, { amount: 28000, message: `${MARK} oferta 2` })
  st(F, 'segundo profesional oferta', b2, 201)
  S.bidP2 = b2.data?.bid?.id

  const bc = await get(C, `/api/jobs/${S.job}/bids`)
  check(F, 'dueño ve todas las ofertas', bc.data?.bids?.length === 2 && bc.data?.isOwner === true, brief(bc))
  const bp = await get(P, `/api/jobs/${S.job}/bids`)
  check(F, 'profesional ve solo la suya', bp.data?.bids?.length === 1 && bp.data.bids[0].id === S.bidP, brief(bp))
  st(F, 'proveedor no ve ofertas', await get(V, `/api/jobs/${S.job}/bids`), 403)
  st(F, 'acción de oferta inválida', await patch(C, `/api/bids/${S.bidP}`, { action: 'hackear' }), 400)
  st(F, 'profesional no puede aceptar', await patch(P2, `/api/bids/${S.bidP}`, { action: 'aceptar' }), 403)

  const acc = await patch(C, `/api/bids/${S.bidP}`, { action: 'aceptar' })
  st(F, 'cliente acepta la oferta', acc, 200)
  S.project1 = acc.data?.project?.id
  const [j, bidA, bidB, proj] = await Promise.all([
    db.jobPost.findUnique({ where: { id: S.job } }),
    db.jobBid.findUnique({ where: { id: S.bidP } }),
    db.jobBid.findUnique({ where: { id: S.bidP2 } }),
    db.project.findUnique({ where: { id: S.project1 || 'x' } }),
  ])
  check(F, 'aceptar crea el proyecto con la mano de obra ofertada', proj?.laborCost === 31000 && proj?.clientId === C.id && proj?.professionalId === P.proId, JSON.stringify(proj))
  check(F, 'el proyecto hereda el brief del trabajo (presupuesto, dirección, fotos)', proj?.budgetMin === 10000 && proj?.budgetMax === 50000 && proj?.address === 'Calle Falsa 123' && (proj?.photos || '').includes('/jobs/'), JSON.stringify(proj))
  check(F, 'trabajo pasa a en_proceso con bid seleccionado', j.status === 'en_proceso' && j.selectedBidId === S.bidP, JSON.stringify(j))
  check(F, 'oferta aceptada', bidA.status === 'aceptado')
  check(F, 'las otras ofertas quedan rechazadas', bidB.status === 'rechazado')
  st(F, 'aceptar dos veces', await patch(C, `/api/bids/${S.bidP}`, { action: 'aceptar' }), 409)
  st(F, 'retirar oferta ya rechazada', await patch(P2, `/api/bids/${S.bidP2}`, { action: 'retirar' }), 409)
  st(F, 'ofertar en trabajo en proceso', await post(P2, `/api/jobs/${S.job}/bids`, { amount: 1000 }), 400)

  const mb = await get(P, '/api/bids?mine=1')
  const mine1 = (mb.data?.bids || []).find((b) => b.id === S.bidP)
  check(F, 'mis ofertas: aceptada con link al proyecto', mine1?.status === 'aceptado' && mine1?.projectId === S.project1, brief(mb))
  const mb2 = await get(P2, '/api/bids?mine=1')
  check(F, 'mis ofertas del 2º pro: rechazada', (mb2.data?.bids || []).find((b) => b.id === S.bidP2)?.status === 'rechazado', brief(mb2))
  st(F, 'GET /api/bids sin mine=1', await get(P, '/api/bids'), 400)
  st(F, 'mis ofertas como cliente', await get(C, '/api/bids?mine=1'), 403)

  // estado del trabajo
  st(F, 'estado de trabajo libre', await patch(C, `/api/jobs/${S.job}`, { status: 'hackeado' }), 400)
  st(F, 'otro usuario no cambia el trabajo', await patch(P, `/api/jobs/${S.job}`, { status: 'cerrado' }), 403)
  st(F, 'no se reabre un trabajo con proyecto en curso', await patch(C, `/api/jobs/${S.job}`, { status: 'abierto' }), 409)
  check(F, 'el trabajo sigue en_proceso', (await db.jobPost.findUnique({ where: { id: S.job } })).status === 'en_proceso')
  // trabajo 2: cancelar y reabrir un abierto
  const r2 = await post(C, '/api/jobs', { ...job, title: `${MARK} Trabajo para cancelar` })
  S.job2 = r2.data?.job?.id
  st(F, 'cancelar trabajo abierto', await patch(C, `/api/jobs/${S.job2}`, { status: 'cancelado' }), 200)
  st(F, 'reabrir trabajo cancelado sin proyecto', await patch(C, `/api/jobs/${S.job2}`, { status: 'abierto' }), 200)
  st(F, 'cerrar trabajo', await patch(C, `/api/jobs/${S.job2}`, { status: 'cerrado' }), 200)

  await flowD16()
}

// D16 — "Contratar" eligiendo un trabajo publicado (el cierre del trabajo es el mismo que aceptar una oferta)
async function flowD16() {
  const F = 'D'
  const base = { title: `${MARK} D16 trabajo`, description: `${MARK} Pintar un pasillo de 8 m2`, categorySlug: 'pintura', urgency: 'alta', budgetMin: 15000, budgetMax: 40000, address: 'Pasaje D16 45', lat: CABA.lat, lng: CABA.lng }
  const j3 = await post(C, '/api/jobs', { ...base, title: `${MARK} D16 contrato a otro` })
  const j4 = await post(C, '/api/jobs', { ...base, title: `${MARK} D16 contrato al que ofertó` })
  S.jobD16a = j3.data?.job?.id
  S.jobD16b = j4.data?.job?.id
  check(F, 'D16: dos trabajos publicados para elegir', !!S.jobD16a && !!S.jobD16b, brief(j3))
  const bP2 = await post(P2, `/api/jobs/${S.jobD16a}/bids`, { amount: 21000, message: `${MARK} oferta D16 del pro2` })
  st(F, 'D16: pro2 oferta en el trabajo A', bP2, 201)
  const bP = await post(P, `/api/jobs/${S.jobD16b}/bids`, { amount: 26000, message: `${MARK} oferta D16 del pro` })
  st(F, 'D16: pro oferta en el trabajo B', bP, 201)
  const bP2b = await post(P2, `/api/jobs/${S.jobD16b}/bids`, { amount: 24000 })
  st(F, 'D16: pro2 también oferta en el trabajo B', bP2b, 201)

  // selector: GET /api/projects/hire-sources
  st(F, 'D16: fuentes del selector sin sesión', await get(ANON, '/api/projects/hire-sources'), 401)
  st(F, 'D16: fuentes con query inválida', await get(C, `/api/projects/hire-sources?professionalProfileId=${'x'.repeat(80)}`), 400)
  const hs = await get(C, `/api/projects/hire-sources?professionalProfileId=${P.proId}`)
  const hA = (hs.data?.jobs || []).find((j) => j.id === S.jobD16a)
  const hB = (hs.data?.jobs || []).find((j) => j.id === S.jobD16b)
  check(F, 'D16: el cliente ve sus trabajos abiertos con ofertas y rubro', hs.status === 200 && hA?.bidsCount === 1 && hB?.bidsCount === 2 && hA?.categorySlug === 'pintura' && !!hA?.categoryName, brief(hs))
  check(F, 'D16: marca la oferta del profesional a contratar', hA?.targetBidAmount === null && hB?.targetBidAmount === 26000, JSON.stringify([hA, hB])?.slice(0, 300))
  check(F, 'D16: no lista trabajos cerrados ni en proceso', !(hs.data?.jobs || []).some((j) => j.id === S.job || j.id === S.job2))
  check(F, 'D16: cliente sin perfil pro → sin proyectos para subcontratar', Array.isArray(hs.data?.projects) && hs.data.projects.length === 0, brief(hs))
  const hsP2 = await get(P2, '/api/projects/hire-sources')
  check(F, 'D16: nunca devuelve trabajos de otro usuario', hsP2.status === 200 && !(hsP2.data?.jobs || []).some((j) => j.id === S.jobD16a || j.id === S.jobD16b), brief(hsP2))

  const wz = { professionalProfileId: P.proId, title: `${MARK} D16 contrato a otro`, description: `${MARK} Pintar un pasillo de 8 m2`, budgetMin: 15000, budgetMax: 40000, urgency: 'ya', categorySlug: 'pintura', address: 'Pasaje D16 45' }
  st(F, 'D16: trabajo y proyecto a la vez', await post(C, '/api/projects', { ...wz, jobId: S.jobD16a, parentProjectId: S.project1 }), 400)
  st(F, 'D16: trabajo inexistente', await post(C, '/api/projects', { ...wz, jobId: 'no-existe' }), 404)
  st(F, 'D16: trabajo ajeno (IDOR)', await post(P, '/api/projects', { ...wz, professionalProfileId: P2.proId, jobId: S.jobD16a }), 403)
  st(F, 'D16: trabajo no abierto (en proceso)', await post(C, '/api/projects', { ...wz, jobId: S.job }), 409)
  st(F, 'D16: trabajo cerrado', await post(C, '/api/projects', { ...wz, jobId: S.job2 }), 409)
  check(F, 'D16: los rechazos no tocaron el trabajo ni sus ofertas', (await db.jobPost.findUnique({ where: { id: S.jobD16a } })).status === 'abierto' && (await db.jobBid.findUnique({ where: { id: bP2.data?.bid?.id } })).status === 'pendiente')

  // A) contrata a OTRO profesional (P) eligiendo el trabajo donde ofertó P2
  const hA1 = await post(C, '/api/projects', { ...wz, jobId: S.jobD16a })
  st(F, 'D16: cliente contrata a otro pro eligiendo su trabajo', hA1, 201)
  S.projD16a = hA1.data?.project?.id
  const [jA, bidA2, prA] = await Promise.all([
    db.jobPost.findUnique({ where: { id: S.jobD16a } }),
    db.jobBid.findUnique({ where: { id: bP2.data?.bid?.id } }),
    db.project.findUnique({ where: { id: S.projD16a || 'x' } }),
  ])
  check(F, 'D16: proyecto con jobId, sin cotizar y con el brief editado', prA?.jobId === S.jobD16a && prA?.laborCost === 0 && prA?.urgency === 'ya' && prA?.lat === CABA.lat && prA?.parentProjectId === null, JSON.stringify(prA))
  check(F, 'D16: trabajo en_proceso sin oferta seleccionada', jA.status === 'en_proceso' && jA.selectedBidId === null, JSON.stringify(jA))
  check(F, 'D16: la oferta del otro pro queda rechazada', bidA2.status === 'rechazado')
  check(F, 'D16: el pro rechazado recibe el aviso', !!(await db.notification.findFirst({ where: { userId: P2.id, type: 'presupuesto_rechazado', title: 'El cliente contrató a otro profesional para este trabajo', body: { contains: 'D16 contrato a otro' } } })))
  check(F, 'D16: el contratado recibe el aviso con el trabajo de origen', !!(await db.notification.findFirst({ where: { userId: P.id, type: 'contratacion', link: `#/panel/profesional/proyectos/${S.projD16a}`, body: { contains: 'trabajo publicado' } } })))
  st(F, 'D16: el mismo trabajo no se contrata dos veces', await post(C, '/api/projects', { ...wz, professionalProfileId: P2.proId, jobId: S.jobD16a }), 409)
  const hs2 = await get(C, '/api/projects/hire-sources')
  check(F, 'D16: el trabajo contratado sale del selector', !(hs2.data?.jobs || []).some((j) => j.id === S.jobD16a), brief(hs2))

  // B) contrata al MISMO pro que ofertó → su oferta queda aceptada con su monto
  const hB1 = await post(C, '/api/projects', { ...wz, title: `${MARK} D16 contrato al que ofertó`, jobId: S.jobD16b })
  st(F, 'D16: cliente contrata al pro que ofertó eligiendo su trabajo', hB1, 201)
  S.projD16b = hB1.data?.project?.id
  const [jB, bidBP, bidBP2, prB] = await Promise.all([
    db.jobPost.findUnique({ where: { id: S.jobD16b } }),
    db.jobBid.findUnique({ where: { id: bP.data?.bid?.id } }),
    db.jobBid.findUnique({ where: { id: bP2b.data?.bid?.id } }),
    db.project.findUnique({ where: { id: S.projD16b || 'x' } }),
  ])
  check(F, 'D16: su oferta queda aceptada y seleccionada', bidBP.status === 'aceptado' && jB.status === 'en_proceso' && jB.selectedBidId === bidBP.id, JSON.stringify(jB))
  check(F, 'D16: la mano de obra es la de su oferta', prB?.laborCost === 26000 && prB?.jobId === S.jobD16b, JSON.stringify(prB))
  check(F, 'D16: la otra oferta queda rechazada con aviso', bidBP2.status === 'rechazado' && !!(await db.notification.findFirst({ where: { userId: P2.id, title: 'El cliente contrató a otro profesional para este trabajo', body: { contains: 'D16 contrato al que ofertó' } } })))
  check(F, 'D16: el contratado recibe "te contrataron por tu oferta"', !!(await db.notification.findFirst({ where: { userId: P.id, type: 'presupuesto_aceptado', link: `#/panel/profesional/proyectos/${S.projD16b}` } })))
  const mbP = await get(P, '/api/bids?mine=1')
  check(F, 'D16: "mis ofertas" la muestra aceptada con link al proyecto', (mbP.data?.bids || []).find((b) => b.id === bidBP.id)?.projectId === S.projD16b, brief(mbP))
}

// ═════════════════════════════ E. PROYECTOS ═════════════════════════════
async function flowE() {
  const F = 'E'
  const pid = S.project1
  st(F, 'detalle proyecto (cliente)', await get(C, `/api/projects/${pid}`), 200)
  const dP = await get(P, `/api/projects/${pid}`)
  check(F, 'detalle proyecto (pro) con rol', dP.status === 200 && dP.data?.role === 'profesional', brief(dP))
  st(F, 'detalle proyecto tercero', await get(P2, `/api/projects/${pid}`), 403)
  st(F, 'detalle proyecto sin sesión', await get(ANON, `/api/projects/${pid}`), 401)
  st(F, 'detalle proyecto inexistente', await get(C, '/api/projects/no-existe'), 404)
  const lst = await get(C, '/api/projects')
  const lp = (lst.data?.asClient || []).find((p) => p.id === pid)
  check(F, 'listado del cliente con nombre del pro', lp?.pro?.user?.displayName === `${MARK} Pro Q`, JSON.stringify(lp)?.slice(0, 200))
  const lstP = await get(P, '/api/projects')
  check(F, 'listado del pro con nombre del cliente', (lstP.data?.asPro || []).find((p) => p.id === pid)?.client?.displayName === `${MARK} Cliente Q`)

  // cotización y etapas
  st(F, 'cliente no cotiza mano de obra', await patch(C, `/api/projects/${pid}`, { laborCost: 1 }), 403)
  st(F, 'mano de obra negativa', await patch(P, `/api/projects/${pid}`, { laborCost: -5 }), 400)
  st(F, 'status libre (finalizado)', await patch(C, `/api/projects/${pid}`, { status: 'finalizado' }), 400)
  st(F, 'etapa inválida', await patch(C, `/api/projects/${pid}`, { stage: 'volando' }), 400)
  st(F, 'body vacío', await patch(C, `/api/projects/${pid}`, {}), 400)
  st(F, 'pro cotiza mano de obra', await patch(P, `/api/projects/${pid}`, { laborCost: 35000 }), 200)
  check(F, 'cliente notificado de la cotización', !!(await db.notification.findFirst({ where: { userId: C.id, type: 'mano_obra_cotizada', link: `#/panel/cliente/proyectos/${pid}` } })))
  st(F, 'pro no finaliza', await patch(P, `/api/projects/${pid}`, { stage: 'finalizado' }), 403)
  st(F, 'cliente no finaliza desde presupuesto', await patch(C, `/api/projects/${pid}`, { stage: 'finalizado' }), 409)
  st(F, 'avanzar a materiales', await patch(P, `/api/projects/${pid}`, { stage: 'materiales' }), 200)
  st(F, 'las etapas no retroceden', await patch(P, `/api/projects/${pid}`, { stage: 'presupuesto' }), 409)
  st(F, 'no se cotiza fuera de presupuesto', await patch(P, `/api/projects/${pid}`, { laborCost: 36000 }), 409)
  st(F, 'tercero no modifica el proyecto', await patch(P2, `/api/projects/${pid}`, { stage: 'ejecucion' }), 403)

  // vinculación pro ↔ proveedor
  const mat = { elementId: S.E3.id, providerId: V.provId, quantity: 10, unitPrice: 2000 }
  st(F, 'material de proveedor sin vinculación', await post(P, `/api/projects/${pid}/materials`, mat), 403)
  st(F, 'vinculación con email inválido', await post(P, '/api/provider/links', { email: 'nope', accountLabel: 'x' }), 400)
  st(F, 'vinculación sin sesión', await post(ANON, '/api/provider/links', { email: V.email, accountLabel: 'x' }), 401)
  st(F, 'cliente no crea vinculaciones', await post(C, '/api/provider/links', { email: V.email, accountLabel: `${MARK} cuenta` }), 403)
  const ln = await post(P, '/api/provider/links', { email: V.email, accountLabel: `${MARK} Cuenta retiro` })
  st(F, 'pro solicita vinculación', ln, 201)
  S.link = ln.data?.link?.id
  check(F, 'vinculación nace inactiva', ln.data?.link?.active === false, brief(ln))
  st(F, 'vinculación duplicada', await post(P, '/api/provider/links', { email: V.email, accountLabel: 'otra' }), 409)
  st(F, 'material con vinculación inactiva', await post(P, `/api/projects/${pid}/materials`, mat), 403)
  st(F, 'pro no puede auto-activarse', await patch(P, '/api/provider/links', { id: S.link, active: true }), 403)
  st(F, 'tercero no activa', await patch(P2, '/api/provider/links', { id: S.link, active: true }), 403)
  const vl = await get(V, '/api/provider/links')
  check(F, 'proveedor ve la solicitud', (vl.data?.asProvider || []).some((l) => l.id === S.link && !l.active), brief(vl))
  st(F, 'proveedor activa la vinculación', await patch(V, '/api/provider/links', { id: S.link, active: true }), 200)
  const pl = await get(P, '/api/provider/links')
  check(F, 'pro ve la vinculación activa', (pl.data?.asProfessional || []).some((l) => l.id === S.link && l.active), brief(pl))

  // materiales A/B
  const stock3Before = (await db.providerStock.findUnique({ where: { id: S.stock3 } })).quantity
  st(F, 'cliente no propone materiales', await post(C, `/api/projects/${pid}/materials`, mat), 403)
  st(F, 'material con cantidad 0', await post(P, `/api/projects/${pid}/materials`, { ...mat, quantity: 0 }), 400)
  st(F, 'material con más cantidad que el stock', await post(P, `/api/projects/${pid}/materials`, { ...mat, quantity: 9999 }), 409)
  st(F, 'material con providerId inexistente', await post(P, `/api/projects/${pid}/materials`, { ...mat, providerId: 'no-existe' }), 404)
  const m1 = await post(P, `/api/projects/${pid}/materials`, mat)
  st(F, 'pro propone material A (proveedor)', m1, 201)
  S.m1 = m1.data?.material?.id
  check(F, 'proponer NO reserva stock', (await db.providerStock.findUnique({ where: { id: S.stock3 } })).quantity === stock3Before)
  const mNone = await post(P, `/api/projects/${pid}/materials`, { name: `${MARK} Cinta de papel`, providerId: 'none', quantity: 2, unitPrice: 800 })
  check(F, 'providerId "none" se normaliza (sin 500)', mNone.status === 201 && mNone.data?.material?.providerId === null, brief(mNone))
  S.m3 = mNone.data?.material?.id
  const m4 = await post(P, `/api/projects/${pid}/materials`, { ...mat, quantity: 5 })
  S.m4 = m4.data?.material?.id
  const m5 = await post(P, `/api/projects/${pid}/materials`, { name: `${MARK} Material a eliminar`, quantity: 1, unitPrice: 100 })
  S.m5 = m5.data?.material?.id
  check(F, 'cliente notificado de materiales', !!(await db.notification.findFirst({ where: { userId: C.id, type: 'material_propuesto' } })))

  st(F, 'pro no aprueba materiales', await patch(P, `/api/projects/${pid}/materials`, { materialId: S.m1, action: 'aprobar' }), 403)
  st(F, 'acción de material inválida', await patch(C, `/api/projects/${pid}/materials`, { materialId: S.m1, action: 'robar' }), 400)
  st(F, 'material inexistente en el proyecto', await patch(C, `/api/projects/${pid}/materials`, { materialId: 'no-existe', action: 'aprobar' }), 404)
  const ap = await patch(C, `/api/projects/${pid}/materials`, { materialId: S.m1, action: 'aprobar' })
  st(F, 'cliente aprueba material A', ap, 200)
  check(F, 'aprobar reserva stock (−10)', (await db.providerStock.findUnique({ where: { id: S.stock3 } })).quantity === stock3Before - 10)
  check(F, 'movimiento de reserva registrado', !!(await db.stockMovement.findFirst({ where: { stockId: S.stock3, type: 'reserva' } })))
  check(F, 'costo de materiales recalculado', ap.data?.materialsCost === 20000, brief(ap))
  st(F, 'aprobar dos veces', await patch(C, `/api/projects/${pid}/materials`, { materialId: S.m1, action: 'aprobar' }), 409)
  st(F, 'cliente rechaza material B con motivo', await patch(C, `/api/projects/${pid}/materials`, { materialId: S.m3, action: 'rechazar', note: 'Prefiero otra marca' }), 200)
  check(F, 'motivo del rechazo guardado', (await db.projectMaterial.findUnique({ where: { id: S.m3 } })).note?.includes('Prefiero otra marca'))
  const alt = await patch(P, `/api/projects/${pid}/materials`, { materialId: S.m3, action: 'reemplazar', replacement: { name: `${MARK} Cinta premium`, quantity: 1, unitPrice: 500, providerId: 'none' } })
  st(F, 'pro propone alternativa', alt, 201)
  S.mAlt = alt.data?.material?.id
  check(F, 'original queda "reemplazado"', (await db.projectMaterial.findUnique({ where: { id: S.m3 } })).status === 'reemplazado')
  st(F, 'cliente aprueba la alternativa', await patch(C, `/api/projects/${pid}/materials`, { materialId: S.mAlt, action: 'aprobar' }), 200)
  // aprobar y después rechazar libera stock
  await patch(C, `/api/projects/${pid}/materials`, { materialId: S.m4, action: 'aprobar' })
  const midQty = (await db.providerStock.findUnique({ where: { id: S.stock3 } })).quantity
  st(F, 'rechazar material aprobado', await patch(C, `/api/projects/${pid}/materials`, { materialId: S.m4, action: 'rechazar' }), 200)
  check(F, 'rechazar libera el stock reservado (+5)', (await db.providerStock.findUnique({ where: { id: S.stock3 } })).quantity === midQty + 5)
  check(F, 'movimiento de liberación registrado', !!(await db.stockMovement.findFirst({ where: { stockId: S.stock3, type: 'liberacion' } })))
  st(F, 'cliente no elimina propuestas', await patch(C, `/api/projects/${pid}/materials`, { materialId: S.m5, action: 'eliminar' }), 403)
  st(F, 'pro elimina propuesta', await patch(P, `/api/projects/${pid}/materials`, { materialId: S.m5, action: 'eliminar' }), 200)
  st(F, 'no se elimina un material aprobado', await patch(P, `/api/projects/${pid}/materials`, { materialId: S.m1, action: 'eliminar' }), 409)

  // factura única (pro_adelanta: mano de obra + materiales)
  st(F, 'cliente no emite factura', await post(C, `/api/projects/${pid}/invoice`, {}), 403)
  const inv = await post(P, `/api/projects/${pid}/invoice`, {})
  st(F, 'pro emite factura', inv, 201)
  S.inv1 = inv.data?.invoice?.id
  check(F, 'factura = mano de obra 35000 + materiales 20500', inv.data?.invoice?.total === 55500 && inv.data?.invoice?.laborCost === 35000 && inv.data?.invoice?.materialsCost === 20500, brief(inv))
  check(F, 'materiales marcados como facturados', !!(await db.projectMaterial.findUnique({ where: { id: S.m1 } })).invoicedAt)
  st(F, 'segunda factura con una pendiente', await post(P, `/api/projects/${pid}/invoice`, {}), 409)
  st(F, 'no se rechaza un material facturado', await patch(C, `/api/projects/${pid}/materials`, { materialId: S.m1, action: 'rechazar' }), 409)
  const gi = await get(C, `/api/projects/${pid}/invoice`)
  check(F, 'facturas del proyecto (cliente) con ítems', gi.status === 200 && gi.data?.invoices?.[0]?.items?.length === 3, brief(gi))
  st(F, 'facturas del proyecto tercero', await get(P2, `/api/projects/${pid}/invoice`), 403)
  st(F, 'detalle de factura tercero', await get(P2, `/api/invoices/${S.inv1}`), 403)
  st(F, 'detalle de factura cliente', await get(C, `/api/invoices/${S.inv1}`), 200)
  for (const [who, a] of [['cliente', C], ['pro', P]]) {
    const pdf = await get(a, `/api/invoices/${S.inv1}/pdf`, { raw: true })
    check(F, `PDF de factura (${who}) 200 application/pdf`, pdf.status === 200 && pdf.ct.includes('application/pdf') && pdf.buf?.subarray(0, 4).toString() === '%PDF', `HTTP ${pdf.status} ${pdf.ct}`)
    if (who === 'cliente' && pdf.buf) writeFileSync(path.join(OUT_DIR, `factura-${TS}.pdf`), pdf.buf)
  }
  st(F, 'PDF de factura tercero', await get(P2, `/api/invoices/${S.inv1}/pdf`), 403)
  st(F, 'PDF de factura sin sesión', await get(ANON, `/api/invoices/${S.inv1}/pdf`), 401)
  st(F, 'pro no paga la factura por MP', await post(P, `/api/invoices/${S.inv1}`, {}), 403)
  const mp = await post(C, `/api/invoices/${S.inv1}`, {})
  check(F, 'factura por MP sin MP del profesional → 503 needsConfig honesto', mp.status === 503 && mp.data?.needsConfig === true && /todavía no conectó Mercado Pago/.test(mp.data?.error || '') && /efectivo/.test(mp.data?.error || ''), brief(mp))
  check(F, 'mensaje de MP sin jerga de desarrollo', !JSON.stringify(mp.data || {}).includes('.env'), brief(mp))
  const detInv = await get(C, `/api/invoices/${S.inv1}`)
  check(F, 'detalle de factura: el profesional no cobra por MP y el 1% calculado', detInv.data?.professional?.mpConnected === false && detInv.data?.invoice?.mpServiceFee === 555, brief(detInv))
  // con el MP del profesional (token de PRUEBA escrito en su perfil): preferencia a SU nombre + 1%
  if (process.env.MP_TEST_ACCESS_TOKEN) {
    const tk = process.env.MP_TEST_ACCESS_TOKEN
    await db.professionalProfile.update({ where: { id: P.proId }, data: { mpOauthAccessToken: tk, mpOauthStatus: 'connected', mpOauthExpiresAt: new Date(Date.now() + 180 * 86400000) } })
    const mp2 = await post(C, `/api/invoices/${S.inv1}`, {})
    check(F, 'factura por MP con el token del profesional: total + 1% (55500 + 555)', mp2.status === 200 && /^https:\/\//.test(mp2.data?.initPoint || '') && mp2.data?.serviceFee === 555 && mp2.data?.totalMp === 56055, brief(mp2))
    check(F, 'cargo fijado en la factura', (await db.invoice.findUnique({ where: { id: S.inv1 } }))?.serviceFee === 555)
    if (mp2.data?.preferenceId) {
      const r = await fetch(`https://api.mercadopago.com/checkout/preferences/${mp2.data.preferenceId}`, { headers: { Authorization: `Bearer ${tk}` } })
      const pref = await r.json().catch(() => null)
      const items = pref?.items || []
      const sum = Math.round(items.reduce((a, i) => a + i.unit_price * i.quantity, 0) * 100) / 100
      check(F, 'preferencia de la factura: ítems reales + cargo, marketplace_fee = 555', r.status === 200 && items.length === 4 && items.some((i) => i.title === 'Cargo de servicio HomIA (1%)' && i.unit_price === 555) && pref?.marketplace_fee === 555 && sum === 56055, `HTTP ${r.status} ${JSON.stringify(items.map((i) => [i.title, i.quantity, i.unit_price]))} fee=${pref?.marketplace_fee}`)
      check(F, 'preferencia de la factura: referencia invoice:<id> y pista ?ref=', pref?.external_reference === `invoice:${S.inv1}` && (pref?.notification_url || '').includes(encodeURIComponent(`invoice:${S.inv1}`)), `${pref?.external_reference} ${pref?.notification_url}`)
    }
    await db.professionalProfile.update({ where: { id: P.proId }, data: { mpOauthAccessToken: null, mpOauthStatus: 'disconnected', mpOauthExpiresAt: null } })
  } else {
    check(F, 'MP_TEST_ACCESS_TOKEN configurado para probar el 1% de facturas', false, 'falta MP_TEST_ACCESS_TOKEN en .env')
  }

  // efectivo: acordar / cancelar / confirmar
  st(F, 'pro no acuerda efectivo', await post(P, `/api/invoices/${S.inv1}/cash`, { action: 'acordar' }), 403)
  st(F, 'cliente acuerda efectivo', await post(C, `/api/invoices/${S.inv1}/cash`, { action: 'acordar' }), 200)
  st(F, 'acordar dos veces', await post(C, `/api/invoices/${S.inv1}/cash`, { action: 'acordar' }), 400)
  st(F, 'cliente cancela el acuerdo', await post(C, `/api/invoices/${S.inv1}/cash`, { action: 'cancelar' }), 200)
  check(F, 'cancelar borra el pago acordado', (await db.payment.count({ where: { invoiceId: S.inv1 } })) === 0)
  st(F, 'confirmar sin acuerdo', await post(P, `/api/invoices/${S.inv1}/cash`, { action: 'confirmar' }), 400)
  st(F, 'cliente vuelve a acordar', await post(C, `/api/invoices/${S.inv1}/cash`, { action: 'acordar' }), 200)
  st(F, 'acción libre con acuerdo activo', await post(C, `/api/invoices/${S.inv1}/cash`, { action: 'pagar' }), 400)
  check(F, 'una acción inválida no borra el acuerdo de efectivo', (await db.payment.count({ where: { invoiceId: S.inv1, status: 'acordado' } })) === 1)
  st(F, 'cliente no confirma el cobro', await post(C, `/api/invoices/${S.inv1}/cash`, { action: 'confirmar' }), 403)
  st(F, 'tercero no toca el efectivo', await post(P2, `/api/invoices/${S.inv1}/cash`, { action: 'confirmar' }), 403)
  st(F, 'pro confirma el cobro', await post(P, `/api/invoices/${S.inv1}/cash`, { action: 'confirmar' }), 200)
  const invDb = await db.invoice.findUnique({ where: { id: S.inv1 }, include: { payments: true } })
  check(F, 'factura pagada en efectivo', invDb.status === 'pagada' && invDb.paymentMethod === 'efectivo' && !!invDb.paidAt && invDb.payments[0]?.status === 'confirmado', JSON.stringify(invDb))
  check(F, 'en efectivo no hay cargo de servicio', invDb.serviceFee === 0, `serviceFee=${invDb.serviceFee}`)
  st(F, 'confirmar dos veces', await post(P, `/api/invoices/${S.inv1}/cash`, { action: 'confirmar' }), 400)
  st(F, 'modo de pago inmutable con factura emitida', await patch(C, `/api/projects/${pid}`, { materialsPaymentMode: 'cliente_paga_proveedor' }), 409)

  // cierre
  st(F, 'avanzar a ejecución', await patch(P, `/api/projects/${pid}`, { stage: 'ejecucion' }), 200)
  st(F, 'cliente finaliza la obra', await patch(C, `/api/projects/${pid}`, { stage: 'finalizado' }), 200)
  check(F, 'proyecto finalizado', (await db.project.findUnique({ where: { id: pid } })).status === 'finalizado')
  st(F, 'proyecto finalizado no se modifica', await patch(P, `/api/projects/${pid}`, { stage: 'revision' }), 409)
  st(F, 'proyecto finalizado no se cancela', await patch(C, `/api/projects/${pid}`, { status: 'cancelado', cancelReason: 'nada' }), 409)
  st(F, 'no se proponen materiales en proyecto finalizado', await post(P, `/api/projects/${pid}/materials`, { name: 'x', quantity: 1, unitPrice: 1 }), 409)
  st(F, 'factura sin nada pendiente', await post(P, `/api/projects/${pid}/invoice`, {}), 400)

  // ── Proyecto 2: wizard + cliente_paga_proveedor ──
  const wz = { professionalProfileId: P.proId, title: `${MARK} Wizard pintura dormitorio`, description: `${MARK} Dormitorio 12m2`, budgetMin: 10000, budgetMax: 20000, urgency: 'esta_semana', categorySlug: 'pintura', firstMessage: `${MARK} Te contraté por el wizard` }
  st(F, 'wizard sin profesional', await post(C, '/api/projects', { title: 'Algo largo' }), 400)
  st(F, 'wizard título corto', await post(C, '/api/projects', { ...wz, title: 'ab' }), 400)
  st(F, 'wizard presupuesto máx < mín', await post(C, '/api/projects', { ...wz, budgetMin: 30000 }), 400)
  st(F, 'wizard profesional inexistente', await post(C, '/api/projects', { ...wz, professionalProfileId: 'no-existe' }), 404)
  st(F, 'pro no se contrata a sí mismo', await post(P, '/api/projects', wz), 400)
  st(F, 'wizard sin sesión', await post(ANON, '/api/projects', wz), 401)
  st(F, 'wizard con foto externa', await post(C, '/api/projects', { ...wz, photos: ['https://evil.example.com/a.jpg'] }), 400)
  const p2 = await post(C, '/api/projects', wz)
  st(F, 'cliente contrata por wizard', p2, 201)
  S.project2 = p2.data?.project?.id
  check(F, 'wizard: mano de obra sin cotizar y brief guardado', p2.data?.project?.laborCost === 0 && p2.data?.project?.budgetMax === 20000, brief(p2))
  check(F, 'wizard: primer mensaje en el chat existente', p2.data?.conversationId === S.convCP, brief(p2))
  check(F, 'pro notificado de la contratación', !!(await db.notification.findFirst({ where: { userId: P.id, type: 'contratacion', link: `#/panel/profesional/proyectos/${S.project2}` } })))
  st(F, 'avanzar sin cotizar', await patch(P, `/api/projects/${S.project2}`, { stage: 'materiales' }), 409)
  st(F, 'modo de pago inválido', await patch(C, `/api/projects/${S.project2}`, { materialsPaymentMode: 'trueque' }), 400)
  st(F, 'cliente elige que paga materiales al proveedor', await patch(C, `/api/projects/${S.project2}`, { materialsPaymentMode: 'cliente_paga_proveedor' }), 200)
  st(F, 'pro cotiza (wizard)', await patch(P, `/api/projects/${S.project2}`, { laborCost: 20000 }), 200)
  st(F, 'avanzar a materiales (wizard)', await patch(P, `/api/projects/${S.project2}`, { stage: 'materiales' }), 200)
  const m6 = await post(P, `/api/projects/${S.project2}/materials`, { ...mat, quantity: 4 })
  S.m6 = m6.data?.material?.id
  st(F, 'IDOR: material de otro proyecto', await patch(C, `/api/projects/${S.project2}/materials`, { materialId: S.m1, action: 'aprobar' }), 404)
  st(F, 'cliente aprueba material (modo B)', await patch(C, `/api/projects/${S.project2}/materials`, { materialId: S.m6, action: 'aprobar' }), 200)

  // cobro del proveedor por los materiales
  const pc = await get(V, '/api/provider/charges')
  const grp = (pc.data?.pending || []).find((g) => g.projectId === S.project2)
  check(F, 'proveedor ve materiales pendientes de cobro', grp?.amount === 8000 && !grp.bloqueado, JSON.stringify(pc.data?.pending))
  check(F, 'proyecto modo A no aparece en pendientes', !(pc.data?.pending || []).some((g) => g.projectId === pid))
  st(F, 'cobro en proyecto modo A', await post(V, '/api/provider/charges', { projectId: pid }), 403)
  st(F, 'cobro sin proyecto', await post(V, '/api/provider/charges', {}), 400)
  st(F, 'cliente no emite cobros de proveedor', await post(C, '/api/provider/charges', { projectId: S.project2 }), 403)
  const ch = await post(V, '/api/provider/charges', { projectId: S.project2 })
  st(F, 'proveedor emite cobro de materiales', ch, 201)
  S.charge2 = ch.data?.charge?.id
  check(F, 'cobro por 8000 con materiales incluidos', ch.data?.charge?.amount === 8000 && JSON.parse(ch.data?.charge?.materialIds || '[]').includes(S.m6), brief(ch))
  st(F, 'segundo cobro con uno abierto', await post(V, '/api/provider/charges', { projectId: S.project2 }), 400)
  st(F, 'detalle del cobro (cliente)', await get(C, `/api/charges/${S.charge2}`), 200)
  st(F, 'detalle del cobro tercero', await get(P2, `/api/charges/${S.charge2}`), 403)
  st(F, 'proveedor no paga su cobro', await post(V, `/api/charges/${S.charge2}`, { method: 'efectivo' }), 403)
  st(F, 'cobro sin método', await post(C, `/api/charges/${S.charge2}`, {}), 400)
  const chMp = await post(C, `/api/charges/${S.charge2}`, { method: 'mercadopago' })
  check(F, 'cobro por MP sin MP del proveedor → 503 needsConfig honesto', chMp.status === 503 && chMp.data?.needsConfig === true && /todavía no conectó Mercado Pago/.test(chMp.data?.error || ''), brief(chMp))
  const detCh = await get(C, `/api/charges/${S.charge2}`)
  check(F, 'detalle del cobro: 1% calculado y sin tokens del proveedor', detCh.data?.charge?.mpServiceFee === 80 && detCh.data?.charge?.provider?.mpConnected === false && !JSON.stringify(detCh.data).includes('mpOauth'), brief(detCh))
  st(F, 'confirmar efectivo no acordado', await patch(V, `/api/charges/${S.charge2}`, {}), 400)
  st(F, 'cliente acuerda efectivo con el proveedor', await post(C, `/api/charges/${S.charge2}`, { method: 'efectivo' }), 200)
  st(F, 'cliente no confirma el cobro del proveedor', await patch(C, `/api/charges/${S.charge2}`, {}), 403)
  st(F, 'proveedor confirma el efectivo', await patch(V, `/api/charges/${S.charge2}`, {}), 200)
  check(F, 'cobro pagado', (await db.providerCharge.findUnique({ where: { id: S.charge2 } })).status === 'pagada')
  const inv2 = await post(P, `/api/projects/${S.project2}/invoice`, {})
  check(F, 'factura modo B: solo mano de obra', inv2.status === 201 && inv2.data?.invoice?.total === 20000 && inv2.data?.invoice?.materialsCost === 0, brief(inv2))
  S.inv2 = inv2.data?.invoice?.id
  st(F, 'modo inmutable con cobro emitido', await patch(C, `/api/projects/${S.project2}`, { materialsPaymentMode: 'pro_adelanta' }), 409)

  // ── Cobros del profesional: GET /api/invoices?mine=1 ──
  const cob = await get(P, '/api/invoices?mine=1')
  st(F, 'cobros del profesional (todas sus facturas)', cob, 200)
  const cobIds = (cob.data?.invoices || []).map((i) => i.id)
  check(F, 'cobros: trae las 2 facturas de sus proyectos', cobIds.includes(S.inv1) && cobIds.includes(S.inv2), brief(cob))
  const cInv1 = (cob.data?.invoices || []).find((i) => i.id === S.inv1)
  const cInv2 = (cob.data?.invoices || []).find((i) => i.id === S.inv2)
  check(F, 'cobros: factura cobrada en efectivo y pendiente, con proyecto y cliente', cInv1?.status === 'pagada' && cInv1?.paymentMethod === 'efectivo' && cInv2?.status === 'pendiente' && cInv2?.project?.id === S.project2 && typeof cInv2?.clientName === 'string', JSON.stringify([cInv1, cInv2])?.slice(0, 300))
  check(F, 'cobros: resumen (cobrado este mes 55500, pendiente 20000, 1 pendiente)', cob.data?.resumen?.cobradoMes === 55500 && cob.data?.resumen?.pendienteTotal === 20000 && cob.data?.resumen?.pendientesCount === 1, JSON.stringify(cob.data?.resumen))
  const cobPend = await get(P, '/api/invoices?mine=1&estado=pendientes')
  check(F, 'cobros: filtro Pendientes', cobPend.status === 200 && (cobPend.data?.invoices || []).every((i) => i.status !== 'pagada') && (cobPend.data?.invoices || []).some((i) => i.id === S.inv2), brief(cobPend))
  const cobOk = await get(P, '/api/invoices?mine=1&estado=cobradas')
  check(F, 'cobros: filtro Cobradas', cobOk.status === 200 && (cobOk.data?.invoices || []).every((i) => i.status === 'pagada') && (cobOk.data?.invoices || []).some((i) => i.id === S.inv1), brief(cobOk))
  const cobRaw = JSON.stringify(cob.data || {})
  check(F, 'cobros: sin tokens ni datos sensibles', !/mpOauth|AccessToken|passwordHash|email|mpPreferenceId/i.test(cobRaw), cobRaw.slice(0, 200))
  const cobOtro = await get(P2, '/api/invoices?mine=1')
  check(F, 'cobros: otro profesional no ve facturas ajenas', cobOtro.status === 200 && !(cobOtro.data?.invoices || []).some((i) => i.id === S.inv1 || i.id === S.inv2), brief(cobOtro))
  st(F, 'cobros: el cliente (sin perfil profesional) → 403', await get(C, '/api/invoices?mine=1'), 403)
  st(F, 'cobros: sin sesión → 401', await get(ANON, '/api/invoices?mine=1'), 401)
  st(F, 'cobros: sin mine=1 → 400', await get(P, '/api/invoices'), 400)
  st(F, 'cobros: estado inválido → 400', await get(P, '/api/invoices?mine=1&estado=todo'), 400)

  // ── Proyecto 3: cancelación con motivo (la pide el pro: "no puedo tomarlo") ──
  const p3 = await post(C, '/api/projects', { ...wz, title: `${MARK} Proyecto a cancelar`, firstMessage: undefined })
  S.project3 = p3.data?.project?.id
  await patch(P, `/api/projects/${S.project3}`, { laborCost: 5000 })
  const m7 = await post(P, `/api/projects/${S.project3}/materials`, { ...mat, quantity: 2 })
  await patch(C, `/api/projects/${S.project3}/materials`, { materialId: m7.data?.material?.id, action: 'aprobar' })
  const qBefore = (await db.providerStock.findUnique({ where: { id: S.stock3 } })).quantity
  st(F, 'cancelar sin motivo', await patch(P, `/api/projects/${S.project3}`, { status: 'cancelado' }), 400)
  st(F, 'cancelar mezclado con otros cambios', await patch(P, `/api/projects/${S.project3}`, { status: 'cancelado', cancelReason: 'Motivo largo', stage: 'materiales' }), 400)
  st(F, 'pro cancela con motivo', await patch(P, `/api/projects/${S.project3}`, { status: 'cancelado', cancelReason: `${MARK} No llego con los tiempos` }), 200)
  check(F, 'cancelar libera el stock reservado', (await db.providerStock.findUnique({ where: { id: S.stock3 } })).quantity === qBefore + 2)
  check(F, 'cliente notificado con el motivo', !!(await db.notification.findFirst({ where: { userId: C.id, type: 'proyecto_cancelado', body: { contains: 'No llego con los tiempos' } } })))
  check(F, 'motivo en el chat', !!(await db.message.findFirst({ where: { conversationId: S.convCP, body: { contains: 'No llego con los tiempos' } } })))
  st(F, 'proyecto cancelado no se modifica', await patch(C, `/api/projects/${S.project3}`, { stage: 'materiales' }), 409)

  await flowE16()
}

// D16 — el profesional subcontrata eligiendo uno de sus proyectos activos (parentProjectId)
async function flowE16() {
  const F = 'E'
  const parentId = S.projD16a // C → P, activo (creado en D16)
  if (!parentId) { check(F, 'E16: falta el proyecto de D16 (correr con D)', false); return }
  const hsP = await get(P, `/api/projects/hire-sources?professionalProfileId=${P2.proId}`)
  const src = (hsP.data?.projects || []).find((p) => p.id === parentId)
  check(F, 'E16: el pro ve su proyecto activo para subcontratar (con cliente y etapa)', hsP.status === 200 && src?.clientName === `${MARK} Cliente Q` && src?.stage === 'presupuesto', brief(hsP))
  check(F, 'E16: no lista proyectos cancelados ni finalizados', !(hsP.data?.projects || []).some((p) => p.id === S.project3 || p.id === S.project1))
  const hsP2 = await get(P2, '/api/projects/hire-sources')
  check(F, 'E16: otro pro no ve proyectos ajenos', !(hsP2.data?.projects || []).some((p) => p.id === parentId), brief(hsP2))

  const sub = { professionalProfileId: P2.proId, title: `${MARK} E16 subcontrato pintura`, description: `${MARK} Parte del pasillo`, urgency: 'esta_semana', budgetMin: 5000, budgetMax: 9000 }
  st(F, 'E16: proyecto ajeno (IDOR)', await post(P2, '/api/projects', { ...sub, professionalProfileId: P.proId, parentProjectId: parentId }), 403)
  st(F, 'E16: el cliente no subcontrata desde su proyecto', await post(C, '/api/projects', { ...sub, parentProjectId: parentId }), 403)
  st(F, 'E16: proyecto cancelado', await post(P, '/api/projects', { ...sub, parentProjectId: S.project3 }), 409)
  st(F, 'E16: proyecto inexistente', await post(P, '/api/projects', { ...sub, parentProjectId: 'no-existe' }), 404)
  const r = await post(P, '/api/projects', { ...sub, parentProjectId: parentId })
  st(F, 'E16: pro subcontrata eligiendo su proyecto activo', r, 201)
  S.projE16 = r.data?.project?.id
  const ps = await db.project.findUnique({ where: { id: S.projE16 || 'x' } })
  check(F, 'E16: parentProjectId correcto y cliente = el pro que subcontrata', ps?.parentProjectId === parentId && ps?.clientId === P.id && ps?.professionalId === P2.proId && ps?.jobId === null, JSON.stringify(ps))
  check(F, 'E16: el subcontratado recibe el aviso con el proyecto de origen', !!(await db.notification.findFirst({ where: { userId: P2.id, type: 'contratacion', link: `#/panel/profesional/proyectos/${S.projE16}`, body: { contains: 'subcontrató' } } })))

  const dParentPro = await get(P, `/api/projects/${parentId}`)
  check(F, 'E16: el pro ve "Subcontrataciones" en su proyecto', (dParentPro.data?.project?.subcontracts || []).some((s) => s.id === S.projE16 && s.proName), brief(dParentPro))
  const dParentCli = await get(C, `/api/projects/${parentId}`)
  check(F, 'E16: el cliente original NO ve la subcontratación ni sus montos', dParentCli.status === 200 && (dParentCli.data?.project?.subcontracts || []).length === 0 && !JSON.stringify(dParentCli.data).includes(S.projE16) && !JSON.stringify(dParentCli.data).includes('E16 subcontrato'), brief(dParentCli))
  st(F, 'E16: el cliente original no abre la subcontratación (IDOR)', await get(C, `/api/projects/${S.projE16}`), 403)
  const dSubPro = await get(P, `/api/projects/${S.projE16}`)
  check(F, 'E16: la subcontratación muestra "Parte del proyecto" al que subcontrata', dSubPro.data?.project?.parentProject?.id === parentId && dSubPro.data?.role === 'cliente', brief(dSubPro))
  const dSubP2 = await get(P2, `/api/projects/${S.projE16}`)
  check(F, 'E16: el subcontratado no ve el proyecto de origen', dSubP2.status === 200 && dSubP2.data?.project?.parentProject === null && !JSON.stringify(dSubP2.data).includes(parentId), brief(dSubP2))
  st(F, 'E16: el subcontratado no abre el proyecto original', await get(P2, `/api/projects/${parentId}`), 403)

  // regresión: sin elegir nada, igual que antes
  const plain = await post(C, '/api/projects', { professionalProfileId: P2.proId, title: `${MARK} E16 sin origen`, description: `${MARK} Como siempre` })
  st(F, 'E16: contratar sin elegir nada', plain, 201)
  const pp = await db.project.findUnique({ where: { id: plain.data?.project?.id || 'x' } })
  check(F, 'E16: sin origen → sin jobId ni parentProjectId, sin cotizar', pp?.jobId === null && pp?.parentProjectId === null && pp?.laborCost === 0 && pp?.clientId === C.id, JSON.stringify(pp))
}

// ═════════════════════════════ F. COMPRA DIRECTA ═════════════════════════════
// D15 (24/09/2026): las COMPRAS con stock no se aprueban (nacen por pagar, con el stock
// reservado y el cobro emitido); las RESERVAS (con o sin stock) las aprueba el proveedor.
async function flowF() {
  const F = 'F'
  const q = async (id) => (await db.providerStock.findUnique({ where: { id } })).quantity
  const nPurch = () => db.purchase.count({ where: { clientId: C.id } })
  const cronOk = async (ids) => {
    // el cron toca TODO lo vencido: solo se corre si no hay vencidos ajenos (no se tocan datos reales)
    if (!process.env.CRON_SECRET) return 'sin_secreto'
    const ajenas = await db.purchase.count({ where: { status: 'aprobado', reservationExpiresAt: { lt: new Date() }, id: { notIn: ids } } })
    return ajenas > 0 ? 'ajenas' : 'ok'
  }
  st(F, 'compra sin sesión', await post(ANON, '/api/purchases', { stockId: S.stock1, quantity: 1 }), 401)
  st(F, 'compra con cantidad 0', await post(C, '/api/purchases', { stockId: S.stock1, quantity: 0 }), 400)
  st(F, 'compra de oferta inexistente', await post(C, '/api/purchases', { stockId: 'no-existe', quantity: 1 }), 404)
  const n0 = await nPurch()
  const big = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 99999, type: 'compra' })
  check(F, 'COMPRA con más cantidad que el stock → 409 que dice cuánto queda, y no se crea nada', big.status === 409 && /Solo quedan/.test(big.data?.error || '') && (await nPurch()) === n0, brief(big))
  st(F, 'proveedor no se compra a sí mismo', await post(V, '/api/purchases', { stockId: S.stock1, quantity: 1 }), 400)
  st(F, 'tipo de compra inválido', await post(C, '/api/purchases', { stockId: S.stock1, quantity: 1, type: 'robo' }), 400)
  const auto = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 99999, note: `${MARK} sin tipo` })
  check(F, 'sin tipo y sin stock suficiente → se crea como RESERVA (no compra)', auto.status === 201 && auto.data?.purchase?.type === 'reserva' && auto.data?.purchase?.status === 'pendiente_aprobacion', brief(auto))
  if (auto.data?.purchase?.id) await patch(C, `/api/purchases/${auto.data.purchase.id}`, { action: 'cancelar' })

  const s2q = await q(S.stock2)
  const pm = await post(C, '/api/purchases', { stockId: S.stock2, quantity: 1, note: `${MARK} poco stock` })
  check(F, 'se puede comprar un producto "por agotar" (hay stock) y se reserva al toque', pm.status === 201 && pm.data?.purchase?.status === 'aprobado' && (await q(S.stock2)) === s2q - 1, brief(pm))
  if (pm.data?.purchase?.id) {
    S.purchaseLow = pm.data.purchase.id
    st(F, 'el cliente cancela su compra impaga', await patch(C, `/api/purchases/${S.purchaseLow}`, { action: 'cancelar' }), 200)
    check(F, '…y el stock vuelve', (await q(S.stock2)) === s2q)
  }

  // ── compra directa con stock: sin aprobación ──
  const s1q0 = await q(S.stock1)
  const pa = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 5, type: 'compra', note: `${MARK} compra A` })
  st(F, 'cliente compra 5 caños', pa, 201)
  S.purchaseA = pa.data?.purchase?.id
  const pA0 = await db.purchase.findUnique({ where: { id: S.purchaseA || 'x' } })
  check(F, 'la compra nace POR PAGAR (aprobado) sin intervención del proveedor', pA0?.status === 'aprobado' && pA0?.type === 'compra' && !!pA0?.approvedAt, JSON.stringify(pA0))
  check(F, 'el stock se reserva al confirmar (−5) con su movimiento', (await q(S.stock1)) === s1q0 - 5 && (await db.stockMovement.count({ where: { stockId: S.stock1, type: 'reserva', note: { contains: S.purchaseA } } })) === 1)
  S.chargeA = pA0?.chargeId
  const chA = await db.providerCharge.findUnique({ where: { id: S.chargeA || 'x' } })
  check(F, 'el cobro se emite al confirmar (venta directa, 5 × 1600)', chA?.status === 'pendiente' && chA?.projectId === null && chA?.amount === 5 * 1600 && /^PRV-\d{4}-\d{6}$/.test(chA?.number || ''), JSON.stringify(chA))
  const hrs24 = (new Date(pA0.reservationExpiresAt).getTime() - Date.now()) / 3600000
  check(F, 'compra: 24 h para pagar o elegir efectivo', hrs24 > 23.9 && hrs24 <= 24.01, `h=${hrs24}`)
  const convCV = await db.conversation.findFirst({ where: { OR: [{ userAId: C.id, userBId: V.id }, { userAId: V.id, userBId: C.id }] }, include: { messages: true } })
  check(F, 'la compra abre el chat iniciado por el cliente', !!convCV && convCV.messages[0]?.senderId === C.id, JSON.stringify(convCV?.messages?.[0]))
  S.convCV = convCV?.id
  const nv = await db.notification.findFirst({ where: { userId: V.id, type: 'nueva_compra', title: { contains: 'stock reservado' } } })
  check(F, 'proveedor notificado: "Nueva compra: stock reservado" (sin pedirle aprobar)', !!nv && !/aprob/i.test(nv.body), JSON.stringify(nv))
  check(F, 'línea de tiempo: evento compra_confirmada', !!(await db.activityEvent.findFirst({ where: { purchaseId: S.purchaseA, type: 'compra_confirmada' } })))
  const vr = await post(V, '/api/messages/conversations', { targetUserId: C.id })
  check(F, 'con el hilo abierto por el cliente, el proveedor puede responder', vr.status === 200 && vr.data?.conversation?.id === S.convCV, brief(vr))

  const apC = await patch(V, `/api/purchases/${S.purchaseA}`, { action: 'aprobar' })
  check(F, 'el proveedor NO aprueba una compra (409: ya está lista para pagar)', apC.status === 409 && /no se aprueban/i.test(apC.data?.error || ''), brief(apC))
  st(F, 'cliente no aprueba', await patch(C, `/api/purchases/${S.purchaseA}`, { action: 'aprobar' }), 403)
  st(F, 'tercero no toca la compra', await patch(P2, `/api/purchases/${S.purchaseA}`, { action: 'cancelar' }), 403)
  st(F, 'tercero no paga la compra', await patch(P2, `/api/purchases/${S.purchaseA}`, { action: 'pagar_efectivo' }), 403)
  st(F, 'acción de compra inválida', await patch(V, `/api/purchases/${S.purchaseA}`, { action: 'regalar' }), 400)
  const mp = await patch(C, `/api/purchases/${S.purchaseA}`, { action: 'pagar_mp' })
  check(F, 'pagar con MP a proveedor sin MP conectado → 503 needsConfig honesto', mp.status === 503 && mp.data?.needsConfig === true && /efectivo/i.test(mp.data?.error || ''), brief(mp))
  st(F, 'proveedor no paga', await patch(V, `/api/purchases/${S.purchaseA}`, { action: 'pagar_efectivo' }), 403)
  const pe = await patch(C, `/api/purchases/${S.purchaseA}`, { action: 'pagar_efectivo' })
  check(F, 'cliente elige efectivo → cobro acordado', pe.status === 200 && pe.data?.chargeStatus === 'acordada_efectivo', brief(pe))
  const pA1 = await db.purchase.findUnique({ where: { id: S.purchaseA } })
  const d7 = (new Date(pA1.reservationExpiresAt).getTime() - new Date(pA1.approvedAt).getTime()) / 86400000
  check(F, 'con efectivo acordado: 7 días desde la compra para retirar y pagar', Math.abs(d7 - 7) < 0.001, `días=${d7}`)
  st(F, 'proveedor confirma el efectivo', await patch(V, `/api/charges/${S.chargeA}`, {}), 200)
  check(F, 'compra pagada al confirmar el efectivo', (await db.purchase.findUnique({ where: { id: S.purchaseA } })).status === 'pagado')
  const en = await patch(V, `/api/purchases/${S.purchaseA}`, { action: 'entregar' })
  check(F, 'entregar una compra pagada no retrocede el estado', en.status === 200 && en.data?.status === 'pagado', brief(en))
  check(F, 'entrega registra consumo', !!(await db.stockMovement.findFirst({ where: { stockId: S.stock1, type: 'consumo', note: { contains: S.purchaseA } } })))
  st(F, 'entregar dos veces', await patch(V, `/api/purchases/${S.purchaseA}`, { action: 'entregar' }), 409)
  st(F, 'el cliente no cancela una compra pagada', await patch(C, `/api/purchases/${S.purchaseA}`, { action: 'cancelar' }), 409)
  const cEnt = await patch(V, `/api/purchases/${S.purchaseA}`, { action: 'cancelar', reason: `${MARK} me arrepentí` })
  check(F, 'el proveedor no cancela lo que ya entregó', cEnt.status === 409 && /entregaste/i.test(cEnt.data?.error || ''), brief(cEnt))

  // ── reserva CON stock: la aprueba el proveedor ──
  const pb = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 3, type: 'reserva' })
  S.purchaseB = pb.data?.purchase?.id
  const qB = await q(S.stock1)
  check(F, 'reserva creada pendiente de aprobación, sin tocar el stock', pb.data?.purchase?.type === 'reserva' && pb.data?.purchase?.status === 'pendiente_aprobacion' && !pb.data?.purchase?.chargeId, brief(pb))
  st(F, 'pagar una reserva antes de la aprobación', await patch(C, `/api/purchases/${S.purchaseB}`, { action: 'pagar_efectivo' }), 409)
  st(F, 'entregar una reserva sin aprobar', await patch(V, `/api/purchases/${S.purchaseB}`, { action: 'entregar' }), 409)
  const apB = await patch(V, `/api/purchases/${S.purchaseB}`, { action: 'aprobar' })
  const pB = await db.purchase.findUnique({ where: { id: S.purchaseB } })
  const hrs = (new Date(pB.reservationExpiresAt).getTime() - Date.now()) / 3600000
  check(F, 'reserva con stock aprobada: reserva (−3), cobro y 48 h', apB.status === 200 && pB.status === 'aprobado' && (await q(S.stock1)) === qB - 3 && !!apB.data?.chargeId && hrs > 47.9 && hrs <= 48.01, `h=${hrs} ${brief(apB)}`)
  st(F, 'aprobar dos veces', await patch(V, `/api/purchases/${S.purchaseB}`, { action: 'aprobar' }), 409)
  const beforeCancel = await q(S.stock1)
  st(F, 'cliente cancela la reserva aprobada', await patch(C, `/api/purchases/${S.purchaseB}`, { action: 'cancelar' }), 200)
  check(F, 'cancelar libera el stock (+3)', (await q(S.stock1)) === beforeCancel + 3)
  check(F, 'cancelar anula el cobro', (await db.providerCharge.findUnique({ where: { id: apB.data?.chargeId || 'x' } }))?.status === 'anulada')
  st(F, 'cancelar dos veces', await patch(C, `/api/purchases/${S.purchaseB}`, { action: 'cancelar' }), 409)

  // rechazo del proveedor (solo reservas)
  const pc = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 2, type: 'reserva' })
  S.purchaseC = pc.data?.purchase?.id
  const beforeRej = await q(S.stock1)
  st(F, 'proveedor rechaza la reserva con motivo', await patch(V, `/api/purchases/${S.purchaseC}`, { action: 'rechazar', reason: `${MARK} Sin retiro hoy` }), 200)
  const pC = await db.purchase.findUnique({ where: { id: S.purchaseC } })
  check(F, 'rechazo guarda motivo y no toca stock', pC.status === 'rechazado' && pC.rejectionReason?.includes('Sin retiro') && (await q(S.stock1)) === beforeRej)
  const cRej = await patch(V, `/api/purchases/${S.purchaseLow}`, { action: 'rechazar' })
  check(F, 'una compra no se "rechaza"', cRej.status === 409, brief(cRej))

  // ── reserva SIN stock: aprobación con fecha → disponible → reserva y 48 h ──
  const sz = await post(V, '/api/provider/stock', { elementId: S.E4.id, price: 900, quantity: 0 })
  st(F, 'el proveedor publica un elemento con cantidad 0', sz, 201)
  S.stockZero = sz.data?.stock?.id
  const mz = await get(C, '/api/marketplace?q=caño')
  const offZ = (mz.data?.results || []).flatMap((e) => e.offers || []).find((o) => o.stockId === S.stockZero)
  check(F, 'el marketplace lista la oferta sin stock para reservar (inStock: false)', offZ?.inStock === false, `oferta=${JSON.stringify(offZ)}`)
  const n1 = await nPurch()
  const zc = await post(C, '/api/purchases', { stockId: S.stockZero, quantity: 2, type: 'compra' })
  check(F, 'COMPRAR algo sin stock → 409 "podés reservarlo", sin crear nada', zc.status === 409 && /reservarlo/i.test(zc.data?.error || '') && (await nPurch()) === n1, brief(zc))
  const zr = await post(C, '/api/purchases', { stockId: S.stockZero, quantity: 2, note: `${MARK} conseguímelo` })
  S.purchaseZ = zr.data?.purchase?.id
  check(F, 'sin tipo y sin stock → reserva pendiente', zr.status === 201 && zr.data?.purchase?.type === 'reserva' && zr.data?.purchase?.status === 'pendiente_aprobacion', brief(zr))
  check(F, 'el proveedor recibe "Nueva reserva" y el aviso de que no tiene stock', !!(await db.notification.findFirst({ where: { userId: V.id, title: 'Nueva reserva de un cliente', body: { contains: 'no tenés en stock' } } })))
  const zNoDate = await patch(V, `/api/purchases/${S.purchaseZ}`, { action: 'aprobar' })
  check(F, 'aprobar sin stock y sin fecha → 409 needsDate que dice cuál', zNoDate.status === 409 && zNoDate.data?.needsDate === true && /Caño PVC 63/i.test(zNoDate.data?.error || ''), brief(zNoDate))
  st(F, 'aprobar con una fecha pasada', await patch(V, `/api/purchases/${S.purchaseZ}`, { action: 'aprobar', availableFrom: '2020-01-01' }), 400)
  st(F, 'aprobar con fecha mal formada', await patch(V, `/api/purchases/${S.purchaseZ}`, { action: 'aprobar', availableFrom: 'mañana' }), 400)
  const fecha = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10)
  const zOk = await patch(V, `/api/purchases/${S.purchaseZ}`, { action: 'aprobar', availableFrom: fecha, unitPrice: 950 })
  const pZ = await db.purchase.findUnique({ where: { id: S.purchaseZ || 'x' }, include: { items: true } })
  check(F, 'aprobada sin stock → esperando_stock con fecha y precio ajustado, sin cobro', zOk.status === 200 && pZ?.status === 'esperando_stock' && pZ?.availableFrom?.toISOString().slice(0, 10) === fecha && pZ?.total === 1900 && pZ?.items?.[0]?.unitPrice === 950 && !pZ?.chargeId, `${brief(zOk)} ${JSON.stringify(pZ)}`)
  check(F, '…y NO se descontó stock', (await q(S.stockZero)) === 0 && (await db.stockMovement.count({ where: { stockId: S.stockZero, type: 'reserva' } })) === 0)
  check(F, 'el cliente ve la fecha aproximada (notificación)', !!(await db.notification.findFirst({ where: { userId: C.id, type: 'reserva_aprobada_sin_stock' } })))
  st(F, 'pagar mientras espera stock', await patch(C, `/api/purchases/${S.purchaseZ}`, { action: 'pagar_efectivo' }), 409)
  st(F, 'entregar mientras espera stock', await patch(V, `/api/purchases/${S.purchaseZ}`, { action: 'entregar' }), 409)
  st(F, 'el cliente no marca disponible', await patch(C, `/api/purchases/${S.purchaseZ}`, { action: 'disponible' }), 403)
  st(F, 'otro no marca disponible', await patch(P2, `/api/purchases/${S.purchaseZ}`, { action: 'disponible' }), 403)
  const zShort = await patch(V, `/api/purchases/${S.purchaseZ}`, { action: 'disponible' })
  check(F, '"disponible" sin haber cargado stock → 409 que dice cuál', zShort.status === 409 && /Caño PVC 63/i.test(zShort.data?.error || ''), brief(zShort))
  await patch(V, '/api/provider/stock', { id: S.stockZero, quantity: 5 })
  const zDisp = await patch(V, `/api/purchases/${S.purchaseZ}`, { action: 'disponible' })
  const pZ2 = await db.purchase.findUnique({ where: { id: S.purchaseZ || 'x' } })
  const hz = pZ2?.reservationExpiresAt ? (new Date(pZ2.reservationExpiresAt).getTime() - Date.now()) / 3600000 : 0
  check(F, 'disponible → reserva el stock (5 → 3), emite el cobro y arranca el plazo de 48 h', zDisp.status === 200 && pZ2?.status === 'aprobado' && (await q(S.stockZero)) === 3 && !!pZ2?.chargeId && hz > 47.9 && hz <= 48.01, `${brief(zDisp)} h=${hz}`)
  check(F, 'cobro por el precio ajustado (1900)', (await db.providerCharge.findUnique({ where: { id: pZ2?.chargeId || 'x' } }))?.amount === 1900)
  check(F, 'cliente avisado: "Tu reserva ya está para retirar"', !!(await db.notification.findFirst({ where: { userId: C.id, type: 'reserva_disponible' } })))
  st(F, 'marcar disponible dos veces', await patch(V, `/api/purchases/${S.purchaseZ}`, { action: 'disponible' }), 409)
  const evZ = (await db.activityEvent.findMany({ where: { purchaseId: S.purchaseZ || 'x' } })).map((e) => e.type)
  check(F, 'línea de tiempo: subpedido_creado → aprobado_sin_stock → disponible', ['subpedido_creado', 'aprobado_sin_stock', 'disponible'].every((t) => evZ.includes(t)), evZ.join(','))
  st(F, 'el cliente cancela la reserva disponible', await patch(C, `/api/purchases/${S.purchaseZ}`, { action: 'cancelar' }), 200)
  check(F, '…y el stock vuelve (3 → 5)', (await q(S.stockZero)) === 5)
  // una reserva esperando stock también se cancela (sin tocar stock)
  const zr2 = await post(C, '/api/purchases', { stockId: S.stockZero, quantity: 50, type: 'reserva' })
  await patch(V, `/api/purchases/${zr2.data?.purchase?.id}`, { action: 'aprobar', availableFrom: fecha })
  const zc2 = await patch(V, `/api/purchases/${zr2.data?.purchase?.id}`, { action: 'cancelar' })
  check(F, 'el proveedor cancela sin motivo → 400 needsReason', zc2.status === 400 && zc2.data?.needsReason === true, brief(zc2))
  st(F, 'el proveedor cancela una reserva que espera stock, con motivo', await patch(V, `/api/purchases/${zr2.data?.purchase?.id}`, { action: 'cancelar', reason: `${MARK} el fabricante no entrega` }), 200)
  check(F, '…sin tocar el stock', (await q(S.stockZero)) === 5)

  // entregado sin pagar → el cliente todavía puede pagar
  const pe2 = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 1, type: 'compra' })
  S.purchaseE = pe2.data?.purchase?.id
  const enE = await patch(V, `/api/purchases/${S.purchaseE}`, { action: 'entregar' })
  check(F, 'entregar sin pago → "entregado"', enE.data?.status === 'entregado', brief(enE))
  const payE = await patch(C, `/api/purchases/${S.purchaseE}`, { action: 'pagar_efectivo' })
  st(F, 'cliente acuerda efectivo de un pedido ya entregado', payE, 200)
  const chE = (await db.purchase.findUnique({ where: { id: S.purchaseE } }))?.chargeId
  st(F, 'proveedor confirma el efectivo del entregado', await patch(V, `/api/charges/${chE}`, {}), 200)
  check(F, 'entregado + cobro confirmado → pagado', (await db.purchase.findUnique({ where: { id: S.purchaseE } })).status === 'pagado')

  // ── el proveedor cancela una compra YA PAGADA (no entregada) ──
  const pg = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 2, type: 'compra' })
  const pgId = pg.data?.purchase?.id
  await patch(C, `/api/purchases/${pgId}`, { action: 'pagar_efectivo' })
  const chG = (await db.purchase.findUnique({ where: { id: pgId || 'x' } }))?.chargeId
  await patch(V, `/api/charges/${chG}`, {})
  const qG = await q(S.stock1)
  const cg = await patch(V, `/api/purchases/${pgId}`, { action: 'cancelar', reason: `${MARK} se mojaron en el depósito` })
  check(F, 'proveedor cancela una compra pagada en efectivo (no entregada): libera stock y avisa que devuelve en mano', cg.status === 200 && (await q(S.stock1)) === qG + 2 && (await db.providerCharge.findUnique({ where: { id: chG || 'x' } }))?.status === 'reembolsada', brief(cg))
  check(F, '…el cliente recibe el motivo y el aviso de la devolución en efectivo', !!(await db.notification.findFirst({ where: { userId: C.id, type: 'compra_cancelada', body: { contains: 'se mojaron' } } })) && !!(await db.notification.findFirst({ where: { userId: C.id, type: 'compra_cancelada', body: { contains: 'en efectivo' } } })))
  // pagada por Mercado Pago (simulada en la base: sin pago real) → reembolso con el token del vendedor
  const ph = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 1, type: 'compra' })
  const phId = ph.data?.purchase?.id
  const fakePay = `e2e${TS}`
  const phRow = await db.purchase.update({ where: { id: phId || 'x' }, data: { status: 'pagado', paymentMethod: 'mercadopago', mpPaymentId: fakePay } })
  await db.providerCharge.update({ where: { id: phRow.chargeId || 'x' }, data: { status: 'pagada', method: 'mercadopago', mpPaymentId: fakePay, paidAt: new Date() } })
  const qH = await q(S.stock1)
  const ch1 = await patch(V, `/api/purchases/${phId}`, { action: 'cancelar', reason: `${MARK} no llego a entregar` })
  check(F, 'cancelar pagada por MP sin MP del proveedor conectado → 409 needsMp y NO se cancela nada', ch1.status === 409 && ch1.data?.needsMp === true && (await db.purchase.findUnique({ where: { id: phId } })).status === 'pagado' && (await q(S.stock1)) === qH, brief(ch1))
  const testToken = process.env.MP_TEST_ACCESS_TOKEN
  if (testToken) {
    await db.providerProfile.update({ where: { id: V.provId }, data: { mpOauthAccessToken: testToken, mpOauthStatus: 'connected', mpOauthExpiresAt: new Date(Date.now() + 180 * 86400000) } })
    const ch2 = await patch(V, `/api/purchases/${phId}`, { action: 'cancelar', reason: `${MARK} no llego a entregar` })
    check(F, 'con MP conectado intenta el reembolso con el token del vendedor (pago inexistente → MP lo rechaza → 502 y NO se cancela nada)', ch2.status === 502 && /no se canceló nada/i.test(ch2.data?.error || '') && (await db.purchase.findUnique({ where: { id: phId } })).status === 'pagado' && (await q(S.stock1)) === qH, brief(ch2))
    await db.providerProfile.update({ where: { id: V.provId }, data: { mpOauthAccessToken: null, mpOauthStatus: 'disconnected', mpOauthExpiresAt: null } })
  } else {
    check(F, 'MP_TEST_ACCESS_TOKEN configurado para probar el reembolso', false, 'falta MP_TEST_ACCESS_TOKEN en .env')
  }
  // se deja cancelada a mano para no dejar stock tomado
  await db.purchase.update({ where: { id: phId }, data: { status: 'cancelado' } })
  await db.providerStock.update({ where: { id: S.stock1 }, data: { quantity: { increment: 1 } } })

  // ── vencimientos por cron ──
  const pd = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 1, type: 'reserva' })
  S.purchaseD = pd.data?.purchase?.id
  const apD = await patch(V, `/api/purchases/${S.purchaseD}`, { action: 'aprobar' })
  const pi = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 1, type: 'compra' }) // compra impaga (24 h)
  const pj = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 1, type: 'compra' }) // compra con efectivo (7 días)
  await patch(C, `/api/purchases/${pj.data?.purchase?.id}`, { action: 'pagar_efectivo' })
  const idsCron = [S.purchaseD, pi.data?.purchase?.id, pj.data?.purchase?.id].filter(Boolean)
  const past = new Date(Date.now() - 60_000)
  await db.purchase.updateMany({ where: { id: { in: idsCron } }, data: { reservationExpiresAt: past } })
  const beforeCron = await q(S.stock1)
  st(F, 'cron sin secreto', await get(ANON, '/api/cron/reservations'), 401)
  st(F, 'cron con secreto incorrecto', await get(ANON, '/api/cron/reservations', { headers: { authorization: 'Bearer nope' } }), 401)
  const estado = await cronOk(idsCron)
  if (estado === 'sin_secreto') {
    check(F, 'CRON_SECRET configurado para probar el cron', false, 'falta CRON_SECRET en .env')
  } else if (estado === 'ajenas') {
    check(F, 'cron no corrido: hay vencidos ajenos (no se tocan datos reales)', true)
    for (const id of idsCron) await patch(C, `/api/purchases/${id}`, { action: 'cancelar' })
  } else {
    const cr = await get(ANON, '/api/cron/reservations', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
    check(F, 'cron vence los 3 (reserva 48 h, compra impaga 24 h, compra en efectivo 7 días)', cr.status === 200 && cr.data?.cancelled >= 3, brief(cr))
    const [pD, pI, pJ] = await Promise.all(idsCron.map((id) => db.purchase.findUnique({ where: { id } })))
    check(F, 'reserva vencida → cancelada con motivo', pD.status === 'cancelado' && /reserva vencida/i.test(pD.rejectionReason || ''), JSON.stringify(pD))
    check(F, 'compra impaga a las 24 h → cancelada con motivo', pI.status === 'cancelado' && /24 h/.test(pI.rejectionReason || ''), JSON.stringify(pI))
    check(F, 'compra con efectivo a los 7 días → cancelada con motivo', pJ.status === 'cancelado' && /7 días/.test(pJ.rejectionReason || ''), JSON.stringify(pJ))
    check(F, 'cron devuelve el stock de los 3 (+3)', (await q(S.stock1)) === beforeCron + 3)
    check(F, 'cron anula los cobros', (await db.providerCharge.findUnique({ where: { id: apD.data?.chargeId || 'x' } }))?.status === 'anulada' && (await db.providerCharge.findUnique({ where: { id: pI.chargeId || 'x' } }))?.status === 'anulada')
    check(F, 'cron avisa a las dos partes', (await db.notification.count({ where: { type: 'reserva_vencida', userId: { in: [C.id, V.id] } } })) >= 6)
    check(F, 'cron deja el motivo en la línea de tiempo', (await db.activityEvent.count({ where: { purchaseId: { in: idsCron }, type: 'vencido' } })) === 3)
  }

  const lc = await get(C, '/api/purchases')
  check(F, 'mis compras (cliente) con cobro adjunto', (lc.data?.purchases || []).find((p) => p.id === S.purchaseA)?.charge?.status === 'pagada', brief(lc))
  const lv = await get(V, '/api/purchases?as=proveedor')
  check(F, 'mis ventas (proveedor)', (lv.data?.purchases || []).some((p) => p.id === S.purchaseA), brief(lv))
  st(F, 'ventas como cliente', await get(C, '/api/purchases?as=proveedor'), 403)
}

// ═════════════════════════════ G. SOBRANTES ═════════════════════════════
async function flowG() {
  const F = 'G'
  st(F, 'upload sin sesión', await upload(ANON, 'sobrantes'), 401)
  st(F, 'upload de un archivo que no es imagen', await upload(C, 'sobrantes', 1, { buffer: Buffer.from('hola, no soy una imagen'), type: 'image/jpeg' }), 400)
  st(F, 'upload de un tipo no permitido', await upload(C, 'sobrantes', 1, { buffer: Buffer.from('%PDF-1.4'), type: 'application/pdf', name: 'x.pdf' }), 400)
  const up = await upload(C, 'sobrantes', 3)
  st(F, 'upload de foto real (JPG) a sobrantes', up, 201)
  const photo = up.data?.url
  check(F, 'foto en el bucket público homia-uploads/<userId>/sobrantes', typeof photo === 'string' && photo.includes(`/homia-uploads/${C.id}/sobrantes/`), brief(up))
  const imgRes = photo ? await fetch(photo) : null
  check(F, 'la foto subida es accesible públicamente', imgRes?.status === 200 && (imgRes.headers.get('content-type') || '').includes('image/jpeg'), `HTTP ${imgRes?.status}`)
  const upP = await upload(P, 'sobrantes', 4)
  const photoP = upP.data?.url

  // compra directa pagada (efectivo)
  const el = await get(C, `/api/returns/eligible?purchaseId=${S.purchaseA}`)
  check(F, 'elegibles de la compra pagada', el.status === 200 && el.data?.items?.[0]?.remaining === 5 && el.data?.items?.[0]?.paymentMethod === 'efectivo', brief(el))
  const elB = await get(C, `/api/returns/eligible?purchaseId=${S.purchaseB}`)
  check(F, 'compra cancelada no es elegible', elB.status === 200 && elB.data?.items?.length === 0 && !!elB.data?.notEligibleReason, brief(elB))
  st(F, 'elegibles sin origen', await get(C, '/api/returns/eligible'), 400)
  st(F, 'elegibles de compra ajena', await get(P2, `/api/returns/eligible?purchaseId=${S.purchaseA}`), 403)
  const item = { purchaseId: S.purchaseA, elementId: S.E1.id, condition: 'sin_abrir', photoUrl: photo }
  st(F, 'devolución con más cantidad que la comprada', await post(C, '/api/returns', { purchaseId: S.purchaseA, items: [{ ...item, qty: 6 }] }), 409)
  st(F, 'devolución con foto externa', await post(C, '/api/returns', { purchaseId: S.purchaseA, items: [{ ...item, qty: 1, photoUrl: 'https://evil.example.com/a.jpg' }] }), 400)
  st(F, 'devolución sin ítems', await post(C, '/api/returns', { purchaseId: S.purchaseA, items: [] }), 400)
  st(F, 'devolución de compra no pagada', await post(C, '/api/returns', { purchaseId: S.purchaseB, items: [{ ...item, purchaseId: S.purchaseB, qty: 1 }] }), 409)
  st(F, 'devolución de compra ajena', await post(P2, '/api/returns', { purchaseId: S.purchaseA, items: [{ ...item, qty: 1 }] }), 403)
  st(F, 'devolución con elemento que no es de la compra', await post(C, '/api/returns', { purchaseId: S.purchaseA, items: [{ ...item, elementId: S.E3.id, qty: 1 }] }), 400)
  st(F, 'devolución con proyecto y compra a la vez', await post(C, '/api/returns', { purchaseId: S.purchaseA, projectId: S.project1, items: [{ ...item, qty: 1 }] }), 400)
  const stockBefore = (await db.providerStock.findUnique({ where: { id: S.stock1 } })).quantity
  const r1 = await post(C, '/api/returns', { purchaseId: S.purchaseA, items: [{ ...item, qty: 2, note: `${MARK} sin abrir` }, { ...item, qty: 1, condition: 'abierto_sin_usar' }] })
  st(F, 'cliente pide devolver 2 ítems (3 u.)', r1, 201)
  S.ret1 = r1.data?.return?.id
  check(F, 'devolución solicitada con pago efectivo del origen', r1.data?.return?.status === 'solicitada' && r1.data?.return?.paymentMethod === 'efectivo' && r1.data?.return?.chargeId === S.chargeA, brief(r1))
  check(F, 'proveedor notificado de la devolución', !!(await db.notification.findFirst({ where: { userId: V.id, type: 'devolucion_solicitada' } })))
  st(F, 'doble devolución que pasa lo comprado', await post(C, '/api/returns', { purchaseId: S.purchaseA, items: [{ ...item, qty: 3 }] }), 409)
  st(F, 'cliente no acepta su devolución', await patch(C, `/api/returns/${S.ret1}`, { action: 'aceptar' }), 403)
  st(F, 'tercero no ve la devolución', await patch(P2, `/api/returns/${S.ret1}`, { action: 'cancelar' }), 403)
  st(F, 'recibir antes de aceptar', await patch(V, `/api/returns/${S.ret1}`, { action: 'recibir' }), 409)
  st(F, 'acción de devolución inválida', await patch(V, `/api/returns/${S.ret1}`, { action: 'quemar' }), 400)
  const items1 = r1.data?.return?.items || []
  st(F, 'aceptar más de lo pedido', await patch(V, `/api/returns/${S.ret1}`, { action: 'aceptar', items: [{ id: items1[0]?.id, qtyAccepted: 5 }] }), 400)
  st(F, 'reembolso mayor a lo pagado', await patch(V, `/api/returns/${S.ret1}`, { action: 'aceptar', items: [{ id: items1[0]?.id, qtyAccepted: 1, refundAmount: 999999 }] }), 400)
  const acc = await patch(V, `/api/returns/${S.ret1}`, { action: 'aceptar', items: [{ id: items1[0]?.id, qtyAccepted: 1 }, { id: items1[1]?.id, qtyAccepted: 1 }] })
  check(F, 'proveedor acepta parcial (2 de 3 u.)', acc.status === 200 && acc.data?.status === 'aceptada_parcial' && acc.data?.refundTotal === 2 * 1600, brief(acc))
  st(F, 'aceptar dos veces', await patch(V, `/api/returns/${S.ret1}`, { action: 'aceptar' }), 409)
  st(F, 'cliente no cancela una devolución ya aceptada', await patch(C, `/api/returns/${S.ret1}`, { action: 'cancelar' }), 409)
  const rec = await patch(V, `/api/returns/${S.ret1}`, { action: 'recibir' })
  check(F, 'proveedor recibe → recibida (efectivo)', rec.status === 200 && rec.data?.status === 'recibida', brief(rec))
  check(F, 'lo recibido vuelve al stock (+2)', (await db.providerStock.findUnique({ where: { id: S.stock1 } })).quantity === stockBefore + 2)
  check(F, 'movimiento de devolución registrado', !!(await db.stockMovement.findFirst({ where: { stockId: S.stock1, type: 'devolucion' } })))
  st(F, 'recibir dos veces', await patch(V, `/api/returns/${S.ret1}`, { action: 'recibir' }), 409)
  const rf = await patch(V, `/api/returns/${S.ret1}`, { action: 'reembolsar_efectivo' })
  check(F, 'reembolso en efectivo → reembolsada', rf.status === 200 && rf.data?.status === 'reembolsada', brief(rf))
  // el solicitante confirma que recibió el efectivo (diseño §6.1)
  st(F, 'el proveedor no confirma por el cliente', await patch(V, `/api/returns/${S.ret1}`, { action: 'confirmar_reembolso' }), 403)
  const cf = await patch(C, `/api/returns/${S.ret1}`, { action: 'confirmar_reembolso' })
  check(F, 'el cliente confirma que recibió el reembolso en efectivo', cf.status === 200 && (await db.leftoverReturn.findUnique({ where: { id: S.ret1 } }))?.refundConfirmedBy === 'solicitante', brief(cf))
  st(F, 'confirmar el reembolso dos veces', await patch(C, `/api/returns/${S.ret1}`, { action: 'confirmar_reembolso' }), 409)
  check(F, 'proveedor notificado de la confirmación', !!(await db.notification.findFirst({ where: { userId: V.id, type: 'devolucion_reembolso_confirmado' } })))
  const elA2 = await get(C, `/api/returns/eligible?purchaseId=${S.purchaseA}`)
  check(F, 'lo devuelto se descuenta de lo elegible (quedan 3)', elA2.data?.items?.[0]?.remaining === 3, brief(elA2))

  // ── materiales de proyecto (D14, 24/09/2026: devuelve la plata quien la cobró) ──
  // (a) modo pro_adelanta (proyecto 1, materiales en la factura del pro): la contraparte del cliente es el PROFESIONAL
  const e1 = await get(C, `/api/returns/eligible?projectId=${S.project1}`)
  const e1m = (e1.data?.items || []).find((i) => i.materialId === S.m1)
  check(F, 'elegibles del cliente (factura pagada en efectivo): vendedor = profesional', e1m?.remaining === 10 && e1m?.invoiceId === S.inv1 && e1m?.sellerKind === 'profesional', brief(e1))
  check(F, 'material sin proveedor no es elegible', !(e1.data?.items || []).some((i) => i.materialId === S.mAlt))
  const e1p = await get(P, `/api/returns/eligible?projectId=${S.project1}`)
  check(F, 'el pro no se devuelve a sí mismo lo que cobró en su factura', e1p.status === 200 && !(e1p.data?.items || []).some((i) => i.materialId === S.m1) && /Pedir devolución/.test(e1p.data?.notEligibleReason || ''), brief(e1p))
  const e2 = await get(C, `/api/returns/eligible?projectId=${S.project2}`)
  check(F, 'elegibles del proyecto modo B (cobro del proveedor pagado): vendedor = proveedor', (e2.data?.items || []).some((i) => i.materialId === S.m6 && i.chargeId === S.charge2 && i.sellerKind === 'proveedor'), brief(e2))
  st(F, 'elegibles de proyecto ajeno', await get(P2, `/api/returns/eligible?projectId=${S.project1}`), 403)
  const mItem = { materialId: S.m1, elementId: S.E3.id, condition: 'sin_abrir', photoUrl: photoP }
  st(F, 'devolución de material no pagado (proyecto 3 cancelado)', await post(C, '/api/returns', { projectId: S.project3, items: [{ ...mItem, materialId: 'x', qty: 1 }] }), 404)
  st(F, 'el pro no pide como comprador lo que cobró en su factura', await post(P, '/api/returns', { projectId: S.project1, items: [{ ...mItem, qty: 3 }] }), 409)
  const s3a = (await db.providerStock.findUnique({ where: { id: S.stock3 } })).quantity
  const nVSolic = await db.notification.count({ where: { userId: V.id, type: 'devolucion_solicitada' } })
  const rc = await post(C, '/api/returns', { projectId: S.project1, items: [{ ...mItem, photoUrl: photo, qty: 3 }] })
  st(F, 'el cliente pide devolver sobrantes del proyecto (modo pro_adelanta)', rc, 201)
  S.retC = rc.data?.return?.id
  const dbRc = S.retC ? await db.leftoverReturn.findUnique({ where: { id: S.retC } }) : null
  check(F, 'la devolución es con el PROFESIONAL (sin proveedor, con su factura)', dbRc?.tipo === 'cliente' && dbRc?.sellerKind === 'profesional' && dbRc?.professionalId === P.proId && dbRc?.providerId === null && dbRc?.invoiceId === S.inv1, JSON.stringify(dbRc)?.slice(0, 240))
  const nPSolic = await db.notification.findFirst({ where: { userId: P.id, type: 'devolucion_solicitada' }, orderBy: { createdAt: 'desc' } })
  check(F, 'le llega al profesional con link a SU panel de devoluciones', !!nPSolic && !linkProblem(nPSolic.link, ['profesional']) && nPSolic.link.includes('/panel/profesional/devoluciones'), `link=${nPSolic?.link}`)
  check(F, 'al proveedor NO le llega', (await db.notification.count({ where: { userId: V.id, type: 'devolucion_solicitada' } })) === nVSolic)
  const lvC = await get(V, '/api/returns?role=proveedor')
  check(F, 'el proveedor no la ve en sus devoluciones', lvC.status === 200 && !(lvC.data?.returns || []).some((r) => r.id === S.retC), brief(lvC))
  st(F, 'el proveedor no puede aceptarla', await patch(V, `/api/returns/${S.retC}`, { action: 'aceptar' }), 403)
  st(F, 'el proveedor no puede marcarla recibida', await patch(V, `/api/returns/${S.retC}`, { action: 'recibir' }), 403)
  st(F, 'el cliente no acepta su propia devolución', await patch(C, `/api/returns/${S.retC}`, { action: 'aceptar' }), 403)
  st(F, 'un tercero no actúa sobre ella', await patch(P2, `/api/returns/${S.retC}`, { action: 'rechazar', note: 'x' }), 403)
  const lpC = await get(P, '/api/returns?role=profesional')
  check(F, 'el profesional la ve en "De mis clientes" con su nombre como vendedor', (lpC.data?.returns || []).some((r) => r.id === S.retC && r.sellerKind === 'profesional' && !!r.sellerName && !linkProblem(`#${r.origin?.href}`, ['profesional'])), brief(lpC))
  st(F, 'devoluciones como profesional sin serlo', await get(V, '/api/returns?role=profesional'), 403)
  const itC = rc.data?.return?.items?.[0]?.id
  st(F, 'el pro no acepta más de lo pedido', await patch(P, `/api/returns/${S.retC}`, { action: 'aceptar', items: [{ id: itC, qtyAccepted: 4 }] }), 400)
  const accC = await patch(P, `/api/returns/${S.retC}`, { action: 'aceptar', items: [{ id: itC, qtyAccepted: 2 }] })
  check(F, 'el profesional acepta en parte (2 de 3)', accC.status === 200 && accC.data?.status === 'aceptada_parcial' && accC.data?.refundTotal === 4000, brief(accC))
  const nCAcc = await db.notification.findFirst({ where: { userId: C.id, type: 'devolucion_aceptada' }, orderBy: { createdAt: 'desc' } })
  check(F, 'el cliente recibe el aviso de aceptación con link a su proyecto', !!nCAcc && !linkProblem(nCAcc.link, ['cliente']) && /entregale los sobrantes/.test(nCAcc.title), `${nCAcc?.title} ${nCAcc?.link}`)
  const recC = await patch(P, `/api/returns/${S.retC}`, { action: 'recibir' })
  check(F, 'el profesional recibe → recibida (efectivo)', recC.status === 200 && recC.data?.status === 'recibida' && recC.data?.refundTotal === 4000, brief(recC))
  check(F, 'el stock del proveedor NO cambia (los materiales los recibe el profesional)', (await db.providerStock.findUnique({ where: { id: S.stock3 } })).quantity === s3a)
  check(F, 'sin movimiento de stock por esta devolución', (await db.stockMovement.count({ where: { note: { contains: S.retC || 'x' } } })) === 0)
  st(F, '"reembolsar por fuera" no aplica a la devolución del cliente', await patch(P, `/api/returns/${S.retC}`, { action: 'reembolsar_fuera', metodo: 'efectivo' }), 409)
  const rfC = await patch(P, `/api/returns/${S.retC}`, { action: 'reembolsar_efectivo' })
  check(F, 'el profesional registra el reembolso en efectivo', rfC.status === 200 && rfC.data?.status === 'reembolsada' && (await db.leftoverReturn.findUnique({ where: { id: S.retC } }))?.refundChannel === 'efectivo', brief(rfC))
  st(F, 'el profesional no confirma por el cliente', await patch(P, `/api/returns/${S.retC}`, { action: 'confirmar_reembolso' }), 403)
  const cfC = await patch(C, `/api/returns/${S.retC}`, { action: 'confirmar_reembolso' })
  check(F, 'el cliente confirma que recibió el reembolso del profesional', cfC.status === 200 && (await db.leftoverReturn.findUnique({ where: { id: S.retC } }))?.refundConfirmedBy === 'solicitante', brief(cfC))
  check(F, 'el profesional recibe el aviso de la confirmación', !!(await db.notification.findFirst({ where: { userId: P.id, type: 'devolucion_reembolso_confirmado' } })))
  check(F, 'queda en la línea de tiempo del proyecto', (await db.activityEvent.count({ where: { projectId: S.project1, type: { startsWith: 'devolucion_' } } })) >= 5)

  // (b) pata profesional → proveedor (pago por fuera de HomIA), precargada con lo que devolvió el cliente
  const ep = await get(P, `/api/returns/eligible?tipo=profesional_a_proveedor&projectId=${S.project1}`)
  const epm = (ep.data?.items || []).find((i) => i.materialId === S.m1)
  check(F, 'elegibles al proveedor: lo que le vendió (10 u.) y la precarga con lo recibido del cliente (2 u.)', epm?.remaining === 10 && epm?.providerId === V.provId && (ep.data?.prefill || []).some((x) => x.returnId === S.retC && x.materialId === S.m1 && x.qty === 2), brief(ep))
  st(F, 'el cliente no ve los elegibles al proveedor', await get(C, `/api/returns/eligible?tipo=profesional_a_proveedor&projectId=${S.project1}`), 403)
  const ep2 = await get(P, `/api/returns/eligible?tipo=profesional_a_proveedor&projectId=${S.project2}`)
  check(F, 'modo B: lo pagó el cliente al proveedor → no hay devolución del pro al proveedor', ep2.status === 200 && !(ep2.data?.items || []).some((i) => i.materialId === S.m6), brief(ep2))
  const proLeg = (extra) => ({ tipo: 'profesional_a_proveedor', projectId: S.project1, items: [{ ...mItem, photoUrl: photo, qty: 2, note: `${MARK} devuelto por el cliente` }], ...extra })
  st(F, 'el cliente no puede pedir la devolución al proveedor', await post(C, '/api/returns', proLeg()), 403)
  st(F, 'un tercero no puede pedirla', await post(P2, '/api/returns', proLeg()), 403)
  st(F, 'vincular una devolución de otro origen', await post(P, '/api/returns', proLeg({ parentReturnId: S.ret1 })), 400)
  st(F, 'pedirle al proveedor más de lo que le vendió → 409', await post(P, '/api/returns', proLeg({ items: [{ ...mItem, qty: 11 }] })), 409)
  st(F, 'modo B: el pro no le pide al proveedor lo que pagó el cliente', await post(P, '/api/returns', { tipo: 'profesional_a_proveedor', projectId: S.project2, items: [{ materialId: S.m6, elementId: S.E3.id, condition: 'sin_abrir', photoUrl: photo, qty: 1 }] }), 409)
  // un pedido que el proveedor rechaza (no consume cantidad)
  const rpr = await post(P, '/api/returns', proLeg({ items: [{ ...mItem, qty: 1 }] }))
  st(F, 'el pro pide devolver 1 u. al proveedor', rpr, 201)
  st(F, 'el proveedor lo rechaza con motivo', await patch(V, `/api/returns/${rpr.data?.return?.id}`, { action: 'rechazar', note: `${MARK} Ya no lo vendemos` }), 200)
  const nPRej = await db.notification.findFirst({ where: { userId: P.id, type: 'devolucion_rechazada' } })
  check(F, 'el pro (solicitante) recibe el rechazo con link a SU panel', !!nPRej && !linkProblem(nPRej.link, ['profesional']), `link=${nPRej?.link}`)
  const s3b = (await db.providerStock.findUnique({ where: { id: S.stock3 } })).quantity
  const rpp = await post(P, '/api/returns', proLeg({ parentReturnId: S.retC }))
  st(F, 'el pro pide devolución al proveedor precargando lo recibido (2 u.)', rpp, 201)
  S.retPP = rpp.data?.return?.id
  const dbPP = S.retPP ? await db.leftoverReturn.findUnique({ where: { id: S.retPP } }) : null
  check(F, 'vinculada a la devolución del cliente, vendedor = proveedor, sin pago en HomIA', dbPP?.tipo === 'profesional_a_proveedor' && dbPP?.sellerKind === 'proveedor' && dbPP?.providerId === V.provId && dbPP?.parentReturnId === S.retC && dbPP?.paymentMethod === null && dbPP?.invoiceId === null, JSON.stringify(dbPP)?.slice(0, 240))
  const nVPro = await db.notification.findFirst({ where: { userId: V.id, type: 'devolucion_solicitada', title: { contains: 'profesional' } } })
  check(F, 'al proveedor le llega el pedido del profesional con link válido', !!nVPro && !linkProblem(nVPro.link, ['proveedor']), `${nVPro?.title} ${nVPro?.link}`)
  st(F, 'tope: 2 pedidas + 9 más supera lo vendido (10) → 409', await post(P, '/api/returns', proLeg({ items: [{ ...mItem, qty: 9 }] })), 409)
  const e1b = await get(C, `/api/returns/eligible?projectId=${S.project1}`)
  check(F, 'lo pedido al proveedor no descuenta lo que el cliente puede devolver (quedan 8)', (e1b.data?.items || []).find((i) => i.materialId === S.m1)?.remaining === 8, brief(e1b))
  st(F, 'el cliente no actúa sobre la devolución pro → proveedor', await patch(C, `/api/returns/${S.retPP}`, { action: 'cancelar' }), 403)
  st(F, 'el pro no acepta su propio pedido', await patch(P, `/api/returns/${S.retPP}`, { action: 'aceptar' }), 403)
  const lvP = await get(V, '/api/returns?role=proveedor')
  const rowPP = (lvP.data?.returns || []).find((r) => r.id === S.retPP)
  check(F, 'el proveedor la ve con el profesional y el proyecto', !!rowPP && rowPP.tipo === 'profesional_a_proveedor' && rowPP.requester?.id === P.id && rowPP.origin?.kind === 'proyecto', brief(lvP))
  const accPP = await patch(V, `/api/returns/${S.retPP}`, { action: 'aceptar' })
  check(F, 'el proveedor acepta todo (tope precio × cantidad)', accPP.status === 200 && accPP.data?.status === 'aceptada' && accPP.data?.refundTotal === 4000, brief(accPP))
  const recPP = await patch(V, `/api/returns/${S.retPP}`, { action: 'recibir' })
  check(F, 'el proveedor recibe → recibida (reembolso por fuera pendiente)', recPP.status === 200 && recPP.data?.status === 'recibida', brief(recPP))
  check(F, 'los materiales vuelven al stock del proveedor (+2)', (await db.providerStock.findUnique({ where: { id: S.stock3 } })).quantity === s3b + 2)
  check(F, 'movimiento de stock "devolucion" de esta devolución', !!(await db.stockMovement.findFirst({ where: { stockId: S.stock3, type: 'devolucion', note: { contains: S.retPP || 'x' } } })))
  st(F, 'en la pata pro → proveedor no se marca "efectivo" genérico', await patch(V, `/api/returns/${S.retPP}`, { action: 'reembolsar_efectivo' }), 409)
  st(F, 'reembolsar por fuera sin método', await patch(V, `/api/returns/${S.retPP}`, { action: 'reembolsar_fuera' }), 400)
  st(F, 'reembolsar por fuera con método inválido', await patch(V, `/api/returns/${S.retPP}`, { action: 'reembolsar_fuera', metodo: 'bitcoin' }), 400)
  st(F, 'nunca se reintenta por Mercado Pago en esta pata', await patch(V, `/api/returns/${S.retPP}`, { action: 'reintentar_reembolso' }), 409)
  const rfPP = await patch(V, `/api/returns/${S.retPP}`, { action: 'reembolsar_fuera', metodo: 'transferencia', nota: `${MARK} al alias del pro` })
  const dbPP2 = S.retPP ? await db.leftoverReturn.findUnique({ where: { id: S.retPP } }) : null
  check(F, 'el proveedor marca que le devolvió por transferencia (fuera de HomIA)', rfPP.status === 200 && dbPP2?.status === 'reembolsada' && dbPP2?.refundChannel === 'fuera_de_homia' && dbPP2?.refundMethod === 'transferencia' && !!dbPP2?.refundMethodNote && !dbPP2?.mpRefundId, brief(rfPP))
  const nPRf = await db.notification.findFirst({ where: { userId: P.id, type: 'devolucion_reembolsada' }, orderBy: { createdAt: 'desc' } })
  check(F, 'el pro recibe el aviso con link a Devoluciones → A mis proveedores', !!nPRf && !linkProblem(nPRf.link, ['profesional']) && nPRf.link.includes('tab=proveedores'), `link=${nPRf?.link}`)
  st(F, 'el proveedor no confirma por el profesional', await patch(V, `/api/returns/${S.retPP}`, { action: 'confirmar_reembolso' }), 403)
  const cfPP = await patch(P, `/api/returns/${S.retPP}`, { action: 'confirmar_reembolso' })
  check(F, 'el profesional confirma que recibió el reembolso', cfPP.status === 200 && (await db.leftoverReturn.findUnique({ where: { id: S.retPP } }))?.refundConfirmedBy === 'solicitante', brief(cfPP))
  check(F, 'el proveedor recibe el aviso de la confirmación', !!(await db.notification.findFirst({ where: { userId: V.id, type: 'devolucion_reembolso_confirmado', title: { contains: 'profesional' } } })))
  const lpP = await get(P, '/api/returns?role=solicitante&tipo=profesional_a_proveedor')
  check(F, 'el pro ve sus pedidos a proveedores ("A mis proveedores")', (lpP.data?.returns || []).some((r) => r.id === S.retPP && r.sellerName) && !(lpP.data?.returns || []).some((r) => r.tipo !== 'profesional_a_proveedor'), brief(lpP))

  // cron: confirmación automática a las 72 h (pata pro → proveedor) + recordatorio al vendedor (proveedor y profesional)
  const H72 = 72 * 3600_000
  const rpp2 = await post(P, '/api/returns', proLeg({ items: [{ ...mItem, qty: 1 }] }))
  S.retPP2 = rpp2.data?.return?.id
  await patch(V, `/api/returns/${S.retPP2}`, { action: 'aceptar' })
  await patch(V, `/api/returns/${S.retPP2}`, { action: 'recibir' })
  st(F, 'reembolso por fuera en efectivo (para el cron)', await patch(V, `/api/returns/${S.retPP2}`, { action: 'reembolsar_fuera', metodo: 'efectivo' }), 200)
  if (S.retPP2) await db.leftoverReturn.update({ where: { id: S.retPP2 }, data: { refundedAt: new Date(Date.now() - H72 - 3600_000) } })
  const rY = await post(C, '/api/returns', { purchaseId: S.purchaseA, items: [{ ...item, qty: 1 }] })
  st(F, 'devolución que el proveedor no responde', rY, 201)
  S.retY = rY.data?.return?.id
  const rY2 = await post(C, '/api/returns', { projectId: S.project1, items: [{ ...mItem, photoUrl: photo, qty: 1 }] })
  st(F, 'devolución que el profesional no responde', rY2, 201)
  S.retY2 = rY2.data?.return?.id
  for (const rid of [S.retY, S.retY2]) if (rid) await db.leftoverReturn.update({ where: { id: rid }, data: { requestedAt: new Date(Date.now() - H72 - 3600_000) } })
  const lim = new Date(Date.now() - H72)
  const ajenasConf = await db.leftoverReturn.count({
    where: {
      status: 'reembolsada', refundConfirmedAt: null, refundedAt: { lt: lim }, id: { notIn: [S.retPP2 || 'x'] },
      OR: [{ refundChannel: { in: ['efectivo', 'fuera_de_homia'] } }, { refundChannel: null, OR: [{ paymentMethod: null }, { paymentMethod: { not: 'mercadopago' } }] }],
    },
  })
  const ajenasRec = await db.leftoverReturn.count({ where: { status: 'solicitada', reminderSentAt: null, requestedAt: { lt: lim }, id: { notIn: [S.retY || 'x', S.retY2 || 'x'] } } })
  const ajenasRes = await db.purchase.count({ where: { status: 'aprobado', reservationExpiresAt: { lt: new Date() } } })
  if (!process.env.CRON_SECRET || ajenasConf + ajenasRec + ajenasRes > 0) {
    console.log(`  (cron de sobrantes NO corrido: ajenas conf=${ajenasConf} rec=${ajenasRec} res=${ajenasRes}, CRON_SECRET=${process.env.CRON_SECRET ? 'sí' : 'no'})`)
    check(F, 'cron de sobrantes no corrido: tocaría datos ajenos (o falta CRON_SECRET)', true)
  } else {
    console.log('  (cron de sobrantes corrido contra datos propios)')
    const cr = await get(ANON, '/api/cron/reservations', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
    const r72 = await db.leftoverReturn.findUnique({ where: { id: S.retPP2 } })
    check(F, 'cron: confirma solo el reembolso por fuera de HomIA a las 72 h', cr.status === 200 && cr.data?.autoConfirmed === 1 && r72?.refundConfirmedBy === 'automatico' && !!r72?.refundConfirmedAt, brief(cr))
    const nAuto = await db.notification.findFirst({ where: { userId: P.id, type: 'devolucion_reembolso_confirmado', title: { contains: 'automáticamente' } } })
    check(F, 'cron: el pro recibe el aviso con link a sus devoluciones', !!nAuto && !linkProblem(nAuto.link, ['profesional']), `link=${nAuto?.link}`)
    const nRecV = await db.notification.count({ where: { userId: V.id, type: 'devolucion_recordatorio' } })
    const nRecP = await db.notification.findFirst({ where: { userId: P.id, type: 'devolucion_recordatorio' } })
    check(F, 'cron: un recordatorio a cada vendedor (proveedor y profesional)', cr.data?.reminded === 2 && nRecV === 1 && !!nRecP && nRecP.link.includes('/panel/profesional/devoluciones'), brief(cr))
    const cr2 = await get(ANON, '/api/cron/reservations', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
    check(F, 'cron: el recordatorio no se repite', cr2.data?.reminded === 0 && (await db.notification.count({ where: { userId: V.id, type: 'devolucion_recordatorio' } })) === 1, brief(cr2))
  }
  if (S.retY) st(F, 'el cliente cancela la devolución sin responder (proveedor)', await patch(C, `/api/returns/${S.retY}`, { action: 'cancelar' }), 200)
  if (S.retY2) st(F, 'el cliente cancela la devolución sin responder (profesional)', await patch(C, `/api/returns/${S.retY2}`, { action: 'cancelar' }), 200)
  st(F, 'devolver todo el material otra vez (tope)', await post(C, '/api/returns', { projectId: S.project1, items: [{ ...mItem, photoUrl: photo, qty: 10 }] }), 409)

  // (c) regresión modo B (cliente_paga_proveedor): contraparte = proveedor, como siempre
  const rx = await post(C, '/api/returns', { projectId: S.project2, items: [{ materialId: S.m6, elementId: S.E3.id, condition: 'sin_abrir', photoUrl: photo, qty: 1 }] })
  st(F, 'devolución de material modo B', rx, 201)
  S.retX = rx.data?.return?.id
  const dbRx = S.retX ? await db.leftoverReturn.findUnique({ where: { id: S.retX } }) : null
  check(F, 'modo B: la devolución es con el proveedor (como antes)', dbRx?.tipo === 'cliente' && dbRx?.sellerKind === 'proveedor' && dbRx?.providerId === V.provId && dbRx?.chargeId === S.charge2, JSON.stringify(dbRx)?.slice(0, 200))
  st(F, 'modo B: el profesional no la gestiona', await patch(P, `/api/returns/${S.retX}`, { action: 'aceptar' }), 403)
  st(F, 'el proveedor no cancela (solo el solicitante)', await patch(V, `/api/returns/${S.retX}`, { action: 'cancelar' }), 403)
  st(F, 'el solicitante cancela', await patch(C, `/api/returns/${S.retX}`, { action: 'cancelar' }), 200)
  st(F, 'cancelar dos veces', await patch(C, `/api/returns/${S.retX}`, { action: 'cancelar' }), 409)
  const rxp = await post(P, '/api/returns', { projectId: S.project2, items: [{ materialId: S.m6, elementId: S.E3.id, condition: 'sin_abrir', photoUrl: photoP, qty: 1 }] })
  check(F, 'modo B: el profesional también puede devolverle al proveedor como comprador (como antes)', rxp.status === 201 && rxp.data?.return?.sellerKind === 'proveedor' && rxp.data?.return?.tipo === 'cliente', brief(rxp))
  if (rxp.data?.return?.id) st(F, 'el pro cancela su devolución modo B', await patch(P, `/api/returns/${rxp.data.return.id}`, { action: 'cancelar' }), 200)

  const lr = await get(C, '/api/returns')
  check(F, 'mis devoluciones (solicitante) con origen legible', (lr.data?.returns || []).some((r) => r.id === S.ret1 && r.origin?.kind === 'compra'), brief(lr))
  const lv = await get(V, '/api/returns?role=proveedor')
  check(F, 'devoluciones recibidas (proveedor): compra, pro → proveedor y modo B; ninguna del profesional', (lv.data?.returns || []).length >= 5 && !(lv.data?.returns || []).some((r) => r.sellerKind === 'profesional'), brief(lv))
  st(F, 'devoluciones como proveedor sin serlo', await get(C, '/api/returns?role=proveedor'), 403)
}

// ═════════════════════════════ H. RESEÑAS ═════════════════════════════
async function flowH() {
  const F = 'H'
  const up = await upload(C, 'reviews', 7)
  const photo = up.data?.url
  check(F, 'foto de reseña subida', up.status === 201 && !!photo, brief(up))
  const upP = await upload(P, 'reviews', 8)
  const base = { rating: 5, comment: `${MARK} Excelente trabajo, prolijo y puntual`, projectId: S.project1, context: 'proyecto' }
  st(F, 'reseña sin sesión', await post(ANON, '/api/reviews', { ...base, targetUserId: P.id }), 401)
  st(F, 'reseña con puntaje 6', await post(C, '/api/reviews', { ...base, targetUserId: P.id, rating: 6 }), 400)
  st(F, 'reseña con puntaje decimal', await post(C, '/api/reviews', { ...base, targetUserId: P.id, rating: 4.5 }), 400)
  st(F, 'reseña sin comentario', await post(C, '/api/reviews', { ...base, targetUserId: P.id, comment: '' }), 400)
  st(F, 'reseñarse a sí mismo', await post(C, '/api/reviews', { ...base, targetUserId: C.id }), 400)
  st(F, 'reseña en proyecto no finalizado', await post(C, '/api/reviews', { ...base, projectId: S.project2, targetUserId: P.id }), 403)
  st(F, 'reseña sin proyecto ni compra', await post(C, '/api/reviews', { ...base, projectId: undefined, targetUserId: P.id }), 403)
  const r1 = await post(C, '/api/reviews', { ...base, targetUserId: P.id, photos: [photo, 'https://evil.example.com/pixel.jpg'] })
  st(F, 'cliente → profesional (con foto)', r1, 201)
  const ph1 = JSON.parse(r1.data?.review?.photos || '[]')
  check(F, 'la foto de HomIA se guarda', ph1.includes(photo), JSON.stringify(ph1))
  check(F, 'fotos externas se descartan', !ph1.some((u) => u.includes('evil.example.com')), JSON.stringify(ph1))
  st(F, 'reseña duplicada', await post(C, '/api/reviews', { ...base, targetUserId: P.id }), 409)
  const r2 = await post(C, '/api/reviews', { ...base, rating: 4, comment: `${MARK} Buen proveedor, entregó a tiempo`, targetUserId: V.id, photos: [photo] })
  st(F, 'cliente → proveedor del proyecto', r2, 201)
  const r3 = await post(P, '/api/reviews', { ...base, rating: 5, comment: `${MARK} Cliente claro y buen pagador`, targetUserId: C.id, photos: [upP.data?.url] })
  st(F, 'profesional → cliente', r3, 201)
  st(F, 'profesional no reseña al proveedor', await post(P, '/api/reviews', { ...base, targetUserId: V.id }), 403)
  st(F, 'tercero no reseña en el proyecto', await post(P2, '/api/reviews', { ...base, targetUserId: P.id }), 403)
  // compra directa
  const rc = { rating: 3, comment: `${MARK} El caño llegó bien`, context: 'compra', targetUserId: V.id }
  st(F, 'reseña de compra cancelada', await post(C, '/api/reviews', { ...rc, purchaseId: S.purchaseB }), 403)
  st(F, 'reseña de compra a otro destinatario', await post(C, '/api/reviews', { ...rc, purchaseId: S.purchaseA, targetUserId: P.id }), 403)
  st(F, 'reseña de compra ajena', await post(P2, '/api/reviews', { ...rc, purchaseId: S.purchaseA }), 403)
  const r4 = await post(C, '/api/reviews', { ...rc, purchaseId: S.purchaseA, photos: [photo] })
  st(F, 'cliente → proveedor por compra directa (con foto)', r4, 201)
  check(F, 'foto de reseña de compra guardada', JSON.parse(r4.data?.review?.photos || '[]').includes(photo), brief(r4))
  st(F, 'reseña de compra duplicada', await post(C, '/api/reviews', { ...rc, purchaseId: S.purchaseA }), 409)
  const [uP, uV, uC, pp, pv] = await Promise.all([
    db.user.findUnique({ where: { id: P.id } }), db.user.findUnique({ where: { id: V.id } }), db.user.findUnique({ where: { id: C.id } }),
    db.professionalProfile.findUnique({ where: { id: P.proId } }), db.providerProfile.findUnique({ where: { id: V.provId } }),
  ])
  check(F, 'rating del profesional recalculado (5.0, 1 reseña)', uP.rating === 5 && uP.reviewsCount === 1 && pp.rating === 5 && pp.reviewsCount === 1, `${uP.rating}/${uP.reviewsCount}`)
  check(F, 'rating del proveedor recalculado (3.5, 2 reseñas)', uV.rating === 3.5 && uV.reviewsCount === 2 && pv.rating === 3.5 && pv.reviewsCount === 2, `${uV.rating}/${uV.reviewsCount}`)
  check(F, 'rating del cliente recalculado', uC.rating === 5 && uC.reviewsCount === 1)
  const gr = await get(ANON, `/api/reviews?targetUserId=${V.id}`)
  check(F, 'reseñas públicas del proveedor', gr.status === 200 && gr.data?.reviews?.length === 2, brief(gr))
  const mine = await get(C, `/api/reviews?mine=1&purchaseId=${S.purchaseA}`)
  check(F, 'mis reseñas por compra (mine=1)', mine.data?.reviews?.length === 1, brief(mine))
  const pv2 = await get(C, `/api/profiles/provider/${V.provId}`)
  check(F, 'perfil del proveedor muestra las reseñas', pv2.data?.reviews?.length === 2 && pv2.data?.profile?.reviewsCount === 2, brief(pv2))
  const cs = await get(P, `/api/users/${C.id}/client-summary`)
  check(F, 'resumen del cliente (confianza bidireccional)', cs.status === 200 && cs.data?.reviews?.length === 1 && cs.data?.stats?.proyectosFinalizados === 1 && cs.data?.stats?.comprasRealizadas >= 1, brief(cs))
  st(F, 'resumen del cliente sin sesión', await get(ANON, `/api/users/${C.id}/client-summary`), 401)
  const lst = await get(C, '/api/projects')
  check(F, 'canReview se apaga cuando ya reseñó a todos', (lst.data?.asClient || []).find((p) => p.id === S.project1)?.canReview === false, '')
}

// ═════════════════════════════ J. NOTIFICACIONES ═════════════════════════════
async function flowJ() {
  const F = 'J'
  const expected = {
    [C.id]: ['nuevo_presupuesto', 'proyecto_creado', 'mano_obra_cotizada', 'material_propuesto', 'factura_emitida', 'factura_efectivo_confirmado', 'cobro_materiales', 'cobro_efectivo_confirmado', 'compra_aprobada', 'compra_rechazada', 'compra_entregada', 'devolucion_aceptada', 'devolucion_recibida', 'devolucion_reembolsada', 'proyecto_cancelado', 'nueva_reseña', 'message'],
    [P.id]: ['nuevo_trabajo', 'presupuesto_aceptado', 'contratacion', 'material_aprobar', 'material_rechazar', 'factura_efectivo_acordado', 'vinculacion_activada', 'nueva_reseña', 'message', 'devolucion_rechazada', 'devolucion_solicitada', 'devolucion_reembolsada'],
    [P2.id]: ['nuevo_trabajo', 'presupuesto_rechazado'],
    [V.id]: ['vinculacion_solicitada', 'nueva_compra', 'cobro_efectivo_acordado', 'devolucion_solicitada', 'devolucion_cancelada', 'nueva_reseña', 'compra_cancelada'],
  }
  const actors = [C, P, P2, V]
  for (const a of actors) {
    const r = await get(a, '/api/notifications')
    st(F, `notificaciones de ${a.key}`, r, 200)
    // La API devuelve las últimas 50: en la corrida completa (A-P) el cliente junta más y las
    // primeras (proyecto_creado, message) quedan fuera de esa página. Los tipos generados se
    // cuentan en la base; la API se prueba aparte (200, lista, marcar leídas).
    const todas = await db.notification.findMany({ where: { userId: a.id }, select: { type: true } })
    const types = new Set(todas.map((n) => n.type))
    const missing = expected[a.id].filter((t) => !types.has(t))
    check(F, `${a.key}: se generaron las notificaciones de cada evento clave`, missing.length === 0, `faltan: ${missing.join(', ')}`)
    const roles = JSON.parse((await db.user.findUnique({ where: { id: a.id } })).roles)
    // todas (no solo las 50 del GET): se validan desde la DB
    const all = await db.notification.findMany({ where: { userId: a.id } })
    const bad = all.map((n) => ({ n, p: linkProblem(n.link, roles) })).filter((x) => x.p)
    check(F, `${a.key}: todos los links son rutas "#/..." válidas para su rol (${all.length})`, bad.length === 0, bad.map((x) => `${x.n.type}: ${x.p}`).join(' | '))
    // los links a proyectos/trabajos apuntan a entidades existentes
    const ents = all.map((n) => n.link || '').filter((l) => /#\/(panel\/\w+\/proyectos\/|trabajo\/)[^/?]+/.test(l))
    let broken = 0
    for (const l of ents) {
      const m = l.match(/proyectos\/([^/?]+)/)
      const j = l.match(/trabajo\/([^/?]+)/)
      if (m && !(await db.project.findUnique({ where: { id: m[1] } }))) broken++
      if (j && !(await db.jobPost.findUnique({ where: { id: j[1] } }))) broken++
    }
    check(F, `${a.key}: los links a proyectos/trabajos existen`, broken === 0, `rotos=${broken}`)
    check(F, `${a.key}: contador de no leídas`, r.data?.unread === all.filter((n) => !n.read).length, `unread=${r.data?.unread}`)
  }
  const one = (await db.notification.findFirst({ where: { userId: C.id, read: false } }))
  st(F, 'marcar una leída', await patch(C, '/api/notifications', { id: one?.id }), 200)
  check(F, 'queda leída en DB', (await db.notification.findUnique({ where: { id: one.id } })).read === true)
  await patch(C, '/api/notifications', { id: (await db.notification.findFirst({ where: { userId: P.id } })).id })
  check(F, 'no se puede marcar la notificación de otro', (await db.notification.findFirst({ where: { userId: P.id } })).read === false)
  st(F, 'marcar todas leídas', await patch(C, '/api/notifications', { all: true }), 200)
  const after = await get(C, '/api/notifications')
  check(F, 'no leídas en 0', after.data?.unread === 0, brief(after))
  st(F, 'marcar leídas sin sesión', await patch(ANON, '/api/notifications', { all: true }), 401)
  const an = await get(ANON, '/api/notifications')
  check(F, 'sin sesión: lista vacía', an.status === 200 && an.data?.notifications?.length === 0, brief(an))
}

// ═════════════════════════════ K. DNI ═════════════════════════════
async function flowK() {
  const F = 'K'
  const f = await upload(C, 'dni', 11)
  const b = await upload(C, 'dni', 12)
  st(F, 'subir frente del DNI', f, 201)
  st(F, 'subir dorso del DNI', b, 201)
  check(F, 'DNI va al bucket privado (path interno, sin URL pública)', f.data?.url?.startsWith(`dni-docs/${C.id}/dni/`) && f.data?.private === true && !/^https?:/.test(f.data?.url || ''), brief(f))
  const pf = await upload(P, 'dni', 13)
  st(F, 'verificar sin sesión', await post(ANON, '/api/verification/dni', { frontUrl: f.data?.url, backUrl: b.data?.url }), 401)
  st(F, 'verificar con path ajeno', await post(C, '/api/verification/dni', { frontUrl: pf.data?.url, backUrl: b.data?.url }), 400)
  st(F, 'verificar con URL externa', await post(C, '/api/verification/dni', { frontUrl: 'https://evil.example.com/dni.jpg', backUrl: b.data?.url }), 400)
  st(F, 'verificar con la misma foto dos veces', await post(C, '/api/verification/dni', { frontUrl: f.data?.url, backUrl: f.data?.url }), 400)
  const t0 = Date.now()
  const v = await post(C, '/api/verification/dni', { frontUrl: f.data?.url, backUrl: b.data?.url })
  check(F, 'verificación con IA responde sin 500', v.status === 201 && ['verificado', 'en_revision', 'rechazado'].includes(v.data?.status), `${brief(v)} (${Date.now() - t0} ms)`)
  const doc = await db.identityDocument.findUnique({ where: { id: v.data?.documentId || 'x' } })
  check(F, 'documento registrado con dictamen', !!doc && doc.status === v.data?.status && !!doc.aiNotes, JSON.stringify(doc)?.slice(0, 200))
  const u = await db.user.findUnique({ where: { id: C.id } })
  check(F, 'estado público del usuario actualizado según el dictamen', u.verificationStatus === (v.data?.status === 'verificado' ? 'verificado' : v.data?.status === 'rechazado' ? 'rechazado' : 'en_revision'), u.verificationStatus)
  const g = await get(C, '/api/verification/dni')
  check(F, 'GET verificación con signed URLs del dueño', g.status === 200 && /^https:\/\/.+token=/.test(g.data?.document?.frontUrl || ''), brief(g))
  // límite diario: se completan los intentos del día sin gastar IA (filas marcadas, se purgan)
  const today = await db.identityDocument.count({ where: { userId: C.id, createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } })
  for (let i = today; i < 3; i++) {
    const d = await db.identityDocument.create({ data: { userId: C.id, frontUrl: f.data.url, backUrl: b.data.url, status: 'en_revision', aiNotes: `${MARK} intento simulado` } })
    manifest.identityDocIdsInsertedByDb.push(d.id)
  }
  const lim = await post(C, '/api/verification/dni', { frontUrl: f.data?.url, backUrl: b.data?.url })
  st(F, 'cuarto intento del día', lim, 429)
}

// ═════════════════════════════ L. OBRAS ═════════════════════════════
async function flowL() {
  const F = 'L'
  const up = await upload(P, 'works', 21)
  const photo = up.data?.url
  st(F, 'foto de obra subida', up, 201)
  st(F, 'publicar obra sin sesión', await post(ANON, '/api/works', { title: 'x', description: 'y' }), 401)
  st(F, 'publicar obra con título corto', await post(P, '/api/works', { title: 'ab', description: 'Descripción suficiente' }), 400)
  const w = await post(P, '/api/works', { title: `${MARK} Living pintado`, description: `${MARK} Látex blanco, dos manos, enduido previo`, photos: [photo, 'https://evil.example.com/x.jpg'], projectId: S.project1, categorySlug: 'pintura' })
  st(F, 'profesional publica obra con fotos', w, 201)
  S.work = w.data?.work?.id
  const ph = JSON.parse(w.data?.work?.photos || '[]')
  check(F, 'obra vinculada a su perfil y al proyecto', w.data?.work?.professionalId === P.proId && w.data?.work?.projectId === S.project1, brief(w))
  check(F, 'obra: solo fotos de HomIA', ph.length === 1 && ph[0] === photo, JSON.stringify(ph))
  check(F, 'contador de obras del perfil +1', (await db.professionalProfile.findUnique({ where: { id: P.proId } })).worksCount === 1)
  const pr = await get(C, `/api/profiles/professional/${P.proId}`)
  check(F, 'la obra aparece en el perfil público', (pr.data?.works || []).some((x) => x.id === S.work), brief(pr))
  const wP2 = await post(P2, '/api/works', { title: `${MARK} Obra ajena`, description: 'Descripción de la obra ajena', projectId: S.project1 })
  check(F, 'projectId ajeno se ignora', wP2.status === 201 && wP2.data?.work?.projectId === null, brief(wP2))
  st(F, 'editar obra ajena', await patch(P2, `/api/works/${S.work}`, { title: 'Hackeada' }), 403)
  st(F, 'editar obra sin cambios', await patch(P, `/api/works/${S.work}`, {}), 400)
  st(F, 'editar obra', await patch(P, `/api/works/${S.work}`, { title: `${MARK} Living pintado (editado)` }), 200)
  check(F, 'edición persistida', (await db.completedWork.findUnique({ where: { id: S.work } })).title.includes('editado'))
  st(F, 'borrar obra ajena', await del(P2, `/api/works/${S.work}`), 403)
  st(F, 'borrar obra', await del(P, `/api/works/${S.work}`), 200)
  check(F, 'contador de obras vuelve a 0', (await db.professionalProfile.findUnique({ where: { id: P.proId } })).worksCount === 0)
  const pr2 = await get(C, `/api/profiles/professional/${P.proId}`)
  check(F, 'la obra borrada no aparece en el perfil', !(pr2.data?.works || []).some((x) => x.id === S.work), brief(pr2))
  st(F, 'obra borrada ya no se edita', await patch(P, `/api/works/${S.work}`, { title: 'otra vez' }), 404)
}

// ═════════════════════════════ M. CRM Y FAVORITOS ═════════════════════════════
async function flowM() {
  const F = 'M'
  const pl = await get(P, '/api/crm/pipelines')
  st(F, 'pipelines del profesional', pl, 200)
  const stages = pl.data?.pipelines?.[0]?.stages || []
  check(F, 'pipeline con etapas', stages.length >= 3, brief(pl))
  const vpl = await get(V, '/api/crm/pipelines')
  const vStage = vpl.data?.pipelines?.[0]?.stages?.[0]?.id
  check(F, 'pipeline del proveedor', vpl.status === 200 && vpl.data?.pipelines?.[0]?.ownerRole === 'proveedor', brief(vpl))
  st(F, 'pipeline con nombre inválido', await post(P, '/api/crm/pipelines', { name: { a: 1 } }), 400)
  st(F, 'trato sin sesión', await post(ANON, '/api/crm/deals', { stageId: stages[0]?.id, title: 'x' }), 401)
  st(F, 'trato sin título', await post(P, '/api/crm/deals', { stageId: stages[0]?.id }), 400)
  st(F, 'trato en etapa ajena', await post(P, '/api/crm/deals', { stageId: vStage, title: 'x' }), 403)
  st(F, 'trato con contraparte inexistente', await post(P, '/api/crm/deals', { stageId: stages[0]?.id, title: `${MARK} x`, counterpartyId: 'no-existe' }), 400)
  st(F, 'trato con valor no numérico', await post(P, '/api/crm/deals', { stageId: stages[0]?.id, title: `${MARK} x`, value: 'mucho' }), 400)
  const d = await post(P, '/api/crm/deals', { stageId: stages[0]?.id, title: `${MARK} Pintura living`, value: 35000, counterpartyId: C.id, projectId: S.project1 })
  st(F, 'crear trato', d, 201)
  S.deal = d.data?.deal?.id
  check(F, 'trato en el pipeline de la etapa', d.data?.deal?.pipelineId === pl.data.pipelines[0].id, brief(d))
  st(F, 'mover trato a etapa ajena', await patch(P, '/api/crm/deals', { id: S.deal, stageId: vStage }), 403)
  st(F, 'mover trato ajeno', await patch(V, '/api/crm/deals', { id: S.deal, stageId: vStage }), 404)
  st(F, 'mover trato', await patch(P, '/api/crm/deals', { id: S.deal, stageId: stages[1].id, value: 36000 }), 200)
  const dd = await db.crmDeal.findUnique({ where: { id: S.deal } })
  check(F, 'trato movido y editado', dd.stageId === stages[1].id && dd.value === 36000)
  st(F, 'borrar trato ajeno', await del(V, `/api/crm/deals?id=${S.deal}`), 404)
  st(F, 'borrar trato', await del(P, `/api/crm/deals?id=${S.deal}`), 200)
  check(F, 'trato borrado', !(await db.crmDeal.findUnique({ where: { id: S.deal } })))

  st(F, 'favorito sin sesión', await post(ANON, '/api/favorites', { targetUserId: P.id }), 401)
  st(F, 'favorito a sí mismo', await post(C, '/api/favorites', { targetUserId: C.id }), 400)
  st(F, 'favorito a usuario inexistente', await post(C, '/api/favorites', { targetUserId: 'no-existe' }), 404)
  const f1 = await post(C, '/api/favorites', { targetUserId: P.id })
  check(F, 'marcar favorito', f1.status === 201 && f1.data?.favorito === true, brief(f1))
  const fl = await get(C, '/api/favorites')
  check(F, 'lista de favoritos', (fl.data?.ids || []).includes(P.id), brief(fl))
  const f2 = await post(C, '/api/favorites', { targetUserId: P.id })
  check(F, 'desmarcar favorito (toggle)', f2.status === 200 && f2.data?.favorito === false, brief(f2))
  await post(C, '/api/favorites', { targetUserId: V.id }) // queda uno para el recorrido visual (se purga)
}

// ═════════════════════════════ N. SEGURIDAD ═════════════════════════════
async function flowN() {
  const F = 'N'
  const x = 'id-cualquiera'
  const mutating = [
    ['PUT', '/api/profiles/me'], ['POST', '/api/provider/stock'], ['PATCH', '/api/provider/stock'], ['DELETE', `/api/provider/stock?id=${x}`],
    ['POST', '/api/catalog'], ['POST', '/api/jobs'], ['PATCH', `/api/jobs/${x}`], ['POST', `/api/jobs/${x}/bids`], ['PATCH', `/api/bids/${x}`],
    ['POST', '/api/projects'], ['PATCH', `/api/projects/${x}`], ['POST', `/api/projects/${x}/materials`], ['PATCH', `/api/projects/${x}/materials`],
    ['POST', `/api/projects/${x}/invoice`], ['POST', `/api/invoices/${x}`], ['POST', `/api/invoices/${x}/cash`], ['POST', `/api/charges/${x}`],
    ['PATCH', `/api/charges/${x}`], ['POST', '/api/provider/charges'], ['POST', '/api/provider/links'], ['PATCH', '/api/provider/links'],
    ['POST', '/api/provider/plan'], ['POST', '/api/purchases'], ['PATCH', `/api/purchases/${x}`], ['POST', '/api/returns'], ['PATCH', `/api/returns/${x}`],
    ['POST', '/api/reviews'], ['POST', '/api/messages/conversations'], ['POST', `/api/messages/conversations/${x}`], ['PATCH', '/api/notifications'],
    ['POST', '/api/favorites'], ['POST', '/api/crm/deals'], ['PATCH', '/api/crm/deals'], ['DELETE', `/api/crm/deals?id=${x}`], ['POST', '/api/crm/pipelines'],
    ['POST', '/api/works'], ['PATCH', `/api/works/${x}`], ['DELETE', `/api/works/${x}`], ['POST', '/api/uploads'], ['POST', '/api/verification/dni'],
    ['PUT', '/api/users/location'], ['DELETE', '/api/mp/oauth'],
    ['POST', '/api/cart'], ['PATCH', '/api/cart'], ['DELETE', '/api/cart'], ['POST', '/api/cart/merge'], ['POST', '/api/orders'],
  ]
  const leaks = []
  for (const [m, u] of mutating) {
    const r = await http(ANON, m, u, { json: {} })
    if (r.status !== 401) leaks.push(`${m} ${u} → ${r.status}`)
  }
  check(F, `los ${mutating.length} endpoints mutantes sin sesión → 401`, leaks.length === 0, leaks.join(' | '))
  const readPriv = ['/api/projects', `/api/projects/${S.project1}`, `/api/invoices/${S.inv1}`, `/api/invoices/${S.inv1}/pdf`, '/api/purchases', '/api/returns', '/api/messages/conversations', '/api/messages/unread', '/api/crm/pipelines', '/api/favorites', '/api/provider/charges', '/api/provider/links', '/api/provider/plan', '/api/verification/dni', `/api/charges/${S.charge2}`, '/api/profiles/me', '/api/cart', '/api/orders', `/api/orders/${S.orderP || x}`, '/api/projects/hire-sources', '/api/invoices?mine=1']
  const leaks2 = []
  for (const u of readPriv) {
    const r = await get(ANON, u)
    if (r.status !== 401) leaks2.push(`GET ${u} → ${r.status}`)
  }
  check(F, `los ${readPriv.length} GET privados sin sesión → 401`, leaks2.length === 0, leaks2.join(' | '))

  // recursos ajenos con sesión (P2 es un tercero en todo)
  const foreign = [
    ['GET', `/api/projects/${S.project1}`, 403], ['PATCH', `/api/projects/${S.project2}`, 403, { stage: 'ejecucion' }],
    ['GET', `/api/projects/${S.project1}/invoice`, 403], ['GET', `/api/invoices/${S.inv1}`, 403], ['GET', `/api/invoices/${S.inv1}/pdf`, 403],
    ['POST', `/api/invoices/${S.inv2}/cash`, 403, { action: 'acordar' }], ['POST', `/api/invoices/${S.inv2}`, 403, {}],
    ['PATCH', `/api/purchases/${S.purchaseA}`, 403, { action: 'entregar' }], ['PATCH', `/api/returns/${S.ret1}`, 403, { action: 'rechazar' }],
    ['GET', `/api/messages/conversations/${S.convCV}`, 403], ['POST', `/api/messages/conversations/${S.convCV}`, 403, { body: 'hola' }],
    ['GET', `/api/charges/${S.charge2}`, 403], ['PATCH', `/api/charges/${S.charge2}`, 403, {}],
    ['POST', `/api/projects/${S.project2}/materials`, 403, { name: 'x', quantity: 1, unitPrice: 1 }],
    ['POST', `/api/projects/${S.project2}/invoice`, 403, {}],
    ['PATCH', '/api/provider/links', 403, { id: S.link, active: false }],
    ['GET', `/api/returns/eligible?projectId=${S.project2}`, 403],
  ]
  for (const [m, u, exp, json] of foreign) {
    const r = await http(P2, m, u, json ? { json } : {})
    check(F, `recurso ajeno ${m} ${u.replace(/[a-z0-9]{20,}/g, ':id')} → ${exp}`, r.status === exp, brief(r))
  }
  st(F, 'IDOR material de otro proyecto', await patch(C, `/api/projects/${S.project2}/materials`, { materialId: S.m1, action: 'rechazar' }), 404)
  st(F, 'proveedor no ve el detalle de proyectos', await get(V, `/api/projects/${S.project1}`), 403)
  st(F, 'profesional no gestiona stock', await post(P, '/api/provider/stock', { elementId: S.E1.id, price: 1 }), 403)
  st(F, 'profesional no ve ventas de proveedor', await get(P, '/api/purchases?as=proveedor'), 403)
  // status libres
  st(F, 'status libre en proyecto', await patch(C, `/api/projects/${S.project2}`, { status: 'pagado' }), 400)
  st(F, 'status libre en trabajo', await patch(C, `/api/jobs/${S.job}`, { status: 'pagado' }), 400)
  st(F, 'acción libre en oferta', await patch(C, `/api/bids/${S.bidP}`, { action: 'pagado' }), 400)
  st(F, 'acción libre en compra', await patch(C, `/api/purchases/${S.purchaseA}`, { action: 'pagado' }), 400)
  st(F, 'acción libre en devolución', await patch(C, `/api/returns/${S.ret1}`, { action: 'reembolsada' }), 400)
  st(F, 'acción libre en efectivo de factura', await post(C, `/api/invoices/${S.inv2}/cash`, { action: 'pagada' }), 400)
  st(F, 'método libre en cobro', await post(C, `/api/charges/${S.charge2}`, { method: 'bitcoin' }), 400)
  // webhook MP y cron
  // el webhook no confía en el aviso: re-consulta el pago a MP (un aviso falso no marca nada)
  const invBefore = await db.invoice.findUnique({ where: { id: S.inv2 } })
  const wh = await post(ANON, `/api/payments/webhook?ref=${S.inv2}`, { type: 'payment', data: { id: '999999999999' }, live_mode: true })
  const invAfter = await db.invoice.findUnique({ where: { id: S.inv2 } })
  check(F, 'webhook con aviso falso y sin firma no marca nada (ni 500)', wh.status < 500 && invAfter?.status === invBefore?.status, brief(wh))
  st(F, 'cron sin secreto', await get(ANON, '/api/cron/reservations'), 401)
  st(F, 'ubicación con coordenadas inválidas', await put(C, '/api/users/location', { lat: 'x', lng: 1 }), 400)
  st(F, 'ubicación válida', await put(C, '/api/users/location', { lat: CABA.lat, lng: CABA.lng, radiusKm: 15, locationShared: true }), 200)
  // cookie adulterada
  const forged = new Actor('forged', null)
  forged.cookie = 'homy_session=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.firma-falsa'
  const fr = await get(forged, '/api/auth/me')
  check(F, 'JWT falsificado → sin sesión', fr.data?.user === null, brief(fr))
  // cabeceras de seguridad
  const home = await fetch(`${BASE}/api/auth/me`)
  check(F, 'cabeceras de seguridad (nosniff)', home.headers.get('x-content-type-options') === 'nosniff', `${home.headers.get('x-content-type-options')}`)
}

// ═════════════════════════════ O. IA ═════════════════════════════
// Token de visitante de esta corrida (el agente guarda su conversación con el hash del token)
const HOMY_VISITOR_TOKEN = `e2eq${TS}visitante`.slice(0, 40)

/** Llama al súper agente y devuelve los eventos del stream NDJSON. */
async function homyAgent(actor, body, headers = {}) {
  // NDJSON (content-type x-ndjson): se lee crudo, no como JSON único
  const r = await http(actor, 'POST', '/api/homy/agent', { json: body, headers, raw: true })
  const text = r.buf ? r.buf.toString('utf8') : ''
  const events = []
  for (const ln of text.split('\n')) {
    const t = ln.trim()
    if (!t) continue
    try { events.push(JSON.parse(t)) } catch { /* línea no JSON */ }
  }
  return { ...r, events, end: events.find((e) => e.t === 'final' || e.t === 'limite') || null }
}

async function flowO() {
  const F = 'O'
  // contrato: POST /api/homy/agent es público (visitante 8/día por IP, logueado 60/día) y responde NDJSON
  st(F, 'superagente con body inválido → 400 (sin gastar IA)', await post(C, '/api/homy/agent', { mensaje: '', puerta: 'panel' }), 400)
  st(F, 'superagente con puerta inválida → 400', await post(ANON, '/api/homy/agent', { mensaje: 'hola homy', puerta: 'cualquiera' }), 400)
  // 1) visitante sin cuenta (IP ficticia de la corrida: no consume el cupo de nadie real)
  const v = await homyAgent(ANON, { mensaje: 'Necesito un plomero en Palermo', puerta: 'home_buscador' }, { 'x-homy-visitante': HOMY_VISITOR_TOKEN })
  check(F, 'visitante: stream con "inicio" y cierre "final" o "limite"', v.status === 200 && v.events.some((e) => e.t === 'inicio') && !!v.end, `HTTP ${v.status} eventos=${v.events.map((e) => e.t).join(',')}`)
  check(F, 'visitante: la respuesta final trae texto', v.end?.t === 'limite' || (typeof v.end?.mensaje === 'string' && v.end.mensaje.length > 0), JSON.stringify(v.end)?.slice(0, 200))
  if (v.end?.sessionId) manifest.homyVisitorSessions = [v.end.sessionId]
  // 2) logueado
  const c = await homyAgent(C, { mensaje: 'Busco un pintor para el living', puerta: 'panel', rolPanel: 'cliente', lat: CABA.lat, lng: CABA.lng })
  check(F, 'logueado: stream con cierre "final" o "limite"', c.status === 200 && !!c.end, `HTTP ${c.status} eventos=${c.events.map((e) => e.t).join(',')}`)
  const sid = c.end?.sessionId
  check(F, 'logueado: la sesión queda a su nombre', !!sid && !!(await db.homySession.findFirst({ where: { id: sid, userId: C.id } })), `sessionId=${sid}`)
  // la conversación de otro no se entrega (ni a otro usuario ni a un visitante)
  const own = await get(C, `/api/homy/agent?sessionId=${sid}`)
  check(F, 'el dueño ve su conversación', own.status === 200 && own.data?.sessionId === sid && (own.data?.turnos || []).length >= 1, brief(own))
  const other = await get(P, `/api/homy/agent?sessionId=${sid}`)
  check(F, 'otro usuario NO ve la conversación ajena', other.status === 200 && other.data?.sessionId === null && (other.data?.turnos || []).length === 0, brief(other))
  const anonO = await get(ANON, `/api/homy/agent?sessionId=${sid}`, { headers: { 'x-homy-visitante': HOMY_VISITOR_TOKEN } })
  check(F, 'un visitante NO ve la conversación de un usuario', anonO.status === 200 && anonO.data?.sessionId === null, brief(anonO))
}

// ═════════════════════════════ P. CARRITO Y PEDIDOS MULTIPROVEEDOR ═════════════════════════════
// 2 proveedores descartables (A y B), el cliente de la suite y un visitante que crea su
// cuenta. D15: carrito mixto → A: COMPRA (caños + látex, con stock: nace por pagar con el
// stock reservado) + RESERVA (un caño 63 sin stock: A la aprueba con fecha y después la
// marca disponible); B: RESERVA (la rechaza) → el cliente paga la compra de A en efectivo
// → A confirma y entrega.
// El 1% se verifica con una preferencia REAL de MP creada con el token de PRUEBA.
const VA = new Actor('provA', 'proveedor')
const VB = new Actor('provB', 'proveedor')
const CV = new Actor('visitante', 'cliente')
const P_IP = `10.252.${(TS >> 8) & 255}.${TS & 255}`
for (const a of [VA, VB, CV]) a.ip = P_IP

async function mpPreference(prefId, token) {
  const r = await fetch(`https://api.mercadopago.com/checkout/preferences/${encodeURIComponent(prefId)}`, { headers: { Authorization: `Bearer ${token}` } })
  return { status: r.status, data: await r.json().catch(() => null) }
}

async function flowP() {
  const F = 'P'
  const base = { password: PASSWORD, lat: CABA.lat, lng: CABA.lng, city: 'CABA', howFoundUs: 'otro', acceptTerms: true }
  for (const [a, name] of [[VA, 'Ferretería A'], [VB, 'Corralón B']]) {
    const r = await registrar(a, { ...base, email: a.email, displayName: `${MARK} Prov ${name}`, roles: ['proveedor'], businessName: `${MARK} ${name}`, address: 'Av. Siempreviva 742' })
    st(F, `registro proveedor ${name}`, r, 201)
    a.id = r.data?.user?.id
    a.provId = a.id ? (await db.providerProfile.findUnique({ where: { userId: a.id } }))?.id : undefined
  }
  if (!VA.provId || !VB.provId) throw new Error('No se pudieron crear los proveedores del carrito')
  const mk = async (a, el, price, quantity) => {
    const r = await post(a, '/api/provider/stock', { elementId: el.id, price, quantity, minStock: 1 })
    st(F, `stock ${el.name} en ${a.key}`, r, 201)
    return r.data?.stock?.id
  }
  const sA1 = await mk(VA, S.E1, 1000, 50) // caño (barra)
  const sA3 = await mk(VA, S.E3, 2000, 20) // látex (bidón)
  const sB2 = await mk(VB, S.E2, 25000, 10) // membrana (tambor)
  const sA4 = await mk(VA, S.E4, 700, 0) // caño 63 SIN stock (solo reserva)
  const q = async (id) => (await db.providerStock.findUnique({ where: { id } })).quantity

  // ── visitante: carrito local (se muestra con /api/cart/preview) ──
  const pv = await post(ANON, '/api/cart/preview', { items: [{ stockId: sA1, quantity: 2 }, { stockId: sB2, quantity: 1 }, { stockId: 'no-existe', quantity: 1 }] })
  st(F, 'preview del carrito del visitante', pv, 200)
  const pvc = pv.data?.cart
  check(F, 'preview: 2 proveedores + 1 oferta inexistente marcada', pvc?.groups?.length === 2 && pvc?.orphans?.length === 1 && pvc?.blocked === true, brief(pv))
  check(F, 'preview: 1% por proveedor (20 + 250) y total con MP', pvc?.subtotal === 27000 && pvc?.serviceFee === 270 && pvc?.totalMp === 27270, brief(pv))
  st(F, 'carrito sin sesión (GET)', await get(ANON, '/api/cart'), 401)
  st(F, 'confirmar pedido sin sesión', await post(ANON, '/api/orders', {}), 401)
  st(F, 'preview con cantidad inválida', await post(ANON, '/api/cart/preview', { items: [{ stockId: sA1, quantity: -1 }] }), 400)

  // el visitante crea su cuenta y su carrito local se fusiona con el de la cuenta
  const rv = await registrar(CV, { ...base, email: CV.email, displayName: `${MARK} Visitante`, roles: ['cliente'] })
  st(F, 'el visitante crea su cuenta', rv, 201)
  CV.id = rv.data?.user?.id
  const mg = await post(CV, '/api/cart/merge', { items: [{ stockId: sA1, quantity: 2 }, { stockId: sB2, quantity: 1 }, { stockId: 'no-existe', quantity: 1 }] })
  check(F, 'fusión del carrito local al ingresar (2 líneas, descarta la inexistente)', mg.status === 200 && mg.data?.merged === 2 && mg.data?.skipped?.length === 1 && mg.data?.cart?.count === 2, brief(mg))
  const mg2 = await post(CV, '/api/cart/merge', { items: [{ stockId: sA1, quantity: 100 }] })
  check(F, 'fusión con tope en el stock disponible (50)', mg2.data?.cart?.groups?.flatMap((g) => g.items).find((l) => l.stockId === sA1)?.quantity === 50, brief(mg2))
  const vac = await del(CV, '/api/cart')
  check(F, 'vaciar carrito', vac.status === 200 && vac.data?.cart?.count === 0 && (await db.cartItem.count({ where: { userId: CV.id } })) === 0, brief(vac))

  // ── cliente: agregar / editar / eliminar ──
  st(F, 'proveedor puro no tiene carrito', await get(VA, '/api/cart'), 403)
  st(F, 'agregar oferta inexistente', await post(C, '/api/cart', { stockId: 'no-existe', quantity: 1 }), 404)
  st(F, 'agregar media barra (se vende entera)', await post(C, '/api/cart', { stockId: sA1, quantity: 0.5 }), 400)
  const mas = await post(C, '/api/cart', { stockId: sA1, quantity: 51 })
  check(F, 'agregar más que el stock se permite (esa línea solo se podrá reservar)', mas.status === 201 && mas.data?.cart?.groups?.[0]?.items?.[0]?.inStock === false && /reservalo/.test(mas.data?.cart?.groups?.[0]?.items?.[0]?.stockNote || ''), brief(mas))
  await del(C, `/api/cart?stockId=${sA1}`)
  st(F, 'agregar 3 caños', await post(C, '/api/cart', { stockId: sA1, quantity: 3 }), 201)
  const add2 = await post(C, '/api/cart', { stockId: sA1, quantity: 2 })
  check(F, 'agregar de nuevo suma (5)', add2.status === 201 && (await db.cartItem.findUnique({ where: { userId_stockId: { userId: C.id, stockId: sA1 } } }))?.quantity === 5, brief(add2))
  st(F, 'editar cantidad a 4', await patch(C, '/api/cart', { stockId: sA1, quantity: 4 }), 200)
  st(F, 'editar cantidad a 0', await patch(C, '/api/cart', { stockId: sA1, quantity: 0 }), 400)
  st(F, 'agregar 2 bidones de látex', await post(C, '/api/cart', { stockId: sA3, quantity: 2 }), 201)
  st(F, 'agregar 1 tambor de membrana (otro proveedor)', await post(C, '/api/cart', { stockId: sB2, quantity: 1 }), 201)
  st(F, 'eliminar el látex', await del(C, `/api/cart?stockId=${sA3}`), 200)
  st(F, 'eliminar algo que no está', await del(C, `/api/cart?stockId=${sA3}`), 404)
  await post(C, '/api/cart', { stockId: sA3, quantity: 2 })
  const cart = await get(C, '/api/cart')
  const cv = cart.data?.cart
  const gA = cv?.groups?.find((g) => g.provider.id === VA.provId)
  const gB = cv?.groups?.find((g) => g.provider.id === VB.provId)
  check(F, 'carrito agrupado por proveedor (A: 2 ítems, B: 1)', cart.status === 200 && cv?.count === 3 && gA?.items?.length === 2 && gB?.items?.length === 1, brief(cart))
  check(F, 'subtotales por proveedor (8000 y 25000) y total 33000', gA?.subtotal === 8000 && gB?.subtotal === 25000 && cv?.subtotal === 33000, brief(cart))
  check(F, 'cargo de servicio 1% (80 + 250 = 330) y total con MP 33330', gA?.serviceFee === 80 && gB?.serviceFee === 250 && cv?.serviceFee === 330 && cv?.totalMp === 33330, brief(cart))
  check(F, 'el carrito informa que el proveedor no cobra por MP', gA?.provider?.mpConnected === false, brief(cart))

  // sin stock NO bloquea: la línea queda "solo reserva"; pedirla como COMPRA → 409 que dice cuál
  await db.providerStock.update({ where: { id: sB2 }, data: { quantity: 0, status: 'agotado' } })
  const blk = await get(C, '/api/cart')
  const lB = blk.data?.cart?.groups?.find((g) => g.provider.id === VB.provId)?.items?.[0]
  check(F, 'ítem sin stock: no bloquea el carrito, queda "Sin stock: podés reservarlo"', blk.data?.cart?.blocked === false && lB?.problem === null && lB?.inStock === false && /reservarlo/.test(lB?.stockNote || ''), brief(blk))
  const nOrd = await db.order.count({ where: { clientId: C.id } })
  const ob = await post(C, '/api/orders', { lineTypes: { [sB2]: 'compra' } })
  check(F, 'COMPRAR un ítem sin stock → 409 que dice cuál, y no se crea nada', ob.status === 409 && /Membrana/i.test(ob.data?.error || '') && (ob.data?.problems || []).length === 1 && (await db.order.count({ where: { clientId: C.id } })) === nOrd, brief(ob))
  await db.providerStock.update({ where: { id: sB2 }, data: { quantity: 10, status: 'disponible' } })
  st(F, 'agregar un producto SIN stock (para reservar)', await post(C, '/api/cart', { stockId: sA4, quantity: 1 }), 201)

  // reserva atómica al confirmar: si un ítem de la COMPRA no alcanza (cambió entre medio), no se crea nada
  await db.providerStock.update({ where: { id: sA3 }, data: { quantity: 1 } })
  const a1Before = await q(sA1)
  const obShort = await post(C, '/api/orders', { types: { [VB.provId]: 'reserva' }, lineTypes: { [sA3]: 'compra' } })
  check(F, 'compra con stock insuficiente al confirmar → 409 que dice cuál', obShort.status === 409 && /Látex/i.test(obShort.data?.error || ''), brief(obShort))
  check(F, '…y no se creó nada ni se tocó el stock (rollback)', (await db.order.count({ where: { clientId: C.id } })) === nOrd && (await q(sA1)) === a1Before && (await q(sA3)) === 1 && (await db.cartItem.count({ where: { userId: C.id } })) === 4)
  await db.providerStock.update({ where: { id: sA3 }, data: { quantity: 20 } })

  // ── confirmar: 1 pedido, A compra + A reserva (mismo proveedor) + B reserva ──
  const before = { a1: await q(sA1), a3: await q(sA3), b2: await q(sB2) }
  const od = await post(C, '/api/orders', { types: { [VB.provId]: 'reserva' }, note: `${MARK} paso el sábado` })
  st(F, 'confirmar el carrito', od, 201)
  S.orderP = od.data?.order?.id
  check(F, 'número de pedido PED-AAAA-NNNNNN', /^PED-\d{4}-\d{6}$/.test(od.data?.order?.number || ''), brief(od))
  const subs = await db.purchase.findMany({ where: { orderId: S.orderP || 'x' }, include: { items: true } })
  const pA = subs.find((p) => p.providerId === VA.provId && p.type === 'compra')
  const pAr = subs.find((p) => p.providerId === VA.provId && p.type === 'reserva')
  const pB = subs.find((p) => p.providerId === VB.provId)
  S.purPA = pA?.id
  S.purPAr = pAr?.id
  S.purPB = pB?.id
  check(F, '1 pedido con 3 sub-pedidos: A compra (2 ítems) + A reserva (1, sin stock) + B reserva (1)', subs.length === 3 && pA?.items?.length === 2 && pAr?.items?.length === 1 && pB?.items?.length === 1, JSON.stringify(subs.map((s) => ({ p: s.providerId, t: s.type, n: s.items.length }))))
  check(F, 'total de cada sub-pedido = suma de sus ítems (8000, 700 y 25000)', pA?.total === 8000 && pAr?.total === 700 && pB?.total === 25000 && pA.items.reduce((a, i) => a + i.total, 0) === 8000, JSON.stringify(subs.map((s) => s.total)))
  check(F, 'la compra nace por pagar con cobro; las reservas esperan aprobación', pA?.status === 'aprobado' && !!pA?.chargeId && pAr?.status === 'pendiente_aprobacion' && !pAr?.chargeId && pB?.status === 'pendiente_aprobacion' && !!pA?.note?.includes('sábado'), JSON.stringify(subs.map((s) => [s.type, s.status, s.chargeId])))
  S.chargePA = pA?.chargeId
  check(F, 'el carrito quedó vacío', (await db.cartItem.count({ where: { userId: C.id } })) === 0)
  check(F, 'la COMPRA reservó su stock al confirmar (−4 caños, −2 látex); las reservas no tocan nada', (await q(sA1)) === before.a1 - 4 && (await q(sA3)) === before.a3 - 2 && (await q(sB2)) === before.b2 && (await q(sA4)) === 0)
  check(F, 'un movimiento de reserva por ítem de la compra', (await db.stockMovement.count({ where: { stockId: { in: [sA1, sA3] }, type: 'reserva', note: { contains: S.purPA } } })) === 2)
  check(F, 'cobro emitido por el total de la compra (8000)', (await db.providerCharge.findUnique({ where: { id: S.chargePA || 'x' } }))?.amount === 8000)
  check(F, 'cada proveedor notificado de su parte (A: compra + reserva, B: reserva)', (await db.notification.count({ where: { userId: VA.id, type: 'nueva_compra' } })) === 2 && !!(await db.notification.findFirst({ where: { userId: VB.id, type: 'nueva_compra', title: 'Nueva reserva de un cliente' } })))
  const convA = await db.conversation.findFirst({ where: { OR: [{ userAId: C.id, userBId: VA.id }, { userAId: VA.id, userBId: C.id }] }, include: { messages: { orderBy: { createdAt: 'asc' } } } })
  check(F, 'el pedido abre el chat con cada proveedor (lo inicia el cliente)', !!convA && convA.messages[0]?.senderId === C.id && convA.messages[0]?.body.includes(od.data?.order?.number || '¿?'), JSON.stringify(convA?.messages?.[0]))
  st(F, 'confirmar con el carrito vacío', await post(C, '/api/orders', {}), 400)

  // ── IDOR ──
  st(F, 'detalle del pedido (cliente dueño)', await get(C, `/api/orders/${S.orderP}`), 200)
  st(F, 'otro cliente no ve el pedido', await get(CV, `/api/orders/${S.orderP}`), 403)
  st(F, 'un proveedor no ve el pedido completo', await get(VA, `/api/orders/${S.orderP}`), 403)
  st(F, 'pedido sin sesión', await get(ANON, `/api/orders/${S.orderP}`), 401)
  st(F, 'pedido inexistente', await get(C, '/api/orders/no-existe'), 404)
  const vbSales = await get(VB, '/api/purchases?as=proveedor')
  check(F, 'proveedor B ve su sub-pedido y NO el de A', vbSales.status === 200 && !(vbSales.data?.purchases || []).some((p) => p.id === S.purPA) && (vbSales.data?.purchases || []).some((p) => p.id === S.purPB), brief(vbSales))
  st(F, 'proveedor B no puede aprobar el sub-pedido de A', await patch(VB, `/api/purchases/${S.purPA}`, { action: 'aprobar' }), 403)
  st(F, 'otro cliente no paga el sub-pedido', await patch(CV, `/api/purchases/${S.purPA}`, { action: 'pagar_efectivo' }), 403)

  // ── A: la compra no se aprueba; la reserva sin stock sí (con fecha) → disponible ──
  st(F, 'A no puede "aprobar" su compra', await patch(VA, `/api/purchases/${S.purPA}`, { action: 'aprobar' }), 409)
  const fechaA = new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10)
  const apAr0 = await patch(VA, `/api/purchases/${S.purPAr}`, { action: 'aprobar' })
  check(F, 'A aprueba la reserva sin stock sin fecha → 409 needsDate', apAr0.status === 409 && apAr0.data?.needsDate === true, brief(apAr0))
  const apAr = await patch(VA, `/api/purchases/${S.purPAr}`, { action: 'aprobar', availableFrom: fechaA })
  check(F, 'A aprueba la reserva con fecha → esperando_stock', apAr.status === 200 && apAr.data?.status === 'esperando_stock', brief(apAr))
  check(F, 'cliente notificado de la fecha con link a su pedido', !!(await db.notification.findFirst({ where: { userId: C.id, type: 'reserva_aprobada_sin_stock', link: `#/panel/cliente/pedidos/${S.orderP}` } })))
  await patch(VA, '/api/provider/stock', { id: sA4, quantity: 3 })
  st(F, 'A la marca disponible cuando le llega', await patch(VA, `/api/purchases/${S.purPAr}`, { action: 'disponible' }), 200)
  check(F, '…se reserva el stock (3 → 2)', (await q(sA4)) === 2)

  // ── B rechaza el pedido entero con motivo ──
  st(F, 'proveedor B rechaza su reserva con motivo', await patch(VB, `/api/purchases/${S.purPB}`, { action: 'rechazar', reason: `${MARK} sin retiro este mes` }), 200)
  check(F, 'el rechazo no toca el stock de B', (await q(sB2)) === before.b2)
  check(F, 'cliente notificado del rechazo con link a su pedido', !!(await db.notification.findFirst({ where: { userId: C.id, type: 'compra_rechazada', link: `#/panel/cliente/pedidos/${S.orderP}` } })))

  // ── el cliente paga A: sin MP del proveedor → 503 honesto; en efectivo ──
  const mpA = await patch(C, `/api/purchases/${S.purPA}`, { action: 'pagar_mp' })
  check(F, 'pagar_mp sin MP del proveedor → 503 needsConfig con mensaje honesto', mpA.status === 503 && mpA.data?.needsConfig === true && /todavía no conectó Mercado Pago/.test(mpA.data?.error || '') && /efectivo/.test(mpA.data?.error || ''), brief(mpA))
  const cashA = await patch(C, `/api/purchases/${S.purPA}`, { action: 'pagar_efectivo' })
  check(F, 'cliente elige efectivo (sin cargo de servicio)', cashA.status === 200 && cashA.data?.chargeStatus === 'acordada_efectivo' && (await db.purchase.findUnique({ where: { id: S.purPA } })).serviceFee === 0, brief(cashA))
  check(F, 'proveedor A notificado del efectivo', !!(await db.notification.findFirst({ where: { userId: VA.id, type: 'cobro_efectivo_acordado' } })))
  st(F, 'proveedor A confirma el efectivo', await patch(VA, `/api/charges/${S.chargePA}`, {}), 200)
  check(F, 'sub-pedido A pagado', (await db.purchase.findUnique({ where: { id: S.purPA } })).status === 'pagado')
  const enA = await patch(VA, `/api/purchases/${S.purPA}`, { action: 'entregar' })
  check(F, 'A entrega (queda pagado) con un consumo por ítem', enA.status === 200 && enA.data?.status === 'pagado' && (await db.stockMovement.count({ where: { stockId: { in: [sA1, sA3] }, type: 'consumo', note: { contains: S.purPA } } })) === 2, brief(enA))

  // ── seguimiento y línea de tiempo ──
  st(F, 'el cliente cancela la reserva de A ya disponible', await patch(C, `/api/purchases/${S.purPAr}`, { action: 'cancelar' }), 200)
  check(F, '…y el stock de A vuelve (2 → 3)', (await q(sA4)) === 3)
  const det = await get(C, `/api/orders/${S.orderP}`)
  const sum = det.data?.order?.summary
  check(F, 'resumen: 1 de 1 proveedor activo pagado, nada pendiente', sum?.activeProviders === 1 && sum?.paidProviders === 1 && sum?.pendingAmount === 0 && sum?.status === 'completo', JSON.stringify(sum))
  check(F, 'detalle con estados distintos por parte', (det.data?.order?.purchases || []).map((p) => p.status).sort().join(',') === 'cancelado,pagado,rechazado', brief(det))
  check(F, 'el detalle informa la fecha aproximada de la reserva sin stock', !!(det.data?.order?.purchases || []).find((p) => p.id === S.purPAr)?.availableFrom, brief(det))
  const evs = det.data?.events || []
  const types = evs.map((e) => e.type)
  const need = ['pedido_creado', 'compra_confirmada', 'subpedido_creado', 'aprobado_sin_stock', 'disponible', 'rechazado', 'pago_efectivo_acordado', 'pagado', 'entregado', 'cancelado']
  check(F, 'línea de tiempo con cada acción (quién, qué, cuándo)', need.every((t) => types.includes(t)) && evs.every((e) => e.message && e.createdAt && e.actorRole), `tipos=${types.join(',')}`)
  const vaSales = await get(VA, '/api/purchases?as=proveedor')
  const saleA = (vaSales.data?.purchases || []).find((p) => p.id === S.purPA)
  check(F, 'proveedor A ve sus ítems y SOLO su línea de tiempo', saleA?.lines?.length === 2 && saleA?.orderNumber === od.data?.order?.number && saleA.events.length > 0 && saleA.events.every((e) => e.type !== 'rechazado' && e.type !== 'pedido_creado'), brief(vaSales))
  const lo = await get(C, '/api/orders')
  check(F, 'mis pedidos lista el pedido con su resumen', (lo.data?.orders || []).some((o) => o.id === S.orderP && o.summary?.paidProviders === 1), brief(lo))

  // ── sobrantes por ítem de una compra multi-ítem ──
  const el = await get(C, `/api/returns/eligible?purchaseId=${S.purPA}`)
  const itemsEl = el.data?.items || []
  check(F, 'sobrantes: un elegible por ítem (con purchaseItemId)', itemsEl.length === 2 && itemsEl.every((i) => !!i.purchaseItemId), brief(el))
  const photo = (await upload(C, 'sobrantes', 61)).data?.url
  const lat = itemsEl.find((i) => i.elementId === S.E3.id)
  const retItem = { purchaseId: S.purPA, purchaseItemId: lat?.purchaseItemId, elementId: S.E3.id, condition: 'sin_abrir', photoUrl: photo }
  const rr = await post(C, '/api/returns', { purchaseId: S.purPA, items: [{ ...retItem, qty: 1 }] })
  check(F, 'devolución de un ítem de la compra multi-ítem', rr.status === 201 && rr.data?.return?.items?.[0]?.unitPricePaid === 2000, brief(rr))
  st(F, 'devolver más de lo comprado de ese ítem', await post(C, '/api/returns', { purchaseId: S.purPA, items: [{ ...retItem, qty: 2 }] }), 409)
  if (rr.data?.return?.id) st(F, 'el cliente cancela la devolución', await patch(C, `/api/returns/${rr.data.return.id}`, { action: 'cancelar' }), 200)

  // ── vencimiento por cron: libera TODOS los ítems ──
  await post(C, '/api/cart', { stockId: sA1, quantity: 1 })
  await post(C, '/api/cart', { stockId: sA3, quantity: 1 })
  const pre2 = { a1: await q(sA1), a3: await q(sA3) }
  const od2 = await post(C, '/api/orders', {})
  const p2 = await db.purchase.findFirst({ where: { orderId: od2.data?.order?.id || 'x' } })
  check(F, 'compra de 2 ítems sin tipo explícito: con stock → compra por pagar, stock reservado', p2?.type === 'compra' && p2?.status === 'aprobado' && (await q(sA1)) === pre2.a1 - 1 && (await q(sA3)) === pre2.a3 - 1, JSON.stringify(p2))
  const mid = { a1: await q(sA1), a3: await q(sA3) }
  await db.purchase.update({ where: { id: p2.id }, data: { reservationExpiresAt: new Date(Date.now() - 60_000) } })
  const ajenas = await db.purchase.count({ where: { status: 'aprobado', reservationExpiresAt: { lt: new Date() }, id: { not: p2.id } } })
  if (!process.env.CRON_SECRET || ajenas > 0) {
    check(F, 'cron no corrido (hay reservas vencidas ajenas o falta CRON_SECRET): se cancela a mano', true)
    await patch(C, `/api/purchases/${p2.id}`, { action: 'cancelar' })
  } else {
    const cr = await get(ANON, '/api/cron/reservations', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
    check(F, 'cron vence el sub-pedido multi-ítem', cr.status === 200 && cr.data?.cancelled >= 1, brief(cr))
    check(F, 'cron devuelve TODOS los ítems al stock', (await q(sA1)) === mid.a1 + 1 && (await q(sA3)) === mid.a3 + 1)
    check(F, 'cron deja el evento en la línea de tiempo', !!(await db.activityEvent.findFirst({ where: { purchaseId: p2.id, type: 'vencido' } })))
  }

  // ── cargo de servicio 1% con una preferencia REAL de MP (token de PRUEBA) ──
  const testToken = process.env.MP_TEST_ACCESS_TOKEN
  if (!testToken) {
    check(F, 'MP_TEST_ACCESS_TOKEN configurado para probar el 1%', false, 'falta MP_TEST_ACCESS_TOKEN en .env')
    return
  }
  await db.providerProfile.update({ where: { id: VA.provId }, data: { mpOauthAccessToken: testToken, mpOauthStatus: 'connected', mpOauthExpiresAt: new Date(Date.now() + 180 * 86400000) } })
  st(F, 'precio con centavos (1234,55)', await patch(VA, '/api/provider/stock', { id: sA3, price: 1234.55 }), 200)
  await post(C, '/api/cart', { stockId: sA1, quantity: 3 })
  await post(C, '/api/cart', { stockId: sA3, quantity: 1 })
  const cm = await get(C, '/api/cart')
  check(F, 'carrito: 1% redondeado a 2 decimales (4234,55 → 42,35)', cm.data?.cart?.subtotal === 4234.55 && cm.data?.cart?.serviceFee === 42.35 && cm.data?.cart?.totalMp === 4276.9, brief(cm))
  check(F, 'el carrito informa que A ahora cobra por MP', cm.data?.cart?.groups?.[0]?.provider?.mpConnected === true, brief(cm))
  const od3 = await post(C, '/api/orders', {})
  const p3 = await db.purchase.findFirst({ where: { orderId: od3.data?.order?.id || 'x' } })
  check(F, 'la compra a pagar por MP nace por pagar (sin aprobación)', p3?.status === 'aprobado' && !!p3?.chargeId, JSON.stringify(p3))
  const pay = await patch(C, `/api/purchases/${p3?.id}`, { action: 'pagar_mp' })
  check(F, 'pagar_mp con MP del proveedor → preferencia creada con el total + 1%', pay.status === 200 && /^https:\/\//.test(pay.data?.initPoint || '') && pay.data?.serviceFee === 42.35 && pay.data?.totalMp === 4276.9, brief(pay))
  const p3db = await db.purchase.findUnique({ where: { id: p3?.id || 'x' } })
  const ch3 = p3db?.chargeId ? await db.providerCharge.findUnique({ where: { id: p3db.chargeId } }) : null
  check(F, 'cargo fijado en el sub-pedido y en su cobro', p3db?.serviceFee === 42.35 && ch3?.serviceFee === 42.35 && p3db?.paymentMethod === 'mercadopago', JSON.stringify({ s: p3db?.serviceFee, c: ch3?.serviceFee }))
  check(F, 'evento "pago por MP iniciado" en la línea de tiempo', !!(await db.activityEvent.findFirst({ where: { purchaseId: p3?.id || 'x', type: 'pago_mp_iniciado' } })))
  if (pay.data?.preferenceId) {
    const pref = await mpPreference(pay.data.preferenceId, testToken)
    const items = pref.data?.items || []
    const feeItem = items.find((i) => i.title === 'Cargo de servicio HomIA (1%)')
    const sumItems = Math.round(items.reduce((a, i) => a + i.unit_price * i.quantity, 0) * 100) / 100
    check(F, 'la preferencia existe en MP (consultada con el token del vendedor)', pref.status === 200, `HTTP ${pref.status}`)
    check(F, 'preferencia: los 2 ítems reales + el ítem "Cargo de servicio HomIA (1%)"', items.length === 3 && feeItem?.unit_price === 42.35 && items.some((i) => i.quantity === 3 && i.unit_price === 1000) && items.some((i) => i.quantity === 1 && i.unit_price === 1234.55), JSON.stringify(items.map((i) => [i.title, i.quantity, i.unit_price])))
    check(F, 'preferencia: marketplace_fee = 1% (42,35) y total 4276,90', pref.data?.marketplace_fee === 42.35 && sumItems === 4276.9, `fee=${pref.data?.marketplace_fee} total=${sumItems}`)
    check(F, 'preferencia: referencia y pista ?ref= para el webhook', pref.data?.external_reference === `purchase:${p3.id}` && (pref.data?.notification_url || '').includes(`ref=${encodeURIComponent(`purchase:${p3.id}`)}`), `${pref.data?.external_reference} ${pref.data?.notification_url}`)
  }
  // webhook: con la pista consulta el pago con el token del VENDEDOR; un id inexistente → MP 404 → "deferred"
  const wh = await post(ANON, `/api/payments/webhook?ref=${encodeURIComponent(`purchase:${p3?.id}`)}&type=payment&data.id=999999999999`, { type: 'payment', data: { id: '999999999999' }, live_mode: false })
  check(F, 'webhook con pista y pago inexistente → 200 deferred (MP reintenta)', wh.status === 200 && wh.data?.deferred === true, brief(wh))
  check(F, 'el sub-pedido sigue sin pagar', (await db.purchase.findUnique({ where: { id: p3?.id || 'x' } }))?.status === 'aprobado')
  st(F, 'el cliente cancela el pedido de prueba de MP', await patch(C, `/api/purchases/${p3?.id}`, { action: 'cancelar' }), 200)
  await db.providerProfile.update({ where: { id: VA.provId }, data: { mpOauthAccessToken: null, mpOauthStatus: 'disconnected', mpOauthExpiresAt: null } })
}

// ═════════════════════════ Q. CALENDARIO, FECHAS Y HORARIOS (D21 + D23) ═════════════════════════
async function flowQ() {
  const F = 'Q'
  const hoyAR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date())
  const dia = (n) => { const d = new Date(`${hoyAR}T12:00:00.000Z`); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10) }
  const sched = (id) => `/api/projects/${id}/schedule`
  const wz = (t) => ({ professionalProfileId: P.proId, title: `${MARK} Cal ${t}`, description: `${MARK} Pintar ${t}`, address: 'Calle Privada 742', urgency: 'normal', firstMessage: `${MARK} hola, te contrato para ${t}` })
  // ¿el día `k` de la disponibilidad pública tiene una franja con ese estado? (D23: por día, no por rangos)
  const diaCon = (d, k, e) => (d.data?.dias || []).some((x) => x.dia === k && x.franjas.some((f) => f.estado === e))

  // proyecto A (asistente Contratar): sin cotizar → no se agenda
  const pa = await post(C, '/api/projects', wz('living'))
  st(F, 'contratar proyecto A', pa, 201)
  const A = pa.data?.project?.id
  S.calA = A
  st(F, 'proponer sin sesión', await post(ANON, sched(A), { accion: 'proponer', startDate: dia(3), endDate: dia(5) }), 401)
  st(F, 'proponer sin cotizar (presupuesto sin aprobar)', await post(P, sched(A), { accion: 'proponer', startDate: dia(3), endDate: dia(5) }), 409)
  st(F, 'cotizar mano de obra', await patch(P, `/api/projects/${A}`, { laborCost: 50000 }), 200)
  st(F, 'proponer cotizado pero todavía en presupuesto', await post(P, sched(A), { accion: 'proponer', startDate: dia(3), endDate: dia(5) }), 409)
  st(F, 'avanzar a materiales', await patch(P, `/api/projects/${A}`, { stage: 'materiales' }), 200)
  const dA0 = await get(C, `/api/projects/${A}`)
  check(F, 'detalle: se puede agendar y sin fechas', dA0.data?.project?.scheduleBlocked === null && dA0.data?.project?.schedule?.status === null, brief(dA0))

  // validaciones y permisos
  st(F, 'tercero (otro profesional) no toca las fechas', await post(P2, sched(A), { accion: 'proponer', startDate: dia(3), endDate: dia(5) }), 403)
  st(F, 'proyecto inexistente', await post(P, sched('no-existe'), { accion: 'aceptar' }), 404)
  st(F, 'fin anterior al inicio', await post(P, sched(A), { accion: 'proponer', startDate: dia(6), endDate: dia(4) }), 400)
  st(F, 'inicio en el pasado', await post(P, sched(A), { accion: 'proponer', startDate: dia(-2), endDate: dia(4) }), 400)
  st(F, 'fecha con formato inválido', await post(P, sched(A), { accion: 'proponer', startDate: '15/10/2026', endDate: dia(4) }), 400)
  st(F, 'fecha que no existe (30/02)', await post(P, sched(A), { accion: 'proponer', startDate: '2027-02-30', endDate: '2027-03-02' }), 400)
  st(F, 'acción inválida', await post(P, sched(A), { accion: 'borrar' }), 400)
  st(F, 'el cliente no propone primero', await post(C, sched(A), { accion: 'proponer', startDate: dia(3), endDate: dia(5) }), 409)
  st(F, 'aceptar sin propuesta', await post(C, sched(A), { accion: 'aceptar' }), 409)

  // profesional propone → cliente contrapropone → profesional acepta
  const p1 = await post(P, sched(A), { accion: 'proponer', startDate: dia(3), endDate: dia(7), nota: `${MARK} arranco a las 8` })
  st(F, 'profesional propone', p1, 200)
  check(F, 'queda propuesta por el profesional', p1.data?.schedule?.status === 'propuesta' && p1.data?.schedule?.proposedBy === 'profesional' && p1.data?.schedule?.startDate === dia(3), brief(p1))
  check(F, 'cliente notificado de la propuesta', !!(await db.notification.findFirst({ where: { userId: C.id, type: 'fechas_propuestas', link: `#/panel/cliente/proyectos/${A}` } })))
  check(F, 'mensaje en el chat del proyecto', !!(await db.message.findFirst({ where: { senderId: P.id, body: { contains: 'Fechas del trabajo: Propuse hacer el trabajo' } } })))
  check(F, 'línea de tiempo del proyecto', !!(await db.activityEvent.findFirst({ where: { projectId: A, type: 'fechas_propuestas' } })))
  const dbA = await db.project.findUnique({ where: { id: A } })
  check(F, 'fecha guardada al mediodía UTC (sin corrimiento de zona)', dbA.startDate?.toISOString() === `${dia(3)}T12:00:00.000Z`, dbA.startDate?.toISOString())
  st(F, 'el profesional no acepta su propia propuesta', await post(P, sched(A), { accion: 'aceptar' }), 409)
  const c1 = await post(C, sched(A), { accion: 'proponer', startDate: dia(5), endDate: dia(9) })
  check(F, 'cliente propone otras (contrapropuesta)', c1.status === 200 && c1.data?.evento === 'contrapropuesta' && c1.data?.schedule?.proposedBy === 'cliente', brief(c1))
  check(F, 'profesional notificado de la contrapropuesta', !!(await db.notification.findFirst({ where: { userId: P.id, type: 'fechas_propuestas', link: `#/panel/profesional/proyectos/${A}` } })))
  st(F, 'el cliente no acepta su propia propuesta', await post(C, sched(A), { accion: 'aceptar' }), 409)
  const a1 = await post(P, sched(A), { accion: 'aceptar' })
  check(F, 'profesional acepta → acordada', a1.status === 200 && a1.data?.schedule?.status === 'acordada' && a1.data?.schedule?.startDate === dia(5) && a1.data?.schedule?.endDate === dia(9), brief(a1))
  check(F, 'cliente notificado: fechas acordadas', !!(await db.notification.findFirst({ where: { userId: C.id, type: 'fechas_acordadas' } })))
  st(F, 'aceptar de nuevo (ya acordadas)', await post(C, sched(A), { accion: 'aceptar' }), 409)

  // reprogramación: la fecha acordada sigue vigente mientras se revisa; rechazarla la restaura
  const r1 = await post(C, sched(A), { accion: 'proponer', startDate: dia(12), endDate: dia(14) })
  check(F, 'cliente pide reprogramar', r1.status === 200 && r1.data?.evento === 'reprogramacion' && r1.data?.schedule?.prevStartDate === dia(5), brief(r1))
  check(F, 'profesional notificado de la reprogramación', !!(await db.notification.findFirst({ where: { userId: P.id, type: 'fechas_reprogramacion' } })))
  const av1 = await get(ANON, `/api/profiles/professional/${P.proId}/availability`)
  check(F, 'disponibilidad: lo acordado sigue ocupado y el cambio figura por confirmar', diaCon(av1, dia(5), 'ocupado') && diaCon(av1, dia(9), 'ocupado') && diaCon(av1, dia(12), 'por_confirmar') && diaCon(av1, dia(14), 'por_confirmar'), brief(av1))
  const rr = await post(P, sched(A), { accion: 'rechazar', motivo: `${MARK} esa semana no puedo` })
  check(F, 'rechazar la reprogramación restaura lo acordado', rr.status === 200 && rr.data?.evento === 'reprogramacion_rechazada' && rr.data?.schedule?.status === 'acordada' && rr.data?.schedule?.startDate === dia(5) && rr.data?.schedule?.prevStartDate === null, brief(rr))
  const r2 = await post(P, sched(A), { accion: 'proponer', startDate: dia(6), endDate: dia(10) })
  check(F, 'el profesional también reprograma', r2.status === 200 && r2.data?.evento === 'reprogramacion', brief(r2))
  const r2a = await post(C, sched(A), { accion: 'aceptar' })
  check(F, 'cliente acepta la reprogramación', r2a.status === 200 && r2a.data?.schedule?.status === 'acordada' && r2a.data?.schedule?.startDate === dia(6), brief(r2a))

  // proyecto B: choque con lo ACORDADO (bloquea, D23), rechazo sin fechas previas y carrera de aceptaciones
  const pb = await post(C, '/api/projects', wz('cocina'))
  const B = pb.data?.project?.id
  S.calB = B
  await patch(P, `/api/projects/${B}`, { laborCost: 30000 })
  st(F, 'proyecto B en materiales', await patch(P, `/api/projects/${B}`, { stage: 'materiales' }), 200)
  const dbAv = await db.project.findUnique({ where: { id: A } })
  check(F, 'A sin horario = día completo (dailyStart/dailyEnd null, como un proyecto viejo)', dbAv.dailyStart === null && dbAv.dailyEnd === null, JSON.stringify({ ds: dbAv.dailyStart, de: dbAv.dailyEnd }))
  const pB1 = await post(P, sched(B), { accion: 'proponer', startDate: dia(8), endDate: dia(9) })
  check(F, 'D23: choca con A (acordado, día completo) → 409 y el profesional ve con qué trabajo', pB1.status === 409 && pB1.data?.choque === true && pB1.data?.conflictos?.[0]?.id === A && pB1.data?.conflictos?.[0]?.title === `${MARK} Cal living` && pB1.data?.error?.includes(`${MARK} Cal living`), brief(pB1))
  const pB1b = await post(P, sched(B), { accion: 'proponer', startDate: dia(8), endDate: dia(8), dailyStart: '20:00', dailyEnd: '21:00' })
  check(F, 'D23: un día completo acordado choca con cualquier franja (20:00–21:00) → 409', pB1b.status === 409 && pB1b.data?.choque === true, brief(pB1b))
  check(F, 'D23: el 409 no guardó nada', (await db.project.findUnique({ where: { id: B } }))?.scheduleStatus === null)
  st(F, 'profesional propone B en días libres', await post(P, sched(B), { accion: 'proponer', startDate: dia(15), endDate: dia(15) }), 200)
  const rjB = await post(C, sched(B), { accion: 'rechazar', motivo: `${MARK} prefiero otro mes` })
  check(F, 'rechazo sin fechas previas → sin fechas, con quién y motivo', rjB.status === 200 && rjB.data?.schedule?.status === null && rjB.data?.schedule?.startDate === null && rjB.data?.schedule?.proposedBy === 'cliente' && rjB.data?.schedule?.note === `${MARK} prefiero otro mes`, brief(rjB))
  check(F, 'profesional notificado del rechazo', !!(await db.notification.findFirst({ where: { userId: P.id, type: 'fechas_rechazadas' } })))
  st(F, 'después del rechazo el profesional propone otra', await post(P, sched(B), { accion: 'proponer', startDate: dia(20), endDate: dia(21) }), 200)
  const cB = await post(C, sched(B), { accion: 'proponer', startDate: dia(7), endDate: dia(7) })
  check(F, 'D23: el cliente también es bloqueado si choca con lo acordado, sin ver títulos', cB.status === 409 && cB.data?.choque === true && /El profesional ya tiene ese horario ocupado/.test(cB.data?.error || '') && cB.data?.conflictos?.length === 1 && cB.data.conflictos[0].title === undefined && cB.data.conflictos[0].id === undefined && !JSON.stringify(cB.data).includes('living') && !JSON.stringify(cB.data).includes(A), brief(cB))
  const cB2 = await post(C, sched(B), { accion: 'proponer', startDate: dia(22), endDate: dia(22) })
  check(F, 'cliente contrapropone en un día libre', cB2.status === 200 && cB2.data?.evento === 'contrapropuesta', brief(cB2))
  const [x1, x2] = await Promise.all([post(P, sched(B), { accion: 'aceptar' }), post(P, sched(B), { accion: 'aceptar' })])
  check(F, 'dos aceptaciones simultáneas del mismo proyecto: una sola pasa', [x1.status, x2.status].sort().join(',') === '200,409', `${x1.status} ${x2.status}`)

  // ── horarios (D23): dos trabajos el mismo día sin pisarse ──
  const mk = async (t) => {
    const r = await post(C, '/api/projects', wz(t))
    const id = r.data?.project?.id
    await patch(P, `/api/projects/${id}`, { laborCost: 20000 })
    await patch(P, `/api/projects/${id}`, { stage: 'materiales' })
    return id
  }
  const H1 = await mk('baño mañana')
  const H2 = await mk('balcón tarde')
  const H3 = await mk('pasillo mediodía')
  const H4 = await mk('reja')
  S.calH = [H1, H2, H3, H4]
  const D = dia(40)
  const D2 = dia(41)
  // validación del horario (400)
  st(F, 'horario: solo la hora de inicio → 400', await post(P, sched(H1), { accion: 'proponer', startDate: D, endDate: D, dailyStart: '07:00' }), 400)
  st(F, 'horario: solo la hora de fin → 400', await post(P, sched(H1), { accion: 'proponer', startDate: D, endDate: D, dailyEnd: '12:00' }), 400)
  st(F, 'horario: formato inválido (7:00) → 400', await post(P, sched(H1), { accion: 'proponer', startDate: D, endDate: D, dailyStart: '7:00', dailyEnd: '12:00' }), 400)
  st(F, 'horario: hora que no existe (25:00) → 400', await post(P, sched(H1), { accion: 'proponer', startDate: D, endDate: D, dailyStart: '25:00', dailyEnd: '26:00' }), 400)
  st(F, 'horario: no múltiplo de 15 min (07:10) → 400', await post(P, sched(H1), { accion: 'proponer', startDate: D, endDate: D, dailyStart: '07:10', dailyEnd: '12:00' }), 400)
  st(F, 'horario: fin igual al inicio → 400', await post(P, sched(H1), { accion: 'proponer', startDate: D, endDate: D, dailyStart: '12:00', dailyEnd: '12:00' }), 400)
  st(F, 'horario: fin antes del inicio (cruza la medianoche) → 400', await post(P, sched(H1), { accion: 'proponer', startDate: D, endDate: D, dailyStart: '22:00', dailyEnd: '02:00' }), 400)
  // 07–12 y 14–19 el mismo día: los dos se acuerdan
  const tMail = Date.now()
  const h1 = await post(P, sched(H1), { accion: 'proponer', startDate: D, endDate: D, dailyStart: '07:00', dailyEnd: '12:00' })
  check(F, 'propone con horario 07:00–12:00', h1.status === 200 && h1.data?.schedule?.dailyStart === '07:00' && h1.data?.schedule?.dailyEnd === '12:00', brief(h1))
  const nH1 = await db.notification.findFirst({ where: { userId: C.id, type: 'fechas_propuestas', link: `#/panel/cliente/proyectos/${H1}` } })
  check(F, 'la notificación incluye el horario', !!nH1 && nH1.body.includes(`el ${D.slice(8, 10)}/${D.slice(5, 7)}, de 07:00 a 12:00`), nH1?.body)
  check(F, 'el mensaje del chat incluye el horario', !!(await db.message.findFirst({ where: { senderId: P.id, body: { contains: `el ${D.slice(8, 10)}/${D.slice(5, 7)}, de 07:00 a 12:00` } } })))
  const evH1 = await db.activityEvent.findFirst({ where: { projectId: H1, type: 'fechas_propuestas' } })
  check(F, 'la línea de tiempo incluye el horario', !!evH1 && evH1.message.includes('de 07:00 a 12:00'), evH1?.message)
  if (MAIL_SINK_PORT) {
    const m = await waitMail(C.email, tMail, { subject: 'Te propusieron fechas' })
    check(F, 'el mail de la propuesta incluye el horario', !!m && JSON.stringify(m.body).includes('de 07:00 a 12:00'), JSON.stringify(m?.body || {}).slice(0, 300))
  }
  st(F, 'cliente acepta H1 (07:00–12:00)', await post(C, sched(H1), { accion: 'aceptar' }), 200)
  const h2 = await post(P, sched(H2), { accion: 'proponer', startDate: D, endDate: D, dailyStart: '14:00', dailyEnd: '19:00' })
  check(F, '14:00–19:00 el mismo día: no choca (ni aviso)', h2.status === 200 && h2.data?.solapamiento?.cantidad === 0, brief(h2))
  const a2 = await post(C, sched(H2), { accion: 'aceptar' })
  check(F, 'cliente acepta H2: los dos quedan acordados el mismo día', a2.status === 200 && a2.data?.schedule?.status === 'acordada', brief(a2))
  const both = await db.project.findMany({ where: { id: { in: [H1, H2] } }, select: { scheduleStatus: true } })
  check(F, 'H1 y H2 acordados', both.length === 2 && both.every((x) => x.scheduleStatus === 'acordada'), JSON.stringify(both))
  // borde: 12:00–14:00 toca los dos pero no choca
  const hb = await post(P, sched(H4), { accion: 'proponer', startDate: D, endDate: D, dailyStart: '12:00', dailyEnd: '14:00' })
  check(F, 'bordes que se tocan (12:00–14:00 entre 07–12 y 14–19) no chocan', hb.status === 200, brief(hb))
  // 11–15 choca con los dos acordados → 409 (el profesional ve títulos; el cliente no)
  const h3 = await post(P, sched(H3), { accion: 'proponer', startDate: D, endDate: D, dailyStart: '11:00', dailyEnd: '15:00' })
  const tit = (h3.data?.conflictos || []).map((c) => c.title).sort()
  check(F, '11:00–15:00 choca con los dos acordados → 409 con títulos, fechas y horario', h3.status === 409 && h3.data?.choque === true && tit.length === 2 && tit[0] === `${MARK} Cal balcón tarde` && tit[1] === `${MARK} Cal baño mañana` && (h3.data?.conflictos || []).some((c) => c.dailyStart === '07:00' && c.dailyEnd === '12:00' && c.startDate === D) && /de 07:00 a 12:00/.test(h3.data?.error || ''), brief(h3))
  st(F, 'H3 se propone otro día (11:00–15:00)', await post(P, sched(H3), { accion: 'proponer', startDate: D2, endDate: D2, dailyStart: '11:00', dailyEnd: '15:00' }), 200)
  const c3 = await post(C, sched(H3), { accion: 'proponer', startDate: D, endDate: D, dailyStart: '11:00', dailyEnd: '15:00' })
  check(F, 'el cliente que contrapropone 11–15 ese día: 409 sin títulos ni ids', c3.status === 409 && /El profesional ya tiene ese horario ocupado/.test(c3.data?.error || '') && !JSON.stringify(c3.data).includes(MARK) && !JSON.stringify(c3.data).includes(H1) && (c3.data?.conflictos || []).every((c) => c.title === undefined && c.id === undefined && !!c.dailyStart), brief(c3))
  // choque SOLO con otra propuesta → avisa y no bloquea
  const h4 = await post(P, sched(H4), { accion: 'proponer', startDate: D2, endDate: D2, dailyStart: '12:00', dailyEnd: '13:00' })
  check(F, 'choca solo con otra propuesta (H3 pendiente) → 200 con aviso y el título al profesional', h4.status === 200 && h4.data?.solapamiento?.cantidad === 1 && h4.data?.solapamiento?.proyectos?.[0]?.id === H3, brief(h4))
  // carrera: el cliente acepta H3 y H4 a la vez (se pisan) → una 200 y otra 409
  const [y3, y4] = await Promise.all([post(C, sched(H3), { accion: 'aceptar' }), post(C, sched(H4), { accion: 'aceptar' })])
  check(F, 'carrera de dos aceptaciones que se pisan: una 200 y otra 409 (choque)', [y3.status, y4.status].sort().join(',') === '200,409' && [y3, y4].find((r) => r.status === 409)?.data?.choque === true, `${y3.status} ${y4.status} ${brief(y3.status === 409 ? y3 : y4)}`)
  const acordH34 = await db.project.count({ where: { id: { in: [H3, H4] }, scheduleStatus: 'acordada' } })
  check(F, 'después de la carrera queda UNA sola acordada', acordH34 === 1, String(acordH34))
  // reprogramar guarda y restaura también la franja
  const rp1 = await post(C, sched(H1), { accion: 'proponer', startDate: dia(43), endDate: dia(43) })
  check(F, 'reprogramar H1 a todo el día: la franja acordada queda en prev*', rp1.status === 200 && rp1.data?.schedule?.dailyStart === null && rp1.data?.schedule?.prevDailyStart === '07:00' && rp1.data?.schedule?.prevDailyEnd === '12:00', brief(rp1))
  const rp1r = await post(P, sched(H1), { accion: 'rechazar' })
  check(F, 'rechazar la reprogramación restaura días Y horario', rp1r.status === 200 && rp1r.data?.schedule?.startDate === D && rp1r.data?.schedule?.dailyStart === '07:00' && rp1r.data?.schedule?.dailyEnd === '12:00' && rp1r.data?.schedule?.prevDailyStart === null, brief(rp1r))
  const dH1 = await get(C, `/api/projects/${H1}`)
  check(F, 'detalle (cliente) con horario y jornada del profesional', dH1.data?.project?.schedule?.dailyStart === '07:00' && dH1.data?.project?.proWorkday?.desde === '06:00' && dH1.data?.project?.proWorkday?.hasta === '18:00', brief(dH1))

  // disponibilidad pública con horarios: "con lugar", franjas unidas y libres, sin datos privados
  const avH = await get(ANON, `/api/profiles/professional/${P.proId}/availability`)
  const dD = (avH.data?.dias || []).find((x) => x.dia === D)
  check(F, 'disponibilidad: el día de 07–12 y 14–19 está "con lugar" con esas franjas y los huecos 06–07 y 12–14', !!dD && dD.estado === 'con_lugar'
    && JSON.stringify(dD.franjas.filter((f) => f.estado === 'ocupado')) === JSON.stringify([{ desde: '07:00', hasta: '12:00', estado: 'ocupado' }, { desde: '14:00', hasta: '19:00', estado: 'ocupado' }])
    && JSON.stringify(dD.libres.slice(0, 2)) === JSON.stringify([{ desde: '06:00', hasta: '07:00' }, { desde: '12:00', hasta: '14:00' }]), JSON.stringify(dD))
  check(F, 'disponibilidad: jornada de referencia 06:00–18:00', avH.data?.jornada?.desde === '06:00' && avH.data?.jornada?.hasta === '18:00', brief(avH))
  const dA6 = (avH.data?.dias || []).find((x) => x.dia === dia(6))
  check(F, 'disponibilidad: proyecto sin franja = día completo (00:00–24:00, "completo")', !!dA6 && dA6.estado === 'completo' && dA6.franjas.some((f) => f.desde === '00:00' && f.hasta === '24:00' && f.estado === 'ocupado') && dA6.libres.length === 0, JSON.stringify(dA6))
  const avHTxt = JSON.stringify(avH.data)
  const clavesH = avHTxt.replace(/"(dias|dia|estado|franjas|libres|desde|hasta|jornada|from|to|today|proximoDiaConLugar|disponibleEstaSemana)"/g, '')
  check(F, 'disponibilidad con horarios: sin título, cliente, dirección, nota ni ids', !avHTxt.includes(MARK) && !avHTxt.includes('Calle Privada') && !avHTxt.includes(C.id) && ![A, B, H1, H2, H3, H4].some((x) => avHTxt.includes(x)) && !/"[a-zA-Z_]+":/.test(clavesH.replace(/"(ocupado|por_confirmar|con_lugar|completo)"/g, '')), avHTxt.slice(0, 300))
  check(F, 'disponibilidad: "próximo día con lugar"', typeof avH.data?.proximoDiaConLugar === 'string' && avH.data?.proximaFechaLibre === undefined, brief(avH))

  // jornada del profesional (D23): configurable; decide "completo"
  const J = '/api/professional/calendar'
  st(F, 'jornada: sin sesión → 401', await patch(ANON, J, { workdayStart: '07:00', workdayEnd: '12:00' }), 401)
  st(F, 'jornada: alguien sin perfil profesional → 403', await patch(C, J, { workdayStart: '07:00', workdayEnd: '12:00' }), 403)
  st(F, 'jornada: formato inválido → 400', await patch(P, J, { workdayStart: '7:00', workdayEnd: '12:00' }), 400)
  st(F, 'jornada: una sola hora → 400', await patch(P, J, { workdayStart: '07:00', workdayEnd: null }), 400)
  st(F, 'jornada: fin antes del inicio → 400', await patch(P, J, { workdayStart: '12:00', workdayEnd: '07:00' }), 400)
  st(F, 'jornada: no múltiplo de 15 min → 400', await patch(P, J, { workdayStart: '07:05', workdayEnd: '12:00' }), 400)
  const jp = await patch(P, J, { workdayStart: '07:00', workdayEnd: '12:00' })
  check(F, 'jornada: el propio profesional la cambia (07:00–12:00)', jp.status === 200 && jp.data?.jornada?.desde === '07:00' && jp.data?.jornadaPorDefecto === false, brief(jp))
  const p2j = await patch(P2, J, { workdayStart: '09:00', workdayEnd: '10:00' })
  check(F, 'jornada: otro profesional cambia SOLO la suya', p2j.status === 200 && (await db.professionalProfile.findUnique({ where: { id: P.proId } }))?.workdayStart === '07:00', brief(p2j))
  const avJ = await get(ANON, `/api/profiles/professional/${P.proId}/availability`)
  const dJ = (avJ.data?.dias || []).find((x) => x.dia === D)
  check(F, 'con jornada 07–12, el día de 07–12 + 14–19 queda "completo" en lo público', avJ.data?.jornada?.desde === '07:00' && dJ?.estado === 'completo' && dJ.libres.length === 0 && !JSON.stringify(avJ.data).includes(MARK), JSON.stringify(dJ))
  const calJ = await get(P, `${J}?from=${D}&to=${D}`)
  check(F, 'el calendario devuelve la jornada y los horarios', calJ.data?.jornada?.desde === '07:00' && (calJ.data?.projects || []).some((p) => p.id === H1 && p.ranges?.[0]?.dailyStart === '07:00'), brief(calJ))
  const jr = await patch(P, J, { workdayStart: null, workdayEnd: null })
  check(F, 'jornada: volver a la de referencia (null → 06:00–18:00)', jr.status === 200 && jr.data?.jornada?.desde === '06:00' && jr.data?.jornadaPorDefecto === true, brief(jr))

  // proyecto C (oferta aceptada en la bolsa): se agenda aunque siga en presupuesto
  const jb = await post(C, '/api/jobs', { title: `${MARK} Cal bolsa`, description: `${MARK} Pintar un balcón`, categorySlug: 'pintura', urgency: 'normal', budgetMin: 10000, budgetMax: 30000, address: 'Calle Privada 742', lat: CABA.lat, lng: CABA.lng })
  const bid = await post(P, `/api/jobs/${jb.data?.job?.id}/bids`, { amount: 20000, timelineDays: 2 })
  const acc = await patch(C, `/api/bids/${bid.data?.bid?.id}`, { action: 'aceptar' })
  const Cp = acc.data?.project?.id
  S.calC = Cp
  check(F, 'proyecto por oferta aceptada', !!Cp && (await db.project.findUnique({ where: { id: Cp } }))?.stage === 'presupuesto', brief(acc))
  st(F, 'oferta aceptada: se agenda en presupuesto', await post(P, sched(Cp), { accion: 'proponer', startDate: dia(30), endDate: dia(31) }), 200)
  st(F, 'cancelar el proyecto C', await patch(C, `/api/projects/${Cp}`, { status: 'cancelado', cancelReason: `${MARK} ya no hace falta` }), 200)
  st(F, 'proyecto cancelado: no se tocan las fechas', await post(C, sched(Cp), { accion: 'aceptar' }), 409)

  // calendario del profesional
  st(F, 'calendario sin sesión', await get(ANON, '/api/professional/calendar'), 401)
  st(F, 'calendario de alguien sin perfil profesional', await get(C, '/api/professional/calendar'), 403)
  st(F, 'calendario con ventana demasiado larga', await get(P, `/api/professional/calendar?from=${dia(0)}&to=${dia(400)}`), 400)
  const cal = await get(P, `/api/professional/calendar?from=${dia(0)}&to=${dia(40)}`)
  st(F, 'calendario del profesional', cal, 200)
  const ids = (cal.data?.projects || []).map((p) => p.id)
  check(F, 'calendario: A y B con fechas; el cancelado no aparece', ids.includes(A) && ids.includes(B) && !ids.includes(Cp), JSON.stringify(ids))
  check(F, 'calendario: A acordado con su rango', (cal.data?.projects || []).find((p) => p.id === A)?.ranges?.[0]?.estado === 'ocupado', brief(cal))
  const hoyMes = await get(P, '/api/professional/calendar')
  check(F, 'calendario sin parámetros: mes en curso', hoyMes.status === 200 && hoyMes.data?.from === `${hoyAR.slice(0, 7)}-01`, brief(hoyMes))

  // disponibilidad pública: sin sesión, sin datos privados
  const av = await get(ANON, `/api/profiles/professional/${P.proId}/availability`)
  st(F, 'disponibilidad pública sin sesión', av, 200)
  const avTxt = JSON.stringify(av.data)
  const soloClaves = avTxt.replace(/"(dias|dia|estado|franjas|libres|desde|hasta|jornada|from|to|today|proximoDiaConLugar|disponibleEstaSemana)"/g, '')
  check(F, 'disponibilidad: sin título, cliente, dirección, nota ni ids', !avTxt.includes(MARK) && !avTxt.includes('Calle Privada') && !avTxt.includes(C.id) && !avTxt.includes(A) && !avTxt.includes(B) && !/title|client|address|note|nota/i.test(soloClaves), avTxt.slice(0, 300))
  check(F, 'disponibilidad: días acordados de A ocupados y próximo día con lugar', diaCon(av, dia(6), 'ocupado') && diaCon(av, dia(10), 'ocupado') && typeof av.data?.proximoDiaConLugar === 'string' && typeof av.data?.disponibleEstaSemana === 'boolean', avTxt.slice(0, 300))
  st(F, 'disponibilidad de profesional inexistente', await get(ANON, '/api/profiles/professional/no-existe/availability'), 404)
  st(F, 'disponibilidad con ventana de más de 6 meses', await get(ANON, `/api/profiles/professional/${P.proId}/availability?from=${dia(0)}&to=${dia(200)}`), 400)
  st(F, 'disponibilidad con fecha inválida', await get(ANON, `/api/profiles/professional/${P.proId}/availability?from=mañana`), 400)

  // detalle del proyecto para cada parte
  const dA = await get(C, `/api/projects/${A}`)
  check(F, 'detalle (cliente) trae las fechas acordadas', dA.data?.project?.schedule?.status === 'acordada' && dA.data?.project?.schedule?.startDate === dia(6), brief(dA))
}

// ═════════════════════════ R. FINANZAS DEL PROFESIONAL Y DEL PROVEEDOR (D24) ═════════════════════════
// Usa lo que dejaron las secciones anteriores (facturas de E, ventas de F/P, devoluciones de G) y
// verifica que los automáticos coincidan con la base con las MISMAS reglas (LOGICA §16). Después:
// carga/edición/baja de movimientos, recurrente, inversión con amortización, préstamo, 401/403/IDOR y CSV.
async function flowR() {
  const F = 'R'
  const near = (a, b) => Math.abs((a ?? NaN) - b) < 0.02
  const hoyAR = new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
  const mesAR = hoyAR.slice(0, 7)
  const addMes = (k, n) => { const [y, m] = k.split('-').map(Number); const t = new Date(Date.UTC(y, m - 1 + n, 1)); return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}` }
  const resumen = async (a, role, periodo = 'mes') => {
    const r = await get(a, `/api/finanzas/resumen?role=${role}&periodo=${periodo}`)
    if (r.status !== 200) throw new Error(`resumen ${role} ${periodo}: ${brief(r)}`)
    return r.data
  }

  // ── 401 / 403 / 400 ──
  st(F, 'resumen sin sesión', await get(ANON, '/api/finanzas/resumen?role=profesional'), 401)
  st(F, 'alta sin sesión (aunque el body esté mal)', await post(ANON, '/api/finanzas/movimientos', { role: 'profesional' }), 401)
  st(F, 'CSV sin sesión', await get(ANON, '/api/finanzas/export.csv?role=proveedor'), 401)
  st(F, 'config sin sesión', await put(ANON, '/api/finanzas/config', { role: 'profesional', saldoInicial: 1 }), 401)
  st(F, 'costos sin sesión', await put(ANON, '/api/finanzas/costos', { items: [{ stockId: 'x', unitCost: 1 }] }), 401)
  st(F, 'editar sin sesión', await patch(ANON, '/api/finanzas/movimientos/cualquiera', { amount: 1 }), 401)
  st(F, 'cliente no ve Finanzas de profesional', await get(C, '/api/finanzas/resumen?role=profesional'), 403)
  st(F, 'profesional no ve Finanzas de proveedor', await get(P, '/api/finanzas/resumen?role=proveedor'), 403)
  st(F, 'proveedor no carga costos de otro rol (cliente)', await put(C, '/api/finanzas/costos', { items: [{ stockId: S.stock1, unitCost: 1 }] }), 403)
  st(F, 'rol inválido', await get(P, '/api/finanzas/resumen?role=admin'), 400)
  st(F, 'período inválido', await get(P, '/api/finanzas/resumen?role=profesional&periodo=semana'), 400)
  st(F, 'rango al revés', await get(P, '/api/finanzas/resumen?role=profesional&desde=2026-09-10&hasta=2026-09-01'), 400)

  // ── automáticos del PROFESIONAL = base ──
  const rp = await resumen(P, 'profesional', '12m')
  const desde = new Date(rp.reporte.periodo.desde)
  const hasta = new Date(rp.reporte.periodo.hasta)
  const enR = (d) => d && d >= desde && d < hasta
  const invs = await db.invoice.findMany({ where: { project: { pro: { userId: P.id } } } })
  const facturado = invs.filter((i) => enR(i.issuedAt)).reduce((a, i) => a + i.total, 0)
  const cobrado = invs.filter((i) => i.status === 'pagada' && enR(i.paidAt || i.issuedAt)).reduce((a, i) => a + i.total, 0)
  const porCobrar = invs.filter((i) => i.status !== 'pagada').reduce((a, i) => a + i.total, 0)
  check(F, `profesional: facturado = suma de sus facturas en la base (${invs.length} facturas)`, near(rp.reporte.resultados.ventasHomia, facturado), `api ${rp.reporte.resultados.ventasHomia} base ${facturado}`)
  check(F, 'profesional: hay facturas de las secciones anteriores para comparar', invs.length > 0, `facturas ${invs.length}`)
  const lineaCobradas = (rp.reporte.caja.detalleEntradas.find((l) => l.concepto === 'Facturas cobradas (HomIA)') || { monto: 0 }).monto
  check(F, 'profesional: cobrado (caja) = facturas pagadas en la base', near(lineaCobradas, cobrado), `api ${lineaCobradas} base ${cobrado}`)
  check(F, 'profesional: cuentas por cobrar = facturas no pagadas', near(rp.reporte.balance.cuentasPorCobrarHomia, porCobrar), `api ${rp.reporte.balance.cuentasPorCobrarHomia} base ${porCobrar}`)
  const manoObra = invs.filter((i) => enR(i.issuedAt)).reduce((a, i) => a + i.laborCost, 0)
  check(F, 'profesional: mano de obra separada de materiales', near(rp.reporte.resultados.manoObra, manoObra), `api ${rp.reporte.resultados.manoObra} base ${manoObra}`)
  const devPro = await db.leftoverReturn.findMany({ where: { status: 'reembolsada', sellerKind: 'profesional', professional: { userId: P.id } } })
  const devProMonto = devPro.filter((d) => enR(d.refundedAt || d.receivedAt || d.respondedAt || d.requestedAt)).reduce((a, d) => a + d.refundTotal, 0)
  check(F, `profesional: devoluciones = reembolsos de sobrantes que hizo (${devPro.length})`, near(rp.reporte.resultados.devoluciones, devProMonto), `api ${rp.reporte.resultados.devoluciones} base ${devProMonto}`)
  const comprasP = await db.providerCharge.findMany({ where: { clientId: P.id, status: 'pagada', projectId: null } })
  const comprasMonto = comprasP.filter((c) => enR(c.paidAt || c.createdAt)).reduce((a, c) => a + c.amount, 0)
  check(F, `profesional: materiales comprados en HomIA = cobros pagados donde es cliente (${comprasP.length})`, near(rp.reporte.resultados.comprasHomia, comprasMonto), `api ${rp.reporte.resultados.comprasHomia} base ${comprasMonto}`)
  check(F, 'profesional: el reporte no tiene NaN ni Infinity', !/NaN|Infinity/.test(JSON.stringify(rp)))
  check(F, 'profesional: cada métrica tiene valor o explicación de "sin dato"', rp.reporte.metricas.every((m) => m.valor !== null || !!m.sinDato), JSON.stringify(rp.reporte.metricas.filter((m) => m.valor === null && !m.sinDato)))
  check(F, 'profesional: tasa de aceptación presente', rp.reporte.metricas.some((m) => m.id === 'tasa_aceptacion'))
  manifest.finanzasTiempos = { profesional: rp.tiempos }
  console.log(`  · automáticos profesional: facturado ${facturado} · cobrado ${cobrado} · por cobrar ${porCobrar} · devoluciones ${devProMonto} · compras ${comprasMonto} · ${rp.tiempos.totalMs} ms`)

  // ── automáticos del PROVEEDOR = base ──
  const rv = await resumen(V, 'proveedor', '12m')
  const chs = await db.providerCharge.findMany({ where: { provider: { userId: V.id }, status: { notIn: ['anulada', 'reembolsada'] } } })
  const vend = chs.filter((c) => enR(c.createdAt)).reduce((a, c) => a + c.amount, 0)
  const cobV = chs.filter((c) => c.status === 'pagada' && enR(c.paidAt || c.createdAt)).reduce((a, c) => a + c.amount, 0)
  check(F, `proveedor: ventas = sus cobros no anulados en la base (${chs.length})`, near(rv.reporte.resultados.ventasHomia, vend), `api ${rv.reporte.resultados.ventasHomia} base ${vend}`)
  check(F, 'proveedor: hay ventas de las secciones anteriores para comparar', chs.length > 0, `cobros ${chs.length}`)
  const lineaV = (rv.reporte.caja.detalleEntradas.find((l) => l.concepto === 'Ventas cobradas (HomIA)') || { monto: 0 }).monto
  check(F, 'proveedor: cobrado (caja) = cobros pagados en la base', near(lineaV, cobV), `api ${lineaV} base ${cobV}`)
  const devV = await db.leftoverReturn.findMany({ where: { status: 'reembolsada', provider: { userId: V.id } } })
  const devVMonto = devV.filter((d) => enR(d.refundedAt || d.receivedAt || d.respondedAt || d.requestedAt)).reduce((a, d) => a + d.refundTotal, 0)
  check(F, `proveedor: devoluciones = sobrantes reembolsados (${devV.length})`, near(rv.reporte.resultados.devoluciones, devVMonto), `api ${rv.reporte.resultados.devoluciones} base ${devVMonto}`)
  check(F, 'proveedor: sin costos cargados, lo vendido queda "sin costo" (no se inventa)', rv.reporte.resultados.mercaderia.conocido === 0 && rv.reporte.resultados.mercaderia.estimado === 0, JSON.stringify(rv.reporte.resultados.mercaderia))
  check(F, 'proveedor: el reporte no tiene NaN ni Infinity', !/NaN|Infinity/.test(JSON.stringify(rv)))
  check(F, 'proveedor: trae su stock para cargar costos', Array.isArray(rv.stock) && rv.stock.length > 0, `stock ${rv.stock?.length}`)
  manifest.finanzasTiempos.proveedor = rv.tiempos
  console.log(`  · automáticos proveedor: vendido ${vend} · cobrado ${cobV} · devoluciones ${devVMonto} · ${rv.tiempos.totalMs} ms`)

  // costo de la mercadería: se carga el costo de TODO su stock (la mitad del precio) y se compara con la base
  const stockV = await db.providerStock.findMany({ where: { provider: { userId: V.id } }, select: { id: true, elementId: true, price: true } })
  const cst = await put(V, '/api/finanzas/costos', { items: stockV.map((s) => ({ stockId: s.id, unitCost: Math.round(s.price * 50) / 100 })) })
  st(F, 'proveedor carga el costo de sus productos', cst, 200)
  const otroStock = await db.providerStock.findFirst({ where: { provider: { userId: { not: V.id } } }, select: { id: true } })
  if (otroStock) st(F, 'IDOR: no carga costos en stock ajeno', await put(V, '/api/finanzas/costos', { items: [{ stockId: otroStock.id, unitCost: 1 }] }), 403)
  const costoDe = new Map(stockV.map((s) => [s.elementId, Math.round(s.price * 50) / 100]))
  const chIn = chs.filter((c) => enR(c.createdAt))
  const items = await db.purchaseItem.findMany({ where: { purchase: { chargeId: { in: chIn.map((c) => c.id) } } } })
  const mats = await db.projectMaterial.findMany({ where: { id: { in: chIn.flatMap((c) => JSON.parse(c.materialIds || '[]')) } } })
  let esperadoCmv = 0
  for (const l of [...items.map((i) => ({ e: i.elementId, q: i.quantity })), ...mats.map((m) => ({ e: m.elementId, q: m.quantity }))]) if (l.e && costoDe.has(l.e)) esperadoCmv += l.q * costoDe.get(l.e)
  const rv2 = await resumen(V, 'proveedor', '12m')
  check(F, 'proveedor: costo de lo vendido = cantidades vendidas × costo cargado', near(rv2.reporte.resultados.mercaderia.conocido, Math.round(esperadoCmv * 100) / 100), `api ${rv2.reporte.resultados.mercaderia.conocido} base ${esperadoCmv}`)
  const stockConCant = await db.providerStock.findMany({ where: { provider: { userId: V.id } }, select: { quantity: true, unitCost: true } })
  const invEsperado = stockConCant.filter((s) => s.quantity > 0).reduce((a, s) => a + s.quantity * (s.unitCost || 0), 0)
  check(F, 'proveedor: inventario al costo = stock × costo', near(rv2.reporte.balance.inventario, Math.round(invEsperado * 100) / 100), `api ${rv2.reporte.balance.inventario} base ${invEsperado}`)
  st(F, 'proveedor: margen estimado fuera de rango → 400', await put(V, '/api/finanzas/config', { role: 'proveedor', costoEstimadoPct: 150 }), 400)
  st(F, 'profesional no declara margen estimado', await put(P, '/api/finanzas/config', { role: 'profesional', costoEstimadoPct: 70 }), 400)

  // ── carga, edición y baja (profesional), con deltas exactos sobre "este mes" ──
  const b0 = await resumen(P, 'profesional', 'mes')
  const alta = (body) => post(P, '/api/finanzas/movimientos', { role: 'profesional', date: hoyAR, ...body })
  const g = await alta({ type: 'gasto', category: 'combustible', description: `${MARK} nafta`, amount: 25000, paymentMethod: 'efectivo' })
  st(F, 'alta de un gasto', g, 201)
  S.finGasto = g.data?.movimiento?.id
  const b1 = await resumen(P, 'profesional', 'mes')
  check(F, 'gasto: suma a gastos fijos', near(b1.reporte.resultados.gastos - b0.reporte.resultados.gastos, 25000), `${b0.reporte.resultados.gastos} → ${b1.reporte.resultados.gastos}`)
  check(F, 'gasto: baja el resultado neto', near(b0.reporte.resultados.resultadoNeto - b1.reporte.resultados.resultadoNeto, 25000))
  check(F, 'gasto pagado: sale de la caja', near(b1.reporte.caja.salidas - b0.reporte.caja.salidas, 25000))

  st(F, 'ingreso por fuera "me lo deben"', await alta({ type: 'otro_ingreso', category: 'trabajos_fuera', description: `${MARK} arreglo vecino`, amount: 100000, status: 'pendiente' }), 201)
  st(F, 'inversión con vida útil', await alta({ type: 'inversion', category: 'herramientas_electricas', description: `${MARK} termofusora`, amount: 360000, usefulLifeMonths: 36 }), 201)
  st(F, 'retiro del dueño', await alta({ type: 'retiro', category: 'retiro_dueno', description: `${MARK} para la casa`, amount: 50000 }), 201)
  st(F, 'préstamo recibido', await alta({ type: 'prestamo', category: 'prestamo_banco', description: `${MARK} crédito`, amount: 1000000 }), 201)
  st(F, 'cuota con interés', await alta({ type: 'pago_prestamo', category: 'cuota_prestamo', description: `${MARK} cuota 1`, amount: 110000, interestAmount: 30000 }), 201)
  const b2 = await resumen(P, 'profesional', 'mes')
  const R1 = b1.reporte.resultados, R2 = b2.reporte.resultados
  check(F, 'ingreso por fuera: suma a ventas (lo facturado)', near(R2.ventasFuera - R1.ventasFuera, 100000))
  check(F, 'ingreso "me lo deben": no entra a la caja todavía', near(b2.reporte.caja.entradas - b1.reporte.caja.entradas, 1000000), `entradas +${b2.reporte.caja.entradas - b1.reporte.caja.entradas} (solo el préstamo)`)
  check(F, 'ingreso "me lo deben": es cuenta por cobrar', near(b2.reporte.balance.cuentasPorCobrarFuera - b1.reporte.balance.cuentasPorCobrarFuera, 100000))
  check(F, 'inversión: amortiza 360.000 / 36 = 10.000 este mes', near(R2.amortizaciones - R1.amortizaciones, 10000), `${R1.amortizaciones} → ${R2.amortizaciones}`)
  check(F, 'inversión: bienes de uso = 360.000 − 10.000', near(b2.reporte.balance.bienesDeUso - b1.reporte.balance.bienesDeUso, 350000))
  check(F, 'retiro: no cambia el resultado (no es gasto)', near(R2.resultadoNeto - R1.resultadoNeto, 100000 - 10000 - 30000), `Δ ${R2.resultadoNeto - R1.resultadoNeto}`)
  check(F, 'retiro: se informa aparte', near(R2.retiros - R1.retiros, 50000))
  check(F, 'cuota: solo el interés es gasto', near(R2.intereses - R1.intereses, 30000))
  check(F, 'préstamo: deuda = 1.000.000 − 80.000 de capital', near(b2.reporte.balance.prestamos - b1.reporte.balance.prestamos, 920000))
  check(F, 'caja: sale inversión + retiro + cuota', near(b2.reporte.caja.salidas - b1.reporte.caja.salidas, 360000 + 50000 + 110000))
  check(F, 'balance cierra: activos − pasivos = patrimonio', near(b2.reporte.balance.activos - b2.reporte.balance.pasivos, b2.reporte.balance.patrimonio))

  // recurrente: desde el 1.º de hace dos meses → 3 ocurrencias en "últimos 3 meses"; terminado el mes pasado → 2
  const m3a = await resumen(P, 'profesional', '3m')
  const rec = await post(P, '/api/finanzas/movimientos', { role: 'profesional', type: 'gasto', category: 'internet_celular', description: `${MARK} celular`, amount: 20000, date: `${addMes(mesAR, -2)}-01`, recurring: 'mensual' })
  st(F, 'alta de un gasto mensual (recurrente)', rec, 201)
  const m3b = await resumen(P, 'profesional', '3m')
  check(F, 'recurrente: se cuenta una vez por mes (3 meses)', near(m3b.reporte.resultados.gastos - m3a.reporte.resultados.gastos, 60000), `Δ ${m3b.reporte.resultados.gastos - m3a.reporte.resultados.gastos}`)
  const fin = await patch(P, `/api/finanzas/movimientos/${rec.data?.movimiento?.id}`, { recurringUntil: `${addMes(mesAR, -1)}-01` })
  st(F, 'terminar el recurrente', fin, 200)
  const m3c = await resumen(P, 'profesional', '3m')
  check(F, 'recurrente terminado: deja de contarse', near(m3c.reporte.resultados.gastos - m3a.reporte.resultados.gastos, 40000), `Δ ${m3c.reporte.resultados.gastos - m3a.reporte.resultados.gastos}`)
  check(F, 'recurrente: aparece una vez por mes en la lista', m3b.movimientos.filter((m) => m.entryId === rec.data?.movimiento?.id).length === 3)

  // edición y baja lógica
  const ed = await patch(P, `/api/finanzas/movimientos/${S.finGasto}`, { amount: 30000 })
  check(F, 'editar el monto', ed.status === 200 && ed.data?.movimiento?.amount === 30000, brief(ed))
  const b3 = await resumen(P, 'profesional', 'mes')
  check(F, 'edición: el gasto sube 5.000', near(b3.reporte.resultados.gastos - b2.reporte.resultados.gastos, 5000))
  st(F, 'editar con categoría de otro tipo → 400', await patch(P, `/api/finanzas/movimientos/${S.finGasto}`, { category: 'vehiculo' }), 400)

  // validaciones
  st(F, 'monto 0 → 400', await alta({ type: 'gasto', category: 'combustible', description: 'x', amount: 0 }), 400)
  st(F, 'categoría que no es del tipo → 400', await alta({ type: 'gasto', category: 'vehiculo', description: 'x', amount: 10 }), 400)
  st(F, 'categoría de otro rol (mercadería en profesional) → 400', await alta({ type: 'compra_mercaderia', category: 'mercaderia', description: 'x', amount: 10 }), 400)
  st(F, 'fecha futura → 400', await alta({ type: 'gasto', category: 'combustible', description: 'x', amount: 10, date: '2099-01-01' }), 400)
  st(F, 'interés mayor que la cuota → 400', await alta({ type: 'pago_prestamo', category: 'cuota_prestamo', description: 'x', amount: 10, interestAmount: 20 }), 400)
  st(F, 'retiro "pendiente" → 400', await alta({ type: 'retiro', category: 'retiro_dueno', description: 'x', amount: 10, status: 'pendiente' }), 400)
  st(F, 'comprobante que no subió el usuario → 400', await alta({ type: 'gasto', category: 'combustible', description: 'x', amount: 10, attachmentUrl: 'https://evil.example.com/a.jpg' }), 400)
  const obraAjena = await db.project.findFirst({ where: { pro: { userId: { not: P.id } } }, select: { id: true } })
  if (obraAjena) st(F, 'IDOR: asignar a una obra ajena → 400', await alta({ type: 'costo_directo', category: 'ayudantes', description: 'x', amount: 10, projectId: obraAjena.id }), 400)
  const obraPropia = S.project1 || (await db.project.findFirst({ where: { pro: { userId: P.id } }, select: { id: true } }))?.id
  if (obraPropia) {
    const antes = (await resumen(P, 'profesional', 'mes')).reporte.obras.find((o) => o.id === obraPropia)
    const co = await alta({ type: 'costo_directo', category: 'ayudantes', description: `${MARK} ayudante`, amount: 15000, projectId: obraPropia })
    st(F, 'costo asignado a una obra propia', co, 201)
    const ob = (await resumen(P, 'profesional', 'mes')).reporte.obras.find((o) => o.id === obraPropia)
    // la obra puede tener otros costos (p. ej. reintegros de sobrantes que los bajan): se compara el antes y el después
    if (antes && ob) check(F, 'rentabilidad por obra: el costo asignado suma 15.000 a esa obra', near(ob.costos - antes.costos, 15000), `${JSON.stringify(antes)} → ${JSON.stringify(ob)}`)
  }

  // IDOR sobre movimientos
  st(F, 'IDOR: otro profesional no edita el movimiento', await patch(P2, `/api/finanzas/movimientos/${S.finGasto}`, { amount: 1 }), 404)
  st(F, 'IDOR: otro profesional no lo borra', await del(P2, `/api/finanzas/movimientos/${S.finGasto}`), 404)
  st(F, 'IDOR: el proveedor tampoco', await patch(V, `/api/finanzas/movimientos/${S.finGasto}`, { amount: 1 }), 404)
  const listaP2 = await get(P2, '/api/finanzas/movimientos?role=profesional')
  check(F, 'IDOR: la lista de otro no trae mis movimientos', listaP2.status === 200 && !(listaP2.data?.movimientos || []).some((m) => m.id === S.finGasto), brief(listaP2))
  const resP2 = await resumen(P2, 'profesional', 'mes')
  check(F, 'IDOR: el resumen de otro no suma mis gastos', !resP2.movimientos.some((m) => m.entryId === S.finGasto))

  // config: saldo inicial y asignar compras
  const b4 = await resumen(P, 'profesional', 'mes')
  const cfg = await put(P, '/api/finanzas/config', { role: 'profesional', saldoInicial: 200000, fechaSaldoInicial: hoyAR })
  st(F, 'cargar saldo inicial', cfg, 200)
  const b5 = await resumen(P, 'profesional', 'mes')
  check(F, 'saldo inicial al cierre de hoy: la caja de hoy es ese saldo', near(b5.reporte.caja.saldoFinal, 200000), `caja ${b5.reporte.caja.saldoFinal}`)
  check(F, 'caja: inicio + entró − salió = final', near(b5.reporte.caja.saldoInicialPeriodo + b5.reporte.caja.entradas - b5.reporte.caja.salidas, b5.reporte.caja.saldoFinal))
  check(F, 'sin saldo inicial la recomendación lo pedía; con saldo ya no', b4.reporte.recomendaciones.some((x) => x.id === 'saldo_inicial') && !b5.reporte.recomendaciones.some((x) => x.id === 'saldo_inicial'))
  st(F, 'saldo inicial con fecha futura → 400', await put(P, '/api/finanzas/config', { role: 'profesional', saldoInicial: 1, fechaSaldoInicial: '2099-01-01' }), 400)
  const chAjeno = await db.providerCharge.findFirst({ where: { clientId: { not: P.id } }, select: { id: true } })
  if (chAjeno) st(F, 'IDOR: no asigna una compra ajena', await put(P, '/api/finanzas/config', { role: 'profesional', asignar: { chargeId: chAjeno.id, destino: 'personal' } }), 404)
  if (comprasP[0] && obraAjena) st(F, 'IDOR: no asigna su compra a una obra ajena', await put(P, '/api/finanzas/config', { role: 'profesional', asignar: { chargeId: comprasP[0].id, destino: obraAjena.id } }), 403)
  if (comprasP[0]) {
    st(F, 'marcar una compra "no es del negocio"', await put(P, '/api/finanzas/config', { role: 'profesional', asignar: { chargeId: comprasP[0].id, destino: 'personal' } }), 200)
    const rp2 = await resumen(P, 'profesional', '12m')
    check(F, 'compra personal: deja de ser costo', near(rp.reporte.resultados.comprasHomia - rp2.reporte.resultados.comprasHomia, comprasP[0].amount))
  }

  // baja lógica
  st(F, 'borrar un movimiento', await del(P, `/api/finanzas/movimientos/${S.finGasto}`), 200)
  const b6 = await resumen(P, 'profesional', 'mes')
  check(F, 'baja: deja de contarse', near(b5.reporte.resultados.gastos - b6.reporte.resultados.gastos, 30000))
  const rowDel = await db.financeEntry.findUnique({ where: { id: S.finGasto } })
  check(F, 'baja lógica: la fila queda con deletedAt', !!rowDel?.deletedAt)
  st(F, 'borrado: ya no se puede editar', await patch(P, `/api/finanzas/movimientos/${S.finGasto}`, { amount: 1 }), 404)

  // proveedor: compra de mercadería va al stock (caja sí, resultado no)
  const pv0 = await resumen(V, 'proveedor', 'mes')
  st(F, 'proveedor: compra de mercadería', await post(V, '/api/finanzas/movimientos', { role: 'proveedor', type: 'compra_mercaderia', category: 'mercaderia', description: `${MARK} cemento`, amount: 450000, date: hoyAR }), 201)
  const pv1 = await resumen(V, 'proveedor', 'mes')
  check(F, 'compra de mercadería: no baja el resultado', near(pv1.reporte.resultados.resultadoNeto, pv0.reporte.resultados.resultadoNeto))
  check(F, 'compra de mercadería: baja la caja', near(pv1.reporte.caja.salidas - pv0.reporte.caja.salidas, 450000))
  st(F, 'proveedor no asigna obras', await post(V, '/api/finanzas/movimientos', { role: 'proveedor', type: 'gasto', category: 'alquiler', description: 'x', amount: 1, date: hoyAR, projectId: obraPropia || 'x' }), 400)
  check(F, 'proveedor: sugerencia de suscripción solo con plan de pago', (pv1.sugerenciaSuscripcion === null) === !['basic', 'pro'].includes((await db.providerProfile.findUnique({ where: { userId: V.id } })).subscription))

  // CSV
  const csv = await get(P, '/api/finanzas/export.csv?role=profesional&periodo=mes', { raw: true })
  const txt = csv.buf ? csv.buf.toString('utf8') : ''
  check(F, 'CSV: 200 y text/csv', csv.status === 200 && (csv.ct || '').includes('text/csv'), brief(csv))
  check(F, 'CSV: con BOM y separador ";" (Excel en español)', !!csv.buf && csv.buf[0] === 0xef && csv.buf[1] === 0xbb && csv.buf[2] === 0xbf && txt.includes('Resultado neto;'))
  const fmtAR = (n) => { const [e, d] = Math.abs(n).toFixed(2).split('.'); return `${n < 0 ? '-' : ''}${e.replace(/\B(?=(\d{3})+(?!\d))/g, '.')},${d}` }
  check(F, 'CSV: montos en formato argentino y coinciden con el resumen', txt.includes(`Resultado neto;${fmtAR(b6.reporte.resultados.resultadoNeto)}`), txt.split('\r\n').find((l) => l.startsWith('Resultado neto')))
  check(F, 'CSV: trae los movimientos cargados', txt.includes(`${MARK} arreglo vecino`))
  st(F, 'CSV de otro rol → 403', await get(P, '/api/finanzas/export.csv?role=proveedor'), 403)
}

// ═══════════════ B (final). PRUEBA VENCIDA DEL PROVEEDOR ═══════════════
// Se corre al final: deja al proveedor E2E sin plan y verifica que no opere ni aparezca.
async function flowTrialVencido() {
  const F = 'B'
  const pend = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 1, type: 'reserva', note: `${MARK} antes del vencimiento` })
  const retPend = await post(C, '/api/returns', { purchaseId: S.purchaseA, items: [{ purchaseId: S.purchaseA, elementId: S.E1.id, condition: 'sin_abrir', photoUrl: (await upload(C, 'sobrantes', 41)).data?.url, qty: 1 }] })
  await db.providerProfile.update({ where: { id: V.provId }, data: { trialEndsAt: new Date(Date.now() - 86400000) } })
  const plan = await get(V, '/api/provider/plan')
  check(F, 'prueba vencida → plan inactivo', plan.data?.plan?.activo === false && plan.data?.plan?.plan === 'trial', brief(plan))
  const s1 = await post(V, '/api/provider/stock', { elementId: S.E4.id, price: 10, quantity: 1 })
  check(F, 'vencido: no carga stock (403 needsPlan)', s1.status === 403 && s1.data?.needsPlan === true, brief(s1))
  const s2 = await patch(V, '/api/provider/stock', { id: S.stock1, price: 1 })
  check(F, 'vencido: no edita stock', s2.status === 403 && s2.data?.needsPlan === true, brief(s2))
  st(F, 'vencido: no recibe pedidos nuevos', await post(C, '/api/purchases', { stockId: S.stock1, quantity: 1 }), 409)
  const ap = await patch(V, `/api/purchases/${pend.data?.purchase?.id}`, { action: 'aprobar' })
  check(F, 'vencido: no aprueba reservas', ap.status === 403 && ap.data?.needsPlan === true, brief(ap))
  const offerOf = (r, stockId) => (r.data?.results || []).some((e) => (e.offers || []).some((o) => o.stockId === stockId))
  check(F, 'vencido: desaparece del marketplace', !offerOf(await get(C, '/api/marketplace?q=caño'), S.stock1))
  check(F, 'vencido: desaparece del buscador', !JSON.stringify((await get(P, '/api/search?mode=profesional&q=caño')).data).includes(S.stock1))
  check(F, 'vencido: desaparece de los pines', !JSON.stringify((await get(P, `/api/search/pins?mode=profesional&q=caño&lat=${CABA.lat}&lng=${CABA.lng}`)).data).includes(S.stock1))
  check(F, 'vencido: desaparece del directorio', !JSON.stringify((await get(C, '/api/directory?kind=proveedor')).data).includes(V.provId))
  check(F, 'vencido: desaparece de los comparables', !JSON.stringify((await get(C, `/api/comparables?elementId=${S.E1.id}`)).data).includes(S.stock1))
  const cmp = await get(C, '/api/comparables?q=cano')
  check(F, 'comparables: búsqueda difusa "cano" (sin ñ) encuentra caños', (cmp.data?.results || []).length > 0, brief(cmp), 'src/app/api/comparables/route.ts:33')
  st(F, 'vencido: no emite cobros', await post(V, '/api/provider/charges', { projectId: S.project2 }), 403)
  const rj = await patch(V, `/api/returns/${retPend.data?.return?.id}`, { action: 'rechazar', note: `${MARK} prueba vencida` })
  check(F, 'vencido: igual responde devoluciones (obligación con clientes)', rj.status === 200, brief(rj))
  check(F, 'vencido: igual ve sus ventas', (await get(V, '/api/purchases?as=proveedor')).status === 200)
}

// ═════════════════════════ T. MÉTRICAS DE USO Y PANEL DEL ADMINISTRADOR (D27) ═════════════════════════
// Recolección (/api/analytics/collect): lote válido, inválido, demasiado grande, tope 429, el usuario sale
// de la cookie y nunca del cuerpo, vinculación anónimo → usuario al ingresar, eventos de servidor (login
// ok/fallido, logout, PDF) sin datos tipeados; panel /api/admin/metricas: 401/404/200, cifras de negocio
// que coinciden con la base, búsquedas sin resultado, CSV, fichas por usuario y por activo.
// Todos los navegadores de prueba usan anonId con prefijo `e2e-` (la purga los borra).
// Área /admin (D29): ingresa con ADMIN_EMAIL + ADMIN_PASSWORD del .env (el mismo que lee el server; nunca se imprimen).
const T_ANON = (s) => `e2e-${EMAIL_PREFIX.replace(/[^a-z0-9]/gi, '')}${s}${TS}`.slice(0, 64)
const tEv = (over = {}) => ({ type: 'click', name: 'Publicar trabajo', path: '/panel/cliente/publicar', props: { tag: 'button' }, at: Date.now(), ...over })
const tLote = (anonId, events, extra = {}) => ({ anonId, sessionId: `${anonId}s`.slice(0, 64), sesion: { startedAt: Date.now() - 60_000, entryPath: '/', referrer: 'google.com', utm: { utm_source: 'e2e' }, device: 'compu · Chrome · Windows', screen: '1280x800' }, events, ...extra })
const tSleep = (ms) => new Promise((r) => setTimeout(r, ms))
/** Ingreso al área /admin (D29) con las credenciales del .env (nunca se imprimen). true si quedó la cookie. */
async function loginAdmin(actor) {
  if (!process.env.ADMIN_EMAIL || !process.env.ADMIN_PASSWORD) return false
  const r = await http(actor, 'POST', '/api/admin/login', { json: { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD } })
  return r.status === 200 && !!actor.adminCookie
}
async function flowT() {
  const F = 'T'
  const collect = (a, body, o = {}) => http(a, 'POST', '/api/analytics/collect', { json: body, ...o })

  // ── recolección como visitante ──
  const a1 = T_ANON('a')
  const unico = `e2emet${TS}sinresultado`
  const r1 = await collect(ANON, tLote(a1, [
    tEv({ type: 'page_view', name: '/', path: '/' }),
    tEv(),
    tEv({ type: 'search', name: unico, path: '/materiales', props: { pantalla: 'materiales', resultados: 0 } }),
    tEv({ type: 'heartbeat', name: 'latido', props: { ms: 30_000 } }),
    tEv({ type: 'heartbeat', name: 'latido', props: { ms: 3_600_000 } }), // latido trucho: tope 35 s
  ]))
  st(F, 'collect: lote válido de visitante', r1, 204)
  const evA1 = await db.analyticsEvent.findMany({ where: { anonId: a1 } })
  check(F, 'collect: guarda 3 eventos (los latidos no son filas)', evA1.length === 3, `n=${evA1.length}`)
  check(F, 'collect: visitante sin userId', evA1.every((e) => e.userId === null))
  const sesA1 = await db.analyticsSession.findUnique({ where: { id: `${a1}s`.slice(0, 64) } })
  check(F, 'collect: sesión con tiempo activo = 30 s + tope 35 s', sesA1?.activeMs === 65_000, JSON.stringify(sesA1))
  check(F, 'collect: sesión cuenta 1 pantalla y 3 eventos', sesA1?.pageViews === 1 && sesA1?.events === 3)
  const r1b = await collect(ANON, tLote(a1, [tEv({ type: 'heartbeat', name: 'latido', props: { ms: 20_000 } })]))
  st(F, 'collect: lote solo con latido', r1b, 204)
  const sesA1b = await db.analyticsSession.findUnique({ where: { id: `${a1}s`.slice(0, 64) } })
  check(F, 'collect: el latido suma a la misma sesión', sesA1b?.activeMs === 85_000, `activeMs=${sesA1b?.activeMs}`)

  // ── inválidos ──
  st(F, 'collect: JSON roto', await http(ANON, 'POST', '/api/analytics/collect', { form: '{no es json', headers: { 'content-type': 'application/json' } }), 400)
  st(F, 'collect: sin eventos', await collect(ANON, tLote(T_ANON('b'), [])), 400)
  st(F, 'collect: más de 50 eventos', await collect(ANON, tLote(T_ANON('b'), Array.from({ length: 51 }, () => tEv()))), 400)
  st(F, 'collect: tipo "server" no se acepta del navegador', await collect(ANON, tLote(T_ANON('b'), [tEv({ type: 'server' })])), 400)
  st(F, 'collect: userId en el cuerpo → rechazado', await collect(ANON, tLote(T_ANON('b'), [tEv()], { userId: C.id })), 400)
  st(F, 'collect: userId dentro de un evento → rechazado', await collect(ANON, tLote(T_ANON('b'), [tEv({ userId: C.id })])), 400)
  st(F, 'collect: props con texto largo → rechazado', await collect(ANON, tLote(T_ANON('b'), [tEv({ props: { texto: 'x'.repeat(500) } })])), 400)
  const grande = JSON.stringify(tLote(T_ANON('b'), [tEv({ name: 'x'.repeat(70) })])).replace('"events"', `"relleno":"${'y'.repeat(60_000)}","events"`)
  st(F, 'collect: lote de más de 48 KB', await http(ANON, 'POST', '/api/analytics/collect', { form: grande, headers: { 'content-type': 'application/json' } }), 413)
  check(F, 'los lotes inválidos no guardan nada', (await db.analyticsEvent.count({ where: { anonId: T_ANON('b') } })) === 0)

  // ── tope por navegador (30 lotes/min) → 429 silencioso ──
  const aR = T_ANON('r')
  const estados = []
  for (let i = 0; i < 32; i++) estados.push((await collect(ANON, tLote(aR, [tEv()]))).status)
  check(F, 'collect: tope por navegador → 429', estados.filter((s) => s === 204).length === 30 && estados.slice(30).every((s) => s === 429), estados.join(','))

  // ── el usuario sale de la cookie ──
  const aC = T_ANON('c')
  st(F, 'collect: lote con sesión de cliente', await collect(C, tLote(aC, [tEv({ path: '/panel/cliente', role: 'cliente' })])), 204)
  const evC = await db.analyticsEvent.findMany({ where: { anonId: aC } })
  check(F, 'collect: el userId sale de la cookie', evC.length === 1 && evC[0].userId === C.id, JSON.stringify(evC.map((e) => e.userId)))

  // ── vinculación anónimo → usuario al ingresar + eventos de servidor ──
  const aL = T_ANON('l')
  const TL = new Actor('tl', 'cliente')
  TL.email = C.email
  st(F, 'collect: navegación anónima antes de ingresar', await collect(ANON, tLote(aL, [tEv({ type: 'page_view', name: '/ingresar', path: '/ingresar' })])), 204)
  const ck = { cookie: `homia_anon_id=${aL}.${`${aL}s`.slice(0, 64)}` }
  st(F, 'login fallido (contraseña mal) con cookie de analítica', await post(TL, '/api/auth/login', { email: C.email, password: 'Incorrecta999' }, { headers: ck }), 401)
  const aX = T_ANON('x')
  const mailFalso = `${EMAIL_PREFIX}noexiste-${TS}${EMAIL_DOMAIN}`
  st(F, 'login fallido (email que no existe)', await post(ANON, '/api/auth/login', { email: mailFalso, password: 'Incorrecta999' }, { headers: { cookie: `homia_anon_id=${aX}.${aX}s` } }), 401)
  st(F, 'login ok con cookie de analítica', await post(TL, '/api/auth/login', { email: C.email, password: PASSWORD }, { headers: ck }), 200)
  await tSleep(2500) // los eventos de servidor se escriben con after(), después de responder
  const evL = await db.analyticsEvent.findMany({ where: { anonId: aL }, orderBy: { createdAt: 'asc' } })
  const fall = evL.find((e) => e.name === 'login_fallido')
  const okL = evL.find((e) => e.name === 'login_ok')
  check(F, 'evento login_fallido registrado (existe=true)', fall?.type === 'server' && fall?.props?.existe === true, JSON.stringify(fall))
  check(F, 'login_fallido sin email ni contraseña', !!fall && !JSON.stringify(fall).includes('Incorrecta999') && !JSON.stringify(fall).toLowerCase().includes(C.email.toLowerCase()))
  check(F, 'login_fallido guarda solo la huella de la IP', typeof fall?.props?.ipHash === 'string' && !JSON.stringify(fall).includes(RUN_IP))
  check(F, 'evento login_ok con el usuario', okL?.userId === C.id, JSON.stringify(okL))
  check(F, 'vinculación: la navegación anónima previa quedó del usuario', evL.filter((e) => e.type !== 'server').every((e) => e.userId === C.id) && evL.length >= 3, JSON.stringify(evL.map((e) => [e.name, e.userId])))
  const sesL = await db.analyticsSession.findUnique({ where: { id: `${aL}s`.slice(0, 64) } })
  check(F, 'vinculación: la sesión anónima quedó del usuario', sesL?.userId === C.id, JSON.stringify(sesL))
  const evX = await db.analyticsEvent.findFirst({ where: { anonId: aX } })
  check(F, 'login_fallido con email inexistente: existe=false, sin el email', evX?.props?.existe === false && !JSON.stringify(evX).includes(mailFalso), JSON.stringify(evX))
  TL.cookie = `${TL.cookie}; homia_anon_id=${aL}.${`${aL}s`.slice(0, 64)}`
  if (S.inv1) {
    const pdf = await http(C, 'GET', `/api/invoices/${S.inv1}/pdf`, { raw: true, headers: { cookie: `${C.cookie}; homia_anon_id=${aC}.${aC}s` } })
    st(F, 'PDF de factura', pdf, 200)
  }
  st(F, 'logout', await post(TL, '/api/auth/logout', {}), 200)
  await tSleep(2500)
  check(F, 'evento logout registrado', (await db.analyticsEvent.count({ where: { anonId: aL, name: 'logout', userId: C.id } })) === 1)
  if (S.inv1) check(F, 'evento factura_pdf con el activo', (await db.analyticsEvent.count({ where: { name: 'factura_pdf', entityType: 'invoice', entityId: S.inv1, userId: C.id } })) >= 1)

  // ── panel del administrador ──
  // D29: el admin entra a /admin con ADMIN_EMAIL + ADMIN_PASSWORD (del .env), sin cuenta de usuario.
  // Las credenciales se leen de process.env y NUNCA se imprimen.
  for (const [u, nombre] of [['/api/admin/metricas', 'métricas'], [`/api/admin/metricas/usuario?id=${C.id}`, 'ficha de usuario'], ['/api/admin/metricas/activo?tipo=project&id=x123', 'ficha de activo'], ['/api/admin/feedback', 'bandeja de sugerencias']]) {
    st(F, `${nombre} sin sesión de admin → 404`, await get(ANON, u), 404)
    st(F, `${nombre} con sesión de usuario común → 404`, await get(C, u), 404)
  }
  st(F, 'PATCH de sugerencias sin sesión de admin → 404', await patch(C, '/api/admin/feedback/x123', { status: 'resuelta' }), 404)
  const est0 = await get(ANON, '/api/admin/login')
  check(F, 'GET /api/admin/login sin cookie → admin=false', est0.status === 200 && est0.data?.admin === false, brief(est0))
  const credOk = !!(process.env.ADMIN_EMAIL && process.env.ADMIN_PASSWORD)
  if (!check(F, 'ADMIN_EMAIL y ADMIN_PASSWORD cargadas en el .env', credOk, 'faltan en el .env')) return
  const tMal = new Date()
  const malo = new Actor('adminmal', null)
  malo.ip = `10.248.${(TS >> 8) & 255}.${TS & 255}`
  const rMal = await post(malo, '/api/admin/login', { email: process.env.ADMIN_EMAIL, password: `${PASSWORD}-no-es` })
  st(F, 'ingreso admin con contraseña incorrecta', rMal, 401)
  check(F, 'mensaje genérico (no dice qué falló)', rMal.data?.error === 'Email o contraseña incorrectos', brief(rMal))
  check(F, 'sin cookie de admin al fallar', !malo.adminCookie)
  st(F, 'ingreso admin con email incorrecto', await post(malo, '/api/admin/login', { email: `${EMAIL_PREFIX}noadmin${EMAIL_DOMAIN}`, password: process.env.ADMIN_PASSWORD }), 401)
  st(F, 'ingreso admin vacío (zod)', await post(malo, '/api/admin/login', {}), 400)
  for (let i = 0; i < 3; i++) await post(malo, '/api/admin/login', { email: 'x@y.z', password: 'nop' })
  const r429 = await post(malo, '/api/admin/login', { email: process.env.ADMIN_EMAIL, password: process.env.ADMIN_PASSWORD })
  st(F, 'ingreso admin: 5 fallos por IP → 429 (aunque después acierte)', r429, 429)
  check(F, 'el 429 no abre sesión', !malo.adminCookie)
  const TA = new Actor('tadmin', null)
  TA.ip = `10.247.${(TS >> 8) & 255}.${TS & 255}`
  check(F, 'ingreso admin correcto', await loginAdmin(TA))
  const sc = TA.adminSetCookie || ''
  check(F, 'cookie homia_admin httpOnly, SameSite=Strict, path=/ y 12 h', /HttpOnly/i.test(sc) && /SameSite=Strict/i.test(sc) && /Path=\//i.test(sc) && /Max-Age=43200/i.test(sc), sc.replace(/homia_admin=[^;]+/, 'homia_admin=…'))
  const est1 = await get(TA, '/api/admin/login')
  check(F, 'GET /api/admin/login con cookie → admin=true', est1.data?.admin === true, brief(est1))
  // la cookie de sesión de un usuario puesta como cookie de admin no sirve
  const falsa = new Actor('adminfalsa', null)
  falsa.adminCookie = `homia_admin=${(C.cookie.match(/homy_session=([^;]+)/) || [])[1] || 'x'}`
  st(F, 'el JWT de un usuario no sirve como sesión de admin', await get(falsa, '/api/admin/metricas'), 404)
  st(F, 'bandeja de sugerencias con sesión de admin', await get(TA, '/api/admin/feedback'), 200)
  await tSleep(2500)
  const evAdm = await db.analyticsEvent.findMany({ where: { name: { in: ['admin_login_ok', 'admin_login_fallido'] }, createdAt: { gte: tMal } } })
  check(F, 'eventos admin_login_ok y admin_login_fallido registrados', evAdm.some((e) => e.name === 'admin_login_ok') && evAdm.some((e) => e.name === 'admin_login_fallido'), `n=${evAdm.length}`)
  check(F, 'los eventos de admin no guardan email ni contraseña', !evAdm.some((e) => JSON.stringify(e).includes(process.env.ADMIN_PASSWORD) || JSON.stringify(e).toLowerCase().includes(process.env.ADMIN_EMAIL.trim().toLowerCase()) || JSON.stringify(e).includes('-no-es')))
  // salir y volver a entrar
  st(F, 'salir de administración', await post(TA, '/api/admin/logout', {}), 200)
  check(F, 'al salir se borra la cookie de admin', !TA.adminCookie)
  st(F, 'después de salir, métricas → 404', await get(TA, '/api/admin/metricas'), 404)
  check(F, 'volver a entrar', await loginAdmin(TA))
  const us = await get(TA, '/api/admin/metricas?seccion=usuarios&periodo=hoy&prueba=incluir')
  st(F, 'métricas con sesión de admin', us, 200)
  const meC = await get(C, '/api/auth/me')
  check(F, '/me no expone nada de administración', !/isAdmin|ADMIN_EMAIL|admin/i.test(JSON.stringify(meC.data?.user ? Object.keys(meC.data.user) : [])), brief(meC))
  const val = (r, k) => r.data?.resumen?.find((x) => x.clave === k)?.valor
  const totalDb = await db.user.count({ where: { deletedAt: null } })
  check(F, 'usuarios: total = base (incluyendo prueba)', Math.abs(val(us, 'total') - totalDb) <= 1, `panel=${val(us, 'total')} base=${totalDb}`)
  const us2 = await get(TA, '/api/admin/metricas?seccion=usuarios&periodo=hoy')
  const totalReal = await db.user.count({ where: { deletedAt: null, NOT: { email: { endsWith: '@homia.test' } } } })
  check(F, 'usuarios: excluir prueba saca las @homia.test', val(us2, 'total') === totalReal, `panel=${val(us2, 'total')} base=${totalReal}`)
  check(F, 'usuarios: cuenta el login de hoy', val(us, 'logins') >= 1 && val(us, 'usuarios_login') >= 1)

  for (const sec of ['uso', 'embudos', 'retencion', 'negocio']) {
    const t0 = Date.now()
    const r = await get(TA, `/api/admin/metricas?seccion=${sec}&periodo=30&prueba=incluir`)
    st(F, `sección ${sec}`, r, 200)
    check(F, `sección ${sec} en menos de 5 s`, Date.now() - t0 < 5000, `${Date.now() - t0} ms (servidor ${r.data?.ms} ms)`)
  }
  const uso = await get(TA, '/api/admin/metricas?seccion=uso&periodo=hoy&prueba=incluir')
  check(F, 'uso: la búsqueda sin resultado aparece como oportunidad', (uso.data?.tablas?.sin_resultado?.filas || []).some((f) => f[0] === unico), JSON.stringify(uso.data?.tablas?.sin_resultado?.filas?.slice(0, 3)))
  const usoSin = await get(TA, '/api/admin/metricas?seccion=uso&periodo=hoy')
  check(F, 'uso: excluir prueba saca los navegadores e2e-', !(usoSin.data?.tablas?.sin_resultado?.filas || []).some((f) => f[0] === unico))
  const csv = await http(TA, 'GET', '/api/admin/metricas?seccion=uso&periodo=hoy&prueba=incluir&csv=sin_resultado')
  check(F, 'CSV: text/csv con el término', csv.status === 200 && /text\/csv/.test(csv.ct) && String(csv.data).includes(unico), `${csv.status} ${csv.ct}`)
  st(F, 'CSV de una tabla inexistente', await get(TA, '/api/admin/metricas?seccion=uso&csv=noexiste'), 404)
  st(F, 'sección inválida', await get(TA, '/api/admin/metricas?seccion=hack'), 400)

  // negocio: las cifras coinciden con la base (mismo período que devolvió el panel)
  const ng = await get(TA, '/api/admin/metricas?seccion=negocio&periodo=hoy&prueba=incluir')
  const d = new Date(ng.data?.periodo?.desde), h = new Date(ng.data?.periodo?.hasta)
  const rango = { gte: d, lt: h }
  const sum = (arr, k) => Math.round(arr.reduce((a, x) => a + (x[k] || 0), 0) * 100) / 100
  const [proyDb, invPag, chPag, purSin, resDb, msgDb] = await Promise.all([
    db.project.count({ where: { createdAt: rango } }),
    db.invoice.findMany({ where: { status: 'pagada', paidAt: rango }, select: { total: true, serviceFee: true, paymentMethod: true } }),
    db.providerCharge.findMany({ where: { status: 'pagada', paidAt: rango }, select: { amount: true, serviceFee: true, method: true } }),
    db.purchase.findMany({ where: { chargeId: null, status: { in: ['pagado', 'entregado'] }, updatedAt: rango }, select: { total: true, serviceFee: true, paymentMethod: true } }),
    db.review.count({ where: { createdAt: rango } }),
    db.message.count({ where: { createdAt: rango } }),
  ])
  const cargoDb = Math.round((sum(invPag.filter((i) => i.paymentMethod === 'mercadopago'), 'serviceFee') + sum(chPag.filter((c) => c.method === 'mercadopago'), 'serviceFee') + sum(purSin.filter((p) => p.paymentMethod === 'mercadopago'), 'serviceFee')) * 100) / 100
  check(F, 'negocio: proyectos = base', val(ng, 'proyectos') === proyDb, `panel=${val(ng, 'proyectos')} base=${proyDb}`)
  check(F, 'negocio: cobrado en facturas = base', Math.abs(val(ng, 'cobrado_facturas') - sum(invPag, 'total')) < 0.01, `panel=${val(ng, 'cobrado_facturas')} base=${sum(invPag, 'total')}`)
  check(F, 'negocio: GMV de materiales = base', Math.abs(val(ng, 'gmv') - (sum(chPag, 'amount') + sum(purSin, 'total'))) < 0.01, `panel=${val(ng, 'gmv')}`)
  check(F, 'negocio: cargo 1% recaudado = base', Math.abs(val(ng, 'cargo') - cargoDb) < 0.01, `panel=${val(ng, 'cargo')} base=${cargoDb}`)
  check(F, 'negocio: reseñas y mensajes = base', val(ng, 'resenas') === resDb && val(ng, 'mensajes') === msgDb, `reseñas ${val(ng, 'resenas')}/${resDb} mensajes ${val(ng, 'mensajes')}/${msgDb}`)
  const rg = await get(TA, '/api/admin/metricas?seccion=usuarios&periodo=rango&desde=2026-09-01&hasta=2026-09-30&prueba=incluir')
  st(F, 'período por rango', rg, 200)

  // fichas
  const bus = await get(TA, `/api/admin/metricas/usuario?q=${encodeURIComponent(C.email)}`)
  check(F, 'ficha: buscar usuario por email', (bus.data?.usuarios || []).some((u) => u.id === C.id), brief(bus))
  st(F, 'ficha: búsqueda muy corta', await get(TA, '/api/admin/metricas/usuario?q=a'), 400)
  const fu = await get(TA, `/api/admin/metricas/usuario?id=${C.id}`)
  st(F, 'ficha de usuario', fu, 200)
  check(F, 'ficha: línea con el login y hechos de negocio', (fu.data?.linea || []).some((l) => l.detalle === 'login_ok') && (fu.data?.linea || []).some((l) => l.fuente === 'negocio'))
  check(F, 'ficha: sesiones con tiempo de uso', (fu.data?.sesiones || []).length >= 1)
  check(F, 'ficha: nunca el texto de los mensajes', !(fu.data?.linea || []).some((l) => l.tipo === 'mensaje enviado' && l.detalle !== 'conversación'))
  const fcsv = await http(TA, 'GET', `/api/admin/metricas/usuario?id=${C.id}&csv=linea`)
  check(F, 'ficha: CSV de la línea de tiempo', fcsv.status === 200 && /text\/csv/.test(fcsv.ct))
  st(F, 'ficha de usuario inexistente', await get(TA, '/api/admin/metricas/usuario?id=noexiste123'), 404)
  if (S.project1) {
    const fa = await get(TA, `/api/admin/metricas/activo?tipo=project&id=${S.project1}`)
    st(F, 'ficha de activo (proyecto)', fa, 200)
    check(F, 'ficha de activo: quién hizo qué', (fa.data?.linea || []).length >= 1 && /Proyecto/.test(fa.data?.titulo || ''), brief(fa))
  }
  st(F, 'ficha de activo con tipo inválido', await get(TA, '/api/admin/metricas/activo?tipo=hack&id=x'), 400)
}

// ═════════════════════════════ PURGA ═════════════════════════════
// ═════════════════════════════ S. SUGERENCIAS (D25) ═════════════════════════════
// Los tres roles mandan sugerencias (con y sin fotos al bucket PRIVADO feedback-evidencias),
// validaciones, 401, IDOR, tope diario (429) y la bandeja del administrador.
// El administrador entra a /admin con ADMIN_EMAIL + ADMIN_PASSWORD del .env (D29, sin cuenta de
// usuario). Para ver el mail al equipo sin ensuciar la casilla real, el server corre con
// FEEDBACK_EMAIL=<E2E_FEEDBACK_EMAIL> (@homia.test) + --mail-sink.
const S_TEAM_EMAIL = process.env.E2E_FEEDBACK_EMAIL || `${EMAIL_PREFIX}equipo${EMAIL_DOMAIN}`
const SA = new Actor('admin', null)
async function flowS() {
  const F = 'S'
  const t0 = Date.now()
  const sb = (process.env.SUPABASE_PROJECT_URL || '').replace(/\/+$/, '')
  const base = { type: 'sugerencia', area: 'directorio', title: `${MARK} Filtro por barrio`, description: `${MARK} Estaría bueno poder filtrar el directorio por barrio.` }

  // 401 sin sesión
  st(F, 'GET /api/feedback sin sesión', await get(ANON, '/api/feedback'), 401)
  st(F, 'POST /api/feedback sin sesión', await post(ANON, '/api/feedback', { ...base, role: 'cliente' }), 401)
  st(F, 'GET /api/feedback/[id] sin sesión', await get(ANON, '/api/feedback/abc123'), 401)
  // D29: las APIs de administración sin la sesión de /admin responden 404 (no se revela que existen)
  st(F, 'GET /api/admin/feedback sin sesión de admin', await get(ANON, '/api/admin/feedback'), 404)
  st(F, 'PATCH /api/admin/feedback/[id] sin sesión de admin', await patch(ANON, '/api/admin/feedback/abc123', { status: 'resuelta' }), 404)

  // fotos al bucket privado
  const up1 = await upload(C, 'sugerencias', 11)
  const png = await sharp({ create: { width: 40, height: 30, channels: 3, background: { r: 9, g: 99, b: 199 } } }).png().toBuffer()
  const up2 = await upload(C, 'sugerencias', 12, { buffer: png, type: 'image/png', name: 'e2e.png' })
  st(F, 'subida de evidencia (jpg)', up1, 201)
  st(F, 'subida de evidencia (png)', up2, 201)
  const pref = `feedback-evidencias/${C.id}/sugerencias/`
  check(F, 'la evidencia devuelve un path privado propio (no URL pública)', up1.data?.private === true && up1.data?.url?.startsWith(pref) && !/^https?:/.test(up1.data.url), brief(up1))
  const objPath = up1.data?.url?.slice('feedback-evidencias/'.length)
  if (sb && objPath) {
    const pub = await fetch(`${sb}/storage/v1/object/public/feedback-evidencias/${objPath}`)
    check(F, 'la foto NO es accesible por URL pública', pub.status !== 200, `HTTP ${pub.status}`)
    const sinFirma = await fetch(`${sb}/storage/v1/object/feedback-evidencias/${objPath}`)
    check(F, 'la foto NO es accesible sin firma ni credenciales', sinFirma.status !== 200, `HTTP ${sinFirma.status}`)
  }
  const bad = await upload(C, 'sugerencias', 1, { buffer: Buffer.from('no soy una imagen'), type: 'image/jpeg', name: 'x.jpg' })
  st(F, 'evidencia que no es imagen (magic bytes)', bad, 400)

  // cliente: con fotos
  const c1 = await post(C, '/api/feedback', { ...base, role: 'cliente', photos: [up1.data?.url, up2.data?.url] })
  st(F, 'cliente manda sugerencia con 2 fotos', c1, 201)
  S.fbC = c1.data?.item?.id
  const rowC = S.fbC ? await db.feedback.findUnique({ where: { id: S.fbC } }) : null
  check(F, 'DB: fila del cliente con 2 paths privados, estado recibida, contacto sí', rowC?.userId === C.id && JSON.parse(rowC.photos).length === 2 && rowC.status === 'recibida' && rowC.contactOk === true && rowC.context === null, JSON.stringify(rowC))
  const firmada = c1.data?.item?.photos?.[0]?.url
  check(F, 'el autor recibe la foto con URL firmada', typeof firmada === 'string' && firmada.includes('/object/sign/feedback-evidencias/'), brief(c1))
  if (firmada) {
    const img = await fetch(firmada)
    check(F, 'la URL firmada abre la imagen', img.status === 200 && (img.headers.get('content-type') || '').startsWith('image/'), `HTTP ${img.status} ${img.headers.get('content-type')}`)
  }
  check(F, 'la respuesta no expone paths internos', !JSON.stringify(c1.data).includes(`"${up1.data?.url}"`), brief(c1))

  // profesional: problema técnico sin fotos, con contexto
  const ctx = { pantalla: '#/panel/profesional/calendario', dispositivo: 'Celular · pantalla 390×844', fecha: '25/9/26 10:00', zonaHoraria: 'America/Argentina/Buenos_Aires' }
  const p1 = await post(P, '/api/feedback', { role: 'profesional', type: 'problema', area: 'calendario', title: `${MARK} No carga el calendario`, description: `${MARK} Toco Calendario y queda la pantalla en blanco.`, context: ctx, contactOk: false }, { headers: { 'user-agent': 'E2E-UA/1.0 (sugerencias)' } })
  st(F, 'profesional manda problema técnico sin fotos', p1, 201)
  S.fbP = p1.data?.item?.id
  const rowP = S.fbP ? await db.feedback.findUnique({ where: { id: S.fbP } }) : null
  const ctxP = rowP?.context ? JSON.parse(rowP.context) : {}
  check(F, 'problema técnico guarda el contexto y el navegador del encabezado real', ctxP.pantalla === ctx.pantalla && ctxP.navegador === 'E2E-UA/1.0 (sugerencias)' && rowP.contactOk === false, JSON.stringify(ctxP))
  const s2 = await post(C, '/api/feedback', { ...base, role: 'cliente', type: 'queja', title: `${MARK} Queja`, context: ctx })
  st(F, 'cliente manda queja', s2, 201)
  const rowQ = s2.data?.item?.id ? await db.feedback.findUnique({ where: { id: s2.data.item.id } }) : null
  check(F, 'el contexto técnico NO se guarda si no es "problema técnico"', rowQ?.context === null, JSON.stringify(rowQ?.context))

  // proveedor
  const v1 = await post(V, '/api/feedback', { role: 'proveedor', type: 'oportunidad', area: 'stock', title: `${MARK} Carga masiva de stock`, description: `${MARK} Me serviría subir el stock desde una planilla.` })
  st(F, 'proveedor manda oportunidad', v1, 201)
  S.fbV = v1.data?.item?.id

  // validaciones
  st(F, 'título corto', await post(C, '/api/feedback', { ...base, role: 'cliente', title: 'ab' }), 400)
  st(F, 'sin descripción', await post(C, '/api/feedback', { ...base, role: 'cliente', description: '' }), 400)
  st(F, 'tipo inválido', await post(C, '/api/feedback', { ...base, role: 'cliente', type: 'spam' }), 400)
  st(F, 'sección que no es del rol (cliente → Stock)', await post(C, '/api/feedback', { ...base, role: 'cliente', area: 'stock' }), 400)
  st(F, 'más de 4 fotos', await post(C, '/api/feedback', { ...base, role: 'cliente', photos: [1, 2, 3, 4, 5].map((n) => `${pref}a${n}b2c3d4e5f6a7b8.jpg`) }), 400)
  st(F, 'foto de OTRO usuario (IDOR)', await post(P2, '/api/feedback', { ...base, role: 'profesional', area: 'directorio', photos: [up1.data?.url] }), 400)
  st(F, 'URL pública en vez de path privado', await post(C, '/api/feedback', { ...base, role: 'cliente', photos: ['https://evil.example.com/a.jpg'] }), 400)
  st(F, 'panel que no es suyo (cliente escribe como proveedor)', await post(C, '/api/feedback', { ...base, role: 'proveedor', area: 'stock' }), 403)

  // mis envíos e IDOR
  const misC = await get(C, '/api/feedback')
  st(F, 'GET mis envíos (cliente)', misC, 200)
  check(F, 'mis envíos: solo los propios, sin bandera de admin', misC.data?.items?.length === 2 && misC.data.items.every((i) => [S.fbC, s2.data?.item?.id].includes(i.id)) && misC.data.isAdmin === false, brief(misC))
  st(F, 'el autor ve su envío', await get(C, `/api/feedback/${S.fbC}`), 200)
  const idor = await get(P2, `/api/feedback/${S.fbC}`)
  st(F, 'otro usuario NO ve el envío (404)', idor, 404)
  check(F, 'IDOR: la respuesta no filtra fotos', !JSON.stringify(idor.data).includes('feedback-evidencias'), brief(idor))
  const misP2 = await get(P2, '/api/feedback')
  check(F, 'otro usuario no ve envíos ajenos en su lista', misP2.status === 200 && misP2.data.items.length === 0, brief(misP2))

  // bandeja: no admin → 404
  st(F, 'bandeja para un no-admin', await get(C, '/api/admin/feedback'), 404)
  st(F, 'PATCH de un no-admin', await patch(C, `/api/admin/feedback/${S.fbC}`, { status: 'resuelta' }), 404)
  check(F, 'el PATCH de un no-admin no cambió nada', (await db.feedback.findUnique({ where: { id: S.fbC } }))?.status === 'recibida')

  // D29: el administrador entra a /admin con ADMIN_EMAIL + ADMIN_PASSWORD (del .env), sin cuenta
  if (!check(F, 'ingreso de administración (ADMIN_EMAIL/ADMIN_PASSWORD en el .env)', await loginAdmin(SA), 'faltan ADMIN_EMAIL/ADMIN_PASSWORD en el .env o el server no las tiene')) return
  const bandeja = await get(SA, '/api/admin/feedback')
  st(F, 'bandeja del admin', bandeja, 200)
  const enBandeja = (bandeja.data?.items || []).find((i) => i.id === S.fbC)
  check(F, 'bandeja: trae el envío con autor, email (acepta contacto) y fotos firmadas', enBandeja?.author?.email === C.email && enBandeja.photos.length === 2 && enBandeja.photos.every((p) => p.url?.includes('/object/sign/')), JSON.stringify(enBandeja)?.slice(0, 300))
  const conP = (bandeja.data?.items || []).find((i) => i.id === S.fbP)
  check(F, 'bandeja: sin email si NO acepta contacto', !!conP && conP.author.email === null && !!conP.author.name, JSON.stringify(conP?.author))
  const fTipo = await get(SA, '/api/admin/feedback?type=problema')
  check(F, 'filtro por tipo', fTipo.data?.items?.some((i) => i.id === S.fbP) && fTipo.data.items.every((i) => i.type === 'problema'), brief(fTipo))
  const fRol = await get(SA, '/api/admin/feedback?role=proveedor')
  check(F, 'filtro por rol', fRol.data?.items?.some((i) => i.id === S.fbV) && fRol.data.items.every((i) => i.role === 'proveedor'), brief(fRol))
  const fArea = await get(SA, '/api/admin/feedback?area=calendario')
  check(F, 'filtro por sección', fArea.data?.items?.some((i) => i.id === S.fbP) && fArea.data.items.every((i) => i.area === 'calendario'), brief(fArea))
  const fQ = await get(SA, `/api/admin/feedback?q=${encodeURIComponent('planilla')}`)
  check(F, 'búsqueda difusa', fQ.data?.items?.some((i) => i.id === S.fbV) && !fQ.data.items.some((i) => i.id === S.fbP), brief(fQ))
  st(F, 'el admin abre un envío ajeno', await get(SA, `/api/feedback/${S.fbC}`), 200)

  // cambio de estado → notificación; respuesta → notificación + mail
  st(F, 'PATCH estado inválido', await patch(SA, `/api/admin/feedback/${S.fbC}`, { status: 'borrada' }), 400)
  st(F, 'PATCH vacío', await patch(SA, `/api/admin/feedback/${S.fbC}`, {}), 400)
  st(F, 'PATCH de un envío inexistente', await patch(SA, '/api/admin/feedback/noexiste123', { status: 'resuelta' }), 404)
  const desde = Date.now()
  st(F, 'admin cambia el estado', await patch(SA, `/api/admin/feedback/${S.fbC}`, { status: 'en_revision' }), 200)
  const nEstado = await db.notification.findFirst({ where: { userId: C.id, type: 'sugerencia_estado' }, orderBy: { createdAt: 'desc' } })
  check(F, 'notificación al autor por el cambio de estado (link válido)', !!nEstado && nEstado.title.includes('En revisión') && !linkProblem(nEstado.link, ['cliente']) && nEstado.link.includes(S.fbC), JSON.stringify(nEstado))
  const resp = `${MARK} ¡Gracias! Lo sumamos a los planes.`
  st(F, 'admin responde y planifica', await patch(SA, `/api/admin/feedback/${S.fbC}`, { status: 'planificada', adminResponse: resp }), 200)
  const nResp = await db.notification.findFirst({ where: { userId: C.id, type: 'sugerencia_respuesta' }, orderBy: { createdAt: 'desc' } })
  check(F, 'notificación al autor con la respuesta', !!nResp && nResp.body.includes('Planificada') && nResp.body.includes('Lo sumamos'), JSON.stringify(nResp))
  const rowR = await db.feedback.findUnique({ where: { id: S.fbC } })
  check(F, 'DB: estado planificada, respuesta y fecha', rowR.status === 'planificada' && rowR.adminResponse === resp && !!rowR.respondedAt, JSON.stringify(rowR))
  const antesN = await db.notification.count({ where: { userId: C.id } })
  const e3 = await patch(SA, `/api/admin/feedback/${S.fbC}`, { status: 'planificada', adminResponse: resp })
  check(F, 'guardar sin cambios no vuelve a avisar', e3.status === 200 && e3.data?.changed === false && (await db.notification.count({ where: { userId: C.id } })) === antesN, brief(e3))
  const misC2 = await get(C, '/api/feedback')
  const visto = misC2.data?.items?.find((i) => i.id === S.fbC)
  check(F, 'el autor ve el estado y la respuesta en Mis envíos', visto?.statusLabel === 'Planificada' && visto?.adminResponse === resp, JSON.stringify(visto)?.slice(0, 300))

  if (MAIL_SINK_PORT) {
    const mEq = await waitMail(S_TEAM_EMAIL, t0, { ms: 10000 })
    check(F, 'mail al equipo por cada envío nuevo (con link a la bandeja)', !!mEq && /sugerencia|queja|problema|oportunidad/i.test(mEq.body.subject) && mEq.body.html.includes('/admin/sugerencias'), mEq ? mEq.body.subject : 'no llegó')
    check(F, 'el mail al equipo no adjunta las fotos (solo el logo)', mailsTo(S_TEAM_EMAIL).every((m) => (m.body.attachments || []).length <= 1))
    const mAutor = await waitMail(C.email, desde, { ms: 10000, subject: 'Te respondimos tu sugerencia' })
    check(F, 'mail al autor con la respuesta', !!mAutor && mAutor.body.html.includes('Ver la respuesta'), mAutor ? mAutor.body.subject : 'no llegó')
  }

  // tope diario: 10 por día por usuario → 429
  let hechos = await db.feedback.count({ where: { userId: V.id } })
  let ultimo = null
  while (hechos < 10) {
    ultimo = await post(V, '/api/feedback', { role: 'proveedor', type: 'otro', area: 'otra', title: `${MARK} Tope ${hechos + 1}`, description: `${MARK} Envío para probar el tope diario.` })
    if (ultimo.status !== 201) break
    hechos++
  }
  check(F, 'se pueden mandar 10 en el día', hechos === 10, ultimo ? brief(ultimo) : '')
  const tope = await post(V, '/api/feedback', { role: 'proveedor', type: 'otro', area: 'otra', title: `${MARK} Tope 11`, description: `${MARK} Este tiene que rebotar.` })
  st(F, 'el envío 11 del día', tope, 429)
  check(F, '429 con mensaje claro', /máximo de 10 envíos por día/.test(tope.data?.error || ''), brief(tope))
  check(F, 'el 429 no creó nada', (await db.feedback.count({ where: { userId: V.id } })) === 10)
  const misV = await get(V, '/api/feedback')
  check(F, 'Mis envíos avisa que no quedan envíos hoy', misV.data?.quedanHoy === 0, brief(misV))
}

// ═════════════════════════════ U. INGRESOS DE HOMIA (D30) ═════════════════════════════
// Webhook de cobros recurrentes (subscription_authorized_payment) contra un DOBLE de la API de
// Mercado Pago: el server tiene que correr con MP_API_BASE_PRUEBAS=http://localhost:<puerto> (solo
// fuera de producción) y la suite con --mp-double <puerto>. Sin doble, los checks del webhook se
// saltean (la API de /admin/ingresos se prueba igual). Ids de pago con prefijo "e2e" (la purga los barre).
const MP_DOUBLE_PORT = argVal('--mp-double')
const mpDoble = { server: null, facturas: new Map(), pagos: new Map(), pres: new Map(), creadas: [] }
async function startMpDouble() {
  if (!MP_DOUBLE_PORT || mpDoble.server) return !!mpDoble.server
  const { createServer } = await import('node:http')
  mpDoble.server = createServer(async (req, res) => {
    const u = new URL(req.url, 'http://x')
    const send = (code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)) }
    let m
    // D33: alta de suscripción (POST /preapproval) y cancelación (PUT /preapproval/{id})
    if (req.method === 'POST' || req.method === 'PUT') {
      let txt = ''
      for await (const ch of req) txt += ch
      const body = txt ? JSON.parse(txt) : {}
      if (req.method === 'POST' && u.pathname === '/preapproval') {
        const id = `e2epre${TS}n${mpDoble.creadas.length}`
        mpDoble.creadas.push(body)
        mpDoble.pres.set(id, { id, status: 'pending', external_reference: body.external_reference, auto_recurring: body.auto_recurring, date_created: new Date().toISOString() })
        return send(201, { id, init_point: `https://doble.mp/checkout/${id}`, status: 'pending', auto_recurring: body.auto_recurring })
      }
      if (req.method === 'PUT' && (m = u.pathname.match(/^\/preapproval\/([^/]+)$/))) {
        const p = mpDoble.pres.get(m[1])
        if (!p) return send(404, { message: 'not found' })
        Object.assign(p, body, { last_modified: new Date().toISOString() })
        return send(200, p)
      }
      return send(404, { message: 'not found' })
    }
    if ((m = u.pathname.match(/^\/authorized_payments\/([^/]+)$/)) && m[1] !== 'search') {
      if (m[1] === 'e2ecaido') return send(500, { message: 'internal_error' })
      const f = mpDoble.facturas.get(m[1])
      return f ? send(200, f) : send(404, { message: 'not found' })
    }
    if ((m = u.pathname.match(/^\/v1\/payments\/([^/]+)$/))) {
      const p = mpDoble.pagos.get(m[1])
      return p ? send(200, p) : send(404, { message: 'not found' })
    }
    if ((m = u.pathname.match(/^\/preapproval\/([^/]+)$/)) && m[1] !== 'search') {
      const p = mpDoble.pres.get(m[1])
      return p ? send(200, p) : send(404, { message: 'not found' })
    }
    if (u.pathname.endsWith('/search')) return send(200, { paging: { total: 0, offset: 0, limit: 12 }, results: [] })
    send(404, { message: 'not found' })
  })
  await new Promise((ok) => mpDoble.server.listen(Number(MP_DOUBLE_PORT), ok))
  return true
}
/** Carga en el doble una factura + su pago (formas reales de MP, ver src/lib/__tests__/ingresos.test.ts). */
function mpCobro({ ap, pay, provId, preId, status, detalle, fecha, monto = 50000 }) {
  const iso = new Date(fecha).toISOString()
  mpDoble.facturas.set(ap, {
    id: ap, preapproval_id: preId, type: 'recurring', status: 'processed', date_created: iso, transaction_amount: monto, currency_id: 'ARS',
    external_reference: `plan:provider:${provId}:basic`, retry_attempt: 1, debit_date: iso, payment: { id: pay, status, status_detail: detalle },
  })
  mpDoble.pagos.set(pay, {
    id: pay, status, status_detail: detalle, external_reference: `plan:provider:${provId}:basic`, transaction_amount: monto, transaction_amount_refunded: 0,
    currency_id: 'ARS', date_created: iso, date_approved: status === 'approved' ? iso : null,
    fee_details: status === 'approved' ? [{ type: 'mercadopago_fee', amount: 2050, fee_payer: 'collector' }] : [],
    transaction_details: { net_received_amount: status === 'approved' ? monto - 2050 : 0 },
    point_of_interaction: { type: 'SUBSCRIPTIONS', transaction_data: { subscription_id: preId, billing_date: iso.slice(0, 10), subscription_sequence: { number: 1 } } },
    card: { last_four_digits: '0000' }, payer: { email: 'no-se-guarda@example.com' },
  })
}
const aviso = (id) => http(ANON, 'POST', `/api/payments/webhook?type=subscription_authorized_payment&data.id=${encodeURIComponent(id)}`, { json: { type: 'subscription_authorized_payment', action: 'created', data: { id } } })

async function flowU() {
  const F = 'U'
  // ── sin sesión de admin: 404 (como si no existiera), también con sesión de usuario ──
  st(F, 'ingresos sin sesión de admin', await get(ANON, '/api/admin/ingresos'), 404)
  st(F, 'ficha sin sesión de admin', await get(ANON, `/api/admin/ingresos/proveedor?id=${V.provId}`), 404)
  st(F, 'ingresos con sesión de usuario (no admin)', await get(C, '/api/admin/ingresos'), 404)
  st(F, 'CSV sin sesión de admin', await get(ANON, '/api/admin/ingresos?csv=cobros'), 404)

  const preId = `e2epre${TS}`
  const ap1 = `e2eap${TS}1`, pay1 = `e2e${TS}1`
  const ap2 = `e2eap${TS}2`, pay2 = `e2e${TS}2`
  const ap3 = `e2eap${TS}3`, pay3 = `e2e${TS}3`
  const hayDoble = await startMpDouble()
  if (!hayDoble) {
    console.log('  (sin --mp-double: se saltean los avisos del webhook)')
  } else {
    // el proveedor de la suite pasa a plan Básico con una suscripción (del doble)
    await db.providerProfile.update({ where: { id: V.provId }, data: { subscription: 'basic', mpPreapprovalId: preId } })
    const prox = new Date(Date.now() + 20 * 86_400_000).toISOString()
    mpDoble.pres.set(preId, { id: preId, status: 'authorized', external_reference: `plan:provider:${V.provId}:basic`, next_payment_date: prox, last_modified: new Date().toISOString(), auto_recurring: { transaction_amount: 50000 } })
    mpCobro({ ap: ap1, pay: pay1, provId: V.provId, preId, status: 'approved', detalle: 'accredited', fecha: Date.now() - 5 * 86_400_000 })
    mpCobro({ ap: ap2, pay: pay2, provId: V.provId, preId, status: 'rejected', detalle: 'cc_rejected_insufficient_amount', fecha: Date.now() - 3600_000 })

    st(F, 'aviso de cobro aprobado', await aviso(ap1), 200)
    const fila = await db.subscriptionCharge.findUnique({ where: { mpPaymentId: pay1 } })
    check(F, 'el cobro quedó guardado con los datos de MP', !!fila && fila.status === 'approved' && fila.amount === 50000 && fila.mpFee === 2050 && fila.netAmount === 47950 && fila.providerId === V.provId && fila.mpAuthorizedPaymentId === ap1 && fila.source === 'webhook', JSON.stringify(fila))
    check(F, 'sin datos de tarjeta ni del pagador en raw', !!fila && !/last_four|no-se-guarda|payer|card/.test(JSON.stringify(fila.raw)), JSON.stringify(fila?.raw))
    st(F, 'segundo aviso del mismo cobro', await aviso(ap1), 200)
    check(F, 'idempotente: dos avisos → una fila', (await db.subscriptionCharge.count({ where: { mpPaymentId: pay1 } })) === 1)
    st(F, 'aviso de cobro rechazado', await aviso(ap2), 200)
    const rech = await db.subscriptionCharge.findUnique({ where: { mpPaymentId: pay2 } })
    check(F, 'rechazo guardado con su motivo', rech?.status === 'rejected' && rech.statusDetail === 'cc_rejected_insufficient_amount' && rech.paidAt === null, JSON.stringify(rech))
    st(F, 'MP no responde → 503 para que MP reintente', await aviso('e2ecaido'), 503)
    st(F, 'factura inexistente → 200 ignorado', await aviso(`e2eap${TS}nada`), 200)
    check(F, 'los avisos fallidos no guardaron nada', (await db.subscriptionCharge.count({ where: { providerId: V.provId } })) === 2)
  }

  // ── con sesión de admin ──
  const AD = new Actor('adminU', null)
  if (!(await loginAdmin(AD))) {
    check(F, 'ingreso al área /admin con ADMIN_EMAIL/ADMIN_PASSWORD', false, 'faltan las variables o el login falló', 'config: ADMIN_EMAIL/ADMIN_PASSWORD')
    return
  }
  const conPrueba = await get(AD, '/api/admin/ingresos?periodo=30&prueba=incluir&gran=dia')
  st(F, 'ingresos con sesión de admin', conPrueba, 200)
  const d = conPrueba.data || {}
  check(F, 'trae resumen, serie y tablas', !!d.resumen && Array.isArray(d.serie) && !!d.tablas?.cuentas && !!d.tablas?.movimiento && !!d.tablas?.mensual, Object.keys(d).join(','))
  check(F, 'la serie cubre los 30 días sin huecos', d.serie?.length === 30, String(d.serie?.length))
  if (hayDoble) {
    const filaV = (d.tablas?.cuentas?.ids || []).indexOf(V.provId)
    const cuentaV = filaV >= 0 ? d.tablas.cuentas.filas[filaV] : null
    check(F, 'rechazo después del último cobro → "En deuda" (1 mes × $50.000)', cuentaV?.[1] === 'En deuda' && cuentaV?.[8] === 50000, JSON.stringify(cuentaV))
    const ids = d.tablas?.cobros?.filas?.map((f) => f[8]) || []
    check(F, 'la tabla de cobros tiene los dos intentos con su id de pago', ids.includes(pay1) && ids.includes(pay2), ids.join(','))
    check(F, 'suscripciones del período incluyen el cobro aprobado', (d.resumen?.suscripciones ?? 0) >= 50000, String(d.resumen?.suscripciones))
    check(F, 'MRR cuenta al proveedor con suscripción vigente', (d.resumen?.mrr?.basic ?? 0) >= 1 && d.resumen.mrr.mrr >= 50000, JSON.stringify(d.resumen?.mrr))
    check(F, 'próximo cobro esperado según MP', (d.tablas?.proximos?.ids || []).includes(V.provId), JSON.stringify(d.tablas?.proximos?.filas))
    check(F, 'comisión de MP informada, no estimada', (d.resumen?.comisionMp?.conDato ?? 0) >= 1 && d.resumen.comisionMp.suma >= 2050, JSON.stringify(d.resumen?.comisionMp))

    // reintento aprobado → al día
    mpCobro({ ap: ap3, pay: pay3, provId: V.provId, preId, status: 'approved', detalle: 'accredited', fecha: Date.now() - 60_000 })
    st(F, 'aviso del reintento aprobado', await aviso(ap3), 200)
    const d2 = (await get(AD, '/api/admin/ingresos?periodo=30&prueba=incluir&estadoCuenta=al_dia')).data || {}
    check(F, 'rechazo seguido de aprobación → "Al día" (filtro por estado de cuenta)', (d2.tablas?.cuentas?.ids || []).includes(V.provId) && d2.tablas.cuentas.filas.every((f) => f[1] === 'Al día'), JSON.stringify(d2.tablas?.cuentas?.filas?.slice(0, 3)))
    const fil = (await get(AD, '/api/admin/ingresos?periodo=30&prueba=incluir&estado=rejected')).data || {}
    check(F, 'filtro por estado del cobro', (fil.tablas?.cobros?.filas || []).length >= 1 && fil.tablas.cobros.filas.every((f) => f[4] === 'rechazado'), JSON.stringify(fil.tablas?.cobros?.filas?.slice(0, 2)))

    const ficha = await get(AD, `/api/admin/ingresos/proveedor?id=${V.provId}`)
    st(F, 'ficha del proveedor', ficha, 200)
    const tipos = (ficha.data?.linea || []).map((x) => x.tipo)
    check(F, 'la ficha tiene alta, cobros aprobados y el rechazo, y está al día', tipos.includes('Alta') && tipos.filter((t) => t === 'Cobro aprobado').length === 2 && tipos.includes('Cobro rechazado') && ficha.data?.cuenta?.estado === 'al_dia' && ficha.data?.totalPagado === 100000, JSON.stringify({ tipos, cuenta: ficha.data?.cuenta?.estado, total: ficha.data?.totalPagado }))

    // excluir prueba (por defecto): el proveedor @homia.test no aparece
    const sinPrueba = (await get(AD, '/api/admin/ingresos?periodo=30')).data || {}
    check(F, 'por defecto excluye las cuentas de prueba', !(sinPrueba.tablas?.cuentas?.ids || []).includes(V.provId) && !(sinPrueba.tablas?.cobros?.filas || []).some((f) => String(f[8]).startsWith('e2e')))

    // CSV formato argentino
    const csv = await get(AD, '/api/admin/ingresos?periodo=30&prueba=incluir&csv=cobros', { raw: true })
    st(F, 'CSV de cobros', csv, 200)
    // bytes crudos: response.text() se come el BOM
    const txt = csv.buf ? csv.buf.toString('utf8') : ''
    check(F, 'CSV: BOM, separador ";", fecha argentina y el id de pago', csv.buf?.[0] === 0xef && csv.buf?.[1] === 0xbb && csv.buf?.[2] === 0xbf && txt.includes('Fecha;Proveedor;Plan;Monto') && txt.includes(pay1) && /\d{2}\/\d{2}\/\d{4}/.test(txt) && (csv.headers.get('content-type') || '').includes('text/csv'), txt.slice(0, 200))
  }
  st(F, 'CSV de una tabla inexistente → 400', await get(AD, '/api/admin/ingresos?csv=nada'), 400)
  st(F, 'ficha de un id inexistente → 404', await get(AD, '/api/admin/ingresos/proveedor?id=noexiste123456'), 404)
}

// ═════════════════ V. PLAN DEL PROVEEDOR: CANCELAR, PERÍODO PAGO Y PLAN VENCIDO (D33) ═════════════════
// Contra el DOBLE de MP (--mp-double): nunca se crean suscripciones reales ni se cobra. Proveedores propios
// de esta sección (VX: cancela y vence; VY: elige plan en la prueba). Ids de MP con prefijo "e2e".
const VX = new Actor('provX', 'proveedor')
const VY = new Actor('provY', 'proveedor')
for (const a of [VX, VY]) a.ip = `10.253.${(TS >> 8) & 255}.${TS & 255}`
const avisoPre = (id) => http(ANON, 'POST', `/api/payments/webhook?type=subscription_preapproval&data.id=${encodeURIComponent(id)}`, { json: { type: 'subscription_preapproval', action: 'updated', data: { id } } })
const cronSubs = () => get(ANON, '/api/cron/subscriptions', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })

async function flowV() {
  const F = 'V'
  const hayDoble = await startMpDouble()
  if (!hayDoble) {
    check(F, 'la sección V necesita --mp-double (nunca toca Mercado Pago de verdad)', false, 'correr con --mp-double <puerto> y el server con MP_API_BASE_PRUEBAS')
    return
  }
  const base = { password: PASSWORD, lat: CABA.lat, lng: CABA.lng, city: 'CABA', howFoundUs: 'otro', acceptTerms: true }
  for (const [a, name] of [[VX, 'Corralón X'], [VY, 'Ferretería Y']]) {
    const r = await registrar(a, { ...base, email: a.email, displayName: `${MARK} Prov ${name}`, roles: ['proveedor'], businessName: `${MARK} ${name}`, address: 'Av. Siempreviva 742' })
    st(F, `registro proveedor ${name}`, r, 201)
    a.id = r.data?.user?.id
    a.provId = a.id ? (await db.providerProfile.findUnique({ where: { userId: a.id } }))?.id : undefined
  }
  if (!VX.provId || !VY.provId) throw new Error('No se pudieron crear los proveedores de la sección V')

  // ── elegir plan durante la prueba: el primer cobro es el fin de la prueba ──
  const pY0 = await db.providerProfile.findUnique({ where: { id: VY.provId } })
  const gY = await get(VY, '/api/provider/plan')
  check(F, 'en prueba: la pantalla sabe que el primer cobro sería el fin de la prueba', gY.data?.primerCobroSiElige === pY0.trialEndsAt.toISOString(), brief(gY))
  const altaY = await post(VY, '/api/provider/plan', { plan: 'basic' })
  st(F, 'elegir Básico durante la prueba', altaY, 201)
  const cuerpo = mpDoble.creadas.find((b) => b.external_reference === `plan:provider:${VY.provId}:basic`)
  check(F, 'la suscripción se crea con start_date = fin de la prueba (no se come los días gratis)', cuerpo?.auto_recurring?.start_date === pY0.trialEndsAt.toISOString() && altaY.data?.primerCobro === pY0.trialEndsAt.toISOString(), JSON.stringify(cuerpo?.auto_recurring))
  // MP autoriza la tarjeta: aviso authorized
  const preY = altaY.data?.preapprovalId
  mpDoble.pres.set(preY, { id: preY, status: 'authorized', external_reference: `plan:provider:${VY.provId}:basic`, next_payment_date: pY0.trialEndsAt.toISOString(), date_created: new Date().toISOString(), auto_recurring: { transaction_amount: 50000, start_date: pY0.trialEndsAt.toISOString() }, summarized: { charged_quantity: 0, last_charged_date: null } })
  st(F, 'aviso authorized de la suscripción elegida en la prueba', await avisoPre(preY), 200)
  const pY1 = await db.providerProfile.findUnique({ where: { id: VY.provId } })
  check(F, 'queda en Básico y NO se pisa trialEndsAt', pY1.subscription === 'basic' && pY1.mpPreapprovalId === preY && pY1.trialEndsAt?.getTime() === pY0.trialEndsAt.getTime() && pY1.planPaidUntil === null, JSON.stringify({ s: pY1.subscription, t: pY1.trialEndsAt, h: pY1.planPaidUntil }))
  const gY1 = await get(VY, '/api/provider/plan')
  check(F, 'la pantalla dice "primer cobro el DD/MM"', gY1.data?.plan?.primerCobro === pY0.trialEndsAt.toISOString() && /primer cobro el \d{2}\/\d{2}/.test(gY1.data?.plan?.etiqueta || ''), brief(gY1))
  const nY = await db.notification.findFirst({ where: { userId: VY.id, type: 'plan_basico' }, orderBy: { createdAt: 'desc' } })
  check(F, 'el aviso dice cuándo es el primer cobro', /primer cobro de Mercado Pago es el \d{2}\/\d{2}/.test(nY?.body || ''), nY?.body)
  // cancelar antes del primer cobro → vuelve a su prueba (no pagó nada), sin perder días
  const cY = await post(VY, '/api/provider/plan/cancel', { confirmar: true })
  st(F, 'cancelar antes del primer cobro', cY, 200)
  const pY2 = await db.providerProfile.findUnique({ where: { id: VY.provId } })
  check(F, 'sin cobro: vuelve a la prueba con los mismos días (trialEndsAt intacto)', pY2.subscription === 'trial' && pY2.trialEndsAt?.getTime() === pY0.trialEndsAt.getTime() && pY2.planPaidUntil === null && cY.data?.plan?.activo === true, JSON.stringify({ s: pY2.subscription, t: pY2.trialEndsAt, h: pY2.planPaidUntil }))
  check(F, 'MP recibió la cancelación', mpDoble.pres.get(preY)?.status === 'cancelled')
  st(F, 'cancelar otra vez (idempotente)', await post(VY, '/api/provider/plan/cancel', { confirmar: true }), 200)

  // ── cancelar con un período pago vigente ──
  st(F, 'cancelar sin suscripción (en prueba, nunca eligió plan) → 409', await post(VX, '/api/provider/plan/cancel', { confirmar: true }), 409)
  const preX = `e2eprex${TS}`
  const pagado = new Date(Date.now() - 5 * 86_400_000)
  await db.providerProfile.update({ where: { id: VX.provId }, data: { subscription: 'basic', mpPreapprovalId: preX, trialEndsAt: new Date(Date.now() - 20 * 86_400_000) } })
  await db.subscriptionCharge.create({ data: { providerId: VX.provId, userId: VX.id, providerName: `${MARK} Corralón X`, plan: 'basic', mpPreapprovalId: preX, mpPaymentId: `e2e${TS}x1`, mpEnvironment: 'live', status: 'approved', amount: 50000, currency: 'ARS', refundedAmount: 0, attemptedAt: pagado, paidAt: pagado, source: 'webhook' } })
  mpDoble.pres.set(preX, { id: preX, status: 'authorized', external_reference: `plan:provider:${VX.provId}:basic`, next_payment_date: new Date(pagado.getTime() + 30 * 86_400_000).toISOString(), date_created: pagado.toISOString(), summarized: { charged_quantity: 1, last_charged_date: pagado.toISOString() } })
  const stX = await post(VX, '/api/provider/stock', { elementId: S.E1.id, price: 1300, quantity: 20, minStock: 1 })
  st(F, 'con plan: publica stock', stX, 201)
  const stockX = stX.data?.stock?.id
  const gX = await get(VX, '/api/provider/plan')
  const esperado = new Date(pagado.getTime()); esperado.setUTCMonth(esperado.getUTCMonth() + 1)
  check(F, 'antes de cancelar la pantalla muestra hasta cuándo seguiría (último cobro + 1 mes)', gX.data?.puedeCancelar === true && gX.data?.finPeriodo === esperado.toISOString(), brief(gX))

  st(F, 'cancelar sin sesión', await post(ANON, '/api/provider/plan/cancel', { confirmar: true }), 401)
  st(F, 'cancelar como cliente', await post(C, '/api/provider/plan/cancel', { confirmar: true }), 403)
  st(F, 'cancelar sin confirmar', await post(VX, '/api/provider/plan/cancel', {}), 400)
  st(F, 'cancelar como profesional', await post(P, '/api/provider/plan/cancel', { confirmar: true }), 403)
  check(F, '…la suscripción de X sigue intacta', mpDoble.pres.get(preX)?.status === 'authorized' && (await db.providerProfile.findUnique({ where: { id: VX.provId } })).planPaidUntil === null)

  const cX = await post(VX, '/api/provider/plan/cancel', { confirmar: true })
  st(F, 'el dueño cancela desde HomIA', cX, 200)
  const pX1 = await db.providerProfile.findUnique({ where: { id: VX.provId } })
  check(F, 'MP recibió PUT status=cancelled', mpDoble.pres.get(preX)?.status === 'cancelled')
  check(F, 'sigue en Básico con planPaidUntil = último cobro + 1 mes', pX1.subscription === 'basic' && pX1.planPaidUntil?.toISOString() === esperado.toISOString() && cX.data?.accesoHasta === esperado.toISOString(), JSON.stringify({ s: pX1.subscription, h: pX1.planPaidUntil }))
  const evX = await db.subscriptionEvent.findUnique({ where: { dedupeKey: `baja:${preX}` } })
  check(F, 'evento "cancelada" con motivo "cancelada desde HomIA"', evX?.type === 'cancelada' && evX?.source === 'homia' && /cancelada desde HomIA/.test(evX?.motivo || ''), JSON.stringify(evX))
  const nX = await db.notification.findMany({ where: { userId: VX.id, type: 'plan_cancelado' } })
  check(F, 'un aviso que dice hasta cuándo sigue y que no se reintegra', nX.length === 1 && /hasta el \d{2}\/\d{2}/.test(nX[0].body) && /no se reintegra/.test(nX[0].body), JSON.stringify(nX.map((n) => n.body)))
  const cX2 = await post(VX, '/api/provider/plan/cancel', { confirmar: true })
  check(F, 'cancelar dos veces: 200 idempotente, misma fecha', cX2.status === 200 && cX2.data?.yaEstaba === true && cX2.data?.accesoHasta === esperado.toISOString(), brief(cX2))
  st(F, 'MP avisa la cancelación después (webhook)', await avisoPre(preX), 200)
  const pX2 = await db.providerProfile.findUnique({ where: { id: VX.provId } })
  check(F, 'el aviso de MP no degrada ni duplica el aviso', pX2.subscription === 'basic' && pX2.planPaidUntil?.getTime() === esperado.getTime() && (await db.notification.count({ where: { userId: VX.id, type: 'plan_cancelado' } })) === 1)
  check(F, 'un solo evento de baja', (await db.subscriptionEvent.count({ where: { providerId: VX.provId, type: 'cancelada' } })) === 1)

  // mientras planPaidUntil es futuro, sigue operativo
  const gX2 = await get(VX, '/api/provider/plan')
  check(F, 'plan cancelado: activo, "cancelado", hasta la fecha', gX2.data?.plan?.activo === true && gX2.data?.plan?.cancelado === true && gX2.data?.plan?.accesoHasta === esperado.toISOString() && gX2.data?.puedeCancelar === false, brief(gX2))
  st(F, 'plan cancelado vigente: sigue editando stock', await patch(VX, '/api/provider/stock', { id: stockX, price: 1350 }), 200)
  const offerOf = (r, stockId) => (r.data?.results || []).some((e) => (e.offers || []).some((o) => o.stockId === stockId))
  check(F, 'plan cancelado vigente: sigue en el marketplace', offerOf(await get(C, '/api/marketplace?q=caño'), stockX))

  // compras para probar después con el plan vencido
  const compra = await post(C, '/api/purchases', { stockId: stockX, quantity: 3, type: 'compra', note: `${MARK} V compra` })
  st(F, 'cliente compra (antes del vencimiento)', compra, 201)
  const compraId = compra.data?.purchase?.id
  const compra2 = await post(C, '/api/purchases', { stockId: stockX, quantity: 1, type: 'compra', note: `${MARK} V compra a cancelar` })
  const reserva1 = await post(C, '/api/purchases', { stockId: stockX, quantity: 1, type: 'reserva', note: `${MARK} V reserva a rechazar` })
  const reserva2 = await post(C, '/api/purchases', { stockId: stockX, quantity: 1, type: 'reserva', note: `${MARK} V reserva a aprobar` })
  st(F, 'cliente elige efectivo', await patch(C, `/api/purchases/${compraId}`, { action: 'pagar_efectivo' }), 200)
  const chargeX = (await db.purchase.findUnique({ where: { id: compraId || 'x' } }))?.chargeId

  // ── el período pago termina: el cron lo da de baja ──
  if (!process.env.CRON_SECRET) {
    check(F, 'CRON_SECRET configurado para probar el cron', false, 'falta CRON_SECRET en .env')
    return
  }
  const vence = new Date(Date.now() - 60_000)
  await db.providerProfile.update({ where: { id: VX.provId }, data: { planPaidUntil: vence } })
  const gX3 = await get(VX, '/api/provider/plan')
  check(F, 'vencido antes del cron: ya no opera (la misma regla en todos lados)', gX3.data?.plan?.activo === false && gX3.data?.plan?.motivoInactivo === 'plan_vencido', brief(gX3))
  check(F, 'vencido antes del cron: ya no aparece en el marketplace', !offerOf(await get(C, '/api/marketplace?q=caño'), stockX))
  const cr = await cronSubs()
  st(F, 'cron diario de suscripciones', cr, 200)
  check(F, 'el cron cuenta el vencimiento', (cr.data?.vencidos ?? 0) >= 1, brief(cr))
  const pX3 = await db.providerProfile.findUnique({ where: { id: VX.provId } })
  check(F, 'el cron lo pasa a prueba finalizada y guarda cuándo terminó el plan', pX3.subscription === 'trial' && pX3.planPaidUntil?.getTime() === vence.getTime(), JSON.stringify({ s: pX3.subscription, h: pX3.planPaidUntil }))
  const nV = await db.notification.findFirst({ where: { userId: VX.id, type: 'plan_vencido' } })
  check(F, 'aviso "Terminó tu plan"', !!nV && /Terminó tu plan/.test(nV.title), JSON.stringify(nV))
  const cr2 = await cronSubs()
  check(F, 'correr el cron otra vez no vuelve a avisar', cr2.status === 200 && (await db.notification.count({ where: { userId: VX.id, type: 'plan_vencido' } })) === 1)

  // ── plan vencido: bloquea negocio nuevo, deja cerrar lo que ya tiene ──
  const nuevoStock = await post(VX, '/api/provider/stock', { elementId: S.E3.id, price: 10, quantity: 1 })
  check(F, 'vencido: NO publica stock (403 needsPlan, "Tu plan venció el …")', nuevoStock.status === 403 && nuevoStock.data?.needsPlan === true && /^Tu plan venció el \d{2}\/\d{2}/.test(nuevoStock.data?.error || ''), brief(nuevoStock))
  const edStock = await patch(VX, '/api/provider/stock', { id: stockX, price: 1 })
  check(F, 'vencido: NO edita stock', edStock.status === 403 && edStock.data?.needsPlan === true, brief(edStock))
  const apr = await patch(VX, `/api/purchases/${reserva2.data?.purchase?.id}`, { action: 'aprobar' })
  check(F, 'vencido: NO aprueba una reserva nueva', apr.status === 403 && apr.data?.needsPlan === true && /terminar las ventas que ya tenés/.test(apr.data?.error || ''), brief(apr))
  st(F, 'vencido: confirma el pago en efectivo', await patch(VX, `/api/charges/${chargeX}`, {}), 200)
  const ent = await patch(VX, `/api/purchases/${compraId}`, { action: 'entregar' })
  st(F, 'vencido: entrega una compra pagada', ent, 200)
  st(F, 'vencido: cancela una compra con motivo', await patch(VX, `/api/purchases/${compra2.data?.purchase?.id}`, { action: 'cancelar', reason: `${MARK} no llego a entregar` }), 200)
  st(F, 'vencido: rechaza una reserva pendiente', await patch(VX, `/api/purchases/${reserva1.data?.purchase?.id}`, { action: 'rechazar', reason: `${MARK} sin stock` }), 200)
  const foto = (await upload(C, 'sobrantes', 51)).data?.url
  const dev = await post(C, '/api/returns', { purchaseId: compraId, items: [{ purchaseId: compraId, elementId: S.E1.id, condition: 'sin_abrir', photoUrl: foto, qty: 1 }] })
  st(F, 'el cliente pide una devolución al proveedor vencido', dev, 201)
  const itemsDev = await db.leftoverItem.findMany({ where: { returnId: dev.data?.return?.id || 'x' } })
  st(F, 'vencido: acepta la devolución', await patch(VX, `/api/returns/${dev.data?.return?.id}`, { action: 'aceptar', items: itemsDev.map((i) => ({ id: i.id, qtyAccepted: 1 })) }), 200)
  check(F, 'vencido: sigue viendo sus ventas y su stock', (await get(VX, '/api/purchases?as=proveedor')).status === 200 && (await get(VX, '/api/provider/stock')).status === 200)
  const sX = await db.providerStock.findUnique({ where: { id: stockX || 'x' } })
  check(F, 'vencido: no se borró nada (stock y precio intactos)', !!sX && sX.price === 1350, JSON.stringify(sX && { price: sX.price, q: sX.quantity }))

  // volver a suscribirse después de vencido: cobro en el momento (sin start_date)
  const altaX = await post(VX, '/api/provider/plan', { plan: 'pro' })
  st(F, 'vencido: puede volver a elegir plan', altaX, 201)
  const cuerpoX = mpDoble.creadas.find((b) => b.external_reference === `plan:provider:${VX.provId}:pro`)
  check(F, 'sin prueba ni período pago vigente: sin start_date (cobra en el momento)', !!cuerpoX && !cuerpoX.auto_recurring?.start_date && altaX.data?.primerCobro === null, JSON.stringify(cuerpoX?.auto_recurring))
  const preX2 = altaX.data?.preapprovalId
  mpDoble.pres.set(preX2, { id: preX2, status: 'authorized', external_reference: `plan:provider:${VX.provId}:pro`, date_created: new Date().toISOString(), summarized: { charged_quantity: 1, last_charged_date: new Date().toISOString() } })
  st(F, 'aviso authorized del PRO', await avisoPre(preX2), 200)
  const pX4 = await db.providerProfile.findUnique({ where: { id: VX.provId } })
  check(F, 'al volver a pagar queda PRO, sin baja programada', pX4.subscription === 'pro' && pX4.planPaidUntil === null && pX4.mpPreapprovalId === preX2, JSON.stringify({ s: pX4.subscription, h: pX4.planPaidUntil }))
  check(F, 'al volver a pagar, su stock reaparece tal como estaba', offerOf(await get(C, '/api/marketplace?q=caño'), stockX))

  // cobro reembolsado de un proveedor activo: no deja período pago al cancelar
  await db.subscriptionCharge.create({ data: { providerId: VX.provId, userId: VX.id, providerName: `${MARK} Corralón X`, plan: 'pro', mpPreapprovalId: preX2, mpPaymentId: `e2e${TS}x2`, mpEnvironment: 'live', status: 'refunded', amount: 100000, currency: 'ARS', refundedAmount: 100000, attemptedAt: new Date(), paidAt: new Date(), source: 'webhook' } })
  const cX3 = await post(VX, '/api/provider/plan/cancel', { confirmar: true })
  const pX5 = await db.providerProfile.findUnique({ where: { id: VX.provId } })
  check(F, 'con el único cobro reembolsado, cancelar no deja un período vigente (aunque MP siga contándolo)', cX3.status === 200 && pX5.subscription === 'trial' && (!pX5.planPaidUntil || pX5.planPaidUntil.getTime() <= Date.now()), JSON.stringify({ st: cX3.status, s: pX5.subscription, h: pX5.planPaidUntil }))

  // admin: plan elegido en la prueba = "En prueba", no "En deuda" (si hay sesión de admin)
  const AD = new Actor('adminV', null)
  if (await loginAdmin(AD)) {
    await db.providerProfile.update({ where: { id: VY.provId }, data: { subscription: 'basic', mpPreapprovalId: preY } })
    const d = (await get(AD, '/api/admin/ingresos?periodo=30&prueba=incluir')).data || {}
    const i = (d.tablas?.cuentas?.ids || []).indexOf(VY.provId)
    const fila = i >= 0 ? d.tablas.cuentas.filas[i] : null
    check(F, 'admin: plan elegido en la prueba → "En prueba" (no "En deuda")', fila?.[1] === 'En prueba', JSON.stringify(fila))
  }
}

async function purge({ quiet = false } = {}) {
  const log = (...m) => { if (!quiet) console.log(...m) }
  // + las cuentas E2E eliminadas en esta u otra corrida (solo ids anotados y con email eliminado-…@homia.invalid)
  const deletedNoted = readDeleted()
  const users = await db.user.findMany({
    where: {
      OR: [
        { email: { startsWith: EMAIL_PREFIX, endsWith: EMAIL_DOMAIN } },
        { id: { in: deletedNoted }, email: { startsWith: 'eliminado-', endsWith: '@homia.invalid' } },
      ],
    },
    select: { id: true, email: true },
  })
  const uids = users.map((u) => u.id)
  const extraEls = await db.catalogElement.findMany({ where: { OR: [{ id: { in: manifest.catalogElementIds } }, { name: { startsWith: 'E2E-Q ' } }] }, select: { id: true } })
  if (!uids.length && !extraEls.length) { log('Purga: no hay datos E2E.'); return { users: 0 } }
  const pros = await db.professionalProfile.findMany({ where: { userId: { in: uids } }, select: { id: true } })
  const provs = await db.providerProfile.findMany({ where: { userId: { in: uids } }, select: { id: true } })
  const proIds = pros.map((p) => p.id)
  const provIds = provs.map((p) => p.id)
  const projects = await db.project.findMany({ where: { OR: [{ clientId: { in: uids } }, { professionalId: { in: proIds } }] }, select: { id: true } })
  const projIds = projects.map((p) => p.id)
  const jobs = await db.jobPost.findMany({ where: { userId: { in: uids } }, select: { id: true } })
  const jobIds = jobs.map((j) => j.id)
  const purchases = await db.purchase.findMany({ where: { OR: [{ clientId: { in: uids } }, { providerId: { in: provIds } }] }, select: { id: true } })
  const purIds = purchases.map((p) => p.id)
  const orders = await db.order.findMany({ where: { OR: [{ clientId: { in: uids } }, { purchases: { some: { id: { in: purIds } } } }] }, select: { id: true } })
  const ordIds = orders.map((o) => o.id)
  const charges = await db.providerCharge.findMany({ where: { OR: [{ providerId: { in: provIds } }, { clientId: { in: uids } }, { projectId: { in: projIds } }] }, select: { id: true } })
  const chIds = charges.map((c) => c.id)
  const invoices = await db.invoice.findMany({ where: { projectId: { in: projIds } }, select: { id: true } })
  const invIds = invoices.map((i) => i.id)
  const convs = await db.conversation.findMany({ where: { OR: [{ userAId: { in: uids } }, { userBId: { in: uids } }] }, select: { id: true } })
  const out = {}
  const n = async (k, p) => { out[k] = (await p).count }
  await n('activityEvents', db.activityEvent.deleteMany({ where: { OR: [{ orderId: { in: ordIds } }, { purchaseId: { in: purIds } }, { projectId: { in: projIds } }, { actorId: { in: uids } }] } }))
  await n('cartItems', db.cartItem.deleteMany({ where: { OR: [{ userId: { in: uids } }, { stock: { providerId: { in: provIds } } }] } }))
  // incluye las devoluciones profesional → proveedor (parentReturnId) y las que tienen al profesional como vendedor
  await n('leftoverReturns', db.leftoverReturn.deleteMany({ where: { OR: [{ requesterId: { in: uids } }, { providerId: { in: provIds } }, { professionalId: { in: proIds } }, { projectId: { in: projIds } }, { purchaseId: { in: purIds } }] } }))
  await n('works', db.completedWork.deleteMany({ where: { OR: [{ authorId: { in: uids } }, { projectId: { in: projIds } }, { professionalId: { in: proIds } }] } }))
  await n('reviews', db.review.deleteMany({ where: { OR: [{ authorId: { in: uids } }, { targetUserId: { in: uids } }, { projectId: { in: projIds } }, { purchaseId: { in: purIds } }] } }))
  await n('payments', db.payment.deleteMany({ where: { OR: [{ invoiceId: { in: invIds } }, { chargeId: { in: chIds } }, { purchaseId: { in: purIds } }] } }))
  await n('crmDeals', db.crmDeal.deleteMany({ where: { OR: [{ counterpartyId: { in: uids } }, { projectId: { in: projIds } }, { jobId: { in: jobIds } }, { pipeline: { ownerId: { in: uids } } }] } }))
  await n('charges', db.providerCharge.deleteMany({ where: { id: { in: chIds } } }))
  await n('invoices', db.invoice.deleteMany({ where: { id: { in: invIds } } }))
  await n('projectMaterials', db.projectMaterial.deleteMany({ where: { OR: [{ projectId: { in: projIds } }, { providerId: { in: provIds } }] } }))
  await n('projects', db.project.deleteMany({ where: { id: { in: projIds } } }))
  await n('bids', db.jobBid.deleteMany({ where: { OR: [{ jobId: { in: jobIds } }, { professionalId: { in: proIds } }] } }))
  await n('jobs', db.jobPost.deleteMany({ where: { id: { in: jobIds } } }))
  await n('purchaseItems', db.purchaseItem.deleteMany({ where: { purchaseId: { in: purIds } } }))
  await n('purchases', db.purchase.deleteMany({ where: { id: { in: purIds } } }))
  await n('orders', db.order.deleteMany({ where: { id: { in: ordIds } } }))
  await n('links', db.providerLink.deleteMany({ where: { OR: [{ providerId: { in: provIds } }, { professionalId: { in: proIds } }] } }))
  await n('favorites', db.favorite.deleteMany({ where: { OR: [{ userId: { in: uids } }, { targetUserId: { in: uids } }] } }))
  await n('messages', db.message.deleteMany({ where: { conversationId: { in: convs.map((c) => c.id) } } }))
  await n('conversations', db.conversation.deleteMany({ where: { id: { in: convs.map((c) => c.id) } } }))
  // notificaciones: las de mis usuarios y las que mis eventos dejaron a terceros (marca o id de mis entidades)
  const entityIds = [...projIds, ...jobIds]
  await n('notifications', db.notification.deleteMany({
    where: {
      OR: [
        { userId: { in: uids } },
        { title: { contains: MARK } }, { body: { contains: MARK } },
        ...entityIds.map((id) => ({ link: { contains: id } })),
      ],
    },
  }))
  await n('searchEvents', db.searchEvent.deleteMany({ where: { userId: { in: uids } } }))
  // Homy: sesiones (usuario o visitante de la corrida), corridas y cupos de esta suite
  const { createHash } = await import('node:crypto')
  const homyHash = (v) => createHash('sha256').update(`${process.env.AUTH_SECRET || 'homy-dev-secret-cambiar-en-produccion-9f2a'}:${v}`).digest('hex').slice(0, 40)
  const visitorHashes = [homyHash(`visitante:${HOMY_VISITOR_TOKEN}`)]
  const ipHashes = [RUN_IP, P_IP].map(homyHash)
  const homySess = await db.homySession.findMany({ where: { OR: [{ userId: { in: uids } }, { visitorHash: { in: visitorHashes } }, { id: { in: manifest.homyVisitorSessions || [] } }] }, select: { id: true } })
  const homySessIds = homySess.map((x) => x.id)
  await n('homyRuns', db.homyRun.deleteMany({ where: { OR: [{ userId: { in: uids } }, { sessionId: { in: homySessIds } }, { ipHash: { in: ipHashes } }] } }))
  await n('aiUsage', db.aiUsage.deleteMany({ where: { key: { in: [...uids.map((u) => `user:${u}`), ...ipHashes.map((h) => `ip:${h}`)] } } }))
  await n('homySessions', db.homySession.deleteMany({ where: { id: { in: homySessIds } } }))
  await n('feedback', db.feedback.deleteMany({ where: { userId: { in: uids } } }))
  // métricas de uso (D27): lo de los usuarios de la suite y todo navegador de prueba (anonId e2e-…)
  await n('analyticsEvents', db.analyticsEvent.deleteMany({ where: { OR: [{ userId: { in: uids } }, { anonId: { startsWith: 'e2e-' } }] } }))
  await n('analyticsSessions', db.analyticsSession.deleteMany({ where: { OR: [{ userId: { in: uids } }, { anonId: { startsWith: 'e2e-' } }] } }))
  await n('identityDocuments', db.identityDocument.deleteMany({ where: { userId: { in: uids } } }))
  await n('passwordResets', db.passwordReset.deleteMany({ where: { userId: { in: uids } } }))
  // D26: códigos de verificación (los de registro no tienen usuario: se buscan por el email de prueba)
  await n('verificationCodes', db.verificationCode.deleteMany({ where: { OR: [{ userId: { in: uids } }, { target: { startsWith: EMAIL_PREFIX, endsWith: EMAIL_DOMAIN } }] } }))
  // Finanzas (D24): movimientos y configuración de los usuarios de la suite (también caen en cascada con el usuario)
  await n('financeEntries', db.financeEntry.deleteMany({ where: { userId: { in: uids } } }))
  await n('financeConfigs', db.financeConfig.deleteMany({ where: { userId: { in: uids } } }))
  await n('stock', db.providerStock.deleteMany({ where: { providerId: { in: provIds } } }))
  await n('pipelines', db.crmPipeline.deleteMany({ where: { ownerId: { in: uids } } }))
  await n('professionalProfiles', db.professionalProfile.deleteMany({ where: { id: { in: proIds } } }))
  // Ingresos de HomIA (D30): cobros y movimientos de plan de los proveedores de la suite (sin FK) + los del doble de MP
  await n('subscriptionCharges', db.subscriptionCharge.deleteMany({ where: { OR: [{ providerId: { in: provIds } }, { mpPaymentId: { startsWith: 'e2e' } }] } }))
  await n('subscriptionEvents', db.subscriptionEvent.deleteMany({ where: { OR: [{ providerId: { in: provIds } }, { dedupeKey: { contains: ':e2e' } }] } }))
  await n('providerProfiles', db.providerProfile.deleteMany({ where: { id: { in: provIds } } }))
  await n('users', db.user.deleteMany({ where: { id: { in: uids } } }))
  // elementos de catálogo creados por la suite (solo si nada real los usa)
  let els = 0
  for (const e of extraEls) {
    const used = (await db.providerStock.count({ where: { elementId: e.id } })) + (await db.projectMaterial.count({ where: { elementId: e.id } })) + (await db.leftoverItem.count({ where: { elementId: e.id } }))
    if (!used) { els += (await db.catalogElement.deleteMany({ where: { id: e.id } })).count } // deleteMany: otra corrida en paralelo pudo borrarlo
  }
  out.catalogElements = els

  // Storage: homia-uploads/<userId>/** y dni-docs/<userId>/**
  let files = 0
  const url = process.env.SUPABASE_PROJECT_URL
  const key = process.env.SUPABASE_SERVICE_ROLE
  const storageLeft = []
  if (url && key && uids.length) {
    const sb = createClient(url, key, { auth: { persistSession: false } })
    const listAll = async (bucket, prefix) => {
      const acc = []
      const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 })
      if (error) return acc
      for (const it of data || []) {
        const p = `${prefix}/${it.name}`
        if (it.id === null) acc.push(...(await listAll(bucket, p)))
        else acc.push(p)
      }
      return acc
    }
    for (const bucket of ['homia-uploads', 'dni-docs', 'feedback-evidencias']) {
      for (const uid of uids) {
        const paths = await listAll(bucket, uid)
        if (paths.length) {
          const { error } = await sb.storage.from(bucket).remove(paths)
          if (error) storageLeft.push(`${bucket}: ${error.message}`)
          else files += paths.length
        }
        const left = await listAll(bucket, uid)
        if (left.length) storageLeft.push(`${bucket}/${uid}: ${left.length}`)
      }
    }
  }
  out.storageFiles = files
  log('Purga:', JSON.stringify(out))

  // verificación: no queda nada
  const leftovers = {
    users: await db.user.count({ where: { id: { in: uids } } }),
    usersByEmail: await db.user.count({ where: { email: { startsWith: EMAIL_PREFIX, endsWith: EMAIL_DOMAIN } } }),
    projects: await db.project.count({ where: { id: { in: projIds } } }),
    jobs: await db.jobPost.count({ where: { id: { in: jobIds } } }),
    purchases: await db.purchase.count({ where: { id: { in: purIds } } }),
    purchaseItems: await db.purchaseItem.count({ where: { purchaseId: { in: purIds } } }),
    orders: await db.order.count({ where: { OR: [{ id: { in: ordIds } }, { clientId: { in: uids } }] } }),
    cartItems: await db.cartItem.count({ where: { userId: { in: uids } } }),
    activityEvents: await db.activityEvent.count({ where: { OR: [{ orderId: { in: ordIds } }, { purchaseId: { in: purIds } }, { projectId: { in: projIds } }, { actorId: { in: uids } }] } }),
    charges: await db.providerCharge.count({ where: { id: { in: chIds } } }),
    invoices: await db.invoice.count({ where: { id: { in: invIds } } }),
    stock: await db.providerStock.count({ where: { providerId: { in: provIds } } }),
    financeEntries: await db.financeEntry.count({ where: { userId: { in: uids } } }),
    financeConfigs: await db.financeConfig.count({ where: { userId: { in: uids } } }),
    // movimientos huérfanos (sin usuario): tiene que dar 0 siempre
    financeOrphans: Number((await db.$queryRaw`SELECT count(*)::int AS n FROM "FinanceEntry" f LEFT JOIN "User" u ON u.id = f."userId" WHERE u.id IS NULL`)[0]?.n ?? 0),
    notificationsMarked: await db.notification.count({ where: { OR: [{ title: { contains: MARK } }, { body: { contains: MARK } }] } }),
    reviews: await db.review.count({ where: { OR: [{ authorId: { in: uids } }, { targetUserId: { in: uids } }] } }),
    returns: await db.leftoverReturn.count({ where: { OR: [{ requesterId: { in: uids } }, { providerId: { in: provIds } }, { professionalId: { in: proIds } }, { projectId: { in: projIds } }] } }),
    searchEvents: await db.searchEvent.count({ where: { userId: { in: uids } } }),
    passwordResets: await db.passwordReset.count({ where: { userId: { in: uids } } }),
    verificationCodes: await db.verificationCode.count({ where: { OR: [{ userId: { in: uids } }, { target: { startsWith: EMAIL_PREFIX, endsWith: EMAIL_DOMAIN } }] } }),
    feedback: await db.feedback.count({ where: { userId: { in: uids } } }),
    analyticsEvents: await db.analyticsEvent.count({ where: { OR: [{ userId: { in: uids } }, { anonId: { startsWith: 'e2e-' } }] } }),
    analyticsSessions: await db.analyticsSession.count({ where: { OR: [{ userId: { in: uids } }, { anonId: { startsWith: 'e2e-' } }] } }),
    homySessions: await db.homySession.count({ where: { OR: [{ userId: { in: uids } }, { visitorHash: { in: visitorHashes } }] } }),
    homyRuns: await db.homyRun.count({ where: { OR: [{ userId: { in: uids } }, { ipHash: { in: ipHashes } }] } }),
    e2eProfessionalsVisible: await db.professionalProfile.count({ where: { user: { displayName: { startsWith: MARK } } } }),
    catalogE2E: await db.catalogElement.count({ where: { name: { startsWith: 'E2E-Q ' } } }),
    subscriptionCharges: await db.subscriptionCharge.count({ where: { OR: [{ providerId: { in: provIds } }, { mpPaymentId: { startsWith: 'e2e' } }] } }),
    subscriptionEvents: await db.subscriptionEvent.count({ where: { OR: [{ providerId: { in: provIds } }, { dedupeKey: { contains: ':e2e' } }] } }),
    storage: storageLeft.length,
  }
  leftovers.deletedAccounts = deletedNoted.length ? await db.user.count({ where: { id: { in: deletedNoted } } }) : 0
  const clean = Object.values(leftovers).every((v) => v === 0)
  if (clean && deletedNoted.length) writeFileSync(DELETED_FILE, '[]')
  log(clean ? 'Purga verificada: no queda ningún dato E2E.' : `Purga INCOMPLETA: ${JSON.stringify(leftovers)} ${storageLeft.join(' | ')}`)
  return { ...out, clean, leftovers }
}

// ═════════════════════════════ MAIN ═════════════════════════════
async function main() {
  if (PURGE_ONLY) {
    const r = await purge()
    await db.$disconnect()
    process.exit(r.clean === false ? 1 : 0)
  }
  console.log(`HomIA E2E integral → ${BASE}  (corrida ${TS})`)
  const ping = await fetch(`${BASE}/api/auth/me`).catch(() => null)
  if (!ping || ping.status !== 200) {
    console.error(`El server no responde en ${BASE}`)
    process.exit(2)
  }
  // ya hay restos de otra corrida: se limpian antes (idempotente)
  await purge({ quiet: true })
  const order = [['A', flowA], ['A', flowBaja], ['B', flowB], ['C', flowC], ['I', flowI], ['D', flowD], ['E', flowE], ['F', flowF], ['G', flowG], ['P', flowP], ['H', flowH], ['J', flowJ], ['K', flowK], ['L', flowL], ['M', flowM], ['N', flowN], ['O', flowO], ['Q', flowQ], ['R', flowR], ['S', flowS], ['T', flowT], ['B', flowTrialVencido], ['U', flowU], ['V', flowV]]
  const t0 = Date.now()
  let purgeResult = null
  try {
    for (const [k, fn] of order) {
      if (ONLY.length && k !== 'A' && !ONLY.includes(k)) continue
      const t = Date.now()
      console.log(`\n▶ ${k}. ${FLOWS[k]}`)
      try {
        await fn()
      } catch (e) {
        check(k, `el flujo ${k} terminó sin excepciones`, false, e instanceof Error ? `${e.message}\n${e.stack?.split('\n').slice(1, 3).join(' ')}` : String(e))
        if (k === 'A') throw e
      }
      console.log(`  ${results[k].pass} ok · ${results[k].fail} fallas · ${results[k].external} ajenos (${((Date.now() - t) / 1000).toFixed(1)} s)`)
    }
  } finally {
    const users = { cliente: C.email, profesional: P.email, profesional2: P2.email, proveedor: V.email, provA: VA.email, provB: VB.email, visitante: CV.email, password: PASSWORD, ids: { C: C.id, P: P.id, P2: P2.id, V: V.id, VA: VA.id, VB: VB.id, CV: CV.id, proId: P.proId, provId: V.provId }, S }
    writeFileSync(path.join(OUT_DIR, 'last-run.json'), JSON.stringify({ ...manifest, users, results }, null, 2))
    if (mpDoble.server) { mpDoble.server.close(); mpDoble.server = null }
    if (!NO_PURGE) purgeResult = await purge()
    else console.log(`\n--no-purge: datos E2E conservados. Credenciales en ${path.join(OUT_DIR, 'last-run.json')}`)
  }

  // resumen
  console.log('\n══════════════ RESUMEN ══════════════')
  let tp = 0, tf = 0, te = 0
  for (const k of Object.keys(FLOWS)) {
    const r = results[k]
    if (!r.pass && !r.fail && !r.external) continue
    tp += r.pass; tf += r.fail; te += r.external
    console.log(`${k}. ${FLOWS[k].padEnd(38)} ${String(r.pass).padStart(3)}/${r.pass + r.fail + r.external}${r.fail ? `  ✗ ${r.fail}` : ''}${r.external ? `  ⚠ ${r.external} ajenos` : ''}`)
  }
  console.log(`TOTAL ${tp}/${tp + tf + te} ok · ${tf} fallas · ${te} pendientes en archivos ajenos · ${((Date.now() - t0) / 1000).toFixed(0)} s`)
  if (purgeResult) console.log(`Purga: ${purgeResult.clean ? 'completa y verificada' : 'INCOMPLETA'}`)
  writeFileSync(path.join(OUT_DIR, 'last-results.json'), JSON.stringify({ ts: TS, results, purge: purgeResult }, null, 2))
  await db.$disconnect()
  process.exit(tf > 0 || (purgeResult && !purgeResult.clean) ? 1 : 0)
}

main().catch(async (e) => {
  console.error('Error fatal de la suite:', e)
  if (!NO_PURGE) await purge().catch((x) => console.error('purga falló', x))
  await db.$disconnect()
  process.exit(2)
})
