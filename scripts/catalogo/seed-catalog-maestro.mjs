// Seeder del Catálogo Maestro HomIA — idempotente
// - Categorías: mantiene los slugs existentes (los usa todo el sistema); crea
//   las que falten al final del orden.
// - Elementos: matchea por nombre+categoría; actualiza aliases/description/unit
//   de los existentes solo si cambiaron (NO toca ProviderStock) y crea los nuevos.
// - Lee la base una vez y escribe en lotes (la base está lejos: pocas idas).
//
// Uso (desde la raíz; la base del .env es PRODUCCIÓN):
//   node --env-file=.env scripts/catalogo/seed-catalog-maestro.mjs --dry-run
//       → simula: lee la base y muestra qué crearía/actualizaría, SIN escribir.
//   node --env-file=.env scripts/catalogo/seed-catalog-maestro.mjs
//       → carga de verdad (necesita OK del dueño).
//   'electrodomesticos' y 'plagas' se usan SIEMPRE (existen desde el 25/09/2026, D28); la opción
//   --categorias-nuevas queda solo por compatibilidad y no cambia nada.
import { PrismaClient } from '@prisma/client'
import { catalogSources } from './fuentes.mjs'

const DRY = process.argv.includes('--dry-run')
const CATEGORIAS_NUEVAS = true // D28: ya existen; con false se duplicarían 72 elementos
const db = new PrismaClient()

async function main() {
  console.log(`🌱 Catálogo maestro HomIA — ${DRY ? 'SIMULACIÓN (--dry-run, no escribe nada)' : 'CARGA REAL'}${CATEGORIAS_NUEVAS ? ' · con categorías nuevas' : ''}`)
  const sources = catalogSources({ categoriasNuevas: CATEGORIAS_NUEVAS })

  // ── Categorías ──
  const cats = await db.category.findMany()
  const catBySlug = new Map(cats.map((c) => [c.slug, c]))
  let nextOrder = cats.reduce((m, c) => Math.max(m, c.sortOrder), -1) + 1
  const catCreates = []
  const catUpdates = []
  for (const src of sources) {
    const ex = catBySlug.get(src.slug)
    if (!ex) {
      const data = { slug: src.slug, name: src.name || src.slug, icon: src.icon || 'wrench', sortOrder: nextOrder++ }
      catCreates.push(data)
      catBySlug.set(src.slug, { id: `(nueva:${src.slug})`, ...data })
    } else if (src.name && (ex.name !== src.name || ex.icon !== src.icon)) {
      catUpdates.push({ id: ex.id, slug: src.slug, name: src.name, icon: src.icon })
      catBySlug.set(src.slug, { ...ex, name: src.name, icon: src.icon })
    }
  }
  if (!DRY) {
    for (const c of catCreates) {
      const row = await db.category.create({ data: c })
      catBySlug.set(c.slug, row)
    }
    for (const c of catUpdates) await db.category.update({ where: { id: c.id }, data: { name: c.name, icon: c.icon } })
  }

  // ── Elementos ──
  const existing = await db.catalogElement.findMany({
    select: { id: true, name: true, categoryId: true, aliases: true, unit: true, description: true },
  })
  const byKey = new Map(existing.map((e) => [`${e.categoryId}||${e.name}`, e]))
  const toCreate = []
  const toUpdate = []
  const toMove = []
  const seen = new Set()
  const porCat = {} // slug → { nuevos, actualizados, movidos }
  const bump = (slug, k) => { (porCat[slug] ??= { nuevos: 0, actualizados: 0, movidos: 0 })[k]++ }

  for (const src of sources) {
    const categoryId = catBySlug.get(src.slug).id
    const fallbackId = src.nueva && src.fallback ? catBySlug.get(src.fallback)?.id : undefined
    for (const [name, aliases, unit, description] of src.items) {
      const key = `${categoryId}||${name}`
      if (seen.has(key)) continue // misma entrada repetida en dos fuentes: se procesa una vez
      seen.add(key)
      const next = { aliases: JSON.stringify(aliases), unit, description }
      const ex = byKey.get(key)
      if (ex) {
        if (ex.aliases !== next.aliases || ex.unit !== next.unit || ex.description !== next.description) {
          toUpdate.push({ id: ex.id, name, ...next })
          bump(src.slug, 'actualizados')
        }
        continue
      }
      const enRespaldo = fallbackId ? byKey.get(`${fallbackId}||${name}`) : undefined
      if (enRespaldo) {
        // Categoría nueva activada: se mueve el elemento (mismo id → el stock sigue intacto)
        toMove.push({ id: enRespaldo.id, name, categoryId, ...next })
        bump(src.slug, 'movidos')
        continue
      }
      toCreate.push({ categoryId, name, ...next, _slug: src.slug })
      bump(src.slug, 'nuevos')
    }
  }

  console.log(`\nCategorías: ${cats.length} en la base · ${catCreates.length} a crear · ${catUpdates.length} a actualizar`)
  for (const c of catCreates) console.log(`  + ${c.slug} «${c.name}» (ícono ${c.icon}, orden ${c.sortOrder})`)
  for (const c of catUpdates) console.log(`  ~ ${c.slug} → «${c.name}» (${c.icon})`)
  console.log(`Elementos: ${existing.length} en la base · ${toCreate.length} nuevos · ${toUpdate.length} a actualizar · ${toMove.length} a mover`)
  const filas = Object.entries(porCat).sort((a, b) => a[0].localeCompare(b[0]))
  for (const [slug, n] of filas) console.log(`  ${slug.padEnd(18)} +${n.nuevos}${n.actualizados ? ` ~${n.actualizados}` : ''}${n.movidos ? ` →${n.movidos}` : ''}`)
  if (toUpdate.length) console.log('  Actualizaría:', toUpdate.slice(0, 20).map((u) => u.name).join(' | '))

  if (DRY) {
    console.log(`\nSimulación terminada: la base quedaría con ${existing.length + toCreate.length} elementos. No se escribió nada.`)
    return
  }

  const CHUNK = 100
  for (let i = 0; i < toCreate.length; i += CHUNK) {
    const chunk = toCreate.slice(i, i + CHUNK).map(({ _slug, ...d }) => d)
    await db.catalogElement.createMany({ data: chunk })
    console.log(`  creados ${Math.min(i + CHUNK, toCreate.length)}/${toCreate.length}`)
  }
  const cambios = [
    ...toUpdate.map(({ id, aliases, unit, description }) => ({ id, data: { aliases, unit, description } })),
    ...toMove.map(({ id, categoryId, aliases, unit, description }) => ({ id, data: { categoryId, aliases, unit, description } })),
  ]
  for (let i = 0; i < cambios.length; i += 50) {
    const chunk = cambios.slice(i, i + 50)
    await db.$transaction(chunk.map(({ id, data }) => db.catalogElement.update({ where: { id }, data })))
    console.log(`  actualizados/movidos ${Math.min(i + 50, cambios.length)}/${cambios.length}`)
  }
  const total = await db.catalogElement.count()
  const totalCats = await db.category.count()
  console.log(`\n✅ Catálogo: ${totalCats} categorías, ${total} elementos (${toCreate.length} nuevos, ${toUpdate.length} actualizados, ${toMove.length} movidos)`)
}

main()
  .catch((e) => { console.error(e); process.exitCode = 1 })
  .finally(() => db.$disconnect())
