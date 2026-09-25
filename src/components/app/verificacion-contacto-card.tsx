'use client'
// "Email y celular" en Mi perfil de los tres roles (D26): el email con su estado verificado / sin
// verificar, como las insignias del DNI, y "Verificar ahora" con un código de 6 números por mail.
// Las cuentas creadas antes de D26 quedan "sin verificar" y pueden seguir usando HomIA; acá lo
// verifican cuando quieran. El celular se muestra estandarizado, SIN estado de verificación: no se
// verifica por código, solo se estandariza con país (Leonardo, 25/09/2026).
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BadgeCheck, CircleAlert, Loader2, Mail, RotateCw, ShieldAlert, Smartphone } from 'lucide-react'
import { useSession } from '@/lib/store'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { CODIGO } from '@/lib/registro'

type Estado = {
  disponible: { email: boolean }
  cuenta: {
    email: string
    emailVerificado: boolean
    celular: string | null
    celularNormalizado: boolean
  } | null
}

export function VerificacionContactoCard() {
  const { user } = useSession()
  const [estado, setEstado] = useState<Estado | null>(null)
  const [abierto, setAbierto] = useState(false)
  const [codigo, setCodigo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [muerto, setMuerto] = useState(false)
  const [reenviarEn, setReenviarEn] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [comprobando, setComprobando] = useState(false)

  const cargar = useCallback(async () => {
    try {
      const r = await fetch('/api/auth/verificacion', { cache: 'no-store' })
      if (r.ok) setEstado(await r.json())
    } catch { /* sin red: la tarjeta no se muestra */ }
  }, [])
  // se recarga cuando cambia la sesión (p. ej. después de guardar el perfil con otro celular)
  useEffect(() => { cargar() }, [cargar, user])
  useEffect(() => {
    if (reenviarEn <= 0) return
    const t = setTimeout(() => setReenviarEn((s) => Math.max(0, s - 1)), 1000)
    return () => clearTimeout(t)
  }, [reenviarEn])

  async function enviar() {
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/verificacion/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal: 'email', proposito: 'cuenta' }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.yaVerificado) { await cargar(); setAbierto(false); return }
      if (res.ok) {
        setAbierto(true); setCodigo(''); setMuerto(false); setReenviarEn(d.reenviarEnSeg || CODIGO.reenvioSeg)
        return
      }
      if (res.status === 429 && d.esperarSeg) { setAbierto(true); setReenviarEn(Math.min(3600, d.esperarSeg)) }
      setError(d.error || 'No pudimos mandar el código. Probá de nuevo.')
      if (res.status !== 429) setAbierto(true)
    } catch {
      setError('No hay conexión. Revisá internet y probá de nuevo.')
    } finally {
      setEnviando(false)
    }
  }

  async function comprobar(valor = codigo) {
    if (!abierto || !/^\d{6}$/.test(valor) || comprobando) return
    setComprobando(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/verificacion/comprobar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal: 'email', proposito: 'cuenta', codigo: valor }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success('¡Email verificado!')
        setAbierto(false)
        await cargar()
        return
      }
      setCodigo('')
      setError(d.error || 'No pudimos comprobar el código.')
      if (['vencido', 'agotado', 'usado', 'sin_codigo'].includes(d.motivo)) setMuerto(true)
    } catch {
      setError('No hay conexión. Revisá internet y probá de nuevo.')
    } finally {
      setComprobando(false)
    }
  }

  if (!estado?.cuenta) return null
  const c = estado.cuenta
  const disp = estado.disponible

  return (
    <section className="homy-glass rounded-2xl p-4 sm:p-5" aria-label="Email y celular">
      <h2 className="text-sm font-extrabold text-[#0A2540]">Email y celular</h2>
      <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">Así sabemos que te llegan los avisos y cómo contactarte.</p>
      <ul className="mt-3 divide-y divide-[#0A2540]/5">
        <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
          <span className={`homy-icon-chip size-9 shrink-0 !rounded-xl [&_svg]:size-4.5 ${c.emailVerificado ? 'homy-chip-mint' : 'homy-chip-gold'}`} aria-hidden>
            <Mail />
          </span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-[#0A2540]">
              Email
              {c.emailVerificado ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-[#0e9f6e] ring-1 ring-emerald-500/30">
                  <BadgeCheck className="size-3" aria-hidden /> Verificado
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 rounded-full bg-[#FFC700]/12 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-[#8a6d00] ring-1 ring-[#FFC700]/40">
                  <ShieldAlert className="size-3" aria-hidden /> Sin verificar
                </span>
              )}
            </span>
            <span className="mt-0.5 block break-all text-[12.5px] leading-snug text-slate-500">{c.email}</span>
          </span>
          {!c.emailVerificado && disp.email && !abierto && (
            <button type="button" onClick={() => enviar()} disabled={enviando} data-track="verificar email desde el perfil"
              className="homy-btn-dark min-h-[40px] px-4 text-sm disabled:opacity-60">
              {enviando ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null} Verificar ahora
            </button>
          )}
        </li>
        <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
          <span className="homy-icon-chip homy-chip-blue size-9 shrink-0 !rounded-xl [&_svg]:size-4.5" aria-hidden>
            <Smartphone />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-sm font-extrabold text-[#0A2540]">Celular</span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-500">
              {c.celular ? <span className="whitespace-nowrap">{c.celular}</span> : 'Sin cargar: escribilo en tus datos y guardá'}
              {c.celular && !c.celularNormalizado && ' · revisalo: no es un celular válido'}
            </span>
          </span>
        </li>
      </ul>

      {abierto && (
        <div className="mt-3 rounded-2xl bg-white/60 p-4">
          <p className="text-[13px] leading-relaxed text-slate-600">
            Te mandamos un código de 6 números a <b className="break-all text-navy">{c.email}</b>.
          </p>
          <div className="mt-3 flex justify-center">
            <InputOTP
              maxLength={CODIGO.digitos} value={codigo}
              onChange={(v) => { setCodigo(v.replace(/\D/g, '')); if (error && !muerto) setError(null) }}
              onComplete={(v: string) => comprobar(v)}
              inputMode="numeric" autoComplete="one-time-code" pattern="^[0-9]*$"
              disabled={comprobando || muerto} aria-label="Código de 6 números" autoFocus
            >
              <InputOTPGroup>
                {Array.from({ length: CODIGO.digitos }, (_, i) => (
                  <InputOTPSlot key={i} index={i} className="h-12 w-11 bg-white text-xl font-extrabold text-navy" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
            <button type="button" onClick={() => comprobar()} disabled={codigo.length !== CODIGO.digitos || comprobando || muerto}
              className="homy-btn-primary min-h-[40px] px-5 text-sm disabled:opacity-60">
              {comprobando ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null} Confirmar
            </button>
            {reenviarEn > 0 ? (
              <span className="text-[12.5px] text-slate-500" aria-live="polite">Otro código en <b className="tabular-nums">{Math.floor(reenviarEn / 60)}:{String(reenviarEn % 60).padStart(2, '0')}</b></span>
            ) : (
              <button type="button" onClick={() => enviar()} disabled={enviando} data-track="pedir otro código del email"
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-[#1D63B8] hover:bg-[#1D63B8]/5">
                <RotateCw className="size-4" aria-hidden /> Código nuevo
              </button>
            )}
            <button type="button" onClick={() => { setAbierto(false); setError(null) }} className="min-h-[40px] rounded-xl px-3 text-sm font-bold text-slate-500 hover:bg-navy/5">
              Cancelar
            </button>
          </div>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-2 flex items-start gap-1.5 text-[13px] font-semibold text-red-600">
          <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {error}
        </p>
      )}
    </section>
  )
}
