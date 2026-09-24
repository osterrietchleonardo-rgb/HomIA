'use client'
// Plan del proveedor — el único rol con suscripción de pago en HomIA.
// · Al crear la cuenta: 14 días de prueba gratis
// · Plan Básico $50.000/mes: uso completo de la plataforma
// · Plan PRO $100.000/mes: logo y marca en la home + tarjeta "Recomendado" en
//   marketplace y directorio + analítica de demanda de tu zona
import { useCallback, useEffect, useRef, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { Loading } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { toast } from 'sonner'
import {
  Crown, Sparkles, Check, Clock, TrendingUp, Star, Store, ShieldCheck, CircleAlert, BadgeCheck, Loader2, RefreshCw,
} from 'lucide-react'

type PlanState = {
  plan: 'trial' | 'basic' | 'pro'
  activo: boolean
  trialDaysLeft: number | null
  trialEndsAt: string | null
  esPro: boolean
  etiqueta: string
}
type PlanData = {
  plan: PlanState
  preciosArs: { basic: number; pro: number }
  features: { basic: string[]; pro: string[] }
  trialDays: number
  mpConfigured: boolean
  businessName: string
}

async function readJson(res: Response): Promise<Record<string, any>> {
  try { return await res.json() } catch { return {} }
}

const POLL_MS = 5000
const POLL_MAX_MS = 60000

export default function ProviderPlan() {
  const route = useRoute()
  const [data, setData] = useState<PlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<'basic' | 'pro' | null>(null)
  // vuelta de Mercado Pago (?plan=ok o ?preapproval_id=…): confirmamos con polling
  const returnedFromMp = !!(route.query.plan === 'ok' || route.query.preapproval_id)
  const [confirming, setConfirming] = useState(returnedFromMp)
  const [confirmTimedOut, setConfirmTimedOut] = useState(false)
  const pollStart = useRef<number>(Date.now())

  const load = useCallback(async (): Promise<PlanData | null> => {
    try {
      const res = await fetch('/api/provider/plan')
      const d = await readJson(res)
      if (!res.ok) { setLoadError(true); return null }
      setData(d as PlanData)
      setLoadError(false)
      return d as PlanData
    } catch {
      setLoadError(true)
      return null
    } finally { setLoading(false) }
  }, [])

  useEffect(() => { void load() }, [load])

  // polling cada 5 s hasta 60 s mientras esperamos que el webhook active el plan
  useEffect(() => {
    if (!confirming) return
    pollStart.current = Date.now()
    let alive = true
    const t = setInterval(async () => {
      const d = await load()
      if (!alive) return
      if (d && (d.plan.plan === 'basic' || d.plan.plan === 'pro')) {
        setConfirming(false)
        toast.success(`Plan ${d.plan.plan === 'pro' ? 'PRO' : 'Básico'} activo`, { description: 'Tu suscripción quedó confirmada con Mercado Pago.' })
        navigate('/panel/proveedor/plan', { replace: true })
      } else if (Date.now() - pollStart.current >= POLL_MAX_MS) {
        setConfirming(false)
        setConfirmTimedOut(true)
      }
    }, POLL_MS)
    return () => { alive = false; clearInterval(t) }
  }, [confirming, load])

  async function subscribe(plan: 'basic' | 'pro') {
    setBusy(plan)
    try {
      const res = await fetch('/api/provider/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const d = await readJson(res)
      if (!res.ok) {
        if (d.needsConfig) toast.error('Las suscripciones por Mercado Pago no están disponibles por ahora', { description: 'Escribinos desde Ayuda y lo resolvemos.' })
        else toast.error(d.error || 'No pudimos iniciar la suscripción')
        return
      }
      const url = d.initPoint || d.init_point
      if (!url) { toast.error('Mercado Pago no devolvió el link de pago. Probá de nuevo'); return }
      window.location.href = url
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <Loading text="Cargando tu plan…" />
  if (!data) {
    return (
      <div className="homy-page">
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <span className="homy-empty-icon homy-chip-orange" aria-hidden><CircleAlert className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">No pudimos cargar tu plan</h3>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">{loadError ? 'Revisá tu conexión y volvé a intentar.' : 'Verificá tu sesión.'}</p>
          <button onClick={() => { setLoading(true); void load() }} className="homy-btn-primary mt-4 min-h-[44px] px-5 text-sm">
            <RefreshCw className="size-4" aria-hidden /> Reintentar
          </button>
        </div>
      </div>
    )
  }

  const { plan, preciosArs, features, trialDays } = data
  const vencido = !plan.activo

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <p className="homy-eyebrow">Mi plan</p>
        <h1 className="homy-page-title mt-1.5">Tu suscripción HomIA</h1>
        <p className="homy-page-sub">
          Los clientes y profesionales usan HomIA gratis — la suscripción es solo para proveedores:
          financia la plataforma, la IA y las búsquedas que traen clientes a tu negocio.
        </p>
      </header>

      {/* confirmación del pago al volver de Mercado Pago */}
      {confirming && (
        <section className="homy-glass rounded-2xl p-4 mb-5 flex items-center gap-3 ring-1 ring-[#1D63B8]/30" role="status" aria-live="polite">
          <Loader2 className="size-5 shrink-0 animate-spin text-[#1D63B8]" aria-hidden />
          <p className="text-[13.5px] leading-relaxed text-slate-600">
            <b>Estamos confirmando tu pago con Mercado Pago.</b> Puede demorar unos segundos: no cierres esta pantalla.
          </p>
        </section>
      )}
      {confirmTimedOut && !(plan.plan === 'basic' || plan.plan === 'pro') && (
        <section className="homy-glass rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-3 ring-1 ring-[#FFC700]/45">
          <CircleAlert className="size-5 shrink-0 text-[#B98A00]" aria-hidden />
          <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-slate-600">
            Todavía no nos llegó la confirmación de Mercado Pago. Si el pago se aprobó, el plan se activa solo en unos minutos.
          </p>
          <button onClick={() => { setConfirmTimedOut(false); setConfirming(true) }} className="homy-glass-soft min-h-[40px] rounded-full px-4 text-sm font-bold text-[#1D63B8]">
            <RefreshCw className="mr-1 inline size-4" aria-hidden /> Volver a verificar
          </button>
        </section>
      )}

      {/* estado actual */}
      <section className={`homy-glass rounded-3xl p-5 sm:p-6 mb-6 ${vencido ? 'ring-2 ring-[#FF5A1F]/40' : ''}`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-start gap-3.5 min-w-0">
            <span aria-hidden className="homy-icon-chip size-11 shrink-0 [&_svg]:size-5 homy-chip-gold"><Crown /></span>
            <div className="min-w-0">
              <p className="text-sm font-extrabold uppercase tracking-wider text-slate-400">Estado de tu cuenta</p>
              <p className="text-xl font-extrabold text-[#0A2540] tracking-tight">{plan.etiqueta}</p>
              {plan.plan === 'trial' && plan.trialDaysLeft != null && plan.trialDaysLeft > 0 && (
                <p className="mt-0.5 text-[13px] text-slate-500">
                  Termina el {new Date(plan.trialEndsAt!).toLocaleDateString('es-AR', { day: 'numeric', month: 'long' })} —
                  después elegí un plan para seguir operando sin cortes.
                </p>
              )}
              {vencido && (
                <p className="mt-0.5 text-[13px] font-bold text-[#FF5A1F]">
                  Tu prueba de {trialDays} días terminó: elegí un plan para volver a gestionar stock, pedidos y cobros.
                </p>
              )}
              {plan.esPro && <p className="mt-0.5 text-[13px] text-slate-500">Tenés todo: analítica, destacado Recomendado y sponsor en la home.</p>}
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold ring-1 ${
            vencido ? 'bg-[#FF5A1F]/10 text-[#FF5A1F] ring-[#FF5A1F]/40'
              : plan.esPro ? 'bg-[#FFC700]/15 text-[#B98A00] ring-[#FFC700]/40'
              : 'bg-[#0e9f6e]/10 text-[#0e9f6e] ring-[#0e9f6e]/30'
          }`}>
            {vencido ? <><CircleAlert className="size-3.5" aria-hidden /> Elegí tu plan</>
              : <><BadgeCheck className="size-3.5" aria-hidden /> Plan activo</>}
          </span>
        </div>
      </section>

      {/* comparación de planes */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <PlanCard
          nombre="Básico"
          ars={preciosArs.basic}
          desc="Para vender en HomIA con todo lo esencial."
          features={features.basic}
          icon={<Store className="size-5" aria-hidden />}
          chip="homy-chip-blue"
          actual={plan.plan === 'basic'}
          destacado={false}
          busy={busy === 'basic'}
          disabled={busy !== null || confirming}
          mpConfigured={data.mpConfigured}
          ctaActual="Tu plan actual"
          cta="Elegir Básico"
          onSubscribe={() => subscribe('basic')}
        />
        <PlanCard
          nombre="PRO"
          ars={preciosArs.pro}
          desc="Máxima visibilidad + inteligencia de demanda para tu negocio."
          features={features.pro}
          icon={<Sparkles className="size-5" aria-hidden />}
          chip="homy-chip-gold"
          actual={plan.plan === 'pro'}
          destacado
          busy={busy === 'pro'}
          disabled={busy !== null || confirming}
          mpConfigured={data.mpConfigured}
          ctaActual="Tu plan actual"
          cta="Pasarme a PRO"
          onSubscribe={() => subscribe('pro')}
        />
      </div>

      {/* qué es cada beneficio del PRO */}
      <section className="homy-glass rounded-3xl p-5 sm:p-6 mb-6">
        <h2 className="homy-section-title">
          <span aria-hidden className="homy-icon-chip homy-chip-gold size-8 shrink-0 [&_svg]:size-4"><TrendingUp /></span>
          ¿Qué desbloquea el PRO?
        </h2>
        <div className="mt-4 grid gap-3 sm:grid-cols-3">
          <Benefit
            icon={<TrendingUp className="size-4" aria-hidden />}
            title="Analítica de demanda"
            desc="Qué elementos se piden más en tu zona, cuántas consultas hubo sobre tu rubro y qué búsquedas te encontraron. Decidís qué reponer con datos, no a ojo."
          />
          <Benefit
            icon={<Star className="size-4" aria-hidden />}
            title="Tarjeta Recomendado"
            desc="Tu negocio encabeza el directorio y el marketplace de materiales con una tarjeta dorada destacada y la etiqueta “Recomendado”."
          />
          <Benefit
            icon={<Crown className="size-4" aria-hidden />}
            title="Sponsor en la home"
            desc="Tu logo y marca aparecen en la portada de HomIA como proveedor sponsor de nuestra confianza."
          />
        </div>
      </section>

      {/* confianza / factura */}
      <section className="homy-glass-soft rounded-2xl p-4 flex items-start gap-3">
        <ShieldCheck className="mt-0.5 size-5 shrink-0 text-[#0e9f6e]" aria-hidden />
        <p className="text-[13px] leading-relaxed text-slate-600">
          La suscripción se cobra <b>mensualmente por Mercado Pago</b> y la cancelás cuando quieras desde tu cuenta de MP.
          Si se cancela, tu negocio vuelve a estado de prueba finalizada — tus datos, reseñas y vinculaciones se conservan.
          ¿Dudas? Escribinos desde el botón <b>?</b> de abajo.
        </p>
      </section>
    </div>
  )
}

function PlanCard({ nombre, ars, desc, features, icon, chip, actual, destacado, busy, disabled, mpConfigured, ctaActual, cta, onSubscribe }: {
  nombre: string; ars: number; desc: string; features: string[]
  icon: React.ReactNode; chip: string
  actual: boolean; destacado: boolean; busy: boolean; disabled: boolean; mpConfigured: boolean
  ctaActual: string; cta: string; onSubscribe: () => void
}) {
  return (
    <article className={`homy-glass relative overflow-hidden rounded-3xl p-5 sm:p-6 ${destacado ? 'ring-2 ring-[#FFC700]/60' : ''}`}>
      {destacado && (
        <span className="absolute top-4 right-4 rounded-full bg-gradient-to-r from-[#FFC700] to-[#ffd84d] px-3 py-1 text-[10px] font-extrabold uppercase tracking-widest text-[#6b4d00] shadow-sm">
          Más visibilidad
        </span>
      )}
      <div className="flex items-center gap-3">
        <span aria-hidden className={`homy-icon-chip size-11 shrink-0 [&_svg]:size-5 ${chip}`}>{icon}</span>
        <div>
          <h3 className="text-lg font-extrabold tracking-tight text-[#0A2540]">Plan {nombre}</h3>
          <p className="text-[13px] text-slate-500">{desc}</p>
        </div>
      </div>
      <p className="mt-4 flex flex-wrap items-baseline gap-x-2">
        <span className="homy-num-adapt text-4xl font-extrabold tracking-tight text-[#0A2540] tabular-nums">{formatARS(ars)}</span>
        <span className="text-sm font-bold text-slate-400">/ mes</span>
        <span className="w-full text-[11.5px] text-slate-400">Se cobra por Mercado Pago, en pesos.</span>
      </p>
      <ul className="mt-4 space-y-2">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2 text-[13.5px] leading-relaxed text-slate-600">
            <Check className="mt-0.5 size-4 shrink-0 text-[#0e9f6e]" aria-hidden />
            <span className="min-w-0">{f}</span>
          </li>
        ))}
      </ul>
      {actual ? (
        <button disabled className="homy-btn-dark mt-5 w-full min-h-[48px] cursor-default text-[15px] opacity-70">
          <Check className="size-4" aria-hidden /> {ctaActual}
        </button>
      ) : (
        <button
          onClick={onSubscribe}
          disabled={disabled}
          className={`mt-5 w-full min-h-[48px] text-[15px] ${destacado ? 'homy-btn-primary' : 'homy-btn-dark'} disabled:opacity-50`}
        >
          {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Clock className="size-4" aria-hidden />} {busy ? 'Abriendo Mercado Pago…' : cta}
        </button>
      )}
      {!mpConfigured && !actual && (
        <p className="mt-2 text-center text-[11px] text-slate-400">Las suscripciones por Mercado Pago no están disponibles por ahora.</p>
      )}
    </article>
  )
}

function Benefit({ icon, title, desc }: { icon: React.ReactNode; title: string; desc: string }) {
  return (
    <div className="rounded-2xl bg-[#0A2540]/3 p-4">
      <p className="flex items-center gap-2 text-sm font-extrabold text-[#0A2540]">
        <span aria-hidden className="homy-icon-chip homy-chip-gold size-7 shrink-0 [&_svg]:size-3.5">{icon}</span>
        {title}
      </p>
      <p className="mt-1.5 text-[12.5px] leading-relaxed text-slate-500">{desc}</p>
    </div>
  )
}

/** Aviso pegado arriba del dashboard del proveedor: cuenta regresiva o prueba vencida. */
export function TrialExpiredBanner({ daysLeft, preciosArs }: { daysLeft: number | null; preciosArs?: { basic: number; pro: number } }) {
  const basic = formatARS(preciosArs?.basic ?? 50000)
  const pro = formatARS(preciosArs?.pro ?? 100000)
  if (daysLeft != null && daysLeft > 0) {
    return (
      <section className="homy-glass rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-3 ring-1 ring-[#FFC700]/45">
        <span aria-hidden className="homy-icon-chip homy-chip-gold size-10 shrink-0 [&_svg]:size-5"><Clock /></span>
        <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-slate-600">
          <b>Prueba gratis:</b> te quedan <b>{daysLeft} día{daysLeft === 1 ? '' : 's'}</b> con todos los beneficios. Después elegí el
          Básico ({basic}/mes) o el PRO ({pro}/mes) para seguir vendiendo.
        </p>
        <button onClick={() => navigate('/panel/proveedor/plan')} className="homy-btn-primary min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
          <Crown className="size-4" aria-hidden /> Ver planes
        </button>
      </section>
    )
  }
  return (
    <section className="homy-glass rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-3 ring-2 ring-[#FF5A1F]/40">
      <span aria-hidden className="homy-icon-chip size-10 shrink-0 [&_svg]:size-5" style={{ background: 'linear-gradient(140deg, #ffedd5 0%, #fed7aa 100%)', color: '#c2410c' }}><CircleAlert /></span>
      <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-slate-600">
        <b>Tu prueba gratis terminó.</b> Para volver a gestionar stock, pedidos y cobros elegí tu plan:
        Básico <b>{basic}/mes</b> o PRO <b>{pro}/mes</b>.
      </p>
      <button onClick={() => navigate('/panel/proveedor/plan')} className="homy-btn-primary min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
        <Crown className="size-4" aria-hidden /> Elegir plan
      </button>
    </section>
  )
}
