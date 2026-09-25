'use client'
// Métricas del administrador (D27) — /admin/metricas.
// Solo para emails de ADMIN_EMAILS: la API responde 404 a cualquier otro y esta pantalla muestra
// "Esta página no existe". Todo se calcula en el servidor (SQL agregado); acá solo se dibuja.
// Secciones: Usuarios, Uso, Embudos, Retención, Negocio y Fichas (por usuario y por activo).
import { useCallback, useEffect, useMemo, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { Loading, EmptyState } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import {
  ArrowLeft, BarChart3, Compass, Download, Info, Loader2, Search, UserRound, Activity,
} from 'lucide-react'

type Resumen = { clave: string; etiqueta: string; valor: number | string | null; formato?: 'n' | 'ars' | 'usd' | 'pct' | 'min' | 'fecha'; ayuda?: string }
type Tabla = { titulo: string; columnas: string[]; filas: (string | number | null)[][]; nota?: string }
type RespSeccion = {
  seccion: string; periodo: { desde: string; hasta: string; excluirPrueba: boolean }
  registroDesde: string | null; salud: { tipo: string; ultimo: string; total: number }[]; ms: number
  resumen: Resumen[]; tablas: Record<string, Tabla>
}
type Ficha = {
  usuario: { id: string; email: string; nombre: string; roles: string; creado: string; eliminado: string | null; dni: string; emailVerificado: boolean; celVerificado: boolean; comoNosConocio: string | null; ciudad: string | null; plan: string | null; comercio: string | null }
  uso: { sesiones: number; minutosActivos: number | null; vistas: number; eventos: number; primera: string | null; ultima: string | null }
  sesiones: { id: string; inicio: string; ultima: string; minutos: number | null; vistas: number; eventos: number; entrada: string | null; origen: string | null; dispositivo: string | null }[]
  linea: { fecha: string; fuente: 'uso' | 'negocio'; tipo: string; detalle: string; path: string | null; entityType: string | null; entityId: string | null }[]
  activos: { entityType: string; entityId: string; tipo: string; ultimo: string }[]
}
type FichaActivo = { tipo: string; id: string; titulo: string; datos: [string, string | number | null][]; linea: { fecha: string; fuente: string; quien: string | null; rol: string | null; que: string; detalle: string | null }[] }

const PESTANAS = [
  { id: 'usuarios', label: 'Usuarios' },
  { id: 'uso', label: 'Uso' },
  { id: 'embudos', label: 'Embudos' },
  { id: 'retencion', label: 'Retención' },
  { id: 'negocio', label: 'Negocio' },
  { id: 'fichas', label: 'Fichas' },
] as const
const PERIODOS = [
  { id: 'hoy', label: 'Hoy' }, { id: '7', label: '7 días' }, { id: '30', label: '30 días' }, { id: '90', label: '90 días' }, { id: 'rango', label: 'Rango' },
]
const NOMBRE_ACTIVO: Record<string, string> = {
  project: 'Proyecto', order: 'Pedido', purchase: 'Sub-pedido', invoice: 'Factura', charge: 'Cobro', job: 'Trabajo', bid: 'Oferta',
  stock: 'Producto de stock', conversation: 'Conversación', review: 'Reseña', work: 'Obra', return: 'Devolución',
  professional: 'Perfil profesional', provider: 'Perfil proveedor', feedback: 'Sugerencia', user: 'Usuario',
}
const selectCls = 'homy-glass-input homy-focus min-h-[44px] w-full min-w-0 rounded-xl px-3 text-[13.5px] font-semibold text-[#0A2540]'

const fechaHora = (s: string | null) => (s ? new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: 'America/Argentina/Buenos_Aires' }) : '—')
const soloFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'America/Argentina/Buenos_Aires' }) : '—')
const num = (v: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(v)

function formatear(v: Resumen['valor'], f?: Resumen['formato']): string {
  if (v === null || v === undefined || v === '') return '—'
  if (typeof v === 'string') return f === 'fecha' ? soloFecha(v) : v
  if (f === 'ars') return formatARS(v)
  if (f === 'usd') return `US$ ${num(v)}`
  if (f === 'pct') return `${num(v)} %`
  if (f === 'min') return `${num(v)} min`
  return num(v)
}

export default function AdminMetricasScreen() {
  const { query } = useRoute()
  const tab = (PESTANAS.some((p) => p.id === query.tab) ? query.tab : 'usuarios') as (typeof PESTANAS)[number]['id']
  const [periodo, setPeriodo] = useState('30')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [incluirPrueba, setIncluirPrueba] = useState(false)
  const [data, setData] = useState<RespSeccion | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noExiste, setNoExiste] = useState(false)

  const params = useMemo(() => {
    const sp = new URLSearchParams({ periodo })
    if (periodo === 'rango' && desde && hasta) { sp.set('desde', desde); sp.set('hasta', hasta) }
    if (incluirPrueba) sp.set('prueba', 'incluir')
    return sp
  }, [periodo, desde, hasta, incluirPrueba])

  const seccion = tab === 'fichas' ? 'usuarios' : tab
  const load = useCallback(async () => {
    if (periodo === 'rango' && (!desde || !hasta)) return
    setCargando(true)
    try {
      const sp = new URLSearchParams(params)
      sp.set('seccion', seccion)
      const res = await fetch(`/api/admin/metricas?${sp}`)
      if (res.status === 404) { setNoExiste(true); return }
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'No pudimos cargar las métricas'); return }
      setError(null)
      setData(d)
    } catch {
      setError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.')
    } finally {
      setCargando(false)
    }
  }, [params, seccion, periodo, desde, hasta])
  useEffect(() => { void load() }, [load])

  if (noExiste) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
        <div className="homy-glass w-full max-w-md rounded-3xl px-8 py-10">
          <span className="homy-empty-icon homy-chip-navy mx-auto"><Compass className="size-7" aria-hidden /></span>
          <p className="homy-eyebrow">Error 404</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-navy">Esta página no existe</h1>
          <button onClick={() => navigate('/panel')} className="homy-btn-dark mt-7 px-6 py-3.5 text-[15px]">
            <ArrowLeft className="size-4.5" aria-hidden /> Volver al panel
          </button>
        </div>
      </div>
    )
  }

  const irTab = (id: string) => navigate(`/admin/metricas?tab=${id}`)
  const csvHref = (tabla: string) => {
    const sp = new URLSearchParams(params)
    sp.set('seccion', seccion)
    sp.set('csv', tabla)
    return `/api/admin/metricas?${sp}`
  }

  return (
    <div className="homy-page pb-44 lg:pb-10">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Administración</span>
          <h1 className="homy-page-title mt-1.5">Métricas</h1>
          <p className="homy-page-sub">
            Uso de la plataforma y resultados del negocio. {data?.registroDesde
              ? <>El registro de uso empezó el {soloFecha(data.registroDesde)}.</>
              : <>Todavía no hay uso registrado: se registra desde el 25/09/2026.</>}
          </p>
        </div>
      </header>

      <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Secciones de métricas">
        {PESTANAS.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={tab === p.id} className="homy-tab shrink-0" data-track={`métricas: ${p.label}`} onClick={() => irTab(p.id)}>
            {p.label}
          </button>
        ))}
      </div>

      {tab !== 'fichas' && tab !== 'retencion' && (
        <div className="homy-glass mb-4 rounded-2xl p-3 sm:p-4">
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
              {PERIODOS.map((p) => (
                <button key={p.id} type="button" className="homy-tab" aria-pressed={periodo === p.id} data-track={`período ${p.label}`} onClick={() => setPeriodo(p.id)}>{p.label}</button>
              ))}
            </div>
            <label className="ml-auto inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] font-semibold text-slate-600">
              <input type="checkbox" className="size-4 accent-[#1D63B8]" checked={!incluirPrueba} onChange={(e) => setIncluirPrueba(!e.target.checked)} />
              Excluir cuentas demo y de prueba
            </label>
          </div>
          {periodo === 'rango' && (
            <div className="mt-2.5 grid grid-cols-2 gap-2 sm:max-w-md">
              <label className="text-[12px] font-bold text-slate-500">Desde
                <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={`${selectCls} mt-1`} />
              </label>
              <label className="text-[12px] font-bold text-slate-500">Hasta
                <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={`${selectCls} mt-1`} />
              </label>
            </div>
          )}
        </div>
      )}
      {tab === 'retencion' && (
        <div className="homy-glass mb-4 flex flex-wrap items-center gap-2 rounded-2xl p-3 text-[13px] text-slate-600 sm:p-4">
          <Info className="size-4 shrink-0 text-[#1D63B8]" aria-hidden /> Cohortes de las últimas 8 semanas hasta hoy.
          <label className="ml-auto inline-flex min-h-[44px] cursor-pointer items-center gap-2 font-semibold">
            <input type="checkbox" className="size-4 accent-[#1D63B8]" checked={!incluirPrueba} onChange={(e) => setIncluirPrueba(!e.target.checked)} />
            Excluir cuentas demo y de prueba
          </label>
        </div>
      )}

      {tab === 'fichas' ? (
        <Fichas />
      ) : error ? (
        <div className="homy-glass rounded-2xl p-4 text-sm text-red-700">{error} <button type="button" onClick={() => void load()} className="font-bold underline">Reintentar</button></div>
      ) : !data || data.seccion !== seccion ? (
        <Loading text="Calculando métricas…" />
      ) : (
        <div className={cargando ? 'opacity-60 transition-opacity' : ''}>
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
            {data.resumen.map((r) => (
              <div key={r.clave} className="homy-glass min-w-0 rounded-2xl p-3.5" title={r.ayuda || undefined}>
                <p className="text-[12px] font-bold leading-snug text-slate-500">{r.etiqueta}</p>
                <p className="mt-1 break-words text-[1.35rem] font-extrabold leading-tight tracking-tight text-[#0A2540]">{formatear(r.valor, r.formato)}</p>
                {r.ayuda && <p className="mt-1 text-[11px] leading-snug text-slate-400">{r.ayuda}</p>}
              </div>
            ))}
          </div>
          <div className="mt-4 grid gap-4 xl:grid-cols-2">
            {Object.entries(data.tablas).map(([k, t]) => (
              k === 'cohortes'
                ? <TablaCohortes key={k} t={t} csv={csvHref(k)} />
                : <TablaVista key={k} t={t} csv={csvHref(k)} />
            ))}
          </div>
          <SaludRegistro salud={data.salud} ms={data.ms} />
        </div>
      )}
    </div>
  )
}

