'use client'
// AppRoot HomIA — router SPA por hash con todas las pantallas
import { useEffect, useRef } from 'react'
import dynamic from 'next/dynamic'
import { useRoute, navigate, Link, markSpaMounted, unmarkSpaMounted } from '@/lib/router'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { useCartSync } from '@/lib/cart'
import { Loading } from '@/components/app/ui-bits'
import { BackdropFX } from '@/components/app/backdrop-fx'
import { SiteHeader } from '@/components/home/site-header'
import { SiteFooter } from '@/components/home/site-footer'
import { Toaster } from '@/components/ui/sonner'
import TourOverlay from '@/components/help/tour-overlay'
import HelpDock from '@/components/help/help-dock'
import VideoModal from '@/components/help/video-modal'
import AnalyticsTracker from '@/components/app/analytics-tracker'
import { rutaAdminNueva } from '@/lib/admin-rutas'
import { PlanInactivoAviso } from '@/components/screens/panel/proveedor/plan-aviso'
import {
  ArrowLeft, ArrowRight, BadgeCheck, Boxes, Compass, CornerDownRight,
  HardHat, ShieldCheck, Sparkles, User,
} from 'lucide-react'

// Pantallas públicas
const HomeScreen = dynamic(() => import('@/components/screens/home-screen'), { ssr: false, loading: () => <Loading /> })
const SearchScreen = dynamic(() => import('@/components/screens/search-screen'), { ssr: false, loading: () => <Loading /> })
const LoginScreen = dynamic(() => import('@/components/screens/auth-login'), { ssr: false, loading: () => <Loading /> })
const RegisterScreen = dynamic(() => import('@/components/screens/auth-register'), { ssr: false, loading: () => <Loading /> })
const RecoverScreen = dynamic(() => import('@/components/screens/auth-recuperar'), { ssr: false, loading: () => <Loading /> })
const ResetScreen = dynamic(() => import('@/components/screens/auth-restablecer'), { ssr: false, loading: () => <Loading /> })
const JobDetailScreen = dynamic(() => import('@/components/screens/job-detail'), { ssr: false, loading: () => <Loading /> })
const ProProfileScreen = dynamic(() => import('@/components/screens/pro-profile'), { ssr: false, loading: () => <Loading /> })
const ProviderProfileScreen = dynamic(() => import('@/components/screens/provider-profile'), { ssr: false, loading: () => <Loading /> })
const NotificationsScreen = dynamic(() => import('@/components/screens/notifications'), { ssr: false, loading: () => <Loading /> })
const DirectoryScreen = dynamic(() => import('@/components/screens/directory-screen'), { ssr: false, loading: () => <Loading /> })
const MarketplaceScreen = dynamic(() => import('@/components/screens/marketplace-screen'), { ssr: false, loading: () => <Loading /> })
const MessagesScreen = dynamic(() => import('@/components/screens/messages-screen'), { ssr: false, loading: () => <Loading /> })
const HelpScreen = dynamic(() => import('@/components/screens/help-screen'), { ssr: false, loading: () => <Loading /> })
const LegalScreen = dynamic(() => import('@/components/screens/legal-screen'), { ssr: false, loading: () => <Loading /> })
const CartScreen = dynamic(() => import('@/components/screens/cart-screen'), { ssr: false, loading: () => <Loading /> })

// Pedidos del carrito (cliente y profesional que compra)
const OrdersScreen = dynamic(() => import('@/components/screens/panel/pedidos'), { ssr: false, loading: () => <Loading /> })
const OrderDetail = dynamic(() => import('@/components/screens/panel/pedido-detalle'), { ssr: false, loading: () => <Loading /> })

// Panel cliente
const ClientDashboard = dynamic(() => import('@/components/screens/panel/cliente/dashboard'), { ssr: false, loading: () => <Loading /> })
const PublishJob = dynamic(() => import('@/components/screens/panel/cliente/publicar'), { ssr: false, loading: () => <Loading /> })
const MyJobs = dynamic(() => import('@/components/screens/panel/cliente/trabajos'), { ssr: false, loading: () => <Loading /> })
const ClientProjects = dynamic(() => import('@/components/screens/panel/cliente/proyectos'), { ssr: false, loading: () => <Loading /> })
const ClientProjectDetail = dynamic(() => import('@/components/screens/panel/cliente/proyecto-detalle'), { ssr: false, loading: () => <Loading /> })
const ClientInvoices = dynamic(() => import('@/components/screens/panel/cliente/facturas'), { ssr: false, loading: () => <Loading /> })
const ClientMaterials = dynamic(() => import('@/components/screens/panel/cliente/materiales'), { ssr: false, loading: () => <Loading /> })
const ClientProfile = dynamic(() => import('@/components/screens/panel/cliente/perfil'), { ssr: false, loading: () => <Loading /> })

