'use client'
// Plan del proveedor — el único rol con suscripción de pago en HomIA.
// · Al crear la cuenta: 14 días de prueba gratis
// · Plan Básico US$50/mes: uso completo de la plataforma
// · Plan PRO US$100/mes: analítica del negocio + tarjeta "Recomendado" en
//   primera fila del directorio/marketplace + logo y marca en la home (sponsor)
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { Loading } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { toast } from 'sonner'
import {
  Crown, Sparkles, Check, Clock, TrendingUp, Star, Store, ShieldCheck, CircleAlert, BadgeCheck,
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
  precios: { basic: number; pro: number }
  preciosArs: { basic: number; pro: number }
  features: { basic: string[]; pro: string[] }
  trialDays: number
  mpConfigured: boolean
  businessName: string
}

export default function ProviderPlan() {
  const [data, setData] = useState<PlanData | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<'basic' | 'pro' | null>(null)

  async function load() {
    try {
      const res = await fetch('/api/provider/plan')
      if (res.ok) setData(await res.json())
    } finally { setLoading(false) }
  }
  useEffect(() => { void load() }, [])

  async function subscribe(plan: 'basic' | 'pro') {
    setBusy(plan)
    try {
      const res = await fetch('/api/provider/plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const d = await res.json()
      if (!res.ok) {
        if (d.needsConfig) {
          toast.error('Mercado Pago no está configurado en el servidor', { description: 'Agregá MP_ACCESS_TOKEN al .env y reiniciá.' })
        } else {
          toast.error(d.error)
        }
        return
      }
      window.open(d.initPoint, '_blank')
      toast.info(`Te abrimos Mercado Pago para el plan ${plan === 'pro' ? 'PRO' : 'Básico'}`, {
        description: 'Cuando se apruebe la suscripción, el plan se activa solo en tu cuenta.',
      })
      void load()
    } finally {
      setBusy(null)
    }
  }

  if (loading) return <Loading text="Cargando tu plan…" />
  if (!data) {
    return (
      <div className="homy-page">
        <p className="homy-page-sub">No pudimos cargar tu plan. Verificá tu sesión.</p>
      </div>
    )
  }

  const { plan, precios, preciosArs, features, trialDays } = data
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
          usd={precios.basic}
          ars={preciosArs.basic}
          desc="Para vender en HomIA con todo lo esencial."
          features={features.basic}
          icon={<Store className="size-5" aria-hidden />}
          chip="homy-chip-blue"
          actual={plan.plan === 'basic'}
          destacado={false}
          busy={busy === 'basic'}
          mpConfigured={data.mpConfigured}
          ctaActual="Tu plan actual"
          cta="Elegir Básico"
          onSubscribe={() => subscribe('basic')}
        />
        <PlanCard
          nombre="PRO"
          usd={precios.pro}
          ars={preciosArs.pro}
          desc="Máxima visibilidad + inteligencia de demanda para tu negocio."
          features={features.pro}
          icon={<Sparkles className="size-5" aria-hidden />}
          chip="homy-chip-gold"
          actual={plan.plan === 'pro'}
          destacado
          busy={busy === 'pro'}
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
            title="Analítica del negocio"
            desc="Qué elementos se piden más, cuántas consultas hubo sobre tu rubro y qué búsquedas te encontraron. Decidís qué reponer con datos, no a ojo."
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
          La suscripción se cobra <b>mensualmente por Mercado Pago</b> y podés cancelarla cuando quieras desde tu cuenta de MP.
          Si se cancela, tu negocio vuelve a estado de prueba finalizada — tus datos, reseñas y vinculaciones se conservan.
          ¿Dudas? Escribinos desde el botón <b>?</b> de abajo.
        </p>
      </section>
    </div>
  )
}

function PlanCard({ nombre, usd, ars, desc, features, icon, chip, actual, destacado, busy, mpConfigured, ctaActual, cta, onSubscribe }: {
  nombre: string; usd: number; ars: number; desc: string; features: string[]
  icon: React.ReactNode; chip: string
  actual: boolean; destacado: boolean; busy: boolean; mpConfigured: boolean
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
        <span className="text-4xl font-extrabold tracking-tight text-[#0A2540]">US${usd}</span>
        <span className="text-sm font-bold text-slate-400">/ mes</span>
        <span className="w-full text-[11.5px] text-slate-400">≈ {formatARS(ars)} por mes (Mercado Pago)</span>
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
          disabled={busy}
          className={`mt-5 w-full min-h-[48px] text-[15px] ${destacado ? 'homy-btn-primary' : 'homy-btn-dark'} disabled:opacity-50`}
        >
          <Clock className="size-4" aria-hidden /> {busy ? 'Abriendo Mercado Pago…' : cta}
        </button>
      )}
      {!mpConfigured && !actual && (
        <p className="mt-2 text-center text-[11px] text-slate-400">(El cobro necesita MP_ACCESS_TOKEN configurado en el servidor)</p>
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

/** Aviso pegado arriba del dashboard del proveedor cuando el trial está vencido. */
export function TrialExpiredBanner({ daysLeft }: { daysLeft: number | null }) {
  if (daysLeft != null && daysLeft > 0) {
    return (
      <section className="homy-glass rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-3 ring-1 ring-[#FFC700]/45">
        <span aria-hidden className="homy-icon-chip homy-chip-gold size-10 shrink-0 [&_svg]:size-5"><Clock /></span>
        <p className="min-w-0 flex-1 text-[13.5px] leading-relaxed text-slate-600">
          <b>Prueba gratis:</b> te quedan <b>{daysLeft} día{daysLeft === 1 ? '' : 's'}</b> con todos los beneficios. Después elegí el
          Básico (US$50/mes) o el PRO (US$100/mes) para seguir vendiendo.
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
        Básico <b>US$50/mes</b> o PRO <b>US$100/mes</b>.
      </p>
      <button onClick={() => navigate('/panel/proveedor/plan')} className="homy-btn-primary min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
        <Crown className="size-4" aria-hidden /> Elegir plan
      </button>
    </section>
  )
}
