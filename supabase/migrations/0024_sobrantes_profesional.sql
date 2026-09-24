-- 0024 Sobrantes con el profesional como vendedor (D14, 24/09/2026, Leonardo):
-- "Devuelve la plata quien la cobró, y los materiales vuelven a quien se los vendió al cliente".
-- Solo aditivo: 7 columnas nuevas (2 con default, 5 opcionales), providerId pasa a opcional
-- (DROP NOT NULL: en la pata cliente → profesional no hay proveedor), 2 índices y 2 FK nuevas.
-- Las devoluciones existentes quedan con tipo = 'cliente' y sellerKind = 'proveedor' (como hasta hoy).

-- AlterTable
ALTER TABLE "LeftoverReturn" ADD COLUMN     "parentReturnId" TEXT,
ADD COLUMN     "professionalId" TEXT,
ADD COLUMN     "refundChannel" TEXT,
ADD COLUMN     "refundMethod" TEXT,
ADD COLUMN     "refundMethodNote" TEXT,
ADD COLUMN     "sellerKind" TEXT NOT NULL DEFAULT 'proveedor',
ADD COLUMN     "tipo" TEXT NOT NULL DEFAULT 'cliente',
ALTER COLUMN "providerId" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "LeftoverReturn_professionalId_status_idx" ON "LeftoverReturn"("professionalId", "status");

-- CreateIndex
CREATE INDEX "LeftoverReturn_parentReturnId_idx" ON "LeftoverReturn"("parentReturnId");

-- AddForeignKey
ALTER TABLE "LeftoverReturn" ADD CONSTRAINT "LeftoverReturn_professionalId_fkey" FOREIGN KEY ("professionalId") REFERENCES "ProfessionalProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeftoverReturn" ADD CONSTRAINT "LeftoverReturn_parentReturnId_fkey" FOREIGN KEY ("parentReturnId") REFERENCES "LeftoverReturn"("id") ON DELETE SET NULL ON UPDATE CASCADE;

