// Herramientas del súper agente Homy: pocas, tipadas (additionalProperties:false),
// SOLO LECTURA, con ids y ubicación inyectados por el código (el modelo nunca
// escribe el usuario ni coordenadas) y resúmenes cortos con estado explícito:
// encontrado | nada | error, cada uno con la línea de "qué NO hacer".
import { z } from 'zod'
import { expandNeedQuery, matchScore, matchTerms, canonicalCategoria } from '@/lib/search-match'
import { haversineKm } from '@/lib/geo'
import { buscarConocimiento } from './conocimiento'
import { compararOfertas, compararProfesionales } from './ranking'
import { ubicarZona } from './zonas'
import { canonHref, linkCarrito, adaptarParaVisitante } from './rutas'
import type { FuenteDatos, OfertaStock } from './datos'
import type { Puerta, RolHomy, Tarjeta, TarjetaMaterial } from './tipos'

// ── Contexto de la corrida (lo arma el código, nunca el modelo) ──
export type Contexto = {
  rol: RolHomy
  rolesUsuario: string[]
  userId: string | null
  nombre: string | null
  puerta: Puerta
  pagina: string | null
  lat: number | null
  lng: number | null
}

/** Lo que las herramientas vieron en ESTA corrida: base de los guardarraíles. */
export type Registro = {
  entidades: Map<string, Tarjeta> // "tipo:id" → tarjeta armada por el código
  links: Set<string> // hrefs canónicos devueltos por herramientas
  montos: Set<number> // montos en pesos leídos (precios, presupuestos, planes)
  elementosVistos: Set<string> // ids de elementos que devolvió sugerir_materiales
}

export function registroVacio(): Registro {
  return { entidades: new Map(), links: new Set(), montos: new Set(), elementosVistos: new Set() }
}

export type EstadoHerramienta = 'encontrado' | 'nada' | 'error'

export type ResultadoHerramienta = {
  estado: EstadoHerramienta
  /** JSON que lee el modelo */
  salida: string
  /** resumen de ≤200 caracteres para el registro */
  resumen: string
  /** texto de progreso para el usuario después de ejecutar (opcional) */
  progresoDespues?: string
}

export type DefinicionHerramienta = {
  type: 'function'
  name: string
  description: string
  strict: true
  parameters: Record<string, unknown>
}

export type Herramienta = {
  definicion: DefinicionHerramienta
  entrada: z.ZodTypeAny
  // firmas de método (bivariantes): cada herramienta recibe su input ya validado por `entrada`
  progreso(input: unknown): string
  ejecutar(input: unknown): Promise<ResultadoHerramienta>
}

const nulo = (t: string) => ({ type: [t, 'null'] })
const obj = (properties: Record<string, unknown>) => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})

const KM = (n: number | null) => (n == null ? null : Math.round(n * 10) / 10)
const txt = (v: unknown) => JSON.stringify(v)

function distancia(ctx: { lat: number | null; lng: number | null }, lat: number | null, lng: number | null): number | null {
  if (ctx.lat == null || ctx.lng == null || lat == null || lng == null) return null
  return haversineKm(ctx.lat, ctx.lng, lat, lng)
}

/** Ubicación efectiva: la compartida por el usuario o el centroide de la zona que nombró. */
function ubicacion(ctx: Contexto, zona: string | null): { lat: number | null; lng: number | null; origen: string } {
  if (ctx.lat != null && ctx.lng != null) return { lat: ctx.lat, lng: ctx.lng, origen: 'ubicación compartida por el usuario' }
  const z = ubicarZona(zona)
  if (z) return { lat: z.lat, lng: z.lng, origen: `centro aproximado de ${z.zona}` }
  return { lat: null, lng: null, origen: 'sin ubicación' }
}

/** Montos en pesos de un texto ("$50.000" → 50000). */
export function montosDeTexto(t: string): number[] {
  const out: number[] = []
  for (const m of t.matchAll(/\$\s?(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,\d{1,2})?/g)) {
    out.push(Number(m[1].replace(/[.\s]/g, '')))
  }
  return out
}

