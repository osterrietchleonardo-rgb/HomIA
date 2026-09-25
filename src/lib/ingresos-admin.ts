// Ingresos de HomIA (D30) — datos de /admin/ingresos, calculados en el servidor con datos reales.
// Dos fuentes, las dos llegan a la cuenta de Mercado Pago de HomIA (la misma de las apps):
//   · suscripciones de proveedores → "SubscriptionCharge" (cada cobro tal como lo informó MP);
//   · cargo de servicio 1% → la función compartida `cargoServicioRecaudado` (src/lib/ingresos.ts,
//     la misma cifra que Métricas › Negocio) + el detalle por operación con la misma definición.
// El estado de cuenta de cada proveedor sale de `clasificarCuenta` (reglas puras). Solo lectura:
// a Mercado Pago se le consulta el estado de las suscripciones con el token del entorno (servidor).
import 'server-only'
import { db } from '@/lib/db'
import { matchTerms } from '@/lib/search-match'
import { cargoServicioRecaudado } from '@/lib/ingresos'
import { PLAN_PRICE_ARS } from '@/lib/plans'
import { traerPreapproval } from '@/lib/suscripciones-mp'
import {
  armarMensual, armarSerie, calcularMrr, clasificarCuenta, claveBucket, clavesRango, sumarMes, variacion,
  ETIQUETA_ESTADO, ETIQUETA_EVENTO, ETIQUETA_MOTIVO, REGISTRO_COMPLETO_DESDE,
  type Cuenta, type EstadoCuenta, type Granularidad, type PreapprovalMin,
} from '@/lib/suscripciones-core'

export type FiltroIngresos = {
  desde: Date
  hasta: Date
  incluirPrueba: boolean
  gran: Granularidad
  proveedor?: string
  plan?: string
  estado?: string
  fuente?: 'suscripcion' | 'cargo'
  estadoCuenta?: string
}

const r2 = (n: number) => Math.round(n * 100) / 100

// ───────────────────────────── estado de las suscripciones en MP ─────────────────────────────

type PreInfo = { status: string; lastModified: Date | null; nextPaymentDate: Date | null; amount: number | null; entorno: string }
const cachePre = new Map<string, { t: number; v: PreInfo | null }>()

/** Estado de cada suscripción en MP (caché de 5 min; 4 consultas en paralelo; errores → sin dato). */
async function estadosMp(ids: string[]): Promise<{ mapa: Map<string, PreInfo | null>; errores: number }> {
  const mapa = new Map<string, PreInfo | null>()
  let errores = 0
  const pendientes = ids.filter((id) => {
    const c = cachePre.get(id)
    if (c && Date.now() - c.t < 5 * 60_000) { mapa.set(id, c.v); return false }
    return true
  })
  let i = 0
  async function trabajador() {
    while (i < pendientes.length) {
      const id = pendientes[i++]
      try {
        const p = await traerPreapproval(id)
        const v: PreInfo | null = p ? {
          status: String(p.status || ''),
          lastModified: p.last_modified ? new Date(p.last_modified) : null,
          nextPaymentDate: p.next_payment_date ? new Date(p.next_payment_date) : null,
          amount: p.auto_recurring?.transaction_amount ?? null,
          entorno: p.entorno,
        } : null
        cachePre.set(id, { t: Date.now(), v })
        mapa.set(id, v)
      } catch {
        errores++
        mapa.set(id, null)
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(4, pendientes.length) }, trabajador))
  return { mapa, errores }
}

// ───────────────────────────── carga base ─────────────────────────────

