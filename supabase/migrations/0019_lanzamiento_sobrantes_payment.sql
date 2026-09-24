-- AlterTable
ALTER TABLE "Payment" ADD COLUMN     "chargeId" TEXT,
ADD COLUMN     "purchaseId" TEXT,
ADD COLUMN     "refundedAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "invoiceId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "Project" ADD COLUMN     "budgetMax" DOUBLE PRECISION,
ADD COLUMN     "budgetMin" DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "ProjectMaterial" ADD COLUMN     "invoicedAt" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "LeftoverReturn" (
    "id" TEXT NOT NULL,
    "requesterId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "projectId" TEXT,
    "purchaseId" TEXT,
    "chargeId" TEXT,
    "invoiceId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'solicitada',
    "paymentMethod" TEXT,
    "mpPaymentId" TEXT,
    "mpRefundId" TEXT,
    "refundTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "providerNote" TEXT,
    "requestedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "receivedAt" TIMESTAMP(3),
    "refundedAt" TIMESTAMP(3),

    CONSTRAINT "LeftoverReturn_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "LeftoverItem" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "elementId" TEXT NOT NULL,
    "materialId" TEXT,
    "purchaseId" TEXT,
    "qtyRequested" DOUBLE PRECISION NOT NULL,
    "qtyAccepted" DOUBLE PRECISION,
    "qtyReceived" DOUBLE PRECISION,
    "unitPricePaid" DOUBLE PRECISION NOT NULL,
    "refundAmount" DOUBLE PRECISION,
    "condition" TEXT NOT NULL,
    "photoUrl" TEXT NOT NULL,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'propuesto',

    CONSTRAINT "LeftoverItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LeftoverReturn_providerId_status_idx" ON "LeftoverReturn"("providerId", "status");

-- CreateIndex
CREATE INDEX "LeftoverReturn_requesterId_idx" ON "LeftoverReturn"("requesterId");

-- CreateIndex
CREATE INDEX "LeftoverReturn_projectId_idx" ON "LeftoverReturn"("projectId");

-- CreateIndex
CREATE INDEX "LeftoverReturn_purchaseId_idx" ON "LeftoverReturn"("purchaseId");

-- CreateIndex
CREATE INDEX "LeftoverItem_returnId_idx" ON "LeftoverItem"("returnId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_mpPaymentId_key" ON "Payment"("mpPaymentId");

-- CreateIndex
CREATE INDEX "Payment_chargeId_idx" ON "Payment"("chargeId");

-- CreateIndex
CREATE INDEX "Payment_purchaseId_idx" ON "Payment"("purchaseId");

-- AddForeignKey
ALTER TABLE "LeftoverReturn" ADD CONSTRAINT "LeftoverReturn_requesterId_fkey" FOREIGN KEY ("requesterId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeftoverReturn" ADD CONSTRAINT "LeftoverReturn_providerId_fkey" FOREIGN KEY ("providerId") REFERENCES "ProviderProfile"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeftoverItem" ADD CONSTRAINT "LeftoverItem_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "LeftoverReturn"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "LeftoverItem" ADD CONSTRAINT "LeftoverItem_elementId_fkey" FOREIGN KEY ("elementId") REFERENCES "CatalogElement"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

