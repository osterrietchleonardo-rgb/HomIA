import { fail } from '@/lib/api'

// Cualquier /api/* que no existe responde 404 en JSON (y no el HTML de la app,
// que era lo que devolvía el catch-all de páginas con status 200).
const noExiste = () => fail('Esta ruta de la API no existe', 404)

export const GET = noExiste
export const POST = noExiste
export const PUT = noExiste
export const PATCH = noExiste
export const DELETE = noExiste
