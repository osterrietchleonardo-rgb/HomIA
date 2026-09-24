-- 0029 — Aceptación de términos y "Eliminar mi cuenta" (D19, 24/09/2026)
--
-- Solo aditivo: tres columnas nullable en "User". No toca ni borra filas; los usuarios
-- existentes quedan con NULL (se registraron antes de que existiera la casilla).
--   User.termsAcceptedAt → cuándo aceptó los Términos y la Política de Privacidad al registrarse.
--   User.termsVersion    → qué versión de los textos aceptó (LEGAL_VERSION de src/lib/legal-content.ts).
--   User.deletedAt       → la cuenta se eliminó (Ley 25.326): quedó anonimizada, sin sesión y
--                          oculta de todo lo público (src/lib/account-deletion.ts, src/lib/visibility.ts).
-- Generado con `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script`
-- (solo las sentencias de este cambio). Se aplica con
-- `npx prisma db execute --file supabase/migrations/0029_legal_baja.sql --url "$DIRECT_URL"`.

-- AlterTable
ALTER TABLE "User" ADD COLUMN     "deletedAt" TIMESTAMP(3),
ADD COLUMN     "termsAcceptedAt" TIMESTAMP(3),
ADD COLUMN     "termsVersion" TEXT;
