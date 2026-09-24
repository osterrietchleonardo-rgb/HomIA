'use client'
// Carrito HomIA (cliente) — store compartido por toda la app: el contador del
// header, el panel del carrito, los botones "Agregar al carrito" y la pantalla
// /carrito leen y escriben acá, así el contador se actualiza en todos lados.
//   · Usuario logueado que compra (cliente o profesional): el carrito vive en la
//     base (/api/cart) y sincroniza entre dispositivos.
//   · Visitante sin cuenta: vive en localStorage (`homia_cart_v1`) y se muestra
//     con /api/cart/preview. Al iniciar sesión se fusiona con el de la cuenta.
//   · Proveedor puro: no compra, no tiene carrito.
import { create } from 'zustand'
import { useEffect } from 'react'
import { toast } from 'sonner'
import { useSession, type SessionUserClient } from '@/lib/store'

export type CartProblem = 'no_existe' | 'sin_stock' | 'stock_insuficiente' | 'proveedor_inactivo' | 'propio'
export type CartLine = {
  id: string
  stockId: string
  quantity: number
  price: number
  lineTotal: number
  available: number
  step: number
  brand: string | null
  imageUrl: string | null
  element: { id: string; name: string; unit: string; categoryName: string } | null
  problem: CartProblem | null
  problemText: string | null
}
export type CartGroup = {
  provider: { id: string; businessName: string; userId: string; avatarUrl: string | null; city: string | null; mpConnected: boolean; operating: boolean }
  items: CartLine[]
  subtotal: number
  serviceFee: number
  blocked: boolean
}
export type CartView = {
  groups: CartGroup[]
  orphans: CartLine[]
  count: number
  subtotal: number
  serviceFee: number
  totalMp: number
  blocked: boolean
}

type LocalItem = { stockId: string; quantity: number; name?: string }
type Mode = 'visitante' | 'cuenta' | 'sin_carrito'

const LS_KEY = 'homia_cart_v1'
let lastSyncKey: string | null = null

function readLocal(): LocalItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY)
    const arr = raw ? (JSON.parse(raw) as LocalItem[]) : []
    return Array.isArray(arr) ? arr.filter((i) => i && typeof i.stockId === 'string' && Number(i.quantity) > 0).slice(0, 60) : []
  } catch {
    return []
  }
}
function writeLocal(items: LocalItem[]) {
  try {
    if (items.length) localStorage.setItem(LS_KEY, JSON.stringify(items))
    else localStorage.removeItem(LS_KEY)
  } catch { /* modo privado / almacenamiento bloqueado: el carrito queda en memoria */ }
}

export function canBuyRoles(roles: string[] | undefined | null): boolean {
  return !!roles && (roles.includes('cliente') || roles.includes('profesional'))
}

type Result = { ok: true } | { ok: false; error: string; status?: number }

type CartStore = {
  mode: Mode
  userId: string | null
  view: CartView | null
  local: LocalItem[]
  loading: boolean
  open: boolean
  setOpen: (v: boolean) => void
  /** se llama cuando cambia la sesión (login, logout, cambio de usuario) */
  sync: (user: SessionUserClient | null) => Promise<void>
  refresh: () => Promise<void>
  add: (stockId: string, quantity: number, meta?: { name?: string }) => Promise<Result>
  setQty: (stockId: string, quantity: number) => Promise<Result>
  remove: (stockId: string) => Promise<Result>
  clear: () => Promise<Result>
}

async function readJson(res: Response): Promise<{ cart?: CartView; error?: string } & Record<string, unknown>> {
  try { return await res.json() } catch { return {} }
}

async function preview(items: LocalItem[]): Promise<CartView | null> {
  if (!items.length) return { groups: [], orphans: [], count: 0, subtotal: 0, serviceFee: 0, totalMp: 0, blocked: false }
  try {
    const res = await fetch('/api/cart/preview', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items: items.map(({ stockId, quantity }) => ({ stockId, quantity })) }),
    })
    const d = await readJson(res)
    return res.ok && d.cart ? d.cart : null
  } catch {
    return null
  }
}

