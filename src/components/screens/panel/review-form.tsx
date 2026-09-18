'use client'
// Formulario de reseña 360° compartido — glass oscuro con estrellas, comentario
// y fotos que avalan. Se usa en los detalles de proyecto para reseñar al
// profesional, al proveedor o al cliente (según el rol que reseña).
import { useState } from 'react'
import { toast } from 'sonner'
import { Star, ImagePlus, X, BadgeCheck } from 'lucide-react'

type Props = {
  targetUserId: string
  targetName: string
  /** etiqueta de quién es el reseñado, ej: "al profesional", "al proveedor", "al cliente" */
  targetLabel?: string
  projectId?: string
  workId?: string
  onDone?: () => void
}

export default function ReviewForm({ targetUserId, targetName, targetLabel = '', projectId, workId, onDone }: Props) {
  const [rating, setRating] = useState(5)
  const [comment, setComment] = useState('')
  const [photos, setPhotos] = useState<string[]>([])
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(false)

  async function uploadPhoto(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/uploads', { method: 'POST', body: fd })
      if (!res.ok) { toast.error('No se pudo subir la foto'); return }
      const url = (await res.json()).url as string
      if (url) setPhotos((prev) => [...prev, url].slice(0, 4))
    } finally { setUploading(false) }
  }

  async function submit() {
    if (!comment.trim()) { toast.error('Escribí un comentario'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/reviews', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          targetUserId, rating, comment: comment.trim(),
          photos, context: workId ? 'obra' : 'proyecto', projectId, workId,
        }),
      })
      const d = await res.json()
      if (!res.ok) { toast.error(d.error || 'No se pudo publicar la reseña'); return }
      toast.success('¡Reseña publicada! Gracias por ayudar a la comunidad.')
      onDone?.()
    } finally { setBusy(false) }
  }

  return (
    <section className="homy-glass-dark relative overflow-hidden rounded-3xl p-6 text-white sm:p-7" aria-label="Dejar reseña">
      <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-[#00C4FF]/20 blur-3xl" />
      <h2 className="relative flex items-center gap-2.5 text-lg font-extrabold">
        <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-4" aria-hidden><Star /></span>
        ¿Cómo fue trabajar {targetLabel ? `${targetLabel} ` : ''}{targetName}?
      </h2>
      <p className="relative mt-2 text-sm text-slate-300">
        Tu reseña ayuda a otros usuarios a decidir con confianza: contá cómo fue la experiencia y sumá fotos del resultado — las reseñas con fotos son más fiables para la comunidad.
      </p>

      <div className="relative mt-4 flex gap-1.5" role="radiogroup" aria-label="Puntaje de 1 a 5 estrellas">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={n === rating} aria-label={`${n} estrellas`}
            onClick={() => setRating(n)}
            className={`transition-transform duration-200 hover:scale-110 ${n <= rating ? 'text-[#FFC700] fill-[#FFC700]' : 'text-white/25'}`}>
            <Star className="size-7" />
          </button>
        ))}
      </div>

      <textarea value={comment} onChange={(e) => setComment(e.target.value)} rows={3}
        placeholder="Contá cómo fue: calidad, puntualidad, comunicación…"
        className="relative mt-4 w-full resize-none rounded-xl bg-white/10 border border-white/15 px-4 py-3 text-white placeholder:text-slate-400 outline-none focus:border-[#00C4FF]" />

      {/* fotos que avalan la reseña */}
      <div className="relative mt-3.5 flex flex-wrap items-center gap-2.5">
        {photos.map((ph, i) => (
          <span key={i} className="group relative">
            <img src={ph} alt={`Foto ${i + 1} de la reseña`} className="h-16 w-16 rounded-xl object-cover ring-1 ring-white/25" />
            <button type="button" onClick={() => setPhotos((prev) => prev.filter((_, j) => j !== i))}
              aria-label={`Quitar foto ${i + 1}`}
              className="absolute -top-1.5 -right-1.5 grid size-5 place-items-center rounded-full bg-red-500 text-white shadow">
              <X className="size-3" aria-hidden />
            </button>
          </span>
        ))}
        {photos.length < 4 && (
          <label className="flex h-16 w-16 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-xl border border-dashed border-white/25 text-slate-400 transition hover:border-[#00C4FF] hover:text-[#66DFFF]">
            <ImagePlus className="size-4" aria-hidden />
            <span className="text-[9.5px] font-bold">{uploading ? 'Subiendo…' : 'Foto'}</span>
            <input type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadPhoto(f); e.currentTarget.value = '' }} />
          </label>
        )}
        <span className="text-[11px] font-semibold text-slate-400">Hasta 4 fotos que avalen tu experiencia</span>
      </div>

      <div className="relative mt-4 flex flex-wrap items-center gap-3">
        <button type="button" onClick={submit} disabled={busy} className="homy-btn-primary px-6 py-3 text-sm sm:py-2.5">
          Publicar reseña
        </button>
        <span className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-400">
          <BadgeCheck className="size-3.5 text-[#0e9f6e]" aria-hidden />
          Las reseñas se publican con tu nombre y no se pueden editar
        </span>
      </div>
    </section>
  )
}
