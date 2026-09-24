// Cobro por Mercado Pago a nombre del vendedor: obtiene su token OAuth vigente o
// devuelve el 503 honesto `{ needsConfig: true }` para que la UI ofrezca efectivo.
import type { NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { ensureFreshSellerToken, PROVIDER_NOT_CONNECTED } from '@/lib/mercadopago'

type SellerOauth = {
  id: string
  mpOauthAccessToken: string | null
  mpOauthRefreshToken: string | null
  mpOauthExpiresAt: Date | null
  mpOauthStatus: string
}

export function notConnectedMessage(name: string) {
  return `${name} todavía no conectó Mercado Pago: podés pagar en efectivo`
}

export async function sellerTokenOr503(
  seller: SellerOauth,
  kind: 'provider' | 'professional',
  name: string
): Promise<{ token: string; error?: undefined } | { token?: undefined; error: NextResponse }> {
  try {
    return { token: await ensureFreshSellerToken(seller, kind) }
  } catch (e) {
    const msg = e instanceof Error ? e.message : ''
    if (msg !== PROVIDER_NOT_CONNECTED) console.error('[mp] token del vendedor', kind, seller.id, e)
    return { error: fail(notConnectedMessage(name), 503, { needsConfig: true }) }
  }
}

/** 503 honesto cuando Mercado Pago no respondió al crear la preferencia. */
export function mpDown() {
  return fail('Mercado Pago no respondió. Probá de nuevo en un rato o pagá en efectivo', 503, { retry: true })
}
