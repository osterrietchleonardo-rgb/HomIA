// Rate limiting en memoria para endpoints sensibles (login / registro).
// El server de producción es un proceso único (standalone Node), así que un
// contador en memoria por IP es suficiente y no agrega dependencias.

type Bucket = { count: number; resetAt: number }

const buckets = new Map<string, Bucket>()

// limpieza perezosa: cada 1000 checks revisamos si hay buckets vencidos
let checks = 0

function sweep() {
  if (checks % 1000 !== 0) return
  const now = Date.now()
  for (const [k, b] of buckets) {
    if (b.resetAt <= now) buckets.delete(k)
  }
}

function clientIp(req: Request): string {
  const fwd = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim()
  if (fwd) return fwd
  return req.headers.get('x-real-ip') || 'local'
}

export type RateResult = { allowed: true } | { allowed: false; retryAfterSec: number }

/**
 * Ventana fija por clave (ip+acción o ip+email+acción).
 * @param key     clave del bucket
 * @param limit   cantidad de intentos permitidos en la ventana
 * @param windowMs tamaño de la ventana en ms
 */
export function rateLimit(key: string, limit: number, windowMs: number): RateResult {
  checks++
  sweep()
  const now = Date.now()
  const bucket = buckets.get(key)
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }
  if (bucket.count >= limit) {
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil((bucket.resetAt - now) / 1000)) }
  }
  bucket.count++
  return { allowed: true }
}

export function loginRateKey(req: Request, email: string) {
  return `login:${clientIp(req)}:${email.trim().toLowerCase()}`
}

export function ipRateKey(req: Request, action: string) {
  return `${action}:${clientIp(req)}`
}
