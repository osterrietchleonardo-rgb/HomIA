// Tests de Ingresos de HomIA (D30): parseo de los cobros de Mercado Pago, estado de cuenta de cada
// proveedor, MRR, churn/conversión, series y el aviso del webhook (idempotencia y 503).
// Sin red ni base. Correr con:
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/ingresos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cobroDesdeMp, clasificarCuenta, calcularMrr, armarMensual, armarSerie, clavesRango, claveBucket, diasCalendarioAR,
  eventoActivacion, parseReferenciaPlan, procesarAvisoCobro, sumarMes, variacion,
  type CobroMin, type CobroSuscripcionData, type MpAuthorizedPayment, type MpPagoSuscripcion,
} from '../suscripciones-core'

const PRECIOS = { basic: 50000, pro: 100000 }
const D = (s: string) => new Date(s)

// ── fixtures reales ──
// Factura (authorized_payment) de la referencia oficial de MP (GET /authorized_payments/{id}), con la
// referencia de HomIA en lugar de la del ejemplo.
const FACTURA: MpAuthorizedPayment = {
  id: 7032199249, type: 'recurring', status: 'processed', preapproval_id: '2dd2629fe2b04779840031cc784187e7',
  date_created: '2026-09-23T23:19:51.000-04:00', transaction_amount: 50000, currency_id: 'ARS',
  external_reference: 'plan:provider:cmuc7lf410008uuuklsrwb2fg:basic', debit_date: '2026-09-23T23:19:51.000-04:00', retry_attempt: 1,
  payment: { id: 180601708306, status: 'approved', status_detail: 'accredited' },
}
// Pago real del entorno de PRUEBA de la app Suscripciones (23/09/2026), recortado a los campos que se
// leen (sin tarjeta ni pagador).
const PAGO: MpPagoSuscripcion = {
  id: 180601708306, status: 'approved', status_detail: 'accredited',
  external_reference: 'plan:provider:cmuc7lf410008uuuklsrwb2fg:basic',
  transaction_amount: 50000, transaction_amount_refunded: 0, currency_id: 'ARS',
  date_created: '2026-09-23T23:19:51.000-04:00', date_approved: '2026-09-23T23:19:52.000-04:00',
  money_release_date: '2026-10-11T23:19:52.000-04:00',
  fee_details: [{ amount: 2050, fee_payer: 'collector', type: 'mercadopago_fee' }],
  transaction_details: { net_received_amount: 47950 },
  point_of_interaction: { type: 'SUBSCRIPTIONS', transaction_data: { subscription_id: '2dd2629fe2b04779840031cc784187e7', billing_date: '2026-09-23', subscription_sequence: { number: 1 } } },
}

test('referencia del plan: solo el formato de HomIA', () => {
  assert.deepEqual(parseReferenciaPlan('plan:provider:abc123:pro'), { providerId: 'abc123', plan: 'pro' })
  assert.equal(parseReferenciaPlan('purchase:abc'), null)
  assert.equal(parseReferenciaPlan('plan:provider:abc:gold'), null)
  assert.equal(parseReferenciaPlan(null), null)
})

test('cobro de MP → fila: montos, comisión y neto tal como los informa MP', () => {
  const c = cobroDesdeMp(PAGO, FACTURA, 'test')!
  assert.equal(c.providerId, 'cmuc7lf410008uuuklsrwb2fg')
  assert.equal(c.plan, 'basic')
  assert.equal(c.mpPaymentId, '180601708306')
  assert.equal(c.mpAuthorizedPaymentId, '7032199249')
  assert.equal(c.mpPreapprovalId, '2dd2629fe2b04779840031cc784187e7')
  assert.equal(c.mpEnvironment, 'test')
  assert.equal(c.status, 'approved')
  assert.equal(c.amount, 50000)
  assert.equal(c.mpFee, 2050)
  assert.equal(c.netAmount, 47950)
  assert.equal(c.paidAt?.toISOString(), '2026-09-24T03:19:52.000Z')
  assert.equal(c.raw.sequence, 1)
  // nada de tarjeta ni pagador en raw
  assert.ok(!JSON.stringify(c.raw).match(/card|payer|email|identification/i))
})

