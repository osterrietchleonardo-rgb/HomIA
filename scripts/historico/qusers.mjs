import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const users = await db.user.findMany({ select: { id: true, email: true, displayName: true, roles: true, createdAt: true }, orderBy: { createdAt: 'desc' }, take: 10 })
console.log(JSON.stringify(users, null, 1))
await db.$disconnect()
