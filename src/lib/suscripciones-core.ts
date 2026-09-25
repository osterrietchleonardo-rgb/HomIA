// Ingresos de HomIA (D30) — reglas PURAS de las suscripciones de proveedores: sin base, sin red,
// sin React. Las usan el webhook, el cron, el backfill (scripts/pagos/backfill-suscripciones.mjs),
// la API de /admin/ingresos y los tests (src/lib/__tests__/ingresos.test.ts).
// Regla de oro: la fuente de verdad de cada cobro es Mercado Pago. Nada se estima: si MP no informa
// un dato (neto, comisión), queda null y la pantalla lo dice.
// Definiciones exactas: docs/interno/LOGICA-HOMIA.md § Ingresos de HomIA.

export const DIA_MS = 86_400_000
/** Mismo umbral que el cron diario de suscripciones: sin cobro aprobado en 35 días = impago. */
export const DIAS_SIN_COBRO = 35
/** Desde esta fecha los movimientos del plan se registran en vivo (webhook y cron). Lo anterior se
 *  reconstruyó desde Mercado Pago (fechas de la suscripción y sus cobros). */
export const REGISTRO_COMPLETO_DESDE = '2026-09-25'

export type PlanPago = 'basic' | 'pro'
export type Precios = Record<PlanPago, number>

// ───────────────────────────── referencia del plan ─────────────────────────────

/** "plan:provider:<providerId>:<basic|pro>" (la arma createProviderPlanPreapproval). */
export function parseReferenciaPlan(ref: string | null | undefined): { providerId: string; plan: PlanPago } | null {
  const m = /^plan:provider:([^:]+):(basic|pro)$/.exec(String(ref || ''))
  return m ? { providerId: m[1], plan: m[2] as PlanPago } : null
}

// ───────────────────────────── cobro de MP → fila ─────────────────────────────

/** Forma (parcial) de GET /authorized_payments/{id} — la "factura" mensual de la suscripción. */
export type MpAuthorizedPayment = {
  id?: number | string
  preapproval_id?: string
  type?: string
  status?: string
  external_reference?: string | number | null
  transaction_amount?: number | string
  currency_id?: string
  debit_date?: string | null
  date_created?: string | null
  retry_attempt?: number | null
  payment?: { id?: number | string | null; status?: string; status_detail?: string } | null
}

/** Forma (parcial) de GET /v1/payments/{id}. Se leen SOLO estos campos: nada de tarjeta ni pagador. */
export type MpPagoSuscripcion = {
  id?: number | string
  status?: string
  status_detail?: string
  external_reference?: string | null
  transaction_amount?: number | string
  transaction_amount_refunded?: number | string | null
  currency_id?: string
  date_created?: string | null
  date_approved?: string | null
  money_release_date?: string | null
  fee_details?: { type?: string; amount?: number | string; fee_payer?: string }[] | null
  transaction_details?: { net_received_amount?: number | string | null } | null
  point_of_interaction?: {
    type?: string
    transaction_data?: {
      subscription_id?: string | null
      billing_date?: string | null
      subscription_sequence?: { number?: number | null } | null
    } | null
  } | null
}

export type CobroSuscripcionData = {
  providerId: string
  plan: PlanPago
  mpPreapprovalId: string
  mpPaymentId: string
  mpAuthorizedPaymentId: string | null
  mpEnvironment: 'live' | 'test'
  status: string
  statusDetail: string | null
  amount: number
  currency: string
  refundedAmount: number
  netAmount: number | null
  mpFee: number | null
  periodStart: Date | null
  attemptedAt: Date
  paidAt: Date | null
  raw: Record<string, string | number | null>
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined || v === '') return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}
const fecha = (v: unknown): Date | null => {
  if (!v || typeof v !== 'string') return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}
const r2 = (n: number) => Math.round(n * 100) / 100

/**
 * Arma la fila de `SubscriptionCharge` a partir de lo que devolvió Mercado Pago (el pago y, si se
 * tiene, la factura de la suscripción). Devuelve null si el pago NO es de una suscripción de HomIA
 * (sin external_reference plan:provider:… ni preapproval) o si no tiene id.
 * `mpFee` = suma de `fee_details` (comisión de MP); `netAmount` = `net_received_amount`. Si MP no
 * los manda quedan null: nunca se estiman.
 */
