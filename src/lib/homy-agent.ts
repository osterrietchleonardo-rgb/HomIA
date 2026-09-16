import 'server-only'
import ZAI from 'z-ai-web-dev-sdk'
import { db } from '@/lib/db'
import { parseJson } from '@/lib/api'
import { withinRadius } from '@/lib/geo'

// ─────────────────────────────────────────────────────────────
// SUPERAGENTE HOMY — loop de razonamiento + grafo de acciones + herramientas reales
// Capa de razonamiento: LLM emite {thought, action, args} en cada paso (ReAct)
// Grafo: interpretar → (buscar_* → observar)* → responder | preguntar_usuario
// Herramientas: consultas reales a la base de HomIA (sin datos inventados)
// ─────────────────────────────────────────────────────────────

export type AgentMode = 'cliente' | 'profesional'

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
    : `El usuario es un CLIENTE particular del hogar. Busca: PROFESIONALES (plomero, electricista, etc.) o describe un problema de su casa que hay que interpretar y derivar a la categoría correcta.`
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
4. Cuando tengas suficiente info, "responder": message en español rioplatense, cálido y directo, máximo 3 frases + hasta 3 suggestions (frases cortas que el usuario podría querer después).
5. Máximo ${MAX_ITERATIONS} pasos. Si agotás pasos, respondé con lo que tengas.
6. "categoria" acepta sinónimos: "plomero"→plomeria, "gasista"→gasistas, "electricista"→electricistas, "albañil"→albanileria, "pintor"→pintura, "carpintero"→carpinteria.
7. radio_km default 25; si te pasan ubicación implícita (barrio/ciudad), igual buscá sin radio y aclará en el mensaje.`
}

// ── Herramientas reales ──────────────────────────────────────

async function toolBuscarProfesionales(args: { q?: string; categoria?: string; radio_km?: number; lat?: number; lng?: number }) {
  const pros = await db.professionalProfile.findMany({
    include: { user: { select: { displayName: true, avatarUrl: true, rating: true, reviewsCount: true, city: true } } },
  })
  const q = (args.q || '').toLowerCase().trim()
  const cat = (args.categoria || '').toLowerCase().trim()
  const filtered = pros.filter((p) => {
    const professions = parseJson<string[]>(p.professions, [])
    const skills = parseJson<string[]>(p.skills, [])
    const hay = [...professions, ...skills, p.bio || '', p.user.displayName, p.companyName || '', p.city || ''].join(' ').toLowerCase()
    const catOk = cat ? professions.some((pf) => pf.includes(cat) || cat.includes(pf)) : true
    return catOk && (!q || hay.includes(q) || professions.some((pf) => hay.includes(pf)))
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
  const jobs = await db.jobPost.findMany({
    where: {
      status: 'abierto',
      ...(args.categoria ? { categorySlug: args.categoria } : {}),
      ...(args.urgencia ? { urgency: args.urgencia } : {}),
    },
    include: {
      user: { select: { displayName: true, city: true } },
      bids: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 50,
  })
  const q = (args.q || '').toLowerCase().trim()
  const filtered = jobs.filter((j) => !q || `${j.title} ${j.description} ${j.categorySlug}`.toLowerCase().includes(q))
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
    const terms = q.split(/\s+/).filter(Boolean)
    matched = stock.filter((s) => {
      const hay = [s.element.name, ...parseJson<string[]>(s.element.aliases, []), s.brand || '', s.provider.businessName].join(' ').toLowerCase()
      return hay.includes(q) || terms.some((t) => hay.includes(t))
    })
  }
  if (args.categoria) matched = matched.filter((s) => s.element.category.slug === args.categoria)
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

  if (!zai) {
    // Degradación honesta: búsqueda directa por keywords
    const cat = guessCategory(lastUser)
    if (input.mode === 'profesional') {
      const [jobs, mats] = await Promise.all([
        toolBuscarTrabajos({ q: lastUser, categoria: cat, lat: input.lat, lng: input.lng }),
        toolBuscarMateriales({ q: lastUser, categoria: cat, lat: input.lat, lng: input.lng }),
      ])
      if (jobs.length) results.jobs = jobs
      if (mats.length) results.materials = mats
      return {
        message: `Busqué "${lastUser}" directamente en la base${cat ? ` (categoría ${cat})` : ''}: ${jobs.length} trabajos, ${mats.length} materiales.`,
        suggestions: [],
        results,
        steps: [{ thought: 'fallback directo', action: 'buscar', found: jobs.length + mats.length }],
      }
    }
    const pros = await toolBuscarProfesionales({ q: lastUser, categoria: cat, lat: input.lat, lng: input.lng })
    if (pros.length) results.professionals = pros
    return {
      message: `Busqué "${lastUser}" directamente en la base${cat ? ` (categoría ${cat})` : ''}: ${pros.length} profesionales.`,
      suggestions: [],
      results,
      steps: [{ thought: 'fallback directo', action: 'buscar_profesionales', found: pros.length }],
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
          radio_km: asNum(args.radio_km), lat: input.lat, lng: input.lng,
        })
        found = r.length
        if (r.length) results.professionals = mergeProfessionals(results.professionals, r)
      } else if (action === 'buscar_trabajos') {
        const r = await toolBuscarTrabajos({
          q: asStr(args.q), categoria: asStr(args.categoria), urgencia: asStr(args.urgencia),
          radio_km: asNum(args.radio_km), lat: input.lat, lng: input.lng,
        })
        found = r.length
        if (r.length) results.jobs = mergeJobs(results.jobs, r)
      } else if (action === 'buscar_materiales') {
        const r = await toolBuscarMateriales({
          q: asStr(args.q), categoria: asStr(args.categoria),
          radio_km: asNum(args.radio_km), lat: input.lat, lng: input.lng,
        })
        found = r.length
        if (r.length) results.materials = mergeMaterials(results.materials, r)
      } else if (action === 'comparar_precios') {
        const r = await toolCompararPrecios({
          q: asStr(args.q) || lastUser, radio_km: asNum(args.radio_km), lat: input.lat, lng: input.lng,
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
    question: question || undefined,
    results,
    steps,
  }
}

// ── helpers ──────────────────────────────────────────────────

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
