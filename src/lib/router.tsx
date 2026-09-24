'use client'
// Router SPA de HomIA — navegación por hash (deep-links confiables en cualquier entorno)
// Ej: #/ , #/buscar?q=plomero , #/registrarse?rol=profesional , #/panel/profesional/crm
import { useState, useEffect, useCallback, createContext, useContext } from 'react'

export type RouteState = {
  path: string
  segments: string[]
  query: Record<string, string>
  raw: string
}

function parseHash(): RouteState {
  const raw = typeof window === 'undefined' ? '' : window.location.hash.replace(/^#/, '') || '/'
  const [pathPart, queryPart] = raw.split('?')
  const path = pathPart || '/'
  const segments = path.split('/').filter(Boolean)
  const query: Record<string, string> = {}
  if (queryPart) {
    for (const pair of queryPart.split('&')) {
      const [k, v] = pair.split('=')
      if (k) query[decodeURIComponent(k)] = decodeURIComponent(v || '')
    }
  }
  return { path, segments, query, raw }
}

export function navigate(to: string, opts?: { replace?: boolean }) {
  // En la home estática (pathname '/') la SPA no está montada: setear el hash
  // cambia la URL pero NO re-renderiza nada (no hay AppRoot escuchando).
  // Navegación real al catch-all ([[...slug]]), que arranca la SPA y hace el
  // redirect pathname→hash. Aplica a CTAs del header/footer/hero de la home.
  // (La SPA nunca corre con pathname '/': esa ruta es de page.tsx.)
  // Aunque la URL ya tenga un #…, en '/' no hay SPA escuchando: si solo se cambiara
  // el hash, la URL mostraría la ruta nueva y la pantalla quedaría igual.
  if (typeof window !== 'undefined' && window.location.pathname === '/') {
    const dest = to.startsWith('/') ? to : `/${to}`
    if (opts?.replace) window.location.replace(dest)
    else window.location.assign(dest)
    return
  }
  const target = `#${to.startsWith('/') ? to : `/${to}`}`
  if (opts?.replace) {
    window.history.replaceState(null, '', `/${target}`)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    if (typeof window !== 'undefined' && window.location.pathname !== '/') {
      window.history.pushState(null, '', `/${target}`)
      window.dispatchEvent(new HashChangeEvent('hashchange'))
    } else {
      window.location.hash = target
    }
  }
  // App-shell: el panel scrollea dentro de #homy-app-main, no en la ventana.
  // Toda navegación arranca desde arriba en ambos contenedores.
  resetAppScroll()
}

// App-shell layout: la ventana queda enmarcada (topbar/sidebar/título fijos) y
// solo el contenido interno scrollea. Al navegar se resetean AMBOS contenedores:
// la ventana (páginas públicas) y el main del panel (#homy-app-main).
export function resetAppScroll() {
  window.scrollTo({ top: 0 })
  const main = typeof document !== 'undefined' ? document.getElementById('homy-app-main') : null
  if (main) main.scrollTop = 0
}

export function useRoute(): RouteState {
  const [route, setRoute] = useState<RouteState>(() => parseHash())
  useEffect(() => {
    const onChange = () => setRoute(parseHash())
    window.addEventListener('hashchange', onChange)
    window.addEventListener('popstate', onChange)
    return () => {
      window.removeEventListener('hashchange', onChange)
      window.removeEventListener('popstate', onChange)
    }
  }, [])
  return route
}

export function useNavigate() {
  return useCallback((to: string, opts?: { replace?: boolean }) => navigate(to, opts), [])
}

// Link con scroll-to-top automático; acepta props de <a> (data-*, aria-*, id…)
export function Link({
  to,
  children,
  className,
  onClick,
  ...rest
}: {
  to: string
  children: React.ReactNode
  className?: string
  onClick?: () => void
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'onClick'>) {
  return (
    <a
      href={`#${to.startsWith('/') ? to : `/${to}`}`}
      className={className}
      onClick={(e) => {
        onClick?.()
        resetAppScroll()
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

export function scrollTop() {
  resetAppScroll()
}
