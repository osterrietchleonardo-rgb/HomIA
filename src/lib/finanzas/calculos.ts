// Finanzas (D24): cálculos PUROS (sin base ni red) del estado de resultados, la caja,
// el balance, las métricas y las recomendaciones. Todo número sale de lo que recibe:
// datos reales de HomIA (armados en datos.ts) y los movimientos que cargó el usuario.
// Nada se estima salvo el margen estimado que el proveedor declara explícitamente
// (y se marca como estimación). Divisiones por cero → null ("sin dato"), nunca NaN.
// Tests: node --test --import ./scripts/homy-test-alias.mjs src/lib/finanzas/__tests__/*.test.ts
import { TIPOS, nombreCategoria, type RolFinanzas, type TipoMovimiento } from './conceptos'

// ─────────────────────────── fechas (hora argentina, UTC-3 sin horario de verano) ───────────────────────────

const AR = 3 * 3600_000
const DIA = 86400_000

/** "AAAA-MM" del mes argentino de una fecha. */
export function claveMes(d: Date): string {
  const a = new Date(d.getTime() - AR)
  return `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, '0')}`
}
/** Primer instante del mes argentino "AAAA-MM" (00:00 AR = 03:00 UTC). */
export function inicioMes(clave: string): Date {
  const [y, m] = clave.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, 1, 3))
}
export function sumarMeses(clave: string, n: number): string {
  const [y, m] = clave.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 + n, 1))
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}`
}
/** Inicio del día argentino "AAAA-MM-DD". */
export function inicioDia(dia: string): Date {
  const [y, m, d] = dia.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d, 3))
}
/** Fin del día argentino de `d` (exclusivo): "hasta hoy" = todo lo de hoy, a cualquier hora.
 *  Los días cargados se guardan al mediodía; sin esto, a la madrugada lo de hoy quedaba "en el futuro". */
export function finDia(d: Date): Date {
  return new Date(inicioDia(claveDia(d)).getTime() + DIA)
}
export function claveDia(d: Date): string {
  const a = new Date(d.getTime() - AR)
  return `${a.getUTCFullYear()}-${String(a.getUTCMonth() + 1).padStart(2, '0')}-${String(a.getUTCDate()).padStart(2, '0')}`
}
const MESES = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic']
export function etiquetaMes(clave: string, conAnio = true): string {
  const [y, m] = clave.split('-').map(Number)
  return conAnio ? `${MESES[m - 1]} ${String(y).slice(2)}` : MESES[m - 1]
}
const MESES_LARGO = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']

export const r2 = (n: number) => Math.round(n * 100) / 100
/** a/b o null si no se puede (b = 0, datos no finitos). */
export function div(a: number, b: number): number | null {
  if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null
  const v = a / b
  return Number.isFinite(v) ? v : null
}
const pct = (a: number, b: number) => {
  const v = div(a, b)
  return v === null ? null : r2(v * 100)
}
/** Variación % de `actual` contra `anterior` (null si el anterior es 0). */
export function variacion(actual: number, anterior: number): number | null {
  if (anterior === 0) return null
  return pct(actual - anterior, Math.abs(anterior))
}

// ─────────────────────────── períodos ───────────────────────────

export type Preset = 'mes' | 'mes_anterior' | '3m' | '6m' | '12m' | 'anio' | 'rango'
export type Periodo = { preset: Preset; desde: Date; hasta: Date; prevDesde: Date; prevHasta: Date; etiqueta: string; etiquetaPrev: string }

/** Período [desde, hasta) en hora argentina + el período anterior de igual largo. */
export function periodo(preset: Preset, hoy: Date, rango?: { desde: string; hasta: string }): Periodo {
  const mesHoy = claveMes(hoy)
  const deMeses = (inicio: string, n: number, etiqueta: string, etiquetaPrev: string): Periodo => ({
    preset, desde: inicioMes(inicio), hasta: inicioMes(sumarMeses(inicio, n)),
    prevDesde: inicioMes(sumarMeses(inicio, -n)), prevHasta: inicioMes(inicio), etiqueta, etiquetaPrev,
  })
  const nombreMes = (k: string) => {
    const [y, m] = k.split('-').map(Number)
    return `${MESES_LARGO[m - 1]} ${y}`
  }
  switch (preset) {
    case 'mes_anterior': {
      const k = sumarMeses(mesHoy, -1)
      return deMeses(k, 1, nombreMes(k), nombreMes(sumarMeses(k, -1)))
    }
    case '3m': return deMeses(sumarMeses(mesHoy, -2), 3, 'Últimos 3 meses', 'los 3 meses anteriores')
    case '6m': return deMeses(sumarMeses(mesHoy, -5), 6, 'Últimos 6 meses', 'los 6 meses anteriores')
    case '12m': return deMeses(sumarMeses(mesHoy, -11), 12, 'Últimos 12 meses', 'los 12 meses anteriores')
    case 'anio': {
      const y = mesHoy.slice(0, 4)
      return deMeses(`${y}-01`, 12, `Año ${y}`, `año ${Number(y) - 1}`)
    }
    case 'rango': {
      if (!rango) throw new Error('rango sin fechas')
      const desde = inicioDia(rango.desde)
      const hasta = new Date(inicioDia(rango.hasta).getTime() + DIA)
      const largo = hasta.getTime() - desde.getTime()
      return {
        preset, desde, hasta, prevDesde: new Date(desde.getTime() - largo), prevHasta: desde,
        etiqueta: `Del ${rango.desde.split('-').reverse().join('/')} al ${rango.hasta.split('-').reverse().join('/')}`,
        etiquetaPrev: 'el período anterior de igual largo',
      }
    }
    default:
      return deMeses(mesHoy, 1, nombreMes(mesHoy), nombreMes(sumarMeses(mesHoy, -1)))
  }
}

// ─────────────────────────── entradas ───────────────────────────

/** Venta de HomIA: factura del profesional o cobro (venta) del proveedor. */
export type VentaAuto = {
  id: string
  kind: 'factura' | 'cobro'
  numero: string
  descripcion: string
  total: number
  /** solo facturas: mano de obra y materiales facturados */
  manoObra?: number
  materiales?: number
  emitida: Date
  cobradaEn: Date | null
  clienteId: string
  projectId: string | null
  link: string
  /** proveedor: lo vendido, para el costo de la mercadería */
  lineas?: { elementId: string | null; nombre: string; cantidad: number; precioUnitario: number }[]
}

/** Devolución de sobrantes reembolsada. venta = devolviste plata a un cliente; reintegro = te la devolvieron a vos. */
export type DevolucionAuto = {
  id: string
  kind: 'venta' | 'reintegro'
  monto: number
  fecha: Date
  descripcion: string
  link: string
  projectId: string | null
  /** proveedor: lo que volvió al stock (revierte el costo de lo vendido) */
  lineas?: { elementId: string; cantidad: number }[]
}

/** Costo que HomIA registra solo (profesional): materiales comprados en la app o un subcontrato por HomIA. */
export type CostoAuto = {
  id: string
  kind: 'compra_homia' | 'subcontrato_homia'
  monto: number
  /** cuándo se devengó (compra pagada / factura emitida) */
  fecha: Date
  /** cuándo salió la plata (null = todavía no se pagó) */
  pagadoEn: Date | null
  descripcion: string
  link: string
  projectId: string | null
  /** marcado "no es del negocio" (compra personal) */
  personal: boolean
}

export type EstadoMov = 'pagado' | 'pendiente'

export type Movimiento = {
  id: string
  type: TipoMovimiento
  category: string
  description: string
  amount: number
  interestAmount?: number | null
  date: Date
  paymentMethod?: string | null
  recurring?: 'mensual' | null
  recurringUntil?: Date | null
  projectId?: string | null
  usefulLifeMonths?: number | null
  status: EstadoMov
  attachmentUrl?: string | null
}

/** `detalle`: marca o rubro, para distinguir productos con el mismo nombre. */
export type LineaStock = { id: string; elementId: string; nombre: string; detalle?: string | null; cantidad: number; precio: number; costo: number | null }
export type Oferta = { status: string; createdAt: Date }
export type Obra = { id: string; title: string }

export type ConfigFinanzas = {
  saldoInicial: number | null
  fechaSaldoInicial: Date | null
  /** proveedor: "compro al X% del precio de venta" (estimación declarada) */
  costoEstimadoPct: number | null
}

export type EntradaFinanzas = {
  rol: RolFinanzas
  hoy: Date
  config: ConfigFinanzas
  ventas: VentaAuto[]
  devoluciones: DevolucionAuto[]
  costosAuto: CostoAuto[]
  movimientos: Movimiento[]
  stock: LineaStock[]
  ofertas: Oferta[]
  obras: Obra[]
}

// ─────────────────────────── recurrentes y amortización ───────────────────────────

export type Ocurrencia = Movimiento & { baseId: string; proyectado: boolean }

/** Expande los recurrentes mensuales: una ocurrencia por mes desde su fecha hasta
 *  min(límite, hoy, fin del recurrente). El día se ajusta al último día del mes si hace falta. */
export function expandir(movs: Movimiento[], limite: Date, hoy: Date): Ocurrencia[] {
  const out: Ocurrencia[] = []
  const tope = Math.min(limite.getTime(), finDia(hoy).getTime())
  for (const m of movs) {
    out.push({ ...m, baseId: m.id, proyectado: false })
    if (m.recurring !== 'mensual') continue
    const fin = Math.min(tope, m.recurringUntil ? m.recurringUntil.getTime() + 1 : Infinity)
    const a = new Date(m.date.getTime() - AR)
    const dia = a.getUTCDate()
    for (let i = 1; i < 600; i++) {
      const y = a.getUTCFullYear()
      const mo = a.getUTCMonth() + i
      const ultimo = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate()
      const f = new Date(Date.UTC(y, mo, Math.min(dia, ultimo), a.getUTCHours(), a.getUTCMinutes()) + AR)
      if (f.getTime() >= fin) break
      out.push({ ...m, id: `${m.id}#${claveMes(f)}`, baseId: m.id, date: f, proyectado: true })
    }
  }
  return out
}

