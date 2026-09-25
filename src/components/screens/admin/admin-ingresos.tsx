'use client'
// Ingresos de HomIA (D30) — /admin/ingresos, dentro del área de administración (D29).
// Suscripciones de proveedores + cargo de servicio 1%: lo que entra a la cuenta de Mercado Pago de
// HomIA. Todo se calcula en el servidor (/api/admin/ingresos) con los cobros que informó Mercado
// Pago; acá solo se dibuja. Nada se estima: si falta un dato (comisión, neto), se dice.
// Pestañas: Resumen · Proveedores (estado de cuenta, movimiento, ficha) · Cobros · Cargo 1%.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { Loading } from '@/components/app/ui-bits'
import { formatARS, formatARSCents } from '@/lib/format'
import { ArrowLeft, Check, Copy, Download, Info, Search, Wallet, ExternalLink } from 'lucide-react'

type Tabla = { titulo: string; columnas: string[]; filas: (string | number | null)[][]; nota?: string; ids?: (string | null)[] }
type FilaSerie = { clave: string; suscripciones: number; cargoServicio: number; total: number; altas: number; primerasPagas: number; reactivaciones: number; bajas: number; cambiosPlan: number; neto: number }
type Resp = {
  periodo: { desde: string; hasta: string; anteriorDesde: string; gran: string; incluirPrueba: boolean }
  resumen: {
    total: number; totalAnterior: number; variacionTotal: number | null
    suscripciones: number; suscripcionesAnterior: number; variacionSuscripciones: number | null
    cargoServicio: number; cargoAnterior: number; variacionCargo: number | null
    cargoDetalle: { facturas: number; materiales: number; compras: number; total: number; pagos: number }
    cargoInformadoMp: { suma: number; conDato: number; operaciones: number }
    comisionMp: { suma: number; conDato: number; cobros: number }
    netoSuscripciones: number | null
    mrr: { basic: number; pro: number; mrr: number; precios: { basic: number; pro: number } }
    pagando: { basic: number; pro: number }
    enPrueba: number; pruebasVencen: { id: string; nombre: string; vence: string; dias: number }[]
    pruebaVencida: number; enDeuda: number; deudaTotal: number; sinCobro: number; dadosDeBaja: number
    bajasPeriodo: number; altasPeriodo: number; primerasPeriodo: number; rechazadosPeriodo: number
  }
  tablas: Record<string, Tabla>
  serie: FilaSerie[]
  registroCompletoDesde: string
  mp: { consultadas: number; sinRespuesta: number }
}
type Ficha = {
  proveedor: { id: string; userId: string | null; nombre: string; email: string | null; contacto: string | null; ciudad: string | null; plan: string | null; alta: string | null; mpPreapprovalId: string | null }
  cuenta: null | { estado: string; etiqueta: string; plan: string; desde: string | null; motivoBaja: string | null; nota?: string; ultimoCobro: { fecha: string; monto: number } | null; pagadoHasta: string | null; prueba?: { vence: string; diasRestantes: number }; deuda?: { meses: number; monto: number; intentosFallidos: { fecha: string; motivo: string | null; monto: number }[] } }
  suscripcionMp: { estado: string; proximoCobro: string | null; monto: number | null; entorno: string } | null
  mpError: boolean
  totalPagado: number
  linea: { fecha: string; tipo: string; detalle: string; monto: number | null; estado?: string }[]
}

const PESTANAS = [
  { id: 'resumen', label: 'Resumen' },
  { id: 'proveedores', label: 'Proveedores' },
  { id: 'cobros', label: 'Cobros de suscripción' },
  { id: 'cargo', label: 'Cargo 1%' },
] as const
const PERIODOS = [
  { id: 'hoy', label: 'Hoy' }, { id: '7', label: '7 días' }, { id: '30', label: '30 días' }, { id: '90', label: '90 días' }, { id: '365', label: '12 meses' }, { id: 'rango', label: 'Rango' },
]
const GRANS = [{ id: 'dia', label: 'Día' }, { id: 'semana', label: 'Semana' }, { id: 'mes', label: 'Mes' }]
const ESTADOS_CUENTA = [
  { id: '', label: 'Todos' }, { id: 'al_dia', label: 'Al día' }, { id: 'en_deuda', label: 'En deuda' }, { id: 'sin_cobro', label: 'Sin cobro' },
  { id: 'en_prueba', label: 'En prueba' }, { id: 'prueba_vencida', label: 'Prueba vencida' }, { id: 'baja', label: 'Dados de baja' },
]
const ESTADOS_COBRO = [
  { id: '', label: 'Todos los estados' }, { id: 'approved', label: 'Aprobados' }, { id: 'rejected', label: 'Rechazados' }, { id: 'pending', label: 'Pendientes' },
  { id: 'in_process', label: 'En proceso' }, { id: 'refunded', label: 'Reembolsados' }, { id: 'cancelled', label: 'Cancelados' },
]
const MONEDA = new Set(['Monto', 'Comisión MP', 'Neto', 'Subtotal', 'Cargo (según HomIA)', 'Cargo informado por MP', 'Monto último cobro', 'Deuda', 'Pagado', 'Cargo 1% generado', 'Suscripciones', 'Cargo 1%', 'Total'])
const PORCIENTO = new Set(['Churn %', 'Conversión %'])
const COPIABLE = new Set(['Pago de MP'])
const ESTADO_PRE: Record<string, string> = { authorized: 'activa (autorizada)', pending: 'pendiente de autorizar', paused: 'pausada', cancelled: 'cancelada' }
const SOLO_FECHA = new Set(['Fecha (según MP)', 'Pagado hasta', 'Prueba vence', 'Desde'])
const selectCls = 'homy-glass-input homy-focus min-h-[44px] w-full min-w-0 rounded-xl px-3 text-[13.5px] font-semibold text-[#0A2540]'
// categóricos validados (dataviz: CVD ΔE ≥ 10, luminosidad y croma en banda)
const C_SUS = '#1D63B8'
const C_CARGO = '#D97706'
const C_ALTAS = '#1D63B8'
const C_PAGAS = '#0F8F68'
const C_BAJAS = '#D97706'

