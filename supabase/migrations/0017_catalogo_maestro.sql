-- 0017_catalogo_maestro.sql — espejo de prisma db push
-- Catálogo maestro de elementos del hogar: descripción natural + unidades de venta
-- Tipos de negocio del proveedor (corralón, ferretería, electricidad, etc.)
ALTER TABLE "CatalogElement" ADD COLUMN "description" TEXT NOT NULL DEFAULT '';
ALTER TABLE "ProviderProfile" ADD COLUMN "kind" TEXT NOT NULL DEFAULT 'multi';
