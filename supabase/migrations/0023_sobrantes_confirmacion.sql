-- 0023 Sobrantes: confirmación del reembolso en efectivo (o automática a las 72 h) y recordatorio al proveedor (72 h)
-- Solo aditivo: 3 columnas nuevas opcionales en LeftoverReturn.

-- AlterTable
ALTER TABLE "LeftoverReturn" ADD COLUMN     "refundConfirmedAt" TIMESTAMP(3),
ADD COLUMN     "refundConfirmedBy" TEXT,
ADD COLUMN     "reminderSentAt" TIMESTAMP(3);