export const VIDA_UTIL_DEFECTO = 36

/** Cuotas de amortización de una inversión: el primer mes en la fecha de compra, después el día 1 de cada mes. */
export function cuotasAmortizacion(m: Movimiento): { fecha: Date; monto: number }[] {
  if (m.type !== 'inversion' || m.amount <= 0) return []
  const meses = Math.max(1, Math.round(m.usefulLifeMonths || VIDA_UTIL_DEFECTO))
  const cuota = m.amount / meses
  const k0 = claveMes(m.date)
  const out = [{ fecha: m.date, monto: cuota }]
  for (let i = 1; i < meses; i++) out.push({ fecha: inicioMes(sumarMeses(k0, i)), monto: cuota })
  return out
}

// ─────────────────────────── estado de resultados ───────────────────────────

const en = (d: Date, desde: Date, hasta: Date) => d.getTime() >= desde.getTime() && d.getTime() < hasta.getTime()
const suma = <T>(xs: T[], f: (x: T) => number) => xs.reduce((a, x) => a + f(x), 0)

export type CostoMercaderia = {
  conocido: number
  estimado: number
  ventasSinCosto: number
  revertido: number
  /** proveedor: ventas por fuera de HomIA (mostrador) costeadas con el margen estimado declarado */
  fueraEstimado: number
  /** proveedor: ventas por fuera de HomIA sin costo (no hay margen estimado declarado) */
  fueraSinCosto: number
}

export type Resultados = {
  ventasHomia: number
  manoObra: number
  materialesFacturados: number
  ventasFuera: number
  ventasBrutas: number
  devoluciones: number
  ventasNetas: number
  costoDirecto: number
  costoManual: number
  comprasHomia: number
  subcontratosHomia: number
  reintegros: number
  mercaderia: CostoMercaderia
  margenBruto: number
  margenBrutoPct: number | null
  gastos: number
  gastosPorCategoria: { categoria: string; nombre: string; monto: number }[]
  resultadoOperativo: number
  amortizaciones: number
  resultadoAntesIntereses: number
  intereses: number
  resultadoNeto: number
  margenNetoPct: number | null
  retiros: number
  cantidadVentas: number
  hayGastosCargados: boolean
}

function mapaCostos(e: EntradaFinanzas): Map<string, { costo: number | null; precio: number }> {
  const m = new Map<string, { costo: number | null; precio: number }>()
  for (const s of e.stock) m.set(s.elementId, { costo: s.costo, precio: s.precio })
  return m
}

/** Costo de la mercadería vendida (proveedor): costo cargado, o el % estimado declarado, o sin dato. */
export function costoMercaderia(e: EntradaFinanzas, ventas: VentaAuto[], devs: DevolucionAuto[]): CostoMercaderia {
  const costos = mapaCostos(e)
  const pctEst = e.config.costoEstimadoPct
  const out: CostoMercaderia = { conocido: 0, estimado: 0, ventasSinCosto: 0, revertido: 0, fueraEstimado: 0, fueraSinCosto: 0 }
  for (const v of ventas) {
    for (const l of v.lineas || []) {
      const c = l.elementId ? costos.get(l.elementId) : undefined
      if (c && c.costo !== null) out.conocido += l.cantidad * c.costo
      else if (pctEst) out.estimado += (l.cantidad * l.precioUnitario * pctEst) / 100
      else out.ventasSinCosto += l.cantidad * l.precioUnitario
    }
  }
  // lo devuelto vuelve al stock: su costo deja de ser "costo de lo vendido"
  for (const d of devs) {
    for (const l of d.lineas || []) {
      const c = costos.get(l.elementId)
      if (c && c.costo !== null) out.revertido += l.cantidad * c.costo
      else if (pctEst && c) out.revertido += (l.cantidad * c.precio * pctEst) / 100
    }
  }
  return { conocido: r2(out.conocido), estimado: r2(out.estimado), ventasSinCosto: r2(out.ventasSinCosto), revertido: r2(out.revertido), fueraEstimado: 0, fueraSinCosto: 0 }
}

