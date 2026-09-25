// Tests del plan del proveedor (D33): estado operativo, baja programada al cancelar, primer cobro
// al elegir un plan durante la prueba y transiciones del webhook/cron. Sin red ni base.
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/plans.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  accionPermitida, mensajePlanInactivo, ACCIONES_NEGOCIO_NUEVO,
  planState, puedeOperar, esProActivo, planTransicion, planVencido, calcularPagadoHasta, inicioPrimerCobro, fechaCortaAR,
} from '../plans'

const D = (s: string) => new Date(s)
const AHORA = D('2026-09-25T20:00:00Z')
const ALTA = D('2026-09-25T15:00:00Z')
const FIN_PRUEBA = D('2026-10-09T15:00:00Z')

// ── estado operativo ──
test('prueba vigente: activo, con días restantes y sin primer cobro', () => {
  const s = planState({ subscription: 'trial', trialEndsAt: FIN_PRUEBA, createdAt: ALTA, planPaidUntil: null }, AHORA)
  assert.equal(s.activo, true)
  assert.equal(s.trialDaysLeft, 14)
  assert.equal(s.primerCobro, null)
  assert.equal(s.cancelado, false)
})

test('plan Básico elegido durante la prueba: activo y primer cobro = fin de la prueba', () => {
  const s = planState({ subscription: 'basic', trialEndsAt: FIN_PRUEBA, createdAt: ALTA, planPaidUntil: null }, AHORA)
  assert.equal(s.activo, true)
  assert.equal(s.plan, 'basic')
  assert.equal(s.primerCobro, FIN_PRUEBA.toISOString())
  assert.match(s.etiqueta, /primer cobro el 09\/10/)
})

test('plan Básico pagado sin prueba vigente: activo, sin primer cobro pendiente', () => {
  const s = planState({ subscription: 'basic', trialEndsAt: new Date(0), createdAt: ALTA, planPaidUntil: null }, AHORA)
  assert.equal(s.activo, true)
  assert.equal(s.primerCobro, null)
  assert.equal(s.etiqueta, 'Plan Básico')
})

test('plan cancelado con período pago vigente: sigue operativo (y el PRO sigue siendo PRO) hasta planPaidUntil', () => {
  const hasta = D('2026-10-25T18:48:17Z')
  const basic = { subscription: 'basic', trialEndsAt: null, createdAt: ALTA, planPaidUntil: hasta }
  const s = planState(basic, AHORA)
  assert.equal(s.activo, true)
  assert.equal(s.cancelado, true)
  assert.equal(s.accesoHasta, hasta.toISOString())
  assert.match(s.etiqueta, /cancelado, sigue hasta el 25\/10/)
  assert.equal(puedeOperar(basic, AHORA), true)
  const pro = { ...basic, subscription: 'pro' }
  assert.equal(esProActivo(pro, AHORA), true)
  // un segundo después del vencimiento ya no opera (aunque el cron todavía no haya corrido)
  const despues = new Date(hasta.getTime() + 1000)
  assert.equal(puedeOperar(basic, despues), false)
  assert.equal(esProActivo(pro, despues), false)
})

test('prueba vencida: no opera', () => {
  assert.equal(puedeOperar({ subscription: 'trial', trialEndsAt: D('2026-09-20T00:00:00Z'), createdAt: ALTA, planPaidUntil: null }, AHORA), false)
})

test('fecha corta en hora de Argentina', () => {
  assert.equal(fechaCortaAR(D('2026-10-26T01:00:00Z')), '25/10') // 22:00 del 25 en Argentina
})

// ── pagado hasta ──
const ok = (paidAt: string, amount = 50000) => ({ status: 'approved', paidAt, amount, refundedAmount: 0 })

test('pagado hasta = último cobro aprobado + 1 mes (25/09 18:48 → 25/10 18:48)', () => {
  const h = calcularPagadoHasta({ cobros: [ok('2026-08-25T18:48:17Z'), ok('2026-09-25T18:48:17Z')] })
  assert.equal(h?.toISOString(), '2026-10-25T18:48:17.000Z')
})

