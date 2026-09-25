// Fuentes del catálogo maestro HomIA: junta TODOS los archivos de datos en una
// sola lista normalizada [{ slug, name?, icon?, items, nueva?, fallback? }].
// La usan los dos seeders (seed-catalog-maestro.mjs y seed-catalog-fast.mjs)
// para que nunca se desincronicen.
//
// Categorías de la expansión 3: 'electrodomesticos' y 'plagas' (creadas en la base el 25/09/2026,
// D28). Por eso `categoriasNuevas` es true por defecto: con false los 72 elementos volverían a su
// categoría de respaldo y el seeder (upsert por nombre+categoría) los crearía DUPLICADOS.
import { CATALOG_MAESTRO } from './catalog-maestro.mjs'
import { CATALOG_EXPANSION } from './catalog-expansion.mjs'
import { CATALOG_EXP2_A } from './catalog-exp2-a.mjs'
import { CATALOG_EXP2_B } from './catalog-exp2-b.mjs'
import { CATALOG_EXP2_C } from './catalog-exp2-c.mjs'
import { CATALOG_EXP2_D } from './catalog-exp2-d.mjs'
import { CATALOG_EXP3_TECHOS } from './catalog-exp3-techos.mjs'
import { CATALOG_EXP3_PLOMERIA_GAS } from './catalog-exp3-plomeria-gas.mjs'
import { CATALOG_EXP3_ELECTRICIDAD } from './catalog-exp3-electricidad.mjs'
import { CATALOG_EXP3_REFRIGERACION } from './catalog-exp3-refrigeracion.mjs'
import { CATALOG_EXP3_JARDIN_PISCINA } from './catalog-exp3-jardin-piscina.mjs'
import { CATALOG_EXP3_ABERTURAS_CERRAJERIA } from './catalog-exp3-aberturas-cerrajeria.mjs'
import { CATALOG_EXP3_HERRERIA_HERRAMIENTAS } from './catalog-exp3-herreria-herramientas.mjs'
import { CATALOG_EXP3_ACABADOS_LIMPIEZA } from './catalog-exp3-acabados-limpieza.mjs'
import { CATALOG_EXP3_ELECTRODOMESTICOS } from './catalog-exp3-electrodomesticos.mjs'
import { CATALOG_EXP3_PLAGAS } from './catalog-exp3-plagas.mjs'
import { CATALOG_EXP4_MADERA } from './catalog-exp4-madera.mjs'

const porSlug = (m) => Object.entries(m).map(([slug, items]) => ({ slug, items }))

/** Categorías de la expansión 3 (ya existen en la base desde el 25/09/2026). */
export const CATEGORIAS_NUEVAS = [CATALOG_EXP3_ELECTRODOMESTICOS, CATALOG_EXP3_PLAGAS]

export function catalogSources({ categoriasNuevas = true } = {}) {
  const maestro = CATALOG_MAESTRO
  const exp1 = porSlug(CATALOG_EXPANSION)
  const exp2 = [CATALOG_EXP2_A, CATALOG_EXP2_B, CATALOG_EXP2_C, CATALOG_EXP2_D].flatMap(porSlug)
  const exp3 = [
    CATALOG_EXP3_TECHOS,
    CATALOG_EXP3_PLOMERIA_GAS,
    CATALOG_EXP3_ELECTRICIDAD,
    CATALOG_EXP3_REFRIGERACION,
    CATALOG_EXP3_JARDIN_PISCINA,
    CATALOG_EXP3_ABERTURAS_CERRAJERIA,
    CATALOG_EXP3_HERRERIA_HERRAMIENTAS,
    CATALOG_EXP3_ACABADOS_LIMPIEZA,
  ].flatMap(porSlug)
  // Expansión 4 (25/09/2026): maderera y carpintería de muebles.
  const exp4 = porSlug(CATALOG_EXP4_MADERA)
  const nuevas = CATEGORIAS_NUEVAS.map((c) =>
    categoriasNuevas
      ? { slug: c.slug, name: c.name, icon: c.icon, items: c.items, nueva: true, fallback: c.fallback }
      : { slug: c.fallback, items: c.items },
  )
  return [...maestro, ...exp1, ...exp2, ...exp3, ...nuevas, ...exp4]
}
