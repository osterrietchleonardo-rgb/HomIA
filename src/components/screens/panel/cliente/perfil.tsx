'use client'
// Perfil del cliente: datos personales + ubicación
import { useEffect, useState } from 'react'
import { Loading, UAvatar } from '@/components/app/ui-bits'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { toast } from 'sonner'
import { MapPin, UserRound, Phone, Building2, Cake, Save } from 'lucide-react'

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

  useEffect(() => {
    (async () => {
      const res = await fetch('/api/profiles/me')
      if (res.ok) {
        const data = await res.json()
        if (data.user) {
          setDisplayName(data.user.displayName || '')
          setPhone(data.user.phone || '')
          setAddress(data.user.address || '')
          setCity(data.user.city || '')
          setBirthday((data.user.birthday || '').slice(0, 10))
        }
      }
      setLoaded(true)
    })()
  }, [])

  async function save() {
    setBusy(true)
    try {
      const res = await fetch('/api/profiles/me', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ displayName, phone, address, city, birthday }),
      })
      if (!res.ok) { toast.error((await res.json()).error); return }
      await refresh()
      toast.success('Perfil actualizado')
    } finally { setBusy(false) }
  }

  if (!loaded) return <Loading />

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
        {/* identidad + datos */}
        <section className="homy-glass rounded-3xl p-6 sm:p-7">
          <div className="flex items-center gap-4">
            <UAvatar name={displayName || user?.displayName || ''} url={user?.avatarUrl} size={64} />
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
            <Field label="Nombre y apellido" value={displayName} onChange={setDisplayName} icon={<UserRound />} />
            <Field label="Celular" value={phone} onChange={setPhone} placeholder="+54 9 …" icon={<Phone />} />
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
                Radio de búsqueda <span className="font-bold text-[#0A2540] tabular-nums">{location.radiusKm} km</span>
              </p>
              <input
                type="range" min={1} max={100} value={location.radiusKm}
                onChange={(e) => { location.setRadius(parseInt(e.target.value)); if (location.lat && location.lng) syncLocationToServer(location.lat, location.lng, parseInt(e.target.value)) }}
                className="homy-range mt-3 w-full"
                style={{ '--range-progress': `${((location.radiusKm - 1) / 99) * 100}%` } as React.CSSProperties}
                aria-label="Radio de búsqueda" />
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
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder, icon }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string; icon?: React.ReactNode }) {
  return (
    <div>
      <label className="flex items-center gap-2 text-sm font-semibold text-[#0A2540]">
        {icon && <span className="text-slate-400 [&_svg]:size-4" aria-hidden>{icon}</span>}
        {label}
      </label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="homy-glass-input mt-2 w-full rounded-xl px-4 py-3 outline-none" />
    </div>
  )
}
