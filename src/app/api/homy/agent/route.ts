// Súper agente Homy — endpoint único de las tres puertas (buscador de la home,
// botón flotante y mascota del panel; también la tarjeta de /buscar).
//
// Grafo determinista con un solo nodo agéntico:
// [0] puerta, rol y usuario (del JWT, nunca del body) + IP (hash)
// [1] cupo: visitante 8/día por IP, logueado 60/día → si está agotado, aviso sin llamar al modelo
// [2] contexto fijo (rol, ubicación, pantalla) + historial de la sesión
// [3] loop ≤ 6 vueltas con herramientas de solo lectura (cupo descontado justo antes de la 1ª llamada)
// [4] respuesta final por la herramienta obligatoria "responder" (zod)
// [5] guardarraíles en código (links, entidades, montos, frases, largo)
// [6] registro HomyRun + sesión + mensajes
// [7] stream NDJSON: pasos legibles, texto a medida que se escribe, tarjetas
// Si la IA falla: respaldo honesto con búsqueda directa (sin inventar).
import { NextRequest } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { fail, ok } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { correrAgente, type Paso } from '@/lib/homy/loop'
import { crearHerramientas, registroVacio, type Contexto } from '@/lib/homy/herramientas'
import { fuenteDatosPrisma } from '@/lib/homy/datos'
import { llamarModeloOpenAI, costoUsd, HOMY_MODEL, HOMY_EFFORT, type Uso } from '@/lib/homy/openai'
import { claveCupo, consumirCupo, CupoAgotado, devolverCupo, hashSeguro, ipDe, leerCupo } from '@/lib/homy/cupo'
import { responderSinIA } from '@/lib/homy/respaldo'
import { accionesPorDefecto } from '@/lib/homy/loop'
import { normalizarHref } from '@/lib/homy/rutas'
import type { Cupo, EventoHomy, RespuestaFinal, RolHomy, TurnoGuardado } from '@/lib/homy/tipos'

export const runtime = 'nodejs'
export const maxDuration = 60

const BodySchema = z.object({
  mensaje: z.string().trim().min(2, 'Escribí tu consulta').max(600, 'La consulta es muy larga (máximo 600 caracteres)'),
  puerta: z.enum(['home_buscador', 'home_flotante', 'panel', 'buscar']),
  sessionId: z.string().max(40).nullish(),
  pagina: z.string().max(160).nullish(),
  rolPanel: z.enum(['cliente', 'profesional', 'proveedor']).nullish(),
  lat: z.number().min(-90).max(90).nullish(),
  lng: z.number().min(-180).max(180).nullish(),
})

const TOKEN_VISITANTE = /^[A-Za-z0-9_-]{16,80}$/

/** Tope de gasto: consultas con IA por día para TODOS los visitantes juntos. */
const CLAVE_GLOBAL_VISITANTES = {
  key: 'global:visitantes',
  limite: Number(process.env.HOMY_TOPE_DIARIO_VISITANTES || 3000),
  tipo: 'visitante' as const,
}

function rolDe(user: { roles: string[] } | null, pedido: string | null | undefined): RolHomy {
  if (!user) return 'visitante'
  const validos = user.roles.filter((r): r is 'cliente' | 'profesional' | 'proveedor' => r === 'cliente' || r === 'profesional' || r === 'proveedor')
  if (pedido && validos.includes(pedido as 'cliente')) return pedido as RolHomy
  return validos[0] || 'cliente'
}

async function sesionPropia(sessionId: string | null | undefined, userId: string | null, visitorHash: string | null) {
  if (!sessionId) return null
  const s = await db.homySession.findUnique({ where: { id: sessionId } })
  if (!s) return null
  if (userId ? s.userId === userId : !s.userId && !!visitorHash && s.visitorHash === visitorHash) return s
  return null
}

function payloadDe(f: RespuestaFinal) {
  return JSON.stringify({ tarjetas: f.tarjetas, acciones: f.acciones, sugerencias: f.sugerencias, pregunta: f.pregunta })
}