export function resultados(e: EntradaFinanzas, desde: Date, hasta: Date): Resultados {
  const ocs = expandir(e.movimientos, hasta, e.hoy).filter((m) => en(m.date, desde, hasta))
  const ventas = e.ventas.filter((v) => en(v.emitida, desde, hasta))
  const devs = e.devoluciones.filter((d) => en(d.fecha, desde, hasta))
  const devVenta = devs.filter((d) => d.kind === 'venta')
  const reint = devs.filter((d) => d.kind === 'reintegro')
  const costosAuto = e.costosAuto.filter((c) => !c.personal && en(c.fecha, desde, hasta))

  const ventasHomia = suma(ventas, (v) => v.total)
  const manoObra = suma(ventas, (v) => v.manoObra || 0)
  const materialesFacturados = suma(ventas, (v) => v.materiales || 0)
  const fuera = ocs.filter((m) => m.type === 'otro_ingreso')
  const ventasFuera = suma(fuera, (m) => m.amount)
  const ventasBrutas = ventasHomia + ventasFuera
  const devoluciones = suma(devVenta, (d) => d.monto)
  const ventasNetas = ventasBrutas - devoluciones

  const costoManual = suma(ocs.filter((m) => m.type === 'costo_directo'), (m) => m.amount)
  const comprasHomia = suma(costosAuto.filter((c) => c.kind === 'compra_homia'), (c) => c.monto)
  const subcontratosHomia = suma(costosAuto.filter((c) => c.kind === 'subcontrato_homia'), (c) => c.monto)
  const reintegros = suma(reint, (d) => d.monto)
  const mercaderia = e.rol === 'proveedor' ? costoMercaderia(e, ventas, devVenta) : { conocido: 0, estimado: 0, ventasSinCosto: 0, revertido: 0, fueraEstimado: 0, fueraSinCosto: 0 }
  if (e.rol === 'proveedor') {
    // ventas de mostrador (por fuera de HomIA): no hay líneas de producto → solo el margen estimado declarado; si no, se avisa
    const mostrador = suma(fuera.filter((m) => m.category === 'ventas_fuera'), (m) => m.amount)
    if (e.config.costoEstimadoPct) mercaderia.fueraEstimado = r2((mostrador * e.config.costoEstimadoPct) / 100)
    else mercaderia.fueraSinCosto = r2(mostrador)
  }
  const costoDirecto = costoManual + comprasHomia + subcontratosHomia - reintegros + mercaderia.conocido + mercaderia.estimado + mercaderia.fueraEstimado - mercaderia.revertido
  const margenBruto = ventasNetas - costoDirecto

  const gastosMov = ocs.filter((m) => m.type === 'gasto')
  const gastos = suma(gastosMov, (m) => m.amount)
  const porCat = new Map<string, number>()
  for (const g of gastosMov) porCat.set(g.category, (porCat.get(g.category) || 0) + g.amount)
  const gastosPorCategoria = [...porCat.entries()]
    .map(([categoria, monto]) => ({ categoria, nombre: nombreCategoria(categoria), monto: r2(monto) }))
    .sort((a, b) => b.monto - a.monto)
  const resultadoOperativo = margenBruto - gastos

  const amortizaciones = suma(
    e.movimientos.filter((m) => m.type === 'inversion').flatMap(cuotasAmortizacion).filter((c) => en(c.fecha, desde, hasta) && c.fecha.getTime() < finDia(e.hoy).getTime()),
    (c) => c.monto,
  )
  const resultadoAntesIntereses = resultadoOperativo - amortizaciones
  const intereses = suma(ocs.filter((m) => m.type === 'pago_prestamo'), (m) => Math.min(m.amount, m.interestAmount || 0))
  const resultadoNeto = resultadoAntesIntereses - intereses

  return {
    ventasHomia: r2(ventasHomia), manoObra: r2(manoObra), materialesFacturados: r2(materialesFacturados),
    ventasFuera: r2(ventasFuera), ventasBrutas: r2(ventasBrutas), devoluciones: r2(devoluciones), ventasNetas: r2(ventasNetas),
    costoDirecto: r2(costoDirecto), costoManual: r2(costoManual), comprasHomia: r2(comprasHomia), subcontratosHomia: r2(subcontratosHomia),
    reintegros: r2(reintegros), mercaderia,
    margenBruto: r2(margenBruto), margenBrutoPct: pct(margenBruto, ventasNetas),
    gastos: r2(gastos), gastosPorCategoria,
    resultadoOperativo: r2(resultadoOperativo), amortizaciones: r2(amortizaciones),
    resultadoAntesIntereses: r2(resultadoAntesIntereses), intereses: r2(intereses),
    resultadoNeto: r2(resultadoNeto), margenNetoPct: pct(resultadoNeto, ventasNetas),
    retiros: r2(suma(ocs.filter((m) => m.type === 'retiro'), (m) => m.amount)),
    cantidadVentas: ventas.length + fuera.length,
    hayGastosCargados: ocs.some((m) => m.type === 'gasto' || m.type === 'costo_directo'),
  }
}

// ─────────────────────────── caja ───────────────────────────

export type LineaCaja = { concepto: string; monto: number }
export type FlujoCaja = { entradas: number; salidas: number; detalleEntradas: LineaCaja[]; detalleSalidas: LineaCaja[] }

/** Movimientos de plata (lo cobrado y lo pagado) con fecha en [desde, hasta). */
export function flujo(e: EntradaFinanzas, desde: Date, hasta: Date): FlujoCaja {
  const ocs = expandir(e.movimientos, hasta, e.hoy).filter((m) => m.status === 'pagado' && en(m.date, desde, hasta))
  const ent = new Map<string, number>()
  const sal = new Map<string, number>()
  const add = (m: Map<string, number>, k: string, v: number) => { if (v) m.set(k, (m.get(k) || 0) + v) }
  for (const v of e.ventas) if (v.cobradaEn && en(v.cobradaEn, desde, hasta)) add(ent, e.rol === 'profesional' ? 'Facturas cobradas (HomIA)' : 'Ventas cobradas (HomIA)', v.total)
  for (const d of e.devoluciones) {
    if (!en(d.fecha, desde, hasta)) continue
    if (d.kind === 'venta') add(sal, 'Devoluciones de sobrantes', d.monto)
    else add(ent, 'Reintegros de sobrantes', d.monto)
  }
  for (const c of e.costosAuto) {
    if (c.personal || !c.pagadoEn || !en(c.pagadoEn, desde, hasta)) continue
    add(sal, c.kind === 'compra_homia' ? 'Materiales comprados en HomIA' : 'Subcontratos por HomIA', c.monto)
  }
  for (const m of ocs) {
    const info = TIPOS[m.type]
    if (!info) continue
    if (m.type === 'otro_ingreso') add(ent, 'Ingresos por fuera de HomIA', m.amount)
    else if (info.entra) add(ent, info.nombre, m.amount)
    else add(sal, m.type === 'gasto' ? 'Gastos fijos' : m.type === 'costo_directo' ? 'Costos directos' : info.nombre, m.amount)
  }
  const lista = (m: Map<string, number>) => [...m.entries()].map(([concepto, monto]) => ({ concepto, monto: r2(monto) })).sort((a, b) => b.monto - a.monto)
  const detalleEntradas = lista(ent)
  const detalleSalidas = lista(sal)
  return { entradas: r2(suma(detalleEntradas, (l) => l.monto)), salidas: r2(suma(detalleSalidas, (l) => l.monto)), detalleEntradas, detalleSalidas }
}

const MUY_ATRAS = new Date(Date.UTC(2000, 0, 1))

