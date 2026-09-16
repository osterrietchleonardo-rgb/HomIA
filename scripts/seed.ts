// Seed HomIA: categorías + catálogo estándar de elementos (espejo de 0011_seed_catalog.sql)
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

const CATALOG: Record<string, { icon: string; items: [string, string[]][] }> = {
  plomeria: { icon: 'droplets', items: [
    ['Caño PVC desagüe 110mm', ['caño 110', 'tubo desagüe']], ['Codo PVC 90° 110mm', ['codo 110']],
    ['Caño termofusión 25mm', ['termofusión 25', 'caño agua fría']], ['Caño termofusión 32mm', ['termofusión 32']],
    ['Llave de paso esférica 1/2"', ['llave paso', 'llave esférica']], ['Llave de paso esférica 3/4"', ['llave paso 34']],
    ['Flexible de inodoro', ['flexible toilet']], ['Depósito de inodoro completo', ['depósito', 'tanque inodoro']],
    ['Inodoro blanco completo', ['inodoro', 'vaso sanitario']], ['Bidet blanco', ['bidet']],
    ['Grifería monocomando cocina', ['canilla cocina', 'monocomando']], ['Grifería monocomando baño', ['canilla baño']],
    ['Sifón de lavatorio', ['sifón']], ['Tanque de agua 1100L', ['tanque 1100', 'cisterna']],
    ['Termotanque eléctrico 80L', ['termotanque', 'calentador agua']], ['Bomba de agua 1/2 HP', ['bomba agua', 'electrobomba']],
    ['Cinta teflón', ['teflón']], ['Taco expandido 8mm', ['tacos', 'tarugos']],
    ['Silicona sanitaria', ['silicona', 'sellador']], ['Cemento hidrófugo', ['hidrófugo']],
  ]},
  gasistas: { icon: 'flame', items: [
    ['Caño gas epoxi 25mm', ['caño gas', 'epoxi 25']], ['Caño gas epoxi 32mm', ['epoxi 32']],
    ['Codo gas 90° 25mm', ['codo gas']], ['Llave de paso gas 1/2"', ['llave gas']],
    ['Regulador de gas 10kg', ['regulador']], ['Horno empotrar a gas', ['horno gas']],
    ['Calefón a gas 14L', ['calefón']], ['Estufa tiro balanceado 5000 kcal', ['estufa balanceada', 'TBC']],
    ['Cinta teflón para gas', ['teflón gas']], ['Masilla epoxi', ['soldadura epoxi']],
  ]},
  electricistas: { icon: 'zap', items: [
    ['Cable unipolar 2.5mm x100m', ['cable 2.5', 'unipolar']], ['Cable unipolar 4mm x100m', ['cable 4']],
    ['Cable U-1000 3x2.5mm', ['cable 3x2.5']], ['Térmica bipolar 25A', ['térmica 25', 'llave térmica']],
    ['Térmica bipolar 40A', ['térmica 40']], ['Diferencial 2x30mA', ['diferencial', 'salva vidas']],
    ['Tablero embutir 12 módulos', ['tablero', 'llavero eléctrico']], ['Toma corriente doble blanco', ['toma', 'enchufe doble']],
    ['Llave interruptor simple', ['llave luz', 'interruptor']], ['Tubo corrugado 20mm x100m', ['corrugado 20', 'caño luz']],
    ['Caja de luz embutir', ['caja luz']], ['Lámpara LED 9W E27', ['led 9w', 'bombillo led']],
    ['Zócalo portátil 3x2.5', ['zócalo']], ['Cinta aisladora', ['cinta aislante']],
  ]},
  albanileria: { icon: 'brick-wall', items: [
    ['Cemento Portland 50kg', ['cemento', 'portland']], ['Cal hidratada 25kg', ['cal']],
    ['Arena gruesa m³', ['arena']], ['Ladrillo hueco 8cm', ['ladrillo hueco', 'ladrillón']],
    ['Ladrillo común 6cm', ['ladrillo']], ['Ladrillo Ceramón 18x18', ['ceramón']],
    ['Bolsa revoque fino 25kg', ['revoque', 'enduido']], ['Hierro cemento 8mm x12m', ['hierro 8', 'acero 8']],
    ['Hierro cemento 12mm x12m', ['hierro 12']], ['Alambre armar 17', ['alambre armar', 'fió armar']],
    ['Malla futures 15x15', ['malla', 'futures']], ['Placa yeso 9.5mm', ['durlock', 'placa yeso']],
    ['Perfil durlock 89mm', ['perfil 89', 'caño durlock']], ['Masilla durlock 20kg', ['masilla']],
    ['Membrana líquida 20kg', ['membrana']], ['Adhesivo cerámico 30kg', ['pegamento cerámico', 'cemento pegamento']],
  ]},
  pintura: { icon: 'paint-roller', items: [
    ['Látex interior 20L blanco', ['látex interior', 'látex 20l']], ['Látex exterior 20L', ['látex exterior']],
    ['Esmalte sintético 4L', ['esmalte', 'sintético']], ['Esmalte agua 4L', ['esmalte agua']],
    ['Enduido plástico 20kg', ['enduido']], ['Fijador sellador 4L', ['fijador', 'sellador']],
    ['Rodillo lana 22cm', ['rodillo']], ['Pincel 2"', ['pincel', 'brocha']], ['Cinta de pintor 24mm', ['cinta pintor', 'cinta azul']],
    ['Lija al agua #400', ['lija 400']], ['Barniz poliuretánico 4L', ['barniz', 'pu']],
  ]},
  carpinteria: { icon: 'hammer', items: [
    ['MDF 18mm 1.83x2.44', ['mdf 18', 'fibrofácil']], ['MDF 3mm', ['mdf 3']],
    ['Fibrocemento 4mm', ['fibrocemento']], ['Madera pino cepillado 2x4', ['pino 2x4', 'tirante pino']],
    ['Chapa puerta 0.80', ['chapa puerta']], ['Bisagra cazoleta 35mm', ['bisagra', 'bisagra cazoleta']],
    ['Corredera metálica 45cm', ['corredera', 'raíl cajón']], ['Tornillo autoperforante 6x1"', ['autoperforante', 'tornillo sheet']],
    ['Tornillo woods 8x2"', ['tornillo madera']], ['Adhesivo vinílico 1L', ['cola vinílica', 'colapebo']],
    ['Barniz madera 4L', ['barniz madera']], ['Manijón puerta', ['manijón', 'picaporte']],
  ]},
  herreria: { icon: 'wrench', items: [
    ['Perfil C 100x50 x6m', ['perfil C', 'C 100']], ['Tubo estructural 40x40', ['tubo 40', 'cuadrado 40']],
    ['Caño gas 3/4"', ['caños gas', 'tubería gas']], ['Chapa acanalada 1.10x2.50', ['chapa acanalada', 'sinusoidal']],
    ['Malla soldada 2x2', ['malla soldada']], ['Electrodo arco 2.5mm', ['soldadura arco']],
    ['Disco corte 4.5"', ['disco corte']], ['Pintura anticorrosiva 4L', ['anticorrosivo']],
    ['Bisagra puerta hierro 4"', ['bisagra hierro']], ['Candado 50mm', ['candado']],
  ]},
  limpieza: { icon: 'spray-can', items: [
    ['Lavandina 5L', ['lavandina', 'cloro']], ['Detergente 5L', ['detergente']], ['Desinfectante 5L', ['desinfectante', 'ayudín']],
    ['Escoba fibra', ['escoba']], ['Secador piso 60cm', ['secador', 'jala piso']], ['Trapo piso pack x3', ['trapo piso']],
    ['Guantes látex par', ['guantes']], ['Bolsa residuos x50', ['bolsas basura']], ['Esponja doble uso x5', ['esponja']],
    ['Limpiador multiuso 750ml', ['multiuso', 'limpiador']],
  ]},
  jardineria: { icon: 'leaf', items: [
    ['Tierra fértil 40kg', ['tierra', 'black soil']], ['Humus lombriz 10kg', ['humus']], ['Semilla césped 5kg', ['semilla césped', 'pasto']],
    ['Césped pan m²', ['pan de césped']], ['Manguera 15m', ['manguera']], ['Aspersor giratorio', ['aspersor', 'rociador']],
    ['Tijera podar', ['tijera podar']], ['Sierra mano 22"', ['sierra']], ['Abono orgánico 5kg', ['abono', 'fertilizante']],
    ['Maceta 30cm', ['maceta']], ['Pala punta', ['pala']], ['Rastrillo 14 dientes', ['rastrillo']],
  ]},
  climatizacion: { icon: 'air-vent', items: [
    ['Aire acondicionado 3000 frío/calor', ['split 3000', 'aire 3000']], ['Aire acondicionado 4500 frío/calor', ['split 4500']],
    ['Caña refrigerada 1/4"', ['caña aire', 'refrigerante 14']], ['Cable aire 2x1.5', ['cable split']],
    ['Soporte aire pared', ['soporte split']], ['Estufa eléctrica 2000W', ['estufa eléctrica']],
    ['Ventilador techo', ['ventilador']], ['Filtro aire split', ['filtro split']],
  ]},
  techos: { icon: 'home', items: [
    ['Chapa sinusoidal 1.10x4m', ['chapa sinusoidal 4m']], ['Chapa techo pintada 4m', ['chapa pintada']],
    ['Cenefa cumbrera 2m', ['cumbrera', 'cenefa']], ['Aislante telgopor 5mm', ['aislante', 'telgopor']],
    ['Tornillo autoperforante techo', ['tornillo techo', 'puntera']], ['Canaleta galvanizada 2m', ['canaleta']],
    ['Bajada de lluvia', ['bajada']], ['Membrana asfáltica 10m', ['membrana rollo']],
  ]},
  cerramientos: { icon: 'door-open', items: [
    ['Puerta aluminio 1x2.05 blanco', ['puerta aluminio']], ['Ventana aluminio 1.2x1.1', ['ventana aluminio']],
    ['Vidrio flotado 4mm m²', ['vidrio 4mm']], ['Vidrio laminado 5+5', ['vidrio laminado']],
    ['Rueda puerta placard', ['ruedas placard']], ['Felpa puerta', ['felpa']],
    ['Cerradura embutir código', ['cerradura']], ['Cerradura pintura llaves', ['cerradura simple']],
  ]},
}

async function main() {
  console.log('🌱 Seeding HomIA...')
  let order = 0
  for (const [slug, def] of Object.entries(CATALOG)) {
    const cat = await prisma.category.upsert({
      where: { slug },
      update: { icon: def.icon },
      create: { slug, name: slug.charAt(0).toUpperCase() + slug.slice(1), icon: def.icon, sortOrder: order++ },
    })
    for (const [name, aliases] of def.items) {
      const exists = await prisma.catalogElement.findFirst({ where: { name, categoryId: cat.id } })
      if (!exists) {
        await prisma.catalogElement.create({ data: { categoryId: cat.id, name, aliases: JSON.stringify(aliases) } })
      }
    }
  }
  const cats = await prisma.category.count()
  const elems = await prisma.catalogElement.count()
  console.log(`✅ ${cats} categorías, ${elems} elementos estándar`)
}

main().finally(() => prisma.$disconnect())
