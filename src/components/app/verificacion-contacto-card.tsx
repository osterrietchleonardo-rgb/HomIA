'use client'
// "Email y celular" en Mi perfil de los tres roles (D26): estado verificado / sin verificar, como
// las insignias del DNI, y verificar después con un código de 6 números. Las cuentas creadas
// antes de D26 quedan "sin verificar" y pueden seguir usando HomIA; acá lo verifican cuando quieran.
// El celular solo se puede verificar si HomIA tiene proveedor de SMS/WhatsApp (hoy no): se dice
// la verdad, nunca se simula un código.
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'sonner'
import { BadgeCheck, CircleAlert, Loader2, Mail, RotateCw, ShieldAlert, Smartphone } from 'lucide-react'
import { useSession } from '@/lib/store'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { CODIGO } from '@/lib/registro'

type Estado = {
  disponible: { email: boolean; celular: boolean; nombreCanalCelular: string | null }
  cuenta: {
    email: string
    emailVerificado: boolean
    celular: string | null
    celularNormalizado: boolean
    celularVerificado: boolean
  } | null
}

type Canal = 'email' | 'celular'

export function VerificacionContactoCard() {
  const { user } = useSession()
  const [estado, setEstado] = useState<Estado | null>(null)
  const [abierto, setAbierto] = useState<Canal | null>(null)
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

  async function enviar(canal: Canal) {
    setEnviando(true)
    setError(null)
    try {
      const res = await fetch('/api/auth/verificacion/enviar', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal, proposito: 'cuenta' }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok && d.yaVerificado) { await cargar(); setAbierto(null); return }
      if (res.ok) {
        setAbierto(canal); setCodigo(''); setMuerto(false); setReenviarEn(d.reenviarEnSeg || CODIGO.reenvioSeg)
        return
      }
      if (res.status === 429 && d.esperarSeg) { setAbierto(canal); setReenviarEn(Math.min(3600, d.esperarSeg)) }
      setError(d.error || 'No pudimos mandar el código. Probá de nuevo.')
      if (res.status !== 429) setAbierto(canal)
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
        body: JSON.stringify({ canal: abierto, proposito: 'cuenta', codigo: valor }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        toast.success(abierto === 'email' ? '¡Email verificado!' : '¡Celular verificado!')
        setAbierto(null)
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

  const fila = (canal: Canal) => {
    const esEmail = canal === 'email'
    const verificado = esEmail ? c.emailVerificado : c.celularVerificado
    const valor = esEmail ? c.email : c.celular
    const puede = esEmail ? disp.email : disp.celular && !!c.celular && c.celularNormalizado
    return (
      <li className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0 last:pb-0">
        <span className={`homy-icon-chip size-9 shrink-0 !rounded-xl [&_svg]:size-4.5 ${verificado ? 'homy-chip-mint' : 'homy-chip-gold'}`} aria-hidden>
          {esEmail ? <Mail /> : <Smartphone />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-[#0A2540]">
            {esEmail ? 'Email' : 'Celular'}
            {verificado ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-[#0e9f6e] ring-1 ring-emerald-500/30">
                <BadgeCheck className="size-3" aria-hidden /> Verificado
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-[#FFC700]/12 px-2 py-0.5 text-[9.5px] font-extrabold uppercase tracking-wider text-[#8a6d00] ring-1 ring-[#FFC700]/40">
                <ShieldAlert className="size-3" aria-hidden /> Sin verificar
              </span>
            )}
          </span>
          <span className="mt-0.5 block break-all text-[12.5px] leading-snug text-slate-500">
            {valor || 'Sin cargar: escribilo en tus datos y guardá'}
            {!esEmail && valor && !c.celularNormalizado && ' · revisalo: no es un celular válido'}
          </span>
          {!esEmail && !verificado && valor && c.celularNormalizado && !disp.celular && (
            <span className="mt-1 block text-[11.5px] leading-snug text-slate-400">
              Todavía no podemos mandar códigos por SMS ni WhatsApp: tu celular queda sin verificar por ahora.
            </span>
          )}
        </span>
        {!verificado && puede && abierto !== canal && (
          <button type="button" onClick={() => enviar(canal)} disabled={enviando}
            className="homy-btn-dark min-h-[40px] px-4 text-sm disabled:opacity-60">
            {enviando ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : null} Verificar
          </button>
        )}
      </li>
    )
  }

  return (
    <section className="homy-glass rounded-2xl p-4 sm:p-5" aria-label="Email y celular">
      <h2 className="text-sm font-extrabold text-[#0A2540]">Email y celular</h2>
      <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">Así sabemos que te llegan los avisos y que el dato es tuyo.</p>
      <ul className="mt-3 divide-y divide-[#0A2540]/5">
        {fila('email')}
        {fila('celular')}
      </ul>

      {abierto && (
        <div className="mt-3 rounded-2xl bg-white/60 p-4">
          <p className="text-[13px] leading-relaxed text-slate-600">
            Te mandamos un código de 6 números {abierto === 'email' ? <>a <b className="break-all text-navy">{c.email}</b></> : <>por {disp.nombreCanalCelular || 'SMS'} a <b className="whitespace-nowrap text-navy">{c.celular}</b></>}.
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
              <button type="button" onClick={() => enviar(abierto)} disabled={enviando}
                className="inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-[#1D63B8] hover:bg-[#1D63B8]/5">
                <RotateCw className="size-4" aria-hidden /> Código nuevo
              </button>
            )}
            <button type="button" onClick={() => { setAbierto(null); setError(null) }} className="min-h-[40px] rounded-xl px-3 text-sm font-bold text-slate-500 hover:bg-navy/5">
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
