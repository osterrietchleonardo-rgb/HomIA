// Métricas de uso (D27) — reglas puras, sin DOM, sin base y sin React.
// Las usan el tracker del navegador (src/lib/analytics/tracker.ts), la API de recolección y los
// tests (src/lib/__tests__/analytics.test.ts). Regla de oro: acá se decide QUÉ se guarda, y nunca
// se guarda lo que la persona tipea, ni contraseñas, ni el contenido de los mensajes.

export const TIPOS_EVENTO = ['page_view', 'click', 'submit', 'dialog', 'search', 'error', 'heartbeat', 'server'] as const
export type TipoEvento = (typeof TIPOS_EVENTO)[number]

export const TIPOS_ENTIDAD = [
  'project', 'order', 'purchase', 'invoice', 'charge', 'job', 'bid', 'stock', 'conversation',
  'review', 'work', 'return', 'professional', 'provider', 'feedback', 'user',
] as const
export type TipoEntidad = (typeof TIPOS_ENTIDAD)[number]

/** Sesión: se corta tras 30 minutos sin actividad (definición estándar de analítica web). */
export const SESION_INACTIVA_MS = 30 * 60 * 1000
/** Latido: cada 30 s, solo con la pestaña visible. */
export const LATIDO_MS = 30_000
/** Un tramo de latido nunca suma más de esto (si el navegador durmió la pestaña, no se inventa tiempo). */
export const TOPE_TRAMO_MS = 35_000
/** Sin tocar nada durante 5 minutos, la pestaña visible deja de contar como uso activo. */
export const INACTIVIDAD_MS = 5 * 60 * 1000
export const MAX_ETIQUETA = 60

// ───────────────────────────── rutas ─────────────────────────────

/** ¿Este segmento de ruta es un identificador (cuid, uuid, número, PED-…, token largo)? */
export function esId(seg: string): boolean {
  if (!seg) return false
  if (/^\d+$/.test(seg)) return true
  if (/^c[a-z0-9]{20,}$/.test(seg)) return true // cuid de Prisma
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(seg)) return true
  if (/^(PED|FAC|COB|INV)-[\w-]+$/i.test(seg)) return true
  // token largo con letras y números mezclados (ids de otros sistemas)
  if (seg.length >= 16 && /\d/.test(seg) && /[a-z]/i.test(seg) && /^[\w-]+$/.test(seg)) return true
  return false
}

/**
 * Ruta normalizada sin ids ni query: `/panel/cliente/proyectos/cmx…?tab=1` → `/panel/cliente/proyectos/:id`.
 * Acepta el hash de la SPA (`#/buscar?q=…`) o un pathname.
 */
export function normalizarRuta(raw: string | null | undefined): string {
  let p = String(raw || '/').trim()
  if (p.startsWith('#')) p = p.slice(1)
  p = p.split('?')[0].split('#')[0]
  if (!p.startsWith('/')) p = `/${p}`
  const segs = p.split('/').filter(Boolean).slice(0, 8).map((s) => {
    let d = s
    try { d = decodeURIComponent(s) } catch { /* segmento mal codificado: se usa tal cual */ }
    return esId(d) ? ':id' : d.toLowerCase().replace(/[^a-z0-9_:.-]/g, '').slice(0, 40)
  })
  const out = `/${segs.filter(Boolean).join('/')}`
  return out.length > 200 ? out.slice(0, 200) : out
}

/** Primer id de la ruta (el que `normalizarRuta` reemplazó por `:id`). */
function idsDeRuta(raw: string): string[] {
  let p = String(raw || '')
  if (p.startsWith('#')) p = p.slice(1)
  p = p.split('?')[0]
  return p.split('/').filter(Boolean).filter(esId)
}

const ENTIDAD_POR_RUTA: [RegExp, TipoEntidad][] = [
  [/^\/panel\/[a-z]+\/proyectos\/:id/, 'project'],
  [/^\/panel\/[a-z]+\/pedidos\/:id/, 'order'],
  [/^\/panel\/[a-z]+\/trabajos\/:id/, 'job'],
  [/^\/trabajo\/:id/, 'job'],
  [/^\/profesional\/:id/, 'professional'],
  [/^\/proveedor\/:id/, 'provider'],
]

