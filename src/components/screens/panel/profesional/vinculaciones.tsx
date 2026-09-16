'use client'
// Cuentas de retiro: vinculación del profesional con proveedores para retirar materiales a cuenta del proyecto
import { useEffect, useState } from 'react'
import { PageHeader, StatusBadge, Loading, EmptyState } from '@/components/app/ui-bits'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Truck, Plus, Store } from 'lucide-react'

type LinkRow = {
  id: string; accountLabel: string; notes: string | null; active: boolean; createdAt: string
  provider: { id: string; businessName: string; city: string | null; rating: number }
}

export default function ProLinks() {
  const [links, setLinks] = useState<LinkRow[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // formulario de vinculación
  const [showForm, setShowForm] = useState(false)
  const [email, setEmail] = useState('')
  const [accountLabel, setAccountLabel] = useState('')
  const [notes, setNotes] = useState('')

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/provider/links')
      if (res.ok) setLinks((await res.json()).asProfessional || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  async function createLink() {
    if (!email.trim() || !accountLabel.trim()) { toast.error('Email del proveedor y nombre de cuenta son obligatorios'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/provider/links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), accountLabel: accountLabel.trim(), notes: notes.trim() || undefined }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      toast.success('Vinculación creada — el proveedor fue notificado')
      setShowForm(false); setEmail(''); setAccountLabel(''); setNotes('')
      load()
    } finally { setBusy(false) }
  }

  async function toggleActive(link: LinkRow) {
    setBusy(true)
    try {
      const res = await fetch('/api/provider/links', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: link.id, active: !link.active }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      toast.success(link.active ? 'Cuenta pausada' : 'Cuenta reactivada')
      setLinks((cur) => cur.map((l) => (l.id === link.id ? { ...l, active: !l.active } : l)))
    } finally { setBusy(false) }
  }

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Cuentas de retiro"
        subtitle="Vinculaciones con proveedores para retirar materiales a cuenta del proyecto"
        right={
          <button onClick={() => setShowForm(!showForm)} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white font-bold px-5 py-2.5 flex items-center gap-2 transition">
            <Plus className="size-4" /> Vincularme
          </button>
        }
      />

      {/* explicación */}
      <div className="rounded-2xl bg-gradient-to-br from-[#0A2540] to-[#1D63B8] p-5 text-white shadow-lg mb-5">
        <h2 className="font-extrabold flex items-center gap-2"><Truck className="size-5 text-[#00C4FF]" /> ¿Qué es una cuenta de retiro?</h2>
        <p className="text-sm text-slate-300 mt-2 leading-relaxed">
          Es tu cuenta corriente con un proveedor: retirás materiales del local sin pagar en el momento y el gasto se
          factura <b className="text-white">al proyecto del cliente</b>. El cliente aprueba cada material antes desde su panel,
          y al final todo queda detallado en la factura que pagás con Mercado Pago. Sin efectivo de por medio y con
          precios comparables entre proveedores.
        </p>
      </div>

      {/* formulario de vinculación */}
      {showForm && (
        <div className="rounded-2xl homy-glass border border-slate-200 p-5 shadow-sm mb-5">
          <h2 className="font-extrabold text-[#0A2540] mb-1 flex items-center gap-2"><Store className="size-5 text-[#1D63B8]" /> Vincularme con un proveedor</h2>
          <p className="text-sm text-slate-500 mb-4">Ingresá el email del proveedor registrado en HomIA y el nombre que le querés dar a tu cuenta de retiro.</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase">Email del proveedor</span>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="proveedor@corralon.com"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase">Nombre de la cuenta de retiro</span>
              <input value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} placeholder="Ej: Cuenta Obra Palermo"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
            </label>
            <label className="block sm:col-span-2">
              <span className="text-xs font-semibold text-slate-500 uppercase">Notas (opcional)</span>
              <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: retiro por el depósito de av. Mitre"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
            </label>
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <button onClick={() => setShowForm(false)} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-500 hover:border-red-300 transition">Cancelar</button>
            <button disabled={busy} onClick={createLink} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white text-sm font-bold px-5 py-2.5 transition disabled:opacity-50">Crear vinculación</button>
          </div>
        </div>
      )}

      {/* lista de vinculaciones */}
      {loading ? (
        <Loading />
      ) : links.length === 0 ? (
        <div className="rounded-2xl homy-glass border border-slate-200 p-6">
          <EmptyState icon="🔗" title="No tenés cuentas de retiro vinculadas"
            hint="Pedile al proveedor su email de registro en HomIA y creá la cuenta acá. Después vas a poder retirar materiales y cargarlos directo al proyecto."
            action={
              <button onClick={() => setShowForm(true)} className="rounded-xl bg-[#FF5A1F] text-white font-bold px-5 py-2.5">Vincularme con un proveedor</button>
            } />
        </div>
      ) : (
        <div className="space-y-3">
          {links.map((l) => (
            <div key={l.id} className="rounded-2xl homy-glass border border-slate-200 p-4 shadow-sm flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="inline-flex rounded-xl bg-[#1D63B8]/10 p-2.5 text-[#1D63B8] shrink-0">
                  <Store className="size-5" />
                </span>
                <div className="min-w-0">
                  <p className="font-bold text-[#0A2540] truncate">{l.accountLabel}</p>
                  <p className="text-xs text-slate-400 truncate">
                    Proveedor: <b className="text-slate-500">{l.provider.businessName}</b>
                    {l.provider.city ? ` · ${l.provider.city}` : ''} · desde {formatDate(l.createdAt)}
                  </p>
                  {l.notes && <p className="text-xs text-slate-400 mt-0.5 truncate">📝 {l.notes}</p>}
                </div>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <StatusBadge status={l.active ? 'activo' : 'cerrado'} label={l.active ? 'activa' : 'inactiva'} />
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-400">{l.active ? 'Activa' : 'Pausada'}</span>
                  <Switch checked={l.active} onCheckedChange={() => toggleActive(l)} disabled={busy} aria-label={`Cuenta ${l.accountLabel}`} />
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* nota sobre el flujo */}
      {links.length > 0 && (
        <p className="mt-5 text-xs text-slate-400">
          Tip: en cada proyecto, los materiales que propongas con proveedor vinculado reservan stock automáticamente y
          aparecen en la sección &quot;Cuentas de retiro vinculadas&quot; del detalle.
        </p>
      )}
    </div>
  )
}
