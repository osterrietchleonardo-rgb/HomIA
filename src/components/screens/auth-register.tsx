'use client'
// Registro multi-paso HomIA — adapta el flujo por rol (cliente / profesional / proveedor)
// Paso 1: rol · Paso 2: datos personales + cómo nos encontraron · Paso 3: KYC por rol
import { useMemo, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { AuthShell } from '@/components/app/auth-shell'
import { toast } from 'sonner'
import {
  BadgeCheck, Building2, Check, ChevronLeft, CircleCheck, HardHat,
  House, MapPin, Store, Upload, UserRound,
} from 'lucide-react'

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

function StepDots({ step }: { step: 1 | 2 | 3 }) {
  return (
    <ol className="mb-7 flex items-center justify-center gap-0" aria-label="Progreso del registro">
      {STEP_LABELS.map((label, i) => {
        const n = (i + 1) as 1 | 2 | 3
        const done = step > n
        const active = step === n
        return (
          <li key={label} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <span
                className={`grid size-8 place-items-center rounded-full border text-[13px] font-bold transition-all duration-300 ${
                  done
                    ? 'border-transparent bg-gradient-to-br from-[#1D63B8] to-[#00C4FF] text-white'
                    : active
                      ? 'border-[#1D63B8] bg-white text-[#1D63B8] shadow-[0_0_0_4px_rgba(29,99,184,0.12)]'
                      : 'border-slate-200 bg-white/70 text-slate-400'
                }`}
                aria-current={active ? 'step' : undefined}
              >
                {done ? <Check className="size-4" aria-hidden /> : n}
              </span>
              <span className={`text-[11px] font-bold uppercase tracking-wide ${active ? 'text-[#1D63B8]' : 'text-slate-400'}`}>
                {label}
              </span>
            </div>
            {n < 3 && (
              <span aria-hidden className={`mx-2.5 mb-5 h-0.5 w-10 rounded-full sm:w-14 ${step > n ? 'bg-gradient-to-r from-[#1D63B8] to-[#00C4FF]' : 'bg-slate-200'}`} />
            )}
          </li>
        )
      })}
    </ol>
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
      // subir DNI si el usuario adjuntó
      let dniFrontUrl: string | null = null
      let dniBackUrl: string | null = null
      const inputFront = document.getElementById('dni-front') as HTMLInputElement | null
      const inputBack = document.getElementById('dni-back') as HTMLInputElement | null
      if (inputFront?.files?.[0]) dniFrontUrl = await uploadFile(inputFront.files[0], 'dni')
      if (inputBack?.files?.[0]) dniBackUrl = await uploadFile(inputBack.files[0], 'dni')

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
      // guardar documentos de identidad si se subieron
      if (dniFrontUrl || dniBackUrl) {
        await fetch('/api/profiles/documents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'dni', frontUrl: dniFrontUrl, backUrl: dniBackUrl }),
        }).catch(() => null)
      }
      if (location.shared) syncLocationToServer(location.lat!, location.lng!, location.radiusKm)
      await refresh()
      toast.success('¡Bienvenido a HomIA!')
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
        <div className="homy-glass-strong rounded-[28px] p-7 sm:p-8">
          <h1 className="text-center text-[1.7rem] font-extrabold tracking-tight text-[#0A2540]">¿Cómo vas a usar HomIA?</h1>
          <p className="mt-1 text-center text-sm text-slate-500">Elegí tu perfil principal (después podés sumar otros).</p>
          <div className="mt-7 grid gap-3.5">
            {ROLE_OPTIONS.map((opt) => (
              <button
                key={opt.r}
                onClick={() => { setRole(opt.r); setStep(2) }}
                aria-label={`Elegir perfil: ${opt.title}`}
                className={`group relative flex items-center gap-4 rounded-2xl border-2 p-4 text-left transition-all duration-300 hover:-translate-y-0.5 ${
                  role === opt.r
                    ? 'border-[#1D63B8] bg-[#1D63B8]/5 shadow-[0_14px_34px_-16px_rgba(29,99,184,0.45)]'
                    : 'border-slate-200/90 hover:border-[#1D63B8]/50 hover:shadow-[0_12px_30px_-18px_rgba(10,37,64,0.35)]'
                }`}
              >
                <span className={`homy-icon-chip size-12 shrink-0 ${opt.tone} transition-transform duration-300 group-hover:scale-105`}>
                  <opt.icon className="size-6" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block font-bold text-[#0A2540]">{opt.title}</span>
                  <span className="mt-0.5 block text-[13.5px] leading-snug text-slate-500">{opt.desc}</span>
                </span>
                <ChevronLeft className="ml-auto size-5 shrink-0 rotate-180 text-slate-300 transition-all duration-300 group-hover:translate-x-0.5 group-hover:text-[#1D63B8]" aria-hidden />
              </button>
            ))}
          </div>
          <p className="mt-6 text-center text-xs leading-relaxed text-slate-400">
            Podés combinar perfiles con la misma cuenta (ej.: profesional que además contrata otros profesionales).
          </p>
        </div>
      )}

      {step === 2 && role && (
        <div className="homy-glass-strong rounded-[28px] p-7 sm:p-8">
          <button onClick={() => setStep(1)} className="mb-4 flex items-center gap-1 text-sm font-semibold text-slate-500 transition-colors hover:text-[#1D63B8]">
            <ChevronLeft className="size-4" /> Cambiar perfil
          </button>
          <h1 className="text-[1.7rem] font-extrabold tracking-tight text-[#0A2540]">Tus datos</h1>
          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field label="Nombre y apellido (o negocio)" required value={displayName} onChange={setDisplayName} placeholder="Juan Pérez" />
            <Field label="Email" required type="email" value={email} onChange={setEmail} placeholder="tu@email.com" />
            <Field label="Contraseña" required type="password" value={password} onChange={setPassword} placeholder="Mínimo 6 caracteres" />
            <Field label="Celular" value={phone} onChange={setPhone} placeholder="+54 9 11 …" />
            <Field label="Fecha de nacimiento" type="date" value={birthday} onChange={setBirthday} />
            <Field label="Dirección" value={address} onChange={setAddress} placeholder="Calle y número" />
            <Field label="Ciudad / localidad" value={city} onChange={setCity} placeholder="Ej.: CABA" />
            <div>
              <label className="text-sm font-semibold text-[#0A2540]">¿Cómo nos encontraste?</label>
              <select value={howFoundUs} onChange={(e) => setHowFoundUs(e.target.value)} className="homy-glass-input mt-1.5 w-full rounded-xl px-4 py-3 text-[15px] outline-none">
                <option value="">Elegí una opción…</option>
                {HOW_FOUND.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
              </select>
            </div>
          </div>

          <div className="mt-5 rounded-2xl border border-[#00C4FF]/30 bg-[#00C4FF]/5 p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-[#0A2540]"><MapPin className="size-4 text-[#0092C4]" /> Ubicación</p>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">Con tu ubicación vemos pines cercanos en el mapa y filtramos por distancia. Podés activarla después también.</p>
            {!location.shared ? (
              <button type="button" onClick={() => location.request()} className="mt-2.5 text-sm font-bold text-[#1D63B8] hover:underline">
                {location.requesting ? 'Pidiendo permiso…' : 'Compartir mi ubicación'}
              </button>
            ) : (
              <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-emerald-600">
                <CircleCheck className="size-4" aria-hidden /> Ubicación lista
              </p>
            )}
            {location.error && <p className="mt-1 text-xs text-red-500">{location.error}</p>}
          </div>

          <button
            onClick={() => setStep(3)}
            disabled={!displayName || !email || !password}
            className="homy-btn-dark mt-6 w-full py-3.5 text-[15px]"
          >
            Continuar
          </button>
        </div>
      )}

      {step === 3 && role && (
        <div className="homy-glass-strong rounded-[28px] p-7 sm:p-8">
          <button onClick={() => setStep(2)} className="mb-4 flex items-center gap-1 text-sm font-semibold text-slate-500 transition-colors hover:text-[#1D63B8]">
            <ChevronLeft className="size-4" /> Volver
          </button>
          <h1 className="text-[1.7rem] font-extrabold tracking-tight text-[#0A2540]">
            {role === 'cliente' && 'Últimos detalles'}
            {role === 'profesional' && 'Tu perfil profesional'}
            {role === 'proveedor' && 'Tu negocio'}
          </h1>

          {/* DNI (todos los roles) */}
          <div className="mt-5">
            <p className="flex items-center gap-2 text-sm font-semibold text-[#0A2540]">
              <BadgeCheck className="size-4 text-[#1D63B8]" aria-hidden /> Documento de identidad (DNI)
            </p>
            <p className="mt-0.5 text-xs text-slate-500">Frente y reverso — queda privado, solo lo ve HomIA para verificar tu cuenta.</p>
            <div className="mt-2.5 grid grid-cols-2 gap-3">
              <UploadBox id="dni-front" label="Frente" uploaded={dniFront} />
              <UploadBox id="dni-back" label="Reverso" uploaded={dniBack} />
            </div>
          </div>

          {role === 'profesional' && (
            <div className="mt-5 grid gap-4">
              <div className="grid grid-cols-2 gap-3">
                {([
                  { t: 'persona' as const, icon: UserRound, label: 'Persona única' },
                  { t: 'empresa' as const, icon: Building2, label: 'Empresa' },
                ]).map((o) => (
                  <button key={o.t} type="button" onClick={() => setPersonType(o.t)}
                    className={`flex items-center justify-center gap-2 rounded-xl border-2 py-3 font-bold transition ${personType === o.t ? 'border-[#1D63B8] bg-[#1D63B8]/5 text-[#0A2540]' : 'border-slate-200 text-slate-500 hover:border-[#1D63B8]/40'}`}>
                    <o.icon className="size-4.5" aria-hidden /> {o.label}
                  </button>
                ))}
              </div>
              <div>
                <label className="text-sm font-semibold text-[#0A2540]">Profesiones / rubros *</label>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((c) => (
                    <button key={c.slug} type="button"
                      onClick={() => setProfessions((p) => p.includes(c.slug) ? p.filter((x) => x !== c.slug) : [...p, c.slug])}
                      className={`rounded-full border px-3 py-1.5 text-[13px] font-semibold transition-all active:scale-[0.97] ${professions.includes(c.slug) ? 'border-transparent bg-gradient-to-r from-[#1D63B8] to-[#2b8fe0] text-white shadow-[0_6px_16px_-8px_rgba(29,99,184,0.6)]' : 'border-slate-300 text-slate-600 hover:border-[#1D63B8]/60'}`}>
                      {professions.includes(c.slug) && <Check className="mr-1 inline size-3" aria-hidden />}{c.name}
                    </button>
                  ))}
                </div>
              </div>
              <Field label="Habilidades (separadas por coma)" value={skills} onChange={setSkills} placeholder="instalación de termos, destapaciones, plomería general" />
              <div className="grid grid-cols-2 gap-4">
                <Field label="Años de experiencia" type="number" value={experienceYears} onChange={setExperienceYears} />
                <Field label={personType === 'empresa' ? 'CUIT empresa' : 'DNI o CUIL'} value={personType === 'empresa' ? companyCuit : dniCuil} onChange={personType === 'empresa' ? setCompanyCuit : setDniCuil} />
              </div>
              {personType === 'empresa' && (
                <div className="grid gap-4 rounded-2xl homy-glass-soft p-4 sm:grid-cols-2">
                  <Field label="Razón social" value={companyName} onChange={setCompanyName} />
                  <Field label="Sitio web / Instagram" value={companyWebsite} onChange={setCompanyWebsite} />
                  <Field label="Cantidad de empleados" type="number" value={employeesCount} onChange={setEmployeesCount} />
                </div>
              )}
              <div>
                <label className="text-sm font-semibold text-[#0A2540]">Sobre vos / tu trabajo</label>
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Contá tu experiencia, trabajos realizados, certificaciones…"
                  className="homy-glass-input mt-1.5 w-full resize-none rounded-xl px-4 py-3 text-[15px] outline-none" />
              </div>
              <div>
                <label className="text-sm font-semibold text-[#0A2540]">Radio de servicio: {serviceRadiusKm} km</label>
                <input
                  type="range" min="1" max="100" value={serviceRadiusKm}
                  onChange={(e) => setServiceRadiusKm(e.target.value)}
                  className="homy-range mt-2.5 w-full"
                  style={{ ['--range-progress' as string]: `${(parseInt(serviceRadiusKm) / 100) * 100}%` }}
                  aria-label="Radio de servicio en kilómetros"
                />
              </div>
              <label className="flex items-start gap-2.5 rounded-xl border border-[#1D63B8]/20 bg-[#1D63B8]/5 p-3.5 text-sm text-slate-600">
                <input type="checkbox" checked={alsoPro} onChange={(e) => setAlsoPro(e.target.checked)} className="mt-0.5 accent-[#1D63B8]" />
                <span>También quiero <b>contratar otros profesionales</b> (subcontratar, equipos, cuentas de retiro compartidas).</span>
              </label>
            </div>
          )}

          {role === 'proveedor' && (
            <div className="mt-5 grid gap-4">
              <Field label="Nombre del local o negocio *" value={businessName} onChange={setBusinessName} placeholder="Ferretería El Tornillo" />
              <Field label="CUIT" value={cuit} onChange={setCuit} placeholder="30-12345678-9" />
              <div>
                <label className="text-sm font-semibold text-[#0A2540]">Sobre el negocio</label>
                <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Qué vendés, horarios, si hacés entregas…"
                  className="homy-glass-input mt-1.5 w-full resize-none rounded-xl px-4 py-3 text-[15px] outline-none" />
              </div>
            </div>
          )}

          {role === 'cliente' && (
            <div className="mt-5 rounded-2xl border border-[#FF5A1F]/20 bg-[#FF5A1F]/5 p-4 text-sm leading-relaxed text-slate-600">
              ¡Listo! Con tu cuenta vas a poder buscar profesionales en el mapa, publicar trabajos, recibir presupuestos, aprobar materiales y pagar con Mercado Pago.
            </div>
          )}

          <button onClick={submit} disabled={busy} className="homy-btn-primary mt-6 w-full py-3.5 text-[15px]">
            {busy ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
          </button>
          <p className="mt-3 text-center text-xs text-slate-400">Al crear la cuenta aceptás nuestros términos. Tus documentos quedan privados.</p>
        </div>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        ¿Ya tenés cuenta?{' '}
        <button onClick={() => navigate('/ingresar')} className="font-bold text-[#1D63B8] hover:underline">Ingresá</button>
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
    <div>
      <label className="text-sm font-semibold text-[#0A2540]">
        {label} {required && <span className="text-[#FF5A1F]">*</span>}
      </label>
      <input
        type={type} value={value} onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder} min={min} max={max} required={required}
        className="homy-glass-input mt-1.5 w-full rounded-xl px-4 py-3 text-[15px] outline-none"
      />
    </div>
  )
}

function UploadBox({ id, label, uploaded }: { id: string; label: string; uploaded: string | null }) {
  const [name, setName] = useState<string | null>(null)
  return (
    <label
      htmlFor={id}
      className="group flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 bg-white/50 px-3 py-5 transition-all duration-300 hover:border-[#1D63B8] hover:bg-[#1D63B8]/5"
    >
      <span className="grid size-9 place-items-center rounded-xl homy-chip-blue transition-transform duration-300 group-hover:scale-105">
        <Upload className="size-4.5" aria-hidden />
      </span>
      <span className="mt-1.5 text-sm font-bold text-[#0A2540]">DNI {label}</span>
      <span className="mt-0.5 text-xs text-slate-400">
        {uploaded ? 'Subido' : name ? name : 'JPG, PNG o PDF'}
      </span>
      <input
        id={id} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
        onChange={(e) => setName(e.target.files?.[0]?.name || null)}
      />
    </label>
  )
}
