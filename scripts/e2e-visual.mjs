#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// HomIA — Recorrido visual E2E (Playwright) de TODAS las pantallas por rol.
//
// Uso (desde la raíz del repo, con el server levantado):
//   PLAYWRIGHT_DIR=<carpeta con node_modules/playwright> node scripts/e2e-visual.mjs
//     [--base http://localhost:3031] [--out <carpeta de capturas>] [--data <last-run.json>] [--keep]
//
// Sin --data: corre primero `scripts/e2e-integral.mjs --no-purge` para tener datos
// reales (proyectos, compras, devoluciones, reseñas…) y al final purga todo con
// `--purge-only` (salvo --keep).
//
// Por pantalla, en 390×844 (y las principales también en 1280×800):
//   · captura de pantalla
//   · errores de consola y excepciones de página
//   · overflow horizontal (documento y contenedor del panel #homy-app-main)
//   · textos basura visibles: "undefined", "NaN", "[object Object]"
//   · en el panel móvil: el botón "Más" del bottom nav abre el Sheet
// ─────────────────────────────────────────────────────────────────────────────
import 'dotenv/config'
import { createRequire } from 'node:module'
import { spawnSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import pkg from '@prisma/client'

const argv = process.argv.slice(2)
const argVal = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : undefined }
const BASE = (argVal('--base') || process.env.E2E_BASE || 'http://localhost:3031').replace(/\/+$/, '')
const OUT = argVal('--out') || process.env.E2E_SHOTS || path.join(os.tmpdir(), 'homia-e2e', 'shots')
const KEEP = argv.includes('--keep')
let DATA = argVal('--data')
mkdirSync(OUT, { recursive: true })

function loadPlaywright() {
  const dirs = [process.env.PLAYWRIGHT_DIR, process.cwd()].filter(Boolean)
  for (const d of dirs) {
    try {
      return createRequire(path.join(d, 'package.json'))('playwright')
    } catch { /* probar la siguiente */ }
  }
  throw new Error('No encuentro playwright: seteá PLAYWRIGHT_DIR con la carpeta que tiene node_modules/playwright')
}
const { chromium } = loadPlaywright()
const { PrismaClient } = pkg
const db = new PrismaClient()

// ── datos: corrida de la suite API sin purga ──
const repo = process.cwd()
if (!DATA) {
  console.log('Generando datos reales con la suite API (--no-purge)…')
  const r = spawnSync(process.execPath, ['scripts/e2e-integral.mjs', '--no-purge', '--base', BASE], { cwd: repo, stdio: 'inherit' })
  if (r.status === 2) { console.error('La suite API no pudo generar datos'); process.exit(2) }
  DATA = path.join(process.env.E2E_OUT || path.join(os.tmpdir(), 'homia-e2e'), 'last-run.json')
}
if (!existsSync(DATA)) { console.error(`No existe ${DATA}`); process.exit(2) }
const run = JSON.parse(readFileSync(DATA, 'utf8'))
const U = run.users
const S = U.S
// el recorrido muestra al proveedor operando (la suite API lo deja con la prueba vencida)
await db.providerProfile.update({ where: { id: U.ids.provId }, data: { trialEndsAt: new Date(Date.now() + 14 * 86400000) } }).catch(() => {})

const MOBILE = { width: 390, height: 844 }
const DESKTOP = { width: 1280, height: 800 }
const findings = []
const pages = []