const TZ = 'America/Argentina/Buenos_Aires'
const fechaHora = (s: string | null) => (s ? new Date(s).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit', timeZone: TZ }) : '—')
const soloFecha = (s: string | null) => (s ? new Date(s).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: TZ }) : '—')
const num = (v: number) => new Intl.NumberFormat('es-AR', { maximumFractionDigits: 2 }).format(v)
const pct = (v: number | null) => (v === null ? 'sin período anterior para comparar' : `${v > 0 ? '+' : ''}${num(v)} % vs período anterior`)
const hoyAR = () => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
const haceDias = (d: number) => new Date(Date.now() - 3 * 3600_000 - d * 86_400_000).toISOString().slice(0, 10)

export default function AdminIngresosScreen() {
  const { query } = useRoute()
  const tab = (PESTANAS.some((p) => p.id === query.tab) ? query.tab : 'resumen') as (typeof PESTANAS)[number]['id']
  const fichaId = query.p || ''
  const [periodo, setPeriodo] = useState('30')
  const [desde, setDesde] = useState('')
  const [hasta, setHasta] = useState('')
  const [gran, setGran] = useState('dia')
  const [incluirPrueba, setIncluirPrueba] = useState(false)
  const [buscar, setBuscar] = useState('')
  const [buscarAplicado, setBuscarAplicado] = useState('')
  const [plan, setPlan] = useState('')
  const [estado, setEstado] = useState('')
  const [estadoCuenta, setEstadoCuenta] = useState('')
  const [data, setData] = useState<Resp | null>(null)
  const [cargando, setCargando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [noExiste, setNoExiste] = useState(false)

  const params = useMemo(() => {
    const sp = new URLSearchParams()
    if (periodo === '365') { sp.set('periodo', 'rango'); sp.set('desde', haceDias(364)); sp.set('hasta', hoyAR()) }
    else if (periodo === 'rango' && desde && hasta) { sp.set('periodo', 'rango'); sp.set('desde', desde); sp.set('hasta', hasta) }
    else sp.set('periodo', periodo === 'rango' ? '30' : periodo)
    sp.set('gran', gran)
    if (incluirPrueba) sp.set('prueba', 'incluir')
    if (buscarAplicado) sp.set('proveedor', buscarAplicado)
    if (plan) sp.set('plan', plan)
    if (estado && tab === 'cobros') sp.set('estado', estado)
    if (estadoCuenta && tab === 'proveedores') sp.set('estadoCuenta', estadoCuenta)
    return sp
  }, [periodo, desde, hasta, gran, incluirPrueba, buscarAplicado, plan, estado, estadoCuenta, tab])

  const load = useCallback(async () => {
    if (periodo === 'rango' && (!desde || !hasta)) return
    setCargando(true)
    try {
      const res = await fetch(`/api/admin/ingresos?${params}`, { cache: 'no-store' })
      if (res.status === 404) { setNoExiste(true); return }
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'No pudimos cargar los ingresos'); return }
      setError(null)
      setData(d)
    } catch {
      setError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.')
    } finally {
      setCargando(false)
    }
  }, [params, periodo, desde, hasta])
  // carga asíncrona (el setState ocurre después del fetch)
  useEffect(() => { if (!fichaId) void load() }, [load, fichaId])

  if (noExiste) {
    return (
      <div className="homy-glass mx-auto mt-10 max-w-md rounded-3xl px-8 py-10 text-center">
        <p className="homy-eyebrow">Error 404</p>
        <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-navy">Esta página no existe</h1>
      </div>
    )
  }
  if (fichaId) return <FichaProveedor id={fichaId} />

  const irTab = (id: string) => navigate(`/admin/ingresos?tab=${id}`)
  const csvHref = (t: string) => {
    const sp = new URLSearchParams(params)
    sp.set('csv', t)
    return `/api/admin/ingresos?${sp}`
  }
  const abrirFicha = (id: string) => navigate(`/admin/ingresos?tab=proveedores&p=${encodeURIComponent(id)}`)

  return (
    <div className="homy-page pb-44 lg:pb-10">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Administración</span>
          <h1 className="homy-page-title mt-1.5">Ingresos de HomIA</h1>
          <p className="homy-page-sub">Suscripciones de proveedores y cargo de servicio del 1%. Los cobros entran a la cuenta de Mercado Pago de HomIA (la misma de las apps).</p>
        </div>
      </header>

      <div className="homy-glass-soft mb-3 flex items-start gap-2 rounded-2xl p-3 text-[12.5px] leading-snug text-slate-600">
        <Info className="mt-0.5 size-4 shrink-0 text-[#1D63B8]" aria-hidden />
        <p>Estos son los cobros registrados en HomIA; el saldo real de tu cuenta de Mercado Pago puede diferir por comisiones, impuestos y retenciones de Mercado Pago.
          {data && data.resumen.comisionMp.conDato > 0 && <> En este período Mercado Pago informó comisiones por <b>{formatARSCents(data.resumen.comisionMp.suma)}</b> en {data.resumen.comisionMp.conDato} de {data.resumen.comisionMp.cobros} cobros de suscripción.</>}
        </p>
      </div>

      <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1" role="tablist" aria-label="Secciones de ingresos">
        {PESTANAS.map((p) => (
          <button key={p.id} type="button" role="tab" aria-selected={tab === p.id} className="homy-tab shrink-0" data-track={`ingresos: ${p.label}`} onClick={() => irTab(p.id)}>{p.label}</button>
        ))}
      </div>

      <div className="homy-glass mb-4 rounded-2xl p-3 sm:p-4">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Período">
            {PERIODOS.map((p) => (
              <button key={p.id} type="button" className="homy-tab" aria-pressed={periodo === p.id} data-track={`ingresos período ${p.label}`} onClick={() => { setPeriodo(p.id); if (p.id === '365') setGran('mes') }}>{p.label}</button>
            ))}
          </div>
          <div className="flex gap-1.5" role="group" aria-label="Agrupar por">
            {GRANS.map((g) => (
              <button key={g.id} type="button" className="homy-tab" aria-pressed={gran === g.id} data-track={`ingresos agrupar ${g.label}`} onClick={() => setGran(g.id)}>{g.label}</button>
            ))}
          </div>
          <label className="ml-auto inline-flex min-h-[44px] cursor-pointer items-center gap-2 text-[13px] font-semibold text-slate-600">
            <input type="checkbox" className="size-4 accent-[#1D63B8]" checked={!incluirPrueba} onChange={(e) => setIncluirPrueba(!e.target.checked)} />
            Excluir cuentas demo y cobros de prueba
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
        {tab !== 'resumen' && (
          <form className="mt-2.5 grid gap-2 sm:grid-cols-[1fr_auto_auto]" onSubmit={(e) => { e.preventDefault(); setBuscarAplicado(buscar.trim()) }} data-track="ingresos: filtrar">
            <label className="relative block">
              <span className="sr-only">Buscar por nombre del comercio</span>
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
              <input value={buscar} onChange={(e) => setBuscar(e.target.value)} onBlur={() => setBuscarAplicado(buscar.trim())} placeholder={tab === 'cargo' ? 'Vendedor o comprador' : 'Nombre del comercio'} className={`${selectCls} pl-9`} />
            </label>
            {tab !== 'cargo' && (
              <select value={plan} onChange={(e) => setPlan(e.target.value)} className={selectCls} aria-label="Plan">
                <option value="">Todos los planes</option><option value="basic">Básico</option><option value="pro">PRO</option>
              </select>
            )}
            {tab === 'cobros' && (
              <select value={estado} onChange={(e) => setEstado(e.target.value)} className={selectCls} aria-label="Estado del cobro">
                {ESTADOS_COBRO.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}
              </select>
            )}
          </form>
        )}
        {tab === 'proveedores' && (
          <div className="mt-2.5 flex gap-1.5 overflow-x-auto pb-0.5" role="group" aria-label="Estado de cuenta">
            {ESTADOS_CUENTA.map((x) => (
              <button key={x.id || 'todos'} type="button" className="homy-tab shrink-0" aria-pressed={estadoCuenta === x.id} data-track={`ingresos estado ${x.label}`} onClick={() => setEstadoCuenta(x.id)}>{x.label}</button>
            ))}
          </div>
        )}
      </div>

      {error ? (
        <div className="homy-glass rounded-2xl p-4 text-sm text-red-700">{error} <button type="button" onClick={() => void load()} className="font-bold underline">Reintentar</button></div>
      ) : !data ? (
        <Loading text="Calculando ingresos…" />
      ) : (
        <div className={cargando ? 'opacity-60 transition-opacity' : ''}>
          {tab === 'resumen' && <Resumen d={data} csv={csvHref} abrir={abrirFicha} />}
          {tab === 'proveedores' && (
            <div className="grid gap-4">
              <Kpis items={[
                { k: 'Al día', v: String(data.resumen.pagando.basic + data.resumen.pagando.pro), a: `Básico ${data.resumen.pagando.basic} · PRO ${data.resumen.pagando.pro}` },
                { k: 'En deuda', v: String(data.resumen.enDeuda), a: data.resumen.enDeuda ? `Deben ${formatARS(data.resumen.deudaTotal)} en total` : 'Nadie debe' },
                { k: 'En prueba', v: String(data.resumen.enPrueba), a: `${data.resumen.pruebaVencida} con la prueba vencida sin plan` },
                { k: 'Dados de baja', v: String(data.resumen.dadosDeBaja), a: `${data.resumen.bajasPeriodo} baja(s) en el período` },
              ]} />
              <TablaVista t={data.tablas.cuentas} csv={csvHref('cuentas')} onFila={abrirFicha} ancho />
              <GraficoMovimiento serie={data.serie} />
              <TablaVista t={data.tablas.movimiento} csv={csvHref('movimiento')} ancho />
              <TablaVista t={data.tablas.mensual} csv={csvHref('mensual')} ancho />
            </div>
          )}
          {tab === 'cobros' && data.tablas.cobros && <TablaVista t={data.tablas.cobros} csv={csvHref('cobros')} onFila={abrirFicha} ancho />}
          {tab === 'cargo' && data.tablas.cargos && (
            <div className="grid gap-4">
              <Kpis items={[
                { k: 'Cargo 1% del período', v: formatARSCents(data.resumen.cargoServicio), a: pct(data.resumen.variacionCargo) },
                { k: 'Operaciones', v: String(data.tablas.cargos.filas.length), a: `Facturas ${formatARSCents(data.resumen.cargoDetalle.facturas)} · Materiales ${formatARSCents(data.resumen.cargoDetalle.materiales + data.resumen.cargoDetalle.compras)}` },
                { k: 'Informado por Mercado Pago', v: data.resumen.cargoInformadoMp.conDato ? formatARSCents(data.resumen.cargoInformadoMp.suma) : 'Sin dato', a: `${data.resumen.cargoInformadoMp.conDato} de ${data.resumen.cargoInformadoMp.operaciones} operaciones con el dato de MP` },
              ]} />
              <TablaVista t={data.tablas.cargos} csv={csvHref('cargos')} ancho />
              <TablaVista t={data.tablas.ranking_vendedores} csv={csvHref('ranking_vendedores')} />
            </div>
          )}
          <p className="mt-4 text-[11.5px] leading-snug text-slate-400">
            Movimientos del plan registrados en vivo desde el {soloFecha(`${data.registroCompletoDesde}T15:00:00Z`)}; lo anterior se reconstruyó con las fechas de Mercado Pago (suscripciones y cobros).
            {data.mp.sinRespuesta > 0 && ` Mercado Pago no respondió por ${data.mp.sinRespuesta} de ${data.mp.consultadas} suscripciones: su estado en MP figura "sin respuesta".`}
          </p>
        </div>
      )}
    </div>
  )
}