test('cobro de MP: sin fee_details ni neto → null (no se estiman)', () => {
  const { fee_details: _f, transaction_details: _t, ...sinDatos } = PAGO
  void _f; void _t
  const c = cobroDesdeMp(sinDatos, FACTURA, 'live')!
  assert.equal(c.mpFee, null)
  assert.equal(c.netAmount, null)
})

test('cobro de MP: solo el pago (tópico payment) alcanza, la preapproval sale de subscription_id', () => {
  const c = cobroDesdeMp(PAGO, null, 'live')!
  assert.equal(c.mpPreapprovalId, '2dd2629fe2b04779840031cc784187e7')
  assert.equal(c.mpAuthorizedPaymentId, null)
})

test('cobro de MP ajeno a HomIA → null', () => {
  assert.equal(cobroDesdeMp({ ...PAGO, external_reference: 'purchase:xyz' }, null, 'live'), null)
  assert.equal(cobroDesdeMp({ ...PAGO, id: undefined }, { ...FACTURA, payment: null }, 'live'), null)
})

test('cobro rechazado: guarda estado y motivo', () => {
  const c = cobroDesdeMp({ ...PAGO, status: 'rejected', status_detail: 'cc_rejected_insufficient_amount', date_approved: null, fee_details: [], transaction_details: null }, FACTURA, 'live')!
  assert.equal(c.status, 'rejected')
  assert.equal(c.statusDetail, 'cc_rejected_insufficient_amount')
  assert.equal(c.paidAt, null)
  assert.equal(c.mpFee, 0) // MP mandó fee_details vacío: comisión 0 informada
})

// ── estado de cuenta ──
const AHORA = D('2026-09-25T15:00:00.000Z')
const aprobado = (fecha: string, plan = 'basic', monto = 50000): CobroMin => ({ status: 'approved', amount: monto, attemptedAt: D(fecha), paidAt: D(fecha), plan })
const rechazado = (fecha: string, detalle = 'cc_rejected_insufficient_amount'): CobroMin => ({ status: 'rejected', amount: 50000, attemptedAt: D(fecha), paidAt: null, plan: 'basic', statusDetail: detalle })
const provPago = (plan: 'basic' | 'pro' = 'basic') => ({ subscription: plan, trialEndsAt: D('2026-06-15T00:00:00Z'), createdAt: D('2026-06-01T00:00:00Z'), mpPreapprovalId: 'pre1' })

test('al día: cobro aprobado hace menos de 35 días', () => {
  const c = clasificarCuenta(provPago(), [aprobado('2026-09-10T12:00:00Z')], [], null, PRECIOS, AHORA)
  assert.equal(c.estado, 'al_dia')
  assert.equal(c.pagadoHasta?.toISOString(), '2026-10-10T12:00:00.000Z')
})

test('en deuda: último intento rechazado → desde el rechazo, 1 mes × precio, intentos listados', () => {
  const c = clasificarCuenta(provPago(), [aprobado('2026-08-10T12:00:00Z'), rechazado('2026-09-10T12:00:00Z'), rechazado('2026-09-13T12:00:00Z', 'cc_rejected_other_reason')], [], null, PRECIOS, AHORA)
  assert.equal(c.estado, 'en_deuda')
  assert.equal(c.desde?.toISOString(), '2026-09-10T12:00:00.000Z')
  assert.equal(c.deuda?.meses, 1)
  assert.equal(c.deuda?.monto, 50000)
  assert.equal(c.deuda?.intentosFallidos.length, 2)
  assert.equal(c.deuda?.intentosFallidos[1].motivo, 'cc_rejected_other_reason')
})

