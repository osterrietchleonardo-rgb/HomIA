/**
 * Numeración secuencial por año (PED-AAAA-NNNNNN, PRV-…, HOM-…).
 *
 * El siguiente número sale del MAYOR número ya usado ese año, no de contar filas: con count() un
 * borrado (baja de cuenta, purga de datos de prueba en la base única) dejaba el conteo por debajo
 * del último número y cada intento chocaba con el @unique → 503 "No pudimos numerar". Los números
 * van con ceros a la izquierda, así que el orden alfabético descendente da el mayor.
 */
export type BuscarUltimo = (args: {
  where: { number: { startsWith: string } }
  orderBy: { number: 'desc' }
  select: { number: true }
}) => Promise<{ number: string } | null>

/** Prefijo del año: `PED-2026-`. */
export function prefijoAnual(serie: string, fecha = new Date()): string {
  return `${serie}-${fecha.getFullYear()}-`
}

/** Número entero del último comprobante de ese prefijo (0 si no hay ninguno o no se entiende). */
export async function ultimoNumero(buscar: BuscarUltimo, prefijo: string): Promise<number> {
  const ultimo = await buscar({ where: { number: { startsWith: prefijo } }, orderBy: { number: 'desc' }, select: { number: true } })
  const n = ultimo ? Number.parseInt(ultimo.number.slice(prefijo.length), 10) : 0
  return Number.isFinite(n) && n > 0 ? n : 0
}

/** `PED-2026-000042` */
export function formatearNumero(prefijo: string, n: number): string {
  return `${prefijo}${String(n).padStart(6, '0')}`
}