export function cobroDesdeMp(
  pago: MpPagoSuscripcion,
  factura: MpAuthorizedPayment | null,
  entorno: 'live' | 'test'
): CobroSuscripcionData | null {
  const mpPaymentId = pago?.id != null ? String(pago.id) : factura?.payment?.id != null ? String(factura.payment.id) : ''
  if (!mpPaymentId) return null
  const ref = parseReferenciaPlan(pago.external_reference ?? (factura?.external_reference != null ? String(factura.external_reference) : null))
  if (!ref) return null
  const td = pago.point_of_interaction?.transaction_data || null
  const mpPreapprovalId = String(factura?.preapproval_id || td?.subscription_id || '')
  if (!mpPreapprovalId) return null
  const fees = Array.isArray(pago.fee_details) ? pago.fee_details : null
  const mpFee = fees && fees.length ? r2(fees.reduce((s, f) => s + (num(f.amount) ?? 0), 0)) : fees ? 0 : null
  const amount = num(pago.transaction_amount) ?? num(factura?.transaction_amount) ?? 0
  const attemptedAt = fecha(pago.date_created) || fecha(factura?.date_created) || new Date()
  return {
    providerId: ref.providerId,
    plan: ref.plan,
    mpPreapprovalId,
    mpPaymentId,
    mpAuthorizedPaymentId: factura?.id != null ? String(factura.id) : null,
    mpEnvironment: entorno,
    status: String(pago.status || factura?.payment?.status || 'desconocido'),
    statusDetail: pago.status_detail || factura?.payment?.status_detail || null,
    amount,
    currency: String(pago.currency_id || factura?.currency_id || 'ARS'),
    refundedAmount: num(pago.transaction_amount_refunded) ?? 0,
    netAmount: num(pago.transaction_details?.net_received_amount),
    mpFee,
    periodStart: fecha(td?.billing_date ? `${td.billing_date}T12:00:00.000-03:00` : null) || fecha(factura?.debit_date),
    attemptedAt,
    paidAt: fecha(pago.date_approved),
    raw: {
      authorizedPaymentId: factura?.id != null ? String(factura.id) : null,
      authorizedStatus: factura?.status ?? null,
      retryAttempt: factura?.retry_attempt ?? null,
      billingDate: td?.billing_date ?? null,
      sequence: td?.subscription_sequence?.number ?? null,
      moneyReleaseDate: pago.money_release_date ?? null,
    },
  }
}

// ───────────────────────────── estado de cuenta ─────────────────────────────

export type EstadoCuenta = 'al_dia' | 'en_deuda' | 'sin_cobro' | 'en_prueba' | 'prueba_vencida' | 'baja'
export const ETIQUETA_ESTADO: Record<EstadoCuenta, string> = {
  al_dia: 'Al día',
  en_deuda: 'En deuda',
  sin_cobro: 'Plan pago sin cobro registrado',
  en_prueba: 'En prueba',
  prueba_vencida: 'Prueba vencida sin plan',
  baja: 'Dado de baja',
}
export type MotivoBaja = 'cancelada' | 'pausada' | 'impago' | 'desconocido'
export const ETIQUETA_MOTIVO: Record<MotivoBaja, string> = {
  cancelada: 'canceló la suscripción en Mercado Pago',
  pausada: 'pausó la suscripción en Mercado Pago',
  impago: 'se dio de baja por falta de pago',
  desconocido: 'motivo sin registrar (baja anterior al registro)',
}

export type CobroMin = { status: string; amount: number; attemptedAt: Date; paidAt: Date | null; plan: string; statusDetail?: string | null; mpPreapprovalId?: string }
export type EventoMin = { type: string; occurredAt: Date; motivo?: string | null; fromPlan?: string | null; toPlan?: string | null; mpPreapprovalId?: string | null }
export type PreapprovalMin = { status: string; lastModified?: Date | null; nextPaymentDate?: Date | null; amount?: number | null } | null
export type ProveedorMin = { subscription: string; trialEndsAt: Date | null; createdAt: Date; mpPreapprovalId: string | null }

export type Cuenta = {
  estado: EstadoCuenta
  plan: string
  /** desde cuándo está en este estado (deuda: vencimiento impago; baja: fecha de baja; prueba vencida: fin de la prueba) */
  desde: Date | null
  prueba?: { vence: Date; diasRestantes: number }
  deuda?: { meses: number; monto: number; intentosFallidos: { fecha: Date; motivo: string | null; monto: number }[] }
  ultimoCobro: { fecha: Date; monto: number } | null
  /** hasta cuándo cubre el último cobro aprobado (un mes) */
  pagadoHasta: Date | null
  baja?: { fecha: Date | null; motivo: MotivoBaja }
  nota?: string
}

