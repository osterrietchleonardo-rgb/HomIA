'use client'
// Área de administración de HomIA (D29) — /admin, con INGRESO PROPIO (ADMIN_EMAIL y
// ADMIN_PASSWORD del servidor), sin cuenta de usuario ni rol. Sin sesión de admin muestra el
// formulario "Administración HomIA"; con sesión, el menú (Métricas, Sugerencias) y la pantalla.
// Las APIs /api/admin/* validan la cookie `homia_admin` y responden 404 sin ella.
// App-shell: la barra queda fija y el contenido scrollea en #homy-app-main.
import { useCallback, useEffect, useState } from 'react'
import { Link, navigate, type RouteState } from '@/lib/router'
import { Loading } from '@/components/app/ui-bits'
import { HomIAWordmark } from '@/components/homy/homy-character'
import { BarChart3, Eye, EyeOff, Inbox, Loader2, LogOut, ShieldCheck, Wallet } from 'lucide-react'
import { RUTA_ADMIN_INGRESOS, RUTA_ADMIN_METRICAS, RUTA_ADMIN_SUGERENCIAS } from '@/lib/admin-rutas'

// Secciones del área /admin: para sumar una (p. ej. "Ingresos de HomIA" en /admin/ingresos), se
// agrega acá y su pantalla en la rama `admin` de app-root.tsx; sus APIs usan requireAdmin().
const MENU = [
  { to: RUTA_ADMIN_METRICAS, label: 'Métricas', icon: BarChart3 },
  { to: RUTA_ADMIN_SUGERENCIAS, label: 'Sugerencias', icon: Inbox },
  { to: RUTA_ADMIN_INGRESOS, label: 'Ingresos', icon: Wallet }, // D30
]

export default function AdminArea({ route, children }: { route: RouteState; children: React.ReactNode }) {
  const [estado, setEstado] = useState<'verificando' | 'fuera' | 'dentro'>('verificando')

  const verificar = useCallback(async () => {
    try {
      const r = await fetch('/api/admin/login', { cache: 'no-store' })
      const d = await r.json().catch(() => ({}))
      setEstado(d.admin ? 'dentro' : 'fuera')
      // el navegador del administrador no cuenta en las métricas (solo clientes reales, 25/09/2026):
      // queda marcado aunque la sesión de /admin venza
      if (d.admin) { try { localStorage.setItem('homia_track_off', '1') } catch { /* modo privado */ } }
    } catch {
      setEstado('fuera')
    }
  }, [])
  // carga asíncrona (el setState ocurre después del fetch), igual que la bandeja de sugerencias
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void verificar() }, [verificar])

  // /admin a secas → Métricas
  useEffect(() => {
    if (estado === 'dentro' && (route.path === '/admin' || route.path === '/admin/')) navigate(RUTA_ADMIN_METRICAS, { replace: true })
  }, [estado, route.path])

  if (estado === 'verificando') return <Loading text="Verificando el acceso…" />
  if (estado === 'fuera') return <IngresoAdmin onOk={() => setEstado('dentro')} />

  async function salir() {
    await fetch('/api/admin/logout', { method: 'POST' }).catch(() => null)
    setEstado('fuera')
  }

  return (
    <div className="flex h-screen flex-col overflow-hidden">
      <header className="homy-glass-strong z-20 shrink-0 border-b border-white/60">
        <div className="mx-auto flex w-full max-w-7xl items-center gap-3 px-4 pt-3 sm:px-6">
          <Link to={RUTA_ADMIN_METRICAS} aria-label="Administración HomIA" className="homy-focus flex min-w-0 items-center gap-2 rounded-xl">
            <HomIAWordmark className="shrink-0 text-xl" />
            <span className="inline-flex items-center gap-1 truncate rounded-full bg-[#0A2540] px-2.5 py-1 text-[11px] font-extrabold uppercase tracking-wide text-white">
              <ShieldCheck className="size-3.5" aria-hidden /> Administración
            </span>
          </Link>
          <button
            type="button" data-track="admin: salir" onClick={() => void salir()}
            className="homy-focus ml-auto inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-3 text-[13px] font-bold text-slate-600 hover:bg-white/70"
          >
            <LogOut className="size-4" aria-hidden /> Salir
          </button>
        </div>
        <nav className="mx-auto flex w-full max-w-7xl gap-1.5 overflow-x-auto px-4 pb-2.5 pt-2.5 sm:px-6" aria-label="Menú de administración">
          {MENU.map((m) => {
            const activo = route.path === m.to || route.path.startsWith(`${m.to}/`)
            return (
              <Link key={m.to} to={m.to} data-track={`admin: ${m.label}`} aria-current={activo ? 'page' : undefined}
                className={`homy-focus inline-flex min-h-[40px] shrink-0 items-center gap-1.5 rounded-full px-4 text-[13.5px] font-bold transition ${activo ? 'bg-[#0A2540] text-white' : 'bg-white/70 text-[#0A2540] hover:bg-white'}`}>
                <m.icon className="size-4" aria-hidden />{m.label}
              </Link>
            )
          })}
        </nav>
      </header>
      <main id="homy-app-main" className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-7xl px-4 pb-16 pt-4 sm:px-6">{children}</div>
      </main>
    </div>
  )
}

function IngresoAdmin({ onOk }: { onOk: () => void }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [ver, setVer] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function ingresar(e: React.FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true); setError(null)
    try {
      const r = await fetch('/api/admin/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
      })
      const d = await r.json().catch(() => ({}))
      if (r.ok && d.admin) { setPassword(''); onOk(); return }
      setError(d.error || 'No pudimos ingresar')
    } catch {
      setError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const campo = 'homy-glass-input homy-focus mt-1.5 min-h-[48px] w-full rounded-xl px-3.5 text-[15px] text-[#0A2540]'
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <div className="homy-glass w-full max-w-sm rounded-3xl p-6 sm:p-8">
        <div className="text-center">
          <span className="homy-icon-chip homy-chip-navy mx-auto size-12"><ShieldCheck className="size-6" aria-hidden /></span>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-navy">Administración HomIA</h1>
          <p className="mt-1.5 text-[13.5px] text-slate-500">Acceso solo para el equipo de HomIA.</p>
        </div>
        <form onSubmit={ingresar} data-track="ingreso de administración" className="mt-6 grid gap-3.5" noValidate>
          <label className="text-[13px] font-bold text-[#0A2540]">Email
            <input type="email" autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} className={campo} required />
          </label>
          <label className="text-[13px] font-bold text-[#0A2540]">Contraseña
            <span className="relative block">
              <input type={ver ? 'text' : 'password'} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={`${campo} pr-12`} required />
              <button type="button" onClick={() => setVer((v) => !v)} aria-label={ver ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                className="homy-focus absolute right-1.5 top-1/2 mt-[3px] inline-flex size-10 -translate-y-1/2 items-center justify-center rounded-lg text-slate-500">
                {ver ? <EyeOff className="size-4.5" aria-hidden /> : <Eye className="size-4.5" aria-hidden />}
              </button>
            </span>
          </label>
          {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-[13px] font-semibold text-red-700">{error}</p>}
          <button type="submit" disabled={busy || !email || !password} className="homy-btn-dark mt-1 min-h-[48px] w-full text-[15px]">
            {busy ? <Loader2 className="size-4.5 animate-spin" aria-hidden /> : 'Ingresar'}
          </button>
        </form>
      </div>
    </div>
  )
}
