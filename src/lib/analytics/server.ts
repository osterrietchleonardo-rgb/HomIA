// Métricas de uso (D27) — lado servidor: inserción del lote en UNA consulta y eventos de servidor.
// Registrar un evento NUNCA rompe ni demora el flujo (PLAYBOOK: "registrar un evento nunca rompe
// el flujo"): los eventos de servidor se escriben con `after()` (después de responder) y todo
// error se traga con un aviso en el log.
import 'server-only'
import { randomUUID } from 'node:crypto'
import { after } from 'next/server'
import { cookies } from 'next/headers'
import { db } from '@/lib/db'
import { hashSeguro, ipDe } from '@/lib/homy/cupo'
import { normalizarRuta, sumarLatidos, resumirDispositivo, type TipoEntidad } from './core'
import type { Lote } from './schema'

/** Cookie propia (no httpOnly) que el tracker escribe con `<anonId>.<sessionId>` para que los
 *  eventos de servidor (login, registro…) queden en la misma línea de tiempo del visitante. */
export const COOKIE_ANALITICA = 'homia_anon_id'
/** Retención de eventos crudos: 13 meses (las sesiones se conservan para las series históricas). */
export const RETENCION_EVENTOS_DIAS = 396

const RE_ID = /^[A-Za-z0-9_-]{8,64}$/

export function parsearCookieAnalitica(v: string | null | undefined): { anonId: string; sessionId: string } | null {
  const [a, s] = String(v || '').split('.')
  if (!a || !RE_ID.test(a)) return null
  return { anonId: a, sessionId: s && RE_ID.test(s) ? s : `srv-${a.slice(0, 40)}` }
}

type Fila = {
  id: string; type: string; name: string; path: string
  entityType: string | null; entityId: string | null; role: string | null
  props: unknown; createdAt: string
}

/**
 * Guarda un lote validado: inserta los eventos (sin los latidos), crea/actualiza la sesión
 * (tiempo activo, vistas, eventos) y vincula al usuario lo anónimo previo del mismo navegador.
 * Todo en UNA consulta (con el pooler cada consulta de Prisma ≈ 4 idas a la base).
 */
export async function guardarLote(lote: Lote, userId: string | null, uaHeader: string): Promise<{ insertados: number; vinculados: number }> {
  const ahora = Date.now()
  const minimo = ahora - 24 * 3600_000
  const fecha = (at?: number) => new Date(at && at >= minimo && at <= ahora + 60_000 ? Math.min(at, ahora) : ahora).toISOString()
  const latidos: number[] = []
  const filas: Fila[] = []
  let vistas = 0
  for (const e of lote.events) {
    if (e.type === 'heartbeat') { latidos.push(Number(e.props?.ms ?? 0)); continue }
    if (e.type === 'page_view') vistas++
    filas.push({
      id: randomUUID(), type: e.type, name: e.name, path: normalizarRuta(e.path),
      entityType: e.entityType ?? null, entityId: e.entityId ?? null, role: e.role ?? null,
      props: e.props ?? null, createdAt: fecha(e.at),
    })
  }
  const activo = sumarLatidos(latidos)
  const s = lote.sesion
  const device = s?.device || resumirDispositivo(uaHeader)
  const deviceFull = s?.screen ? `${device} · ${s.screen}`.slice(0, 80) : device
  const inicio = new Date(s?.startedAt && s.startedAt >= minimo && s.startedAt <= ahora ? s.startedAt : ahora).toISOString()
  const ultimo = new Date(ahora).toISOString()
  const utm = s?.utm && Object.keys(s.utm).length ? JSON.stringify(s.utm) : null

  const r = await db.$queryRaw<{ ev: number; vinc: number }[]>`
    WITH u AS (
      SELECT id FROM "User" WHERE id = ${userId}::text AND "deletedAt" IS NULL
    ), datos AS (
      SELECT * FROM jsonb_to_recordset(${JSON.stringify(filas)}::jsonb)
        AS x(id text, type text, name text, path text, "entityType" text, "entityId" text, role text, props jsonb, "createdAt" timestamptz)
    ), ev AS (
      INSERT INTO "AnalyticsEvent" (id, "userId", "anonId", "sessionId", role, type, name, path, "entityType", "entityId", props, device, "createdAt")
      SELECT id, (SELECT id FROM u), ${lote.anonId}, ${lote.sessionId}, role, type, name, path, "entityType", "entityId", props, ${deviceFull},
             ("createdAt" AT TIME ZONE 'UTC')
      FROM datos
      RETURNING 1
    ), ses AS (
      INSERT INTO "AnalyticsSession" (id, "userId", "anonId", "startedAt", "lastSeenAt", "activeMs", "pageViews", events, "entryPath", referrer, utm, device)
      VALUES (${lote.sessionId}, (SELECT id FROM u), ${lote.anonId}, (${inicio}::timestamptz AT TIME ZONE 'UTC'), (${ultimo}::timestamptz AT TIME ZONE 'UTC'),
              ${activo}::int, ${vistas}::int, ${filas.length}::int, ${s?.entryPath ? normalizarRuta(s.entryPath) : null}::text,
              ${s?.referrer ?? null}::text, ${utm}::jsonb, ${deviceFull}::text)
      ON CONFLICT (id) DO UPDATE SET
        "userId" = COALESCE("AnalyticsSession"."userId", EXCLUDED."userId"),
        "lastSeenAt" = GREATEST("AnalyticsSession"."lastSeenAt", EXCLUDED."lastSeenAt"),
        "activeMs" = LEAST("AnalyticsSession"."activeMs" + EXCLUDED."activeMs", 2000000000),
        "pageViews" = "AnalyticsSession"."pageViews" + EXCLUDED."pageViews",
        events = "AnalyticsSession".events + EXCLUDED.events
      WHERE "AnalyticsSession"."anonId" = EXCLUDED."anonId"
      RETURNING 1
    ), vinc_ev AS (
      UPDATE "AnalyticsEvent" SET "userId" = (SELECT id FROM u)
      WHERE EXISTS (SELECT 1 FROM u) AND "anonId" = ${lote.anonId} AND "userId" IS NULL
      RETURNING 1
    ), vinc_ses AS (
      UPDATE "AnalyticsSession" SET "userId" = (SELECT id FROM u)
      WHERE EXISTS (SELECT 1 FROM u) AND "anonId" = ${lote.anonId} AND "userId" IS NULL AND id <> ${lote.sessionId}
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM ev)::int AS ev,
           ((SELECT count(*) FROM vinc_ev) + (SELECT count(*) FROM vinc_ses) + (SELECT count(*) FROM ses) * 0)::int AS vinc`
  return { insertados: r[0]?.ev ?? 0, vinculados: r[0]?.vinc ?? 0 }
}

