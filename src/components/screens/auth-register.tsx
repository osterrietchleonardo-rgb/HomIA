'use client'
// Registro HomIA en 4 pasos (D26, 25/09/2026) — igual para cliente, profesional y proveedor:
//   1 · Perfil: cómo va a usar HomIA.
//   2 · Tus datos: nombre, apellido, email, país del celular + celular (dos veces, sin pegar),
//       contraseña y ciudad. Todo se estandariza mientras escribe (src/lib/registro.ts, la misma
//       regla que el servidor): email en minúsculas con sugerencia si el dominio parece mal escrito,
//       celular de cualquier país en formato internacional a la vista ("Se guardará como …").
//   3 · Confirmar email: código de 6 números por mail. Es LA verificación de la cuenta; el celular
//       no se verifica por código, solo se estandariza (Leonardo, 25/09/2026).
//   4 · Tu cuenta: lo del rol (rubros y zona / comercio, tipo y dirección), DNI opcional y términos.
// La cuenta se crea recién al final y con el email ya confirmado: nunca quedan cuentas a medias.
import { useEffect, useMemo, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { AuthShell } from '@/components/app/auth-shell'
import { toast } from 'sonner'
import {
  ArrowRight, BadgeCheck, Building2, Check, ChevronDown, ChevronLeft, CircleAlert, CircleCheck, Eye, EyeOff, HardHat,
  House, Loader2, Mail, MapPin, RotateCw, ShieldCheck, Smartphone, Sparkles, Store, Upload, UserRound,
} from 'lucide-react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { InputOTP, InputOTPGroup, InputOTPSlot } from '@/components/ui/input-otp'
import { SelectorPaisCelular } from '@/components/app/selector-pais-celular'
import {
  normalizarEmail, normalizarCelular, normalizarNombre, problemaNombre, normalizarCuit, normalizarDniOCuil, CODIGO,
  ejemploCelular, nombrePais, type CountryCode,
} from '@/lib/registro'
import { problemaDeContrasena } from '@/lib/password-policy'
import { PROVIDER_KINDS } from '@/lib/search-match'
import { subirImagen } from '@/lib/upload-image'

type Role = 'cliente' | 'profesional' | 'proveedor'
type Step = 1 | 2 | 3 | 4
type Errores = Record<string, string>

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
  { slug: 'electrodomesticos', name: 'Electrodomésticos' }, { slug: 'plagas', name: 'Control de plagas' },
]

const ROLE_OPTIONS: { r: Role; icon: typeof House; title: string; desc: string; tone: string }[] = [
  { r: 'cliente', icon: House, title: 'Soy cliente', desc: 'Busco profesionales y publico trabajos para mi casa', tone: 'homy-chip-blue' },
  { r: 'profesional', icon: HardHat, title: 'Soy profesional', desc: 'Oferto trabajos, busco materiales y gestiono mis clientes', tone: 'homy-chip-orange' },
  { r: 'proveedor', icon: Store, title: 'Soy proveedor', desc: 'Vendo materiales y gestiono mi stock y clientes', tone: 'homy-chip-ai' },
]

const STEP_LABELS = ['Perfil', 'Tus datos', 'Confirmar email', 'Tu cuenta']

// campos de cada paso (para volver al paso correcto si el servidor marca un error)
const CAMPOS_PASO2 = ['firstName', 'lastName', 'email', 'phone', 'phoneConfirm', 'password', 'city']

