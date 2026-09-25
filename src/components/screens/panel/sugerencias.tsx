'use client'
// Sugerencias (D25) — pantalla común a los tres roles: /panel/<rol>/sugerencias.
// Arriba "Nueva sugerencia" (formulario con tipo, sección, título, descripción, hasta 4 fotos
// de evidencia y, para "Problema técnico", el contexto que se adjunta solo); abajo "Mis envíos"
// con estado y respuesta del equipo. Las fotos van a un almacenamiento PRIVADO.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useRoute } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState } from '@/components/app/ui-bits'
import { formatDate } from '@/lib/format'
import { subirImagen } from '@/lib/upload-image'
import { toast } from 'sonner'
import {
  TIPOS, areasDelRol, MAX_FOTOS, TOPE_DIARIO, FEEDBACK_UPLOAD_FOLDER, type TipoFeedback,
} from '@/lib/feedback'
import {
  Lightbulb, Frown, Wrench, Rocket, Bug, MessageSquareMore, Camera, ImagePlus, X, Loader2,
  Send, MessageSquarePlus, Inbox, ShieldCheck, Info, ChevronDown, ChevronUp, Reply, Lock,
} from 'lucide-react'

export type FeedbackItem = {
  id: string; role: string; type: string; typeLabel: string; area: string; areaLabel: string
  title: string; description: string; photos: { url: string | null }[]
  context: Record<string, string> | null; contactOk: boolean
  status: string; statusLabel: string; adminResponse: string | null; respondedAt: string | null
  createdAt: string; updatedAt: string
}

export const TIPO_ICONO: Record<string, React.ComponentType<{ className?: string }>> = {
  sugerencia: Lightbulb, queja: Frown, mejora: Wrench, oportunidad: Rocket, problema: Bug, otro: MessageSquareMore,
}
export const TIPO_TONO: Record<string, string> = {
  sugerencia: 'homy-chip-gold', queja: 'homy-chip-orange', mejora: 'homy-chip-blue',
  oportunidad: 'homy-chip-ai', problema: 'homy-chip-orange', otro: 'homy-chip-navy',
}
const ESTADO_TONO: Record<string, string> = {
  recibida: 'bg-slate-100 text-slate-700 ring-slate-300/60',
  en_revision: 'bg-amber-50 text-amber-800 ring-amber-300/60',
  planificada: 'bg-[#1D63B8]/10 text-[#1D63B8] ring-[#1D63B8]/25',
  resuelta: 'bg-emerald-50 text-emerald-700 ring-emerald-300/60',
  descartada: 'bg-red-50 text-red-700 ring-red-200',
}
const ESTADO_DOT: Record<string, string> = {
  recibida: 'bg-slate-400', en_revision: 'bg-amber-500', planificada: 'bg-[#1D63B8]', resuelta: 'bg-emerald-500', descartada: 'bg-red-500',
}