async function cargarBase(incluirPrueba: boolean) {
  const [provs, cobros, eventos] = await Promise.all([
    db.providerProfile.findMany({
      select: { id: true, userId: true, businessName: true, subscription: true, trialEndsAt: true, createdAt: true, mpPreapprovalId: true, proSince: true, planPaidUntil: true, user: { select: { email: true, deletedAt: true } } },
    }),
    db.subscriptionCharge.findMany({ where: incluirPrueba ? {} : { mpEnvironment: 'live' }, orderBy: { attemptedAt: 'desc' } }),
    db.subscriptionEvent.findMany({ orderBy: { occurredAt: 'desc' } }),
  ])
  const prueba = new Set(provs.filter((p) => p.user.email.endsWith('@homia.test')).map((p) => p.id))
  // cuentas dadas de baja (Ley 25.326, anonimizadas) no se listan; sus cobros sí (registro contable)
  const visibles = provs.filter((p) => !p.user.deletedAt && (incluirPrueba || !prueba.has(p.id)))
  const idsVisibles = new Set(visibles.map((p) => p.id))
  // cobros y eventos de proveedores eliminados (sin perfil) se conservan: el registro contable sobrevive
  const existe = new Set(provs.map((p) => p.id))
  const deVisibles = <T extends { providerId: string }>(x: T) => idsVisibles.has(x.providerId) || !existe.has(x.providerId)
  return { provs: visibles, cobros: cobros.filter(deVisibles), eventos: eventos.filter(deVisibles) }
}

type Base = Awaited<ReturnType<typeof cargarBase>>

function cuentasDe(base: Base, pres: Map<string, PreInfo | null>, ahora: Date) {
  return base.provs.map((p) => {
    const cobros = base.cobros.filter((c) => c.providerId === p.id)
    const eventos = base.eventos.filter((e) => e.providerId === p.id)
    const pre = p.mpPreapprovalId ? pres.get(p.mpPreapprovalId) ?? null : null
    const preMin: PreapprovalMin = pre ? { status: pre.status, lastModified: pre.lastModified, nextPaymentDate: pre.nextPaymentDate, amount: pre.amount } : null
    const cuenta = clasificarCuenta(
      { subscription: p.subscription, trialEndsAt: p.trialEndsAt, createdAt: p.createdAt, mpPreapprovalId: p.mpPreapprovalId, planPaidUntil: p.planPaidUntil },
      cobros, eventos, preMin, PLAN_PRICE_ARS, ahora,
    )
    return { p, cuenta, pre, cobros }
  })
}

// ───────────────────────────── cargo de servicio por operación ─────────────────────────────

export type FilaCargo = {
  tipo: 'factura' | 'cobro de materiales' | 'compra'
  id: string; ref: string; fecha: Date; subtotal: number; cargo: number
  vendedor: string; vendedorUserId: string | null; comprador: string
  mpPaymentId: string | null; cargoMp: number | null
}

