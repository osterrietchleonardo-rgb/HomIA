// Métricas del administrador (D27) — todo calculado en el servidor con SQL agregado.
// Dos fuentes, sin duplicar:
//   · USO: AnalyticsEvent / AnalyticsSession (registro propio desde el 25/09/2026).
//   · NEGOCIO: las tablas reales (User, Project, Invoice, ProviderCharge, Purchase, Order, Review,
//     Message, JobBid, LeftoverReturn, Feedback, HomyRun…). Nada se inventa: si no hay datos, 0 o null.
// Cada sección hace pocas consultas (con el pooler cada consulta ≈ 4 idas a la base).
// Definiciones exactas: docs/interno/LOGICA-HOMIA.md (Métricas de uso y de negocio).
import 'server-only'
import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { armarCohortes, armarEmbudo, type FilaCohorte } from './core'
import { cargoServicioRecaudado } from '@/lib/ingresos'

export type Tabla = { titulo: string; columnas: string[]; filas: (string | number | null)[][]; nota?: string }
export type Seccion = {
  resumen: { clave: string; etiqueta: string; valor: number | string | null; formato?: 'n' | 'ars' | 'usd' | 'pct' | 'min' | 'fecha'; ayuda?: string }[]
  tablas: Record<string, Tabla>
  extra?: unknown
}
export type Filtro = { desde: Date; hasta: Date; excluirPrueba: boolean }

export const SECCIONES = ['usuarios', 'uso', 'embudos', 'retencion', 'negocio'] as const
export type NombreSeccion = (typeof SECCIONES)[number]

const TZ = 'America/Argentina/Buenos_Aires'
/** Columna timestamp (guardada en UTC sin zona) → hora de Argentina. */
const ar = (col: string) => Prisma.raw(`((${col} AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}')`)

// ───────────────────────────── período ─────────────────────────────

const DIA = 86_400_000
/** Medianoche de Argentina (UTC-3, sin horario de verano) del día de `d`. */
function inicioDiaAR(d: Date): Date {
  const local = new Date(d.getTime() - 3 * 3600_000)
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) + 3 * 3600_000)
}

