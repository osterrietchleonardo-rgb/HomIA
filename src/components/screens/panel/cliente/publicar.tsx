'use client'
// Publicar trabajo HomIA (cliente)
import { useState } from 'react'
import { navigate } from '@/lib/router'
import { toast } from 'sonner'
import { useLocation } from '@/lib/store'
import { apiFetch } from '@/lib/api-client'
import { useCategories, categoryIcon } from '@/lib/categories'
import { CloudUpload, X, Megaphone, MapPin, PenLine, AlarmClock, Camera } from 'lucide-react'
import { subirImagen } from '@/lib/upload-image'

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
  const [uploading, setUploading] = useState(false)
  const [publishing, setPublishing] = useState(false)
  const [dragging, setDragging] = useState(false)
  const { categories } = useCategories()

  async function uploadPhotos(files: FileList) {
    const room = 4 - photos.length
    if (room <= 0) { toast.error('Ya tenés 4 fotos: quitá alguna para subir otra'); return }
    const list = Array.from(files).slice(0, room)
    if (files.length > room) toast.error(`Solo se suben ${room} foto${room === 1 ? '' : 's'} más (máximo 4)`)
    setUploading(true)
    try {
      for (const file of list) {
        const r = await subirImagen(file, 'trabajos')
        if (r.ok) setPhotos((p) => [...p, r.url])
        else toast.error(`${file.name}: ${r.error}`)
      }
    } finally { setUploading(false) }
  }

  // presupuesto orientativo: opcional, pero si se carga tiene que ser coherente
  const minN = budgetMin.trim() === '' ? null : Number(budgetMin)
  const maxN = budgetMax.trim() === '' ? null : Number(budgetMax)
  const budgetError =
    (minN !== null && (Number.isNaN(minN) || minN < 0)) || (maxN !== null && (Number.isNaN(maxN) || maxN < 0))
      ? 'El presupuesto no puede ser negativo'
      : minN !== null && maxN !== null && minN > maxN
        ? 'El mínimo no puede ser mayor que el máximo'
        : null

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!title.trim() || !description.trim() || !category) {
      toast.error('Título, descripción y categoría son obligatorios')
      return
    }
    if (budgetError) { toast.error(budgetError); return }
    if (uploading) { toast.error('Esperá a que terminen de subir las fotos'); return }
    setPublishing(true)
    try {
      const r = await apiFetch('/api/jobs', {
        method: 'POST',
        json: {
          title: title.trim(), description: description.trim(), categorySlug: category, urgency,
          budgetMin: minN ?? undefined,
          budgetMax: maxN ?? undefined,
          address, city,
          lat: location.lat || undefined, lng: location.lng || undefined,
          photos,
        },
      })
      if (!r.ok) return
      toast.success('¡Trabajo publicado! Los profesionales de tu zona ya lo están viendo.')
      navigate('/panel/cliente/trabajos')
    } finally { setPublishing(false) }
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

      <form onSubmit={submit} className="homy-glass max-w-3xl mx-auto space-y-7 rounded-3xl p-5 sm:p-7">
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
              {categories.map((c) => {
                const Icon = categoryIcon(c.icon)
                return (
                  <button key={c.slug} type="button" onClick={() => setCategory(c.slug)} aria-pressed={category === c.slug}
                    className="homy-tab homy-focus w-full justify-start gap-2 text-left">
                    <Icon className="size-4 shrink-0" aria-hidden />
                    <span className="line-clamp-2 leading-tight">{c.name}</span>
                  </button>
                )
              })}
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
                  <input id="budget-min" type="number" min={0} value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="mínimo" inputMode="numeric"
                    aria-invalid={!!budgetError} aria-describedby={budgetError ? 'budget-error' : undefined}
                    className="homy-glass-input w-full rounded-xl py-3 pl-8 pr-4 outline-none tabular-nums" />
                </div>
              </div>
              <div>
                <label htmlFor="budget-max" className="sr-only">Presupuesto máximo</label>
                <div className="relative">
                  <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-sm font-bold text-slate-400" aria-hidden>$</span>
                  <input id="budget-max" type="number" min={0} value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} placeholder="máximo" inputMode="numeric"
                    aria-invalid={!!budgetError} aria-describedby={budgetError ? 'budget-error' : undefined}
                    className="homy-glass-input w-full rounded-xl py-3 pl-8 pr-4 outline-none tabular-nums" />
                </div>
              </div>
            </div>
            {budgetError && <p id="budget-error" role="alert" className="mt-2 text-xs font-semibold text-red-600">{budgetError}</p>}
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
            <span className="mt-2.5 text-sm font-semibold text-slate-500" aria-live="polite">{uploading ? 'Subiendo fotos…' : 'Arrastrá fotos acá o tocá para elegirlas'}</span>
            <span className="mt-1 text-xs text-slate-400">JPG, PNG o WebP · hasta 4 fotos</span>
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" disabled={uploading}
              onChange={(e) => { if (e.target.files) uploadPhotos(e.target.files); e.target.value = '' }} />
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
          <button type="submit" disabled={publishing || uploading} className="homy-btn-primary homy-focus w-full py-3.5 text-[0.95rem] disabled:opacity-60 sm:w-auto sm:px-7">
            <Megaphone className="size-4" aria-hidden /> {publishing ? 'Publicando…' : uploading ? 'Subiendo fotos…' : 'Publicar trabajo'}
          </button>
        </div>
      </form>
    </div>
  )
}