test('rechazo seguido de aprobación → al día', () => {
  const c = clasificarCuenta(provPago(), [rechazado('2026-09-10T12:00:00Z'), aprobado('2026-09-12T12:00:00Z')], [], null, PRECIOS, AHORA)
  assert.equal(c.estado, 'al_dia')
})

test('en deuda por falta de cobro: más de 35 días sin cobro aprobado, meses × precio PRO', () => {
  const c = clasificarCuenta(provPago('pro'), [aprobado('2026-07-01T12:00:00Z', 'pro', 100000)], [], null, PRECIOS, AHORA)
  assert.equal(c.estado, 'en_deuda')
  assert.equal(c.desde?.toISOString(), '2026-08-01T12:00:00.000Z') // vencimiento del último cobro
  assert.equal(c.deuda?.meses, 2) // 01/08 → 25/09 = 55 días → 2 meses empezados
  assert.equal(c.deuda?.monto, 200000)
})

test('cambio de plan a mitad de mes: cobros de dos suscripciones → al día en el plan nuevo', () => {
  const c = clasificarCuenta({ ...provPago('pro'), mpPreapprovalId: 'pre2' },
    [aprobado('2026-09-01T12:00:00Z', 'basic', 50000), { ...aprobado('2026-09-15T12:00:00Z', 'pro', 100000), mpPreapprovalId: 'pre2' }], [], null, PRECIOS, AHORA)
  assert.equal(c.estado, 'al_dia')
  assert.equal(c.plan, 'pro')
  assert.equal(c.ultimoCobro?.monto, 100000)
})

test('plan pago sin cobros ni suscripción (alta manual/demo) → sin_cobro con nota honesta', () => {
  const c = clasificarCuenta({ ...provPago('pro'), mpPreapprovalId: null }, [], [], null, PRECIOS, AHORA)
  assert.equal(c.estado, 'sin_cobro')
  assert.match(c.nota || '', /alta manual|demo/)
})

test('prueba que vence hoy → en prueba con 0 días restantes', () => {
  const c = clasificarCuenta({ subscription: 'trial', trialEndsAt: D('2026-09-25T23:00:00Z'), createdAt: D('2026-09-11T23:00:00Z'), mpPreapprovalId: null }, [], [], null, PRECIOS, AHORA)
  assert.equal(c.estado, 'en_prueba')
  assert.equal(c.prueba?.diasRestantes, 0)
})

test('prueba vencida sin plan', () => {
  const c = clasificarCuenta({ subscription: 'trial', trialEndsAt: D('2026-09-20T00:00:00Z'), createdAt: D('2026-09-06T00:00:00Z'), mpPreapprovalId: null }, [], [], null, PRECIOS, AHORA)
  assert.equal(c.estado, 'prueba_vencida')
  assert.equal(c.desde?.toISOString(), '2026-09-20T00:00:00.000Z')
})

test('cancelación con período pago vigente → baja, con fecha, motivo y nota del período vigente', () => {
  const c = clasificarCuenta({ subscription: 'trial', trialEndsAt: new Date(0), createdAt: D('2026-06-01T00:00:00Z'), mpPreapprovalId: 'pre1' },
    [aprobado('2026-09-15T12:00:00Z')], [{ type: 'cancelada', occurredAt: D('2026-09-20T12:00:00Z') }], null, PRECIOS, AHORA)
  assert.equal(c.estado, 'baja')
  assert.equal(c.baja?.motivo, 'cancelada')
  assert.equal(c.baja?.fecha?.toISOString(), '2026-09-20T12:00:00.000Z')
  assert.match(c.nota || '', /vigente/)
})

