'use client'
// Perfil profesional KYC: datos personales, persona|empresa, profesiones, habilidades y verificación de identidad (DNI)
import { useEffect, useState } from 'react'
import { Loading, AvatarUploader, VerifyBadge } from '@/components/app/ui-bits'
import { useSession } from '@/lib/store'
import { navigate } from '@/lib/router'
import { toast } from 'sonner'
import { BadgeCheck, ShieldCheck, UserRound, BriefcaseBusiness, ArrowRight, HandCoins } from 'lucide-react'
import { DeleteAccountCard } from '@/components/app/delete-account-card'
import { AvisosMailCard } from '@/components/screens/panel/avisos-mail-card'

const CATEGORIES = [
  { slug: 'plomeria', name: 'Plomería' },
  { slug: 'gasistas', name: 'Gasistas' },
  { slug: 'electricistas', name: 'Electricistas' },
  { slug: 'albanileria', name: 'Albañilería' },
  { slug: 'pintura', name: 'Pintura' },
  { slug: 'carpinteria', name: 'Carpintería' },
  { slug: 'herreria', name: 'Herrería' },
  { slug: 'limpieza', name: 'Limpieza' },
  { slug: 'jardineria', name: 'Jardinería' },
  { slug: 'climatizacion', name: 'Climatización' },
  { slug: 'techos', name: 'Techos' },
  { slug: 'cerramientos', name: 'Cerramientos' },
]