/** Misma definición que `cargoServicioRecaudado` (src/lib/ingresos.ts), fila por fila. */
async function cargosPorOperacion(desde: Date, hasta: Date, excluirPrueba: boolean): Promise<FilaCargo[]> {
  const filas = await db.$queryRaw<(Omit<FilaCargo, 'subtotal' | 'cargo' | 'cargoMp'> & { subtotal: number; cargo: number; cargoMp: number | null })[]>`
    WITH p AS (SELECT (${desde.toISOString()}::timestamptz AT TIME ZONE 'UTC') AS d, (${hasta.toISOString()}::timestamptz AT TIME ZONE 'UTC') AS h),
    excl AS (SELECT id FROM "User" WHERE ${excluirPrueba}::boolean AND email LIKE '%@homia.test')
    SELECT 'factura' AS tipo, i.id, i.number AS ref, i."paidAt" AS fecha, i.total::float8 AS subtotal, i."serviceFee"::float8 AS cargo,
           pu."displayName" AS vendedor, pp."userId" AS "vendedorUserId", cu."displayName" AS comprador, i."mpPaymentId", pay."mpApplicationFee"::float8 AS "cargoMp"
      FROM "Invoice" i JOIN "User" cu ON cu.id = i."clientId"
      LEFT JOIN "ProfessionalProfile" pp ON pp.id = i."professionalId" LEFT JOIN "User" pu ON pu.id = pp."userId"
      LEFT JOIN "Payment" pay ON pay."mpPaymentId" = i."mpPaymentId", p
     WHERE i.status = 'pagada' AND i."paymentMethod" = 'mercadopago' AND i."paidAt" >= p.d AND i."paidAt" < p.h AND i."clientId" NOT IN (SELECT id FROM excl)
    UNION ALL
    SELECT CASE WHEN c."projectId" IS NULL THEN 'compra' ELSE 'cobro de materiales' END, c.id, c.number, c."paidAt", c.amount::float8, c."serviceFee"::float8,
           pr."businessName", pr."userId", cu."displayName", c."mpPaymentId", pay."mpApplicationFee"::float8
      FROM "ProviderCharge" c JOIN "User" cu ON cu.id = c."clientId" JOIN "ProviderProfile" pr ON pr.id = c."providerId"
      LEFT JOIN "Payment" pay ON pay."mpPaymentId" = c."mpPaymentId", p
     WHERE c.status = 'pagada' AND c.method = 'mercadopago' AND c."paidAt" >= p.d AND c."paidAt" < p.h AND c."clientId" NOT IN (SELECT id FROM excl)
    UNION ALL
    SELECT 'compra', x.id, x."elementName", x."updatedAt", x.total::float8, x."serviceFee"::float8,
           pr."businessName", pr."userId", cu."displayName", x."mpPaymentId", pay."mpApplicationFee"::float8
      FROM "Purchase" x JOIN "User" cu ON cu.id = x."clientId" JOIN "ProviderProfile" pr ON pr.id = x."providerId"
      LEFT JOIN "Payment" pay ON pay."mpPaymentId" = x."mpPaymentId", p
     WHERE x."chargeId" IS NULL AND x."paymentMethod" = 'mercadopago' AND x.status IN ('pagado', 'entregado') AND x."updatedAt" >= p.d AND x."updatedAt" < p.h AND x."clientId" NOT IN (SELECT id FROM excl)
    ORDER BY fecha DESC`
  return filas.map((f) => ({ ...f, subtotal: Number(f.subtotal), cargo: Number(f.cargo), cargoMp: f.cargoMp == null ? null : Number(f.cargoMp), vendedor: f.vendedor || '(sin nombre)', comprador: f.comprador || '(sin nombre)' }))
}

// ───────────────────────────── tablas ─────────────────────────────

export type Tabla = { titulo: string; columnas: string[]; filas: (string | number | null)[][]; nota?: string; ids?: (string | null)[] }

const ESTADO_COBRO: Record<string, string> = {
  approved: 'aprobado', rejected: 'rechazado', pending: 'pendiente', in_process: 'en proceso', refunded: 'reembolsado',
  cancelled: 'cancelado', charged_back: 'contracargo', in_mediation: 'en mediación', authorized: 'autorizado',
}
export const estadoCobro = (s: string) => ESTADO_COBRO[s] || s
const PLAN = (s: string) => (s === 'pro' ? 'PRO' : s === 'basic' ? 'Básico' : s === 'trial' ? 'Prueba' : s)

