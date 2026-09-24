// Formato HomIA: moneda ARS, fechas, textos
export function formatARS(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—'
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
}

export function formatDate(d: string | Date | null | undefined): string {
  if (!d) return '—'
  const date = typeof d === 'string' ? new Date(d) : d
  return new Intl.DateTimeFormat('es-AR', { day: '2-digit', month: 'short', year: 'numeric' }).format(date)
}

export function timeAgo(d: string | Date): string {
  const date = typeof d === 'string' ? new Date(d) : d
  const diff = Date.now() - date.getTime()
  const min = Math.floor(diff / 60000)
  if (min < 1) return 'ahora'
  if (min < 60) return `hace ${min} min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h} h`
  const days = Math.floor(h / 24)
  if (days < 30) return `hace ${days} día${days > 1 ? 's' : ''}`
  const months = Math.floor(days / 30)
  return `hace ${months} mes${months > 1 ? 'es' : ''}`
}

export function initials(name: string): string {
  if (!name) return ''
  return name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]?.toUpperCase())
    .join('')
}

export const URGENCY_LABEL: Record<string, string> = {
  baja: 'Tranquilo',
  normal: 'Normal',
  alta: 'Urgente',
  urgente: 'Muy urgente',
}

export const URGENCY_COLOR: Record<string, string> = {
  baja: 'bg-slate-100 text-slate-600',
  normal: 'bg-[#1D63B8]/10 text-[#1D63B8]',
  alta: 'bg-[#FF5A1F]/10 text-[#FF5A1F]',
  urgente: 'bg-red-100 text-red-600',
}

export function stars(rating: number): string {
  const full = Math.round(rating)
  return '★★★★★'.slice(0, full) + '☆☆☆☆☆'.slice(0, 5 - full)
}
