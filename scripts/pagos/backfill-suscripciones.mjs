// Backfill ÚNICO de los cobros de suscripción de proveedores (D30, Ingresos de HomIA).
// Trae de Mercado Pago (app Suscripciones) TODAS las suscripciones de la cuenta, sus facturas y
// pagos, y los guarda en "SubscriptionCharge" (idempotente por mpPaymentId: se puede correr de nuevo
// sin duplicar). También reconstruye los movimientos del plan ("SubscriptionEvent") con las fechas de
// MP (solo producción).
//
// ⚠ ESCRIBE EN PRODUCCIÓN (base única): correr primero con --dry-run y pedir el OK de Leonardo.
//
// Uso:
//   node scripts/pagos/backfill-suscripciones.mjs --dry-run            → solo muestra qué haría
//   node scripts/pagos/backfill-suscripciones.mjs                      → guarda (solo producción)
//   node scripts/pagos/backfill-suscripciones.mjs --incluir-prueba     → también el entorno de prueba
//                                                                       (quedan con mpEnvironment=test)
// No imprime tokens ni datos de tarjeta o del pagador: solo cantidades, estados y montos.
import 'dotenv/config'
import '../homy-test-alias.mjs'

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const entornos = args.has('--incluir-prueba') ? ['live', 'test'] : ['live']

const { sincronizarCobros } = await import('../../src/lib/suscripciones-mp.ts')
const { db } = await import('../../src/lib/db.ts')

// siempre se informa el entorno de prueba (en dry-run) para identificarlo, aunque no se guarde
const rep = await sincronizarCobros({ fuente: 'backfill', dryRun: true, reconstruirEventos: true, entornos: ['live', 'test'] })
const fmt = (n) => new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' }).format(n)
console.log(`\nBackfill de suscripciones — ${dryRun ? 'SIMULACIÓN (no escribe nada)' : 'CARGA REAL'} · entornos a guardar: ${entornos.join(', ')}\n`)
for (const [ent, r] of Object.entries(rep.entornos)) {
  console.log(`[${ent === 'live' ? 'PRODUCCIÓN' : 'PRUEBA (no es plata real)'}]`)
  console.log(`  suscripciones en MP: ${r.preapprovals} (de HomIA: ${r.deHomia}) · proveedores: ${r.proveedores.length}`)
  console.log(`  facturas: ${r.facturas} · pagos: ${r.pagos} · nuevos: ${r.nuevos} · a actualizar: ${r.actualizados} · sin cambios: ${r.sinCambios}`)
  for (const [st, v] of Object.entries(r.porEstado)) console.log(`    ${st}: ${v.cantidad} cobro(s) · ${fmt(v.monto)}`)
}
console.log(`\nMovimientos del plan reconstruidos (solo producción): ${rep.eventos.length} (nuevos: ${rep.eventos.filter((e) => e.nuevo).length})`)
for (const e of rep.eventos) console.log(`  ${e.occurredAt.slice(0, 10)} ${e.type} proveedor ${e.providerId} ${e.nuevo ? '(nuevo)' : '(ya estaba)'}`)
if (rep.errores.length) console.log('\nErrores:', rep.errores)

if (!dryRun) {
  const real = await sincronizarCobros({ fuente: 'backfill', dryRun: false, reconstruirEventos: true, entornos })
  const n = Object.values(real.entornos).reduce((s, r) => s + r.nuevos + r.actualizados, 0)
  console.log(`\nGuardado: ${n} cobro(s) nuevos/actualizados, ${real.eventos.filter((e) => e.nuevo).length} movimiento(s) del plan.`)
  if (real.errores.length) console.log('Errores:', real.errores)
}
await db.$disconnect()