/** Suma meses de calendario (31/01 + 1 mes = 28/02 o 29/02). */
export function sumarMes(d: Date, meses = 1): Date {
  const r = new Date(d.getTime())
  const dia = r.getUTCDate()
  r.setUTCDate(1)
  r.setUTCMonth(r.getUTCMonth() + meses)
  const ult = new Date(Date.UTC(r.getUTCFullYear(), r.getUTCMonth() + 1, 0)).getUTCDate()
  r.setUTCDate(Math.min(dia, ult))
  return r
}

/** Días de calendario de Argentina (UTC-3) entre `desde` y `hasta` (0 = el mismo día). */
export function diasCalendarioAR(desde: Date, hasta: Date): number {
  const d = (x: Date) => Math.floor((x.getTime() - 3 * 3600_000) / DIA_MS)
  return d(hasta) - d(desde)
}

const BAJAS = ['cancelada', 'pausada', 'impago']

/**
 * Estado de cuenta de un proveedor con datos reales. Definiciones (LÓGICA § Ingresos):
 *  · Al día: plan pago con cobro aprobado hace ≤ 35 días y sin rechazos posteriores.
 *  · En deuda: plan pago cuyo último intento fue rechazado, o sin cobro aprobado en 35 días.
 *    Desde = primer rechazo posterior al último cobro aprobado (o el vencimiento del último cobro);
 *    meses adeudados = meses completos o empezados desde ahí (mínimo 1) × precio del plan.
 *  · Plan pago sin cobro registrado: plan basic/pro sin ningún cobro en HomIA (alta manual/demo, o
 *    el primer cobro todavía no llegó).
 *  · En prueba: trial vigente (vence hoy = 0 días restantes, sigue en prueba hasta la hora exacta).
 *  · Prueba vencida sin plan: trial vencido sin ningún plan pago en su historia.
 *  · Dado de baja: tuvo plan pago y hoy no (canceló/pausó en MP o se degradó por falta de pago).
 */
