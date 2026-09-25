// Ingresos de HomIA (D30) — cobros de suscripción de proveedores contra Mercado Pago y la base.
// Fuente de verdad: Mercado Pago (app "Suscripciones", MP_SUB_ACCESS_TOKEN; si un recurso no
// aparece en producción se busca con MP_SUB_TEST_ACCESS_TOKEN y queda marcado mpEnvironment=test).
// Lo usan: el webhook (tópico subscription_authorized_payment y pagos con external_reference
// plan:provider:…), el cron diario (reconciliación) y el backfill único
// (scripts/pagos/backfill-suscripciones.mjs, que importa este archivo con node + type stripping:
// por eso no importa nada de Next).
import { db } from '@/lib/db'
import {
  cobroDesdeMp, eventoActivacion, parseReferenciaPlan, procesarAvisoCobro,
  type CobroSuscripcionData, type MpAuthorizedPayment, type MpPagoSuscripcion, type PlanPago, type ResultadoAviso,
} from '@/lib/suscripciones-core'

type Entorno = 'live' | 'test'

/** Base de la API. Solo fuera de producción se puede apuntar a un doble (E2E): MP_API_BASE_PRUEBAS. */
function mpBase(): string {
  const doble = process.env.NODE_ENV !== 'production' ? process.env.MP_API_BASE_PRUEBAS : ''
  return doble || 'https://api.mercadopago.com'
}

function tokens(): { entorno: Entorno; token: string }[] {
  const live = process.env.MP_SUB_ACCESS_TOKEN || process.env.MP_ACCESS_TOKEN || ''
  const test = process.env.MP_SUB_TEST_ACCESS_TOKEN || ''
  const out: { entorno: Entorno; token: string }[] = []
  if (live.length > 10) out.push({ entorno: 'live', token: live })
  if (test.length > 10) out.push({ entorno: 'test', token: test })
  return out
}

export class MpSubError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.name = 'MpSubError'
    this.status = status
  }
}

