// Reglas y plazos de compras y reservas de materiales (D15, 24/09/2026 — Leonardo):
// "Las compras no necesitan aprobación del proveedor: son directas al pago, siempre y
// cuando haya stock. Las aprobaciones son para las reservas de productos, con o sin stock."
//
//   · COMPRA (solo con stock suficiente de TODOS sus ítems): nace lista para pagar
//     (estado `aprobado` = "por pagar"), con el stock reservado y el cobro emitido.
//     Plazo: 24 h para pagar por Mercado Pago o elegir efectivo; con efectivo acordado,
//     7 días desde la compra para retirar y pagar. Si no, se cancela sola y libera el stock.
//   · RESERVA (con o sin stock): la aprueba el proveedor. Con stock → reserva y 48 h para
//     pagar/retirar. Sin stock → queda `esperando_stock` con fecha aproximada; cuando el
//     proveedor la marca "disponible" se reserva el stock y arrancan las 48 h.
// Archivo sin dependencias de servidor: lo usan la API y la UI.

export const HOUR_MS = 60 * 60 * 1000
export const COMPRA_PAGO_MS = 24 * HOUR_MS
export const COMPRA_EFECTIVO_MS = 7 * 24 * HOUR_MS
export const RESERVA_MS = 48 * HOUR_MS

export type OrderLineMode = 'compra' | 'reserva'

/** "jue 25 sep, 16:05" en hora de Argentina (el server de Vercel corre en UTC). */
export function fmtDeadline(d: Date | string): string {
  return new Date(d).toLocaleString('es-AR', {
    weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
    timeZone: 'America/Argentina/Buenos_Aires',
  })
}

/** "25 de sep." en hora de Argentina. */
export function fmtDay(d: Date | string): string {
  return new Date(d).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', timeZone: 'America/Argentina/Buenos_Aires' })
}