// Stepper premium: pill con check para pasos completos, activo con gradiente,
// conector que se enciende a medida que avanza el wizard.
function StepDots({ step }: { step: Step }) {
  return (
    <nav aria-label="Progreso del registro" className="mb-7">
      <ol className="flex items-center">
        {STEP_LABELS.map((label, i) => {
          const n = (i + 1) as Step
          const done = step > n
          const active = step === n
          return (
            <li key={label} className={`flex items-center ${n < STEP_LABELS.length ? 'flex-1' : ''}`}>
              <span
                aria-current={active ? 'step' : undefined}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pl-1.5 pr-2.5 text-[12.5px] font-extrabold transition-all duration-300 lg:gap-2 lg:pl-2 lg:pr-4 ${
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
                {/* solo el paso actual lleva nombre (con 4 pasos no entran todos sin pisarse) */}
                {active && <span className="hidden whitespace-nowrap uppercase tracking-wide sm:inline">{label}</span>}
              </span>
              {n < STEP_LABELS.length && (
                <span
                  aria-hidden
                  className={`mx-1.5 h-0.5 flex-1 rounded-full transition-colors duration-500 lg:mx-2 ${
                    step > n ? 'bg-gradient-to-r from-[#1D63B8] to-[#00C4FF]' : 'bg-navy/10'
                  }`}
                />
              )}
            </li>
          )
        })}
      </ol>
      <p className="mt-2.5 text-center text-[11px] font-extrabold uppercase tracking-[0.2em] text-slate-400 sm:hidden">
        Paso {step} de 4 · {STEP_LABELS[step - 1]}
      </p>
    </nav>
  )
}

function mmss(seg: number) {
  const m = Math.floor(seg / 60)
  const s = seg % 60
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function RegisterScreen() {
  const route = useRoute()
  const { refresh } = useSession()
  const location = useLocation()

  const initialRole = (['cliente', 'profesional', 'proveedor'] as const).includes(route.query.rol as Role)
    ? (route.query.rol as Role) : null

  const [step, setStep] = useState<Step>(initialRole ? 2 : 1)
  const [role, setRole] = useState<Role | null>(initialRole)
  const [busy, setBusy] = useState(false)
  const [errores, setErrores] = useState<Errores>({})

  // datos personales
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [email, setEmail] = useState('')
  const [pais, setPais] = useState<CountryCode>('AR')
  const [phone, setPhone] = useState('')
  const [phoneConfirm, setPhoneConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [verPassword, setVerPassword] = useState(false)
  const [city, setCity] = useState('')
  const [howFoundUs, setHowFoundUs] = useState('')
  const [dniFront, setDniFront] = useState<string | null>(null)
  const [dniBack, setDniBack] = useState<string | null>(null)

  // verificación del email (la del celular no existe: solo se estandariza)
  const [codigo, setCodigo] = useState('')
  const [codigoError, setCodigoError] = useState<string | null>(null)
  const [codigoMuerto, setCodigoMuerto] = useState(false) // vencido/agotado/usado: solo queda pedir otro
  const [reenviarEn, setReenviarEn] = useState(0)
  const [enviando, setEnviando] = useState(false)
  const [comprobando, setComprobando] = useState(false)
  const [emailToken, setEmailToken] = useState<{ para: string; token: string } | null>(null)

  // profesional
  const [personType, setPersonType] = useState<'persona' | 'empresa'>('persona')
  const [professions, setProfessions] = useState<string[]>([])
  const [skills, setSkills] = useState('')
  const [experienceYears, setExperienceYears] = useState('')
  const [bio, setBio] = useState('')
  const [dniCuil, setDniCuil] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyCuit, setCompanyCuit] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [employeesCount, setEmployeesCount] = useState('')
  const [serviceRadiusKm, setServiceRadiusKm] = useState('15')

  // proveedor
  const [businessName, setBusinessName] = useState('')
  const [kind, setKind] = useState('')
  const [address, setAddress] = useState('')
  const [cuit, setCuit] = useState('')
  const [description, setDescription] = useState('')

  // D19: aceptación obligatoria de Términos y Política de Privacidad
  const [acceptTerms, setAcceptTerms] = useState(false)

  const roleOpt = role ? ROLE_OPTIONS.find((o) => o.r === role) : null
  const roles = useMemo(() => {
    const r: string[] = ['cliente']
    if (role === 'profesional') r.push('profesional')
    if (role === 'proveedor') r.push('proveedor')
    return r
  }, [role])

  // estandarización en vivo (la misma función que usa el servidor)
  const emailN = useMemo(() => normalizarEmail(email), [email])
  const celN = useMemo(() => normalizarCelular(phone, pais), [phone, pais])
  const celRepN = useMemo(() => normalizarCelular(phoneConfirm, pais), [phoneConfirm, pais])
  const celCoincide = celN.ok && celRepN.ok && celN.e164 === celRepN.e164
  const emailListo = emailN.ok && emailToken?.para === emailN.email

  // cuenta regresiva del reenvío
  useEffect(() => {
    if (reenviarEn <= 0) return
    const t = setTimeout(() => setReenviarEn((s) => Math.max(0, s - 1)), 1000)
    return () => clearTimeout(t)
  }, [reenviarEn])

  // Al cambiar de paso la ventana vuelve arriba de todo: se ven "Volver al inicio" y el paso a paso
  // (antes se centraba en el paso y quedaba scrolleada unos píxeles, tapando el link).
  function irA(s: Step) {
    setStep(s)
    requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: 'smooth' }))
  }

  function setError(campo: string, msg: string | null) {
    setErrores((e) => {
      const n = { ...e }
      if (msg) n[campo] = msg
      else delete n[campo]
      return n
    })
  }

  function enfocarPrimerError(errs: Errores) {
    const primero = Object.keys(errs)[0]
    if (!primero) return
    requestAnimationFrame(() => {
      const el = document.getElementById(`reg-${primero}`)
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); (el as HTMLElement).focus?.() }
    })
  }

  function validarPaso2(): Errores {
    const e: Errores = {}
    const pn = problemaNombre(firstName, 'nombre')
    if (pn) e.firstName = pn
    const pa = problemaNombre(lastName, 'apellido')
    if (pa) e.lastName = pa
    if (!emailN.ok) e.email = emailN.error
    if (!celN.ok) e.phone = celN.error
    else if (!phoneConfirm.trim()) e.phoneConfirm = 'Repetí tu celular para confirmarlo'
    else if (!celCoincide) e.phoneConfirm = 'Los dos celulares no coinciden: revisalos'
    const pw = problemaDeContrasena(password)
    if (pw) e.password = pw
    if (city.trim().length < 2) e.city = 'Escribí tu ciudad o localidad'
    return e
  }

  function validarPaso4(): Errores {
    const e: Errores = {}
    if (role === 'profesional') {
      if (professions.length === 0) e.professions = 'Elegí al menos un rubro en el que trabajás'
      if (dniCuil.trim()) { const r = normalizarDniOCuil(dniCuil); if (!r.ok) e.dniCuil = r.error }
      if (personType === 'empresa' && companyCuit.trim()) { const r = normalizarCuit(companyCuit); if (!r.ok) e.companyCuit = r.error }
    }
    if (role === 'proveedor') {
      if (businessName.trim().length < 2) e.businessName = 'Escribí el nombre de tu comercio'
      if (!kind) e.kind = 'Elegí qué tipo de comercio es'
      if (address.trim().length < 5 || !/\d/.test(address)) e.address = 'Escribí la dirección del local (calle y número)'
      if (cuit.trim()) { const r = normalizarCuit(cuit); if (!r.ok) e.cuit = r.error }
    }
    if (!acceptTerms) e.acceptTerms = 'Para crear tu cuenta tenés que aceptar los Términos y Condiciones y la Política de Privacidad'
    return e
  }

  /** Pide el código del email. Devuelve true si salió. */
  async function enviarCodigo(): Promise<boolean> {
    const destino = emailN.ok ? emailN.email : email
    setEnviando(true)
    setCodigoError(null)
    try {
      const res = await fetch('/api/auth/verificacion/enviar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal: 'email', proposito: 'registro', destino }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok) {
        setCodigo('')
        setCodigoMuerto(false)
        setReenviarEn(data.reenviarEnSeg || CODIGO.reenvioSeg)
        return true
      }
      if (res.status === 429 && data.esperarSeg) {
        // ya hay un código en camino: se puede usar ese mientras corre la espera
        setReenviarEn(Math.min(3600, data.esperarSeg))
        setCodigoError(data.error)
        return data.motivo === 'espera'
      }
      const msg = data.error || 'No pudimos mandar el código. Probá de nuevo.'
      if (step === 2) {
        setError('email', msg)
        enfocarPrimerError({ email: msg })
      } else setCodigoError(msg)
      return false
    } catch {
      const msg = 'No hay conexión. Revisá internet y probá de nuevo.'
      if (step === 2) toast.error(msg)
      else setCodigoError(msg)
      return false
    } finally {
      setEnviando(false)
    }
  }

  async function continuarPaso2() {
    const e = validarPaso2()
    setErrores(e)
    if (Object.keys(e).length) { enfocarPrimerError(e); return }
    setFirstName(normalizarNombre(firstName))
    setLastName(normalizarNombre(lastName))
    if (!emailListo) {
      if (await enviarCodigo()) irA(3)
      return
    }
    irA(4)
  }

  async function comprobar(valor = codigo) {
    if (!/^\d{6}$/.test(valor) || comprobando) return
    const destino = emailN.ok ? emailN.email : ''
    setComprobando(true)
    setCodigoError(null)
    try {
      const res = await fetch('/api/auth/verificacion/comprobar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ canal: 'email', proposito: 'registro', destino, codigo: valor }),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.comprobante) {
        setEmailToken({ para: destino, token: data.comprobante })
        toast.success('¡Email confirmado!')
        irA(4)
        return
      }
      setCodigo('')
      setCodigoError(data.error || 'No pudimos comprobar el código. Probá de nuevo.')
      if (['vencido', 'agotado', 'usado', 'sin_codigo'].includes(data.motivo)) setCodigoMuerto(true)
    } catch {
      setCodigoError('No hay conexión. Revisá internet y probá de nuevo.')
    } finally {
      setComprobando(false)
    }
  }

  async function submit() {
    if (!role) return
    const e2 = validarPaso2()
    if (Object.keys(e2).length) { setErrores(e2); irA(2); enfocarPrimerError(e2); return }
    const e4 = validarPaso4()
    setErrores(e4)
    if (Object.keys(e4).length) { enfocarPrimerError(e4); return }
    if (!emailListo) { toast.error('Primero confirmá tu email con el código'); irA(2); return }
    setBusy(true)
    try {
      // el DNI se sube DESPUÉS de crear la cuenta (la subida exige sesión)
      const inputFront = document.getElementById('dni-front') as HTMLInputElement | null
      const inputBack = document.getElementById('dni-back') as HTMLInputElement | null
      const dniFrontFile = inputFront?.files?.[0] || null
      const dniBackFile = inputBack?.files?.[0] || null

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roles,
          firstName, lastName, email,
          emailToken: emailToken?.token,
          phone, phoneConfirm, phoneCountry: pais,
          password, city,
          howFoundUs: howFoundUs || undefined,
          lat: location.shared && location.lat ? location.lat : undefined,
          lng: location.shared && location.lng ? location.lng : undefined,
          acceptTerms,
          ...(role === 'profesional' ? {
            personType, professions,
            skills: skills.split(',').map((s) => s.trim()).filter(Boolean).slice(0, 40),
            experienceYears: experienceYears ? Math.max(0, Math.min(80, parseInt(experienceYears) || 0)) : undefined,
            bio: bio || undefined, dniCuil: dniCuil || undefined,
            companyName: personType === 'empresa' ? companyName || undefined : undefined,
            companyCuit: personType === 'empresa' ? companyCuit || undefined : undefined,
            companyWebsite: personType === 'empresa' ? companyWebsite || undefined : undefined,
            employeesCount: personType === 'empresa' && employeesCount ? parseInt(employeesCount) || undefined : undefined,
            serviceRadiusKm: parseFloat(serviceRadiusKm) || 15,
          } : {}),
          ...(role === 'proveedor' ? {
            businessName, kind, address, cuit: cuit || undefined, description: description || undefined,
          } : {}),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        const campos: Errores = data.campos || {}
        if (data.needsEmailCode) {
          setEmailToken(null)
          setErrores(campos)
          toast.error('La confirmación venció: te pedimos el código de nuevo')
          irA(2)
          return
        }
        setErrores(campos)
        if (Object.keys(campos).some((k) => CAMPOS_PASO2.includes(k))) irA(2)
        enfocarPrimerError(campos)
        toast.error(data.error || 'No pudimos crear tu cuenta')
        return
      }
      // DNI (opcional): ya con sesión, subir las 2 fotos al bucket privado y mandarlas a la
      // verificación con IA. Si algo falla, se dice qué pasó y se sigue (se puede hacer después).
      if (dniFrontFile && dniBackFile) {
        const front = await subirImagen(dniFrontFile, 'dni')
        const back = front.ok ? await subirImagen(dniBackFile, 'dni') : null
        if (!front.ok) toast.error(`DNI (frente): ${front.error} Podés verificarlo después desde tu perfil.`)
        else if (back && !back.ok) toast.error(`DNI (dorso): ${back.error} Podés verificarlo después desde tu perfil.`)
        else if (back && back.ok) {
          const ver = await fetch('/api/verification/dni', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ frontUrl: front.url, backUrl: back.url }),
          }).catch(() => null)
          if (!ver || !ver.ok) {
            const d = ver ? await ver.json().catch(() => ({})) : {}
            toast.error(`${d.error || 'No pudimos mandar tu DNI a verificar.'} Podés hacerlo después desde tu perfil.`)
          }
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
      navigate(`/panel/${role === 'proveedor' ? 'proveedor' : role === 'profesional' ? 'profesional' : 'cliente'}`, { replace: true })
    } catch {
      toast.error('No hay conexión. Revisá internet y probá de nuevo.')
    } finally {
      setBusy(false)
    }
  }

  const destinoCodigo = emailN.ok ? emailN.email : email

  return (
    <AuthShell
      homyState={busy || comprobando ? 'thinking' : 'happy'}
      headline={
        <>
          Una sola cuenta para <span className="homy-gradient-text">arreglar, trabajar o vender</span>.
        </>
      }
      sub="Si necesitás un arreglo, si hacés los trabajos o si vendés materiales: con la misma cuenta buscás, presupuestás, cobrás y pagás desde el celular."
    >
      <StepDots step={step} />

      {step === 1 && (
        <section className="homy-glass-strong homy-stagger rounded-[28px] p-6 sm:p-8">
          <header className="text-center">
            <span className="homy-eyebrow">Registro · Paso 1 de 4</span>
            <h1 className="mt-2 text-[1.9rem] font-extrabold leading-[1.15] tracking-tight text-navy">¿Cómo vas a usar HomIA?</h1>
            <p className="mx-auto mt-1.5 max-w-sm text-sm text-slate-500">Elegí tu perfil principal.</p>
          </header>
          <div className="mt-7 grid gap-3.5">
            {ROLE_OPTIONS.map((opt) => {
              const selected = role === opt.r
              return (
                <button
                  key={opt.r}
                  onClick={() => { setRole(opt.r); irA(2) }}
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
            Con cualquier perfil también podés contratar y comprar materiales con la misma cuenta.
          </p>
        </section>
      )}

      {step === 2 && role && (
        <section className="homy-glass-strong homy-stagger rounded-[28px] p-6 sm:p-8">
          <button
            onClick={() => irA(1)}
            className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-slate-500 transition-colors duration-300 hover:bg-navy/5 hover:text-[#1D63B8]"
          >
            <ChevronLeft className="size-4" aria-hidden /> Cambiar perfil
          </button>
          <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div>
              <span className="homy-eyebrow">Registro · Paso 2 de 4</span>
              <h1 className="mt-1.5 text-[1.9rem] font-extrabold leading-[1.15] tracking-tight text-navy">Tus datos</h1>
            </div>
            {roleOpt && (
              <span className="homy-pill">
                <roleOpt.icon className="size-3.5" aria-hidden />
                {roleOpt.title}
              </span>
            )}
          </header>
          <p className="mt-2 text-xs leading-relaxed text-slate-500">
            Todos son obligatorios <span className="text-action" aria-hidden>*</span>: los usamos para que profesionales, proveedores y clientes sepan con quién tratan.
          </p>

          <div className="mt-5 grid gap-4 sm:grid-cols-2">
            <Field id="reg-firstName" label="Nombre" required value={firstName} autoComplete="given-name" placeholder="Juan"
              error={errores.firstName}
              onChange={(v) => { setFirstName(v); if (errores.firstName) setError('firstName', problemaNombre(v, 'nombre')) }}
              onBlur={() => { if (firstName.trim()) { setFirstName(normalizarNombre(firstName)); setError('firstName', problemaNombre(firstName, 'nombre')) } }} />
            <Field id="reg-lastName" label="Apellido" required value={lastName} autoComplete="family-name" placeholder="Pérez"
              error={errores.lastName}
              onChange={(v) => { setLastName(v); if (errores.lastName) setError('lastName', problemaNombre(v, 'apellido')) }}
              onBlur={() => { if (lastName.trim()) { setLastName(normalizarNombre(lastName)); setError('lastName', problemaNombre(lastName, 'apellido')) } }} />

            <div className="sm:col-span-2">
              <Field id="reg-email" label="Email" required type="email" inputMode="email" autoComplete="email" value={email} placeholder="tu@email.com"
                error={errores.email}
                onChange={(v) => { setEmail(v); if (errores.email) setError('email', null) }}
                onBlur={() => {
                  if (!email.trim()) return
                  const n = normalizarEmail(email)
                  if (n.ok) { setEmail(n.email); setError('email', null) } else setError('email', n.error)
                }} />
              {emailN.ok && emailN.sugerencia && (
                <div className="mt-2 flex flex-wrap items-center gap-2 rounded-xl border border-[#FFC700]/50 bg-[#FFC700]/10 px-3 py-2 text-[13px] text-slate-700" role="status">
                  <CircleAlert className="size-4 shrink-0 text-[#8a6d00]" aria-hidden />
                  <span className="min-w-0 break-all">¿Quisiste decir <b>{emailN.sugerencia}</b>?</span>
                  <button type="button" onClick={() => { setEmail(emailN.sugerencia!); setError('email', null) }}
                    className="ml-auto inline-flex min-h-9 items-center rounded-lg bg-white px-3 text-[13px] font-extrabold text-[#1D63B8] shadow-sm">
                    Sí, usar ese
                  </button>
                </div>
              )}
              {emailListo && (
                <p className="mt-1.5 inline-flex items-center gap-1 text-xs font-bold text-[#0e9f6e]"><CircleCheck className="size-3.5" aria-hidden /> Email confirmado</p>
              )}
            </div>

            <SelectorPaisCelular id="reg-phoneCountry" required className="sm:col-span-2" value={pais}
              onChange={(p) => { setPais(p); setError('phone', null); setError('phoneConfirm', null) }} />
            <div>
              <Field id="reg-phone" label="Celular" required type="tel" inputMode="tel" autoComplete="tel-national" value={phone} placeholder={ejemploCelular(pais) || 'Tu celular'}
                error={errores.phone}
                onChange={(v) => { setPhone(v); if (errores.phone) setError('phone', null) }}
                onBlur={() => { if (phone.trim()) { const n = normalizarCelular(phone, pais); setError('phone', n.ok ? null : n.error) } }} />
              {!errores.phone && (
                celN.ok ? (
                  <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-500" aria-live="polite">
                    <CircleCheck className="size-3.5 shrink-0 text-[#0e9f6e]" aria-hidden />
                    <span>Se guardará como <b className="whitespace-nowrap text-navy">{celN.mostrar}</b></span>
                  </p>
                ) : phone.replace(/\D/g, '').length >= 6 ? (
                  <p className="mt-1.5 text-xs font-semibold text-[#8a6d00]" aria-live="polite">{celN.error}</p>
                ) : (
                  <p className="mt-1.5 text-xs text-slate-400">
                    {pais === 'AR' ? 'Con código de área, como lo escribas: 011 15…, 11…, +54 9…' : `Como se escribe en ${nombrePais(pais)}, o con + y el código del país`}
                  </p>
                )
              )}
            </div>
            <div>
              <Field id="reg-phoneConfirm" label="Repetí el celular" required type="tel" inputMode="tel" autoComplete="off" value={phoneConfirm} placeholder="Escribilo de nuevo"
                error={errores.phoneConfirm} noPaste
                onChange={(v) => { setPhoneConfirm(v); if (errores.phoneConfirm) setError('phoneConfirm', null) }} />
              {phoneConfirm.trim() && !errores.phoneConfirm && (
                <p className={`mt-1.5 inline-flex items-center gap-1 text-xs font-bold ${celCoincide ? 'text-[#0e9f6e]' : 'text-slate-500'}`} aria-live="polite">
                  {celCoincide ? <><CircleCheck className="size-3.5" aria-hidden /> Coinciden</> : 'Todavía no coinciden'}
                </p>
              )}
            </div>

            <div>
              <Field id="reg-password" label="Contraseña" required type={verPassword ? 'text' : 'password'} autoComplete="new-password" value={password}
                placeholder="Mínimo 8, con letras y números"
                error={errores.password}
                onChange={(v) => { setPassword(v); if (errores.password) setError('password', problemaDeContrasena(v)) }}
                onBlur={() => { if (password) setError('password', problemaDeContrasena(password)) }}
                adornment={
                  <button type="button" onClick={() => setVerPassword((x) => !x)} aria-label={verPassword ? 'Ocultar contraseña' : 'Mostrar contraseña'}
                    className="grid size-10 place-items-center rounded-lg text-slate-400 hover:text-[#1D63B8]">
                    {verPassword ? <EyeOff className="size-4.5" aria-hidden /> : <Eye className="size-4.5" aria-hidden />}
                  </button>
                } />
            </div>
            <Field id="reg-city" label="Ciudad o localidad" required value={city} autoComplete="address-level2" placeholder="Ej.: Palermo, CABA"
              error={errores.city}
              onChange={(v) => { setCity(v); if (errores.city) setError('city', null) }} />

            <div className="sm:col-span-2">
              <label className="block text-sm font-semibold text-navy">
                ¿Cómo nos encontraste? <span className="font-normal text-slate-400">(opcional)</span>
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
                <p className="text-sm font-extrabold text-navy">Ubicación <span className="font-normal text-slate-400">(opcional)</span></p>
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

          <button onClick={continuarPaso2} disabled={enviando} className="homy-btn-dark mt-6 w-full py-3.5 text-[15px] disabled:opacity-60">
            {enviando ? (<><Loader2 className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden /> Mandando el código…</>) : (
              <>{emailListo ? 'Continuar' : 'Continuar y confirmar mi email'} <ArrowRight className="size-4.5" aria-hidden /></>
            )}
          </button>
          {!emailListo && (
            <p className="mt-3 text-center text-xs leading-relaxed text-slate-400">Te vamos a mandar un código de 6 números a tu email para confirmar que es tuyo.</p>
          )}
        </section>
      )}

      {step === 3 && role && (
        <section className="homy-glass-strong homy-stagger rounded-[28px] p-6 sm:p-8">
          <button
            onClick={() => irA(2)}
            className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-slate-500 transition-colors duration-300 hover:bg-navy/5 hover:text-[#1D63B8]"
          >
            <ChevronLeft className="size-4" aria-hidden /> Cambiar email
          </button>
          <header className="text-center">
            <span className="homy-icon-chip homy-chip-blue mx-auto size-14 !rounded-2xl">
              <Mail className="size-7" aria-hidden />
            </span>
            <span className="homy-eyebrow mt-4 block">Registro · Paso 3 de 4</span>
            <h1 className="mt-1.5 text-[1.75rem] font-extrabold leading-[1.15] tracking-tight text-navy">
              Confirmá tu email
            </h1>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-slate-500">
              Te mandamos un código de 6 números a{' '}
              <b className="break-all text-navy">{destinoCodigo}</b>. Si no lo ves, mirá en spam o promociones.
            </p>
          </header>

          <div className="mt-6 flex justify-center">
            <InputOTP
              id="reg-codigo"
              maxLength={CODIGO.digitos}
              value={codigo}
              onChange={(v) => { setCodigo(v.replace(/\D/g, '')); if (codigoError && !codigoMuerto) setCodigoError(null) }}
              onComplete={(v: string) => comprobar(v)}
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="^[0-9]*$"
              disabled={comprobando || codigoMuerto}
              aria-label="Código de 6 números"
              aria-invalid={!!codigoError}
              autoFocus
            >
              <InputOTPGroup>
                {Array.from({ length: CODIGO.digitos }, (_, i) => (
                  <InputOTPSlot key={i} index={i}
                    className="h-12 w-11 bg-white/80 text-xl font-extrabold text-navy sm:h-14 sm:w-12" />
                ))}
              </InputOTPGroup>
            </InputOTP>
          </div>

          {codigoError && (
            <p role="alert" className="mx-auto mt-3 flex max-w-sm items-start justify-center gap-1.5 text-center text-sm font-semibold text-red-600">
              <CircleAlert className="mt-0.5 size-4 shrink-0" aria-hidden /> {codigoError}
            </p>
          )}

          <button onClick={() => comprobar()} disabled={codigo.length !== CODIGO.digitos || comprobando || codigoMuerto}
            className="homy-btn-primary mt-5 w-full py-3.5 text-[15px] disabled:cursor-not-allowed disabled:opacity-60">
            {comprobando ? (<><Loader2 className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden /> Comprobando…</>) : 'Confirmar'}
          </button>

          <div className="mt-4 text-center">
            {reenviarEn > 0 ? (
              <p className="text-sm text-slate-500" aria-live="polite">
                ¿No te llegó? Podés pedir otro en <b className="tabular-nums text-navy">{mmss(reenviarEn)}</b>
              </p>
            ) : (
              <button type="button" onClick={() => enviarCodigo()} disabled={enviando}
                className="inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-[#1D63B8] hover:bg-[#1D63B8]/5 disabled:opacity-60">
                {enviando ? <Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> : <RotateCw className="size-4" aria-hidden />}
                Mandarme un código nuevo
              </button>
            )}
          </div>
          <p className="mt-3 text-center text-xs leading-relaxed text-slate-400">
            El código vence en {CODIGO.venceMin} minutos. Tenés {CODIGO.maxIntentos} intentos por código.
          </p>
        </section>
      )}

      {step === 4 && role && (
        <section className="homy-glass-strong homy-stagger rounded-[28px] p-6 sm:p-8">
          <button
            onClick={() => irA(2)}
            className="-ml-2 mb-4 inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3 text-sm font-bold text-slate-500 transition-colors duration-300 hover:bg-navy/5 hover:text-[#1D63B8]"
          >
            <ChevronLeft className="size-4" aria-hidden /> Volver a tus datos
          </button>
          <header className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
            <div>
              <span className="homy-eyebrow">Registro · Paso 4 de 4</span>
              <h1 className="mt-1.5 text-[1.9rem] font-extrabold leading-[1.15] tracking-tight text-navy">
                {role === 'cliente' && 'Último paso'}
                {role === 'profesional' && 'Tu trabajo'}
                {role === 'proveedor' && 'Tu comercio'}
              </h1>
            </div>
            {roleOpt && (
              <span className="homy-pill">
                <roleOpt.icon className="size-3.5" aria-hidden />
                {roleOpt.title}
              </span>
            )}
          </header>

          {/* lo verificado, a la vista */}
          <ul className="mt-4 grid gap-1.5 text-[13px]">
            <li className="flex items-center gap-2 text-slate-600">
              <CircleCheck className="size-4 shrink-0 text-[#0e9f6e]" aria-hidden />
              <span className="min-w-0 break-all">Email confirmado: <b className="text-navy">{emailN.ok ? emailN.email : email}</b></span>
            </li>
            <li className="flex items-center gap-2 text-slate-600">
              <Smartphone className="size-4 shrink-0 text-slate-400" aria-hidden />
              <span>Celular: <b className="whitespace-nowrap text-navy">{celN.ok ? celN.mostrar : phone}</b></span>
            </li>
          </ul>

          {role === 'profesional' && (
            <div className="mt-6 grid gap-4">
              <div>
                <p id="reg-professions" tabIndex={-1} className="text-sm font-semibold text-navy outline-none">Rubros en los que trabajás <span className="text-action" aria-hidden>*</span></p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {CATEGORY_OPTIONS.map((c) => {
                    const on = professions.includes(c.slug)
                    return (
                      <button
                        key={c.slug} type="button" aria-pressed={on}
                        onClick={() => { setProfessions((p) => p.includes(c.slug) ? p.filter((x) => x !== c.slug) : [...p, c.slug]); setError('professions', null) }}
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
                {errores.professions && <FieldError msg={errores.professions} />}
              </div>
              <div className="homy-glass-soft rounded-2xl p-4">
                <label htmlFor="service-radius" className="text-sm font-semibold text-navy">
                  Zona de trabajo <span className="text-action" aria-hidden>*</span>
                </label>
                <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                  Trabajás en <b className="text-navy">{city.trim() || 'tu ciudad'}</b> y hasta <b className="text-navy">{serviceRadiusKm} km</b> a la redonda.
                </p>
                <input
                  id="service-radius"
                  type="range" min="1" max="100" value={serviceRadiusKm}
                  onChange={(e) => setServiceRadiusKm(e.target.value)}
                  className="homy-range mt-2.5 w-full"
                  style={{ ['--range-progress' as string]: `${(parseInt(serviceRadiusKm) / 100) * 100}%` }}
                  aria-label="Radio de trabajo en kilómetros"
                />
              </div>
              <details className="homy-glass-soft group rounded-2xl p-4">
                <Resumen titulo="Más datos de tu trabajo" />

                <div className="mt-3 grid gap-4">
                  <div className="grid grid-cols-2 gap-1.5 rounded-2xl bg-white/50 p-1.5">
                    {([
                      { t: 'persona' as const, icon: UserRound, label: 'Persona' },
                      { t: 'empresa' as const, icon: Building2, label: 'Empresa' },
                    ]).map((o) => (
                      <button
                        key={o.t} type="button" onClick={() => setPersonType(o.t)} aria-pressed={personType === o.t}
                        className={`flex min-h-11 items-center justify-center gap-2 rounded-xl text-sm font-bold transition-all duration-300 ${
                          personType === o.t ? 'bg-white text-navy shadow-[0_6px_16px_-8px_rgba(10,37,64,0.4)]' : 'text-slate-500 hover:text-navy'
                        }`}
                      >
                        <o.icon className="size-4.5" aria-hidden /> {o.label}
                      </button>
                    ))}
                  </div>
                  <Field id="reg-dniCuil" label="DNI o CUIL" inputMode="numeric" value={dniCuil} placeholder="30123456 o 20-30123456-7" error={errores.dniCuil}
                    onChange={(v) => { setDniCuil(v); if (errores.dniCuil) setError('dniCuil', null) }}
                    onBlur={() => { if (dniCuil.trim()) { const r = normalizarDniOCuil(dniCuil); if (r.ok) setDniCuil(r.valor); setError('dniCuil', r.ok ? null : r.error) } }} />
                  {personType === 'empresa' && (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field id="reg-companyName" label="Razón social" value={companyName} onChange={setCompanyName} autoComplete="organization" />
                      <Field id="reg-companyCuit" label="CUIT de la empresa" inputMode="numeric" value={companyCuit} placeholder="30-12345678-9" error={errores.companyCuit}
                        onChange={(v) => { setCompanyCuit(v); if (errores.companyCuit) setError('companyCuit', null) }}
                        onBlur={() => { if (companyCuit.trim()) { const r = normalizarCuit(companyCuit); if (r.ok) setCompanyCuit(r.cuit); setError('companyCuit', r.ok ? null : r.error) } }} />
                      <Field id="reg-companyWebsite" label="Sitio web / Instagram" value={companyWebsite} onChange={setCompanyWebsite} />
                      <Field id="reg-employeesCount" label="Cantidad de empleados" type="number" inputMode="numeric" value={employeesCount} onChange={setEmployeesCount} />
                    </div>
                  )}
                  <Field id="reg-skills" label="Habilidades (separadas por coma)" value={skills} onChange={setSkills} placeholder="instalación de termos, destapaciones" />
                  <Field id="reg-experienceYears" label="Años de experiencia" type="number" inputMode="numeric" value={experienceYears} onChange={setExperienceYears} />
                  <label className="block text-sm font-semibold text-navy">
                    Sobre vos / tu trabajo
                    <textarea
                      value={bio} onChange={(e) => setBio(e.target.value)} rows={3} maxLength={1500}
                      placeholder="Contá tu experiencia, trabajos realizados, certificaciones…"
                      className="homy-glass-input mt-1.5 w-full resize-none rounded-xl px-4 py-2.5 text-[15px] outline-none"
                    />
                  </label>
                </div>
              </details>
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
              <Field id="reg-businessName" label="Nombre del comercio" required value={businessName} placeholder="Ferretería El Tornillo" autoComplete="organization"
                error={errores.businessName}
                onChange={(v) => { setBusinessName(v); if (errores.businessName) setError('businessName', null) }} />
              <div>
                <label htmlFor="reg-kind" className="block text-sm font-semibold text-navy">
                  Tipo de comercio <span className="text-action" aria-hidden>*</span>
                </label>
                <div className="mt-1.5">
                  <Select value={kind} onValueChange={(v) => { setKind(v); setError('kind', null) }}>
                    <SelectTrigger id="reg-kind" aria-invalid={!!errores.kind}
                      className={`homy-glass-input w-full rounded-xl px-4 py-2.5 text-[15px] outline-none border-none ${errores.kind ? '!border-red-400 ring-2 ring-red-400/40' : ''}`}>
                      <SelectValue placeholder="Elegí: corralón, ferretería…" />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(PROVIDER_KINDS).map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
                {errores.kind && <FieldError msg={errores.kind} />}
              </div>
              <Field id="reg-address" label="Dirección del local" required value={address} placeholder="Av. Rivadavia 1234" autoComplete="street-address"
                error={errores.address}
                hint={`En ${city.trim() || 'tu ciudad'}. Es donde los clientes retiran lo que compran.`}
                onChange={(v) => { setAddress(v); if (errores.address) setError('address', null) }} />
              <details className="homy-glass-soft group rounded-2xl p-4" open={!!errores.cuit}>
                <Resumen titulo="CUIT y descripción del comercio" />
                <div className="mt-3 grid gap-4">
                  <Field id="reg-cuit" label="CUIT" inputMode="numeric" value={cuit} placeholder="30-12345678-9" error={errores.cuit}
                    onChange={(v) => { setCuit(v); if (errores.cuit) setError('cuit', null) }}
                    onBlur={() => { if (cuit.trim()) { const r = normalizarCuit(cuit); if (r.ok) setCuit(r.cuit); setError('cuit', r.ok ? null : r.error) } }} />
                  <label className="block text-sm font-semibold text-navy">
                    Sobre el comercio
                    <textarea
                      value={description} onChange={(e) => setDescription(e.target.value)} rows={3} maxLength={1500}
                      placeholder="Qué vendés, horarios, si hacés entregas…"
                      className="homy-glass-input mt-1.5 w-full resize-none rounded-xl px-4 py-2.5 text-[15px] outline-none"
                    />
                  </label>
                </div>
              </details>
            </div>
          )}

          {role === 'cliente' && (
            <div className="mt-6 flex items-start gap-3 rounded-2xl border border-action/25 bg-gradient-to-br from-action/8 to-action/3 p-4">
              <span className="homy-icon-chip homy-chip-orange size-10 shrink-0 !rounded-xl">
                <Sparkles className="size-5" aria-hidden />
              </span>
              <p className="text-sm leading-relaxed text-slate-600">
                ¡Listo! Con tu cuenta vas a poder buscar profesionales en el mapa, publicar trabajos, recibir presupuestos, comprar materiales y pagar con Mercado Pago o en efectivo.
              </p>
            </div>
          )}

          {/* DNI (todos los roles, opcional) */}
          <details className="homy-glass-soft group mt-5 rounded-2xl p-4">
            <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
              <span className="homy-icon-chip homy-chip-blue size-10 shrink-0 !rounded-xl">
                <BadgeCheck className="size-5" aria-hidden />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-navy">Verificá tu identidad con tu DNI <span className="font-semibold text-slate-400">(opcional)</span></span>
                <span className="mt-0.5 flex items-start gap-1 text-xs leading-relaxed text-slate-500">
                  <ShieldCheck className="mt-0.5 size-3.5 shrink-0 text-[#1D63B8]" aria-hidden />
                  Frente y dorso. Queda privado. También podés hacerlo después desde tu perfil.
                </span>
              </span>
              <ChevronDown className="ml-auto size-5 shrink-0 text-slate-400 transition-transform duration-300 group-open:rotate-180" aria-hidden />
            </summary>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <UploadBox id="dni-front" label="Frente" uploaded={dniFront} onPick={(f) => setDniFront(f ? f.name : null)} />
              <UploadBox id="dni-back" label="Dorso" uploaded={dniBack} onPick={(f) => setDniBack(f ? f.name : null)} />
            </div>
          </details>

          {/* D19: aceptación obligatoria. Los links abren en otra pestaña para no perder lo cargado. */}
          <label id="reg-acceptTerms" tabIndex={-1} className={`homy-glass-soft mt-5 flex cursor-pointer items-start gap-3 rounded-2xl p-4 text-sm leading-relaxed text-slate-600 outline-none ${errores.acceptTerms ? 'ring-2 ring-red-400/70' : ''}`}>
            <input
              type="checkbox"
              checked={acceptTerms}
              onChange={(e) => { setAcceptTerms(e.target.checked); if (e.target.checked) setError('acceptTerms', null) }}
              aria-describedby="terminos-ayuda"
              className="mt-0.5 size-5 shrink-0 accent-[#1D63B8]"
            />
            <span>
              Acepto los{' '}
              <a href="/terminos" target="_blank" rel="noopener noreferrer" className="font-bold text-[#1D63B8] underline underline-offset-2">Términos y Condiciones</a>
              {' '}y la{' '}
              <a href="/privacidad" target="_blank" rel="noopener noreferrer" className="font-bold text-[#1D63B8] underline underline-offset-2">Política de Privacidad</a>
              {' '}de HomIA.
            </span>
          </label>
          <p id="terminos-ayuda" className="mt-2 px-1 text-xs leading-relaxed text-slate-400">
            Los links se abren en otra pestaña: lo que cargaste queda acá.
          </p>

          <button onClick={submit} disabled={busy || !acceptTerms} className="homy-btn-primary mt-5 w-full py-3.5 text-[15px] disabled:cursor-not-allowed disabled:opacity-60">
            {busy ? (
              <>
                <Loader2 className="size-4.5 animate-spin motion-reduce:animate-none" aria-hidden />
                Creando tu cuenta…
              </>
            ) : (
              'Crear mi cuenta'
            )}
          </button>
        </section>
      )}

      <p className="mt-6 text-center text-sm text-slate-500">
        ¿Ya tenés cuenta?{' '}
        <button onClick={() => navigate('/ingresar')} className="rounded font-bold text-[#1D63B8] underline-offset-2 transition-colors duration-300 hover:text-[#2b8fe0] hover:underline">Ingresá</button>
      </p>
    </AuthShell>
  )
}

/** Encabezado de un bloque plegable opcional: título, "Opcional…" y flecha que gira al abrir. */
function Resumen({ titulo }: { titulo: string }) {
  return (
    <summary className="flex min-h-11 cursor-pointer list-none items-center gap-3 [&::-webkit-details-marker]:hidden">
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-extrabold text-navy">{titulo}</span>
        <span className="block text-xs font-semibold text-slate-400">Opcional: podés completarlo después</span>
      </span>
      <ChevronDown className="size-5 shrink-0 text-slate-400 transition-transform duration-300 group-open:rotate-180" aria-hidden />
    </summary>
  )
}

function FieldError({ msg, id }: { msg: string; id?: string }) {
  return (
    <p id={id} role="alert" className="mt-1.5 flex items-start gap-1 text-xs font-semibold text-red-600">
      <CircleAlert className="mt-px size-3.5 shrink-0" aria-hidden /> {msg}
    </p>
  )
}

function Field({
  id, label, value, onChange, onBlur, type = 'text', placeholder, required, error, hint, inputMode, autoComplete, noPaste, adornment,
}: {
  id: string
  label: string
  value: string
  onChange: (v: string) => void
  onBlur?: () => void
  type?: string
  placeholder?: string
  required?: boolean
  error?: string
  hint?: string
  inputMode?: 'text' | 'email' | 'tel' | 'numeric'
  autoComplete?: string
  /** doble tipeo del celular: no se puede pegar (igual que PRISMA) */
  noPaste?: boolean
  adornment?: React.ReactNode
}) {
  const bloquear = (e: React.SyntheticEvent) => e.preventDefault()
  return (
    <div>
      <label htmlFor={id} className="block text-sm font-semibold text-navy">
        {label} {required && <span className="text-action" aria-hidden>*</span>}
      </label>
      <div className="relative mt-1.5">
        <input
          id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur}
          placeholder={placeholder} required={required} inputMode={inputMode} autoComplete={autoComplete}
          aria-invalid={!!error} aria-describedby={error ? `${id}-error` : hint ? `${id}-hint` : undefined}
          onPaste={noPaste ? bloquear : undefined} onDrop={noPaste ? bloquear : undefined}
          className={`homy-glass-input w-full rounded-xl px-4 py-2.5 text-[15px] outline-none ${adornment ? 'pr-12' : ''} ${error ? '!border-red-400 ring-2 ring-red-400/40' : ''}`}
        />
        {adornment && <div className="absolute inset-y-0 right-1 flex items-center">{adornment}</div>}
      </div>
      {error ? <FieldError id={`${id}-error`} msg={error} /> : hint ? <p id={`${id}-hint`} className="mt-1.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
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
      <span className={`mt-0.5 max-w-full truncate text-xs font-semibold ${uploaded ? 'text-[#0e9f6e]' : 'text-slate-400'}`}>
        {uploaded ? 'Listo' : name ? name : 'Foto o captura'}
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
