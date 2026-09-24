'use client'
// Perfil del proveedor — datos del negocio, reputación, plan y acceso a la verificación de identidad
import { useEffect, useState } from 'react'
import { Loading, AvatarUploader, UStars, VerifyBadge } from '@/components/app/ui-bits'
import { formatARS } from '@/lib/format'
import { toast } from 'sonner'
import { useSession } from '@/lib/store'
import { navigate } from '@/lib/router'
import { ShieldCheck, Store, Star, Crown, ArrowRight, Clock, CircleAlert } from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'

type MeUser = {
  email: string
  displayName: string
  avatarUrl?: string | null
  provider: {
    businessName: string; kind?: string; cuit: string | null; description: string | null
    address: string | null; city: string | null; rating: number; reviewsCount: number
    subscription?: string; proSince?: string | null
  } | null
}
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
