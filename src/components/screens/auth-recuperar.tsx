'use client'
// Recuperar contraseña (paso 1): pedir el link por mail. Mismo shell que Ingresar.
// La respuesta es siempre la misma, exista o no la cuenta (no revela emails).
import { useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { AuthShell } from '@/components/app/auth-shell'
import { apiFetch } from '@/lib/api-client'
import { ArrowLeft, Loader2, Mail, MailCheck, Send } from 'lucide-react'

export default function RecoverScreen() {
  const route = useRoute()
  const [email, setEmail] = useState(route.query.email || '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sentTo, setSentTo] = useState<string | null>(null)
  const [message, setMessage] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const v = email.trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) { setError('Escribí un email válido, como tu@email.com'); return }
    setError(null)
    setBusy(true)
    try {
      const r = await apiFetch<{ message?: string }>('/api/auth/password/forgot', { method: 'POST', json: { email: v }, silent: true })
      if (!r.ok) { setError(r.error || 'No pudimos mandar el pedido. Probá de nuevo.'); return }
      setMessage(r.data?.message || 'Si ese email tiene una cuenta, te mandamos un link para crear una nueva contraseña')
      setSentTo(v)
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      homyState={busy ? 'thinking' : 'happy'}
      headline={<>Recuperá el acceso a tu <span className="homy-gradient-text">cuenta</span>.</>}
      sub="Te mandamos un link a tu email para que crees una contraseña nueva. Tus datos, proyectos y pedidos quedan como estaban."
    >
      <div className="homy-glass-strong homy-stagger rounded-[28px] p-6 sm:p-8">
        <header>
          <span className="homy-eyebrow">¿Olvidaste tu contraseña?</span>
          <h1 className="mt-2 text-[1.9rem] font-extrabold leading-[1.15] tracking-tight text-navy">Recuperar contraseña</h1>
          <p className="mt-1 text-sm text-slate-500">Escribí el email con el que te registraste.</p>
        </header>

        {sentTo ? (
          <div className="mt-6 grid gap-4" role="status" aria-live="polite">
            <div className="homy-glass-soft flex items-start gap-3 rounded-2xl p-4">
              <span className="homy-icon-chip homy-chip-mint size-10 shrink-0 [&_svg]:size-5" aria-hidden><MailCheck /></span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-navy">{message}.</p>
                <p className="mt-1 text-sm text-slate-500">Revisá <b className="break-all text-navy">{sentTo}</b> (también la carpeta de spam o promociones).</p>
                <p className="mt-1 text-sm text-slate-500">El link vence en 1 hora y sirve una sola vez.</p>
              </div>
            </div>
            <button type="button" onClick={() => navigate('/ingresar', { replace: true })} className="homy-btn-primary w-full py-3.5 text-[15px]">
              Volver a ingresar
            </button>
            <button type="button" onClick={() => { setSentTo(null); setMessage('') }} className="min-h-[44px] text-sm font-bold text-[#1D63B8] hover:underline">
              No me llegó: pedir otro link
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
            <div>
              <label className="text-sm font-semibold text-navy" htmlFor="recover-email">Email</label>
              <div className="relative mt-1.5">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" aria-hidden />
                <input
                  id="recover-email" type="email" required value={email} onChange={(e) => { setEmail(e.target.value); setError(null) }}
                  placeholder="tu@email.com" autoComplete="email" aria-invalid={!!error} aria-describedby={error ? 'recover-error' : undefined}
                  className={`homy-glass-input w-full rounded-xl py-2.5 pl-11 pr-4 text-[15px] outline-none ${error ? 'ring-1 ring-red-400' : ''}`}
                />
              </div>
              {error && <p id="recover-error" role="alert" className="mt-1.5 text-sm font-semibold text-red-600">{error}</p>}
            </div>
            <button type="submit" disabled={busy} className="homy-btn-primary mt-1 w-full py-3.5 text-[15px]">
              {busy ? (
                <><Loader2 className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden /> Enviando…</>
              ) : (
                <><Send className="size-4.5" aria-hidden /> Mandarme el link</>
              )}
            </button>
          </form>
        )}

        {!sentTo && (
          <p className="mt-5 text-center text-sm text-slate-500">
            <button
              type="button"
              onClick={() => navigate('/ingresar')}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded font-bold text-[#1D63B8] underline-offset-2 hover:text-[#2b8fe0] hover:underline"
            >
              <ArrowLeft className="size-4" aria-hidden /> Volver a ingresar
            </button>
          </p>
        )}
      </div>
    </AuthShell>
  )
}
