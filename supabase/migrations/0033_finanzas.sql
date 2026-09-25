-- 0033 — Finanzas del profesional y del proveedor (D24, 25/09/2026)
--
-- Solo aditivo: una columna nullable en "ProviderStock" (unitCost, costo de compra por unidad)
-- y dos tablas nuevas: "FinanceEntry" (movimientos que carga el usuario: ingresos por fuera de
-- HomIA, costos, gastos, inversiones, retiros, aportes, préstamos) y "FinanceConfig" (saldo
-- inicial, margen estimado, primer uso, asignación de compras a obras). No toca ni borra
-- ninguna fila existente. Al borrar un usuario se borran sus movimientos (ON DELETE CASCADE).
--
-- Generado con `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script`
-- (el diff traía solo estas sentencias). Se agregó IF NOT EXISTS y el RLS al final.
-- Se aplica con `npx prisma db execute --file supabase/migrations/0033_finanzas.sql --url "$DIRECT_URL"`.
-- Vuelta atrás: DROP TABLE "FinanceEntry"; DROP TABLE "FinanceConfig"; ALTER TABLE "ProviderStock" DROP COLUMN "unitCost";
-- (se pierde solo lo cargado en Finanzas).

-- AlterTable
ALTER TABLE "ProviderStock" ADD COLUMN IF NOT EXISTS "unitCost" DOUBLE PRECISION;

-- CreateTable
CREATE TABLE IF NOT EXISTS "FinanceEntry" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "interestAmount" DOUBLE PRECISION,
    "date" TIMESTAMP(3) NOT NULL,
    "paymentMethod" TEXT,
    "recurring" TEXT,
    "recurringUntil" TIMESTAMP(3),
    "projectId" TEXT,
    "usefulLifeMonths" INTEGER,
    "status" TEXT NOT NULL DEFAULT 'pagado',
    "attachmentUrl" TEXT,
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "FinanceConfig" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "openingCash" DOUBLE PRECISION,
    "openingDate" TIMESTAMP(3),
    "estimatedCostPct" DOUBLE PRECISION,
    "onboardedAt" TIMESTAMP(3),
    "tags" TEXT NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FinanceConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "FinanceEntry_userId_role_date_idx" ON "FinanceEntry"("userId", "role", "date");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "FinanceConfig_userId_role_key" ON "FinanceConfig"("userId", "role");

-- AddForeignKey
ALTER TABLE "FinanceEntry" ADD CONSTRAINT "FinanceEntry_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FinanceConfig" ADD CONSTRAINT "FinanceConfig_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- RLS como las demás tablas: la app entra con el rol del servidor (Prisma); sin políticas,
-- nadie accede por la API pública de Supabase.
ALTER TABLE "FinanceEntry" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "FinanceConfig" ENABLE ROW LEVEL SECURITY;
