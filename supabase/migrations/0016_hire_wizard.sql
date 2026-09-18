-- 0016: Contratación guiada desde el directorio (wizard "Contratar")
-- Project gana los campos del brief que el cliente completa al contratar directo.
ALTER TABLE "Project" ADD COLUMN "urgency" TEXT;
ALTER TABLE "Project" ADD COLUMN "address" TEXT;
ALTER TABLE "Project" ADD COLUMN "deadline" DATETIME;
ALTER TABLE "Project" ADD COLUMN "photos" TEXT;
