-- 0034 — Sugerencias de los usuarios (D25, 25/09/2026)
--
-- Solo aditivo: una tabla nueva "Feedback" (sugerencias, quejas, mejoras, oportunidades,
-- problemas técnicos y otros que mandan cliente, profesional y proveedor desde su panel).
-- No toca ni borra ninguna tabla ni fila existente.
--   photos  → JSON con paths PRIVADOS del bucket "feedback-evidencias" (nunca URLs públicas)
--   context → JSON solo para "problema técnico" (pantalla, navegador, dispositivo, fecha)
--   status  → recibida | en_revision | planificada | resuelta | descartada
-- Al borrar un usuario se borran sus envíos (ON DELETE CASCADE).
--
-- Generado con `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script`
-- (el diff traía solo estas sentencias). Se agregó IF NOT EXISTS y el RLS al final.
-- Se aplica con `npx prisma db execute --file supabase/migrations/0034_sugerencias.sql --url "$DIRECT_URL"`.
-- Vuelta atrás: DROP TABLE "Feedback"; (se pierden solo los envíos cargados).

-- CreateTable
CREATE TABLE IF NOT EXISTS "Feedback" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "area" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "photos" TEXT NOT NULL DEFAULT '[]',
    "context" TEXT,
    "contactOk" BOOLEAN NOT NULL DEFAULT true,
    "status" TEXT NOT NULL DEFAULT 'recibida',
    "adminResponse" TEXT,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Feedback_userId_idx" ON "Feedback"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Feedback_status_createdAt_idx" ON "Feedback"("status", "createdAt");

-- AddForeignKey
DO $$ BEGIN
  ALTER TABLE "Feedback" ADD CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- RLS (la app no usa PostgREST para esta tabla; solo Prisma con el usuario de la base)
ALTER TABLE "Feedback" ENABLE ROW LEVEL SECURITY;
