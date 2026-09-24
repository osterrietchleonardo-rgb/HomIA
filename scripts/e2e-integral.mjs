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
import { writeFileSync, mkdirSync } from 'node:fs'
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
const EMAIL_PREFIX = 'e2e-q-'
const EMAIL_DOMAIN = '@homia.test'
const PASSWORD = 'E2eTest2026'
const CABA = { lat: -34.6037, lng: -58.3816 }
// IP ficticia por corrida: el rate-limit en memoria del registro es por IP (8/h)
const RUN_IP = `10.${(TS >> 16) & 255}.${(TS >> 8) & 255}.${TS & 255}`
const OUT_DIR = process.env.E2E_OUT || path.join(os.tmpdir(), 'homia-e2e')
mkdirSync(OUT_DIR, { recursive: true })

// ─────────────────────────── reporte de checks ───────────────────────────
const FLOWS = {
  A: 'Auth y perfil', B: 'Proveedor: stock, catálogo IA, plan', C: 'Búsqueda y directorio', D: 'Trabajos y ofertas',
  E: 'Proyectos, materiales, facturas', F: 'Compra directa', G: 'Sobrantes', H: 'Reseñas', I: 'Mensajería',
  J: 'Notificaciones', K: 'Verificación DNI', L: 'Obras', M: 'CRM y favoritos', N: 'Seguridad transversal', O: 'IA',
  P: 'Carrito y pedidos multiproveedor',
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
  h['x-forwarded-for'] = actor?.ip || RUN_IP
  let body
  if (json !== undefined) {
    h['content-type'] = 'application/json'
    body = JSON.stringify(json)
  } else if (form) body = form
  const res = await fetch(BASE + url, { method, headers: h, body, redirect: 'manual' })
  const setCookies = typeof res.headers.getSetCookie === 'function' ? res.headers.getSetCookie() : []
  for (const c of setCookies) {
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
  profesional: ['', 'bolsa', 'materiales', 'pedidos', 'proyectos', 'presupuestos', 'crm', 'obras', 'vinculaciones', 'perfil'],
  proveedor: ['', 'stock', 'cobros', 'plan', 'crm', 'vinculaciones', 'perfil'],
}
const PANEL_COMMON = ['directorio', 'mensajes', 'verificacion', 'ayuda']
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
  const base = { password: PASSWORD, lat: CABA.lat, lng: CABA.lng, city: 'CABA', howFoundUs: 'otro' }
  const payloads = {
    cliente: { ...base, email: C.email, displayName: `${MARK} Cliente Q`, roles: ['cliente'] },
    profesional: { ...base, email: P.email, displayName: `${MARK} Pro Q`, roles: ['profesional'], professions: ['pintura'], experienceYears: 5, bio: `${MARK} pintor de prueba` },
    profesional2: { ...base, email: P2.email, displayName: `${MARK} Pro2 Q`, roles: ['profesional'], professions: ['pintura'] },
    proveedor: { ...base, email: V.email, displayName: `${MARK} Proveedor Q`, roles: ['proveedor'], businessName: `${MARK} Corralón Q`, address: 'Av. Corrientes 1234' },
  }
  for (const [a, key] of [[C, 'cliente'], [P, 'profesional'], [P2, 'profesional2'], [V, 'proveedor']]) {
    const r = await post(a, '/api/auth/register', payloads[key])
    st(F, `registro ${key}`, r, 201)
    check(F, `registro ${key} deja sesión (cookie)`, !!a.cookie)
    a.id = r.data?.user?.id
    check(F, `registro ${key} roles`, JSON.stringify(r.data?.user?.roles) === JSON.stringify(payloads[key].roles), brief(r))
  }
  if (!C.id || !P.id || !P2.id || !V.id) throw new Error('No se pudieron crear los usuarios E2E')

  // validaciones (IP distinta para no consumir el cupo del registro válido)
  const bad = new Actor('bad', null)
  bad.ip = `10.250.${(TS >> 8) & 255}.${TS & 255}`
  st(F, 'registro con email repetido', await post(bad, '/api/auth/register', payloads.cliente), 409)
  st(F, 'registro con contraseña sin números', await post(bad, '/api/auth/register', { ...payloads.cliente, email: `${EMAIL_PREFIX}bad1-${TS}${EMAIL_DOMAIN}`, password: 'soloLetrasLargas' }), 400)
  st(F, 'registro con contraseña corta', await post(bad, '/api/auth/register', { ...payloads.cliente, email: `${EMAIL_PREFIX}bad2-${TS}${EMAIL_DOMAIN}`, password: 'ab12' }), 400)
  st(F, 'registro con email inválido', await post(bad, '/api/auth/register', { ...payloads.cliente, email: 'no-es-email' }), 400)
  st(F, 'registro proveedor sin nombre de negocio', await post(bad, '/api/auth/register', { ...payloads.proveedor, email: `${EMAIL_PREFIX}bad3-${TS}${EMAIL_DOMAIN}`, businessName: '' }), 400)
  check(F, 'los registros inválidos no crean usuarios', (await db.user.count({ where: { email: { in: [1, 2, 3].map((n) => `${EMAIL_PREFIX}bad${n}-${TS}${EMAIL_DOMAIN}`) } } })) === 0)

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
  st(F, 'PUT perfil cliente válido', await put(C, '/api/profiles/me', { displayName: `${MARK} Cliente Q`, city: 'CABA', phone: '1122334455' }), 200)
  check(F, 'perfil cliente persistido', (await db.user.findUnique({ where: { id: C.id } })).phone === '1122334455')
  st(F, 'PUT perfil profesional válido', await put(P, '/api/profiles/me', { bio: `${MARK} Pintor con 5 años`, professions: ['pintura'], serviceRadiusKm: 20 }), 200)
  st(F, 'PUT perfil proveedor válido', await put(V, '/api/profiles/me', { description: `${MARK} corralón de prueba`, kind: 'Corralón' }), 200)
  const prov = await db.providerProfile.findUnique({ where: { id: V.provId } })
  check(F, 'tipo de negocio canonizado', prov.kind === 'corralon', `kind=${prov.kind}`)
  const meV = await get(V, '/api/profiles/me')
  check(F, 'GET perfil no expone tokens OAuth', meV.status === 200 && !JSON.stringify(meV.data).includes('mpOauthAccessToken'), brief(meV))
}

