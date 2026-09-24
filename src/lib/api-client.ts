'use client'
// Cliente de fetch para las pantallas HomIA: nunca falla en silencio.
// - Falla de red (sin conexión, timeout, DNS) → toast honesto "No pudimos conectar".
// - 4xx/5xx → toast con el `error` que devuelve la API (siempre en rioplatense).
// - Devuelve { ok, status, data, error } para que la pantalla decida qué mostrar
//   (estado de error con "Reintentar" en vez de un empty state mentiroso).
import { toast } from 'sonner'

export const NETWORK_ERROR = 'No pudimos conectar. Reintentá en unos segundos'

export type ApiResult<T> = { ok: boolean; status: number; data: T | null; error: string | null }

type ApiInit = RequestInit & {
  /** true → no muestra toast (la pantalla maneja el error a mano) */
  silent?: boolean
  /** atajo: serializa `json` como body con Content-Type application/json */
  json?: unknown
}

export async function apiFetch<T = any>(url: string, init: ApiInit = {}): Promise<ApiResult<T>> {
  const { silent, json, ...rest } = init
  const headers = new Headers(rest.headers || {})
  let body = rest.body
  if (json !== undefined) {
    headers.set('Content-Type', 'application/json')
    body = JSON.stringify(json)
  }

  let res: Response
  try {
    res = await fetch(url, { ...rest, headers, body })
  } catch {
    if (!silent) toast.error(NETWORK_ERROR)
    return { ok: false, status: 0, data: null, error: NETWORK_ERROR }
  }

  let data: T | null = null
  let parsed: unknown = null
  try {
    const text = await res.text()
    parsed = text ? JSON.parse(text) : null
    data = parsed as T
  } catch {
    parsed = null
  }

  if (!res.ok) {
    const fromBody = parsed && typeof parsed === 'object' && 'error' in (parsed as Record<string, unknown>)
      ? String((parsed as Record<string, unknown>).error)
      : null
    const error = fromBody || (res.status >= 500 ? 'Algo falló de nuestro lado. Reintentá en unos segundos' : `Error ${res.status}`)
    if (!silent) toast.error(error)
    return { ok: false, status: res.status, data, error }
  }

  return { ok: true, status: res.status, data, error: null }
}
