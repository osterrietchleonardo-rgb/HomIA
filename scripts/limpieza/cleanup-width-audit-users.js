import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const emails = ['width.audit@homia.test', 'width.prov@homia.test']
for (const email of emails) {
  const u = await db.user.findUnique({ where: { email } })
  if (!u) { console.log('no existe', email); continue }
  await db.notification.deleteMany({ where: { userId: u.id } })
  await db.professionalProfile.deleteMany({ where: { userId: u.id } }).catch(() => {})
  await db.providerProfile.deleteMany({ where: { userId: u.id } }).catch(() => {})
  await db.user.delete({ where: { id: u.id } })
  console.log('eliminado', email)
}
await db.$disconnect()
