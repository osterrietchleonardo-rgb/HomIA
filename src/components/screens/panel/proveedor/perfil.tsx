'use client'
// Perfil del proveedor — datos del negocio, reputación y documentos (DNI frente/reverso)
import { useEffect, useRef, useState } from 'react'
import { StatusBadge, Loading, UAvatar, UStars } from '@/components/app/ui-bits'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { useSession } from '@/lib/store'
import { Upload, ShieldCheck, Store, Star, CheckCircle2, Loader2, Crown } from 'lucide-react'

type Doc = { id: string; type: string; frontUrl: string | null; backUrl: string | null; status: string; createdAt: string }

type MeUser = {
  email: string
  displayName: string
  avatarUrl?: string | null
  provider: {
    businessName: string; kind?: string; cuit: string | null; description: string | null
    address: string | null; city: string | null; rating: number; reviewsCount: number
    subscription?: string; proSince?: string | null
  } | null
  documents: Doc[]
}

// Tipos de negocio que puede tener un proveedor (catálogo completo de rubros)
const PROVIDER_KINDS: { value: string; label: string }[] = [
  { value: 'corralon', label: 'Corralón de materiales' },
  { value: 'ferreteria', label: 'Ferretería' },
  { value: 'electricidad', label: 'Casa de electricidad' },
  { value: 'pintura', label: 'Pinturería' },
  { value: 'sanitarios', label: 'Sanitarios · Plomería' },
  { value: 'gas', label: 'Casa de gas' },
  { value: 'maderera', label: 'Maderera' },
  { value: 'carpinteria', label: 'Carpintería · Herrajes' },
  { value: 'aberturas', label: 'Aberturas · Vidrios' },
  { value: 'techos', label: 'Techos · Impermeabilización' },
  { value: 'jardin', label: 'Jardinería · Exterior' },
  { value: 'limpieza', label: 'Artículos de limpieza' },
  { value: 'climatizacion', label: 'Climatización' },
  { value: 'herramientas', label: 'Herramientas' },
  { value: 'muebles', label: 'Muebles · Equipamiento' },
  { value: 'pisos', label: 'Pisos · Revestimientos' },
  { value: 'seguridad', label: 'Seguridad · Industrial' },
  { value: 'multi', label: 'Multiproducto (de todo un poco)' },
]

