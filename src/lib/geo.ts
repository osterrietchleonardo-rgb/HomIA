// Utilidades geográficas (SQLite no tiene PostGIS: distancia haversine en JS)
export function haversineKm(
  lat1: number, lng1: number, lat2: number, lng2: number
): number {
  const R = 6371
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLng = ((lng2 - lng1) * Math.PI) / 180
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export type WithGeo = { lat?: number | null; lng?: number | null }

export function withinRadius<T extends WithGeo>(
  items: T[],
  centerLat: number | null | undefined,
  centerLng: number | null | undefined,
  radiusKm: number
): (T & { distanceKm?: number })[] {
  if (!centerLat || !centerLng) return items
  return items
    .map((it) => ({
      ...it,
      distanceKm:
        it.lat && it.lng ? haversineKm(centerLat, centerLng, it.lat, it.lng) : undefined,
    }))
    .filter((it) => it.distanceKm === undefined || it.distanceKm <= radiusKm)
    .sort((a, b) => (a.distanceKm ?? 9999) - (b.distanceKm ?? 9999))
}

export function formatDistance(km?: number): string {
  if (km === undefined) return ''
  return km < 1 ? `${Math.round(km * 1000)} m` : `${km.toFixed(1)} km`
}
