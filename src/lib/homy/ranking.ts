// Ranking determinista de Homy (lo decide el código, nunca el modelo).
// Proveedores:    verificado > reseñas (promedio bayesiano) > precio > distancia; PRO activo desempata.
// Profesionales:  verificado > reseñas (bayesiano) > obras/experiencia > distancia.

/** Promedio bayesiano: 1 reseña de 5★ no le gana a 40 reseñas de 4,8★. */
export function puntajeBayesiano(rating: number, cantidad: number, prior = 4, peso = 3): number {
  const n = Math.max(0, cantidad || 0)
  const r = n > 0 ? Math.max(0, Math.min(5, rating || 0)) : 0
  return Math.round(((prior * peso + r * n) / (peso + n)) * 100) / 100
}

export type CandidatoOferta = {
  verificado: boolean
  rating: number
  resenas: number
  precio: number
  distanciaKm: number | null
  recomendado: boolean
}

export function compararOfertas(a: CandidatoOferta, b: CandidatoOferta): number {
  if (a.verificado !== b.verificado) return a.verificado ? -1 : 1
  const ba = puntajeBayesiano(a.rating, a.resenas)
  const bb = puntajeBayesiano(b.rating, b.resenas)
  if (ba !== bb) return bb - ba
  if (a.precio !== b.precio) return a.precio - b.precio
  const da = a.distanciaKm ?? Number.POSITIVE_INFINITY
  const db = b.distanciaKm ?? Number.POSITIVE_INFINITY
  if (da !== db) return da - db
  if (a.recomendado !== b.recomendado) return a.recomendado ? -1 : 1
  return 0
}

export type CandidatoProfesional = {
  verificado: boolean
  rating: number
  resenas: number
  obras: number
  experiencia: number
  distanciaKm: number | null
}

export function compararProfesionales(a: CandidatoProfesional, b: CandidatoProfesional): number {
  if (a.verificado !== b.verificado) return a.verificado ? -1 : 1
  const ba = puntajeBayesiano(a.rating, a.resenas)
  const bb = puntajeBayesiano(b.rating, b.resenas)
  if (ba !== bb) return bb - ba
  if (a.obras !== b.obras) return b.obras - a.obras
  if (a.experiencia !== b.experiencia) return b.experiencia - a.experiencia
  const da = a.distanciaKm ?? Number.POSITIVE_INFINITY
  const db = b.distanciaKm ?? Number.POSITIVE_INFINITY
  return da - db
}
