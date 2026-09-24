'use client'
// Estado compartido de la conversación con Homy: el buscador de la home, el
// botón flotante, la mascota del panel y /buscar hablan con el MISMO agente y
// comparten la sesión (persistida en HomySession; el id vive en localStorage).
import { useEffect } from 'react'
import { create } from 'zustand'
import { useSession } from '@/lib/store'
import type { Accion, Cupo, EventoHomy, Puerta, Tarjeta, TurnoGuardado } from '@/lib/homy/tipos'

export type Turno = {
  id: string
  rol: 'user' | 'homy'
  texto: string
  tarjetas?: Tarjeta[]
  acciones?: Accion[]
  sugerencias?: string[]
  pregunta?: string | null
  pasos?: string[]
  estado: 'streaming' | 'listo' | 'error' | 'limite'
  degradado?: boolean
}

export type OpcionesPregunta = {
  puerta: Puerta
  pagina?: string | null
  rolPanel?: 'cliente' | 'profesional' | 'proveedor' | null
  lat?: number | null
  lng?: number | null
}

type Estado = {
  duenio: string | null
  sessionId: string | null
  turnos: Turno[]
  cupo: Cupo | null
  ocupado: boolean
  historialCargado: boolean
  /** Enlaza el store con el usuario actual (cambia de sesión si cambia el usuario). */
  usarDuenio: (userId: string | null) => void
  cargarHistorial: () => Promise<void>
  /** Devuelve el id del turno de Homy que se va a completar. */
  preguntar: (texto: string, o: OpcionesPregunta) => Promise<string | null>
  nuevaConversacion: () => void
}

const LS_VISITANTE = 'homy_visitante_v1'
const lsSesion = (duenio: string) => `homy_sesion_v1:${duenio}`

function leerLS(k: string): string | null {
  try { return localStorage.getItem(k) } catch { return null }
}
function escribirLS(k: string, v: string | null) {
  try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v) } catch { /* modo privado */ }
}

/** Token aleatorio del visitante (su navegador): prueba que la sesión es suya. */
function tokenVisitante(): string {
  let t = leerLS(LS_VISITANTE)
  if (!t || !/^[A-Za-z0-9_-]{16,80}$/.test(t)) {
    const bytes = new Uint8Array(24)
    crypto.getRandomValues(bytes)
    t = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    escribirLS(LS_VISITANTE, t)
  }
  return t
}

let n = 0
const nuevoId = () => `t-${Date.now()}-${n++}`

