'use client'
// Dashboard Proveedor HomIA — resumen de stock, alertas de reposición, vinculaciones y acceso al CRM
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatCard, StatusBadge, Loading, EmptyState, UAvatar } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import {
  Boxes, AlertTriangle, PackageX, PackageOpen, Link2, Users, ArrowRight, CheckCircle2, Plus, Wallet,
} from 'lucide-react'

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
  const [stock, setStock] = useState<StockItem[]>([])
  const [links, setLinks] = useState<ProviderLink[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    (async () => {
      try {
        const [resS, resL] = await Promise.all([fetch('/api/provider/stock'), fetch('/api/provider/links')])
        if (resS.ok) setStock((await resS.json()).stock || [])
        if (resL.ok) setLinks((await resL.json()).asProvider || [])
      } finally { setLoading(false) }
    })()
  }, [])

  if (loading) return <Loading />

  const low = stock.filter((s) => s.status === 'por_agotar')
  const out = stock.filter((s) => s.status === 'agotado')
  const alerts = [...out, ...low]
  const stockValue = stock.reduce((a, s) => a + s.price * s.quantity, 0)
  const activeLinks = links.filter((l) => l.active)

  return (
    <div>
      <PageHeader
        title="Tu negocio"
        subtitle="Stock, vinculaciones y tratos con profesionales — todo en un solo lugar"
        right={
          <button onClick={() => navigate('/panel/proveedor/stock')} className="homy-btn-primary homy-focus px-5 py-2.5 text-sm">
            <Boxes className="size-4" /> Gestionar stock
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Elementos publicados" value={stock.length} accent="#1D63B8" icon={<Boxes />} tone="blue" />
        <StatCard label="Valor del stock" value={formatARS(stockValue)} accent="#0A2540" icon={<Wallet />} tone="ai" />
        <StatCard label="Por agotar" value={low.length} accent="#D97706" icon={<AlertTriangle />} tone="gold" />
        <StatCard label="Agotados" value={out.length} accent="#DC2626" icon={<PackageX />} tone="orange" />
      </div>

      {stock.length === 0 ? (
        <section className="homy-glass rounded-3xl p-6 mb-6">
          <EmptyState icon={<PackageOpen />} title="Todavía no publicaste elementos"
            hint="Publicá precios y stock del catálogo estándar para aparecer en las búsquedas de materiales de los profesionales."
            action={
              <button onClick={() => navigate('/panel/proveedor/stock')} className="homy-btn-primary homy-focus px-5 py-2.5 text-sm mx-auto">
                <Plus className="size-4" /> Publicar el primero
              </button>
            } />
        </section>
      ) : alerts.length > 0 ? (
        <section className={`rounded-3xl border p-5 mb-6 ${out.length > 0 ? 'border-red-200/80 bg-gradient-to-br from-red-50/90 via-red-50/40 to-transparent' : 'border-amber-200/80 bg-gradient-to-br from-amber-50/90 via-amber-50/40 to-transparent'}`}>
          <div className="flex items-center gap-3">
            {out.length > 0 ? (
              <span aria-hidden className="homy-icon-chip size-10 shrink-0" style={{ background: 'linear-gradient(140deg, #fee2e2 0%, #fecaca 100%)', color: '#dc2626' }}>
                <PackageX className="size-5" />
              </span>
            ) : (
              <span aria-hidden className="homy-icon-chip homy-chip-orange size-10 shrink-0">
                <AlertTriangle className="size-5" />
              </span>
            )}
            <div className="min-w-0">
              <h2 className="font-extrabold text-[#0A2540]">Alertas de stock ({alerts.length})</h2>
              <p className="text-sm text-slate-500">Repone antes de que un profesional necesite el material.</p>
            </div>
          </div>
          <div className="space-y-2 mt-4">
            {alerts.map((s) => (
              <div key={s.id} className="homy-glass rounded-2xl p-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-[#0A2540] truncate">{s.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Quedan <span className={`font-bold ${s.quantity <= 0 ? 'text-red-600' : 'text-amber-600'}`}>{s.quantity}</span> {s.unit}
                    {' '}· mínimo {s.minStock}{s.brand ? ` · ${s.brand}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={s.status} />
                  <button onClick={() => navigate('/panel/proveedor/stock')} className="homy-btn-primary px-4 py-2 text-sm">
                    Reponer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-200/80 bg-gradient-to-r from-emerald-50/80 to-transparent p-4 mb-6 flex items-center gap-3">
          <span aria-hidden className="homy-icon-chip homy-chip-mint size-9 shrink-0">
            <CheckCircle2 className="size-5" />
          </span>
          <p className="text-sm font-semibold text-emerald-800">Todo el stock está por encima del mínimo. No hay alertas de reposición.</p>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Vinculaciones activas */}
        <section>
          <span className="homy-eyebrow mb-1">Cuentas de retiro</span>
          <h2 className="font-extrabold text-[#0A2540] mb-3">Vinculaciones activas ({activeLinks.length})</h2>
          {links.length === 0 ? (
            <div className="homy-glass rounded-2xl p-6">
              <EmptyState icon={<Link2 />} title="Sin profesionales vinculados"
                hint="Vinculá profesionales con una cuenta de retiro para que retiren materiales por tu negocio."
                action={
                  <button onClick={() => navigate('/panel/proveedor/vinculaciones')} className="homy-btn-primary homy-focus px-5 py-2.5 text-sm mx-auto">
                    <Link2 className="size-4" /> Vincular el primero
                  </button>
                } />
            </div>
          ) : (
            <div className="space-y-2">
              {links.slice(0, 4).map((l) => (
                <button key={l.id} onClick={() => navigate('/panel/proveedor/vinculaciones')} className="homy-glass homy-lift homy-card-glow w-full text-left rounded-2xl p-4 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UAvatar name={l.professional.companyName || l.professional.displayName} url={l.professional.avatarUrl} size={40} />
                    <div className="min-w-0">
                      <p className="font-bold text-[#0A2540] truncate">{l.professional.companyName || l.professional.displayName}</p>
                      <p className="text-xs text-slate-500 truncate">Cuenta de retiro: {l.accountLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="homy-pill">
                      <span aria-hidden className={`homy-pill-dot ${l.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                      {l.active ? 'Activa' : 'Inactiva'}
                    </span>
                    <ArrowRight className="size-4 text-slate-300" />
                  </div>
                </button>
              ))}
              {links.length > 4 && (
                <button onClick={() => navigate('/panel/proveedor/vinculaciones')} className="w-full text-center text-xs font-semibold text-[#1D63B8] hover:underline py-1.5">
                  +{links.length - 4} más — ver todas en Vinculaciones
                </button>
              )}
            </div>
          )}
        </section>

        {/* Acceso rápido al CRM */}
        <section>
          <span className="homy-eyebrow mb-1">Seguimiento</span>
          <h2 className="font-extrabold text-[#0A2540] mb-3">CRM</h2>
          <button onClick={() => navigate('/panel/proveedor/crm')} className="homy-glass homy-lift homy-card-glow w-full text-left rounded-2xl p-4 flex items-center gap-4">
            <span aria-hidden className="homy-icon-chip homy-chip-blue size-11 shrink-0">
              <Users className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-[#0A2540]">Clientes y profesionales</span>
              <span className="block text-sm text-slate-500 mt-0.5">Seguí contactos, cotizaciones y compras en curso en tu pipeline.</span>
            </span>
            <ArrowRight className="size-4 text-slate-300 shrink-0" />
          </button>
          <button onClick={() => navigate('/panel/proveedor/vinculaciones')} className="homy-glass homy-lift homy-card-glow w-full text-left rounded-2xl p-4 flex items-center gap-4 mt-2">
            <span aria-hidden className="homy-icon-chip homy-chip-orange size-11 shrink-0">
              <Link2 className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-[#0A2540]">Vinculaciones y cuentas de retiro</span>
              <span className="block text-sm text-slate-500 mt-0.5">Gestioná qué profesionales pueden retirar material por tu negocio.</span>
            </span>
            <ArrowRight className="size-4 text-slate-300 shrink-0" />
          </button>
        </section>
      </div>
    </div>
  )
}
