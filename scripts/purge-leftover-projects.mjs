// Purga de proyectos residuales de E2Es anteriores (no forman parte del seed demo)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const leftovers = await db.project.findMany({
  where: { title: { in: ['Proyecto con Carolina Páez', 'Proyecto con LEo'] } },
  select: { id: true, title: true },
})
for (const p of leftovers) {
  await db.projectMaterial.deleteMany({ where: { projectId: p.id } })
  await db.invoice.deleteMany({ where: { projectId: p.id } })
  await db.notification.deleteMany({ where: { link: { contains: p.id } } })
  await db.message.deleteMany({ where: { conversationId: undefined } }).catch(() => {})
  await db.project.delete({ where: { id: p.id } })
  console.log('PURGADO:', p.title)
}
console.log('Total purgados:', leftovers.length)
await db.$disconnect()