const ENTIDAD_POR_API: [RegExp, TipoEntidad][] = [
  [/^\/api\/projects\/:id/, 'project'],
  [/^\/api\/invoices\/:id/, 'invoice'],
  [/^\/api\/orders\/:id/, 'order'],
  [/^\/api\/purchases\/:id/, 'purchase'],
  [/^\/api\/charges\/:id/, 'charge'],
  [/^\/api\/jobs\/:id/, 'job'],
  [/^\/api\/bids\/:id/, 'bid'],
  [/^\/api\/returns\/:id/, 'return'],
  [/^\/api\/works\/:id/, 'work'],
  [/^\/api\/messages\/conversations\/:id/, 'conversation'],
  [/^\/api\/feedback\/:id/, 'feedback'],
  [/^\/api\/provider\/stock\/:id/, 'stock'],
]

/** Activo (proyecto, pedido, trabajo…) al que pertenece una ruta de la SPA o de la API. */
export function entidadDeRuta(raw: string | null | undefined): { entityType: TipoEntidad; entityId: string } | null {
  const r = String(raw || '')
  const norm = normalizarRuta(r)
  const tabla = norm.startsWith('/api/') ? ENTIDAD_POR_API : ENTIDAD_POR_RUTA
  for (const [re, tipo] of tabla) {
    if (re.test(norm)) {
      const id = idsDeRuta(r)[0]
      if (id && /^[\w-]{1,40}$/.test(id)) return { entityType: tipo, entityId: id }
    }
  }
  return null
}

/** `data-entity="project:abc123"` → { project, abc123 } (solo tipos conocidos). */
export function parsearDataEntity(v: string | null | undefined): { entityType: TipoEntidad; entityId: string } | null {
  const m = String(v || '').match(/^([a-z]+):([\w-]{1,40})$/)
  if (!m || !(TIPOS_ENTIDAD as readonly string[]).includes(m[1])) return null
  return { entityType: m[1] as TipoEntidad, entityId: m[2] }
}

/** Rol activo según la pantalla (`/panel/<rol>/…`); fuera del panel, null. */
export function rolDeRuta(path: string): 'cliente' | 'profesional' | 'proveedor' | null {
  const m = normalizarRuta(path).match(/^\/panel\/(cliente|profesional|proveedor)(\/|$)/)
  return m ? (m[1] as 'cliente' | 'profesional' | 'proveedor') : null
}

// ───────────────────────────── etiquetas sin datos personales ─────────────────────────────

/** Quita lo que puede identificar a alguien: emails, teléfonos, montos, números largos, links. */
export function limpiarTexto(t: string): string {
  return String(t || '')
    .replace(/\s+/g, ' ')
    .replace(/[^\s@]+@[^\s@]+/g, '[email]')
    .replace(/https?:\/\/\S+/gi, '[link]')
    .replace(/\$\s?[\d.,]+/g, '$#')
    .replace(/\d[\d\s.-]{5,}\d/g, '#') // teléfonos y DNI con espacios o guiones
    .replace(/\d[\d.,:/-]*/g, '#')
    .trim()
}

/**
 * Lo mínimo del elemento que hace falta para etiquetarlo (así se testea sin DOM).
 * `texto` es el texto visible; `esCampo` = input/textarea/select/contenteditable.
 */
export type ElementoResumen = {
  tag: string
  dataTrack?: string | null
  ariaLabel?: string | null
  title?: string | null
  texto?: string | null
  href?: string | null
  esCampo?: boolean
  tipoCampo?: string | null
}

/**
 * Etiqueta de un clic: `data-track` > `aria-label` > `title` > texto visible corto.
 * NUNCA el valor de un campo. Un texto visible largo (más de 5 palabras o 40 caracteres) no se
 * usa: suele ser contenido cargado por alguien (título de un trabajo, un nombre, un mensaje);
 * en ese caso queda una etiqueta genérica y el activo se guarda aparte (entityType/entityId).
 */
