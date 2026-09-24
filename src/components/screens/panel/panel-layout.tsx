'use client'
// Panel layout HomIA — sidebar desktop + bottom nav mobile + topbar con notificaciones y cambio de rol
// Diseño: vidrio nocturno arriba, sidebar flotante de vidrio fuerte, nav inferior pill.
import { useEffect, useState } from 'react'
import { navigate, Link, type RouteState } from '@/lib/router'
import { useSession } from '@/lib/store'
import { VerifyBadge } from '@/components/app/ui-bits'
import RoleSwitcher from '@/components/app/role-switcher'
import { Homy, HomIAWordmark } from '@/components/homy/homy-character'
import { toast } from 'sonner'
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import CartButton from '@/components/cart/cart-button'
import {
  LayoutDashboard, Briefcase, FolderKanban, FileText, User, Bell, LogOut,
  Search, Boxes, Users, Link2, HardHat, ClipboardList, Home, Sparkles,
  Compass, MessageCircle, ShieldCheck, LifeBuoy, HandCoins, Package, Crown, MoreHorizontal, ShoppingBag, Undo2,
} from 'lucide-react'

/** `short`: etiqueta para la barra inferior móvil (≥11px, sin truncar) */
type NavItem = { to: string; label: string; short?: string; icon: React.ComponentType<{ className?: string }> }

// Barra inferior móvil: 4 accesos fijos por rol + "Más" (el resto va al Sheet).
const MOBILE_PRIMARY: Record<string, string[]> = {
  cliente: ['/panel/cliente', '/panel/cliente/trabajos', '/panel/cliente/proyectos', '/panel/cliente/mensajes'],
  profesional: ['/panel/profesional', '/panel/profesional/bolsa', '/panel/profesional/proyectos', '/panel/profesional/mensajes'],
  proveedor: ['/panel/proveedor', '/panel/proveedor/stock', '/panel/proveedor/cobros', '/panel/proveedor/mensajes'],
}

// ancla estable para el tour guiado (nav-inicio, nav-bolsa, nav-plan…)
function tourKeyOf(to: string): string {
  const parts = to.split('/').filter(Boolean)
  return parts[0] === 'panel' ? (parts[2] || 'inicio') : parts[0]
}

// activo también en sub-rutas (ej: /panel/cliente/proyectos/abc marca "Proyectos")
function isActivePath(current: string, to: string): boolean {
  if (current === to) return true
  const depth = to.split('/').filter(Boolean).length
  return depth >= 3 && current.startsWith(`${to}/`)
}

const NAV: Record<string, NavItem[]> = {
  cliente: [
    { to: '/panel/cliente', label: 'Inicio', icon: LayoutDashboard },
    { to: '/panel/cliente/publicar', label: 'Publicar trabajo', icon: Briefcase },
    { to: '/panel/cliente/trabajos', label: 'Mis trabajos', short: 'Trabajos', icon: ClipboardList },
    { to: '/panel/cliente/materiales', label: 'Materiales', icon: Package },
    { to: '/panel/cliente/pedidos', label: 'Mis pedidos', short: 'Pedidos', icon: ShoppingBag },
    { to: '/panel/cliente/proyectos', label: 'Proyectos', icon: FolderKanban },
    { to: '/panel/cliente/facturas', label: 'Facturas', icon: FileText },
    { to: '/panel/cliente/directorio', label: 'Directorio', icon: Compass },
    { to: '/panel/cliente/mensajes', label: 'Mensajes', icon: MessageCircle },
    { to: '/panel/cliente/verificacion', label: 'Verificación', icon: ShieldCheck },
    { to: '/panel/cliente/perfil', label: 'Mi perfil', icon: User },
    { to: '/ayuda', label: 'Ayuda', icon: LifeBuoy },
  ],
  profesional: [
    { to: '/panel/profesional', label: 'Inicio', icon: LayoutDashboard },
    { to: '/panel/profesional/bolsa', label: 'Bolsa de trabajos', short: 'Bolsa', icon: Search },
    { to: '/panel/profesional/materiales', label: 'Materiales', icon: Boxes },
    { to: '/panel/profesional/pedidos', label: 'Mis pedidos', short: 'Pedidos', icon: ShoppingBag },
    { to: '/panel/profesional/presupuestos', label: 'Mis ofertas', icon: FileText },
    { to: '/panel/profesional/proyectos', label: 'Proyectos', icon: FolderKanban },
    { to: '/panel/profesional/cobros', label: 'Cobros', icon: HandCoins },
    { to: '/panel/profesional/devoluciones', label: 'Devoluciones', icon: Undo2 },
    { to: '/panel/profesional/crm', label: 'CRM clientes', icon: Users },
    { to: '/panel/profesional/obras', label: 'Mis obras', icon: HardHat },
    { to: '/panel/profesional/vinculaciones', label: 'Cuentas de retiro', icon: Link2 },
    { to: '/panel/profesional/directorio', label: 'Directorio', icon: Compass },
    { to: '/panel/profesional/mensajes', label: 'Mensajes', icon: MessageCircle },
    { to: '/panel/profesional/verificacion', label: 'Verificación', icon: ShieldCheck },
    { to: '/panel/profesional/perfil', label: 'Mi perfil', icon: User },
    { to: '/ayuda', label: 'Ayuda', icon: LifeBuoy },
  ],
  proveedor: [
    { to: '/panel/proveedor', label: 'Inicio', icon: LayoutDashboard },
    { to: '/panel/proveedor/stock', label: 'Stock', icon: Boxes },
    { to: '/panel/proveedor/cobros', label: 'Cobros', icon: HandCoins },
    { to: '/panel/proveedor/plan', label: 'Mi plan', icon: Crown },
    { to: '/panel/proveedor/crm', label: 'CRM', icon: Users },
    { to: '/panel/proveedor/vinculaciones', label: 'Vinculaciones', icon: Link2 },
    { to: '/panel/proveedor/directorio', label: 'Directorio', icon: Compass },
    { to: '/panel/proveedor/mensajes', label: 'Mensajes', icon: MessageCircle },
    { to: '/panel/proveedor/verificacion', label: 'Verificación', icon: ShieldCheck },
    { to: '/panel/proveedor/perfil', label: 'Mi perfil', icon: User },
    { to: '/ayuda', label: 'Ayuda', icon: LifeBuoy },
  ],
}

