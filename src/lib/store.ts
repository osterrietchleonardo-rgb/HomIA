'use client'
// Estado global HomIA: sesión + ubicación
import { create } from 'zustand'

export type SessionUserClient = {
  id: string
  email: string
  displayName: string
  roles: string[]
  avatarUrl?: string | null
  hasProfessional: boolean
  hasProvider: boolean
}

type SessionStore = {
  user: SessionUserClient | null
  loading: boolean
  refresh: () => Promise<void>
  logout: () => Promise<void>
}

export const useSession = create<SessionStore>((set) => ({
  user: null,
  loading: true,
  refresh: async () => {
    try {
      const res = await fetch('/api/auth/me')
      const data = await res.json()
      set({ user: data.user ?? null, loading: false })
    } catch {
      set({ user: null, loading: false })
    }
  },
  logout: async () => {
    await fetch('/api/auth/logout', { method: 'POST' })
    set({ user: null })
  },
}))

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
