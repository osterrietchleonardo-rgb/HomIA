-- 0031 — Calendario del profesional y acuerdo de fechas del proyecto (D21, 24/09/2026)
--
-- Solo aditivo: 8 columnas NULLABLE en "Project" y un índice. No toca ni borra filas; todos
-- los proyectos existentes quedan "sin fechas" (scheduleStatus NULL).
--   startDate / endDate          → inicio y fin estimado del trabajo (día al mediodía UTC)
--   scheduleStatus               → NULL (sin fechas) | 'propuesta' | 'acordada'
--   scheduleProposedBy           → 'profesional' | 'cliente' (quién propuso; tras un rechazo, quién rechazó)
--   scheduleNote                 → nota de la propuesta o motivo del rechazo
--   scheduleUpdatedAt            → última acción (control de concurrencia optimista)
--   prevStartDate / prevEndDate  → fechas acordadas vigentes mientras se revisa una reprogramación
-- Índice (professionalId, startDate) para el calendario del profesional y la disponibilidad pública.
--
-- Generado con `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script`
-- dejando SOLO las sentencias de este cambio (el diff traía además las columnas de "User" de la
-- migración 0029 de otro equipo, que no se aplican acá). Se aplica con
-- `npx prisma db execute --file supabase/migrations/0031_calendario_profesional.sql --url "$DIRECT_URL"`.
-- Vuelta atrás (si hiciera falta): DROP INDEX "Project_professionalId_startDate_idx"; y
-- ALTER TABLE "Project" DROP COLUMN … de las 8 columnas (se pierden solo las fechas cargadas).

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "endDate" TIMESTAMP(3),
ADD COLUMN     "prevEndDate" TIMESTAMP(3),
ADD COLUMN     "prevStartDate" TIMESTAMP(3),
ADD COLUMN     "scheduleNote" TEXT,
ADD COLUMN     "scheduleProposedBy" TEXT,
ADD COLUMN     "scheduleStatus" TEXT,
ADD COLUMN     "scheduleUpdatedAt" TIMESTAMP(3),
ADD COLUMN     "startDate" TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "Project_professionalId_startDate_idx" ON "Project"("professionalId", "startDate");