/** Tabla con barra de magnitud en la primera columna numérica (un solo tono: es una magnitud). */
function TablaVista({ t, csv }: { t: Tabla; csv: string }) {
  const col = t.columnas.findIndex((_, i) => i > 0 && t.filas.some((f) => typeof f[i] === 'number'))
  const max = col > 0 ? Math.max(0, ...t.filas.map((f) => (typeof f[col] === 'number' ? (f[col] as number) : 0))) : 0
  return (
    <section className="homy-glass min-w-0 rounded-2xl p-3.5 sm:p-4" aria-label={t.titulo}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="text-[15px] font-extrabold leading-snug text-[#0A2540]">{t.titulo}</h2>
        <a href={csv} download data-track="descargar CSV" className="homy-focus inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-bold text-[#1D63B8] hover:bg-white/70">
          <Download className="size-3.5" aria-hidden /> CSV
        </a>
      </div>
      {t.nota && <p className="mb-2 text-[12px] leading-snug text-slate-500">{t.nota}</p>}
      {t.filas.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-slate-400">Sin datos en este período.</p>
      ) : (
        <div className="max-h-[420px] overflow-auto">
          <table className="w-full min-w-[280px] border-separate border-spacing-y-1 text-left text-[12.5px]">
            <thead className="sticky top-0 bg-white/85 backdrop-blur">
              <tr>{t.columnas.map((c, i) => <th key={c} scope="col" className={`px-2 py-1.5 font-bold text-slate-500 ${i > 0 ? 'text-right' : ''}`}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {t.filas.map((f, ri) => (
                <tr key={ri}>
                  {f.map((v, ci) => {
                    const esNum = typeof v === 'number'
                    const pct = ci === col && esNum && max > 0 ? Math.max(2, ((v as number) / max) * 100) : 0
                    return (
                      <td key={ci} className={`px-2 py-1 align-top ${ci > 0 ? 'text-right tabular-nums' : 'break-words font-semibold text-[#0A2540]'}`} title={ci === col && esNum ? `${t.columnas[0]}: ${f[0]} · ${t.columnas[ci]}: ${num(v as number)}` : undefined}>
                        {ci === col && esNum ? (
                          <span className="flex items-center justify-end gap-2">
                            <span className="hidden h-2 w-16 overflow-hidden rounded-full bg-slate-100 sm:block" aria-hidden>
                              <span className="block h-full rounded-full bg-[#1D63B8]" style={{ width: `${pct}%` }} />
                            </span>
                            <span className="text-slate-700">{num(v as number)}</span>
                          </span>
                        ) : v === null ? <span className="text-slate-300">—</span>
                          : esNum ? <span className="text-slate-700">{num(v as number)}</span>
                          : /^\d{4}-\d{2}-\d{2}T/.test(String(v)) ? fechaHora(String(v)) : String(v)}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

/** Matriz de retención: el tono del casillero crece con el porcentaje (un solo tono, claro → oscuro). */
function TablaCohortes({ t, csv }: { t: Tabla; csv: string }) {
  return (
    <section className="homy-glass min-w-0 rounded-2xl p-3.5 sm:p-4 xl:col-span-2" aria-label={t.titulo}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="text-[15px] font-extrabold leading-snug text-[#0A2540]">{t.titulo}</h2>
        <a href={csv} download data-track="descargar CSV" className="homy-focus inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-bold text-[#1D63B8] hover:bg-white/70">
          <Download className="size-3.5" aria-hidden /> CSV
        </a>
      </div>
      {t.nota && <p className="mb-2 text-[12px] leading-snug text-slate-500">{t.nota}</p>}
      {t.filas.length === 0 ? <p className="py-4 text-center text-[13px] text-slate-400">Todavía no hay registros en estas semanas.</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-separate border-spacing-0.5 text-center text-[12px]">
            <thead><tr>{t.columnas.map((c) => <th key={c} scope="col" className="px-1.5 py-1 font-bold text-slate-500">{c}</th>)}</tr></thead>
            <tbody>
              {t.filas.map((f, ri) => (
                <tr key={ri}>
                  {f.map((v, ci) => {
                    if (ci < 2) return <td key={ci} className="px-1.5 py-1.5 font-semibold text-[#0A2540]">{typeof v === 'number' ? num(v) : v}</td>
                    if (v === null) return <td key={ci} className="rounded-md bg-slate-50 px-1.5 py-1.5 text-slate-300">·</td>
                    const p = Number(v)
                    const alfa = 0.08 + Math.min(1, p / 60) * 0.8
                    return (
                      <td key={ci} title={`${f[0]} · ${t.columnas[ci]}: ${num(p)} %`} className="rounded-md px-1.5 py-1.5 font-bold tabular-nums"
                        style={{ background: `rgba(29,99,184,${alfa})`, color: alfa > 0.5 ? '#fff' : '#0A2540' }}>
                        {num(p)} %
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function SaludRegistro({ salud, ms }: { salud: RespSeccion['salud']; ms: number }) {
  if (!salud.length) return null
  return (
    <details className="homy-glass mt-4 rounded-2xl p-3.5 text-[12.5px] text-slate-600 sm:p-4">
      <summary className="cursor-pointer font-bold text-[#0A2540]" data-track="ver salud del registro">
        <Activity className="mr-1.5 inline size-4 text-[#1D63B8]" aria-hidden />Salud del registro (último evento de cada tipo) · calculado en {num(ms / 1000)} s
      </summary>
      <ul className="mt-2 grid gap-1 sm:grid-cols-2">
        {salud.map((s) => <li key={s.tipo}><span className="font-semibold">{s.tipo}</span>: {num(s.total)} en las últimas 24 h · último {fechaHora(s.ultimo)}</li>)}
      </ul>
    </details>
  )
}

// ───────────────────────────── Fichas ─────────────────────────────

function Fichas() {
  const { query } = useRoute()
  const uid = query.u || ''
  const activo = query.a || ''
  const [q, setQ] = useState('')
  const [resultados, setResultados] = useState<{ id: string; email: string; nombre: string; roles: string; creado: string; eliminado: boolean }[] | null>(null)
  const [buscando, setBuscando] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  async function buscar(e?: React.FormEvent) {
    e?.preventDefault()
    if (q.trim().length < 2) { setMsg('Escribí al menos 2 letras del email o del nombre.'); return }
    setBuscando(true); setMsg(null)
    try {
      const res = await fetch(`/api/admin/metricas/usuario?q=${encodeURIComponent(q.trim())}`)
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setMsg(d.error || 'No pudimos buscar'); return }
      setResultados(d.usuarios)
    } finally { setBuscando(false) }
  }

  if (activo) return <FichaActivoVista ref_={activo} />
  if (uid) return <FichaUsuarioVista id={uid} />
  return (
    <div className="grid gap-4">
      <form onSubmit={buscar} data-track="buscar usuario (métricas)" className="homy-glass rounded-2xl p-3.5 sm:p-4">
        <label className="text-[13px] font-bold text-[#0A2540]" htmlFor="met-q">Buscar un usuario</label>
        <div className="mt-2 flex gap-2">
          <div className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <input id="met-q" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Email o nombre" className="homy-glass-input homy-focus min-h-[44px] w-full rounded-xl pl-9 pr-3 text-[14px] text-[#0A2540]" />
          </div>
          <button type="submit" className="homy-btn-dark min-h-[44px] shrink-0 px-4 text-sm" disabled={buscando}>
            {buscando ? <Loader2 className="size-4 animate-spin" aria-hidden /> : 'Buscar'}
          </button>
        </div>
        {msg && <p className="mt-2 text-[13px] text-red-700">{msg}</p>}
        <p className="mt-2 text-[12px] text-slate-500">La ficha junta el uso registrado y los hechos de negocio (proyectos, compras, facturas, reseñas, mensajes enviados — sin su texto).</p>
      </form>
      {resultados && (resultados.length === 0 ? (
        <EmptyState icon={<UserRound />} title="No encontramos usuarios" hint="Probá con otra parte del email o del nombre." />
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2" aria-label="Usuarios encontrados">
          {resultados.map((u) => (
            <li key={u.id}>
              <button type="button" data-track="abrir ficha de usuario" data-entity={`user:${u.id}`} onClick={() => navigate(`/admin/metricas?tab=fichas&u=${u.id}`)}
                className="homy-glass homy-focus w-full min-w-0 rounded-2xl p-3 text-left hover:bg-white/80">
                <span className="block truncate font-bold text-[#0A2540]">{u.nombre}{u.eliminado ? ' (eliminada)' : ''}</span>
                <span className="block truncate text-[12.5px] text-slate-500">{u.email}</span>
                <span className="mt-0.5 block text-[12px] text-slate-400">{rolesTexto(u.roles)} · desde {soloFecha(u.creado)}</span>
              </button>
            </li>
          ))}
        </ul>
      ))}
    </div>
  )
}

function rolesTexto(r: string) {
  try { return (JSON.parse(r) as string[]).join(', ') || 'sin rol' } catch { return r }
}

function FichaUsuarioVista({ id }: { id: string }) {
  const [f, setF] = useState<Ficha | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [filtro, setFiltro] = useState<'todo' | 'uso' | 'negocio'>('todo')
  useEffect(() => {
    let vivo = true
    fetch(`/api/admin/metricas/usuario?id=${encodeURIComponent(id)}`)
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!vivo) return; if (r.ok) setF(d); else setErr(d.error || 'No pudimos cargar la ficha') })
      .catch(() => { if (vivo) setErr('No pudimos conectarnos') })
    return () => { vivo = false }
  }, [id])
  if (err) return <div className="homy-glass rounded-2xl p-4 text-sm text-red-700">{err}</div>
  if (!f) return <Loading text="Armando la ficha…" />
  const linea = f.linea.filter((l) => filtro === 'todo' || l.fuente === filtro)
  const u = f.usuario
  return (
    <div className="grid gap-4">
      <button type="button" onClick={() => navigate('/admin/metricas?tab=fichas')} className="homy-focus inline-flex min-h-[40px] w-fit items-center gap-1.5 text-[13px] font-bold text-[#1D63B8]">
        <ArrowLeft className="size-4" aria-hidden /> Buscar otro usuario
      </button>
      <section className="homy-glass rounded-2xl p-4">
        <h2 className="break-words text-lg font-extrabold text-[#0A2540]">{u.nombre}{u.eliminado ? ' · cuenta eliminada' : ''}</h2>
        <p className="break-all text-[13px] text-slate-500">{u.email}</p>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px] sm:grid-cols-4">
          {[
            ['Roles', rolesTexto(u.roles)], ['Alta', soloFecha(u.creado)], ['DNI', u.dni], ['Email / celular', `${u.emailVerificado ? 'verificado' : 'sin verificar'} / ${u.celVerificado ? 'verificado' : 'sin verificar'}`],
            ['Cómo nos conoció', u.comoNosConocio || '—'], ['Ciudad', u.ciudad || '—'], ['Plan (proveedor)', u.plan || '—'], ['Comercio', u.comercio || '—'],
            ['Sesiones', num(f.uso.sesiones)], ['Tiempo activo', `${num(f.uso.minutosActivos || 0)} min`], ['Pantallas vistas', num(f.uso.vistas)], ['Última actividad', fechaHora(f.uso.ultima)],
          ].map(([k, v]) => (
            <div key={k} className="min-w-0"><dt className="font-bold text-slate-500">{k}</dt><dd className="break-words text-[#0A2540]">{v}</dd></div>
          ))}
        </dl>
      </section>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] xl:items-start">
        <section className="homy-glass min-w-0 rounded-2xl p-3.5 sm:p-4" aria-label="Línea de tiempo">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-[15px] font-extrabold text-[#0A2540]">Línea de tiempo</h2>
            <div className="flex items-center gap-1.5">
              {(['todo', 'uso', 'negocio'] as const).map((x) => (
                <button key={x} type="button" className="homy-tab" aria-pressed={filtro === x} onClick={() => setFiltro(x)}>{x === 'todo' ? 'Todo' : x === 'uso' ? 'Uso' : 'Negocio'}</button>
              ))}
              <a href={`/api/admin/metricas/usuario?id=${encodeURIComponent(id)}&csv=linea`} download data-track="descargar CSV" className="homy-focus inline-flex min-h-[36px] items-center gap-1 px-2 text-[12px] font-bold text-[#1D63B8]"><Download className="size-3.5" aria-hidden /> CSV</a>
            </div>
          </div>
          {linea.length === 0 ? <p className="py-4 text-center text-[13px] text-slate-400">Sin actividad registrada.</p> : (
            <ol className="max-h-[560px] space-y-1.5 overflow-auto pr-1">
              {linea.map((l, i) => (
                <li key={i} className="flex min-w-0 gap-2.5 rounded-xl bg-white/55 px-2.5 py-2 text-[12.5px]">
                  <span className={`mt-1 size-2 shrink-0 rounded-full ${l.fuente === 'uso' ? 'bg-slate-400' : 'bg-[#1D63B8]'}`} aria-hidden />
                  <div className="min-w-0 flex-1">
                    <p className="break-words"><span className="font-bold text-[#0A2540]">{l.tipo}</span> <span className="text-slate-600">{l.detalle}</span></p>
                    <p className="text-[11.5px] text-slate-400">{fechaHora(l.fecha)} · {l.fuente}{l.path ? ` · ${l.path}` : ''}</p>
                  </div>
                  {l.entityType && l.entityId && (
                    <button type="button" data-track="abrir ficha de activo" onClick={() => navigate(`/admin/metricas?tab=fichas&a=${l.entityType}:${l.entityId}`)} className="homy-focus shrink-0 self-center text-[11.5px] font-bold text-[#1D63B8]">
                      {NOMBRE_ACTIVO[l.entityType] || l.entityType}
                    </button>
                  )}
                </li>
              ))}
            </ol>
          )}
        </section>
        <div className="grid gap-4">
          <section className="homy-glass min-w-0 rounded-2xl p-3.5 sm:p-4" aria-label="Activos vinculados">
            <h2 className="mb-2 text-[15px] font-extrabold text-[#0A2540]">Activos vinculados</h2>
            {f.activos.length === 0 ? <p className="text-[13px] text-slate-400">Ninguno.</p> : (
              <ul className="flex flex-wrap gap-1.5">
                {f.activos.map((a) => (
                  <li key={`${a.entityType}:${a.entityId}`}>
                    <button type="button" data-track="abrir ficha de activo" onClick={() => navigate(`/admin/metricas?tab=fichas&a=${a.entityType}:${a.entityId}`)} className="homy-pill homy-focus max-w-full text-[12px] font-semibold">
                      <span className="truncate">{NOMBRE_ACTIVO[a.entityType] || a.entityType} · {a.tipo}</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className="homy-glass min-w-0 rounded-2xl p-3.5 sm:p-4" aria-label="Sesiones">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-extrabold text-[#0A2540]">Sesiones</h2>
              <a href={`/api/admin/metricas/usuario?id=${encodeURIComponent(id)}&csv=sesiones`} download data-track="descargar CSV" className="homy-focus inline-flex min-h-[36px] items-center gap-1 px-2 text-[12px] font-bold text-[#1D63B8]"><Download className="size-3.5" aria-hidden /> CSV</a>
            </div>
            {f.sesiones.length === 0 ? <p className="text-[13px] text-slate-400">Sin sesiones registradas (el registro de uso empezó el 25/09/2026).</p> : (
              <ul className="max-h-[360px] space-y-1.5 overflow-auto text-[12.5px]">
                {f.sesiones.map((s) => (
                  <li key={s.id} className="rounded-xl bg-white/55 px-2.5 py-2">
                    <p className="font-semibold text-[#0A2540]">{fechaHora(s.inicio)} · {num(s.minutos || 0)} min activos</p>
                    <p className="text-slate-500">{s.vistas} pantallas · {s.eventos} eventos · entró por {s.entrada || '—'}{s.origen ? ` · desde ${s.origen}` : ''}</p>
                    <p className="text-[11.5px] text-slate-400">{s.dispositivo || '—'}</p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  )
}

function FichaActivoVista({ ref_ }: { ref_: string }) {
  const [tipo, id] = ref_.split(':')
  const [f, setF] = useState<FichaActivo | null>(null)
  const [err, setErr] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    fetch(`/api/admin/metricas/activo?tipo=${encodeURIComponent(tipo || '')}&id=${encodeURIComponent(id || '')}`)
      .then(async (r) => { const d = await r.json().catch(() => ({})); if (!vivo) return; if (r.ok) setF(d); else setErr(d.error || 'No pudimos cargar el activo') })
      .catch(() => { if (vivo) setErr('No pudimos conectarnos') })
    return () => { vivo = false }
  }, [tipo, id])
  return (
    <div className="grid gap-4">
      <button type="button" onClick={() => window.history.back()} className="homy-focus inline-flex min-h-[40px] w-fit items-center gap-1.5 text-[13px] font-bold text-[#1D63B8]">
        <ArrowLeft className="size-4" aria-hidden /> Volver
      </button>
      {err ? <div className="homy-glass rounded-2xl p-4 text-sm text-red-700">{err}</div> : !f ? <Loading text="Armando la ficha…" /> : (
        <>
          <section className="homy-glass rounded-2xl p-4">
            <p className="homy-eyebrow">{NOMBRE_ACTIVO[f.tipo] || f.tipo}</p>
            <h2 className="mt-1 break-words text-lg font-extrabold text-[#0A2540]">{f.titulo}</h2>
            <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[12.5px] sm:grid-cols-3">
              {f.datos.map(([k, v]) => (
                <div key={k} className="min-w-0"><dt className="font-bold text-slate-500">{k}</dt><dd className="break-words text-[#0A2540]">{v === null ? '—' : typeof v === 'number' ? num(v) : /^\d{4}-\d{2}-\d{2}T/.test(v) ? fechaHora(v) : v}</dd></div>
              ))}
            </dl>
          </section>
          <section className="homy-glass min-w-0 rounded-2xl p-3.5 sm:p-4" aria-label="Quién hizo qué y cuándo">
            <div className="mb-2 flex items-center justify-between gap-2">
              <h2 className="text-[15px] font-extrabold text-[#0A2540]">Quién hizo qué y cuándo</h2>
              <a href={`/api/admin/metricas/activo?tipo=${encodeURIComponent(f.tipo)}&id=${encodeURIComponent(f.id)}&csv=linea`} download data-track="descargar CSV" className="homy-focus inline-flex min-h-[36px] items-center gap-1 px-2 text-[12px] font-bold text-[#1D63B8]"><Download className="size-3.5" aria-hidden /> CSV</a>
            </div>
            {f.linea.length === 0 ? <p className="py-4 text-center text-[13px] text-slate-400">Sin movimientos registrados.</p> : (
              <ol className="max-h-[560px] space-y-1.5 overflow-auto pr-1">
                {f.linea.map((l, i) => (
                  <li key={i} className="flex min-w-0 gap-2.5 rounded-xl bg-white/55 px-2.5 py-2 text-[12.5px]">
                    <span className={`mt-1 size-2 shrink-0 rounded-full ${l.fuente === 'uso' ? 'bg-slate-400' : 'bg-[#1D63B8]'}`} aria-hidden />
                    <div className="min-w-0">
                      <p className="break-words"><span className="font-bold text-[#0A2540]">{l.quien || 'Sistema'}</span>{l.rol ? <span className="text-slate-400"> ({l.rol})</span> : null} · {l.que}{l.detalle ? <span className="text-slate-500"> · {l.detalle}</span> : null}</p>
                      <p className="text-[11.5px] text-slate-400">{fechaHora(l.fecha)} · {l.fuente}</p>
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </>
      )}
      <p className="flex items-center gap-1.5 text-[12px] text-slate-400"><BarChart3 className="size-3.5" aria-hidden /> Hechos de negocio en azul, uso registrado en gris.</p>
    </div>
  )
}
