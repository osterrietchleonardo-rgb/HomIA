'use client'
// Estado global HomIA: sesión + ubicación
import { create } from 'zustand'

export type SessionUserClient = {
  id: string
  email: string
  displayName: string
  roles: string[]
  avatarUrl?: string | null
  verificationStatus?: string
  verifiedAt?: string | null
  hasProfessional: boolean
  hasProvider: boolean
  lat?: number | null
  lng?: number | null
  radiusKm?: number | null
}

type SessionStore = {
  user: SessionUserClient | null
  loading: boolean
  /** Pide la sesión al servidor YA (después de login, registro o editar el perfil). */
  refresh: () => Promise<void>
  /** Revalidación en segundo plano al montar una pantalla: se suma al pedido en
   *  curso o no hace nada si la sesión se confirmó hace menos de 30 s. Nunca
   *  muestra pantalla de carga (no toca `loading`). */
  revalidate: () => Promise<void>
  logout: () => Promise<void>
}

// Un solo GET /api/auth/me a la vez. Los llamados que llegan en la MISMA tanda
// (AppRoot + carrito + Homy al arrancar la app) se suman al pedido en curso; uno
// posterior (p. ej. después del login) siempre pide de nuevo.
let meInflight: Promise<void> | null = null
let meJoinable = false
let meFetchedAt = 0
const ME_FRESH_MS = 30_000

export const useSession = create<SessionStore>((set, get) => ({
  user: null,
  loading: true,
  refresh: () => {
    if (meInflight && meJoinable) return meInflight
    meJoinable = true
    setTimeout(() => { meJoinable = false }, 0)
    const p = fetchMe(set).finally(() => {
      meFetchedAt = Date.now()
      if (meInflight === p) meInflight = null
    })
    meInflight = p
    return p
  },
  revalidate: () => {
    if (meInflight) return meInflight
    if (meFetchedAt && Date.now() - meFetchedAt < ME_FRESH_MS) return Promise.resolve()
    return get().refresh()
  },
  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    meFetchedAt = 0
    meSeq++ // un /me en curso de antes del logout ya no escribe
    set({ user: null })
  },
}))

// cada pedido lleva un número: si uno viejo (p. ej. de antes del login) llega tarde,
// no pisa al más nuevo
let meSeq = 0
async function fetchMe(set: (s: Partial<SessionStore>) => void) {
  const seq = ++meSeq
  try {
    const res = await fetch('/api/auth/me')
    const data = await res.json()
    if (seq !== meSeq) return
    set({ user: data.user ?? null, loading: false })
    // “Todo tiene sentido”: si el usuario ya compartió su ubicación alguna vez,
    // el mapa, los radios y las distancias vuelven a funcionar sin re-pedir permiso.
    const u: SessionUserClient | null = data.user ?? null
    if (u?.lat != null && u?.lng != null) {
      const loc = useLocation.getState()
      if (loc.lat == null || loc.lng == null) loc.setManual(u.lat, u.lng)
      if (u.radiusKm != null && u.radiusKm > 0 && loc.radiusKm === 10) {
        useLocation.getState().setRadius(u.radiusKm)
      }
    }
  } catch {
    if (seq === meSeq) set({ user: null, loading: false })
  }
}

type LocationStore = {
  lat: number | null
  lng: number | null
  radiusKm: number
  shared: boolean
  error: string | null
  requesting: boolean
  request: () => Promise<boolean>
  setRadius: (km: number) => void
  setManual: (lat: number, lng: number) => void
  disable: () => void
}

export const useLocation = create<LocationStore>((set, get) => ({
  lat: null,
  lng: null,
  radiusKm: 10,
  shared: false,
  error: null,
  requesting: false,
  request: () =>
    new Promise((resolve) => {
      if (!('geolocation' in navigator)) {
        set({ error: 'Tu navegador no soporta geolocalización' })
        resolve(false)
        return
      }
      set({ requesting: true })
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          set({
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            shared: true,
            requesting: false,
            error: null,
          })
          resolve(true)
        },
        (err) => {
          set({
            error:
              err.code === err.PERMISSION_DENIED
                ? 'Permiso de ubicación denegado'
                : 'No pudimos obtener tu ubicación',
            requesting: false,
          })
          resolve(false)
        },
        { enableHighAccuracy: true, timeout: 10000 }
      )
    }),
  setRadius: (km) => set({ radiusKm: km }),
  setManual: (lat, lng) => set({ lat, lng, shared: true }),
  disable: () => set({ shared: false }),
}))

// Persistencia de ubicación al servidor cuando el usuario la comparte
export async function syncLocationToServer(lat: number, lng: number, radiusKm: number) {
  try {
    await fetch('/api/users/location', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lat, lng, radiusKm, locationShared: true }),
    })
  } catch {
    // silencioso: la ubicación local sigue funcionando
  }
}
