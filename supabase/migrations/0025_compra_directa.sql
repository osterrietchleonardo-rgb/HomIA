-- 0025 — Compra directa y reservas sin stock (D15, 24/09/2026)
-- "Las compras no necesitan aprobación del proveedor: son directas al pago, siempre y
-- cuando haya stock. Las aprobaciones son para las reservas de productos, con o sin stock."
--
-- Solo aditivo: una columna nullable. No toca filas existentes.
--   Purchase.availableFrom → en una reserva SIN stock aprobada (estado `esperando_stock`),
--   la fecha aproximada en que el proveedor va a tener el producto.
-- Generado con `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script`.

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "availableFrom" TIMESTAMP(3);
