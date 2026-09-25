// Verificación de email y celular con código de 6 cifras (D26, 25/09/2026): base, mail y
// SMS/WhatsApp. Las reglas puras están en `verificacion.ts`; los topes en `registro.ts` → CODIGO.
//
// Dos propósitos:
//  - "registro": todavía no hay cuenta. Al acertar el código se devuelve un comprobante firmado
//    (JWT de 30 min) que `POST /api/auth/register` exige para crear la cuenta.
//  - "cuenta": el usuario ya tiene sesión (cuentas anteriores o celular cambiado). Al acertar se
//    marca `User.emailVerifiedAt` / `phoneVerifiedAt`.
//
// Sin enumeración de cuentas: si alguien pide un código de registro para un email que YA tiene
// cuenta, la respuesta es idéntica, pero en vez del código ese email recibe un aviso "ya tenés
// cuenta" (y el código guardado es uno al azar que nunca se mandó: ningún intento lo acierta).
import 'server-only'
import { createHmac } from 'node:crypto'
import { SignJWT, jwtVerify } from 'jose'
import { db } from '@/lib/db'
import { sendEmail, emailConfigurado } from '@/lib/email'
import { proveedorCelular } from '@/lib/celular-proveedor'
import { CODIGO, formatearCelular } from '@/lib/registro'
import {
  nuevoCodigo, hashCodigo, hashesIguales, estadoCodigo, permisoEnvio, MENSAJE_CODIGO,
  type Canal, type Proposito,
} from '@/lib/verificacion'

// Misma fuente que la sesión (auth.ts); en producción AUTH_SECRET es obligatoria (auth.ts corta
// el arranque si falta). Claves derivadas distintas para códigos y comprobantes: un comprobante
// nunca sirve como cookie de sesión ni al revés.
const SECRETO = process.env.AUTH_SECRET || 'homy-dev-secret-cambiar-en-produccion-9f2a'
const derivar = (uso: string) => createHmac('sha256', SECRETO).update(`homia:${uso}`).digest('hex')
const CLAVE_CODIGOS = derivar('codigos-verificacion')
const CLAVE_COMPROBANTE = new TextEncoder().encode(derivar('comprobante-verificacion'))
const COMPROBANTE_MIN = 30

/** IP del pedido (la que pone Vercel en x-forwarded-for), para los topes por conexión. */
export function ipCliente(req: Request): string | null {
  return (req.headers.get('x-forwarded-for') || '').split(',')[0].trim().slice(0, 64) || (req.headers.get('x-real-ip') || '').slice(0, 64) || null
}

export type ErrorVerif = { ok: false; status: number; error: string; extra?: Record<string, unknown> }

/** ¿Qué se puede verificar hoy? (la pantalla lo consulta para no pedir lo que no se puede mandar) */
export function disponibilidad() {
  const cel = proveedorCelular()
  return {
    email: emailConfigurado(),
    celular: !!cel,
    canalCelular: cel?.canal ?? null,
    nombreCanalCelular: cel?.nombre ?? null,
  }
}

function asuntoCodigo(codigo: string) {
  return `${codigo} es tu código de HomIA`
}

async function mandarCodigoPorMail(email: string, codigo: string, proposito: Proposito): Promise<{ ok: true } | ErrorVerif> {
  const r = await sendEmail({
    to: email,
    subject: asuntoCodigo(codigo),
    heading: proposito === 'registro' ? 'Confirmá tu email' : 'Verificá tu email',
    paragraphs: [
      'Hola:',
      proposito === 'registro'
        ? 'Para crear tu cuenta en HomIA, escribí este código en la pantalla del registro:'
        : 'Para verificar el email de tu cuenta de HomIA, escribí este código en tu perfil:',
    ],
    codigo,
    note: `El código vence en ${CODIGO.venceMin} minutos y sirve una sola vez. Si no lo pediste, ignorá este mail: nadie puede usar tu email sin este código.`,
    unsubscribeFooter: false,
  })
  if (r.ok) return { ok: true }
  if (r.reason === 'destinatario_invalido') return { ok: false, status: 400, error: 'No podemos mandar mails a esa dirección. Revisá que esté bien escrita.' }
  if (r.reason === 'no_configurado') return { ok: false, status: 503, error: 'Todavía no podemos mandar mails. Probá de nuevo más tarde.', extra: { needsConfig: true } }
  console.error('[verificacion] no salió el mail del código', r.detail)
  return { ok: false, status: 503, error: 'No pudimos mandar el mail con el código. Probá de nuevo en un minuto.' }
}

