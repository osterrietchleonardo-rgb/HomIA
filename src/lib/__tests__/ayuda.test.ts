// Tour guiado, guías y Ayuda contra el código real:
//  · cada `target` del tour existe como data-tour en algún componente (y los del menú, en el
//    menú de ESE rol);
//  · cada sección del menú de cada rol tiene su paso en el tour;
//  · las rutas del tour, de "¿Cómo hago?" y de "Me trabé" existen en el router;
//  · los textos de ayuda no usan muletillas de IA.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { TOURS, type TourRole } from '../tour-content'
import { HOWTOS, TROUBLES } from '../howto-content'
import { FAQ } from '../ayuda-faq'
import { SECCIONES, normalizarHref } from '../homy/rutas'

const SRC = fileURLToPath(new URL('../../', import.meta.url))
const leer = (rel: string) => readFileSync(join(SRC, rel), 'utf8')
const ROLES: TourRole[] = ['cliente', 'profesional', 'proveedor']

function archivos(dir: string): string[] {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) return n === '__tests__' ? [] : archivos(p)
    return /\.tsx?$/.test(n) ? [p] : []
  })
}

/** Menú de cada rol tal como lo arma panel-layout.tsx (NAV) → anclas nav-<pantalla>. */
function menuPorRol(): Record<TourRole, { to: string; ancla: string }[]> {
  const src = leer('components/screens/panel/panel-layout.tsx')
  const nav = src.slice(src.indexOf('const NAV'), src.indexOf('const ROLE_LABEL'))
  const out = {} as Record<TourRole, { to: string; ancla: string }[]>
  for (const rol of ROLES) {
    const desde = nav.indexOf(`  ${rol}: [`)
    const bloque = nav.slice(desde, nav.indexOf('  ],', desde))
    out[rol] = [...bloque.matchAll(/to: '([^']+)'/g)].map((m) => {
      const partes = m[1].split('/').filter(Boolean)
      // mismo cálculo que tourKeyOf() de panel-layout.tsx
      const clave = partes[0] === 'panel' ? partes[2] || 'inicio' : partes[0]
      return { to: m[1], ancla: `nav-${clave}` }
    })
  }
  return out
}

/** Todas las anclas data-tour / data-tour-m escritas en los componentes. */
function anclasDelCodigo(): Set<string> {
  const out = new Set<string>()
  for (const f of archivos(join(SRC, 'components'))) {
    const src = readFileSync(f, 'utf8')
    for (const m of src.matchAll(/data-tour(?:-m)?="([^"]+)"/g)) out.add(m[1])
    // anclas armadas sobre una lista fija: (['a', 'b'] as const).map((t) => … data-tour={`tab-${t}`}
    for (const m of src.matchAll(/\(\[([^\]]+)\] as const\)\.map\(\((\w+)\)[\s\S]{0,900}?data-tour=\{`([\w-]*)\$\{(\w+)\}`\}/g)) {
      if (m[2] !== m[4]) continue
      for (const v of m[1].matchAll(/'([^']+)'/g)) out.add(`${m[3]}${v[1]}`)
    }
  }
  return out
}

function rutaExiste(ruta: string): boolean {
  const n = normalizarHref(ruta)
  return !!n && SECCIONES.some((s) => s.ruta === n.path)
}

test('cada paso del tour ilumina un elemento que existe en el código', () => {
  const menu = menuPorRol()
  const anclas = anclasDelCodigo()
  const malas: string[] = []
  for (const rol of ROLES) {
    for (const paso of TOURS[rol]) {
      if (!paso.target) continue
      if (paso.target.startsWith('nav-')) {
        if (!menu[rol].some((i) => i.ancla === paso.target)) malas.push(`${rol}/${paso.id}: ${paso.target} no está en el menú del ${rol}`)
      } else if (!anclas.has(paso.target)) {
        malas.push(`${rol}/${paso.id}: no hay data-tour="${paso.target}"`)
      }
    }
  }
  assert.deepEqual(malas, [])
  // el botón «Más» del celular (el tour lo ilumina para las secciones que viven ahí)
  assert.ok(anclas.has('nav-mas'))
})

test('cada sección del menú de cada rol tiene su paso en el tour', () => {
  const menu = menuPorRol()
  for (const rol of ROLES) {
    const targets = new Set(TOURS[rol].map((p) => p.target))
    const faltan = menu[rol].filter((i) => !targets.has(i.ancla)).map((i) => i.to)
    assert.deepEqual(faltan, [], `secciones del ${rol} sin paso en el tour: ${faltan.join(', ')}`)
  }
})

test('las rutas del tour existen y no llevan query (el tour compara el path)', () => {
  for (const rol of ROLES) {
    for (const paso of TOURS[rol]) {
      if (!paso.route) continue
      assert.ok(!paso.route.includes('?'), `${rol}/${paso.id} con query`)
      assert.ok(rutaExiste(paso.route), `${rol}/${paso.id}: ${paso.route} no existe`)
      assert.ok(paso.route === `/panel/${rol}` || paso.route.startsWith(`/panel/${rol}/`), `${rol}/${paso.id} sale de su panel`)
    }
    const ids = TOURS[rol].map((p) => p.id)
    assert.equal(new Set(ids).size, ids.length, `ids repetidos en el tour de ${rol}`)
  }
})

test('los links de "¿Cómo hago?" y "Me trabé" existen y son del panel del rol', () => {
  for (const rol of ROLES) {
    for (const x of [...HOWTOS[rol].map((h) => ({ id: h.id, href: h.href })), ...TROUBLES[rol].map((t) => ({ id: t.id, href: t.href }))]) {
      if (!x.href) continue
      assert.ok(rutaExiste(x.href), `${rol}/${x.id}: ${x.href} no existe`)
      assert.ok(x.href.startsWith(`/panel/${rol}`), `${rol}/${x.id}: ${x.href} es de otro panel`)
    }
  }
})

test('los textos de ayuda no usan muletillas de IA', () => {
  const MULETILLAS = [/ecosistema/i, /potenci[aá]/i, /360\s?°/, /sin complicaciones/i, /en un solo lugar/i, /no es solo .+, es /i]
  const textos = [
    ...FAQ.flatMap((f) => [f.q, f.a]),
    ...ROLES.flatMap((r) => TOURS[r].flatMap((p) => [p.title, p.body, p.tip || ''])),
    ...ROLES.flatMap((r) => HOWTOS[r].flatMap((h) => [h.title, ...h.steps])),
    ...ROLES.flatMap((r) => TROUBLES[r].flatMap((t) => [t.q, t.why, t.fix])),
  ]
  const malos = textos.filter((t) => MULETILLAS.some((m) => m.test(t)))
  assert.deepEqual(malos, [])
})
