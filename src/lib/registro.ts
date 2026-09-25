// Estandarización de los datos del registro (D26, 25/09/2026). Una sola implementación para el
// navegador (lo que ve la persona mientras escribe) y el servidor (lo que se guarda): así el
// formulario nunca acepta algo que después el servidor rechaza, ni al revés.
//
// Método tomado de PRISMA-SYSTEM (`lib/invites/reglas.ts`, `lib/whatsapp/phone.ts`): email con
// trim + minúsculas, celular a E.164 con libphonenumber-js forzando el "9" de celular de Argentina,
// y el celular escrito DOS VECES comparando los números normalizados ("11 2345-6789" y
// "011 15 2345 6789" son el mismo). Sumado para HomIA: sugerencia de dominio mal escrito, nombres
// con mayúsculas iniciales y CUIT/CUIL con dígito verificador.
//
// Sin dependencias del servidor: se importa desde componentes 'use client' y desde las rutas.
import { parsePhoneNumberFromString } from 'libphonenumber-js/min'

// ─────────────────────────────── email ───────────────────────────────

/** Largo máximo de un email (el mismo tope que usaba el registro). */
export const EMAIL_MAX = 200

// Parte local: lo que permite el RFC en la práctica (sin comillas ni espacios); dominio con
// etiquetas de letras, números y guiones, y terminación de al menos 2 letras.
const EMAIL_RE = /^[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*@(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,}$/

/** Dominios de mail más usados en Argentina, en orden de uso (el primero gana los empates). */
export const DOMINIOS_COMUNES = [
  'gmail.com', 'hotmail.com', 'outlook.com', 'yahoo.com.ar', 'yahoo.com', 'hotmail.com.ar',
  'live.com', 'icloud.com', 'outlook.com.ar', 'live.com.ar', 'msn.com', 'me.com',
  'fibertel.com.ar', 'speedy.com.ar', 'arnet.com.ar', 'protonmail.com', 'proton.me',
]

// Errores frecuentes que no son de tipeo sino de costumbre ("gmail.com.ar" no existe).
const DOMINIOS_REEMPLAZO: Record<string, string> = {
  'gmail.com.ar': 'gmail.com',
  'googlemail.com.ar': 'gmail.com',
  'icloud.com.ar': 'icloud.com',
  'outlook.ar': 'outlook.com.ar',
  'hotmail.ar': 'hotmail.com.ar',
}

/** Distancia de edición con transposiciones (Damerau–Levenshtein restringida). */
function distancia(a: string, b: string): number {
  const m = a.length
  const n = b.length
  const d: number[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0)))
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const costo = a[i - 1] === b[j - 1] ? 0 : 1
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + costo)
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1)
    }
  }
  return d[m][n]
}

/**
 * Si el dominio parece un error de tipeo de uno común ("gmial.com", "hotmial.com", "gmail.con"),
 * devuelve el email corregido para SUGERIRLO ("¿Quisiste decir …?"). Nunca corrige solo: un
 * dominio raro puede ser real (el de una empresa).
 */
export function sugerirEmail(email: string): string | null {
  const e = (email || '').trim().toLowerCase()
  const at = e.lastIndexOf('@')
  if (at < 1) return null
  const local = e.slice(0, at)
  const dominio = e.slice(at + 1)
  if (!dominio || DOMINIOS_COMUNES.includes(dominio)) return null
  if (DOMINIOS_REEMPLAZO[dominio]) return `${local}@${DOMINIOS_REEMPLAZO[dominio]}`
  // dominios cortos ("mi.com", "me.co"): sin sugerencia, cualquier cosa se parece a otra;
  // hasta 8 letras, 1 cambio; más largos, 2
  if (dominio.length < 7) return null
  const tope = dominio.length <= 8 ? 1 : 2
  let mejor: string | null = null
  let mejorD = Infinity
  for (const c of DOMINIOS_COMUNES) {
    const dist = distancia(dominio, c)
    if (dist <= tope && dist < mejorD) {
      mejor = c
      mejorD = dist
    }
  }
  return mejor ? `${local}@${mejor}` : null
}

export type EmailNormalizado = { ok: true; email: string; sugerencia: string | null } | { ok: false; error: string }

