// Tests del calendario y del acuerdo de fechas (D21) con franja horaria diaria (D23). Sin red ni base. Correr con:
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/schedule.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  scheduleTransition, scheduleBlockReason, nextDayWithRoom, freeThisWeek, busyRangesOf,
  todayKey, dateToKey, dayToDate, validateRange, validateSlot, slotsOverlap, schedulesCollide,
  dayStatus, dayIntervals, freeSlots, scheduleText, findCollisions, jornadaOf, JORNADA_INICIO, JORNADA_FIN,
  type ScheduleState, type BusyRange,
} from '../schedule'

const HOY = '2026-09-24' // jueves
const vacio: ScheduleState = {
  scheduleStatus: null, scheduleProposedBy: null, startDate: null, endDate: null, prevStartDate: null, prevEndDate: null, scheduleNote: null,
  dailyStart: null, dailyEnd: null, prevDailyStart: null, prevDailyEnd: null,
}

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

test('próximo día con lugar y disponible esta semana (días completos)', () => {
  const r: BusyRange[] = [{ start: '2026-09-24', end: '2026-09-27', estado: 'ocupado' }, { start: '2026-09-28', end: '2026-10-02', estado: 'por_confirmar' }]
  assert.equal(nextDayWithRoom(r, HOY), '2026-10-03')
  assert.equal(freeThisWeek(r, HOY), false)
  assert.equal(freeThisWeek([{ start: '2026-09-24', end: '2026-09-25', estado: 'ocupado' }], HOY), true)
  assert.equal(nextDayWithRoom([], HOY), HOY)
})

// ── Franja horaria diaria (D23) ──
test('validación de la franja: las dos o ninguna, HH:MM de a 15 min y fin > inicio', () => {
  assert.equal(validateSlot(null, null), null)
  assert.equal(validateSlot('07:00', '12:00'), null)
  assert.match(validateSlot('07:00', null)!, /inicio y la de fin/)
  assert.match(validateSlot(null, '12:00')!, /inicio y la de fin/)
  assert.match(validateSlot('7:00', '12:00')!, /HH:MM/)
  assert.match(validateSlot('07:10', '12:00')!, /15 minutos/)
  assert.match(validateSlot('25:00', '26:00')!, /HH:MM/)
  assert.match(validateSlot('12:00', '12:00')!, /posterior/)
  assert.match(validateSlot('14:00', '07:00')!, /posterior/)
})

test('choque de franjas: los ejemplos de Leonardo y los bordes', () => {
  // 07–12 y 14–19 NO chocan; 07–12 y 11–15 SÍ; 12:00 y 12:00 se tocan pero no chocan
  assert.equal(slotsOverlap('07:00', '12:00', '14:00', '19:00'), false)
  assert.equal(slotsOverlap('07:00', '12:00', '11:00', '15:00'), true)
  assert.equal(slotsOverlap('07:00', '12:00', '12:00', '15:00'), false)
  assert.equal(slotsOverlap('12:00', '15:00', '07:00', '12:00'), false)
  assert.equal(slotsOverlap('08:00', '18:00', '09:00', '10:00'), true) // una adentro de la otra
  // día completo (null) choca con todo
  assert.equal(slotsOverlap(null, null, '14:00', '19:00'), true)
  assert.equal(slotsOverlap('06:00', '06:15', null, null), true)
  assert.equal(slotsOverlap(null, null, null, null), true)
})

test('choque de trabajos de varios días: tienen que cruzarse los días Y las franjas', () => {
  const a = { start: '2026-10-01', end: '2026-10-05', dailyStart: '07:00', dailyEnd: '12:00' }
  assert.equal(schedulesCollide(a, { start: '2026-10-03', end: '2026-10-03', dailyStart: '14:00', dailyEnd: '19:00' }), false)
  assert.equal(schedulesCollide(a, { start: '2026-10-05', end: '2026-10-09', dailyStart: '11:00', dailyEnd: '15:00' }), true)
  assert.equal(schedulesCollide(a, { start: '2026-10-06', end: '2026-10-09', dailyStart: '07:00', dailyEnd: '12:00' }), false) // días distintos
  assert.equal(schedulesCollide(a, { start: '2026-09-28', end: '2026-10-01', dailyStart: null, dailyEnd: null }), true) // día completo el 1/10
  // proyecto viejo sin franja (undefined) = día completo
  assert.equal(schedulesCollide({ start: '2026-10-02', end: '2026-10-02' }, { start: '2026-10-02', end: '2026-10-02', dailyStart: '20:00', dailyEnd: '21:00' }), true)
})

