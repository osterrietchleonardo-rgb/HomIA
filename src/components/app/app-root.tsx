'use client'
// AppRoot HomIA — router SPA por hash con todas las pantallas
import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRoute, navigate, Link } from '@/lib/router'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { Loading } from '@/components/app/ui-bits'
import { BackdropFX } from '@/components/app/backdrop-fx'
import { Toaster } from '@/components/ui/sonner'
import {
  ArrowLeft, ArrowRight, BadgeCheck, Boxes, Compass, CornerDownRight,
  HardHat, ShieldCheck, Sparkles, User,
} from 'lucide-react'

// Pantallas públicas
const HomeScreen = dynamic(() => import('@/components/screens/home-screen'), { ssr: false, loading: () => <Loading /> })
const SearchScreen = dynamic(() => import('@/components/screens/search-screen'), { ssr: false, loading: () => <Loading /> })
const LoginScreen = dynamic(() => import('@/components/screens/auth-login'), { ssr: false, loading: () => <Loading /> })
const RegisterScreen = dynamic(() => import('@/components/screens/auth-register'), { ssr: false, loading: () => <Loading /> })
const JobDetailScreen = dynamic(() => import('@/components/screens/job-detail'), { ssr: false, loading: () => <Loading /> })
const ProProfileScreen = dynamic(() => import('@/components/screens/pro-profile'), { ssr: false, loading: () => <Loading /> })
const ProviderProfileScreen = dynamic(() => import('@/components/screens/provider-profile'), { ssr: false, loading: () => <Loading /> })
const NotificationsScreen = dynamic(() => import('@/components/screens/notifications'), { ssr: false, loading: () => <Loading /> })
const DirectoryScreen = dynamic(() => import('@/components/screens/directory-screen'), { ssr: false, loading: () => <Loading /> })
const MessagesScreen = dynamic(() => import('@/components/screens/messages-screen'), { ssr: false, loading: () => <Loading /> })

// Panel cliente
const ClientDashboard = dynamic(() => import('@/components/screens/panel/cliente/dashboard'), { ssr: false, loading: () => <Loading /> })
const PublishJob = dynamic(() => import('@/components/screens/panel/cliente/publicar'), { ssr: false, loading: () => <Loading /> })
const MyJobs = dynamic(() => import('@/components/screens/panel/cliente/trabajos'), { ssr: false, loading: () => <Loading /> })
const ClientProjects = dynamic(() => import('@/components/screens/panel/cliente/proyectos'), { ssr: false, loading: () => <Loading /> })
const ClientProjectDetail = dynamic(() => import('@/components/screens/panel/cliente/proyecto-detalle'), { ssr: false, loading: () => <Loading /> })
const ClientInvoices = dynamic(() => import('@/components/screens/panel/cliente/facturas'), { ssr: false, loading: () => <Loading /> })
const ClientProfile = dynamic(() => import('@/components/screens/panel/cliente/perfil'), { ssr: false, loading: () => <Loading /> })

// Panel profesional
const ProDashboard = dynamic(() => import('@/components/screens/panel/profesional/dashboard'), { ssr: false, loading: () => <Loading /> })
const ProJobsBoard = dynamic(() => import('@/components/screens/panel/profesional/bolsa'), { ssr: false, loading: () => <Loading /> })
const ProMaterials = dynamic(() => import('@/components/screens/panel/profesional/materiales'), { ssr: false, loading: () => <Loading /> })
const ProProjects = dynamic(() => import('@/components/screens/panel/profesional/proyectos'), { ssr: false, loading: () => <Loading /> })
const ProProjectDetail = dynamic(() => import('@/components/screens/panel/profesional/proyecto-detalle'), { ssr: false, loading: () => <Loading /> })
const ProBids = dynamic(() => import('@/components/screens/panel/profesional/presupuestos'), { ssr: false, loading: () => <Loading /> })
const ProCRM = dynamic(() => import('@/components/screens/panel/profesional/crm'), { ssr: false, loading: () => <Loading /> })
const ProWorks = dynamic(() => import('@/components/screens/panel/profesional/obras'), { ssr: false, loading: () => <Loading /> })
const ProLinks = dynamic(() => import('@/components/screens/panel/profesional/vinculaciones'), { ssr: false, loading: () => <Loading /> })
const ProProfileEdit = dynamic(() => import('@/components/screens/panel/profesional/perfil'), { ssr: false, loading: () => <Loading /> })

