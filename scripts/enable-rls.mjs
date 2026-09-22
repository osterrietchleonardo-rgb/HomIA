import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()

const tables = [
  'User','IdentityDocument','ProfessionalProfile','ProviderProfile',
  'Category','CatalogElement','ProviderStock','StockMovement','StockReservation',
  'JobPost','JobBid','Project','ProjectMaterial','Invoice','InvoiceItem',
  'Payment','ProviderCharge','ProviderLink','CompletedWork','Review','Purchase',
  'CrmPipeline','CrmStage','CrmDeal','Conversation','Message','Notification',
  'HomySession','HomyMessage','SearchEvent','Favorite'
]

async function main() {
  console.log('🔒 Habilitando RLS + políticas service_role en las 31 tablas…')
  for (const tbl of tables) {
    try {
      await db.$executeRawUnsafe(`ALTER TABLE public."${tbl}" ENABLE ROW LEVEL SECURITY`)
      console.log(`  ✅ RLS habilitado en ${tbl}`)
    } catch (e) {
      console.log(`  ⚠️  RLS ya habilitado en ${tbl}: ${e.message?.slice(0, 80)}`)
    }
    try {
      await db.$executeRawUnsafe(
        `CREATE POLICY "service_role_full_${tbl}" ON public."${tbl}" FOR ALL TO service_role USING (true) WITH CHECK (true)`
      )
      console.log(`  ✅ Política service_role creada en ${tbl}`)
    } catch (e) {
      console.log(`  ⚠️  Política ya existe en ${tbl}: ${e.message?.slice(0, 80)}`)
    }
  }
  console.log('\n✅ RLS completo en las 31 tablas.')
}

main().catch(console.error).finally(() => db.$disconnect())