// ═════════════════════════════ B. PROVEEDOR ═════════════════════════════
async function flowB() {
  const F = 'B'
  const cat = await get(ANON, '/api/catalog')
  st(F, 'catálogo público', cat, 200)
  const allEls = (cat.data?.categories || []).flatMap((c) => c.elements.map((e) => ({ ...e, categoryId: c.id, categorySlug: c.slug })))
  check(F, 'catálogo con 20 categorías', cat.data?.categories?.length === 20, `n=${cat.data?.categories?.length}`)
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
}

// ═════════════════════════════ I. MENSAJERÍA ═════════════════════════════
async function flowI() {
  const F = 'I'
  const r1 = await post(P2, '/api/messages/conversations', { targetUserId: C.id })
  check(F, 'profesional NO puede iniciar chat con un cliente', r1.status === 403 && r1.data?.clientesFirst === true, brief(r1))
  const r2 = await post(V, '/api/messages/conversations', { targetUserId: C.id })
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
}

// ═════════════════════════════ F. COMPRA DIRECTA ═════════════════════════════
async function flowF() {
  const F = 'F'
  const q = async (id) => (await db.providerStock.findUnique({ where: { id } })).quantity
  st(F, 'compra sin sesión', await post(ANON, '/api/purchases', { stockId: S.stock1, quantity: 1 }), 401)
  st(F, 'compra con cantidad 0', await post(C, '/api/purchases', { stockId: S.stock1, quantity: 0 }), 400)
  st(F, 'compra de oferta inexistente', await post(C, '/api/purchases', { stockId: 'no-existe', quantity: 1 }), 404)
  st(F, 'compra con más cantidad que el stock', await post(C, '/api/purchases', { stockId: S.stock1, quantity: 99999 }), 409)
  st(F, 'proveedor no se compra a sí mismo', await post(V, '/api/purchases', { stockId: S.stock1, quantity: 1 }), 400)
  st(F, 'tipo de compra inválido', await post(C, '/api/purchases', { stockId: S.stock1, quantity: 1, type: 'robo' }), 400)
  const pm = await post(C, '/api/purchases', { stockId: S.stock2, quantity: 1, note: `${MARK} poco stock` })
  check(F, 'se puede pedir un producto "por agotar" (hay stock)', pm.status === 201, brief(pm))
  if (pm.data?.purchase?.id) {
    S.purchaseLow = pm.data.purchase.id
    await patch(C, `/api/purchases/${S.purchaseLow}`, { action: 'cancelar' })
  }

  const s1q0 = await q(S.stock1)
  const pa = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 5, note: `${MARK} compra A` })
  st(F, 'cliente compra 5 caños', pa, 201)
  S.purchaseA = pa.data?.purchase?.id
  check(F, 'compra pendiente de aprobación, sin reservar stock', pa.data?.purchase?.status === 'pendiente_aprobacion' && (await q(S.stock1)) === s1q0, brief(pa))
  const convCV = await db.conversation.findFirst({ where: { OR: [{ userAId: C.id, userBId: V.id }, { userAId: V.id, userBId: C.id }] }, include: { messages: true } })
  check(F, 'la compra abre el chat iniciado por el cliente', !!convCV && convCV.messages[0]?.senderId === C.id, JSON.stringify(convCV?.messages?.[0]))
  S.convCV = convCV?.id
  check(F, 'proveedor notificado del pedido', !!(await db.notification.findFirst({ where: { userId: V.id, type: 'nueva_compra' } })))
  const vr = await post(V, '/api/messages/conversations', { targetUserId: C.id })
  check(F, 'con el hilo abierto por el cliente, el proveedor puede responder', vr.status === 200 && vr.data?.conversation?.id === S.convCV, brief(vr))

  st(F, 'pagar antes de la aprobación', await patch(C, `/api/purchases/${S.purchaseA}`, { action: 'pagar_efectivo' }), 409)
  st(F, 'cliente no aprueba', await patch(C, `/api/purchases/${S.purchaseA}`, { action: 'aprobar' }), 403)
  st(F, 'tercero no toca la compra', await patch(P2, `/api/purchases/${S.purchaseA}`, { action: 'cancelar' }), 403)
  st(F, 'acción de compra inválida', await patch(V, `/api/purchases/${S.purchaseA}`, { action: 'regalar' }), 400)
  st(F, 'entregar sin aprobar', await patch(V, `/api/purchases/${S.purchaseA}`, { action: 'entregar' }), 409)
  const ap = await patch(V, `/api/purchases/${S.purchaseA}`, { action: 'aprobar' })
  st(F, 'proveedor aprueba', ap, 200)
  S.chargeA = ap.data?.chargeId
  check(F, 'aprobar reserva stock (−5)', (await q(S.stock1)) === s1q0 - 5)
  const chA = await db.providerCharge.findUnique({ where: { id: S.chargeA || 'x' } })
  check(F, 'aprobar emite cobro pendiente (venta directa)', chA?.status === 'pendiente' && chA?.projectId === null && chA?.amount === 5 * 1600, JSON.stringify(chA))
  const pA = await db.purchase.findUnique({ where: { id: S.purchaseA } })
  const days = (new Date(pA.reservationExpiresAt).getTime() - Date.now()) / 86400000
  check(F, 'compra: plazo de retiro de 7 días', days > 6.9 && days <= 7.01, `días=${days}`)
  st(F, 'aprobar dos veces', await patch(V, `/api/purchases/${S.purchaseA}`, { action: 'aprobar' }), 409)
  const mp = await patch(C, `/api/purchases/${S.purchaseA}`, { action: 'pagar_mp' })
  check(F, 'pagar con MP a proveedor sin MP conectado → 503 needsConfig honesto', mp.status === 503 && mp.data?.needsConfig === true && /efectivo/i.test(mp.data?.error || ''), brief(mp))
  st(F, 'proveedor no paga', await patch(V, `/api/purchases/${S.purchaseA}`, { action: 'pagar_efectivo' }), 403)
  const pe = await patch(C, `/api/purchases/${S.purchaseA}`, { action: 'pagar_efectivo' })
  check(F, 'cliente elige efectivo → cobro acordado', pe.status === 200 && pe.data?.chargeStatus === 'acordada_efectivo', brief(pe))
  st(F, 'proveedor confirma el efectivo', await patch(V, `/api/charges/${S.chargeA}`, {}), 200)
  check(F, 'compra pagada al confirmar el efectivo', (await db.purchase.findUnique({ where: { id: S.purchaseA } })).status === 'pagado')
  const en = await patch(V, `/api/purchases/${S.purchaseA}`, { action: 'entregar' })
  check(F, 'entregar una compra pagada no retrocede el estado', en.status === 200 && en.data?.status === 'pagado', brief(en))
  check(F, 'entrega registra consumo', !!(await db.stockMovement.findFirst({ where: { stockId: S.stock1, type: 'consumo', note: { contains: S.purchaseA } } })))
  st(F, 'entregar dos veces', await patch(V, `/api/purchases/${S.purchaseA}`, { action: 'entregar' }), 409)
  st(F, 'no se cancela una compra pagada', await patch(C, `/api/purchases/${S.purchaseA}`, { action: 'cancelar' }), 409)

  // reserva cancelada por el cliente → libera stock
  const pb = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 3, type: 'reserva' })
  S.purchaseB = pb.data?.purchase?.id
  check(F, 'reserva creada con tipo reserva', pb.data?.purchase?.type === 'reserva', brief(pb))
  const apB = await patch(V, `/api/purchases/${S.purchaseB}`, { action: 'aprobar' })
  const pB = await db.purchase.findUnique({ where: { id: S.purchaseB } })
  const hrs = (new Date(pB.reservationExpiresAt).getTime() - Date.now()) / 3600000
  check(F, 'reserva: 48 h', apB.status === 200 && hrs > 47.9 && hrs <= 48.01, `h=${hrs}`)
  const beforeCancel = await q(S.stock1)
  st(F, 'cliente cancela la reserva aprobada', await patch(C, `/api/purchases/${S.purchaseB}`, { action: 'cancelar' }), 200)
  check(F, 'cancelar libera el stock (+3)', (await q(S.stock1)) === beforeCancel + 3)
  check(F, 'cancelar anula el cobro', (await db.providerCharge.findUnique({ where: { id: apB.data?.chargeId || 'x' } }))?.status === 'anulada')
  st(F, 'cancelar dos veces', await patch(C, `/api/purchases/${S.purchaseB}`, { action: 'cancelar' }), 409)

  // rechazo del proveedor
  const pc = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 2 })
  S.purchaseC = pc.data?.purchase?.id
  const beforeRej = await q(S.stock1)
  st(F, 'proveedor rechaza con motivo', await patch(V, `/api/purchases/${S.purchaseC}`, { action: 'rechazar', reason: `${MARK} Sin retiro hoy` }), 200)
  const pC = await db.purchase.findUnique({ where: { id: S.purchaseC } })
  check(F, 'rechazo guarda motivo y no toca stock', pC.status === 'rechazado' && pC.rejectionReason?.includes('Sin retiro') && (await q(S.stock1)) === beforeRej)

  // entregado sin pagar → el cliente todavía puede pagar
  const pe2 = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 1 })
  S.purchaseE = pe2.data?.purchase?.id
  const apE = await patch(V, `/api/purchases/${S.purchaseE}`, { action: 'aprobar' })
  const enE = await patch(V, `/api/purchases/${S.purchaseE}`, { action: 'entregar' })
  check(F, 'entregar sin pago → "entregado"', enE.data?.status === 'entregado', brief(enE))
  const payE = await patch(C, `/api/purchases/${S.purchaseE}`, { action: 'pagar_efectivo' })
  st(F, 'cliente acuerda efectivo de un pedido ya entregado', payE, 200)
  st(F, 'proveedor confirma el efectivo del entregado', await patch(V, `/api/charges/${apE.data?.chargeId}`, {}), 200)
  check(F, 'entregado + cobro confirmado → pagado', (await db.purchase.findUnique({ where: { id: S.purchaseE } })).status === 'pagado')

  // vencimiento por cron
  const pd = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 1, type: 'reserva' })
  S.purchaseD = pd.data?.purchase?.id
  const apD = await patch(V, `/api/purchases/${S.purchaseD}`, { action: 'aprobar' })
  await db.purchase.update({ where: { id: S.purchaseD }, data: { reservationExpiresAt: new Date(Date.now() - 60_000) } })
  const beforeCron = await q(S.stock1)
  st(F, 'cron sin secreto', await get(ANON, '/api/cron/reservations'), 401)
  st(F, 'cron con secreto incorrecto', await get(ANON, '/api/cron/reservations', { headers: { authorization: 'Bearer nope' } }), 401)
  // el cron toca TODAS las reservas vencidas: solo se corre si no hay reservas vencidas ajenas
  const ajenas = await db.purchase.count({ where: { status: 'aprobado', reservationExpiresAt: { lt: new Date() }, id: { not: S.purchaseD } } })
  if (!process.env.CRON_SECRET) {
    check(F, 'CRON_SECRET configurado para probar el cron', false, 'falta CRON_SECRET en .env')
  } else if (ajenas > 0) {
    check(F, 'cron no corrido: hay reservas vencidas ajenas (no se tocan datos reales)', true)
    await patch(V, `/api/purchases/${S.purchaseD}`, { action: 'cancelar' })
  } else {
    const cr = await get(ANON, '/api/cron/reservations', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
    check(F, 'cron vence la reserva', cr.status === 200 && cr.data?.cancelled >= 1, brief(cr))
    const pD = await db.purchase.findUnique({ where: { id: S.purchaseD } })
    check(F, 'reserva vencida → cancelada con motivo', pD.status === 'cancelado' && /vencida/i.test(pD.rejectionReason || ''), JSON.stringify(pD))
    check(F, 'cron devuelve el stock', (await q(S.stock1)) === beforeCron + 1)
    check(F, 'cron anula el cobro', (await db.providerCharge.findUnique({ where: { id: apD.data?.chargeId || 'x' } }))?.status === 'anulada')
    check(F, 'cron avisa a las dos partes', (await db.notification.count({ where: { type: 'reserva_vencida', userId: { in: [C.id, V.id] } } })) >= 2)
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

  // materiales de proyecto pagados
  const e1 = await get(P, `/api/returns/eligible?projectId=${S.project1}`)
  const e1m = (e1.data?.items || []).find((i) => i.materialId === S.m1)
  check(F, 'elegibles del proyecto (factura pagada en efectivo)', e1m?.remaining === 10 && e1m?.invoiceId === S.inv1, brief(e1))
  check(F, 'material sin proveedor no es elegible', !(e1.data?.items || []).some((i) => i.materialId === S.mAlt))
  const e2 = await get(C, `/api/returns/eligible?projectId=${S.project2}`)
  check(F, 'elegibles del proyecto modo B (cobro del proveedor pagado)', (e2.data?.items || []).some((i) => i.materialId === S.m6 && i.chargeId === S.charge2), brief(e2))
  st(F, 'elegibles de proyecto ajeno', await get(P2, `/api/returns/eligible?projectId=${S.project1}`), 403)
  const mItem = { materialId: S.m1, elementId: S.E3.id, condition: 'sin_abrir', photoUrl: photoP }
  st(F, 'devolución de material no pagado (proyecto 3 cancelado)', await post(C, '/api/returns', { projectId: S.project3, items: [{ ...mItem, materialId: 'x', qty: 1 }] }), 404)
  const rp = await post(P, '/api/returns', { projectId: S.project1, items: [{ ...mItem, qty: 3 }] })
  st(F, 'el profesional pide devolver sobrantes del proyecto', rp, 201)
  S.retP = rp.data?.return?.id
  st(F, 'proveedor rechaza con motivo', await patch(V, `/api/returns/${S.retP}`, { action: 'rechazar', note: `${MARK} Material abierto` }), 200)
  const nP = await db.notification.findFirst({ where: { userId: P.id, type: 'devolucion_rechazada' } })
  check(F, 'el pro (solicitante) recibe aviso con link a SU panel', !!nP && !linkProblem(nP.link, ['profesional']), `link=${nP?.link}`)
  const rc = await post(C, '/api/returns', { projectId: S.project1, items: [{ ...mItem, photoUrl: photo, qty: 2 }] })
  st(F, 'el cliente pide devolver sobrantes del proyecto', rc, 201)
  S.retC = rc.data?.return?.id
  st(F, 'proveedor acepta todo', await patch(V, `/api/returns/${S.retC}`, { action: 'aceptar' }), 200)
  const s3b = (await db.providerStock.findUnique({ where: { id: S.stock3 } })).quantity
  const recC = await patch(V, `/api/returns/${S.retC}`, { action: 'recibir', items: [{ id: rc.data?.return?.items?.[0]?.id, qtyReceived: 1 }] })
  check(F, 'recibir menos de lo aceptado prorratea el reembolso', recC.status === 200 && recC.data?.refundTotal === 2000, brief(recC))
  check(F, 'stock del látex vuelve (+1)', (await db.providerStock.findUnique({ where: { id: S.stock3 } })).quantity === s3b + 1)
  st(F, 'reembolso efectivo (proyecto)', await patch(V, `/api/returns/${S.retC}`, { action: 'reembolsar_efectivo' }), 200)
  // cron: confirmación automática a las 72 h + recordatorio al proveedor por devolución sin responder
  const H72 = 72 * 3600_000
  await db.leftoverReturn.update({ where: { id: S.retC }, data: { refundedAt: new Date(Date.now() - H72 - 3600_000) } })
  const rY = await post(C, '/api/returns', { purchaseId: S.purchaseA, items: [{ ...item, qty: 1 }] })
  st(F, 'devolución que el proveedor no responde', rY, 201)
  S.retY = rY.data?.return?.id
  if (S.retY) await db.leftoverReturn.update({ where: { id: S.retY }, data: { requestedAt: new Date(Date.now() - H72 - 3600_000) } })
  const lim = new Date(Date.now() - H72)
  const ajenasConf = await db.leftoverReturn.count({ where: { status: 'reembolsada', refundConfirmedAt: null, refundedAt: { lt: lim }, OR: [{ paymentMethod: null }, { paymentMethod: { not: 'mercadopago' } }], id: { not: S.retC } } })
  const ajenasRec = await db.leftoverReturn.count({ where: { status: 'solicitada', reminderSentAt: null, requestedAt: { lt: lim }, id: { not: S.retY || 'x' } } })
  const ajenasRes = await db.purchase.count({ where: { status: 'aprobado', reservationExpiresAt: { lt: new Date() } } })
  if (!process.env.CRON_SECRET || ajenasConf + ajenasRec + ajenasRes > 0) {
    check(F, 'cron de sobrantes no corrido: tocaría datos ajenos (o falta CRON_SECRET)', true)
  } else {
    const cr = await get(ANON, '/api/cron/reservations', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
    const rc72 = await db.leftoverReturn.findUnique({ where: { id: S.retC } })
    check(F, 'cron: confirma solo el reembolso en efectivo a las 72 h', cr.status === 200 && cr.data?.autoConfirmed === 1 && rc72?.refundConfirmedBy === 'automatico' && !!rc72?.refundConfirmedAt, brief(cr))
    const nRec = await db.notification.count({ where: { userId: V.id, type: 'devolucion_recordatorio' } })
    check(F, 'cron: un recordatorio al proveedor por la devolución sin responder', cr.data?.reminded === 1 && nRec === 1 && !!(await db.leftoverReturn.findUnique({ where: { id: S.retY } }))?.reminderSentAt, brief(cr))
    const cr2 = await get(ANON, '/api/cron/reservations', { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` } })
    check(F, 'cron: el recordatorio no se repite', cr2.data?.reminded === 0 && (await db.notification.count({ where: { userId: V.id, type: 'devolucion_recordatorio' } })) === 1, brief(cr2))
  }
  if (S.retY) st(F, 'el cliente cancela la devolución sin responder', await patch(C, `/api/returns/${S.retY}`, { action: 'cancelar' }), 200)
  st(F, 'devolver todo el material otra vez (tope)', await post(C, '/api/returns', { projectId: S.project1, items: [{ ...mItem, photoUrl: photo, qty: 10 }] }), 409)
  // cancelación por el solicitante
  const rx = await post(C, '/api/returns', { projectId: S.project2, items: [{ materialId: S.m6, elementId: S.E3.id, condition: 'sin_abrir', photoUrl: photo, qty: 1 }] })
  st(F, 'devolución de material modo B', rx, 201)
  S.retX = rx.data?.return?.id
  st(F, 'el proveedor no cancela (solo el solicitante)', await patch(V, `/api/returns/${S.retX}`, { action: 'cancelar' }), 403)
  st(F, 'el solicitante cancela', await patch(C, `/api/returns/${S.retX}`, { action: 'cancelar' }), 200)
  st(F, 'cancelar dos veces', await patch(C, `/api/returns/${S.retX}`, { action: 'cancelar' }), 409)

  const lr = await get(C, '/api/returns')
  check(F, 'mis devoluciones (solicitante) con origen legible', (lr.data?.returns || []).some((r) => r.id === S.ret1 && r.origin?.kind === 'compra'), brief(lr))
  const lv = await get(V, '/api/returns?role=proveedor')
  check(F, 'devoluciones recibidas (proveedor)', (lv.data?.returns || []).length >= 4, brief(lv))
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
    [P.id]: ['nuevo_trabajo', 'presupuesto_aceptado', 'contratacion', 'material_aprobar', 'material_rechazar', 'factura_efectivo_acordado', 'vinculacion_activada', 'nueva_reseña', 'message', 'devolucion_rechazada'],
    [P2.id]: ['nuevo_trabajo', 'presupuesto_rechazado'],
    [V.id]: ['vinculacion_solicitada', 'nueva_compra', 'cobro_efectivo_acordado', 'devolucion_solicitada', 'devolucion_cancelada', 'nueva_reseña', 'compra_cancelada'],
  }
  const actors = [C, P, P2, V]
  for (const a of actors) {
    const r = await get(a, '/api/notifications')
    st(F, `notificaciones de ${a.key}`, r, 200)
    const list = r.data?.notifications || []
    const types = new Set(list.map((n) => n.type))
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
  const readPriv = ['/api/projects', `/api/projects/${S.project1}`, `/api/invoices/${S.inv1}`, `/api/invoices/${S.inv1}/pdf`, '/api/purchases', '/api/returns', '/api/messages/conversations', '/api/messages/unread', '/api/crm/pipelines', '/api/favorites', '/api/provider/charges', '/api/provider/links', '/api/provider/plan', '/api/verification/dni', `/api/charges/${S.charge2}`, '/api/profiles/me', '/api/cart', '/api/orders', `/api/orders/${S.orderP || x}`]
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
// 2 proveedores descartables (A y B) con stock, el cliente de la suite y un visitante
// que crea su cuenta. Carrito → pedido con un sub-pedido por proveedor → A aprueba
// (reserva atómica), B rechaza → el cliente paga A en efectivo → A confirma y entrega.
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
  const base = { password: PASSWORD, lat: CABA.lat, lng: CABA.lng, city: 'CABA', howFoundUs: 'otro' }
  for (const [a, name] of [[VA, 'Ferretería A'], [VB, 'Corralón B']]) {
    const r = await post(a, '/api/auth/register', { ...base, email: a.email, displayName: `${MARK} Prov ${name}`, roles: ['proveedor'], businessName: `${MARK} ${name}`, address: 'Av. Siempreviva 742' })
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
  const rv = await post(CV, '/api/auth/register', { ...base, email: CV.email, displayName: `${MARK} Visitante`, roles: ['cliente'] })
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
  st(F, 'agregar más que el stock', await post(C, '/api/cart', { stockId: sA1, quantity: 51 }), 409)
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

  // línea bloqueada: sin stock → no se puede confirmar hasta sacarla
  await db.providerStock.update({ where: { id: sB2 }, data: { quantity: 0, status: 'agotado' } })
  const blk = await get(C, '/api/cart')
  check(F, 'ítem sin stock queda marcado en el carrito', blk.data?.cart?.blocked === true && blk.data?.cart?.groups?.find((g) => g.provider.id === VB.provId)?.items?.[0]?.problem === 'sin_stock', brief(blk))
  const ob = await post(C, '/api/orders', {})
  check(F, 'confirmar con un ítem sin stock → 409 que dice cuál', ob.status === 409 && /Membrana/i.test(ob.data?.error || '') && (ob.data?.problems || []).length === 1, brief(ob))
  await db.providerStock.update({ where: { id: sB2 }, data: { quantity: 10, status: 'disponible' } })

  // ── confirmar: 1 pedido con 2 sub-pedidos, stock intacto ──
  const before = { a1: await q(sA1), a3: await q(sA3), b2: await q(sB2) }
  const od = await post(C, '/api/orders', { types: { [VB.provId]: 'reserva' }, note: `${MARK} paso el sábado` })
  st(F, 'confirmar el carrito', od, 201)
  S.orderP = od.data?.order?.id
  check(F, 'número de pedido PED-AAAA-NNNNNN', /^PED-\d{4}-\d{6}$/.test(od.data?.order?.number || ''), brief(od))
  const subs = await db.purchase.findMany({ where: { orderId: S.orderP || 'x' }, include: { items: true } })
  const pA = subs.find((p) => p.providerId === VA.provId)
  const pB = subs.find((p) => p.providerId === VB.provId)
  S.purPA = pA?.id
  S.purPB = pB?.id
  check(F, '1 pedido con 2 sub-pedidos y sus ítems', subs.length === 2 && pA?.items?.length === 2 && pB?.items?.length === 1, JSON.stringify(subs.map((s) => ({ p: s.providerId, n: s.items.length }))))
  check(F, 'total de cada sub-pedido = suma de sus ítems (8000 y 25000)', pA?.total === 8000 && pB?.total === 25000 && pA.items.reduce((a, i) => a + i.total, 0) === 8000, JSON.stringify(subs.map((s) => s.total)))
  check(F, 'tipo por proveedor (A compra, B reserva) y nota', pA?.type === 'compra' && pB?.type === 'reserva' && !!pA?.note?.includes('sábado'), JSON.stringify(subs.map((s) => [s.type, s.note])))
  check(F, 'el carrito quedó vacío', (await db.cartItem.count({ where: { userId: C.id } })) === 0)
  check(F, 'el stock NO se toca hasta aprobar', (await q(sA1)) === before.a1 && (await q(sA3)) === before.a3 && (await q(sB2)) === before.b2)
  check(F, 'cada proveedor notificado de su parte', !!(await db.notification.findFirst({ where: { userId: VA.id, type: 'nueva_compra' } })) && !!(await db.notification.findFirst({ where: { userId: VB.id, type: 'nueva_compra' } })))
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

  // ── A aprueba: reserva atómica de TODOS los ítems ──
  await db.providerStock.update({ where: { id: sA3 }, data: { quantity: 1 } })
  const apShort = await patch(VA, `/api/purchases/${S.purPA}`, { action: 'aprobar' })
  check(F, 'si un ítem no alcanza → 409 que dice cuál', apShort.status === 409 && /Látex/i.test(apShort.data?.error || '') && apShort.data?.item?.available === 1, brief(apShort))
  check(F, '…y no se reservó nada (rollback)', (await q(sA1)) === before.a1 && (await q(sA3)) === 1 && (await db.purchase.findUnique({ where: { id: S.purPA } })).status === 'pendiente_aprobacion')
  await db.providerStock.update({ where: { id: sA3 }, data: { quantity: before.a3 } })
  const apA = await patch(VA, `/api/purchases/${S.purPA}`, { action: 'aprobar' })
  st(F, 'proveedor A aprueba su parte', apA, 200)
  S.chargePA = apA.data?.chargeId
  check(F, 'reserva de todos los ítems (−4 caños, −2 látex)', (await q(sA1)) === before.a1 - 4 && (await q(sA3)) === before.a3 - 2)
  check(F, 'un movimiento de reserva por ítem', (await db.stockMovement.count({ where: { stockId: { in: [sA1, sA3] }, type: 'reserva', note: { contains: S.purPA } } })) === 2)
  check(F, 'cobro emitido por el total del sub-pedido', (await db.providerCharge.findUnique({ where: { id: S.chargePA || 'x' } }))?.amount === 8000)
  st(F, 'aprobar dos veces', await patch(VA, `/api/purchases/${S.purPA}`, { action: 'aprobar' }), 409)
  check(F, 'cliente notificado de la aprobación con link a su pedido', !!(await db.notification.findFirst({ where: { userId: C.id, type: 'compra_aprobada', link: `#/panel/cliente/pedidos/${S.orderP}` } })))

  // ── B rechaza el pedido entero con motivo ──
  st(F, 'proveedor B rechaza su parte con motivo', await patch(VB, `/api/purchases/${S.purPB}`, { action: 'rechazar', reason: `${MARK} sin retiro este mes` }), 200)
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
  const det = await get(C, `/api/orders/${S.orderP}`)
  const sum = det.data?.order?.summary
  check(F, 'resumen: 1 de 1 proveedor activo pagado, nada pendiente', sum?.activeProviders === 1 && sum?.paidProviders === 1 && sum?.pendingAmount === 0 && sum?.status === 'completo', JSON.stringify(sum))
  check(F, 'detalle con estados distintos por proveedor', (det.data?.order?.purchases || []).map((p) => p.status).sort().join(',') === 'pagado,rechazado', brief(det))
  const evs = det.data?.events || []
  const types = evs.map((e) => e.type)
  const need = ['pedido_creado', 'subpedido_creado', 'aprobado', 'rechazado', 'pago_efectivo_acordado', 'pagado', 'entregado']
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
  const od2 = await post(C, '/api/orders', {})
  const p2 = await db.purchase.findFirst({ where: { orderId: od2.data?.order?.id || 'x' } })
  st(F, 'pedido de 2 ítems para el vencimiento aprobado', await patch(VA, `/api/purchases/${p2?.id}`, { action: 'aprobar' }), 200)
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
  st(F, 'A aprueba el pedido a pagar por MP', await patch(VA, `/api/purchases/${p3?.id}`, { action: 'aprobar' }), 200)
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

// ═══════════════ B (final). PRUEBA VENCIDA DEL PROVEEDOR ═══════════════
// Se corre al final: deja al proveedor E2E sin plan y verifica que no opere ni aparezca.
async function flowTrialVencido() {
  const F = 'B'
  const pend = await post(C, '/api/purchases', { stockId: S.stock1, quantity: 1, note: `${MARK} antes del vencimiento` })
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
  check(F, 'vencido: no aprueba pedidos', ap.status === 403 && ap.data?.needsPlan === true, brief(ap))
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

// ═════════════════════════════ PURGA ═════════════════════════════
async function purge({ quiet = false } = {}) {
  const log = (...m) => { if (!quiet) console.log(...m) }
  const users = await db.user.findMany({ where: { email: { startsWith: EMAIL_PREFIX, endsWith: EMAIL_DOMAIN } }, select: { id: true, email: true } })
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
  await n('leftoverReturns', db.leftoverReturn.deleteMany({ where: { OR: [{ requesterId: { in: uids } }, { providerId: { in: provIds } }, { projectId: { in: projIds } }, { purchaseId: { in: purIds } }] } }))
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
  await n('identityDocuments', db.identityDocument.deleteMany({ where: { userId: { in: uids } } }))
  await n('stock', db.providerStock.deleteMany({ where: { providerId: { in: provIds } } }))
  await n('pipelines', db.crmPipeline.deleteMany({ where: { ownerId: { in: uids } } }))
  await n('professionalProfiles', db.professionalProfile.deleteMany({ where: { id: { in: proIds } } }))
  await n('providerProfiles', db.providerProfile.deleteMany({ where: { id: { in: provIds } } }))
  await n('users', db.user.deleteMany({ where: { id: { in: uids } } }))
  // elementos de catálogo creados por la suite (solo si nada real los usa)
  let els = 0
  for (const e of extraEls) {
    const used = (await db.providerStock.count({ where: { elementId: e.id } })) + (await db.projectMaterial.count({ where: { elementId: e.id } })) + (await db.leftoverItem.count({ where: { elementId: e.id } }))
    if (!used) { await db.catalogElement.delete({ where: { id: e.id } }); els++ }
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
    for (const bucket of ['homia-uploads', 'dni-docs']) {
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
    notificationsMarked: await db.notification.count({ where: { OR: [{ title: { contains: MARK } }, { body: { contains: MARK } }] } }),
    reviews: await db.review.count({ where: { OR: [{ authorId: { in: uids } }, { targetUserId: { in: uids } }] } }),
    returns: await db.leftoverReturn.count({ where: { requesterId: { in: uids } } }),
    searchEvents: await db.searchEvent.count({ where: { userId: { in: uids } } }),
    homySessions: await db.homySession.count({ where: { OR: [{ userId: { in: uids } }, { visitorHash: { in: visitorHashes } }] } }),
    homyRuns: await db.homyRun.count({ where: { OR: [{ userId: { in: uids } }, { ipHash: { in: ipHashes } }] } }),
    e2eProfessionalsVisible: await db.professionalProfile.count({ where: { user: { displayName: { startsWith: MARK } } } }),
    catalogE2E: await db.catalogElement.count({ where: { name: { startsWith: 'E2E-Q ' } } }),
    storage: storageLeft.length,
  }
  const clean = Object.values(leftovers).every((v) => v === 0)
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
  const order = [['A', flowA], ['B', flowB], ['C', flowC], ['I', flowI], ['D', flowD], ['E', flowE], ['F', flowF], ['G', flowG], ['P', flowP], ['H', flowH], ['J', flowJ], ['K', flowK], ['L', flowL], ['M', flowM], ['N', flowN], ['O', flowO], ['B', flowTrialVencido]]
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
