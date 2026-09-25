// Tests de Finanzas (D24): casos hechos a mano. Sin red ni base. Correr con:
//   node --test --import ./scripts/homy-test-alias.mjs src/lib/finanzas/__tests__/calculos.test.ts
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  resultados, flujo, cajaAl, balance, reporte, periodo, expandir, cuotasAmortizacion, claveMes, inicioMes, div, variacion,
  movimientosDelPeriodo,
  type EntradaFinanzas, type Movimiento, type VentaAuto,
} from '../calculos'
import { CATEGORIAS, TIPOS, TIPOS_MOVIMIENTO, categoriasDe, GLOSARIO } from '../conceptos'

// "hoy" = 25/09/2026 15:00 hora argentina
const HOY = new Date('2026-09-25T18:00:00Z')
const d = (s: string) => new Date(`${s}T15:00:00Z`) // mediodía argentino de ese día
const SEP = periodo('mes', HOY)

function base(over: Partial<EntradaFinanzas> = {}): EntradaFinanzas {
  return {
    rol: 'profesional', hoy: HOY, config: { saldoInicial: null, fechaSaldoInicial: null, costoEstimadoPct: null },
    ventas: [], devoluciones: [], costosAuto: [], movimientos: [], stock: [], ofertas: [], obras: [], ...over,
  }
}
let n = 0
function mov(p: Partial<Movimiento> & Pick<Movimiento, 'type' | 'amount'>): Movimiento {
  return { id: `m${++n}`, category: 'otros_gastos', description: 'x', date: d('2026-09-10'), status: 'pagado', ...p }
}
function factura(id: string, total: number, emitida: string, cobrada: string | null, extra: Partial<VentaAuto> = {}): VentaAuto {
  return { id, kind: 'factura', numero: id, descripcion: id, total, manoObra: total, materiales: 0, emitida: d(emitida), cobradaEn: cobrada ? d(cobrada) : null, clienteId: `c-${id}`, projectId: `p-${id}`, link: '#', ...extra }
}

// ─── Plomero con 3 obras ───
// Obra A: factura 500.000 (350.000 mano de obra + 150.000 materiales), emitida 05/09, cobrada 12/09.
// Obra B: factura 300.000, emitida 15/09, sin cobrar.
// Obra C: factura 200.000, emitida 20/08 (mes anterior), cobrada 02/09.
// Costos de septiembre: materiales comprados en HomIA para A 120.000 (pagados 03/09);
// ayudante para B 60.000 (manual, asignado a B); celular 20.000 (gasto mensual desde julio);
// nafta 40.000; inversión termofusora 360.000 a 36 meses el 01/09; retiro 150.000.
function plomero(): EntradaFinanzas {
  return base({
    config: { saldoInicial: 100000, fechaSaldoInicial: d('2026-07-01'), costoEstimadoPct: null },
    ventas: [
      factura('A', 500000, '2026-09-05', '2026-09-12', { manoObra: 350000, materiales: 150000, clienteId: 'c1' }),
      factura('B', 300000, '2026-09-15', null, { clienteId: 'c2' }),
      factura('C', 200000, '2026-08-20', '2026-09-02', { clienteId: 'c1' }),
    ],
    costosAuto: [{ id: 'k1', kind: 'compra_homia', monto: 120000, fecha: d('2026-09-03'), pagadoEn: d('2026-09-03'), descripcion: 'caños', link: '#', projectId: 'p-A', personal: false }],
    movimientos: [
      mov({ type: 'costo_directo', category: 'ayudantes', amount: 60000, date: d('2026-09-16'), projectId: 'p-B' }),
      mov({ type: 'gasto', category: 'internet_celular', amount: 20000, date: d('2026-07-08'), recurring: 'mensual' }),
      mov({ type: 'gasto', category: 'combustible', amount: 40000, date: d('2026-09-18') }),
      mov({ type: 'inversion', category: 'herramientas_electricas', amount: 360000, date: d('2026-09-01'), usefulLifeMonths: 36 }),
      mov({ type: 'retiro', category: 'retiro_dueno', amount: 150000, date: d('2026-09-19') }),
    ],
    obras: [{ id: 'p-A', title: 'Obra A' }, { id: 'p-B', title: 'Obra B' }, { id: 'p-C', title: 'Obra C' }],
  })
}

