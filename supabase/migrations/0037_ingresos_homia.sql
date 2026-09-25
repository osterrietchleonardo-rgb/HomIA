-- 0037 — Ingresos de HomIA (D30, 25/09/2026)
--
-- Solo aditivo: dos columnas NULL en "Payment" y dos tablas nuevas. No toca ni borra ninguna fila.
--   "Payment"."mpApplicationFee" / "mpApprovedAt" → lo que Mercado Pago informa del cargo de servicio
--     1% (fee_details tipo application_fee) y la fecha de aprobación; null = sin dato (no se estima).
--   "SubscriptionCharge" → cada cobro mensual de suscripción de un proveedor, tal como lo da MP
--     (idempotente por "mpPaymentId"; sin FK al proveedor: el registro contable sobrevive a la baja).
--   "SubscriptionEvent" → movimientos del plan (altas pagas, cambios, bajas, reactivaciones),
--     idempotente por "dedupeKey".
--
-- Generado con `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script`
-- (el diff traía solo estas sentencias: 0033-0036 ya estaban aplicadas). Se agregó IF NOT EXISTS y el RLS.
-- Se aplica con `npx prisma db execute --file supabase/migrations/0037_ingresos_homia.sql --url "$DIRECT_URL"`.
-- Vuelta atrás: DROP TABLE "SubscriptionCharge"; DROP TABLE "SubscriptionEvent";
--   ALTER TABLE "Payment" DROP COLUMN "mpApplicationFee", DROP COLUMN "mpApprovedAt";
--   (se pierde solo el registro de ingresos; los cobros se pueden volver a traer de MP con el backfill).

-- AlterTable
ALTER TABLE "Payment" ADD COLUMN IF NOT EXISTS "mpApplicationFee" DOUBLE PRECISION,
ADD COLUMN IF NOT EXISTS "mpApprovedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SubscriptionCharge" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT,
    "providerName" TEXT NOT NULL,
    "plan" TEXT NOT NULL,
    "mpPreapprovalId" TEXT NOT NULL,
    "mpPaymentId" TEXT NOT NULL,
    "mpAuthorizedPaymentId" TEXT,
    "mpEnvironment" TEXT NOT NULL DEFAULT 'live',
    "status" TEXT NOT NULL,
    "statusDetail" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ARS',
    "refundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netAmount" DOUBLE PRECISION,
    "mpFee" DOUBLE PRECISION,
    "periodStart" TIMESTAMP(3),
    "attemptedAt" TIMESTAMP(3) NOT NULL,
    "paidAt" TIMESTAMP(3),
    "source" TEXT NOT NULL,
    "raw" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubscriptionCharge_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "SubscriptionEvent" (
    "id" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "providerName" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "fromPlan" TEXT,
    "toPlan" TEXT,
    "mpPreapprovalId" TEXT,
    "motivo" TEXT,
    "source" TEXT NOT NULL,
    "dedupeKey" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SubscriptionEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionCharge_mpPaymentId_key" ON "SubscriptionCharge"("mpPaymentId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubscriptionCharge_providerId_attemptedAt_idx" ON "SubscriptionCharge"("providerId", "attemptedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubscriptionCharge_status_paidAt_idx" ON "SubscriptionCharge"("status", "paidAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubscriptionCharge_mpPreapprovalId_idx" ON "SubscriptionCharge"("mpPreapprovalId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SubscriptionEvent_dedupeKey_key" ON "SubscriptionEvent"("dedupeKey");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubscriptionEvent_providerId_occurredAt_idx" ON "SubscriptionEvent"("providerId", "occurredAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SubscriptionEvent_type_occurredAt_idx" ON "SubscriptionEvent"("type", "occurredAt");


-- RLS (la app no usa PostgREST para estas tablas; solo Prisma con el usuario de la base)
ALTER TABLE "SubscriptionCharge" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "SubscriptionEvent" ENABLE ROW LEVEL SECURITY;
