import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const bath = 'cmu6jhr5i0012r979cp7lwwp6'
const mats = await db.projectMaterial.findMany({ where: { projectId: bath }, select: { name: true, providerId: true, status: true } })
console.log('BATH MATERIALS:', JSON.stringify(mats))
const prov = await db.providerProfile.findFirst({ select: { id: true, userId: true, businessName: true } })
console.log('PROVIDER:', JSON.stringify(prov))
const userMap = await db.user.findMany({ where: { email: { contains: 'homia.test' } }, select: { id: true, displayName: true } })
console.log('MAP:', userMap.map(u => `${u.id}=${u.displayName}`).join('\n'))
// proyectos E2E residuales
const leftover = await db.project.findMany({ where: { title: { contains: 'Proyecto con' } }, select: { id: true, title: true } })
console.log('LEFTOVER:', JSON.stringify(leftover))
await db.$disconnect()
