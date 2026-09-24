-- 0021 · Marca PRO: logo, frase y color del proveedor para la cinta de sponsors de la home.
-- Solo aditivo (columnas nullable). Generado con prisma migrate diff contra la base de producción.
-- AlterTable
ALTER TABLE "ProviderProfile" ADD COLUMN     "brandColor" TEXT,
ADD COLUMN     "brandLogoUrl" TEXT,
ADD COLUMN     "brandTagline" TEXT;