/** Caja estimada al instante `hasta` (exclusivo): saldo inicial + flujos desde su fecha.
 *  Sin saldo inicial se suman todos los flujos desde cero y se avisa (`sinSaldoInicial`). */
export function cajaAl(e: EntradaFinanzas, hasta: Date): { saldo: number; sinSaldoInicial: boolean } {
  const { saldoInicial, fechaSaldoInicial } = e.config
  const tieneInicial = saldoInicial !== null && fechaSaldoInicial !== null
  const desde = tieneInicial ? fechaSaldoInicial! : MUY_ATRAS
  if (hasta.getTime() <= desde.getTime()) {
    if (!tieneInicial) return { saldo: 0, sinSaldoInicial: true }
    // antes del saldo inicial: se reconstruye hacia atrás (saldo − lo que entró + lo que salió entre medio),
    // así "caja al empezar + entró − salió = caja al terminar" cierra en cualquier período
    const atras = flujo(e, hasta, desde)
    return { saldo: r2(saldoInicial! - atras.entradas + atras.salidas), sinSaldoInicial: false }
  }
  const f = flujo(e, desde, hasta)
  return { saldo: r2((tieneInicial ? saldoInicial! : 0) + f.entradas - f.salidas), sinSaldoInicial: !tieneInicial }
}

// ─────────────────────────── balance ───────────────────────────

export type Balance = {
  fecha: Date
  caja: number
  sinSaldoInicial: boolean
  cuentasPorCobrar: number
  cuentasPorCobrarHomia: number
  cuentasPorCobrarFuera: number
  inventario: number | null
  inventarioEstimado: number
  productosSinCosto: number
  bienesDeUso: number
  activos: number
  prestamos: number
  cuentasAPagar: number
  pasivos: number
  patrimonio: number
}

export function inventario(e: EntradaFinanzas): { valor: number | null; estimado: number; sinCosto: number } {
  if (e.rol !== 'proveedor') return { valor: null, estimado: 0, sinCosto: 0 }
  let conocido = 0
  let estimado = 0
  let sinCosto = 0
  for (const s of e.stock) {
    if (s.cantidad <= 0) continue
    if (s.costo !== null) conocido += s.cantidad * s.costo
    else if (e.config.costoEstimadoPct) estimado += (s.cantidad * s.precio * e.config.costoEstimadoPct) / 100
    else sinCosto++
  }
  const hayAlgo = e.stock.some((s) => s.cantidad > 0)
  return { valor: hayAlgo ? r2(conocido + estimado) : 0, estimado: r2(estimado), sinCosto }
}

/** Balance simplificado a un instante de corte `fecha` (exclusivo; nunca después del fin de hoy). */
export function balance(e: EntradaFinanzas, fecha: Date): Balance {
  const corte = new Date(Math.min(fecha.getTime(), finDia(e.hoy).getTime()))
  const { saldo: caja, sinSaldoInicial } = cajaAl(e, corte)
  const ocs = expandir(e.movimientos, corte, e.hoy).filter((m) => m.date.getTime() < corte.getTime())
  const cxcHomia = suma(e.ventas.filter((v) => v.emitida.getTime() < corte.getTime() && (!v.cobradaEn || v.cobradaEn.getTime() >= corte.getTime())), (v) => v.total)
  const cxcFuera = suma(ocs.filter((m) => m.type === 'otro_ingreso' && m.status === 'pendiente'), (m) => m.amount)
  const inv = inventario(e)
  const bienesDeUso = suma(e.movimientos.filter((m) => m.type === 'inversion' && m.date.getTime() < corte.getTime()), (m) => {
    const amort = suma(cuotasAmortizacion(m).filter((c) => c.fecha.getTime() < corte.getTime()), (c) => c.monto)
    return Math.max(0, m.amount - amort)
  })
  const recibido = suma(ocs.filter((m) => m.type === 'prestamo'), (m) => m.amount)
  const capital = suma(ocs.filter((m) => m.type === 'pago_prestamo' && m.status === 'pagado'), (m) => m.amount - Math.min(m.amount, m.interestAmount || 0))
  const prestamos = Math.max(0, recibido - capital)
  const aPagarManual = suma(ocs.filter((m) => m.status === 'pendiente' && ['gasto', 'costo_directo', 'inversion', 'compra_mercaderia'].includes(m.type)), (m) => m.amount)
  const aPagarAuto = suma(e.costosAuto.filter((c) => !c.personal && c.fecha.getTime() < corte.getTime() && (!c.pagadoEn || c.pagadoEn.getTime() >= corte.getTime())), (c) => c.monto)
  const cuentasAPagar = aPagarManual + aPagarAuto
  const activos = caja + cxcHomia + cxcFuera + (inv.valor || 0) + bienesDeUso
  const pasivos = prestamos + cuentasAPagar
  return {
    fecha: corte, caja, sinSaldoInicial,
    cuentasPorCobrar: r2(cxcHomia + cxcFuera), cuentasPorCobrarHomia: r2(cxcHomia), cuentasPorCobrarFuera: r2(cxcFuera),
    inventario: inv.valor, inventarioEstimado: inv.estimado, productosSinCosto: inv.sinCosto,
    bienesDeUso: r2(bienesDeUso), activos: r2(activos),
    prestamos: r2(prestamos), cuentasAPagar: r2(cuentasAPagar), pasivos: r2(pasivos),
    patrimonio: r2(activos - pasivos),
  }
}

// ─────────────────────────── métricas ───────────────────────────

export type Formato = 'ars' | 'pct' | 'dias' | 'meses' | 'num'
export type Metrica = {
  id: string
  valor: number | null
  formato: Formato
  /** texto corto del cálculo con los números reales */
  calculo: string
  /** variación % contra el período anterior (si aplica) */
  variacion?: number | null
  sinDato?: string
}

/** "$ 1.234" / "−$ 1.234" (formato argentino, el signo adelante del $). */
const fmt = (n: number) => `${Math.round(n) < 0 ? '−' : ''}$ ${Math.abs(Math.round(n)).toLocaleString('es-AR')}`
/** "17,3%" (coma decimal argentina). */
const fpct = (n: number | null) => (n === null ? 'sin dato' : `${n.toLocaleString('es-AR', { maximumFractionDigits: 1 })}%`)

/** Meses equivalentes del período (mínimo 1), para promedios mensuales. */
export function mesesDe(desde: Date, hasta: Date, hoy: Date): number {
  const fin = Math.min(hasta.getTime(), finDia(hoy).getTime())
  const dias = Math.max(0, (fin - desde.getTime()) / DIA)
  return Math.max(1, Math.round(dias / 30.44))
}

export type Obra2 = { id: string; title: string; ingresos: number; devoluciones: number; costos: number; ganancia: number; margenPct: number | null }
export type Producto = { elementId: string; nombre: string; ventas: number; costo: number | null; ganancia: number | null; cantidad: number }

