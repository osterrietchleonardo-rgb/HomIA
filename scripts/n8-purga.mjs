// Purga de datos E2E de N8 — reseña + cobro + compra y repone stock
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()
const pid = process.env.PUR_ID
if (!pid) { console.log('sin PUR_ID'); process.exit(0) }
const rev = await db.review.findFirst({ where: { purchaseId: pid } })
if (rev) await db.review.delete({ where: { id: rev.id } })
const pur = await db.purchase.findUnique({ where: { id: pid } })
if (pur?.chargeId) { await db.providerCharge.delete({ where: { id: pur.chargeId } }).catch(() => {}) }
if (pur) {
  await db.purchase.delete({ where: { id: pid } }).catch(() => {})
  if (pur.stockId) {
    const s = await db.providerStock.findUnique({ where: { id: pur.stockId } })
    if (s) await db.providerStock.update({ where: { id: s.id }, data: { quantity: s.quantity + pur.quantity } })
  }
}
console.log('limpio: reseña+cobro+compra E2E eliminados y stock repuesto')
await db.$disconnect()
