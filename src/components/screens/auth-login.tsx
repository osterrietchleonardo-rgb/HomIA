'use client'
// Login HomIA — shell premium split-screen
import { useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useSession } from '@/lib/store'
import { AuthShell } from '@/components/app/auth-shell'
import { toast } from 'sonner'
import { Eye, EyeOff, LogIn } from 'lucide-react'

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
      sub="Ingresá para seguir tus trabajos, aprobar presupuestos y pagar con la tranquilidad del escrow."
    >
      <div className="homy-glass-strong rounded-[28px] p-7 sm:p-8">
        <h1 className="text-[1.7rem] font-extrabold tracking-tight text-[#0A2540]">Ingresar</h1>
        <p className="mt-1 text-sm text-slate-500">Tu hogar en buenas manos.</p>

        <form onSubmit={submit} className="mt-7 grid gap-4">
          <div>
            <label className="text-sm font-semibold text-[#0A2540]" htmlFor="email">Email</label>
            <input
              id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com" autoComplete="email"
              className="homy-glass-input mt-1.5 w-full rounded-xl px-4 py-3 text-[15px] outline-none"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-[#0A2540]" htmlFor="password">Contraseña</label>
            <div className="relative mt-1.5">
              <input
                id="password" type={show ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password"
                className="homy-glass-input w-full rounded-xl px-4 py-3 pr-11 text-[15px] outline-none"
              />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 transition-colors hover:text-slate-600" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </div>
          <button type="submit" disabled={busy} className="homy-btn-primary mt-1.5 w-full py-3.5 text-[15px]">
            {busy ? (
              'Ingresando…'
            ) : (
              <>
                <LogIn className="size-4.5" aria-hidden />
                Ingresar
              </>
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          ¿No tenés cuenta?{' '}
          <button onClick={() => navigate(`/registrarse${volver ? `?volver=${encodeURIComponent(volver)}` : ''}`)} className="font-bold text-[#1D63B8] hover:underline">
            Creá tu cuenta gratis
          </button>
        </p>
      </div>

      <p className="mx-auto mt-6 max-w-sm text-center text-xs leading-relaxed text-slate-400">
        Buscá y mirá sin cuenta. Registrándote podés abrir tarjetas, presupuestar y contratar.
      </p>
    </AuthShell>
  )
}