export function rentabilidadObras(e: EntradaFinanzas): Obra2[] {
  const acc = new Map<string, { ingresos: number; devoluciones: number; costos: number }>()
  const get = (id: string) => {
    if (!acc.has(id)) acc.set(id, { ingresos: 0, devoluciones: 0, costos: 0 })
    return acc.get(id)!
  }
  for (const v of e.ventas) if (v.projectId) get(v.projectId).ingresos += v.total
  for (const d of e.devoluciones) {
    if (!d.projectId) continue
    if (d.kind === 'venta') get(d.projectId).devoluciones += d.monto
    else get(d.projectId).costos -= d.monto
  }
  for (const c of e.costosAuto) if (c.projectId && !c.personal) get(c.projectId).costos += c.monto
  for (const m of expandir(e.movimientos, finDia(e.hoy), e.hoy)) {
    if (!m.projectId) continue
    if (m.type === 'costo_directo' || m.type === 'gasto') get(m.projectId).costos += m.amount
    if (m.type === 'otro_ingreso') get(m.projectId).ingresos += m.amount
  }
  const nombres = new Map(e.obras.map((o) => [o.id, o.title]))
  return [...acc.entries()]
    .filter(([, a]) => a.ingresos > 0)
    .map(([id, a]) => {
      const neto = a.ingresos - a.devoluciones
      const ganancia = neto - a.costos
      return { id, title: nombres.get(id) || 'Obra', ingresos: r2(a.ingresos), devoluciones: r2(a.devoluciones), costos: r2(a.costos), ganancia: r2(ganancia), margenPct: pct(ganancia, neto) }
    })
    .sort((a, b) => (b.margenPct ?? -Infinity) - (a.margenPct ?? -Infinity))
}

export function topProductos(e: EntradaFinanzas, desde: Date, hasta: Date): Producto[] {
  const costos = mapaCostos(e)
  const pctEst = e.config.costoEstimadoPct
  const acc = new Map<string, Producto>()
  for (const v of e.ventas.filter((x) => en(x.emitida, desde, hasta))) {
    for (const l of v.lineas || []) {
      const key = l.elementId || l.nombre
      const p = acc.get(key) || { elementId: key, nombre: l.nombre, ventas: 0, costo: 0, ganancia: 0, cantidad: 0 }
      const venta = l.cantidad * l.precioUnitario
      const c = l.elementId ? costos.get(l.elementId) : undefined
      const costo = c && c.costo !== null ? l.cantidad * c.costo : pctEst ? (venta * pctEst) / 100 : null
      p.ventas += venta
      p.cantidad += l.cantidad
      if (costo === null || p.costo === null) p.costo = null
      else p.costo += costo
      acc.set(key, p)
    }
  }
  return [...acc.values()]
    .map((p) => ({ ...p, ventas: r2(p.ventas), costo: p.costo === null ? null : r2(p.costo), ganancia: p.costo === null ? null : r2(p.ventas - p.costo) }))
    .sort((a, b) => (b.ganancia ?? -Infinity) - (a.ganancia ?? -Infinity) || b.ventas - a.ventas)
}

export type Recomendacion = { id: string; tono: 'alerta' | 'atencion' | 'bien' | 'info'; titulo: string; texto: string; dato: string; accion?: { label: string; tab?: string } }

export type SerieMes = { mes: string; etiqueta: string; entradas: number; salidas: number; resultado: number }

export type Reporte = {
  rol: RolFinanzas
  periodo: { preset: Preset; desde: string; hasta: string; etiqueta: string; etiquetaPrev: string; meses: number }
  resultados: Resultados
  resultadosPrev: Resultados
  caja: FlujoCaja & { saldoInicialPeriodo: number; saldoFinal: number; sinSaldoInicial: boolean; serie: SerieMes[] }
  balance: Balance
  metricas: Metrica[]
  obras: Obra2[]
  productos: Producto[]
  recomendaciones: Recomendacion[]
  aceptacion: { enviadas: number; aceptadas: number; pendientes: number } | null
}

