import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const emails = ['pro.glass@homia.test', 'prov.glass@homia.test']
for (const email of emails) {
  const u = await db.user.findUnique({ where: { email } })
  if (!u) { console.log('no existe', email); continue }
  await db.notification.deleteMany({ where: { userId: u.id } })
  await db.user.delete({ where: { id: u.id } })
  console.log('eliminado', email)
}
await db.$disconnect()
