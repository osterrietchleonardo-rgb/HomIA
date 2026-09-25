// Envío del código de verificación al celular (D26, 25/09/2026): proveedor enchufable.
//
// HOY HomIA NO TIENE NINGUNO CONFIGURADO: `proveedorCelular()` devuelve null, la pantalla no pide
// código de celular y el teléfono queda como "sin verificar" (fallback honesto: nunca se simula un
// código). Para activarlo alcanza con cargar las variables de UNO de estos dos:
//
//   PHONE_VERIFY_PROVIDER=twilio     → SMS con Twilio (API "Messages")
//     TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN y TWILIO_SMS_FROM (un número de Twilio "+1…" o el SID
//     de un Messaging Service "MG…").
//   PHONE_VERIFY_PROVIDER=whatsapp   → WhatsApp Cloud API de Meta, con una plantilla de
//     AUTENTICACIÓN aprobada (botón "copiar código")
//     WHATSAPP_TOKEN, WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_OTP_TEMPLATE (nombre de la plantilla) y
//     WHATSAPP_OTP_LANG (idioma de la plantilla; por defecto es_AR).
//
// Sin SDK (solo fetch), timeout de 10 s, nunca tira: siempre devuelve un resultado.

export type CanalCelular = 'sms' | 'whatsapp'
export type ResultadoEnvio = { ok: true } | { ok: false; detalle: string }

export interface ProveedorCelular {
  canal: CanalCelular
  /** Nombre para mostrar ("SMS", "WhatsApp"). */
  nombre: string
  enviarCodigo(e164: string, codigo: string): Promise<ResultadoEnvio>
}

const TIMEOUT_MS = 10_000
const env = (k: string) => (process.env[k] || '').trim()

function twilio(): ProveedorCelular | null {
  const sid = env('TWILIO_ACCOUNT_SID')
  const token = env('TWILIO_AUTH_TOKEN')
  const from = env('TWILIO_SMS_FROM')
  if (!sid || !token || !from) return null
  return {
    canal: 'sms',
    nombre: 'SMS',
    async enviarCodigo(e164, codigo) {
      const form = new URLSearchParams({ To: e164, Body: `Tu código de HomIA es ${codigo}. Vence en 10 minutos. No se lo pases a nadie.` })
      if (from.startsWith('MG')) form.set('MessagingServiceSid', from)
      else form.set('From', from)
      try {
        const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(sid)}/Messages.json`, {
          method: 'POST',
          headers: {
            Authorization: `Basic ${Buffer.from(`${sid}:${token}`).toString('base64')}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: form.toString(),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (!res.ok) return { ok: false, detalle: `Twilio HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}` }
        return { ok: true }
      } catch (e) {
        return { ok: false, detalle: e instanceof Error ? e.message : String(e) }
      }
    },
  }
}

function whatsapp(): ProveedorCelular | null {
  const token = env('WHATSAPP_TOKEN')
  const phoneId = env('WHATSAPP_PHONE_NUMBER_ID')
  const plantilla = env('WHATSAPP_OTP_TEMPLATE')
  if (!token || !phoneId || !plantilla) return null
  const idioma = env('WHATSAPP_OTP_LANG') || 'es_AR'
  return {
    canal: 'whatsapp',
    nombre: 'WhatsApp',
    async enviarCodigo(e164, codigo) {
      try {
        const res = await fetch(`https://graph.facebook.com/v21.0/${encodeURIComponent(phoneId)}/messages`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            messaging_product: 'whatsapp',
            to: e164.replace(/^\+/, ''),
            type: 'template',
            template: {
              name: plantilla,
              language: { code: idioma },
              // plantilla de autenticación: el código va en el cuerpo y en el botón "copiar código"
              components: [
                { type: 'body', parameters: [{ type: 'text', text: codigo }] },
                { type: 'button', sub_type: 'url', index: '0', parameters: [{ type: 'text', text: codigo }] },
              ],
            },
          }),
          signal: AbortSignal.timeout(TIMEOUT_MS),
        })
        if (!res.ok) return { ok: false, detalle: `WhatsApp HTTP ${res.status} ${(await res.text().catch(() => '')).slice(0, 200)}` }
        return { ok: true }
      } catch (e) {
        return { ok: false, detalle: e instanceof Error ? e.message : String(e) }
      }
    },
  }
}

/** El proveedor configurado, o null si no hay ninguno (hoy: null). */
export function proveedorCelular(): ProveedorCelular | null {
  const cual = env('PHONE_VERIFY_PROVIDER').toLowerCase()
  if (cual === 'twilio') return twilio()
  if (cual === 'whatsapp') return whatsapp()
  return null
}
