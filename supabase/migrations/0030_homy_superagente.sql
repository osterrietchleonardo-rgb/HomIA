-- 0030 — Súper agente Homy (2026-09-24): cupo diario (AiUsage), registro de corridas (HomyRun)
-- y columnas nuevas en HomySession/HomyMessage. SOLO ADITIVO (sin DROP). Rollback: DROP TABLE "AiUsage", "HomyRun"; y DROP COLUMN de las 4 columnas.

-- AlterTable
ALTER TABLE "HomyMessage" ADD COLUMN     "payload" TEXT,
ADD COLUMN     "runId" TEXT;

-- AlterTable
ALTER TABLE "HomySession" ADD COLUMN     "puerta" TEXT,
ADD COLUMN     "visitorHash" TEXT;

-- CreateTable
CREATE TABLE "AiUsage" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "count" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "AiUsage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "HomyRun" (
    "id" TEXT NOT NULL,
    "sessionId" TEXT,
    "userId" TEXT,
    "ipHash" TEXT,
    "puerta" TEXT NOT NULL,
    "rol" TEXT NOT NULL,
    "pregunta" TEXT NOT NULL,
    "pasos" TEXT NOT NULL DEFAULT '[]',
    "modelo" TEXT NOT NULL,
    "esfuerzo" TEXT,
    "vueltas" INTEGER NOT NULL DEFAULT 0,
    "tokensEntrada" INTEGER NOT NULL DEFAULT 0,
    "tokensSalida" INTEGER NOT NULL DEFAULT 0,
    "tokensRazon" INTEGER NOT NULL DEFAULT 0,
    "tokensCache" INTEGER NOT NULL DEFAULT 0,
    "costoUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "latenciaMs" INTEGER NOT NULL DEFAULT 0,
    "resultado" TEXT NOT NULL,
    "error" TEXT,
    "respuesta" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "HomyRun_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "AiUsage_key_day_key" ON "AiUsage"("key", "day");

-- CreateIndex
CREATE INDEX "HomyRun_createdAt_idx" ON "HomyRun"("createdAt");

-- CreateIndex
CREATE INDEX "HomyRun_userId_idx" ON "HomyRun"("userId");

-- CreateIndex
CREATE INDEX "HomyRun_resultado_createdAt_idx" ON "HomyRun"("resultado", "createdAt");

-- CreateIndex
CREATE INDEX "HomySession_visitorHash_idx" ON "HomySession"("visitorHash");