export function reporte(e: EntradaFinanzas, p: Periodo): Reporte {
  const R = resultados(e, p.desde, p.hasta)
  const Rp = resultados(e, p.prevDesde, p.prevHasta)
  const meses = mesesDe(p.desde, p.hasta, e.hoy)
  const finPeriodo = new Date(Math.min(p.hasta.getTime(), finDia(e.hoy).getTime()))

  // ── caja del período ──
  const f = flujo(e, p.desde, p.hasta)
  const ini = cajaAl(e, p.desde)
  const fin = cajaAl(e, finPeriodo)
  const kFin = claveMes(new Date(finPeriodo.getTime() - 1))
  const nSerie = Math.min(12, Math.max(6, meses))
  const serie: SerieMes[] = []
  for (let i = nSerie - 1; i >= 0; i--) {
    const k = sumarMeses(kFin, -i)
    const d = inicioMes(k)
    const h = inicioMes(sumarMeses(k, 1))
    const fm = flujo(e, d, h)
    serie.push({ mes: k, etiqueta: etiquetaMes(k), entradas: fm.entradas, salidas: fm.salidas, resultado: resultados(e, d, h).resultadoNeto })
  }

  const B = balance(e, finPeriodo)

  // ── métricas ──
  const gastosFijosMes = div(R.gastos, meses) ?? 0
  const costosFijosMes = div(R.gastos + R.amortizaciones + R.intereses, meses) ?? 0
  const mb = R.margenBrutoPct
  const pe = mb !== null && mb > 0 && costosFijosMes > 0 ? r2(costosFijosMes / (mb / 100)) : null
  const ventasMes = div(R.ventasNetas, meses) ?? 0
  const cobradas = e.ventas.filter((v) => v.cobradaEn && en(v.cobradaEn, p.desde, p.hasta))
  const diasCobro = cobradas.length ? r2(suma(cobradas, (v) => Math.max(0, (v.cobradaEn!.getTime() - v.emitida.getTime()) / DIA)) / cobradas.length) : null
  const limiteVencida = e.hoy.getTime() - 15 * DIA
  const vencidas = e.ventas.filter((v) => !v.cobradaEn && v.emitida.getTime() < limiteVencida)
  const montoVencido = r2(suma(vencidas, (v) => v.total))
  // supervivencia: caja de hoy ÷ gastos fijos + intereses promedio de los últimos 3 meses (este incluido)
  const k3 = sumarMeses(claveMes(e.hoy), -2)
  const R3 = resultados(e, inicioMes(k3), finDia(e.hoy))
  const fijos3 = div(R3.gastos + R3.intereses, mesesDe(inicioMes(k3), finDia(e.hoy), e.hoy))
  const cajaHoy = cajaAl(e, finDia(e.hoy))
  const supervivencia = fijos3 && fijos3 > 0 && !cajaHoy.sinSaldoInicial ? r2(Math.max(0, cajaHoy.saldo) / fijos3) : null
  // crecimiento del mes calendario contra el anterior
  const kHoy = claveMes(e.hoy)
  const vMes = resultados(e, inicioMes(kHoy), inicioMes(sumarMeses(kHoy, 1))).ventasNetas
  const vMesAnt = resultados(e, inicioMes(sumarMeses(kHoy, -1)), inicioMes(kHoy)).ventasNetas
  // clientes recurrentes
  const ventasPer = e.ventas.filter((v) => en(v.emitida, p.desde, p.hasta))
  const clientesPer = [...new Set(ventasPer.map((v) => v.clienteId))]
  const recurrentes = clientesPer.filter((c) => e.ventas.filter((v) => v.clienteId === c && v.emitida.getTime() < p.hasta.getTime()).length >= 2)

  const metricas: Metrica[] = [
    { id: 'ventas_netas', valor: R.ventasNetas, formato: 'ars', variacion: variacion(R.ventasNetas, Rp.ventasNetas),
      calculo: `${fmt(R.ventasBrutas)} de ventas − ${fmt(R.devoluciones)} de devoluciones = ${fmt(R.ventasNetas)}` },
    { id: 'margen_bruto', valor: R.margenBrutoPct, formato: 'pct', variacion: null,
      calculo: `(${fmt(R.ventasNetas)} − ${fmt(R.costoDirecto)} de costo directo) ÷ ${fmt(R.ventasNetas)}`,
      sinDato: R.ventasNetas === 0 ? 'Sin ventas en el período.' : undefined },
    { id: 'resultado_neto', valor: R.margenNetoPct, formato: 'pct',
      calculo: `${fmt(R.resultadoNeto)} de resultado neto ÷ ${fmt(R.ventasNetas)} de ventas netas`,
      sinDato: R.ventasNetas === 0 ? 'Sin ventas en el período.' : undefined },
    { id: 'gastos_fijos', valor: r2(gastosFijosMes), formato: 'ars', variacion: variacion(R.gastos, Rp.gastos),
      calculo: meses > 1 ? `${fmt(R.gastos)} de gastos ÷ ${meses} meses` : `${fmt(R.gastos)} de gastos fijos cargados en el mes`,
      sinDato: R.gastos === 0 ? 'No cargaste gastos fijos en el período.' : undefined },
    { id: 'punto_equilibrio', valor: pe, formato: 'ars',
      calculo: pe !== null ? `${fmt(costosFijosMes)} de costos fijos por mes ÷ ${fpct(mb)} de margen bruto` : '',
      sinDato: pe === null ? (costosFijosMes <= 0 ? 'Cargá tus gastos fijos para calcularlo.' : 'Hace falta un margen bruto positivo para calcularlo.') : undefined },
    { id: 'ticket_promedio', valor: R.cantidadVentas ? r2(R.ventasBrutas / R.cantidadVentas) : null, formato: 'ars',
      calculo: `${fmt(R.ventasBrutas)} ÷ ${R.cantidadVentas} ${e.rol === 'profesional' ? 'trabajos' : 'ventas'}`,
      sinDato: R.cantidadVentas ? undefined : 'Sin ventas en el período.' },
    { id: 'cantidad', valor: R.cantidadVentas, formato: 'num', variacion: variacion(R.cantidadVentas, Rp.cantidadVentas),
      calculo: `${ventasPer.length} por HomIA + ${R.cantidadVentas - ventasPer.length} por fuera` },
    { id: 'dias_cobro', valor: diasCobro, formato: 'dias',
      calculo: `promedio entre emisión y cobro de ${cobradas.length} ${cobradas.length === 1 ? 'cobro' : 'cobros'} del período`,
      sinDato: diasCobro === null ? 'No cobraste nada por HomIA en el período.' : undefined },
    { id: 'cuentas_cobrar', valor: montoVencido, formato: 'ars',
      calculo: `${vencidas.length} ${vencidas.length === 1 ? 'emitida' : 'emitidas'} hace más de 15 días sin cobrar` },
    { id: 'meses_supervivencia', valor: supervivencia, formato: 'meses',
      calculo: supervivencia !== null ? `${fmt(cajaHoy.saldo)} de caja ÷ ${fmt(fijos3!)} de gastos fijos promedio por mes` : '',
      sinDato: supervivencia === null ? (cajaHoy.sinSaldoInicial ? 'Cargá tu saldo inicial de caja para calcularlo.' : 'Cargá tus gastos fijos para calcularlo.') : undefined },
    { id: 'crecimiento', valor: variacion(vMes, vMesAnt), formato: 'pct',
      calculo: `${fmt(vMes)} este mes contra ${fmt(vMesAnt)} el mes pasado`,
      sinDato: vMesAnt === 0 ? 'El mes pasado no tuviste ventas: no hay contra qué comparar.' : undefined },
    { id: 'clientes_recurrentes', valor: clientesPer.length ? pct(recurrentes.length, clientesPer.length) : null, formato: 'pct',
      calculo: `${recurrentes.length} de ${clientesPer.length} ${clientesPer.length === 1 ? 'cliente' : 'clientes'} te compraron o contrataron 2 veces o más`,
      sinDato: clientesPer.length ? undefined : 'Sin clientes de HomIA en el período.' },
  ]

  let aceptacion: Reporte['aceptacion'] = null
  if (e.rol === 'profesional') {
    const ofs = e.ofertas.filter((o) => en(o.createdAt, p.desde, p.hasta) && o.status !== 'retirado')
    const acept = ofs.filter((o) => o.status === 'aceptado').length
    aceptacion = { enviadas: ofs.length, aceptadas: acept, pendientes: ofs.filter((o) => o.status === 'pendiente').length }
    metricas.push({ id: 'tasa_aceptacion', valor: ofs.length ? pct(acept, ofs.length) : null, formato: 'pct',
      calculo: `${acept} aceptadas de ${ofs.length} enviadas${aceptacion.pendientes ? ` (${aceptacion.pendientes} todavía sin respuesta)` : ''}`,
      sinDato: ofs.length ? undefined : 'No mandaste ofertas en la bolsa de trabajos en el período.' })
  }
  const productos = e.rol === 'proveedor' ? topProductos(e, p.desde, p.hasta) : []
  if (e.rol === 'proveedor') {
    const cmv = R.mercaderia.conocido + R.mercaderia.estimado - R.mercaderia.revertido
    const diasPer = Math.max(1, (finPeriodo.getTime() - p.desde.getTime()) / DIA)
    const inv = B.inventario
    const dInv = inv !== null && inv > 0 && cmv > 0 ? r2(inv / (cmv / diasPer)) : null
    metricas.push({ id: 'rotacion_stock', valor: dInv, formato: 'dias',
      calculo: dInv !== null ? `${fmt(inv!)} de stock al costo ÷ ${fmt(cmv / diasPer)} de costo vendido por día` : '',
      sinDato: dInv === null ? (inv === null || inv === 0 ? 'Cargá el costo de tus productos para calcularlo.' : 'Sin ventas con costo conocido en el período.') : undefined })
  }

  const obras = e.rol === 'profesional' ? rentabilidadObras(e) : []
  const recomendaciones = recomendar({ e, p, R, Rp, B, pe, ventasMes, meses, montoVencido, vencidas: vencidas.length, supervivencia, obras, cajaSinInicial: cajaHoy.sinSaldoInicial, aceptacion })

  return {
    rol: e.rol,
    periodo: { preset: p.preset, desde: p.desde.toISOString(), hasta: p.hasta.toISOString(), etiqueta: p.etiqueta, etiquetaPrev: p.etiquetaPrev, meses },
    resultados: R, resultadosPrev: Rp,
    caja: { ...f, saldoInicialPeriodo: ini.saldo, saldoFinal: fin.saldo, sinSaldoInicial: fin.sinSaldoInicial, serie },
    balance: B, metricas, obras, productos, recomendaciones, aceptacion,
  }
}

// ─────────────────────────── recomendaciones (reglas explícitas, sin IA) ───────────────────────────

type CtxRec = {
  e: EntradaFinanzas; p: Periodo; R: Resultados; Rp: Resultados; B: Balance; pe: number | null; ventasMes: number; meses: number
  montoVencido: number; vencidas: number; supervivencia: number | null; obras: Obra2[]; cajaSinInicial: boolean
  aceptacion: Reporte['aceptacion']
}

