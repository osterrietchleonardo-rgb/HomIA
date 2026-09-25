// Set de evaluación del súper agente Homy (PLAYBOOK §12.13).
// Corre cada caso de scripts/homy-eval-casos.json contra un servidor real y
// evalúa: herramientas usadas, debe_incluir (por raíz), no_debe_incluir, links
// válidos, montos que existen en la base y resultado sin respaldo.
//   node scripts/homy-eval.mjs [baseUrl=http://localhost:3061] [--solo=id1,id2] [--conc=4]
// Usa las cuentas demo SOLO para leer (el chat no escribe en tablas de negocio).
// OJO: escribe HomyRun/HomySession/HomyMessage/AiUsage/SearchEvent en la base del .env:
// los ids quedan en scratch/homy-eval/ para limpiarlos (scripts de limpieza en el informe).
import fs from 'node:fs'
import path from 'node:path'
import { PrismaClient } from '@prisma/client'

const args = process.argv.slice(2)
const BASE = args.find((a) => a.startsWith('http')) || 'http://localhost:3061'
const SOLO = (args.find((a) => a.startsWith('--solo=')) || '').slice(7).split(',').filter(Boolean)
const CONC = Number((args.find((a) => a.startsWith('--conc=')) || '--conc=4').slice(7))
// Cuentas con las que se loguean los casos de cliente/profesional/proveedor. Las demo @homia.test
// se borraron (25/09/2026): pasá otras con HOMY_EVAL_CUENTAS='{"cliente":"…","profesional":"…","proveedor":"…"}'
// y HOMY_EVAL_PASS. Los casos que buscan datos (plomeros, cemento, cable…) dependen de lo que haya en la base.
const PASS = process.env.HOMY_EVAL_PASS || 'Homy2026!'
const CUENTAS = process.env.HOMY_EVAL_CUENTAS
  ? JSON.parse(process.env.HOMY_EVAL_CUENTAS)
  : { cliente: 'cliente@homia.test', profesional: 'profesional@homia.test', proveedor: 'proveedor@homia.test' }