function registrarLink(reg: Registro, href: string) {
  const c = canonHref(href)
  if (c) reg.links.add(c)
}

/** Link para mostrar: visitante → registro con volver. */
function hrefPara(ctx: Contexto, href: string) {
  return ctx.rol === 'visitante' ? adaptarParaVisitante(href) : href
}

// ── Búsqueda en el catálogo (conocimiento interno) ──
export function rankearElementos<T extends { nombre: string; aliases: string[]; descripcion: string; rubro: string }>(
  elementos: T[],
  necesidad: string,
  rubro: string | null
): (T & { puntaje: number })[] {
  const raw = necesidad.toLowerCase().trim()
  const q = expandNeedQuery(raw)
  const rub = canonicalCategoria(rubro || undefined)
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
  const nq = norm(raw)
  const scored = elementos
    .map((e) => {
      let nombre = 0
      const nn = norm(e.nombre)
      if (nq && (nn.includes(nq) || (nn.length >= 4 && nq.includes(nn)))) nombre = 3
      else if (e.aliases.some((a) => { const na = norm(a); return na.length >= 3 && (na.includes(nq) || nq.includes(na)) })) nombre = 2
      const tok = matchScore(q, `${e.nombre} ${e.aliases.join(' ')} ${e.descripcion}`)
      const tokNombre = matchScore(raw, `${e.nombre} ${e.aliases.join(' ')}`)
      let score = nombre * 10 + tokNombre * 3 + tok
      if (rub && e.rubro === rub) score += 2
      return { e, score }
    })
    .filter((x) => x.score >= 2)
    .sort((a, b) => b.score - a.score || a.e.nombre.localeCompare(b.e.nombre))
  return scored.map((x) => ({ ...x.e, puntaje: x.score }))
}

function ofertaDisponible(o: OfertaStock) {
  return o.operativo && o.cantidad > 0 && o.estado !== 'agotado'
}