const ROLE_LABEL: Record<string, string> = {
  cliente: 'Cliente',
  profesional: 'Profesional',
  proveedor: 'Proveedor',
}

export default function PanelLayout({ route, children }: { route: RouteState; children: React.ReactNode }) {
  const { user, logout } = useSession()
  const [unread, setUnread] = useState(0)
  const [msgUnread, setMsgUnread] = useState(0)
  const [moreOpen, setMoreOpen] = useState(false)
  // estado del plan del proveedor (pill en la topbar: prueba con días restantes / plan vencido)
  const [providerPlan, setProviderPlan] = useState<{ plan: string; activo: boolean; trialDaysLeft: number | null } | null>(null)

  const role = (route.segments[0] === 'panel' ? route.segments[1] : undefined) || user?.roles?.[0] || 'cliente'
  const items = NAV[role] || NAV.cliente
  const currentPath = route.path
  const primaryPaths = MOBILE_PRIMARY[role] || MOBILE_PRIMARY.cliente
  const mobilePrimary = primaryPaths.map((p) => items.find((i) => i.to === p)).filter((i): i is NavItem => !!i)
  const mobileMore = items.filter((i) => !primaryPaths.includes(i.to))
  const moreActive = mobileMore.some((i) => isActivePath(currentPath, i.to))

  useEffect(() => {
    async function poll() {
      try {
        const [resNotif, resMsg] = await Promise.all([fetch('/api/notifications'), fetch('/api/messages/unread')])
        if (resNotif.ok) setUnread((await resNotif.json()).unread || 0)
        if (resMsg.ok) setMsgUnread((await resMsg.json()).total || 0)
      } catch { /* silencioso */ }
    }
    poll()
    const t = setInterval(poll, 15000)
    return () => clearInterval(t)
  }, [currentPath])

  // plan del proveedor para el pill de la topbar (solo en el panel proveedor)
  const isProviderPanel = role === 'proveedor' && !!user?.roles.includes('proveedor')
  useEffect(() => {
    if (!isProviderPanel) return
    let alive = true
    fetch('/api/provider/plan')
      .then(async (r) => (r.ok ? (await r.json()).plan : null))
      .then((p) => { if (alive) setProviderPlan(p || null) })
      .catch(() => { /* silencioso: el pill simplemente no se muestra */ })
    return () => { alive = false }
  }, [isProviderPanel, currentPath])

  // si el rol no corresponde al usuario, corregir
  useEffect(() => {
    if (!user) return
    if (!user.roles.includes(role)) {
      navigate(`/panel/${user.roles[0] || 'cliente'}`, { replace: true })
    }
  }, [user, role])

  async function doLogout() {
    setMoreOpen(false)
    try {
      await logout()
      toast.success('Sesión cerrada')
      navigate('/')
    } catch {
      toast.error('No pudimos cerrar la sesión. Reintentá en unos segundos')
    }
  }

  const otherRoles = user?.roles.filter((r) => r !== role) || []
  const searchHint =
    role === 'proveedor'
      ? 'Buscar profesionales…'
      : role === 'profesional'
        ? 'Buscar trabajos y materiales…'
        : 'Buscar profesionales…'

  return (
    // APP-SHELL LAYOUT — pantalla anclada al viewport: la topbar, la sidebar y
    // el título de página quedan enmarcados y SOLO el contenido interno scrollea
    // (como Gmail/Slack/VS Code). El main (#homy-app-main) es el único contenedor
    // con scroll; el router resetea su scrollTop en cada navegación.
    <div className="homy-app-shell">
      {/* topbar — vidrio nocturno: la grilla global se adivina detrás */}
      <header className="homy-glass-dark shrink-0 z-40">
        <div className="max-w-[88rem] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2.5 shrink-0 group" aria-label="Ir a la home de HomIA">
            <span className="transition-transform duration-300 group-hover:scale-105 will-change-transform">
              <Homy size={38} />
            </span>
            <HomIAWordmark className="hidden text-xl text-white sm:block" />
            <span className="hidden lg:inline-flex items-center gap-1 rounded-full border border-white/15 bg-white/8 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[0.14em] text-[#66dfff]">
              <Sparkles className="size-3" aria-hidden />
              {ROLE_LABEL[role] || role}
            </span>
          </Link>
          <div className="flex-1 hidden md:block">
            <Link
              to="/buscar"
              className="group flex items-center gap-2.5 rounded-full bg-white/10 border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/15 hover:border-white/25 transition max-w-lg mx-auto"
            >
              <Search className="size-4 transition-colors group-hover:text-[#66dfff]" aria-hidden />
              {searchHint}
            </Link>
          </div>
          <div className="flex items-center gap-1">
            {isProviderPanel && providerPlan && (providerPlan.plan === 'trial' || !providerPlan.activo) && (
              <Link
                to="/panel/proveedor/plan"
                className={`inline-flex max-w-[46vw] items-center gap-1.5 truncate rounded-full border px-2.5 py-1.5 text-[11px] font-extrabold transition sm:max-w-none ${
                  providerPlan.activo
                    ? 'border-[#FFC700]/50 bg-[#FFC700]/15 text-[#FFC700] hover:bg-[#FFC700]/25'
                    : 'border-[#FF5A1F]/60 bg-[#FF5A1F]/20 text-[#ffb08a] hover:bg-[#FF5A1F]/30'
                }`}
                aria-label={providerPlan.activo ? `Prueba gratis: quedan ${providerPlan.trialDaysLeft} días. Elegí tu plan` : 'Plan vencido. Elegí tu plan'}
              >
                <Crown className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {providerPlan.activo
                    ? `Prueba: quedan ${providerPlan.trialDaysLeft ?? 0} día${providerPlan.trialDaysLeft === 1 ? '' : 's'}`
                    : 'Plan vencido → Elegí tu plan'}
                </span>
              </Link>
            )}
            {/* carrito: solo en los paneles que compran (cliente y profesional) */}
            {(role === 'cliente' || role === 'profesional') && <CartButton tone="dark" />}
            <button
              onClick={() => navigate('/notificaciones')}
              data-tour="top-notificaciones"
              className="relative rounded-full p-2.5 text-white hover:bg-white/10 transition"
              aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`}
            >
              <Bell className="size-5" aria-hidden />
              {unread > 0 && (
                <span className="homy-badge-pop absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#ff8a3d] text-[10px] font-extrabold text-white flex items-center justify-center px-1 shadow-[0_4px_12px_-4px_rgba(255,90,31,0.8)] ring-2 ring-[#0a2540]/60">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            {otherRoles.length > 0 && <RoleSwitcher roles={user!.roles} role={role} />}
            <span className="hidden md:block text-sm font-semibold max-w-[220px] truncate text-white/90" title={user?.displayName}>{user?.displayName}</span>
            <button onClick={doLogout} className="rounded-full p-2.5 text-white hover:bg-white/10 transition" aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut className="size-5" aria-hidden />
            </button>
          </div>
        </div>
      </header>

      {/* cuerpo del shell: sidebar fija + contenido con scroll propio */}
      <div className="homy-app-body">
        {/* sidebar desktop — vidrio fuerte flotante con tarjeta de usuario; scrollea
            de forma independiente si la lista de navegación no entra en pantalla */}
        <aside className="hidden lg:block w-64 shrink-0 homy-app-aside">
          <nav className="homy-glass-strong m-3 mr-4 rounded-3xl p-3 space-y-1" aria-label="Navegación del panel">
            {user && (
              <div className="relative mb-3 flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-br from-[#0a2540] to-[#103455] px-3.5 py-3 shadow-[0_14px_30px_-16px_rgba(10,37,64,0.7)]">
                <span aria-hidden className="pointer-events-none absolute -right-6 -top-8 size-20 rounded-full bg-[#00c4ff]/25 blur-2xl" />
                <span className="relative grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 ring-1 ring-white/20" aria-hidden>
                  <User className="size-5 text-white" />
                </span>
                <span className="relative min-w-0 flex-1">
                  {/* Nombre en renglón propio (nunca lo aprieta el badge) + badge/rol abajo con wrap */}
                  <span className="block truncate text-[13px] font-bold text-white" title={user.displayName}>
                    {user.displayName}
                  </span>
                  <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
                    <VerifyBadge status={user.verificationStatus} dark />
                    <span className="text-[10.5px] font-extrabold uppercase tracking-[0.16em] text-[#66dfff]">{ROLE_LABEL[role] || role}</span>
                  </span>
                </span>
              </div>
            )}
            {items.map((item) => {
              const active = isActivePath(currentPath, item.to)
              const Icon = item.icon
              // data-tour: ancla estable para el tour guiado (nav-inicio, nav-publicar, nav-plan…)
              const tourKey = tourKeyOf(item.to)
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  data-tour={`nav-${tourKey}`}
                  aria-current={active ? 'page' : undefined}
                  className={`group relative flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold transition-all duration-300 will-change-transform ${
                    active
                      ? 'bg-gradient-to-r from-[#1D63B8] to-[#2b7fd0] text-white shadow-[0_12px_26px_-12px_rgba(29,99,184,0.8)]'
                      : 'text-slate-600 hover:translate-x-0.5 hover:bg-white/70 hover:text-[#0A2540]'
                  }`}
                >
                  {active && (
                    <span aria-hidden className="pointer-events-none absolute left-0 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-white/90" />
                  )}
                  <Icon className={`size-4.5 transition-transform duration-300 ${active ? '' : 'group-hover:scale-110'}`} aria-hidden />
                  <span className="flex-1">{item.label}</span>
                  {item.label === 'Mensajes' && msgUnread > 0 && (
                    <span className="homy-badge-pop grid min-w-[19px] h-[19px] place-items-center rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#ff8a3d] px-1 text-[10px] font-extrabold text-white shadow-[0_4px_12px_-4px_rgba(255,90,31,0.8)]">
                      {msgUnread > 9 ? '9+' : msgUnread}
                    </span>
                  )}
                </Link>
              )
            })}
            <div className="my-2 h-px bg-[#0a2540]/8" aria-hidden />
            <Link to="/" className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-semibold text-slate-600 hover:translate-x-0.5 hover:bg-white/70 hover:text-[#0A2540] transition-all duration-300">
              <Home className="size-4.5" aria-hidden /> Ir a la home
            </Link>
          </nav>
        </aside>

        {/* contenido — ÚNICO contenedor que scrollea dentro del marco */}
        <main id="homy-app-main" className="homy-app-main px-4 py-5 sm:px-6 lg:px-8 lg:pt-7 lg:pb-24 pb-44">{children}</main>
      </div>

      {/* bottom nav mobile — vidrio fuerte flotante: 4 accesos del rol + "Más" */}
      <nav className="homy-glass-strong lg:hidden fixed bottom-3 inset-x-3 z-40 rounded-[1.65rem] shadow-[0_18px_50px_-18px_rgba(10,37,64,0.45)]" aria-label="Navegación inferior" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <div className="grid grid-cols-5 px-1 py-1">
          {mobilePrimary.map((item) => {
            const active = isActivePath(currentPath, item.to)
            const Icon = item.icon
            const isMsgs = item.to.endsWith('/mensajes')
            return (
              <Link key={item.to} to={item.to} data-tour-m={`nav-${tourKeyOf(item.to)}`} aria-current={active ? 'page' : undefined}
                aria-label={isMsgs && msgUnread > 0 ? `${item.short || item.label}, ${msgUnread} sin leer` : undefined}
                className="relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 py-1.5 transition-all duration-300">
                <BottomPill active={active} />
                <Icon className={`relative size-5 transition-all duration-300 ${active ? 'text-[#1D63B8] -translate-y-px' : 'text-slate-500'}`} aria-hidden />
                <span className={`relative text-[11px] font-bold leading-tight whitespace-nowrap transition-colors duration-300 ${active ? 'text-[#1D63B8]' : 'text-slate-500'}`}>{item.short || item.label}</span>
                {isMsgs && msgUnread > 0 && (
                  <span aria-hidden className="homy-badge-pop absolute top-0.5 right-[18%] grid min-w-[16px] h-[16px] place-items-center rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#ff8a3d] px-1 text-[9px] font-extrabold text-white ring-2 ring-white">{msgUnread > 9 ? '9+' : msgUnread}</span>
                )}
              </Link>
            )
          })}
          <button type="button" onClick={() => setMoreOpen(true)} aria-haspopup="dialog" aria-expanded={moreOpen}
            aria-current={moreActive ? 'page' : undefined} data-tour-m="nav-mas"
            className="relative flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-2xl px-0.5 py-1.5 transition-all duration-300">
            <BottomPill active={moreActive || moreOpen} />
            <MoreHorizontal className={`relative size-5 transition-all duration-300 ${moreActive || moreOpen ? 'text-[#1D63B8]' : 'text-slate-500'}`} aria-hidden />
            <span className={`relative text-[11px] font-bold leading-tight whitespace-nowrap ${moreActive || moreOpen ? 'text-[#1D63B8]' : 'text-slate-500'}`}>Más</span>
          </button>
        </div>
      </nav>

      {/* "Más": el resto de las secciones del rol + cerrar sesión (solo móvil) */}
      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="bottom" className="lg:hidden max-h-[85vh] overflow-y-auto rounded-t-[1.75rem] px-4 pt-5" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 1rem)' }}>
          <SheetHeader className="p-0 pr-8 text-left">
            <SheetTitle className="text-base font-extrabold text-[#0A2540]">Más secciones</SheetTitle>
            <SheetDescription className="text-xs text-slate-500">
              {user?.displayName ? `${user.displayName} · ` : ''}{ROLE_LABEL[role] || role}
            </SheetDescription>
          </SheetHeader>
          <ul className="grid grid-cols-2 gap-2">
            {mobileMore.map((item) => {
              const active = isActivePath(currentPath, item.to)
              const Icon = item.icon
              return (
                <li key={item.to}>
                  <Link to={item.to} onClick={() => setMoreOpen(false)} aria-current={active ? 'page' : undefined}
                    className={`flex min-h-[48px] items-center gap-2.5 rounded-2xl px-3 py-2.5 text-[13px] font-bold transition ${
                      active ? 'bg-gradient-to-r from-[#1D63B8] to-[#2b7fd0] text-white' : 'homy-glass-soft text-[#0A2540] hover:bg-white/80'
                    }`}>
                    <Icon className="size-4.5 shrink-0" aria-hidden />
                    <span className="min-w-0 leading-snug">{item.label}</span>
                  </Link>
                </li>
              )
            })}
            <li>
              <Link to="/" onClick={() => setMoreOpen(false)}
                className="homy-glass-soft flex min-h-[48px] items-center gap-2.5 rounded-2xl px-3 py-2.5 text-[13px] font-bold text-[#0A2540] transition hover:bg-white/80">
                <Home className="size-4.5 shrink-0" aria-hidden /> Ir a la home
              </Link>
            </li>
          </ul>
          <button type="button" onClick={doLogout}
            className="mt-1 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-red-200 bg-red-50/70 px-4 text-sm font-bold text-red-600 transition hover:bg-red-100">
            <LogOut className="size-4.5" aria-hidden /> Cerrar sesión
          </button>
        </SheetContent>
      </Sheet>
    </div>
  )
}

function BottomPill({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden
      className={`pointer-events-none absolute inset-x-1 inset-y-0.5 rounded-2xl transition-all duration-300 ${
        active ? 'bg-gradient-to-br from-[#1D63B8]/14 to-[#00C4FF]/14 ring-1 ring-[#1D63B8]/25 opacity-100' : 'opacity-0'
      }`}
    />
  )
}
