import AppRoot from '@/components/app/app-root'
import { Landing } from '@/components/home/landing'

/**
 * Entrada única de HomIA (build de producción exige UNA ruta que matchee "/").
 *
 * - "/"            → landing pública (con SpaRedirect para deep-links #/...)
 * - "/cualquiera"  → SPA (AppRoot hace el redirect pathname → hash)
 *
 * La SPA navega por hash: #/panel/profesional, #/directorio, etc.
 */
export default function CatchAll() {
  return <AppRoot />
}
