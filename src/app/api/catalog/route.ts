import { NextRequest } from 'next/server'
import { z } from 'zod'
import ZAI from 'z-ai-web-dev-sdk'
import { ok, fail, parseJson, body } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

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

// ── ALTA DE ELEMENTO FALTANTE (N7.1.2) ──
// Si el proveedor no encuentra un elemento en el catálogo, lo agrega con el
// nombre técnico correcto y la IA redacta la explicación natural + aliases.
// Antes de crear, matchea contra los existentes (sin acentos, sin mayúsculas,
// por contención en nombre/alias) para no duplicar el catálogo: si ya existe
// devuelve { existing: true, element } y la UI lo selecciona directamente.

const norm = (s: string) =>
  s.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '')

const CreateElementSchema = z.object({
  name: z.string().min(3).max(80),
  categoryId: z.string().min(1),
  unit: z.string().max(20).optional(),
  aliases: z.array(z.string().max(60)).max(8).optional(),
})

const UNITES = ['unidad', 'metro', 'm2', 'm3', 'kg', 'litro', 'bolsa', 'paquete', 'caja', 'rollo', 'placa', 'par', 'juego', 'pack', 'tira', 'tambor', 'barra', 'bobina', 'millar', 'lata']

const ElementAISchema = z.object({
  description: z.string().min(20).max(400),
  aliases: z.array(z.string().min(2).max(40)).max(6).catch([]),
  unit: z.string().max(20).catch('unidad'),
})

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  if (!user.roles.includes('proveedor')) {
    return fail('Solo los proveedores pueden agregar elementos al catálogo', 403)
  }

  const rawBody = await body<unknown>(req)
  const parsed = CreateElementSchema.safeParse(rawBody)
  if (!parsed.success) return fail('Datos del elemento incompletos o inválidos', 400)
  const d = parsed.data

  const category = await db.category.findUnique({ where: { id: d.categoryId } })
  if (!category) return fail('La categoría elegida no existe', 400)

  const name = d.name.trim().replace(/\s+/g, ' ')
  const nName = norm(name)

  // ── Anti-duplicado difuso: nombre o alias existente igual / contenido ──
  const existingElements = await db.catalogElement.findMany({
    where: { categoryId: category.id, active: true },
    select: { id: true, name: true, aliases: true, unit: true, description: true },
  })
  const hit = existingElements.find((e) => {
    const aliases = parseJson<string[]>(e.aliases, [])
    const candidates = [e.name, ...aliases].map(norm)
    return candidates.some((c) => c === nName || (c.length >= 4 && nName.length >= 4 && (c.includes(nName) || nName.includes(c))))
  })
  if (hit) {
    return ok({ existing: true, element: hit, message: `Ya existe “${hit.name}” en el catálogo: lo seleccionamos para que lo publiques.` })
  }

  // ── IA: explicación natural + aliases + unidad de venta sugerida ──
  let description = ''
  let aliases = d.aliases?.map((a) => a.trim()).filter(Boolean) ?? []
  let unit = d.unit && UNITES.includes(d.unit) ? d.unit : 'unidad'
  try {
    const zai = await ZAI.create()
    const completion = await zai.chat.completions.create({
      messages: [
        {
          role: 'system',
          content:
            'Sos un experto en ferreterías, corralones y elementos del hogar de Argentina. Dado el nombre de un elemento y su categoría, respondés SOLO con un JSON válido: {"description": "explicación natural de 1 a 2 oraciones: qué es, para qué sirve y dónde se usa, en español rioplatense, sin tecnicismos innecesarios", "aliases": ["cómo lo llama la gente en Argentina", "otros nombres o apodos del rubro"], "unit": "unidad de venta típica: unidad|metro|m2|m3|kg|litro|bolsa|paquete|caja|rollo|placa|par|juego|pack|tira|tambor|barra|bobina|millar|lata"}. No inventes marcas.',
        },
        {
          role: 'user',
          content: `Elemento: "${name}"\nCategoría: ${category.name}`,
        },
      ],
    })
    const raw = completion.choices[0]?.message?.content || ''
    const jsonStr = raw.slice(raw.indexOf('{'), raw.lastIndexOf('}') + 1)
    const ai = ElementAISchema.safeParse(JSON.parse(jsonStr))
    if (ai.success) {
      description = ai.data.description
      if (aliases.length === 0) aliases = ai.data.aliases
      if (!d.unit && UNITES.includes(ai.data.unit)) unit = ai.data.unit
    }
  } catch {
    // IA no disponible → descripción honesta genérica (no inventamos contenido)
  }
  if (!description) {
    description = `Elemento del rubro ${category.name.toLowerCase()}. Se vende por ${unit}; consultá al proveedor por las características exactas.`
  }

  const element = await db.catalogElement.create({
    data: {
      categoryId: category.id,
      name,
      aliases: JSON.stringify(aliases.slice(0, 6)),
      description,
      unit,
      active: true,
    },
  })

  return ok({
    existing: false,
    element: { id: element.id, name: element.name, aliases, description: element.description, unit: element.unit },
    message: 'Elemento agregado al catálogo con explicación de la IA',
  })
}