export function clasificarCuenta(
  prov: ProveedorMin,
  cobros: CobroMin[],
  eventos: EventoMin[],
  pre: PreapprovalMin,
  precios: Precios,
  ahora = new Date()
): Cuenta {
  const aprobados = cobros.filter((c) => c.status === 'approved' && c.paidAt).sort((a, b) => a.paidAt!.getTime() - b.paidAt!.getTime())
  const ultOk = aprobados[aprobados.length - 1] || null
  const ultimoCobro = ultOk ? { fecha: ultOk.paidAt!, monto: ultOk.amount } : null
  const pagadoHasta = ultOk ? sumarMes(ultOk.paidAt!) : null
  const plan = prov.subscription || 'trial'

  if (plan === 'basic' || plan === 'pro') {
    const refOk = ultOk ? ultOk.paidAt!.getTime() : -Infinity
    const fallidos = cobros
      .filter((c) => c.status === 'rejected' && c.attemptedAt.getTime() > refOk)
      .sort((a, b) => a.attemptedAt.getTime() - b.attemptedAt.getTime())
    const intentos = [...cobros].sort((a, b) => b.attemptedAt.getTime() - a.attemptedAt.getTime())
    const ultimoIntento = intentos[0] || null
    const precio = precios[plan]
    const armarDeuda = (desde: Date): Cuenta => {
      const meses = Math.max(1, Math.ceil((ahora.getTime() - desde.getTime()) / (30 * DIA_MS)))
      return {
        estado: 'en_deuda', plan, desde, ultimoCobro, pagadoHasta,
        deuda: { meses, monto: meses * precio, intentosFallidos: fallidos.map((f) => ({ fecha: f.attemptedAt, motivo: f.statusDetail ?? null, monto: f.amount })) },
      }
    }
    if (fallidos.length && ultimoIntento && ultimoIntento.status === 'rejected') {
      // MP intenta cobrar al vencer el mes: el primer rechazo posterior al último cobro es el vencimiento impago
      return armarDeuda(fallidos[0].attemptedAt)
    }
    if (ultOk) {
      const dias = (ahora.getTime() - ultOk.paidAt!.getTime()) / DIA_MS
      if (dias <= DIAS_SIN_COBRO) return { estado: 'al_dia', plan, desde: ultOk.paidAt!, ultimoCobro, pagadoHasta }
      return armarDeuda(pagadoHasta!)
    }
    const enProceso = cobros.some((c) => c.status === 'pending' || c.status === 'in_process')
    return {
      estado: 'sin_cobro', plan, desde: null, ultimoCobro: null, pagadoHasta: null,
      nota: !prov.mpPreapprovalId
        ? 'Plan sin suscripción de Mercado Pago (alta manual o cuenta demo): no genera cobros.'
        : enProceso ? 'El primer cobro está en proceso en Mercado Pago.' : 'Todavía no llegó ningún cobro de esta suscripción.',
    }
  }

  // trial (o degradado: trialEndsAt = 1970 marca "prueba consumida")
  const finPrueba = prov.trialEndsAt ?? new Date(prov.createdAt.getTime() + 14 * DIA_MS)
  const degradado = prov.trialEndsAt != null && prov.trialEndsAt.getTime() <= 0
  const bajaEv = [...eventos].filter((e) => BAJAS.includes(e.type)).sort((a, b) => b.occurredAt.getTime() - a.occurredAt.getTime())[0]
  const tuvoPlan = degradado || aprobados.length > 0 || !!bajaEv || eventos.some((e) => ['activada', 'reactivada', 'cambio_plan'].includes(e.type))
  if (!degradado && finPrueba.getTime() > ahora.getTime() && !bajaEv) {
    return {
      estado: 'en_prueba', plan: 'trial', desde: prov.createdAt, ultimoCobro, pagadoHasta,
      prueba: { vence: finPrueba, diasRestantes: Math.max(0, diasCalendarioAR(ahora, finPrueba)) },
    }
  }
  if (tuvoPlan) {
    let motivo: MotivoBaja = 'desconocido'
    let fechaBaja: Date | null = null
    if (bajaEv) {
      motivo = bajaEv.type as MotivoBaja
      fechaBaja = bajaEv.occurredAt
    } else if (pre && (pre.status === 'cancelled' || pre.status === 'paused')) {
      motivo = pre.status === 'cancelled' ? 'cancelada' : 'pausada'
      fechaBaja = pre.lastModified ?? null
    } else if (pre && pre.status === 'authorized') {
      motivo = 'impago' // la suscripción sigue viva en MP pero HomIA degradó el plan: fue por falta de pago
    }
    const vigente = pagadoHasta && pagadoHasta.getTime() > ahora.getTime()
    return {
      estado: 'baja', plan: 'trial', desde: fechaBaja, ultimoCobro, pagadoHasta,
      baja: { fecha: fechaBaja, motivo },
      nota: vigente ? 'Se dio de baja con un período pago todavía vigente.' : undefined,
    }
  }
  return { estado: 'prueba_vencida', plan: 'trial', desde: finPrueba, ultimoCobro: null, pagadoHasta: null }
}

// ───────────────────────────── MRR ─────────────────────────────

/**
 * MRR (ingreso mensual recurrente de suscripciones): suma del precio mensual del plan de cada
 * proveedor con plan pago y suscripción de Mercado Pago vigente (al día o en deuda). No cuenta las
 * altas manuales/demo sin suscripción, ni pruebas, ni bajas.
 */
export function calcularMrr(cuentas: { estado: EstadoCuenta; plan: string; tieneSuscripcion: boolean }[], precios: Precios) {
  let basic = 0
  let pro = 0
  for (const c of cuentas) {
    if (!c.tieneSuscripcion || (c.estado !== 'al_dia' && c.estado !== 'en_deuda')) continue
    if (c.plan === 'pro') pro++
    else if (c.plan === 'basic') basic++
  }
  return { basic, pro, mrr: basic * precios.basic + pro * precios.pro }
}

// ───────────────────────────── series por fecha ─────────────────────────────

export type Granularidad = 'dia' | 'semana' | 'mes'

