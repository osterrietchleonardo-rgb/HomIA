// Tests del calendario y del acuerdo de fechas (D21). Sin red ni base. Correr con:
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/schedule.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  scheduleTransition, scheduleBlockReason, nextFreeDay, freeThisWeek, mergeRanges, busyRangesOf,
  todayKey, dateToKey, dayToDate, validateRange, type ScheduleState,
} from '../schedule'

const HOY = '2026-09-24' // jueves
const vacio: ScheduleState = { scheduleStatus: null, scheduleProposedBy: null, startDate: null, endDate: null, prevStartDate: null, prevEndDate: null, scheduleNote: null }

test('hoy se calcula en hora argentina (02:00 UTC del 25 = 23:00 del 24 en AR)', () => {
  assert.equal(todayKey(new Date('2026-09-25T02:00:00Z')), '2026-09-24')
  assert.equal(todayKey(new Date('2026-09-25T04:00:00Z')), '2026-09-25')
})

test('el día guardado al mediodía UTC no se corre', () => {
  assert.equal(dayToDate('2026-10-14').toISOString(), '2026-10-14T12:00:00.000Z')
  assert.equal(dateToKey('2026-10-14T12:00:00.000Z'), '2026-10-14')
})

test('validación del rango', () => {
  assert.match(validateRange('2026-09-23', '2026-09-30', HOY)!, /anterior a hoy/)
  assert.match(validateRange('2026-10-10', '2026-10-01', HOY)!, /finalización/)
  assert.equal(validateRange(HOY, HOY, HOY), null)
  assert.match(validateRange('2026-02-30', '2026-03-01', HOY)!, /inválida/)
})

test('solo con presupuesto aprobado', () => {
  assert.ok(scheduleBlockReason({ status: 'activo', stage: 'presupuesto', laborCost: 0, bidAccepted: false }))
  assert.ok(scheduleBlockReason({ status: 'activo', stage: 'presupuesto', laborCost: 1000, bidAccepted: false }))
  assert.equal(scheduleBlockReason({ status: 'activo', stage: 'presupuesto', laborCost: 1000, bidAccepted: true }), null)
  assert.equal(scheduleBlockReason({ status: 'activo', stage: 'materiales', laborCost: 1000, bidAccepted: false }), null)
  assert.ok(scheduleBlockReason({ status: 'cancelado', stage: 'materiales', laborCost: 1000, bidAccepted: false }))
  assert.ok(scheduleBlockReason({ status: 'finalizado', stage: 'finalizado', laborCost: 1000, bidAccepted: false }))
})

test('el profesional propone, el cliente contrapropone y el profesional acepta', () => {
  const r1 = scheduleTransition(vacio, { accion: 'proponer', startDate: '2026-10-01', endDate: '2026-10-05', nota: 'Arranco temprano' }, 'profesional', HOY)
  assert.ok(r1.ok && r1.next.scheduleStatus === 'propuesta' && r1.next.scheduleProposedBy === 'profesional')
  const r2 = scheduleTransition(r1.ok ? r1.next : vacio, { accion: 'proponer', startDate: '2026-10-03', endDate: '2026-10-06' }, 'cliente', HOY)
  assert.ok(r2.ok && r2.evento === 'contrapropuesta' && r2.next.scheduleProposedBy === 'cliente')
  const r3 = scheduleTransition(r2.ok ? r2.next : vacio, { accion: 'aceptar' }, 'profesional', HOY)
  assert.ok(r3.ok && r3.next.scheduleStatus === 'acordada' && r3.next.startDate === '2026-10-03')
})

test('el cliente no propone primero; nadie acepta su propia propuesta', () => {
  const r = scheduleTransition(vacio, { accion: 'proponer', startDate: '2026-10-01', endDate: '2026-10-02' }, 'cliente', HOY)
  assert.ok(!r.ok && r.status === 409)
  const p = scheduleTransition(vacio, { accion: 'proponer', startDate: '2026-10-01', endDate: '2026-10-02' }, 'profesional', HOY)
  assert.ok(p.ok)
  const a = scheduleTransition(p.ok ? p.next : vacio, { accion: 'aceptar' }, 'profesional', HOY)
  assert.ok(!a.ok && a.status === 409)
  assert.ok(!scheduleTransition(vacio, { accion: 'aceptar' }, 'cliente', HOY).ok)
})

test('rechazar deja sin fechas con el motivo; rechazar una reprogramación restaura lo acordado', () => {
  const p = scheduleTransition(vacio, { accion: 'proponer', startDate: '2026-10-01', endDate: '2026-10-02' }, 'profesional', HOY)
  const rj = scheduleTransition(p.ok ? p.next : vacio, { accion: 'rechazar', motivo: 'Esa semana viajo' }, 'cliente', HOY)
  assert.ok(rj.ok && rj.next.scheduleStatus === null && rj.next.startDate === null && rj.next.scheduleNote === 'Esa semana viajo' && rj.next.scheduleProposedBy === 'cliente')

  const acordada: ScheduleState = { ...vacio, scheduleStatus: 'acordada', scheduleProposedBy: 'profesional', startDate: '2026-10-01', endDate: '2026-10-03' }
  const rp = scheduleTransition(acordada, { accion: 'proponer', startDate: '2026-10-10', endDate: '2026-10-12' }, 'cliente', HOY)
  assert.ok(rp.ok && rp.evento === 'reprogramacion' && rp.next.prevStartDate === '2026-10-01')
  // mientras tanto, lo acordado sigue ocupado y lo nuevo figura por confirmar
  const rangos = busyRangesOf(rp.ok ? rp.next : vacio)
  assert.deepEqual(rangos.map((x) => x.estado).sort(), ['ocupado', 'por_confirmar'])
  const back = scheduleTransition(rp.ok ? rp.next : vacio, { accion: 'rechazar' }, 'profesional', HOY)
  assert.ok(back.ok && back.next.scheduleStatus === 'acordada' && back.next.startDate === '2026-10-01' && back.next.prevStartDate === null)
})

test('próxima fecha libre y disponible esta semana', () => {
  const r = [{ start: '2026-09-24', end: '2026-09-27' }, { start: '2026-09-28', end: '2026-10-02' }]
  assert.equal(nextFreeDay(r, HOY), '2026-10-03')
  assert.equal(freeThisWeek(r, HOY), false)
  assert.equal(freeThisWeek([{ start: '2026-09-24', end: '2026-09-25' }], HOY), true)
  assert.equal(nextFreeDay([], HOY), HOY)
})

test('los rangos públicos se unen (no dejan contar proyectos)', () => {
  const m = mergeRanges([
    { start: '2026-10-01', end: '2026-10-03', estado: 'ocupado' },
    { start: '2026-10-02', end: '2026-10-06', estado: 'ocupado' },
    { start: '2026-10-07', end: '2026-10-08', estado: 'ocupado' },
    { start: '2026-10-20', end: '2026-10-21', estado: 'por_confirmar' },
  ])
  assert.deepEqual(m, [
    { start: '2026-10-01', end: '2026-10-08', estado: 'ocupado' },
    { start: '2026-10-20', end: '2026-10-21', estado: 'por_confirmar' },
  ])
})
