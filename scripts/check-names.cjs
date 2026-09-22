const { PrismaClient } = require('@prisma/client')
const db = new PrismaClient()

const demo = [
  'Caño PPR 20mm x4m','Sifón de lavatorio','Cinta teflón',
  'Silicona sanitaria','Bomba de agua 1/2 HP',
  'Inodoro blanco completo','Bidet blanco',
  'Cable unipolar 2.5mm x100m','Térmica bipolar 25A',
  'Diferencial 2x30mA','Toma corriente doble blanca',
  'Lámpara LED 9W E27','Tablero embutir 12 módulos',
  'Cemento Portland 50kg','Cal hidratada 25kg',
  'Ladrillo hueco 8cm','Placa yeso 9.5mm',
  'Látex interior 20L blanco','Esmalte sintético 4L',
  'Rodillo lana 22cm'
]

async function main() {
  const es = await db.catalogElement.findMany({ select: { name: true } })
  const names = new Set(es.map(e => e.name))
  for (const n of demo) {
    if (!names.has(n)) {
      const kw = n.split(' ')[0].toLowerCase()
      const sim = es.filter(e => e.name.toLowerCase().includes(kw)).slice(0, 5).map(e => e.name)
      console.log('MISS: ' + n + ' -> ' + (sim.join(', ') || 'NONE'))
    }
  }
  console.log('DONE')
}
main().finally(() => db.$disconnect())
