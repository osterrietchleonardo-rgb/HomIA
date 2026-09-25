// Métricas de uso (D27) — tracker del navegador. Registro propio (first-party), sin terceros.
//
// Qué registra: vistas de pantalla (cada cambio de ruta, normalizada sin ids), clics en botones,
// links y controles (etiqueta = data-track > aria-label > title > texto visible corto), envíos de
// formularios y de acciones a la API (método + ruta normalizada + estado HTTP, nunca el cuerpo),
// diálogos que se abren, búsquedas (término, filtros y cantidad de resultados), errores de la app y
// el tiempo de uso (latido cada 30 s solo con la pestaña visible y alguien interactuando).
// Qué NUNCA registra: lo que se tipea (valores de campos, contraseñas, mensajes, montos), el texto
// de los mensajes ni datos personales. Ver src/lib/analytics/core.ts (reglas puras y testeadas).
//
// Cero impacto visible: cola en memoria, lote cada 10 s o 20 eventos, sendBeacon al ocultar la
// pestaña, y todo error se traga. Se monta UNA vez (AppRoot y la home estática).
import {
  normalizarRuta, entidadDeRuta, parsearDataEntity, rolDeRuta, etiquetaDe, mensajeError,
  resumirDispositivo, dominioReferrer, utmDe, tramoActivo, sesionVencida, limpiarBusqueda,
  LATIDO_MS, type TipoEntidad,
} from './core'

type Ev = {
  type: 'page_view' | 'click' | 'submit' | 'dialog' | 'search' | 'error' | 'heartbeat'
  name: string
  path: string
  entityType?: TipoEntidad | null
  entityId?: string | null
  role?: 'cliente' | 'profesional' | 'proveedor' | null
  props?: Record<string, string | number | boolean | null> | null
  at: number
}

const URL_COLLECT = '/api/analytics/collect'
const LS_ANON = 'homia_anon_id'
const LS_SES = 'homia_ses_v1'
const MAX_COLA = 200
const LOTE = 20
const FLUSH_MS = 10_000
const MAX_ERRORES = 20

let iniciado = false
const cola: Ev[] = []
const reintentados = new WeakSet<Ev>()
let anonId = ''
let sesion = { id: '', startedAt: 0, last: 0, entryPath: '', referrer: null as string | null, utm: null as Record<string, string> | null }
let ultimaRuta = ''
let ultimoTick = 0
let ultimaInteraccion = 0
let errores = 0
let fetchOriginal: typeof fetch | null = null
const busquedas = new Map<string, ReturnType<typeof setTimeout>>()

const ahora = () => Date.now()

