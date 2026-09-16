'use client'
// AppRoot HomIA — router SPA por hash con todas las pantallas
import { useEffect } from 'react'
import dynamic from 'next/dynamic'
import { useRoute, navigate, Link } from '@/lib/router'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { Loading } from '@/components/app/ui-bits'
import { BackdropFX } from '@/components/app/backdrop-fx'
import { Toaster } from '@/components/ui/sonner'

// Pantallas públicas
const HomeScreen = dynamic(() => import('@/components/screens/home-screen'), { ssr: false, loading: () => <Loading /> })
const SearchScreen = dynamic(() => import('@/components/screens/search-screen'), { ssr: false, loading: () => <Loading /> })
const LoginScreen = dynamic(() => import('@/components/screens/auth-login'), { ssr: false, loading: () => <Loading /> })
const RegisterScreen = dynamic(() => import('@/components/screens/auth-register'), { ssr: false, loading: () => <Loading /> })
const JobDetailScreen = dynamic(() => import('@/components/screens/job-detail'), { ssr: false, loading: () => <Loading /> })
const ProProfileScreen = dynamic(() => import('@/components/screens/pro-profile'), { ssr: false, loading: () => <Loading /> })
const ProviderProfileScreen = dynamic(() => import('@/components/screens/provider-profile'), { ssr: false, loading: () => <Loading /> })
const NotificationsScreen = dynamic(() => import('@/components/screens/notifications'), { ssr: false, loading: () => <Loading /> })

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
  if (s.length === 0) screen = <HomeScreen />
  else if (s[0] === 'buscar') screen = <SearchScreen />
  else if (s[0] === 'ingresar') screen = <LoginScreen />
  else if (s[0] === 'registrarse') screen = <RegisterScreen />
  else if (s[0] === 'trabajo' && s[1]) screen = <JobDetailScreen id={s[1]} />
  else if (s[0] === 'profesional' && s[1]) screen = <ProProfileScreen id={s[1]} />
  else if (s[0] === 'proveedor' && s[1]) screen = <ProviderProfileScreen id={s[1]} />
  else if (s[0] === 'notificaciones') screen = <NotificationsScreen />
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

function RolePicker() {
  const { user } = useSession()
  return (
    <div className="max-w-md mx-auto py-16 px-4 text-center">
      <h1 className="text-2xl font-extrabold text-[#0A2540]">¿Con qué perfil querés entrar?</h1>
      <p className="text-sm text-slate-500 mt-2">Podés tener varios perfiles con la misma cuenta.</p>
      <div className="grid gap-3 mt-6">
        {user?.roles.map((r) => (
          <Link key={r} to={`/panel/${r}`} className="homy-glass homy-lift rounded-2xl p-4 font-bold text-[#0A2540] capitalize">
            {r} →
          </Link>
        ))}
      </div>
    </div>
  )
}

function AuthGate({ path }: { path: string }) {
  return (
    <div className="min-h-[70vh] flex items-center justify-center px-4">
      <div className="homy-glass max-w-md w-full rounded-3xl p-8 text-center">
        <div className="text-4xl mb-2">🔒</div>
        <h2 className="text-xl font-extrabold text-[#0A2540]">Creá tu cuenta para seguir</h2>
        <p className="text-sm text-slate-500 mt-2">
          Buscar es gratis y libre. Para ver datos de contacto, abrir tarjetas y operar necesitás una cuenta (tarda menos de 1 minuto).
        </p>
        <div className="flex flex-col gap-2 mt-6">
          <button
            onClick={() => navigate(`/registrarse?volver=${encodeURIComponent(path)}`)}
            className="w-full rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white font-bold py-3 transition"
          >
            Crear cuenta
          </button>
          <button
            onClick={() => navigate(`/ingresar?volver=${encodeURIComponent(path)}`)}
            className="w-full rounded-xl border border-slate-300 hover:border-[#1D63B8] text-[#0A2540] font-bold py-3 transition"
          >
            Ya tengo cuenta
          </button>
        </div>
      </div>
    </div>
  )
}

function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="homy-glass rounded-3xl px-10 py-8">
        <div className="text-6xl mb-4">🧩</div>
        <h1 className="text-2xl font-extrabold text-[#0A2540]">Esta página no existe</h1>
        <p className="text-slate-500 mt-2">El enlace se rompió o la página se movió.</p>
        <button onClick={() => navigate('/')} className="mt-6 rounded-xl bg-[#0A2540] text-white font-bold px-6 py-3 hover:bg-[#123455] transition">
          Volver al inicio
        </button>
      </div>
    </div>
  )
}