type Kpi = { k: string; v: string; a?: string }
function Kpis({ items }: { items: Kpi[] }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((it) => (
        <div key={it.k} className="homy-glass min-w-0 rounded-2xl p-3.5">
          <p className="text-[12px] font-bold leading-snug text-slate-500">{it.k}</p>
          <p className="mt-1 break-words text-[1.3rem] font-extrabold leading-tight tracking-tight text-[#0A2540]">{it.v}</p>
          {it.a && <p className="mt-1 text-[11px] leading-snug text-slate-500">{it.a}</p>}
        </div>
      ))}
    </div>
  )
}

function Resumen({ d, csv, abrir }: { d: Resp; csv: (t: string) => string; abrir: (id: string) => void }) {
  const r = d.resumen
  return (
    <div className="grid gap-4">
      <Kpis items={[
        { k: 'Ingresos del período', v: formatARSCents(r.total), a: pct(r.variacionTotal) },
        { k: 'Suscripciones', v: formatARSCents(r.suscripciones), a: pct(r.variacionSuscripciones) },
        { k: 'Cargo de servicio 1%', v: formatARSCents(r.cargoServicio), a: pct(r.variacionCargo) },
        { k: 'MRR (ingreso mensual recurrente)', v: formatARS(r.mrr.mrr), a: `${r.mrr.basic} Básico × ${formatARS(r.mrr.precios.basic)} + ${r.mrr.pro} PRO × ${formatARS(r.mrr.precios.pro)}` },
        { k: 'Proveedores pagando', v: String(r.pagando.basic + r.pagando.pro), a: `Básico ${r.pagando.basic} · PRO ${r.pagando.pro}` },
        { k: 'En prueba', v: String(r.enPrueba), a: r.pruebasVencen.length ? `Próxima en vencer: ${r.pruebasVencen[0].nombre}, ${r.pruebasVencen[0].dias === 0 ? 'hoy' : `en ${r.pruebasVencen[0].dias} día(s)`}` : 'Nadie en prueba' },
        { k: 'Con cobro rechazado / en deuda', v: String(r.enDeuda), a: `${r.rechazadosPeriodo} cobro(s) rechazado(s) en el período` },
        { k: 'Bajas del período', v: String(r.bajasPeriodo), a: `Altas ${r.altasPeriodo} · primeras suscripciones ${r.primerasPeriodo}` },
      ]} />
      <GraficoIngresos serie={d.serie} />
      {r.pruebasVencen.length > 0 && (
        <section className="homy-glass rounded-2xl p-3.5 sm:p-4" aria-label="Pruebas que vencen">
          <h2 className="mb-2 text-[15px] font-extrabold text-[#0A2540]">Pruebas que vencen pronto</h2>
          <ul className="grid gap-1.5 text-[13px]">
            {r.pruebasVencen.map((p) => (
              <li key={p.id}>
                <button type="button" onClick={() => abrir(p.id)} data-track="ingresos: abrir ficha" className="homy-focus flex w-full min-w-0 items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-left hover:bg-white/70">
                  <span className="truncate font-semibold text-[#0A2540]">{p.nombre}</span>
                  <span className="shrink-0 text-slate-500">{soloFecha(p.vence)} · {p.dias === 0 ? 'vence hoy' : `${p.dias} día(s)`}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-4 xl:grid-cols-2">
        <TablaVista t={d.tablas.proximos} csv={csv('proximos')} onFila={abrir} />
        <TablaVista t={d.tablas.ranking_proveedores} csv={csv('ranking_proveedores')} onFila={abrir} />
        {d.tablas.ranking_vendedores && <TablaVista t={d.tablas.ranking_vendedores} csv={csv('ranking_vendedores')} />}
        <TablaVista t={d.tablas.mensual} csv={csv('mensual')} />
      </div>
    </div>
  )
}

// ───────────────────────────── gráficos (SVG liviano) ─────────────────────────────

type Serie = { clave: keyof FilaSerie; nombre: string; color: string; moneda?: boolean }

function etiquetaClave(k: string) {
  if (/^\d{4}-\d{2}$/.test(k)) {
    const [y, m] = k.split('-').map(Number)
    return new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('es-AR', { month: 'short', year: '2-digit', timeZone: 'UTC' })
  }
  const [y, m, dd] = k.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, dd, 12)).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'UTC' })
}

/** Barras (apiladas o agrupadas) con tooltip al pasar el dedo o el mouse. Una sola escala. */
function Barras({ titulo, serie, series, apilado, nota }: { titulo: string; serie: FilaSerie[]; series: Serie[]; apilado: boolean; nota?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 720
  const H = 220
  const pad = { l: 8, r: 8, t: 12, b: 26 }
  const n = serie.length || 1
  const valor = (f: FilaSerie, s: Serie) => Number(f[s.clave]) || 0
  const max = Math.max(1, ...serie.map((f) => (apilado ? series.reduce((a, s) => a + valor(f, s), 0) : Math.max(...series.map((s) => valor(f, s))))))
  const bw = (W - pad.l - pad.r) / n
  const inner = Math.max(2, bw * 0.72)
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max)
  const cada = Math.ceil(n / 8)
  const fmt = (v: number, s: Serie) => (s.moneda ? formatARSCents(v) : num(v))
  const vacio = serie.every((f) => series.every((s) => valor(f, s) === 0))
  return (
    <section className="homy-glass min-w-0 rounded-2xl p-3.5 sm:p-4" aria-label={titulo}>
      <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-[15px] font-extrabold text-[#0A2540]">{titulo}</h2>
        <ul className="flex flex-wrap gap-3 text-[12px] font-semibold text-slate-600">
          {series.map((s) => <li key={s.nombre} className="inline-flex items-center gap-1.5"><span className="inline-block size-2.5 rounded-sm" style={{ background: s.color }} aria-hidden />{s.nombre}</li>)}
        </ul>
      </div>
      {nota && <p className="mb-1 text-[12px] text-slate-500">{nota}</p>}
      {vacio ? <p className="py-8 text-center text-[13px] text-slate-400">Sin movimientos en este período.</p> : (
        <div className="relative">
          <svg viewBox={`0 0 ${W} ${H}`} className="block h-auto w-full" role="img" aria-label={`${titulo}: gráfico de barras`} onMouseLeave={() => setHover(null)}>
            {[0.5, 1].map((g) => <line key={g} x1={pad.l} x2={W - pad.r} y1={y(max * g)} y2={y(max * g)} stroke="#e2e8f0" strokeWidth={1} />)}
            <line x1={pad.l} x2={W - pad.r} y1={y(0)} y2={y(0)} stroke="#cbd5e1" strokeWidth={1} />
            {serie.map((f, i) => {
              const x0 = pad.l + i * bw + (bw - inner) / 2
              let acc = 0
              return (
                <g key={f.clave} opacity={hover === null || hover === i ? 1 : 0.55}>
                  {series.map((s, si) => {
                    const v = valor(f, s)
                    if (v <= 0) return null
                    if (apilado) {
                      const top = y(acc + v)
                      const h = Math.max(1, y(acc) - top - (acc > 0 ? 2 : 0))
                      acc += v
                      return <rect key={s.nombre} x={x0} y={top} width={inner} height={h} rx={Math.min(3, inner / 3)} fill={s.color} />
                    }
                    const w = Math.max(2, inner / series.length - 2)
                    return <rect key={s.nombre} x={x0 + si * (w + 2)} y={y(v)} width={w} height={Math.max(1, y(0) - y(v))} rx={Math.min(3, w / 3)} fill={s.color} />
                  })}
                  <rect x={pad.l + i * bw} y={pad.t} width={bw} height={H - pad.t - pad.b} fill="transparent" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)} />
                  {i % cada === 0 && <text x={pad.l + i * bw + bw / 2} y={H - 8} textAnchor="middle" fontSize={11} fill="#64748b">{etiquetaClave(f.clave)}</text>}
                </g>
              )
            })}
          </svg>
          {hover !== null && serie[hover] && (
            <div className="pointer-events-none absolute top-1 z-10 min-w-[160px] rounded-xl bg-white/95 p-2.5 text-[12px] shadow-lg ring-1 ring-slate-200"
              style={{ left: `${Math.min(70, Math.max(0, (hover / n) * 100 - 10))}%` }}>
              <p className="font-bold text-[#0A2540]">{etiquetaClave(serie[hover].clave)}</p>
              {series.map((s) => (
                <p key={s.nombre} className="flex items-center justify-between gap-3 text-slate-600">
                  <span className="inline-flex items-center gap-1.5"><span className="inline-block size-2 rounded-sm" style={{ background: s.color }} aria-hidden />{s.nombre}</span>
                  <span className="font-semibold tabular-nums text-[#0A2540]">{fmt(valor(serie[hover], s), s)}</span>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function GraficoIngresos({ serie }: { serie: FilaSerie[] }) {
  return <Barras titulo="Ingresos por fecha" serie={serie} apilado series={[
    { clave: 'suscripciones', nombre: 'Suscripciones', color: C_SUS, moneda: true },
    { clave: 'cargoServicio', nombre: 'Cargo 1%', color: C_CARGO, moneda: true },
  ]} />
}

function GraficoMovimiento({ serie }: { serie: FilaSerie[] }) {
  return <Barras titulo="Altas, primeras suscripciones y bajas" serie={serie} apilado={false} series={[
    { clave: 'altas', nombre: 'Altas', color: C_ALTAS },
    { clave: 'primerasPagas', nombre: 'Primeras suscripciones', color: C_PAGAS },
    { clave: 'bajas', nombre: 'Bajas', color: C_BAJAS },
  ]} nota="Altas = proveedores registrados (cada alta empieza la prueba gratis)." />
}

// ───────────────────────────── tabla ─────────────────────────────

function Celda({ v, col }: { v: string | number | null; col: string }) {
  const [copiado, setCopiado] = useState(false)
  if (v === null || v === '') return <span className="text-slate-300">—</span>
  if (typeof v === 'number') {
    if (MONEDA.has(col)) return <span className="tabular-nums text-slate-700">{formatARSCents(v)}</span>
    if (PORCIENTO.has(col)) return <span className="tabular-nums text-slate-700">{num(v)} %</span>
    return <span className="tabular-nums text-slate-700">{num(v)}</span>
  }
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return <span className="whitespace-nowrap">{SOLO_FECHA.has(col) ? soloFecha(v) : fechaHora(v)}</span>
  if (COPIABLE.has(col)) {
    return (
      <button type="button" data-track="ingresos: copiar id de pago" title="Copiar el id del pago de Mercado Pago"
        onClick={(e) => { e.stopPropagation(); void navigator.clipboard?.writeText(v).then(() => { setCopiado(true); setTimeout(() => setCopiado(false), 1500) }).catch(() => undefined) }}
        className="homy-focus inline-flex min-h-[32px] items-center gap-1 rounded-lg px-1.5 font-mono text-[11.5px] text-[#1D63B8] hover:bg-white">
        {v}{copiado ? <Check className="size-3.5" aria-hidden /> : <Copy className="size-3.5" aria-hidden />}
        <span className="sr-only">{copiado ? 'Copiado' : 'Copiar'}</span>
      </button>
    )
  }
  return <>{v}</>
}

function TablaVista({ t, csv, onFila, ancho }: { t?: Tabla; csv: string; onFila?: (id: string) => void; ancho?: boolean }) {
  if (!t) return null
  return (
    <section className="homy-glass min-w-0 rounded-2xl p-3.5 sm:p-4" aria-label={t.titulo}>
      <div className="mb-2 flex items-start justify-between gap-2">
        <h2 className="text-[15px] font-extrabold leading-snug text-[#0A2540]">{t.titulo} <span className="text-[12px] font-bold text-slate-400">({t.filas.length})</span></h2>
        <a href={csv} download data-track="ingresos: descargar CSV" className="homy-focus inline-flex min-h-[36px] shrink-0 items-center gap-1 rounded-full px-2.5 text-[12px] font-bold text-[#1D63B8] hover:bg-white/70">
          <Download className="size-3.5" aria-hidden /> CSV
        </a>
      </div>
      {t.nota && <p className="mb-2 text-[12px] leading-snug text-slate-500">{t.nota}</p>}
      {t.filas.length === 0 ? (
        <p className="py-4 text-center text-[13px] text-slate-400">Sin datos con estos filtros.</p>
      ) : (
        <div className="max-h-[480px] overflow-auto">
          <table className={`w-full border-separate border-spacing-y-1 text-left text-[12.5px] ${ancho ? 'min-w-[760px]' : 'min-w-[300px]'}`}>
            <thead className="sticky top-0 z-[1] bg-white/90 backdrop-blur">
              <tr>{t.columnas.map((c) => <th key={c} scope="col" className={`px-2 py-1.5 font-bold text-slate-500 ${MONEDA.has(c) || PORCIENTO.has(c) ? 'text-right' : ''}`}>{c}</th>)}</tr>
            </thead>
            <tbody>
              {t.filas.map((f, ri) => {
                const id = t.ids?.[ri] || null
                const clic = onFila && id ? () => onFila(id) : undefined
                return (
                  <tr key={ri} onClick={clic} className={clic ? 'cursor-pointer hover:bg-white/70' : undefined} data-track={clic ? 'ingresos: abrir ficha' : undefined} data-entity={clic && id ? `provider:${id}` : undefined}>
                    {f.map((v, ci) => (
                      <td key={ci} className={`px-2 py-1 align-top ${ci === 0 && typeof v !== 'string' ? '' : ''} ${MONEDA.has(t.columnas[ci]) || PORCIENTO.has(t.columnas[ci]) ? 'text-right' : ''} ${(ci === 1 && t.columnas[0] === 'Fecha') || (ci === 0 && t.columnas[0] !== 'Fecha') ? 'font-semibold text-[#0A2540]' : 'text-slate-600'}`}>
                        <Celda v={v} col={t.columnas[ci]} />
                      </td>
                    ))}
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

// ───────────────────────────── ficha ─────────────────────────────

const TONO: Record<string, string> = {
  al_dia: 'bg-emerald-50 text-emerald-800 ring-emerald-200',
  en_deuda: 'bg-red-50 text-red-800 ring-red-200',
  sin_cobro: 'bg-slate-50 text-slate-700 ring-slate-200',
  en_prueba: 'bg-sky-50 text-sky-800 ring-sky-200',
  prueba_vencida: 'bg-amber-50 text-amber-800 ring-amber-200',
  baja: 'bg-slate-100 text-slate-700 ring-slate-300',
}

function FichaProveedor({ id }: { id: string }) {
  const [f, setF] = useState<Ficha | null>(null)
  const [error, setError] = useState<string | null>(null)
  useEffect(() => {
    let vivo = true
    fetch(`/api/admin/ingresos/proveedor?id=${encodeURIComponent(id)}`, { cache: 'no-store' })
      .then(async (r) => {
        const d = await r.json().catch(() => ({}))
        if (!vivo) return
        if (!r.ok) setError(d.error || 'No pudimos cargar la ficha')
        else setF(d)
      })
      .catch(() => vivo && setError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.'))
    return () => { vivo = false }
  }, [id])

  const volver = (
    <button type="button" onClick={() => navigate('/admin/ingresos?tab=proveedores')} data-track="ingresos: volver" className="homy-focus mb-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-[#1D63B8] hover:bg-white/70">
      <ArrowLeft className="size-4" aria-hidden /> Volver a proveedores
    </button>
  )
  if (error) return <div className="homy-page pb-44">{volver}<div className="homy-glass rounded-2xl p-4 text-sm text-red-700">{error}</div></div>
  if (!f) return <Loading text="Cargando la ficha…" />
  const c = f.cuenta
  return (
    <div className="homy-page pb-44 lg:pb-10">
      {volver}
      <header className="homy-glass mb-4 rounded-2xl p-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <span className="homy-eyebrow">Ficha de cuenta</span>
            <h1 className="mt-1 break-words text-[1.4rem] font-extrabold leading-tight text-[#0A2540]">{f.proveedor.nombre}</h1>
            <p className="mt-0.5 break-words text-[13px] text-slate-500">{[f.proveedor.contacto, f.proveedor.email, f.proveedor.ciudad].filter(Boolean).join(' · ') || 'Proveedor eliminado: se conserva su historial de cobros'}</p>
          </div>
          {c && <span className={`inline-flex shrink-0 items-center rounded-full px-3 py-1 text-[12.5px] font-extrabold ring-1 ${TONO[c.estado] || TONO.sin_cobro}`}>{c.etiqueta}</span>}
        </div>
        <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[13px] sm:grid-cols-4">
          <Dato k="Plan" v={c ? (c.plan === 'pro' ? 'PRO' : c.plan === 'basic' ? 'Básico' : 'Sin plan pago') : '—'} />
          <Dato k="Alta" v={soloFecha(f.proveedor.alta)} />
          <Dato k="Total pagado" v={formatARSCents(f.totalPagado)} />
          <Dato k="Último cobro" v={c?.ultimoCobro ? `${soloFecha(c.ultimoCobro.fecha)} · ${formatARS(c.ultimoCobro.monto)}` : '—'} />
          {c?.pagadoHasta && <Dato k="Pagado hasta" v={soloFecha(c.pagadoHasta)} />}
          {c?.prueba && <Dato k="Prueba" v={`vence ${soloFecha(c.prueba.vence)} (${c.prueba.diasRestantes === 0 ? 'hoy' : `${c.prueba.diasRestantes} día(s)`})`} />}
          {c?.deuda && <Dato k="Deuda" v={`${formatARS(c.deuda.monto)} · ${c.deuda.meses} mes(es) desde ${soloFecha(c.desde)}`} />}
          {c?.motivoBaja && <Dato k="Baja" v={`${soloFecha(c.desde)} · ${c.motivoBaja}`} />}
          <Dato k="Suscripción en MP" v={f.suscripcionMp ? `${ESTADO_PRE[f.suscripcionMp.estado] || f.suscripcionMp.estado}${f.suscripcionMp.proximoCobro ? ` · próximo cobro ${soloFecha(f.suscripcionMp.proximoCobro)}${f.suscripcionMp.monto ? ` por ${formatARS(f.suscripcionMp.monto)}` : ''}` : ''}${f.suscripcionMp.entorno === 'test' ? ' (prueba)' : ''}` : f.mpError ? 'Mercado Pago no respondió' : f.proveedor.mpPreapprovalId ? 'no encontrada en MP' : 'sin suscripción'} />
        </dl>
        {c?.nota && <p className="mt-2 text-[12.5px] text-slate-500">{c.nota}</p>}
        {c?.deuda && c.deuda.intentosFallidos.length > 0 && (
          <div className="mt-3 rounded-xl bg-red-50/70 p-2.5 text-[12.5px] text-red-800">
            <p className="font-bold">Intentos de cobro rechazados</p>
            <ul className="mt-1 grid gap-0.5">{c.deuda.intentosFallidos.map((x, i) => <li key={i}>{fechaHora(x.fecha)} · {formatARS(x.monto)}{x.motivo ? ` · ${x.motivo}` : ''}</li>)}</ul>
          </div>
        )}
        {f.proveedor.userId && (
          <button type="button" onClick={() => navigate(`/admin/metricas?tab=fichas&u=${encodeURIComponent(f.proveedor.userId!)}`)} data-track="ingresos: ver ficha de uso" className="homy-focus mt-3 inline-flex min-h-[40px] items-center gap-1.5 rounded-full bg-white/70 px-3.5 text-[13px] font-bold text-[#1D63B8] hover:bg-white">
            <ExternalLink className="size-4" aria-hidden /> Ver su uso en Métricas
          </button>
        )}
      </header>
      <section className="homy-glass rounded-2xl p-3.5 sm:p-4" aria-label="Historial">
        <h2 className="mb-2 flex items-center gap-1.5 text-[15px] font-extrabold text-[#0A2540]"><Wallet className="size-4 text-[#1D63B8]" aria-hidden />Historial completo</h2>
        {f.linea.length === 0 ? <p className="py-4 text-center text-[13px] text-slate-400">Sin movimientos registrados.</p> : (
          <ol className="relative grid gap-2.5 border-l-2 border-slate-200 pl-4">
            {f.linea.map((x, i) => (
              <li key={i} className="relative">
                <span className={`absolute -left-[23px] top-1.5 size-3 rounded-full ring-2 ring-white ${x.estado === 'approved' ? 'bg-emerald-500' : x.estado === 'rejected' ? 'bg-red-500' : 'bg-[#1D63B8]'}`} aria-hidden />
                <p className="text-[12px] text-slate-500">{fechaHora(x.fecha)}</p>
                <p className="text-[13.5px] font-bold text-[#0A2540]">{x.tipo}{x.monto != null && <span className="ml-1.5 font-semibold text-slate-600">{formatARS(x.monto)}</span>}</p>
                {x.detalle && <p className="break-words text-[12.5px] text-slate-600">{x.detalle}</p>}
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  )
}

function Dato({ k, v }: { k: string; v: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[11.5px] font-bold text-slate-500">{k}</dt>
      <dd className="break-words font-semibold text-[#0A2540]">{v}</dd>
    </div>
  )
}