function ls(): Storage | null {
  try { return window.localStorage } catch { return null }
}
function aleatorio(): string {
  try {
    if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().replace(/-/g, '')
  } catch { /* sin crypto: fallback */ }
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`
}

function escribirCookie() {
  try {
    const seguro = location.protocol === 'https:' ? '; secure' : ''
    document.cookie = `${LS_ANON}=${anonId}.${sesion.id}; path=/; max-age=31536000; samesite=lax${seguro}`
  } catch { /* sin cookies: los eventos de servidor quedan sin vincular */ }
}

function guardarSesion() {
  try { ls()?.setItem(LS_SES, JSON.stringify(sesion)) } catch { /* sin storage */ }
}

function rutaCruda(): string {
  const h = location.hash || ''
  return h.startsWith('#/') ? h.slice(1) : location.pathname || '/'
}

function nuevaSesion(t: number) {
  const raw = rutaCruda()
  sesion = {
    id: aleatorio(),
    startedAt: t,
    last: t,
    entryPath: normalizarRuta(raw),
    referrer: dominioReferrer(document.referrer, location.hostname),
    utm: utmDe(location.search || (raw.includes('?') ? raw.slice(raw.indexOf('?')) : '')),
  }
  guardarSesion()
  escribirCookie()
}

/** Actualiza la última actividad; si pasaron más de 30 min, abre una sesión nueva. */
function tocarSesion(t: number) {
  if (sesionVencida(sesion.last, t)) nuevaSesion(t)
  else {
    // se guarda a lo sumo cada 5 s (evita escribir localStorage en cada clic)
    const guardar = t - sesion.last > 5000
    sesion.last = t
    if (guardar) guardarSesion()
  }
}

function encolar(e: Omit<Ev, 'at'>) {
  try {
    const t = ahora()
    tocarSesion(t)
    cola.push({ ...e, at: t })
    if (cola.length > MAX_COLA) cola.splice(0, cola.length - MAX_COLA)
    if (cola.length >= LOTE) flush(false)
  } catch { /* nunca rompe la app */ }
}

function flush(salida: boolean) {
  try {
    if (!cola.length || !anonId) return
    const lote = cola.splice(0, 50)
    const body = JSON.stringify({
      anonId,
      sessionId: sesion.id,
      sesion: {
        startedAt: sesion.startedAt,
        entryPath: sesion.entryPath || null,
        referrer: sesion.referrer,
        utm: sesion.utm,
        device: resumirDispositivo(navigator.userAgent, window.innerWidth),
        screen: `${Math.round(window.innerWidth)}x${Math.round(window.innerHeight)}`,
      },
      events: lote,
    })
    if (salida && typeof navigator.sendBeacon === 'function') {
      if (navigator.sendBeacon(URL_COLLECT, new Blob([body], { type: 'application/json' }))) return
    }
    const f = fetchOriginal || window.fetch.bind(window)
    f(URL_COLLECT, { method: 'POST', body, headers: { 'Content-Type': 'application/json' }, keepalive: true, credentials: 'same-origin' })
      .then((r) => { if (r.status >= 500) reintentar(lote) })
      .catch(() => reintentar(lote))
  } catch { /* nunca rompe la app */ }
}

/** Reintento suave: cada evento se reintenta una sola vez, en el próximo lote. */
function reintentar(lote: Ev[]) {
  const otra = lote.filter((e) => !reintentados.has(e))
  otra.forEach((e) => reintentados.add(e))
  if (otra.length) cola.unshift(...otra.slice(-MAX_COLA))
}

function pageView() {
  const raw = rutaCruda()
  const path = normalizarRuta(raw)
  if (path === ultimaRuta) return
  ultimaRuta = path
  const ent = entidadDeRuta(raw)
  // de la query solo lo que describe la pantalla (nunca el término buscado: va en "search")
  const q = raw.includes('?') ? new URLSearchParams(raw.slice(raw.indexOf('?'))) : null
  const props: Record<string, string> = {}
  for (const k of ['rol', 'tab', 'mode', 'tipo']) {
    const v = q?.get(k)
    if (v && /^[\w-]{1,30}$/.test(v)) props[k] = v
  }
  encolar({ type: 'page_view', name: path, path, ...(ent || {}), role: rolDeRuta(path), props: Object.keys(props).length ? props : null })
}

const SELECTOR_CLIC = [
  '[data-track]', 'a', 'button', 'summary', 'select', 'label',
  '[role=button]', '[role=tab]', '[role=menuitem]', '[role=link]', '[role=option]', '[role=switch]',
  '[role=checkbox]', '[role=radio]', '[role=combobox]',
  'input[type=checkbox]', 'input[type=radio]', 'input[type=submit]', 'input[type=button]',
].join(',')

function entidadDe(el: Element): { entityType: TipoEntidad; entityId: string } | null {
  const conData = el.closest('[data-entity]')
  const d = conData ? parsearDataEntity(conData.getAttribute('data-entity')) : null
  if (d) return d
  const href = el.closest('a')?.getAttribute('href')
  if (href && (href.startsWith('#/') || href.startsWith('/'))) {
    const e = entidadDeRuta(href)
    if (e) return e
  }
  return entidadDeRuta(rutaCruda())
}

function onClick(ev: MouseEvent) {
  try {
    ultimaInteraccion = ahora()
    const t = ev.target as Element | null
    if (!t || typeof t.closest !== 'function') return
    const el = t.closest(SELECTOR_CLIC)
    if (!el || el.closest('[data-track-off]')) return
    const tag = el.tagName.toLowerCase()
    const esCampo = tag === 'select' || tag === 'input' || tag === 'textarea' || (el as HTMLElement).isContentEditable
    const href = tag === 'a' ? el.getAttribute('href') : null
    const name = etiquetaDe({
      tag,
      dataTrack: el.getAttribute('data-track'),
      ariaLabel: el.getAttribute('aria-label'),
      title: el.getAttribute('title'),
      texto: esCampo ? null : (el.textContent || '').slice(0, 200),
      href,
      esCampo,
      tipoCampo: el.getAttribute('type') || el.getAttribute('role'),
    })
    const props: Record<string, string> = { tag }
    const role = el.getAttribute('role')
    if (role) props.rol_ui = role.slice(0, 20)
    if (href && (href.startsWith('#/') || href.startsWith('/'))) props.destino = normalizarRuta(href)
    else if (href && /^https?:/i.test(href)) props.destino = 'externo'
    encolar({ type: 'click', name, path: ultimaRuta || normalizarRuta(rutaCruda()), ...(entidadDe(el) || {}), role: rolDeRuta(ultimaRuta), props })
  } catch { /* nunca rompe la app */ }
}

function onSubmit(ev: Event) {
  try {
    const f = ev.target as HTMLFormElement | null
    if (!f || f.tagName !== 'FORM') return
    const nombre = f.getAttribute('data-track') || f.getAttribute('aria-label') || f.getAttribute('name') || f.id || `form:${ultimaRuta}`
    encolar({ type: 'submit', name: etiquetaDe({ tag: 'form', dataTrack: nombre }), path: ultimaRuta, ...(entidadDeRuta(rutaCruda()) || {}), role: rolDeRuta(ultimaRuta), props: { via: 'form' } })
  } catch { /* nunca rompe la app */ }
}

/** Cada acción contra la API (POST/PUT/PATCH/DELETE) con su resultado; GET solo si falla el server. */
function envolverFetch() {
  if (fetchOriginal || typeof window.fetch !== 'function') return
  const orig = window.fetch.bind(window)
  fetchOriginal = orig
  const envuelto: typeof fetch = (input, init) => {
    const p = orig(input, init)
    try {
      const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
      const metodo = String(init?.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')).toUpperCase()
      const u = new URL(url, location.href)
      if (u.origin === location.origin && u.pathname.startsWith('/api/') && !u.pathname.startsWith('/api/analytics')) {
        const t0 = ahora()
        const anotar = (status: number) => {
          if (metodo === 'GET' && status > 0 && status < 500) return
          const ruta = normalizarRuta(u.pathname)
          encolar({
            type: metodo === 'GET' ? 'error' : 'submit',
            name: `${metodo} ${ruta}`.slice(0, 80),
            path: ultimaRuta || '/',
            ...(entidadDeRuta(u.pathname) || entidadDeRuta(rutaCruda()) || {}),
            role: rolDeRuta(ultimaRuta),
            props: { via: 'api', status, ok: status >= 200 && status < 400, ms: ahora() - t0 },
          })
        }
        p.then((r) => anotar(r.status), () => anotar(0))
      }
    } catch { /* nunca rompe la app */ }
    return p
  }
  window.fetch = envuelto
}

function observarDialogos() {
  try {
    const vistos = new WeakSet<Element>()
    const revisar = () => {
      document.querySelectorAll('[role=dialog],[role=alertdialog]').forEach((d) => {
        if (vistos.has(d)) return
        vistos.add(d)
        const lb = d.getAttribute('aria-labelledby')
        const titulo = lb ? document.getElementById(lb)?.textContent || '' : ''
        const name = etiquetaDe({ tag: 'dialogo', dataTrack: d.getAttribute('data-track'), ariaLabel: d.getAttribute('aria-label'), texto: titulo })
        encolar({ type: 'dialog', name, path: ultimaRuta, ...(entidadDeRuta(rutaCruda()) || {}), role: rolDeRuta(ultimaRuta) })
      })
    }
    // los diálogos de Radix se montan en un portal, hijo directo de <body>: no hace falta subtree
    new MutationObserver((muts) => {
      if (muts.some((m) => m.addedNodes.length)) setTimeout(revisar, 0)
    }).observe(document.body, { childList: true })
  } catch { /* sin MutationObserver */ }
}

function onError(msg: unknown) {
  if (errores >= MAX_ERRORES) return
  errores++
  encolar({ type: 'error', name: mensajeError(msg).slice(0, 80), path: ultimaRuta || '/', role: rolDeRuta(ultimaRuta) })
}

function latido(salida: boolean) {
  const t = ahora()
  const ms = tramoActivo({ ahora: t, ultimoTick, visible: document.visibilityState === 'visible' || salida, ultimaInteraccion })
  ultimoTick = t
  if (ms > 0) encolar({ type: 'heartbeat', name: 'latido', path: ultimaRuta || '/', props: { ms } })
}

/** Arranca el tracker (idempotente). Se llama desde AppRoot y desde la home estática. */
export function iniciarTracker() {
  if (iniciado || typeof window === 'undefined') return
  iniciado = true
  try {
    const t = ahora()
    const store = ls()
    // interruptor interno de QA (mide la navegación sin el tracker): no registra nada
    if (store?.getItem('homia_track_off') === '1') return
    anonId = store?.getItem(LS_ANON) || ''
    if (!/^[A-Za-z0-9_-]{8,64}$/.test(anonId)) {
      anonId = aleatorio()
      try { store?.setItem(LS_ANON, anonId) } catch { /* sin storage: id por pestaña */ }
    }
    try {
      const s = JSON.parse(store?.getItem(LS_SES) || 'null')
      if (s && typeof s.id === 'string' && /^[A-Za-z0-9_-]{8,64}$/.test(s.id) && !sesionVencida(s.last, t)) sesion = { ...sesion, ...s }
      else nuevaSesion(t)
    } catch { nuevaSesion(t) }
    escribirCookie()
    ultimoTick = t
    ultimaInteraccion = t

    envolverFetch()
    pageView()
    window.addEventListener('hashchange', pageView)
    window.addEventListener('popstate', pageView)
    // navegación de Next (pushState sin hashchange): se revisa la ruta después de cada cambio
    for (const m of ['pushState', 'replaceState'] as const) {
      const orig = history[m].bind(history)
      history[m] = ((...args: Parameters<History['pushState']>) => {
        const r = orig(...args)
        setTimeout(pageView, 0)
        return r
      }) as History['pushState']
    }
    document.addEventListener('click', onClick, { capture: true, passive: true })
    document.addEventListener('submit', onSubmit, { capture: true })
    const tocar = () => { ultimaInteraccion = ahora() }
    for (const ev of ['pointerdown', 'keydown', 'scroll', 'touchstart']) {
      document.addEventListener(ev, tocar, { capture: true, passive: true })
    }
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') { latido(true); flush(true) }
      else { ultimoTick = ahora(); ultimaInteraccion = ahora(); tocarSesion(ahora()) }
    })
    window.addEventListener('pagehide', () => { latido(true); flush(true) })
    window.addEventListener('error', (e) => onError(e.message || e.error))
    window.addEventListener('unhandledrejection', (e) => onError(e.reason))
    observarDialogos()
    setInterval(() => { if (document.visibilityState === 'visible') latido(false) }, LATIDO_MS)
    setInterval(() => flush(false), FLUSH_MS)
  } catch { /* nunca rompe la app */ }
}

/**
 * Búsqueda (término, filtros y cantidad de resultados). Espera 1,5 s sin cambios por pantalla
 * para no registrar cada tecla: queda solo el término final.
 */
export function trackBusqueda(pantalla: string, termino: string, resultados: number, filtros?: Record<string, string | number | boolean | null | undefined>) {
  try {
    if (typeof window === 'undefined') return
    const q = limpiarBusqueda(termino)
    const f: Record<string, string | number | boolean> = {}
    for (const [k, v] of Object.entries(filtros || {})) {
      if (v === undefined || v === null || v === '' || v === 'todos' || v === 'all') continue
      if (/^[a-zA-Z_][a-zA-Z0-9_]{0,20}$/.test(k)) f[k] = typeof v === 'string' ? v.slice(0, 40) : v
    }
    if (!q && !Object.keys(f).length) return
    const previo = busquedas.get(pantalla)
    if (previo) clearTimeout(previo)
    busquedas.set(pantalla, setTimeout(() => {
      busquedas.delete(pantalla)
      encolar({
        type: 'search', name: q || '(solo filtros)', path: ultimaRuta || '/', role: rolDeRuta(ultimaRuta),
        props: { pantalla: pantalla.slice(0, 30), resultados: Math.max(0, Math.round(resultados)), ...Object.fromEntries(Object.entries(f).slice(0, 8)) },
      })
    }, 1500))
  } catch { /* nunca rompe la app */ }
}

/** Al cerrar sesión: nuevo id de visitante (lo que haga otra persona en este navegador no se
 *  pega a la cuenta anterior ni a la próxima). */
export function reiniciarVisitante() {
  try {
    if (typeof window === 'undefined' || !iniciado) return
    flush(false)
    anonId = aleatorio()
    try { ls()?.setItem(LS_ANON, anonId) } catch { /* sin storage */ }
    nuevaSesion(ahora())
  } catch { /* nunca rompe la app */ }
}