async function avisarCuentaExistente(email: string) {
  const base = ((process.env.APP_URL || '').trim() || 'http://localhost:3000').replace(/\/+$/, '')
  const r = await sendEmail({
    to: email,
    subject: 'Ya tenés una cuenta en HomIA',
    heading: 'Ya tenés una cuenta',
    paragraphs: [
      'Hola:',
      'Alguien (seguramente vos) quiso crear una cuenta nueva en HomIA con este email, pero este email ya tiene una cuenta.',
      'Ingresá con tu contraseña. Si no te la acordás, en "Ingresar" tocá "¿Olvidaste tu contraseña?".',
    ],
    button: { label: 'Ingresar a HomIA', url: `${base}/#/ingresar` },
    note: 'Si no fuiste vos, ignorá este mail: tu cuenta sigue igual.',
    unsubscribeFooter: false,
  })
  if (!r.ok) console.error('[verificacion] no salió el aviso de cuenta existente', r.reason)
}

/**
 * Crea y manda un código. `destino` ya viene normalizado (email en minúsculas o celular E.164).
 * Con propósito "cuenta", `userId` es el de la sesión (el destino sale de la cuenta, nunca del body).
 */
export async function enviarCodigo(p: {
  canal: Canal
  proposito: Proposito
  destino: string
  userId?: string | null
  ip: string | null
}): Promise<{ ok: true; venceEnSeg: number; reenviarEnSeg: number; canalNombre: string } | ErrorVerif> {
  const cel = p.canal === 'celular' ? proveedorCelular() : null
  if (p.canal === 'email' && !emailConfigurado()) {
    return { ok: false, status: 503, error: 'Todavía no podemos mandar mails para verificar el email. Probá de nuevo más tarde.', extra: { needsConfig: true } }
  }
  if (p.canal === 'celular' && !cel) {
    return { ok: false, status: 503, error: 'La verificación del celular por SMS o WhatsApp todavía no está disponible en HomIA.', extra: { needsConfig: true } }
  }

  const desde = new Date(Date.now() - 3600_000)
  const [recientes, enviosIpHora] = await Promise.all([
    db.verificationCode.findMany({
      where: { target: p.destino, channel: p.canal, purpose: p.proposito, createdAt: { gte: desde } },
      orderBy: { createdAt: 'desc' },
      select: { createdAt: true },
      take: CODIGO.maxEnviosHora + 1,
    }),
    p.ip ? db.verificationCode.count({ where: { ip: p.ip, createdAt: { gte: desde } } }) : Promise.resolve(0),
  ])
  const permiso = permisoEnvio({
    ultimo: recientes[0]?.createdAt ?? null,
    enviosDestinoHora: recientes.length,
    enviosIpHora,
    primeroDeLaHora: recientes[recientes.length - 1]?.createdAt ?? null,
  })
  if (!permiso.ok) return { ok: false, status: 429, error: permiso.mensaje, extra: { motivo: permiso.motivo, esperarSeg: permiso.esperarSeg } }

  // registro con un email que ya tiene cuenta (o reservado para un administrador): misma
  // respuesta, código al azar que nunca se manda, y un aviso al dueño del email.
  let cuentaExistente = false
  let reservado = false
  if (p.proposito === 'registro' && p.canal === 'email') {
    const u = await db.user.findUnique({ where: { email: p.destino }, select: { id: true } })
    cuentaExistente = !!u
    // D29: el administrador ya no es una cuenta (entra a /admin con ADMIN_EMAIL/ADMIN_PASSWORD):
    // ningún email queda reservado
    reservado = false
  }

  // limpieza perezosa: los códigos de más de 2 días ya no sirven para nada (ni para los topes)
  if (Math.random() < 0.05) {
    void db.verificationCode.deleteMany({ where: { createdAt: { lt: new Date(Date.now() - 2 * 86400_000) } } }).catch(() => {})
  }

  const codigo = nuevoCodigo()
  const fila = await db.verificationCode.create({
    data: {
      userId: p.proposito === 'cuenta' ? p.userId ?? null : null,
      channel: p.canal,
      purpose: p.proposito,
      target: p.destino,
      codeHash: hashCodigo(CLAVE_CODIGOS, p.canal, p.proposito, p.destino, cuentaExistente || reservado ? nuevoCodigo() + 'x' : codigo),
      expiresAt: new Date(Date.now() + CODIGO.venceMin * 60_000),
      ip: p.ip,
    },
    select: { id: true },
  })

  const listo = { ok: true as const, venceEnSeg: CODIGO.venceMin * 60, reenviarEnSeg: CODIGO.reenvioSeg, canalNombre: p.canal === 'email' ? 'email' : cel!.nombre }
  if (cuentaExistente) {
    await avisarCuentaExistente(p.destino)
    return listo
  }
  if (reservado) return listo

  if (p.canal === 'email') {
    const r = await mandarCodigoPorMail(p.destino, codigo, p.proposito)
    if (!r.ok) {
      // si no salió, el código no cuenta para la espera ni para el tope
      await db.verificationCode.delete({ where: { id: fila.id } }).catch(() => {})
      return r
    }
    return listo
  }
  const r = await cel!.enviarCodigo(p.destino, codigo)
  if (!r.ok) {
    console.error('[verificacion] no salió el código al celular', r.detalle)
    await db.verificationCode.delete({ where: { id: fila.id } }).catch(() => {})
    return { ok: false, status: 503, error: `No pudimos mandar el código por ${cel!.nombre} a ${formatearCelular(p.destino)}. Revisá el número o probá de nuevo en un minuto.` }
  }
  return listo
}