test('baja sin evento registrado: el motivo sale del estado de la suscripción en MP', () => {
  const pausada = clasificarCuenta({ subscription: 'trial', trialEndsAt: new Date(0), createdAt: D('2026-06-01T00:00:00Z'), mpPreapprovalId: 'pre1' },
    [aprobado('2026-07-01T12:00:00Z')], [], { status: 'paused', lastModified: D('2026-08-05T00:00:00Z') }, PRECIOS, AHORA)
  assert.equal(pausada.baja?.motivo, 'pausada')
  assert.equal(pausada.baja?.fecha?.toISOString(), '2026-08-05T00:00:00.000Z')
  const impago = clasificarCuenta({ subscription: 'trial', trialEndsAt: new Date(0), createdAt: D('2026-06-01T00:00:00Z'), mpPreapprovalId: 'pre1' },
    [aprobado('2026-07-01T12:00:00Z')], [], { status: 'authorized' }, PRECIOS, AHORA)
  assert.equal(impago.baja?.motivo, 'impago')
})

// ── MRR, churn, conversión, series ──
test('MRR: básicos × precio + PRO × precio, solo con suscripción vigente (al día o en deuda)', () => {
  const r = calcularMrr([
    { estado: 'al_dia', plan: 'basic', tieneSuscripcion: true },
    { estado: 'en_deuda', plan: 'pro', tieneSuscripcion: true },
    { estado: 'al_dia', plan: 'pro', tieneSuscripcion: true },
    { estado: 'sin_cobro', plan: 'pro', tieneSuscripcion: false }, // demo: no cuenta
    { estado: 'en_prueba', plan: 'trial', tieneSuscripcion: false },
    { estado: 'baja', plan: 'trial', tieneSuscripcion: true },
  ], PRECIOS)
  assert.deepEqual(r, { basic: 1, pro: 2, mrr: 250000 })
})

test('churn y conversión por mes', () => {
  const m = armarMensual(['2026-08', '2026-09'], {
    cobrosAprobados: [
      { providerId: 'a', paidAt: D('2026-07-10T12:00:00Z') }, { providerId: 'b', paidAt: D('2026-07-20T12:00:00Z') },
      { providerId: 'a', paidAt: D('2026-08-10T12:00:00Z') }, { providerId: 'c', paidAt: D('2026-09-02T12:00:00Z') },
    ],
    bajas: [{ occurredAt: D('2026-08-25T12:00:00Z') }],
    proveedores: [{ id: 'c', createdAt: D('2026-08-20T12:00:00Z') }, { id: 'd', createdAt: D('2026-08-21T12:00:00Z') }],
  })
  assert.equal(m[0].activosInicio, 2) // a y b pagaron en julio
  assert.equal(m[0].bajas, 1)
  assert.equal(m[0].churn, 50)
  assert.equal(m[0].registrados, 2)
  assert.equal(m[0].convertidos, 1)
  assert.equal(m[0].conversion, 50)
  assert.equal(m[1].activosInicio, 1) // solo a pagó en agosto
  assert.equal(m[1].churn, 0)
  assert.equal(m[1].conversion, null) // nadie se registró en septiembre
})

test('series: buckets en hora argentina sin huecos, ingresos netos de reembolsos y neto de movimiento', () => {
  assert.equal(claveBucket(D('2026-09-01T02:00:00Z'), 'dia'), '2026-08-31') // 23 h del 31/08 en Argentina
  assert.equal(claveBucket(D('2026-09-24T12:00:00Z'), 'semana'), '2026-09-21') // lunes
  assert.equal(claveBucket(D('2026-09-24T12:00:00Z'), 'mes'), '2026-09')
  const claves = clavesRango(D('2026-09-20T03:00:00Z'), D('2026-09-23T03:00:00Z'), 'dia')
  assert.deepEqual(claves, ['2026-09-20', '2026-09-21', '2026-09-22'])
  const s = armarSerie(claves, 'dia', {
    cobrosAprobados: [{ paidAt: D('2026-09-21T15:00:00Z'), amount: 50000, refundedAmount: 10000 }],
    cargos: [{ fecha: D('2026-09-21T16:00:00Z'), cargo: 123.45 }],
    altas: [D('2026-09-20T15:00:00Z'), D('2026-09-22T15:00:00Z')],
    primerasPagas: [D('2026-09-21T15:00:00Z')],
    eventos: [{ type: 'cancelada', occurredAt: D('2026-09-22T15:00:00Z') }, { type: 'cambio_plan', occurredAt: D('2026-09-22T16:00:00Z') }],
  })
  assert.equal(s[1].suscripciones, 40000)
  assert.equal(s[1].cargoServicio, 123.45)
  assert.equal(s[1].total, 40123.45)
  assert.equal(s[1].neto, 1)
  assert.equal(s[2].bajas, 1)
  assert.equal(s[2].cambiosPlan, 1)
  assert.equal(s[2].neto, -1)
})

