'use client'
// HireWizard — contratación completa y fácil desde el directorio.
// Modal glass de 3 pasos (qué / cuándo-dónde / presupuesto) + resumen + éxito.
// Crea un Project real con brief, fotos, urgencia y fecha; notifica al profesional
// y opcionalmente abre el chat con el brief (el cliente inicia: permitido).
// D16: arriba del primer paso, "¿Es para algo que ya publicaste?" permite partir de un trabajo
// publicado abierto (cliente) o de un proyecto activo (profesional que subcontrata): precarga el
// brief (editable) y al confirmar manda `jobId` o `parentProjectId`.
import { useEffect, useRef, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { navigate } from '@/lib/router'
import { formatARS } from '@/lib/format'
import { UAvatar, VerifyBadge } from '@/components/app/ui-bits'
import { toast } from 'sonner'
import {
  X, ChevronLeft, ChevronRight, CircleCheck, ImagePlus, Loader2,
  MapPin, CalendarDays, Wallet, MessageSquare, Zap, CalendarClock, Infinity as InfinityIcon, Trash2,
  Link2, Info,
} from 'lucide-react'

export type HireTarget = {
  id: string // professionalProfileId
  userId: string
  displayName: string
  companyName: string | null
  avatarUrl: string | null
  city: string | null
  professions: string[]
  verificationStatus?: string
}

type Created = { project: { id: string; title: string }; conversationId: string | null }

const URGENCIAS = [
  { id: 'ya', label: 'Lo antes posible', desc: 'Esta semana si puede ser', icon: Zap },
  { id: 'esta_semana', label: 'Próximas semanas', desc: 'Coordinamos una fecha', icon: CalendarClock },
  { id: 'normal', label: 'Fecha flexible', desc: 'Busco la mejor propuesta', icon: InfinityIcon },
]

const URGENCY_LABEL: Record<string, string> = { ya: 'Lo antes posible', esta_semana: 'Próximas semanas', normal: 'Fecha flexible' }

// ── Origen elegido (D16) ──
type SourceJob = {
  id: string; title: string; description: string; categorySlug: string; categoryName: string
  urgency: string; budgetMin: number | null; budgetMax: number | null; address: string | null; city: string | null
  photos: string[]; createdAt: string; bidsCount: number; targetBidAmount: number | null
}
type SourceProject = {
  id: string; title: string; description: string | null; stage: string; clientName: string
  categorySlug: string | null; categoryName: string | null; urgency: string | null
  budgetMin: number | null; budgetMax: number | null; address: string | null; city: string | null
  deadline: string | null; photos: string[]; createdAt: string
}
type Source = { kind: 'job'; item: SourceJob } | { kind: 'project'; item: SourceProject }

const STAGE_LABEL: Record<string, string> = { presupuesto: 'Presupuesto', materiales: 'Materiales', ejecucion: 'Ejecución', revision: 'Revisión' }
// urgencia del trabajo publicado (baja|normal|alta|urgente) → la del asistente (ya|esta_semana|normal)
const JOB_URGENCY_TO_WIZARD: Record<string, string> = { urgente: 'ya', alta: 'ya', normal: 'esta_semana', baja: 'normal' }
const shortDate = (d: string) => new Date(d).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })

