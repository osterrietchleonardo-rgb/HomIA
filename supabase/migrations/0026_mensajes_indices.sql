-- 0026 — Mensajería: índice para la bandeja (2026-09-24)
-- SOLO ADITIVO. La bandeja busca "Conversation" por "userAId" (cubierto por el
-- unique ("userAId","userBId")) O por "userBId", que no tenía índice.
-- Generado con: npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script
-- Vuelta atrás: DROP INDEX IF EXISTS "Conversation_userBId_idx";
CREATE INDEX IF NOT EXISTS "Conversation_userBId_idx" ON "Conversation"("userBId");
