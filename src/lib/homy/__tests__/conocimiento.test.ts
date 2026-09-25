// Links de Homy: cada ruta del conocimiento tiene que ser una sección de rutas.ts, y cada
// sección de rutas.ts tiene que existir de verdad en el router de la SPA (app-root.tsx).
// Si alguien agrega una pantalla o un link nuevo sin registrarlo, esto falla.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { CONOCIMIENTO, buscarConocimiento } from '../conocimiento'
import { SECCIONES, normalizarHref, linkPermitido, rutaParaRol } from '../rutas'
import { FAQ } from '../../ayuda-faq'
import type { RolHomy } from '../tipos'

const APP_ROOT = readFileSync(new URL('../../../components/app/app-root.tsx', import.meta.url), 'utf8')

/** Rutas que resuelve app-root.tsx: primer segmento público y pantallas de cada panel. */
function rutasDeAppRoot() {
  const publicas = new Set([...APP_ROOT.matchAll(/s\[0\] === '([a-z-]+)'/g)].map((m) => m[1]))
  const panel = APP_ROOT.slice(APP_ROOT.indexOf('function panelScreen'))
  const inicioRoles = panel.indexOf("if (role === 'cliente')")
  const comunes = new Set([...panel.slice(0, inicioRoles).matchAll(/page === '([a-z-]*)'/g)].map((m) => m[1]))
  const porRol: Record<string, Set<string>> = {}
  for (const rol of ['cliente', 'profesional', 'proveedor']) {
    const desde = panel.indexOf(`if (role === '${rol}')`)
    const hasta = panel.indexOf('return <NotFound />', desde)
    porRol[rol] = new Set([...panel.slice(desde, hasta).matchAll(/page === '([a-z-]*)'/g)].map((m) => m[1]))
  }
  return { publicas, comunes, porRol }
}

function existeEnAppRoot(ruta: string): boolean {
  const { publicas, comunes, porRol } = rutasDeAppRoot()
  const partes = ruta.split('/').filter(Boolean)
  if (partes.length === 0) return true // la home
  if (partes[0] !== 'panel') return partes.length === 1 && publicas.has(partes[0])
  const [, rol, pagina = ''] = partes
  if (!porRol[rol] || partes.length > 3) return false
  return porRol[rol].has(pagina) || comunes.has(pagina)
}

test('cada sección de rutas.ts existe en el router (app-root.tsx)', () => {
  const faltan = SECCIONES.filter((s) => !existeEnAppRoot(s.ruta)).map((s) => s.ruta)
  assert.deepEqual(faltan, [], `rutas de Homy que la app no tiene: ${faltan.join(', ')}`)
})

test('cada ruta del conocimiento de Homy es una sección de rutas.ts (con query permitida)', () => {
  const secciones = new Set(SECCIONES.map((s) => s.ruta))
  const malas: string[] = []
  for (const e of CONOCIMIENTO) {
    if (!e.ruta) continue
    const n = normalizarHref(e.ruta)
    if (!n || !secciones.has(n.path)) malas.push(`${e.id} → ${e.ruta}`)
  }
  assert.deepEqual(malas, [], `links del conocimiento fuera de rutas.ts: ${malas.join('; ')}`)
})

test('los links del conocimiento pasan el guardarraíl, llevados al panel de quien pregunta', () => {
  const malas: string[] = []
  for (const e of CONOCIMIENTO) {
    if (!e.ruta) continue
    const roles: RolHomy[] = e.roles.includes('todos') ? ['visitante', 'cliente', 'profesional', 'proveedor'] : e.roles.filter((x): x is RolHomy => x !== 'todos')
    for (const r of roles) {
      const propios = r === 'visitante' ? [] : [r]
      const link = rutaParaRol(e.ruta, r, propios)
      // una entrada de SU rol siempre trae link; una general puede quedar sin link (no le sirve)
      if (!link) { if (!e.roles.includes('todos')) malas.push(`${e.id} (${r}) sin link`); continue }
      if (!linkPermitido(link, r, propios, new Set())) malas.push(`${e.id} (${r}) → ${link}`)
      if (r !== 'visitante' && /^\/panel\/(cliente|profesional|proveedor)/.test(link)) {
        assert.ok(link.startsWith(`/panel/${r}`), `${e.id} (${r}) lleva a otro panel: ${link}`)
      }
    }
  }
  assert.deepEqual(malas, [])
})

