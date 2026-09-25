-- 0038 — Plan pagado hasta (D33, 25/09/2026)
--
-- Solo aditivo: una columna NULL en "ProviderProfile". No toca ni borra ninguna fila.
--   "ProviderProfile"."planPaidUntil" → suscripción cancelada (desde HomIA o desde Mercado Pago) con un
--     período pago vigente: el plan sigue operativo hasta esa fecha y el cron diario lo da de baja al
--     vencer. null = sin baja programada (plan vigente, prueba o sin plan).
--
-- Generado con `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script`
-- (el diff traía solo esta sentencia). Se agregó IF NOT EXISTS.
-- Se aplica con `npx prisma db execute --file supabase/migrations/0038_plan_pagado_hasta.sql --url "$DIRECT_URL"`.
-- Vuelta atrás: ALTER TABLE "ProviderProfile" DROP COLUMN "planPaidUntil";
--   (quien tenga una baja programada pierde el acceso restante: revisar antes con
--    SELECT id, "planPaidUntil" FROM "ProviderProfile" WHERE "planPaidUntil" IS NOT NULL).

-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN IF NOT EXISTS "planPaidUntil" TIMESTAMP(3);
