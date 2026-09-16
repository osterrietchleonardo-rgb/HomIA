/**
 * Matcheo tolerante de búsquedas en lenguaje natural, compartido por el
 * superagente Homy y por /api/search.
 *
 * - Saca acentos (plomeros = plómeros)
 * - Compara por tokens de ≥3 letras, ignorando palabras de relleno
 * - Recorta plurales simples (plomeros → plomero)
 * - Acepta si CUALQUIER token matchea (recall primero, la geo y las
 *   categorías afinan después)
 *
 * Así "¿qué hay para plomeros?" encuentra trabajos que dicen "plomero"
 * o "plomeria", y "precio del cemento" encuentra "Cemento Portland 50kg".
 */

const STOP_WORDS = new Set([
  'que', 'qué', 'los', 'las', 'por', 'para', 'con', 'del', 'hay', 'uno', 'una',
  'busco', 'necesito', 'quiero', 'hola', 'sobre', 'como', 'cómo', 'donde',
  'dónde', 'cuanto', 'cuánto', 'cuesta', 'sale', 'hay', 'mas', 'más',
])

export function matchTerms(query: string, haystack: string): boolean {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const tokens = norm(query)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .map((w) => (w.length > 4 ? w.replace(/s$/, '') : w))
  if (tokens.length === 0) return true
  const hay = norm(haystack)
  return tokens.some((t) => hay.includes(t))
}

/**
 * Canoniza la categoría que pasa el LLM (o la UI) a un slug real del catálogo:
 * "plomero(s)" → plomeria, "gasista" → gasistas, etc. Si no la reconoce,
 * devuelve undefined para no filtrar de más.
 */
const CATEGORIA_ALIASES: Record<string, string> = {
  plomeria: 'plomeria', plomero: 'plomeria', plomeros: 'plomeria', plomerias: 'plomeria',
  gasista: 'gasistas', gasistas: 'gasistas', gas: 'gasistas', 'gasista matriculado': 'gasistas',
  electricista: 'electricistas', electricistas: 'electricistas', electricidad: 'electricistas',
  albanil: 'albanileria', 'albañil': 'albanileria', albanileria: 'albanileria', 'albañileria': 'albanileria',
  pintor: 'pintura', pintores: 'pintura', pintura: 'pintura',
  carpintero: 'carpinteria', carpinteros: 'carpinteria', carpinteria: 'carpinteria', 'carpintería': 'carpinteria',
  herrero: 'herreria', herreria: 'herreria', 'herrería': 'herreria',
  limpiadora: 'limpieza', limpieza: 'limpieza',
  jardinero: 'jardineria', jardineros: 'jardineria', jardineria: 'jardineria', 'jardinería': 'jardineria',
  'aire acondicionado': 'climatizacion', climatizacion: 'climatizacion', 'climatización': 'climatizacion',
  techista: 'techos', techos: 'techos', techo: 'techos',
  cerrajero: 'cerramientos', cerramientos: 'cerramientos',
}

export function canonicalCategoria(raw?: string): string | undefined {
  const t = (raw || '').toLowerCase().trim().normalize('NFC')
  if (!t) return undefined
  if (CATEGORIA_ALIASES[t]) return CATEGORIA_ALIASES[t]
  // tolera plurales/variantes no mapeadas: contiene un alias conocido
  for (const [alias, slug] of Object.entries(CATEGORIA_ALIASES)) {
    if (t.includes(alias) || alias.includes(t)) return slug
  }
  return undefined
}