/** trim + minúsculas + validación. Devuelve además la sugerencia de dominio si la hay. */
export function normalizarEmail(raw: unknown): EmailNormalizado {
  const email = String(raw ?? '').trim().toLowerCase()
  if (!email) return { ok: false, error: 'Escribí tu email' }
  if (email.length > EMAIL_MAX) return { ok: false, error: 'El email es demasiado largo' }
  if (/\s/.test(email)) return { ok: false, error: 'El email no puede tener espacios' }
  if (!email.includes('@')) return { ok: false, error: 'Al email le falta la @ (ej.: nombre@gmail.com)' }
  if (!EMAIL_RE.test(email)) return { ok: false, error: 'El email no parece válido (ej.: nombre@gmail.com)' }
  return { ok: true, email, sugerencia: sugerirEmail(email) }
}

// ─────────────────────────────── celular ───────────────────────────────

export type CelularNormalizado = { ok: true; e164: string; mostrar: string } | { ok: false; error: string }

/**
 * Celular argentino → E.164 con el 9 de celular (`+5491123456789`) y cómo mostrarlo
 * (`+54 9 11 2345-6789`). Acepta como lo escribe la gente: con o sin +54, con o sin 9, con o sin
 * 0 de larga distancia y 15, con espacios, guiones, puntos o paréntesis. libphonenumber-js sabe
 * los códigos de área (2, 3 o 4 cifras) y dónde va el 15; si la persona no puso ni 9 ni 15 el
 * número queda como fijo y se le agrega el 9 (el campo es "Celular": igual que PRISMA).
 */
export function normalizarCelular(raw: unknown): CelularNormalizado {
  const s = String(raw ?? '').trim()
  if (!s) return { ok: false, error: 'Escribí tu celular' }
  if (s.length > 30) return { ok: false, error: 'El celular es demasiado largo' }
  if (/[a-z]/i.test(s)) return { ok: false, error: 'El celular solo lleva números (ej.: 11 2345-6789)' }
  const digitos = s.replace(/\D/g, '')
  if (digitos.length < 8) return { ok: false, error: 'Al celular le faltan números: poné el código de área y el número (ej.: 11 2345-6789)' }
  // "+54…" o "0054…" es internacional; "54…" con 12 o 13 cifras también (así lo copian de WhatsApp)
  let texto = s
  if (/^00/.test(digitos) && !s.startsWith('+')) texto = `+${digitos.slice(2)}`
  else if (!s.startsWith('+') && /^54\d{10,11}$/.test(digitos)) texto = `+${digitos}`
  let pn
  try {
    pn = parsePhoneNumberFromString(texto, 'AR')
  } catch {
    pn = undefined
  }
  if (!pn || pn.country !== 'AR' || !pn.isValid()) {
    if (pn && pn.country && pn.country !== 'AR') return { ok: false, error: 'Por ahora solo aceptamos celulares de Argentina (+54)' }
    return { ok: false, error: 'Ese celular no es válido: revisá el código de área y el número (ej.: 11 2345-6789 o 351 15 555-1234)' }
  }
  let nacional = pn.nationalNumber as string // sin 0 ni 15; con el 9 si la persona lo indicó
  // los códigos de área argentinos empiezan con 11, 2 o 3; 0800/0810/0600 no son celulares
  if (!/^9?(11|2|3)/.test(nacional)) return { ok: false, error: 'Eso no es un celular: escribí tu número con el código de área (ej.: 11 2345-6789)' }
  if (!nacional.startsWith('9')) nacional = `9${nacional}`
  if (nacional.length !== 11) return { ok: false, error: 'Ese celular no es válido: tiene que tener código de área y número (10 cifras sin el 0 ni el 15)' }
  const e164 = `+54${nacional}`
  return { ok: true, e164, mostrar: formatearCelular(e164) }
}

/** `+5491123456789` → `+54 9 11 2345-6789`. Si no se puede formatear, devuelve lo mismo. */
export function formatearCelular(e164: string): string {
  try {
    const pn = parsePhoneNumberFromString(e164)
    // "+54 9 11 2345 6789" → "+54 9 11 2345-6789" (como se escribe en Argentina)
    if (pn) return pn.formatInternational().replace(/ (\d+)$/, '-$1')
  } catch {
    /* sigue */
  }
  return e164
}

/** ¿Los dos celulares escritos son el mismo número? (se comparan normalizados, no como texto) */
export function mismoCelular(a: unknown, b: unknown): boolean {
  const x = normalizarCelular(a)
  const y = normalizarCelular(b)
  return x.ok && y.ok && x.e164 === y.e164
}

// ─────────────────────────────── nombres ───────────────────────────────

