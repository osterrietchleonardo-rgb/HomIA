import { NextRequest, NextResponse } from 'next/server'
import { getSessionUser } from '@/lib/auth'
import { db } from '@/lib/db'
import { appUrl } from '@/lib/api'
import { v4 as uuidv4 } from 'uuid'

// Inicia la vinculación OAuth de Mercado Pago del vendedor (proveedor, o
// profesional como caso secundario). El estado se guarda 10 minutos y se
// valida en el callback contra el usuario logueado.
export async function GET(req: NextRequest) {
  const base = appUrl()
  const user = await getSessionUser()
  if (!user) {
    return NextResponse.redirect(`${base}/ingresar?volver=${encodeURIComponent('/panel/proveedor/cobros')}`)
  }

  const kind = req.nextUrl.searchParams.get('kind') || 'provider'
  let sellerId = ''
  let sellerKind = ''

  if (kind === 'provider') {
    const provider = await db.providerProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
    if (!provider) return NextResponse.redirect(`${base}/panel/proveedor/cobros?mp=error`)
    sellerId = provider.id
    sellerKind = 'provider'
  } else if (kind === 'professional') {
    const professional = await db.professionalProfile.findUnique({ where: { userId: user.id }, select: { id: true } })
    if (!professional) return NextResponse.redirect(`${base}/panel/profesional/perfil?mp=error`)
    sellerId = professional.id
    sellerKind = 'professional'
  } else {
    return NextResponse.redirect(`${base}/panel/proveedor/cobros?mp=error`)
  }

  const clientId = process.env.MP_CLIENT_ID
  if (!clientId || !process.env.MP_CLIENT_SECRET) {
    console.error('[mp oauth] MP_CLIENT_ID / MP_CLIENT_SECRET no configurados')
    return NextResponse.redirect(`${base}/panel/proveedor/cobros?mp=error`)
  }

  const state = uuidv4()
  await db.oAuthState.create({
    data: {
      state,
      sellerId,
      sellerKind,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  })

  const redirectUri = `${base}/api/mp/oauth/callback`
  const mpUrl =
    'https://auth.mercadopago.com/authorization' +
    `?client_id=${encodeURIComponent(clientId)}` +
    '&response_type=code&platform_id=mp' +
    `&state=${encodeURIComponent(state)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}`

  return NextResponse.redirect(mpUrl)
}