// Panel proveedor
const ProviderDashboard = dynamic(() => import('@/components/screens/panel/proveedor/dashboard'), { ssr: false, loading: () => <Loading /> })
const ProviderStock = dynamic(() => import('@/components/screens/panel/proveedor/stock'), { ssr: false, loading: () => <Loading /> })
const ProviderCRM = dynamic(() => import('@/components/screens/panel/proveedor/crm'), { ssr: false, loading: () => <Loading /> })
const ProviderLinks = dynamic(() => import('@/components/screens/panel/proveedor/vinculaciones'), { ssr: false, loading: () => <Loading /> })
const ProviderProfileEdit = dynamic(() => import('@/components/screens/panel/proveedor/perfil'), { ssr: false, loading: () => <Loading /> })

// Común a los 3 roles: verificación de identidad por DNI + IA
const VerificationScreen = dynamic(() => import('@/components/screens/panel/verificacion').then((m) => m.default), { ssr: false, loading: () => <Loading /> })

const PanelLayout = dynamic(() => import('@/components/screens/panel/panel-layout'), { ssr: false, loading: () => <Loading /> })

export default function AppRoot() {
  const route = useRoute()
  const { user, loading, refresh } = useSession()
  const location = useLocation()

  useEffect(() => {
    refresh()
  }, [refresh])

  // URLs directas (/registrarse, /panel/...) → hash (#/registrarse) para que el
  // router SPA las entienda: cubre links compartidos, refresh y URLs tipeadas.
  useEffect(() => {
    const p = window.location.pathname
    if (p && p !== '/' && !window.location.hash) {
      navigate(`${p}${window.location.search || ''}`, { replace: true })
    }
  }, [])

  // Pide ubicación en primera navegación a buscar/mapa (permiso explícito)
  useEffect(() => {
    if (!route.path.startsWith('/buscar')) return
    if (location.shared || location.requesting) return
    const saved = localStorage.getItem('homy_geo_denied')
    if (saved === '1') return
    location.request().then((ok) => {
      if (!ok) localStorage.setItem('homy_geo_denied', '1')
      else if (user) syncLocationToServer(location.lat!, location.lng!, location.radiusKm)
    })
     
  }, [route.path])

  const s = route.segments

  let screen: React.ReactNode
  // Con sesión activa el header del panel prevalece: buscar, detalle de trabajo,
  // perfiles públicos y notificaciones viven DENTRO del panel (no te saca de tu contexto).
  // Si la sesión se está verificando (sin usuario cacheado) se muestra el gate del panel
  // para evitar el flash de shell público antes de entrar al panel.
  const inPanel = !!user
  const withPanel = (node: React.ReactNode) => (
    <div className="homy-embedded"><PanelLayout route={route}>{node}</PanelLayout></div>
  )
  const sessionGated = ['buscar', 'trabajo', 'profesional', 'proveedor', 'notificaciones', 'mensajes'].includes(s[0] || '')
  const publicOrPanel = (pub: React.ReactNode, emb: React.ReactNode) => {
    if (inPanel) return withPanel(emb)
    if (loading && sessionGated) return <Loading text="Verificando tu sesión…" />
    return pub
  }
  if (s.length === 0) screen = <HomeScreen />
  else if (s[0] === 'buscar') screen = publicOrPanel(<SearchScreen />, <SearchScreen embedded />)
  else if (s[0] === 'ingresar') screen = <LoginScreen />
  else if (s[0] === 'registrarse') screen = <RegisterScreen />
  else if (s[0] === 'trabajo' && s[1]) screen = publicOrPanel(<JobDetailScreen id={s[1]} />, <JobDetailScreen id={s[1]} />)
  else if (s[0] === 'profesional' && s[1]) screen = publicOrPanel(<ProProfileScreen id={s[1]} />, <ProProfileScreen id={s[1]} />)
  else if (s[0] === 'proveedor' && s[1]) screen = publicOrPanel(<ProviderProfileScreen id={s[1]} />, <ProviderProfileScreen id={s[1]} />)
  else if (s[0] === 'notificaciones') screen = publicOrPanel(<NotificationsScreen />, <NotificationsScreen />)
  else if (s[0] === 'directorio') screen = publicOrPanel(<DirectoryScreen />, <DirectoryScreen embedded />)
  else if (s[0] === 'mensajes') screen = publicOrPanel(<AuthGate path="/mensajes" />, <MessagesScreen embedded />)
  else if (s[0] === 'panel') {
    if (loading) screen = <Loading text="Verificando tu sesión…" />
    else if (!user) {
      screen = <AuthGate path={route.path} />
    } else {
      screen = <PanelLayout route={route}>{panelScreen(route)}</PanelLayout>
    }
  } else {
    screen = <NotFound />
  }

  return (
    <>
      {/* Z-order sagrado: ambiente z-0 → app z-10 → modales/paneles z-50 */}
      <BackdropFX />
      <div className="homy-screen relative z-10">{screen}</div>
      <Toaster position="top-center" richColors />
    </>
  )
}