export function EstadoPill({ status, label }: { status: string; label: string }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-[11.5px] font-extrabold ring-1 ${ESTADO_TONO[status] || ESTADO_TONO.recibida}`}>
      <span className={`size-1.5 rounded-full ${ESTADO_DOT[status] || 'bg-slate-400'}`} aria-hidden />
      {label}
    </span>
  )
}

/** Miniaturas de fotos privadas (URL firmada de 10 min). */
export function FotosPrivadas({ photos }: { photos: { url: string | null }[] }) {
  if (!photos.length) return null
  return (
    <ul className="mt-3 flex flex-wrap gap-2" aria-label="Fotos de evidencia">
      {photos.map((p, i) => (
        <li key={i}>
          {p.url ? (
            <a href={p.url} target="_blank" rel="noopener noreferrer" className="homy-focus block overflow-hidden rounded-xl ring-1 ring-[#0A2540]/10" aria-label={`Abrir foto ${i + 1}`}>
              <img src={p.url} alt={`Foto de evidencia ${i + 1}`} className="size-20 object-cover sm:size-24" loading="lazy" />
            </a>
          ) : (
            <span className="grid size-20 place-items-center rounded-xl bg-slate-100 px-1 text-center text-[10.5px] font-semibold text-slate-400 sm:size-24">Foto no disponible</span>
          )}
        </li>
      ))}
    </ul>
  )
}

const NET_ERROR = 'No pudimos conectarnos. Revisá tu conexión y probá de nuevo.'

type FotoLocal = { key: string; preview: string; path: string | null; subiendo: boolean; error?: string }
type Errores = Partial<Record<'type' | 'area' | 'title' | 'description' | 'photos' | 'general', string>>

/** Contexto técnico que se adjunta a un "Problema técnico" (lo ve el usuario antes de mandar). */
function contextoTecnico(): Record<string, string> {
  if (typeof window === 'undefined') return {}
  let pantalla = ''
  try { pantalla = sessionStorage.getItem('homy_prev_path') || '' } catch { /* sin storage */ }
  const ua = navigator.userAgent || ''
  const navegador = /Edg\//.test(ua) ? 'Edge' : /OPR\//.test(ua) ? 'Opera' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Otro'
  const so = /Android/.test(ua) ? 'Android' : /iPhone|iPad|iPod/.test(ua) ? 'iOS' : /Windows/.test(ua) ? 'Windows' : /Mac OS X/.test(ua) ? 'macOS' : /Linux/.test(ua) ? 'Linux' : 'otro sistema'
  // celular: por el navegador o por la pantalla táctil (hay navegadores de celu que no dicen "Mobi")
  const movil = /Mobi|Android|iPhone/.test(ua) || (typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches)
  return {
    pantalla: pantalla ? `#${pantalla}` : 'No sabemos desde qué pantalla viniste',
    navegador: `${navegador} en ${so}`,
    dispositivo: `${movil ? 'Celular' : 'Computadora'} · pantalla ${window.innerWidth}×${window.innerHeight}`,
    fecha: new Date().toLocaleString('es-AR', { dateStyle: 'short', timeStyle: 'short' }),
    zonaHoraria: Intl.DateTimeFormat().resolvedOptions().timeZone || '',
  }
}