const PANEL = {
  cliente: ['', 'publicar', 'trabajos', `trabajos/${S.job}`, 'materiales', 'materiales?tab=compras', 'proyectos', `proyectos/${S.project1}`, `proyectos/${S.project2}`, 'facturas', 'perfil', 'directorio', 'mensajes', 'verificacion', 'ayuda'],
  profesional: ['', 'bolsa', 'materiales', 'proyectos', `proyectos/${S.project1}`, `proyectos/${S.project2}`, 'presupuestos', 'crm', 'obras', 'vinculaciones', 'perfil', 'directorio', 'mensajes', 'verificacion', 'ayuda'],
  proveedor: ['', 'stock', 'cobros', 'cobros?tab=ventas', 'cobros?tab=devoluciones', 'plan', 'crm', 'vinculaciones', 'perfil', 'directorio', 'mensajes', 'verificacion', 'ayuda'],
}
const PUBLIC = ['/', '/buscar', '/buscar?mode=profesional&q=caño', '/directorio', '/materiales', '/materiales?q=caño', `/profesional/${U.ids.proId}`, `/proveedor/${U.ids.provId}`, `/trabajo/${S.job}`, '/ayuda', '/mensajes', '/notificaciones']
// hilo propio de cada rol (el cliente con el pro y con el proveedor)
const CONV = { cliente: [S.convCP, S.convCV], profesional: [S.convCP], proveedor: [S.convCV] }
const ANON_PAGES = ['/', '/buscar', '/directorio', '/materiales', '/ayuda', `/trabajo/${S.job}`, `/profesional/${U.ids.proId}`, '/ingresar', '/registrarse', '/panel/cliente']
const DESKTOP_MAIN = {
  cliente: ['/panel/cliente', `/panel/cliente/proyectos/${S.project1}`, '/panel/cliente/materiales?tab=compras', '/panel/cliente/facturas', '/materiales?q=caño'],
  profesional: ['/panel/profesional', '/panel/profesional/bolsa', `/panel/profesional/proyectos/${S.project1}`, '/panel/profesional/presupuestos'],
  proveedor: ['/panel/proveedor', '/panel/proveedor/stock', '/panel/proveedor/cobros?tab=devoluciones', '/panel/proveedor/plan'],
  anon: ['/', '/directorio', '/materiales'],
}