/** Todo /admin/ingresos en una llamada (las tablas ya filtradas). */
export async function calcularIngresos(f: FiltroIngresos, ahora = new Date()) {
  const largo = f.hasta.getTime() - f.desde.getTime()
  const antDesde = new Date(f.desde.getTime() - largo)
  const excluir = !f.incluirPrueba
  const base = await cargarBase(f.incluirPrueba)
  const preIds = [...new Set(base.provs.map((p) => p.mpPreapprovalId).filter((x): x is string => !!x))]
  const [mp, cargoAct, cargoAnt, cargos, cargosSerie] = await Promise.all([
    estadosMp(preIds),
    cargoServicioRecaudado(f.desde, f.hasta, excluir),
    cargoServicioRecaudado(antDesde, f.desde, excluir),
    cargosPorOperacion(f.desde, f.hasta, excluir),
    // la serie mensual necesita 12 meses de cargo
    cargosPorOperacion(sumarMes(f.hasta, -12), f.hasta, excluir),
  ])
  const cuentas = cuentasDe(base, mp.mapa, ahora)

  // ── suscripciones en el período ──
  const aprobados = base.cobros.filter((c) => c.status === 'approved' && c.paidAt)
  const enRango = (d: Date | null, a: Date, b: Date) => !!d && d >= a && d < b
  const neto = (c: { amount: number; refundedAmount: number }) => c.amount - c.refundedAmount
  const subsAct = r2(aprobados.filter((c) => enRango(c.paidAt, f.desde, f.hasta)).reduce((s, c) => s + neto(c), 0))
  const subsAnt = r2(aprobados.filter((c) => enRango(c.paidAt, antDesde, f.desde)).reduce((s, c) => s + neto(c), 0))
  const delPeriodo = aprobados.filter((c) => enRango(c.paidAt, f.desde, f.hasta))
  const conFee = delPeriodo.filter((c) => c.mpFee != null)
  const conNeto = delPeriodo.filter((c) => c.netAmount != null)

  // ── cuentas ──
  const cuentaInfo = cuentas.map((x) => ({ estado: x.cuenta.estado, plan: x.cuenta.plan, tieneSuscripcion: !!x.p.mpPreapprovalId }))
  const mrr = calcularMrr(cuentaInfo, PLAN_PRICE_ARS)
  const cuenta = (e: EstadoCuenta) => cuentas.filter((x) => x.cuenta.estado === e)
  const pagando = { basic: cuenta('al_dia').filter((x) => x.cuenta.plan === 'basic').length, pro: cuenta('al_dia').filter((x) => x.cuenta.plan === 'pro').length }
  const bajasEv = base.eventos.filter((e) => ['cancelada', 'pausada', 'impago'].includes(e.type))
  const bajasPeriodo = bajasEv.filter((e) => enRango(e.occurredAt, f.desde, f.hasta)).length
  const altasPeriodo = base.provs.filter((p) => enRango(p.createdAt, f.desde, f.hasta)).length
  const primeraPaga = new Map<string, Date>()
  for (const c of [...aprobados].sort((a, b) => a.paidAt!.getTime() - b.paidAt!.getTime())) if (!primeraPaga.has(c.providerId)) primeraPaga.set(c.providerId, c.paidAt!)
  const primerasPeriodo = [...primeraPaga.values()].filter((d) => enRango(d, f.desde, f.hasta)).length
  const rechazadosPeriodo = base.cobros.filter((c) => c.status === 'rejected' && enRango(c.attemptedAt, f.desde, f.hasta)).length

  // ── serie ──
  const claves = clavesRango(f.desde, f.hasta, f.gran)
  const serie = armarSerie(claves, f.gran, {
    cobrosAprobados: aprobados.map((c) => ({ paidAt: c.paidAt!, amount: c.amount, refundedAmount: c.refundedAmount })),
    cargos: cargos.map((c) => ({ fecha: c.fecha, cargo: c.cargo })),
    altas: base.provs.map((p) => p.createdAt),
    primerasPagas: [...primeraPaga.values()],
    eventos: base.eventos,
  })
  const meses = clavesRango(sumarMes(f.hasta, -11), f.hasta, 'mes').slice(-12)
  const mensual = armarMensual(meses, {
    cobrosAprobados: aprobados.map((c) => ({ providerId: c.providerId, paidAt: c.paidAt! })),
    bajas: bajasEv,
    proveedores: base.provs.map((p) => ({ id: p.id, createdAt: p.createdAt })),
  })
  const cargoPorMes = new Map<string, number>()
  for (const c of cargosSerie) cargoPorMes.set(claveBucket(c.fecha, 'mes'), (cargoPorMes.get(claveBucket(c.fecha, 'mes')) || 0) + c.cargo)
  const subsPorMes = new Map<string, number>()
  for (const c of aprobados) subsPorMes.set(claveBucket(c.paidAt!, 'mes'), (subsPorMes.get(claveBucket(c.paidAt!, 'mes')) || 0) + neto(c))

  // ── filtros de tablas ──
  const q = (f.proveedor || '').trim()
  const nombreProv = new Map(base.provs.map((p) => [p.id, p]))
  const cobrosTabla = base.cobros
    .filter((c) => enRango(c.attemptedAt, f.desde, f.hasta) || enRango(c.paidAt, f.desde, f.hasta))
    .filter((c) => !q || matchTerms(q, nombreProv.get(c.providerId)?.businessName || c.providerName))
    .filter((c) => !f.plan || c.plan === f.plan)
    .filter((c) => !f.estado || c.status === f.estado)
  const cargosTabla = cargos.filter((c) => !q || matchTerms(q, `${c.vendedor} ${c.comprador}`))
  const cuentasTabla = cuentas
    .filter((x) => !q || matchTerms(q, x.p.businessName))
    .filter((x) => !f.plan || x.cuenta.plan === f.plan)
    .filter((x) => !f.estadoCuenta || x.cuenta.estado === f.estadoCuenta)

  const fmtFecha = (d: Date | null | undefined) => (d ? d.toISOString() : null)
  const tablas: Record<string, Tabla> = {}
  if (f.fuente !== 'cargo') {
    tablas.cobros = {
      titulo: 'Cobros de suscripción',
      columnas: ['Fecha', 'Proveedor', 'Plan', 'Monto', 'Estado', 'Motivo MP', 'Comisión MP', 'Neto', 'Pago de MP', 'Entorno'],
      filas: cobrosTabla.map((c) => [fmtFecha(c.paidAt || c.attemptedAt), nombreProv.get(c.providerId)?.businessName || c.providerName, PLAN(c.plan), c.amount - c.refundedAmount, estadoCobro(c.status), c.status === 'approved' ? null : c.statusDetail, c.status === 'approved' ? c.mpFee : null, c.status === 'approved' ? c.netAmount : null, c.mpPaymentId, c.mpEnvironment === 'test' ? 'prueba' : 'producción']),
      ids: cobrosTabla.map((c) => c.providerId),
      nota: 'Cada cobro tal como lo informó Mercado Pago. Comisión y neto vacíos = MP no los informó (no se estiman).',
    }
  }
  if (f.fuente !== 'suscripcion') {
    tablas.cargos = {
      titulo: 'Cargo de servicio 1% por operación',
      columnas: ['Fecha', 'Operación', 'Referencia', 'Vendedor', 'Comprador', 'Subtotal', 'Cargo (según HomIA)', 'Cargo informado por MP', 'Pago de MP'],
      filas: cargosTabla.map((c) => [fmtFecha(c.fecha), c.tipo, c.ref, c.vendedor, c.comprador, c.subtotal, c.cargo, c.cargoMp, c.mpPaymentId]),
      ids: cargosTabla.map(() => null),
      nota: 'Pagos por Mercado Pago aprobados. "Cargo informado por MP" = el application_fee que MP acreditó a HomIA (vacío si el pago es anterior al 25/09/2026 o MP no lo mandó). Las cancelaciones con reembolso total no cuentan; en sobrantes el 1% no se devuelve.',
    }
  }
  tablas.cuentas = {
    titulo: 'Estado de cuenta por proveedor',
    columnas: ['Proveedor', 'Estado', 'Plan', 'Desde', 'Último cobro', 'Monto último cobro', 'Pagado hasta', 'Deuda (meses)', 'Deuda', 'Prueba vence', 'Días de prueba', 'Motivo / nota', 'Suscripción en MP'],
    filas: cuentasTabla.map(({ p, cuenta: c, pre }) => [
      p.businessName, ETIQUETA_ESTADO[c.estado], PLAN(c.plan), fmtFecha(c.desde), fmtFecha(c.ultimoCobro?.fecha), c.ultimoCobro?.monto ?? null, fmtFecha(c.pagadoHasta),
      c.deuda?.meses ?? null, c.deuda?.monto ?? null, fmtFecha(c.prueba?.vence), c.prueba?.diasRestantes ?? null,
      c.baja ? ETIQUETA_MOTIVO[c.baja.motivo] + (c.nota ? ` · ${c.nota}` : '') : c.deuda?.intentosFallidos.length ? `${c.deuda.intentosFallidos.length} intento(s) rechazado(s)` : c.nota ?? null,
      pre ? ({ authorized: 'activa', pending: 'pendiente', paused: 'pausada', cancelled: 'cancelada' } as Record<string, string>)[pre.status] || pre.status : p.mpPreapprovalId ? 'sin respuesta de MP' : null,
    ]),
    ids: cuentasTabla.map((x) => x.p.id),
  }
  const proximos = cuentas
    .filter((x) => x.pre?.status === 'authorized' && x.pre.nextPaymentDate && (x.cuenta.estado === 'al_dia' || x.cuenta.estado === 'en_deuda' || x.cuenta.estado === 'sin_cobro'))
    .sort((a, b) => a.pre!.nextPaymentDate!.getTime() - b.pre!.nextPaymentDate!.getTime())
  tablas.proximos = {
    titulo: 'Próximos cobros esperados',
    columnas: ['Fecha (según MP)', 'Proveedor', 'Plan', 'Monto'],
    filas: proximos.map((x) => [fmtFecha(x.pre!.nextPaymentDate), x.p.businessName, PLAN(x.cuenta.plan), x.pre!.amount]),
    ids: proximos.map((x) => x.p.id),
    nota: 'Fecha y monto que informa Mercado Pago (next_payment_date) para cada suscripción autorizada.',
  }
  tablas.movimiento = {
    titulo: 'Movimiento por fecha',
    columnas: ['Período', 'Altas (registrados, inician prueba)', 'Primeras suscripciones pagas', 'Reactivaciones', 'Bajas', 'Cambios de plan', 'Neto', 'Suscripciones', 'Cargo 1%', 'Total'],
    filas: serie.map((s) => [s.clave, s.altas, s.primerasPagas, s.reactivaciones, s.bajas, s.cambiosPlan, s.neto, s.suscripciones, s.cargoServicio, s.total]),
    nota: `Neto = primeras pagas + reactivaciones − bajas. Movimientos del plan registrados en vivo desde el ${REGISTRO_COMPLETO_DESDE.split('-').reverse().join('/')}; lo anterior, reconstruido con fechas de Mercado Pago.`,
  }
  tablas.mensual = {
    titulo: 'Churn y conversión por mes',
    columnas: ['Mes', 'Pagando al inicio', 'Bajas', 'Churn %', 'Registrados', 'Pasaron a pago', 'Conversión %', 'Suscripciones', 'Cargo 1%'],
    filas: mensual.map((m) => [m.mes, m.activosInicio, m.bajas, m.churn, m.registrados, m.convertidos, m.conversion, r2(subsPorMes.get(m.mes) || 0), r2(cargoPorMes.get(m.mes) || 0)]),
    nota: 'Churn = bajas del mes / proveedores con un cobro aprobado en el mes anterior al día 1. Conversión = de los registrados ese mes, cuántos tuvieron alguna vez un cobro aprobado.',
  }
  // rankings (período)
  const porProv = new Map<string, { nombre: string; monto: number; cobros: number }>()
  for (const c of delPeriodo) {
    const k = c.providerId
    const x = porProv.get(k) || { nombre: nombreProv.get(k)?.businessName || c.providerName, monto: 0, cobros: 0 }
    x.monto += neto(c); x.cobros++
    porProv.set(k, x)
  }
  const rp = [...porProv.entries()].sort((a, b) => b[1].monto - a[1].monto)
  tablas.ranking_proveedores = {
    titulo: 'Proveedores por lo que pagaron',
    columnas: ['Proveedor', 'Cobros aprobados', 'Pagado'],
    filas: rp.map(([, x]) => [x.nombre, x.cobros, r2(x.monto)]),
    ids: rp.map(([k]) => k),
  }
  const porVend = new Map<string, { nombre: string; cargo: number; ops: number }>()
  for (const c of cargos) {
    const k = c.vendedor
    const x = porVend.get(k) || { nombre: c.vendedor, cargo: 0, ops: 0 }
    x.cargo += c.cargo; x.ops++
    porVend.set(k, x)
  }
  const rv = [...porVend.values()].sort((a, b) => b.cargo - a.cargo)
  tablas.ranking_vendedores = {
    titulo: 'Vendedores por cargo de servicio generado',
    columnas: ['Vendedor', 'Operaciones', 'Cargo 1% generado'],
    filas: rv.map((x) => [x.nombre, x.ops, r2(x.cargo)]),
  }

  const totalAct = r2(subsAct + cargoAct.total)
  const totalAnt = r2(subsAnt + cargoAnt.total)
  const vencenPronto = cuenta('en_prueba').map((x) => ({ id: x.p.id, nombre: x.p.businessName, vence: x.cuenta.prueba!.vence.toISOString(), dias: x.cuenta.prueba!.diasRestantes }))
    .sort((a, b) => a.vence.localeCompare(b.vence))
  return {
    periodo: { desde: f.desde.toISOString(), hasta: f.hasta.toISOString(), anteriorDesde: antDesde.toISOString(), gran: f.gran, incluirPrueba: f.incluirPrueba },
    resumen: {
      total: totalAct, totalAnterior: totalAnt, variacionTotal: variacion(totalAct, totalAnt),
      suscripciones: subsAct, suscripcionesAnterior: subsAnt, variacionSuscripciones: variacion(subsAct, subsAnt),
      cargoServicio: cargoAct.total, cargoAnterior: cargoAnt.total, variacionCargo: variacion(cargoAct.total, cargoAnt.total), cargoDetalle: cargoAct,
      cargoInformadoMp: { suma: r2(cargos.reduce((s, c) => s + (c.cargoMp ?? 0), 0)), conDato: cargos.filter((c) => c.cargoMp != null).length, operaciones: cargos.length },
      comisionMp: { suma: r2(conFee.reduce((s, c) => s + (c.mpFee ?? 0), 0)), conDato: conFee.length, cobros: delPeriodo.length },
      netoSuscripciones: conNeto.length === delPeriodo.length && delPeriodo.length > 0 ? r2(conNeto.reduce((s, c) => s + (c.netAmount ?? 0), 0)) : null,
      mrr: { ...mrr, precios: PLAN_PRICE_ARS },
      pagando,
      enPrueba: vencenPronto.length,
      pruebasVencen: vencenPronto.slice(0, 5),
      pruebaVencida: cuenta('prueba_vencida').length,
      enDeuda: cuenta('en_deuda').length,
      deudaTotal: r2(cuenta('en_deuda').reduce((s, x) => s + (x.cuenta.deuda?.monto ?? 0), 0)),
      sinCobro: cuenta('sin_cobro').length,
      dadosDeBaja: cuenta('baja').length,
      bajasPeriodo, altasPeriodo, primerasPeriodo, rechazadosPeriodo,
    },
    tablas,
    serie,
    registroCompletoDesde: REGISTRO_COMPLETO_DESDE,
    mp: { consultadas: preIds.length, sinRespuesta: mp.errores },
  }
}