test('plomero: estado de resultados de septiembre, renglón por renglón', () => {
  const R = resultados(plomero(), SEP.desde, SEP.hasta)
  assert.equal(R.ventasHomia, 800000) // A + B (C es de agosto)
  assert.equal(R.manoObra, 650000)
  assert.equal(R.materialesFacturados, 150000)
  assert.equal(R.ventasNetas, 800000)
  assert.equal(R.costoDirecto, 180000) // 120.000 HomIA + 60.000 ayudante
  assert.equal(R.margenBruto, 620000)
  assert.equal(R.margenBrutoPct, 77.5)
  assert.equal(R.gastos, 60000) // celular del mes (recurrente) + nafta
  assert.equal(R.resultadoOperativo, 560000)
  assert.equal(R.amortizaciones, 10000) // 360.000 / 36
  assert.equal(R.intereses, 0)
  assert.equal(R.resultadoNeto, 550000)
  assert.equal(R.margenNetoPct, 68.75)
  assert.equal(R.retiros, 150000) // se informa aparte…
  assert.equal(R.cantidadVentas, 2)
})

test('retiros NO son gasto: sacarlos no cambia el resultado', () => {
  const e = plomero()
  const sin = { ...e, movimientos: e.movimientos.filter((m) => m.type !== 'retiro') }
  assert.equal(resultados(sin, SEP.desde, SEP.hasta).resultadoNeto, resultados(e, SEP.desde, SEP.hasta).resultadoNeto)
  // …pero sí bajan la caja
  assert.equal(flujo(e, SEP.desde, SEP.hasta).salidas - flujo(sin, SEP.desde, SEP.hasta).salidas, 150000)
})

test('plomero: caja de septiembre (cobrado y pagado, no facturado)', () => {
  const f = flujo(plomero(), SEP.desde, SEP.hasta)
  // entra: A (500.000, cobrada 12/09) + C (200.000, cobrada 02/09); B no se cobró
  assert.equal(f.entradas, 700000)
  // sale: compra HomIA 120.000 + ayudante 60.000 + celular 20.000 + nafta 40.000 + termofusora 360.000 entera + retiro 150.000
  assert.equal(f.salidas, 750000)
  // caja al 1/9: 100.000 inicial − celular de julio y agosto (40.000)
  assert.equal(cajaAl(plomero(), SEP.desde).saldo, 60000)
})

test('caja: inicio + entró − salió = final aunque el saldo inicial sea de mitad del período', () => {
  // saldo inicial cargado al cierre del 20/09 (en medio de septiembre)
  const e = { ...plomero(), config: { saldoInicial: 500000, fechaSaldoInicial: new Date('2026-09-21T02:59:59.999Z'), costoEstimadoPct: null } }
  const r = reporte(e, SEP)
  assert.equal(Math.round((r.caja.saldoInicialPeriodo + r.caja.entradas - r.caja.salidas) * 100) / 100, r.caja.saldoFinal)
  // lo de después del 20/09 (nada en este caso) mueve el final; lo de antes ya estaba adentro del saldo
  assert.equal(r.caja.saldoFinal, 500000)
})

test('rentabilidad por obra: facturado − costos asignados', () => {
  const r = reporte(plomero(), SEP)
  const A = r.obras.find((o) => o.id === 'p-A')!
  const B = r.obras.find((o) => o.id === 'p-B')!
  assert.equal(A.ganancia, 380000)
  assert.equal(A.margenPct, 76)
  assert.equal(B.ganancia, 240000)
  assert.equal(B.margenPct, 80)
  assert.equal(r.obras[0].id, 'p-C') // C sin costos: 100%, primera del ranking
})