const slug = (s) => (s.replace(/^\//, '') || 'home').replace(/[^a-zA-Z0-9]+/g, '-').replace(/[a-z0-9]{24,}/gi, 'id').slice(0, 60)

async function newCtx(browser, viewport, actor) {
  const ctx = await browser.newContext({
    viewport, isMobile: viewport.width < 600, hasTouch: viewport.width < 600, deviceScaleFactor: 1,
    locale: 'es-AR', geolocation: { latitude: -34.6037, longitude: -58.3816 }, permissions: ['geolocation'],
  })
  if (actor) {
    const r = await ctx.request.post(`${BASE}/api/auth/login`, { data: { email: actor.email, password: U.password } })
    if (r.status() !== 200) throw new Error(`login ${actor.email} → ${r.status()}`)
  }
  return ctx
}

async function visit(ctx, who, vp, url) {
  const page = await ctx.newPage()
  const errors = []
  page.on('console', (m) => {
    if (m.type() !== 'error') return
    const t = m.text()
    // ruido del entorno de desarrollo que no es de la app
    if (/Download the React DevTools|\[Fast Refresh\]|webpack-hmr|__nextjs|favicon/i.test(t)) return
    // visitante: los perfiles piden sesión (401) y la pantalla muestra el gate de acceso: es lo esperado
    if (who === 'visitante' && /status of 401/.test(t)) return
    errors.push(`console: ${t.slice(0, 300)}`)
  })
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message.slice(0, 300)}`))
  page.on('response', (r) => {
    const u = r.url()
    if (u.startsWith(BASE) && u.includes('/api/') && r.status() >= 500) errors.push(`HTTP ${r.status()} ${u.replace(BASE, '')}`)
  })
  const t0 = Date.now()
  await page.goto(`${BASE}${url}`, { waitUntil: 'domcontentloaded', timeout: 90_000 }).catch((e) => errors.push(`goto: ${e.message.slice(0, 200)}`))
  // la SPA carga por dynamic import + fetch: esperar a que no quede un "Cargando…"
  await page.waitForLoadState('networkidle', { timeout: 20_000 }).catch(() => {})
  await page.waitForFunction(() => !/Cargando|Verificando tu sesión/i.test(document.body?.innerText || ''), null, { timeout: 20_000 }).catch(() => {})
  await page.waitForTimeout(1200)
  const m = await page.evaluate(() => {
    const doc = document.documentElement
    const main = document.getElementById('homy-app-main')
    const text = document.body?.innerText || ''
    const junk = [...new Set((text.match(/\bundefined\b|\bNaN\b|\[object Object\]/g) || []))]
    // elementos que se salen del viewport a la derecha (el culpable del overflow)
    const culprits = []
    if (doc.scrollWidth > window.innerWidth + 1 || (main && main.scrollWidth > main.clientWidth + 1)) {
      for (const el of document.querySelectorAll('body *')) {
        const r = el.getBoundingClientRect()
        if (r.width > 0 && r.right > window.innerWidth + 1 && getComputedStyle(el).position !== 'fixed') {
          culprits.push(`${el.tagName.toLowerCase()}${el.className && typeof el.className === 'string' ? '.' + el.className.split(' ').slice(0, 3).join('.') : ''} (right=${Math.round(r.right)})`)
          if (culprits.length >= 3) break
        }
      }
    }
    // texto "aplastado": párrafos/títulos de 4+ palabras partidos en 3+ renglones de menos de 110px
    // (típico de un flex sin wrap donde un botón se come el ancho)
    const squeezed = []
    for (const el of document.querySelectorAll('p:not(.homy-kpi-label), h1, h2, h3')) {
      const r = el.getBoundingClientRect()
      const words = (el.innerText || '').trim().split(/\s+/).filter(Boolean).length
      const lh = parseFloat(getComputedStyle(el).lineHeight) || 18
      // 3+ renglones en menos de 110px: el texto se partió palabra por palabra
      if (r.width > 0 && r.width < 110 && r.height >= lh * 2.6 && words >= 4) {
        squeezed.push(`"${(el.innerText || '').trim().slice(0, 40)}…" (${Math.round(r.width)}px)`)
        if (squeezed.length >= 3) break
      }
    }
    return {
      squeezed,
      docOverflow: doc.scrollWidth - window.innerWidth,
      mainOverflow: main ? main.scrollWidth - main.clientWidth : 0,
      junk,
      title: document.title,
      is404: /Esta página no existe/.test(text),
      culprits,
    }
  }).catch((e) => ({ evalError: e.message }))
  const file = path.join(OUT, `${who}-${vp.width}-${slug(url)}.png`)
  await page.screenshot({ path: file }).catch(() => {})
  const entry = { who, vp: `${vp.width}x${vp.height}`, url, file, ms: Date.now() - t0, errors, ...m }
  const probs = []
  if (errors.length) probs.push(`${errors.length} error(es): ${errors.slice(0, 3).join(' | ')}`)
  if (m.docOverflow > 1) probs.push(`overflow horizontal del documento +${m.docOverflow}px ${m.culprits?.join(', ') || ''}`)
  if (m.mainOverflow > 1) probs.push(`overflow horizontal del panel +${m.mainOverflow}px ${m.culprits?.join(', ') || ''}`)
  if (m.junk?.length) probs.push(`texto basura visible: ${m.junk.join(', ')}`)
  if (m.squeezed?.length) probs.push(`texto aplastado en columna angosta: ${m.squeezed.join(', ')}`)
  if (m.is404) probs.push('pantalla 404')
  if (m.evalError) probs.push(`no se pudo evaluar: ${m.evalError}`)
  entry.problems = probs
  pages.push(entry)
  console.log(`${probs.length ? '✗' : '✓'} ${who} ${vp.width} ${url}${probs.length ? ' — ' + probs.join(' ; ') : ''}`)
  if (probs.length) findings.push(entry)
  return page
}

async function checkMas(ctx, who, role) {
  const page = await visit(ctx, who, MOBILE, `/panel/${role}`)
  let ok = false
  let detail = ''
  try {
    const btn = page.locator('[data-tour-m="nav-mas"]')
    await btn.waitFor({ state: 'visible', timeout: 10_000 })
    await btn.click()
    await page.getByText('Más secciones').waitFor({ state: 'visible', timeout: 5_000 })
    const items = await page.locator('[role="dialog"] a, [role="dialog"] button').allInnerTexts()
    ok = true
    detail = `${items.length} accesos: ${items.map((t) => t.trim().replace(/\s+/g, ' ')).filter(Boolean).join(' · ').slice(0, 300)}`
    await page.waitForTimeout(700) // fin de la animación de entrada del Sheet
    await page.screenshot({ path: path.join(OUT, `${who}-390-mas-sheet.png`) })
    // un acceso del Sheet navega y lo cierra
    const first = page.locator('[role="dialog"] a').first()
    if (await first.count()) {
      await first.click()
      await page.waitForTimeout(1200)
      const stillOpen = await page.getByText('Más secciones').isVisible().catch(() => false)
      if (stillOpen) { ok = false; detail += ' | el Sheet no se cierra al navegar' }
    }
  } catch (e) {
    detail = `el botón "Más" no abre el Sheet: ${e.message.slice(0, 200)}`
  }
  console.log(`${ok ? '✓' : '✗'} ${who} "Más" del bottom nav — ${detail}`)
  const entry = { who, vp: '390x844', url: `/panel/${role} (Más)`, check: 'mas', ok, detail, problems: ok ? [] : [detail] }
  pages.push(entry)
  if (!ok) findings.push(entry)
  await page.close()
}

const browser = await chromium.launch()
try {
  const actors = [
    ['cliente', { email: U.cliente }],
    ['profesional', { email: U.profesional }],
    ['proveedor', { email: U.proveedor }],
  ]
  for (const [role, actor] of actors) {
    console.log(`\n▶ ${role} (390×844)`)
    const ctx = await newCtx(browser, MOBILE, actor)
    for (const p of PANEL[role]) (await visit(ctx, role, MOBILE, `/panel/${role}${p ? '/' + p : ''}`)).close()
    for (const p of PUBLIC) (await visit(ctx, role, MOBILE, p)).close()
    for (const c of CONV[role].filter(Boolean)) (await visit(ctx, role, MOBILE, `/mensajes?c=${c}`)).close()
    await checkMas(ctx, role, role)
    await ctx.close()
    console.log(`▶ ${role} (1280×800)`)
    const dctx = await newCtx(browser, DESKTOP, actor)
    for (const p of DESKTOP_MAIN[role]) (await visit(dctx, role, DESKTOP, p)).close()
    await dctx.close()
  }
  console.log('\n▶ visitante (390×844)')
  const actx = await newCtx(browser, MOBILE, null)
  for (const p of ANON_PAGES) (await visit(actx, 'visitante', MOBILE, p)).close()
  await actx.close()
  const adctx = await newCtx(browser, DESKTOP, null)
  for (const p of DESKTOP_MAIN.anon) (await visit(adctx, 'visitante', DESKTOP, p)).close()
  await adctx.close()
} finally {
  await browser.close()
  writeFileSync(path.join(OUT, 'visual-report.json'), JSON.stringify({ base: BASE, total: pages.length, withProblems: findings.length, pages }, null, 2))
  console.log(`\n══ VISUAL: ${pages.length - findings.length}/${pages.length} pantallas sin problemas · capturas en ${OUT}`)
  for (const f of findings) console.log(`  ✗ ${f.who} ${f.vp} ${f.url}: ${f.problems.join(' ; ')}`)
  if (!KEEP) {
    console.log('\nPurgando datos E2E…')
    spawnSync(process.execPath, ['scripts/e2e-integral.mjs', '--purge-only'], { cwd: repo, stdio: 'inherit' })
  }
  await db.$disconnect()
}
process.exit(findings.length ? 1 : 0)
