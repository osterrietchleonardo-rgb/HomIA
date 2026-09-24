'use client'
// Registro multi-paso HomIA — adapta el flujo por rol (cliente / profesional / proveedor)
// Paso 1: rol · Paso 2: datos personales + cómo nos encontraron · Paso 3: KYC por rol
import { useMemo, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { AuthShell } from '@/components/app/auth-shell'
import { toast } from 'sonner'
import {
  ArrowRight, BadgeCheck, Building2, Check, ChevronLeft, CircleCheck, HardHat,
  House, Loader2, MapPin, ShieldCheck, Sparkles, Store, Upload, UserRound,
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"

type Role = 'cliente' | 'profesional' | 'proveedor'

const HOW_FOUND = [
  { value: 'google', label: 'Google / buscador' },
  { value: 'redes', label: 'Redes sociales' },
  { value: 'recomendacion', label: 'Recomendación de alguien' },
  { value: 'publicidad', label: 'Publicidad' },
  { value: 'otro', label: 'Otro' },
]

const CATEGORY_OPTIONS = [
  { slug: 'plomeria', name: 'Plomería' }, { slug: 'gasistas', name: 'Gas' },
  { slug: 'electricistas', name: 'Electricidad' }, { slug: 'albanileria', name: 'Albañilería' },
  { slug: 'pintura', name: 'Pintura' }, { slug: 'carpinteria', name: 'Carpintería' },
  { slug: 'herreria', name: 'Herrería' }, { slug: 'limpieza', name: 'Limpieza' },
  { slug: 'jardineria', name: 'Jardinería' }, { slug: 'climatizacion', name: 'Climatización' },
  { slug: 'techos', name: 'Techos' }, { slug: 'cerramientos', name: 'Cerramientos' },
]

const ROLE_OPTIONS: { r: Role; icon: typeof House; title: string; desc: string; tone: string }[] = [
  { r: 'cliente', icon: House, title: 'Soy cliente', desc: 'Busco profesionales y publico trabajos para mi casa', tone: 'homy-chip-blue' },
  { r: 'profesional', icon: HardHat, title: 'Soy profesional', desc: 'Oferto trabajos, busco materiales y gestiono mis clientes', tone: 'homy-chip-orange' },
  { r: 'proveedor', icon: Store, title: 'Soy proveedor', desc: 'Vendo materiales y gestiono mi stock y clientes', tone: 'homy-chip-ai' },
]

const STEP_LABELS = ['Perfil', 'Tus datos', 'Verificación']

// Stepper premium: pill con check para pasos completos, activo con gradiente,
// conector que se enciende a medida que avanza el wizard.
function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <nav aria-label="Progreso del registro" className="mb-7">
      <ol className="flex items-center">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as 1 | 2 | 3
          const done = step > n
          const active = step === n
          return (
            <li key={label} className={`flex items-center ${n < STEP_LABELS.length ? 'flex-1' : ''}`}>
              <span
                aria-current={active ? 'step' : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-2.5 text-[12.5px] font-extrabold transition-all duration-300 sm:gap-2 sm:pl-2 sm:pr-4 ${
                  done
                    ? 'homy-glass-soft text-[#1D63B8]'
                    : active
                      ? 'bg-gradient-to-r from-[#1D63B8] to-[#2b8fe0] text-white shadow-[0_12px_26px_-12px_rgba(29,99,184,0.75)]'
                      : 'homy-glass-soft text-slate-400'
                }`}
              >
                <span
                  className={`grid size-6 place-items-center rounded-full text-[11px] ${
                    done ? 'bg-[#1D63B8]/12 text-[#1D63B8]' : active ? 'bg-white/25 text-white' : 'bg-navy/8 text-slate-400'
                  }`}
                >
                  {done ? <Check className="size-3.5" aria-hidden /> : n}
                </span>
                <span className="hidden uppercase tracking-wide sm:inline">{label}</span>
              </span>
              {n < 3 && (
                <span
                  aria-hidden
                  className={`mx-2 h-0.5 flex-1 rounded-full transition-colors duration-500 sm:mx-3 ${
                    step > n ? 'bg-gradient-to-r from-[#1D63B8] to-[#00C4FF]' : 'bg-navy/10'
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-2.5 text-center text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-400 sm:hidden">
        Paso {step} de 3 · {STEP_LABELS[step - 1]}
      </p>
    </nav>
  )
}

export default function RegisterScreen() {
  const route = useRoute()
  const { refresh } = useSession()
  const location = useLocation()

  const initialRole = (['cliente', 'profesional', 'proveedor'] as const).includes(route.query.rol as Role)
    ? (route.query.rol as Role) : null

  const [step, setStep] = useState<1 | 2 | 3>(initialRole ? 2 : 1)
  const [role, setRole] = useState<Role | null>(initialRole)
  const [alsoPro, setAlsoPro] = useState(false) // profesional también puede contratar → rol cliente incluido
  const [busy, setBusy] = useState(false)

  // datos personales
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [phone, setPhone] = useState('')
  const [birthday, setBirthday] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [howFoundUs, setHowFoundUs] = useState('')
  const [dniFront, setDniFront] = useState<string | null>(null)
  const [dniBack, setDniBack] = useState<string | null>(null)

  // profesional
  const [personType, setPersonType] = useState<'persona' | 'empresa'>('persona')
  const [professions, setProfessions] = useState<string[]>([])
  const [skills, setSkills] = useState('')
  const [experienceYears, setExperienceYears] = useState('0')
  const [bio, setBio] = useState('')
  const [dniCuil, setDniCuil] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyCuit, setCompanyCuit] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [employeesCount, setEmployeesCount] = useState('')
  const [serviceRadiusKm, setServiceRadiusKm] = useState('15')

  // proveedor
  const [businessName, setBusinessName] = useState('')
  const [cuit, setCuit] = useState('')
  const [description, setDescription] = useState('')

  const roleOpt = role ? ROLE_OPTIONS.find((o) => o.r === role) : null

  const roles = useMemo(() => {
    const r = ['cliente']
    if (role === 'profesional') r.push('profesional')
    if (role === 'proveedor') r.push('proveedor')
    return r
  }, [role])

  async function uploadFile(file: File, folder: string): Promise<string | null> {
    const fd = new FormData()
    fd.append('file', file)
    fd.append('folder', folder)
    const res = await fetch('/api/uploads', { method: 'POST', body: fd })
    if (!res.ok) return null
    const data = await res.json()
    return data.url
  }

  async function submit() {
    if (!role) return
    if (!displayName || !email || !password) {
      toast.error('Completá nombre, email y contraseña')
      return
    }
    if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
      toast.error('La contraseña necesita al menos 8 caracteres, con letras y números')
      return
    }
    if (role === 'profesional' && professions.length === 0) {
      toast.error('Elegí al menos una profesión')
      return
    }
    if (role === 'proveedor' && !businessName) {
      toast.error('El nombre del negocio es obligatorio')
      return
    }
    setBusy(true)
    try {
      // el DNI se sube DESPUÉS de crear la cuenta (la subida exige sesión)
      const inputFront = document.getElementById('dni-front') as HTMLInputElement | null
      const inputBack = document.getElementById('dni-back') as HTMLInputElement | null
      const dniFrontFile = inputFront?.files?.[0] || null
      const dniBackFile = inputBack?.files?.[0] || null

      const rolesPayload = [...roles]
      // un profesional también puede contratar a otros: rol cliente incluido
      if (role === 'profesional' && alsoPro && !rolesPayload.includes('cliente')) {
        // 'cliente' ya está
      }

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email, password, displayName,
          roles: rolesPayload,
          howFoundUs, phone, birthday, address, city,
          lat: location.lat || undefined, lng: location.lng || undefined,
          personType, professions, skills: skills.split(',').map((s) => s.trim()).filter(Boolean),
          experienceYears: parseInt(experienceYears) || 0, bio, dniCuil,
          companyName, companyCuit, companyWebsite, employeesCount: employeesCount ? parseInt(employeesCount) : undefined,
          serviceRadiusKm: parseFloat(serviceRadiusKm) || 15,
          businessName, cuit, description,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        toast.error(data.error || 'No pudimos crear tu cuenta')
        return
      }
      // DNI (opcional): ya con sesión, subir las 2 fotos al bucket privado y
      // mandarlas a la verificación con IA. Si algo falla, se sigue igual.
      if (dniFrontFile && dniBackFile) {
        try {
          const frontUrl = await uploadFile(dniFrontFile, 'dni')
          const backUrl = await uploadFile(dniBackFile, 'dni')
          if (!frontUrl || !backUrl) throw new Error('upload')
          const ver = await fetch('/api/verification/dni', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frontUrl, backUrl }),
          })
          if (!ver.ok) throw new Error('verification')
        } catch {
          toast('Podés verificar tu DNI después desde tu perfil')
        }
      } else if (dniFrontFile || dniBackFile) {
        toast('Faltó una de las dos fotos del DNI: podés verificarlo después desde tu perfil')
      }
      if (location.shared) syncLocationToServer(location.lat!, location.lng!, location.radiusKm)
      await refresh()
      toast.success('¡Bienvenido a HomIA!')
      // ?volver=: vuelve a donde estaba (ej. el carrito del visitante, que se fusiona al entrar);
      // solo rutas internas de la app (nunca una URL externa)
      const volver = route.query.volver || ''
      if (volver.startsWith('/') && !volver.startsWith('//')) {
        navigate(volver, { replace: true })
        return
      }
      navigate(`/panel/${rolesPayload.includes('proveedor') ? 'proveedor' : rolesPayload.includes('profesional') ? 'profesional' : 'cliente'}`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <AuthShell
      homyState={busy ? 'thinking' : 'happy'}
      headline={
        <>
          Una cuenta, <span className="homy-gradient-text">todo tu ecosistema</span> del hogar.
        </>
      }
      sub="Clientes, profesionales y proveedores en una sola red: trabajos, materiales, pagos y reputación 360°."
    >
      <StepDots step={step} />

      {step === 1 && (
        <section className="homy-glass-strong homy-stagger rounded-[28px] p-6 sm:p-8">
          <header className="text-center">
            <span className="homy-eyebrow">Registro · Paso 1 de 3</span>
            <h1 className="mt-2 text-[1.9rem] font-extrabold leading-[1.15] tracking-tight text-navy">¿Cómo vas a usar HomIA?</h1>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">Elegí tu perfil principal (después podés sumar otros).</p>
          </header>
          <div className="mt-7 grid gap-3.5">
            {ROLE_OPTIONS.map((opt) => {
              const selected = role === opt.r
              return (
                <button
                  key={opt.r}
                  onClick={() => { setRole(opt.r); setStep(2) }}
                  aria-label={`Elegir perfil: ${opt.title}`}
                  className={`group relative flex items-center gap-4 rounded-2xl border-2 bg-white/60 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 ${
                    selected
                      ? 'border-[#1D63B8] shadow-[0_16px_36px_-18px_rgba(29,99,184,0.55)]'
                      : 'border-navy/10 hover:border-[#1D63B8]/50 hover:shadow-[0_12px_30px_-18px_rgba(10,37,64,0.35)]'
                  }`}
                >
                  {selected && (
                    <span aria-hidden className="pointer-events-none absolute inset-0 rounded-2xl bg-gradient-to-r from-[#1D63B8]/6 to-[#00C4FF]/5" />
                  )}
                  <span className={`homy-icon-chip size-12 shrink-0 ${opt.tone} transition-transform duration-300 group-hover:scale-105`}>
                    <opt.icon className="size-6" aria-hidden />
                  </span>
                  <span className="relative min-w-0">
                    <span className="block font-extrabold tracking-tight text-navy">{opt.title}</span>
                    <span className="mt-0.5 block text-[13.5px] leading-snug text-slate-500">{opt.desc}</span>
                  </span>
                  <span className="relative ml-auto grid size-6 shrink-0 place-items-center">
                    {selected ? (
                      <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-[#1D63B8] to-[#2b8fe0] text-white shadow-[0_6px_14px_-6px_rgba(29,99,184,0.8)]">
                        <Check className="size-3.5" aria-hidden />
                      </span>
                    ) : (
                      <ArrowRight className="size-5 text-slate-300 transition-all duration-300 group-hover:translate-x-1 group-hover:text-[#1D63B8]" aria-hidden />
                    )}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
            Podés combinar perfiles con la misma cuenta (ej.: profesional que además contrata otros profesionales).
          </p>
        </section>
      )}

      {step === 2 && role && (
        <section className="homy-glass-strong homy-stagger rounded-[28px] p-6 sm:p-8">
          <button
            onClick={() => setStep(1)}
            className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-slate-500 transition-colors duration-300 hover:bg-navy/5 hover:text-[#1D63B8]"
          >
            <ChevronLeft className="size-4" aria-hidden /> Cambiar perfil
          </button>
          <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div>
              <span className="homy-eyebrow">Registro · Paso 2 de 3</span>
              <h1 className="mt-1.5 text-[1.9rem] font-extrabold leading-[1.15] tracking-tight text-navy">Tus datos</h1>
            </div>
            {roleOpt && (
              <span className="homy-pill">
                <roleOpt.icon className="size-3.5" aria-hidden />
                {roleOpt.title}
              </span>
            )}
          </header>

          <div className="mt-6 grid gap-4 sm:grid-cols-2">
            <Field label="Nombre y apellido (o negocio)" required value={displayName} onChange={setDisplayName} placeholder="Juan Pérez" />
            <Field label="Email" required type="email" value={email} onChange={setEmail} placeholder="tu@email.com" />
            <Field label="Contraseña" required type="password" value={password} onChange={setPassword} placeholder="Mínimo 8 caracteres, con letras y números" />
            <Field label="Celular" value={phone} onChange={setPhone} placeholder="+54 9 11 …" />
            <Field label="Fecha de nacimiento" type="date" value={birthday} onChange={setBirthday} />
            <Field label="Dirección" value={address} onChange={setAddress} placeholder="Calle y número" />
            <Field label="Ciudad / localidad" value={city} onChange={setCity} placeholder="Ej.: CABA" />
            <div>
              <label className="block text-sm font-semibold text-navy">
                ¿Cómo nos encontraste?
                <div className="mt-1.5">
                  <Select value={howFoundUs} onValueChange={setHowFoundUs}>
                    <SelectTrigger className="homy-glass-input w-full rounded-xl px-4 py-2.5 text-[15px] outline-none border-none">
                      <SelectValue placeholder="Elegí una opción…" />
                    </SelectTrigger>
                    <SelectContent>
                      {HOW_FOUND.map((h) => <SelectItem key={h.value} value={h.value}>{h.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              </label>
            </div>
          </div>

          <div className="homy-glass-soft mt-5 rounded-2xl p-4">
            <div className="flex items-start gap-3">
              <span className="homy-icon-chip homy-chip-ai size-10 shrink-0 !rounded-xl">
                <MapPin className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-navy">Ubicación</p>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">Con tu ubicación vemos pines cercanos en el mapa y filtramos por distancia. Podés activarla después también.</p>
                {!location.shared ? (
                  <button
                    type="button" onClick={() => location.request()}
                    className="mt-2 inline-flex min-h-11 items-center gap-1.5 rounded-lg text-sm font-bold text-[#1D63B8] transition-colors duration-300 hover:text-[#2b8fe0] hover:underline underline-offset-2"
                  >
                    {location.requesting ? (<><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Pidiendo permiso…</>) : 'Compartir mi ubicación'}
                  </button>
                ) : (
                  <p className="mt-2 inline-flex items-center gap-1.5 text-sm font-bold text-[#0e9f6e]">
                    <CircleCheck className="size-4" aria-hidden /> Ubicación lista
                  </p>
                )}
                {location.error && <p className="mt-1 text-xs font-semibold text-red-500">{location.error}</p>}
              </div>
            </div>
          </div>

          <button
            onClick={() => setStep(3)}
            disabled={!displayName || !email || !password}
            className="homy-btn-dark mt-6 w-full py-3.5 text-[15px]"
          >
            Continuar
            <ArrowRight className="size-4.5" aria-hidden />
          </button>
        </section>
      )}

      {step === 3 && role && (
        <section className="homy-glass-strong homy-stagger rounded-[28px] p-6 sm:p-8">
          <button
            onClick={() => setStep(2)}
            className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-slate-500 transition-colors duration-300 hover:bg-navy/5 hover:text-[#1D63B8]"
          >
            <ChevronLeft className="size-4" aria-hidden /> Volver
          </button>
          <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div>
              <span className="homy-eyebrow">Registro · Paso 3 de 3</span>
              <h1 className="mt-1.5 text-[1.9rem] font-extrabold leading-[1.15] tracking-tight text-navy">
                {role === 'cliente' && 'Últimos detalles'}
                {role === 'profesional' && 'Tu perfil profesional'}
                {role === 'proveedor' && 'Tu negocio'}
              </h1>
            </div>
            {roleOpt && (
              <span className="homy-pill">
                <roleOpt.icon className="size-3.5" aria-hidden />
                {roleOpt.title}
              </span>
            )}
          </header>

          {/* DNI (todos los roles) */}
          <section className="mt-6">
            <div className="flex items-start gap-3">
              <span className="homy-icon-chip homy-chip-blue size-10 shrink-0 !rounded-xl">
                <BadgeCheck className="size-5" aria-hidden />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-navy">Documento de identidad (DNI)</p>
                <p className="mt-0.5 flex items-start gap-1 text-xs leading-relaxed text-slate-500">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#1D63B8]" aria-hidden />
                  Frente y reverso — queda privado, solo lo ve HomIA para verificar tu cuenta.
                </p>
              </div>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <UploadBox id="dni-front" label="Frente" uploaded={dniFront} onPick={(f) => setDniFront(f ? f.name : null)} />
              <UploadBox id="dni-back" label="Reverso" uploaded={dniBack} onPick={(f) => setDniBack(f ? f.name : null)} />
            </div>
          </section>

          {role === 'profesional' && (
            <div className="mt-6 grid gap-4">
              <div className="homy-glass-soft grid grid-cols-2 gap-1.5 rounded-2xl p-1.5">
                {([
                  { t: 'persona' as const, icon: UserRound, label: 'Persona única' },
                  { t: 'empresa' as const, icon: Building2, label: 'Empresa' },
                ]).map((o) => (
                  <button
                    key={o.t} type="button" onClick={() => setPersonType(o.t)} aria-pressed={personType === o.t}
                    className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                      personType === o.t
                        ? 'bg-white text-navy shadow-[0_6px_16px_-8px_rgba(10,37,64,0.4)]'
                        : 'text-slate-500 hover:text-navy'
                    }`}
                  >
                    <o.icon className="size-4.5" aria-hidden /> {o.label}
                  </button>
                ))}
              </div>
              <div>
                <p className="text-sm font-semibold text-navy">Profesiones / rubros <span className="text-action" aria-hidden>*</span></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((c) => {
                    const on = professions.includes(c.slug)
                    return (
                      <button
                        key={c.slug} type="button" aria-pressed={on}
                        onClick={() => setProfessions((p) => p.includes(c.slug) ? p.filter((x) => x !== c.slug) : [...p, c.slug])}
                        className={`inline-flex min-h-11 items-center rounded-full border px-3.5 text-[13px] font-bold transition-all duration-300 active:scale-[0.97] ${
                          on
                            ? 'border-transparent bg-gradient-to-r from-[#1D63B8] to-[#2b8fe0] text-white shadow-[0_8px_18px_-8px_rgba(29,99,184,0.7)]'
                            : 'border-navy/15 text-slate-600 hover:border-[#1D63B8]/60 hover:text-[#1D63B8]'
                        }`}
                      >
                        {on && <Check className="mr-1.5 size-3.5" aria-hidden />}{c.name}
                      </button>
                    )
                  })}
                </div>
              </div>
              <Field label="Habilidades (separadas por coma)" value={skills} onChange={setSkills} placeholder="instalación de termos, destapaciones, plomería general" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Años de experiencia" type="number" value={experienceYears} onChange={setExperienceYears} />
                <Field label={personType === 'empresa' ? 'CUIT empresa' : 'DNI o CUIL'} value={personType === 'empresa' ? companyCuit : dniCuil} onChange={personType === 'empresa' ? setCompanyCuit : setDniCuil} />
              </div>
              {personType === 'empresa' && (
                <div className="homy-glass-soft grid gap-4 rounded-2xl p-4 sm:grid-cols-2">
                  <Field label="Razón social" value={companyName} onChange={setCompanyName} />
                  <Field label="Sitio web / Instagram" value={companyWebsite} onChange={setCompanyWebsite} />
                  <Field label="Cantidad de empleados" type="number" value={employeesCount} onChange={setEmployeesCount} />
                </div>
              )}
              <div>
                <label className="block text-sm font-semibold text-navy">
                  Sobre vos / tu trabajo
                  <textarea
                    value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
                    placeholder="Contá tu experiencia, trabajos realizados, certificaciones…"
                    className="homy-glass-input mt-1.5 w-full resize-none rounded-xl px-4 py-2.5 text-[15px] outline-none"
                  />
                </label>
              </div>
              <div>
                <label htmlFor="service-radius" className="text-sm font-semibold text-navy">Radio de servicio: {serviceRadiusKm} km</label>
                <input
                  id="service-radius"
                  type="range" min="1" max="100" value={serviceRadiusKm}
                  onChange={(e) => setServiceRadiusKm(e.target.value)}
                  className="homy-range mt-2.5 w-full"
                  style={{ ['--range-progress' as string]: `${(parseInt(serviceRadiusKm) / 100) * 100}%` }}
                  aria-label="Radio de servicio en kilómetros"
                />
              </div>
              <label className="homy-glass-soft flex cursor-pointer items-start gap-3 rounded-2xl p-4 text-sm leading-relaxed text-slate-600">
                <input type="checkbox" checked={alsoPro} onChange={(e) => setAlsoPro(e.target.checked)} className="mt-0.5 size-4.5 shrink-0 accent-[#1D63B8]" />
                <span>También quiero <b>contratar otros profesionales</b> (subcontratar, equipos, cuentas de retiro compartidas).</span>
              </label>
            </div>
          )}

          {role === 'proveedor' && (
            <div className="mt-6 grid gap-4">
              <div className="flex items-start gap-3 rounded-2xl border border-[#FFC700]/45 bg-gradient-to-br from-[#FFC700]/12 to-[#FFC700]/4 p-4">
                <span className="homy-icon-chip homy-chip-gold size-10 shrink-0 !rounded-xl" aria-hidden>
                  <Sparkles className="size-5" />
                </span>
                <p className="text-sm leading-relaxed text-slate-600">
                  <b className="text-[#0A2540]">14 días gratis para probar.</b> Después: Básico <b>$50.000/mes</b> o PRO <b>$100.000/mes</b>. Cancelás cuando quieras.
                </p>
              </div>
              <Field label="Nombre del local o negocio *" value={businessName} onChange={setBusinessName} placeholder="Ferretería El Tornillo" />
              <Field label="CUIT" value={cuit} onChange={setCuit} placeholder="30-12345678-9" />
              <div>
                <label className="block text-sm font-semibold text-navy">
                  Sobre el negocio
                  <textarea
                    value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
                    placeholder="Qué vendés, horarios, si hacés entregas…"
                    className="homy-glass-input mt-1.5 w-full resize-none rounded-xl px-4 py-2.5 text-[15px] outline-none"
                  />
                </label>
              </div>
            </div>
          )}

          {role === 'cliente' && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-action/25 bg-gradient-to-br from-action/8 to-action/3 p-4">
              <span className="homy-icon-chip homy-chip-orange size-10 shrink-0 !rounded-xl">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <p className="text-sm leading-relaxed text-slate-600">
                ¡Listo! Con tu cuenta vas a poder buscar profesionales en el mapa, publicar trabajos, recibir presupuestos, aprobar materiales y pagar con Mercado Pago.
              </p>
            </div>
          )}

          <button onClick={submit} disabled={busy} className="homy-btn-primary mt-7 w-full py-3.5 text-[15px]">
            {busy ? (
              <>
                <Loader2 className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden />
                Creando tu cuenta…
              </>
            ) : (
              'Crear mi cuenta'
            )}
          </button>
          <p className="mt-3.5 text-center text-xs leading-relaxed text-slate-400">Al crear la cuenta aceptás nuestros términos. Tus documentos quedan privados.</p>
        </section>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        ¿Ya tenés cuenta?{' '}
        <button onClick={() => navigate('/ingresar')} className="rounded font-bold text-[#1D63B8] underline-offset-2 transition-colors duration-300 hover:text-[#2b8fe0] hover:underline">Ingresá</button>
      </p>
    </AuthShell>
  )
}

function Field({
  label, value, onChange, type = 'text', placeholder, required, min, max,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type?: string
  placeholder?: string
  required?: boolean
  min?: string
  max?: string
}) {
  return (
    <label className="block text-sm font-semibold text-navy">
      {label} {required && <span className="text-action" aria-hidden>*</span>}
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} min={min} max={max} required={required}
        className="homy-glass-input mt-1.5 w-full rounded-xl px-4 py-2.5 text-[15px] outline-none"
      />
    </label>
  )
}

function UploadBox({ id, label, uploaded, onPick }: { id: string; label: string; uploaded: string | null; onPick?: (file: File | null) => void }) {
  const [name, setName] = useState<string | null>(null)
  return (
    <label
      htmlFor={id}
      className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-navy/15 bg-white/50 px-3 py-5 text-center transition-all duration-300 hover:border-[#1D63B8] hover:bg-[#1D63B8]/5"
    >
      <span className={`homy-icon-chip size-9 !rounded-xl transition-transform duration-300 group-hover:scale-105 ${uploaded ? 'homy-chip-mint' : 'homy-chip-blue'}`}>
        {uploaded ? <CircleCheck className="size-4.5" aria-hidden /> : <Upload className="size-4.5" aria-hidden />}
      </span>
      <span className="mt-1.5 text-sm font-extrabold text-navy">DNI {label}</span>
      <span className={`mt-0.5 text-xs font-semibold ${uploaded ? 'text-[#0e9f6e]' : 'text-slate-400'}`}>
        {uploaded ? 'Listo' : name ? name : 'JPG, PNG o WEBP'}
      </span>
      <input
        id={id} type="file" accept="image/*" className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0] || null
          setName(f?.name || null)
          onPick?.(f)
        }}
      />
    </label>
  )
}
