'use client'
// Verificación de identidad HomIA — el usuario sube frente + dorso del DNI,
// el modelo de IA de visión analiza LAS DOS fotos (¿es un documento?, ¿legible?,
// ¿coinciden los datos?, ¿parece real?) y el estado queda público junto a su nombre.
// Quien no sube DNI es "No verificado" para todos.
import { useEffect, useRef, useState } from 'react'
import { useSession } from '@/lib/store'
import { Loading, EmptyState, VerifyBadge } from '@/components/app/ui-bits'
import { toast } from 'sonner'
import { navigate, useRoute } from '@/lib/router'
import {
  ShieldCheck, ShieldQuestion, ShieldX, IdCard, UploadCloud, ScanFace, BadgeCheck,
  ArrowRight, CheckCircle2, AlertTriangle, Sparkles,
} from 'lucide-react'

type Verdict = {
  esDocumento: boolean; pareceReal: boolean; legible: boolean
  mismoTitular: boolean | null // null → el modelo no lo afirmó
  tipo: string; confianza: number; motivo: string
  nombreDetectado?: string | null; dniDetectado?: string | null
} | null
type Doc = {
  id: string; frontUrl: string | null; backUrl: string | null; status: string
  aiNotes: string | null; aiScore: number | null; aiVerdict: Verdict; createdAt: string
}
type VerificationData = { verificationStatus: string; verifiedAt: string | null; document: Doc | null }

const STATUS_COPY: Record<string, { title: string; body: string; tone: 'ok' | 'wait' | 'bad' | 'todo' }> = {
  none: {
    title: 'Tu identidad todavía no está verificada',
    body: 'Subí el frente y el dorso de tu DNI: un modelo de IA de visión analiza las dos fotos y valida que el documento sea real y consistente. Verificado, todos confían más en vos.',
    tone: 'todo',
  },
  en_revision: {
    title: 'Tu documento está en revisión',
    body: 'La IA no pudo dar un dictamen concluyente con las fotos enviadas. Podés subir mejores fotos (buena luz, sin brillos, bordes completos) para volver a analizar.',
    tone: 'wait',
  },
  verificado: {
    title: 'Identidad verificada',
    body: 'La IA validó tu documento: tu insignia de verificado ya se ve junto a tu nombre en todo HomIA.',
    tone: 'ok',
  },
  rechazado: {
    title: 'El documento no pasó la verificación',
    body: 'El análisis de IA no validó las fotos enviadas. Revisá el motivo abajo y volvé a subir tu DNI con mejor calidad.',
    tone: 'bad',
  },
}