function panelScreen(route: ReturnType<typeof useRoute>) {
  const s = route.segments
  const role = s[1]
  const page = s[2] || ''
  const sub = s[3]

  // pantallas comunes a todos los roles (rutas embebidas en el panel)
  if (page === 'directorio') return <DirectoryScreen embedded />
  if (page === 'mensajes') return <MessagesScreen embedded />
  if (page === 'verificacion') return <VerificationScreen />

  if (role === 'cliente') {
    if (page === '' ) return <ClientDashboard />
    if (page === 'publicar') return <PublishJob />
    if (page === 'trabajos') return <MyJobs />
    if (page === 'proyectos' && sub) return <ClientProjectDetail id={sub} />
    if (page === 'proyectos') return <ClientProjects />
    if (page === 'facturas') return <ClientInvoices />
    if (page === 'perfil') return <ClientProfile />
    return <ClientDashboard />
  }
  if (role === 'profesional') {
    if (page === '') return <ProDashboard />
    if (page === 'bolsa') return <ProJobsBoard />
    if (page === 'materiales') return <ProMaterials />
    if (page === 'proyectos' && sub) return <ProProjectDetail id={sub} />
    if (page === 'proyectos') return <ProProjects />
    if (page === 'presupuestos') return <ProBids />
    if (page === 'crm') return <ProCRM />
    if (page === 'obras') return <ProWorks />
    if (page === 'vinculaciones') return <ProLinks />
    if (page === 'perfil') return <ProProfileEdit />
    return <ProDashboard />
  }
  if (role === 'proveedor') {
    if (page === '') return <ProviderDashboard />
    if (page === 'stock') return <ProviderStock />
    if (page === 'crm') return <ProviderCRM />
    if (page === 'vinculaciones') return <ProviderLinks />
    if (page === 'perfil') return <ProviderProfileEdit />
    return <ProviderDashboard />
  }
  return <RolePicker />
}

// Metadatos visuales por rol (icono + tono de chip + microcopy)
const ROLE_META: Record<string, { icon: typeof User; tone: string; desc: string }> = {
  cliente: { icon: User, tone: 'homy-chip-blue', desc: 'Seguí tus trabajos, presupuestos y pagos.' },
  profesional: { icon: HardHat, tone: 'homy-chip-orange', desc: 'Gestioná ofertas, clientes y obras.' },
  proveedor: { icon: Boxes, tone: 'homy-chip-ai', desc: 'Administrá tu stock, precios y ventas.' },
}

function RolePicker() {
  const { user } = useSession()
  return (
    <div className="mx-auto max-w-lg px-4 py-14 text-center sm:py-20">
      <p className="homy-eyebrow">Tu ecosistema</p>
      <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-navy sm:text-4xl">¿Con qué perfil querés entrar?</h1>
      <p className="mx-auto mt-2.5 max-w-sm text-[15px] leading-relaxed text-slate-500">Podés tener varios perfiles con la misma cuenta.</p>
      <div className="homy-stagger mt-8 grid gap-3.5 text-left">
        {user?.roles.map((r) => {
          const meta = ROLE_META[r] ?? { icon: User, tone: 'homy-chip-navy', desc: 'Entrá a tu panel.' }
          return (
            <Link
              key={r} to={`/panel/${r}`}
              className="homy-glass homy-lift homy-card-glow group flex items-center gap-4 rounded-2xl p-4 sm:p-5"
            >
              <span className={`homy-icon-chip size-12 shrink-0 ${meta.tone}`}>
                <meta.icon className="size-6" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-lg font-extrabold capitalize tracking-tight text-navy">{r}</span>
                <span className="mt-0.5 block text-[13.5px] leading-snug text-slate-500">{meta.desc}</span>
              </span>
              <ArrowRight className="ml-auto size-5 shrink-0 text-slate-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-[#1D63B8]" aria-hidden />
            </Link>
          )
        })}
      </div>
    </div>
  )
}

