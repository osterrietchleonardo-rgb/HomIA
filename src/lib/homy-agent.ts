import 'server-only'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { parseJson } from '@/lib/api'
import { withinRadius } from '@/lib/geo'
import { matchTerms, canonicalCategoria } from '@/lib/search-match'

// ─────────────────────────────────────────────────────────────
// SUPERAGENTE HOMY — loop de razonamiento + grafo de acciones + herramientas reales
// Capa de razonamiento: LLM emite {thought, action, args} en cada paso (ReAct)
// Grafo: interpretar → (buscar_* → observar)* → responder | preguntar_usuario
// Herramientas: consultas reales a la base de HomIA (sin datos inventados)
// ─────────────────────────────────────────────────────────────

export type AgentMode = 'cliente' | 'profesional' | 'auto'

/** Intención detectada por el superagente: define qué ve el usuario después. */
export type AgentIntent = 'contratar' | 'trabajar' | 'materiales' | 'ayuda'

export type AgentMessage = { role: 'user' | 'homy'; content: string }

export type AgentResults = {
  professionals?: ProfessionalResult[]
  jobs?: JobResult[]
  materials?: MaterialResult[]
  comparables?: MaterialResult[]
}

export type ProfessionalResult = {
  id: string
  displayName: string
  professions: string[]
  personType: string
  companyName: string | null
  city: string | null
  rating: number
  reviewsCount: number
  worksCount: number
  verified: boolean
  distanceKm?: number
}

export type JobResult = {
  id: string
  title: string
  description: string
  categorySlug: string
  urgency: string
  budgetMin: number | null
  budgetMax: number | null
  city: string | null
  clientName?: string
  bidsCount: number
  distanceKm?: number
}

export type MaterialResult = {
  stockId: string
  elementId: string
  elementName: string
  categorySlug: string
  unit: string
  brand: string | null
  price: number
  quantity: number
  status: string
  providerId: string
  providerName: string
  providerCity: string | null
  providerRating: number
  distanceKm?: number
}

const MAX_ITERATIONS = 6

const TOOL_SCHEMAS = `
{
  "action": "buscar_profesionales", "args": { "q": string, "categoria": string (slug opcional), "radio_km": number }
  {"action": "buscar_trabajos", "args": { "q": string, "categoria": string, "urgencia": "baja"|"normal"|"alta"|"urgente", "radio_km": number }}
  {"action": "buscar_materiales", "args": { "q": string, "categoria": string, "radio_km": number }}
  {"action": "comparar_precios", "args": { "q": string (nombre del elemento estándar), "radio_km": number }}
  {"action": "preguntar_usuario", "args": { "pregunta": string, "opciones": [string] (2-4, opcional) }}
  {"action": "responder", "args": { "message": string, "suggestions": [string] (0-3) }}
}`

