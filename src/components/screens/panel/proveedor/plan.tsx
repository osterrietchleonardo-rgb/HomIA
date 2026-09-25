'use client'
// Plan del proveedor — el único rol con suscripción de pago en HomIA.
// · Al crear la cuenta: 14 días de prueba gratis
// · Plan Básico $50.000/mes: uso completo de la plataforma
// · Plan PRO $100.000/mes: logo y marca en la home + tarjeta "Recomendado" en
//   marketplace y directorio + analítica de demanda de tu zona
// · D33: se cancela desde acá o desde Mercado Pago → Suscripciones (da lo mismo); no se vuelve a
//   cobrar, lo pagado no se reintegra y el plan sigue hasta el fin del período pago. Elegir un plan
//   durante la prueba no se come los días gratis: el primer cobro es al terminar la prueba.
import { useCallback, useEffect, useRef, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { Loading } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  Crown, Sparkles, Check, Clock, TrendingUp, Star, Store, ShieldCheck, CircleAlert, BadgeCheck, Loader2, RefreshCw, CalendarClock, XCircle,
} from 'lucide-react'

type PlanState = {
  plan: 'trial' | 'basic' | 'pro'
  activo: boolean
  trialDaysLeft: number | null
  trialEndsAt: string | null
  esPro: boolean
  etiqueta: string
  cancelado: boolean
  accesoHasta: string | null
  primerCobro: string | null
  motivoInactivo: 'prueba_terminada' | 'plan_vencido' | null
  vencioEl: string | null
}
type PlanData = {
  plan: PlanState
  preciosArs: { basic: number; pro: number }
  features: { basic: string[]; pro: string[] }
  trialDays: number
  mpConfigured: boolean
  businessName: string
  puedeCancelar: boolean
  /** si cancela hoy, sigue con su plan hasta este día (fin del período pago); null = no hay período pago */
  finPeriodo: string | null
  /** si elige un plan ahora, el primer cobro es este día (null = en el momento) */
  primerCobroSiElige: string | null
}