/** Clave del bucket en hora de Argentina: AAAA-MM-DD (día o lunes de la semana) o AAAA-MM. */
export function claveBucket(d: Date, g: Granularidad): string {
  const local = new Date(d.getTime() - 3 * 3600_000)
  if (g === 'mes') return local.toISOString().slice(0, 7)
  if (g === 'semana') {
    const dow = (local.getUTCDay() + 6) % 7 // lunes = 0
    return new Date(local.getTime() - dow * DIA_MS).toISOString().slice(0, 10)
  }
  return local.toISOString().slice(0, 10)
}

/** Todas las claves de [desde, hasta) en orden (para que el gráfico no tenga huecos). */
export function clavesRango(desde: Date, hasta: Date, g: Granularidad): string[] {
  const out: string[] = []
  let t = desde.getTime()
  let guard = 0
  while (t < hasta.getTime() && guard++ < 1000) {
    const k = claveBucket(new Date(t), g)
    if (out[out.length - 1] !== k) out.push(k)
    t += DIA_MS
  }
  return out
}

export type FilaSerie = {
  clave: string
  suscripciones: number
  cargoServicio: number
  total: number
  altas: number
  primerasPagas: number
  reactivaciones: number
  bajas: number
  cambiosPlan: number
  neto: number
}

/** Serie por fecha: ingresos por fuente + movimiento de proveedores. */
export function armarSerie(
  claves: string[],
  g: Granularidad,
  datos: {
    cobrosAprobados: { paidAt: Date; amount: number; refundedAmount: number }[]
    cargos: { fecha: Date; cargo: number }[]
    altas: Date[]
    primerasPagas: Date[]
    eventos: { type: string; occurredAt: Date }[]
  }
): FilaSerie[] {
  const m = new Map<string, FilaSerie>(claves.map((k) => [k, { clave: k, suscripciones: 0, cargoServicio: 0, total: 0, altas: 0, primerasPagas: 0, reactivaciones: 0, bajas: 0, cambiosPlan: 0, neto: 0 }]))
  const en = (d: Date) => m.get(claveBucket(d, g))
  for (const c of datos.cobrosAprobados) { const f = en(c.paidAt); if (f) f.suscripciones += c.amount - c.refundedAmount }
  for (const c of datos.cargos) { const f = en(c.fecha); if (f) f.cargoServicio += c.cargo }
  for (const d of datos.altas) { const f = en(d); if (f) f.altas++ }
  for (const d of datos.primerasPagas) { const f = en(d); if (f) f.primerasPagas++ }
  for (const e of datos.eventos) {
    const f = en(e.occurredAt)
    if (!f) continue
    if (BAJAS.includes(e.type)) f.bajas++
    else if (e.type === 'reactivada') f.reactivaciones++
    else if (e.type === 'cambio_plan') f.cambiosPlan++
  }
  return [...m.values()].map((f) => ({
    ...f,
    suscripciones: r2(f.suscripciones),
    cargoServicio: r2(f.cargoServicio),
    total: r2(f.suscripciones + f.cargoServicio),
    neto: f.primerasPagas + f.reactivaciones - f.bajas,
  }))
}

// ───────────────────────────── churn y conversión mensual ─────────────────────────────

export type FilaMensual = { mes: string; activosInicio: number; bajas: number; churn: number | null; registrados: number; convertidos: number; conversion: number | null }

/**
 * Por mes (AAAA-MM, hora de Argentina):
 *  · activos al inicio = proveedores distintos con un cobro aprobado en el mes anterior al día 1
 *    (el cobro cubre un mes, así que estaban pagando ese día);
 *  · churn = bajas del mes / activos al inicio (null si no había activos);
 *  · conversión (cohorte por mes de alta) = de los proveedores registrados ese mes, cuántos tuvieron
 *    alguna vez un cobro aprobado.
 */
export function armarMensual(
  meses: string[],
  datos: {
    cobrosAprobados: { providerId: string; paidAt: Date }[]
    bajas: { occurredAt: Date }[]
    proveedores: { id: string; createdAt: Date }[]
  }
): FilaMensual[] {
  const pagaron = new Set(datos.cobrosAprobados.map((c) => c.providerId))
  return meses.map((mes) => {
    const [y, mo] = mes.split('-').map(Number)
    const inicio = new Date(Date.UTC(y, mo - 1, 1, 3)) // 00:00 de Argentina
    const antes = sumarMes(inicio, -1)
    const activos = new Set(datos.cobrosAprobados.filter((c) => c.paidAt >= antes && c.paidAt < inicio).map((c) => c.providerId)).size
    const bajas = datos.bajas.filter((b) => claveBucket(b.occurredAt, 'mes') === mes).length
    const cohorte = datos.proveedores.filter((p) => claveBucket(p.createdAt, 'mes') === mes)
    const convertidos = cohorte.filter((p) => pagaron.has(p.id)).length
    return {
      mes,
      activosInicio: activos,
      bajas,
      churn: activos > 0 ? r2((bajas / activos) * 100) : null,
      registrados: cohorte.length,
      convertidos,
      conversion: cohorte.length > 0 ? r2((convertidos / cohorte.length) * 100) : null,
    }
  })
}