/**
 * Comprueba un código. Cada intento se descuenta ANTES de comparar (atómico: dos intentos a la
 * vez no pueden pasar el tope). Si acierta, el código queda usado.
 */
export async function comprobarCodigo(p: {
  canal: Canal
  proposito: Proposito
  destino: string
  codigo: string
  userId?: string | null
}): Promise<{ ok: true; id: string } | ErrorVerif> {
  const fila = await db.verificationCode.findFirst({
    where: {
      target: p.destino, channel: p.canal, purpose: p.proposito,
      ...(p.proposito === 'cuenta' ? { userId: p.userId ?? '__ninguno__' } : {}),
    },
    orderBy: { createdAt: 'desc' },
  })
  const estado = estadoCodigo(fila)
  if (estado !== 'vigente' || !fila) {
    return { ok: false, status: estado === 'agotado' ? 429 : 400, error: MENSAJE_CODIGO[estado as Exclude<typeof estado, 'vigente'>], extra: { motivo: estado } }
  }
  const tomado = await db.verificationCode.updateMany({
    where: { id: fila.id, usedAt: null, attempts: { lt: CODIGO.maxIntentos }, expiresAt: { gt: new Date() } },
    data: { attempts: { increment: 1 } },
  })
  if (tomado.count !== 1) {
    return { ok: false, status: 429, error: MENSAJE_CODIGO.agotado, extra: { motivo: 'agotado' } }
  }
  const acierta = hashesIguales(fila.codeHash, hashCodigo(CLAVE_CODIGOS, p.canal, p.proposito, p.destino, p.codigo))
  if (!acierta) {
    const restantes = CODIGO.maxIntentos - (fila.attempts + 1)
    if (restantes <= 0) return { ok: false, status: 429, error: MENSAJE_CODIGO.agotado, extra: { motivo: 'agotado', intentosRestantes: 0 } }
    return {
      ok: false,
      status: 400,
      error: `${MENSAJE_CODIGO.incorrecto} (te queda${restantes === 1 ? '' : 'n'} ${restantes} intento${restantes === 1 ? '' : 's'})`,
      extra: { motivo: 'incorrecto', intentosRestantes: restantes },
    }
  }
  const usado = await db.verificationCode.updateMany({ where: { id: fila.id, usedAt: null }, data: { usedAt: new Date() } })
  if (usado.count !== 1) return { ok: false, status: 400, error: MENSAJE_CODIGO.usado, extra: { motivo: 'usado' } }
  return { ok: true, id: fila.id }
}

/** Comprobante de "este email/celular se verificó" para crear la cuenta (30 min). */
export async function firmarComprobante(canal: Canal, destino: string, id: string): Promise<string> {
  return new SignJWT({ c: canal, d: destino, v: id })
    .setProtectedHeader({ alg: 'HS256' })
    .setAudience('homia-verificacion')
    .setIssuedAt()
    .setExpirationTime(`${COMPROBANTE_MIN}m`)
    .sign(CLAVE_COMPROBANTE)
}

/** ¿El comprobante es válido, de ese canal y de ESE destino? */
export async function comprobanteValido(token: unknown, canal: Canal, destino: string): Promise<boolean> {
  if (typeof token !== 'string' || !token || token.length > 2000) return false
  try {
    const { payload } = await jwtVerify(token, CLAVE_COMPROBANTE, { audience: 'homia-verificacion' })
    return payload.c === canal && payload.d === destino && typeof payload.v === 'string'
  } catch {
    return false
  }
}