const PARTICULAS = new Set(['de', 'del', 'la', 'las', 'los', 'y', 'e', 'da', 'di', 'van', 'von'])
const SOLO_LETRAS = /^[\p{L}'’-]+$/u

function capitalizarPalabra(p: string): string {
  // "o'connor" → "O'Connor", "maría-josé" → "María-José"
  return p
    .toLowerCase()
    .replace(/(^|['’-])(\p{L})/gu, (_m, sep: string, l: string) => sep + l.toUpperCase())
}

/**
 * Espacios de más fuera y mayúsculas iniciales razonables: solo se tocan las palabras escritas
 * TODAS en minúscula o TODAS en mayúscula ("juan PÉREZ" → "Juan Pérez"); las que ya vienen
 * mezcladas ("McDonald", "DiMaría") y las que tienen números o símbolos quedan como están.
 * "de", "del", "la"… van en minúscula salvo al principio.
 */
export function normalizarNombre(raw: unknown): string {
  const palabras = String(raw ?? '').trim().replace(/\s+/g, ' ').split(' ').filter(Boolean)
  return palabras
    .map((p, i) => {
      if (!SOLO_LETRAS.test(p)) return p
      const todoMin = p === p.toLowerCase()
      const todoMay = p === p.toUpperCase()
      if (!todoMin && !todoMay) return p
      if (i > 0 && PARTICULAS.has(p.toLowerCase())) return p.toLowerCase()
      return capitalizarPalabra(p)
    })
    .join(' ')
}

/** Problema con un nombre o apellido, o null si sirve. */
export function problemaNombre(v: string, que: 'nombre' | 'apellido'): string | null {
  const t = v.trim()
  if (!t) return que === 'nombre' ? 'Escribí tu nombre' : 'Escribí tu apellido'
  if (!/\p{L}[\s\S]*\p{L}/u.test(t)) return que === 'nombre' ? 'El nombre tiene que tener al menos 2 letras' : 'El apellido tiene que tener al menos 2 letras'
  if (t.length > 40) return que === 'nombre' ? 'El nombre es demasiado largo' : 'El apellido es demasiado largo'
  return null
}

// ─────────────────────────────── CUIT / CUIL / DNI ───────────────────────────────

const PREFIJOS_CUIT = ['20', '23', '24', '25', '26', '27', '30', '33', '34']
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2]

export type CuitNormalizado = { ok: true; cuit: string; digitos: string } | { ok: false; error: string }

/** CUIT/CUIL con dígito verificador (módulo 11). Devuelve `20-12345678-6`. */
export function normalizarCuit(raw: unknown): CuitNormalizado {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (!d) return { ok: false, error: 'Escribí el CUIT' }
  if (d.length !== 11) return { ok: false, error: 'El CUIT/CUIL tiene 11 números (ej.: 20-12345678-6)' }
  if (!PREFIJOS_CUIT.includes(d.slice(0, 2))) return { ok: false, error: 'El CUIT/CUIL no es válido: empieza con 20, 23, 24, 27, 30, 33 o 34' }
  const suma = PESOS_CUIT.reduce((acc, p, i) => acc + p * Number(d[i]), 0)
  let dv = 11 - (suma % 11)
  if (dv === 11) dv = 0
  if (dv === 10 || dv !== Number(d[10])) return { ok: false, error: 'El CUIT/CUIL no es válido: revisá los números (el último es de control)' }
  return { ok: true, cuit: `${d.slice(0, 2)}-${d.slice(2, 10)}-${d.slice(10)}`, digitos: d }
}

/** DNI (7 u 8 números) o CUIL (11, con dígito verificador). Devuelve el valor prolijo. */
export function normalizarDniOCuil(raw: unknown): { ok: true; valor: string } | { ok: false; error: string } {
  const d = String(raw ?? '').replace(/\D/g, '')
  if (d.length === 7 || d.length === 8) return { ok: true, valor: d }
  if (d.length === 11) {
    const c = normalizarCuit(d)
    return c.ok ? { ok: true, valor: c.cuit } : c
  }
  return { ok: false, error: 'Escribí tu DNI (7 u 8 números) o tu CUIL (11 números)' }
}

// ─────────────────────────────── códigos ───────────────────────────────

/** Reglas de los códigos de verificación (las usan la pantalla y el servidor). */
export const CODIGO = {
  digitos: 6,
  venceMin: 10,
  maxIntentos: 5,
  reenvioSeg: 60,
  maxEnviosHora: 5,
} as const