/** GET a la API de MP. 404 → null; otro error → MpSubError (el llamador decide reintentar). */
async function mpGet<T>(path: string, token: string): Promise<T | null> {
  let res: Response
  try {
    res = await fetch(`${mpBase()}${path}`, {
      headers: { Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(15_000),
      cache: 'no-store',
    })
  } catch (e) {
    throw new MpSubError(`MP sin respuesta: ${e instanceof Error ? e.message : 'red'}`, 0)
  }
  if (res.status === 404) return null
  if (!res.ok) throw new MpSubError(`MP ${res.status} en ${path.split('?')[0]}`, res.status)
  return (await res.json()) as T
}

/** Factura de la suscripción (authorized_payment) en producción o, si no aparece, en prueba. */
export async function traerFactura(id: string): Promise<{ factura: MpAuthorizedPayment; entorno: Entorno } | null> {
  const ts = tokens()
  if (!ts.length) throw new MpSubError('MP_SUB_ACCESS_TOKEN no configurada', 0)
  for (const t of ts) {
    const f = await mpGet<MpAuthorizedPayment>(`/authorized_payments/${encodeURIComponent(id)}`, t.token)
    if (f) return { factura: f, entorno: t.entorno }
  }
  return null
}

/** Pago con el token del entorno donde apareció la factura. */
export async function traerPago(paymentId: string, entorno: Entorno): Promise<MpPagoSuscripcion> {
  const t = tokens().find((x) => x.entorno === entorno)
  if (!t) throw new MpSubError(`sin token de ${entorno}`, 0)
  const p = await mpGet<MpPagoSuscripcion>(`/v1/payments/${encodeURIComponent(paymentId)}`, t.token)
  if (!p) throw new MpSubError('pago no encontrado', 404)
  return p
}

// ───────────────────────────── guardar ─────────────────────────────

/** Upsert idempotente por mpPaymentId. Actualiza lo que cambia en MP (estado, reembolsos, neto). */
export async function guardarCobro(c: CobroSuscripcionData, source: 'webhook' | 'cron' | 'backfill') {
  const prov = await db.providerProfile.findUnique({ where: { id: c.providerId }, select: { businessName: true, userId: true } })
  const cambios = {
    status: c.status,
    statusDetail: c.statusDetail,
    amount: c.amount,
    currency: c.currency,
    refundedAmount: c.refundedAmount,
    netAmount: c.netAmount,
    mpFee: c.mpFee,
    paidAt: c.paidAt,
    periodStart: c.periodStart,
    raw: c.raw,
    ...(c.mpAuthorizedPaymentId ? { mpAuthorizedPaymentId: c.mpAuthorizedPaymentId } : {}),
  }
  return db.subscriptionCharge.upsert({
    where: { mpPaymentId: c.mpPaymentId },
    create: {
      ...cambios,
      providerId: c.providerId,
      userId: prov?.userId ?? null,
      providerName: prov?.businessName ?? '(proveedor eliminado)',
      plan: c.plan,
      mpPreapprovalId: c.mpPreapprovalId,
      mpPaymentId: c.mpPaymentId,
      mpAuthorizedPaymentId: c.mpAuthorizedPaymentId,
      mpEnvironment: c.mpEnvironment,
      attemptedAt: c.attemptedAt,
      source,
    },
    update: cambios,
  })
}

/** Webhook `subscription_authorized_payment`: 200 solo si quedó guardado (o no había nada que guardar). */
export function procesarAvisoSuscripcion(authorizedPaymentId: string): Promise<ResultadoAviso> {
  return procesarAvisoCobro(authorizedPaymentId, {
    traerFactura,
    traerPago,
    guardar: (c) => guardarCobro(c, 'webhook'),
  })
}

/**
 * Pago de suscripción que llegó por el tópico `payment` (external_reference plan:provider:…): se
 * re-consulta con el token de Suscripciones y se guarda. Devuelve false si no apareció en MP.
 */
export async function registrarCobroPorPago(paymentId: string): Promise<boolean> {
  for (const t of tokens()) {
    const p = await mpGet<MpPagoSuscripcion>(`/v1/payments/${encodeURIComponent(paymentId)}`, t.token)
    if (!p) continue
    const data = cobroDesdeMp(p, null, t.entorno)
    if (!data) return false
    await guardarCobro(data, 'webhook')
    return true
  }
  return false
}

// ───────────────────────────── eventos del plan ─────────────────────────────

type EventoPlan = {
  providerId: string
  type: string
  dedupeKey: string
  occurredAt: Date
  source: 'webhook' | 'cron' | 'backfill'
  fromPlan?: string | null
  toPlan?: string | null
  mpPreapprovalId?: string | null
  motivo?: string | null
  providerName?: string
}

/** Registra un movimiento del plan una sola vez (dedupeKey). No pisa uno ya registrado. */
export async function registrarEventoPlan(e: EventoPlan) {
  const providerName = e.providerName ?? (await db.providerProfile.findUnique({ where: { id: e.providerId }, select: { businessName: true } }))?.businessName ?? '(proveedor eliminado)'
  const { providerName: _omit, ...resto } = e
  void _omit
  await db.subscriptionEvent.upsert({
    where: { dedupeKey: e.dedupeKey },
    create: { ...resto, providerName },
    update: {},
  })
}

/** Evento de una suscripción autorizada (webhook): activada / reactivada / cambio de plan. */
export async function registrarActivacion(input: {
  providerId: string
  anterior: string
  nuevo: PlanPago
  preapprovalId: string
  trialEndsAt: Date | null
  source: 'webhook' | 'cron'
}) {
  let tuvoPlan = input.trialEndsAt != null && input.trialEndsAt.getTime() <= 0
  if (!tuvoPlan && input.anterior !== 'basic' && input.anterior !== 'pro') {
    const [baja, cobro] = await Promise.all([
      db.subscriptionEvent.findFirst({ where: { providerId: input.providerId, type: { in: ['cancelada', 'pausada', 'impago', 'activada', 'reactivada'] } }, select: { id: true } }),
      db.subscriptionCharge.findFirst({ where: { providerId: input.providerId, status: 'approved', mpPreapprovalId: { not: input.preapprovalId } }, select: { id: true } }),
    ])
    tuvoPlan = !!baja || !!cobro
  }
  const ev = eventoActivacion(input.anterior, input.nuevo, tuvoPlan)
  await registrarEventoPlan({
    providerId: input.providerId, type: ev.type, fromPlan: ev.fromPlan, toPlan: ev.toPlan,
    mpPreapprovalId: input.preapprovalId, dedupeKey: `act:${input.preapprovalId}`, occurredAt: new Date(), source: input.source,
  })
}

/** Evento de baja de la suscripción vigente (webhook o cron). */
export function registrarBaja(input: { providerId: string; plan: string; preapprovalId: string; tipo: 'cancelada' | 'pausada' | 'impago'; source: 'webhook' | 'cron' }) {
  return registrarEventoPlan({
    providerId: input.providerId, type: input.tipo, fromPlan: input.plan, toPlan: 'trial',
    mpPreapprovalId: input.preapprovalId, dedupeKey: `baja:${input.preapprovalId}`, occurredAt: new Date(), source: input.source,
    motivo: input.tipo === 'impago' ? 'sin cobro aprobado en 35 días o suscripción rechazada' : `suscripción ${input.tipo} en Mercado Pago`,
  })
}

// ───────────────────────────── reconciliación / backfill ─────────────────────────────

type PreapprovalMp = {
  id?: string
  status?: string
  external_reference?: string | null
  date_created?: string | null
  last_modified?: string | null
  next_payment_date?: string | null
  auto_recurring?: { transaction_amount?: number | null } | null
}

type Paginado<T> = { paging?: { total?: number; offset?: number; limit?: number }; results?: T[] }

async function todasLasPreapprovals(token: string): Promise<PreapprovalMp[]> {
  const out: PreapprovalMp[] = []
  for (let offset = 0; offset < 5000; offset += 100) {
    const r = await mpGet<Paginado<PreapprovalMp>>(`/preapproval/search?limit=100&offset=${offset}`, token)
    const res = r?.results || []
    out.push(...res)
    if (res.length < 100) break
  }
  return out
}

async function facturasDe(preId: string, token: string): Promise<MpAuthorizedPayment[]> {
  const out: MpAuthorizedPayment[] = []
  for (let offset = 0; offset < 2400; offset += 12) {
    const r = await mpGet<Paginado<MpAuthorizedPayment>>(`/authorized_payments/search?preapproval_id=${encodeURIComponent(preId)}&limit=12&offset=${offset}`, token)
    const res = r?.results || []
    out.push(...res)
    const total = r?.paging?.total ?? res.length
    if (res.length === 0 || out.length >= total) break
  }
  return out
}

/** Estado de una preapproval en MP (para la pantalla: estado, próxima fecha de cobro). */
export async function traerPreapproval(id: string): Promise<(PreapprovalMp & { entorno: Entorno }) | null> {
  for (const t of tokens()) {
    const p = await mpGet<PreapprovalMp>(`/preapproval/${encodeURIComponent(id)}`, t.token)
    if (p) return { ...p, entorno: t.entorno }
  }
  return null
}

export type ReporteEntorno = {
  preapprovals: number
  deHomia: number
  facturas: number
  pagos: number
  nuevos: number
  actualizados: number
  sinCambios: number
  porEstado: Record<string, { cantidad: number; monto: number }>
  proveedores: string[]
}
export type ReporteSincronizacion = {
  entornos: Partial<Record<Entorno, ReporteEntorno>>
  eventos: { type: string; providerId: string; mpPreapprovalId: string; occurredAt: string; nuevo: boolean }[]
  errores: string[]
}

/**
 * Trae de Mercado Pago TODAS las suscripciones de la cuenta (ambos entornos), sus facturas y los
 * pagos, e inserta/actualiza los cobros faltantes (idempotente por mpPaymentId). Así no se pierde
 * ningún cobro aunque el webhook falle. Con `reconstruirEventos` (backfill y cron) arma también los
 * movimientos del plan desde las fechas de MP — solo del entorno de producción.
 * `dryRun`: no escribe nada; devuelve qué haría.
 */
export async function sincronizarCobros(opts: { fuente: 'cron' | 'backfill'; dryRun?: boolean; reconstruirEventos?: boolean; entornos?: Entorno[] }): Promise<ReporteSincronizacion> {
  const rep: ReporteSincronizacion = { entornos: {}, eventos: [], errores: [] }
  const ts = tokens().filter((t) => !opts.entornos || opts.entornos.includes(t.entorno))
  if (!ts.length) {
    rep.errores.push('MP_SUB_ACCESS_TOKEN no configurada')
    return rep
  }
  for (const t of ts) {
    const r: ReporteEntorno = { preapprovals: 0, deHomia: 0, facturas: 0, pagos: 0, nuevos: 0, actualizados: 0, sinCambios: 0, porEstado: {}, proveedores: [] }
    rep.entornos[t.entorno] = r
    let pres: PreapprovalMp[]
    try {
      pres = await todasLasPreapprovals(t.token)
    } catch (e) {
      rep.errores.push(`${t.entorno}: ${e instanceof Error ? e.message : 'error'} al listar suscripciones`)
      continue
    }
    r.preapprovals = pres.length
    const provs = new Set<string>()
    // cobros aprobados por preapproval (para reconstruir eventos)
    const aprobadosPorPre = new Map<string, Date[]>()
    for (const pre of pres) {
      const ref = parseReferenciaPlan(pre.external_reference)
      if (!ref || !pre.id) continue
      r.deHomia++
      provs.add(ref.providerId)
      let facturas: MpAuthorizedPayment[]
      try {
        facturas = await facturasDe(pre.id, t.token)
      } catch (e) {
        rep.errores.push(`${t.entorno}: ${e instanceof Error ? e.message : 'error'} (facturas de ${pre.id})`)
        continue
      }
      r.facturas += facturas.length
      const ids = facturas.map((f) => (f.payment?.id != null ? String(f.payment.id) : '')).filter(Boolean)
      const existentes = ids.length
        ? await db.subscriptionCharge.findMany({ where: { mpPaymentId: { in: ids } }, select: { mpPaymentId: true, status: true, mpAuthorizedPaymentId: true, paidAt: true, amount: true } })
        : []
      const ya = new Map(existentes.map((e) => [e.mpPaymentId, e]))
      for (const f of facturas) {
        const pid = f.payment?.id != null ? String(f.payment.id) : ''
        if (!pid) continue
        r.pagos++
        const previo = ya.get(pid)
        const mismoEstado = previo && previo.status === (f.payment?.status || '') && previo.mpAuthorizedPaymentId
        let data: CobroSuscripcionData | null = null
        if (mismoEstado && opts.fuente === 'cron') {
          r.sinCambios++
        } else {
          try {
            const pago = await traerPago(pid, t.entorno)
            data = cobroDesdeMp(pago, { ...f, preapproval_id: f.preapproval_id || pre.id, external_reference: f.external_reference ?? pre.external_reference ?? null }, t.entorno)
          } catch (e) {
            rep.errores.push(`${t.entorno}: ${e instanceof Error ? e.message : 'error'} (pago ${pid})`)
            continue
          }
          if (!data) continue
          if (!previo) r.nuevos++
          else if (previo.status !== data.status || !previo.mpAuthorizedPaymentId) r.actualizados++
          else r.sinCambios++
          if (!opts.dryRun) await guardarCobro(data, opts.fuente)
        }
        const estado = data?.status || previo?.status || f.payment?.status || 'desconocido'
        const monto = data?.amount ?? previo?.amount ?? Number(f.transaction_amount ?? 0)
        const pagadoEl = data ? data.paidAt : previo?.paidAt ?? null
        const e = (r.porEstado[estado] ||= { cantidad: 0, monto: 0 })
        e.cantidad++
        e.monto += monto
        if (estado === 'approved' && pagadoEl) {
          const arr = aprobadosPorPre.get(pre.id) || []
          arr.push(pagadoEl)
          aprobadosPorPre.set(pre.id, arr)
        }
      }
    }
    r.proveedores = [...provs]
    if (opts.reconstruirEventos && t.entorno === 'live') {
      await reconstruirEventos(pres, aprobadosPorPre, opts, rep)
    }
  }
  return rep
}

/**
 * Movimientos del plan reconstruidos SOLO con fechas de Mercado Pago (source = cron|backfill):
 *  · primer cobro aprobado de cada suscripción → activada (la primera del proveedor), cambio_plan
 *    (si reemplazó a otra) o reactivada;
 *  · suscripción cancelada/pausada → "reemplazada" si otra del mismo proveedor empezó a cobrar dentro
 *    de ±3 días (cambio de plan), si no → baja (cancelada/pausada) en `last_modified`, solo si llegó a
 *    cobrar o es la vigente del proveedor (un checkout abandonado no es una baja).
 * Mismas claves que el webhook (act:/baja:/reemp:<preapproval>): nunca duplica.
 */
async function reconstruirEventos(
  pres: PreapprovalMp[],
  aprobados: Map<string, Date[]>,
  opts: { fuente: 'cron' | 'backfill'; dryRun?: boolean },
  rep: ReporteSincronizacion
) {
  const porProv = new Map<string, { pre: PreapprovalMp; plan: PlanPago; primerCobro: Date | null }[]>()
  for (const pre of pres) {
    const ref = parseReferenciaPlan(pre.external_reference)
    if (!ref || !pre.id) continue
    const fechas = (aprobados.get(pre.id) || []).sort((a, b) => a.getTime() - b.getTime())
    const arr = porProv.get(ref.providerId) || []
    arr.push({ pre, plan: ref.plan, primerCobro: fechas[0] || null })
    porProv.set(ref.providerId, arr)
  }
  const ids = [...porProv.keys()]
  const perfiles = ids.length ? await db.providerProfile.findMany({ where: { id: { in: ids } }, select: { id: true, businessName: true, subscription: true, mpPreapprovalId: true } }) : []
  const perfil = new Map(perfiles.map((p) => [p.id, p]))
  const keys: string[] = []
  const nuevos: EventoPlan[] = []
  for (const [providerId, lista] of porProv) {
    const prov = perfil.get(providerId)
    const nombre = prov?.businessName ?? '(proveedor eliminado)'
    const cobradas = lista.filter((x) => x.primerCobro).sort((a, b) => a.primerCobro!.getTime() - b.primerCobro!.getTime())
    const fechaDe = (s?: string | null) => (s ? new Date(s) : null)
    // reemplazos: cancelada con otra que empezó a cobrar cerca de su cancelación
    const reemplazada = new Map<string, PlanPago>()
    for (const x of lista) {
      if (x.pre.status !== 'cancelled' && x.pre.status !== 'paused') continue
      const fin = fechaDe(x.pre.last_modified)
      if (!fin) continue
      const otra = cobradas.find((y) => y.pre.id !== x.pre.id && Math.abs(y.primerCobro!.getTime() - fin.getTime()) <= 3 * 86_400_000)
      if (otra) reemplazada.set(x.pre.id!, x.plan)
    }
    cobradas.forEach((x, i) => {
      const previa = cobradas[i - 1]
      const esCambio = previa && reemplazada.has(previa.pre.id!)
      nuevos.push({
        providerId, providerName: nombre, source: opts.fuente, mpPreapprovalId: x.pre.id!, occurredAt: x.primerCobro!,
        dedupeKey: `act:${x.pre.id}`,
        type: i === 0 ? 'activada' : esCambio ? 'cambio_plan' : 'reactivada',
        fromPlan: i === 0 ? 'trial' : esCambio ? previa.plan : 'trial', toPlan: x.plan,
        motivo: 'reconstruido de Mercado Pago (fecha del primer cobro)',
      })
    })
    for (const x of lista) {
      if (x.pre.status !== 'cancelled' && x.pre.status !== 'paused') continue
      const fin = fechaDe(x.pre.last_modified)
      if (!fin) continue
      if (reemplazada.has(x.pre.id!)) {
        nuevos.push({ providerId, providerName: nombre, source: opts.fuente, mpPreapprovalId: x.pre.id!, occurredAt: fin, dedupeKey: `reemp:${x.pre.id}`, type: 'reemplazada', fromPlan: x.plan, motivo: 'reconstruido de Mercado Pago (cambio de plan)' })
        continue
      }
      const esVigente = prov?.mpPreapprovalId === x.pre.id
      if (!x.primerCobro && !esVigente) continue
      nuevos.push({
        providerId, providerName: nombre, source: opts.fuente, mpPreapprovalId: x.pre.id!, occurredAt: fin, dedupeKey: `baja:${x.pre.id}`,
        type: x.pre.status === 'paused' ? 'pausada' : 'cancelada', fromPlan: x.plan, toPlan: 'trial',
        motivo: 'reconstruido de Mercado Pago (fecha de la última modificación de la suscripción)',
      })
    }
  }
  keys.push(...nuevos.map((n) => n.dedupeKey))
  const existentes = new Set(keys.length ? (await db.subscriptionEvent.findMany({ where: { dedupeKey: { in: keys } }, select: { dedupeKey: true } })).map((e) => e.dedupeKey) : [])
  for (const n of nuevos) {
    rep.eventos.push({ type: n.type, providerId: n.providerId, mpPreapprovalId: n.mpPreapprovalId || '', occurredAt: n.occurredAt.toISOString(), nuevo: !existentes.has(n.dedupeKey) })
    if (!opts.dryRun && !existentes.has(n.dedupeKey)) await registrarEventoPlan(n)
  }
}