test('pagado hasta: sin cobros en HomIA usa lo que informa MP; sin ningún cobro → null', () => {
  assert.equal(calcularPagadoHasta({ cobros: [], mp: { cobrosMp: 1, ultimoCobroMp: '2026-09-10T12:00:00Z' } })?.toISOString(), '2026-10-10T12:00:00.000Z')
  assert.equal(calcularPagadoHasta({ cobros: [], mp: { cobrosMp: 1, proximoCobroMp: '2026-10-25T18:48:17Z' } })?.toISOString(), '2026-10-25T18:48:17.000Z')
  // suscripción elegida en la prueba, cancelada antes del primer cobro: next_payment_date es el fin de la prueba, NO está pago
  assert.equal(calcularPagadoHasta({ cobros: [], mp: { cobrosMp: 0, proximoCobroMp: FIN_PRUEBA } }), null)
})

test('cobro reembolsado (caso Delfi): no deja período pago, aunque MP siga contándolo en su resumen', () => {
  const reembolsado = { status: 'refunded', paidAt: '2026-09-25T18:48:17Z', amount: 50000, refundedAmount: 50000 }
  const mp = { cobrosMp: 1, ultimoCobroMp: '2026-09-25T18:48:17Z', proximoCobroMp: '2026-10-25T18:48:17Z' }
  assert.equal(calcularPagadoHasta({ cobros: [reembolsado], mp }), null)
  // aprobado pero devuelto completo (por si MP no cambió el status): tampoco vale
  assert.equal(calcularPagadoHasta({ cobros: [{ ...reembolsado, status: 'approved' }], mp }), null)
  // devolución parcial: el cobro sigue valiendo
  assert.equal(calcularPagadoHasta({ cobros: [{ ...reembolsado, status: 'approved', refundedAmount: 10000 }] })?.toISOString(), '2026-10-25T18:48:17.000Z')
  // proveedor activo al que se le reembolsó el último cobro: el período sale del anterior que sí vale
  assert.equal(calcularPagadoHasta({ cobros: [ok('2026-08-25T18:48:17Z'), reembolsado], mp })?.toISOString(), '2026-09-25T18:48:17.000Z')
})

test('activo con su único cobro reembolsado que cancela → sin período vigente: vuelve a la prueba en el acto', () => {
  const hasta = calcularPagadoHasta({ cobros: [{ status: 'refunded', paidAt: '2026-09-25T18:48:17Z', amount: 50000, refundedAmount: 50000 }], mp: { cobrosMp: 1, ultimoCobroMp: '2026-09-25T18:48:17Z' } })
  const t = planTransicion({ subscription: 'basic', mpPreapprovalId: 'pre1', trialEndsAt: D('2026-09-01T00:00:00Z'), createdAt: D('2026-08-18T00:00:00Z'), planPaidUntil: null }, { id: 'pre1', status: 'cancelled' }, 'basic', 'webhook', { pagadoHasta: hasta, ahora: AHORA })
  assert.equal(t.kind, 'degradar')
})

// ── primer cobro de una suscripción nueva ──
test('elegir plan durante la prueba → start_date = fin de la prueba', () => {
  assert.equal(inicioPrimerCobro({ subscription: 'trial', trialEndsAt: FIN_PRUEBA, createdAt: ALTA, planPaidUntil: null }, AHORA)?.toISOString(), FIN_PRUEBA.toISOString())
})

test('prueba vencida o consumida → cobro en el momento (sin start_date)', () => {
  assert.equal(inicioPrimerCobro({ subscription: 'trial', trialEndsAt: D('2026-09-20T00:00:00Z'), createdAt: ALTA, planPaidUntil: null }, AHORA), null)
  assert.equal(inicioPrimerCobro({ subscription: 'trial', trialEndsAt: new Date(0), createdAt: ALTA, planPaidUntil: null }, AHORA), null)
})

test('volver a suscribirse con el plan cancelado y período vigente → start_date = fin de lo pagado', () => {
  const hasta = D('2026-10-25T18:48:17Z')
  assert.equal(inicioPrimerCobro({ subscription: 'basic', trialEndsAt: new Date(0), createdAt: ALTA, planPaidUntil: hasta }, AHORA)?.toISOString(), hasta.toISOString())
})

