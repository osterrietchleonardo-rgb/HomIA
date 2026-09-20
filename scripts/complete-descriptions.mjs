// Completa las descripciones que faltaban en elementos del catálogo original (pre-maestro)
import { PrismaClient } from '@prisma/client'
const db = new PrismaClient()

const DESCS = [
  ['plomeria', 'Taco expandido 8mm', 'Taco plástico de expansión de ocho milímetros para fijar cosas a la pared: se perfora, se mete y el tornillo lo abre por dentro. El anclaje de toda la vida.'],
  ['plomeria', 'Cemento hidrófugo', 'Cemento con aditivo repelente al agua para tanques, muros húmedos y bases donde el agua no puede pasar. La mezcla impermeable por dentro.'],
  ['electricistas', 'Toma corriente doble blanco', 'Toma de pared de dos bocas en blanco: la de toda la casa. Recambio directo con dos tornillos y nada más.'],
  ['albanileria', 'Bolsa revoque fino 25kg', 'Mezcla lista para la capa fina del revoque: la que queda a la vista y se pinta. Solo agregás agua y llana.'],
  ['albanileria', 'Placa yeso 9.5mm', 'Placa de yeso estándar de nueve milímetros para tabiques y cielorrasos livianos. La base del durlock de siempre.'],
  ['albanileria', 'Perfil durlock 89mm', 'Perfil galvanizado de ochenta y nueve milímetros para tabiques de durlock con cañerías de medio uso adentro.'],
  ['albanileria', 'Masilla durlock 20kg', 'Masilla para embeber las juntas entre placas de durlock: se aplica con llana sobre la cinta y deja el tabique continuo.'],
  ['albanileria', 'Membrana líquida 20kg', 'Impermeabilizante que se pinta como látex y forma una capa elástica sobre techos y baños: cubre todo, sin juntas ni rollos.'],
  ['albanileria', 'Adhesivo cerámico 30kg', 'Cemento pegamento para cerámicos: se mezcla con agua, se peina con llana dentada y la pieza queda firme por décadas.'],
  ['carpinteria', 'MDF 18mm 1.83x2.44', 'Placa de fibra de madera de dieciocho milímetros, el estándar para muebles: aguantan herrajes, se corta y se laquea como quieras.'],
  ['carpinteria', 'MDF 3mm', 'Placa MDF finita para fondos de muebles, cajones y decoración: liviana, pareja y fácil de cortar.'],
  ['carpinteria', 'Fibrocemento 4mm', 'Placa de cemento con fibras de cuatro milímetros para revestimientos que aguantan agua y fuego: fachadas y zonas húmedas.'],
  ['carpinteria', 'Madera pino cepillado 2x4', 'Tirante de pino cepillado de dos por cuatro pulgadas, liso y listo para usar: estructura de muebles, estantes y marcos.'],
  ['carpinteria', 'Chapa puerta 0.80', 'Hoja de puerta de chapa de ochenta centímetros: la de baño y dormitorio de toda la vida, se coloca con tres bisagras y listo.'],
  ['carpinteria', 'Tornillo autoperforante 6x1"', 'Tornillo que taladra y rosca solo: para placas de durlock sobre perfil, chapa y madera fina.'],
  ['carpinteria', 'Tornillo woods 8x2"', 'Tornillo para madera de dos pulgadas con rosca gruesa: agarra firme en pino, MDF y estructuras de casa.'],
  ['carpinteria', 'Barniz madera 4L', 'Barniz en lata familiar para proteger y realzar la madera de puertas, muebles y pisos: brillo o satinado según el gusto.'],
  ['carpinteria', 'Manijón puerta', 'Manijón de repuesto para puertas interiores: se cambia con dos tornillos y la puerta queda como nueva.'],
  ['herreria', 'Caño gas 3/4"', 'Caño de hierro galvanizado de tres cuartos para líneas de gas tradicionales roscadas: se sella con teflón para gas y pasta.'],
  ['jardineria', 'Sierra mano 22"', 'Sierra de mano de veintidós pulgadas para podar ramas gruesas y cortar madera en el jardín: dientes resistentes y mango firme.'],
  ['jardineria', 'Pala punta', 'Pala de punta para cavar, transplantar y mover tierra: la herramienta madre de todo jardín y obra.'],
  ['climatizacion', 'Ventilador de techo', 'Ventilador de techo con tres palas para refrescar la habitación entera: silencioso, eterno y con menos consumo que un aire.'],
  ['techos', 'Chapa techo pintada 4m', 'Chapa prepintada de cuatro metros para techos: color que no se pinta nunca y cobertura larga en un solo tirón.'],
  ['techos', 'Bajada de lluvia', 'Caño que lleva el agua de la canaleta al piso: la parte del techo que salva las paredes de las manchas.'],
  ['techos', 'Membrana asfáltica 10m', 'Rollo de membrana asfáltica de diez metros para impermeabilizar techos: se pega con soplete o autoadhesiva y sella de verdad.'],
  ['cerramientos', 'Puerta aluminio 1x2.05 blanco', 'Puerta de aluminio blanca de un metro por dos con cinco: no se oxida, no se pinta y corre o abre según el modelo.'],
  ['cerramientos', 'Rueda puerta placard', 'Rueda de repuesto para puertas corredizas de placard: se cambia con destornillador y la puerta vuelve a correr suave.'],
  ['cerramientos', 'Felpa puerta', 'Cinta de felpa para el encuentro entre puerta y marco: corta el viento, el polvo y el ruido de la calle.'],
  ['cerramientos', 'Cerradura pintura llaves', 'Cerradura simple de sobreponer o embutir con llaves comunes: la de los cuartos y puertas interiores de siempre.'],
]

let done = 0
for (const [slug, name, desc] of DESCS) {
  const cat = await db.category.findUnique({ where: { slug } })
  if (!cat) { console.error('categoría no encontrada:', slug); continue }
  const el = await db.catalogElement.findFirst({ where: { name, categoryId: cat.id } })
  if (!el) { console.error('elemento no encontrado:', slug, name); continue }
  if (el.description && el.description.length > 0) { done++; continue }
  await db.catalogElement.update({ where: { id: el.id }, data: { description: desc } })
  done++
}
console.log(`Descripciones completadas: ${done}/${DESCS.length}`)
const remaining = await db.catalogElement.count({ where: { description: '' } })
console.log('Sin descripción restantes:', remaining)

async function main() {}
