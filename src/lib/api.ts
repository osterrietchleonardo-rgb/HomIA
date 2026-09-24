// Helpers para API routes HomIA
import { NextRequest, NextResponse } from 'next/server'
import type { ZodSchema } from 'zod'
import { getSessionUser, type SessionUser } from '@/lib/auth'

/** URL pública de la app (sin barra final). Nunca derivarla de `req.url`: detrás
 *  del proxy de Vercel puede ser otro host y termina en redirects/back_urls rotos. */
export function appUrl(): string {
  const raw = (process.env.APP_URL || '').trim()
  const base = raw || 'http://localhost:3000'
  return base.replace(/\/+$/, '')
}

/** Parsea y valida el body JSON con zod. Devuelve `{ data }` o `{ error }` listo
 *  para retornar (400 con el primer mensaje de validación, en español). */
export async function parseBody<T>(
  req: NextRequest,
  schema: ZodSchema<T>
): Promise<{ data: T; error?: undefined } | { data?: undefined; error: NextResponse }> {
  let raw: unknown = {}
  try {
    raw = await req.json()
  } catch {
    raw = {}
  }
  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const first = parsed.error.issues[0]
    const path = first?.path?.length ? `${first.path.join('.')}: ` : ''
    return { error: fail(`${path}${first?.message || 'Datos inválidos'}`, 400) }
  }
  return { data: parsed.data }
}

export function ok(data: unknown, status = 200) {
  // Todo dato de HomIA es dinámico y por-usuario: nunca cacheable por el navegador
  // (evita sesiones "fantasma" al volver al home o cambiar de rol).
  return NextResponse.json(data, { status, headers: { 'Cache-Control': 'no-store' } })
}

export function fail(message: string, status = 400, extra?: Record<string, unknown>) {
  return NextResponse.json({ error: message, ...extra }, { status, headers: { 'Cache-Control': 'no-store' } })
}

export async function requireAuth(): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getSessionUser()
  if (!user) return { response: fail('Necesitás iniciar sesión para hacer esto', 401) }
  return { user }
}

export async function requireRole(
  role: 'cliente' | 'profesional' | 'proveedor'
): Promise<{ user: SessionUser } | { response: NextResponse }> {
  const user = await getSessionUser()
  if (!user) return { response: fail('Necesitás iniciar sesión para hacer esto', 401) }
  if (!user.roles.includes(role)) {
    return { response: fail(`Esta acción requiere perfil de ${role}`, 403, { needsRole: role }) }
  }
  return { user }
}

export async function body<T = Record<string, unknown>>(req: NextRequest): Promise<T> {
  try {
    return (await req.json()) as T
  } catch {
    return {} as T
  }
}

export function parseJson<T = unknown>(str: string | null | undefined, fallback: T): T {
  try {
    const v = JSON.parse(str || '')
    return v ?? fallback
  } catch {
    return fallback
  }
}
