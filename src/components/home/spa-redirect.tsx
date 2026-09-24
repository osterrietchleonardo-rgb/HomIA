'use client'
// La home estática (page.tsx) no monta la SPA: si en '/' aparece un deep-link de hash
// (#/panel, #/directorio, …) lo mandamos a la ruta real del catch-all para que AppRoot
// lo atienda. Pasa al cargar la página Y cuando cambia solo el hash sin recargar: la
// persona pega o tipea somoshomia.com/#/directorio estando en la home, o toca un link
// "#/…" que nadie interceptó. Antes solo se miraba al montar y la home quedaba en
// pantalla con la URL nueva (bug reportado el 24/09/2026).
// Cuando AppRoot está montado (la SPA dibuja su propia home) no hace nada.
import { useEffect } from 'react'
import { isSpaMounted } from '@/lib/router'

export function SpaRedirect() {
  useEffect(() => {
    const go = () => {
      if (isSpaMounted()) return
      const h = window.location.hash
      if (h && h.startsWith('#/')) window.location.replace(h.slice(1)) // '#/panel/x' → '/panel/x'
    }
    go()
    window.addEventListener('hashchange', go)
    return () => window.removeEventListener('hashchange', go)
  }, [])
  return null
}
