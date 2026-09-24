// Seeder del Catálogo Maestro HomIA — optimizado para Supabase remoto
// Usa $transaction con batch para minimizar roundtrips
import { PrismaClient } from '@prisma/client'
import { CATALOG_MAESTRO } from './catalog-maestro.mjs'
import { CATALOG_EXPANSION } from './catalog-expansion.mjs'
import { CATALOG_EXP2_A } from './catalog-exp2-a.mjs'
import { CATALOG_EXP2_B } from './catalog-exp2-b.mjs'
import { CATALOG_EXP2_C } from './catalog-exp2-c.mjs'
import { CATALOG_EXP2_D } from './catalog-exp2-d.mjs'

const db = new PrismaClient()

async function main() {
  console.log('🌱 Catálogo maestro HomIA — iniciando (modo batch)…')

  // Normaliza todas las fuentes
  const expansion = Object.entries(CATALOG_EXPANSION).map(([slug, items]) => ({ slug, items }))
  const exp2 = [CATALOG_EXP2_A, CATALOG_EXP2_B, CATALOG_EXP2_C, CATALOG_EXP2_D]
    .flatMap((m) => Object.entries(m).map(([slug, items]) => ({ slug, items })))
  const sources = [...CATALOG_MAESTRO, ...expansion, ...exp2]

  // Paso 1: Upsert categorías (son pocas, ~20)
  let order = await db.category.count()
  const catMap = {} // slug -> id
  for (const cat of sources) {
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
    catMap[cat.slug] = category.id
  }
  console.log(`  ✅ ${Object.keys(catMap).length} categorías sincronizadas`)

  // Paso 2: Obtener elementos existentes (1 query)
  const existing = await db.catalogElement.findMany({
    select: { id: true, name: true, categoryId: true, aliases: true, unit: true, description: true }
  })
  const existingMap = new Map()
  for (const e of existing) {
    existingMap.set(`${e.categoryId}||${e.name}`, e)
  }
  console.log(`  📦 ${existing.length} elementos existentes en la DB`)

  // Paso 3: Preparar creates y updates
  const toCreate = []
  const toUpdate = []

  for (const cat of sources) {
    const categoryId = catMap[cat.slug]
    if (!categoryId) continue
    for (const [name, aliases, unit, description] of cat.items) {
      const key = `${categoryId}||${name}`
      const ex = existingMap.get(key)
      if (ex) {
        const next = { aliases: JSON.stringify(aliases), unit, description }
        if (ex.aliases !== next.aliases || ex.unit !== next.unit || ex.description !== next.description) {
          toUpdate.push({ id: ex.id, ...next })
        }
      } else {
        toCreate.push({ categoryId, name, aliases: JSON.stringify(aliases), unit, description })
      }
    }
  }

  console.log(`  🆕 ${toCreate.length} elementos nuevos a crear`)
  console.log(`  🔄 ${toUpdate.length} elementos a actualizar`)

  // Paso 4: Crear en batch (chunks de 100 para no exceder límites)
  const CHUNK = 100
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const chunk = toCreate.slice(i, i + CHUNK)
    await db.catalogElement.createMany({ data: chunk, skipDuplicates: true })
    console.log(`    creados ${Math.min(i + CHUNK, toCreate.length)}/${toCreate.length}`)
  }

  // Paso 5: Updates en transacción (chunks de 50)
  for (let i = 0; i < toUpdate.length; i += 50) {
    const chunk = toUpdate.slice(i, i + 50)
    await db.$transaction(
      chunk.map(({ id, ...data }) => db.catalogElement.update({ where: { id }, data }))
    )
    console.log(`    actualizados ${Math.min(i + 50, toUpdate.length)}/${toUpdate.length}`)
  }

  const cats = await db.category.count()
  const elems = await db.catalogElement.count()
  console.log(`\n✅ Catálogo: ${cats} categorías, ${elems} elementos`)
}

main().catch(console.error).finally(() => db.$disconnect())