/* Banner compacto para los dashboards: empuja a verificar si falta */
export function VerificationPrompt({ role }: { role: string }) {
  const [status, setStatus] = useState<string | null>(null)
  useEffect(() => {
    fetch('/api/verification/dni').then((r) => (r.ok ? r.json() : null)).then((d) => {
      if (d) setStatus(d.verificationStatus)
    }).catch(() => { /* silencioso */ })
  }, [])
  if (!status || status === 'verificado') return null
  return (
    <button
      onClick={() => navigate(`/panel/${role}/verificacion`)}
      className={`homy-glass homy-lift homy-focus group mb-5 flex w-full items-center gap-3.5 rounded-2xl p-4 text-left transition ${status === 'rechazado' ? 'ring-1 ring-red-400/40' : 'ring-1 ring-[#FFC700]/45'}`}
    >
      <span className={`homy-icon-chip size-11 shrink-0 ${status === 'rechazado' ? 'homy-chip-orange' : 'homy-chip-gold'} [&_svg]:size-5`} aria-hidden>
        {status === 'none' ? <IdCard /> : <ShieldQuestion />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-[#0A2540]">
          {status === 'none' ? 'Verificá tu identidad con tu DNI' : status === 'rechazado' ? 'Tu verificación fue rechazada — revisá el motivo' : 'Tu DNI está en revisión'}
        </span>
        <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-500">
          La IA analiza frente y dorso y tu insignia se ve junto a tu nombre en toda la comunidad.
        </span>
      </span>
      <ArrowRight className="size-5 shrink-0 text-slate-300 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[#1D63B8]" aria-hidden />
    </button>
  )
}

export default function VerificationScreen() {
  const { user, refresh } = useSession()
  const route = useRoute()
  const [data, setData] = useState<VerificationData | null>(null)
  const [loading, setLoading] = useState(true)
  const [front, setFront] = useState<string | null>(null)
  const [back, setBack] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [result, setResult] = useState<{ status: string; aiScore: number; aiNotes: string; aiVerdict: Verdict } | null>(null)
  const frontInput = useRef<HTMLInputElement>(null)
  const backInput = useRef<HTMLInputElement>(null)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/verification/dni')
        if (res.ok) setData(await res.json())
      } finally { setLoading(false) }
    })()
  }, [])

  async function uploadFile(file: File, slot: 'front' | 'back') {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'dni')
      const res = await fetch('/api/uploads', { method: 'POST', body: fd })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'No pudimos subir la foto, probá de nuevo'); return }
      // d.url = "dni-docs/<userId>/dni/<archivo>" (path privado que espera POST /api/verification/dni)
      if (slot === 'front') setFront(d.url)
      else setBack(d.url)
      toast.success(slot === 'front' ? 'Frente listo' : 'Dorso listo')
    } finally { setUploading(false) }
  }

  async function submit() {
    if (!front || !back) { toast.error('Subí el frente y el dorso para analizar'); return }
    setAnalyzing(true)
    setResult(null)
    try {
      const res = await fetch('/api/verification/dni', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ frontUrl: front, backUrl: back }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error ?? 'No pudimos procesar el documento, probá de nuevo'); return }
      setResult(d)
      toast.success('Análisis de IA terminado')
      const refreshed = await fetch('/api/verification/dni')
      if (refreshed.ok) setData(await refreshed.json())
      setFront(null); setBack(null)
      // el badge del header/topbar sale de la sesión: refrescarla con el dictamen
      await refresh()
    } finally { setAnalyzing(false) }
  }

  if (loading) return <div className="homy-page"><Loading /></div>
  // rol del panel actual (/panel/<rol>/verificacion), no el primero de la lista
  const routeRole = route.segments[0] === 'panel' ? route.segments[1] : undefined
  const role = routeRole && ['cliente', 'profesional', 'proveedor'].includes(routeRole) ? routeRole : (user?.roles?.[0] || 'cliente')
  const status = data?.verificationStatus || 'none'
  const copy = STATUS_COPY[status] || STATUS_COPY.none
  const doc = data?.document

  const toneCls = {
    ok: 'ring-1 ring-[#0e9f6e]/35',
    wait: 'ring-1 ring-[#FFC700]/45',
    bad: 'ring-1 ring-red-400/45',
    todo: 'ring-1 ring-[#1D63B8]/25',
  }[copy.tone]
  const toneChip = {
    ok: { chip: 'homy-chip-mint', icon: <ShieldCheck /> },
    wait: { chip: 'homy-chip-gold', icon: <ShieldQuestion /> },
    bad: { chip: 'homy-chip-orange', icon: <ShieldX /> },
    todo: { chip: 'homy-chip-blue', icon: <IdCard /> },
  }[copy.tone]

  return (
    <div className="homy-page max-w-3xl">
      <div className="mb-5">
        <p className="homy-eyebrow">Confianza HomIA</p>
        <h1 className="homy-page-title mt-1">Verificación de identidad</h1>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-slate-500">
          Tu DNI lo analiza un modelo de IA de visión: revisa frente y dorso, que los datos coincidan
          y que el documento sea real. El resultado se ve junto a tu nombre en toda la comunidad.
        </p>
      </div>

      {/* estado actual */}
      <div className={`homy-glass rounded-3xl p-5 sm:p-6 ${toneCls}`}>
        <div className="flex items-start gap-4">
          <span className={`homy-icon-chip size-12 shrink-0 [&_svg]:size-6 ${toneChip.chip}`} aria-hidden>{toneChip.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-lg font-extrabold tracking-tight text-[#0A2540]">{copy.title}</h2>
              <VerifyBadge status={status} compact={false} />
            </div>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{copy.body}</p>
          </div>
        </div>

        {/* dictamen de IA del último documento */}
        {doc && (doc.aiNotes || doc.aiVerdict) && (
          <div className="mt-4 rounded-2xl bg-[#0A2540]/4 p-4">
            <p className="flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-[0.14em] text-slate-400">
              <Sparkles className="size-3.5 text-[#0092c4]" aria-hidden /> Dictamen del modelo de visión
            </p>
            {doc.aiVerdict && (
              <div className="mt-2.5 flex flex-wrap gap-1.5">
                {doc.aiVerdict.esDocumento !== undefined && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${doc.aiVerdict.esDocumento ? 'bg-[#0e9f6e]/10 text-[#0e9f6e]' : 'bg-red-500/10 text-red-600'}`}>
                    {doc.aiVerdict.esDocumento ? <CheckCircle2 className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />} Es un documento
                  </span>
                )}
                {doc.aiVerdict.legible !== undefined && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${doc.aiVerdict.legible ? 'bg-[#0e9f6e]/10 text-[#0e9f6e]' : 'bg-red-500/10 text-red-600'}`}>
                    {doc.aiVerdict.legible ? <CheckCircle2 className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />} Legible
                  </span>
                )}
                {doc.aiVerdict.mismoTitular !== undefined && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${doc.aiVerdict.mismoTitular === true ? 'bg-[#0e9f6e]/10 text-[#0e9f6e]' : doc.aiVerdict.mismoTitular === false ? 'bg-red-500/10 text-red-600' : 'bg-[#FFC700]/12 text-[#8a6d00]'}`}>
                    {doc.aiVerdict.mismoTitular === true ? <CheckCircle2 className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />}
                    {doc.aiVerdict.mismoTitular === null ? 'Datos frente/dorso sin confirmar' : 'Datos consistentes frente/dorso'}
                  </span>
                )}
                <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10.5px] font-bold ${doc.aiVerdict.pareceReal ? 'bg-[#0e9f6e]/10 text-[#0e9f6e]' : 'bg-[#FFC700]/12 text-[#8a6d00]'}`}>
                  {doc.aiVerdict.pareceReal ? <CheckCircle2 className="size-3" aria-hidden /> : <AlertTriangle className="size-3" aria-hidden />} {doc.aiVerdict.pareceReal ? 'Parece real' : 'Con reservas de autenticidad'}
                </span>
                {typeof doc.aiVerdict.confianza === 'number' && (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[#1D63B8]/10 px-2.5 py-1 text-[10.5px] font-bold text-[#1D63B8]">
                    Confianza {Math.round(doc.aiVerdict.confianza * 100)}%
                  </span>
                )}
              </div>
            )}
            {doc.aiNotes && <p className="mt-2.5 text-[13px] leading-relaxed text-slate-500">{doc.aiNotes}</p>}
          </div>
        )}

        {/* fotos del documento actual */}
        {doc?.frontUrl && (
          <div className="mt-4 flex flex-wrap gap-3">
            {[doc.frontUrl, doc.backUrl].filter(Boolean).map((u, i) => (
              <img key={i} src={u as string} alt={i === 0 ? 'Frente del DNI' : 'Dorso del DNI'} className="h-24 rounded-xl object-cover ring-1 ring-[#0A2540]/10" />
            ))}
          </div>
        )}
      </div>

      {/* subida / re-subida */}
      {status !== 'verificado' && (
        <div className="homy-glass mt-5 rounded-3xl p-5 sm:p-6">
          <div className="homy-section-head">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-blue size-9 shrink-0 [&_svg]:size-[18px]" aria-hidden><UploadCloud /></span>
              {doc ? 'Subir otras fotos' : 'Subí tu DNI'}
            </h2>
          </div>
          <div className="grid gap-3.5 sm:grid-cols-2">
            {([['front', 'Frente', front, frontInput], ['back', 'Dorso', back, backInput]] as const).map(([slot, label, value, ref]) => (
              <div key={slot}>
                <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wider text-slate-400">{label}</p>
                <button
                  onClick={() => ref.current?.click()}
                  className={`homy-focus group relative flex h-40 w-full items-center justify-center overflow-hidden rounded-2xl border-2 border-dashed transition ${value ? 'border-[#0e9f6e]/40' : 'border-[#0A2540]/15 hover:border-[#1D63B8]/45 hover:bg-white/60'}`}
                >
                  {value ? (
                    // la foto queda en un bucket privado (sin URL pública): se confirma sin previsualizar
                    <span className="flex flex-col items-center gap-2 p-4 text-center">
                      <CheckCircle2 className="size-7 text-[#0e9f6e]" aria-hidden />
                      <span className="text-[13px] font-bold text-[#0e9f6e]">{label} listo</span>
                      <span className="text-[11px] font-semibold text-slate-400">Tocá para cambiar</span>
                    </span>
                  ) : (
                    <span className="flex flex-col items-center gap-2 p-4 text-center">
                      <ScanFace className="size-7 text-slate-300 transition group-hover:text-[#1D63B8]" aria-hidden />
                      <span className="text-[13px] font-bold text-slate-400">JPG/PNG · buena luz, sin brillos</span>
                    </span>
                  )}
                </button>
                <input
                  ref={ref} type="file" accept="image/*" className="hidden"
                  onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadFile(f, slot) }}
                />
              </div>
            ))}
          </div>
          <button
            onClick={submit}
            disabled={!front || !back || uploading || analyzing}
            className="homy-btn-primary homy-focus mt-5 w-full px-6 py-3.5 min-h-[48px] text-sm disabled:opacity-50 sm:w-auto"
          >
            {analyzing ? (
              <><Sparkles className="size-4 animate-pulse" aria-hidden /> La IA está analizando las dos fotos…</>
            ) : (
              <><BadgeCheck className="size-4" aria-hidden /> Enviar a verificación con IA</>
            )}
          </button>
          <p className="mt-3 text-xs leading-relaxed text-slate-400">
            Analizamos las fotos con un modelo de visión: se fija que sea un documento, que se lea bien,
            que los datos coincidan entre frente y dorso y que el documento parezca real. Tus fotos solo
            se usan para verificar tu identidad.
          </p>
        </div>
      )}

      {/* resultado recién analizado */}
      {result && (
        <div className={`homy-glass mt-5 rounded-3xl p-5 sm:p-6 ${
          result.status === 'verificado' ? 'ring-1 ring-[#0e9f6e]/40' : result.status === 'rechazado' ? 'ring-1 ring-red-400/40' : 'ring-1 ring-[#FFC700]/45'
        }`}>
          <div className="flex items-start gap-3.5">
            <span className={`homy-icon-chip size-11 shrink-0 [&_svg]:size-5 ${result.status === 'verificado' ? 'homy-chip-mint' : result.status === 'rechazado' ? 'homy-chip-orange' : 'homy-chip-gold'}`} aria-hidden>
              {result.status === 'verificado' ? <ShieldCheck /> : result.status === 'rechazado' ? <ShieldX /> : <ShieldQuestion />}
            </span>
            <div className="min-w-0">
              <p className="font-extrabold text-[#0A2540]">
                {result.status === 'verificado' ? '¡Tu identidad quedó verificada!' : result.status === 'rechazado' ? 'El documento fue rechazado' : 'El documento quedó en revisión'}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-slate-500">{result.aiNotes}</p>
              {result.status === 'verificado' && (
                <button onClick={() => navigate(`/panel/${role}`)} className="homy-btn-dark homy-focus mt-3.5 px-5 py-2.5 text-sm">
                  Volver al panel
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {!user && (
        <div className="mt-6">
          <EmptyState
            icon={<ShieldCheck />}
            title="Iniciá sesión para verificar tu identidad"
            hint="La verificación pertenece a tu cuenta: entrá para subir tu DNI y mostrar la insignia en la comunidad."
          />
        </div>
      )}
    </div>
  )
}
