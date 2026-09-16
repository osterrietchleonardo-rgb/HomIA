'use client'
// Dashboard Proveedor HomIA — resumen de stock, alertas de reposición, vinculaciones y acceso al CRM
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, StatCard, StatusBadge, Loading, EmptyState, UAvatar } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import {
  Boxes, AlertTriangle, PackageX, Link2, Users, ArrowRight, CheckCircle2, Plus,
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
          <button onClick={() => navigate('/panel/proveedor/stock')} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white font-bold px-5 py-2.5 flex items-center gap-2 transition shadow-lg shadow-[#FF5A1F]/20">
            <Boxes className="size-4" /> Gestionar stock
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <StatCard label="Elementos publicados" value={stock.length} accent="#1D63B8" />
        <StatCard label="Valor del stock" value={formatARS(stockValue)} accent="#0A2540" />
        <StatCard label="Por agotar" value={low.length} accent="#D97706" />
        <StatCard label="Agotados" value={out.length} accent="#DC2626" />
      </div>

      {stock.length === 0 ? (
        <section className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6 mb-6">
          <EmptyState icon="📦" title="Todavía no publicaste elementos"
            hint="Publicá precios y stock del catálogo estándar para aparecer en las búsquedas de materiales de los profesionales."
            action={
              <button onClick={() => navigate('/panel/proveedor/stock')} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white font-bold px-5 py-2.5 flex items-center gap-2 mx-auto transition">
                <Plus className="size-4" /> Publicar el primero
              </button>
            } />
        </section>
      ) : alerts.length > 0 ? (
        <section className={`rounded-3xl border-2 p-5 mb-6 ${out.length > 0 ? 'border-red-300 bg-red-50/60' : 'border-amber-300 bg-amber-50/60'}`}>
          <h2 className="font-extrabold text-[#0A2540] flex items-center gap-2">
            {out.length > 0 ? <PackageX className="size-5 text-red-500" /> : <AlertTriangle className="size-5 text-amber-500" />}
            Alertas de stock ({alerts.length})
          </h2>
          <p className="text-sm text-slate-500 mt-0.5 mb-3">Repone antes de que un profesional necesite el material.</p>
          <div className="space-y-2">
            {alerts.map((s) => (
              <div key={s.id} className="rounded-2xl bg-white border border-slate-200 p-3.5 flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-bold text-[#0A2540] truncate">{s.name}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Quedan <span className={`font-bold ${s.quantity <= 0 ? 'text-red-600' : 'text-amber-600'}`}>{s.quantity}</span> {s.unit}
                    {' '}· mínimo {s.minStock}{s.brand ? ` · ${s.brand}` : ''}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <StatusBadge status={s.status} />
                  <button onClick={() => navigate('/panel/proveedor/stock')} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white text-sm font-bold px-4 py-2 transition">
                    Reponer
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : (
        <section className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-4 mb-6 flex items-center gap-3">
          <CheckCircle2 className="size-5 text-emerald-600 shrink-0" />
          <p className="text-sm font-semibold text-emerald-800">Todo el stock está por encima del mínimo. No hay alertas de reposición.</p>
        </section>
      )}

      <div className="grid lg:grid-cols-2 gap-6">
        {/* Vinculaciones activas */}
        <section>
          <h2 className="font-extrabold text-[#0A2540] mb-3">Vinculaciones activas ({activeLinks.length})</h2>
          {links.length === 0 ? (
            <div className="rounded-2xl bg-white border border-slate-200 shadow-sm p-6">
              <EmptyState icon="🔗" title="Sin profesionales vinculados"
                hint="Vinculá profesionales con una cuenta de retiro para que retiren materiales por tu negocio."
                action={
                  <button onClick={() => navigate('/panel/proveedor/vinculaciones')} className="rounded-xl bg-[#1D63B8] hover:bg-[#164e8c] text-white font-bold px-5 py-2.5 mx-auto flex items-center gap-2 transition">
                    <Link2 className="size-4" /> Vincular el primero
                  </button>
                } />
            </div>
          ) : (
            <div className="space-y-2">
              {links.slice(0, 4).map((l) => (
                <button key={l.id} onClick={() => navigate('/panel/proveedor/vinculaciones')} className="w-full text-left rounded-2xl bg-white border border-slate-200 p-4 shadow-sm hover:shadow-md transition flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <UAvatar name={l.professional.companyName || l.professional.displayName} url={l.professional.avatarUrl} size={40} />
                    <div className="min-w-0">
                      <p className="font-bold text-[#0A2540] truncate">{l.professional.companyName || l.professional.displayName}</p>
                      <p className="text-xs text-slate-500 truncate">Cuenta de retiro: {l.accountLabel}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${l.active ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>
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
          <h2 className="font-extrabold text-[#0A2540] mb-3">CRM</h2>
          <button onClick={() => navigate('/panel/proveedor/crm')} className="w-full text-left rounded-2xl bg-white border border-slate-200 p-4 shadow-sm hover:shadow-md transition flex items-center gap-4">
            <span className="size-11 rounded-2xl bg-[#1D63B8]/10 grid place-items-center shrink-0">
              <Users className="size-5 text-[#1D63B8]" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-bold text-[#0A2540]">Clientes y profesionales</span>
              <span className="block text-sm text-slate-500 mt-0.5">Seguí contactos, cotizaciones y compras en curso en tu pipeline.</span>
            </span>
            <ArrowRight className="size-4 text-slate-300 shrink-0" />
          </button>
          <button onClick={() => navigate('/panel/proveedor/vinculaciones')} className="w-full text-left rounded-2xl bg-white border border-slate-200 p-4 shadow-sm hover:shadow-md transition flex items-center gap-4 mt-2">
            <span className="size-11 rounded-2xl bg-[#FF5A1F]/10 grid place-items-center shrink-0">
              <Link2 className="size-5 text-[#FF5A1F]" />
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