export const useCart = create<CartStore>((set, get) => ({
  mode: 'visitante',
  userId: null,
  view: null,
  local: [],
  loading: false,
  open: false,
  setOpen: (v) => set({ open: v }),

  sync: async (user) => {
    // montado en más de un lugar: la misma sesión se sincroniza (y fusiona) una sola vez
    const key = user ? `${user.id}:${user.roles.join(',')}` : 'visitante'
    if (key === lastSyncKey) return
    lastSyncKey = key
    if (!user) {
      const local = readLocal()
      set({ mode: 'visitante', userId: null, local, loading: true })
      const view = await preview(local)
      set({ view, loading: false })
      return
    }
    if (!canBuyRoles(user.roles)) {
      set({ mode: 'sin_carrito', userId: user.id, view: null, local: [], loading: false })
      return
    }
    set({ mode: 'cuenta', userId: user.id, loading: true })
    // carrito del visitante → se fusiona con el de la cuenta (una sola vez)
    const local = readLocal()
    if (local.length) {
      try {
        const res = await fetch('/api/cart/merge', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ items: local.map(({ stockId, quantity }) => ({ stockId, quantity })) }),
        })
        if (res.ok) {
          writeLocal([])
          const d = await readJson(res)
          set({ view: d.cart || null, local: [], loading: false })
          return
        }
      } catch { /* se reintenta en la próxima sincronización */ }
    }
    await get().refresh()
  },

  refresh: async () => {
    const { mode } = get()
    if (mode === 'sin_carrito') return
    if (mode === 'visitante') {
      const local = readLocal()
      set({ local, loading: true })
      set({ view: await preview(local), loading: false })
      return
    }
    set({ loading: true })
    try {
      const res = await fetch('/api/cart')
      const d = await readJson(res)
      if (res.ok && d.cart) set({ view: d.cart })
    } catch { /* silencioso: queda la última vista */ } finally {
      set({ loading: false })
    }
  },

  add: async (stockId, quantity, meta) => {
    const { mode } = get()
    if (mode === 'sin_carrito') return { ok: false, error: 'El carrito es para clientes y profesionales' }
    if (mode === 'visitante') {
      const local = readLocal()
      const i = local.findIndex((x) => x.stockId === stockId)
      if (i >= 0) local[i] = { ...local[i], quantity: Math.round((local[i].quantity + quantity) * 100) / 100 }
      else {
        if (local.length >= 60) return { ok: false, error: 'Tu carrito llegó al máximo de 60 productos' }
        local.push({ stockId, quantity, name: meta?.name })
      }
      writeLocal(local)
      const view = await preview(local)
      const line = view?.groups.flatMap((g) => g.items).find((l) => l.stockId === stockId)
      set({ local, view })
      if (line?.problem === 'stock_insuficiente') return { ok: false, error: `Solo quedan ${line.available} ${line.element?.unit || ''} de ese producto` }
      return { ok: true }
    }
    return mutate(set, '/api/cart', 'POST', { stockId, quantity })
  },

  setQty: async (stockId, quantity) => {
    const { mode } = get()
    if (mode === 'visitante') {
      const local = readLocal().map((x) => (x.stockId === stockId ? { ...x, quantity } : x))
      writeLocal(local)
      set({ local, view: await preview(local) })
      return { ok: true }
    }
    return mutate(set, '/api/cart', 'PATCH', { stockId, quantity })
  },

  remove: async (stockId) => {
    const { mode } = get()
    if (mode === 'visitante') {
      const local = readLocal().filter((x) => x.stockId !== stockId)
      writeLocal(local)
      set({ local, view: await preview(local) })
      return { ok: true }
    }
    return mutate(set, `/api/cart?stockId=${encodeURIComponent(stockId)}`, 'DELETE')
  },

  clear: async () => {
    const { mode } = get()
    if (mode === 'visitante') {
      writeLocal([])
      set({ local: [], view: await preview([]) })
      return { ok: true }
    }
    return mutate(set, '/api/cart', 'DELETE')
  },
}))

async function mutate(
  set: (p: Partial<CartStore>) => void,
  url: string,
  method: 'POST' | 'PATCH' | 'DELETE',
  body?: Record<string, unknown>
): Promise<Result> {
  try {
    const res = await fetch(url, {
      method,
      headers: body ? { 'Content-Type': 'application/json' } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    })
    const d = await readJson(res)
    if (!res.ok) return { ok: false, error: d.error || 'No pudimos actualizar el carrito', status: res.status }
    if (d.cart) set({ view: d.cart })
    return { ok: true }
  } catch {
    return { ok: false, error: 'No pudimos conectar. Reintentá' }
  }
}

/**
 * "Agregar al carrito" de toda la app: agrega, avisa con un toast breve (con el
 * atajo "Ver carrito") y el contador se actualiza solo. El panel NO se abre solo.
 */
export async function addToCart(stockId: string, quantity: number, name: string): Promise<boolean> {
  const st = useCart.getState()
  if (st.mode === 'sin_carrito') {
    toast.info('El carrito es para clientes y profesionales', { description: 'Con tu cuenta de proveedor vendés; para comprar, sumá el perfil de cliente.' })
    return false
  }
  const r = await st.add(stockId, quantity, { name })
  if (!r.ok) {
    toast.error(r.error)
    return false
  }
  toast.success('Agregado al carrito', {
    description: `${name} × ${quantity}`,
    duration: 2500,
    action: { label: 'Ver carrito', onClick: () => useCart.getState().setOpen(true) },
  })
  return true
}

/** Cantidad de productos (líneas) del carrito para el contador. */
export function useCartCount(): number {
  return useCart((s) => s.view?.count ?? (s.mode === 'visitante' ? s.local.length : 0))
}

let sessionAsked = false

/**
 * Mantiene el carrito sincronizado con la sesión. Montalo una vez por árbol
 * (AppRoot y el header de la landing). En la landing nadie pide la sesión:
 * si sigue "cargando", se pide acá una sola vez.
 */
export function useCartSync() {
  const { user, loading } = useSession()
  useEffect(() => {
    if (loading && !sessionAsked) {
      sessionAsked = true
      void useSession.getState().refresh()
    }
  }, [loading])
  const key = loading ? 'cargando' : user ? `${user.id}:${user.roles.join(',')}` : 'visitante'
  useEffect(() => {
    if (key === 'cargando') return
    void useCart.getState().sync(useSession.getState().user)
  }, [key])
  // otra pestaña cambió el carrito del visitante
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY && useCart.getState().mode === 'visitante') void useCart.getState().refresh()
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])
}
