// Envío de mails de HomIA con Resend, por su API HTTP (sin SDK: solo fetch).
// Variables: RESEND_API_KEY (sin ella no se envía nada), EMAIL_FROM y APP_URL (links).
// Nunca rompe el flujo que lo llama: siempre devuelve un resultado, nunca tira.

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

const NAVY = '#0A2540'
const NARANJA = '#FF5A1F'
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
  return (process.env.EMAIL_FROM || '').trim() || 'HomIA <avisos@somoshomia.com>'
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

/** Arma el HTML (tablas + estilos en línea, lo que entienden todos los clientes de mail) y el texto plano. */
export function renderEmail(c: EmailContent): { html: string; text: string } {
  const pie = c.unsubscribeFooter === false ? PIE_CUENTA : PIE_AVISOS
  const parrafos = c.paragraphs
    .map((p) => `<p style="margin:0 0 14px;font-size:15px;line-height:1.55;color:#33415c;">${esc(p)}</p>`)
    .join('')
  const boton = c.button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 8px;"><tr><td style="border-radius:10px;background:${NARANJA};">` +
      `<a href="${esc(c.button.url)}" target="_blank" style="display:inline-block;padding:13px 22px;font-size:15px;font-weight:700;color:#ffffff;text-decoration:none;border-radius:10px;">${esc(c.button.label)}</a>` +
      `</td></tr></table>` +
      `<p style="margin:0 0 6px;font-size:12px;line-height:1.5;color:#6b7a90;">Si el botón no funciona, copiá este link en tu navegador:<br><a href="${esc(c.button.url)}" style="color:${NAVY};word-break:break-all;">${esc(c.button.url)}</a></p>`
    : ''
  const nota = c.note ? `<p style="margin:10px 0 0;font-size:13px;line-height:1.5;color:#6b7a90;">${esc(c.note)}</p>` : ''
  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(c.subject)}</title></head>
<body style="margin:0;padding:0;background:#f3f5f9;font-family:Arial,Helvetica,sans-serif;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f5f9;padding:24px 12px;"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;border:1px solid #e3e8ef;">
<tr><td style="background:${NAVY};padding:18px 24px;"><span style="font-size:22px;font-weight:800;color:#ffffff;letter-spacing:-0.3px;">Hom<span style="color:${NARANJA};">IA</span></span></td></tr>
<tr><td style="padding:26px 24px 22px;">
<h1 style="margin:0 0 14px;font-size:20px;line-height:1.3;color:${NAVY};">${esc(c.heading)}</h1>
${parrafos}${boton}${nota}
</td></tr>
<tr><td style="padding:16px 24px;border-top:1px solid #e3e8ef;font-size:12px;line-height:1.5;color:#6b7a90;">${esc(pie)}</td></tr>
</table>
</td></tr></table>
</body></html>`
  const text = [
    'HomIA',
    '',
    c.heading,
    '',
    ...c.paragraphs.flatMap((p) => [p, '']),
    ...(c.button ? [`${c.button.label}: ${c.button.url}`, ''] : []),
    ...(c.note ? [c.note, ''] : []),
    '—',
    pie,
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
