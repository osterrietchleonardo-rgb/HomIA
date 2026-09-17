'use client'
// Publicar trabajo HomIA (cliente)
import { useState } from 'react'
import { navigate } from '@/lib/router'
import { toast } from 'sonner'
import { useLocation } from '@/lib/store'
import {
  CloudUpload, X, Megaphone, MapPin, PenLine, AlarmClock, Camera,
  Droplets, Flame, Zap, BrickWall, PaintRoller, Hammer, Anvil, Sparkles, Sprout, AirVent, Warehouse, DoorClosed,
} from 'lucide-react'

const CATEGORIES = [
  { slug: 'plomeria', name: 'Plomería', icon: Droplets }, { slug: 'gasistas', name: 'Gas', icon: Flame },
  { slug: 'electricistas', name: 'Electricidad', icon: Zap }, { slug: 'albanileria', name: 'Albañilería', icon: BrickWall },
  { slug: 'pintura', name: 'Pintura', icon: PaintRoller }, { slug: 'carpinteria', name: 'Carpintería', icon: Hammer },
  { slug: 'herreria', name: 'Herrería', icon: Anvil }, { slug: 'limpieza', name: 'Limpieza', icon: Sparkles },
  { slug: 'jardineria', name: 'Jardinería', icon: Sprout }, { slug: 'climatizacion', name: 'Climatización', icon: AirVent },
  { slug: 'techos', name: 'Techos', icon: Warehouse }, { slug: 'cerramientos', name: 'Cerramientos', icon: DoorClosed },
]

const URGENCIES = [
  { value: 'baja', label: 'Tranquilo', dot: 'bg-slate-400' },
  { value: 'normal', label: 'Normal', dot: 'bg-[#1D63B8]' },
  { value: 'alta', label: 'Urgente', dot: 'bg-amber-500' },
  { value: 'urgente', label: 'Muy urgente', dot: 'bg-red-500' },
]