// Panel profesional
const ProDashboard = dynamic(() => import('@/components/screens/panel/profesional/dashboard'), { ssr: false, loading: () => <Loading /> })
const ProJobsBoard = dynamic(() => import('@/components/screens/panel/profesional/bolsa'), { ssr: false, loading: () => <Loading /> })
const ProProjects = dynamic(() => import('@/components/screens/panel/profesional/proyectos'), { ssr: false, loading: () => <Loading /> })
const ProProjectDetail = dynamic(() => import('@/components/screens/panel/profesional/proyecto-detalle'), { ssr: false, loading: () => <Loading /> })
const ProBids = dynamic(() => import('@/components/screens/panel/profesional/presupuestos'), { ssr: false, loading: () => <Loading /> })
const ProCRM = dynamic(() => import('@/components/screens/panel/profesional/crm'), { ssr: false, loading: () => <Loading /> })
const ProWorks = dynamic(() => import('@/components/screens/panel/profesional/obras'), { ssr: false, loading: () => <Loading /> })
const ProLinks = dynamic(() => import('@/components/screens/panel/profesional/vinculaciones'), { ssr: false, loading: () => <Loading /> })
const ProReturns = dynamic(() => import('@/components/screens/panel/profesional/devoluciones'), { ssr: false, loading: () => <Loading /> })
const ProProfileEdit = dynamic(() => import('@/components/screens/panel/profesional/perfil'), { ssr: false, loading: () => <Loading /> })
const ProCobros = dynamic(() => import('@/components/screens/panel/profesional/cobros'), { ssr: false, loading: () => <Loading /> })
const ProCalendar = dynamic(() => import('@/components/screens/panel/profesional/calendario'), { ssr: false, loading: () => <Loading /> })

// Panel proveedor
const ProviderDashboard = dynamic(() => import('@/components/screens/panel/proveedor/dashboard'), { ssr: false, loading: () => <Loading /> })
const ProviderStock = dynamic(() => import('@/components/screens/panel/proveedor/stock'), { ssr: false, loading: () => <Loading /> })
const ProviderCharges = dynamic(() => import('@/components/screens/panel/proveedor/cobros'), { ssr: false, loading: () => <Loading /> })
const ProviderCRM = dynamic(() => import('@/components/screens/panel/proveedor/crm'), { ssr: false, loading: () => <Loading /> })
const ProviderLinks = dynamic(() => import('@/components/screens/panel/proveedor/vinculaciones'), { ssr: false, loading: () => <Loading /> })
const ProviderPlan = dynamic(() => import('@/components/screens/panel/proveedor/plan'), { ssr: false, loading: () => <Loading /> })
const ProviderProfileEdit = dynamic(() => import('@/components/screens/panel/proveedor/perfil'), { ssr: false, loading: () => <Loading /> })

// Finanzas del profesional y del proveedor (D24): un módulo, el rol como parámetro
const FinanzasScreen = dynamic(() => import('@/components/screens/panel/finanzas/finanzas'), { ssr: false, loading: () => <Loading /> })

// Común a los 3 roles: verificación de identidad por DNI + IA
// Común a los 3 roles: Sugerencias (D25) + bandeja del administrador (área /admin, D29)
const SugerenciasScreen = dynamic(() => import('@/components/screens/panel/sugerencias'), { ssr: false, loading: () => <Loading /> })
const AdminSugerenciasScreen = dynamic(() => import('@/components/screens/panel/admin-sugerencias'), { ssr: false, loading: () => <Loading /> })
// Área /admin (D29): layout propio + Métricas (D27) y la bandeja de Sugerencias (D25)
const AdminMetricasScreen = dynamic(() => import('@/components/screens/panel/admin-metricas'), { ssr: false, loading: () => <Loading /> })
const AdminLayout = dynamic(() => import('@/components/screens/admin/admin-layout'), { ssr: false, loading: () => <Loading /> })
// Ingresos de HomIA (D30): suscripciones + cargo 1%, estado de cuenta de proveedores
const AdminIngresosScreen = dynamic(() => import('@/components/screens/admin/admin-ingresos'), { ssr: false, loading: () => <Loading /> })
const VerificationScreen = dynamic(() => import('@/components/screens/panel/verificacion').then((m) => m.default), { ssr: false, loading: () => <Loading /> })

const PanelLayout = dynamic(() => import('@/components/screens/panel/panel-layout'), { ssr: false, loading: () => <Loading /> })

