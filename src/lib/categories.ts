'use client'
// Categorías (rubros) de HomIA — fuente única para bolsa, publicar y obras.
// Se leen de `GET /api/directory` (→ `categories`, 22 rubros de la DB, mismas
// que el catálogo maestro). Si la red falla se usa la lista espejo de
// scripts/catalogo/catalog-maestro.mjs para que los formularios nunca queden vacíos.
import { useEffect, useState } from 'react'
import {
  BrickWall, PanelsTopLeft, Droplets, Flame, Zap, Lightbulb, PaintRoller, Wrench, Hammer,
  TreePine, Ruler, House, DoorOpen, LayoutGrid, Layers, AirVent, Leaf, SprayCan, Armchair,
  ShieldCheck, WashingMachine, Bug, type LucideIcon,
} from 'lucide-react'

import { CATEGORIES_FALLBACK, type Category } from './categories-data'
export { CATEGORIES_FALLBACK, type Category }

const ICONS: Record<string, LucideIcon> = {
  'brick-wall': BrickWall, 'panels-top-left': PanelsTopLeft, droplets: Droplets, flame: Flame, zap: Zap,
  lightbulb: Lightbulb, 'paint-roller': PaintRoller, wrench: Wrench, hammer: Hammer, 'tree-pine': TreePine,
  ruler: Ruler, house: House, 'door-open': DoorOpen, 'layout-grid': LayoutGrid, layers: Layers,
  'air-vent': AirVent, leaf: Leaf, 'spray-can': SprayCan, armchair: Armchair, 'shield-check': ShieldCheck,
  'washing-machine': WashingMachine, bug: Bug,
}

export function categoryIcon(icon: string | undefined): LucideIcon {
  return (icon && ICONS[icon]) || Wrench
}

export function categoryName(cats: Category[], slug: string | null | undefined): string {
  if (!slug) return ''
  return cats.find((c) => c.slug === slug)?.name || CATEGORIES_FALLBACK.find((c) => c.slug === slug)?.name || slug
}

/**
 * Hook: traduce el slug de un rubro ("plomeria") a su nombre ("Sanitarios · Plomería").
 * Toda pantalla que MUESTRA un rubro pasa por acá: nunca se muestra el slug. Para varios
 * rubros juntos usar `.join(', ')` (los nombres ya llevan " · ").
 */
export function useRubroNombre(): (slug: string | null | undefined) => string {
  const { categories } = useCategories()
  return (slug) => categoryName(categories, slug)
}

// caché por sesión de pestaña: una sola request aunque haya varias pantallas
let cache: Category[] | null = null
let inflight: Promise<Category[]> | null = null

export async function fetchCategories(): Promise<Category[]> {
  if (cache) return cache
  if (inflight) return inflight
  inflight = (async () => {
    try {
      const res = await fetch('/api/directory?kind=all')
      if (res.ok) {
        const data = await res.json()
        const list = Array.isArray(data.categories) ? (data.categories as Category[]) : []
        if (list.length > 0) {
          cache = list.map((c) => ({ slug: c.slug, name: c.name, icon: c.icon || 'wrench' }))
          return cache
        }
      }
    } catch {
      /* sin red: fallback */
    } finally {
      inflight = null
    }
    return CATEGORIES_FALLBACK
  })()
  return inflight
}

/** Hook: devuelve el fallback al instante y lo reemplaza por la lista real de la DB. */
export function useCategories(): { categories: Category[]; loaded: boolean } {
  const [categories, setCategories] = useState<Category[]>(cache || CATEGORIES_FALLBACK)
  const [loaded, setLoaded] = useState(!!cache)
  useEffect(() => {
    let alive = true
    fetchCategories().then((list) => {
      if (!alive) return
      setCategories(list)
      setLoaded(true)
    })
    return () => { alive = false }
  }, [])
  return { categories, loaded }
}
