-- 0027 — Contratar desde un trabajo publicado o un proyecto activo (D16, 24/09/2026)
-- "Cuando se aprieta para contratar a un profesional, dar la posibilidad de elegir un
-- proyecto/trabajo ya publicado" (Leonardo).
--
-- Solo aditivo: una columna nullable, un índice y una FK autorreferencial. No toca filas.
--   Project.parentProjectId → en una subcontratación, el proyecto del profesional del que sale.
--   ON DELETE SET NULL: si se borra el proyecto original, la subcontratación queda suelta.
-- (El vínculo cliente → trabajo publicado usa `Project.jobId`, que ya existía.)
-- Generado con `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script`.

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "parentProjectId" TEXT;

-- CreateIndex
CREATE INDEX "Project_parentProjectId_idx" ON "Project"("parentProjectId");

-- AddForeignKey
ALTER TABLE "Project" ADD CONSTRAINT "Project_parentProjectId_fkey" FOREIGN KEY ("parentProjectId") REFERENCES "Project"("id") ON DELETE SET NULL ON UPDATE CASCADE;
