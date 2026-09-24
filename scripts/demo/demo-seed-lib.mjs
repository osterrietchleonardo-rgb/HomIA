// Lib del seed demo HomIA: limpieza idempotente + helpers compartidos
import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const db = new PrismaClient()

const PW = 'Homy2026!'
const HASH = bcrypt.hashSync(PW, 10)
const EMAILS = [
  'cliente@homia.test', 'profesional@homia.test', 'proveedor@homia.test',
  'carolina@homia.test', 'julian@homia.test',
]
const D = (days) => new Date(Date.now() - days * 86400000)

// Borrado en orden FK-seguro de TODA la red de datos de un set de usuarios (por email)
async function purgeByEmails(emails) {
  const users = await db.user.findMany({ where: { email: { in: emails } }, select: { id: true } })
  if (users.length === 0) return 0
  const ids = users.map((u) => u.id)
  const pros = await db.professionalProfile.findMany({ where: { userId: { in: ids } }, select: { id: true } })
  const proIds = pros.map((p) => p.id)
  const provs = await db.providerProfile.findMany({ where: { userId: { in: ids } }, select: { id: true } })
  const provIds = provs.map((p) => p.id)
  const pipelines = await db.crmPipeline.findMany({ where: { ownerId: { in: ids } }, select: { id: true } })
  const pipeIds = pipelines.map((p) => p.id)

  const projectWhere = { OR: [{ clientId: { in: ids } }, ...(proIds.length ? [{ professionalId: { in: proIds } }] : [])] }
  const invWhere = { project: projectWhere }

  await db.payment.deleteMany({ where: { invoice: invWhere } })
  await db.invoiceItem.deleteMany({ where: { invoice: invWhere } })
  await db.invoice.deleteMany({ where: invWhere })
  await db.projectMaterial.deleteMany({ where: { OR: [{ project: projectWhere }, ...(provIds.length ? [{ providerId: { in: provIds } }] : [])] } })
  await db.completedWork.deleteMany({ where: { OR: [{ authorId: { in: ids } }, ...(proIds.length ? [{ professionalId: { in: proIds } }] : [])] } })
  await db.project.deleteMany({ where: projectWhere })
  await db.stockReservation.deleteMany({ where: { OR: [{ userId: { in: ids } }, ...(provIds.length ? [{ stock: { providerId: { in: provIds } } }] : [])] } })
  await db.stockMovement.deleteMany({ where: provIds.length ? { stock: { providerId: { in: provIds } } } : { id: 'none' } })
  await db.providerStock.deleteMany({ where: provIds.length ? { providerId: { in: provIds } } : { id: 'none' } })
  await db.providerLink.deleteMany({ where: { OR: [...(provIds.length ? [{ providerId: { in: provIds } }] : []), ...(proIds.length ? [{ professionalId: { in: proIds } }] : [])] } })
  await db.crmDeal.deleteMany({ where: { OR: [...(pipeIds.length ? [{ pipelineId: { in: pipeIds } }] : []), { counterpartyId: { in: ids } }] } })
  await db.crmStage.deleteMany({ where: pipeIds.length ? { pipelineId: { in: pipeIds } } : { id: 'none' } })
  await db.crmPipeline.deleteMany({ where: { ownerId: { in: ids } } })
  await db.jobBid.deleteMany({ where: proIds.length ? { professionalId: { in: proIds } } : { id: 'none' } })
  await db.jobPost.deleteMany({ where: { userId: { in: ids } } })
  await db.review.deleteMany({ where: { OR: [{ authorId: { in: ids } }, { targetUserId: { in: ids } }] } })
  await db.message.deleteMany({ where: { OR: [{ senderId: { in: ids } }, { conversation: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } }] } })
  await db.conversation.deleteMany({ where: { OR: [{ userAId: { in: ids } }, { userBId: { in: ids } }] } })
  await db.favorite.deleteMany({ where: { OR: [{ userId: { in: ids } }, { targetUserId: { in: ids } }] } })
  await db.searchEvent.deleteMany({ where: { userId: { in: ids } } })
  await db.homyMessage.deleteMany({ where: { session: { userId: { in: ids } } } })
  await db.homySession.deleteMany({ where: { userId: { in: ids } } })
  await db.notification.deleteMany({ where: { userId: { in: ids } } })
  await db.identityDocument.deleteMany({ where: { userId: { in: ids } } })
  await db.user.deleteMany({ where: { id: { in: ids } } })
  console.log(`🧹 Limpieza: ${ids.length} usuarios y su red de datos eliminados`)
  return ids.length
}

async function cleanup() {
  await purgeByEmails(EMAILS)
}

// Promedios reales de reseñas → ratings coherentes
async function recomputeRatings() {
  const targets = await db.review.findMany({ select: { targetUserId: true }, distinct: ['targetUserId'] })
  for (const { targetUserId } of targets) {
    const agg = await db.review.aggregate({ where: { targetUserId }, _avg: { rating: true }, _count: { rating: true } })
    const rating = Math.round((agg._avg.rating || 0) * 10) / 10
    const count = agg._count.rating || 0
    await db.user.update({ where: { id: targetUserId }, data: { rating, reviewsCount: count } })
    await db.professionalProfile.updateMany({ where: { userId: targetUserId }, data: { rating, reviewsCount: count } })
    await db.providerProfile.updateMany({ where: { userId: targetUserId }, data: { rating, reviewsCount: count } })
  }
}

export { db, PW, HASH, EMAILS, D, cleanup, purgeByEmails, recomputeRatings }
