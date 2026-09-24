import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'
import { appUrl } from '@/lib/api'

// Callback OAuth de Mercado Pago. Exige sesión y que el `state` pertenezca al
// perfil del usuario logueado (evita que alguien vincule su MP al perfil de otro).
// Vuelve SIEMPRE al panel con ?mp=conectado | ?mp=error | ?mp=cancelado.
const DEFAULT_EXPIRES_IN = 15552000 // 180 días (valor documentado por MP)

export async function GET(req: NextRequest) {
  const base = appUrl()
  const sp = req.nextUrl.searchParams
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.redirect(`${base}/ingresar?volver=${encodeURIComponent('/panel/proveedor/cobros')}`)
  }

  const state = sp.get('state')
  const oauthState = state ? await db.oAuthState.findUnique({ where: { state } }) : null
  const dest = (kind: string | undefined) =>
    kind === 'professional' ? `${base}/panel/profesional/perfil` : `${base}/panel/proveedor/cobros`

  // el usuario canceló en MP (?error=access_denied) u otro error del lado de MP
  if (sp.get('error')) {
    if (oauthState) await db.oAuthState.delete({ where: { id: oauthState.id } }).catch(() => undefined)
    return NextResponse.redirect(`${dest(oauthState?.sellerKind)}?mp=cancelado`)
  }

  const code = sp.get('code')
  if (!code || !state || !oauthState) {
    return NextResponse.redirect(`${dest(oauthState?.sellerKind)}?mp=error`)
  }
  if (oauthState.expiresAt < new Date()) {
    await db.oAuthState.delete({ where: { id: oauthState.id } }).catch(() => undefined)
    return NextResponse.redirect(`${dest(oauthState.sellerKind)}?mp=error`)
  }

  // el state tiene que ser del perfil del usuario logueado
  const ownProfileId =
    oauthState.sellerKind === 'provider'
      ? (await db.providerProfile.findUnique({ where: { userId: user.id }, select: { id: true } }))?.id
      : oauthState.sellerKind === 'professional'
        ? (await db.professionalProfile.findUnique({ where: { userId: user.id }, select: { id: true } }))?.id
        : undefined
  if (!ownProfileId || ownProfileId !== oauthState.sellerId) {
    console.error('[mp oauth] state de otro perfil', { state, user: user.id })
    return NextResponse.redirect(`${dest(oauthState.sellerKind)}?mp=error`)
  }

  const redirectUri = `${base}/api/mp/oauth/callback`
  let data: { access_token?: string; refresh_token?: string; expires_in?: unknown } = {}
  try {
    const res = await fetch('https://api.mercadopago.com/oauth/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        client_id: process.env.MP_CLIENT_ID,
        client_secret: process.env.MP_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code,
        redirect_uri: redirectUri,
      }),
      signal: AbortSignal.timeout(15_000),
    })
    data = (await res.json().catch(() => ({}))) as typeof data
    if (!res.ok || !data.access_token) {
      console.error('[mp oauth] intercambio de código falló:', res.status, data)
      return NextResponse.redirect(`${dest(oauthState.sellerKind)}?mp=error`)
    }
  } catch (e) {
    console.error('[mp oauth] error de red con Mercado Pago:', e)
    return NextResponse.redirect(`${dest(oauthState.sellerKind)}?mp=error`)
  }

  const expiresInRaw = Number(data.expires_in)
  const expiresIn = Number.isFinite(expiresInRaw) && expiresInRaw > 0 ? expiresInRaw : DEFAULT_EXPIRES_IN
  const oauthData = {
    mpOauthAccessToken: data.access_token,
    mpOauthRefreshToken: data.refresh_token || null,
    mpOauthExpiresAt: new Date(Date.now() + expiresIn * 1000),
    mpOauthStatus: 'connected',
  }

  if (oauthState.sellerKind === 'provider') {
    await db.providerProfile.update({ where: { id: oauthState.sellerId }, data: oauthData })
  } else {
    await db.professionalProfile.update({ where: { id: oauthState.sellerId }, data: oauthData })
  }
  await db.oAuthState.delete({ where: { id: oauthState.id } }).catch(() => undefined)

  return NextResponse.redirect(`${dest(oauthState.sellerKind)}?mp=conectado`)
}
