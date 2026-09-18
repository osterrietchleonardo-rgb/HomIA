// Helpers para API routes HomIA
import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser, type SessionUser } from '@/lib/auth'

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
