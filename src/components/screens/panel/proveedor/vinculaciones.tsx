'use client'
// Vinculaciones del proveedor — profesionales con cuenta de retiro + alta por email
import { useEffect, useState } from 'react'
import { PageHeader, Loading, EmptyState, UAvatar } from '@/components/app/ui-bits'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { Switch } from '@/components/ui/switch'
import { Link2, Store, UserRound, Info, Mail, NotebookPen } from 'lucide-react'

type ProfLink = {
  id: string; accountLabel: string; notes: string | null; active: boolean; createdAt: string
  professional: { displayName: string; avatarUrl: string | null; personType: string; companyName: string | null; professions: string[] }
}

function prettyWords(s: string): string {
  return s.replace(/_/g, ' ').split(' ').filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')
}

export default function ProviderLinks() {
  const [links, setLinks] = useState<ProfLink[]>([])
  const [loading, setLoading] = useState(true)

  // formulario de vinculación
  const [email, setEmail] = useState('')
  const [accountLabel, setAccountLabel] = useState('')
  const [notes, setNotes] = useState('')
  const [busy, setBusy] = useState(false)
  const [togglingId, setTogglingId] = useState<string | null>(null)

  async function load() {
    const res = await fetch('/api/provider/links')
    if (res.ok) setLinks((await res.json()).asProvider || [])
  }

  useEffect(() => {
    (async () => { try { await load() } finally { setLoading(false) } })()
  }, [])

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim() || !accountLabel.trim()) { toast.error('Completá el email y el nombre de la cuenta de retiro'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/provider/links', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), accountLabel: accountLabel.trim(), notes: notes.trim() || undefined }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      toast.success('Vinculación creada — le avisamos al profesional')
      setEmail(''); setAccountLabel(''); setNotes('')
      load()
    } finally { setBusy(false) }
  }

  async function toggle(link: ProfLink, active: boolean) {
    setTogglingId(link.id)
    setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, active } : l)))
    try {
      const res = await fetch('/api/provider/links', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: link.id, active }),
      })
      if (!res.ok) {
        setLinks((prev) => prev.map((l) => (l.id === link.id ? { ...l, active: !active } : l)))
        toast.error((await res.json()).error)
        return
      }
      toast.success(active ? 'Vinculación activada' : 'Vinculación pausada')
    } finally { setTogglingId(null) }
  }

  if (loading) return <Loading />

  return (
    <div className="max-w-3xl">
      <PageHeader title="Vinculaciones" subtitle="Profesionales que retiran materiales por tu negocio" />

      {/* explicación */}
      <div className="homy-glass-soft rounded-2xl p-4 mb-5 flex gap-3 items-start">
        <span aria-hidden className="homy-icon-chip homy-chip-ai size-8 shrink-0">
          <Info className="size-4" />
        </span>
        <p className="text-sm text-slate-600 leading-relaxed">
          La <strong>cuenta de retiro</strong> permite que el profesional retire materiales por tu negocio y se facturen a cada proyecto con aprobación del cliente.
          Podés pausar una cuenta cuando quieras sin borrar el historial.
        </p>
      </div>

      {/* listado */}
      {links.length === 0 ? (
        <div className="homy-glass rounded-3xl p-6 mb-6">
          <EmptyState icon={<Link2 />} title="Todavía no vinculaste profesionales"
            hint="Vinculá por email a un profesional registrado en HomIA y creale su cuenta de retiro."
            action={
              <button onClick={() => document.getElementById('form-vincular')?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                className="homy-btn-primary homy-focus px-5 py-2.5 text-sm mx-auto">
                <Link2 className="size-4" /> Vincular el primero
              </button>
            } />
        </div>
      ) : (
        <div className="space-y-3 mb-6">
          {links.map((l) => (
            <div key={l.id} className="homy-glass homy-lift homy-card-glow rounded-2xl p-4 flex flex-wrap items-start justify-between gap-4">
              <div className="flex gap-3 min-w-0 flex-1">
                <UAvatar name={l.professional.companyName || l.professional.displayName} url={l.professional.avatarUrl} size={48} />
                <div className="min-w-0">
                  <p className="font-bold text-[#0A2540] truncate">{l.professional.companyName || l.professional.displayName}</p>
                  <p className="text-xs text-slate-500 capitalize">
                    {l.professional.personType || 'profesional'}
                    {l.professional.professions.length > 0 && ` · ${l.professional.professions.map(prettyWords).join(', ')}`}
                  </p>
                  <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#1D63B8] mt-2">
                    <Store className="size-4 shrink-0" /> Cuenta de retiro: {l.accountLabel}
                  </p>
                  {l.notes && <p className="text-xs text-slate-500 mt-1.5 flex gap-1.5"><NotebookPen className="size-3.5 shrink-0 mt-0.5" />{l.notes}</p>}
                  <p className="text-xs text-slate-400 mt-1">Vinculado el {formatDate(l.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2.5 shrink-0">
                <span className="homy-pill">
                  <span aria-hidden className={`homy-pill-dot ${l.active ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                  {l.active ? 'Activa' : 'Inactiva'}
                </span>
                <Switch checked={l.active} disabled={togglingId === l.id}
                  onCheckedChange={(v) => toggle(l, v)}
                  aria-label={`${l.active ? 'Pausar' : 'Activar'} cuenta de retiro de ${l.professional.companyName || l.professional.displayName}`} />
              </div>
            </div>
          ))}
        </div>
      )}

      {/* formulario de vinculación */}
      <form id="form-vincular" onSubmit={submit} className="homy-glass rounded-3xl p-5 sm:p-6 scroll-mt-24">
        <div className="flex items-center gap-3">
          <span aria-hidden className="homy-icon-chip homy-chip-blue size-9 shrink-0">
            <Link2 className="size-4" />
          </span>
          <h2 className="font-extrabold text-[#0A2540]">Vincular un profesional</h2>
        </div>
        <p className="text-sm text-slate-500 mt-1.5 mb-4">Necesita estar registrado en HomIA con ese email. Al crear la cuenta le llega una notificación.</p>

        <div className="space-y-3.5">
          <div>
            <label htmlFor="vl-email" className="text-sm font-semibold text-[#0A2540] flex items-center gap-1.5"><Mail className="size-3.5 text-slate-400" /> Email del profesional</label>
            <input id="vl-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="profesional@correo.com"
              className="homy-glass-input mt-1 w-full rounded-xl px-4 py-3 text-sm" />
          </div>
          <div>
            <label htmlFor="vl-account" className="text-sm font-semibold text-[#0A2540] flex items-center gap-1.5"><Store className="size-3.5 text-slate-400" /> Nombre de la cuenta de retiro</label>
            <input id="vl-account" value={accountLabel} onChange={(e) => setAccountLabel(e.target.value)} placeholder="Ej: Retiro Juan Pérez — Corralón Central"
              className="homy-glass-input mt-1 w-full rounded-xl px-4 py-3 text-sm" />
          </div>
          <div>
            <label htmlFor="vl-notes" className="text-sm font-semibold text-[#0A2540] flex items-center gap-1.5"><NotebookPen className="size-3.5 text-slate-400" /> Notas <span className="text-slate-400 font-normal">(opcional)</span></label>
            <textarea id="vl-notes" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Condiciones de retiro, horarios, descuentos acordados…"
              className="homy-glass-input mt-1 w-full rounded-xl px-4 py-3 text-sm resize-none" />
          </div>
          <button type="submit" disabled={busy} className="homy-btn-primary w-full py-3 disabled:opacity-60">
            <UserRound className="size-4" /> {busy ? 'Vinculando…' : 'Crear vinculación'}
          </button>
        </div>
      </form>
    </div>
  )
}