test('días de cobro, cuentas vencidas y clientes recurrentes', () => {
  const r = reporte(plomero(), SEP)
  const m = Object.fromEntries(r.metricas.map((x) => [x.id, x]))
  // cobradas en septiembre: A (7 días) y C (13 días) → 10
  assert.equal(m.dias_cobro.valor, 10)
  // B emitida el 15/09: 10 días → todavía no está vencida (> 15 días)
  assert.equal(m.cuentas_cobrar.valor, 0)
  // c1 compró 2 veces (C en agosto y A en septiembre), c2 una: 1 de 2
  assert.equal(m.clientes_recurrentes.valor, 50)
})

test('punto de equilibrio = costos fijos ÷ margen bruto %', () => {
  const r = reporte(plomero(), SEP)
  const pe = r.metricas.find((x) => x.id === 'punto_equilibrio')!
  // (60.000 gastos + 10.000 amortización) ÷ 0,775
  assert.equal(pe.valor, Math.round((70000 / 0.775) * 100) / 100)
})

test('recurrentes: se proyectan cada mes hasta hoy y se terminan', () => {
  const m = mov({ type: 'gasto', amount: 1000, date: d('2026-01-31'), recurring: 'mensual' })
  const ocs = expandir([m], new Date('2027-01-01T03:00:00Z'), HOY)
  // el de septiembre cae el 30/09 y hoy es 25/09: todavía no pasó, no se cuenta
  assert.deepEqual(ocs.map((o) => claveMes(o.date)), ['2026-01', '2026-02', '2026-03', '2026-04', '2026-05', '2026-06', '2026-07', '2026-08'])
  // 31 de enero → 28 de febrero (último día)
  assert.equal(ocs[1].date.toISOString().slice(0, 10), '2026-02-28')
  // nunca se proyecta el futuro (octubre no está)
  const fin = expandir([{ ...m, recurringUntil: d('2026-04-30') }], new Date('2027-01-01T03:00:00Z'), HOY)
  assert.equal(fin.length, 4) // enero a abril (el de abril cae el 30, el día del fin)
  const fin2 = expandir([{ ...m, recurringUntil: d('2026-04-15') }], new Date('2027-01-01T03:00:00Z'), HOY)
  assert.equal(fin2.length, 3) // terminado el 15/04: el del 30/04 ya no corre
})

test('amortización: cuotas iguales durante la vida útil, primer mes en la fecha de compra', () => {
  const inv = mov({ type: 'inversion', amount: 120000, date: d('2026-03-20'), usefulLifeMonths: 12 })
  const c = cuotasAmortizacion(inv)
  assert.equal(c.length, 12)
  assert.ok(c.every((x) => x.monto === 10000))
  assert.equal(claveMes(c[11].fecha), '2027-02')
  // en el resultado del año solo cuentan las cuotas hasta hoy (mar–sep = 7)
  const e = base({ movimientos: [inv] })
  const anio = periodo('anio', HOY)
  assert.equal(resultados(e, anio.desde, anio.hasta).amortizaciones, 70000)
  // en caja sale entera el mes que se pagó
  assert.equal(flujo(e, inicioMes('2026-03'), inicioMes('2026-04')).salidas, 120000)
})

test('a la madrugada, lo cargado "hoy" (guardado al mediodía) ya cuenta en amortización, balance y caja', () => {
  // bug real de la E2E (25/09 a las 02:50): la inversión de hoy no amortizaba ni aparecía en el balance
  const madrugada = new Date('2026-09-25T05:50:00Z') // 02:50 hora argentina
  const e = base({
    hoy: madrugada,
    config: { saldoInicial: 200000, fechaSaldoInicial: new Date('2026-09-26T02:59:59.999Z'), costoEstimadoPct: null }, // al cierre de hoy
    movimientos: [
      mov({ type: 'inversion', amount: 360000, date: d('2026-09-25'), usefulLifeMonths: 36 }),
      mov({ type: 'prestamo', amount: 1000000, date: d('2026-09-25') }),
    ],
  })
  const p = periodo('mes', madrugada)
  assert.equal(resultados(e, p.desde, p.hasta).amortizaciones, 10000)
  const B = reporte(e, p).balance
  assert.equal(B.bienesDeUso, 350000)
  assert.equal(B.prestamos, 1000000)
  // el saldo inicial es al cierre de hoy: lo de hoy ya está adentro
  assert.equal(reporte(e, p).caja.saldoFinal, 200000)
})

