'use client'
// Perfil del cliente: datos personales + ubicación
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { PageHeader, Loading, UAvatar } from '@/components/app/ui-bits'
import { useSession, useLocation, syncLocationToServer } from '@/lib/store'
import { toast } from 'sonner'
import { MapPin } from 'lucide-react'

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
      toast.success('Perfil actualizado ✓')
    } finally { setBusy(false) }
  }

  if (!loaded) return <Loading />

  return (
    <div className="max-w-xl">
      <PageHeader title="Mi perfil" subtitle="Datos de tu cuenta y ubicación" />
      <div className="rounded-3xl homy-glass border border-slate-200 shadow-sm p-6 space-y-4">
        <div className="flex items-center gap-4">
          <UAvatar name={displayName || user?.displayName || ''} url={user?.avatarUrl} size={60} />
          <div>
            <p className="font-extrabold text-[#0A2540]">{user?.email}</p>
            <p className="text-xs text-slate-400 capitalize">Perfiles: {user?.roles.join(', ')}</p>
          </div>
        </div>
        <Field label="Nombre y apellido" value={displayName} onChange={setDisplayName} />
        <Field label="Celular" value={phone} onChange={setPhone} placeholder="+54 9 …" />
        <Field label="Dirección" value={address} onChange={setAddress} />
        <Field label="Ciudad" value={city} onChange={setCity} />
        <Field label="Cumpleaños" value={birthday} onChange={setBirthday} type="date" />

        <div className="rounded-2xl bg-[#00C4FF]/5 border border-[#00C4FF]/30 p-4">
          <p className="text-sm font-bold text-[#0A2540] flex items-center gap-2"><MapPin className="size-4 text-[#00C4FF]" /> Ubicación</p>
          {location.shared ? (
            <>
              <p className="text-xs text-slate-500 mt-1">Compartida · radio de búsqueda {location.radiusKm} km</p>
              <input type="range" min={1} max={100} value={location.radiusKm} onChange={(e) => { location.setRadius(parseInt(e.target.value)); if (location.lat && location.lng) syncLocationToServer(location.lat, location.lng, parseInt(e.target.value)) }} className="w-full accent-[#00C4FF] mt-1" aria-label="Radio de búsqueda" />
            </>
          ) : (
            <button onClick={async () => { const ok = await location.request(); if (ok && location.lat && location.lng) syncLocationToServer(location.lat, location.lng, location.radiusKm) }} className="mt-1 text-sm font-bold text-[#1D63B8] hover:underline">
              Compartir mi ubicación
            </button>
          )}
        </div>

        <button onClick={save} disabled={busy} className="w-full rounded-xl bg-[#0A2540] hover:bg-[#123455] disabled:opacity-60 text-white font-bold py-3.5 transition">
          {busy ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}

function Field({ label, value, onChange, type = 'text', placeholder }: { label: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string }) {
  return (
    <div>
      <label className="text-sm font-semibold text-[#0A2540]">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
        className="mt-1 w-full rounded-xl border border-slate-300 px-4 py-3 outline-none focus:border-[#1D63B8] focus:ring-2 focus:ring-[#1D63B8]/20" />
    </div>
  )
}
