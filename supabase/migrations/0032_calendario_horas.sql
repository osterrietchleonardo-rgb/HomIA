-- 0032 — Horario en las fechas del trabajo y jornada del profesional (D23, 25/09/2026)
--
-- Solo aditivo: 6 columnas NULLABLE de texto. No toca ni borra filas.
-- En "Project" (los proyectos que ya tenían fechas quedan con franja NULL = DÍA COMPLETO,
-- compatibilidad total con D21):
--   dailyStart / dailyEnd          → franja de cada día del rango, "HH:MM" hora argentina,
--                                    de a 15 minutos, fin > inicio (validado en la API)
--   prevDailyStart / prevDailyEnd  → franja acordada vigente mientras se revisa una reprogramación
-- En "ProfessionalProfile" (NULL = jornada de referencia 06:00–18:00):
--   workdayStart / workdayEnd      → jornada del profesional, "HH:MM"; decide si un día está
--                                    "completo" o "con lugar"
--
-- Generado con `prisma migrate diff --from-url $DIRECT_URL --to-schema-datamodel prisma/schema.prisma --script`
-- (el diff traía solo estas sentencias). Se agregó IF NOT EXISTS para poder re-ejecutarlo: las
-- columnas de "Project" se aplicaron primero y las de "ProfessionalProfile" después, el mismo día.
-- Se aplica con `npx prisma db execute --file supabase/migrations/0032_calendario_horas.sql --url "$DIRECT_URL"`.
-- Vuelta atrás (si hiciera falta): ALTER TABLE "Project" DROP COLUMN "dailyStart", DROP COLUMN "dailyEnd",
-- DROP COLUMN "prevDailyStart", DROP COLUMN "prevDailyEnd"; ALTER TABLE "ProfessionalProfile"
-- DROP COLUMN "workdayStart", DROP COLUMN "workdayEnd"; (se pierden solo los horarios cargados).

-- AlterTable
ALTER TABLE "Project" ADD COLUMN IF NOT EXISTS "dailyEnd" TEXT,
ADD COLUMN IF NOT EXISTS "dailyStart" TEXT,
ADD COLUMN IF NOT EXISTS "prevDailyEnd" TEXT,
ADD COLUMN IF NOT EXISTS "prevDailyStart" TEXT;

-- AlterTable
ALTER TABLE "ProfessionalProfile" ADD COLUMN IF NOT EXISTS "workdayEnd" TEXT,
ADD COLUMN IF NOT EXISTS "workdayStart" TEXT;
