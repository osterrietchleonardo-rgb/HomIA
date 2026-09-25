-- 0036 — Métricas de uso (D27, 25/09/2026)
--
-- Solo aditivo: dos tablas nuevas, "AnalyticsEvent" (eventos de uso: vistas de pantalla, clics,
-- envíos, diálogos, búsquedas, errores y eventos de servidor como login/logout/registro/plan/PDF)
-- y "AnalyticsSession" (sesiones de uso con tiempo activo real). No toca ni borra ninguna tabla
-- ni fila existente. Sin FK a "User" (igual que "HomyRun"): la baja de cuenta y la purga E2E las
-- borran explícitamente.
--   props / utm → jsonb chico validado con zod en /api/analytics/collect (nunca texto tipeado)
--   Retención: eventos crudos 13 meses, sesiones indefinido (limpieza en el cron diario existente).
--
-- Generado con `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script`
-- (el diff traía solo estas sentencias: 0032-0035 ya estaban aplicadas). Se agregó IF NOT EXISTS y el RLS.
-- Se aplica con `npx prisma db execute --file supabase/migrations/0036_metricas.sql --url "$DIRECT_URL"`.
-- Vuelta atrás: DROP TABLE "AnalyticsEvent"; DROP TABLE "AnalyticsSession"; (se pierde solo el registro de uso).

-- CreateTable
CREATE TABLE IF NOT EXISTS "AnalyticsEvent" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonId" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "path" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "props" JSONB,
    "device" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "AnalyticsSession" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "anonId" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "activeMs" INTEGER NOT NULL DEFAULT 0,
    "pageViews" INTEGER NOT NULL DEFAULT 0,
    "events" INTEGER NOT NULL DEFAULT 0,
    "entryPath" TEXT,
    "referrer" TEXT,
    "utm" JSONB,
    "device" TEXT,

    CONSTRAINT "AnalyticsSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_userId_createdAt_idx" ON "AnalyticsEvent"("userId", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_type_createdAt_idx" ON "AnalyticsEvent"("type", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_name_createdAt_idx" ON "AnalyticsEvent"("name", "createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_entityType_entityId_idx" ON "AnalyticsEvent"("entityType", "entityId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_sessionId_idx" ON "AnalyticsEvent"("sessionId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_anonId_idx" ON "AnalyticsEvent"("anonId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnalyticsEvent_createdAt_idx" ON "AnalyticsEvent"("createdAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnalyticsSession_userId_startedAt_idx" ON "AnalyticsSession"("userId", "startedAt");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnalyticsSession_anonId_idx" ON "AnalyticsSession"("anonId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "AnalyticsSession_startedAt_idx" ON "AnalyticsSession"("startedAt");


-- RLS (la app no usa PostgREST para estas tablas; solo Prisma con el usuario de la base)
ALTER TABLE "AnalyticsEvent" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "AnalyticsSession" ENABLE ROW LEVEL SECURITY;