export default function PublishJob() {
  const location = useLocation()
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [category, setCategory] = useState('')
  const [urgency, setUrgency] = useState('normal')
  const [budgetMin, setBudgetMin] = useState('')
  const [budgetMax, setBudgetMax] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  const [dragging, setDragging] = useState(false)

  async function uploadPhotos(files: FileList) {
    setBusy(true)
    try {
      for (const file of Array.from(files).slice(0, 4)) {
        const fd = new FormData()
        fd.append('file', file)
        fd.append('folder', 'trabajos')
        const res = await fetch('/api/uploads', { method: 'POST', body: fd })
        if (res.ok) {
          const data = await res.json()
          setPhotos((p) => [...p, data.url])
        } else {
          toast.error(`No se pudo subir ${file.name}`)
        }
      }
    } finally { setBusy(false) }
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title || !description || !category) {
      toast.error('Título, descripción y categoría son obligatorios')
      return
    }
    setBusy(true)
    try {
      const res = await fetch('/api/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title, description, categorySlug: category, urgency,
          budgetMin: budgetMin ? parseFloat(budgetMin) : undefined,
          budgetMax: budgetMax ? parseFloat(budgetMax) : undefined,
          address, city,
          lat: location.lat || undefined, lng: location.lng || undefined,
          photos,
        }),
      })
      const data = await res.json()
      if (!res.ok) { toast.error(data.error); return }
      toast.success('¡Trabajo publicado! Los profesionales de tu zona ya lo están viendo.')
      navigate('/panel/cliente/trabajos')
    } finally { setBusy(false) }
  }

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Nuevo trabajo</span>
          <h1 className="homy-page-title mt-1.5">Publicar trabajo</h1>
          <p className="homy-page-sub">Contá qué necesitás: los profesionales te mandan presupuestos</p>
        </div>
      </header>

      <form onSubmit={submit} className="homy-glass max-w-3xl space-y-7 rounded-3xl p-5 sm:p-7">
        {/* El trabajo */}
        <section className="space-y-5">
          <div className="homy-section-head !mb-0">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><PenLine /></span>
              El trabajo
            </h2>
          </div>
          <div>
            <label htmlFor="job-title" className="flex items-center gap-1 text-sm font-semibold text-[#0A2540]">Título <span className="text-[#FF5A1F]" aria-hidden>*</span></label>
            <input id="job-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Cambiar grifería de cocina y destapar desagüe"
              className="homy-glass-input mt-2 w-full rounded-xl px-4 py-3 outline-none" />
          </div>
          <div>
            <label htmlFor="job-description" className="flex items-center gap-1 text-sm font-semibold text-[#0A2540]">Descripción <span className="text-[#FF5A1F]" aria-hidden>*</span></label>
            <textarea id="job-description" value={description} onChange={(e) => setDescription(e.target.value)} rows={5} required
              placeholder="Contá el problema o lo que querés hacer, hace cuánto pasa, si tenés los materiales, detalles de acceso…"
              className="homy-glass-input mt-2 w-full resize-none rounded-xl px-4 py-3 outline-none" />
          </div>
          <div>
            <p className="flex items-center gap-1 text-sm font-semibold text-[#0A2540]">Categoría <span className="text-[#FF5A1F]" aria-hidden>*</span></p>
            <div role="group" aria-label="Elegir categoría" className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
              {CATEGORIES.map((c) => (
                <button key={c.slug} type="button" onClick={() => setCategory(c.slug)} aria-pressed={category === c.slug}
                  className="homy-tab homy-focus w-full justify-start gap-2">
                  <c.icon className="size-4 shrink-0" aria-hidden />
                  <span className="line-clamp-1">{c.name}</span>
                </button>
              ))}
            </div>
          </div>
        </section>

        {/* Urgencia y presupuesto */}
        <section className="space-y-5 border-t border-[#0A2540]/5 pt-6">
          <div className="homy-section-head !mb-0">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-orange size-8 shrink-0 [&_svg]:size-4" aria-hidden><AlarmClock /></span>
              Urgencia y presupuesto
            </h2>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0A2540]">¿Qué tan urgente es?</p>
            <div role="group" aria-label="Elegir urgencia" className="mt-2.5 flex flex-wrap gap-2">
              {URGENCIES.map((u) => (
                <button key={u.value} type="button" onClick={() => setUrgency(u.value)} aria-pressed={urgency === u.value}
                  className="homy-tab homy-focus">
                  <span className={`homy-pill-dot ${u.dot}`} aria-hidden />
                  {u.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <p className="text-sm font-semibold text-[#0A2540]">Presupuesto orientativo <span className="font-normal text-slate-400">(opcional)</span></p>
            <div className="mt-2.5 grid grid-cols-2 gap-3 sm:max-w-md">
              <div>
                <label htmlFor="budget-min" className="sr-only">Presupuesto mínimo</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400" aria-hidden>$</span>
                  <input id="budget-min" type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="mínimo" inputMode="numeric"
                    className="homy-glass-input w-full rounded-xl py-3 pl-8 pr-4 outline-none tabular-nums" />
                </div>
              </div>
              <div>
                <label htmlFor="budget-max" className="sr-only">Presupuesto máximo</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400" aria-hidden>$</span>
                  <input id="budget-max" type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} placeholder="máximo" inputMode="numeric"
                    className="homy-glass-input w-full rounded-xl py-3 pl-8 pr-4 outline-none tabular-nums" />
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Dónde */}
        <section className="space-y-5 border-t border-[#0A2540]/5 pt-6">
          <div className="homy-section-head !mb-0">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-ai size-8 shrink-0 [&_svg]:size-4" aria-hidden><MapPin /></span>
              Dónde
            </h2>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="job-address" className="text-sm font-semibold text-[#0A2540]">Dirección <span className="font-normal text-slate-400">(opcional)</span></label>
              <input id="job-address" value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle y número"
                className="homy-glass-input mt-2 w-full rounded-xl px-4 py-3 outline-none" />
            </div>
            <div>
              <label htmlFor="job-city" className="text-sm font-semibold text-[#0A2540]">Ciudad</label>
              <input id="job-city" value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ej.: CABA"
                className="homy-glass-input mt-2 w-full rounded-xl px-4 py-3 outline-none" />
            </div>
          </div>
        </section>

        {/* Fotos */}
        <section className="space-y-3 border-t border-[#0A2540]/5 pt-6">
          <div className="homy-section-head !mb-0">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-gold size-8 shrink-0 [&_svg]:size-4" aria-hidden><Camera /></span>
              Fotos del problema <span className="text-sm font-semibold text-slate-400">(hasta 4)</span>
            </h2>
          </div>
          <label
            onDragOver={(e) => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files?.length) uploadPhotos(e.dataTransfer.files) }}
            className={`homy-glass-soft flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-8 transition ${dragging ? 'border-[#00A8E0]' : 'border-[#0A2540]/15 hover:border-[#00A8E0]'}`}>
            <span className="homy-icon-chip homy-chip-ai size-11 [&_svg]:size-5" aria-hidden><CloudUpload /></span>
            <span className="mt-2.5 text-sm font-semibold text-slate-500">{busy ? 'Subiendo…' : 'Arrastrá fotos acá o hacé clic para elegirlas'}</span>
            <span className="mt-1 text-xs text-slate-400">JPG, PNG o WebP · hasta 4 fotos</span>
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files && uploadPhotos(e.target.files)} />
          </label>
          {photos.length > 0 && (
            <div className="flex flex-wrap gap-2.5">
              {photos.map((p) => (
                <div key={p} className="relative">
                  <img src={p} alt="Foto adjunta" className="size-20 rounded-2xl object-cover shadow-sm ring-1 ring-[#0A2540]/10" />
                  <button type="button" onClick={() => setPhotos((ps) => ps.filter((x) => x !== p))}
                    className="homy-focus absolute -right-1.5 -top-1.5 grid size-6 place-items-center rounded-full bg-red-500 text-white shadow-md transition hover:bg-red-600" aria-label="Quitar foto">
                    <X className="size-3.5" aria-hidden />
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <div className="flex flex-col gap-3 border-t border-[#0A2540]/5 pt-6 sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-xs text-xs leading-relaxed text-slate-400">Los profesionales de tu zona van a ver tu publicación y mandarte presupuestos.</p>
          <button type="submit" disabled={busy} className="homy-btn-primary homy-focus w-full py-3.5 text-[0.95rem] sm:w-auto sm:px-7">
            <Megaphone className="size-4" aria-hidden /> {busy ? 'Publicando…' : 'Publicar trabajo'}
          </button>
        </div>
      </form>
    </div>
  )
}
