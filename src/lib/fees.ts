// Cargo de servicio HomIA — decisión del dueño (2026-09-24):
//   · lo paga el CLIENTE y se SUMA a su total;
//   · SOLO cuando paga con Mercado Pago (en efectivo no hay cargo);
//   · aplica a compras de materiales, facturas de proyecto y cobros de materiales del proveedor;
//   · el vendedor cobra el 100% de su precio: el cargo va a la cuenta de HomIA como
//     `marketplace_fee` de la preferencia de MP creada con el token del vendedor.
// Redondeo: 1% del subtotal, redondeado a 2 decimales.
// Archivo sin dependencias de servidor: lo usan la API y la UI.

export const SERVICE_FEE_RATE = 0.01
export const SERVICE_FEE_LABEL = 'Cargo de servicio HomIA (1%)'

export function round2(n: number): number {
  return Math.round(n * 100) / 100
}

/** Cargo de servicio para un subtotal (solo pagos por Mercado Pago). */
export function serviceFeeFor(subtotal: number): number {
  if (!Number.isFinite(subtotal) || subtotal <= 0) return 0
  return round2(subtotal * SERVICE_FEE_RATE)
}

/** Total que paga el cliente por Mercado Pago (subtotal + cargo). */
export function totalWithMp(subtotal: number): number {
  return round2(subtotal + serviceFeeFor(subtotal))
}
