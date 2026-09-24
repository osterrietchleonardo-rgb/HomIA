// Paso de cantidad según la unidad de venta del catálogo. Las unidades que se
// venden por pieza (unidad, bolsa, caja, rollo…) van de a 1; las continuas
// (metro, m2, m3, kg, litro) admiten medios. Lo usan la API (validación del
// carrito y del pedido) y la UI (inputs de cantidad): una sola regla.
const CONTINUAS = new Set(['metro', 'm2', 'm3', 'kg', 'litro'])

export function qtyStepFor(unit: string | null | undefined): number {
  const u = (unit || 'unidad').toLowerCase().trim()
  return CONTINUAS.has(u) ? 0.5 : 1
}

/** ¿La cantidad respeta el paso de la unidad? (tolerancia para flotantes) */
export function qtyMatchesStep(qty: number, unit: string | null | undefined): boolean {
  if (!Number.isFinite(qty) || qty <= 0) return false
  const step = qtyStepFor(unit)
  const n = qty / step
  return Math.abs(n - Math.round(n)) < 1e-9
}