test('préstamo: entra a caja, es deuda; en la cuota solo el interés es gasto', () => {
  const e = base({
    config: { saldoInicial: 0, fechaSaldoInicial: d('2026-08-01'), costoEstimadoPct: null },
    movimientos: [
      mov({ type: 'prestamo', category: 'prestamo_banco', amount: 1000000, date: d('2026-08-05') }),
      mov({ type: 'pago_prestamo', category: 'cuota_prestamo', amount: 110000, interestAmount: 30000, date: d('2026-09-05') }),
    ],
  })
  const R = resultados(e, SEP.desde, SEP.hasta)
  assert.equal(R.intereses, 30000)
  assert.equal(R.resultadoNeto, -30000)
  assert.equal(R.ventasNetas, 0) // el préstamo no es venta
  const B = balance(e, HOY)
  assert.equal(B.caja, 890000)
  assert.equal(B.prestamos, 920000) // 1.000.000 − 80.000 de capital
})

test('devoluciones restan ventas en el mes del reembolso; reintegros bajan el costo', () => {
  const e = base({
    ventas: [factura('A', 500000, '2026-08-10', '2026-08-12')],
    devoluciones: [
      { id: 'r1', kind: 'venta', monto: 30000, fecha: d('2026-09-03'), descripcion: 'sobrantes', link: '#', projectId: 'p-A' },
      { id: 'r2', kind: 'reintegro', monto: 12000, fecha: d('2026-09-04'), descripcion: 'me devolvieron', link: '#', projectId: null },
    ],
  })
  const Rsep = resultados(e, SEP.desde, SEP.hasta)
  assert.equal(Rsep.devoluciones, 30000)
  assert.equal(Rsep.ventasNetas, -30000)
  assert.equal(Rsep.costoDirecto, -12000)
  const Rago = resultados(e, inicioMes('2026-08'), SEP.desde)
  assert.equal(Rago.devoluciones, 0)
})

test('balance cierra: activos − pasivos = patrimonio = aportes − retiros + saldo inicial + resultado acumulado', () => {
  const e = base({
    config: { saldoInicial: 100000, fechaSaldoInicial: d('2026-06-01'), costoEstimadoPct: null },
    ventas: [factura('A', 500000, '2026-06-10', null)],
    movimientos: [
      mov({ type: 'gasto', amount: 50000, date: d('2026-06-11') }),
      mov({ type: 'gasto', amount: 20000, date: d('2026-06-12'), status: 'pendiente' }),
      mov({ type: 'inversion', amount: 360000, date: d('2026-06-15'), usefulLifeMonths: 36 }),
      mov({ type: 'prestamo', amount: 1000000, date: d('2026-06-16') }),
      mov({ type: 'pago_prestamo', amount: 110000, interestAmount: 30000, date: d('2026-07-16') }),
      mov({ type: 'retiro', amount: 150000, date: d('2026-07-17') }),
      mov({ type: 'aporte', amount: 300000, date: d('2026-07-18') }),
    ],
  })
  const B = balance(e, HOY)
  assert.equal(B.caja, 730000)
  assert.equal(B.cuentasPorCobrar, 500000)
  assert.equal(B.bienesDeUso, 320000) // 360.000 − 4 cuotas de 10.000 (jun–sep)
  assert.equal(B.pasivos, 940000) // 920.000 préstamo + 20.000 a pagar
  assert.equal(Math.round((B.activos - B.pasivos) * 100) / 100, B.patrimonio)
  const acumulado = resultados(e, d('2026-06-01'), new Date(HOY.getTime() + 1)).resultadoNeto
  assert.equal(B.patrimonio, 100000 + 300000 - 150000 + acumulado)
})