// ── Fábrica: las herramientas con el contexto y la fuente de datos inyectados ──
export function crearHerramientas(ctx: Contexto, datos: FuenteDatos, reg: Registro): Record<string, Herramienta> {
  const tools: Record<string, Herramienta> = {}

  // 1) Catálogo: "se me gotea la canilla ¿qué necesito?" → elementos concretos con para qué sirven
  const inSugerir = z.object({ necesidad: z.string().min(2).max(300), rubro: z.string().max(40).nullable() })
  tools.sugerir_materiales = {
    definicion: {
      type: 'function',
      name: 'sugerir_materiales',
      description:
        'Busca en el catálogo interno de HomIA (1.200+ materiales con descripción) por nombre corto de material ("cinta teflón", "cemento", "membrana") o por necesidad ("tapar humedad"). Rinde más con nombres cortos: podés llamarla varias veces en la misma vuelta, una por material. Devuelve id, nombre, para qué sirve, unidad de venta y cuántos proveedores lo tienen en stock. Usala ANTES de buscar_proveedores_con_stock: esa herramienta solo acepta ids que salieron de acá.',
      strict: true,
      parameters: obj({
        necesidad: { type: 'string', description: 'La necesidad o el nombre del material, en palabras simples.' },
        rubro: { ...nulo('string'), description: 'Rubro si es claro (plomeria, electricistas, gasistas, pintura, albanileria…) o null.' },
      }),
    },
    entrada: inSugerir,
    progreso: (i: z.infer<typeof inSugerir>) => `Buscando en el catálogo qué sirve para «${i.necesidad.slice(0, 50)}»…`,
    ejecutar: async (i: z.infer<typeof inSugerir>) => {
      const todos = await datos.elementos()
      // los 15 más parecidos; a igual parecido, primero los que HOY tienen stock
      // ("cemento" no puede quedarse con 5 variantes sin stock y esconder la que sí hay)
      const candidatos = rankearElementos(todos, i.necesidad, i.rubro).slice(0, 15)
      if (candidatos.length === 0) {
        return {
          estado: 'nada',
          salida: txt({ estado: 'nada', nota: 'NO hay materiales del catálogo que coincidan. No inventes nombres de productos: pedí que lo describa de otra forma o sugerí consultar a un profesional del rubro.' }),
          resumen: `nada para "${i.necesidad}"`,
        }
      }
      const ofertas = await datos.ofertas(candidatos.map((e) => e.id))
      const conStock = new Map<string, number>()
      for (const o of ofertas) if (ofertaDisponible(o)) conStock.set(o.elementoId, (conStock.get(o.elementoId) || 0) + 1)
      const top = candidatos
        .map((e, orden) => ({ e, orden, puntaje: e.puntaje }))
        .sort((a, b) => b.puntaje - a.puntaje || Number((conStock.get(b.e.id) || 0) > 0) - Number((conStock.get(a.e.id) || 0) > 0) || a.orden - b.orden)
        .slice(0, 5)
        .map((x) => x.e)
      const items = top.map((e) => {
        reg.elementosVistos.add(e.id)
        const n = conStock.get(e.id) || 0
        reg.entidades.set(`elemento:${e.id}`, {
          tipo: 'elemento', id: e.id, nombre: e.nombre, paraQueSirve: e.descripcion, unidad: e.unidad, rubro: e.rubroNombre, conStock: n,
        })
        return { ref: `elemento:${e.id}`, id: e.id, nombre: e.nombre, para_que_sirve: e.descripcion.slice(0, 220), unidad: e.unidad, rubro: e.rubro, proveedores_con_stock: n }
      })
      const sinStock = items.filter((x) => x.proveedores_con_stock === 0).length
      return {
        estado: 'encontrado',
        salida: txt({
          estado: 'encontrado',
          nota: `Los ${items.length} materiales del catálogo más parecidos a "${i.necesidad.slice(0, 60)}" (conocimiento, NO son ofertas: no tienen precio acá). Explicá para qué sirve cada uno con sus palabras.${sinStock ? ' Los que tienen proveedores_con_stock = 0 NO se consiguen hoy en HomIA: no digas que se pueden comprar acá (y no generalices: vale solo para esos materiales puntuales).' : ''} Para precios y proveedores llamá buscar_proveedores_con_stock con los ids que tienen stock.`,
          elementos: items,
        }),
        resumen: items.map((x) => `${x.nombre}(${x.proveedores_con_stock})`).join(', ').slice(0, 200),
      }
    },
  }

  // 2) Proveedores con stock, rankeados por el código
  const inProv = z.object({ elementos: z.array(z.string().min(1).max(40)).min(1).max(6) })
  tools.buscar_proveedores_con_stock = {
    definicion: {
      type: 'function',
      name: 'buscar_proveedores_con_stock',
      description:
        'Para cada material (ids devueltos por sugerir_materiales) trae qué proveedores lo tienen en stock HOY, con precio, marca, reseñas, verificación, distancia y si es Recomendado. El orden ya viene calculado (verificado > reseñas > precio > distancia; Recomendado desempata): respetalo. La ubicación del usuario la pone el sistema.',
      strict: true,
      parameters: obj({ elementos: { type: 'array', items: { type: 'string' }, description: 'ids de elementos (1 a 6).' } }),
    },
    entrada: inProv,
    progreso: () => 'Buscando qué proveedores tienen stock…',
    ejecutar: async (i: z.infer<typeof inProv>) => {
      const desconocidos = i.elementos.filter((id) => !reg.elementosVistos.has(id))
      if (desconocidos.length === i.elementos.length) {
        return {
          estado: 'error',
          salida: txt({ estado: 'error', nota: 'Esos ids no salieron de sugerir_materiales en esta conversación. Llamá primero sugerir_materiales con el nombre del material y usá sus ids. No inventes ids.' }),
          resumen: 'ids desconocidos',
        }
      }
      const ids = i.elementos.filter((id) => reg.elementosVistos.has(id))
      const ofertas = (await datos.ofertas(ids)).filter(ofertaDisponible)
      const proveedores = new Set<string>()
      const porElemento = ids.map((id) => {
        const el = reg.entidades.get(`elemento:${id}`)
        const lista = ofertas
          .filter((o) => o.elementoId === id)
          .map((o) => ({ o, d: distancia(ctx, o.lat, o.lng) }))
          .sort((a, b) =>
            compararOfertas(
              { verificado: a.o.verificado, rating: a.o.rating, resenas: a.o.resenas, precio: a.o.precio, distanciaKm: a.d, recomendado: a.o.recomendado },
              { verificado: b.o.verificado, rating: b.o.rating, resenas: b.o.resenas, precio: b.o.precio, distanciaKm: b.d, recomendado: b.o.recomendado }
            )
          )
          .slice(0, 3)
        const items = lista.map(({ o, d }) => {
          proveedores.add(o.proveedorId)
          const hrefProveedor = `/proveedor/${o.proveedorId}`
          const carrito = linkCarrito(o.stockId, o.elementoNombre, ctx.rol)
          registrarLink(reg, hrefProveedor)
          registrarLink(reg, carrito)
          reg.montos.add(Math.round(o.precio))
          const tarjeta: TarjetaMaterial = {
            tipo: 'material', id: o.stockId, elementoId: o.elementoId, nombre: o.elementoNombre, marca: o.marca, precio: o.precio,
            unidad: o.unidad, estadoStock: o.estado, proveedorId: o.proveedorId, proveedor: o.proveedor, verificado: o.verificado,
            recomendado: o.recomendado, rating: o.rating, resenas: o.resenas, distanciaKm: KM(d), hrefProveedor,
            hrefCarrito: hrefPara(ctx, carrito), aceptaMercadoPago: o.aceptaMercadoPago,
          }
          reg.entidades.set(`material:${o.stockId}`, tarjeta)
          reg.entidades.set(`proveedor:${o.proveedorId}`, {
            tipo: 'proveedor', id: o.proveedorId, nombre: o.proveedor, ciudad: o.ciudad, verificado: o.verificado, rating: o.rating,
            resenas: o.resenas, recomendado: o.recomendado, distanciaKm: KM(d), href: hrefProveedor,
          })
          return {
            ref: `material:${o.stockId}`, proveedor_ref: `proveedor:${o.proveedorId}`, proveedor: o.proveedor, precio: o.precio,
            unidad: o.unidad, marca: o.marca, stock: o.estado === 'por_agotar' ? 'por agotarse' : 'disponible',
            verificado: o.verificado, rating: o.rating, resenas: o.resenas, recomendado: o.recomendado, distancia_km: KM(d),
            acepta_mercado_pago: o.aceptaMercadoPago, link_perfil: hrefProveedor, link_carrito: carrito,
          }
        })
        return items.length
          ? { elemento: el?.tipo === 'elemento' ? el.nombre : id, estado: 'encontrado', ofertas: items }
          : { elemento: el?.tipo === 'elemento' ? el.nombre : id, estado: 'nada', nota: 'NINGÚN proveedor tiene stock hoy: no digas que se consigue en HomIA ni des un precio. Ofrecé buscar un profesional del rubro o volver a consultar más adelante.' }
      })
      const hay = porElemento.some((x) => x.estado === 'encontrado')
      return {
        estado: hay ? 'encontrado' : 'nada',
        salida: txt({
          estado: hay ? 'encontrado' : 'nada',
          nota: `${ctx.lat == null ? 'El usuario no compartió su ubicación: no digas "cerca tuyo". ' : ''}Solo podés citar estos proveedores, precios y marcas. No sumes ni multipliques precios. Si acepta_mercado_pago es false, con ese proveedor se paga en efectivo.${ctx.rol === 'visitante' ? ' El usuario no tiene cuenta: para agregar al carrito tiene que crearla (gratis).' : ''}`,
          materiales: porElemento,
        }),
        resumen: porElemento.map((x) => `${x.elemento}:${x.estado === 'encontrado' ? (x as { ofertas: unknown[] }).ofertas.length : 0}`).join(', ').slice(0, 200),
        progresoDespues: hay ? `Comparando precios de ${proveedores.size} proveedor${proveedores.size === 1 ? '' : 'es'}…` : 'Ningún proveedor tiene stock de eso hoy.',
      }
    },
  }

  // 3) Profesionales
  const inPros = z.object({ rubro: z.string().max(40).nullable(), necesidad: z.string().max(300).nullable(), zona: z.string().max(80).nullable() })
  tools.buscar_profesionales = {
    definicion: {
      type: 'function',
      name: 'buscar_profesionales',
      description:
        'Busca profesionales registrados en HomIA por rubro y zona. El orden ya viene calculado (verificado > reseñas > obras/experiencia > distancia): respetalo. Devuelve id, nombre, rubros, reseñas, obras, verificación, distancia y link al perfil. Nunca devuelve teléfonos ni emails.',
      strict: true,
      parameters: obj({
        rubro: { ...nulo('string'), description: 'plomeria, electricistas, gasistas, pintura, albanileria, carpinteria, climatizacion, techos… o null.' },
        necesidad: { ...nulo('string'), description: 'Qué necesita resolver, en pocas palabras, o null.' },
        zona: { ...nulo('string'), description: 'Barrio o localidad que nombró el usuario (ej. "Palermo") o null.' },
      }),
    },
    entrada: inPros,
    progreso: (i: z.infer<typeof inPros>) => {
      const r = canonicalCategoria(i.rubro || undefined) || canonicalCategoria(i.necesidad || undefined)
      const quien = r ? ({ plomeria: 'plomeros', electricistas: 'electricistas', gasistas: 'gasistas', pintura: 'pintores', albanileria: 'albañiles', carpinteria: 'carpinteros' } as Record<string, string>)[r] || `profesionales de ${r}` : 'profesionales'
      return `Buscando ${quien}${i.zona ? ` en ${i.zona}` : ctx.lat != null ? ' cerca' : ''}…`
    },
    ejecutar: async (i: z.infer<typeof inPros>) => {
      const rubro = canonicalCategoria(i.rubro || undefined) || canonicalCategoria(i.necesidad || undefined)
      const loc = ubicacion(ctx, i.zona)
      const pros = await datos.profesionales()
      const candidatos = pros.filter((p) => {
        if (rubro) return p.rubros.some((r) => canonicalCategoria(r) === rubro || r === rubro)
        if (i.necesidad) return matchTerms(i.necesidad, `${p.rubros.join(' ')} ${p.habilidades.join(' ')} ${p.bio}`)
        return true
      })
      const conDist = candidatos
        .map((p) => ({ p, d: distancia(loc, p.lat, p.lng) }))
        .filter((x) => x.d == null || x.d <= 60)
        .sort((a, b) =>
          compararProfesionales(
            { verificado: a.p.verificado, rating: a.p.rating, resenas: a.p.resenas, obras: a.p.obras, experiencia: a.p.experiencia, distanciaKm: a.d },
            { verificado: b.p.verificado, rating: b.p.rating, resenas: b.p.resenas, obras: b.p.obras, experiencia: b.p.experiencia, distanciaKm: b.d }
          )
        )
        .slice(0, 4)
      if (conDist.length === 0) {
        return {
          estado: 'nada',
          salida: txt({ estado: 'nada', rubro, nota: `NO hay profesionales${rubro ? ` de ${rubro}` : ''} registrados${loc.lat != null ? ' en esa zona' : ''}. No inventes nombres. Ofrecé publicar el trabajo gratis para recibir presupuestos (Publicar trabajo).` }),
          resumen: `0 profesionales ${rubro || ''}`,
        }
      }
      const items = conDist.map(({ p, d }) => {
        const href = `/profesional/${p.id}`
        registrarLink(reg, href)
        reg.entidades.set(`profesional:${p.id}`, {
          tipo: 'profesional', id: p.id, nombre: p.nombre, rubros: p.rubros, ciudad: p.ciudad, verificado: p.verificado,
          rating: p.rating, resenas: p.resenas, obras: p.obras, distanciaKm: KM(d), href,
        })
        return {
          ref: `profesional:${p.id}`, nombre: p.nombre, rubros: p.rubros, ciudad: p.ciudad, verificado: p.verificado,
          rating: p.rating, resenas: p.resenas, obras: p.obras, anios_experiencia: p.experiencia, distancia_km: KM(d), link_perfil: href,
        }
      })
      return {
        estado: 'encontrado',
        salida: txt({
          estado: 'encontrado',
          ubicacion_usada: loc.origen,
          nota: `${loc.lat == null ? 'Sin ubicación: no digas que están cerca. ' : loc.origen.startsWith('centro') ? `Distancias medidas desde el ${loc.origen}: decí "aproximadamente". ` : ''}Solo podés nombrar estos profesionales. Nunca prometas precio ni disponibilidad: eso lo acuerdan por chat o presupuesto.${ctx.rol === 'visitante' ? ' Para contactarlos el usuario necesita cuenta (gratis).' : ''}`,
          profesionales: items,
        }),
        resumen: items.map((x) => `${x.nombre}${x.verificado ? '✓' : ''}`).join(', ').slice(0, 200),
      }
    },
  }

  // 4) Trabajos publicados (para profesionales)
  const inJobs = z.object({ rubro: z.string().max(40).nullable(), zona: z.string().max(80).nullable() })
  tools.buscar_trabajos = {
    definicion: {
      type: 'function',
      name: 'buscar_trabajos',
      description:
        'Trabajos publicados por clientes y abiertos a presupuestos, por rubro y zona (para profesionales que buscan trabajo). Devuelve título, rubro, urgencia, presupuesto estimado, ciudad, cuántos presupuestos recibió y link. Nunca trae datos del cliente.',
      strict: true,
      parameters: obj({
        rubro: { ...nulo('string'), description: 'Rubro del trabajo o null (si es profesional, el sistema usa sus rubros).' },
        zona: { ...nulo('string'), description: 'Barrio o localidad o null.' },
      }),
    },
    entrada: inJobs,
    progreso: (i: z.infer<typeof inJobs>) => `Buscando trabajos publicados${i.rubro ? ` de ${i.rubro}` : ''}${i.zona ? ` en ${i.zona}` : ''}…`,
    ejecutar: async (i: z.infer<typeof inJobs>) => {
      let rubros: string[] = []
      const r = canonicalCategoria(i.rubro || undefined)
      if (r) rubros = [r]
      else if (ctx.rol === 'profesional' && ctx.userId) {
        rubros = (await datos.rubrosDelProfesional(ctx.userId)).map((x) => canonicalCategoria(x) || x)
      }
      const loc = ubicacion(ctx, i.zona)
      const todos = await datos.trabajosAbiertos()
      const delRubro = rubros.length ? todos.filter((j) => rubros.includes(canonicalCategoria(j.rubro) || j.rubro)) : todos
      const lista = delRubro
        .map((j) => ({ j, d: distancia(loc, j.lat, j.lng) }))
        .filter((x) => x.d == null || x.d <= 60)
        .sort((a, b) => (a.d ?? 1e9) - (b.d ?? 1e9) || b.j.creado.getTime() - a.j.creado.getTime())
        .slice(0, 5)
      if (lista.length === 0) {
        return {
          estado: 'nada',
          salida: txt({
            estado: 'nada',
            rubros,
            trabajos_abiertos_de_otros_rubros: todos.length,
            nota: `NO hay trabajos abiertos${rubros.length ? ` de ${rubros.join(', ')}` : ''}${loc.lat != null ? ' en esa zona' : ''} ahora. No inventes trabajos. Sugerí revisar la Bolsa de trabajos más seguido y completar el perfil (DNI, obras) para que lo contraten directo.`,
          }),
          resumen: `0 trabajos ${rubros.join(',')}`,
        }
      }
      const items = lista.map(({ j, d }) => {
        const href = `/trabajo/${j.id}`
        registrarLink(reg, href)
        if (j.presupuestoMin) reg.montos.add(Math.round(j.presupuestoMin))
        if (j.presupuestoMax) reg.montos.add(Math.round(j.presupuestoMax))
        reg.entidades.set(`trabajo:${j.id}`, {
          tipo: 'trabajo', id: j.id, titulo: j.titulo, rubro: j.rubro, urgencia: j.urgencia, presupuestoMin: j.presupuestoMin,
          presupuestoMax: j.presupuestoMax, ciudad: j.ciudad, presupuestos: j.presupuestos, distanciaKm: KM(d), href,
        })
        return {
          ref: `trabajo:${j.id}`, titulo: j.titulo, detalle: j.descripcion.slice(0, 160), rubro: j.rubro, urgencia: j.urgencia,
          presupuesto_estimado: j.presupuestoMin || j.presupuestoMax ? [j.presupuestoMin, j.presupuestoMax] : null,
          ciudad: j.ciudad, presupuestos_recibidos: j.presupuestos, distancia_km: KM(d), link: href,
        }
      })
      return {
        estado: 'encontrado',
        salida: txt({
          estado: 'encontrado',
          rubros,
          ubicacion_usada: loc.origen,
          nota: `Solo podés citar estos trabajos. El presupuesto estimado es del cliente, es una referencia.${ctx.rol !== 'profesional' ? ' Para presupuestar hace falta cuenta de profesional.' : ''}`,
          trabajos: items,
        }),
        resumen: items.map((x) => x.titulo).join(' | ').slice(0, 200),
      }
    },
  }

  // 5) Cómo funciona HomIA (base de conocimiento)
  const inComo = z.object({ tema: z.string().min(2).max(200) })
  tools.como_funciona_homia = {
    definicion: {
      type: 'function',
      name: 'como_funciona_homia',
      description:
        'Base de conocimiento de HomIA: qué es, precios y planes, pagos y cargo de servicio, carrito y pedidos, sobrantes, verificación DNI, reseñas, mensajes, y el paso a paso de cada sección y problema típico del rol del usuario (con su ruta). Usala para cualquier pregunta sobre cómo se usa la app o cuánto cuesta.',
      strict: true,
      parameters: obj({ tema: { type: 'string', description: 'Lo que quiere saber, en pocas palabras.' } }),
    },
    entrada: inComo,
    progreso: () => 'Revisando cómo funciona eso en HomIA…',
    ejecutar: async (i: z.infer<typeof inComo>) => {
      const hits = buscarConocimiento(i.tema, ctx.rol)
      if (hits.length === 0) {
        return {
          estado: 'nada',
          salida: txt({ estado: 'nada', nota: 'La base de HomIA no tiene información sobre eso. No lo inventes ni supongas que existe: decí que eso no lo manejamos desde acá y ofrecé el Centro de ayuda.' }),
          resumen: `nada: ${i.tema}`,
        }
      }
      for (const h of hits) {
        if (h.ruta) registrarLink(reg, h.ruta)
        for (const m of montosDeTexto(h.texto)) reg.montos.add(m)
      }
      return {
        estado: 'encontrado',
        salida: txt({
          estado: 'encontrado',
          nota: 'Respondé con esto y nada más. Si la pregunta pide algo que no está acá, decí que no lo manejamos desde acá.',
          entradas: hits.map((h) => ({ titulo: h.titulo, texto: h.texto, ruta: h.ruta ?? null })),
        }),
        resumen: hits.map((h) => h.titulo).join(' | ').slice(0, 200),
      }
    },
  }

  // 6) Pendientes del usuario de la sesión (solo con cuenta)
  if (ctx.userId && ctx.rol !== 'visitante') {
    const userId = ctx.userId
    const rolPanel = ctx.rol
    const inPend = z.object({})
    tools.mis_pendientes = {
      definicion: {
        type: 'function',
        name: 'mis_pendientes',
        description: `Pendientes REALES del usuario que está hablando, en su rol actual (${rolPanel}): pedidos por pagar o por aprobar, facturas, cobros, ofertas, proyectos activos, stock agotado, plan. Solo lectura. Usala cuando pregunte qué tiene pendiente, qué hacer ahora o por qué algo no avanza.`,
        strict: true,
        parameters: obj({}),
      },
      entrada: inPend,
      progreso: () => 'Revisando tus pendientes…',
      ejecutar: async () => {
        const p = await datos.pendientes(userId, rolPanel)
        for (const x of p) registrarLink(reg, x.ruta)
        if (p.length === 0) {
          return {
            estado: 'nada',
            salida: txt({ estado: 'nada', nota: 'No tiene pendientes en este rol ahora mismo. Decíselo así; no inventes tareas.' }),
            resumen: 'sin pendientes',
          }
        }
        return {
          estado: 'encontrado',
          salida: txt({ estado: 'encontrado', nota: 'Datos del propio usuario. Citá cantidades y la ruta exacta.', pendientes: p }),
          resumen: p.map((x) => `${x.cantidad} ${x.texto}`).join('; ').slice(0, 200),
        }
      },
    }
  }

  return tools
}

