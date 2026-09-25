import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'
import { prefijoAnual, ultimoNumero, formatearNumero } from '@/lib/numeracion'

/**
 * Crea un ProviderCharge con número secuencial PRV-<año>-<n>.
 * El número sale del mayor número del año + 1 (`numeracion.ts`; con count() un borrado hacía chocar
 * todos los intentos); si dos cobros simultáneos chocan con el @unique → se reintenta con el
 * siguiente (nunca un 500 mudo).
 * Devuelve null si no se pudo numerar tras varios intentos.
 */
export async function createWithChargeNumber<T>(create: (number: string) => Promise<T>): Promise<T | null> {
  const prefijo = prefijoAnual('PRV')
  for (let attempt = 0; attempt < 6; attempt++) {
    const ultimo = await ultimoNumero((a) => db.providerCharge.findFirst(a), prefijo)
    const number = formatearNumero(prefijo, ultimo + 1 + attempt)
    try {
      return await create(number)
    } catch (e) {
      const clash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
      if (!clash) throw e
    }
  }
  return null
}
