'use client'
// Cuentas de retiro: vinculación del profesional con proveedores para retirar materiales a cuenta del proyecto
import { useEffect, useState } from 'react'
import { Loading } from '@/components/app/ui-bits'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { apiFetch, NETWORK_ERROR } from '@/lib/api-client'
import { Truck, Plus, Store, Link2, ClipboardPen, PauseCircle, Clock, CircleCheck, RefreshCw, WifiOff } from 'lucide-react'

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

  const [error, setError] = useState<string | null>(null)

  async function load() {
    setLoading(true)
    setError(null)
    const r = await apiFetch<{ asProfessional: LinkRow[] }>('/api/provider/links?as=profesional', { silent: true })
    if (r.ok) setLinks(r.data?.asProfessional || [])
    else setError(r.error || NETWORK_ERROR)
    setLoading(false)
  }
  useEffect(() => { load() }, [])

  async function createLink() {
    if (!email.trim() || !accountLabel.trim()) { toast.error('Email del proveedor y nombre de cuenta son obligatorios'); return }
    setBusy(true)
    try {
      const r = await apiFetch('/api/provider/links', {
        method: 'POST',
        json: { email: email.trim(), accountLabel: accountLabel.trim(), notes: notes.trim() || undefined, as: 'profesional' },
      })
      if (!r.ok) return
      toast.success('Solicitud enviada: el proveedor tiene que aprobarla para que puedas retirar')
      setShowForm(false); setEmail(''); setAccountLabel(''); setNotes('')
      load()
    } finally { setBusy(false) }
  }

  // el profesional solo puede pausar la suya; reactivarla la decide el proveedor
  async function pause(link: LinkRow) {
    setBusy(true)
    try {
      const r = await apiFetch('/api/provider/links', { method: 'PATCH', json: { id: link.id, active: false } })
      if (!r.ok) return
      toast.success('Cuenta pausada. Para reactivarla, pedíselo al proveedor.')
      setLinks((cur) => cur.map((l) => (l.id === link.id ? { ...l, active: false } : l)))
    } finally { setBusy(false) }
  }

  return (
    <div className="homy-page">
      <div>
        {/* Encabezado */}
        <header className="homy-page-head">
          <div className="min-w-0">
            <span className="homy-eyebrow">Compra de materiales</span>
            <h1 className="homy-page-title mt-1.5">Cuentas de retiro</h1>
            <p className="homy-page-sub">Proveedores que te habilitan a retirar materiales a cuenta de tus proyectos.</p>
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
            Es un acuerdo con un proveedor para <b className="text-white">retirar materiales del local a cuenta de un proyecto</b>.
            El cliente aprueba cada material desde su panel y el cobro de esos materiales se arregla por el proyecto.
            <b className="text-white"> No es una cuenta bancaria</b> ni guarda plata: solo te identifica frente a ese proveedor.
            La solicitás vos y el proveedor la activa; mientras no la active, no podés retirar.
          </p>
        </div>

        {/* formulario de vinculación */}
        {showForm && (
          <div className="homy-glass rounded-3xl p-5 mb-5">
            <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-1">
              <span className="homy-icon-chip homy-chip-blue size-8 [&_svg]:size-4" aria-hidden><Store /></span>
              Vincularme con un proveedor
            </h2>
            <p className="text-sm text-slate-500 mb-4">Ingresá el email con el que el proveedor está registrado en HomIA. Le llega tu solicitud y la tiene que aprobar.</p>
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
              <button disabled={busy} onClick={createLink} className="homy-btn-primary min-h-[44px] px-5 py-2.5 text-sm disabled:opacity-50">{busy ? 'Enviando…' : 'Enviar solicitud'}</button>
            </div>
          </div>
        )}

        {/* lista de vinculaciones */}
        {loading ? (
          <Loading text="Cargando cuentas de retiro…" />
        ) : error ? (
          <div className="homy-empty homy-glass-soft border border-dashed border-red-300/60" role="alert">
            <span className="homy-empty-icon homy-chip-orange" aria-hidden><WifiOff className="size-7" /></span>
            <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">No pudimos cargar tus cuentas de retiro</h3>
            <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">{error}</p>
            <div className="mt-5">
              <button onClick={load} className="homy-btn-dark min-h-[44px] px-5 py-2.5 text-sm"><RefreshCw className="size-4" aria-hidden /> Reintentar</button>
            </div>
          </div>
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
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  {l.active ? (
                    <>
                      <span className="homy-pill"><CircleCheck className="size-3.5 text-emerald-600" aria-hidden /> Activa</span>
                      <button onClick={() => pause(l)} disabled={busy}
                        className="homy-glass-soft homy-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-slate-500 transition hover:text-[#0A2540] disabled:opacity-50">
                        <PauseCircle className="size-4" aria-hidden /> Pausar
                      </button>
                    </>
                  ) : (
                    <span className="homy-pill max-w-full" title="El proveedor todavía no la activó o la pausó">
                      <Clock className="size-3.5 shrink-0 text-amber-600" aria-hidden />
                      <span className="whitespace-normal">Pendiente de aprobación del proveedor / pausada</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* nota sobre el flujo */}
        {links.length > 0 && (
          <p className="mt-5 text-xs text-slate-400 leading-relaxed">
            Solo las cuentas activas te habilitan a retirar. Si una figura como pendiente o pausada, hablá con el proveedor:
            es él quien la activa.
          </p>
        )}
      </div>
    </div>
  )
}

/* Estado vacío: explica el flujo de materiales antes de vincular */
function Empty({ action }: { action?: React.ReactNode }) {
  return (
    <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
      <span className="homy-empty-icon homy-chip-blue" aria-hidden><Link2 className="size-7" /></span>
      <h3 className="font-bold text-[#0A2540] text-lg tracking-tight">No tenés cuentas de retiro vinculadas</h3>
      <p className="text-sm text-slate-500 mt-1.5 max-w-md leading-relaxed">
        Pedile al proveedor su email de registro en HomIA y mandale la solicitud desde acá. Cuando la active, vas a poder
        retirar materiales a cuenta de tus proyectos, con la aprobación del cliente.
      </p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}