export default function SugerenciasScreen({ role }: { role: 'cliente' | 'profesional' | 'proveedor' }) {
  const { user } = useSession()
  const { query } = useRoute()
  const [items, setItems] = useState<FeedbackItem[] | null>(null)
  const [isAdmin, setIsAdmin] = useState(false)
  const [quedanHoy, setQuedanHoy] = useState<number>(TOPE_DIARIO)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [abierto, setAbierto] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/feedback')
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setLoadError(d.error || 'No pudimos cargar tus envíos'); return }
      setLoadError(null)
      setItems(d.items)
      setIsAdmin(!!d.isAdmin)
      setQuedanHoy(typeof d.quedanHoy === 'number' ? d.quedanHoy : TOPE_DIARIO)
    } catch { setLoadError(NET_ERROR) }
  }, [])
  // carga asíncrona (el setState ocurre después del fetch), igual que en devoluciones.tsx
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  // desde una notificación (?id=…): mostrar ese envío
  const destacado = query.id
  useEffect(() => {
    if (!destacado || !items) return
    const el = document.getElementById(`sug-${destacado}`)
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [destacado, items])

  return (
    <div className="homy-page max-w-3xl">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Tu opinión construye HomIA</span>
          <h1 className="homy-page-title mt-1.5">Sugerencias</h1>
          <p className="homy-page-sub">Ideas, quejas o algo que no anda: te respondemos acá.</p>
        </div>
        {isAdmin && (
          <Link to="/admin/sugerencias" className="homy-btn-dark homy-focus px-4 py-2.5 text-sm">
            <Inbox className="size-4" aria-hidden /> Bandeja de administración
          </Link>
        )}
      </header>

      <div className="space-y-6">
        {!abierto ? (
          <button
            type="button"
            onClick={() => setAbierto(true)}
            disabled={quedanHoy <= 0}
            className="homy-glass homy-lift homy-focus group flex w-full items-center gap-3.5 rounded-3xl p-4 text-left disabled:opacity-60 sm:p-5"
          >
            <span className="homy-icon-chip homy-chip-orange size-12 shrink-0 [&_svg]:size-6" aria-hidden><MessageSquarePlus /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-base font-extrabold text-[#0A2540]">Nueva sugerencia</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">
                {quedanHoy <= 0 ? `Llegaste al máximo de ${TOPE_DIARIO} envíos por hoy. Probá de nuevo mañana.` : 'Tarda un minuto. Podés sumar hasta 4 fotos.'}
              </span>
            </span>
          </button>
        ) : (
          <FormularioSugerencia
            role={role}
            onCancel={() => setAbierto(false)}
            onSent={async () => { setAbierto(false); await load() }}
          />
        )}

        <section aria-labelledby="mis-envios">
          <div className="homy-section-head">
            <h2 id="mis-envios" className="homy-section-title">
              <span className="homy-icon-chip homy-chip-blue size-9 shrink-0 [&_svg]:size-[18px]" aria-hidden><Inbox /></span>
              Mis envíos
            </h2>
          </div>
          {loadError ? (
            <div className="homy-glass rounded-2xl p-4 text-sm text-red-700">
              {loadError}{' '}
              <button type="button" onClick={() => void load()} className="font-bold underline">Reintentar</button>
            </div>
          ) : items === null ? (
            <Loading text="Cargando tus envíos…" />
          ) : items.length === 0 ? (
            <EmptyState icon={<Lightbulb />} title="Todavía no mandaste nada" hint="Cuando mandes una sugerencia, acá vas a ver en qué estado está y la respuesta del equipo de HomIA." />
          ) : (
            <ul className="space-y-3">
              {items.map((it) => <EnvioCard key={it.id} it={it} destacado={it.id === destacado} mostrarRol={(user?.roles.length || 0) > 1} />)}
            </ul>
          )}
        </section>

        <p className="flex items-start gap-2 text-xs leading-relaxed text-slate-400">
          <Lock className="mt-0.5 size-3.5 shrink-0" aria-hidden />
          Tus fotos se guardan en un almacenamiento privado: solo las ven vos y el equipo de HomIA. No compartas contraseñas ni datos de tarjetas.
        </p>
      </div>
    </div>
  )
}

function EnvioCard({ it, destacado, mostrarRol }: { it: FeedbackItem; destacado: boolean; mostrarRol: boolean }) {
  const [abierto, setAbierto] = useState(destacado)
  const Icono = TIPO_ICONO[it.type] || MessageSquareMore
  const larga = it.description.length > 180
  return (
    <li id={`sug-${it.id}`} className={`homy-glass rounded-2xl p-4 sm:p-5 ${destacado ? 'ring-2 ring-[#00C4FF]/60' : ''}`}>
      <div className="flex items-start gap-3">
        <span className={`homy-icon-chip size-10 shrink-0 [&_svg]:size-5 ${TIPO_TONO[it.type] || 'homy-chip-navy'}`} aria-hidden><Icono /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{it.typeLabel} · {it.areaLabel}{mostrarRol ? ` · ${it.role}` : ''}</span>
          </div>
          <h3 className="mt-0.5 break-words text-[15px] font-extrabold leading-snug text-[#0A2540]">{it.title}</h3>
          <p className="mt-0.5 text-xs text-slate-400">Enviada el {formatDate(it.createdAt)}</p>
        </div>
        <EstadoPill status={it.status} label={it.statusLabel} />
      </div>
      <p className={`mt-3 whitespace-pre-line break-words text-sm leading-relaxed text-slate-600 ${!abierto && larga ? 'line-clamp-3' : ''}`}>{it.description}</p>
      {larga && (
        <button type="button" onClick={() => setAbierto((v) => !v)} className="homy-focus mt-1 inline-flex min-h-[36px] items-center gap-1 text-[13px] font-bold text-[#1D63B8]">
          {abierto ? <><ChevronUp className="size-4" aria-hidden /> Ver menos</> : <><ChevronDown className="size-4" aria-hidden /> Ver todo</>}
        </button>
      )}
      <FotosPrivadas photos={it.photos} />
      {it.adminResponse ? (
        <div className="mt-3 rounded-xl border-l-[3px] border-[#00C4FF] bg-[#00C4FF]/8 px-3.5 py-3">
          <p className="flex items-center gap-1.5 text-[12px] font-extrabold text-[#0A2540]">
            <Reply className="size-3.5 text-[#0092c4]" aria-hidden /> Respuesta de HomIA{it.respondedAt ? ` · ${formatDate(it.respondedAt)}` : ''}
          </p>
          <p className="mt-1 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">{it.adminResponse}</p>
        </div>
      ) : (
        <p className="mt-3 text-xs text-slate-400">
          {it.status === 'recibida' ? 'La recibimos. Te avisamos cuando la miremos.' : 'Te avisamos por notificación y por mail cuando haya novedades.'}
        </p>
      )}
    </li>
  )
}

function FormularioSugerencia({ role, onCancel, onSent }: { role: 'cliente' | 'profesional' | 'proveedor'; onCancel: () => void; onSent: () => Promise<void> }) {
  const areas = useMemo(() => areasDelRol(role), [role])
  const [type, setType] = useState<TipoFeedback | ''>('')
  const [area, setArea] = useState('')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [contactOk, setContactOk] = useState(true)
  const [fotos, setFotos] = useState<FotoLocal[]>([])
  const [errores, setErrores] = useState<Errores>({})
  const [enviando, setEnviando] = useState(false)
  const camara = useRef<HTMLInputElement>(null)
  const galeria = useRef<HTMLInputElement>(null)
  const contexto = useMemo(() => (type === 'problema' ? contextoTecnico() : null), [type])

  // liberar las vistas previas al salir
  const fotosRef = useRef(fotos)
  fotosRef.current = fotos
  useEffect(() => () => { for (const f of fotosRef.current) URL.revokeObjectURL(f.preview) }, [])

  async function agregarFotos(lista: FileList | null) {
    if (!lista?.length) return
    const libres = MAX_FOTOS - fotos.length
    if (libres <= 0) { toast.error(`Podés adjuntar hasta ${MAX_FOTOS} fotos`); return }
    const archivos = Array.from(lista).slice(0, libres)
    if (lista.length > libres) toast.message(`Sumamos ${libres} de ${lista.length}: el máximo es ${MAX_FOTOS} fotos`)
    for (const file of archivos) {
      const key = `${Date.now()}-${Math.random().toString(36).slice(2)}`
      const preview = URL.createObjectURL(file)
      setFotos((prev) => [...prev, { key, preview, path: null, subiendo: true }])
      // achica y comprime en el navegador (límite de Vercel) y devuelve el motivo exacto si falla
      const r = await subirImagen(file, FEEDBACK_UPLOAD_FOLDER)
      if (!r.ok) {
        toast.error(r.error)
        setFotos((prev) => prev.map((f) => (f.key === key ? { ...f, subiendo: false, error: r.error } : f)))
        continue
      }
      setFotos((prev) => prev.map((f) => (f.key === key ? { ...f, subiendo: false, path: r.url } : f)))
    }
  }

  function quitarFoto(key: string) {
    setFotos((prev) => {
      const f = prev.find((x) => x.key === key)
      if (f) URL.revokeObjectURL(f.preview)
      return prev.filter((x) => x.key !== key)
    })
  }

  function validar(): Errores {
    const e: Errores = {}
    if (!type) e.type = 'Elegí qué tipo de envío es'
    if (!area) e.area = 'Elegí sobre qué parte de HomIA es'
    if (title.trim().length < 4) e.title = 'Escribí un título de al menos 4 caracteres'
    else if (title.trim().length > 120) e.title = 'El título puede tener hasta 120 caracteres'
    if (description.trim().length < 10) e.description = 'Contanos un poco más (al menos 10 caracteres)'
    else if (description.trim().length > 4000) e.description = 'La descripción puede tener hasta 4000 caracteres'
    if (fotos.some((f) => f.subiendo)) e.photos = 'Esperá a que terminen de subir las fotos'
    else if (fotos.some((f) => f.error)) e.photos = 'Quitá las fotos que no se pudieron subir'
    return e
  }

  async function enviar(ev: React.FormEvent) {
    ev.preventDefault()
    const e = validar()
    setErrores(e)
    if (Object.keys(e).length) {
      const primero = ['type', 'area', 'title', 'description', 'photos'].find((k) => e[k as keyof Errores])
      document.getElementById(`sug-campo-${primero}`)?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      return
    }
    setEnviando(true)
    try {
      const res = await fetch('/api/feedback', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          role, type, area, title, description, contactOk,
          photos: fotos.map((f) => f.path).filter(Boolean),
          context: contexto,
        }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setErrores({ general: d.error || 'No pudimos mandar tu sugerencia. Probá de nuevo.' }); return }
      toast.success('¡Gracias! Recibimos tu envío', { description: 'Te avisamos cuando el equipo de HomIA lo mire.' })
      await onSent()
    } catch {
      setErrores({ general: NET_ERROR })
    } finally { setEnviando(false) }
  }

  const err = (k: keyof Errores) => errores[k] ? <p className="mt-1.5 text-[12.5px] font-semibold text-red-600" role="alert">{errores[k]}</p> : null
  const inputCls = 'homy-glass-input homy-focus w-full rounded-xl px-3.5 py-3 text-[15px] text-[#0A2540] placeholder:text-slate-400'

  return (
    <form onSubmit={enviar} noValidate className="homy-glass rounded-3xl p-4 sm:p-6" aria-labelledby="nueva-sug">
      <div className="flex items-start justify-between gap-3">
        <h2 id="nueva-sug" className="text-lg font-extrabold tracking-tight text-[#0A2540]">Nueva sugerencia</h2>
        <button type="button" onClick={onCancel} className="homy-focus -mr-1 -mt-1 grid size-10 shrink-0 place-items-center rounded-full text-slate-400 hover:bg-white/70 hover:text-[#0A2540]" aria-label="Cerrar el formulario">
          <X className="size-5" aria-hidden />
        </button>
      </div>

      {/* 1. Tipo */}
      <fieldset id="sug-campo-type" className="mt-4">
        <legend className="text-sm font-extrabold text-[#0A2540]">¿Qué nos querés contar?</legend>
        <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {TIPOS.map((t) => {
            const Icono = TIPO_ICONO[t.id]
            const activo = type === t.id
            return (
              <button
                key={t.id} type="button" aria-pressed={activo}
                onClick={() => { setType(t.id); setErrores((e) => ({ ...e, type: undefined })) }}
                className={`homy-focus flex min-h-[92px] flex-col items-start gap-1 rounded-2xl p-3 text-left transition ${activo ? 'bg-gradient-to-br from-[#1D63B8] to-[#2b7fd0] text-white shadow-[0_12px_26px_-12px_rgba(29,99,184,0.8)]' : 'homy-glass-soft text-[#0A2540] hover:bg-white/80'}`}
              >
                <span className="flex items-center gap-2">
                  <Icono className={`size-4.5 shrink-0 ${activo ? 'text-white' : 'text-[#1D63B8]'}`} aria-hidden />
                  <span className="text-[13.5px] font-extrabold leading-tight">{t.label}</span>
                </span>
                <span className={`text-[11.5px] leading-snug ${activo ? 'text-white/85' : 'text-slate-500'}`}>{t.ayuda}</span>
              </button>
            )
          })}
        </div>
        {err('type')}
      </fieldset>

      {/* 2. ¿Sobre qué? */}
      <div id="sug-campo-area" className="mt-5">
        <label htmlFor="sug-area" className="text-sm font-extrabold text-[#0A2540]">¿Sobre qué parte de HomIA?</label>
        <select
          id="sug-area" value={area}
          onChange={(e) => { setArea(e.target.value); setErrores((x) => ({ ...x, area: undefined })) }}
          className={`${inputCls} mt-2 min-h-[48px] appearance-none bg-[url('data:image/svg+xml;utf8,<svg xmlns=%22http://www.w3.org/2000/svg%22 width=%2216%22 height=%2216%22 viewBox=%220 0 24 24%22 fill=%22none%22 stroke=%22%2364748b%22 stroke-width=%222%22><path d=%22m6 9 6 6 6-6%22/></svg>')] bg-[length:16px] bg-[right_14px_center] bg-no-repeat pr-10`}
          aria-invalid={!!errores.area}
        >
          <option value="">Elegí una sección…</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
        {err('area')}
      </div>

      {/* 3. Título */}
      <div id="sug-campo-title" className="mt-5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="sug-title" className="text-sm font-extrabold text-[#0A2540]">Título</label>
          <span className="text-[11px] font-semibold text-slate-400">{title.trim().length}/120</span>
        </div>
        <input
          id="sug-title" value={title} maxLength={140}
          onChange={(e) => { setTitle(e.target.value); setErrores((x) => ({ ...x, title: undefined })) }}
          placeholder="Ej.: Poder filtrar por barrio en el directorio"
          className={`${inputCls} mt-2 min-h-[48px]`} aria-invalid={!!errores.title}
        />
        {err('title')}
      </div>

      {/* 4. Descripción */}
      <div id="sug-campo-description" className="mt-5">
        <div className="flex items-baseline justify-between gap-2">
          <label htmlFor="sug-desc" className="text-sm font-extrabold text-[#0A2540]">Descripción</label>
          <span className="text-[11px] font-semibold text-slate-400">{description.trim().length}/4000</span>
        </div>
        <p id="sug-desc-ayuda" className="mt-0.5 text-[12.5px] leading-snug text-slate-500">Contanos qué pasó, qué esperabas y qué te gustaría.</p>
        <textarea
          id="sug-desc" value={description} rows={5} maxLength={4200} aria-describedby="sug-desc-ayuda"
          onChange={(e) => { setDescription(e.target.value); setErrores((x) => ({ ...x, description: undefined })) }}
          className={`${inputCls} mt-2 resize-y leading-relaxed`} aria-invalid={!!errores.description}
        />
        {err('description')}
      </div>

      {/* 5. Fotos */}
      <div id="sug-campo-photos" className="mt-5">
        <p className="text-sm font-extrabold text-[#0A2540]">Fotos de evidencia <span className="font-semibold text-slate-400">(opcional, hasta {MAX_FOTOS})</span></p>
        <p className="mt-0.5 text-[12.5px] leading-snug text-slate-500">Capturas de pantalla o fotos (JPG, PNG o WEBP). Si pesan mucho, las achicamos solas.</p>
        <ul className="mt-2.5 grid grid-cols-4 gap-2 sm:flex sm:flex-wrap">
          {fotos.map((f, i) => (
            <li key={f.key} className="relative aspect-square sm:size-24">
              <img src={f.preview} alt={`Foto ${i + 1} para adjuntar`} className={`size-full rounded-xl object-cover ring-1 ${f.error ? 'opacity-40 ring-red-400' : 'ring-[#0A2540]/10'}`} />
              {f.subiendo && <span className="absolute inset-0 grid place-items-center rounded-xl bg-white/60"><Loader2 className="size-5 animate-spin text-[#1D63B8]" aria-label="Subiendo" /></span>}
              {f.error && <span className="absolute inset-x-1 bottom-1 rounded bg-red-600 px-1 py-0.5 text-center text-[9.5px] font-bold leading-tight text-white">No se subió</span>}
              <button type="button" onClick={() => quitarFoto(f.key)} aria-label={`Quitar foto ${i + 1}`}
                className="homy-focus absolute -right-1.5 -top-1.5 grid size-7 place-items-center rounded-full bg-[#0A2540] text-white shadow ring-2 ring-white">
                <X className="size-3.5" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
        {fotos.some((f) => f.error) && (
          <ul className="mt-2 space-y-1" aria-live="polite">
            {fotos.map((f, i) => f.error ? (
              <li key={f.key} className="text-[12.5px] font-semibold leading-snug text-red-600">Foto {i + 1}: {f.error}</li>
            ) : null)}
          </ul>
        )}
        {fotos.length < MAX_FOTOS && (
          <div className="mt-2.5 grid grid-cols-2 gap-2 sm:flex">
            <button type="button" onClick={() => camara.current?.click()} className="homy-btn-ghost homy-focus min-h-[46px] justify-center rounded-xl px-3.5 text-[13px] font-bold sm:hidden">
              <Camera className="size-4" aria-hidden /> Sacar foto
            </button>
            <button type="button" onClick={() => galeria.current?.click()} className="homy-btn-ghost homy-focus min-h-[46px] justify-center rounded-xl px-3.5 text-[13px] font-bold">
              <ImagePlus className="size-4" aria-hidden /> <span className="sm:hidden">Galería</span><span className="hidden sm:inline">Agregar fotos</span>
            </button>
          </div>
        )}
        <input ref={camara} type="file" accept="image/*" capture="environment" className="hidden"
          onChange={(e) => { void agregarFotos(e.target.files); e.target.value = '' }} />
        <input ref={galeria} type="file" accept="image/*" multiple className="hidden" data-testid="sug-fotos"
          onChange={(e) => { void agregarFotos(e.target.files); e.target.value = '' }} />
        {err('photos')}
      </div>

      {/* Contexto técnico (solo "Problema técnico") */}
      {contexto && (
        <div className="mt-5 rounded-2xl border border-[#1D63B8]/15 bg-[#1D63B8]/5 p-3.5">
          <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-[#0A2540]">
            <Info className="size-4 text-[#1D63B8]" aria-hidden /> Se adjunta automáticamente
          </p>
          <p className="mt-0.5 text-[12px] leading-snug text-slate-500">Para encontrar el problema más rápido mandamos también estos datos:</p>
          <dl className="mt-2 grid gap-1 text-[12.5px]">
            {([['Pantalla', contexto.pantalla], ['Navegador', contexto.navegador], ['Dispositivo', contexto.dispositivo], ['Fecha', contexto.fecha]] as const).map(([k, v]) => (
              <div key={k} className="flex flex-wrap gap-x-1.5">
                <dt className="font-bold text-slate-600">{k}:</dt>
                <dd className="min-w-0 break-all text-slate-700">{v}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}

      {/* Contacto */}
      <label className="mt-5 flex cursor-pointer items-start gap-3 rounded-2xl p-1">
        <input type="checkbox" checked={contactOk} onChange={(e) => setContactOk(e.target.checked)} className="mt-0.5 size-5 shrink-0 accent-[#1D63B8]" />
        <span className="text-sm leading-snug text-[#0A2540]">
          <span className="font-bold">Pueden contactarme por este tema</span>
          <span className="block text-[12.5px] text-slate-500">Si lo destildás, igual te respondemos acá, pero no te escribimos a tu email.</span>
        </span>
      </label>

      {errores.general && <p className="mt-4 rounded-xl bg-red-50 px-3.5 py-2.5 text-sm font-semibold text-red-700" role="alert">{errores.general}</p>}

      <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-end">
        <button type="button" onClick={onCancel} className="homy-btn-ghost homy-focus min-h-[48px] justify-center px-5 text-sm">Cancelar</button>
        <button type="submit" disabled={enviando} className="homy-btn-primary homy-focus min-h-[48px] justify-center px-6 text-sm disabled:opacity-60">
          {enviando ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Enviando…</> : <><Send className="size-4" aria-hidden /> Enviar</>}
        </button>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[11.5px] text-slate-400">
        <ShieldCheck className="size-3.5 shrink-0" aria-hidden /> Lo lee el equipo de HomIA. Podés mandar hasta {TOPE_DIARIO} por día.
      </p>
    </form>
  )
}

