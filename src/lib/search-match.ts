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

/** Igual que matchTerms pero devuelve CUÁNTOS tokens matchean (para rankear
 *  recomendaciones: más tokens matcheados = más relevante el elemento). */
export function matchScore(query: string, haystack: string): number {
  const norm = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const tokens = norm(query)
    .split(/[^a-z0-9ñ]+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w))
    .map((w) => (w.length > 4 ? w.replace(/s$/, '') : w))
  if (tokens.length === 0) return 0
  const hay = norm(haystack)
  let hits = 0
  for (const t of tokens) if (hay.includes(t)) hits++
  return hits
}

/**
 * Traduce necesidades en lenguaje natural a términos técnicos del catálogo:
 * "tengo humedad en el techo" → membrana / impermeabilización / goteras.
 * El agente de IA usa esta expansión para recomendar los elementos JUSTOS
 * cuando el usuario no sabe cómo se llama lo que necesita.
 */
const NEED_SYNONYMS: [RegExp, string][] = [
  [/humedades?\b|goter\w*|filtra\w*|infiltra\w*/, 'impermeabil membran filtracion gotera sella hidrofugo'],
  [/tapa\w* hueco|tapar|emparchar|rajadura|grieta/, 'masilla sellador silicona enduido yeso'],
  [/pegar|adherir|pega\b|despeg/, 'adhesivo cola pegamento silicona epoxi contacto'],
  [/colgar|afirmar|fijar|sostener|anclar|sujeta\w*/, 'taco tornillo tirafondo bulon tarugo'],
  [/unir ca[ñn]o|conectar ca[ñn]o|derivar|empalmar/, 'codo tee union niple'],
  [/abriga\w*|frio|calor|calefaccio\w*|clima\w*/, 'aislante lana estufa aire split calefactor panel'],
  [/ruido|insonori\w*|acustic\w*/, 'lana vidrio aislante acustica'],
  [/ilumin\w*|luz|lampara|l[áa]mpara|ver poco|oscuro/, 'led lampara tubo proyector panel aplique'],
  [/cortar/, 'amoladora sierra disco corte'],
  [/perforar|taladrar|agujero/, 'taladro broca percutor sierra copa'],
  [/pintar|pintura/, 'latex esmalte rodillo pincel enduido fijador'],
  [/olor|ventila\w*|moho/, 'extractor desodorante sifon limpiador antihongos'],
  [/ordenar|guardar|organiz\w*/, 'estanteria rack placard organizador'],
  [/segur\w*|protecc\w*|obra protege/, 'casco guantes antiparras arnes extintor'],
  [/regar|riego|agua jardin/, 'manguera aspersor goteo regadera'],
]

/** Expande una consulta de necesidad con sinónimos técnicos del catálogo. */
export function expandNeedQuery(q: string): string {
  const extra: string[] = []
  const t = (q || '').toLowerCase()
  for (const [re, syn] of NEED_SYNONYMS) {
    if (re.test(t)) extra.push(syn)
  }
  return extra.length ? `${q} ${extra.join(' ')}` : q
}

/**
 * Canoniza la categoría que pasa el LLM (o la UI) a un slug real del catálogo:
 * "plomero(s)" → plomeria, "gasista" → gasistas, etc. Si no la reconoce,
 * devuelve undefined para no filtrar de más.
 */
const CATEGORIA_ALIASES: Record<string, string> = {
  plomeria: 'plomeria', plomero: 'plomeria', plomeros: 'plomeria', plomerias: 'plomeria',
  sanitarios: 'plomeria',
  gasista: 'gasistas', gasistas: 'gasistas', gas: 'gasistas', 'gasista matriculado': 'gasistas',
  electricista: 'electricistas', electricistas: 'electricistas', electricidad: 'electricistas',
  albanil: 'albanileria', 'albañil': 'albanileria', albanileria: 'albanileria', 'albañileria': 'albanileria',
  corralon: 'albanileria', 'corralón': 'albanileria', 'corralones': 'albanileria',
  durlock: 'durlock', 'chapa seca': 'durlock', yeso: 'durlock',
  pintor: 'pintura', pintores: 'pintura', pintura: 'pintura', pintureria: 'pintura', 'pinturería': 'pintura',
  carpintero: 'carpinteria', carpinteros: 'carpinteria', carpinteria: 'carpinteria', 'carpintería': 'carpinteria',
  maderera: 'maderera', madera: 'maderera',
  herrero: 'herreria', herreria: 'herreria', 'herrería': 'herreria',
  ferreteria: 'herreria', 'ferretería': 'herreria', ferretero: 'herreria',
  herramientas: 'herramientas', herramienta: 'herramientas',
  limpiadora: 'limpieza', limpieza: 'limpieza',
  jardinero: 'jardineria', jardineros: 'jardineria', jardineria: 'jardineria', 'jardinería': 'jardineria',
  'aire acondicionado': 'climatizacion', climatizacion: 'climatizacion', 'climatización': 'climatizacion', clima: 'climatizacion',
  techista: 'techos', techos: 'techos', techo: 'techos',
  cerrajero: 'cerramientos', cerramientos: 'cerramientos', aberturas: 'cerramientos', abertura: 'cerramientos',
  pisos: 'pisos', piso: 'pisos', ceramista: 'pisos', 'colocador de cerámicos': 'pisos', revestimientos: 'pisos',
  aislacion: 'aislacion', 'aislación': 'aislacion', aislante: 'aislacion',
  iluminacion: 'iluminacion', 'iluminación': 'iluminacion', luminarias: 'iluminacion',
  muebles: 'muebles', muebleria: 'muebles', 'mueblería': 'muebles', equipamiento: 'muebles',
  seguridad: 'seguridad', 'elementos de seguridad': 'seguridad',
}

/** Slugs válidos de tipo de negocio del proveedor (ProviderProfile.kind). */
export const PROVIDER_KINDS: Record<string, string> = {
  corralon: 'Corralón', ferreteria: 'Ferretería', electricidad: 'Casa de electricidad',
  pintura: 'Pinturería', sanitarios: 'Sanitarios', gas: 'Casa de gas',
  maderera: 'Maderera', carpinteria: 'Carpintería', aberturas: 'Aberturas',
  techos: 'Techos e impermeabilización', jardin: 'Jardinería', limpieza: 'Artículos de limpieza',
  climatizacion: 'Climatización', herramientas: 'Herramientas', muebles: 'Muebles',
  pisos: 'Pisos y revestimientos', seguridad: 'Seguridad e industrial', multi: 'Multiproducto',
}

export function canonicalProviderKind(raw?: string): string | undefined {
  const t = (raw || '').toLowerCase().trim()
  if (!t) return undefined
  if (PROVIDER_KINDS[t]) return t
  // tolera variantes: "casa de electricidad" → electricidad, "corralón" → corralon
  const norm = (s: string) => s.normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const nt = norm(t)
  for (const key of Object.keys(PROVIDER_KINDS)) {
    if (norm(key) === nt) return key
  }
  // coincidencia parcial con labels
  for (const [key, label] of Object.entries(PROVIDER_KINDS)) {
    const nl = norm(label.toLowerCase())
    if (nl.includes(nt) || nt.includes(nl)) return key
  }
  return undefined
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