export default function ProviderProfile() {
  const { refresh } = useSession()
  const [me, setMe] = useState<MeUser | null>(null)
  const [loaded, setLoaded] = useState(false)

  // formulario del negocio
  const [businessName, setBusinessName] = useState('')
  const [kind, setKind] = useState('multi')
  const [cuit, setCuit] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [busy, setBusy] = useState(false)

  // plan PRO (suscripción Mercado Pago — proveedores)
  const [subscription, setSubscription] = useState<'free' | 'pro'>('free')
  const [proSince, setProSince] = useState<string | null>(null)
  const [subscribing, setSubscribing] = useState(false)

  // documentos
  const frontRef = useRef<HTMLInputElement>(null)
  const backRef = useRef<HTMLInputElement>(null)
  const [frontUrl, setFrontUrl] = useState('')
  const [backUrl, setBackUrl] = useState('')
  const [frontName, setFrontName] = useState('')
  const [backName, setBackName] = useState('')
  const [uploading, setUploading] = useState<'front' | 'back' | null>(null)
  const [sendingDoc, setSendingDoc] = useState(false)
  const [docs, setDocs] = useState<Doc[]>([])

  async function load() {
    const res = await fetch('/api/profiles/me')
    if (res.ok) {
      const data = await res.json()
      const u: MeUser | null = data.user || null
      setMe(u)
      if (u) {
        setBusinessName(u.provider?.businessName || '')
        setKind(u.provider?.kind || 'multi')
        setCuit(u.provider?.cuit || '')
        setDescription(u.provider?.description || '')
        setAddress(u.provider?.address || '')
        setCity(u.provider?.city || '')
        setSubscription(u.provider?.subscription === 'pro' ? 'pro' : 'free')
        setProSince(u.provider?.proSince ?? null)
        setDocs((u.documents || []).filter((d) => d.type === 'dni'))
      }
    }
  }

  useEffect(() => {
    (async () => { try { await load() } finally { setLoaded(true) } })()
  }, [])

  async function save(e: React.FormEvent) {
    e.preventDefault()
    if (!businessName.trim()) { toast.error('El nombre del negocio es obligatorio'); return }
    setBusy(true)
    try {
      const res = await fetch('/api/profiles/me', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ businessName: businessName.trim(), kind, cuit: cuit.trim(), description: description.trim(), address: address.trim(), city: city.trim() }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      await refresh()
      toast.success('Perfil actualizado')
    } finally { setBusy(false) }
  }

  async function uploadSide(side: 'front' | 'back') {
    const ref = side === 'front' ? frontRef : backRef
    const file = ref.current?.files?.[0]
    if (!file) return
    setUploading(side)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'dni')
      const res = await fetch('/api/uploads', { method: 'POST', body: fd })
      if (!res.ok) { toast.error((await res.json()).error || `No se pudo subir ${file.name}`); return }
      const data = await res.json()
      if (side === 'front') { setFrontUrl(data.url); setFrontName(file.name) }
      else { setBackUrl(data.url); setBackName(file.name) }
      toast.success(side === 'front' ? 'Frente subido' : 'Reverso subido')
    } finally {
      setUploading(null)
      if (ref.current) ref.current.value = ''
    }
  }

  async function sendDoc() {
    if (!frontUrl && !backUrl) { toast.error('Subí al menos una imagen del DNI'); return }
    setSendingDoc(true)
    try {
      const res = await fetch('/api/profiles/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dni', frontUrl: frontUrl || undefined, backUrl: backUrl || undefined }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      toast.success('Documento enviado a revisión')
      setFrontUrl(''); setBackUrl(''); setFrontName(''); setBackName('')
      load()
    } finally { setSendingDoc(false) }
  }

  async function subscribePro() {
    setSubscribing(true)
    try {
      const res = await fetch('/api/provider/subscription', { method: 'POST' })
      const data = await res.json()
      if (!res.ok) {
        if (data.needsConfig) {
          toast.error('Mercado Pago no configurado en el servidor', { description: 'Agregá MP_ACCESS_TOKEN al archivo .env para suscribirte.' })
        } else {
          toast.error(data.error)
        }
        return
      }
      window.location.href = data.initPoint
    } finally { setSubscribing(false) }
  }

  if (!loaded) return <Loading />

  const rating = me?.provider?.rating ?? 0
  const reviewsCount = me?.provider?.reviewsCount ?? 0

  return (
    <div className="homy-page">
      {/* Encabezado */}
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Identidad del negocio</span>
          <h1 className="homy-page-title mt-1.5">Mi perfil</h1>
          <p className="homy-page-sub">Datos de tu negocio y verificación de identidad.</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto homy-stagger space-y-5">
        {/* plan PRO (suscripción Mercado Pago) */}
        <section className="homy-glass-dark relative overflow-hidden rounded-3xl p-5 text-white sm:p-6">
          <span aria-hidden className="pointer-events-none absolute -right-14 -top-16 size-52 rounded-full bg-[#FFC700]/15 blur-3xl" />
          <div className="relative flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="homy-icon-chip homy-chip-gold size-10 shrink-0 [&_svg]:size-5" aria-hidden><Crown /></span>
              <div>
                <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight">
                  Plan PRO
                  {subscription === 'pro' && (
                    <span className="rounded-full bg-[#FFC700]/20 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-widest text-[#FFC700]">Activo</span>
                  )}
                </h2>
                <p className="text-sm text-slate-300">
                  {subscription === 'pro'
                    ? `Tu negocio muestra el badge PRO${proSince ? ` desde ${new Date(proSince).toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })}` : ''}.`
                    : 'Destacá tu negocio con el badge PRO y prioridad en el motor IA. Suscripción mensual por Mercado Pago.'}
                </p>
              </div>
            </div>
            {subscription === 'free' && (
              <button onClick={subscribePro} disabled={subscribing} className="homy-btn-primary shrink-0 px-5 py-3 text-sm">
                {subscribing ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Crown className="size-4" aria-hidden />}
                Suscribirme al plan PRO
              </button>
            )}
          </div>
        </section>

        {/* tarjeta de identidad del negocio */}
        <section className="homy-glass rounded-3xl p-5 sm:p-6 relative overflow-hidden">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-14 -right-14 size-44 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(0,196,255,0.16) 0%, transparent 70%)' }}
          />
          <div className="relative flex items-center gap-4">
            <UAvatar name={me?.displayName || ''} url={me?.avatarUrl} size={64} />
            <div className="min-w-0 flex-1">
              <p className="font-extrabold text-lg text-[#0A2540] truncate">{me?.provider?.businessName || me?.displayName}</p>
              {me?.provider?.kind && me.provider.kind !== 'multi' && (
                <span className="homy-pill mt-1.5">
                  <span className="homy-pill-dot bg-[#00C4FF]" aria-hidden />
                  {PROVIDER_KINDS.find((k) => k.value === me.provider!.kind)?.label || me.provider.kind}
                </span>
              )}
              <p className="text-sm text-slate-500 truncate">{me?.email}</p>
              <div className="flex items-center gap-2.5 mt-2 flex-wrap">
                <UStars rating={rating} size="text-xs" />
                <span className="text-xs text-slate-500 flex items-center gap-1 tabular-nums">
                  <Star aria-hidden className="size-3 text-[#FFC700] fill-[#FFC700]" />
                  {rating > 0 ? rating.toFixed(1) : '—'} · {reviewsCount} reseña{reviewsCount === 1 ? '' : 's'}
                </span>
                {me?.provider?.cuit && <span className="homy-pill font-mono">CUIT {me.provider.cuit}</span>}
              </div>
            </div>
          </div>
        </section>

        {/* datos del negocio */}
        <form onSubmit={save} className="homy-glass rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="homy-icon-chip homy-chip-blue size-10 shrink-0 [&_svg]:size-5"><Store /></span>
            <h2 className="homy-section-title">Datos del negocio</h2>
          </div>
          <Field label="Nombre del negocio" value={businessName} onChange={setBusinessName} placeholder="Ej: Corralón Central" required />
          <div>
            <label htmlFor="pf-kind" className="text-[13px] font-bold text-[#0A2540]">Tipo de negocio</label>
            <select id="pf-kind" value={kind} onChange={(e) => setKind(e.target.value)}
              className="homy-glass-input mt-1.5 w-full rounded-xl px-4 py-3 min-h-[48px] text-sm font-semibold text-[#0A2540]">
              {PROVIDER_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
            <p className="text-xs text-slate-400 mt-1.5">Definí tu rubro: así los clientes y profesionales te encuentran cuando buscan lo que vendés.</p>
          </div>
          <Field label="CUIT" value={cuit} onChange={setCuit} placeholder="30-12345678-9" mono />
          <div>
            <label htmlFor="pf-desc" className="text-[13px] font-bold text-[#0A2540]">Descripción</label>
            <textarea id="pf-desc" rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
              placeholder="Contá qué vendés, marcas, si hacés entregas, horarios…"
              className="homy-glass-input mt-1.5 w-full rounded-xl px-4 py-3 text-sm resize-none" />
          </div>
          <Field label="Dirección" value={address} onChange={setAddress} placeholder="Calle y número" />
          <Field label="Ciudad" value={city} onChange={setCity} placeholder="Ej: Córdoba" />
          <button type="submit" disabled={busy} className="homy-btn-primary homy-focus w-full min-h-[48px] disabled:opacity-60">
            {busy ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </form>

        {/* documentos */}
        <section className="homy-glass rounded-3xl p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span aria-hidden className="homy-icon-chip homy-chip-mint size-10 shrink-0 [&_svg]:size-5"><ShieldCheck /></span>
            <div className="min-w-0">
              <h2 className="homy-section-title">Documentos</h2>
              <p className="text-sm text-slate-500 mt-0.5">
                Subí tu DNI (frente y reverso) para verificar tu negocio. Queda privado: solo lo ve el equipo de HomIA.
              </p>
            </div>
          </div>

          {docs.length > 0 && (
            <div className="space-y-2 mt-5 mb-4">
              {docs.map((d) => (
                <div key={d.id} className="homy-glass-soft rounded-xl p-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0">
                    {d.frontUrl && <img src={d.frontUrl} alt="DNI frente" className="size-10 rounded-lg object-cover border border-[#0A2540]/10" />}
                    {d.backUrl && <img src={d.backUrl} alt="DNI reverso" className="size-10 rounded-lg object-cover border border-[#0A2540]/10" />}
                    <span className="text-sm font-bold text-[#0A2540]">DNI</span>
                    <span className="text-xs text-slate-400 hidden sm:inline">· {formatDate(d.createdAt)}</span>
                  </div>
                  <StatusBadge status={d.status} label={d.status === 'en_revision' ? 'en revisión' : undefined} />
                </div>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <input ref={frontRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
              onChange={() => uploadSide('front')} aria-label="Subir frente del DNI" />
            <input ref={backRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
              onChange={() => uploadSide('back')} aria-label="Subir reverso del DNI" />
            <button type="button" onClick={() => frontRef.current?.click()} disabled={uploading !== null}
              className="rounded-2xl border-2 border-dashed border-[#0A2540]/15 hover:border-[#1D63B8] hover:bg-[#1D63B8]/5 disabled:opacity-60 p-4 sm:p-5 flex flex-col items-center justify-center gap-2 text-sm font-semibold text-slate-500 transition min-h-[112px]">
              {uploading === 'front'
                ? <Loader2 aria-hidden className="size-5 text-[#00C4FF] animate-spin" />
                : frontUrl ? <CheckCircle2 aria-hidden className="size-5 text-emerald-500" /> : <Upload aria-hidden className="size-5 text-[#1D63B8]" />}
              <span className="truncate max-w-full">{frontName || 'Frente del DNI'}</span>
              <span className="text-xs text-slate-400 font-normal">{frontUrl ? 'Listo para enviar' : 'JPG, PNG o PDF'}</span>
            </button>
            <button type="button" onClick={() => backRef.current?.click()} disabled={uploading !== null}
              className="rounded-2xl border-2 border-dashed border-[#0A2540]/15 hover:border-[#1D63B8] hover:bg-[#1D63B8]/5 disabled:opacity-60 p-4 sm:p-5 flex flex-col items-center justify-center gap-2 text-sm font-semibold text-slate-500 transition min-h-[112px]">
              {uploading === 'back'
                ? <Loader2 aria-hidden className="size-5 text-[#00C4FF] animate-spin" />
                : backUrl ? <CheckCircle2 aria-hidden className="size-5 text-emerald-500" /> : <Upload aria-hidden className="size-5 text-[#1D63B8]" />}
              <span className="truncate max-w-full">{backName || 'Reverso del DNI'}</span>
              <span className="text-xs text-slate-400 font-normal">{backUrl ? 'Listo para enviar' : 'JPG, PNG o PDF'}</span>
            </button>
          </div>

          <button type="button" onClick={sendDoc} disabled={sendingDoc || uploading !== null || (!frontUrl && !backUrl)}
            className="homy-btn-primary homy-focus mt-4 w-full min-h-[48px] disabled:opacity-60">
            {sendingDoc ? 'Enviando…' : 'Enviar documento a revisión'}
          </button>
        </section>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, required, mono }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean; mono?: boolean }) {
  return (
    <div>
      <label className="text-[13px] font-bold text-[#0A2540]">
        {label}{!required && <span className="text-slate-400 font-semibold"> (opcional)</span>}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className={`homy-glass-input mt-1.5 w-full rounded-xl px-4 py-3 min-h-[44px] text-sm ${mono ? 'font-mono tabular-nums' : ''}`} />
    </div>
  )
}
