'use client'
// Publicar trabajo HomIA (cliente)
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader } from '@/components/app/ui-bits'
import { toast } from 'sonner'
import { useLocation } from '@/lib/store'
import { Upload, X } from 'lucide-react'

const CATEGORIES = [
  { slug: 'plomeria', name: 'Plomería' }, { slug: 'gasistas', name: 'Gas' },
  { slug: 'electricistas', name: 'Electricidad' }, { slug: 'albanileria', name: 'Albañilería' },
  { slug: 'pintura', name: 'Pintura' }, { slug: 'carpinteria', name: 'Carpintería' },
  { slug: 'herreria', name: 'Herrería' }, { slug: 'limpieza', name: 'Limpieza' },
  { slug: 'jardineria', name: 'Jardinería' }, { slug: 'climatizacion', name: 'Climatización' },
  { slug: 'techos', name: 'Techos' }, { slug: 'cerramientos', name: 'Cerramientos' },
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
    <div className="max-w-2xl">
      <PageHeader title="Publicar trabajo" subtitle="Contá qué necesitás: los profesionales te mandan presupuestos" />
      <form onSubmit={submit} className="rounded-3xl homy-glass border border-slate-200 shadow-sm p-6 space-y-5">
        <div>
          <label className="text-sm font-semibold text-[#0A2540]">Título *</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej.: Cambiar grifería de cocina y destapar desagüe"
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1D63B8]" />
        </div>
        <div>
          <label className="text-sm font-semibold text-[#0A2540]">Descripción *</label>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} required
            placeholder="Contá el problema o lo que querés hacer, hace cuánto pasa, si tenés los materiales, detalles de acceso…"
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1D63B8] resize-none" />
        </div>
        <div>
          <label className="text-sm font-semibold text-[#0A2540]">Categoría *</label>
          <div className="flex flex-wrap gap-2 mt-2">
            {CATEGORIES.map((c) => (
              <button key={c.slug} type="button" onClick={() => setCategory(c.slug)}
                className={`rounded-full border px-3.5 py-1.5 text-sm font-semibold transition ${category === c.slug ? 'border-[#1D63B8] bg-[#1D63B8] text-white' : 'border-slate-300 text-slate-600 hover:border-[#1D63B8]/60'}`}>
                {c.name}
              </button>
            ))}
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-[#0A2540]">Urgencia</label>
            <select value={urgency} onChange={(e) => setUrgency(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 homy-glass-input outline-none focus:border-[#1D63B8]">
              <option value="baja">Tranquilo</option>
              <option value="normal">Normal</option>
              <option value="alta">Urgente</option>
              <option value="urgente">Muy urgente</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="text-sm font-semibold text-[#0A2540]">Presupuesto mín.</label>
              <input type="number" value={budgetMin} onChange={(e) => setBudgetMin(e.target.value)} placeholder="$ (opcional)" className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1D63B8]" />
            </div>
            <div>
              <label className="text-sm font-semibold text-[#0A2540]">máx.</label>
              <input type="number" value={budgetMax} onChange={(e) => setBudgetMax(e.target.value)} placeholder="$ (opcional)" className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1D63B8]" />
            </div>
          </div>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="text-sm font-semibold text-[#0A2540]">Dirección (opcional)</label>
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="Calle y número" className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1D63B8]" />
          </div>
          <div>
            <label className="text-sm font-semibold text-[#0A2540]">Ciudad</label>
            <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Ej.: CABA" className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1D63B8]" />
          </div>
        </div>
        <div>
          <label className="text-sm font-semibold text-[#0A2540]">Fotos del problema (hasta 4)</label>
          <label className="mt-1 flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 hover:border-[#1D63B8] py-6 cursor-pointer transition bg-slate-50/50">
            <Upload className="size-6 text-slate-400" />
            <span className="text-sm text-slate-500 mt-1">{busy ? 'Subiendo…' : 'Hacé clic para subir fotos'}</span>
            <input type="file" multiple accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => e.target.files && uploadPhotos(e.target.files)} />
          </label>
          {photos.length > 0 && (
            <div className="flex gap-2 mt-2 flex-wrap">
              {photos.map((p) => (
                <div key={p} className="relative">
                  { }
                  <img src={p} alt="Foto adjunta" className="rounded-xl h-20 w-20 object-cover" />
                  <button type="button" onClick={() => setPhotos((ps) => ps.filter((x) => x !== p))} className="absolute -top-1.5 -right-1.5 rounded-full bg-red-500 text-white p-0.5" aria-label="Quitar foto">
                    <X className="size-3" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
        <button type="submit" disabled={busy} className="w-full rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] disabled:opacity-60 text-white font-bold py-3.5 transition shadow-lg shadow-[#FF5A1F]/25">
          {busy ? 'Publicando…' : 'Publicar trabajo'}
        </button>
      </form>
    </div>
  )
}
