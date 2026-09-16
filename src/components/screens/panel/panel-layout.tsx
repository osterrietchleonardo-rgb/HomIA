'use client'
// Panel layout HomIA — sidebar desktop + bottom nav mobile + topbar con notificaciones y cambio de rol
import { useEffect, useState } from 'react'
import { navigate, Link, type RouteState } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Homy } from '@/components/homy/homy-character'
import { toast } from 'sonner'
import {
  LayoutDashboard, Briefcase, FolderKanban, FileText, User, Bell, LogOut,
  Search, Boxes, Users, Link2, HardHat, ClipboardList, Wrench, Home,
} from 'lucide-react'

type NavItem = { to: string; label: string; icon: React.ComponentType<{ className?: string }> }

const NAV: Record<string, NavItem[]> = {
  cliente: [
    { to: '/panel/cliente', label: 'Inicio', icon: LayoutDashboard },
    { to: '/panel/cliente/publicar', label: 'Publicar trabajo', icon: Briefcase },
    { to: '/panel/cliente/trabajos', label: 'Mis trabajos', icon: ClipboardList },
    { to: '/panel/cliente/proyectos', label: 'Proyectos', icon: FolderKanban },
    { to: '/panel/cliente/facturas', label: 'Facturas', icon: FileText },
    { to: '/panel/cliente/perfil', label: 'Mi perfil', icon: User },
  ],
  profesional: [
    { to: '/panel/profesional', label: 'Inicio', icon: LayoutDashboard },
    { to: '/panel/profesional/bolsa', label: 'Bolsa de trabajos', icon: Search },
    { to: '/panel/profesional/materiales', label: 'Materiales', icon: Boxes },
    { to: '/panel/profesional/presupuestos', label: 'Mis presupuestos', icon: FileText },
    { to: '/panel/profesional/proyectos', label: 'Proyectos', icon: FolderKanban },
    { to: '/panel/profesional/crm', label: 'CRM clientes', icon: Users },
    { to: '/panel/profesional/obras', label: 'Mis obras', icon: HardHat },
    { to: '/panel/profesional/vinculaciones', label: 'Cuentas de retiro', icon: Link2 },
    { to: '/panel/profesional/perfil', label: 'Mi perfil', icon: User },
  ],
  proveedor: [
    { to: '/panel/proveedor', label: 'Inicio', icon: LayoutDashboard },
    { to: '/panel/proveedor/stock', label: 'Stock', icon: Boxes },
    { to: '/panel/proveedor/crm', label: 'CRM', icon: Users },
    { to: '/panel/proveedor/vinculaciones', label: 'Vinculaciones', icon: Link2 },
    { to: '/panel/proveedor/perfil', label: 'Mi perfil', icon: User },
  ],
}

