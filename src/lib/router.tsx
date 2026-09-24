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

// ¿Está montada la SPA (AppRoot)? La marca AppRoot al renderizar. OJO: no se puede
// deducir de la URL: dentro de la SPA la dirección es '/#/panel/...' (pathname '/'),
// igual que en la home estática. Deducirlo del pathname hacía que cada clic dentro
// del panel recargara la página entera ("Verificando tu sesión…").
let spaMounted = false
export function markSpaMounted() { spaMounted = true }
// Al salir de la SPA hacia la home estática (logo o link a '/', navegación cliente de Next),
// AppRoot se desmonta: si la marca quedara en true, navigate() solo cambiaría el hash y la
// home seguiría en pantalla (bug real 24/09/2026: header → Directorio no hacía nada).
export function unmarkSpaMounted() { spaMounted = false }
export function isSpaMounted() { return spaMounted }

// Secciones de la home (#como-funciona, #motor-ia, #beneficios, #comunidad) desde el header o el
// footer. Si la sección está en pantalla, scroll. Si no (estamos en otra pantalla de la SPA), se
// vuelve a la home de la SPA y se hace scroll cuando aparece. Antes se cambiaba el hash a
// '#como-funciona' y la SPA lo leía como la ruta 'como-funciona' → "Esta página no existe"
// (bug del 24/09/2026). Con un panel/menú abierto se espera a que cierre (bloquea el scroll).
export function irASeccionHome(id: string) {
  if (typeof window === 'undefined') return
  const hayMenu = !!document.querySelector('[role="dialog"][data-state="open"]')
  const scrollA = (el: Element) => window.setTimeout(() => el.scrollIntoView({ behavior: 'smooth', block: 'start' }), hayMenu ? 350 : 0)
  const el = document.getElementById(id)
  if (el) { scrollA(el); return }
  if (!spaMounted) { window.location.assign(`/#${id}`); return }
  navigate('/')
  let intentos = 0
  const t = window.setInterval(() => {
    const e = document.getElementById(id)
    if (e) { window.clearInterval(t); scrollA(e) } else if (++intentos > 50) window.clearInterval(t)
  }, 100)
}

export function navigate(to: string, opts?: { replace?: boolean }) {
  // En la home estática (page.tsx, sin AppRoot) no hay nadie escuchando el hash:
  // cambiarlo dejaría la URL en la ruta nueva con la home en pantalla. Ahí se hace
  // una navegación real al catch-all, que arranca la SPA y convierte pathname → hash.
  if (typeof window !== 'undefined' && !spaMounted) {
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