export const useHomy = create<Estado>((set, get) => ({
  duenio: null,
  sessionId: null,
  turnos: [],
  cupo: null,
  ocupado: false,
  historialCargado: false,

  usarDuenio: (userId) => {
    const duenio = userId || 'visitante'
    if (get().duenio === duenio) return
    set({ duenio, sessionId: leerLS(lsSesion(duenio)), turnos: [], cupo: null, historialCargado: false })
  },

  cargarHistorial: async () => {
    const { sessionId, historialCargado, duenio } = get()
    if (historialCargado) return
    set({ historialCargado: true })
    try {
      const qs = sessionId ? `?sessionId=${encodeURIComponent(sessionId)}` : ''
      const res = await fetch(`/api/homy/agent${qs}`, { headers: { 'x-homy-visitante': tokenVisitante() } })
      if (!res.ok) return
      const data = (await res.json()) as { turnos: TurnoGuardado[]; sessionId: string | null; cupo: Cupo | null }
      if (get().duenio !== duenio) return
      if (sessionId && !data.sessionId && duenio) escribirLS(lsSesion(duenio), null)
      // si ya hay turnos nuevos (preguntó antes de que llegue el historial), van después
      set((s) => ({
        cupo: data.cupo ?? s.cupo,
        sessionId: data.sessionId ?? s.sessionId,
        turnos: [
          ...data.turnos.map((t) => ({ ...t, estado: 'listo' as const })),
          ...s.turnos.filter((t) => !data.turnos.some((d) => d.id === t.id)),
        ],
      }))
    } catch { /* sin historial: se arranca de cero */ }
  },

  nuevaConversacion: () => {
    const d = get().duenio
    if (d) escribirLS(lsSesion(d), null)
    set({ sessionId: null, turnos: [] })
  },

  preguntar: async (texto, o) => {
    const limpio = texto.trim()
    if (limpio.length < 2 || get().ocupado) return null
    const idHomy = nuevoId()
    set((s) => ({
      ocupado: true,
      turnos: [
        ...s.turnos,
        { id: nuevoId(), rol: 'user', texto: limpio, estado: 'listo' },
        { id: idHomy, rol: 'homy', texto: '', pasos: [], estado: 'streaming' },
      ],
    }))
    const actualizar = (f: (t: Turno) => Turno) =>
      set((s) => ({ turnos: s.turnos.map((t) => (t.id === idHomy ? f(t) : t)) }))

    try {
      const res = await fetch('/api/homy/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-homy-visitante': tokenVisitante() },
        body: JSON.stringify({
          mensaje: limpio.slice(0, 600),
          puerta: o.puerta,
          sessionId: get().sessionId,
          pagina: o.pagina ?? null,
          rolPanel: o.rolPanel ?? null,
          lat: o.lat ?? null,
          lng: o.lng ?? null,
        }),
      })
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}))
        actualizar((t) => ({ ...t, texto: (data as { error?: string }).error || 'No pude procesar la consulta. Probá de nuevo.', estado: 'error' }))
        return idHomy
      }
      const reader = res.body.getReader()
      const dec = new TextDecoder()
      let buf = ''
      const procesar = (ev: EventoHomy) => {
        if (ev.t === 'inicio') {
          if (ev.cupo) set({ cupo: ev.cupo })
        } else if (ev.t === 'paso') {
          actualizar((t) => ({ ...t, pasos: [...(t.pasos || []), ev.texto] }))
        } else if (ev.t === 'texto') {
          actualizar((t) => ({ ...t, texto: t.texto + ev.delta }))
        } else if (ev.t === 'texto_reinicio') {
          actualizar((t) => ({ ...t, texto: '' }))
        } else if (ev.t === 'final') {
          const d = get().duenio
          if (ev.sessionId && d) escribirLS(lsSesion(d), ev.sessionId)
          set({ sessionId: ev.sessionId, cupo: ev.cupo ?? get().cupo })
          actualizar((t) => ({
            ...t, texto: ev.mensaje, tarjetas: ev.tarjetas, acciones: ev.acciones, sugerencias: ev.sugerencias,
            pregunta: ev.pregunta, degradado: ev.degradado, estado: 'listo',
          }))
        } else if (ev.t === 'limite') {
          set({ cupo: ev.cupo })
          actualizar((t) => ({ ...t, texto: ev.mensaje, acciones: ev.acciones, estado: 'limite' }))
        } else if (ev.t === 'error') {
          actualizar((t) => ({ ...t, texto: ev.mensaje, estado: 'error' }))
        }
      }
      for (;;) {
        const { done, value } = await reader.read()
        if (done) break
        buf += dec.decode(value, { stream: true })
        let i: number
        while ((i = buf.indexOf('\n')) !== -1) {
          const linea = buf.slice(0, i).trim()
          buf = buf.slice(i + 1)
          if (!linea) continue
          try { procesar(JSON.parse(linea) as EventoHomy) } catch { /* línea rota: se ignora */ }
        }
      }
      // si el stream se cortó sin evento final
      actualizar((t) => (t.estado === 'streaming' ? { ...t, texto: t.texto || 'Se cortó la respuesta. Probá de nuevo.', estado: 'error' } : t))
    } catch {
      actualizar((t) => ({ ...t, texto: 'No pude conectarme. Revisá tu conexión y probá de nuevo.', estado: 'error' }))
    } finally {
      set({ ocupado: false })
    }
    return idHomy
  },
}))

/**
 * Enlaza la conversación con el usuario de la sesión (o "visitante"). En la
 * landing estática nadie pide la sesión: la pedimos acá una sola vez.
 */
export function useDuenioHomy() {
  const { user, loading } = useSession()
  const usarDuenio = useHomy((s) => s.usarDuenio)
  useEffect(() => {
    if (loading && !pedida) {
      pedida = true
      void useSession.getState().refresh()
    }
  }, [loading])
  useEffect(() => {
    if (!loading) usarDuenio(user?.id ?? null)
  }, [loading, user?.id, usarDuenio])
  return { user, loading }
}
let pedida = false

/** Ruta SPA actual (hash) para "volver" y para el contexto de la pantalla. */
export function rutaActual(): string {
  if (typeof window === 'undefined') return '/'
  return window.location.hash.replace(/^#/, '') || '/'
}