test('utilidades de fecha y variación', () => {
  assert.equal(sumarMes(D('2026-01-31T12:00:00Z')).toISOString(), '2026-02-28T12:00:00.000Z')
  assert.equal(diasCalendarioAR(D('2026-09-25T15:00:00Z'), D('2026-09-26T02:00:00Z')), 0) // 23 h AR del mismo día
  assert.equal(variacion(150, 100), 50)
  assert.equal(variacion(10, 0), null)
})

test('evento de activación: primera, reactivación o cambio de plan', () => {
  assert.equal(eventoActivacion('trial', 'basic', false).type, 'activada')
  assert.equal(eventoActivacion('trial', 'pro', true).type, 'reactivada')
  assert.deepEqual(eventoActivacion('basic', 'pro', false), { type: 'cambio_plan', fromPlan: 'basic', toPlan: 'pro' })
})

// ── aviso del webhook ──
function dobleBase() {
  const filas = new Map<string, CobroSuscripcionData>()
  return {
    filas,
    guardar: async (c: CobroSuscripcionData) => { filas.set(c.mpPaymentId, c) }, // upsert por mpPaymentId
  }
}

test('aviso: dos avisos del mismo cobro → una sola fila (idempotente)', async () => {
  const b = dobleBase()
  const deps = { traerFactura: async () => ({ factura: FACTURA, entorno: 'live' as const }), traerPago: async () => PAGO, guardar: b.guardar }
  const r1 = await procesarAvisoCobro('7032199249', deps)
  const r2 = await procesarAvisoCobro('7032199249', deps)
  assert.equal(r1.status, 200)
  assert.equal(r2.status, 200)
  assert.equal(b.filas.size, 1)
})

test('aviso: si no se pudo guardar → 503 (MP reintenta), nunca 200', async () => {
  const r = await procesarAvisoCobro('1', {
    traerFactura: async () => ({ factura: FACTURA, entorno: 'live' }),
    traerPago: async () => PAGO,
    guardar: async () => { throw new Error('base caída') },
  })
  assert.equal(r.status, 503)
})

test('aviso: MP caído → 503; factura inexistente → 200 ignorado; factura sin pago → 200 sin guardar', async () => {
  const b = dobleBase()
  const caido = await procesarAvisoCobro('1', { traerFactura: async () => { throw new Error('timeout') }, traerPago: async () => PAGO, guardar: b.guardar })
  assert.equal(caido.status, 503)
  const inexistente = await procesarAvisoCobro('1', { traerFactura: async () => null, traerPago: async () => PAGO, guardar: b.guardar })
  assert.deepEqual([inexistente.status, inexistente.body.ignored], [200, true])
  const programada = await procesarAvisoCobro('1', { traerFactura: async () => ({ factura: { ...FACTURA, payment: null }, entorno: 'live' }), traerPago: async () => PAGO, guardar: b.guardar })
  assert.deepEqual([programada.status, programada.body.pendiente], [200, true])
  const pagoCaido = await procesarAvisoCobro('1', { traerFactura: async () => ({ factura: FACTURA, entorno: 'live' }), traerPago: async () => { throw new Error('500') }, guardar: b.guardar })
  assert.equal(pagoCaido.status, 503)
  assert.equal(b.filas.size, 0)
})

