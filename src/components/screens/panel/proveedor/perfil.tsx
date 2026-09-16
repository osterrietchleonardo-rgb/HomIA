'use client'
// Perfil del proveedor — datos del negocio, reputación y documentos (DNI frente/reverso)
import { useEffect, useRef, useState } from 'react'
import { PageHeader, StatusBadge, Loading, UAvatar, UStars } from '@/components/app/ui-bits'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { useSession } from '@/lib/store'
import { Upload, ShieldCheck, Store, Star, CheckCircle2, Loader2 } from 'lucide-react'

type Doc = { id: string; type: string; frontUrl: string | null; backUrl: string | null; status: string; createdAt: string }

type MeUser = {
  email: string
  displayName: string
  avatarUrl?: string | null
  provider: {
    businessName: string; cuit: string | null; description: string | null
    address: string | null; city: string | null; rating: number; reviewsCount: number
  } | null
  documents: Doc[]
}

export default function ProviderProfile() {
  const { refresh } = useSession()
  const [me, setMe] = useState<MeUser | null>(null)
  const [loaded, setLoaded] = useState(false)

  // formulario del negocio
  const [businessName, setBusinessName] = useState('')
  const [cuit, setCuit] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [busy, setBusy] = useState(false)

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
        setCuit(u.provider?.cuit || '')
        setDescription(u.provider?.description || '')
        setAddress(u.provider?.address || '')
        setCity(u.provider?.city || '')
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
        body: JSON.stringify({ businessName: businessName.trim(), cuit: cuit.trim(), description: description.trim(), address: address.trim(), city: city.trim() }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      await refresh()
      toast.success('Perfil actualizado ✓')
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
      toast.success(side === 'front' ? 'Frente subido ✓' : 'Reverso subido ✓')
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
      toast.success('Documento enviado a revisión ✓')
      setFrontUrl(''); setBackUrl(''); setFrontName(''); setBackName('')
      load()
    } finally { setSendingDoc(false) }
  }

  if (!loaded) return <Loading />

  const rating = me?.provider?.rating ?? 0
  const reviewsCount = me?.provider?.reviewsCount ?? 0

  return (
    <div className="max-w-xl">
      <PageHeader title="Mi perfil" subtitle="Datos de tu negocio y verificación de identidad" />

      {/* encabezado con reputación */}
      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6 mb-5">
        <div className="flex items-center gap-4">
          <UAvatar name={me?.displayName || ''} url={me?.avatarUrl} size={60} />
          <div className="min-w-0">
            <p className="font-extrabold text-[#0A2540] truncate">{me?.provider?.businessName || me?.displayName}</p>
            <p className="text-sm text-slate-500 truncate">{me?.email}</p>
            <div className="flex items-center gap-2 mt-1">
              <UStars rating={rating} />
              <span className="text-xs text-slate-500 flex items-center gap-1">
                <Star className="size-3 text-[#FFC700] fill-[#FFC700]" />
                {rating > 0 ? rating.toFixed(1) : '—'} · {reviewsCount} reseña{reviewsCount === 1 ? '' : 's'}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* datos del negocio */}
      <form onSubmit={save} className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6 space-y-4 mb-5">
        <h2 className="font-extrabold text-[#0A2540] flex items-center gap-2"><Store className="size-5 text-[#1D63B8]" /> Datos del negocio</h2>
        <Field label="Nombre del negocio" value={businessName} onChange={setBusinessName} placeholder="Ej: Corralón Central" required />
        <Field label="CUIT" value={cuit} onChange={setCuit} placeholder="30-12345678-9" />
        <div>
          <label className="text-sm font-semibold text-[#0A2540]">Descripción</label>
          <textarea rows={4} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Contá qué vendés, marcas, si hacés entregas, horarios…"
            className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#1D63B8] focus:ring-2 focus:ring-[#1D63B8]/20 resize-none" />
        </div>
        <Field label="Dirección" value={address} onChange={setAddress} placeholder="Calle y número" />
        <Field label="Ciudad" value={city} onChange={setCity} placeholder="Ej: Córdoba" />
        <button type="submit" disabled={busy}
          className="w-full rounded-xl bg-[#0A2540] hover:bg-[#123455] disabled:opacity-60 text-white font-bold py-3.5 transition">
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </form>

      {/* documentos */}
      <div className="rounded-3xl bg-white border border-slate-200 shadow-sm p-6">
        <h2 className="font-extrabold text-[#0A2540] flex items-center gap-2"><ShieldCheck className="size-5 text-[#1D63B8]" /> Documentos</h2>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Subí tu DNI (frente y reverso) para verificar tu negocio. Queda privado: solo lo ve el equipo de HomIA.
        </p>

        {docs.length > 0 && (
          <div className="space-y-2 mb-4">
            {docs.map((d) => (
              <div key={d.id} className="rounded-xl border border-slate-200 p-3 flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 min-w-0">
                  {d.frontUrl && <img src={d.frontUrl} alt="DNI frente" className="size-10 rounded-lg object-cover border border-slate-200" />}
                  {d.backUrl && <img src={d.backUrl} alt="DNI reverso" className="size-10 rounded-lg object-cover border border-slate-200" />}
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
            className="rounded-2xl border-2 border-dashed border-slate-300 hover:border-[#1D63B8] hover:bg-[#1D63B8]/5 disabled:opacity-60 p-5 flex flex-col items-center gap-2 text-sm font-semibold text-slate-500 transition">
            {uploading === 'front'
              ? <Loader2 className="size-5 text-[#00C4FF] animate-spin" />
              : frontUrl ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Upload className="size-5 text-[#1D63B8]" />}
            <span className="truncate max-w-full">{frontName || 'Frente del DNI'}</span>
            <span className="text-xs text-slate-400 font-normal">{frontUrl ? 'Listo para enviar' : 'JPG, PNG o PDF'}</span>
          </button>
          <button type="button" onClick={() => backRef.current?.click()} disabled={uploading !== null}
            className="rounded-2xl border-2 border-dashed border-slate-300 hover:border-[#1D63B8] hover:bg-[#1D63B8]/5 disabled:opacity-60 p-5 flex flex-col items-center gap-2 text-sm font-semibold text-slate-500 transition">
            {uploading === 'back'
              ? <Loader2 className="size-5 text-[#00C4FF] animate-spin" />
              : backUrl ? <CheckCircle2 className="size-5 text-emerald-500" /> : <Upload className="size-5 text-[#1D63B8]" />}
            <span className="truncate max-w-full">{backName || 'Reverso del DNI'}</span>
            <span className="text-xs text-slate-400 font-normal">{backUrl ? 'Listo para enviar' : 'JPG, PNG o PDF'}</span>
          </button>
        </div>

        <button type="button" onClick={sendDoc} disabled={sendingDoc || uploading !== null || (!frontUrl && !backUrl)}
          className="mt-4 w-full rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] disabled:opacity-60 text-white font-bold py-3 transition">
          {sendingDoc ? 'Enviando…' : 'Enviar documento a revisión'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, required }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; required?: boolean }) {
  return (
    <div>
      <label className="text-sm font-semibold text-[#0A2540]">
        {label}{!required && <span className="text-slate-400 font-normal"> (opcional)</span>}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none focus:border-[#1D63B8] focus:ring-2 focus:ring-[#1D63B8]/20" />
    </div>
  )
}