function AuthGate({ path }: { path: string }) {
  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4 py-16">
      <div className="homy-glass relative w-full max-w-md overflow-hidden rounded-3xl">
        {/* Decoración de ambiente (sin interacción, fuera del árbol accesible) */}
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-24 right-[-12%] size-60 rounded-full bg-ai/15 blur-3xl" />
          <div className="absolute -bottom-28 left-[-12%] size-60 rounded-full bg-action/10 blur-3xl" />
        </div>
        <div className="homy-stagger relative z-10 p-7 text-center sm:p-9">
          <span className="homy-icon-chip homy-chip-blue mx-auto size-14">
            <ShieldCheck className="size-7" aria-hidden />
          </span>
          <p className="homy-eyebrow mt-5">Acceso requerido</p>
          <h2 className="mt-2 text-2xl font-extrabold tracking-tight text-navy sm:text-[1.7rem]">Creá tu cuenta para seguir</h2>
          <p className="mx-auto mt-2.5 max-w-sm text-sm leading-relaxed text-slate-500">
            Buscar es gratis y libre. Para ver datos de contacto, abrir tarjetas y operar necesitás una cuenta (tarda menos de 1 minuto).
          </p>
          <div className="mt-4 flex justify-center">
            <span className="homy-pill max-w-full">
              <CornerDownRight className="size-3.5 shrink-0 text-[#1D63B8]" aria-hidden />
              <span className="truncate font-mono text-[11px] font-semibold text-slate-600">{path}</span>
            </span>
          </div>
          <div className="mt-6 flex flex-col gap-2.5">
            <button
              onClick={() => navigate(`/registrarse?volver=${encodeURIComponent(path)}`)}
              className="homy-btn-primary w-full px-6 py-3.5 text-[15px]"
            >
              Crear cuenta gratis
            </button>
            <button
              onClick={() => navigate(`/ingresar?volver=${encodeURIComponent(path)}`)}
              className="homy-btn-dark w-full px-6 py-3.5 text-[15px]"
            >
              Ya tengo cuenta
            </button>
          </div>
          <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[11px] font-bold text-slate-400" aria-label="Confianza HomIA">
            <li className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-[#1D63B8]" aria-hidden />Escrow</li>
            <li className="flex items-center gap-1.5"><BadgeCheck className="size-3.5 text-[#0e9f6e]" aria-hidden />Verificación</li>
            <li className="flex items-center gap-1.5"><Sparkles className="size-3.5 text-[#0092c4]" aria-hidden />IA</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 py-16 text-center">
      <div className="homy-glass relative w-full max-w-md overflow-hidden rounded-3xl px-8 py-10 sm:px-12">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-20 left-1/2 size-56 -translate-x-1/2 rounded-full bg-ai/12 blur-3xl" />
        </div>
        <div className="homy-stagger relative z-10">
          <span className="homy-empty-icon homy-chip-navy mx-auto">
            <Compass className="size-7" aria-hidden />
          </span>
          <p className="homy-eyebrow">Error 404</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-navy sm:text-[1.7rem]">Esta página no existe</h1>
          <p className="mx-auto mt-2 max-w-xs text-[15px] leading-relaxed text-slate-500">El enlace se rompió o la página se movió.</p>
          <button onClick={() => navigate('/')} className="homy-btn-dark mt-7 px-6 py-3.5 text-[15px]">
            <ArrowLeft className="size-4.5" aria-hidden />
            Volver al inicio
          </button>
        </div>
      </div>
    </div>
  )
}
