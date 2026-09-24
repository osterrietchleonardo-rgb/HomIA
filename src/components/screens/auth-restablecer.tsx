'use client'
// Recuperar contraseña (paso 2): elegir la nueva con el link del mail.
// Valida el link al entrar (vencido / usado / inválido → mensaje claro y botón para pedir otro).
// No inicia sesión: al terminar, lleva a Ingresar.
import { useEffect, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { AuthShell } from '@/components/app/auth-shell'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import { CircleAlert, Eye, EyeOff, KeyRound, Loader2, Lock } from 'lucide-react'

type Estado = 'cargando' | 'valido' | 'invalido' | 'usado' | 'vencido' | 'listo'

function problema(pw: string): string | null {
  if (pw.length < 8) return 'Tiene que tener al menos 8 caracteres'
  if (!/[a-zA-Z]/.test(pw) || !/[0-9]/.test(pw)) return 'Tiene que combinar letras y números'
  return null
}

export default function ResetScreen() {
  const route = useRoute()
  const token = route.query.token || ''
  const [estado, setEstado] = useState<Estado>('cargando')
  const [motivo, setMotivo] = useState('')
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    if (!token) {
      setEstado('invalido')
      setMotivo('Este link no es válido: pedí uno nuevo desde "¿Olvidaste tu contraseña?"')
      return
    }
    apiFetch<{ ok?: boolean; code?: string }>(`/api/auth/password/reset?token=${encodeURIComponent(token)}`, { silent: true }).then((r) => {
      if (!vivo) return
      if (r.ok) { setEstado('valido'); return }
      const code = (r.data as { code?: string } | null)?.code
      setEstado(code === 'usado' || code === 'vencido' ? code : 'invalido')
      setMotivo(r.error || 'No pudimos revisar el link. Probá de nuevo.')
    })
    return () => { vivo = false }
  }, [token])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    const p = problema(pw)
    if (p) { setError(p); return }
    if (pw !== pw2) { setError('Las dos contraseñas no coinciden'); return }
    setError(null)
    setBusy(true)
    try {
      const r = await apiFetch<{ message?: string; code?: string }>('/api/auth/password/reset', { method: 'POST', json: { token, password: pw }, silent: true })
      if (r.ok) {
        setEstado('listo')
        toast.success('Listo: ya podés ingresar con tu nueva contraseña')
        return
      }
      const code = (r.data as { code?: string } | null)?.code
      if (code === 'usado' || code === 'vencido' || code === 'invalido') {
        setEstado(code)
        setMotivo(r.error || '')
      } else {
        setError(r.error || 'No pudimos cambiar la contraseña. Probá de nuevo.')
      }
    } finally {
      setBusy(false)
    }
  }

  const campo = (id: string, label: string, value: string, set: (v: string) => void, auto: string) => (
    <div>
      <label className="text-sm font-semibold text-navy" htmlFor={id}>{label}</label>
      <div className="relative mt-1.5">
        <Lock className="pointer-events-none absolute left-3.5 top-1/2 size-4.5 -translate-y-1/2 text-slate-400" aria-hidden />
        <input
          id={id} type={show ? 'text' : 'password'} required value={value}
          onChange={(e) => { set(e.target.value); setError(null) }}
          placeholder="••••••••" autoComplete={auto}
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
    </div>
  )

  return (
    <AuthShell
      homyState={busy || estado === 'cargando' ? 'thinking' : 'happy'}
      headline={<>Elegí tu nueva <span className="homy-gradient-text">contraseña</span>.</>}
      sub="Después ingresás con tu email y la contraseña nueva. Tus datos, proyectos y pedidos quedan como estaban."
    >
      <div className="homy-glass-strong homy-stagger rounded-[28px] p-6 sm:p-8">
        <header>
          <span className="homy-eyebrow">Recuperar contraseña</span>
          <h1 className="mt-2 text-[1.9rem] font-extrabold leading-[1.15] tracking-tight text-navy">Nueva contraseña</h1>
        </header>

        {estado === 'cargando' && (
          <p className="mt-6 flex items-center gap-2 text-sm text-slate-500" role="status">
            <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Revisando el link…
          </p>
        )}

        {(estado === 'invalido' || estado === 'usado' || estado === 'vencido') && (
          <div className="mt-6 grid gap-4">
            <div role="alert" className="flex items-start gap-3 rounded-2xl border border-amber-300/70 bg-amber-50/80 p-4">
              <CircleAlert className="mt-0.5 size-5 shrink-0 text-amber-600" aria-hidden />
              <p className="text-sm font-semibold text-navy">{motivo}</p>
            </div>
            <button type="button" onClick={() => navigate('/recuperar', { replace: true })} className="homy-btn-primary w-full py-3.5 text-[15px]">
              Pedir un link nuevo
            </button>
            <button type="button" onClick={() => navigate('/ingresar', { replace: true })} className="min-h-[44px] text-sm font-bold text-[#1D63B8] hover:underline">
              Volver a ingresar
            </button>
          </div>
        )}

        {estado === 'listo' && (
          <div className="mt-6 grid gap-4" role="status" aria-live="polite">
            <div className="homy-glass-soft rounded-2xl p-4">
              <p className="text-sm font-bold text-navy">Tu contraseña se cambió.</p>
              <p className="mt-1 text-sm text-slate-500">Ahora ingresá con tu email y la contraseña nueva.</p>
            </div>
            <button type="button" onClick={() => navigate('/ingresar', { replace: true })} className="homy-btn-primary w-full py-3.5 text-[15px]">
              Ir a ingresar
            </button>
          </div>
        )}

        {estado === 'valido' && (
          <form onSubmit={submit} className="mt-6 grid gap-4" noValidate>
            {campo('reset-pw', 'Nueva contraseña', pw, setPw, 'new-password')}
            {campo('reset-pw2', 'Repetí la nueva contraseña', pw2, setPw2, 'new-password')}
            <p className="-mt-1 text-xs text-slate-500">Mínimo 8 caracteres, con letras y números.</p>
            {error && <p role="alert" className="text-sm font-semibold text-red-600">{error}</p>}
            <button type="submit" disabled={busy} className="homy-btn-primary mt-1 w-full py-3.5 text-[15px]">
              {busy ? (
                <><Loader2 className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden /> Guardando…</>
              ) : (
                <><KeyRound className="size-4.5" aria-hidden /> Guardar la nueva contraseña</>
              )}
            </button>
          </form>
        )}
      </div>
    </AuthShell>
  )
}