// ── La respuesta final: herramienta obligatoria validada con schema ──
export const RESPONDER_DEF: DefinicionHerramienta = {
  type: 'function',
  name: 'responder',
  description:
    'OBLIGATORIA para terminar. Es la única forma de contestarle al usuario. Si el sistema la rechaza, corregí lo que dice el error y volvé a llamarla.',
  strict: true,
  parameters: obj({
    mensaje: { type: 'string', description: 'La respuesta al usuario (español rioplatense, voseo, 1 a 5 frases, sin links ni URLs).' },
    tarjetas: {
      type: 'array',
      items: { type: 'string' },
      description: 'refs "tipo:id" EXACTAS devueltas por las herramientas (material:…, proveedor:…, profesional:…, trabajo:…, elemento:…), las más útiles primero, máximo 6. [] si no hay.',
    },
    acciones: {
      type: 'array',
      items: obj({ etiqueta: { type: 'string' }, href: { type: 'string' } }),
      description: '1 a 3 accesos: etiqueta corta + ruta de una sección de la app o un link devuelto por una herramienta.',
    },
    sugerencias: { type: 'array', items: { type: 'string' }, description: '0 a 3 preguntas cortas que el usuario podría hacer después.' },
    pregunta_aclaracion: { ...nulo('string'), description: 'UNA pregunta si falta un dato esencial, o null.' },
    evidencia: { type: 'string', description: 'Qué dato de qué herramienta respalda la respuesta (para auditoría, no se muestra).' },
  }),
}

export const RespuestaSchema = z.object({
  mensaje: z.string().trim().min(2, 'el mensaje está vacío').max(900, 'el mensaje es demasiado largo (máximo 900 caracteres): acortalo'),
  tarjetas: z.array(z.string().max(80)).max(6, 'máximo 6 tarjetas'),
  acciones: z
    .array(z.object({ etiqueta: z.string().trim().min(2).max(60, 'etiqueta de acción de máximo 60 caracteres'), href: z.string().trim().min(1).max(300) }))
    .min(1, 'tiene que haber al menos 1 acción con link')
    .max(3, 'máximo 3 acciones'),
  sugerencias: z.array(z.string().trim().min(2).max(80)).max(3, 'máximo 3 sugerencias'),
  pregunta_aclaracion: z.string().trim().max(200).nullable(),
  evidencia: z.string().trim().min(5, 'la evidencia es obligatoria: citá qué dato de qué herramienta usaste').max(600),
})
export type RespuestaModelo = z.infer<typeof RespuestaSchema>
