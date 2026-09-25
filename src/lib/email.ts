// Envío de mails de HomIA con Resend, por su API HTTP (sin SDK: solo fetch).
// Variables: RESEND_API_KEY (sin ella no se envía nada), EMAIL_FROM y APP_URL (links).
// Nunca rompe el flujo que lo llama: siempre devuelve un resultado, nunca tira.

import { TITULAR } from '@/lib/legal-content'

export type EmailResult =
  | { ok: true; id: string | null }
  | { ok: false; reason: 'no_configurado' | 'destinatario_invalido' | 'error'; detail?: string }

export type EmailContent = {
  to: string
  subject: string
  /** Título grande del mail (ej. "Nueva compra"). */
  heading: string
  /** Párrafos del cuerpo, en texto plano (se escapan para el HTML). */
  paragraphs: string[]
  /** Botón principal: texto y link absoluto. */
  button?: { label: string; url: string }
  /** Pie "podés dejar de recibir avisos…". false para el de recuperar contraseña. */
  unsubscribeFooter?: boolean
  /** Nota chica debajo del botón (ej. "El link vence en 1 hora"). */
  note?: string
}

// Colores de marca (los mismos tokens de src/app/globals.css)
const NAVY = '#0A2540'
const NARANJA = '#FF5A1F'
const DORADO = '#FFC700'
const CELESTE = '#00C4FF'
const AZUL = '#1D63B8'
const CONFORT = '#F0F2F5'
const LINEA = '#E4E9F0'
const TEXTO = '#33415C'
const GRIS = '#6B7A90'
const PIE_AVISOS = 'Recibís este mail porque tenés una cuenta en HomIA. Podés dejar de recibir avisos por mail desde tu perfil.'
const PIE_CUENTA = 'Recibís este mail porque alguien pidió crear una nueva contraseña para tu cuenta de HomIA. Si no fuiste vos, ignoralo: tu contraseña no cambia.'
const RESEND_URL = 'https://api.resend.com/emails'
const TIMEOUT_MS = 10_000
const DOMINIO_RESERVADO = /\.(test|invalid|example|localhost)$/i

let avisoSinClave = false

/** URL pública de la app (misma regla que `appUrl()` de api.ts; acá sin importar la sesión). */
function appUrl(): string {
  return ((process.env.APP_URL || '').trim() || 'http://localhost:3000').replace(/\/+$/, '')
}

/** ¿Hay proveedor de mail configurado? */
export function emailConfigurado(): boolean {
  return !!(process.env.RESEND_API_KEY || '').trim()
}

