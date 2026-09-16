'use client'
// Registro multi-paso HomIA — adapta el flujo por rol (cliente / profesional / proveedor)
// Paso 1: rol · Paso 2: datos personales + cómo nos encontraron · Paso 3: KYC por rol
import { useMemo, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { Homy, HomIAWordmark } from '@/components/homy/homy-character'
import { toast } from 'sonner'
import { Check, ChevronLeft, MapPin, Upload } from 'lucide-react'

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
      toast.success('¡Bienvenido a HomIA! 🎉')
      navigate(`/panel/${rolesPayload.includes('proveedor') ? 'proveedor' : rolesPayload.includes('profesional') ? 'profesional' : 'cliente'}`, { replace: true })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen bg-chalk flex flex-col items-center px-4 py-10">
      <button onClick={() => navigate('/')} className="mb-6 flex items-center gap-2 hover:opacity-80 transition">
        <Homy size={48} state={busy ? 'thinking' : 'happy'} />
        <HomIAWordmark className="text-3xl" />
      </button>

      <div className="w-full max-w-xl">
        {/* progreso */}
        <div className="flex items-center gap-2 mb-6 justify-center">
          {[1, 2, 3].map((n) => (
            <div key={n} className={`h-2 rounded-full transition-all ${step >= n ? 'w-10 bg-[#1D63B8]' : 'w-6 bg-slate-200'}`} />
          ))}
        </div>

        {step === 1 && (
          <div className="rounded-3xl border border-slate-200 bg-white shadow-xl p-7">
            <h1 className="text-2xl font-extrabold text-[#0A2540] text-center">¿Cómo vas a usar HomIA?</h1>
            <p className="text-sm text-slate-500 text-center mt-1">Elegí tu perfil principal (después podés sumar otros).</p>
            <div className="grid gap-3 mt-6">
              {([
                { r: 'cliente' as const, icon: '🏠', title: 'Soy cliente', desc: 'Busco profesionales y publico trabajos para mi casa' },
                { r: 'profesional' as const, icon: '🛠️', title: 'Soy profesional', desc: 'Oferto trabajos, busco materiales y gestiono mis clientes' },
                { r: 'proveedor' as const, icon: '🏪', title: 'Soy proveedor', desc: 'Vendo materiales y gestiono mi stock y clientes' },
              ]).map((opt) => (
                <button
                  key={opt.r}
                  onClick={() => { setRole(opt.r); setStep(2) }}
                  className={`text-left rounded-2xl border-2 p-4 transition hover:shadow-md ${role === opt.r ? 'border-[#1D63B8] bg-[#1D63B8]/5' : 'border-slate-200 hover:border-[#1D63B8]/50'}`}
                >
                  <span className="text-2xl">{opt.icon}</span>
                  <p className="font-bold text-[#0A2540] mt-1">{opt.title}</p>
                  <p className="text-sm text-slate-500">{opt.desc}</p>
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-400 text-center mt-5">
              Podés combinar perfiles con la misma cuenta (ej.: profesional que además contrata otros profesionales).
            </p>
          </div>
        )}

        {step === 2 && role && (
          <div className="rounded-3xl border border-slate-200 bg-white shadow-xl p-7">
            <button onClick={() => setStep(1)} className="text-sm text-slate-500 hover:text-[#1D63B8] flex items-center gap-1 mb-4">
              <ChevronLeft className="size-4" /> Cambiar perfil
            </button>
            <h1 className="text-2xl font-extrabold text-[#0A2540]">Tus datos</h1>
            <div className="grid sm:grid-cols-2 gap-4 mt-5">
              <Field label="Nombre y apellido (o negocio)" required value={displayName} onChange={setDisplayName} placeholder="Juan Pérez" />
              <Field label="Email" required type="email" value={email} onChange={setEmail} placeholder="tu@email.com" />
              <Field label="Contraseña" required type="password" value={password} onChange={setPassword} placeholder="Mínimo 6 caracteres" />
              <Field label="Celular" value={phone} onChange={setPhone} placeholder="+54 9 11 …" />
              <Field label="Fecha de nacimiento" type="date" value={birthday} onChange={setBirthday} />
              <Field label="Dirección" value={address} onChange={setAddress} placeholder="Calle y número" />
              <Field label="Ciudad / localidad" value={city} onChange={setCity} placeholder="Ej.: CABA" />
              <div>
                <label className="text-sm font-semibold text-[#0A2540]">¿Cómo nos encontraste?</label>
                <select value={howFoundUs} onChange={(e) => setHowFoundUs(e.target.value)} className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 bg-white outline-none focus:border-[#1D63B8]">
                  <option value="">Elegí una opción…</option>
                  {HOW_FOUND.map((h) => <option key={h.value} value={h.value}>{h.label}</option>)}
                </select>
              </div>
            </div>

            <div className="mt-4 rounded-2xl bg-[#00C4FF]/5 border border-[#00C4FF]/30 p-4">
              <p className="text-sm font-bold text-[#0A2540] flex items-center gap-2"><MapPin className="size-4 text-[#00C4FF]" /> Ubicación</p>
              <p className="text-xs text-slate-500 mt-1">Con tu ubicación vemos pines cercanos en el mapa y filtramos por distancia. Podés activarla después también.</p>
              {!location.shared ? (
                <button type="button" onClick={() => location.request()} className="mt-2 text-sm font-bold text-[#1D63B8] hover:underline">
                  {location.requesting ? 'Pidiendo permiso…' : 'Compartir mi ubicación'}
                </button>
              ) : (
                <p className="text-sm text-emerald-600 font-semibold mt-1">✓ Ubicación lista</p>
              )}
              {location.error && <p className="text-xs text-red-500 mt-1">{location.error}</p>}
            </div>

            <button
              onClick={() => setStep(3)}
              disabled={!displayName || !email || !password}
              className="mt-6 w-full rounded-xl bg-[#0A2540] text-white font-bold py-3.5 disabled:opacity-40 hover:bg-[#123455] transition"
            >
              Continuar
            </button>
          </div>
        )}

        {step === 3 && role && (
          <div className="rounded-3xl border border-slate-200 bg-white shadow-xl p-7">
            <button onClick={() => setStep(2)} className="text-sm text-slate-500 hover:text-[#1D63B8] flex items-center gap-1 mb-4">
              <ChevronLeft className="size-4" /> Volver
            </button>
            <h1 className="text-2xl font-extrabold text-[#0A2540]">
              {role === 'cliente' && 'Últimos detalles'}
              {role === 'profesional' && 'Tu perfil profesional'}
              {role === 'proveedor' && 'Tu negocio'}
            </h1>

            {/* DNI (todos los roles) */}
            <div className="mt-5">
              <p className="text-sm font-semibold text-[#0A2540]">Documento de identidad (DNI)</p>
              <p className="text-xs text-slate-500">Frente y reverso — queda privado, solo lo ve HomIA para verificar tu cuenta.</p>
              <div className="grid grid-cols-2 gap-3 mt-2">
                <UploadBox id="dni-front" label="Frente" uploaded={dniFront} />
                <UploadBox id="dni-back" label="Reverso" uploaded={dniBack} />
              </div>
            </div>

            {role === 'profesional' && (
              <div className="grid gap-4 mt-5">
                <div className="grid grid-cols-2 gap-3">
                  {(['persona', 'empresa'] as const).map((t) => (
                    <button key={t} type="button" onClick={() => setPersonType(t)}
                      className={`rounded-xl border-2 py-3 font-bold capitalize transition ${personType === t ? 'border-[#1D63B8] bg-[#1D63B8]/5 text-[#0A2540]' : 'border-slate-200 text-slate-500'}`}>
                      {t === 'persona' ? '👤 Persona única' : '🏢 Empresa'}
                    </button>
                  ))}
                </div>
                <div>
                  <label className="text-sm font-semibold text-[#0A2540]">Profesiones / rubros *</label>
                  <div className="flex flex-wrap gap-2 mt-2">
                    {CATEGORY_OPTIONS.map((c) => (
                      <button key={c.slug} type="button"
                        onClick={() => setProfessions((p) => p.includes(c.slug) ? p.filter((x) => x !== c.slug) : [...p, c.slug])}
                        className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition ${professions.includes(c.slug) ? 'border-[#1D63B8] bg-[#1D63B8] text-white' : 'border-slate-300 text-slate-600 hover:border-[#1D63B8]/60'}`}>
                        {professions.includes(c.slug) && <Check className="inline size-3 mr-1" />}{c.name}
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
                  <div className="grid sm:grid-cols-2 gap-4 rounded-2xl bg-slate-50 p-4">
                    <Field label="Razón social" value={companyName} onChange={setCompanyName} />
                    <Field label="Sitio web / Instagram" value={companyWebsite} onChange={setCompanyWebsite} />
                    <Field label="Cantidad de empleados" type="number" value={employeesCount} onChange={setEmployeesCount} />
                  </div>
                )}
                <div>
                  <label className="text-sm font-semibold text-[#0A2540]">Sobre vos / tu trabajo</label>
                  <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} placeholder="Contá tu experiencia, trabajos realizados, certificaciones…"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1D63B8] resize-none" />
                </div>
                <Field label={`Radio de servicio: ${serviceRadiusKm} km`} type="range" min="1" max="100" value={serviceRadiusKm} onChange={setServiceRadiusKm} />
                <label className="flex items-start gap-2 text-sm text-slate-600 bg-[#1D63B8]/5 border border-[#1D63B8]/20 rounded-xl p-3">
                  <input type="checkbox" checked={alsoPro} onChange={(e) => setAlsoPro(e.target.checked)} className="mt-0.5 accent-[#1D63B8]" />
                  <span>También quiero <b>contratar otros profesionales</b> (subcontratar, equipos, cuentas de retiro compartidas).</span>
                </label>
              </div>
            )}

            {role === 'proveedor' && (
              <div className="grid gap-4 mt-5">
                <Field label="Nombre del local o negocio *" value={businessName} onChange={setBusinessName} placeholder="Ferretería El Tornillo" />
                <Field label="CUIT" value={cuit} onChange={setCuit} placeholder="30-12345678-9" />
                <div>
                  <label className="text-sm font-semibold text-[#0A2540]">Sobre el negocio</label>
                  <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3} placeholder="Qué vendés, horarios, si hacés entregas…"
                    className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1D63B8] resize-none" />
                </div>
              </div>
            )}

            {role === 'cliente' && (
              <div className="mt-5 rounded-2xl bg-[#FF5A1F]/5 border border-[#FF5A1F]/20 p-4 text-sm text-slate-600">
                ¡Listo! Con tu cuenta vas a poder buscar profesionales en el mapa, publicar trabajos, recibir presupuestos, aprobar materiales y pagar con Mercado Pago.
              </div>
            )}

            <button
              onClick={submit} disabled={busy}
              className="mt-6 w-full rounded-xl bg-[#FF5A1F] hover:bg-[#e64d15] disabled:opacity-60 text-white font-bold py-3.5 transition shadow-lg shadow-[#FF5A1F]/25"
            >
              {busy ? 'Creando tu cuenta…' : 'Crear mi cuenta'}
            </button>
            <p className="text-xs text-slate-400 text-center mt-3">Al crear la cuenta aceptás nuestros términos. Tus documentos quedan privados.</p>
          </div>
        )}

        <p className="text-sm text-slate-500 text-center mt-5">
          ¿Ya tenés cuenta?{' '}
          <button onClick={() => navigate('/ingresar')} className="font-bold text-[#1D63B8] hover:underline">Ingresá</button>
        </p>
      </div>
    </div>
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
        className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1D63B8] focus:ring-2 focus:ring-[#1D63B8]/20 transition"
      />
    </div>
  )
}

function UploadBox({ id, label, uploaded }: { id: string; label: string; uploaded: string | null }) {
  const [name, setName] = useState<string | null>(null)
  return (
    <label
      htmlFor={id}
      className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-slate-300 hover:border-[#1D63B8] py-5 px-3 cursor-pointer transition bg-slate-50/50"
    >
      <Upload className="size-5 text-slate-400" />
      <span className="text-sm font-bold text-[#0A2540] mt-1">DNI {label}</span>
      <span className="text-xs text-slate-400 mt-0.5">
        {uploaded ? '✓ Subido' : name ? `✓ ${name}` : 'JPG, PNG o PDF'}
      </span>
      <input
        id={id} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" className="hidden"
        onChange={(e) => setName(e.target.files?.[0]?.name || null)}
      />
    </label>
  )
}
