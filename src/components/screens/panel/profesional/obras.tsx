'use client'
// Mis obras realizadas: galería con fotos + publicación de nuevas obras con hasta 4 fotos
import { useEffect, useRef, useState } from 'react'
import { PageHeader, Loading, EmptyState } from '@/components/app/ui-bits'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { Plus, ImageIcon, X } from 'lucide-react'

const CATEGORIES = [
  { slug: 'plomeria', name: 'Plomería' },
  { slug: 'gasistas', name: 'Gasistas' },
  { slug: 'electricistas', name: 'Electricistas' },
  { slug: 'albanileria', name: 'Albañilería' },
  { slug: 'pintura', name: 'Pintura' },
  { slug: 'carpinteria', name: 'Carpintería' },
  { slug: 'herreria', name: 'Herrería' },
  { slug: 'limpieza', name: 'Limpieza' },
  { slug: 'jardineria', name: 'Jardinería' },
  { slug: 'climatizacion', name: 'Climatización' },
  { slug: 'techos', name: 'Techos' },
  { slug: 'cerramientos', name: 'Cerramientos' },
]

type Work = {
  id: string; title: string; description: string; photos: string
  categorySlug: string | null; projectId: string | null; createdAt: string
}

function parsePhotos(json: string): string[] {
  try {
    const arr = JSON.parse(json)
    return Array.isArray(arr) ? arr.filter((u) => typeof u === 'string') : []
  } catch {
    return []
  }
}