function remitente(): string {
  // Por defecto, el dominio verificado en Resend (vakbot.vakdor.com, 25/09/2026). Cuando se verifique
  // somoshomia.com, se cambia con EMAIL_FROM sin tocar código.
  return (process.env.EMAIL_FROM || '').trim() || 'HomIA <avisos@vakbot.vakdor.com>'
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Convierte un link interno de la SPA (`#/panel/...`) en una URL absoluta de la app. */
export function linkAbsoluto(link: string | null | undefined): string {
  const base = appUrl()
  if (!link) return `${base}/#/notificaciones`
  if (/^https?:\/\//i.test(link)) return link
  if (link.startsWith('#/')) return `${base}/${link}`
  if (link.startsWith('/#/')) return `${base}${link}`
  if (link.startsWith('/')) return `${base}/#${link}`
  return `${base}/#/${link}`
}

/**
 * Arma el HTML con la plantilla de marca de HomIA y el texto plano alternativo.
 * Tablas + estilos en línea (lo único que respetan Gmail, Outlook y Apple Mail), un solo
 * ancho de 560 px que se achica en el celu, logo en PNG (los clientes de mail no muestran SVG)
 * servido desde /email/ del sitio, con texto alternativo "HomIA" si las imágenes están bloqueadas.
 */
export function renderEmail(c: EmailContent): { html: string; text: string } {
  const pie = c.unsubscribeFooter === false ? PIE_CUENTA : PIE_AVISOS
  const base = appUrl()
  const logo = `${base}/email/homia-logo-blanco.png`
  const previa = esc((c.paragraphs.find((p) => !/^Hola/.test(p)) || c.heading).slice(0, 140))
  const parrafos = c.paragraphs
    // "$ 45.600": el signo no se separa del monto al cortar la línea en el celu
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.6;color:${TEXTO};">${esc(p).replace(/\$ (?=\d)/g, '$$&nbsp;')}</p>`)
    .join('')
  const boton = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:24px 0 10px;"><tr><td align="center" bgcolor="${NARANJA}" style="border-radius:12px;background:${NARANJA};">` +
      `<a href="${esc(c.button.url)}" target="_blank" style="display:inline-block;padding:14px 26px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:12px;">${esc(c.button.label)} &rarr;</a>` +
      `</td></tr></table>` +
      `<p style="margin:0;font-size:12px;line-height:1.5;color:${GRIS};">Si el botón no funciona, copiá este link en tu navegador:<br><a href="${esc(c.button.url)}" style="color:${AZUL};word-break:break-all;">${esc(c.button.url)}</a></p>`
    : ''
  const nota = c.note
    ? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:18px 0 0;"><tr><td style="background:${CONFORT};border-left:3px solid ${CELESTE};border-radius:8px;padding:12px 14px;font-size:13px;line-height:1.5;color:${TEXTO};">${esc(c.note)}</td></tr></table>`
    : ''
  const titular = `HomIA es un servicio de ${esc(TITULAR.nombre)}${TITULAR.cuit ? `, <span style="white-space:nowrap;">CUIT ${esc(TITULAR.cuit)}</span>` : ''}.`
  const contacto = TITULAR.email
    ? ` Consultas: <a href="mailto:${esc(TITULAR.email)}" style="color:${AZUL};">${esc(TITULAR.email)}</a>`
    : ''
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><meta name="supported-color-schemes" content="light"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:${CONFORT};font-family:Arial,Helvetica,sans-serif;-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:${CONFORT};">${previa}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${CONFORT};padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${LINEA};">
<tr><td bgcolor="${NAVY}" style="background:${NAVY};padding:20px 24px 18px;">
<a href="${esc(base)}" target="_blank" style="text-decoration:none;"><img src="${esc(logo)}" width="130" height="44" alt="HomIA" style="display:block;border:0;outline:none;width:130px;height:44px;color:#ffffff;font-size:24px;font-weight:800;"></a>
<p style="margin:8px 0 0;font-size:12px;letter-spacing:0.4px;color:#9FB3C8;">Tu hogar en buenas manos</p>
</td></tr>
<tr><td style="padding:0;line-height:0;font-size:0;"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
<td height="4" bgcolor="${NARANJA}" style="background:${NARANJA};height:4px;width:34%;"></td><td height="4" bgcolor="${DORADO}" style="background:${DORADO};height:4px;width:33%;"></td><td height="4" bgcolor="${CELESTE}" style="background:${CELESTE};height:4px;width:33%;"></td>
</tr></table></td></tr>
<tr><td style="padding:28px 24px 26px;">
<h1 style="margin:0 0 16px;font-size:22px;line-height:1.3;font-weight:800;color:${NAVY};">${esc(c.heading)}</h1>
${parrafos}${boton}${nota}
</td></tr>
<tr><td bgcolor="${CONFORT}" style="background:${CONFORT};padding:18px 24px 20px;border-top:1px solid ${LINEA};font-size:12px;line-height:1.6;color:${GRIS};">
<p style="margin:0 0 8px;">${esc(pie)}</p>
<p style="margin:0 0 8px;"><a href="${esc(base)}/#/ayuda" style="color:${AZUL};text-decoration:none;">Centro de ayuda</a> &nbsp;·&nbsp; <a href="${esc(base)}/#/terminos" style="color:${AZUL};text-decoration:none;">Términos</a> &nbsp;·&nbsp; <a href="${esc(base)}/#/privacidad" style="color:${AZUL};text-decoration:none;">Privacidad</a></p>
<p style="margin:0;">${titular}${contacto}</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`
  const text = [
    'HomIA · Tu hogar en buenas manos',
    '',
    c.heading,
    '',
    ...c.paragraphs.flatMap((p) => [p, '']),
    ...(c.button ? [`${c.button.label}: ${c.button.url}`, ''] : []),
    ...(c.note ? [c.note, ''] : []),
    '—',
    pie,
    `Centro de ayuda: ${base}/#/ayuda`,
    `HomIA es un servicio de ${TITULAR.nombre}${TITULAR.cuit ? `, CUIT ${TITULAR.cuit}` : ''}.${TITULAR.email ? ` Consultas: ${TITULAR.email}` : ''}`,
  ].join('\n')
  return { html, text }
}

/**
 * Envía un mail. Sin RESEND_API_KEY no intenta: avisa una vez por consola y devuelve
 * `{ ok: false, reason: 'no_configurado' }`. Timeout de 10 s. Nunca tira.
 */
export async function sendEmail(c: EmailContent): Promise<EmailResult> {
  const key = (process.env.RESEND_API_KEY || '').trim()
  if (!key) {
    if (!avisoSinClave) {
      avisoSinClave = true
      console.warn('[email] RESEND_API_KEY no está configurada: no se envían mails (los avisos siguen dentro de la app).')
    }
    return { ok: false, reason: 'no_configurado' }
  }
  const to = (c.to || '').trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, reason: 'destinatario_invalido' }
  // RESEND_API_URL solo para pruebas locales (un doble de Resend); en producción se ignora.
  const override = process.env.NODE_ENV !== 'production' ? (process.env.RESEND_API_URL || '').trim() : ''
  const url = override || RESEND_URL
  // Dominios reservados (cuentas demo y de prueba: @homia.test): nunca se mandan a Resend de
  // verdad (rebotarían y dañan la reputación del dominio). Sí al doble de pruebas.
  if (!override && DOMINIO_RESERVADO.test(to)) return { ok: false, reason: 'destinatario_invalido' }
  const { html, text } = renderEmail(c)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: remitente(), to: [to], subject: c.subject, html, text }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) {
      const detail = (await res.text().catch(() => '')).slice(0, 300)
      console.error('[email] Resend respondió', res.status, detail)
      return { ok: false, reason: 'error', detail: `HTTP ${res.status}` }
    }
    const data = (await res.json().catch(() => null)) as { id?: string } | null
    return { ok: true, id: data?.id ?? null }
  } catch (e) {
    const detail = e instanceof Error ? e.message : String(e)
    console.error('[email] no se pudo enviar', detail)
    return { ok: false, reason: 'error', detail }
  }
}