// ── GET: historial de una sesión (compartida entre el buscador y el flotante) ──
export async function GET(req: NextRequest) {
  const sessionId = req.nextUrl.searchParams.get('sessionId')
  const user = await getSessionUser()
  const token = req.headers.get('x-homy-visitante') || ''
  const visitorHash = !user && TOKEN_VISITANTE.test(token) ? hashSeguro(`visitante:${token}`) : null
  const ipHash = hashSeguro(ipDe(req.headers))
  const cupo = await leerCupo(claveCupo(user?.id ?? null, ipHash)).catch(() => null)
  const s = await sesionPropia(sessionId, user?.id ?? null, visitorHash)
  if (!s) return ok({ turnos: [], sessionId: null, cupo })
  const msgs = await db.homyMessage.findMany({ where: { sessionId: s.id, role: { in: ['user', 'homy'] } }, orderBy: { createdAt: 'desc' }, take: 30 })
  const turnos: TurnoGuardado[] = msgs.reverse().map((m) => {
    let extra: Partial<TurnoGuardado> = {}
    try { extra = m.payload ? JSON.parse(m.payload) : {} } catch { /* payload viejo */ }
    return { id: m.id, rol: m.role as 'user' | 'homy', texto: m.content, tarjetas: extra.tarjetas, acciones: extra.acciones, sugerencias: extra.sugerencias }
  })
  return ok({ turnos, sessionId: s.id, cupo })
}