// ───────────────────────────── ficha de un proveedor ─────────────────────────────

export type ItemLinea = { fecha: string; tipo: string; detalle: string; monto: number | null; estado?: string }

export async function fichaProveedor(id: string, ahora = new Date()) {
  const p = await db.providerProfile.findUnique({
    where: { id },
    select: { id: true, userId: true, businessName: true, subscription: true, trialEndsAt: true, createdAt: true, mpPreapprovalId: true, proSince: true, planPaidUntil: true, city: true, user: { select: { email: true, displayName: true } } },
  })
  const [cobros, eventos] = await Promise.all([
    db.subscriptionCharge.findMany({ where: { providerId: id }, orderBy: { attemptedAt: 'desc' } }),
    db.subscriptionEvent.findMany({ where: { providerId: id }, orderBy: { occurredAt: 'desc' } }),
  ])
  if (!p && !cobros.length && !eventos.length) return null
  let pre: PreInfo | null = null
  let mpError = false
  if (p?.mpPreapprovalId) {
    const r = await estadosMp([p.mpPreapprovalId])
    pre = r.mapa.get(p.mpPreapprovalId) ?? null
    mpError = r.errores > 0
  }
  const cuenta: Cuenta | null = p
    ? clasificarCuenta({ subscription: p.subscription, trialEndsAt: p.trialEndsAt, createdAt: p.createdAt, mpPreapprovalId: p.mpPreapprovalId, planPaidUntil: p.planPaidUntil },
      cobros, eventos, pre ? { status: pre.status, lastModified: pre.lastModified, nextPaymentDate: pre.nextPaymentDate, amount: pre.amount } : null, PLAN_PRICE_ARS, ahora)
    : null
  const linea: ItemLinea[] = []
  if (p) {
    linea.push({ fecha: p.createdAt.toISOString(), tipo: 'Alta', detalle: 'Se registró como proveedor y empezó la prueba gratis de 14 días', monto: null })
    const fin = p.trialEndsAt && p.trialEndsAt.getTime() > 0 ? p.trialEndsAt : new Date(p.createdAt.getTime() + 14 * 86_400_000)
    if (fin.getTime() <= ahora.getTime()) linea.push({ fecha: fin.toISOString(), tipo: 'Fin de la prueba', detalle: 'Terminó la prueba gratis', monto: null })
  }
  for (const c of cobros) {
    linea.push({
      fecha: (c.paidAt || c.attemptedAt).toISOString(),
      tipo: c.status === 'approved' ? 'Cobro aprobado' : c.status === 'rejected' ? 'Cobro rechazado' : `Cobro ${estadoCobro(c.status)}`,
      detalle: `Plan ${PLAN(c.plan)} · pago de MP ${c.mpPaymentId}${c.statusDetail && c.status !== 'approved' ? ` · motivo: ${c.statusDetail}` : ''}${c.mpEnvironment === 'test' ? ' · entorno de prueba' : ''}`,
      monto: c.amount, estado: c.status,
    })
  }
  for (const e of eventos) {
    linea.push({
      fecha: e.occurredAt.toISOString(),
      tipo: ETIQUETA_EVENTO[e.type] || e.type,
      detalle: [e.fromPlan || e.toPlan ? `${PLAN(e.fromPlan || '—')} → ${PLAN(e.toPlan || '—')}` : '', e.motivo || '', e.source === 'backfill' || e.source === 'cron' ? '(reconstruido de MP)' : ''].filter(Boolean).join(' · '),
      monto: null,
    })
  }
  linea.sort((a, b) => b.fecha.localeCompare(a.fecha))
  return {
    proveedor: p ? { id: p.id, userId: p.userId, nombre: p.businessName, email: p.user.email, contacto: p.user.displayName, ciudad: p.city, plan: p.subscription, alta: p.createdAt.toISOString(), mpPreapprovalId: p.mpPreapprovalId } : { id, userId: null, nombre: cobros[0]?.providerName || eventos[0]?.providerName || '(proveedor eliminado)', email: null, contacto: null, ciudad: null, plan: null, alta: null, mpPreapprovalId: null },
    cuenta: cuenta ? { ...cuenta, etiqueta: ETIQUETA_ESTADO[cuenta.estado], motivoBaja: cuenta.baja ? ETIQUETA_MOTIVO[cuenta.baja.motivo] : null } : null,
    suscripcionMp: pre ? { estado: pre.status, proximoCobro: pre.nextPaymentDate?.toISOString() ?? null, monto: pre.amount, entorno: pre.entorno } : null,
    mpError,
    totalPagado: r2(cobros.filter((c) => c.status === 'approved').reduce((s, c) => s + c.amount - c.refundedAmount, 0)),
    linea,
  }
}