test('findCollisions separa lo que bloquea (acordado) de lo que solo avisa (propuesto)', () => {
  const items = [
    { id: 'p1', start: '2026-10-01', end: '2026-10-01', dailyStart: '07:00', dailyEnd: '12:00', estado: 'ocupado' as const },
    { id: 'p2', start: '2026-10-01', end: '2026-10-01', dailyStart: '14:00', dailyEnd: '19:00', estado: 'ocupado' as const },
    { id: 'p3', start: '2026-10-01', end: '2026-10-02', dailyStart: '10:00', dailyEnd: '13:00', estado: 'por_confirmar' as const },
  ]
  const c = findCollisions({ start: '2026-10-01', end: '2026-10-01', dailyStart: '11:00', dailyEnd: '15:00' }, items)
  assert.deepEqual(c.bloquean.map((x) => x.id), ['p1', 'p2'])
  assert.deepEqual(c.avisan.map((x) => x.id), ['p3'])
  const libre = findCollisions({ start: '2026-10-01', end: '2026-10-01', dailyStart: '12:00', dailyEnd: '14:00' }, items)
  assert.deepEqual(libre.bloquean, [])
  assert.deepEqual(libre.avisan.map((x) => x.id), ['p3'])
})

test('estado del día contra la jornada de referencia por defecto 06:00–18:00', () => {
  assert.equal(JORNADA_INICIO, '06:00')
  assert.equal(JORNADA_FIN, '18:00')
  const d = '2026-10-01'
  const r = (ds: string | null, de: string | null, estado: 'ocupado' | 'por_confirmar' = 'ocupado'): BusyRange => ({ start: d, end: d, dailyStart: ds, dailyEnd: de, estado })
  assert.equal(dayStatus(d, []), 'libre')
  assert.equal(dayStatus(d, [r('07:00', '12:00')]), 'con_lugar')
  assert.equal(dayStatus(d, [r('07:00', '12:00'), r('14:00', '19:00')]), 'con_lugar') // quedan 06–07 y 12–14
  assert.equal(dayStatus(d, [r('07:00', '12:00'), r('12:00', '19:00')]), 'con_lugar') // queda 06–07
  assert.equal(dayStatus(d, [r('06:00', '12:00'), r('12:00', '19:00')]), 'completo') // se tocan: cubren 6–18
  assert.equal(dayStatus(d, [r('06:00', '18:00')]), 'completo')
  assert.equal(dayStatus(d, [r(null, null)]), 'completo') // día completo
  assert.equal(dayStatus(d, [r('06:00', '12:00'), r('12:00', '19:00', 'por_confirmar')]), 'completo') // conservador: lo propuesto también cuenta
  assert.equal(dayStatus(d, [r('19:00', '21:00')]), 'con_lugar') // fuera de la jornada: sigue con lugar
  assert.equal(dayStatus('2026-10-02', [r('06:00', '18:00')]), 'libre')
})

test('jornada personalizada del profesional (08:00–13:00)', () => {
  const d = '2026-10-01'
  const j = { desde: '08:00', hasta: '13:00' }
  const r = (ds: string | null, de: string | null): BusyRange => ({ start: d, end: d, dailyStart: ds, dailyEnd: de, estado: 'ocupado' })
  assert.equal(dayStatus(d, [r('08:00', '13:00')], j), 'completo') // con su jornada, un trabajo de 8 a 13 llena el día
  assert.equal(dayStatus(d, [r('08:00', '13:00')]), 'con_lugar') // con la de referencia (6–18) no
  assert.equal(dayStatus(d, [r('14:00', '19:00')], j), 'con_lugar') // trabajo fuera de su jornada: cuenta como trabajo pero no la llena
  assert.equal(nextDayWithRoom([{ start: HOY, end: '2026-09-25', dailyStart: '07:00', dailyEnd: '14:00', estado: 'ocupado' }], HOY, 30, j), '2026-09-26')
  assert.equal(freeThisWeek([{ start: HOY, end: '2026-09-27', dailyStart: '08:00', dailyEnd: '13:00', estado: 'ocupado' }], HOY, j), false)
  assert.deepEqual(freeSlots(dayIntervals(d, [r('09:00', '10:00')]), j.desde, j.hasta), [{ desde: '08:00', hasta: '09:00' }, { desde: '10:00', hasta: '13:00' }])
})

test('jornada: validación y valor por defecto', () => {
  assert.deepEqual(jornadaOf(null, null), { desde: '06:00', hasta: '18:00' })
  assert.deepEqual(jornadaOf('08:00', '13:00'), { desde: '08:00', hasta: '13:00' })
  assert.deepEqual(jornadaOf('13:00', '08:00'), { desde: '06:00', hasta: '18:00' }) // dato roto → por defecto
  assert.equal(validateSlot('08:00', '13:00'), null)
})

