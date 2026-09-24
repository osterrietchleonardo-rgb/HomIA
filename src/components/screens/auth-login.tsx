'use client'
// Login HomIA — shell premium split-screen (panel de marca + formulario de vidrio)
import { useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useSession } from '@/lib/store'
import { AuthShell } from '@/components/app/auth-shell'
import { toast } from 'sonner'
import { BadgeCheck, Eye, EyeOff, Loader2, Lock, LogIn, Mail, ShieldCheck, Sparkles } from 'lucide-react'

// Micro-detalle de confianza (espeja los value props del panel de marca)
const TRUST_POINTS = [
  { icon: ShieldCheck, label: 'Pagás al finalizar', tone: 'text-[#1D63B8]' },
  { icon: BadgeCheck, label: 'Verificación', tone: 'text-[#0e9f6e]' },
  { icon: Sparkles, label: 'IA', tone: 'text-[#0092c4]' },
]

export default function LoginScreen() {
  const route = useRoute()
  const volver = route.query.volver || ''
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const { refresh } = useSession()

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'No pudimos ingresar')
        return
      }
      await refresh()
      toast.success(`¡Hola de nuevo, ${data.user.displayName.split(' ')[0]}!`)
      navigate(volver || `/panel/${data.user.roles[0] || 'cliente'}`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      homyState={busy ? 'thinking' : 'happy'}
      headline={
        <>
          Que tu hogar vuelva a <span className="homy-gradient-text">funcionar</span>, hoy.
        </>
      }
      sub="Ingresá para seguir tus trabajos, aprobar presupuestos y pagar con total tranquilidad."
    >
      <div className="homy-glass-strong homy-stagger rounded-[28px] p-6 sm:p-8">
        <header>
          <span className="homy-eyebrow">Bienvenido de nuevo</span>
          <h1 className="mt-2 text-[1.9rem] font-extrabold leading-[1.15] tracking-tight text-navy">Ingresar</h1>
          <p className="mt-1 text-sm text-slate-500">Tu hogar en buenas manos.</p>
        </header>

        <form onSubmit={submit} className="mt-6 grid gap-4">
          <div>
            <label className="text-sm font-semibold text-navy" htmlFor="email">Email</label>
            <div className="relative mt-1.5">
              <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com" autoComplete="email"
                className="homy-glass-input w-full rounded-xl py-2.5 pl-11 pr-4 text-[15px] outline-none"
              />
            </div>
          </div>
          <div>
            <label className="text-sm font-semibold text-navy" htmlFor="password">Contraseña</label>
            <div className="relative mt-1.5">
              <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" aria-hidden />
              <input
                id="password" type={show ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password"
                className="homy-glass-input w-full rounded-xl py-2.5 pl-11 pr-12 text-[15px] outline-none"
              />
              <button
                type="button" onClick={() => setShow(!show)}
                className="absolute right-1.5 top-1/2 grid size-10 -translate-y-1/2 place-items-center rounded-xl text-slate-400 transition-colors duration-300 hover:bg-navy/5 hover:text-navy"
                aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}
              >
                {show ? <EyeOff className="size-5" aria-hidden /> : <Eye className="size-5" aria-hidden />}
              </button>
            </div>
            <div className="mt-1 flex justify-end">
              <button
                type="button"
                onClick={() => navigate(`/recuperar${email.trim() ? `?email=${encodeURIComponent(email.trim())}` : ''}`)}
                className="min-h-[44px] rounded px-1 text-sm font-bold text-[#1D63B8] underline-offset-2 transition-colors duration-300 hover:text-[#2b8fe0] hover:underline"
              >
                ¿Olvidaste tu contraseña?
              </button>
            </div>
          </div>
          <button type="submit" disabled={busy} className="homy-btn-primary mt-1 w-full py-3.5 text-[15px]">
            {busy ? (
              <>
                <Loader2 className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden />
                Ingresando…
              </>
            ) : (
              <>
                <LogIn className="size-4.5" aria-hidden />
                Ingresar
              </>
            )}
          </button>
        </form>

        <p className="mt-5 text-center text-sm text-slate-500">
          ¿No tenés cuenta?{' '}
          <button
            onClick={() => navigate(`/registrarse${volver ? `?volver=${encodeURIComponent(volver)}` : ''}`)}
            className="rounded font-bold text-[#1D63B8] underline-offset-2 transition-colors duration-300 hover:text-[#2b8fe0] hover:underline"
          >
            Creá tu cuenta gratis
          </button>
        </p>

        <ul className="mt-6 grid grid-cols-3 gap-2 border-t border-navy/10 pt-5" aria-label="Por qué confiar en HomIA">
          {TRUST_POINTS.map((t) => (
            <li key={t.label} className="homy-glass-soft flex flex-col items-center gap-1.5 rounded-xl px-1 py-2.5">
              <t.icon className={`size-4 ${t.tone}`} aria-hidden />
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500">{t.label}</span>
            </li>
          ))}
        </ul>
      </div>

      <p className="mx-auto mt-6 max-w-sm text-center text-xs leading-relaxed text-slate-400">
        Buscá y mirá sin cuenta. Registrándote podés abrir tarjetas, presupuestar y contratar.
      </p>
    </AuthShell>
  )
}