/** hoy | 7 | 30 | 90 | rango (desde/hasta AAAA-MM-DD, días de Argentina). Por defecto 30 días. */
export function parsearPeriodo(sp: URLSearchParams, ahora = new Date()): Filtro {
  const excluirPrueba = sp.get('prueba') !== 'incluir'
  const p = sp.get('periodo') || '30'
  const fecha = (s: string | null) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T03:00:00.000Z`) : null)
  if (p === 'rango') {
    const d = fecha(sp.get('desde'))
    const h = fecha(sp.get('hasta'))
    if (d && h && d <= h && h.getTime() - d.getTime() <= 400 * DIA) {
      return { desde: d, hasta: new Date(Math.min(h.getTime() + DIA, ahora.getTime())), excluirPrueba }
    }
  }
  if (p === 'hoy') return { desde: inicioDiaAR(ahora), hasta: ahora, excluirPrueba }
  const dias = p === '7' ? 7 : p === '90' ? 90 : 30
  return { desde: new Date(inicioDiaAR(ahora).getTime() - (dias - 1) * DIA), hasta: ahora, excluirPrueba }
}

/** CTEs comunes: período (p), cuentas excluidas (excl: @homia.test) y navegadores excluidos (xa). */
function base(f: Filtro) {
  return Prisma.sql`
    p AS (SELECT (${f.desde.toISOString()}::timestamptz AT TIME ZONE 'UTC') AS d, (${f.hasta.toISOString()}::timestamptz AT TIME ZONE 'UTC') AS h),
    excl AS (SELECT id FROM "User" WHERE ${f.excluirPrueba}::boolean AND email LIKE '%@homia.test'),
    xa AS (
      SELECT DISTINCT "anonId" FROM "AnalyticsSession" WHERE "userId" IN (SELECT id FROM excl)
      UNION SELECT DISTINCT "anonId" FROM "AnalyticsEvent" WHERE "userId" IN (SELECT id FROM excl)
    )`
}
/** Filtro de eventos/sesiones: fuera las cuentas de prueba y los navegadores de la suite (e2e-…). */
function sinPrueba(f: Filtro, alias: string) {
  return Prisma.raw(`${alias}."anonId" NOT IN (SELECT "anonId" FROM xa) AND NOT (${f.excluirPrueba ? 'true' : 'false'} AND ${alias}."anonId" LIKE 'e2e-%') AND (${alias}."userId" IS NULL OR ${alias}."userId" NOT IN (SELECT id FROM excl))`)
}

const n = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))
const nn = (v: unknown) => (v === null || v === undefined ? null : Number(v))
const r2 = (v: unknown) => (v === null || v === undefined ? null : Math.round(Number(v) * 100) / 100)
const tabla = (titulo: string, columnas: string[], filas: (string | number | null)[][], nota?: string): Tabla => ({ titulo, columnas, filas, ...(nota ? { nota } : {}) })
type Row = Record<string, unknown>
const filasDe = (rows: Row[], cols: string[]) => rows.map((r) => cols.map((c) => {
  const v = r[c]
  if (v === null || v === undefined) return null
  if (typeof v === 'bigint') return Number(v)
  if (v instanceof Date) return v.toISOString()
  return typeof v === 'number' || typeof v === 'string' ? v : String(v)
}))

// ───────────────────────────── salud del registro ─────────────────────────────

/** Desde cuándo se registra el uso y el último evento de cada tipo (PLAYBOOK: vigilar max(ts)). */
export async function saludRegistro() {
  // una consulta; cada max() usa el índice (type, createdAt), sin recorrer toda la tabla
  const rows = await db.$queryRaw<Row[]>`
    SELECT t.type,
           (SELECT max(e."createdAt") FROM "AnalyticsEvent" e WHERE e.type = t.type) AS ultimo,
           (SELECT count(*) FROM "AnalyticsEvent" e WHERE e.type = t.type AND e."createdAt" >= (now() AT TIME ZONE 'UTC') - interval '1 day')::int AS total,
           (SELECT min("createdAt") FROM "AnalyticsEvent") AS primero
    FROM (VALUES ('page_view'), ('click'), ('submit'), ('dialog'), ('search'), ('error'), ('server')) AS t(type)`
  const primero = (rows[0]?.primero as Date | null) ?? null
  return {
    desde: primero ? primero.toISOString() : null,
    porTipo: rows.filter((r) => r.ultimo).map((r) => ({ tipo: String(r.type), ultimo: (r.ultimo as Date).toISOString(), total: n(r.total) })),
  }
}

// ───────────────────────────── USUARIOS ─────────────────────────────

export async function seccionUsuarios(f: Filtro): Promise<Seccion> {
  const [k] = await db.$queryRaw<Row[]>`
    WITH ${base(f)},
    u AS (SELECT * FROM "User" WHERE "deletedAt" IS NULL AND id NOT IN (SELECT id FROM excl)),
    ev AS (SELECT e."userId", e."createdAt", e.type, e.name FROM "AnalyticsEvent" e WHERE e."userId" IS NOT NULL AND ${sinPrueba(f, 'e')}
           AND e."createdAt" >= (SELECT h FROM p) - interval '30 days' AND e."createdAt" < (SELECT h FROM p) + interval '1 second')
    SELECT
      (SELECT count(*) FROM u)::int AS total,
      (SELECT count(*) FROM u WHERE roles LIKE '%"cliente"%')::int AS clientes,
      (SELECT count(*) FROM u WHERE roles LIKE '%"profesional"%')::int AS profesionales,
      (SELECT count(*) FROM u WHERE roles LIKE '%"proveedor"%')::int AS proveedores,
      (SELECT count(*) FROM u, p WHERE u."createdAt" >= p.d AND u."createdAt" < p.h)::int AS nuevos,
      (SELECT count(*) FROM "User" x, p WHERE x."deletedAt" >= p.d AND x."deletedAt" < p.h AND x.id NOT IN (SELECT id FROM excl))::int AS bajas,
      (SELECT count(DISTINCT "userId") FROM ev, p WHERE ev."createdAt" >= p.h - interval '1 day')::int AS dau,
      (SELECT count(DISTINCT "userId") FROM ev, p WHERE ev."createdAt" >= p.h - interval '7 days')::int AS wau,
      (SELECT count(DISTINCT "userId") FROM ev)::int AS mau,
      (SELECT count(DISTINCT e."userId") FROM "AnalyticsEvent" e, p WHERE e."userId" IS NOT NULL AND ${sinPrueba(f, 'e')} AND e."createdAt" >= p.d AND e."createdAt" < p.h)::int AS activos_periodo,
      (SELECT count(*) FROM "AnalyticsEvent" e, p WHERE e.type = 'server' AND e.name = 'login_ok' AND ${sinPrueba(f, 'e')} AND e."createdAt" >= p.d AND e."createdAt" < p.h)::int AS logins,
      (SELECT count(DISTINCT e."userId") FROM "AnalyticsEvent" e, p WHERE e.type = 'server' AND e.name = 'login_ok' AND ${sinPrueba(f, 'e')} AND e."createdAt" >= p.d AND e."createdAt" < p.h)::int AS usuarios_login,
      (SELECT count(*) FROM "AnalyticsEvent" e, p WHERE e.type = 'server' AND e.name = 'login_fallido' AND ${sinPrueba(f, 'e')} AND e."createdAt" >= p.d AND e."createdAt" < p.h)::int AS logins_fallidos,
      (SELECT count(*) FROM u WHERE "verificationStatus" = 'verificado')::int AS dni_verificados,
      (SELECT count(*) FROM u WHERE "verificationStatus" = 'en_revision')::int AS dni_revision,
      (SELECT count(*) FROM u WHERE "emailVerifiedAt" IS NOT NULL)::int AS email_verificados,
      (SELECT count(*) FROM u WHERE "phoneVerifiedAt" IS NOT NULL)::int AS cel_verificados`
  const [planes, porDia, origen] = await Promise.all([
    db.$queryRaw<Row[]>`
      WITH ${base(f)}
      SELECT pv.subscription AS plan, count(*)::int AS proveedores
      FROM "ProviderProfile" pv JOIN "User" u ON u.id = pv."userId"
      WHERE u."deletedAt" IS NULL AND u.id NOT IN (SELECT id FROM excl)
      GROUP BY pv.subscription ORDER BY 2 DESC`,
    db.$queryRaw<Row[]>`
      WITH ${base(f)}
      SELECT to_char(${ar('u."createdAt"')}, 'YYYY-MM-DD') AS dia, count(*)::int AS nuevos,
             count(*) FILTER (WHERE roles LIKE '%"cliente"%')::int AS clientes,
             count(*) FILTER (WHERE roles LIKE '%"profesional"%')::int AS profesionales,
             count(*) FILTER (WHERE roles LIKE '%"proveedor"%')::int AS proveedores
      FROM "User" u, p WHERE u."createdAt" >= p.d AND u."createdAt" < p.h AND u.id NOT IN (SELECT id FROM excl)
      GROUP BY 1 ORDER BY 1`,
    db.$queryRaw<Row[]>`
      WITH ${base(f)}
      SELECT COALESCE("howFoundUs", 'sin dato') AS origen, count(*)::int AS usuarios
      FROM "User" u, p WHERE u."createdAt" >= p.d AND u."createdAt" < p.h AND u.id NOT IN (SELECT id FROM excl)
      GROUP BY 1 ORDER BY 2 DESC`,
  ])
  const nombrePlan: Record<string, string> = { trial: 'Prueba', basic: 'Básico', pro: 'PRO', expired: 'Vencido', free: 'Sin plan' }
  const pagos = planes.filter((p) => p.plan === 'basic' || p.plan === 'pro').reduce((a, p) => a + n(p.proveedores), 0)
  return {
    resumen: [
      { clave: 'total', etiqueta: 'Usuarios activos (cuentas)', valor: n(k.total) },
      { clave: 'clientes', etiqueta: 'Con rol cliente', valor: n(k.clientes) },
      { clave: 'profesionales', etiqueta: 'Con rol profesional', valor: n(k.profesionales) },
      { clave: 'proveedores', etiqueta: 'Con rol proveedor', valor: n(k.proveedores) },
      { clave: 'nuevos', etiqueta: 'Nuevos en el período', valor: n(k.nuevos) },
      { clave: 'bajas', etiqueta: 'Bajas de cuenta en el período', valor: n(k.bajas) },
      { clave: 'dau', etiqueta: 'Activos último día', valor: n(k.dau), ayuda: 'Usuarios con uso registrado en las 24 h anteriores al fin del período' },
      { clave: 'wau', etiqueta: 'Activos últimos 7 días', valor: n(k.wau) },
      { clave: 'mau', etiqueta: 'Activos últimos 30 días', valor: n(k.mau) },
      { clave: 'activos_periodo', etiqueta: 'Activos en el período', valor: n(k.activos_periodo) },
      { clave: 'usuarios_login', etiqueta: 'Iniciaron sesión', valor: n(k.usuarios_login), ayuda: 'Usuarios distintos con al menos un ingreso con contraseña' },
      { clave: 'logins', etiqueta: 'Ingresos', valor: n(k.logins) },
      { clave: 'logins_fallidos', etiqueta: 'Ingresos fallidos', valor: n(k.logins_fallidos) },
      { clave: 'dni_verificados', etiqueta: 'DNI verificado', valor: n(k.dni_verificados) },
      { clave: 'dni_revision', etiqueta: 'DNI en revisión', valor: n(k.dni_revision) },
      { clave: 'email_verificados', etiqueta: 'Email verificado', valor: n(k.email_verificados) },
      { clave: 'cel_verificados', etiqueta: 'Celular verificado', valor: n(k.cel_verificados) },
      { clave: 'proveedores_pagos', etiqueta: 'Proveedores con plan pago', valor: pagos },
    ],
    tablas: {
      planes: tabla('Proveedores por plan', ['Plan', 'Proveedores'], planes.map((p) => [nombrePlan[String(p.plan)] || String(p.plan), n(p.proveedores)])),
      nuevos_por_dia: tabla('Nuevos usuarios por día', ['Día', 'Nuevos', 'Clientes', 'Profesionales', 'Proveedores'], filasDe(porDia, ['dia', 'nuevos', 'clientes', 'profesionales', 'proveedores'])),
      como_nos_conocio: tabla('Cómo nos conocieron (nuevos del período)', ['Origen', 'Usuarios'], filasDe(origen, ['origen', 'usuarios'])),
    },
  }
}

// ───────────────────────────── USO ─────────────────────────────

/** Subconsulta → arreglo JSON (una sola ida a la base para varias tablas). */
const jagg = (q: Prisma.Sql) => Prisma.sql`(SELECT COALESCE(json_agg(t), '[]'::json) FROM (${q}) t)`

export async function seccionUso(f: Filtro): Promise<Seccion> {
  // UNA consulta: CTEs del período + cada tabla como arreglo JSON (con el pooler, cada consulta ≈ 4 idas)
  const [r] = await db.$queryRaw<Row[]>`
    WITH ${base(f)},
    ev AS (SELECT e.* FROM "AnalyticsEvent" e, p WHERE e."createdAt" >= p.d AND e."createdAt" < p.h AND ${sinPrueba(f, 'e')}),
    s AS (SELECT x.* FROM "AnalyticsSession" x, p WHERE x."startedAt" >= p.d AND x."startedAt" < p.h AND ${sinPrueba(f, 'x')}),
    hr AS (SELECT r.* FROM "HomyRun" r, p WHERE r."createdAt" >= p.d AND r."createdAt" < p.h AND (r."userId" IS NULL OR r."userId" NOT IN (SELECT id FROM excl)))
    SELECT
      ${jagg(Prisma.sql`
        SELECT count(*)::int AS sesiones, count(*) FILTER (WHERE "userId" IS NOT NULL)::int AS con_usuario,
               count(DISTINCT "anonId")::int AS navegadores, count(DISTINCT "userId")::int AS usuarios,
               (avg("activeMs") FILTER (WHERE "activeMs" > 0) / 60000.0)::float8 AS prom_min,
               (percentile_cont(0.5) WITHIN GROUP (ORDER BY "activeMs") FILTER (WHERE "activeMs" > 0) / 60000.0)::float8 AS mediana_min,
               (COALESCE(sum("activeMs"), 0) / 3600000.0)::float8 AS horas, avg("pageViews")::float8 AS paginas_por_sesion,
               count(*) FILTER (WHERE "pageViews" <= 1)::int AS rebote
        FROM s`)} AS k,
      ${jagg(Prisma.sql`SELECT path, count(*)::int AS vistas, count(DISTINCT COALESCE("userId", "anonId"))::int AS personas FROM ev WHERE type = 'page_view' GROUP BY path ORDER BY 2 DESC LIMIT 40`)} AS paginas,
      ${jagg(Prisma.sql`SELECT name, path, count(*)::int AS clics, count(DISTINCT COALESCE("userId", "anonId"))::int AS personas FROM ev WHERE type = 'click' GROUP BY name, path ORDER BY 3 DESC LIMIT 50`)} AS clics,
      ${jagg(Prisma.sql`SELECT name, count(*)::int AS veces, count(*) FILTER (WHERE (props->>'ok') = 'true')::int AS ok, count(*) FILTER (WHERE (props->>'ok') = 'false')::int AS con_error, count(DISTINCT COALESCE("userId", "anonId"))::int AS personas FROM ev WHERE type = 'submit' GROUP BY name ORDER BY 2 DESC LIMIT 50`)} AS acciones,
      ${jagg(Prisma.sql`SELECT name, path, count(*)::int AS veces FROM ev WHERE type = 'dialog' GROUP BY name, path ORDER BY 3 DESC LIMIT 30`)} AS dialogos,
      ${jagg(Prisma.sql`SELECT name, path, count(*)::int AS veces, max("createdAt") AS ultimo FROM ev WHERE type = 'error' GROUP BY name, path ORDER BY 3 DESC LIMIT 30`)} AS errores,
      ${jagg(Prisma.sql`SELECT regexp_replace(COALESCE(device, 'sin dato'), ' · [0-9]+x[0-9]+$', '') AS dispositivo, count(*)::int AS sesiones, count(DISTINCT "anonId")::int AS navegadores FROM s GROUP BY 1 ORDER BY 2 DESC LIMIT 20`)} AS dispositivos,
      ${jagg(Prisma.sql`SELECT COALESCE(referrer, 'directo') AS origen, COALESCE(utm->>'utm_source', '') AS utm_source, COALESCE(utm->>'utm_campaign', '') AS utm_campaign, count(*)::int AS sesiones, count(DISTINCT "userId")::int AS usuarios FROM s GROUP BY 1, 2, 3 ORDER BY 4 DESC LIMIT 30`)} AS origenes,
      ${jagg(Prisma.sql`SELECT extract(hour FROM ${ar('"createdAt"')})::int AS hora, count(*)::int AS vistas FROM ev WHERE type = 'page_view' GROUP BY 1 ORDER BY 1`)} AS horas,
      ${jagg(Prisma.sql`SELECT name AS termino, COALESCE(props->>'pantalla', '') AS pantalla, count(*)::int AS veces, round(avg(NULLIF(props->>'resultados', '')::numeric), 1)::float8 AS resultados_prom FROM ev WHERE type = 'search' GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 40`)} AS busquedas,
      ${jagg(Prisma.sql`SELECT name AS termino, COALESCE(props->>'pantalla', '') AS pantalla, count(*)::int AS veces, max("createdAt") AS ultima FROM ev WHERE type = 'search' AND props->>'resultados' = '0' GROUP BY 1, 2 ORDER BY 3 DESC LIMIT 40`)} AS sin_resultado,
      ${jagg(Prisma.sql`SELECT count(*)::int AS consultas, count(DISTINCT "userId")::int AS usuarios, COALESCE(sum("costoUsd"), 0)::float8 AS costo, avg("latenciaMs")::float8 AS latencia FROM hr`)} AS homy,
      ${jagg(Prisma.sql`SELECT puerta, resultado, count(*)::int AS consultas, COALESCE(sum("costoUsd"), 0)::float8 AS costo FROM hr GROUP BY 1, 2 ORDER BY 3 DESC`)} AS homy_res`
  const L = (key: string) => (r[key] as Row[]) || []
  const k = L('k')[0] || {}
  const h = L('homy')[0] || {}
  const porHora = new Map(L('horas').map((x) => [n(x.hora), n(x.vistas)]))
  return {
    resumen: [
      { clave: 'sesiones', etiqueta: 'Sesiones', valor: n(k.sesiones) },
      { clave: 'con_usuario', etiqueta: 'Sesiones con cuenta', valor: n(k.con_usuario) },
      { clave: 'navegadores', etiqueta: 'Visitantes únicos (navegadores)', valor: n(k.navegadores) },
      { clave: 'usuarios', etiqueta: 'Usuarios con uso', valor: n(k.usuarios) },
      { clave: 'prom_min', etiqueta: 'Duración promedio', valor: r2(k.prom_min), formato: 'min', ayuda: 'Tiempo activo real: pestaña visible y alguien usando la app' },
      { clave: 'mediana_min', etiqueta: 'Duración mediana', valor: r2(k.mediana_min), formato: 'min' },
      { clave: 'horas', etiqueta: 'Horas de uso totales', valor: r2(k.horas) },
      { clave: 'paginas_por_sesion', etiqueta: 'Pantallas por sesión', valor: r2(k.paginas_por_sesion) },
      { clave: 'rebote', etiqueta: 'Sesiones de una sola pantalla', valor: n(k.rebote) },
      { clave: 'homy', etiqueta: 'Consultas a Homy', valor: n(h.consultas) },
      { clave: 'homy_costo', etiqueta: 'Costo estimado de Homy', valor: r2(h.costo), formato: 'usd' },
      { clave: 'homy_latencia', etiqueta: 'Homy: demora promedio (s)', valor: h.latencia == null ? null : r2(n(h.latencia) / 1000) },
    ],
    tablas: {
      paginas: tabla('Pantallas más usadas', ['Pantalla', 'Vistas', 'Personas'], filasDe(L('paginas'), ['path', 'vistas', 'personas'])),
      clics: tabla('Botones más tocados', ['Botón', 'Pantalla', 'Clics', 'Personas'], filasDe(L('clics'), ['name', 'path', 'clics', 'personas'])),
      acciones: tabla('Acciones (envíos al servidor)', ['Acción', 'Veces', 'Bien', 'Con error', 'Personas'], filasDe(L('acciones'), ['name', 'veces', 'ok', 'con_error', 'personas'])),
      dialogos: tabla('Ventanas que se abrieron', ['Ventana', 'Pantalla', 'Veces'], filasDe(L('dialogos'), ['name', 'path', 'veces'])),
      dispositivos: tabla('Dispositivos', ['Dispositivo', 'Sesiones', 'Navegadores'], filasDe(L('dispositivos'), ['dispositivo', 'sesiones', 'navegadores'])),
      origenes: tabla('Orígenes', ['Origen', 'utm_source', 'utm_campaign', 'Sesiones', 'Usuarios'], filasDe(L('origenes'), ['origen', 'utm_source', 'utm_campaign', 'sesiones', 'usuarios'])),
      horarios: tabla('Horario de uso (hora de Argentina)', ['Hora', 'Vistas'], Array.from({ length: 24 }, (_, i) => [`${String(i).padStart(2, '0')} h`, porHora.get(i) || 0])),
      busquedas: tabla('Búsquedas más frecuentes', ['Término', 'Pantalla', 'Veces', 'Resultados promedio'], filasDe(L('busquedas'), ['termino', 'pantalla', 'veces', 'resultados_prom'])),
      sin_resultado: tabla('Búsquedas sin resultado (oportunidades)', ['Término', 'Pantalla', 'Veces', 'Última'], filasDe(L('sin_resultado'), ['termino', 'pantalla', 'veces', 'ultima'])),
      errores: tabla('Errores de la app', ['Error', 'Pantalla', 'Veces', 'Último'], filasDe(L('errores'), ['name', 'path', 'veces', 'ultimo'])),
      homy: tabla('Homy por puerta y resultado', ['Puerta', 'Resultado', 'Consultas', 'Costo USD'], L('homy_res').map((x) => [String(x.puerta), String(x.resultado), n(x.consultas), r2(x.costo)])),
    },
  }
}

// ───────────────────────────── EMBUDOS ─────────────────────────────

export async function seccionEmbudos(f: Filtro): Promise<Seccion> {
  const [[k]] = await Promise.all([db.$queryRaw<Row[]>`
    WITH ${base(f)},
    nu AS (SELECT u.* FROM "User" u, p WHERE u."createdAt" >= p.d AND u."createdAt" < p.h AND u.id NOT IN (SELECT id FROM excl)),
    pros AS (SELECT pp.* FROM "ProfessionalProfile" pp JOIN nu ON nu.id = pp."userId"),
    provs AS (SELECT pv.* FROM "ProviderProfile" pv JOIN nu ON nu.id = pv."userId")
    SELECT
      (SELECT count(DISTINCT x."anonId") FROM "AnalyticsSession" x, p WHERE x."startedAt" >= p.d AND x."startedAt" < p.h AND ${sinPrueba(f, 'x')})::int AS visitantes,
      (SELECT count(*) FROM nu)::int AS registros,
      (SELECT count(*) FROM nu WHERE EXISTS (SELECT 1 FROM "AnalyticsEvent" e WHERE e."userId" = nu.id AND e.type <> 'server' AND e."createdAt" < nu."createdAt"))::int AS con_visita_previa,
      (SELECT count(*) FROM nu WHERE EXISTS (SELECT 1 FROM "Project" x WHERE x."clientId" = nu.id) OR EXISTS (SELECT 1 FROM "Order" o WHERE o."clientId" = nu.id))::int AS con_proyecto_o_compra,
      (SELECT count(*) FROM nu WHERE roles LIKE '%"cliente"%')::int AS clientes,
      (SELECT count(*) FROM nu WHERE roles LIKE '%"cliente"%' AND EXISTS (SELECT 1 FROM "JobPost" j WHERE j."userId" = nu.id))::int AS cli_trabajo,
      (SELECT count(*) FROM nu WHERE roles LIKE '%"cliente"%' AND EXISTS (SELECT 1 FROM "Project" x WHERE x."clientId" = nu.id))::int AS cli_proyecto,
      (SELECT count(*) FROM nu WHERE roles LIKE '%"cliente"%' AND (EXISTS (SELECT 1 FROM "Invoice" i WHERE i."clientId" = nu.id AND i.status = 'pagada') OR EXISTS (SELECT 1 FROM "ProviderCharge" c WHERE c."clientId" = nu.id AND c.status = 'pagada')))::int AS cli_pago,
      (SELECT count(*) FROM pros)::int AS pros,
      (SELECT count(*) FROM pros WHERE EXISTS (SELECT 1 FROM "JobBid" b WHERE b."professionalId" = pros.id))::int AS pro_oferta,
      (SELECT count(*) FROM pros WHERE EXISTS (SELECT 1 FROM "Project" x WHERE x."professionalId" = pros.id))::int AS pro_proyecto,
      (SELECT count(*) FROM pros WHERE EXISTS (SELECT 1 FROM "Invoice" i WHERE i."professionalId" = pros.id AND i.status = 'pagada'))::int AS pro_cobro,
      (SELECT count(*) FROM provs)::int AS provs,
      (SELECT count(*) FROM provs WHERE EXISTS (SELECT 1 FROM "ProviderStock" s WHERE s."providerId" = provs.id))::int AS prov_stock,
      (SELECT count(*) FROM provs WHERE EXISTS (SELECT 1 FROM "ProviderCharge" c WHERE c."providerId" = provs.id AND c.status = 'pagada')
         OR EXISTS (SELECT 1 FROM "Purchase" pu WHERE pu."providerId" = provs.id AND pu.status IN ('pagado', 'entregado')))::int AS prov_venta,
      (SELECT count(*) FROM provs WHERE subscription IN ('basic', 'pro'))::int AS prov_plan`])
  const emb = (titulo: string, pasos: [string, unknown][], nota: string) => {
    const e = armarEmbudo(pasos.map(([paso, v]) => ({ paso, n: n(v) })))
    return tabla(titulo, ['Paso', 'Personas', '% del paso anterior', '% del inicio'], e.map((x) => [x.paso, x.n, x.pctAnterior, x.pctInicio]), nota)
  }
  return {
    resumen: [
      { clave: 'visitantes', etiqueta: 'Visitantes únicos', valor: n(k.visitantes) },
      { clave: 'registros', etiqueta: 'Registros', valor: n(k.registros) },
      { clave: 'conversion', etiqueta: 'Visita → registro', valor: n(k.visitantes) > 0 ? Math.round((n(k.registros) / n(k.visitantes)) * 1000) / 10 : null, formato: 'pct' },
      { clave: 'con_visita_previa', etiqueta: 'Registros con visita previa trazada', valor: n(k.con_visita_previa), ayuda: 'Navegaron como visitantes antes de crear la cuenta (id anónimo vinculado)' },
    ],
    tablas: {
      general: emb('Visita → registro → primer proyecto o compra', [['Visitantes únicos', k.visitantes], ['Se registraron', k.registros], ['Primer proyecto o compra', k.con_proyecto_o_compra]], 'Registros del período; el proyecto o la compra pueden ser posteriores al período.'),
      cliente: emb('Cliente', [['Registrados con rol cliente', k.clientes], ['Publicaron un trabajo', k.cli_trabajo], ['Contrataron (proyecto)', k.cli_proyecto], ['Pagaron (factura o materiales)', k.cli_pago]], 'Cuentas creadas en el período.'),
      profesional: emb('Profesional', [['Registrados como profesional', k.pros], ['Primera oferta', k.pro_oferta], ['Primer proyecto', k.pro_proyecto], ['Primera factura cobrada', k.pro_cobro]], 'Cuentas creadas en el período.'),
      proveedor: emb('Proveedor', [['Registrados como proveedor', k.provs], ['Cargaron stock', k.prov_stock], ['Primera venta cobrada', k.prov_venta], ['Plan pago (Básico o PRO)', k.prov_plan]], 'Cuentas creadas en el período.'),
    },
  }
}

// ───────────────────────────── RETENCIÓN ─────────────────────────────

export async function seccionRetencion(f: Filtro): Promise<Seccion> {
  const semanaIso = (col: string) => Prisma.raw(`date_trunc('week', ${`((${col} AT TIME ZONE 'UTC') AT TIME ZONE '${TZ}')`})::date`)
  const rows = await db.$queryRaw<Row[]>`
    WITH ${base(f)},
    coh AS (
      SELECT u.id, ${semanaIso('u."createdAt"')} AS c FROM "User" u, p
      WHERE u."deletedAt" IS NULL AND u.id NOT IN (SELECT id FROM excl)
        AND u."createdAt" >= date_trunc('week', p.h) - interval '8 weeks' AND u."createdAt" < p.h
    ),
    act AS (
      SELECT "userId" AS uid, "createdAt" AS t FROM "AnalyticsEvent" WHERE "userId" IN (SELECT id FROM coh)
      UNION ALL SELECT "senderId", "createdAt" FROM "Message" WHERE "senderId" IN (SELECT id FROM coh)
      UNION ALL SELECT "userId", "createdAt" FROM "JobPost" WHERE "userId" IN (SELECT id FROM coh)
      UNION ALL SELECT pp."userId", b."createdAt" FROM "JobBid" b JOIN "ProfessionalProfile" pp ON pp.id = b."professionalId" WHERE pp."userId" IN (SELECT id FROM coh)
      UNION ALL SELECT "clientId", "createdAt" FROM "Project" WHERE "clientId" IN (SELECT id FROM coh)
      UNION ALL SELECT "clientId", "createdAt" FROM "Order" WHERE "clientId" IN (SELECT id FROM coh)
      UNION ALL SELECT "authorId", "createdAt" FROM "Review" WHERE "authorId" IN (SELECT id FROM coh)
      UNION ALL SELECT pv."userId", s."createdAt" FROM "ProviderStock" s JOIN "ProviderProfile" pv ON pv.id = s."providerId" WHERE pv."userId" IN (SELECT id FROM coh)
    ),
    wk AS (
      SELECT DISTINCT a.uid, ((${semanaIso('a.t')} - coh.c) / 7)::int AS k
      FROM act a JOIN coh ON coh.id = a.uid
    ),
    tam AS (SELECT c, count(*)::int AS usuarios FROM coh GROUP BY c)
    SELECT to_char(tam.c, 'YYYY-MM-DD') AS cohorte, tam.usuarios, COALESCE(wk.k, 0)::int AS semana, count(DISTINCT wk.uid)::int AS activos
    FROM tam LEFT JOIN coh ON coh.c = tam.c LEFT JOIN wk ON wk.uid = coh.id AND wk.k BETWEEN 1 AND 8
    GROUP BY tam.c, tam.usuarios, wk.k ORDER BY 1 DESC, 3`
  const [{ sem }] = await db.$queryRaw<{ sem: string }[]>`SELECT to_char(date_trunc('week', ((${f.hasta.toISOString()}::timestamptz) AT TIME ZONE ${TZ})), 'YYYY-MM-DD') AS sem`
  const filas: FilaCohorte[] = rows.map((r) => ({ cohorte: String(r.cohorte), usuarios: n(r.usuarios), semana: n(r.semana), activos: n(r.activos) }))
  const cohortes = armarCohortes(filas, 8, sem)
  return {
    resumen: [
      { clave: 'cohortes', etiqueta: 'Cohortes (semanas de registro)', valor: cohortes.length },
      { clave: 'usuarios', etiqueta: 'Usuarios en las cohortes', valor: cohortes.reduce((a, c) => a + c.usuarios, 0) },
    ],
    tablas: {
      cohortes: tabla(
        'Retención por cohorte semanal (% que volvió)',
        ['Semana de registro (lunes)', 'Usuarios', ...Array.from({ length: 8 }, (_, i) => `Sem ${i + 1}`)],
        cohortes.map((c) => [c.cohorte, c.usuarios, ...c.semanas]),
        'Volver = uso registrado o una acción de negocio (trabajo, oferta, proyecto, pedido, mensaje, reseña, stock) en esa semana. Vacío = la semana todavía no pasó.',
      ),
    },
    extra: { semanaActual: sem },
  }
}

// ───────────────────────────── NEGOCIO ─────────────────────────────

export async function seccionNegocio(f: Filtro): Promise<Seccion> {
  // 3 consultas en paralelo: los totales, todas las tablas en JSON y el cargo 1% (función compartida
  // con "Ingresos de HomIA": src/lib/ingresos.ts, así las dos pantallas dan la misma cifra)
  const [[k], [tb], cargoSrv] = await Promise.all([
    db.$queryRaw<Row[]>`
      WITH ${base(f)}
      SELECT
        (SELECT count(*) FROM "Project" x, p WHERE x."createdAt" >= p.d AND x."createdAt" < p.h AND x."clientId" NOT IN (SELECT id FROM excl))::int AS proyectos,
        (SELECT count(*) FROM "JobPost" x, p WHERE x."createdAt" >= p.d AND x."createdAt" < p.h AND x."userId" NOT IN (SELECT id FROM excl))::int AS trabajos,
        (SELECT count(*) FROM "JobBid" b JOIN "ProfessionalProfile" pp ON pp.id = b."professionalId", p WHERE b."createdAt" >= p.d AND b."createdAt" < p.h AND pp."userId" NOT IN (SELECT id FROM excl))::int AS ofertas,
        (SELECT count(*) FROM "JobBid" b JOIN "ProfessionalProfile" pp ON pp.id = b."professionalId", p WHERE b."createdAt" >= p.d AND b."createdAt" < p.h AND b.status = 'aceptado' AND pp."userId" NOT IN (SELECT id FROM excl))::int AS ofertas_aceptadas,
        (SELECT count(*) FROM "Invoice" i, p WHERE i."issuedAt" >= p.d AND i."issuedAt" < p.h AND i."clientId" NOT IN (SELECT id FROM excl))::int AS facturas,
        (SELECT COALESCE(sum(total), 0) FROM "Invoice" i, p WHERE i."issuedAt" >= p.d AND i."issuedAt" < p.h AND i."clientId" NOT IN (SELECT id FROM excl))::float8 AS facturado,
        (SELECT count(*) FROM "Invoice" i, p WHERE i.status = 'pagada' AND i."paidAt" >= p.d AND i."paidAt" < p.h AND i."clientId" NOT IN (SELECT id FROM excl))::int AS facturas_cobradas,
        (SELECT COALESCE(sum(total), 0) FROM "Invoice" i, p WHERE i.status = 'pagada' AND i."paidAt" >= p.d AND i."paidAt" < p.h AND i."clientId" NOT IN (SELECT id FROM excl))::float8 AS cobrado_facturas,
        (SELECT COALESCE(sum(total), 0) FROM "Invoice" i, p WHERE i.status = 'pagada' AND i."paymentMethod" = 'mercadopago' AND i."paidAt" >= p.d AND i."paidAt" < p.h AND i."clientId" NOT IN (SELECT id FROM excl))::float8 AS cobrado_facturas_mp,
        (SELECT count(*) FROM "ProviderCharge" c, p WHERE c.status = 'pagada' AND c."paidAt" >= p.d AND c."paidAt" < p.h AND c."clientId" NOT IN (SELECT id FROM excl))::int AS cobros_materiales,
        (SELECT COALESCE(sum(amount), 0) FROM "ProviderCharge" c, p WHERE c.status = 'pagada' AND c."paidAt" >= p.d AND c."paidAt" < p.h AND c."clientId" NOT IN (SELECT id FROM excl))::float8 AS cobrado_materiales,
        (SELECT COALESCE(sum(amount), 0) FROM "ProviderCharge" c, p WHERE c.status = 'pagada' AND c.method = 'mercadopago' AND c."paidAt" >= p.d AND c."paidAt" < p.h AND c."clientId" NOT IN (SELECT id FROM excl))::float8 AS cobrado_materiales_mp,
        (SELECT count(*) FROM "Purchase" pu, p WHERE pu."chargeId" IS NULL AND pu.status IN ('pagado', 'entregado') AND pu."updatedAt" >= p.d AND pu."updatedAt" < p.h AND pu."clientId" NOT IN (SELECT id FROM excl))::int AS compras_sin_cobro,
        (SELECT COALESCE(sum(total), 0) FROM "Purchase" pu, p WHERE pu."chargeId" IS NULL AND pu.status IN ('pagado', 'entregado') AND pu."updatedAt" >= p.d AND pu."updatedAt" < p.h AND pu."clientId" NOT IN (SELECT id FROM excl))::float8 AS compras_sin_cobro_total,
        (SELECT count(*) FROM "Order" o, p WHERE o."createdAt" >= p.d AND o."createdAt" < p.h AND o."clientId" NOT IN (SELECT id FROM excl))::int AS pedidos,
        (SELECT count(*) FROM "Review" r, p WHERE r."createdAt" >= p.d AND r."createdAt" < p.h AND r."authorId" NOT IN (SELECT id FROM excl))::int AS resenas,
        (SELECT avg(rating) FROM "Review" r, p WHERE r."createdAt" >= p.d AND r."createdAt" < p.h AND r."authorId" NOT IN (SELECT id FROM excl))::float8 AS estrellas,
        (SELECT count(*) FROM "Message" m, p WHERE m."createdAt" >= p.d AND m."createdAt" < p.h AND m."senderId" NOT IN (SELECT id FROM excl))::int AS mensajes,
        (SELECT count(*) FROM "Conversation" cv, p WHERE cv."createdAt" >= p.d AND cv."createdAt" < p.h AND cv."userAId" NOT IN (SELECT id FROM excl) AND cv."userBId" NOT IN (SELECT id FROM excl))::int AS conversaciones`,
    db.$queryRaw<Row[]>`
      WITH ${base(f)},
      dias AS (SELECT generate_series(date_trunc('day', ((SELECT d FROM p) AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}), ((SELECT h FROM p) AT TIME ZONE 'UTC') AT TIME ZONE ${TZ}, interval '1 day')::date AS dia),
      pr AS (SELECT ${ar('x."createdAt"')}::date AS dia, count(*)::int AS n FROM "Project" x, p WHERE x."createdAt" >= p.d AND x."createdAt" < p.h AND x."clientId" NOT IN (SELECT id FROM excl) GROUP BY 1),
      pe AS (SELECT ${ar('o."createdAt"')}::date AS dia, count(*)::int AS n FROM "Order" o, p WHERE o."createdAt" >= p.d AND o."createdAt" < p.h AND o."clientId" NOT IN (SELECT id FROM excl) GROUP BY 1),
      fa AS (SELECT ${ar('i."paidAt"')}::date AS dia, sum(total)::float8 AS n FROM "Invoice" i, p WHERE i.status = 'pagada' AND i."paidAt" >= p.d AND i."paidAt" < p.h AND i."clientId" NOT IN (SELECT id FROM excl) GROUP BY 1),
      ma AS (SELECT ${ar('c."paidAt"')}::date AS dia, sum(amount)::float8 AS n FROM "ProviderCharge" c, p WHERE c.status = 'pagada' AND c."paidAt" >= p.d AND c."paidAt" < p.h AND c."clientId" NOT IN (SELECT id FROM excl) GROUP BY 1)
      SELECT
        ${jagg(Prisma.sql`SELECT x.status, count(*)::int AS proyectos FROM "Project" x, p WHERE x."createdAt" >= p.d AND x."createdAt" < p.h AND x."clientId" NOT IN (SELECT id FROM excl) GROUP BY 1 ORDER BY 2 DESC`)} AS proyectos,
        ${jagg(Prisma.sql`SELECT pu.type AS tipo, pu.status, count(*)::int AS subpedidos, COALESCE(sum(pu.total), 0)::float8 AS total FROM "Purchase" pu, p WHERE pu."createdAt" >= p.d AND pu."createdAt" < p.h AND pu."clientId" NOT IN (SELECT id FROM excl) GROUP BY 1, 2 ORDER BY 3 DESC`)} AS subpedidos,
        ${jagg(Prisma.sql`SELECT r.context, count(*)::int AS resenas, round(avg(r.rating)::numeric, 2)::float8 AS estrellas FROM "Review" r, p WHERE r."createdAt" >= p.d AND r."createdAt" < p.h AND r."authorId" NOT IN (SELECT id FROM excl) GROUP BY 1 ORDER BY 2 DESC`)} AS resenas,
        ${jagg(Prisma.sql`SELECT l.status, l."sellerKind" AS vendedor, count(*)::int AS devoluciones, COALESCE(sum(l."refundTotal"), 0)::float8 AS reembolsado FROM "LeftoverReturn" l, p WHERE l."requestedAt" >= p.d AND l."requestedAt" < p.h AND l."requesterId" NOT IN (SELECT id FROM excl) GROUP BY 1, 2 ORDER BY 3 DESC`)} AS devoluciones,
        ${jagg(Prisma.sql`SELECT fb.type AS tipo, fb.status, count(*)::int AS envios FROM "Feedback" fb, p WHERE fb."createdAt" >= p.d AND fb."createdAt" < p.h AND fb."userId" NOT IN (SELECT id FROM excl) GROUP BY 1, 2 ORDER BY 3 DESC`)} AS sugerencias,
        ${jagg(Prisma.sql`SELECT to_char(dias.dia, 'YYYY-MM-DD') AS dia, COALESCE(pr.n, 0)::int AS proyectos, COALESCE(pe.n, 0)::int AS pedidos,
               COALESCE(fa.n, 0)::float8 AS cobrado_facturas, COALESCE(ma.n, 0)::float8 AS cobrado_materiales
          FROM dias LEFT JOIN pr ON pr.dia = dias.dia LEFT JOIN pe ON pe.dia = dias.dia LEFT JOIN fa ON fa.dia = dias.dia LEFT JOIN ma ON ma.dia = dias.dia
          ORDER BY 1`)} AS por_dia`,
    cargoServicioRecaudado(f.desde, f.hasta, f.excluirPrueba),
  ])
  const T = (key: string) => (tb[key] as Row[]) || []
  const [proyectos, subpedidos, resenas, devoluciones, sugerencias, porDia] = ['proyectos', 'subpedidos', 'resenas', 'devoluciones', 'sugerencias', 'por_dia'].map(T)
  const gmv = n(k.cobrado_materiales) + n(k.compras_sin_cobro_total)
  const ventas = n(k.cobros_materiales) + n(k.compras_sin_cobro)
  const cargo = cargoSrv.total
  return {
    resumen: [
      { clave: 'proyectos', etiqueta: 'Proyectos creados', valor: n(k.proyectos) },
      { clave: 'trabajos', etiqueta: 'Trabajos publicados', valor: n(k.trabajos) },
      { clave: 'ofertas', etiqueta: 'Ofertas enviadas', valor: n(k.ofertas) },
      { clave: 'ofertas_aceptadas', etiqueta: 'Ofertas aceptadas', valor: n(k.ofertas_aceptadas) },
      { clave: 'facturas', etiqueta: 'Facturas emitidas', valor: n(k.facturas) },
      { clave: 'facturado', etiqueta: 'Facturado (servicios)', valor: r2(k.facturado), formato: 'ars', ayuda: 'Total de las facturas emitidas en el período' },
      { clave: 'cobrado_facturas', etiqueta: 'Cobrado en facturas', valor: r2(k.cobrado_facturas), formato: 'ars', ayuda: 'Facturas pagadas en el período (sin el cargo de servicio)' },
      { clave: 'ticket_facturas', etiqueta: 'Ticket promedio factura', valor: n(k.facturas_cobradas) ? r2(n(k.cobrado_facturas) / n(k.facturas_cobradas)) : null, formato: 'ars' },
      { clave: 'pedidos', etiqueta: 'Pedidos confirmados', valor: n(k.pedidos) },
      { clave: 'gmv', etiqueta: 'Volumen de materiales cobrado (GMV)', valor: r2(gmv), formato: 'ars', ayuda: 'Cobros de materiales pagados en el período (sub-pedidos y modo B), sin el cargo' },
      { clave: 'ventas', etiqueta: 'Ventas de materiales cobradas', valor: ventas },
      { clave: 'ticket_materiales', etiqueta: 'Ticket promedio materiales', valor: ventas ? r2(gmv / ventas) : null, formato: 'ars' },
      { clave: 'volumen_total', etiqueta: 'Volumen total cobrado', valor: r2(gmv + n(k.cobrado_facturas)), formato: 'ars' },
      { clave: 'cobrado_mp', etiqueta: 'Cobrado por Mercado Pago', valor: r2(n(k.cobrado_facturas_mp) + n(k.cobrado_materiales_mp)), formato: 'ars' },
      { clave: 'cargo', etiqueta: 'Cargo de servicio 1% recaudado', valor: r2(cargo), formato: 'ars', ayuda: 'Solo pagos por Mercado Pago aprobados en el período (facturas + cobros de materiales + compras históricas)' },
      { clave: 'resenas', etiqueta: 'Reseñas', valor: n(k.resenas) },
      { clave: 'estrellas', etiqueta: 'Promedio de estrellas', valor: r2(k.estrellas) },
      { clave: 'mensajes', etiqueta: 'Mensajes enviados', valor: n(k.mensajes) },
      { clave: 'conversaciones', etiqueta: 'Conversaciones nuevas', valor: n(k.conversaciones) },
    ],
    tablas: {
      por_dia: tabla('Actividad por día', ['Día', 'Proyectos', 'Pedidos', 'Cobrado facturas', 'Cobrado materiales'], filasDe(porDia, ['dia', 'proyectos', 'pedidos', 'cobrado_facturas', 'cobrado_materiales'])),
      proyectos: tabla('Proyectos creados por estado actual', ['Estado', 'Proyectos'], filasDe(proyectos, ['status', 'proyectos'])),
      subpedidos: tabla('Sub-pedidos por tipo y estado', ['Tipo', 'Estado', 'Sub-pedidos', 'Total'], filasDe(subpedidos, ['tipo', 'status', 'subpedidos', 'total'])),
      resenas: tabla('Reseñas por contexto', ['Contexto', 'Reseñas', 'Estrellas'], filasDe(resenas, ['context', 'resenas', 'estrellas'])),
      devoluciones: tabla('Devoluciones de sobrantes', ['Estado', 'Vendedor', 'Devoluciones', 'Reembolsado'], filasDe(devoluciones, ['status', 'vendedor', 'devoluciones', 'reembolsado'])),
      sugerencias: tabla('Sugerencias recibidas', ['Tipo', 'Estado', 'Envíos'], filasDe(sugerencias, ['tipo', 'status', 'envios'])),
    },
  }
}

export async function calcularSeccion(nombre: NombreSeccion, f: Filtro): Promise<Seccion> {
  if (nombre === 'usuarios') return seccionUsuarios(f)
  if (nombre === 'uso') return seccionUso(f)
  if (nombre === 'embudos') return seccionEmbudos(f)
  if (nombre === 'retencion') return seccionRetencion(f)
  return seccionNegocio(f)
}

// ───────────────────────────── FICHA POR USUARIO ─────────────────────────────

export async function buscarUsuarios(q: string) {
  const t = `%${q.trim().replace(/[%_\\]/g, (c) => `\\${c}`)}%`
  const rows = await db.$queryRaw<Row[]>`
    SELECT id, email, "displayName", roles, "createdAt", "deletedAt" FROM "User"
    WHERE email ILIKE ${t} OR "displayName" ILIKE ${t} OR id = ${q.trim()}
    ORDER BY "createdAt" DESC LIMIT 20`
  return rows.map((r) => ({
    id: String(r.id), email: String(r.email), nombre: String(r.displayName), roles: String(r.roles),
    creado: (r.createdAt as Date).toISOString(), eliminado: !!r.deletedAt,
  }))
}

export type ItemLinea = { fecha: string; fuente: 'uso' | 'negocio'; tipo: string; detalle: string; path: string | null; entityType: string | null; entityId: string | null }

export async function fichaUsuario(id: string) {
  const [u] = await db.$queryRaw<Row[]>`
    SELECT u.id, u.email, u."displayName", u.roles, u."createdAt", u."deletedAt", u."verificationStatus", u."emailVerifiedAt", u."phoneVerifiedAt",
           u."howFoundUs", u.city, pp.id AS "proId", pv.id AS "provId", pv.subscription, pv."businessName"
    FROM "User" u LEFT JOIN "ProfessionalProfile" pp ON pp."userId" = u.id LEFT JOIN "ProviderProfile" pv ON pv."userId" = u.id
    WHERE u.id = ${id} LIMIT 1`
  if (!u) return null
  const proId = (u.proId as string | null) || '__ninguno__'
  const provId = (u.provId as string | null) || '__ninguno__'
  const [totales, sesiones, linea] = await Promise.all([
    db.$queryRaw<Row[]>`
      SELECT count(*)::int AS sesiones, COALESCE(sum("activeMs"), 0)::float8 AS activo, COALESCE(sum("pageViews"), 0)::int AS vistas,
             min("startedAt") AS primera, max("lastSeenAt") AS ultima,
             (SELECT count(*) FROM "AnalyticsEvent" WHERE "userId" = ${id})::int AS eventos
      FROM "AnalyticsSession" WHERE "userId" = ${id}`,
    db.$queryRaw<Row[]>`
      SELECT id, "startedAt", "lastSeenAt", "activeMs", "pageViews", events, "entryPath", referrer, device
      FROM "AnalyticsSession" WHERE "userId" = ${id} ORDER BY "startedAt" DESC LIMIT 40`,
    db.$queryRaw<Row[]>`
      SELECT * FROM (
        SELECT "createdAt" AS fecha, 'uso' AS fuente, type AS tipo, name AS detalle, path, "entityType", "entityId"
          FROM "AnalyticsEvent" WHERE "userId" = ${id} AND type <> 'heartbeat'
        UNION ALL SELECT "createdAt", 'negocio', 'proyecto (cliente)', status || ' · ' || stage, NULL, 'project', id FROM "Project" WHERE "clientId" = ${id}
        UNION ALL SELECT "createdAt", 'negocio', 'proyecto (profesional)', status || ' · ' || stage, NULL, 'project', id FROM "Project" WHERE "professionalId" = ${proId}
        UNION ALL SELECT "createdAt", 'negocio', 'trabajo publicado', status, NULL, 'job', id FROM "JobPost" WHERE "userId" = ${id}
        UNION ALL SELECT "createdAt", 'negocio', 'oferta enviada', status || ' · $' || amount::text, NULL, 'job', "jobId" FROM "JobBid" WHERE "professionalId" = ${proId}
        UNION ALL SELECT "createdAt", 'negocio', 'pedido', number, NULL, 'order', id FROM "Order" WHERE "clientId" = ${id}
        UNION ALL SELECT "createdAt", 'negocio', 'venta (sub-pedido)', type || ' · ' || status || ' · $' || total::text, NULL, 'purchase', id FROM "Purchase" WHERE "providerId" = ${provId}
        UNION ALL SELECT "issuedAt", 'negocio', 'factura emitida', number || ' · ' || status || ' · $' || total::text, NULL, 'invoice', id FROM "Invoice" WHERE "clientId" = ${id} OR "professionalId" = ${proId}
        UNION ALL SELECT "paidAt", 'negocio', 'factura pagada', number || ' · ' || COALESCE("paymentMethod", '') || ' · $' || total::text, NULL, 'invoice', id FROM "Invoice" WHERE "paidAt" IS NOT NULL AND ("clientId" = ${id} OR "professionalId" = ${proId})
        UNION ALL SELECT "paidAt", 'negocio', 'cobro de materiales pagado', number || ' · ' || COALESCE(method, '') || ' · $' || amount::text, NULL, 'charge', id FROM "ProviderCharge" WHERE "paidAt" IS NOT NULL AND ("clientId" = ${id} OR "providerId" = ${provId})
        UNION ALL SELECT "createdAt", 'negocio', 'reseña escrita', rating::text || ' estrellas · ' || context, NULL, 'review', id FROM "Review" WHERE "authorId" = ${id}
        UNION ALL SELECT "createdAt", 'negocio', 'reseña recibida', rating::text || ' estrellas · ' || context, NULL, 'review', id FROM "Review" WHERE "targetUserId" = ${id}
        UNION ALL SELECT "createdAt", 'negocio', 'mensaje enviado', 'conversación', NULL, 'conversation', "conversationId" FROM "Message" WHERE "senderId" = ${id}
        UNION ALL SELECT "requestedAt", 'negocio', 'devolución pedida', status, NULL, 'return', id FROM "LeftoverReturn" WHERE "requesterId" = ${id}
        UNION ALL SELECT "createdAt", 'negocio', 'stock cargado', 'producto', NULL, 'stock', id FROM "ProviderStock" WHERE "providerId" = ${provId}
        UNION ALL SELECT "createdAt", 'negocio', 'sugerencia enviada', type || ' · ' || status, NULL, 'feedback', id FROM "Feedback" WHERE "userId" = ${id}
      ) t ORDER BY fecha DESC LIMIT 400`,
  ])
  const t = totales[0] || {}
  const items: ItemLinea[] = linea.map((r) => ({
    fecha: (r.fecha as Date).toISOString(), fuente: r.fuente === 'uso' ? 'uso' : 'negocio', tipo: String(r.tipo), detalle: String(r.detalle ?? ''),
    path: (r.path as string | null) ?? null, entityType: (r.entityType as string | null) ?? null, entityId: (r.entityId as string | null) ?? null,
  }))
  // activos vinculados (sin repetir), para abrir su ficha
  const vistos = new Set<string>()
  const activos = items.filter((i) => i.entityType && i.entityId && !vistos.has(`${i.entityType}:${i.entityId}`) && vistos.add(`${i.entityType}:${i.entityId}`))
    .map((i) => ({ entityType: i.entityType!, entityId: i.entityId!, tipo: i.tipo, ultimo: i.fecha }))
  return {
    usuario: {
      id: String(u.id), email: String(u.email), nombre: String(u.displayName), roles: String(u.roles),
      creado: (u.createdAt as Date).toISOString(), eliminado: u.deletedAt ? (u.deletedAt as Date).toISOString() : null,
      dni: String(u.verificationStatus || 'none'), emailVerificado: !!u.emailVerifiedAt, celVerificado: !!u.phoneVerifiedAt,
      comoNosConocio: (u.howFoundUs as string | null) ?? null, ciudad: (u.city as string | null) ?? null,
      plan: (u.subscription as string | null) ?? null, comercio: (u.businessName as string | null) ?? null,
    },
    uso: {
      sesiones: n(t.sesiones), minutosActivos: r2(n(t.activo) / 60000), vistas: n(t.vistas), eventos: n(t.eventos),
      primera: t.primera ? (t.primera as Date).toISOString() : null, ultima: t.ultima ? (t.ultima as Date).toISOString() : null,
    },
    sesiones: sesiones.map((s) => ({
      id: String(s.id), inicio: (s.startedAt as Date).toISOString(), ultima: (s.lastSeenAt as Date).toISOString(),
      minutos: r2(n(s.activeMs) / 60000), vistas: n(s.pageViews), eventos: n(s.events), entrada: (s.entryPath as string | null) ?? null,
      origen: (s.referrer as string | null) ?? null, dispositivo: (s.device as string | null) ?? null,
    })),
    linea: items,
    activos: activos.slice(0, 100),
  }
}

// ───────────────────────────── FICHA POR ACTIVO ─────────────────────────────

export const TIPOS_ACTIVO = ['project', 'order', 'purchase', 'invoice', 'charge', 'job', 'conversation', 'review', 'stock', 'return', 'feedback', 'bid', 'work', 'professional', 'provider'] as const

export async function fichaActivo(tipo: string, id: string) {
  let titulo = ''
  let datos: [string, string | number | null][] = []
  let hechos: Row[] = []
  const nombre = async (uid: unknown) => {
    if (!uid) return null
    const [x] = await db.$queryRaw<Row[]>`SELECT "displayName", email FROM "User" WHERE id = ${String(uid)}`
    return x ? `${x.displayName} (${x.email})` : String(uid)
  }
  if (tipo === 'project') {
    const [p] = await db.$queryRaw<Row[]>`
      SELECT x.*, pp."userId" AS "proUserId" FROM "Project" x LEFT JOIN "ProfessionalProfile" pp ON pp.id = x."professionalId" WHERE x.id = ${id}`
    if (!p) return null
    titulo = `Proyecto: ${p.title}`
    datos = [['Estado', `${p.status} · ${p.stage}`], ['Cliente', await nombre(p.clientId)], ['Profesional', await nombre(p.proUserId)],
      ['Materiales', String(p.materialsPaymentMode)], ['Mano de obra', n(p.laborCost)], ['Creado', (p.createdAt as Date).toISOString()]]
    hechos = await db.$queryRaw<Row[]>`
      SELECT a."createdAt" AS fecha, u."displayName" AS quien, a."actorRole" AS rol, a.type AS que, a.message AS detalle
        FROM "ActivityEvent" a LEFT JOIN "User" u ON u.id = a."actorId" WHERE a."projectId" = ${id}
      UNION ALL SELECT i."issuedAt", NULL, 'sistema', 'factura emitida', i.number || ' · $' || i.total::text FROM "Invoice" i WHERE i."projectId" = ${id}
      UNION ALL SELECT i."paidAt", NULL, 'sistema', 'factura pagada', i.number || ' · ' || COALESCE(i."paymentMethod", '') FROM "Invoice" i WHERE i."projectId" = ${id} AND i."paidAt" IS NOT NULL
      UNION ALL SELECT c."paidAt", NULL, 'sistema', 'cobro de materiales pagado', c.number || ' · $' || c.amount::text FROM "ProviderCharge" c WHERE c."projectId" = ${id} AND c."paidAt" IS NOT NULL
      UNION ALL SELECT r."createdAt", u."displayName", 'reseña', 'reseña', r.rating::text || ' estrellas' FROM "Review" r LEFT JOIN "User" u ON u.id = r."authorId" WHERE r."projectId" = ${id}`
  } else if (tipo === 'order') {
    const [o] = await db.$queryRaw<Row[]>`SELECT * FROM "Order" WHERE id = ${id}`
    if (!o) return null
    titulo = `Pedido ${o.number}`
    const [agg] = await db.$queryRaw<Row[]>`SELECT count(*)::int AS subs, COALESCE(sum(total), 0)::float8 AS total FROM "Purchase" WHERE "orderId" = ${id}`
    datos = [['Cliente', await nombre(o.clientId)], ['Sub-pedidos', n(agg?.subs)], ['Total (sin cargo)', r2(agg?.total)], ['Creado', (o.createdAt as Date).toISOString()]]
    hechos = await db.$queryRaw<Row[]>`
      SELECT a."createdAt" AS fecha, u."displayName" AS quien, a."actorRole" AS rol, a.type AS que, a.message AS detalle
      FROM "ActivityEvent" a LEFT JOIN "User" u ON u.id = a."actorId"
      WHERE a."orderId" = ${id} OR a."purchaseId" IN (SELECT id FROM "Purchase" WHERE "orderId" = ${id})`
  } else if (tipo === 'purchase') {
    const [pu] = await db.$queryRaw<Row[]>`SELECT * FROM "Purchase" WHERE id = ${id}`
    if (!pu) return null
    titulo = `Sub-pedido: ${pu.elementName}`
    datos = [['Tipo y estado', `${pu.type} · ${pu.status}`], ['Cliente', await nombre(pu.clientId)], ['Total', n(pu.total)], ['Cargo 1%', n(pu.serviceFee)], ['Pago', (pu.paymentMethod as string | null) ?? null]]
    hechos = await db.$queryRaw<Row[]>`
      SELECT a."createdAt" AS fecha, u."displayName" AS quien, a."actorRole" AS rol, a.type AS que, a.message AS detalle
      FROM "ActivityEvent" a LEFT JOIN "User" u ON u.id = a."actorId" WHERE a."purchaseId" = ${id}`
  } else if (tipo === 'invoice') {
    const [i] = await db.$queryRaw<Row[]>`SELECT * FROM "Invoice" WHERE id = ${id}`
    if (!i) return null
    titulo = `Factura ${i.number}`
    datos = [['Estado', String(i.status)], ['Cliente', await nombre(i.clientId)], ['Total', n(i.total)], ['Cargo 1%', n(i.serviceFee)], ['Método', (i.paymentMethod as string | null) ?? null], ['Proyecto', String(i.projectId)]]
    hechos = await db.$queryRaw<Row[]>`
      SELECT "createdAt" AS fecha, NULL AS quien, method AS rol, 'pago ' || status AS que, '$' || amount::text AS detalle FROM "Payment" WHERE "invoiceId" = ${id}`
  } else if (tipo === 'job') {
    const [j] = await db.$queryRaw<Row[]>`SELECT * FROM "JobPost" WHERE id = ${id}`
    if (!j) return null
    titulo = `Trabajo: ${j.title}`
    datos = [['Estado', String(j.status)], ['Publicó', await nombre(j.userId)], ['Rubro', String(j.categorySlug)], ['Creado', (j.createdAt as Date).toISOString()]]
    hechos = await db.$queryRaw<Row[]>`
      SELECT b."createdAt" AS fecha, u."displayName" AS quien, 'profesional' AS rol, 'oferta ' || b.status AS que, '$' || b.amount::text AS detalle
      FROM "JobBid" b JOIN "ProfessionalProfile" pp ON pp.id = b."professionalId" JOIN "User" u ON u.id = pp."userId" WHERE b."jobId" = ${id}`
  } else if (tipo === 'conversation') {
    // solo metadatos: nunca el texto de los mensajes
    const [c] = await db.$queryRaw<Row[]>`SELECT * FROM "Conversation" WHERE id = ${id}`
    if (!c) return null
    titulo = 'Conversación'
    const [agg] = await db.$queryRaw<Row[]>`SELECT count(*)::int AS mensajes, min("createdAt") AS primero, max("createdAt") AS ultimo FROM "Message" WHERE "conversationId" = ${id}`
    datos = [['Participante A', await nombre(c.userAId)], ['Participante B', await nombre(c.userBId)], ['Mensajes', n(agg?.mensajes)],
      ['Primero', agg?.primero ? (agg.primero as Date).toISOString() : null], ['Último', agg?.ultimo ? (agg.ultimo as Date).toISOString() : null]]
    hechos = await db.$queryRaw<Row[]>`
      SELECT m."createdAt" AS fecha, u."displayName" AS quien, NULL AS rol, 'mensaje enviado' AS que, CASE WHEN m."readAt" IS NULL THEN 'sin leer' ELSE 'leído' END AS detalle
      FROM "Message" m LEFT JOIN "User" u ON u.id = m."senderId" WHERE m."conversationId" = ${id} ORDER BY m."createdAt" DESC LIMIT 200`
  } else {
    titulo = `Activo ${tipo}`
  }
  const uso = await db.$queryRaw<Row[]>`
    SELECT e."createdAt" AS fecha, u."displayName" AS quien, e.role AS rol, e.type || ': ' || e.name AS que, e.path AS detalle
    FROM "AnalyticsEvent" e LEFT JOIN "User" u ON u.id = e."userId"
    WHERE e."entityType" = ${tipo} AND e."entityId" = ${id} ORDER BY e."createdAt" DESC LIMIT 300`
  // tipo sin ficha propia (stock, reseña, obra…): solo existe si tiene uso registrado
  if (!datos.length && !hechos.length && !uso.length) return null
  const linea = [
    ...hechos.map((h) => ({ fuente: 'negocio' as const, h })),
    ...uso.map((h) => ({ fuente: 'uso' as const, h })),
  ].filter((x) => x.h.fecha).map(({ fuente, h }) => ({
    fecha: (h.fecha as Date).toISOString(), fuente, quien: (h.quien as string | null) ?? null, rol: (h.rol as string | null) ?? null,
    que: String(h.que ?? ''), detalle: (h.detalle as string | null) ?? null,
  })).sort((a, b) => (a.fecha < b.fecha ? 1 : -1))
  return { tipo, id, titulo, datos, linea }
}