export default function PanelLayout({ route, children }: { route: RouteState; children: React.ReactNode }) {
  const { user, logout } = useSession()
  const [unread, setUnread] = useState(0)

  const role = route.segments[1] || user?.roles?.[0] || 'cliente'
  const items = NAV[role] || NAV.cliente
  const currentPath = route.path

  useEffect(() => {
    async function poll() {
      try {
        const res = await fetch('/api/notifications')
        if (res.ok) {
          const data = await res.json()
          setUnread(data.unread || 0)
        }
      } catch { /* silencioso */ }
    }
    poll()
    const t = setInterval(poll, 30000)
    return () => clearInterval(t)
  }, [currentPath])

  // si el rol no corresponde al usuario, corregir
  useEffect(() => {
    if (!user) return
    if (!user.roles.includes(role)) {
      navigate(`/panel/${user.roles[0] || 'cliente'}`, { replace: true })
    }
  }, [user, role])

  async function doLogout() {
    await logout()
    toast.success('Sesión cerrada')
    navigate('/')
  }

  const otherRoles = user?.roles.filter((r) => r !== role) || []

  return (
    <div className="min-h-screen bg-chalk flex flex-col">
      {/* topbar */}
      <header className="sticky top-0 z-40 bg-[#0A2540] text-white shadow-lg">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between gap-3">
          <Link to="/" className="flex items-center gap-2 shrink-0">
            <Homy size={38} />
          </Link>
          <div className="flex-1 hidden sm:block">
            <Link to="/buscar" className="flex items-center gap-2 rounded-full bg-white/10 border border-white/15 px-4 py-2 text-sm text-slate-300 hover:bg-white/15 transition max-w-md mx-auto">
              <Search className="size-4" /> Buscar {role === 'proveedor' ? 'profesionales' : role === 'profesional' ? 'trabajos y materiales' : 'profesionales'}…
            </Link>
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => navigate('/notificaciones')}
              className="relative rounded-full p-2.5 hover:bg-white/10 transition"
              aria-label={`Notificaciones${unread ? `, ${unread} sin leer` : ''}`}
            >
              <Bell className="size-5" />
              {unread > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] rounded-full bg-[#FF5A1F] text-[10px] font-extrabold flex items-center justify-center px-1">
                  {unread > 9 ? '9+' : unread}
                </span>
              )}
            </button>
            {otherRoles.length > 0 && (
              <select
                value={role}
                onChange={(e) => navigate(`/panel/${e.target.value}`)}
                className="rounded-full bg-white/10 border border-white/15 text-sm font-semibold px-3 py-2 outline-none cursor-pointer [&>option]:text-[#0A2540]"
                aria-label="Cambiar de perfil"
              >
                {user!.roles.map((r) => <option key={r} value={r}>Perfil: {r}</option>)}
              </select>
            )}
            <span className="hidden md:block text-sm font-semibold max-w-[140px] truncate">{user?.displayName}</span>
            <button onClick={doLogout} className="rounded-full p-2.5 hover:bg-white/10 transition" aria-label="Cerrar sesión" title="Cerrar sesión">
              <LogOut className="size-5" />
            </button>
          </div>
        </div>
      </header>

      <div className="flex-1 flex">
        {/* sidebar desktop */}
        <aside className="hidden lg:block w-60 shrink-0 border-r border-slate-200 bg-white">
          <nav className="sticky top-16 p-3 space-y-1" aria-label="Navegación del panel">
            {items.map((item) => {
              const active = currentPath === item.to
              const Icon = item.icon
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={`flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold transition ${
                    active ? 'bg-[#1D63B8] text-white shadow-md' : 'text-slate-600 hover:bg-confort hover:text-[#0A2540]'
                  }`}
                >
                  <Icon className="size-4.5" />
                  {item.label}
                </Link>
              )
            })}
            <div className="my-2 h-px bg-slate-100" />
            <Link to="/buscar" className="flex items-center gap-3 rounded-xl px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-confort">
              <Home className="size-4.5" /> Ir a la home
            </Link>
          </nav>
        </aside>

        {/* contenido */}
        <main className="flex-1 min-w-0 p-4 sm:p-6 lg:p-8 pb-24 lg:pb-8">{children}</main>
      </div>

      {/* bottom nav mobile */}
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t border-slate-200 shadow-[0_-4px_20px_rgba(10,37,64,0.08)]" aria-label="Navegación inferior">
        <div className="flex justify-around">
          {items.slice(0, 5).map((item) => {
            const active = currentPath === item.to
            const Icon = item.icon
            return (
              <Link key={item.to} to={item.to} className={`flex flex-col items-center gap-0.5 py-2 px-2 text-[10px] font-semibold min-w-[52px] ${active ? 'text-[#1D63B8]' : 'text-slate-400'}`}>
                <Icon className="size-5" />
                <span className="truncate max-w-[64px]">{item.label}</span>
              </Link>
            )
          })}
        </div>
      </nav>
    </div>
  )
}

// helper para los paneles: sirve Wrench en nav de cliente "Publicar"
export { Wrench }
