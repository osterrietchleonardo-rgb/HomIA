-- ============================================================
-- HomIA 0013 — Plan PRO para PROVEEDORES (Mercado Pago preapproval)
-- Contrato para la base del usuario (PostgreSQL / Supabase)
-- La suscripción PRO se vende en primera instancia a proveedores:
-- su negocio recibe el badge PRO y prioridad en el motor IA.
-- ============================================================

ALTER TABLE "ProviderProfile"
  ADD COLUMN IF NOT EXISTS "subscription"     TEXT       NOT NULL DEFAULT 'free', -- free | pro
  ADD COLUMN IF NOT EXISTS "mpPreapprovalId"  TEXT,                               -- id de preapproval de Mercado Pago
  ADD COLUMN IF NOT EXISTS "proSince"         TIMESTAMPTZ;                        -- desde cuándo está activo

CREATE UNIQUE INDEX IF NOT EXISTS "ProviderProfile_mpPreapprovalId_key" ON "ProviderProfile"("mpPreapprovalId");

COMMENT ON COLUMN "ProviderProfile"."subscription" IS 'free | pro — pro se activa por webhook de preapproval de Mercado Pago (external_reference = provider_pro:<id>)';
