// Seeder del Catálogo Maestro HomIA — idempotente
// - Upsert de categorías (mantiene slugs existentes que ya usa todo el sistema)
// - Upsert de elementos: matchea por nombre+categoría, actualiza
//   aliases/description/unit de los existentes (NO rompe ProviderStock) y crea los nuevos
import { PrismaClient } from '@prisma/client'
import { CATALOG_MAESTRO } from './catalog-maestro.mjs'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Catálogo maestro HomIA — iniciando…')
  let order = await db.category.count()
  let created = 0
  let updated = 0

  for (const cat of CATALOG_MAESTRO) {
    const category = await db.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, icon: cat.icon },
      create: {
        slug: cat.slug,
        name: cat.name,
        icon: cat.icon,
        sortOrder: order++,
      },
    })
    for (const [name, aliases, unit, description] of cat.items) {
      const existing = await db.catalogElement.findFirst({
        where: { name, categoryId: category.id },
      })
      if (existing) {
        // Solo actualiza si cambió algo (evita escrituras inútiles)
        const prev = { aliases: existing.aliases, unit: existing.unit, description: existing.description }
        const next = { aliases: JSON.stringify(aliases), unit, description }
        if (prev.aliases !== next.aliases || prev.unit !== next.unit || prev.description !== next.description) {
          await db.catalogElement.update({ where: { id: existing.id }, data: next })
          updated++
        }
      } else {
        await db.catalogElement.create({
          data: { categoryId: category.id, name, aliases: JSON.stringify(aliases), unit, description },
        })
        created++
      }
    }
  }

  const cats = await db.category.count()
  const elems = await db.catalogElement.count()
  console.log(`✅ Catálogo: ${cats} categorías, ${elems} elementos (${created} nuevos, ${updated} actualizados)`)
}

main().finally(() => db.$disconnect())