test('franjas del día unidas (no dejan contar trabajos) y huecos libres', () => {
  const d = '2026-10-01'
  const rs: BusyRange[] = [
    { start: d, end: d, dailyStart: '07:00', dailyEnd: '10:00', estado: 'ocupado' },
    { start: '2026-09-30', end: '2026-10-03', dailyStart: '10:00', dailyEnd: '12:00', estado: 'ocupado' },
    { start: d, end: d, dailyStart: '14:00', dailyEnd: '19:00', estado: 'por_confirmar' },
  ]
  assert.deepEqual(dayIntervals(d, rs), [
    { desde: '07:00', hasta: '12:00', estado: 'ocupado' },
    { desde: '14:00', hasta: '19:00', estado: 'por_confirmar' },
  ])
  assert.deepEqual(freeSlots(dayIntervals(d, rs), '06:00', '22:00'), [
    { desde: '06:00', hasta: '07:00' }, { desde: '12:00', hasta: '14:00' }, { desde: '19:00', hasta: '22:00' },
  ])
  assert.deepEqual(freeSlots(dayIntervals(d, rs), JORNADA_INICIO, JORNADA_FIN), [{ desde: '06:00', hasta: '07:00' }, { desde: '12:00', hasta: '14:00' }])
  // día completo → 00:00–24:00 y sin huecos
  const full = dayIntervals(d, [{ start: d, end: d, estado: 'ocupado' }])
  assert.deepEqual(full, [{ desde: '00:00', hasta: '24:00', estado: 'ocupado' }])
  assert.deepEqual(freeSlots(full, '06:00', '22:00'), [])
})

test('próximo día con lugar salta los días completos (no los que tienen una franja)', () => {
  const rs: BusyRange[] = [
    { start: '2026-09-24', end: '2026-09-26', estado: 'ocupado' }, // completos
    { start: '2026-09-27', end: '2026-09-27', dailyStart: '07:00', dailyEnd: '12:00', estado: 'ocupado' }, // con lugar
  ]
  assert.equal(nextDayWithRoom(rs, HOY), '2026-09-27')
  const lleno: BusyRange[] = [
    { start: '2026-09-24', end: '2026-09-24', dailyStart: '05:00', dailyEnd: '12:00', estado: 'ocupado' },
    { start: '2026-09-24', end: '2026-09-24', dailyStart: '12:00', dailyEnd: '18:00', estado: 'por_confirmar' },
  ]
  assert.equal(nextDayWithRoom(lleno, HOY), '2026-09-25')
})

test('la propuesta con franja viaja por la máquina de estados y la reprogramación la restaura', () => {
  const p = scheduleTransition(vacio, { accion: 'proponer', startDate: '2026-10-01', endDate: '2026-10-03', dailyStart: '07:00', dailyEnd: '12:00' }, 'profesional', HOY)
  assert.ok(p.ok && p.next.dailyStart === '07:00' && p.next.dailyEnd === '12:00')
  const bad = scheduleTransition(vacio, { accion: 'proponer', startDate: '2026-10-01', endDate: '2026-10-03', dailyStart: '07:00', dailyEnd: null }, 'profesional', HOY)
  assert.ok(!bad.ok && bad.status === 400)
  const acordada: ScheduleState = { ...vacio, scheduleStatus: 'acordada', scheduleProposedBy: 'profesional', startDate: '2026-10-01', endDate: '2026-10-03', dailyStart: '07:00', dailyEnd: '12:00' }
  // reprogramar a todo el día: la franja vieja queda en prev*
  const rp = scheduleTransition(acordada, { accion: 'proponer', startDate: '2026-10-05', endDate: '2026-10-05' }, 'cliente', HOY)
  assert.ok(rp.ok && rp.next.dailyStart === null && rp.next.prevDailyStart === '07:00' && rp.next.prevDailyEnd === '12:00')
  const rangos = busyRangesOf(rp.ok ? rp.next : vacio)
  assert.ok(rangos.some((x) => x.estado === 'ocupado' && x.dailyStart === '07:00'))
  const back = scheduleTransition(rp.ok ? rp.next : vacio, { accion: 'rechazar' }, 'profesional', HOY)
  assert.ok(back.ok && back.next.startDate === '2026-10-01' && back.next.dailyStart === '07:00' && back.next.dailyEnd === '12:00' && back.next.prevDailyStart === null)
  const acc = scheduleTransition(rp.ok ? rp.next : vacio, { accion: 'aceptar' }, 'profesional', HOY)
  assert.ok(acc.ok && acc.next.dailyStart === null && acc.next.prevDailyStart === null)
})

test('texto de las fechas con el horario', () => {
  assert.equal(scheduleText('2026-10-03', '2026-10-05', '07:00', '12:00'), 'del 03/10 al 05/10, de 07:00 a 12:00 cada día')
  assert.equal(scheduleText('2026-10-03', '2026-10-03', '14:00', '19:00'), 'el 03/10, de 14:00 a 19:00')
  assert.equal(scheduleText('2026-10-03', '2026-10-05', null, null), 'del 03/10 al 05/10, todo el día')
  assert.equal(scheduleText('2026-10-03', '2026-10-03', null, null), 'el 03/10, todo el día')
})