/** Variación porcentual vs el período anterior (null si el anterior fue 0). */
export function variacion(actual: number, anterior: number): number | null {
  if (!anterior) return null
  return r2(((actual - anterior) / anterior) * 100)
}

// ───────────────────────────── eventos de plan ─────────────────────────────

/**
 * Qué evento registra una activación de suscripción autorizada:
 *  · desde trial sin historia de plan pago → "activada" (primera suscripción paga);
 *  · desde trial habiendo tenido plan (baja previa o cobros) → "reactivada";
 *  · basic ↔ pro → "cambio_plan".
 */
export function eventoActivacion(anterior: string, nuevo: PlanPago, tuvoPlanAntes: boolean): { type: 'activada' | 'reactivada' | 'cambio_plan'; fromPlan: string; toPlan: PlanPago } {
  if (anterior === 'basic' || anterior === 'pro') return { type: 'cambio_plan', fromPlan: anterior, toPlan: nuevo }
  return { type: tuvoPlanAntes ? 'reactivada' : 'activada', fromPlan: anterior || 'trial', toPlan: nuevo }
}

export const ETIQUETA_EVENTO: Record<string, string> = {
  activada: 'Primera suscripción paga',
  reactivada: 'Reactivó la suscripción',
  cambio_plan: 'Cambio de plan',
  cancelada: 'Baja: canceló la suscripción',
  pausada: 'Baja: pausó la suscripción',
  impago: 'Baja por falta de pago',
  reemplazada: 'Suscripción anterior cancelada por cambio de plan',
}

// ───────────────────────────── aviso del webhook ─────────────────────────────

export type ResultadoAviso = { status: number; body: Record<string, unknown> }

/**
 * Procesa un aviso `subscription_authorized_payment` con dependencias inyectadas (así se prueba el
 * 503 sin tocar la base). Regla: NUNCA 200 si el cobro no quedó guardado — 503 para que MP reintente.
 *  · MP no responde / error de red → 503;
 *  · la factura no existe en ningún entorno (aviso ajeno o falso) → 200 ignorado;
 *  · la factura todavía no tiene pago (programada) → 200 sin nada que guardar;
 *  · no es de una suscripción de HomIA → 200 ignorado;
 *  · error al guardar → 503.
 */
export async function procesarAvisoCobro(
  authorizedPaymentId: string,
  deps: {
    traerFactura: (id: string) => Promise<{ factura: MpAuthorizedPayment; entorno: 'live' | 'test' } | null>
    traerPago: (paymentId: string, entorno: 'live' | 'test') => Promise<MpPagoSuscripcion>
    guardar: (c: CobroSuscripcionData) => Promise<unknown>
  }
): Promise<ResultadoAviso> {
  let f: { factura: MpAuthorizedPayment; entorno: 'live' | 'test' } | null
  try {
    f = await deps.traerFactura(authorizedPaymentId)
  } catch {
    return { status: 503, body: { received: false, retry: true, motivo: 'mercadopago' } }
  }
  if (!f) return { status: 200, body: { received: true, ignored: true } }
  const payId = f.factura.payment?.id
  if (payId == null || payId === '') return { status: 200, body: { received: true, pendiente: true } }
  let pago: MpPagoSuscripcion
  try {
    pago = await deps.traerPago(String(payId), f.entorno)
  } catch {
    return { status: 503, body: { received: false, retry: true, motivo: 'mercadopago' } }
  }
  const data = cobroDesdeMp(pago, f.factura, f.entorno)
  if (!data) return { status: 200, body: { received: true, ignored: true } }
  try {
    await deps.guardar(data)
  } catch {
    return { status: 503, body: { received: false, retry: true, motivo: 'base' } }
  }
  return { status: 200, body: { received: true, mpPaymentId: data.mpPaymentId, status: data.status } }
}