export type EventoServidor = {
  name: string // login_ok | login_fallido | logout | registro | plan_solicitado | plan_activado | plan_degradado | factura_pdf
  userId?: string | null
  path?: string
  entityType?: TipoEntidad | null
  entityId?: string | null
  props?: Record<string, string | number | boolean | null>
  /** login y registro: vincular lo anónimo previo de este navegador al usuario */
  vincular?: boolean
}

async function escribirEventoServidor(e: EventoServidor, ctx: { anonId: string; sessionId: string; device: string | null; ipHash: string | null }) {
  const props = { ...(e.props || {}), ...(ctx.ipHash ? { ipHash: ctx.ipHash } : {}) }
  const vinc = e.vincular && e.userId ? e.userId : null
  await db.$executeRaw`
    WITH ev AS (
      INSERT INTO "AnalyticsEvent" (id, "userId", "anonId", "sessionId", role, type, name, path, "entityType", "entityId", props, device, "createdAt")
      VALUES (${randomUUID()}, ${e.userId ?? null}::text, ${ctx.anonId}, ${ctx.sessionId}, NULL, 'server', ${e.name.slice(0, 80)},
              ${normalizarRuta(e.path || '/')}, ${e.entityType ?? null}::text, ${e.entityId ?? null}::text, ${JSON.stringify(props)}::jsonb,
              ${ctx.device}::text, now() AT TIME ZONE 'UTC')
      RETURNING 1
    ), vinc_ev AS (
      UPDATE "AnalyticsEvent" SET "userId" = ${vinc}::text
      WHERE ${vinc}::text IS NOT NULL AND "anonId" = ${ctx.anonId} AND "userId" IS NULL
      RETURNING 1
    ), vinc_ses AS (
      UPDATE "AnalyticsSession" SET "userId" = ${vinc}::text
      WHERE ${vinc}::text IS NOT NULL AND "anonId" = ${ctx.anonId} AND "userId" IS NULL
      RETURNING 1
    )
    SELECT (SELECT count(*) FROM ev) + (SELECT count(*) FROM vinc_ev) + (SELECT count(*) FROM vinc_ses)`
}

/**
 * Registra un evento de servidor SIN demorar la respuesta (se escribe con `after()`).
 * `req` da la IP (se guarda solo su huella cifrada) y el user agent. Nunca tira.
 */
export function registrarEvento(req: Request | null, e: EventoServidor): void {
  try {
    const h = req?.headers
    const ua = h?.get('user-agent') || ''
    const ipHash = h ? hashSeguro(`ip:${ipDe(h)}`) : null
    let cookieVal: string | null = null
    const m = (h?.get('cookie') || '').match(/(?:^|;\s*)homia_anon_id=([^;]+)/)
    if (m) { try { cookieVal = decodeURIComponent(m[1]) } catch { cookieVal = m[1] } }
    const ids = parsearCookieAnalitica(cookieVal)
    const ctx = {
      anonId: ids?.anonId || `srv-${e.userId || 'anon'}`.slice(0, 64),
      sessionId: ids?.sessionId || `srv-${e.userId || 'anon'}`.slice(0, 64),
      device: ua ? resumirDispositivo(ua) : null,
      ipHash,
    }
    const tarea = () => escribirEventoServidor(e, ctx).catch((err) => console.warn('[metricas] no se pudo registrar', e.name, err instanceof Error ? err.message : err))
    try { after(tarea) } catch { void tarea() } // fuera de un request (scripts) no hay after()
  } catch (err) {
    console.warn('[metricas] registrarEvento', err instanceof Error ? err.message : err)
  }
}

/** Lee la cookie de analítica del request actual (para rutas sin `req` a mano). */
export async function cookieAnaliticaActual(): Promise<{ anonId: string; sessionId: string } | null> {
  try {
    const c = await cookies()
    return parsearCookieAnalitica(c.get(COOKIE_ANALITICA)?.value)
  } catch {
    return null
  }
}

/** Retención (D27): borra eventos crudos de más de 13 meses, de a tandas. La llama el cron diario. */
export async function purgarEventosViejos(): Promise<number> {
  try {
    return await db.$executeRaw`
      DELETE FROM "AnalyticsEvent" WHERE id IN (
        SELECT id FROM "AnalyticsEvent" WHERE "createdAt" < (now() AT TIME ZONE 'UTC') - make_interval(days => ${RETENCION_EVENTOS_DIAS}::int) LIMIT 50000
      )`
  } catch (err) {
    console.warn('[metricas] purga de retención', err instanceof Error ? err.message : err)
    return 0
  }
}
