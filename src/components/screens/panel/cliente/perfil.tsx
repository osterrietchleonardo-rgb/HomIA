'use client'
// Perfil del cliente: datos personales + ubicación
import { useEffect, useId, useRef, useState } from 'react'
import { Loading, AvatarUploader, VerifyBadge } from '@/components/app/ui-bits'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { navigate } from '@/lib/router'
import { apiFetch, NETWORK_ERROR } from '@/lib/api-client'
import { DeleteAccountCard } from '@/components/app/delete-account-card'
import { toast } from 'sonner'
import { MapPin, UserRound, Phone, Building2, Cake, Save, ShieldCheck, ArrowRight, RefreshCw } from 'lucide-react'
import { AvisosMailCard } from '@/components/screens/panel/avisos-mail-card'

export default function ClientProfile() {
  const { user, refresh } = useSession()
  const location = useLocation()
  const [displayName, setDisplayName] = useState('')
  const [phone, setPhone] = useState('')
  const [address, setAddress] = useState('')
  const [city, setCity] = useState('')
  const [birthday, setBirthday] = useState('')
  const [busy, setBusy] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [nameError, setNameError] = useState<string | null>(null)
  // slider de radio: se muestra en vivo pero se guarda al soltar (debounce 500 ms)
  const [radiusDraft, setRadiusDraft] = useState<number | null>(null)
  const radiusTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  async function loadProfile() {
    setLoadError(null)
    const r = await apiFetch<{ user?: { displayName?: string; phone?: string; address?: string; city?: string; birthday?: string } }>('/api/profiles/me', { silent: true })
    if (r.ok) {
      const u = r.data?.user
      if (u) {
        setDisplayName(u.displayName || '')
        setPhone(u.phone || '')
        setAddress(u.address || '')
        setCity(u.city || '')
        setBirthday((u.birthday || '').slice(0, 10))
      }
    } else {
      setLoadError(r.error || NETWORK_ERROR)
    }
    setLoaded(true)
  }
  useEffect(() => { loadProfile() }, [])
  useEffect(() => () => { if (radiusTimer.current) clearTimeout(radiusTimer.current) }, [])

  function validateName(v: string): string | null {
    const t = v.trim()
    if (!t) return 'Tu nombre es obligatorio: es lo que ven los profesionales'
    if (t.length < 2) return 'El nombre tiene que tener al menos 2 letras'
    if (t.length > 80) return 'El nombre es demasiado largo'
    return null
  }

  async function save() {
    const err = validateName(displayName)
    setNameError(err)
    if (err) { toast.error(err); return }
    setBusy(true)
    try {
      const r = await apiFetch('/api/profiles/me', {
        method: 'PUT',
        json: { displayName: displayName.trim(), phone, address, city, birthday },
      })
      if (!r.ok) return
      await refresh()
      toast.success('Perfil actualizado')
    } finally { setBusy(false) }
  }

  function onRadiusChange(km: number) {
    setRadiusDraft(km)
    location.setRadius(km)
    if (radiusTimer.current) clearTimeout(radiusTimer.current)
    radiusTimer.current = setTimeout(() => {
      if (location.lat && location.lng) syncLocationToServer(location.lat, location.lng, km)
      setRadiusDraft(null)
    }, 500)
  }

  if (!loaded) return <Loading />
  const radius = radiusDraft ?? location.radiusKm
  const vStatus = user?.verificationStatus || 'none'

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Cuenta</span>
          <h1 className="homy-page-title mt-1.5">Mi perfil</h1>
          <p className="homy-page-sub">Datos de tu cuenta y ubicación</p>
        </div>
      </header>

      <div className="max-w-2xl mx-auto space-y-5">
        {loadError && (
          <div role="alert" className="homy-glass-soft rounded-2xl border border-red-300/60 p-4 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-600">No pudimos cargar tus datos: {loadError}</p>
            <button onClick={() => { setLoaded(false); loadProfile() }} className="homy-btn-dark min-h-[40px] px-4 text-sm">
              <RefreshCw className="size-4" aria-hidden /> Reintentar
            </button>
          </div>
        )}

        {/* estado de verificación de identidad (nunca se oculta) */}
        <button type="button" onClick={() => navigate('/panel/cliente/verificacion')}
          className="homy-glass homy-lift homy-focus group flex w-full items-center gap-3.5 rounded-2xl p-4 text-left">
          <span className={`homy-icon-chip size-10 shrink-0 [&_svg]:size-5 ${vStatus === 'verificado' ? 'homy-chip-mint' : 'homy-chip-gold'}`} aria-hidden><ShieldCheck /></span>
          <span className="min-w-0 flex-1">
            <span className="flex flex-wrap items-center gap-2 text-sm font-extrabold text-[#0A2540]">
              Verificación de identidad <VerifyBadge status={vStatus} />
            </span>
            <span className="mt-0.5 block text-[12.5px] leading-snug text-slate-500">
              {vStatus === 'verificado'
                ? 'Tu DNI está verificado: los profesionales ven tu check verde.'
                : vStatus === 'en_revision'
                  ? 'Tu DNI está en revisión. Te avisamos cuando termine.'
                  : vStatus === 'rechazado'
                    ? 'La verificación no pasó: revisá el motivo y volvé a subir tu DNI.'
                    : 'Subí frente y dorso de tu DNI para mostrar el check verde.'}
            </span>
          </span>
          <ArrowRight className="size-5 shrink-0 text-slate-300 transition-transform duration-300 group-hover:translate-x-1 group-hover:text-[#1D63B8]" aria-hidden />
        </button>

        {/* identidad + datos */}
        <section className="homy-glass rounded-3xl p-6 sm:p-7">
          <div className="flex items-center gap-4">
            <AvatarUploader
              name={displayName || user?.displayName || ''}
              url={user?.avatarUrl}
              size={64}
              onUpload={async (url) => {
                const r = await apiFetch('/api/profiles/me', { method: 'PUT', json: { avatarUrl: url } })
                if (r.ok) {
                  await refresh()
                  toast.success('Foto actualizada')
                }
              }}
            />
            <div className="min-w-0">
              <p className="truncate font-extrabold text-[#0A2540]">{user?.email}</p>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                {user?.roles.map((r) => (
                  <span key={r} className="homy-pill capitalize">
                    <span className="homy-pill-dot bg-[#1D63B8]" aria-hidden />
                    {r}
                  </span>
                ))}
              </div>
            </div>
          </div>

          <div className="homy-section-head mt-7 !mb-4 border-t border-[#0A2540]/5 pt-6">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><UserRound /></span>
              Datos personales
            </h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nombre y apellido" value={displayName} required error={nameError}
              onChange={(v) => { setDisplayName(v); if (nameError) setNameError(validateName(v)) }}
              onBlur={() => setNameError(validateName(displayName))} icon={<UserRound />} />
            <Field label="Celular" value={phone} onChange={setPhone} placeholder="+54 9 …" type="tel" icon={<Phone />} />
            <Field label="Dirección" value={address} onChange={setAddress} icon={<MapPin />} />
            <Field label="Ciudad" value={city} onChange={setCity} icon={<Building2 />} />
            <Field label="Cumpleaños" value={birthday} onChange={setBirthday} type="date" icon={<Cake />} />
          </div>

          <div className="mt-7 flex justify-end border-t border-[#0A2540]/5 pt-5">
            <button onClick={save} disabled={busy} className="homy-btn-primary homy-focus w-full py-3.5 text-[0.95rem] sm:w-auto sm:px-8">
              <Save className="size-4" aria-hidden /> {busy ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </section>

        {/* ubicación */}
        <section className="homy-glass rounded-3xl p-6">
          <div className="homy-section-head !mb-3">
            <h2 className="homy-section-title">
              <span className="homy-icon-chip homy-chip-ai size-8 shrink-0 [&_svg]:size-4" aria-hidden><MapPin /></span>
              Ubicación
            </h2>
            {location.shared && <span className="homy-pill"><span className="homy-pill-dot bg-emerald-500" aria-hidden /> Compartida</span>}
          </div>
          {location.shared ? (
            <>
              <p className="text-sm text-slate-500">
                Radio de búsqueda <span className="font-bold text-[#0A2540] tabular-nums">{radius} km</span>
              </p>
              <input
                type="range" min={1} max={100} value={radius}
                onChange={(e) => onRadiusChange(parseInt(e.target.value))}
                className="homy-range mt-3 w-full"
                style={{ '--range-progress': `${((radius - 1) / 99) * 100}%` } as React.CSSProperties}
                aria-label="Radio de búsqueda en kilómetros" />
              <div className="mt-1 flex justify-between text-[0.68rem] font-bold text-slate-400 tabular-nums">
                <span>1 km</span>
                <span>100 km</span>
              </div>
            </>
          ) : (
            <>
              <p className="text-sm leading-relaxed text-slate-500">
                Compartila para ver profesionales cerca tuyo y ajustar el radio de búsqueda.
              </p>
              <button onClick={async () => { const ok = await location.request(); if (ok && location.lat && location.lng) syncLocationToServer(location.lat, location.lng, location.radiusKm) }} className="homy-btn-dark mt-4 px-5 py-3 text-sm sm:py-2.5">
                <MapPin className="size-4" aria-hidden /> Compartir mi ubicación
              </button>
            </>
          )}
        </section>

        <AvisosMailCard role="cliente" />

        {/* Ley 25.326: derecho de supresión (D19) */}
        <DeleteAccountCard />
      </div>
    </div>
  )
}

function Field({ label, value, onChange, onBlur, type = 'text', placeholder, icon, required, error }: {
  label: string; value: string; onChange: (v: string) => void; onBlur?: () => void; type?: string
  placeholder?: string; icon?: React.ReactNode; required?: boolean; error?: string | null
}) {
  const id = useId()
  const errId = `${id}-error`
  return (
    <div>
      <label htmlFor={id} className="flex items-center gap-2 text-sm font-semibold text-[#0A2540]">
        {icon && <span className="text-slate-400 [&_svg]:size-4" aria-hidden>{icon}</span>}
        {label}
        {required && <span className="text-[#FF5A1F]" aria-hidden>*</span>}
      </label>
      <input id={id} type={type} value={value} onChange={(e) => onChange(e.target.value)} onBlur={onBlur} placeholder={placeholder}
        required={required} aria-invalid={!!error} aria-describedby={error ? errId : undefined}
        className={`homy-glass-input mt-2 w-full rounded-xl px-4 py-3 outline-none ${error ? 'ring-1 ring-red-400' : ''}`} />
      {error && <p id={errId} role="alert" className="mt-1.5 text-xs font-semibold text-red-600">{error}</p>}
    </div>
  )
}
