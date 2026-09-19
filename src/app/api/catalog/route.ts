import { ok } from '@/lib/api'
import { db } from '@/lib/db'
import { parseJson } from '@/lib/api'

// Catálogo estándar de elementos (para formularios, stock, buscador y agente IA)
// Devuelve también la descripción natural (qué es, para qué sirve) para que la
// UI pueda explicar cada elemento y la IA pueda recomendarlo por necesidad.
export async function GET() {
  const categories = await db.category.findMany({
    orderBy: { sortOrder: 'asc' },
    include: { elements: { where: { active: true }, orderBy: { name: 'asc' } } },
  })
  return ok({
    categories: categories.map((c) => ({
      id: c.id,
      slug: c.slug,
      name: c.name,
      icon: c.icon,
      elements: c.elements.map((e) => ({
        id: e.id,
        name: e.name,
        aliases: parseJson<string[]>(e.aliases, []),
        description: e.description,
        unit: e.unit,
      })),
    })),
  })
}
