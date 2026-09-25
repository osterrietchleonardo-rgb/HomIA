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
 * Puntaje para elegir un elemento del catálogo: las palabras que coinciden en el NOMBRE o en sus
 * aliases pesan más que las que solo aparecen en la descripción, y el nombre que empieza con la
 * búsqueda suma un poco más. Con el catálogo de 1764 elementos, "cemento" traía 39 resultados
 * empatados en orden alfabético y "Cemento Portland 50kg" quedaba afuera de los 12 primeros.
 * 0 = no coincide (mismo criterio de filtro que matchScore sobre todo el texto).
 */
export function catalogScore(query: string, e: { name: string; aliases?: string[] | null; description?: string | null }): number {
  const todo = matchScore(query, [e.name, ...(e.aliases || []), e.description || ''].join(' '))
  if (todo === 0) return 0
  const enNombre = matchScore(query, [e.name, ...(e.aliases || [])].join(' '))
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim()
  const empieza = norm(e.name).startsWith(norm(query).split(/\s+/)[0] || '#') ? 1 : 0
  // Las medidas cortas ("mdf 18", "fenólico 9") no llegan a 3 letras y matchScore las ignora: si el
  // número aparece en el nombre o los aliases como medida entera, suma ("18" pega con "18mm" o
  // "18 mm", no con "1,83" ni con "180"). Así "mdf 18" trae primero el MDF de 18 mm.
  const nombreYAlias = norm([e.name, ...(e.aliases || [])].join(' '))
  const medidas = norm(query).match(/\d+(?:[.,]\d+)?/g) || []
  const medida = medidas.filter((m) =>
    new RegExp(`(^|[^0-9.,])${m.replace(/[.,]/g, '[.,]')}(?![0-9]|[.,][0-9])`).test(nombreYAlias),
  ).length
  return todo * 10 + enNombre * 6 + empieza * 3 + medida * 5
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
  maderera: 'maderera', madera: 'maderera', aserradero: 'maderera', 'corralón de maderas': 'maderera',
  // Expansión 4 del catálogo (25/09/2026): oficios de la madera que se buscan con otro nombre.
  mueblero: 'carpinteria', muebleros: 'carpinteria', ebanista: 'carpinteria', ebanistas: 'carpinteria',
  ebanisteria: 'carpinteria', 'ebanistería': 'carpinteria', 'carpintero de muebles': 'carpinteria', 'lustrador de muebles': 'carpinteria',
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
  // Rubros sumados con la expansión 3 del catálogo (25/09/2026), con categorías propias para
  // plagas y repuestos de electrodomésticos (aprobadas por Leonardo el 25/09/2026).
  fumigador: 'plagas', fumigadores: 'plagas', fumigacion: 'plagas', 'fumigación': 'plagas', plagas: 'plagas', 'control de plagas': 'plagas', desinsectador: 'plagas', desratizacion: 'plagas', desratizador: 'plagas', 'desinsectación': 'plagas',
  alfombras: 'limpieza', tapizados: 'limpieza', 'limpieza de alfombras': 'limpieza',
  electrodomesticos: 'electrodomesticos', 'electrodomésticos': 'electrodomesticos', electrodomestico: 'electrodomesticos', 'tecnico en electrodomesticos': 'electrodomesticos', 'técnico en electrodomésticos': 'electrodomesticos', lavarropas: 'electrodomesticos', 'service de lavarropas': 'electrodomesticos',
  refrigeracion: 'climatizacion', 'refrigeración': 'climatizacion', 'tecnico en refrigeracion': 'climatizacion', 'técnico en refrigeración': 'climatizacion', refrigerista: 'climatizacion', heladera: 'climatizacion',
  cerrajeria: 'cerramientos', 'cerrajería': 'cerramientos', vidrieria: 'cerramientos', 'vidriería': 'cerramientos', vidriero: 'cerramientos',
  techador: 'techos', impermeabilizacion: 'techos', 'impermeabilización': 'techos',
  pileta: 'jardineria', piscina: 'jardineria', piletero: 'jardineria', parquizacion: 'jardineria', 'cortador de pasto': 'jardineria', riego: 'jardineria',
  alarmas: 'seguridad', camaras: 'seguridad', 'cámaras': 'seguridad', cctv: 'seguridad',
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
  // Tolera frases y variantes: busca un alias conocido como PALABRA COMPLETA dentro del texto y
  // se queda con el más largo ("control de plagas" → plagas/limpieza, no "gas" → gasistas, que
  // pasaba al buscar por "contiene"). Sin tildes ni mayúsculas. Si el texto es un pedazo de un
  // alias ("electri"), solo cuenta con 4 letras o más.
  const sinTildes = (x: string) => x.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  const tt = ` ${sinTildes(t).replace(/[^a-z0-9ñ]+/g, ' ').trim()} `
  let mejor: { slug: string; largo: number } | undefined
  for (const [alias, slug] of Object.entries(CATEGORIA_ALIASES)) {
    const a = sinTildes(alias).replace(/[^a-z0-9ñ]+/g, ' ').trim()
    if (!a) continue
    const entero = tt.includes(` ${a} `) || tt.includes(` ${a}s `) || tt.includes(` ${a}es `)
    const prefijo = tt.trim().length >= 4 && a.startsWith(tt.trim())
    if ((entero || prefijo) && (!mejor || a.length > mejor.largo)) mejor = { slug, largo: a.length }
  }
  return mejor?.slug
}
