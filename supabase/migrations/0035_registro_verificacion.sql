-- 0035 — Registro con datos estandarizados y verificación de email y celular (D26, 25/09/2026)
--
-- Solo aditivo: tres columnas NUEVAS y opcionales en "User" y una tabla nueva "VerificationCode".
-- No toca ni borra ninguna columna, tabla ni fila existente.
--   User.emailVerifiedAt → cuándo el usuario probó con un código de 6 cifras que el email es suyo.
--                          Las cuentas que ya existen quedan en NULL ("email sin verificar"); pueden
--                          seguir operando y lo verifican desde su perfil cuando quieran.
--   User.phoneE164       → el celular normalizado (+549…). "phone" sigue siendo lo que se muestra.
--   User.phoneVerifiedAt → cuándo confirmó el celular con un código por SMS o WhatsApp (queda NULL
--                          mientras HomIA no tenga proveedor de SMS/WhatsApp configurado).
--   VerificationCode     → códigos de verificación: se guarda el HMAC-SHA256 del código (nunca el
--                          código), vencen a los 10 min, hasta 5 intentos, un solo uso.
-- Al borrar un usuario se borran sus códigos (ON DELETE CASCADE).
--
-- Generado con `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script`
-- (el diff traía solo estas sentencias). Se agregó IF NOT EXISTS y el RLS al final.
-- Se aplica con `npx prisma db execute --file supabase/migrations/0035_registro_verificacion.sql --url "$DIRECT_URL"`.
-- Vuelta atrás: DROP TABLE "VerificationCode"; ALTER TABLE "User" DROP COLUMN "emailVerifiedAt",
--   DROP COLUMN "phoneE164", DROP COLUMN "phoneVerifiedAt"; (se pierden solo las verificaciones hechas).

-- AlterTable
ALTER TABLE "User" ADD COLUMN IF NOT EXISTS "emailVerifiedAt" TIMESTAMP(3),
ADD COLUMN IF NOT EXISTS "phoneE164" TEXT,
ADD COLUMN IF NOT EXISTS "phoneVerifiedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE IF NOT EXISTS "VerificationCode" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "channel" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationCode_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VerificationCode_target_channel_purpose_createdAt_idx" ON "VerificationCode"("target", "channel", "purpose", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VerificationCode_ip_createdAt_idx" ON "VerificationCode"("ip", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "VerificationCode_userId_idx" ON "VerificationCode"("userId");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "VerificationCode" ADD CONSTRAINT "VerificationCode_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS (la app no usa PostgREST para esta tabla; solo Prisma con el usuario de la base)
ALTER TABLE "VerificationCode" ENABLE ROW LEVEL SECURITY;
