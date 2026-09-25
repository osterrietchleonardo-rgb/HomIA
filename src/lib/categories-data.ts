// Rubros de HomIA (datos puros, sin React): los usa la pantalla (categories.ts) y el
// conocimiento de Homy (src/lib/homy/conocimiento.ts), que corre en el servidor.
export type Category = { slug: string; name: string; icon: string }

/** Espejo de las 22 categorías de scripts/catalogo (maestro + expansión 3) (fallback offline). */
export const CATEGORIES_FALLBACK: Category[] = [
  { slug: 'albanileria', name: 'Corralón · Albañilería', icon: 'brick-wall' },
  { slug: 'durlock', name: 'Durlock · Chapa seca', icon: 'panels-top-left' },
  { slug: 'plomeria', name: 'Sanitarios · Plomería', icon: 'droplets' },
  { slug: 'gasistas', name: 'Gas · Gasistas', icon: 'flame' },
  { slug: 'electricistas', name: 'Electricidad', icon: 'zap' },
  { slug: 'iluminacion', name: 'Iluminación', icon: 'lightbulb' },
  { slug: 'pintura', name: 'Pinturería', icon: 'paint-roller' },
  { slug: 'herreria', name: 'Ferretería · Herrería', icon: 'wrench' },
  { slug: 'herramientas', name: 'Herramientas', icon: 'hammer' },
  { slug: 'maderera', name: 'Maderera', icon: 'tree-pine' },
  { slug: 'carpinteria', name: 'Carpintería · Herrajes', icon: 'ruler' },
  { slug: 'techos', name: 'Techos · Impermeabilización', icon: 'house' },
  { slug: 'cerramientos', name: 'Aberturas · Cerramientos', icon: 'door-open' },
  { slug: 'pisos', name: 'Pisos · Revestimientos', icon: 'layout-grid' },
  { slug: 'aislacion', name: 'Aislación', icon: 'layers' },
  { slug: 'climatizacion', name: 'Climatización', icon: 'air-vent' },
  { slug: 'jardineria', name: 'Jardín y Exterior', icon: 'leaf' },
  { slug: 'limpieza', name: 'Limpieza · Mantenimiento', icon: 'spray-can' },
  { slug: 'muebles', name: 'Muebles · Equipamiento', icon: 'armchair' },
  { slug: 'seguridad', name: 'Seguridad · Protección', icon: 'shield-check' },
  { slug: 'electrodomesticos', name: 'Electrodomésticos · Repuestos', icon: 'washing-machine' },
  { slug: 'plagas', name: 'Control de plagas', icon: 'bug' },
]