function systemPrompt(mode: AgentMode, hasLocation: boolean): string {
  const quien = mode === 'profesional'
    ? `El usuario es un PROFESIONAL de la construcción/servicios. Busca: (1) TRABAJOS publicados para oferar ("¿qué hay para plomeros?"), (2) MATERIALES con precio y stock en proveedores, (3) comparar precios de materiales entre proveedores.`
    : mode === 'cliente'
      ? `El usuario es un CLIENTE particular del hogar. Busca: PROFESIONALES (plomero, electricista, etc.) o describe un problema de su casa que hay que interpretar y derivar a la categoría correcta.`
      : `MODO AUTO: todavía no sabés quién es. RAZONÁ la intención antes de buscar:
• Si describe un problema de su hogar o pide un profesional para SU casa ("necesito un plomero", "se me rompió X", "tengo una fuga") → es un CLIENTE que quiere CONTRATAR: usá buscar_profesionales.
• Si pregunta por trabajo u ofertas para su OFICIO ("¿qué hay para plomeros?", "busco trabajos de pintura", "hay licitaciones para gasistas") → es un PROFESIONAL que quiere TRABAJAR: usá buscar_trabajos.
• Si pregunta por materiales, precios o comprar insumos ("precio del cemento", "cuánto sale un termotanque", "dónde compro caños") → quiere MATERIALES: usá buscar_materiales o comparar_precios.
Elegí la herramienta que corresponda a esa interpretación: ahí se ve tu razonamiento.`
  return `Sos Homy, el superagente de búsqueda de HomIA (marketplace de servicios del hogar en Argentina). Razonás con un loop de acciones antes de responder.

MODO: ${quien}

UBICACIÓN: ${hasLocation ? 'El usuario compartió su ubicación: filtrá por cercanía cuando aporte.' : 'No hay ubicación conocida; si la cercanía importa, preguntala.'}

CATÁLOGO de categorías (slugs): plomeria, gasistas, electricistas, albanileria, pintura, carpinteria, herreria, limpieza, jardineria, climatizacion, techos, cerramientos.

En CADA paso devolvés EXACTAMENTE un JSON (sin markdown), una de estas formas:
${TOOL_SCHEMAS}

REGLAS DEL LOOP:
1. Pensá "thought" corto (1 frase), elegí UNA acción.
2. Ejecutá 1-3 búsquedas si hace falta para tener datos reales. NUNCA inventes resultados, precios, nombres ni cantidades: si no hay datos, decilo honestamente.
3. Si el pedido es ambiguo (falta qué necesita, urgencia, ubicación, material exacto), usá "preguntar_usuario" con UNA pregunta clara y 2-4 opciones si aplican. No preguntes lo que ya sabés del historial.
4. NO sobre-filtres: si el usuario no mencionó urgencia, NO pases "urgencia" (el default "normal" descarta trabajos de otras urgencias). Igual con radio_km: si no hay ubicación conocida, no lo restrinjas.
5. Cuando tengas suficiente info, "responder": message en español rioplatense, cálido y directo, máximo 3 frases + hasta 3 suggestions (frases cortas que el usuario podría querer después). Si encontraste resultados, en el mensaje resumí lo más notable con datos reales (nombres, precios, cantidades).
6. Máximo ${MAX_ITERATIONS} pasos. Si agotás pasos, respondé con lo que tengas.
7. "categoria" acepta sinónimos: "plomero"→plomeria, "gasista"→gasistas, "electricista"→electricistas, "albañil"→albanileria, "pintor"→pintura, "carpintero"→carpinteria.
8. radio_km default 25; si te pasan ubicación implícita (barrio/ciudad), igual buscá sin radio y aclará en el mensaje.`
}

// ── Herramientas reales ──────────────────────────────────────

async function toolBuscarProfesionales(args: { q?: string; categoria?: string; radio_km?: number; lat?: number; lng?: number }) {
  const pros = await db.professionalProfile.findMany({
    include: { user: { select: { displayName: true, avatarUrl: true, rating: true, reviewsCount: true, city: true } } },
  })
  const q = (args.q || '').toLowerCase().trim()
  const catSlug = canonicalCategoria(args.categoria)
  const filtered = pros.filter((p) => {
    const professions = parseJson<string[]>(p.professions, [])
    const skills = parseJson<string[]>(p.skills, [])
    const hay = [...professions, ...skills, p.bio || '', p.user.displayName, p.companyName || '', p.city || ''].join(' ').toLowerCase()
    const catOk = catSlug
      ? professions.some((pf) => canonicalCategoria(pf) === catSlug || pf.toLowerCase().includes(catSlug))
      : true
    return catOk && (!q || matchTerms(q, hay) || professions.some((pf) => hay.includes(pf)))
  })
  const geo = withinRadius(
    filtered.map((p) => ({ ...p, lat: p.lat, lng: p.lng })),
    args.lat, args.lng, args.radio_km || 25
  )
  return geo.slice(0, 12).map((p) => ({
    id: p.id,
    displayName: p.companyName ? `${p.companyName} (${p.user.displayName})` : p.user.displayName,
    professions: parseJson<string[]>(p.professions, []),
    personType: p.personType,
    companyName: p.companyName,
    city: p.city || p.user.city,
    rating: p.rating || p.user.rating,
    reviewsCount: p.reviewsCount || p.user.reviewsCount,
    worksCount: p.worksCount,
    verified: p.verified,
    distanceKm: p.distanceKm,
  })) as ProfessionalResult[]
}