export default function ProProfile() {
  const { user, refresh } = useSession()
  // la insignia pública sale del usuario (verificación por DNI + IA), no del perfil
  const isVerified = user?.verificationStatus === 'verificado'
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  // usuario
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [city, setCity] = useState('')
  const [email, setEmail] = useState('')
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null)

  // profesional
  const [personType, setPersonType] = useState<'persona' | 'empresa'>('persona')
  const [professions, setProfessions] = useState<string[]>([])
  const [skillsText, setSkillsText] = useState('')
  const [experienceYears, setExperienceYears] = useState('0')
  const [bio, setBio] = useState('')
  const [dniCuil, setDniCuil] = useState('')
  const [companyName, setCompanyName] = useState('')
  const [companyCuit, setCompanyCuit] = useState('')
  const [companyWebsite, setCompanyWebsite] = useState('')
  const [employeesCount, setEmployeesCount] = useState('1')
  const [serviceRadiusKm, setServiceRadiusKm] = useState(15)

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/profiles/me')
        if (res.ok) {
          const data = await res.json()
          const u = data.user
          if (u) {
            setDisplayName(u.displayName || '')
            setPhone(u.phone || '')
            setCity(u.city || '')
            setEmail(u.email || '')
            setAvatarUrl(u.avatarUrl || null)
            const pro = u.professional
            if (pro) {
              setPersonType(pro.personType === 'empresa' ? 'empresa' : 'persona')
              try { setProfessions(JSON.parse(pro.professions || '[]')) } catch { /* vacío */ }
              try { setSkillsText((JSON.parse(pro.skills || '[]') as string[]).join(', ')) } catch { /* vacío */ }
              setExperienceYears(String(pro.experienceYears ?? 0))
              setBio(pro.bio || '')
              setDniCuil(pro.dniCuil || '')
              setCompanyName(pro.companyName || '')
              setCompanyCuit(pro.companyCuit || '')
              setCompanyWebsite(pro.companyWebsite || '')
              setEmployeesCount(String(pro.employeesCount ?? 1))
              setServiceRadiusKm(pro.serviceRadiusKm ?? 15)
            }
          }
        }
      } finally { setLoading(false) }
    })()
  }, [])

  function toggleProfession(slug: string) {
    setProfessions((cur) => (cur.includes(slug) ? cur.filter((s) => s !== slug) : [...cur, slug]))
  }

  async function save() {
    if (professions.length === 0) { toast.error('Elegí al menos una profesión'); return }
    setBusy(true)
    try {
      const payload: Record<string, unknown> = {
        displayName: displayName.trim(),
        phone: phone.trim(),
        city: city.trim(),
        personType,
        professions,
        skills: skillsText.split(',').map((s) => s.trim()).filter(Boolean),
        experienceYears: parseInt(experienceYears) || 0,
        bio: bio.trim(),
        serviceRadiusKm,
        dniCuil: personType === 'persona' ? dniCuil.trim() : undefined,
        companyName: personType === 'empresa' ? companyName.trim() : undefined,
        companyCuit: personType === 'empresa' ? companyCuit.trim() : undefined,
        companyWebsite: personType === 'empresa' ? companyWebsite.trim() : undefined,
        employeesCount: personType === 'empresa' ? parseInt(employeesCount) || 1 : undefined,
      }
      const res = await fetch('/api/profiles/me', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      await refresh()
      toast.success('Perfil actualizado')
    } finally { setBusy(false) }
  }

  if (loading) return <Loading />

  const skillsPreview = skillsText.split(',').map((s) => s.trim()).filter(Boolean)

  return (
    <div className="homy-page">
      <div className="max-w-3xl mx-auto">
        {/* Encabezado */}
        <header className="homy-page-head">
          <div className="min-w-0">
            <span className="homy-eyebrow">Perfil</span>
            <h1 className="homy-page-title mt-1.5">Mi perfil profesional</h1>
            <p className="homy-page-sub">Cuanto más completo, más presupuestos aceptás.</p>
          </div>
          {isVerified ? (
            <span className="homy-pill shrink-0"><BadgeCheck className="size-3.5 text-emerald-600" aria-hidden /> Verificado</span>
          ) : (
            <span className="homy-pill shrink-0"><ShieldCheck className="size-3.5 text-amber-600" aria-hidden /> Sin verificar</span>
          )}
        </header>

        <div className="homy-stagger space-y-5">
          {/* HomIA es gratis para clientes y profesionales: los planes de pago son solo para proveedores */}
          <section className="homy-glass-soft rounded-2xl p-4 flex items-start gap-3">
            <span className="homy-icon-chip homy-chip-mint size-9 shrink-0 [&_svg]:size-4" aria-hidden><BadgeCheck /></span>
            <p className="text-[13px] leading-relaxed text-slate-600">
              <b>Usar HomIA es gratis para clientes y profesionales.</b> Las suscripciones de pago son solo para proveedores
              (14 días gratis, después Básico $50.000/mes o PRO $100.000/mes). Cuando alguien paga por Mercado Pago, suma un cargo de servicio HomIA del 1% que paga quien compra (vos cobrás el 100% de tu factura): es lo que financia la plataforma, la IA y las búsquedas que te traen trabajos.
            </p>
          </section>

          {/* Mercado Pago y facturas viven en Cobros: un solo lugar para conectar y cobrar */}
          <button
            onClick={() => navigate('/panel/profesional/cobros')}
            className="homy-glass homy-lift homy-focus flex w-full min-h-[44px] items-center gap-3 rounded-2xl p-4 text-left"
          >
            <span className="homy-icon-chip homy-chip-gold size-10 shrink-0 [&_svg]:size-5" aria-hidden><HandCoins /></span>
            <span className="min-w-0 flex-1">
              <span className="block font-extrabold text-[#0A2540]">Cobros y Mercado Pago</span>
              <span className="mt-0.5 block text-[13px] leading-snug text-slate-500">Conectá tu Mercado Pago, mirá lo cobrado y lo pendiente y confirmá los pagos en efectivo.</span>
            </span>
            <ArrowRight className="size-4 shrink-0 text-slate-300" aria-hidden />
          </button>

          {/* identidad */}
          <section className="homy-glass rounded-3xl p-5 sm:p-6">
            <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-4">
              <span className="homy-icon-chip homy-chip-blue size-8 [&_svg]:size-4" aria-hidden><UserRound /></span>
              Datos de contacto
            </h2>
            <div className="flex items-center gap-4 mb-5 rounded-2xl homy-glass-soft p-4">
              <AvatarUploader
                name={displayName || email}
                url={avatarUrl}
                size={56}
                onUpload={async (url) => {
                  const res = await fetch('/api/profiles/me', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ avatarUrl: url })
                  })
                  if (res.ok) {
                    await refresh()
                    toast.success('Foto actualizada')
                  } else {
                    toast.error('No se pudo guardar la foto')
                  }
                }}
              />
              <div className="min-w-0">
                <p className="font-bold text-[#0A2540] line-clamp-1">{displayName || 'Tu nombre'}</p>
                <p className="text-xs text-slate-400 line-clamp-1">{email || '—'} · el email no se puede cambiar</p>
              </div>
            </div>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Nombre y apellido" value={displayName} onChange={setDisplayName} placeholder="Ej: Juan Pérez" />
              <Field label="Celular" value={phone} onChange={setPhone} placeholder="+54 9 …" />
              <Field label="Ciudad" value={city} onChange={setCity} placeholder="Ej: Córdoba" />
            </div>
          </section>

          {/* perfil profesional */}
          <section className="homy-glass rounded-3xl p-5 sm:p-6">
            <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-4">
              <span className="homy-icon-chip homy-chip-orange size-8 [&_svg]:size-4" aria-hidden><BriefcaseBusiness /></span>
              Tu perfil profesional
            </h2>

            {/* persona | empresa */}
            <div className="grid grid-cols-2 gap-1 rounded-full homy-glass-soft p-1 mb-5 max-w-sm">
              {(['persona', 'empresa'] as const).map((t) => (
                <button key={t} type="button" onClick={() => setPersonType(t)} aria-pressed={personType === t}
                  className={`rounded-full py-2 min-h-[40px] text-sm font-bold capitalize transition ${personType === t ? 'bg-gradient-to-br from-[#103455] to-[#0A2540] text-white shadow-lg shadow-[#0A2540]/25' : 'text-slate-400 hover:text-slate-600'}`}>
                  {t === 'persona' ? 'Persona' : 'Empresa'}
                </button>
              ))}
            </div>

            <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2.5">Oficios (elegí uno o varios)</p>
            <div className="flex flex-wrap gap-2 mb-2.5">
              {CATEGORIES.map((c) => (
                <button key={c.slug} type="button" onClick={() => toggleProfession(c.slug)} aria-pressed={professions.includes(c.slug)}
                  className="homy-tab">
                  {c.name}
                </button>
              ))}
            </div>
            {professions.length > 0 && (
              <p className="text-xs text-slate-400 mb-5">
                {professions.length} de {CATEGORIES.length} seleccionado{professions.length === 1 ? '' : 's'} — aparecen en tu ficha pública.
              </p>
            )}
            {professions.length === 0 && <div className="mb-5" />}

            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Habilidades (separadas por comas)" value={skillsText} onChange={setSkillsText} placeholder="plomería en general, instalador termotanques…" />
              <Field label="Años de experiencia" value={experienceYears} onChange={setExperienceYears} type="number" placeholder="5" />
            </div>
            {skillsPreview.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-2.5">
                {skillsPreview.map((s) => (
                  <span key={s} className="homy-glass-soft rounded-full px-3 py-1 text-xs font-bold text-slate-600">{s}</span>
                ))}
              </div>
            )}

            <div className="mt-4">
              <label className="text-xs font-bold text-slate-500 uppercase tracking-wide" htmlFor="pro-bio">Bio</label>
              <textarea id="pro-bio" value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
                placeholder="Contá tu experiencia, especialidades y por qué contratarte…"
                className="homy-glass-input mt-1.5 w-full rounded-xl px-4 py-3 text-sm resize-none" />
            </div>

            {personType === 'persona' ? (
              <div className="mt-4">
                <Field label="DNI / CUIL" value={dniCuil} onChange={setDniCuil} placeholder="Ej: 30.456.789" />
              </div>
            ) : (
              <div className="grid gap-4 sm:grid-cols-2 mt-4">
                <Field label="Razón social" value={companyName} onChange={setCompanyName} placeholder="Ej: Pérez Instalaciones SRL" />
                <Field label="CUIT" value={companyCuit} onChange={setCompanyCuit} placeholder="Ej: 30-71234567-9" />
                <Field label="Sitio web" value={companyWebsite} onChange={setCompanyWebsite} placeholder="https://…" />
                <Field label="Cantidad de empleados" value={employeesCount} onChange={setEmployeesCount} type="number" placeholder="3" />
              </div>
            )}

            <div className="mt-6 rounded-2xl homy-glass-soft p-4">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <label className="text-xs font-bold text-slate-500 uppercase tracking-wide" htmlFor="pro-radius">Radio de servicio</label>
                <p className="text-lg font-extrabold text-[#1D63B8] tabular-nums leading-none">{serviceRadiusKm} km</p>
              </div>
              <input id="pro-radius" type="range" min={1} max={100} value={serviceRadiusKm} onChange={(e) => setServiceRadiusKm(parseInt(e.target.value))}
                className="homy-range w-full mt-3 block" style={{ '--range-progress': `${serviceRadiusKm}%` } as React.CSSProperties}
                aria-label="Radio de servicio en kilómetros" />
              <p className="text-xs text-slate-400 mt-1.5">A qué distancia aceptás trabajar. Los clientes te ven dentro de este radio.</p>
            </div>

            <button onClick={save} disabled={busy}
              className="homy-btn-dark mt-5 min-h-[48px] w-full sm:w-auto px-8 py-3 disabled:opacity-60">
              {busy ? 'Guardando…' : 'Guardar perfil'}
            </button>
          </section>

          {/* verificación de identidad: el flujo completo (subida + IA) vive en /verificacion */}
          <section className="homy-glass rounded-3xl p-5 sm:p-6">
            <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-1">
              <span className="homy-icon-chip homy-chip-mint size-8 [&_svg]:size-4" aria-hidden><ShieldCheck /></span>
              Verificación de identidad
            </h2>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-2xl homy-glass-soft p-4">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold text-[#0A2540]">Estado de tu DNI</p>
                  <VerifyBadge status={user?.verificationStatus || 'none'} compact={false} />
                </div>
                <p className="mt-1 text-[13px] leading-relaxed text-slate-500">
                  {isVerified
                    ? 'Tu insignia de verificado se ve junto a tu nombre en toda la comunidad.'
                    : 'Subí el frente y el dorso de tu DNI: la IA lo analiza y tu insignia aparece junto a tu nombre.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => navigate('/panel/profesional/verificacion')}
                className="homy-btn-dark homy-focus min-h-[44px] px-5 py-2.5 text-sm"
              >
                {isVerified ? 'Ver verificación' : 'Verificar mi identidad'}
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </div>
          </section>

          <AvisosMailCard role="profesional" />

          {/* Ley 25.326: derecho de supresión (D19) */}
          <DeleteAccountCard />
        </div>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="homy-glass-input mt-1.5 w-full rounded-xl px-4 py-2.5 text-sm" />
    </div>
  )
}
