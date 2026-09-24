import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const email = 'panel.ctx@homia.test'
const u = await db.user.findUnique({ where: { email } })
if (u) {
  await db.notification.deleteMany({ where: { userId: u.id } })
  await db.professionalProfile.deleteMany({ where: { userId: u.id } }).catch(() => {})
  await db.providerProfile.deleteMany({ where: { userId: u.id } }).catch(() => {})
  await db.user.delete({ where: { id: u.id } })
  console.log('eliminado', email)
} else console.log('no existe')
await db.$disconnect()