export function recomendar(c: CtxRec): Recomendacion[] {
  const { e, R, Rp } = c
  const out: Recomendacion[] = []
  // 1. sin gastos cargados
  if (!R.hayGastosCargados && R.ventasNetas > 0) {
    out.push({ id: 'sin_gastos', tono: 'atencion', titulo: 'Todavía no cargaste gastos en este período',
      texto: 'Por eso tu ganancia aparece casi igual a tus ventas. Tu ganancia real es menor: cargá lo que gastaste (materiales, nafta, celular, alquiler) para verla.',
      dato: `Ventas netas ${fmt(R.ventasNetas)} · gastos cargados $ 0`, accion: { label: 'Cargar un gasto', tab: 'movimientos' } })
  }
  // 2. resultado negativo
  if (R.ventasNetas > 0 && R.resultadoNeto < 0) {
    out.push({ id: 'perdida', tono: 'alerta', titulo: 'En este período el negocio perdió plata',
      texto: 'Tus costos y gastos superaron lo que vendiste. Mirá en Resultados qué renglón pesa más: si es el costo directo, revisá precios; si son los gastos fijos, recortá lo que no uses.',
      dato: `Resultado neto ${fmt(R.resultadoNeto)}`, accion: { label: 'Ver resultados', tab: 'resultados' } })
  }
  // 3. margen bruto negativo
  if (R.ventasNetas > 0 && R.margenBruto < 0) {
    out.push({ id: 'margen_negativo', tono: 'alerta', titulo: 'Estás vendiendo por debajo de lo que te cuesta',
      texto: 'Lo que te cuesta hacer los trabajos o las ventas es más que lo que cobrás por ellos. Actualizá tus precios antes de tomar más trabajo.',
      dato: `Ventas netas ${fmt(R.ventasNetas)} · costo directo ${fmt(R.costoDirecto)}` })
  }
  // 4. gastos crecen más que ventas
  const vg = variacion(R.gastos, Rp.gastos)
  const vv = variacion(R.ventasNetas, Rp.ventasNetas)
  if (vg !== null && vg >= 20 && (vv === null || vg - vv >= 10) && Rp.gastos > 0) {
    out.push({ id: 'gastos_suben', tono: 'atencion', titulo: 'Tus gastos fijos crecen más rápido que tus ventas',
      texto: `Comparado con ${c.p.etiquetaPrev}, tus gastos fijos subieron más que tus ventas. Si sigue así, tu margen se achica: revisá qué gasto creció.`,
      dato: `Gastos ${vg > 0 ? '+' : ''}${fpct(vg)} · ventas ${vv === null ? 'sin dato' : `${vv > 0 ? '+' : ''}${fpct(vv)}`}`, accion: { label: 'Ver gastos', tab: 'resultados' } })
  }
  // 5. facturas sin cobrar hace más de 15 días
  if (c.montoVencido > 0) {
    out.push({ id: 'cobrar', tono: 'atencion', titulo: `Tenés ${fmt(c.montoVencido)} sin cobrar hace más de 15 días`,
      texto: e.rol === 'profesional'
        ? 'Mandale un mensaje al cliente para recordarle la factura (se paga con Mercado Pago o en efectivo desde la app). Cuanto más pasa, más difícil es cobrar.'
        : 'Escribile al cliente para recordarle el pago. Cuanto más pasa, más difícil es cobrar.',
      dato: `${c.vencidas} ${c.vencidas === 1 ? 'cobro pendiente' : 'cobros pendientes'} de más de 15 días` })
  }
  // 6. punto de equilibrio
  if (c.pe !== null) {
    if (c.ventasMes < c.pe) {
      out.push({ id: 'equilibrio', tono: 'atencion', titulo: `Con tu margen, necesitás vender ${fmt(c.pe)} por mes para no perder`,
        texto: 'Estás vendiendo menos que tu punto de equilibrio. Tres caminos: subir el margen (precios o costos), bajar gastos fijos o conseguir más ventas.',
        dato: `Vendiste ${fmt(c.ventasMes)} por mes · margen bruto ${fpct(R.margenBrutoPct)}` })
    } else if (!(e.rol === 'proveedor' && (R.mercaderia.ventasSinCosto > 0 || R.mercaderia.fueraSinCosto > 0))) {
      // con ventas sin costo el margen está inflado: no se felicita por algo que puede no ser cierto
      out.push({ id: 'equilibrio_ok', tono: 'bien', titulo: 'Estás por encima de tu punto de equilibrio',
        texto: 'Tus ventas cubren los costos fijos del mes: lo que vendas de más es ganancia.',
        dato: `Vendiste ${fmt(c.ventasMes)} por mes · necesitás ${fmt(c.pe)}` })
    }
  }
  // 7. obras con rentabilidad muy distinta
  const conPct = c.obras.filter((o) => o.margenPct !== null)
  if (conPct.length >= 2) {
    const mejor = conPct[0]
    const peor = conPct[conPct.length - 1]
    if ((mejor.margenPct ?? 0) - (peor.margenPct ?? 0) >= 15) {
      out.push({ id: 'obras', tono: 'info', titulo: `Tu obra más rentable dejó ${fpct(mejor.margenPct)} y la menos ${fpct(peor.margenPct)}`,
        texto: `Revisá cómo presupuestaste "${peor.title}": qué costos no tuviste en cuenta o si ese tipo de trabajo te conviene.`,
        dato: `"${mejor.title}" ${fmt(mejor.ganancia)} · "${peor.title}" ${fmt(peor.ganancia)}` })
    }
  }
  // 8. caja negativa o colchón chico
  if (!c.cajaSinInicial && c.B.caja < -0.5) {
    out.push({ id: 'caja_negativa', tono: 'alerta', titulo: 'Tu caja estimada da negativa',
      texto: 'Según lo cargado salió más plata de la que había y entró. Revisá si el saldo inicial es el real, si falta cargar algún cobro o ingreso por fuera de HomIA, o si estás financiando el negocio con plata que no es del negocio.',
      dato: `Caja estimada ${fmt(c.B.caja)}`, accion: { label: 'Ver caja', tab: 'caja' } })
  } else if (c.supervivencia !== null && c.supervivencia < 3) {
    out.push({ id: 'colchon', tono: 'atencion', titulo: `Tu caja cubre ${c.supervivencia.toLocaleString('es-AR', { maximumFractionDigits: 1 })} ${c.supervivencia === 1 ? 'mes' : 'meses'} de gastos fijos`,
      texto: 'Es un colchón chico si viene un mes flojo. Antes de hacer una compra grande, cuidá la caja: cobrá lo pendiente y posponé lo que pueda esperar.',
      dato: `Caja estimada ${fmt(c.B.caja)}` })
  }
  // 9. sin saldo inicial
  if (c.cajaSinInicial) {
    out.push({ id: 'saldo_inicial', tono: 'info', titulo: 'Cargá tu saldo inicial de caja',
      texto: 'Sin él, la caja y el balance arrancan de cero y no muestran la plata que realmente tenés.',
      dato: 'Saldo inicial: sin cargar', accion: { label: 'Cargar saldo inicial', tab: 'caja' } })
  }
  // 10. proveedor sin costos de su mercadería
  if (e.rol === 'proveedor' && (R.mercaderia.ventasSinCosto > 0 || R.mercaderia.fueraSinCosto > 0)) {
    const partes = [
      R.mercaderia.ventasSinCosto > 0 ? `${fmt(R.mercaderia.ventasSinCosto)} vendidos por HomIA sin costo cargado` : '',
      R.mercaderia.fueraSinCosto > 0 ? `${fmt(R.mercaderia.fueraSinCosto)} de ventas por fuera sin costo` : '',
    ].filter(Boolean)
    out.push({ id: 'costos_stock', tono: 'atencion', titulo: 'Te falta el costo de productos que vendiste',
      texto: 'Sin el costo de compra, HomIA no puede saber cuánto ganaste con esas ventas, y tu margen aparece más alto que el real. Cargá el costo en cada producto o un margen estimado (se usa también para las ventas de mostrador).',
      dato: partes.join(' · '), accion: { label: 'Cargar costos', tab: 'resultados' } })
  }
  // 11. retiros mayores a la ganancia
  if (R.retiros > 0 && R.retiros > Math.max(0, R.resultadoNeto)) {
    out.push({ id: 'retiros', tono: 'atencion', titulo: 'Te llevaste más de lo que ganó el negocio',
      texto: 'La diferencia sale de la caja (o de deuda). Un mes puede pasar; si se repite, el negocio se achica.',
      dato: `Retiros ${fmt(R.retiros)} · resultado neto ${fmt(R.resultadoNeto)}` })
  }
  // 12. compras de HomIA sin asignar a una obra
  if (e.rol === 'profesional') {
    const sinObra = e.costosAuto.filter((x) => x.kind === 'compra_homia' && !x.personal && !x.projectId && x.fecha.getTime() >= c.p.desde.getTime() && x.fecha.getTime() < c.p.hasta.getTime())
    if (sinObra.length) {
      out.push({ id: 'asignar', tono: 'info', titulo: 'Asigná tus compras de materiales a cada obra',
        texto: 'Así ves cuánto te dejó cada trabajo. Si alguna compra fue para tu casa, marcala "No es del negocio".',
        dato: `${sinObra.length} ${sinObra.length === 1 ? 'compra' : 'compras'} de HomIA sin obra asignada`, accion: { label: 'Ver movimientos', tab: 'movimientos' } })
    }
  }
  // 13. pocas ofertas aceptadas
  if (c.aceptacion && c.aceptacion.enviadas - c.aceptacion.pendientes >= 5) {
    const dec = c.aceptacion.enviadas - c.aceptacion.pendientes
    const tasa = pct(c.aceptacion.aceptadas, dec) ?? 0
    if (tasa < 25) {
      out.push({ id: 'aceptacion', tono: 'info', titulo: `Te aceptaron ${c.aceptacion.aceptadas} de ${dec} presupuestos respondidos`,
        texto: 'Revisá tus ofertas: precio, plazo y cómo explicás qué incluye. Un mensaje claro y una foto de un trabajo parecido ayudan.',
        dato: `Tasa de aceptación ${fpct(tasa)}` })
    }
  }
  // 14. todo en orden
  if (!out.length && R.ventasNetas > 0 && R.resultadoNeto > 0) {
    out.push({ id: 'bien', tono: 'bien', titulo: 'Tu negocio ganó plata en este período',
      texto: 'Seguí cargando tus gastos para que los números sigan siendo reales, y mirá el margen mes a mes.',
      dato: `Resultado neto ${fmt(R.resultadoNeto)} (${fpct(R.margenNetoPct)} de las ventas)` })
  }
  const orden = { alerta: 0, atencion: 1, info: 2, bien: 3 }
  return out.sort((a, b) => orden[a.tono] - orden[b.tono])
}

