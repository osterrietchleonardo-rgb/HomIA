'use client'
// Reproductor modal de la videoteca HomIA — overlay glass con el video del
// tutorial. Se usa desde el dock de ayuda y desde el centro de ayuda.
// Al cerrar se desmonta el <video> (no sigue sonando de fondo).
import { useEffect, useState } from 'react'
import { X, Clapperboard } from 'lucide-react'
import { videoSrc, videoPoster, type VideoItem } from '@/lib/videos-content'

const OPEN_EVENT = 'homy:open-video'
const CLOSE_EVENT = 'homy:close-video'

/** Pedir la apertura del reproductor desde cualquier componente. */
export function openVideo(video: VideoItem) {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: video }))
}

export function closeVideo() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(CLOSE_EVENT))
}

export default function VideoModal() {
  const [video, setVideo] = useState<VideoItem | null>(null)

  useEffect(() => {
    const open = (e: Event) => setVideo((e as CustomEvent).detail as VideoItem)
    const close = () => setVideo(null)
    window.addEventListener(OPEN_EVENT, open)
    window.addEventListener(CLOSE_EVENT, close)
    return () => {
      window.removeEventListener(OPEN_EVENT, open)
      window.removeEventListener(CLOSE_EVENT, close)
    }
  }, [])

  // bloquear scroll de fondo + Esc para salir
  useEffect(() => {
    if (!video) return
    document.documentElement.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setVideo(null) }
    window.addEventListener('keydown', onKey)
    return () => {
      document.documentElement.style.overflow = ''
      window.removeEventListener('keydown', onKey)
    }
  }, [video])

  if (!video) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Video tutorial: ${video.title}`}
      onClick={() => setVideo(null)}
      className="fixed inset-0 z-[70] grid place-items-center bg-[#071224]/85 p-3 backdrop-blur-sm sm:p-6"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="homy-glass-strong w-full max-w-[880px] overflow-hidden rounded-3xl shadow-[0_40px_90px_-30px_rgba(10,37,64,0.8)]"
      >
        <div className="flex items-center gap-2.5 px-4 py-3">
          <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><Clapperboard /></span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-extrabold tracking-tight text-[#0A2540]">{video.title}</p>
            <p className="hidden truncate text-xs text-slate-500 sm:block">{video.desc}</p>
          </div>
          <button
            onClick={() => setVideo(null)}
            aria-label="Cerrar video"
            className="homy-focus grid size-8 shrink-0 place-items-center rounded-full homy-glass-soft text-slate-400 transition hover:text-[#0A2540]"
          >
            <X className="size-4" aria-hidden />
          </button>
        </div>
        {/* key={video.id}: cada video arranca desde cero, sin estado previo */}
        <video
          key={video.id}
          controls
          autoPlay
          playsInline
          preload="auto"
          poster={videoPoster(video.id)}
          className="aspect-video w-full bg-[#071224]"
        >
          <source src={videoSrc(video.id)} type="video/mp4" />
          Tu navegador no puede reproducir videos MP4.
        </video>
      </div>
    </div>
  )
}
