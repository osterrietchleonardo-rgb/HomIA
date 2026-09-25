// Ingresos de la plataforma: el cargo de servicio HomIA (1%) recaudado (D6/D27).
// Función ÚNICA y reutilizable: la usan el panel de Métricas (sección Negocio, D27) y la sección
// "Ingresos de HomIA" del área /admin, para que las dos muestren exactamente la misma cifra.
//
// Definición: suma de `serviceFee` de los pagos por Mercado Pago aprobados en el período:
//   · facturas (`Invoice`) con status 'pagada', paymentMethod 'mercadopago', por `paidAt`;
//   · cobros de materiales (`ProviderCharge`, incluye los sub-pedidos del carrito) con status
//     'pagada', method 'mercadopago', por `paidAt`;
//   · compras históricas SIN cobro (`Purchase.chargeId` nulo) en 'pagado'/'entregado' pagadas por
//     MP, por `updatedAt`. El `serviceFee` de una compra CON cobro no se suma: es el mismo que el
//     del cobro (sería doble).
// El cargo no se reembolsa en sobrantes (D6), así que no se descuenta nada.
import 'server-only'
import { db } from '@/lib/db'

export type CargoServicio = { facturas: number; materiales: number; compras: number; total: number; pagos: number }

/** Cargo de servicio 1% recaudado en [desde, hasta). `excluirPrueba` saca las cuentas @homia.test. */
export async function cargoServicioRecaudado(desde: Date, hasta: Date, excluirPrueba = true): Promise<CargoServicio> {
  const [r] = await db.$queryRaw<{ facturas: number; materiales: number; compras: number; pagos: number }[]>`
    WITH p AS (SELECT (${desde.toISOString()}::timestamptz AT TIME ZONE 'UTC') AS d, (${hasta.toISOString()}::timestamptz AT TIME ZONE 'UTC') AS h),
    excl AS (SELECT id FROM "User" WHERE ${excluirPrueba}::boolean AND email LIKE '%@homia.test'),
    i AS (SELECT "serviceFee" FROM "Invoice" x, p WHERE x.status = 'pagada' AND x."paymentMethod" = 'mercadopago' AND x."paidAt" >= p.d AND x."paidAt" < p.h AND x."clientId" NOT IN (SELECT id FROM excl)),
    c AS (SELECT "serviceFee" FROM "ProviderCharge" x, p WHERE x.status = 'pagada' AND x.method = 'mercadopago' AND x."paidAt" >= p.d AND x."paidAt" < p.h AND x."clientId" NOT IN (SELECT id FROM excl)),
    pu AS (SELECT "serviceFee" FROM "Purchase" x, p WHERE x."chargeId" IS NULL AND x."paymentMethod" = 'mercadopago' AND x.status IN ('pagado', 'entregado') AND x."updatedAt" >= p.d AND x."updatedAt" < p.h AND x."clientId" NOT IN (SELECT id FROM excl))
    SELECT (SELECT COALESCE(sum("serviceFee"), 0) FROM i)::float8 AS facturas,
           (SELECT COALESCE(sum("serviceFee"), 0) FROM c)::float8 AS materiales,
           (SELECT COALESCE(sum("serviceFee"), 0) FROM pu)::float8 AS compras,
           ((SELECT count(*) FROM i) + (SELECT count(*) FROM c) + (SELECT count(*) FROM pu))::int AS pagos`
  const r2 = (v: number) => Math.round(Number(v || 0) * 100) / 100
  const facturas = r2(r?.facturas ?? 0)
  const materiales = r2(r?.materiales ?? 0)
  const compras = r2(r?.compras ?? 0)
  return { facturas, materiales, compras, total: r2(facturas + materiales + compras), pagos: Number(r?.pagos ?? 0) }
}
