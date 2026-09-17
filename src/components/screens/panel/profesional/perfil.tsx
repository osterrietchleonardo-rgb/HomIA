'use client'
// Perfil profesional KYC: datos personales, persona|empresa, profesiones, habilidades y verificación de identidad (DNI)
import { useEffect, useState } from 'react'
import { PageHeader, StatusBadge, Loading, UAvatar } from '@/components/app/ui-bits'
import { useSession } from '@/lib/store'
import { toast } from 'sonner'
import { BadgeCheck, Upload, ShieldCheck, Loader2, UserRound, BriefcaseBusiness } from 'lucide-react'

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

type Doc = { id: string; type: string; frontUrl: string | null; backUrl: string | null; status: string; createdAt: string }

export default function ProProfile() {
  const { refresh } = useSession()
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
  const [verified, setVerified] = useState(false)

  // documentos
  const [documents, setDocuments] = useState<Doc[]>([])
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const [backFile, setBackFile] = useState<File | null>(null)
  const [uploadingDoc, setUploadingDoc] = useState(false)

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
            setDocuments(u.documents || [])
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
              setVerified(!!pro.verified)
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

  async function submitDocument() {
    if (!frontFile || !backFile) { toast.error('Subí el DNI frente y reverso'); return }
    setUploadingDoc(true)
    try {
      async function upload(file: File): Promise<string | null> {
        const form = new FormData()
        form.append('file', file)
        form.append('folder', 'dni')
        const res = await fetch('/api/uploads', { method: 'POST', body: form })
        if (!res.ok) { toast.error(`Error subiendo ${file.name}: ${(await res.json()).error}`); return null }
        return (await res.json()).url
      }
      const frontUrl = await upload(frontFile)
      const backUrl = await upload(backFile)
      if (!frontUrl || !backUrl) return
      const res = await fetch('/api/profiles/documents', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'dni', frontUrl, backUrl }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      toast.success('DNI enviado — queda en revisión por el equipo de HomIA')
      setFrontFile(null); setBackFile(null)
      const me = await fetch('/api/profiles/me')
      if (me.ok) setDocuments((await me.json()).user?.documents || [])
    } finally { setUploadingDoc(false) }
  }

  if (loading) return <Loading />

  return (
    <div className="max-w-3xl">
      <PageHeader
        title="Mi perfil profesional"
        subtitle="Cuanto más completo, más presupuestos aceptás"
        right={
          verified ? (
            <span className="homy-pill"><BadgeCheck className="size-3.5 text-[#1D63B8]" aria-hidden /> Verificado</span>
          ) : (
            <span className="homy-pill"><ShieldCheck className="size-3.5 text-amber-600" aria-hidden /> Sin verificar</span>
          )
        }
      />

      <div className="space-y-5">
        {/* identidad */}
        <section className="homy-glass rounded-2xl p-5 sm:p-6">
          <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-4">
            <span className="homy-icon-chip homy-chip-blue size-8 [&_svg]:size-4" aria-hidden><UserRound /></span>
            Datos de contacto
          </h2>
          <div className="flex items-center gap-4 mb-4">
            <UAvatar name={displayName || email} url={avatarUrl} size={56} />
            <div className="min-w-0">
              <p className="font-bold text-[#0A2540] line-clamp-1">{email || '—'}</p>
              <p className="text-xs text-slate-400">El email no se puede cambiar</p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Nombre y apellido" value={displayName} onChange={setDisplayName} placeholder="Ej: Juan Pérez" />
            <Field label="Celular" value={phone} onChange={setPhone} placeholder="+54 9 …" />
            <Field label="Ciudad" value={city} onChange={setCity} placeholder="Ej: Córdoba" />
          </div>
        </section>

        {/* perfil profesional */}
        <section className="homy-glass rounded-2xl p-5 sm:p-6">
          <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-4">
            <span className="homy-icon-chip homy-chip-orange size-8 [&_svg]:size-4" aria-hidden><BriefcaseBusiness /></span>
            Tu perfil profesional
          </h2>

          {/* persona | empresa */}
          <div className="grid grid-cols-2 gap-1 rounded-full homy-glass-soft p-1 mb-4 max-w-sm">
            {(['persona', 'empresa'] as const).map((t) => (
              <button key={t} type="button" onClick={() => setPersonType(t)}
                className={`rounded-full py-2 text-sm font-bold capitalize transition ${personType === t ? 'homy-glass text-[#0A2540] shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}>
                {t === 'persona' ? 'Persona' : 'Empresa'}
              </button>
            ))}
          </div>

          <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Profesiones (elegí una o varias)</p>
          <div className="flex flex-wrap gap-2 mb-5">
            {CATEGORIES.map((c) => {
              const active = professions.includes(c.slug)
              return (
                <button key={c.slug} type="button" onClick={() => toggleProfession(c.slug)} aria-pressed={active}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-bold transition ${active ? 'bg-[#1D63B8] text-white shadow-lg shadow-[#1D63B8]/25' : 'homy-glass-soft text-slate-500 hover:text-[#1D63B8]'}`}>
                  {c.name}
                </button>
              )
            })}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Habilidades (separadas por comas)" value={skillsText} onChange={setSkillsText} placeholder="plomería en general, instalador termotanques…" />
            <Field label="Años de experiencia" value={experienceYears} onChange={setExperienceYears} type="number" placeholder="5" />
          </div>
          <div className="mt-4">
            <label className="text-sm font-semibold text-[#0A2540]">Bio</label>
            <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3}
              placeholder="Contá tu experiencia, especialidades y por qué contratarte…"
              className="homy-glass-input mt-1 w-full rounded-xl px-4 py-3 text-sm resize-none" />
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

          <div className="mt-5">
            <label className="text-xs font-bold text-slate-500 uppercase tracking-wide">Radio de servicio: {serviceRadiusKm} km</label>
            <input type="range" min={1} max={100} value={serviceRadiusKm} onChange={(e) => setServiceRadiusKm(parseInt(e.target.value))}
              className="homy-range w-full max-w-sm mt-2 block" style={{ '--range-progress': `${serviceRadiusKm}%` } as React.CSSProperties}
              aria-label="Radio de servicio en kilómetros" />
            <p className="text-xs text-slate-400 mt-1">A qué distancia aceptás trabajar. Los clientes te ven dentro de este radio.</p>
          </div>

          <button onClick={save} disabled={busy}
            className="homy-btn-dark mt-5 w-full sm:w-auto px-8 py-3 disabled:opacity-60">
            {busy ? 'Guardando…' : 'Guardar perfil'}
          </button>
        </section>

        {/* verificación de identidad */}
        <section className="homy-glass rounded-2xl p-5 sm:p-6">
          <h2 className="flex items-center gap-2.5 font-extrabold text-[#0A2540] tracking-tight mb-1">
            <span className="homy-icon-chip homy-chip-mint size-8 [&_svg]:size-4" aria-hidden><ShieldCheck /></span>
            Documentos — verificación de identidad
          </h2>
          <p className="text-sm text-slate-500 mb-4">Subí tu DNI (frente y reverso) para obtener el sello de verificado. Solo lo ve el equipo de HomIA.</p>

          {documents.length > 0 && (
            <div className="space-y-2 mb-4">
              {documents.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl homy-glass-soft p-3.5">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="flex gap-1.5 shrink-0">
                      {d.frontUrl && (
                        <img src={d.frontUrl} alt="DNI frente" className="size-10 rounded-lg object-cover border border-slate-200" />
                      )}
                      {d.backUrl && (
                        <img src={d.backUrl} alt="DNI reverso" className="size-10 rounded-lg object-cover border border-slate-200" />
                      )}
                    </div>
                    <p className="text-sm font-bold text-[#0A2540] capitalize">DNI</p>
                  </div>
                  <StatusBadge status={d.status} />
                </div>
              ))}
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">DNI — frente</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setFrontFile(e.target.files?.[0] || null)}
                className="homy-glass-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-[#1D63B8] file:text-white file:px-3 file:py-1.5 file:text-xs file:font-bold" />
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">DNI — reverso</span>
              <input type="file" accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(e) => setBackFile(e.target.files?.[0] || null)}
                className="homy-glass-input mt-1 w-full rounded-xl px-3 py-2.5 text-sm text-slate-500 file:mr-3 file:rounded-full file:border-0 file:bg-[#1D63B8] file:text-white file:px-3 file:py-1.5 file:text-xs file:font-bold" />
            </label>
          </div>
          <button onClick={submitDocument} disabled={uploadingDoc || !frontFile || !backFile}
            className="homy-btn-primary mt-4 px-6 py-2.5 text-sm disabled:opacity-40">
            {uploadingDoc ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Upload className="size-4" aria-hidden />}
            {uploadingDoc ? 'Subiendo…' : 'Enviar DNI para verificación'}
          </button>
        </section>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-sm font-semibold text-[#0A2540]">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="homy-glass-input mt-1 w-full rounded-xl px-4 py-2.5 text-sm" />
    </div>
  )
}
