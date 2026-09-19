// Actualización incremental N6 — catálogo maestro + tipos de negocio
// 1) Asigna 'kind' al proveedor demo (Ferretería Ferrer Hnos.)
// 2) Publica stock en las categorías nuevas del catálogo maestro
import { PrismaClient } from '@prisma/client'

const db = new PrismaClient()
const D = (days) => new Date(Date.now() - Math.round(days) * 86400000)

const NEW_STOCK = [
  ['Taladro percutor 650W', 58900, 14, 4, 'Bosch'], ['Amoladora angular 4.5"', 42900, 9, 3, 'DeWalt'],
  ['Nivel de aluminio 60cm', 7800, 22, 6, 'Akari'], ['Cinta métrica 5m', 3200, 35, 10, 'Stanley'],
  ['Chapa sinusoidal 1.10x4m', 18900, 85, 20, 'Tecno'], ['Membrana líquida 20kg', 34500, 12, 4, 'Alba'],
  ['Canaleta galvanizada 2m', 5400, 30, 8, 'Tecno'], ['Tornillo autoperforante techo', 890, 400, 80, 'Dexel'],
  ['MDF 18mm 1.83x2.44', 38900, 18, 5, 'KelForm'], ['Pino cepillado 2x4 x3m', 7400, 60, 15, 'Pino Argentino'],
  ['Deck madera 2.5x14', 9800, 120, 30, 'Incorsa'], ['Porcelanato m²', 15900, 240, 50, 'Ilva'],
  ['Adhesivo cerámico 30kg', 8900, 45, 12, 'Falso Uno'], ['Tierra fértil 40kg', 2200, 90, 20, 'Naturverde'],
  ['Manguera 15m', 8900, 25, 6, 'Bahía'], ['Guantes nylon con nitrilo', 1450, 60, 15, '3M'],
  ['Extintor ABC 2.5kg', 32000, 8, 3, 'Fextex'], ['Casco de obra', 5600, 20, 6, 'Alba'],
]

async function main() {
  const prv = await db.providerProfile.findFirst({ orderBy: { createdAt: 'asc' } })
  if (!prv) { console.log('sin proveedor demo'); return }
  await db.providerProfile.update({ where: { id: prv.id }, data: { kind: 'ferreteria' } })
  console.log(`✔ kind=ferreteria → ${prv.businessName}`)

  const elems = await db.catalogElement.findMany({ include: { category: true } })
  let created = 0
  for (const [name, price, qty, min, brand] of NEW_STOCK) {
    const el = elems.find((x) => x.name === name)
    if (!el) { console.log(`⚠ elemento no encontrado: ${name}`); continue }
    const dup = await db.providerStock.findUnique({ where: { providerId_elementId: { providerId: prv.id, elementId: el.id } } })
    if (dup) continue
    const status = qty <= 0 ? 'agotado' : qty <= min ? 'por_agotar' : 'disponible'
    await db.providerStock.create({
      data: { providerId: prv.id, elementId: el.id, price, quantity: qty, minStock: min, status, brand, createdAt: D(90), updatedAt: D(Math.random() * 20) },
    })
    created++
  }
  const total = await db.providerStock.count({ where: { providerId: prv.id } })
  console.log(`✔ stock nuevo publicado: ${created} · total stock del proveedor: ${total}`)
}

main().finally(() => db.$disconnect())