export function etiquetaDe(el: ElementoResumen): string {
  const corta = (s: string) => limpiarTexto(s).slice(0, MAX_ETIQUETA)
  if (el.dataTrack && el.dataTrack.trim()) return corta(el.dataTrack)
  if (el.esCampo) {
    // de un campo solo se registra QUÉ tipo de control es, nunca su valor
    return `campo:${String(el.tipoCampo || el.tag || 'campo').toLowerCase().replace(/[^a-z-]/g, '').slice(0, 20)}`
  }
  if (el.ariaLabel && el.ariaLabel.trim()) return corta(el.ariaLabel)
  if (el.title && el.title.trim()) return corta(el.title)
  const txt = limpiarTexto(el.texto || '')
  const palabras = txt ? txt.split(' ').length : 0
  if (txt && palabras <= 5 && txt.length <= 40) return txt.slice(0, MAX_ETIQUETA)
  if (el.href) {
    const h = String(el.href)
    if (h.startsWith('#/') || h.startsWith('/')) return `link:${normalizarRuta(h)}`.slice(0, MAX_ETIQUETA)
    return 'link:externo'
  }
  return `${String(el.tag || 'elemento').toLowerCase()}:sin-etiqueta`
}

/**
 * Término de búsqueda para las métricas: minúsculas, sin espacios de más, sin emails ni números
 * largos (teléfonos, DNI: 7 dígitos o más). Los números cortos quedan ("caño 110" es útil).
 */
export function limpiarBusqueda(t: string): string {
  return String(t || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\s@]+@[^\s@]+/g, '[email]')
    .replace(/https?:\/\/\S+/g, '[link]')
    .replace(/\d[\d\s.-]{5,}\d/g, '#')
    .trim()
    .slice(0, 80)
}

/** Mensaje técnico de error sin datos personales (máx. 160 caracteres). */
export function mensajeError(m: unknown): string {
  const s = m instanceof Error ? `${m.name}: ${m.message}` : String(m ?? 'error')
  return limpiarTexto(s).slice(0, 160) || 'error'
}

// ───────────────────────────── dispositivo ─────────────────────────────

/** "celu · Chrome · Android" a partir del user agent (sin versión ni modelo: no identifica). */
export function resumirDispositivo(ua: string, anchoPantalla?: number): string {
  const u = String(ua || '')
  const tablet = /iPad|Tablet/i.test(u) || (/Android/i.test(u) && !/Mobile/i.test(u))
  const celu = !tablet && /Mobi|iPhone|Android/i.test(u)
  const tipo = tablet ? 'tablet' : celu ? 'celu' : anchoPantalla && anchoPantalla < 768 ? 'celu' : 'compu'
  const nav = /Edg\//.test(u) ? 'Edge'
    : /OPR\/|Opera/.test(u) ? 'Opera'
    : /SamsungBrowser/.test(u) ? 'Samsung'
    : /Firefox\//.test(u) ? 'Firefox'
    : /Chrome\//.test(u) ? 'Chrome'
    : /Safari\//.test(u) ? 'Safari'
    : 'otro'
  const so = /Windows/.test(u) ? 'Windows'
    : /iPhone|iPad|iOS/.test(u) ? 'iOS'
    : /Android/.test(u) ? 'Android'
    : /Mac OS X|Macintosh/.test(u) ? 'macOS'
    : /Linux/.test(u) ? 'Linux'
    : 'otro'
  return `${tipo} · ${nav} · ${so}`
}

/** Solo el dominio del referrer (sin ruta ni query: pueden tener datos). Mismo sitio → null. */
export function dominioReferrer(ref: string | null | undefined, hostPropio?: string): string | null {
  if (!ref) return null
  try {
    const h = new URL(ref).hostname.replace(/^www\./, '')
    if (!h || (hostPropio && h === hostPropio.replace(/^www\./, ''))) return null
    return h.slice(0, 80)
  } catch {
    return null
  }
}

/** utm_* de la query del primer ingreso (cada valor recortado y limpio). */
export function utmDe(search: string): Record<string, string> | null {
  const out: Record<string, string> = {}
  try {
    const sp = new URLSearchParams(search.startsWith('?') ? search : `?${search}`)
    for (const k of ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content']) {
      const v = sp.get(k)
      // como el término de búsqueda: tapa emails y números largos, pero "e2e" o "promo2026" quedan
      if (v) out[k] = limpiarBusqueda(v).slice(0, 60)
    }
  } catch { /* query inválida */ }
  return Object.keys(out).length ? out : null
}

// ───────────────────────────── tiempo activo ─────────────────────────────

/**
 * Milisegundos de uso activo entre el último tick y ahora. Cuenta solo si la pestaña estuvo
 * visible y hubo interacción en los últimos 5 minutos; nunca más que TOPE_TRAMO_MS por tramo.
 */
