'use client'
// Cuentas de retiro: vinculación del profesional con proveedores para retirar materiales a cuenta del proyecto
import { useEffect, useState } from 'react'
import { StatusBadge, Loading } from '@/components/app/ui-bits'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Truck, Plus, Store, Link2, ClipboardPen } from 'lucide-react'

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
    <div className="homy-page">
      <div>
        {/* Encabezado */}
        <header className="homy-page-head">
          <div className="min-w-0">
            <span className="homy-eyebrow">Escrow de materiales</span>
            <h1 className="homy-page-title mt-1.5">Cuentas de retiro</h1>
            <p className="homy-page-sub">Vinculaciones con proveedores para retirar materiales a cuenta del proyecto.</p>
          </div>
          <button onClick={() => setShowForm(!showForm)} className="homy-btn-primary min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
            <Plus className="size-4" /> Vincularme
          </button>
        </header>

        {/* explicación */}
        <div className="homy-glass-dark rounded-3xl p-5 sm:p-6 text-white shadow-lg mb-5 relative overflow-hidden">
          <span aria-hidden className="pointer-events-none absolute -top-14 -right-10 size-40 rounded-full bg-[#00C4FF]/20 blur-3xl" />
          <h2 className="relative flex items-center gap-3 font-extrabold tracking-tight">
            <span className="homy-icon-chip homy-chip-ai size-9 [&_svg]:size-4" aria-hidden><Truck /></span>
            ¿Qué es una cuenta de retiro?
          </h2>
          <p className="relative text-sm text-slate-300 mt-3 leading-relaxed max-w-2xl">
            Es tu cuenta corriente con un proveedor: retirás materiales del local sin pagar en el momento y el gasto se
            factura <b className="text-white">al proyecto del cliente</b>. El cliente aprueba cada material antes desde su panel,
            y al final todo queda detallado en la factura que pagás con Mercado Pago. Sin efectivo de por medio y con
            precios comparables entre proveedores.
          </p>
        </div>

        {/* formulario de vinculación */}
        {showForm && (
          <div className="homy-glass rounded-3xl p-5 mb-5">
            <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-1">
              <span className="homy-icon-chip homy-chip-blue size-8 [&_svg]:size-4" aria-hidden><Store /></span>
              Vincularme con un proveedor
            </h2>
            <p className="text-sm text-slate-500 mb-4">Ingresá el email del proveedor registrado en HomIA y el nombre que le querés dar a tu cuenta de retiro.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Email del proveedor</span>
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="proveedor@corralon.com"
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" />
              </label>
              <label className="block">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Nombre de la cuenta de retiro</span>
                <input value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} placeholder="Ej: Cuenta Obra Palermo"
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" />
              </label>
              <label className="block sm:col-span-2">
                <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Notas (opcional)</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ej: retiro por el depósito de av. Mitre"
                  className="homy-glass-input mt-1.5 w-full rounded-xl px-3 py-2.5 text-sm" />
              </label>
            </div>
            <div className="flex justify-end gap-2 mt-4 flex-wrap">
              <button onClick={() => setShowForm(false)} className="homy-glass-soft rounded-full min-h-[44px] px-4 py-2.5 text-sm font-bold text-slate-500 hover:text-red-500 transition">Cancelar</button>
              <button disabled={busy} onClick={createLink} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50">Crear vinculación</button>
            </div>
          </div>
        )}

        {/* lista de vinculaciones */}
        {loading ? (
          <Loading text="Cargando cuentas de retiro…" />
        ) : links.length === 0 ? (
          <Empty action={
            <button onClick={() => setShowForm(true)} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm">Vincularme con un proveedor</button>
          } />
        ) : (
          <div className="homy-stagger space-y-3">
            {links.map((l) => (
              <div key={l.id} className="homy-glass homy-lift homy-card-glow rounded-2xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="homy-icon-chip homy-chip-blue size-10 shrink-0 [&_svg]:size-5" aria-hidden>
                    <Store className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-bold text-[#0A2540] font-mono text-sm line-clamp-1">{l.accountLabel}</p>
                    <p className="text-xs text-slate-400 line-clamp-1">
                      Proveedor: <b className="text-slate-500">{l.provider.businessName}</b>
                      {l.provider.city ? ` · ${l.provider.city}` : ''} · desde {formatDate(l.createdAt)}
                    </p>
                    {l.notes && (
                      <p className="text-xs text-slate-400 mt-0.5 flex items-start gap-1">
                        <ClipboardPen className="size-3.5 mt-0.5 shrink-0" aria-hidden /> <span className="line-clamp-1 min-w-0">{l.notes}</span>
                      </p>
                    )}
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
          <p className="mt-5 text-xs text-slate-400 leading-relaxed">
            Tip: en cada proyecto, los materiales que propongas con proveedor vinculado reservan stock automáticamente y
            aparecen en la sección &quot;Cuentas de retiro vinculadas&quot; del detalle.
          </p>
        )}
      </div>
    </div>
  )
}

/* Estado vacío: explica el flujo escrow antes de vincular */
function Empty({ action }: { action?: React.ReactNode }) {
  return (
    <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
      <span className="homy-empty-icon homy-chip-blue" aria-hidden><Link2 className="size-7" /></span>
      <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">No tenés cuentas de retiro vinculadas</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">
        Pedile al proveedor su email de registro en HomIA y creá la cuenta acá. Después vas a poder retirar materiales
        y cargarlos directo al proyecto, con la aprobación del cliente y el dinero protegido en escrow.
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
