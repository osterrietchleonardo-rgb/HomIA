'use client'
// Dashboard Proveedor HomIA — resumen de stock, alertas de reposición, vinculaciones,
// plan de suscripción (trial/basic/pro) y analítica del negocio (exclusiva PRO)
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, Loading, UAvatar, AutoFitValue } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import {
  Boxes, AlertTriangle, PackageX, PackageOpen, Link2, Users, ArrowRight, CheckCircle2, Plus, Wallet, Zap,
  Crown, TrendingUp, Search, ShoppingBag, Sparkles, Lock, BarChart3,
} from 'lucide-react'
import { VerificationPrompt } from '../verificacion'
import OnboardingCard, { type OnboardingTask } from '../onboarding-card'
import { TrialExpiredBanner } from './plan'
import { useSession } from '@/lib/store'
import { toast } from 'sonner'

type StockItem = {
  id: string; elementId: string; name: string; unit: string; category: string; categorySlug: string
  aliases: string[]; brand: string | null; price: number; quantity: number; minStock: number
  status: string; updatedAt: string
}

type PlanState = {
  plan: 'trial' | 'basic' | 'pro'
  activo: boolean
  trialDaysLeft: number | null
  trialEndsAt: string | null
  esPro: boolean
  etiqueta: string
}

type Analytics = {
  topElementos: { name: string; pedidos: number; cantidad: number; ventas: number }[]
  consultasRubro: { total: number; topQueries: { query: string; veces: number }[] }
  teEncontraron: { total: number; topQueries: { query: string; veces: number }[] }
  ventas: { pedidos: number; total: number; pendientes: number; stockCount: number }
}

type ProviderLink = {
  id: string; accountLabel: string; notes: string | null; active: boolean; createdAt: string
  professional: { displayName: string; avatarUrl: string | null; personType: string; companyName: string | null; professions: string[] }
}

