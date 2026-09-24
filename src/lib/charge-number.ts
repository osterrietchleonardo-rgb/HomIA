import { Prisma } from '@prisma/client'
import { db } from '@/lib/db'

/**
 * Crea un ProviderCharge con número secuencial PRV-<año>-<n>.
 * El número sale de count()+1: si hubo borrados o dos cobros simultáneos puede
 * chocar con el @unique → se reintenta con el siguiente (nunca un 500 mudo).
 * Devuelve null si no se pudo numerar tras varios intentos.
 */
export async function createWithChargeNumber<T>(create: (number: string) => Promise<T>): Promise<T | null> {
  const year = new Date().getFullYear()
  for (let attempt = 0; attempt < 6; attempt++) {
    const count = await db.providerCharge.count()
    const number = `PRV-${year}-${String(count + 1 + attempt).padStart(6, '0')}`
    try {
      return await create(number)
    } catch (e) {
      const clash = e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002'
      if (!clash) throw e
    }
  }
  return null
}
