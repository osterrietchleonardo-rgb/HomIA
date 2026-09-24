// Cupo diario de consultas al súper agente (funciona con varias instancias de
// Vercel: vive en Postgres con incremento atómico). Visitante: 8/día por IP
// (compartido entre el buscador y el botón flotante). Logueado: 60/día por usuario.
// La IP se guarda como hash (sha256 + AUTH_SECRET), nunca en claro.
import 'server-only'
import { createHash } from 'node:crypto'
import { db } from '@/lib/db'
import type { Cupo } from './tipos'

export const LIMITE_VISITANTE = 8
export const LIMITE_USUARIO = 60

const SAL = process.env.AUTH_SECRET || 'homy-dev-secret-cambiar-en-produccion-9f2a'

export function hashSeguro(valor: string): string {
  return createHash('sha256').update(`${SAL}:${valor}`).digest('hex').slice(0, 40)
}

/** IP del cliente: en Vercel x-forwarded-for / x-real-ip los pone el proxy. */
export function ipDe(headers: Headers): string {
  const fwd = (headers.get('x-forwarded-for') || '').split(',')[0].trim()
  return fwd || headers.get('x-real-ip') || 'local'
}

/** Día en Argentina (YYYY-MM-DD): el cupo se renueva a la medianoche local. */
export function diaArgentina(d = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(d)
}

export type ClaveCupo = { key: string; limite: number; tipo: Cupo['tipo'] }

export function claveCupo(userId: string | null, ipHash: string): ClaveCupo {
  return userId
    ? { key: `user:${userId}`, limite: LIMITE_USUARIO, tipo: 'usuario' }
    : { key: `ip:${ipHash}`, limite: LIMITE_VISITANTE, tipo: 'visitante' }
}

const armar = (c: ClaveCupo, usadas: number): Cupo => ({
  limite: c.limite,
  usadas,
  restantes: Math.max(0, c.limite - usadas),
  tipo: c.tipo,
})

/** Lectura sin consumir (para cortar ANTES de gastar y para mostrar lo que queda). */
export async function leerCupo(c: ClaveCupo, dia = diaArgentina()): Promise<Cupo> {
  const row = await db.aiUsage.findUnique({ where: { key_day: { key: c.key, day: dia } }, select: { count: true } })
  return armar(c, row?.count ?? 0)
}

/**
 * Consume 1 consulta de forma atómica y condicional: solo incrementa si no se
 * pasó del límite. Devuelve el cupo actualizado, o null si ya estaba agotado
 * (carrera entre dos pestañas / instancias).
 */
export async function consumirCupo(c: ClaveCupo, dia = diaArgentina()): Promise<Cupo | null> {
  const id = `aiu_${createHash('sha256').update(`${c.key}:${dia}`).digest('hex').slice(0, 24)}`
  const rows = await db.$queryRaw<{ count: number }[]>`
    INSERT INTO "AiUsage" ("id", "key", "day", "count", "createdAt", "updatedAt")
    VALUES (${id}, ${c.key}, ${dia}, 1, NOW(), NOW())
    ON CONFLICT ("key", "day") DO UPDATE
      SET "count" = "AiUsage"."count" + 1, "updatedAt" = NOW()
      WHERE "AiUsage"."count" < ${c.limite}
    RETURNING "count"`
  if (!rows.length) return null
  return armar(c, Number(rows[0].count))
}

/** Si la IA falló (respuesta armada sin IA), la consulta no se cobra del cupo. */
export async function devolverCupo(c: ClaveCupo, dia = diaArgentina()): Promise<void> {
  await db.aiUsage.updateMany({ where: { key: c.key, day: dia, count: { gt: 0 } }, data: { count: { decrement: 1 } } })
}

export class CupoAgotado extends Error {
  cupo: Cupo
  constructor(cupo: Cupo) {
    super('cupo agotado')
    this.cupo = cupo
  }
}