// ── transiciones ──
const vigente = { subscription: 'basic', mpPreapprovalId: 'pre1', trialEndsAt: new Date(0), createdAt: ALTA, planPaidUntil: null }

test('cancelada con período pago vigente → programar_baja (no degrada) y el aviso dice hasta cuándo', () => {
  const t = planTransicion(vigente, { id: 'pre1', status: 'cancelled' }, 'basic', 'webhook', { pagadoHasta: D('2026-10-25T18:48:17Z'), ahora: AHORA })
  assert.equal(t.kind, 'programar_baja')
  if (t.kind !== 'programar_baja') return
  assert.equal(t.data.planPaidUntil.toISOString(), '2026-10-25T18:48:17.000Z')
  assert.match(t.notificacion.body, /hasta el 25\/10/)
  assert.match(t.notificacion.body, /no se reintegra/)
})

test('cancelada desde HomIA: el título lo dice', () => {
  const t = planTransicion(vigente, { id: 'pre1', status: 'cancelled' }, 'basic', 'webhook', { pagadoHasta: D('2026-10-25T18:48:17Z'), ahora: AHORA, desdeHomia: true })
  assert.equal(t.kind === 'programar_baja' && t.notificacion.title, 'Cancelaste tu suscripción')
})

test('aviso repetido de MP con la baja ya programada → ignorar (idempotente)', () => {
  const t = planTransicion({ ...vigente, planPaidUntil: D('2026-10-25T18:48:17Z') }, { id: 'pre1', status: 'cancelled' }, 'basic', 'webhook', { pagadoHasta: D('2026-10-25T18:48:17Z'), ahora: AHORA })
  assert.equal(t.kind, 'ignorar')
})

test('cancelada sin período pago (elegida en la prueba, antes del primer cobro) → vuelve a la prueba SIN pisar trialEndsAt', () => {
  const t = planTransicion({ ...vigente, trialEndsAt: FIN_PRUEBA }, { id: 'pre1', status: 'cancelled' }, 'basic', 'webhook', { pagadoHasta: null, ahora: AHORA })
  assert.equal(t.kind, 'degradar')
  if (t.kind !== 'degradar') return
  assert.deepEqual(t.data, { subscription: 'trial', proSince: null, planPaidUntil: null })
  assert.ok(!('trialEndsAt' in t.data))
  assert.match(t.notificacion.body, /no se te cobró nada/)
  assert.match(t.notificacion.body, /09\/10/)
})

test('impago → degrada en el acto aunque haya fecha', () => {
  const t = planTransicion(vigente, { id: 'pre1', status: 'authorized' }, 'basic', 'impago', { pagadoHasta: D('2026-10-25T00:00:00Z'), ahora: AHORA })
  assert.equal(t.kind, 'degradar')
})

test('cancelada que no es la vigente → ignorar', () => {
  assert.equal(planTransicion(vigente, { id: 'otra', status: 'cancelled' }, 'basic', 'webhook', { pagadoHasta: null, ahora: AHORA }).kind, 'ignorar')
})

test('activar durante la prueba: no toca trialEndsAt, limpia planPaidUntil y el aviso dice el primer cobro', () => {
  const t = planTransicion({ subscription: 'trial', mpPreapprovalId: null, trialEndsAt: FIN_PRUEBA, createdAt: ALTA, planPaidUntil: null }, { id: 'pre9', status: 'authorized' }, 'basic', 'webhook', { ahora: AHORA })
  assert.equal(t.kind, 'activar')
  if (t.kind !== 'activar') return
  assert.equal(t.data.planPaidUntil, null)
  assert.ok(!('trialEndsAt' in t.data))
  assert.match(t.notificacion?.body || '', /primer cobro de Mercado Pago es el 09\/10/)
})

test('volver a suscribirse al mismo plan con la baja programada → activar (no "ya estaba activa") y no cancela nada en MP', () => {
  const t = planTransicion({ ...vigente, planPaidUntil: D('2026-10-25T18:48:17Z') }, { id: 'pre2', status: 'authorized' }, 'basic', 'webhook', { ahora: AHORA })
  assert.equal(t.kind, 'activar')
  if (t.kind !== 'activar') return
  assert.equal(t.cancelarAnterior, null)
  assert.equal(t.data.planPaidUntil, null)
})

