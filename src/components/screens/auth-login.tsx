'use client'
// Login HomIA
import { useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Homy, HomIAWordmark } from '@/components/homy/homy-character'
import { toast } from 'sonner'
import { Eye, EyeOff } from 'lucide-react'

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
    <div className="min-h-screen bg-chalk flex flex-col items-center justify-center px-4 py-10">
      <button onClick={() => navigate('/')} className="mb-8 flex items-center gap-2 hover:opacity-80 transition">
        <Homy size={52} state="happy" />
        <HomIAWordmark className="text-3xl" />
      </button>
      <div className="w-full max-w-md rounded-3xl border border-slate-200 bg-white shadow-xl p-7">
        <h1 className="text-2xl font-extrabold text-[#0A2540]">Ingresar</h1>
        <p className="text-sm text-slate-500 mt-1">Tu hogar en buenas manos.</p>
        <form onSubmit={submit} className="grid gap-4 mt-6">
          <div>
            <label className="text-sm font-semibold text-[#0A2540]" htmlFor="email">Email</label>
            <input
              id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
              placeholder="tu@email.com" autoComplete="email"
              className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1D63B8] focus:ring-2 focus:ring-[#1D63B8]/20 transition"
            />
          </div>
          <div>
            <label className="text-sm font-semibold text-[#0A2540]" htmlFor="password">Contraseña</label>
            <div className="relative mt-1">
              <input
                id="password" type={show ? 'text' : 'password'} required value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••" autoComplete="current-password"
                className="w-full rounded-xl border border-slate-300 px-4 py-3 pr-11 outline-none focus:border-[#1D63B8] focus:ring-2 focus:ring-[#1D63B8]/20 transition"
              />
              <button type="button" onClick={() => setShow(!show)} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600" aria-label={show ? 'Ocultar contraseña' : 'Mostrar contraseña'}>
                {show ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            </div>
          </div>
          <button
            type="submit" disabled={busy}
            className="mt-1 w-full rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] disabled:opacity-60 text-white font-bold py-3.5 transition shadow-lg shadow-[#FF5A1F]/25"
          >
            {busy ? 'Ingresando…' : 'Ingresar'}
          </button>
        </form>
        <p className="text-sm text-slate-500 text-center mt-5">
          ¿No tenés cuenta?{' '}
          <button onClick={() => navigate(`/registrarse${volver ? `?volver=${encodeURIComponent(volver)}` : ''}`)} className="font-bold text-[#1D63B8] hover:underline">
            Creá tu cuenta gratis
          </button>
        </p>
      </div>
      <p className="text-xs text-slate-400 mt-6">Buscá y mirá sin cuenta. Registrándote podés abrir tarjetas, presupuestar y contratar.</p>
    </div>
  )
}
