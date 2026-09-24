-- 0028 — Recuperar contraseña y avisos por mail (D18, 24/09/2026)
--
-- Solo aditivo: una columna con default y una tabla nueva. No toca ni borra filas.
--   User.emailNotifications → el usuario puede apagar los avisos por mail desde su perfil
--     (default true: todas las cuentas existentes quedan con los avisos prendidos).
--   PasswordReset → pedidos de "olvidé mi contraseña". Se guarda el sha256 del token
--     (el token real viaja solo en el link del mail), vence en 1 hora, se usa una vez.
--     ON DELETE CASCADE: si se borra el usuario, se borran sus pedidos.
-- RLS activado en la tabla nueva (como las demás tablas de la app): nadie la lee por la
-- API REST de Supabase; la app entra con el usuario de Prisma (dueño de la tabla).
-- Generado con `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script`
-- (solo las sentencias de este cambio). Se aplica con
-- `npx prisma db execute --file supabase/migrations/0028_recuperar_y_mails.sql --url "$DIRECT_URL"`.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "emailNotifications" BOOLEAN NOT NULL DEFAULT true;

-- CreateTable
CREATE TABLE "PasswordReset" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ip" TEXT,

    CONSTRAINT "PasswordReset_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PasswordReset_tokenHash_key" ON "PasswordReset"("tokenHash");

-- CreateIndex
CREATE INDEX "PasswordReset_userId_idx" ON "PasswordReset"("userId");

-- AddForeignKey
ALTER TABLE "PasswordReset" ADD CONSTRAINT "PasswordReset_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- RLS (la app no usa PostgREST para esta tabla)
ALTER TABLE "PasswordReset" ENABLE ROW LEVEL SECURITY;