// ─────────────────────────── movimientos del período (lista unificada) ───────────────────────────

export type MovVista = {
  id: string
  origen: 'auto' | 'manual'
  tipo: TipoMovimiento | 'venta_homia' | 'devolucion' | 'reintegro' | 'compra_homia' | 'subcontrato_homia'
  categoria: string
  nombre: string
  descripcion: string
  monto: number
  fecha: string
  /** true = suma para el negocio (ingreso), false = resta */
  entra: boolean
  estado: string
  link?: string
  entryId?: string
  proyectado?: boolean
  projectId?: string | null
  personal?: boolean
  attachmentUrl?: string | null
  recurring?: string | null
  cobradaEn?: string | null
}

export function movimientosDelPeriodo(e: EntradaFinanzas, desde: Date, hasta: Date): MovVista[] {
  const out: MovVista[] = []
  for (const v of e.ventas) {
    if (!en(v.emitida, desde, hasta) && !(v.cobradaEn && en(v.cobradaEn, desde, hasta))) continue
    out.push({ id: `${v.kind}:${v.id}`, origen: 'auto', tipo: 'venta_homia', categoria: v.kind, nombre: v.kind === 'factura' ? `Factura ${v.numero}` : `Venta ${v.numero}`,
      descripcion: v.descripcion, monto: v.total, fecha: v.emitida.toISOString(), entra: true, estado: v.cobradaEn ? 'cobrado' : 'por_cobrar',
      link: v.link, projectId: v.projectId, cobradaEn: v.cobradaEn ? v.cobradaEn.toISOString() : null })
  }
  for (const d of e.devoluciones) {
    if (!en(d.fecha, desde, hasta)) continue
    out.push({ id: `dev:${d.id}`, origen: 'auto', tipo: d.kind === 'venta' ? 'devolucion' : 'reintegro', categoria: d.kind === 'venta' ? 'devolucion_venta' : 'reintegro',
      nombre: d.kind === 'venta' ? 'Devolución de sobrantes' : 'Reintegro de sobrantes', descripcion: d.descripcion, monto: d.monto, fecha: d.fecha.toISOString(),
      entra: d.kind === 'reintegro', estado: 'pagado', link: d.link, projectId: d.projectId })
  }
  for (const c of e.costosAuto) {
    if (!en(c.fecha, desde, hasta)) continue
    out.push({ id: `${c.kind}:${c.id}`, origen: 'auto', tipo: c.kind, categoria: c.kind, nombre: c.kind === 'compra_homia' ? 'Materiales comprados en HomIA' : 'Subcontrato por HomIA',
      descripcion: c.descripcion, monto: c.monto, fecha: c.fecha.toISOString(), entra: false, estado: c.pagadoEn ? 'pagado' : 'pendiente', link: c.link,
      projectId: c.projectId, personal: c.personal })
  }
  for (const m of expandir(e.movimientos, hasta, e.hoy)) {
    if (!en(m.date, desde, hasta)) continue
    out.push({ id: m.id, origen: 'manual', tipo: m.type, categoria: m.category, nombre: nombreCategoria(m.category), descripcion: m.description, monto: m.amount,
      fecha: m.date.toISOString(), entra: TIPOS[m.type]?.entra ?? false, estado: m.status, entryId: m.baseId, proyectado: m.proyectado,
      projectId: m.projectId ?? null, attachmentUrl: m.attachmentUrl ?? null, recurring: m.recurring ?? null })
  }
  return out.sort((a, b) => b.fecha.localeCompare(a.fecha))
}