// ── D33: plan elegido durante la prueba y baja programada ──
test('plan elegido durante la prueba, sin cobros todavía → en prueba (no "en deuda" ni MRR) con la fecha del primer cobro', () => {
  const c = clasificarCuenta({ subscription: 'basic', trialEndsAt: D('2026-10-09T15:00:00Z'), createdAt: D('2026-09-25T15:00:00Z'), mpPreapprovalId: 'pre1' }, [], [], { status: 'authorized' }, PRECIOS, AHORA)
  assert.equal(c.estado, 'en_prueba')
  assert.equal(c.plan, 'basic')
  assert.match(c.nota || '', /primer cobro es el 09\/10/)
  assert.deepEqual(calcularMrr([{ estado: c.estado, plan: c.plan, tieneSuscripcion: true }], PRECIOS).mrr, 0)
})

test('cancelada con período pago vigente (planPaidUntil) → baja con acceso hasta la fecha, fuera del MRR', () => {
  const c = clasificarCuenta({ subscription: 'basic', trialEndsAt: null, createdAt: D('2026-09-01T00:00:00Z'), mpPreapprovalId: 'pre1', planPaidUntil: D('2026-10-20T12:00:00Z') },
    [aprobado('2026-09-20T12:00:00Z')], [{ type: 'cancelada', occurredAt: D('2026-09-24T12:00:00Z'), motivo: 'cancelada desde HomIA' }], null, PRECIOS, AHORA)
  assert.equal(c.estado, 'baja')
  assert.equal(c.plan, 'basic')
  assert.equal(c.baja?.motivo, 'cancelada')
  assert.equal(c.pagadoHasta?.toISOString(), '2026-10-20T12:00:00.000Z')
  assert.match(c.nota || '', /hasta el 20\/10/)
  assert.equal(calcularMrr([{ estado: c.estado, plan: c.plan, tieneSuscripcion: true }], PRECIOS).mrr, 0)
})

test('eligió un plan y lo canceló antes del primer cobro → sigue en prueba', () => {
  const c = clasificarCuenta({ subscription: 'trial', trialEndsAt: D('2026-10-09T15:00:00Z'), createdAt: D('2026-09-25T15:00:00Z'), mpPreapprovalId: 'pre1' }, [], [{ type: 'cancelada', occurredAt: D('2026-09-25T18:00:00Z') }], null, PRECIOS, AHORA)
  assert.equal(c.estado, 'en_prueba')
  assert.match(c.nota || '', /antes del primer cobro/)
})

test('cobro de suscripción reembolsado: no cuenta como pagando (ni al día ni MRR) — caso Delfi', () => {
  const reemb: CobroMin = { status: 'refunded', amount: 50000, refundedAmount: 50000, attemptedAt: D('2026-09-25T18:48:17Z'), paidAt: D('2026-09-25T18:48:17Z'), plan: 'basic' }
  const c = clasificarCuenta({ subscription: 'trial', trialEndsAt: D('2026-10-09T18:44:34Z'), createdAt: D('2026-09-25T18:44:34Z'), mpPreapprovalId: 'pre1' }, [reemb], [{ type: 'cancelada', occurredAt: D('2026-09-25T20:00:00Z') }], null, PRECIOS, AHORA)
  assert.equal(c.estado, 'en_prueba')
  assert.equal(c.ultimoCobro, null)
  assert.equal(c.pagadoHasta, null)
  // con status approved pero devuelto completo, tampoco
  const c2 = clasificarCuenta(provPago('basic'), [{ ...reemb, status: 'approved' }], [], null, PRECIOS, AHORA)
  assert.notEqual(c2.estado, 'al_dia')
  assert.equal(calcularMrr([{ estado: c.estado, plan: c.plan, tieneSuscripcion: true }], PRECIOS).mrr, 0)
  // la serie de ingresos solo suma cobros aprobados netos de devoluciones
  const serie = armarSerie(['2026-09-25'], 'dia', { cobrosAprobados: [], cargos: [], altas: [], primerasPagas: [], eventos: [] })
  assert.equal(serie[0].suscripciones, 0)
})
