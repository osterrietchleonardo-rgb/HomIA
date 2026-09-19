'use client'
// Dashboard Proveedor HomIA — resumen de stock, alertas de reposición, vinculaciones y acceso al CRM
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { StatusBadge, Loading, UAvatar, AutoFitValue } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import {
  Boxes, AlertTriangle, PackageX, PackageOpen, Link2, Users, ArrowRight, CheckCircle2, Plus, Wallet, Zap,
} from 'lucide-react'
import { VerificationPrompt } from '../verificacion'
import OnboardingCard, { type OnboardingTask } from '../onboarding-card'
import { useSession } from '@/lib/store'

type StockItem = {
  id: string; elementId: string; name: string; unit: string; category: string; categorySlug: string
  aliases: string[]; brand: string | null; price: number; quantity: number; minStock: number
  status: string; updatedAt: string
}

type ProviderLink = {
  id: string; accountLabel: string; notes: string | null; active: boolean; createdAt: string
  professional: { displayName: string; avatarUrl: string | null; personType: string; companyName: string | null; professions: string[] }
}

export default function ProviderDashboard() {
  const { user } = useSession()
  const [stock, setStock] = useState<StockItem[]>([])
  const [links, setLinks] = useState<ProviderLink[]>([])
  const [profileBio, setProfileBio] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [resS, resL, resMe] = await Promise.all([
          fetch('/api/provider/stock'), fetch('/api/provider/links'), fetch('/api/profiles/me'),
        ])
        if (resS.ok) setStock((await resS.json()).stock || [])
        if (resL.ok) setLinks((await resL.json()).asProvider || [])
        if (resMe.ok) setProfileBio((await resMe.json()).user?.provider?.bio || null)
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
      done: !!profileBio, href: '/panel/proveedor/perfil', cta: 'Completar perfil',
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