async function toolBuscarTrabajos(args: { q?: string; categoria?: string; urgencia?: string; radio_km?: number; lat?: number; lng?: number }) {
  const catSlug = canonicalCategoria(args.categoria)
  const urg = args.urgencia?.toLowerCase().trim()
  const baseWhere = {
    status: 'abierto' as const,
    ...(catSlug ? { categorySlug: catSlug } : {}),
  }
  const include = {
    user: { select: { displayName: true, city: true } },
    bids: { select: { id: true } },
  }
  // Búsqueda relajada: si el filtro de urgencia/categoría deja 0 resultados,
  // reintenta sin él para no quedarse vacío por sobre-filtrado del LLM.
  let jobs = await db.jobPost.findMany({
    where: { ...baseWhere, ...(urg ? { urgency: urg } : {}) },
    include,
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  if (jobs.length === 0 && urg) {
    jobs = await db.jobPost.findMany({ where: baseWhere, include, orderBy: { createdAt: 'desc' }, take: 50 })
  }
  if (jobs.length === 0 && catSlug) {
    jobs = await db.jobPost.findMany({
      where: { status: 'abierto' },
      include,
      orderBy: { createdAt: 'desc' },
      take: 50,
    })
  }
  const q = (args.q || '').toLowerCase().trim()
  const filtered = jobs.filter((j) => !q || matchTerms(q, `${j.title} ${j.description} ${j.categorySlug}`.toLowerCase()))
  const geo = withinRadius(
    filtered.map((j) => ({ ...j, lat: j.lat, lng: j.lng })),
    args.lat, args.lng, args.radio_km || 25
  )
  return geo.slice(0, 12).map((j) => ({
    id: j.id,
    title: j.title,
    description: j.description.slice(0, 140),
    categorySlug: j.categorySlug,
    urgency: j.urgency,
    budgetMin: j.budgetMin,
    budgetMax: j.budgetMax,
    city: j.city || j.user.city,
    clientName: j.user.displayName,
    bidsCount: j.bids.length,
    distanceKm: j.distanceKm,
  })) as JobResult[]
}

async function toolBuscarMateriales(args: { q?: string; categoria?: string; radio_km?: number; lat?: number; lng?: number }) {
  const stock = await db.providerStock.findMany({
    include: {
      element: { include: { category: true } },
      provider: { include: { user: { select: { city: true } } } },
    },
    orderBy: { price: 'asc' },
    take: 400,
  })
  const q = (args.q || '').toLowerCase().trim()
  let matched = stock
  if (q) {
    matched = stock.filter((s) => {
      const hay = [s.element.name, ...parseJson<string[]>(s.element.aliases, []), s.brand || '', s.provider.businessName].join(' ').toLowerCase()
      return matchTerms(q, hay)
    })
  }
  if (args.categoria) {
    const catSlug = canonicalCategoria(args.categoria)
    if (catSlug) matched = matched.filter((s) => s.element.category.slug === catSlug)
  }
  const geo = withinRadius(
    matched.map((s) => ({ ...s, lat: s.provider.lat, lng: s.provider.lng })),
    args.lat, args.lng, args.radio_km || 25
  )
  return geo.slice(0, 12).map((s) => ({
    stockId: s.id,
    elementId: s.elementId,
    elementName: s.element.name,
    categorySlug: s.element.category.slug,
    unit: s.element.unit,
    brand: s.brand,
    price: s.price,
    quantity: s.quantity,
    status: s.status,
    providerId: s.provider.id,
    providerName: s.provider.businessName,
    providerCity: s.provider.city || s.provider.user.city,
    providerRating: s.provider.rating,
    distanceKm: s.distanceKm,
  })) as MaterialResult[]
}

async function toolCompararPrecios(args: { q: string; radio_km?: number; lat?: number; lng?: number }) {
  const all = await toolBuscarMateriales({ q: args.q, radio_km: args.radio_km, lat: args.lat, lng: args.lng })
  // agrupa por elemento y devuelve el más barato de cada uno + conteo
  const byElement = new Map<string, MaterialResult[]>()
  for (const m of all) {
    const arr = byElement.get(m.elementId) || []
    arr.push(m)
    byElement.set(m.elementId, arr)
  }
  const out: MaterialResult[] = []
  for (const [, arr] of byElement) {
    arr.sort((a, b) => a.price - b.price)
    out.push(...arr.slice(0, 3))
  }
  out.sort((a, b) => a.elementName.localeCompare(b.elementName) || a.price - b.price)
  return out.slice(0, 12)
}

// ── El loop del superagente ──────────────────────────────────

export async function runHomyAgent(input: {
  messages: AgentMessage[]
  mode: AgentMode
  lat?: number | null
  lng?: number | null
}): Promise<{
  message: string
  suggestions: string[]
  intent: AgentIntent
  question?: { pregunta: string; opciones: string[] }
  results: AgentResults
  steps: { thought: string; action: string; found: number }[]
}> {
  const results: AgentResults = {}
  const steps: { thought: string; action: string; found: number }[] = []
  let zai: Awaited<ReturnType<typeof ZAI.create>> | null = null
  try {
    zai = await ZAI.create()
  } catch {
    // sin motor IA: degradación honesta a búsqueda directa
  }

  const convo = input.messages.slice(-8).map((m) => ({
    role: m.role === 'user' ? 'user' : 'assistant',
    content: m.content,
  }))

  const lastUser = [...input.messages].reverse().find((m) => m.role === 'user')?.content || ''

  const hasLocation = !!(input.lat && input.lng)
  const lat = input.lat ?? undefined
  const lng = input.lng ?? undefined

  if (!zai) {
    // Degradación honesta: razonamiento por heurística + búsqueda directa por keywords
    const intent = detectIntent(lastUser)
    const cat = guessCategory(lastUser)
    if (intent === 'trabajar') {
      const jobs = await toolBuscarTrabajos({ q: stripIntentWords(lastUser), categoria: cat, lat, lng })
      if (jobs.length) results.jobs = jobs
      return {
        message: jobs.length
          ? `Interpreté que buscás trabajo de tu oficio: encontré ${jobs.length} trabajos publicados${cat ? ` de ${cat}` : ''} en la base. Tocá "Ver resultados" para abrirlos en el mapa y presupuestar.`
          : `Interpreté que buscás trabajo de tu oficio, pero ahora no hay publicaciones activas que coincidan${cat ? ` con ${cat}` : ''}. Tocá "Ver resultados" y activá el mapa para ver qué hay cerca.`,
        suggestions: [],
        intent,
        results,
        steps: [{ thought: 'fallback directo (sin motor IA)', action: 'buscar_trabajos', found: jobs.length }],
      }
    }
    if (intent === 'materiales') {
      const mats = await toolBuscarMateriales({ q: stripIntentWords(lastUser), categoria: cat, lat, lng })
      if (mats.length) results.materials = mats
      return {
        message: mats.length
          ? `Interpreté que buscás materiales: encontré ${mats.length} publicaciones con precio y stock reales. Tocá "Ver resultados" para comparar entre proveedores.`
          : `Interpreté que buscás materiales, pero no encontré stock publicado con esos términos. Tocá "Ver resultados" y probá el catálogo estándar.`,
        suggestions: [],
        intent,
        results,
        steps: [{ thought: 'fallback directo (sin motor IA)', action: 'buscar_materiales', found: mats.length }],
      }
    }
    if (intent === 'contratar') {
      const pros = await toolBuscarProfesionales({ q: stripIntentWords(lastUser), categoria: cat, lat, lng })
      if (pros.length) results.professionals = pros
      return {
        message: pros.length
          ? `Interpreté que necesitás un profesional para tu casa: encontré ${pros.length} perfiles verificados${cat ? ` de ${cat}` : ''}. Tocá "Ver resultados" para verlos en el mapa con distancia y reseñas.`
          : `Interpreté que necesitás un profesional para tu casa, pero no encontré perfiles que coincidan todavía. Tocá "Ver resultados" y publicá tu trabajo para recibir presupuestos.`,
        suggestions: [],
        intent,
        results,
        steps: [{ thought: 'fallback directo (sin motor IA)', action: 'buscar_profesionales', found: pros.length }],
      }
    }
    return {
      message: 'Contame qué necesitás para tu hogar o tu oficio y busco en la base real de HomIA: profesionales, trabajos publicados o materiales con precios.',
      suggestions: [],
      intent,
      results,
      steps: [],
    }
  }

  const transcript: Array<{ role: 'system' | 'user' | 'assistant'; content: string }> = [
    { role: 'system', content: systemPrompt(input.mode, hasLocation) },
    ...(convo.slice(0, -1).map((c) =>
      c.role === 'user'
        ? { role: 'user' as const, content: c.content }
        : { role: 'assistant' as const, content: c.content }
    )),
    { role: 'user', content: `${lastUser}${hasLocation ? `\n\n[Ubicación del usuario: lat ${input.lat}, lng ${input.lng}]` : ''}` },
  ]

  let final: { message: string; suggestions: string[] } | null = null
  let question: { pregunta: string; opciones: string[] } | null = null

  for (let i = 0; i < MAX_ITERATIONS; i++) {
    let raw = ''
    try {
      const completion = await zai.chat.completions.create({
        messages: transcript,
        // temperatura baja para decisiones consistentes
        temperature: 0.2,
      } as never)
      raw = completion.choices[0]?.message?.content ?? ''
    } catch {
      break
    }
    const json = extractJson(raw)
    if (!json || typeof json !== 'object') break
    const step = json as { thought?: string; action?: string; args?: Record<string, unknown> }
    const action = step.action || 'responder'
    const args = (step.args || {}) as Record<string, unknown>

    if (action === 'responder') {
      final = {
        message: String(args.message || 'Listo, ¿qué otra cosa necesitas?'),
        suggestions: Array.isArray(args.suggestions) ? (args.suggestions as string[]).slice(0, 3) : [],
      }
      transcript.push({ role: 'assistant', content: raw })
      break
    }

    if (action === 'preguntar_usuario') {
      question = {
        pregunta: String(args.pregunta || '¿Podés contarme un poco más?'),
        opciones: Array.isArray(args.opciones) ? (args.opciones as string[]).slice(0, 4) : [],
      }
      steps.push({ thought: String(step.thought || ''), action, found: 0 })
      transcript.push({ role: 'assistant', content: raw })
      break
    }

    let found = 0
    try {
      if (action === 'buscar_profesionales') {
        const r = await toolBuscarProfesionales({
          q: asStr(args.q), categoria: asStr(args.categoria),
          radio_km: asNum(args.radio_km), lat, lng,
        })
        found = r.length
        if (r.length) results.professionals = mergeProfessionals(results.professionals, r)
      } else if (action === 'buscar_trabajos') {
        const r = await toolBuscarTrabajos({
          q: asStr(args.q), categoria: asStr(args.categoria), urgencia: asStr(args.urgencia),
          radio_km: asNum(args.radio_km), lat, lng,
        })
        found = r.length
        if (r.length) results.jobs = mergeJobs(results.jobs, r)
      } else if (action === 'buscar_materiales') {
        const r = await toolBuscarMateriales({
          q: asStr(args.q), categoria: asStr(args.categoria),
          radio_km: asNum(args.radio_km), lat, lng,
        })
        found = r.length
        if (r.length) results.materials = mergeMaterials(results.materials, r)
      } else if (action === 'comparar_precios') {
        const r = await toolCompararPrecios({
          q: asStr(args.q) || lastUser, radio_km: asNum(args.radio_km), lat, lng,
        })
        found = r.length
        if (r.length) results.comparables = mergeMaterials(results.comparables, r)
      } else {
        transcript.push({ role: 'assistant', content: JSON.stringify({ action: 'responder', args: { message: 'Disculpá, me hizo lío el pedido. ¿Lo repetís con otras palabras?' } }) })
        continue
      }
    } catch {
      found = -1
    }

    steps.push({ thought: String(step.thought || ''), action, found })
    // Resumen compacto y REAL de lo encontrado para que el LLM cite datos exactos
    let summary = 'sin resultados'
    if (action === 'buscar_profesionales' && results.professionals?.length) {
      summary = JSON.stringify(results.professionals.slice(0, 5).map((p) => ({
        nombre: p.displayName, rubros: p.professions, ciudad: p.city,
        rating: p.rating, reseñas: p.reviewsCount, obras: p.worksCount, km: p.distanceKm,
      })))
    } else if (action === 'buscar_trabajos' && results.jobs?.length) {
      summary = JSON.stringify(results.jobs.slice(0, 5).map((j) => ({
        titulo: j.title, categoria: j.categorySlug, urgencia: j.urgency,
        presupuesto: [j.budgetMin, j.budgetMax], ciudad: j.city, presupuestos_recibidos: j.bidsCount, km: j.distanceKm,
      })))
    } else if ((action === 'buscar_materiales' || action === 'comparar_precios')) {
      const arr = action === 'comparar_precios' ? results.comparables : results.materials
      if (arr?.length) {
        summary = JSON.stringify(arr.slice(0, 5).map((m) => ({
          elemento: m.elementName, precio: m.price, unidad: m.unit, marca: m.brand,
          proveedor: m.providerName, stock: m.quantity, estado: m.status, km: m.distanceKm,
        })))
      }
    }
    transcript.push({ role: 'assistant', content: raw })
    transcript.push({
      role: 'user',
      content: `[Observación del sistema] La herramienta ${action} devolvió ${found} resultados. Datos REALES: ${summary}. ${
        found === 0 ? 'No hay datos con esos criterios: probá ampliar la búsqueda, cambiar categoría o preguntale al usuario. NO inventes resultados.' : 'Usá EXCLUSIVAMENTE estos datos en tu respuesta (nombres, precios, proveedores, ratings). No agregues nada que no esté acá.'
      } Continuá con el próximo paso.`,
    })
  }

  if (!final && !question) {
    // agotó el loop sin responder: armar respuesta con lo recolectado
    const counts = [
      results.professionals?.length ? `${results.professionals.length} profesionales` : null,
      results.jobs?.length ? `${results.jobs.length} trabajos` : null,
      results.materials?.length ? `${results.materials.length} materiales` : null,
      results.comparables?.length ? `${results.comparables.length} comparables` : null,
    ].filter(Boolean)
    final = {
      message: counts.length
        ? `Encontré esto en la base: ${counts.join(', ')}. Mirá los resultados abajo.`
        : `No encontré resultados concretos para eso todavía. Probá con otra palabra (por ejemplo "plomero", "cemento" o "¿qué hay para electricistas?").`,
      suggestions: [],
    }
  }

  return {
    message: final?.message ?? question?.pregunta ?? '¿Me contás un poco más de qué necesitás?',
    suggestions: final?.suggestions ?? [],
    intent: deriveIntentFromSteps(steps, lastUser),
    question: question || undefined,
    results,
    steps,
  }
}

/**
 * matchTerms y canonicalCategoria viven en @/lib/search-match (compartidos
 * con /api/search): matcheo tolerante de acentos/plurales y canonización
 * de categorías ("plomeros" → plomeria).
 */

function extractJson(raw: string): unknown {
  let cleaned = raw.trim()
  if (cleaned.includes('```')) {
    cleaned = cleaned.replace(/```(?:json)?/gi, '').replace(/```/g, '').trim()
  }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start === -1 || end === -1 || end <= start) return null
  try {
    return JSON.parse(cleaned.slice(start, end + 1))
  } catch {
    return null
  }
}

function asStr(v: unknown): string | undefined {
  return typeof v === 'string' && v.trim() && v.trim() !== 'null' ? v.trim() : undefined
}
function asNum(v: unknown): number | undefined {
  const n = typeof v === 'string' ? parseFloat(v) : typeof v === 'number' ? v : NaN
  return Number.isFinite(n) && n > 0 ? n : undefined
}

function mergeProfessionals(a: ProfessionalResult[] | undefined, b: ProfessionalResult[]) {
  if (!a) return b
  const seen = new Set(a.map((x) => x.id))
  return [...a, ...b.filter((x) => !seen.has(x.id))]
}
function mergeJobs(a: JobResult[] | undefined, b: JobResult[]) {
  if (!a) return b
  const seen = new Set(a.map((x) => x.id))
  return [...a, ...b.filter((x) => !seen.has(x.id))]
}
function mergeMaterials(a: MaterialResult[] | undefined, b: MaterialResult[]) {
  if (!a) return b
  const seen = new Set(a.map((x) => x.stockId))
  return [...a, ...b.filter((x) => !seen.has(x.stockId))]
}

// ── Capa de razonamiento de intención (usada en fallback y para derivar el CTA) ──

/**
 * Distingue "buscar UN plomero" (contratar) de "buscar TRABAJO para plomeros"
 * (trabajar) y de "comprar materiales" (materiales). Heurística determinista
 * en español rioplatense, extensible a todos los oficios.
 */
export function detectIntent(text: string): AgentIntent {
  const t = text.toLowerCase().normalize('NFC')
  if (!t.trim()) return 'ayuda'

  // 1) MATERIALES: precio/compra o sustantivos de insumo
  const priceIntent = /\b(precio|precios|cuanto (sale|cuesta)|cuánto (sale|cuesta)|cotizaci[oó]n de|comprar|venta de|me conviene|mas barato|más barato|comparar)\b/.test(t)
  const materialNouns = /\b(cemento|cal|ladrillo|ladrillos|arena|piedra|hierro|acero|cañ[oa]s?|canios|tubo|tubos|codo|llave de paso|termotanque|calefon|estufa|caloventor|latex|l[áa]tex|esmalte|sellador|masilla|membrana|chapa|chapones|yeso|enchastre|durlock|placa|bulon|bulón|tornillo|tornillos|clavo|clavos|silicona|cable|cables|termica|t[eé]rmica|disyuntor|foco|lampara|l[áa]mpara|pincel|rodillo|lijas?\b)/.test(t)
  if (priceIntent && materialNouns) return 'materiales'
  if (materialNouns && !/\b(urgente|fuga|se rompio|se rompió|arregl)/.test(t)) return 'materiales'

  // 2) TRABAJAR (profesional busca trabajo): "¿qué hay para X?", "busco trabajo/changuas/licitaciones"
  const jobSeek = /(que hay para|qu[eé] hay para|hay para|hay de|busco (trabajo|trabajos|changua|changuas|licitacion|licitaciones|pedidos|laburo|laburos)|trabajo de|trabajos de|licitaciones? para|pedidos? para|ofertas? (de|para) trabajo|necesito (trabajo|laburo)|quiero (trabajar|ofertar|presupuestar)|encontrar (clientes|laburo)|consigo (trabajo|laburo))/.test(t)
  if (jobSeek) return 'trabajar'

  // 3) CONTRATAR (cliente busca profesional): necesita a alguien / problema de su casa
  const hire = /(necesito|busco|quiero|llamar|contratar|recomend[áa]n?|me recomiendan|presupuesto para|arregl|instal|reparar|reparaci[oó]n|cambiar|colocar|pintar|destapar|emergencia|urgente|urgencia|fuga|se rompio|se rompió|no funciona|me llega|quiero hacer|tengo que hacer|mi casa|en mi casa|de mi casa)/.test(t)
  if (hire) return 'contratar'

  // 4) si nombra un oficio sin verbo claro, asumimos que quiere contratar a ese oficio
  const oficios = /\b(plomero|gasista|electricista|alba[nñ]il|pintor|carpintero|herrero|jardinero|limpiadora|limpiador|tecnico|técnico|cerrajero)\b/
  if (oficios.test(t)) return 'contratar'

  return 'ayuda'
}

/** Saca las palabras de intención para que la búsqueda no filtre por "trabajo para". */
function stripIntentWords(text: string): string {
  return text
    .toLowerCase()
    .replace(/(que hay para|qu[eé] hay para|hay para|hay de|busco (trabajos?|changuas?|licitaciones?|pedidos?|laburos?)|trabajos? de|licitaciones? para|pedidos? para|necesito|quiero|precio de|precios de|cuanto (sale|cuesta)|cu[áa]nto (sale|cuesta)|comprar|para)/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** La intención real es la de la ÚLTIMA herramienta de búsqueda que corrió en el loop. */
export function deriveIntentFromSteps(
  steps: { action: string }[],
  fallbackText: string
): AgentIntent {
  const searchActions = steps.map((s) => s.action).filter((a) =>
    ['buscar_profesionales', 'buscar_trabajos', 'buscar_materiales', 'comparar_precios'].includes(a)
  )
  const last = searchActions[searchActions.length - 1]
  if (last === 'buscar_profesionales') return 'contratar'
  if (last === 'buscar_trabajos') return 'trabajar'
  if (last === 'buscar_materiales' || last === 'comparar_precios') return 'materiales'
  // sin búsquedas (pregunta de aclaración o respuesta directa): heurística sobre el texto
  return detectIntent(fallbackText)
}

function guessCategory(text: string): string | undefined {
  const map: [string, string[]][] = [
    ['plomeria', ['plomero', 'fuga', 'inodoro', 'canilla', 'griferia', 'tuberia', 'baño', 'desagüe', 'desague', 'agua']],
    ['gasistas', ['gas', 'gasista', 'calefon', 'estufa', 'horno']],
    ['electricistas', ['electricista', 'luz', 'cable', 'tablero', 'termica', 'toma', 'enchufe', 'cortocircuito']],
    ['albanileria', ['albañil', 'albanil', 'pared', 'muro', 'ladrillo', 'cemento', 'revoque']],
    ['pintura', ['pintor', 'pintura', 'latex', 'esmalte', 'pintar']],
    ['carpinteria', ['carpintero', 'mueble', 'madera', 'puerta', 'placard']],
    ['herreria', ['herrero', 'reja', 'metal', 'soldadura', 'porton']],
    ['limpieza', ['limpieza', 'limpieza fin de obra', 'limpiadora']],
    ['jardineria', ['jardin', 'jardinero', 'cesped', 'poda', 'pasto']],
    ['climatizacion', ['aire', 'split', 'climatizacion', 'ventilador']],
    ['techos', ['techo', 'chapa', 'membrana', 'gotera']],
    ['cerramientos', ['ventana', 'aluminio', 'vidrio', 'cerradura']],
  ]
  const t = text.toLowerCase()
  for (const [slug, words] of map) {
    if (words.some((w) => t.includes(w))) return slug
  }
  return undefined
}
