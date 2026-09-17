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
  const target = `#${to.startsWith('/') ? to : `/${to}`}`
  if (opts?.replace) {
    window.history.replaceState(null, '', target)
    window.dispatchEvent(new HashChangeEvent('hashchange'))
  } else {
    window.location.hash = target
  }
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

// Link con scroll-to-top automático
export function Link({
  to,
  children,
  className,
  onClick,
}: {
  to: string
  children: React.ReactNode
  className?: string
  onClick?: () => void
}) {
  return (
    <a
      href={`#${to.startsWith('/') ? to : `/${to}`}`}
      className={className}
      onClick={(e) => {
        onClick?.()
        window.scrollTo({ top: 0 })
      }}
    >
      {children}
    </a>
  )
}

export function scrollTop() {
  window.scrollTo({ top: 0, behavior: 'smooth' })
}