test('cron: plan cancelado vencido → degradar; vigente o sin baja → nada', () => {
  assert.equal(planVencido({ subscription: 'basic', planPaidUntil: D('2026-09-25T19:00:00Z') }, AHORA)?.kind, 'degradar')
  assert.equal(planVencido({ subscription: 'basic', planPaidUntil: D('2026-10-25T19:00:00Z') }, AHORA), null)
  assert.equal(planVencido({ subscription: 'basic', planPaidUntil: null }, AHORA), null)
  assert.equal(planVencido({ subscription: 'trial', planPaidUntil: D('2026-09-01T00:00:00Z') }, AHORA), null)
})

test('baja sin período pago y con la prueba ya terminada → planPaidUntil guarda cuándo terminó (para "tu plan venció el DD/MM")', () => {
  const t = planTransicion(vigente, { id: 'pre1', status: 'cancelled' }, 'basic', 'webhook', { pagadoHasta: D('2026-09-20T12:00:00Z'), ahora: AHORA })
  assert.equal(t.kind, 'degradar')
  if (t.kind !== 'degradar') return
  assert.equal(t.data.planPaidUntil?.toISOString(), '2026-09-20T12:00:00.000Z')
  const v = planVencido({ subscription: 'basic', planPaidUntil: D('2026-09-25T19:00:00Z') }, AHORA)
  assert.equal(v?.data.planPaidUntil?.toISOString(), '2026-09-25T19:00:00.000Z')
})

// ── plan vencido: qué puede seguir haciendo ──
test('estado inactivo: distingue prueba terminada de plan vencido, con la fecha', () => {
  const prueba = planState({ subscription: 'trial', trialEndsAt: D('2026-09-20T15:00:00Z'), createdAt: D('2026-09-06T15:00:00Z'), planPaidUntil: null }, AHORA)
  assert.equal(prueba.motivoInactivo, 'prueba_terminada')
  assert.match(mensajePlanInactivo(prueba), /^Tu prueba gratis terminó el 20\/09/)
  const vencido = planState({ subscription: 'trial', trialEndsAt: D('2026-08-20T15:00:00Z'), createdAt: D('2026-08-06T15:00:00Z'), planPaidUntil: D('2026-09-22T12:00:00Z') }, AHORA)
  assert.equal(vencido.motivoInactivo, 'plan_vencido')
  assert.equal(vencido.etiqueta, 'Plan vencido')
  assert.match(mensajePlanInactivo(vencido), /^Tu plan venció el 22\/09/)
  assert.match(mensajePlanInactivo(vencido), /podés terminar las ventas que ya tenés/)
  // cancelado y vencido, antes de que corra el cron
  const sinCron = planState({ subscription: 'basic', trialEndsAt: null, createdAt: ALTA, planPaidUntil: D('2026-09-25T19:00:00Z') }, AHORA)
  assert.equal(sinCron.activo, false)
  assert.equal(sinCron.motivoInactivo, 'plan_vencido')
  // marca vieja (1970) = tuvo plan
  assert.equal(planState({ subscription: 'trial', trialEndsAt: new Date(0), createdAt: ALTA, planPaidUntil: null }, AHORA).motivoInactivo, 'plan_vencido')
  assert.equal(planState({ subscription: 'basic', trialEndsAt: null, createdAt: ALTA, planPaidUntil: null }, AHORA).motivoInactivo, null)
})

test('con plan vencido: bloquea negocio nuevo y permite cerrar lo que ya existe', () => {
  const inactivo = { activo: false }
  for (const a of ['publicar_stock', 'editar_stock', 'borrar_stock', 'aprobar_reserva', 'marcar_disponible', 'emitir_cobro'] as const) {
    assert.equal(accionPermitida(a, inactivo), false, a)
  }
  for (const a of ['entregar', 'confirmar_efectivo', 'cancelar_pedido', 'rechazar_reserva', 'devolucion'] as const) {
    assert.equal(accionPermitida(a, inactivo), true, a)
  }
  assert.equal(ACCIONES_NEGOCIO_NUEVO.every((a) => accionPermitida(a, { activo: true })), true)
})
