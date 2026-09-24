// Recuperar contraseña: tokens de un solo uso que vencen en 1 hora.
// El token real (32 bytes aleatorios, base64url) viaja SOLO en el link del mail;
// en la base (`PasswordReset.tokenHash`) se guarda su sha256.
import { createHash, randomBytes } from 'node:crypto'

export const RESET_TTL_MS = 60 * 60 * 1000 // 1 hora
export const RESET_MAX_POR_HORA = 3 // pedidos por email (cuenta) por hora

export function nuevoTokenReset(): { token: string; tokenHash: string } {
  const token = randomBytes(32).toString('base64url')
  return { token, tokenHash: hashTokenReset(token) }
}

export function hashTokenReset(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export type EstadoToken = 'valido' | 'invalido' | 'usado' | 'vencido'

export const MENSAJE_TOKEN: Record<Exclude<EstadoToken, 'valido'>, string> = {
  invalido: 'Este link no es válido: pedí uno nuevo desde "¿Olvidaste tu contraseña?"',
  usado: 'Este link ya se usó: si necesitás cambiar la contraseña otra vez, pedí uno nuevo',
  vencido: 'El link venció: pedí uno nuevo (dura 1 hora)',
}

export function estadoToken(row: { usedAt: Date | null; expiresAt: Date } | null, ahora = new Date()): EstadoToken {
  if (!row) return 'invalido'
  if (row.usedAt) return 'usado'
  if (row.expiresAt.getTime() <= ahora.getTime()) return 'vencido'
  return 'valido'
}
