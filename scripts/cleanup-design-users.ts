// Cleanup de usuarios de verificación visual (Task 11)
// Borra: design-cliente / design-profesional / design-proveedor / smoke-final
// Todas las relaciones del schema tienen onDelete: Cascade → basta borrar el User.
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const EMAILS = [
  'design-cliente@homia.test',
  'design-profesional@homia.test',
  'design-proveedor@homia.test',
  'smoke-final@homia.test',
]

async function main() {
  for (const email of EMAILS) {
    const u = await db.user.findUnique({ where: { email } })
    if (!u) {
      console.log(`- ${email}: no existe (ok)`)
      continue
    }
    // Project.client → User NO tiene cascade: borrar proyectos primero
    const profiles = await db.professionalProfile.findMany({ where: { userId: u.id } })
    const profileIds = profiles.map((p) => p.id)
    const projects = await db.project.findMany({
      where: { OR: [{ clientId: u.id }, { professionalId: { in: profileIds } }] },
    })
    for (const p of projects) {
      await db.project.delete({ where: { id: p.id } })
      console.log(`  · proyecto "${p.title}" borrado`)
    }
    await db.user.delete({ where: { id: u.id } })
    console.log(`✓ ${email} (${u.displayName}) borrado con cascada`)
  }
  const remaining = await db.user.count()
  console.log(`Usuarios restantes en DB: ${remaining}`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => db.$disconnect())
