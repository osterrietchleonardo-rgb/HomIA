import { NextRequest, NextResponse } from 'next/server'
import { getSessionUserIdFromCookie } from '@/lib/auth'
import { rateLimit } from '@/lib/rate-limit'
import { ipDe } from '@/lib/homy/cupo'
import { loteSchema, MAX_BYTES_LOTE } from '@/lib/analytics/schema'
import { guardarLote } from '@/lib/analytics/server'

// POST /api/analytics/collect — recolección de métricas de uso (D27). Público (visitantes también).
// · Lote de hasta 50 eventos, validado con zod estricto; > 48 KB → 413; inválido → 400.
// · Tope por navegador (30 lotes/min) y por IP (240 lotes/min) → 429 sin cuerpo.
// · El usuario sale SIEMPRE de la cookie de sesión; el cuerpo no puede elegirlo.
// · Responde 204 enseguida después de UNA consulta a la base. Nunca cachea.
export const dynamic = 'force-dynamic'

const vacio = (status: number) => new NextResponse(null, { status, headers: { 'Cache-Control': 'no-store' } })

export async function POST(req: NextRequest) {
  const largo = Number(req.headers.get('content-length') || 0)
  if (largo > MAX_BYTES_LOTE) return vacio(413)
  let texto = ''
  try { texto = await req.text() } catch { return vacio(400) }
  if (texto.length > MAX_BYTES_LOTE) return vacio(413)
  let crudo: unknown
  try { crudo = JSON.parse(texto) } catch { return vacio(400) }
  const p = loteSchema.safeParse(crudo)
  if (!p.success) {
    return NextResponse.json({ error: 'Lote inválido' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
  }
  const lote = p.data

  const porNavegador = rateLimit(`metricas:anon:${lote.anonId}`, 30, 60_000)
  const porIp = rateLimit(`metricas:ip:${ipDe(req.headers)}`, 240, 60_000)
  if (!porNavegador.allowed || !porIp.allowed) return vacio(429)

  try {
    // solo el JWT (sin consulta): guardarLote confirma en su única consulta que la cuenta existe
    const uid = await getSessionUserIdFromCookie()
    await guardarLote(lote, uid, req.headers.get('user-agent') || '')
  } catch (e) {
    // el tracker no reintenta en bucle: un 503 se descarta del lado del navegador
    console.warn('[metricas] collect', e instanceof Error ? e.message : e)
    return vacio(503)
  }
  return vacio(204)
}
