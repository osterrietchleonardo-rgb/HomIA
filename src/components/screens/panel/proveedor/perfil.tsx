'use client'
// Perfil del proveedor — datos del negocio, reputación, plan y acceso a la verificación de identidad
import { useEffect, useRef, useState } from 'react'
import { Loading, AvatarUploader, UStars, VerifyBadge } from '@/components/app/ui-bits'
import { SponsorChip } from '@/components/home/sponsors'
import { formatARS } from '@/lib/format'
import { toast } from 'sonner'
import { useSession } from '@/lib/store'
import { navigate } from '@/lib/router'
import { ShieldCheck, Store, Star, Crown, ArrowRight, Clock, CircleAlert, Lock, ImagePlus, Loader2, Megaphone } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DeleteAccountCard } from '@/components/app/delete-account-card'
import { AvisosMailCard } from '@/components/screens/panel/avisos-mail-card'

type MeUser = {
  email: string
  displayName: string
  avatarUrl?: string | null
  provider: {
    businessName: string; kind?: string; cuit: string | null; description: string | null
    address: string | null; city: string | null; rating: number; reviewsCount: number
    subscription?: string; proSince?: string | null
    brandLogoUrl?: string | null; brandTagline?: string | null; brandColor?: string | null
  } | null
}

const TAGLINE_MAX = 60
const HEX_RE = /^#[0-9a-fA-F]{6}$/
type PlanState = {
  plan: 'trial' | 'basic' | 'pro'
  activo: boolean
  trialDaysLeft: number | null
  trialEndsAt: string | null
  esPro: boolean
  etiqueta: string
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

async function readJson(res: Response): Promise<Record<string, any>> {
  try { return await res.json() } catch { return {} }
}

export default function ProviderProfile() {
  const { user, refresh } = useSession()
  const [me, setMe] = useState<MeUser | null>(null)
  const [plan, setPlan] = useState<PlanState | null>(null)
  const [preciosArs, setPreciosArs] = useState<{ basic: number; pro: number } | null>(null)
  const [loaded, setLoaded] = useState(false)

  // formulario del negocio
  const [businessName, setBusinessName] = useState('')
  const [kind, setKind] = useState('multi')
  const [cuit, setCuit] = useState('')
  const [description, setDescription] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [busy, setBusy] = useState(false)

  // marca en la home (Plan PRO)
  const [brandLogoUrl, setBrandLogoUrl] = useState('')
  const [brandTagline, setBrandTagline] = useState('')
  const [brandColor, setBrandColor] = useState('')
  const [logoUploading, setLogoUploading] = useState(false)
  const [brandBusy, setBrandBusy] = useState(false)
  const logoInputRef = useRef<HTMLInputElement>(null)

  async function load() {
    try {
      const [resMe, resPlan] = await Promise.all([fetch('/api/profiles/me'), fetch('/api/provider/plan')])
      const dMe = await readJson(resMe)
      if (resMe.ok) {
        const u: MeUser | null = dMe.user || null
        setMe(u)
        if (u) {
          setBusinessName(u.provider?.businessName || '')
          setKind(u.provider?.kind || 'multi')
          setCuit(u.provider?.cuit || '')
          setDescription(u.provider?.description || '')
          setAddress(u.provider?.address || '')
          setCity(u.provider?.city || '')
          setBrandLogoUrl(u.provider?.brandLogoUrl || '')
          setBrandTagline(u.provider?.brandTagline || '')
          setBrandColor(u.provider?.brandColor || '')
        }
      } else {
        toast.error(dMe.error || 'No pudimos cargar tu perfil')
      }
      if (resPlan.ok) {
        const dPlan = await readJson(resPlan)
        setPlan(dPlan.plan || null)
        setPreciosArs(dPlan.preciosArs || null)
      }
    } catch {
      toast.error('No pudimos conectar. Reintentá')
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
      if (!res.ok) { toast.error((await readJson(res)).error || 'No pudimos guardar los cambios'); return }
      await refresh()
      await load()
      toast.success('Perfil actualizado')
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally { setBusy(false) }
  }

  async function uploadLogo(files: FileList | null) {
    const file = files?.[0]
    if (!file) return
    if (!['image/png', 'image/webp', 'image/jpeg'].includes(file.type)) { toast.error('Subí el logo en PNG, WEBP o JPG'); return }
    setLogoUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('folder', 'marca')
      const res = await fetch('/api/uploads', { method: 'POST', body: fd })
      const d = await readJson(res)
      if (!res.ok || !d.url) { toast.error(d.error || 'No pudimos subir el logo'); return }
      setBrandLogoUrl(String(d.url))
      toast.success('Logo subido. Guardá tu marca para publicarlo en la home')
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setLogoUploading(false)
      if (logoInputRef.current) logoInputRef.current.value = ''
    }
  }

  async function saveBrand(e: React.FormEvent) {
    e.preventDefault()
    if (brandColor && !HEX_RE.test(brandColor)) { toast.error('El color tiene que ser un hex tipo #1D63B8'); return }
    setBrandBusy(true)
    try {
      const res = await fetch('/api/profiles/me', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ brandLogoUrl, brandTagline: brandTagline.trim(), brandColor }),
      })
      if (!res.ok) { toast.error((await readJson(res)).error || 'No pudimos guardar tu marca'); return }
      await load()
      toast.success('Tu marca quedó publicada en la cinta de la home')
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally { setBrandBusy(false) }
  }

  if (!loaded) return <Loading />

  const rating = me?.provider?.rating ?? 0
  const reviewsCount = me?.provider?.reviewsCount ?? 0
  const verificationStatus = user?.verificationStatus || 'none'
  const planLabel = plan ? (plan.plan === 'pro' ? 'PRO' : plan.plan === 'basic' ? 'Básico' : plan.activo ? 'Prueba' : 'Prueba finalizada') : '—'

  return (
    <div className="homy-page">
      {/* Encabezado */}
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Identidad del negocio</span>
          <h1 className="homy-page-title mt-1.5">Mi perfil</h1>
          <p className="homy-page-sub">Datos de tu negocio, plan y verificación de identidad.</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto homy-stagger space-y-5">
        {/* tarjeta de identidad del negocio */}
        <section className="homy-glass rounded-3xl p-5 sm:p-6 relative overflow-hidden">
          <span
            aria-hidden
            className="pointer-events-none absolute -top-14 -right-14 size-44 rounded-full"
            style={{ background: 'radial-gradient(circle, rgba(0,196,255,0.16) 0%, transparent 70%)' }}
          />
          <div className="relative flex items-center gap-4">
            <AvatarUploader
              name={me?.displayName || ''}
              url={me?.avatarUrl}
              size={64}
              onUpload={async (url) => {
                try {
                  const res = await fetch('/api/profiles/me', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ avatarUrl: url }),
                  })
                  if (res.ok) {
                    await load()
                    await refresh()
                    toast.success('Foto actualizada')
                  } else {
                    toast.error('No se pudo guardar la foto')
                  }
                } catch {
                  toast.error('No pudimos conectar. Reintentá')
                }
              }}
            />
            <div className="min-w-0 flex-1">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 font-extrabold text-lg text-[#0A2540]">
                <span className="truncate">{me?.provider?.businessName || me?.displayName}</span>
                <VerifyBadge status={verificationStatus} />
              </p>
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

        {/* tu plan */}
        <section className={`homy-glass rounded-3xl p-5 sm:p-6 ${plan && !plan.activo ? 'ring-2 ring-[#FF5A1F]/40' : ''}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span className="homy-icon-chip homy-chip-gold size-10 shrink-0 [&_svg]:size-5" aria-hidden>
                {plan && !plan.activo ? <CircleAlert /> : plan?.plan === 'trial' ? <Clock /> : <Crown />}
              </span>
              <div className="min-w-0">
                <h2 className="text-lg font-extrabold tracking-tight text-[#0A2540]">Tu plan: {planLabel}</h2>
                <p className="text-sm text-slate-500">
                  {!plan ? 'No pudimos cargar el estado de tu plan.'
                    : plan.plan === 'trial' && plan.activo ? `Te quedan ${plan.trialDaysLeft} día${plan.trialDaysLeft === 1 ? '' : 's'} de prueba gratis. Después: Básico ${formatARS(preciosArs?.basic ?? 50000)}/mes o PRO ${formatARS(preciosArs?.pro ?? 100000)}/mes.`
                      : plan.plan === 'trial' ? 'Tu prueba terminó: elegí un plan para volver a vender.'
                        : plan.esPro ? 'Analítica, tarjeta Recomendado y sponsor en la home activos.'
                          : 'Uso completo de la plataforma. Pasate a PRO para destacarte.'}
                </p>
              </div>
            </div>
            <button onClick={() => navigate('/panel/proveedor/plan')} className="homy-btn-primary shrink-0 min-h-[44px] px-5 text-sm">
              {plan && !plan.activo ? 'Elegí tu plan' : 'Ver mi plan'} <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        </section>

        {/* tu marca en la home (Plan PRO) */}
        {(() => {
          const esProActivo = !!plan && plan.esPro && plan.activo
          const businessLabel = businessName.trim() || me?.provider?.businessName || 'Tu negocio'
          const preview = {
            id: 'preview', href: '#', businessName: businessLabel,
            logoUrl: esProActivo ? (brandLogoUrl || me?.avatarUrl || null) : null,
            tagline: esProActivo ? (brandTagline.trim() || null) : 'Tu frase de marca acá',
            color: esProActivo && HEX_RE.test(brandColor) ? brandColor : null,
            verified: verificationStatus === 'verificado',
          }
          return (
            <section aria-labelledby="pf-brand-title" className={`homy-glass rounded-3xl p-5 sm:p-6 ${esProActivo ? 'ring-1 ring-[#FFC700]/50' : ''}`}>
              <div className="flex items-start gap-3">
                <span aria-hidden className="homy-icon-chip homy-chip-gold size-10 shrink-0 [&_svg]:size-5">{esProActivo ? <Megaphone /> : <Lock />}</span>
                <div className="min-w-0">
                  <h2 id="pf-brand-title" className="homy-section-title flex flex-wrap items-center gap-2">
                    Tu marca en la home
                    <span className="rounded-full bg-gradient-to-r from-[#FFC700] to-[#ffd84d] px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-[#6b4d00]">PRO</span>
                  </h2>
                  <p className="text-sm text-slate-500 mt-0.5">
                    {esProActivo
                      ? 'Tu logo y tu marca pasan en la cinta de sponsors de la home de HomIA. Si dejás el plan PRO, salís de la cinta.'
                      : 'El logo y la marca en la home son parte del plan PRO.'}
                  </p>
                </div>
              </div>

              {/* vista previa: así se ve en la cinta */}
              <div className="mt-4">
                <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Vista previa en la cinta</p>
                <div className={`relative mt-2 overflow-hidden rounded-2xl bg-[#0A2540] px-3 py-4 ${esProActivo ? '' : 'opacity-60 grayscale'}`} aria-hidden>
                  <div className="flex items-center gap-10">
                    <SponsorChip s={preview} showTagline="always" />
                    <span className="hidden sm:block"><SponsorChip s={{ ...preview, id: 'preview-2' }} showTagline="always" /></span>
                  </div>
                </div>
                {esProActivo && <p className="text-xs text-slate-400 mt-1.5">En celulares la cinta muestra logo y nombre; la frase se ve en pantallas grandes.</p>}
              </div>

              {esProActivo ? (
                <form onSubmit={saveBrand} className="mt-4 space-y-4">
                  <div>
                    <span className="text-[13px] font-bold text-[#0A2540]">Logo</span>
                    <div className="mt-1.5 flex flex-wrap items-center gap-3">
                      <span className="grid size-16 shrink-0 place-items-center overflow-hidden rounded-2xl bg-white ring-1 ring-[#0A2540]/10">
                        {brandLogoUrl
                          ? <img src={brandLogoUrl} alt="Tu logo" className="max-h-full max-w-full object-contain p-1.5" />
                          : <ImagePlus className="size-6 text-slate-300" aria-hidden />}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <button type="button" disabled={logoUploading} onClick={() => logoInputRef.current?.click()}
                          className="homy-glass-soft homy-focus min-h-[44px] rounded-full px-4 text-sm font-bold text-[#1D63B8] disabled:opacity-60">
                          {logoUploading ? <><Loader2 className="mr-1.5 inline size-4 animate-spin" aria-hidden />Subiendo…</> : brandLogoUrl ? 'Cambiar logo' : 'Subir logo'}
                        </button>
                        {brandLogoUrl && (
                          <button type="button" onClick={() => setBrandLogoUrl('')} className="homy-focus min-h-[44px] rounded-full px-4 text-sm font-bold text-slate-500 hover:text-[#FF5A1F]">
                            Quitar
                          </button>
                        )}
                      </div>
                      <input ref={logoInputRef} type="file" accept="image/png,image/webp,image/jpeg" className="hidden" aria-label="Subir logo" onChange={(e) => uploadLogo(e.target.files)} />
                    </div>
                    <p className="text-xs text-slate-400 mt-1.5">Recomendado: logo cuadrado o apaisado, PNG o WEBP con fondo transparente, de al menos 256 px. Hasta 8 MB. Sin logo usamos tu foto de perfil.</p>
                  </div>

                  <div>
                    <div className="flex items-baseline justify-between gap-2">
                      <label htmlFor="pf-brand-tagline" className="text-[13px] font-bold text-[#0A2540]">Frase de marca <span className="text-slate-400 font-semibold">(opcional)</span></label>
                      <span className={`text-xs tabular-nums ${brandTagline.length > TAGLINE_MAX ? 'text-[#FF5A1F]' : 'text-slate-400'}`} aria-live="polite">{brandTagline.length}/{TAGLINE_MAX}</span>
                    </div>
                    <input id="pf-brand-tagline" value={brandTagline} maxLength={TAGLINE_MAX} onChange={(e) => setBrandTagline(e.target.value.slice(0, TAGLINE_MAX))}
                      placeholder="Ej: Todo para tu obra, entrega en el día"
                      className="homy-glass-input mt-1.5 w-full rounded-xl px-4 py-3 min-h-[44px] text-sm" />
                  </div>

                  <div>
                    <label htmlFor="pf-brand-color" className="text-[13px] font-bold text-[#0A2540]">Color de marca <span className="text-slate-400 font-semibold">(opcional)</span></label>
                    <div className="mt-1.5 flex flex-wrap items-center gap-2">
                      <input id="pf-brand-color" type="color" value={HEX_RE.test(brandColor) ? brandColor : '#FFC700'} onChange={(e) => setBrandColor(e.target.value.toUpperCase())}
                        className="h-11 w-14 cursor-pointer rounded-xl border-0 bg-transparent p-0.5" aria-label="Elegir color de marca" />
                      <input value={brandColor} onChange={(e) => setBrandColor(e.target.value.trim().slice(0, 7))} placeholder="#1D63B8" aria-label="Color de marca en hex"
                        className="homy-glass-input w-28 rounded-xl px-3 py-2.5 min-h-[44px] font-mono text-sm uppercase" />
                      {brandColor && (
                        <button type="button" onClick={() => setBrandColor('')} className="homy-focus min-h-[44px] rounded-full px-3 text-sm font-bold text-slate-500">Sin color</button>
                      )}
                    </div>
                  </div>

                  <button type="submit" disabled={brandBusy || logoUploading} className="homy-btn-primary homy-focus w-full min-h-[48px] disabled:opacity-60">
                    {brandBusy ? 'Guardando…' : 'Guardar mi marca'}
                  </button>
                </form>
              ) : (
                <div className="mt-4 rounded-2xl bg-[#FFC700]/10 p-4 ring-1 ring-[#FFC700]/35">
                  <p className="text-sm text-[#0A2540]">
                    Con el plan PRO ({formatARS(preciosArs?.pro ?? 100000)}/mes) tu logo y tu marca pasan en la cinta de sponsors de la home, y salís primero como <b>Recomendado</b> en el directorio, el marketplace de materiales y las búsquedas.
                  </p>
                  <button type="button" onClick={() => navigate('/panel/proveedor/plan')} className="homy-btn-primary homy-focus mt-3 min-h-[44px] w-full px-5 text-sm sm:w-auto">
                    Ver plan PRO <ArrowRight className="size-4" aria-hidden />
                  </button>
                </div>
              )}
            </section>
          )
        })()}

        {/* datos del negocio */}
        <form onSubmit={save} className="homy-glass rounded-3xl p-5 sm:p-6 space-y-4">
          <div className="flex items-center gap-3">
            <span aria-hidden className="homy-icon-chip homy-chip-blue size-10 shrink-0 [&_svg]:size-5"><Store /></span>
            <h2 className="homy-section-title">Datos del negocio</h2>
          </div>
          <Field label="Nombre del negocio" value={businessName} onChange={setBusinessName} placeholder="Ej: Corralón Central" required />
          <div>
            <label htmlFor="pf-kind" className="text-[13px] font-bold text-[#0A2540]">Tipo de negocio</label>
            <div className="mt-1.5">
              <Select value={kind} onValueChange={setKind}>
                <SelectTrigger id="pf-kind" className="homy-glass-input w-full rounded-xl px-4 py-3 min-h-[48px] text-sm font-semibold text-[#0A2540] border-none">
                  <SelectValue placeholder="Tipo de negocio" />
                </SelectTrigger>
                <SelectContent>
                  {PROVIDER_KINDS.map((k) => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
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

        {/* verificación de identidad */}
        <section className="homy-glass rounded-3xl p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <span aria-hidden className="homy-icon-chip homy-chip-mint size-10 shrink-0 [&_svg]:size-5"><ShieldCheck /></span>
              <div className="min-w-0">
                <h2 className="homy-section-title flex flex-wrap items-center gap-2">Verificación de identidad <VerifyBadge status={verificationStatus} /></h2>
                <p className="text-sm text-slate-500 mt-0.5">
                  {verificationStatus === 'verificado'
                    ? 'Tu identidad está verificada: el check verde acompaña a tu negocio en todo HomIA.'
                    : 'Subí tu DNI (frente y dorso): la IA lo valida y tu negocio muestra el check verde de confianza.'}
                </p>
              </div>
            </div>
            <button onClick={() => navigate('/panel/proveedor/verificacion')} className={`${verificationStatus === 'verificado' ? 'homy-glass-soft rounded-full font-bold text-[#1D63B8]' : 'homy-btn-primary'} shrink-0 min-h-[44px] px-5 text-sm`}>
              {verificationStatus === 'verificado' ? 'Ver verificación' : 'Verificar ahora'} <ArrowRight className="size-4 inline" aria-hidden />
            </button>
          </div>
        </section>

        <AvisosMailCard role="proveedor" />

        {/* Ley 25.326: derecho de supresión (D19) */}
        <DeleteAccountCard />
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