export function tramoActivo(p: { ahora: number; ultimoTick: number; visible: boolean; ultimaInteraccion: number }): number {
  if (!p.visible) return 0
  if (p.ahora - p.ultimaInteraccion > INACTIVIDAD_MS) return 0
  const d = p.ahora - p.ultimoTick
  if (!Number.isFinite(d) || d <= 0) return 0
  return Math.min(d, TOPE_TRAMO_MS)
}

/** Suma de los latidos de un lote tal como la guarda el servidor (cada uno con tope). */
export function sumarLatidos(msPorLatido: number[]): number {
  let t = 0
  for (const ms of msPorLatido) {
    const n = Math.round(Number(ms))
    if (Number.isFinite(n) && n > 0) t += Math.min(n, TOPE_TRAMO_MS)
  }
  return Math.min(t, 10 * 60 * 1000)
}

/** ¿Hay que abrir una sesión nueva? (sin sesión o más de 30 min desde la última actividad) */
export function sesionVencida(ultimaActividad: number | null | undefined, ahora: number): boolean {
  return !ultimaActividad || ahora - ultimaActividad > SESION_INACTIVA_MS
}

// ───────────────────────────── métricas (armado puro) ─────────────────────────────

export type PasoEmbudo = { paso: string; n: number }
export type PasoEmbudoCalc = PasoEmbudo & { pctAnterior: number | null; pctInicio: number | null }

/** Porcentajes de un embudo: respecto del paso anterior y del primero (1 decimal; null si el divisor es 0). */
export function armarEmbudo(pasos: PasoEmbudo[]): PasoEmbudoCalc[] {
  const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null)
  return pasos.map((p, i) => ({
    ...p,
    pctAnterior: i === 0 ? null : pct(p.n, pasos[i - 1].n),
    pctInicio: i === 0 ? null : pct(p.n, pasos[0].n),
  }))
}

export type FilaCohorte = { cohorte: string; usuarios: number; semana: number; activos: number }
export type Cohorte = { cohorte: string; usuarios: number; semanas: (number | null)[] }

/**
 * Matriz de retención: por cohorte (semana de registro) el % que volvió en las semanas 1..N.
 * Una semana que todavía no terminó para esa cohorte queda null (no es 0: aún no pasó).
 */
export function armarCohortes(filas: FilaCohorte[], semanas = 8, semanaActual?: string): Cohorte[] {
  const por = new Map<string, { usuarios: number; act: Map<number, number> }>()
  for (const f of filas) {
    const c = por.get(f.cohorte) || { usuarios: f.usuarios, act: new Map<number, number>() }
    c.usuarios = Math.max(c.usuarios, f.usuarios)
    if (f.semana >= 1) c.act.set(f.semana, (c.act.get(f.semana) || 0) + f.activos)
    por.set(f.cohorte, c)
  }
  const semanasEntre = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / (7 * 86_400_000))
  return [...por.entries()]
    .sort((a, b) => (a[0] < b[0] ? 1 : -1))
    .map(([cohorte, c]) => {
      const pasadas = semanaActual ? semanasEntre(cohorte, semanaActual) : semanas
      return {
        cohorte,
        usuarios: c.usuarios,
        semanas: Array.from({ length: semanas }, (_, i) => {
          const k = i + 1
          if (k > pasadas) return null
          return c.usuarios > 0 ? Math.round(((c.act.get(k) || 0) / c.usuarios) * 1000) / 10 : 0
        }),
      }
    })
}

/** Mediana de una lista (null si está vacía). */
export function mediana(xs: number[]): number | null {
  const v = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b)
  if (!v.length) return null
  const m = Math.floor(v.length / 2)
  return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2
}

/** CSV con separador `;` (Excel en español) y BOM; celdas con comillas escapadas. */
export function aCsv(columnas: string[], filas: (string | number | boolean | null | undefined)[][]): string {
  const cel = (v: string | number | boolean | null | undefined) => {
    if (v === null || v === undefined) return ''
    const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v)
    // evita inyección de fórmulas al abrir en Excel
    const seguro = /^[=+\-@]/.test(s) && typeof v !== 'number' ? `'${s}` : s
    return /[";\n\r]/.test(seguro) ? `"${seguro.replace(/"/g, '""')}"` : seguro
  }
  return `﻿${[columnas.map(cel).join(';'), ...filas.map((f) => f.map(cel).join(';'))].join('\r\n')}\r\n`
}