export default function ProviderDashboard() {
  const { user } = useSession()
  const [stock, setStock] = useState<StockItem[]>([])
  const [links, setLinks] = useState<ProviderLink[]>([])
  const [profileDescription, setProfileDescription] = useState<string | null>(null)
  const [mpConnected, setMpConnected] = useState(false)
  const [plan, setPlan] = useState<PlanState | null>(null)
  const [preciosArs, setPreciosArs] = useState<{ basic: number; pro: number } | undefined>(undefined)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [resS, resL, resMe, resPlan] = await Promise.all([
          fetch('/api/provider/stock'), fetch('/api/provider/links'), fetch('/api/profiles/me'), fetch('/api/provider/plan'),
        ])
        if (resS.ok) setStock((await resS.json()).stock || [])
        if (resL.ok) setLinks((await resL.json()).asProvider || [])
        if (resMe.ok) {
          const prov = (await resMe.json()).user?.provider
          setProfileDescription(prov?.description || null)
          setMpConnected(prov?.mpOauthStatus === 'connected')
        }
        if (resPlan.ok) {
          const d = await resPlan.json()
          setPlan(d.plan)
          setPreciosArs(d.preciosArs)
        }
      } catch {
        toast.error('No pudimos cargar tu panel. Reintentá')
      } finally { setLoading(false) }
    })()
  }, [])

  if (loading) return <Loading />

  const low = stock.filter((s) => s.status === 'por_agotar')
  const out = stock.filter((s) => s.status === 'agotado')
  const alerts = [...out, ...low]
  const stockValue = stock.reduce((a, s) => a + s.price * s.quantity, 0)
  const activeLinks = links.filter((l) => l.active)

  // checklist guiado con estado real del sistema
  const onboardingTasks: OnboardingTask[] = [
    {
      id: 'verify', label: 'Verificá tu identidad',
      desc: 'Subí tu DNI: la IA lo valida y tu check verde junto al nombre transmite confianza.',
      done: user?.verificationStatus === 'verificado', href: '/panel/proveedor/verificacion', cta: 'Verificar ahora',
    },
    {
      id: 'profile', label: 'Completá tu perfil de negocio',
      desc: 'Presentá tu empresa y zona de despacho: los profesionales te van a encontrar en el directorio.',
      done: !!profileDescription, href: '/panel/proveedor/perfil', cta: 'Completar perfil',
    },
    {
      id: 'mp', label: 'Conectá Mercado Pago',
      desc: 'Cobrá tus ventas directas en tu propia cuenta. Sin conexión, tus clientes solo pueden pagarte en efectivo.',
      done: mpConnected, href: '/panel/proveedor/cobros', cta: 'Conectar',
    },
    {
      id: 'stock', label: 'Publicá tu catálogo de stock',
      desc: 'Cargá materiales con precio y cantidad: aparecés en el comparador de los profesionales.',
      done: stock.length > 0, href: '/panel/proveedor/stock', cta: 'Cargar stock',
    },
    {
      id: 'links', label: 'Vinculate con profesionales',
      desc: 'Las cuentas de retiro conectan tu negocio con los profesionales que compran tus materiales.',
      done: links.length > 0, href: '/panel/proveedor/vinculaciones', cta: 'Ver vinculaciones',
    },
  ]

  return (
    <div className="homy-page">
      <VerificationPrompt role="proveedor" />
      {/* estado del plan: cuenta regresiva de la prueba o aviso de vencimiento */}
      {plan && plan.plan === 'trial' && <TrialExpiredBanner daysLeft={plan.trialDaysLeft} preciosArs={preciosArs} />}
      <OnboardingCard role="proveedor" tasks={onboardingTasks} />
      {/* Encabezado */}
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Panel proveedor</span>
          <h1 className="homy-page-title mt-1.5">Tu negocio</h1>
          <p className="homy-page-sub">Stock, vinculaciones y tratos con profesionales — todo en un solo lugar.</p>
        </div>
        <button onClick={() => navigate('/panel/proveedor/stock')} className="homy-btn-primary homy-focus min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
          <Boxes className="size-4" /> Gestionar stock
        </button>
      </header>

      {/* KPIs del negocio */}
      <div className="homy-stagger grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 mb-7">
        <Kpi
          glow="#00C4FF" chip="homy-chip-blue" icon={<Boxes />}
          label="Elementos publicados" value={String(stock.length)} hint="en tu catálogo propio"
        />
        <Kpi
          glow="#FFC700" chip="homy-chip-gold" icon={<Wallet />}
          label="Valor del stock" value={formatARS(stockValue)} hint="precio × cantidad en depósito"
        />
        <Kpi
          glow="#FF5A1F" valueColor="#FF5A1F" chip="homy-chip-orange" icon={<AlertTriangle />}
          label="Por agotar" value={String(low.length)} hint="bajo el stock mínimo"
        />
        <Kpi
          glow="#DC2626" valueColor="#DC2626" chip="" chipStyle={{ background: 'linear-gradient(140deg, #fee2e2 0%, #fecaca 100%)', color: '#dc2626' }}
          icon={<PackageX />}
          label="Agotados" value={String(out.length)} hint="hay que reponer ya"
        />
      </div>

      {stock.length === 0 ? (
        <section className="mb-7">
          <Empty
            icon={<PackageOpen className="size-7" />}
            title="Todavía no publicaste elementos"
            hint="Publicá precios y stock del catálogo estándar para aparecer en las búsquedas de materiales de los profesionales."
            action={
              <button onClick={() => navigate('/panel/proveedor/stock')} className="homy-btn-primary homy-focus min-h-[44px] px-5 py-2.5 text-sm">
                <Plus className="size-4" /> Publicar el primero
              </button>
            }
          />
        </section>
      ) : alerts.length > 0 ? (
        /* Alertas de reposición */
        <section className="homy-glass rounded-3xl p-5 sm:p-6 mb-7">
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span
                aria-hidden
                className={`homy-icon-chip size-8 shrink-0 [&_svg]:size-4 ${out.length > 0 ? '' : 'homy-chip-orange'}`}
                style={out.length > 0 ? { background: 'linear-gradient(140deg, #fee2e2 0%, #fecaca 100%)', color: '#dc2626' } : undefined}
              >
                {out.length > 0 ? <PackageX /> : <AlertTriangle />}
              </span>
              Alertas de stock ({alerts.length})
            </h2>
            <span className="homy-pill hidden sm:inline-flex">
              <span aria-hidden className={`homy-pill-dot ${out.length > 0 ? 'bg-red-500' : 'bg-amber-500'}`} />
              {out.length > 0 ? 'Crítico' : 'Reponer pronto'}
            </span>
          </div>
          <p className="text-sm text-slate-500 -mt-1 mb-4">Repone antes de que un profesional necesite el material.</p>
          <div className="homy-stagger space-y-2">
            {alerts.map((s) => (
              <div key={s.id} className="homy-row p-3.5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <span
                    aria-hidden
                    className={`homy-icon-chip size-9 shrink-0 [&_svg]:size-4 ${s.status === 'agotado' ? '' : 'homy-chip-orange'}`}
                    style={s.status === 'agotado' ? { background: 'linear-gradient(140deg, #fee2e2 0%, #fecaca 100%)', color: '#dc2626' } : undefined}
                  >
                    {s.status === 'agotado' ? <PackageX /> : <AlertTriangle />}
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-[#0A2540] line-clamp-1">{s.name}</p>
                    <p className="text-xs text-slate-500 mt-0.5">
                      Quedan <span className={`font-bold ${s.quantity <= 0 ? 'text-red-600' : 'text-amber-600'}`}>{s.quantity}</span> {s.unit}
                      {' '}· mínimo {s.minStock}{s.brand ? ` · ${s.brand}` : ''}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  <StatusBadge status={s.status} />
                  <button onClick={() => navigate('/panel/proveedor/stock')} className="homy-btn-dark homy-focus min-h-[44px] px-4 py-2.5 text-sm">
                    Reponer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        /* Stock saludable */
        <section className="homy-glass-soft rounded-2xl p-4 mb-7 flex items-center gap-3">
          <span aria-hidden className="homy-icon-chip homy-chip-mint size-10 shrink-0 [&_svg]:size-5"><CheckCircle2 /></span>
          <div className="min-w-0">
            <p className="font-bold text-[#0A2540] text-sm">Stock saludable</p>
            <p className="text-sm text-slate-500">Todo el stock está por encima del mínimo. No hay alertas de reposición.</p>
          </div>
        </section>
      )}

      {/* ANALÍTICA PRO / teaser */}
      <AnalyticsSection plan={plan} />

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Vinculaciones activas */}
        <section>
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span aria-hidden className="homy-icon-chip homy-chip-blue size-7 shrink-0 [&_svg]:size-3.5"><Link2 /></span>
              Vinculaciones activas ({activeLinks.length})
            </h2>
          </div>
          {links.length === 0 ? (
            <Empty
              icon={<Link2 className="size-7" />}
              title="Sin profesionales vinculados"
              hint="Vinculá profesionales con una cuenta de retiro para que retiren materiales por tu negocio."
              action={
                <button onClick={() => navigate('/panel/proveedor/vinculaciones')} className="homy-btn-primary homy-focus min-h-[44px] px-5 py-2.5 text-sm">
                  <Link2 className="size-4" /> Vincular el primero
                </button>
              }
            />
          ) : (
            <div className="homy-stagger space-y-2">
              {links.slice(0, 4).map((l) => (
                <button key={l.id} onClick={() => navigate('/panel/proveedor/vinculaciones')} className="homy-row group w-full text-left p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UAvatar name={l.professional.companyName || l.professional.displayName} url={l.professional.avatarUrl} size={40} />
                    <div className="min-w-0">
                      <p className="font-bold text-[#0A2540] line-clamp-1">{l.professional.companyName || l.professional.displayName}</p>
                      <p className="text-xs text-slate-500 line-clamp-1">Cuenta de retiro: {l.accountLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2.5 shrink-0">
                    <span className="homy-pill">
                      <span aria-hidden className={`homy-pill-dot ${l.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {l.active ? 'Activa' : 'Inactiva'}
                    </span>
                    <span aria-hidden className="homy-glass-soft grid size-8 shrink-0 place-items-center rounded-full text-slate-400 transition-colors group-hover:text-[#1D63B8]">
                      <ArrowRight className="size-4" />
                    </span>
                  </div>
                </button>
              ))}
              {links.length > 4 && (
                <button onClick={() => navigate('/panel/proveedor/vinculaciones')} className="homy-glass-soft w-full rounded-2xl min-h-[44px] text-center text-xs font-bold text-[#1D63B8] hover:text-[#0A2540] transition flex items-center justify-center gap-1.5">
                  +{links.length - 4} más — ver todas en Vinculaciones <ArrowRight className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          )}
        </section>

        {/* Accesos rápidos */}
        <section>
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span aria-hidden className="homy-icon-chip homy-chip-orange size-7 shrink-0 [&_svg]:size-3.5"><Zap /></span>
              Accesos rápidos
            </h2>
          </div>
          <div className="homy-stagger space-y-2.5">
            <QuickLink
              icon={Boxes} chip="homy-chip-blue" title="Stock y catálogo"
              desc="Publicá precios, repone cantidades y controlá los mínimos."
              onClick={() => navigate('/panel/proveedor/stock')}
            />
            <QuickLink
              icon={Users} chip="homy-chip-mint" title="CRM"
              desc="Seguí contactos, cotizaciones y compras en curso en tu pipeline."
              onClick={() => navigate('/panel/proveedor/crm')}
            />
            <QuickLink
              icon={Crown} chip="homy-chip-gold" title="Mi plan de suscripción"
              desc={`Prueba gratis, Básico ${formatARS(preciosArs?.basic ?? 50000)}/mes o PRO ${formatARS(preciosArs?.pro ?? 100000)}/mes con analítica y destacado.`}
              onClick={() => navigate('/panel/proveedor/plan')}
            />
            <QuickLink
              icon={Link2} chip="homy-chip-orange" title="Vinculaciones"
              desc="Gestioná qué profesionales pueden retirar material por tu negocio."
              onClick={() => navigate('/panel/proveedor/vinculaciones')}
            />
          </div>
        </section>
      </div>
    </div>
  )
}

/* KPI Signature: cifra protagonista + chip de gradiente + resplandor de esquina */
function Kpi({ label, value, hint, glow, valueColor, chip, chipStyle, icon }: {
  label: string; value: string; hint?: string; glow: string; valueColor?: string
  chip: string; chipStyle?: React.CSSProperties; icon: React.ReactNode
}) {
  return (
    <div className="homy-glass homy-kpi homy-lift flex items-center gap-3.5" style={{ '--kpi-glow': glow } as React.CSSProperties}>
      <span aria-hidden className={`homy-icon-chip size-11 shrink-0 [&_svg]:size-5 ${chip}`} style={chipStyle}>{icon}</span>
      <div className="min-w-0">
        <p className="homy-kpi-label">{label}</p>
        <AutoFitValue className="homy-kpi-value mt-1" style={valueColor ? { color: valueColor } : undefined} value={value} />
        {hint && <p className="text-xs text-slate-400 mt-1 leading-snug line-clamp-1">{hint}</p>}
      </div>
    </div>
  )
}

/* Acceso rápido: fila de vidrio con chip + flecha que se enciende al hover */
function QuickLink({ icon: Icon, chip, title, desc, onClick }: {
  icon: React.ComponentType<{ className?: string }>; chip: string; title: string; desc: string; onClick: () => void
}) {
  return (
    <button onClick={onClick} className="homy-row group w-full text-left p-4 flex items-center gap-3.5">
      <span aria-hidden className={`homy-icon-chip size-11 shrink-0 [&_svg]:size-5 ${chip}`}>
        <Icon className="size-5" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-bold text-[#0A2540] text-sm">{title}</span>
        <span className="block text-xs text-slate-500 mt-0.5 leading-snug">{desc}</span>
      </span>
      <span aria-hidden className="homy-glass-soft grid size-8 shrink-0 place-items-center rounded-full text-slate-400 transition-colors group-hover:text-[#1D63B8]">
        <ArrowRight className="size-4" />
      </span>
    </button>
  )
}

/* Estado vacío del panel: icono flotante + copy claro */
function Empty({ icon, title, hint, action }: { icon: React.ReactNode; title: string; hint: string; action?: React.ReactNode }) {
  return (
    <div className="homy-empty rounded-3xl border-2 border-dashed border-[#0A2540]/10">
      <span className="homy-empty-icon homy-icon-chip homy-chip-blue [&_svg]:size-7" aria-hidden>{icon}</span>
      <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">{title}</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

/* ── Analítica del negocio (Plan PRO) o teaser de mejora ── */
function AnalyticsSection({ plan }: { plan: PlanState | null }) {
  const [data, setData] = useState<Analytics | null>(null)
  const [loading, setLoading] = useState(false)
  const [blocked, setBlocked] = useState(false)

  useEffect(() => {
    if (!plan?.activo || !plan.esPro) return
    let alive = true
    async function run() {
      setLoading(true)
      try {
        const r = await fetch('/api/provider/analytics?days=30')
        if (!alive) return
        if (r.ok) setData(await r.json())
        else setBlocked(true)
      } catch {
        if (alive) setBlocked(true)
      } finally {
        if (alive) setLoading(false)
      }
    }
    void run()
    return () => { alive = false }
  }, [plan?.activo, plan?.esPro])

  if (!plan) return null

  // PRO activo con datos
  if (plan.esPro && plan.activo) {
    return (
      <section className="homy-glass rounded-3xl p-5 sm:p-6 mb-7">
        <div className="homy-section-head">
          <h2 className="homy-section-title">
            <span aria-hidden className="homy-icon-chip homy-chip-gold size-8 shrink-0 [&_svg]:size-4"><BarChart3 /></span>
            Analítica del negocio · últimos 30 días
          </h2>
          <span className="homy-pill hidden sm:inline-flex"><span aria-hidden className="homy-pill-dot bg-amber-500" />Plan PRO</span>
        </div>
        {loading ? (
          <Loading text="Calculando tu demanda…" />
        ) : blocked || !data ? (
          <p className="text-sm text-slate-500">No pudimos cargar la analítica ahora. Probá de nuevo en un rato.</p>
        ) : (
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            {/* resumen de ventas del período */}
            <div className="rounded-2xl bg-[#0A2540]/3 p-4 lg:col-span-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ventas cobradas</p>
                <AutoFitValue className="mt-1 text-2xl font-extrabold text-[#0A2540]" value={formatARS(data.ventas.total)} />
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pedidos entregados</p>
                <p className="mt-1 text-2xl font-extrabold text-[#0A2540] tabular-nums">{data.ventas.pedidos}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Pedidos en curso</p>
                <p className="mt-1 text-2xl font-extrabold text-[#FF5A1F] tabular-nums">{data.ventas.pendientes}</p>
              </div>
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Elementos publicados</p>
                <p className="mt-1 text-2xl font-extrabold text-[#0A2540] tabular-nums">{data.ventas.stockCount}</p>
              </div>
            </div>
            {/* elementos más pedidos */}
            <div className="rounded-2xl bg-[#0A2540]/3 p-4 lg:col-span-1">
              <p className="flex items-center gap-2 text-sm font-extrabold text-[#0A2540]">
                <ShoppingBag className="size-4 text-[#FF5A1F]" aria-hidden /> Elementos más pedidos
              </p>
              {data.topElementos.length === 0 ? (
                <p className="mt-2 text-[12.5px] leading-relaxed text-slate-500">
                  Todavía no hay pedidos en los últimos 30 días. Cuando entren, acá vas a ver qué se pide más para decidir qué reponer.
                </p>
              ) : (
                <ul className="mt-3 space-y-2">
                  {data.topElementos.map((e, i) => (
                    <li key={e.name} className="flex items-center gap-2.5">
                      <span className="grid size-6 shrink-0 place-items-center rounded-full bg-[#FFC700]/20 text-[11px] font-extrabold text-[#B98A00]">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-[13px] font-bold text-[#0A2540]" title={e.name}>{e.name}</span>
                      <span className="shrink-0 text-[11px] font-bold text-slate-500 tabular-nums">{e.pedidos} pedido{e.pedidos === 1 ? '' : 's'}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {/* consultas del rubro */}
            <div className="rounded-2xl bg-[#0A2540]/3 p-4">
              <p className="flex items-center gap-2 text-sm font-extrabold text-[#0A2540]">
                <Search className="size-4 text-[#1D63B8]" aria-hidden /> Consultas de tu rubro
              </p>
              <p className="mt-2 text-3xl font-extrabold text-[#0A2540] tabular-nums">{data.consultasRubro.total}</p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">búsquedas relacionadas con tus elementos</p>
              {data.consultasRubro.topQueries.length > 0 && (
                <ul className="mt-2.5 space-y-1">
                  {data.consultasRubro.topQueries.slice(0, 4).map((q) => (
                    <li key={q.query} className="truncate text-[12px] text-slate-500" title={q.query}>“{q.query}” · {q.veces}×</li>
                  ))}
                </ul>
              )}
            </div>
            {/* te encontraron */}
            <div className="rounded-2xl bg-[#0A2540]/3 p-4">
              <p className="flex items-center gap-2 text-sm font-extrabold text-[#0A2540]">
                <TrendingUp className="size-4 text-[#0e9f6e]" aria-hidden /> Te encontraron en
              </p>
              <p className="mt-2 text-3xl font-extrabold text-[#0A2540] tabular-nums">{data.teEncontraron.total}</p>
              <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">búsquedas donde apareció tu negocio</p>
              {data.teEncontraron.topQueries.length > 0 && (
                <ul className="mt-2.5 space-y-1">
                  {data.teEncontraron.topQueries.slice(0, 4).map((q) => (
                    <li key={q.query} className="truncate text-[12px] text-slate-500" title={q.query}>“{q.query}” · {q.veces}×</li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        )}
      </section>
    )
  }

  // trial / basic → teaser del PRO
  return (
    <section className="homy-glass rounded-3xl p-5 sm:p-6 mb-7 ring-1 ring-[#FFC700]/35 relative overflow-hidden">
      <span aria-hidden className="pointer-events-none absolute -top-16 right-[-8%] size-48 rounded-full bg-[#FFC700]/15 blur-3xl" />
      <div className="relative flex flex-wrap items-center gap-3">
        <span aria-hidden className="homy-icon-chip homy-chip-gold size-11 shrink-0 [&_svg]:size-5"><Lock /></span>
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 text-[15px] font-extrabold text-[#0A2540]">
            Analítica del negocio <span className="rounded-full bg-gradient-to-r from-[#FFC700] to-[#ffd84d] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-[#6b4d00]">Plan PRO</span>
          </p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">
            Enterate qué elementos se están pidiendo más, cuántas consultas hubo sobre tu rubro y qué búsquedas te encontraron.
            Con el plan PRO además salís primero: tarjeta “Recomendado” en directorio y materiales + tu logo como sponsor en la home.
          </p>
        </div>
        <button onClick={() => navigate('/panel/proveedor/plan')} className="homy-btn-primary min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
          <Sparkles className="size-4" aria-hidden /> Ver el plan PRO
        </button>
      </div>
    </section>
  )
}