// ── POST: una consulta, respondida en streaming NDJSON ──
export async function POST(req: NextRequest) {
  let raw: unknown = null
  try { raw = await req.json() } catch { /* body vacío */ }
  const parsed = BodySchema.safeParse(raw)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message || 'Datos inválidos', 400)
  const b = parsed.data

  // [0] quién pregunta: SIEMPRE del JWT
  const user = await getSessionUser()
  const rol = rolDe(user, b.rolPanel)
  const token = req.headers.get('x-homy-visitante') || ''
  const visitorHash = !user && TOKEN_VISITANTE.test(token) ? hashSeguro(`visitante:${token}`) : null
  const ipHash = hashSeguro(ipDe(req.headers))
  const clave = claveCupo(user?.id ?? null, ipHash)
  const pagina = b.pagina && normalizarHref(b.pagina) ? b.pagina : null
  const ctx: Contexto = {
    rol,
    rolesUsuario: user?.roles ?? [],
    userId: user?.id ?? null,
    nombre: user?.displayName ?? null,
    puerta: b.puerta,
    pagina,
    lat: b.lat ?? user?.lat ?? null,
    lng: b.lng ?? user?.lng ?? null,
  }

  const t0 = Date.now()
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emitir = (ev: EventoHomy) => {
        try { controller.enqueue(encoder.encode(`${JSON.stringify(ev)}\n`)) } catch { /* el cliente cerró */ }
      }
      const pasos: Paso[] = []
      let uso: Uso = { entrada: 0, cache: 0, salida: 0, razon: 0 }
      let vueltas = 0
      let resultado = 'ok'
      let error: string | null = null
      let final: RespuestaFinal | null = null
      let cupo: Cupo | null = null
      let sessionId: string | null = null
      let cupoConsumido = false
      const reg = registroVacio()

      const registrarCorrida = async (respuesta: string | null) => {
        try {
          const run = await db.homyRun.create({
            data: {
              sessionId, userId: user?.id ?? null, ipHash: user ? null : ipHash, puerta: b.puerta, rol, pregunta: b.mensaje,
              pasos: JSON.stringify(pasos), modelo: HOMY_MODEL, esfuerzo: HOMY_EFFORT, vueltas,
              tokensEntrada: uso.entrada, tokensSalida: uso.salida, tokensRazon: uso.razon, tokensCache: uso.cache,
              costoUsd: costoUsd(uso), latenciaMs: Date.now() - t0, resultado, error, respuesta,
            },
            select: { id: true },
          })
          return run.id
        } catch (e) {
          console.error('[homy] no se pudo registrar la corrida', e)
          return null
        }
      }

      try {
        // [1] cupo: si ya está agotado, aviso honesto SIN llamar al modelo
        cupo = await leerCupo(clave)
        if (cupo.restantes <= 0) throw new CupoAgotado(cupo)

        // [2] sesión e historial (solo si es del mismo usuario / visitante)
        const s = await sesionPropia(b.sessionId, user?.id ?? null, visitorHash)
        sessionId = s?.id ?? null
        const historial = s
          ? (await db.homyMessage.findMany({ where: { sessionId: s.id, role: { in: ['user', 'homy'] } }, orderBy: { createdAt: 'desc' }, take: 8 }))
              .reverse()
              .map((m) => ({ rol: m.role as 'user' | 'homy', texto: m.content }))
          : []
        emitir({ t: 'inicio', sessionId, cupo })

        const herramientas = crearHerramientas(ctx, fuenteDatosPrisma, reg)
        try {
          // [3]-[5] el nodo agéntico
          const r = await correrAgente({
            ctx, historial, pregunta: b.mensaje, herramientas, reg, llamar: llamarModeloOpenAI, emitir,
            alLlamarIA: async () => {
              const c = await consumirCupo(clave)
              if (!c) throw new CupoAgotado({ ...cupo!, usadas: cupo!.limite, restantes: 0 })
              cupo = c
              cupoConsumido = true
              // kill-switch y tope global diario de visitantes: si saltan, respaldo sin IA (y se devuelve el cupo)
              if (process.env.HOMY_APAGADO === '1') throw new Error('Homy apagado por HOMY_APAGADO=1')
              if (!user) {
                const global = await consumirCupo(CLAVE_GLOBAL_VISITANTES)
                if (!global) throw new Error(`tope global diario de visitantes (${CLAVE_GLOBAL_VISITANTES.limite}) alcanzado`)
              }
            },
          })
          pasos.push(...r.pasos)
          uso = r.uso
          vueltas = r.vueltas
          resultado = r.resultado
          final = r.final
        } catch (e) {
          if (e instanceof CupoAgotado) throw e
          // la IA falló: respaldo honesto con búsqueda directa
          console.error('[homy] falla del modelo, respaldo sin IA:', (e as Error).message)
          resultado = 'fallback_ia'
          error = (e as Error).message.slice(0, 500)
          emitir({ t: 'texto_reinicio' })
          final = await responderSinIA(ctx, b.mensaje, herramientas, reg, pasos)
          // la consulta no se cobra del cupo si la IA no respondió
          if (cupoConsumido) {
            await devolverCupo(clave).catch(() => null)
            cupo = cupo ? { ...cupo, usadas: cupo.usadas - 1, restantes: cupo.restantes + 1 } : cupo
          }
        }

        // [6] persistir sesión y mensajes
        if (!sessionId) {
          const nueva = await db.homySession.create({
            data: { userId: user?.id ?? null, visitorHash: user ? null : visitorHash, puerta: b.puerta, title: b.mensaje.slice(0, 60) },
            select: { id: true },
          })
          sessionId = nueva.id
        } else {
          await db.homySession.update({ where: { id: sessionId }, data: { updatedAt: new Date() } })
        }
        const runId = await registrarCorrida(final.mensaje)
        await db.homyMessage.createMany({
          data: [
            { sessionId, role: 'user', content: b.mensaje, runId },
            { sessionId, role: 'homy', content: final.mensaje, runId, payload: payloadDe(final) },
          ],
        })
        // analítica de demanda (alimenta el panel PRO de proveedores), nunca bloquea
        const proveedores = [...new Set(final.tarjetas.flatMap((t) => (t.tipo === 'material' ? [t.proveedorId] : t.tipo === 'proveedor' ? [t.id] : [])))]
        const buscoAlgo = pasos.some((p) => /buscar|sugerir/.test(p.herramienta))
        if (buscoAlgo) {
          const modo = pasos.some((p) => p.herramienta.startsWith('buscar_trabajos')) ? 'profesional' : pasos.some((p) => /sugerir|proveedores/.test(p.herramienta)) ? 'materiales' : 'cliente'
          await db.searchEvent
            .create({
              data: {
                userId: user?.id ?? null, mode: modo, query: b.mensaje.slice(0, 300),
                intent: JSON.stringify({ homyRunId: runId, puerta: b.puerta }),
                results: JSON.stringify({ count: final.tarjetas.length, providerIds: proveedores }),
              },
            })
            .catch(() => null)
        }
        // [7] respuesta final
        emitir({ t: 'final', sessionId, cupo, runId, ...final })
      } catch (e) {
        if (e instanceof CupoAgotado) {
          resultado = 'limite'
          const volver = pagina || '/'
          const mensaje =
            clave.tipo === 'visitante'
              ? 'Llegaste al límite de consultas de hoy sin cuenta: creá tu cuenta gratis y seguimos.'
              : 'Llegaste al límite de consultas de hoy con Homy. Mañana se renueva; mientras tanto tenés todo en tu panel y en el Centro de ayuda.'
          const acciones =
            clave.tipo === 'visitante'
              ? [
                  { etiqueta: 'Crear cuenta gratis', href: `/registrarse?volver=${encodeURIComponent(volver)}` },
                  { etiqueta: 'Ya tengo cuenta', href: `/ingresar?volver=${encodeURIComponent(volver)}` },
                ]
              : accionesPorDefecto(ctx)
          await registrarCorrida(mensaje)
          emitir({ t: 'limite', mensaje, acciones, cupo: e.cupo })
        } else {
          resultado = 'error'
          error = (e as Error).message.slice(0, 500)
          console.error('[homy] error', e)
          await registrarCorrida(null)
          emitir({ t: 'error', mensaje: 'Tuvimos un problema para responder. Probá de nuevo en unos segundos.' })
        }
      } finally {
        try { controller.close() } catch { /* ya cerrado */ }
      }
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Accel-Buffering': 'no',
    },
  })
}
