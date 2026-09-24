// Seeder del Catálogo Maestro HomIA — idempotente
// - Upsert de categorías (mantiene slugs existentes que ya usa todo el sistema)
// - Upsert de elementos: matchea por nombre+categoría, actualiza
//   aliases/description/unit de los existentes (NO rompe ProviderStock) y crea los nuevos
import { PrismaClient } from '@prisma/client'
import { CATALOG_MAESTRO } from './catalog-maestro.mjs'
import { CATALOG_EXPANSION } from './catalog-expansion.mjs'
import { CATALOG_EXP2_A } from './catalog-exp2-a.mjs'
import { CATALOG_EXP2_B } from './catalog-exp2-b.mjs'
import { CATALOG_EXP2_C } from './catalog-exp2-c.mjs'
import { CATALOG_EXP2_D } from './catalog-exp2-d.mjs'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Catálogo maestro HomIA — iniciando…')
  let order = await db.category.count()
  let created = 0
  let updated = 0

  // Normaliza todas las fuentes a la misma forma: [{slug, name, icon, items}]
  const expansion = Object.entries(CATALOG_EXPANSION).map(([slug, items]) => ({ slug, items }))
  const exp2 = [CATALOG_EXP2_A, CATALOG_EXP2_B, CATALOG_EXP2_C, CATALOG_EXP2_D]
    .flatMap((m) => Object.entries(m).map(([slug, items]) => ({ slug, items })))
  const sources = [...CATALOG_MAESTRO, ...expansion, ...exp2]

  for (const cat of sources) {
    // La expansión refuerza categorías ya creadas por el maestro: si no existe
    // aún (orden distinto), la crea con datos genéricos sin pisar nada.
    const category = await db.category.upsert({
      where: { slug: cat.slug },
      update: cat.name ? { name: cat.name, icon: cat.icon } : {},
      create: {
        slug: cat.slug,
        name: cat.name || cat.slug,
        icon: cat.icon || 'wrench',
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
