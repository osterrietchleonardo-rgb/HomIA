// Auditoría de botones/acciones muertas en HomIA
// 1) <button> sin onClick ni type="submit" (no hace nada)
// 2) <Link to="..."> a rutas no mapeadas en app-root (destino muerto)
// 3) TODO/FIXME/XXX/console.log sospechosos en screens y APIs
import fs from 'fs'
import path from 'path'

const ROOT = '/home/z/my-project/src'
const out = { deadButtons: [], links: [], todos: [] }

function walk(dir) {
  for (const f of fs.readdirSync(dir)) {
    const p = path.join(dir, f)
    const st = fs.statSync(p)
    if (st.isDirectory()) walk(p)
    else if (/\.(tsx?|ts)$/.test(f)) scan(p)
  }
}

function scan(file) {
  const src = fs.readFileSync(file, 'utf8')
  const rel = path.relative(ROOT, file)
  // botones: capturar tag completo <button ...> (sin contenido)
  const btnRe = /<button\b([^>]*)>/gs
  let m
  while ((m = btnRe.exec(src))) {
    const attrs = m[1]
    const line = src.slice(0, m.index).split('\n').length
    const hasOnClick = /onClick\s*=/.test(attrs)
    const isSubmit = /type\s*=\s*["']submit["']/.test(attrs)
    const isReset = /type\s*=\s*["']reset["']/.test(attrs)
    if (!hasOnClick && !isSubmit && !isReset) {
      out.deadButtons.push({ file: rel, line, attrs: attrs.replace(/\s+/g, ' ').trim().slice(0, 110) })
    }
  }
  // links internos
  const linkRe = /\bto=\{?["'`]([^"'`]+)["'`]/g
  while ((m = linkRe.exec(src))) {
    out.links.push({ file: rel, line: src.slice(0, m.index).split('\n').length, to: m[1] })
  }
  const todoRe = /\b(TODO|FIXME|XXX)\b/
  if (todoRe.test(src)) {
    src.split('\n').forEach((ln, i) => { if (todoRe.test(ln)) out.todos.push({ file: rel, line: i + 1, ln: ln.trim().slice(0, 100) }) })
  }
}

walk(ROOT)

// rutas mapeadas en app-root (segmentos de primer y segundo nivel que la SPA entiende)
const appRoot = fs.readFileSync(path.join(ROOT, 'components/app/app-root.tsx'), 'utf8')
const MAPPED1 = ['buscar', 'ingresar', 'registrarse', 'trabajo', 'profesional', 'proveedor', 'notificaciones', 'directorio', 'mensajes', 'panel']
const PANEL_PAGES = ['directorio', 'mensajes', 'verificacion']
const CLIENT_PAGES = ['', 'publicar', 'trabajos', 'proyectos', 'facturas', 'perfil']
const PRO_PAGES = ['', 'bolsa', 'materiales', 'proyectos', 'presupuestos', 'crm', 'obras', 'vinculaciones', 'perfil']
const PROV_PAGES = ['', 'stock', 'crm', 'vinculaciones', 'perfil']
const PROVERIF = true

function routeAlive(to) {
  if (/^(https?:|mailto:|tel:)/.test(to)) return true
  const clean = to.split('?')[0].split('#')[0].replace(/^\//, '')
  const seg = clean.split('/').filter(Boolean)
  if (seg.length === 0) return true // home
  if (seg[0] === 'panel') {
    if (seg.length < 2) return true // /panel → RolePicker
    const role = seg[1]
    const pages = role === 'cliente' ? CLIENT_PAGES : role === 'profesional' ? PRO_PAGES : role === 'proveedor' ? PROV_PAGES : []
    if (PANEL_PAGES.includes(seg[2] || '')) return true
    return pages.includes(seg[2] || '')
  }
  if (seg[0] === 'profesional' || seg[0] === 'proveedor' || seg[0] === 'trabajo') return seg.length <= 2
  return MAPPED1.includes(seg[0])
}

console.log('=== 1) BOTONES SIN ACCIÓN (sin onClick/submit/reset) ===')
for (const b of out.deadButtons) console.log(`${b.file}:${b.line}  ${b.attrs}`)
console.log(`total: ${out.deadButtons.length}`)

console.log('\n=== 2) LINKS A RUTAS NO MAPEADAS ===')
const dead = out.links.filter((l) => !routeAlive(l.to))
for (const l of dead) console.log(`${l.file}:${l.line}  to="${l.to}"`)
console.log(`total revisados: ${out.links.length}, muertos: ${dead.length}`)

console.log('\n=== 3) TODO/FIXME ===')
for (const t of out.todos) console.log(`${t.file}:${t.line}  ${t.ln}`)
console.log(`total: ${out.todos.length}`)
