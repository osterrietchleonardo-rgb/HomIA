// Reglas de los códigos de verificación de email y celular (D26, 25/09/2026). Funciones puras
// (sin base ni red) para poder probarlas con tests; la parte con base, mail y SMS/WhatsApp está en
// `verificacion-server.ts`.
//
// - Código de 6 cifras con `crypto.randomInt` (aleatorio criptográfico).
// - En la base se guarda HMAC-SHA256(clave, canal:propósito:destino:código), nunca el código: con
//   solo un millón de combinaciones un sha256 pelado se revierte en segundos; con la clave del
//   servidor, quien copie la tabla no puede sacar los códigos.
// - Se compara en tiempo constante (`timingSafeEqual`).
// - Vence a los 10 min, hasta 5 intentos por código, un solo uso, reenvío cada 60 s y hasta 5
//   códigos por hora para el mismo destino (constantes en `registro.ts` → CODIGO).
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'
import { CODIGO } from '@/lib/registro'

export type Canal = 'email' | 'celular'
export type Proposito = 'registro' | 'cuenta'

/** Topes por conexión (IP) para que nadie use HomIA para mandar mails o SMS a terceros. */
export const TOPE_IP_HORA = 30

export function nuevoCodigo(): string {
  return String(randomInt(0, 10 ** CODIGO.digitos)).padStart(CODIGO.digitos, '0')
}

export function hashCodigo(clave: string, canal: Canal, proposito: Proposito, destino: string, codigo: string): string {
  return createHmac('sha256', clave).update(`${canal}:${proposito}:${destino}:${codigo}`, 'utf8').digest('hex')
}

/** Igualdad de dos hashes hex en tiempo constante. */
export function hashesIguales(a: string, b: string): boolean {
  const x = Buffer.from(a, 'hex')
  const y = Buffer.from(b, 'hex')
  if (x.length !== y.length || x.length === 0) return false
  return timingSafeEqual(x, y)
}

export type FilaCodigo = { codeHash: string; attempts: number; expiresAt: Date; usedAt: Date | null; createdAt: Date }

export type EstadoCodigo = 'sin_codigo' | 'usado' | 'vencido' | 'agotado' | 'vigente'

/** Estado del último código pedido para un destino. */
export function estadoCodigo(fila: FilaCodigo | null, ahora = new Date()): EstadoCodigo {
  if (!fila) return 'sin_codigo'
  if (fila.usedAt) return 'usado'
  if (fila.expiresAt.getTime() <= ahora.getTime()) return 'vencido'
  if (fila.attempts >= CODIGO.maxIntentos) return 'agotado'
  return 'vigente'
}

export const MENSAJE_CODIGO: Record<Exclude<EstadoCodigo, 'vigente'> | 'incorrecto', string> = {
  sin_codigo: 'Primero pedí el código: tocá "Mandarme el código"',
  usado: 'Ese código ya se usó. Pedí uno nuevo',
  vencido: `El código venció (dura ${CODIGO.venceMin} minutos). Pedí uno nuevo`,
  agotado: `Hiciste ${CODIGO.maxIntentos} intentos con este código. Pedí uno nuevo`,
  incorrecto: 'El código no es correcto. Revisalo y probá de nuevo',
}

export type PermisoEnvio =
  | { ok: true }
  | { ok: false; motivo: 'espera' | 'tope_destino' | 'tope_ip'; esperarSeg: number; mensaje: string }

/**
 * ¿Se puede mandar otro código ahora?
 * @param ultimo            cuándo se creó el último código para este destino (o null)
 * @param enviosDestinoHora códigos creados para este destino en la última hora
 * @param enviosIpHora      códigos pedidos desde esta conexión en la última hora
 * @param primeroDeLaHora   el más viejo de los de la última hora (para decir cuánto falta)
 */
export function permisoEnvio(
  { ultimo, enviosDestinoHora, enviosIpHora, primeroDeLaHora }: { ultimo: Date | null; enviosDestinoHora: number; enviosIpHora: number; primeroDeLaHora?: Date | null },
  ahora = new Date(),
): PermisoEnvio {
  if (enviosIpHora >= TOPE_IP_HORA) {
    return { ok: false, motivo: 'tope_ip', esperarSeg: 3600, mensaje: 'Se pidieron muchos códigos desde tu conexión. Probá de nuevo en una hora.' }
  }
  if (ultimo) {
    const falta = Math.ceil((ultimo.getTime() + CODIGO.reenvioSeg * 1000 - ahora.getTime()) / 1000)
    if (falta > 0) return { ok: false, motivo: 'espera', esperarSeg: falta, mensaje: `Esperá ${falta} segundos para pedir otro código` }
  }
  if (enviosDestinoHora >= CODIGO.maxEnviosHora) {
    const desde = primeroDeLaHora ? primeroDeLaHora.getTime() + 3600_000 - ahora.getTime() : 3600_000
    const min = Math.max(1, Math.ceil(desde / 60_000))
    return {
      ok: false,
      motivo: 'tope_destino',
      esperarSeg: Math.max(1, Math.ceil(desde / 1000)),
      mensaje: `Ya pediste ${CODIGO.maxEnviosHora} códigos en la última hora. Probá de nuevo en ${min} minuto${min === 1 ? '' : 's'}.`,
    }
  }
  return { ok: true }
}