export default function HireWizard({
  target, open, onClose, viewerCity,
}: {
  target: HireTarget | null
  open: boolean
  onClose: () => void
  viewerCity?: string | null
}) {
  const [step, setStep] = useState(0) // 0..2 pasos + 3 resumen + 4 éxito
  const [busy, setBusy] = useState(false)
  const [created, setCreated] = useState<Created | null>(null)

  // datos del brief
  const [title, setTitle] = useState('')
  const [desc, setDesc] = useState('')
  const [rubro, setRubro] = useState<string | null>(null)
  const [photos, setPhotos] = useState<{ url: string; name: string }[]>([])
  const [uploading, setUploading] = useState(false)
  const [urgency, setUrgency] = useState('esta_semana')
  const [deadline, setDeadline] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [note, setNote] = useState('')
  const fileRef = useRef<HTMLInputElement>(null)

  // "¿Es para algo que ya publicaste?": trabajos abiertos del cliente y proyectos activos del profesional
  const [sources, setSources] = useState<{ jobs: SourceJob[]; projects: SourceProject[] } | null>(null)
  const [source, setSource] = useState<Source | null>(null)
  const targetId = target?.id
  useEffect(() => {
    if (!open || !targetId) return
    let alive = true
    fetch(`/api/projects/hire-sources?professionalProfileId=${encodeURIComponent(targetId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (alive) setSources(d && Array.isArray(d.jobs) ? { jobs: d.jobs, projects: d.projects || [] } : null) })
      .catch(() => { if (alive) setSources(null) }) // sin sesión o sin red: el selector no aparece y el formulario queda como siempre
    return () => { alive = false }
  }, [open, targetId])

  if (!target) return null

  function clearBrief() {
    setTitle(''); setDesc(''); setRubro(null); setPhotos([])
    setUrgency('esta_semana'); setDeadline(''); setAddress(''); setCity('')
    setBudgetMin(''); setBudgetMax('')
  }

  function reset() {
    setStep(0); setCreated(null); clearBrief(); setNote(''); setSource(null)
  }

  // Precarga el brief desde el trabajo/proyecto elegido; todo sigue editable.
  function applySource(next: Source | null) {
    setSource(next)
    if (!next) { clearBrief(); return }
    const it = next.item
    setTitle(it.title.slice(0, 120))
    setDesc((it.description || '').slice(0, 2000))
    setRubro(it.categorySlug || null)
    setPhotos(it.photos.slice(0, 4).map((url, i) => ({ url, name: `foto-${i + 1}` })))
    setUrgency(next.kind === 'job'
      ? JOB_URGENCY_TO_WIZARD[next.item.urgency] || 'esta_semana'
      : next.item.urgency && URGENCY_LABEL[next.item.urgency] ? next.item.urgency : 'esta_semana')
    const today = new Date().toISOString().slice(0, 10)
    const dl = next.kind === 'project' && next.item.deadline ? next.item.deadline.slice(0, 10) : ''
    setDeadline(dl && dl >= today ? dl : '')
    setAddress(it.address || '')
    setCity(it.city || '')
    setBudgetMin(it.budgetMin && it.budgetMin > 0 ? String(it.budgetMin) : '')
    setBudgetMax(it.budgetMax && it.budgetMax > 0 ? String(it.budgetMax) : '')
  }

  function onPickSource(value: string) {
    if (!value) { applySource(null); return }
    const [kind, id] = value.split(':')
    if (kind === 'job') {
      const item = sources?.jobs.find((j) => j.id === id)
      if (item) applySource({ kind: 'job', item })
    } else {
      const item = sources?.projects.find((p) => p.id === id)
      if (item) applySource({ kind: 'project', item })
    }
  }
  const hasSources = !!sources && (sources.jobs.length > 0 || sources.projects.length > 0)
  const descMax = source ? 2000 : 600

  function close() {
    onClose()
    // si salió con éxito ya navegó; si abortó, resetea al cerrar
    setTimeout(reset, 250)
  }

  async function uploadFiles(files: FileList | null) {
    if (!files || files.length === 0) return
    setUploading(true)
    try {
      for (const f of Array.from(files).slice(0, 4 - photos.length)) {
        const fd = new FormData()
        fd.append('file', f)
        fd.append('folder', 'hire')
        const res = await fetch('/api/uploads', { method: 'POST', body: fd })
        const d = await res.json()
        if (res.ok) setPhotos((p) => [...p, { url: d.url, name: d.name }])
        else toast.error(d.error || 'No se pudo subir la foto')
      }
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const step1Ok = title.trim().length >= 4 && desc.trim().length >= 10
  const budgetOk =
    (!budgetMin && !budgetMax) ||
    (Number(budgetMin) > 0 && !budgetMax) ||
    (!budgetMin && Number(budgetMax) > 0) ||
    (Number(budgetMin) > 0 && Number(budgetMax) > 0 && Number(budgetMax) >= Number(budgetMin))

  const proName = target.companyName || target.displayName
  const rubroSel = rubro || target.professions[0] || null
  // el rubro del trabajo elegido aparece aunque no sea uno de los oficios del profesional
  const rubroChips = [...new Set([...(rubro ? [rubro] : []), ...target.professions.slice(0, 6)])]

  async function confirm() {
    if (busy) return
    setBusy(true)
    try {
      // El presupuesto del cliente viaja como referencia (budgetMin/Max); la mano de obra
      // NO se manda: la cotiza el profesional en la etapa de presupuesto.
      const res = await fetch('/api/projects', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          professionalProfileId: target!.id,
          title: title.trim(),
          description: desc.trim(),
          budgetMin: Number(budgetMin) > 0 ? Number(budgetMin) : undefined,
          budgetMax: Number(budgetMax) > 0 ? Number(budgetMax) : undefined,
          categorySlug: rubroSel || undefined,
          urgency,
          address: address.trim() || undefined,
          city: city.trim() || undefined,
          deadline: deadline || undefined,
          photos: photos.map((p) => p.url),
          firstMessage: note.trim() || undefined,
          jobId: source?.kind === 'job' ? source.item.id : undefined,
          parentProjectId: source?.kind === 'project' ? source.item.id : undefined,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'No se pudo crear la contratación'); return }
      setCreated(d)
      setStep(4)
    } catch {
      toast.error('No pudimos conectar con HomIA. Revisá tu conexión y probá de nuevo.')
    } finally { setBusy(false) }
  }

  // Enter en cualquier input avanza el paso (o confirma en el resumen)
  function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (busy || uploading) return
    if (step === 0 && step1Ok) setStep(1)
    else if (step === 1) setStep(2)
    else if (step === 2 && budgetOk) setStep(3)
    else if (step === 3 && budgetOk) confirm()
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
          className="fixed inset-0 z-[80] grid place-items-end sm:place-items-center bg-[#0A2540]/70 p-0 sm:p-6 backdrop-blur-sm"
          role="dialog" aria-modal="true" aria-label={`Contratar a ${proName}`}
          onMouseDown={(e) => { if (e.target === e.currentTarget && step !== 4) close() }}
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 30, opacity: 0, scale: 0.98 }}
            transition={{ type: 'spring', damping: 26, stiffness: 300 }}
            className="homy-glass-strong relative flex max-h-[94dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl sm:rounded-3xl"
          >
            {/* header */}
            <div className="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#0A2540] via-[#0D3050] to-[#14406B] px-5 pb-5 pt-4 sm:px-7">
              <span aria-hidden className="pointer-events-none absolute inset-0" style={{ background: 'radial-gradient(60% 90% at 90% -20%, rgba(0,196,255,0.2) 0%, transparent 60%), radial-gradient(40% 60% at -5% 120%, rgba(255,90,31,0.16) 0%, transparent 55%)' }} />
              <div className="relative flex items-center justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <UAvatar name={target.displayName} url={target.avatarUrl} size={42} />
                  <div className="min-w-0">
                    <p className="flex min-w-0 items-center gap-1.5 text-[15px] font-extrabold text-white">
                      <span className="min-w-0 truncate" title={proName}>{proName}</span>
                      {target.verificationStatus && <VerifyBadge status={target.verificationStatus} dark compact />}
                    </p>
                    <p className="truncate text-xs font-semibold text-[#66DFFF] capitalize">
                      {target.professions.slice(0, 3).join(' · ') || 'Profesional'}
                    </p>
                  </div>
                </div>
                {step !== 4 && (
                  <button onClick={close} aria-label="Cerrar contratación" className="homy-focus grid size-9 shrink-0 place-items-center rounded-full bg-white/10 text-white transition hover:bg-white/20">
                    <X className="size-4.5" aria-hidden />
                  </button>
                )}
              </div>
              {/* progreso */}
              {step < 4 && (
                <div className="relative mt-4 flex items-center gap-1.5" aria-hidden>
                  {[0, 1, 2, 3].map((i) => (
                    <div key={i} className={`h-1.5 flex-1 rounded-full transition-all duration-300 ${i <= step ? 'bg-gradient-to-r from-[#00C4FF] to-[#1D63B8]' : 'bg-white/12'}`} />
                  ))}
                </div>
              )}
              {step < 4 && (
                <p className="relative mt-2.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-[#66DFFF]">
                  Paso {Math.min(step + 1, 4)} de 4 — {['Qué necesitás', 'Cuándo y dónde', 'Presupuesto', 'Confirmar'][step]}
                </p>
              )}
            </div>

            {/* cuerpo + footer en un form: Enter avanza el paso */}
            <form onSubmit={onSubmit} className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
              {step === 0 && (
                <div className="space-y-4">
                  {hasSources && sources && (
                    <div className="homy-glass-soft rounded-2xl p-3.5">
                      <Field label="¿Es para algo que ya publicaste?" htmlFor="hire-source">
                        <select
                          id="hire-source"
                          value={source ? `${source.kind}:${source.item.id}` : ''}
                          onChange={(e) => onPickSource(e.target.value)}
                          className="homy-glass-input homy-focus min-h-[44px] w-full cursor-pointer rounded-xl px-3 py-2.5 text-sm"
                        >
                          <option value="">No, lo escribo ahora</option>
                          {sources.jobs.length > 0 && (
                            <optgroup label="Tus trabajos publicados (abiertos)">
                              {sources.jobs.map((j) => (
                                <option key={j.id} value={`job:${j.id}`}>
                                  {`${j.title} · ${j.categoryName} · ${shortDate(j.createdAt)} · ${j.bidsCount} oferta${j.bidsCount === 1 ? '' : 's'}`}
                                </option>
                              ))}
                            </optgroup>
                          )}
                          {sources.projects.length > 0 && (
                            <optgroup label="Tus proyectos activos (subcontratar)">
                              {sources.projects.map((p) => (
                                <option key={p.id} value={`project:${p.id}`}>
                                  {`${p.title} · cliente ${p.clientName} · ${STAGE_LABEL[p.stage] || p.stage}`}
                                </option>
                              ))}
                            </optgroup>
                          )}
                        </select>
                      </Field>
                      {source ? (
                        <div className="mt-2.5 space-y-2">
                          <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-[#1D63B8]/10 py-1 pl-3 pr-1 text-xs font-bold text-[#1D63B8]">
                            <Link2 className="size-3.5 shrink-0" aria-hidden />
                            <span className="min-w-0 truncate">Basado en: {source.item.title}</span>
                            <button
                              type="button" onClick={() => applySource(null)}
                              aria-label="Quitar el trabajo elegido y escribir de cero"
                              className="homy-focus grid size-7 shrink-0 place-items-center rounded-full transition hover:bg-[#1D63B8]/15"
                            ><X className="size-3.5" aria-hidden /></button>
                          </span>
                          <p className="flex gap-1.5 text-[11.5px] leading-relaxed text-slate-500">
                            <Info className="mt-0.5 size-3.5 shrink-0 text-[#1D63B8]" aria-hidden />
                            <span>{sourceHint(source, proName)} Podés cambiar los datos que cargamos.</span>
                          </p>
                        </div>
                      ) : (
                        <p className="mt-2 text-[11.5px] leading-relaxed text-slate-500">
                          Elegí uno para cargar sus datos, o seguí y escribilo ahora.
                        </p>
                      )}
                    </div>
                  )}
                  <Field label="¿Qué trabajo necesitás?" htmlFor="hire-title">
                    <input
                      id="hire-title" autoFocus
                      value={title} onChange={(e) => setTitle(e.target.value)}
                      placeholder="Ej: Renovar instalación eléctrica del living"
                      className="homy-glass-input rounded-xl px-3.5 py-3 min-h-[44px] text-sm w-full" maxLength={source ? 120 : 90}
                    />
                  </Field>
                  <Field label="Contale los detalles" hint={`${desc.length}/${descMax}`} htmlFor="hire-desc">
                    <textarea
                      id="hire-desc"
                      value={desc} onChange={(e) => setDesc(e.target.value.slice(0, descMax))}
                      rows={4}
                      placeholder="Contale qué hay que hacer, el estado actual, medidas, si tenés los materiales…"
                      className="homy-glass-input rounded-xl px-3.5 py-3 min-h-[44px] text-sm w-full resize-none leading-relaxed"
                    />
                  </Field>
                  {rubroChips.length > 0 && (
                    <Field label="Rubro principal">
                      <div className="flex flex-wrap gap-2">
                        {rubroChips.map((r) => (
                          <button
                            key={r} type="button" onClick={() => setRubro(r)}
                            aria-pressed={rubroSel === r}
                            className={`homy-focus rounded-full px-3.5 py-2 text-xs font-bold capitalize transition ${rubroSel === r ? 'bg-[#1D63B8] text-white shadow-[0_4px_14px_rgba(29,99,184,0.35)]' : 'homy-glass-soft text-slate-500 hover:text-[#1D63B8]'}`}
                          >{r}</button>
                        ))}
                      </div>
                    </Field>
                  )}
                  <Field label="Fotos del lugar (opcional, hasta 4)">
                    <div className="flex flex-wrap gap-2">
                      {photos.map((p, i) => (
                        <div key={p.url} className="group relative size-20 overflow-hidden rounded-xl ring-1 ring-[#0A2540]/10">
                          <img src={p.url} alt={`Foto ${i + 1} del trabajo`} className="size-full object-cover" />
                          <button
                            type="button"
                            onClick={() => setPhotos((ps) => ps.filter((x) => x.url !== p.url))}
                            aria-label={`Quitar foto ${i + 1}`}
                            className="absolute right-1 top-1 grid size-6 place-items-center rounded-full bg-[#0A2540]/75 text-white transition hover:bg-red-500"
                          ><Trash2 className="size-3" aria-hidden /></button>
                        </div>
                      ))}
                      {photos.length < 4 && (
                        <button
                          type="button"
                          onClick={() => fileRef.current?.click()} disabled={uploading}
                          className="grid size-20 place-items-center rounded-xl border-2 border-dashed border-[#0A2540]/15 text-slate-400 transition hover:border-[#1D63B8]/40 hover:text-[#1D63B8] disabled:opacity-50"
                          aria-label="Agregar foto del trabajo"
                        >
                          {uploading ? <Loader2 className="size-5 animate-spin" aria-hidden /> : <ImagePlus className="size-5" aria-hidden />}
                        </button>
                      )}
                      <input ref={fileRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => uploadFiles(e.target.files)} />
                    </div>
                  </Field>
                </div>
              )}

              {step === 1 && (
                <div className="space-y-4">
                  <Field label="¿Con qué urgencia lo necesitás?">
                    <div className="grid gap-2.5 sm:grid-cols-3">
                      {URGENCIAS.map((u) => (
                        <button
                          key={u.id} type="button" onClick={() => setUrgency(u.id)} aria-pressed={urgency === u.id}
                          className={`homy-focus rounded-2xl p-3.5 text-left transition ${urgency === u.id ? 'bg-[#1D63B8] text-white shadow-[0_6px_18px_rgba(29,99,184,0.35)]' : 'homy-glass-soft hover:ring-1 hover:ring-[#1D63B8]/30'}`}
                        >
                          <u.icon className={`size-5 ${urgency === u.id ? 'text-[#66DFFF]' : 'text-[#1D63B8]'}`} aria-hidden />
                          <p className="mt-2 text-[13px] font-extrabold leading-tight">{u.label}</p>
                          <p className={`mt-0.5 text-[11px] leading-snug ${urgency === u.id ? 'text-white/75' : 'text-slate-400'}`}>{u.desc}</p>
                        </button>
                      ))}
                    </div>
                  </Field>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Fecha deseada (opcional)" htmlFor="hire-deadline">
                      <input id="hire-deadline" type="date" value={deadline} min={new Date().toISOString().slice(0, 10)} onChange={(e) => setDeadline(e.target.value)} className="homy-glass-input rounded-xl px-3.5 py-3 min-h-[44px] text-sm w-full" />
                    </Field>
                    <Field label="Localidad" htmlFor="hire-city">
                      <input id="hire-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder={target.city || viewerCity || 'Ciudad'} className="homy-glass-input rounded-xl px-3.5 py-3 min-h-[44px] text-sm w-full" />
                    </Field>
                  </div>
                  <Field label="Dirección del trabajo (opcional)" htmlFor="hire-address">
                    <div className="relative">
                      <MapPin className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
                      <input id="hire-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle, número, piso/depto" className="homy-glass-input rounded-xl px-3.5 py-3 min-h-[44px] text-sm w-full pl-10" />
                    </div>
                  </Field>
                </div>
              )}

              {step === 2 && (
                <div className="space-y-4">
                  <Field label="Presupuesto estimado (opcional)">
                    <div className="grid grid-cols-2 gap-3">
                      <MoneyInput value={budgetMin} onChange={setBudgetMin} label="Desde" />
                      <MoneyInput value={budgetMax} onChange={setBudgetMax} label="Hasta" />
                    </div>
                    {budgetMin && budgetMax && Number(budgetMax) > 0 && Number(budgetMax) < Number(budgetMin) && (
                      <p className="mt-2 text-xs font-bold text-red-500">El máximo debe ser mayor o igual al mínimo.</p>
                    )}
                    <p className="mt-2 text-xs leading-relaxed text-slate-400">
                      Es una referencia para agilizar el presupuesto final: el profesional te manda el precio cerrado después de ver el detalle.
                    </p>
                  </Field>
                  <Field label="Mensaje para el profesional (opcional)" htmlFor="hire-note">
                    <textarea
                      id="hire-note"
                      value={note} onChange={(e) => setNote(e.target.value.slice(0, 500))}
                      rows={3}
                      placeholder={`Hola ${target.displayName}, te contrato para… (se envía con tu brief)`}
                      className="homy-glass-input rounded-xl px-3.5 py-3 min-h-[44px] text-sm w-full resize-none leading-relaxed"
                    />
                    <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400">
                      <MessageSquare className="size-3.5 shrink-0" aria-hidden /> Si lo escribís, se abre el chat con este mensaje.
                    </p>
                  </Field>
                </div>
              )}

              {step === 3 && (
                <div className="space-y-3.5">
                  {source && (
                    <SummaryRow icon={<Link2 className="size-4" aria-hidden />} tone="blue" label={source.kind === 'job' ? 'Basado en tu trabajo publicado' : 'Subcontratación de tu proyecto'}>
                      <p className="font-extrabold text-[#0A2540]">{source.item.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-slate-500">{sourceHint(source, proName)}</p>
                    </SummaryRow>
                  )}
                  <SummaryRow icon={<CircleCheck className="size-4" aria-hidden />} tone="mint" label="Trabajo">
                    <p className="font-extrabold text-[#0A2540]">{title}</p>
                    <p className="mt-1 line-clamp-3 text-sm leading-relaxed text-slate-500">{desc}</p>
                    {photos.length > 0 && <p className="mt-1.5 text-xs font-bold text-[#1D63B8]">{photos.length} foto{photos.length > 1 ? 's' : ''} adjunta{photos.length > 1 ? 's' : ''}</p>}
                  </SummaryRow>
                  <SummaryRow icon={<CalendarDays className="size-4" aria-hidden />} tone="blue" label="Cuándo y dónde">
                    <p className="text-sm font-bold text-[#0A2540]">{URGENCY_LABEL[urgency] || urgency}{deadline ? ` · desde ${new Date(deadline + 'T12:00:00').toLocaleDateString('es-AR')}` : ''}</p>
                    <p className="mt-0.5 text-sm text-slate-500">{[address, city].filter(Boolean).join(', ') || 'A coordinar con el profesional'}</p>
                  </SummaryRow>
                  <SummaryRow icon={<Wallet className="size-4" aria-hidden />} tone="gold" label="Presupuesto estimado">
                    {Number(budgetMin) > 0 || Number(budgetMax) > 0 ? (
                      <p className="text-lg font-extrabold tabular-nums text-[#0A2540]">
                        {Number(budgetMin) > 0 && formatARS(Number(budgetMin))}
                        {Number(budgetMin) > 0 && Number(budgetMax) > 0 ? ' — ' : ''}
                        {Number(budgetMax) > 0 && formatARS(Number(budgetMax))}
                      </p>
                    ) : (
                      <p className="text-sm font-bold text-slate-500">A convenir según el presupuesto del profesional</p>
                    )}
                  </SummaryRow>
                  {note.trim() && (
                    <SummaryRow icon={<MessageSquare className="size-4" aria-hidden />} tone="ai" label="Mensaje inicial">
                      <p className="text-sm italic leading-relaxed text-slate-600">“{note.trim()}”</p>
                    </SummaryRow>
                  )}
                  <p className="rounded-2xl homy-glass-soft px-4 py-3 text-xs leading-relaxed text-slate-500">
                    Al confirmar, <strong className="text-[#0A2540]">{proName}</strong> recibe la notificación con tu brief y aparece en <strong className="text-[#0A2540]">Mis proyectos</strong>. Pagás al finalizar, con Mercado Pago o efectivo.
                  </p>
                </div>
              )}

              {step === 4 && created && (
                <div className="py-2 text-center">
                  <motion.span
                    initial={{ scale: 0.6, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: 'spring', damping: 12 }}
                    className="homy-icon-chip homy-chip-mint mx-auto grid size-16 place-items-center"
                  >
                    <CircleCheck className="size-8" aria-hidden />
                  </motion.span>
                  <h3 className="mt-4 text-xl font-extrabold tracking-tight text-[#0A2540]">¡Contratación enviada!</h3>
                  <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
                    <strong className="text-[#0A2540]">{proName}</strong> ya tiene tu brief de <strong className="text-[#0A2540]">{created.project.title}</strong> y le llegó la notificación. {source?.kind === 'job' && source.item.targetBidAmount ? 'Quedó aceptada su oferta: ya pueden coordinar materiales y fechas.' : 'Va a cotizar la mano de obra en tu proyecto.'}
                  </p>
                  {source && (
                    <p className="mx-auto mt-2 max-w-sm text-xs font-semibold leading-relaxed text-[#1D63B8]">
                      {source.kind === 'job'
                        ? `Tu trabajo "${source.item.title}" pasó a en proceso.`
                        : `Quedó vinculada a tu proyecto "${source.item.title}".`}
                    </p>
                  )}
                  {!created.conversationId && (
                    <p className="mx-auto mt-3 max-w-sm rounded-2xl homy-glass-soft px-4 py-3 text-xs font-semibold leading-relaxed text-slate-600">
                      Abrí el chat para coordinar: el profesional no puede escribirte primero.
                    </p>
                  )}
                  <div className="mx-auto mt-6 grid max-w-sm gap-2.5">
                    <button
                      type="button"
                      onClick={() => { close(); navigate(created.conversationId ? `/mensajes?c=${created.conversationId}` : `/mensajes?c=nuevo:${target.userId}`) }}
                      className={`${created.conversationId ? 'homy-btn-dark' : 'homy-btn-primary'} w-full px-6 py-3.5 text-sm`}
                    >
                      <MessageSquare className="size-4" aria-hidden /> Abrir el chat
                    </button>
                    <button type="button" onClick={() => { close(); navigate(source?.kind === 'project' ? `/panel/profesional/proyectos/${created.project.id}` : `/panel/cliente/proyectos/${created.project.id}`) }} className={`${created.conversationId ? 'homy-btn-primary' : 'homy-btn-dark'} w-full px-6 py-3.5 text-sm`}>
                      Ver el proyecto
                    </button>
                    <button type="button" onClick={() => { close(); navigate('/directorio') }} className="homy-focus rounded-xl px-6 py-3 text-sm font-bold text-[#1D63B8] transition hover:bg-[#1D63B8]/5">
                      Seguir explorando el directorio
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* footer de navegación */}
            {step < 4 && (
              <div className="flex shrink-0 items-center justify-between gap-3 border-t border-[#0A2540]/8 bg-white/50 px-5 py-4 sm:px-7">
                {step > 0 ? (
                  <button type="button" onClick={() => setStep((s) => s - 1)} className="homy-focus inline-flex items-center gap-1.5 rounded-xl px-4 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-[#0A2540]/5 hover:text-[#0A2540]">
                    <ChevronLeft className="size-4" aria-hidden /> Atrás
                  </button>
                ) : <span />}
                {step < 3 ? (
                  <button
                    type="submit"
                    disabled={(step === 0 && !step1Ok) || (step === 2 && !budgetOk)}
                    className="homy-btn-primary inline-flex items-center gap-1.5 px-6 py-3 text-sm disabled:opacity-40"
                  >
                    Continuar <ChevronRight className="size-4" aria-hidden />
                  </button>
                ) : (
                  <button type="submit" disabled={busy || !budgetOk} className="homy-btn-primary inline-flex items-center gap-2 px-6 py-3 text-sm disabled:opacity-50">
                    {busy && <Loader2 className="size-4 animate-spin" aria-hidden />}
                    {busy ? 'Enviando…' : 'Confirmar contratación'}
                  </button>
                )}
              </div>
            )}
            </form>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// Qué pasa al confirmar según el origen elegido (texto honesto, igual al que hace el servidor).
function sourceHint(source: Source, proName: string): string {
  if (source.kind === 'project') {
    return `Queda como subcontratación de tu proyecto con ${source.item.clientName}. Tu cliente no la ve ni ve sus montos.`
  }
  const j = source.item
  const others = j.bidsCount - (j.targetBidAmount ? 1 : 0)
  let t = 'Al confirmar, tu trabajo queda en proceso'
  if (j.targetBidAmount) t += ` y la oferta de ${proName} (${formatARS(j.targetBidAmount)}) queda aceptada`
  if (others > 0) t += `; ${others === 1 ? 'la otra oferta queda rechazada' : `las otras ${others} ofertas quedan rechazadas`} y ${others === 1 ? 'le' : 'les'} avisamos`
  return t + '.'
}

// Field NO envuelve en <label>: adentro puede haber grupos de botones (rubro, urgencia, fotos)
// y un <label> alrededor de botones rompe el foco/click. Con `htmlFor` se asocia al input.
function Field({ label, hint, htmlFor, children }: { label: string; hint?: string; htmlFor?: string; children: React.ReactNode }) {
  const head = (
    <>
      {label}
      {hint && <span className="font-semibold normal-case tracking-normal text-slate-400">{hint}</span>}
    </>
  )
  const headClass = 'mb-1.5 flex items-center justify-between text-xs font-extrabold uppercase tracking-[0.1em] text-[#0A2540]/70'
  return (
    <div className="block">
      {htmlFor ? <label htmlFor={htmlFor} className={headClass}>{head}</label> : <p className={headClass}>{head}</p>}
      {children}
    </div>
  )
}

function MoneyInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  const id = `hire-money-${label.toLowerCase()}`
  return (
    <div className="block">
      <label htmlFor={id} className="mb-1 block text-[11px] font-bold uppercase tracking-wider text-slate-400">{label}</label>
      <span className="relative block">
        <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400">$</span>
        <input
          id={id}
          type="number" min={0} inputMode="numeric" value={value} onChange={(e) => onChange(e.target.value)}
          placeholder="0" className="homy-num homy-glass-input rounded-xl px-3.5 py-3 min-h-[44px] text-sm w-full pl-8"
        />
      </span>
    </div>
  )
}

function SummaryRow({ icon, tone, label, children }: { icon: React.ReactNode; tone: string; label: string; children: React.ReactNode }) {
  return (
    <div className="homy-glass flex gap-3.5 rounded-2xl p-4">
      <span className={`homy-icon-chip ${tone === 'mint' ? 'homy-chip-mint' : tone === 'blue' ? 'homy-chip-blue' : tone === 'gold' ? 'homy-chip-gold' : 'homy-chip-ai'} size-9 shrink-0 [&_svg]:size-[18px]`} aria-hidden>{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10.5px] font-extrabold uppercase tracking-[0.12em] text-slate-400">{label}</p>
        <div className="mt-1">{children}</div>
      </div>
    </div>
  )
}
