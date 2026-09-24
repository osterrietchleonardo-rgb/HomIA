'use client'
// Tarjeta "Avisos por mail" del perfil (los tres roles). Se carga y se guarda sola
// (GET/PUT /api/profiles/me → User.emailNotifications), así cada perfil solo la monta.
import { useEffect, useState } from 'react'
import { apiFetch } from '@/lib/api-client'
import { toast } from 'sonner'
import { Mail } from 'lucide-react'

const QUE_AVISA: Record<'cliente' | 'profesional' | 'proveedor', string> = {
  cliente: 'Te avisamos cuando te llega una oferta, te emiten una factura o tu reserva está aprobada o lista para retirar.',
  profesional: 'Te avisamos cuando te contratan, te aceptan un presupuesto, te pagan una factura o te piden devolver sobrantes.',
  proveedor: 'Te avisamos cuando te compran o te reservan, cuando te pagan por Mercado Pago y cuando te piden devolver sobrantes.',
}

export function AvisosMailCard({ role }: { role: 'cliente' | 'profesional' | 'proveedor' }) {
  const [on, setOn] = useState<boolean | null>(null)
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let vivo = true
    apiFetch<{ user?: { email?: string; emailNotifications?: boolean } }>('/api/profiles/me', { silent: true }).then((r) => {
      if (!vivo) return
      const u = r.data?.user
      setEmail(u?.email || '')
      setOn(u ? u.emailNotifications !== false : null)
    })
    return () => { vivo = false }
  }, [])

  async function toggle() {
    if (on === null || busy) return
    const next = !on
    setBusy(true)
    setOn(next)
    const r = await apiFetch('/api/profiles/me', { method: 'PUT', json: { emailNotifications: next } })
    setBusy(false)
    if (!r.ok) { setOn(!next); return }
    toast.success(next ? 'Listo: te vamos a avisar por mail' : 'Listo: no te mandamos más avisos por mail')
  }

  return (
    <section className="homy-glass rounded-3xl p-6" aria-labelledby="avisos-mail-title">
      <div className="flex items-start gap-3">
        <span className="homy-icon-chip homy-chip-ai size-8 shrink-0 [&_svg]:size-4" aria-hidden><Mail /></span>
        <div className="min-w-0 flex-1">
          <h2 id="avisos-mail-title" className="homy-section-title">Avisos por mail</h2>
          <p className="mt-1 text-sm leading-relaxed text-slate-500">
            {QUE_AVISA[role]} Los mensajes del chat no llegan por mail.
          </p>
          {email && <p className="mt-1 break-all text-xs text-slate-400">Se mandan a {email}</p>}
        </div>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on === true}
        aria-label="Recibir avisos por mail"
        disabled={on === null || busy}
        onClick={toggle}
        className="homy-focus mt-4 flex min-h-12 w-full items-center justify-between gap-3 rounded-2xl border border-slate-200/70 bg-white/60 px-4 py-3 text-left disabled:opacity-60"
      >
        <span className="text-sm font-bold text-[#0A2540]">Recibir avisos por mail</span>
        <span
          aria-hidden
          className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors ${on ? 'bg-[#FF5A1F]' : 'bg-slate-300'}`}
        >
          <span className={`absolute left-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? 'translate-x-5' : 'translate-x-0'}`} />
        </span>
      </button>
      <p className="mt-2 text-xs text-slate-400">
        El mail para crear una nueva contraseña te llega siempre, aunque apagues los avisos.
      </p>
    </section>
  )
}