const casosFile = JSON.parse(fs.readFileSync(new URL('./homy-eval-casos.json', import.meta.url), 'utf8'))
const casos = casosFile.casos.filter((c) => !SOLO.length || SOLO.includes(c.id))
const db = new PrismaClient()
const norm = (s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

// ── Referencias reales de la base (para detectar alucinaciones) ──
const [stock, jobs, provs] = await Promise.all([
  db.providerStock.findMany({ select: { price: true } }),
  db.jobPost.findMany({ select: { budgetMin: true, budgetMax: true } }),
  db.providerProfile.findMany({ select: { businessName: true } }),
])
const montosReales = new Set([50000, 100000, ...stock.map((s) => Math.round(s.price)), ...jobs.flatMap((j) => [j.budgetMin, j.budgetMax].filter(Boolean).map(Math.round))])
const negociosReales = provs.map((p) => norm(p.businessName))

async function login(email) {
  const r = await fetch(`${BASE}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: PASS }) })
  const c = (r.headers.get('set-cookie') || '').match(/homy_session=[^;]+/)
  if (!c) throw new Error(`login falló para ${email}: ${r.status}`)
  return c[0]
}
const cookies = {}
for (const rol of new Set(casos.map((c) => c.rol))) if (rol !== 'visitante') cookies[rol] = await login(CUENTAS[rol])

const corrida = Date.now().toString(36)
async function correrCaso(c, i) {
  const headers = { 'Content-Type': 'application/json', 'x-homy-visitante': `eval_${corrida}_${i}_xxxxxxxx` }
  if (c.rol === 'visitante') headers['x-forwarded-for'] = `10.250.${Number.parseInt(corrida.slice(-2), 36) % 250}.${i + 1}`
  else headers.cookie = cookies[c.rol]
  const t0 = Date.now()
  let primerTexto = null
  const res = await fetch(`${BASE}/api/homy/agent`, {
    method: 'POST', headers,
    body: JSON.stringify({ mensaje: c.pregunta, puerta: c.puerta, pagina: c.pagina, rolPanel: c.rol === 'visitante' ? null : c.rol }),
  })
  const eventos = []
  const reader = res.body.getReader()
  const dec = new TextDecoder()
  let buf = ''
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let k
    while ((k = buf.indexOf('\n')) !== -1) {
      const l = buf.slice(0, k).trim(); buf = buf.slice(k + 1)
      if (!l) continue
      const e = JSON.parse(l)
      if (e.t === 'texto' && primerTexto == null) primerTexto = Date.now() - t0
      eventos.push(e)
    }
  }
  const ms = Date.now() - t0
  const fin = eventos.find((e) => e.t === 'final') || eventos.find((e) => e.t === 'limite' || e.t === 'error')
  const run = fin?.runId ? await db.homyRun.findUnique({ where: { id: fin.runId } }) : null
  const pasos = run ? JSON.parse(run.pasos) : []
  const usadas = new Set(pasos.map((p) => p.herramienta))
  const texto = norm(`${fin?.mensaje || ''} ${fin?.pregunta || ''}`)
  const fallas = []
  if (!fin || fin.t !== 'final') fallas.push(`sin respuesta final (${fin?.t || 'nada'})`)
  if (fin?.degradado) fallas.push('respuesta degradada (sin IA)')
  for (const h of c.herramientas || []) if (!usadas.has(h)) fallas.push(`no usó ${h}`)
  if (c.herramientas_alguna && !c.herramientas_alguna.some((h) => usadas.has(h))) fallas.push(`no usó ninguna de ${c.herramientas_alguna.join('/')}`)
  for (const d of c.debe_incluir || []) if (!d.split('|').some((alt) => texto.includes(norm(alt)))) fallas.push(`falta "${d}"`)
  for (const d of c.no_debe_incluir || []) if (texto.includes(norm(d))) fallas.push(`incluye prohibido "${d}"`)
  if ((c.tarjetas_min || 0) > (fin?.tarjetas?.length || 0)) fallas.push(`tarjetas ${fin?.tarjetas?.length || 0} < ${c.tarjetas_min}`)
  const links = [...(fin?.acciones || []).map((a) => a.href), ...(fin?.tarjetas || []).flatMap((t) => [t.href, t.hrefProveedor, t.hrefCarrito].filter(Boolean))]
  for (const l of links) if (!l.startsWith('/') || l.startsWith('//')) fallas.push(`link inválido ${l}`)
  if (fin?.t === 'final' && !(fin.acciones || []).length) fallas.push('sin acciones')
  // alucinaciones: montos que no existen y negocios que no existen
  const aluc = []
  for (const m of `${fin?.mensaje || ''}`.matchAll(/\$\s?(\d{1,3}(?:[.\s]\d{3})+|\d+)/g)) {
    const n = Number(m[1].replace(/[.\s]/g, ''))
    if (![...montosReales].some((x) => Math.abs(x - n) <= 1)) aluc.push(`monto $${m[1]}`)
  }
  for (const m of `${fin?.mensaje || ''}`.matchAll(/(Ferreter[ií]a|Corral[oó]n|Pinturer[ií]a|Sanitarios|Maderera|Materiales)\s+([A-ZÁÉÍÓÚ][\wáéíóúñ.]+(?:\s+[A-ZÁÉÍÓÚ][\wáéíóúñ.]+)*)/g)) {
    const nombre = norm(`${m[1]} ${m[2]}`)
    if (!negociosReales.some((r) => r.includes(nombre) || nombre.includes(r))) aluc.push(`negocio "${m[0]}"`)
  }
  return {
    id: c.id, rol: c.rol, puerta: c.puerta, pregunta: c.pregunta, ok: fallas.length === 0 && aluc.length === 0, fallas, alucinaciones: aluc,
    ms, primerTextoMs: primerTexto, runId: fin?.runId || null, sessionId: fin?.sessionId || null,
    resultado: run?.resultado, vueltas: run?.vueltas, tokens: run ? { in: run.tokensEntrada, cache: run.tokensCache, out: run.tokensSalida, razon: run.tokensRazon } : null,
    costoUsd: run?.costoUsd ?? null, herramientas: [...usadas], mensaje: fin?.mensaje, pregunta_aclaracion: fin?.pregunta,
    tarjetas: (fin?.tarjetas || []).map((t) => `${t.tipo}:${t.nombre || t.titulo}`), acciones: fin?.acciones,
  }
}

const resultados = new Array(casos.length)
let idx = 0
await Promise.all(Array.from({ length: Math.min(CONC, casos.length) }, async () => {
  while (idx < casos.length) {
    const i = idx++
    try { resultados[i] = await correrCaso(casos[i], i) } catch (e) { resultados[i] = { id: casos[i].id, ok: false, fallas: [`excepción: ${e.message}`], alucinaciones: [] } }
    const r = resultados[i]
    console.log(`${r.ok ? 'OK  ' : 'FALLA'} ${r.id.padEnd(24)} ${String(r.ms ?? '').padStart(6)}ms ${r.fallas.concat(r.alucinaciones).join('; ')}`)
  }
}))

const oks = resultados.filter((r) => r.ok).length
const lat = resultados.map((r) => r.ms).filter(Boolean).sort((a, b) => a - b)
const pct = (p) => lat[Math.min(lat.length - 1, Math.floor((p / 100) * lat.length))]
const costos = resultados.map((r) => r.costoUsd).filter((x) => x != null)
const resumen = {
  version: casosFile.version, base: BASE, casos: resultados.length, ok: oks, porcentaje: Math.round((oks / resultados.length) * 1000) / 10,
  alucinaciones: resultados.reduce((a, r) => a + r.alucinaciones.length, 0),
  latencia_p50_ms: pct(50), latencia_p95_ms: pct(95),
  costo_promedio_usd: costos.length ? costos.reduce((a, b) => a + b, 0) / costos.length : null,
  costo_total_usd: costos.reduce((a, b) => a + b, 0),
}
console.log('\n', JSON.stringify(resumen, null, 1))
const dir = path.resolve('scratch/homy-eval')
fs.mkdirSync(dir, { recursive: true })
const archivo = path.join(dir, `eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(archivo, JSON.stringify({ resumen, resultados }, null, 1))
fs.appendFileSync(path.join(dir, 'ids-creados.txt'), resultados.map((r) => `${r.runId || ''}\t${r.sessionId || ''}`).join('\n') + '\n')
console.log('detalle:', archivo)
await db.$disconnect()
