// Loader para correr los tests de Homy con Node puro (type stripping, sin
// dependencias nuevas): resuelve el alias "@/..." → src/..., agrega la
// extensión .ts a imports sin extensión y reemplaza "server-only" por un módulo vacío.
// Uso: node --test --import ./scripts/homy-test-alias.mjs src/lib/homy/__tests__/*.test.ts
import { register } from 'node:module'

const hook = `
import { existsSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
const SRC = ${JSON.stringify(new URL('../src/', import.meta.url).href)}
function conExt(url) {
  const p = fileURLToPath(url)
  if (/\\.[cm]?[jt]sx?$/.test(p)) return url
  for (const ext of ['.ts', '.tsx', '/index.ts']) if (existsSync(p + ext)) return pathToFileURL(p + ext).href
  return url
}
export async function resolve(spec, ctx, next) {
  if (spec === 'server-only') return { url: 'data:text/javascript,export{}', shortCircuit: true }
  if (spec.startsWith('@/')) return { url: conExt(new URL(spec.slice(2), SRC).href), shortCircuit: true }
  if ((spec.startsWith('./') || spec.startsWith('../')) && ctx.parentURL?.startsWith('file:')) {
    return { url: conExt(new URL(spec, ctx.parentURL).href), shortCircuit: true }
  }
  return next(spec, ctx)
}
`
register('data:text/javascript,' + encodeURIComponent(hook), import.meta.url)
