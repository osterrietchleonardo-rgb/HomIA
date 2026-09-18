-- ============================================================
-- HomIA 0012 — Mercado Pago: escrow de proyectos + suscripción PRO
-- Contrato para la base del usuario (PostgreSQL / Supabase)
-- ============================================================

-- Escrow: el cliente deposita el pago en garantía vía Mercado Pago y
-- lo libera cuando da conformidad. El estado vive en el proyecto.
ALTER TABLE "Project"
  ADD COLUMN IF NOT EXISTS "escrowStatus"   TEXT     NOT NULL DEFAULT 'none',   -- none | retained | released
  ADD COLUMN IF NOT EXISTS "escrowPaymentId" TEXT,                              -- payment id de MP del depósito
  ADD COLUMN IF NOT EXISTS "escrowAmount"   DOUBLE PRECISION NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "escrowReleasedAt" TIMESTAMPTZ;

-- Suscripción PRO del profesional vía preapproval de Mercado Pago
ALTER TABLE "ProfessionalProfile"
  ADD COLUMN IF NOT EXISTS "mpPreapprovalId" TEXT,
  ADD COLUMN IF NOT EXISTS "proSince"        TIMESTAMPTZ;

-- Índices de consulta frecuente
CREATE INDEX IF NOT EXISTS "Project_escrowStatus_idx" ON "Project"("escrowStatus");
CREATE UNIQUE INDEX IF NOT EXISTS "ProfessionalProfile_mpPreapprovalId_key" ON "ProfessionalProfile"("mpPreapprovalId");

-- Comentarios de contrato
COMMENT ON COLUMN "Project"."escrowStatus" IS 'none: sin escrow · retained: pago depositado en garantía · released: liberado al profesional tras conformidad';
COMMENT ON COLUMN "ProfessionalProfile"."subscription" IS 'free | pro — pro se activa por webhook de preapproval de Mercado Pago';