/** "25/10" en hora de Argentina (UTC-3 fijo). */
function fechaCorta(iso: string): string {
  const x = new Date(new Date(iso).getTime() - 3 * 3600_000)
  return `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}`
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
  const [busy, setBusy] = useState<'basic' | 'pro' | 'cancelar' | null>(null)
  const [cancelOpen, setCancelOpen] = useState(false)
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
      if (d && (d.plan.plan === 'basic' || d.plan.plan === 'pro') && !d.plan.cancelado) {
        setConfirming(false)
        toast.success(
          d.plan.primerCobro ? `Plan ${d.plan.plan === 'pro' ? 'PRO' : 'Básico'} activado · primer cobro el ${fechaCorta(d.plan.primerCobro)}` : `Plan ${d.plan.plan === 'pro' ? 'PRO' : 'Básico'} activo`,
          { description: d.plan.primerCobro ? 'Seguís en tu prueba gratis: Mercado Pago te cobra recién ese día.' : 'Tu suscripción quedó confirmada con Mercado Pago.' },
        )
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

  async function cancelar() {
    setBusy('cancelar')
    try {
      const res = await fetch('/api/provider/plan/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirmar: true }),
      })
      const d = await readJson(res)
      if (!res.ok) { toast.error(d.error || 'No pudimos cancelar la suscripción'); return }
      setCancelOpen(false)
      toast.success('Cancelaste tu suscripción', {
        description: d.accesoHasta ? `No se te vuelve a cobrar. Seguís con tu plan hasta el ${fechaCorta(d.accesoHasta)}.` : 'No se te vuelve a cobrar.',
      })
      await load()
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

  const { plan, preciosArs, features } = data
  const vencido = !plan.activo
  const planPago = plan.plan === 'basic' || plan.plan === 'pro'
  const nombrePlan = plan.plan === 'pro' ? 'PRO' : 'Básico'

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <p className="homy-eyebrow">Mi plan</p>
          <h1 className="homy-page-title mt-1.5">Tu suscripción HomIA</h1>
          <p className="homy-page-sub">
            Los clientes y profesionales usan HomIA gratis — la suscripción es solo para proveedores:
            financia la plataforma, la IA y las búsquedas que traen clientes a tu negocio.
          </p>
        </div>
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
      {confirmTimedOut && !(planPago && !plan.cancelado) && (
        <section className="homy-glass rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-3 ring-1 ring-[#FFC700]/45">
          <CircleAlert className="size-5 shrink-0 text-[#B98A00]" aria-hidden />
          <p className="min-w-0 flex-[1_1_14rem] text-[13.5px] leading-relaxed text-slate-600">
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
                  Termina el {fechaCorta(plan.trialEndsAt!)}. Si elegís un plan ahora, no perdés los días que te quedan:
                  el primer cobro es el {fechaCorta(plan.trialEndsAt!)}, cuando termina tu prueba.
                </p>
              )}
              {planPago && !plan.cancelado && plan.primerCobro && (
                <p className="mt-0.5 text-[13px] text-slate-500">
                  Seguís en tu prueba gratis: no se te cobró nada todavía. Mercado Pago te cobra el primer mes el {fechaCorta(plan.primerCobro)}.
                </p>
              )}
              {planPago && plan.cancelado && plan.activo && plan.accesoHasta && (
                <p className="mt-0.5 text-[13px] text-slate-500">
                  Cancelaste la suscripción: no se te vuelve a cobrar. Seguís con tu plan {nombrePlan} hasta el {fechaCorta(plan.accesoHasta)}{' '}
                  (el fin del período que pagaste); después tu stock deja de verse hasta que elijas un plan.
                </p>
              )}
              {vencido && (
                <p className="mt-0.5 text-[13px] font-bold text-[#FF5A1F]">
                  {plan.motivoInactivo === 'plan_vencido'
                    ? `Tu plan venció${plan.vencioEl ? ` el ${fechaCorta(plan.vencioEl)}` : ''}`
                    : `Tu prueba gratis terminó${plan.vencioEl ? ` el ${fechaCorta(plan.vencioEl)}` : ''}`}
                  : tus productos no se ven en HomIA. Podés terminar las ventas que ya tenés; elegí un plan para volver a vender.
                </p>
              )}
              {plan.esPro && plan.activo && <p className="mt-0.5 text-[13px] text-slate-500">Tenés todo: analítica, destacado Recomendado y sponsor en la home.</p>}
            </div>
          </div>
          <span className={`inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-extrabold ring-1 ${
            vencido ? 'bg-[#FF5A1F]/10 text-[#FF5A1F] ring-[#FF5A1F]/40'
              : plan.esPro ? 'bg-[#FFC700]/15 text-[#B98A00] ring-[#FFC700]/40'
              : 'bg-[#0e9f6e]/10 text-[#0e9f6e] ring-[#0e9f6e]/30'
          }`}>
            {vencido ? <><CircleAlert className="size-3.5" aria-hidden /> Elegí tu plan</>
              : plan.cancelado && plan.accesoHasta ? <><CalendarClock className="size-3.5" aria-hidden /> Activo hasta el {fechaCorta(plan.accesoHasta)}</>
              : <><BadgeCheck className="size-3.5" aria-hidden /> Plan activo</>}
          </span>
        </div>
        {data.puedeCancelar && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[#0A2540]/8 pt-4">
            <p className="min-w-0 flex-[1_1_16rem] text-[12.5px] leading-relaxed text-slate-500">
              ¿Querés dejar de pagar? Cancelás acá o en Mercado Pago → Suscripciones: da lo mismo.
            </p>
            <button
              data-track="plan: abrir cancelar suscripción"
              onClick={() => setCancelOpen(true)}
              disabled={busy !== null}
              className="homy-glass-soft inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm font-bold text-[#c2410c] ring-1 ring-[#FF5A1F]/30 disabled:opacity-50"
            >
              <XCircle className="size-4" aria-hidden /> Cancelar suscripción
            </button>
          </div>
        )}
      </section>

      {/* antes de ir a Mercado Pago: cuándo es el primer cobro */}
      {(!planPago || plan.cancelado) && data.primerCobroSiElige && (
        <section className="homy-glass-soft rounded-2xl p-4 mb-5 flex items-start gap-3 ring-1 ring-[#1D63B8]/20">
          <CalendarClock className="mt-0.5 size-5 shrink-0 text-[#1D63B8]" aria-hidden />
          <p className="text-[13px] leading-relaxed text-slate-600">
            {plan.cancelado
              ? <>Si volvés a suscribirte, <b>tu primer cobro será el {fechaCorta(data.primerCobroSiElige)}</b>, cuando termina lo que ya pagaste.</>
              : <>Si elegís un plan ahora, <b>tu primer cobro será el {fechaCorta(data.primerCobroSiElige)}</b>, cuando termina tu prueba. Mercado Pago valida tu tarjeta hoy y no te cobra nada hasta ese día.</>}
          </p>
        </section>
      )}

      {/* diálogo: cancelar suscripción */}
      <AlertDialog open={cancelOpen} onOpenChange={(o) => { if (busy !== 'cancelar') setCancelOpen(o) }}>
        <AlertDialogContent className="homy-glass-strong rounded-3xl">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[#0A2540]">¿Cancelás tu suscripción?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-left text-[13.5px] leading-relaxed text-slate-600">
                <p>· No se te vuelve a cobrar.</p>
                {data.finPeriodo ? (
                  <>
                    <p>· Lo que ya pagaste no se devuelve, pero <b>seguís con tu plan {nombrePlan} hasta el {fechaCorta(data.finPeriodo)}</b>, el fin del período que pagaste.</p>
                    <p>· Después, tu stock deja de verse en HomIA hasta que elijas un plan. No se borra nada: podés terminar las ventas que tengas.</p>
                  </>
                ) : plan.primerCobro ? (
                  <p>· Todavía no se te cobró nada: <b>seguís en tu prueba gratis hasta el {fechaCorta(plan.primerCobro)}</b>. Después, elegí un plan para seguir vendiendo.</p>
                ) : (
                  <p>· No tenés un período pago vigente: tu plan termina ahora y tu stock deja de verse hasta que elijas un plan. No se borra nada.</p>
                )}
                <p>· También podés cancelarla desde Mercado Pago → Suscripciones: da lo mismo.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy === 'cancelar'} className="min-h-[44px] rounded-xl" data-track="plan: seguir con la suscripción">Seguir con mi plan</AlertDialogCancel>
            <AlertDialogAction
              data-track="plan: confirmar cancelar suscripción"
              disabled={busy === 'cancelar'}
              onClick={(e) => { e.preventDefault(); void cancelar() }}
              className="min-h-[44px] rounded-xl bg-[#c2410c] text-white hover:bg-[#9a3412]"
            >
              {busy === 'cancelar' ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <XCircle className="size-4" aria-hidden />}
              Sí, cancelar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* comparación de planes */}
      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <PlanCard
          nombre="Básico"
          ars={preciosArs.basic}
          desc="Para vender en HomIA con todo lo esencial."
          features={features.basic}
          icon={<Store className="size-5" aria-hidden />}
          chip="homy-chip-blue"
          actual={plan.plan === 'basic' && !plan.cancelado}
          destacado={false}
          busy={busy === 'basic'}
          disabled={busy !== null || confirming}
          mpConfigured={data.mpConfigured}
          ctaActual="Tu plan actual"
          cta={plan.plan === 'basic' && plan.cancelado ? 'Volver a suscribirme' : 'Elegir Básico'}
          onSubscribe={() => subscribe('basic')}
        />
        <PlanCard
          nombre="PRO"
          ars={preciosArs.pro}
          desc="Máxima visibilidad + inteligencia de demanda para tu negocio."
          features={features.pro}
          icon={<Sparkles className="size-5" aria-hidden />}
          chip="homy-chip-gold"
          actual={plan.plan === 'pro' && !plan.cancelado}
          destacado
          busy={busy === 'pro'}
          disabled={busy !== null || confirming}
          mpConfigured={data.mpConfigured}
          ctaActual="Tu plan actual"
          cta={plan.plan === 'pro' && plan.cancelado ? 'Volver a suscribirme' : 'Pasarme a PRO'}
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
        <div className="space-y-1.5 text-[13px] leading-relaxed text-slate-600">
          <p>La suscripción se cobra <b>mensualmente por Mercado Pago</b>. Si la elegís durante la prueba, el primer cobro es cuando termina la prueba: no perdés días gratis.</p>
          <p>
            <b>Cancelás cuando quieras</b>, acá con <b>Cancelar suscripción</b> o en Mercado Pago → Suscripciones (da lo mismo). No se te vuelve a cobrar.
            <b> Lo ya pagado no se reintegra</b>, pero seguís con tu plan hasta el fin del período que pagaste.
          </p>
          <p>Sin plan activo tus productos no se ven en HomIA, pero podés terminar las ventas que ya tenés y no se borra nada: tu stock, precios, reseñas y vinculaciones vuelven tal como estaban cuando elegís un plan. ¿Dudas? Escribinos desde el botón <b>?</b> de abajo.</p>
        </div>
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
          data-track={`plan: elegir ${nombre}`}
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
        <p className="min-w-0 flex-[1_1_14rem] text-[13.5px] leading-relaxed text-slate-600">
          <b>Prueba gratis:</b> te quedan <b>{daysLeft} día{daysLeft === 1 ? '' : 's'}</b> con todos los beneficios. Después elegí el
          Básico ({basic}/mes) o el PRO ({pro}/mes) para seguir vendiendo: si lo elegís ahora, el primer cobro es cuando termina la prueba.
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
      <p className="min-w-0 flex-[1_1_14rem] text-[13.5px] leading-relaxed text-slate-600">
        <b>Tu plan no está activo.</b> Tus productos no se ven en HomIA; podés terminar las ventas que ya tenés. Para volver a vender elegí
        Básico <b>{basic}/mes</b> o PRO <b>{pro}/mes</b>.
      </p>
      <button onClick={() => navigate('/panel/proveedor/plan')} className="homy-btn-primary min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
        <Crown className="size-4" aria-hidden /> Elegir plan
      </button>
    </section>
  )
}