test('ferretería: costo de lo vendido con costo cargado, estimado declarado o sin dato', () => {
  const venta: VentaAuto = {
    id: 'v1', kind: 'cobro', numero: 'PRV-1', descripcion: 'cemento y cal', total: 130000, emitida: d('2026-09-08'), cobradaEn: d('2026-09-08'),
    clienteId: 'c1', projectId: null, link: '#',
    lineas: [
      { elementId: 'cemento', nombre: 'Cemento', cantidad: 10, precioUnitario: 11000 },
      { elementId: 'cal', nombre: 'Cal', cantidad: 4, precioUnitario: 5000 },
    ],
  }
  const stock = [
    { id: 's1', elementId: 'cemento', nombre: 'Cemento', cantidad: 40, precio: 11000, costo: 9000 },
    { id: 's2', elementId: 'cal', nombre: 'Cal', cantidad: 20, precio: 5000, costo: null },
  ]
  const sinEst = base({ rol: 'proveedor', ventas: [venta], stock })
  const R1 = resultados(sinEst, SEP.desde, SEP.hasta)
  assert.equal(R1.mercaderia.conocido, 90000)
  assert.equal(R1.mercaderia.ventasSinCosto, 20000) // la cal no tiene costo: se avisa, no se inventa
  assert.equal(R1.costoDirecto, 90000)
  const conEst = base({ rol: 'proveedor', ventas: [venta], stock, config: { saldoInicial: null, fechaSaldoInicial: null, costoEstimadoPct: 70 } })
  const R2 = resultados(conEst, SEP.desde, SEP.hasta)
  assert.equal(R2.mercaderia.estimado, 14000) // 70% de 20.000, marcado como estimación
  assert.equal(R2.costoDirecto, 104000)
  // la compra de mercadería baja la caja pero no el resultado (va al stock)
  const conCompra = { ...sinEst, movimientos: [mov({ type: 'compra_mercaderia', category: 'mercaderia', amount: 450000, date: d('2026-09-02') })] }
  assert.equal(resultados(conCompra, SEP.desde, SEP.hasta).resultadoNeto, R1.resultadoNeto)
  assert.equal(flujo(conCompra, SEP.desde, SEP.hasta).salidas, 450000)
  // inventario al costo: 40 × 9.000; la cal sin costo queda "sin dato"
  const B = balance(sinEst, HOY)
  assert.equal(B.inventario, 360000)
  assert.equal(B.productosSinCosto, 1)
  // ventas de mostrador (por fuera): sin margen declarado quedan "sin costo" (se avisa); con margen, estimadas
  const mostrador = mov({ type: 'otro_ingreso', category: 'ventas_fuera', amount: 100000, date: d('2026-09-09') })
  const Rm1 = resultados({ ...sinEst, movimientos: [mostrador] }, SEP.desde, SEP.hasta)
  assert.equal(Rm1.mercaderia.fueraSinCosto, 100000)
  assert.equal(Rm1.costoDirecto, 90000)
  const Rm2 = resultados({ ...conEst, movimientos: [mostrador] }, SEP.desde, SEP.hasta)
  assert.equal(Rm2.mercaderia.fueraEstimado, 70000)
  assert.equal(Rm2.costoDirecto, 104000 + 70000)
  const r = reporte(conEst, SEP)
  assert.equal(r.productos[0].elementId, 'cemento')
  assert.equal(r.productos[0].ganancia, 20000)
  assert.ok(r.recomendaciones.every((x) => x.id !== 'costos_stock'))
  assert.ok(reporte(sinEst, SEP).recomendaciones.some((x) => x.id === 'costos_stock'))
})