test('rutaParaRol lleva al panel propio o saca el link', () => {
  assert.equal(rutaParaRol('/panel/cliente/materiales', 'profesional', ['profesional']), '/panel/profesional/materiales')
  assert.equal(rutaParaRol('/panel/cliente/proyectos', 'proveedor', ['proveedor']), null)
  assert.equal(rutaParaRol('/panel/profesional/calendario', 'cliente', ['cliente']), null)
  assert.equal(rutaParaRol('/panel/proveedor/cobros?tab=ventas', 'proveedor', ['proveedor']), '/panel/proveedor/cobros?tab=ventas')
  assert.equal(rutaParaRol('/ayuda?tema=finanzas', 'cliente', ['cliente']), '/ayuda?tema=finanzas')
  assert.equal(rutaParaRol('/panel/cliente/perfil', 'visitante'), '/panel/cliente/perfil')
})

test('los ids del conocimiento no se repiten', () => {
  const vistos = new Set<string>()
  const repetidos = CONOCIMIENTO.map((e) => e.id).filter((id) => (vistos.has(id) ? true : (vistos.add(id), false)))
  assert.deepEqual(repetidos, [])
})

test('las preguntas frecuentes tienen tema único y Homy las conoce con su link', () => {
  const temas = FAQ.map((f) => f.tema)
  assert.equal(new Set(temas).size, temas.length, 'temas repetidos')
  for (const f of FAQ) {
    assert.match(f.tema, /^[a-z0-9-]+$/)
    assert.ok(CONOCIMIENTO.some((e) => e.ruta === `/ayuda?tema=${f.tema}`), `Homy no tiene la pregunta ${f.tema}`)
  }
})

test('Homy encuentra lo nuevo: finanzas, calendario, sugerencias, registro, devoluciones, plan y cuenta', () => {
  const casos: [string, Parameters<typeof buscarConocimiento>[1], RegExp][] = [
    ['cómo cargo mis gastos en finanzas', 'profesional', /finanzas/i],
    ['cómo propongo el horario del trabajo en el calendario', 'profesional', /calendario|fechas/i],
    ['quiero reportar un problema', 'cliente', /sugerencia/i],
    ['no me llega el código del mail para crear la cuenta', 'visitante', /cuenta|código|codigo/i],
    ['cómo acepto una devolución de sobrantes de un cliente', 'profesional', /devoluci|sobrante/i],
    ['cuánto cuesta el plan pro', 'proveedor', /plan|pro/i],
    ['cómo apago los avisos por mail', 'cliente', /avisos/i],
    ['qué rubros hay, hay control de plagas', 'visitante', /rubros/i],
    ['no puedo subir una foto', 'proveedor', /foto/i],
  ]
  for (const [tema, rol, esperado] of casos) {
    const hits = buscarConocimiento(tema, rol)
    assert.ok(hits.length > 0, `sin resultados para "${tema}"`)
    assert.ok(hits.some((h) => esperado.test(`${h.titulo} ${h.texto}`)), `"${tema}" no trajo lo esperado: ${hits.map((h) => h.id).join(', ')}`)
  }
})

test('el conocimiento del rol lleva a SU panel (avisos, eliminar cuenta, mi perfil)', () => {
  for (const rol of ['cliente', 'profesional', 'proveedor'] as const) {
    for (const id of ['avisos-mail', 'eliminar-cuenta', 'mi-perfil']) {
      const e = CONOCIMIENTO.find((x) => x.id === `${id}-${rol}`)
      assert.equal(e?.ruta, `/panel/${rol}/perfil`)
    }
  }
})