export default function AppRoot() {
  const route = useRoute()
  const { user, loading, refresh } = useSession()
  const location = useLocation()
  // la SPA está montada: desde acá navigate() cambia el hash sin recargar la página
  markSpaMounted()
  useEffect(() => { markSpaMounted(); return () => unmarkSpaMounted() }, [])

  // carrito: se sincroniza con la sesión (y fusiona el del visitante al ingresar)
  useCartSync()

  // pantalla anterior (para el contexto de "Problema técnico" en Sugerencias, D25)
  const pathAnterior = useRef<string | null>(null)
  useEffect(() => {
    const prev = pathAnterior.current
    pathAnterior.current = route.path
    if (!prev || prev === route.path || /\/sugerencias$/.test(prev)) return
    try { sessionStorage.setItem('homy_prev_path', prev) } catch { /* sin storage: no pasa nada */ }
  }, [route.path])

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
  // Envuelve pantallas públicas con el header+footer del home (para que se sientan parte del sitio).
  // El SiteHeader es fixed h-20: `pad` compensa su alto. Directorio/materiales/ayuda
  // ya traen su propio padding superior interno → pt-16; el resto (buscar, perfiles,
  // trabajo, notificaciones) no tiene → pt-20 para no quedar debajo del header.
  const withPublicShell = (content: React.ReactNode, pad: 'pt-16' | 'pt-20' = 'pt-16') => (
    <div className="relative min-h-screen text-navy flex flex-col">
      <SiteHeader />
      <main className={`flex-1 ${pad}`}>{content}</main>
      <SiteFooter />
    </div>
  )
  const shell = (content: React.ReactNode) => withPublicShell(content, 'pt-20')
  if (s.length === 0) screen = <HomeScreen />
  else if (s[0] === 'buscar') screen = publicOrPanel(shell(<SearchScreen />), <SearchScreen embedded />)
  else if (s[0] === 'ingresar') screen = <LoginScreen />
  else if (s[0] === 'registrarse') screen = <RegisterScreen />
  else if (s[0] === 'recuperar') screen = <RecoverScreen />
  else if (s[0] === 'restablecer') screen = <ResetScreen />
  else if (s[0] === 'trabajo' && s[1]) screen = publicOrPanel(shell(<JobDetailScreen id={s[1]} />), <JobDetailScreen id={s[1]} />)
  else if (s[0] === 'profesional' && s[1]) screen = publicOrPanel(shell(<ProProfileScreen id={s[1]} />), <ProProfileScreen id={s[1]} />)
  else if (s[0] === 'proveedor' && s[1]) screen = publicOrPanel(shell(<ProviderProfileScreen id={s[1]} />), <ProviderProfileScreen id={s[1]} />)
  else if (s[0] === 'notificaciones') screen = publicOrPanel(shell(<NotificationsScreen />), <NotificationsScreen />)
  else if (s[0] === 'directorio') screen = inPanel ? withPanel(<DirectoryScreen embedded />) : withPublicShell(<DirectoryScreen />)
  else if (s[0] === 'materiales') screen = inPanel ? withPanel(<MarketplaceScreen embedded />) : withPublicShell(<MarketplaceScreen />)
  else if (s[0] === 'mensajes') screen = publicOrPanel(<AuthGate path="/mensajes" />, <MessagesScreen embedded />)
  else if (s[0] === 'ayuda') screen = inPanel ? withPanel(<HelpScreen embedded />) : withPublicShell(<HelpScreen />)
  else if (s[0] === 'terminos' || s[0] === 'privacidad') screen = inPanel ? withPanel(<LegalScreen tipo={s[0]} />) : withPublicShell(<LegalScreen tipo={s[0]} />, 'pt-20')
  else if (s[0] === 'carrito') screen = inPanel ? withPanel(<CartScreen embedded />) : loading ? <Loading text="Verificando tu sesión…" /> : withPublicShell(<CartScreen />, 'pt-20')
  else if (s[0] === 'panel') {
    if (loading) screen = <Loading text="Verificando tu sesión…" />
    else if (!user) {
      screen = <AuthGate path={route.path} />
    } else if (s[1] === 'admin') {
      // rutas viejas de administración (D25) → área /admin propia (D29); cubre links y mails viejos
      const nueva = rutaAdminNueva(route.path, route.raw.split('?')[1] || '')
      screen = nueva ? <Redirigir to={nueva} /> : <NotFound />
    } else {
      screen = <PanelLayout route={route}>{panelScreen(route)}</PanelLayout>
    }
  } else if (s[0] === 'admin') {
    // Área de administración (D29): ingreso PROPIO con ADMIN_EMAIL/ADMIN_PASSWORD, sin cuenta de
    // usuario ni rol. Sin sesión de admin muestra su formulario; /admin a secas → Métricas.
    screen = <AdminLayout route={route}>{s[1] === 'metricas' || !s[1] ? <AdminMetricasScreen /> : s[1] === 'sugerencias' ? <AdminSugerenciasScreen /> : s[1] === 'ingresos' ? <AdminIngresosScreen /> : <NotFound />}</AdminLayout>
  } else {
    screen = <NotFound />
  }

  return (
    <>
      {/* Z-order sagrado: ambiente z-0 → app z-10 → modales/paneles z-50 */}
      <BackdropFX />
      <div className="homy-screen relative z-10">{screen}</div>
      {/* tutorial guiado por rol + ayuda flotante siempre visible + videoteca */}
      {/* el área /admin no es de usuarios: sin tour ni Homy flotante (tapaba gráficos) */}
      {s[0] !== 'admin' && <TourOverlay />}
      {s[0] !== 'admin' && <HelpDock />}
      <VideoModal />
      {/* métricas de uso propias (D27): no dibuja nada */}
      <AnalyticsTracker />
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
  if (page === 'ayuda') return <HelpScreen embedded />
  if (page === 'sugerencias' && (role === 'cliente' || role === 'profesional' || role === 'proveedor')) return <SugerenciasScreen role={role} />

  if (role === 'cliente') {
    if (page === '' ) return <ClientDashboard />
    if (page === 'publicar') return <PublishJob />
    if (page === 'trabajos') return <MyJobs highlightId={sub} />
    if (page === 'materiales') return <ClientMaterials />
    if (page === 'pedidos' && sub) return <OrderDetail id={sub} role="cliente" />
    if (page === 'pedidos') return <OrdersScreen role="cliente" />
    if (page === 'proyectos' && sub) return <ClientProjectDetail id={sub} />
    if (page === 'proyectos') return <ClientProjects />
    if (page === 'facturas') return <ClientInvoices />
    if (page === 'perfil') return <ClientProfile />
    return <NotFound />
  }
  if (role === 'profesional') {
    if (page === '') return <ProDashboard />
    if (page === 'bolsa') return <ProJobsBoard />
    if (page === 'materiales') return <ClientMaterials role="profesional" />
    if (page === 'pedidos' && sub) return <OrderDetail id={sub} role="profesional" />
    if (page === 'pedidos') return <OrdersScreen role="profesional" />
    if (page === 'proyectos' && sub) return <ProProjectDetail id={sub} />
    if (page === 'proyectos') return <ProProjects />
    if (page === 'presupuestos') return <ProBids />
    if (page === 'crm') return <ProCRM />
    if (page === 'obras') return <ProWorks />
    if (page === 'vinculaciones') return <ProLinks />
    if (page === 'devoluciones') return <ProReturns />
    if (page === 'cobros') return <ProCobros />
    if (page === 'calendario') return <ProCalendar />
    if (page === 'finanzas') return <FinanzasScreen rol="profesional" />
    if (page === 'perfil') return <ProProfileEdit />
    return <NotFound />
  }
  if (role === 'proveedor') {
    if (page === 'plan') return <ProviderPlan />
    // D33: con el plan vencido, aviso fijo arriba de todas las pantallas (puede terminar lo que tiene)
    const conAviso = (n: React.ReactNode) => <><PlanInactivoAviso />{n}</>
    if (page === '') return conAviso(<ProviderDashboard />)
    if (page === 'stock') return conAviso(<ProviderStock />)
    if (page === 'cobros') return conAviso(<ProviderCharges />)
    if (page === 'crm') return conAviso(<ProviderCRM />)
    if (page === 'vinculaciones') return conAviso(<ProviderLinks />)
    if (page === 'finanzas') return conAviso(<FinanzasScreen rol="proveedor" />)
    if (page === 'perfil') return conAviso(<ProviderProfileEdit />)
    return <NotFound />
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
            <li className="flex items-center gap-1.5"><ShieldCheck className="size-3.5 text-[#1D63B8]" aria-hidden />Pago con Mercado Pago o efectivo</li>
            <li className="flex items-center gap-1.5"><BadgeCheck className="size-3.5 text-[#0e9f6e]" aria-hidden />Verificación</li>
            <li className="flex items-center gap-1.5"><Sparkles className="size-3.5 text-[#0092c4]" aria-hidden />IA</li>
          </ul>
        </div>
      </div>
    </div>
  )
}

/** Redirección dentro de la SPA (reemplaza la entrada del historial: "atrás" no vuelve al rebote). */
function Redirigir({ to }: { to: string }) {
  useEffect(() => { navigate(to, { replace: true }) }, [to])
  return <Loading />
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