export default function ProWorks() {
  const [works, setWorks] = useState<Work[]>([])
  const [loading, setLoading] = useState(true)

  // publicar obra
  const [open, setOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [categorySlug, setCategorySlug] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  async function load() {
    setLoading(true)
    try {
      const res = await fetch('/api/works')
      if (res.ok) setWorks((await res.json()).works || [])
    } finally { setLoading(false) }
  }
  useEffect(() => { load() }, [])

  function pickPhotos(list: FileList | null) {
    if (!list) return
    const picked = Array.from(list).slice(0, 4)
    setFiles(picked)
    setPreviews(picked.map((f) => URL.createObjectURL(f)))
    if (list.length > 4) toast.error('Máximo 4 fotos por obra')
  }

  function clearForm() {
    setTitle(''); setDescription(''); setCategorySlug(''); setFiles([]); setPreviews([])
  }

  async function uploadPhoto(file: File): Promise<string | null> {
    const form = new FormData()
    form.append('file', file)
    form.append('folder', 'obras')
    const res = await fetch('/api/uploads', { method: 'POST', body: form })
    if (!res.ok) {
      toast.error(`No se pudo subir una foto: ${(await res.json()).error}`)
      return null
    }
    return (await res.json()).url
  }

  async function publish() {
    if (!title.trim() || !description.trim()) { toast.error('Completá título y descripción'); return }
    setBusy(true)
    try {
      const urls: string[] = []
      for (const f of files) {
        const url = await uploadPhoto(f)
        if (url) urls.push(url)
      }
      const res = await fetch('/api/works', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: title.trim(), description: description.trim(), photos: urls, categorySlug: categorySlug || undefined }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error); return }
      toast.success('¡Obra publicada! Ya aparece en tu perfil.')
      setOpen(false)
      clearForm()
      load()
    } finally { setBusy(false) }
  }

  if (loading) return <Loading />

  return (
    <div className="max-w-5xl">
      <PageHeader
        title="Mis obras"
        subtitle="Tu vitrina: mostrá trabajos realizados con fotos reales"
        right={
          <button onClick={() => setOpen(true)} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white font-bold px-5 py-2.5 flex items-center gap-2 transition shadow-lg shadow-[#FF5A1F]/20">
            <Plus className="size-4" /> Publicar obra
          </button>
        }
      />

      {works.length === 0 ? (
        <div className="rounded-2xl bg-white border border-slate-200 p-6">
          <EmptyState icon="🏗️" title="Todavía no publicaste obras"
            hint="Publicar tus trabajos realizados con fotos te da credibilidad y más presupuestos aceptados."
            action={
              <button onClick={() => setOpen(true)} className="rounded-xl bg-[#FF5A1F] text-white font-bold px-5 py-2.5">Publicar la primera</button>
            } />
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {works.map((w) => {
            const photos = parsePhotos(w.photos)
            return (
              <article key={w.id} className="rounded-2xl bg-white border border-slate-200 shadow-sm overflow-hidden flex flex-col">
                {photos.length > 0 ? (
                  <div className={`grid gap-0.5 ${photos.length === 1 ? 'grid-cols-1' : 'grid-cols-2'}`}>
                    {photos.slice(0, 4).map((url, i) => (
                      <img key={i} src={url} alt={`Foto ${i + 1} de ${w.title}`}
                        className={`object-cover w-full ${photos.length === 1 ? 'h-44' : 'h-28'} bg-slate-100`} />
                    ))}
                  </div>
                ) : (
                  <div className="h-28 bg-slate-50 flex items-center justify-center text-slate-300">
                    <ImageIcon className="size-8" />
                  </div>
                )}
                <div className="p-4 flex-1">
                  <div className="flex items-center justify-between gap-2 mb-1">
                    {w.categorySlug && <span className="text-[10px] font-extrabold uppercase tracking-wide text-[#1D63B8]">{w.categorySlug}</span>}
                    <span className="text-[11px] text-slate-400 shrink-0">{formatDate(w.createdAt)}</span>
                  </div>
                  <h3 className="font-extrabold text-[#0A2540] leading-snug">{w.title}</h3>
                  <p className="text-sm text-slate-500 mt-1 line-clamp-3">{w.description}</p>
                </div>
              </article>
            )
          })}
        </div>
      )}

      {/* Dialog publicar obra */}
      <Dialog open={open} onOpenChange={(o) => { if (!o) { setOpen(false); clearForm() } }}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Publicar obra realizada</DialogTitle>
            <DialogDescription>Con fotos reales tu perfil convence más. Hasta 4 fotos (JPG/PNG/WEBP, máx 8MB c/u).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase">Título</span>
              <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ej: Instalación eléctrica completa — casa 3 ambientes"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8]" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase">Descripción</span>
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                placeholder="Contá qué hiciste, materiales usados, plazo…"
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8] resize-none" />
            </label>
            <label className="block">
              <span className="text-xs font-semibold text-slate-500 uppercase">Categoría</span>
              <select value={categorySlug} onChange={(e) => setCategorySlug(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm outline-none focus:border-[#1D63B8] cursor-pointer">
                <option value="">Elegí una categoría…</option>
                {CATEGORIES.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
              </select>
            </label>
            <div>
              <span className="text-xs font-semibold text-slate-500 uppercase">Fotos ({files.length}/4)</span>
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" multiple
                onChange={(e) => pickPhotos(e.target.files)}
                className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-[#1D63B8] file:text-white file:px-3 file:py-1.5 file:text-xs file:font-bold text-slate-500" />
              {previews.length > 0 && (
                <div className="flex gap-2 mt-2 flex-wrap">
                  {previews.map((url, i) => (
                    <div key={url} className="relative">
                      <img src={url} alt={`Preview ${i + 1}`} className="size-16 rounded-xl object-cover border border-slate-200" />
                      <button
                        onClick={() => {
                          const nf = files.filter((_, j) => j !== i)
                          setFiles(nf)
                          setPreviews((p) => p.filter((_, j) => j !== i))
                        }}
                        className="absolute -top-1.5 -right-1.5 rounded-full bg-[#0A2540] text-white p-0.5 hover:bg-red-500 transition"
                        aria-label={`Quitar foto ${i + 1}`}>
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="flex justify-end gap-2 pt-1">
              <button onClick={() => { setOpen(false); clearForm() }} className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-500 hover:border-red-300 transition">Cancelar</button>
              <button disabled={busy} onClick={publish} className="rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] text-white text-sm font-bold px-5 py-2.5 transition disabled:opacity-50 flex items-center gap-2">
                {busy && <span className="size-4 rounded-full border-2 border-white/40 border-t-white animate-spin" />}
                Publicar obra
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
