'use client'
// La home estática (page.tsx) no monta la SPA: si alguien aterriza en '/' con un
// deep-link de hash (#/panel, #/directorio, …) lo redirigimos a la ruta real del
// catch-all para que AppRoot lo atienda. Sin hash, no hace nada.
import { useEffect } from 'react'

export function SpaRedirect() {
  useEffect(() => {
    const h = window.location.hash
    if (h && h.startsWith('#/')) {
      window.location.replace(h.slice(1)) // '#/panel/x' → '/panel/x'
    }
  }, [])
  return null
}