test('bordes: sin datos no hay NaN ni Infinity, todo lo que no se puede calcular es "sin dato"', () => {
  const r = reporte(base(), SEP)
  const txt = JSON.stringify(r)
  assert.ok(!/NaN|Infinity/.test(txt), 'hay NaN o Infinity en el reporte vacío')
  const m = Object.fromEntries(r.metricas.map((x) => [x.id, x]))
  for (const id of ['margen_bruto', 'resultado_neto', 'punto_equilibrio', 'ticket_promedio', 'dias_cobro', 'meses_supervivencia', 'crecimiento', 'tasa_aceptacion']) {
    assert.equal(m[id].valor, null, id)
    assert.ok(m[id].sinDato, `${id} sin explicación`)
  }
  assert.equal(div(1, 0), null)
  assert.equal(variacion(10, 0), null)
  assert.equal(r.balance.patrimonio, 0)
  assert.ok(r.recomendaciones.some((x) => x.id === 'saldo_inicial'))
})

test('sin gastos cargados → la recomendación lo dice con el dato', () => {
  const e = base({ ventas: [factura('A', 500000, '2026-09-05', null)] })
  const rec = reporte(e, SEP).recomendaciones.find((x) => x.id === 'sin_gastos')
  assert.ok(rec)
  assert.match(rec!.dato, /500\.000/)
})

test('compras marcadas "no es del negocio" no cuentan', () => {
  const e = base({ costosAuto: [{ id: 'k', kind: 'compra_homia', monto: 50000, fecha: d('2026-09-03'), pagadoEn: d('2026-09-03'), descripcion: 'x', link: '#', projectId: null, personal: true }] })
  assert.equal(resultados(e, SEP.desde, SEP.hasta).costoDirecto, 0)
  assert.equal(flujo(e, SEP.desde, SEP.hasta).salidas, 0)
})

test('lista de movimientos del período: automáticos y manuales, recurrentes proyectados', () => {
  const lista = movimientosDelPeriodo(plomero(), SEP.desde, SEP.hasta)
  assert.ok(lista.some((x) => x.id === 'factura:C' && x.cobradaEn)) // emitida en agosto, cobrada en septiembre
  const celu = lista.filter((x) => x.categoria === 'internet_celular')
  assert.equal(celu.length, 1)
  assert.equal(celu[0].proyectado, true)
})

test('períodos: mes, mes anterior, 3 meses y rango con el período anterior de igual largo', () => {
  assert.equal(SEP.desde.toISOString(), '2026-09-01T03:00:00.000Z')
  assert.equal(SEP.prevDesde.toISOString(), '2026-08-01T03:00:00.000Z')
  const t = periodo('3m', HOY)
  assert.equal(claveMes(t.desde), '2026-07')
  assert.equal(claveMes(t.prevDesde), '2026-04')
  const r = periodo('rango', HOY, { desde: '2026-09-01', hasta: '2026-09-10' })
  assert.equal((r.hasta.getTime() - r.desde.getTime()) / 86400000, 10)
  assert.equal(r.prevHasta.getTime(), r.desde.getTime())
})

test('contenido: cada categoría tiene tipo válido, explicación y ejemplos; cada tipo tiene categorías por rol', () => {
  for (const c of CATEGORIAS) {
    assert.ok(TIPOS[c.tipo], c.id)
    assert.ok(c.explicacion.length > 10 && c.ejemplos.length > 5, c.id)
    if (c.tipo === 'inversion') assert.ok(c.vidaUtilMeses && c.vidaUtilMeses > 0, c.id)
  }
  for (const rol of ['profesional', 'proveedor'] as const) {
    for (const t of TIPOS_MOVIMIENTO.filter((x) => TIPOS[x].roles.includes(rol))) assert.ok(categoriasDe(rol, t).length > 0, `${rol}/${t}`)
  }
  assert.equal(new Set(GLOSARIO.map((g) => g.id)).size, GLOSARIO.length)
})
