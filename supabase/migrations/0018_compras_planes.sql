-- 0018_compras_planes.sql — espejo de prisma db push (Postgres)
-- N8: compras directas de insumos + planes de suscripción de proveedores (trial/basic/pro)
-- + reseñas por compra (context=compra)

-- Planes del proveedor: el único rol con suscripción de pago.
-- free → trial (14 días gratis desde el alta); pro sigue existiendo; nuevo: basic
UPDATE "ProviderProfile" SET "subscription" = 'trial' WHERE "subscription" = 'free';
ALTER TABLE "ProviderProfile" ADD COLUMN IF NOT EXISTS "trialEndsAt" TIMESTAMP(3);
-- fin de la prueba: createdAt + 14 días para quien aún no tiene plan de pago
UPDATE "ProviderProfile"
   SET "trialEndsAt" = "createdAt" + INTERVAL '14 days'
 WHERE "subscription" = 'trial' AND "trialEndsAt" IS NULL;

-- Cobros de venta directa (sin proyecto): compra de insumos fuera de una obra
ALTER TABLE "ProviderCharge" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "ProviderCharge" ALTER COLUMN "projectId" DROP DEFAULT;

-- Reseña nacida de una compra directa
ALTER TABLE "Review" ADD COLUMN IF NOT EXISTS "purchaseId" TEXT;

-- Compra directa de insumos: cliente pide → proveedor acepta/entrega → cobro → reseña
CREATE TABLE IF NOT EXISTS "Purchase" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "stockId" TEXT,
    "elementId" TEXT NOT NULL,
    "elementName" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "unit" TEXT NOT NULL DEFAULT 'unidad',
    "unitPrice" DOUBLE PRECISION NOT NULL,
    "total" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'solicitado',
    "chargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Purchase_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "Purchase" ADD CONSTRAINT "PurchaseClient_fkey"
    FOREIGN KEY ("clientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "Purchase" ADD CONSTRAINT "PurchaseProvider_fkey"
    FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "Purchase_clientId_idx" ON "Purchase"("clientId");
CREATE INDEX IF NOT EXISTS "Purchase_providerId_idx" ON "Purchase"("providerId");
CREATE INDEX IF NOT EXISTS "Purchase_status_idx" ON "Purchase"("status");
