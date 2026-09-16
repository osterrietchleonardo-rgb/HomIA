import { NextRequest } from 'next/server'
import { ok, requireAuth, body } from '@/lib/api'
import { db } from '@/lib/db'

// Guarda ubicación compartida por el usuario (mapa de pines)
export async function PUT(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const { lat, lng, radiusKm, locationShared } = await body<{
    lat?: number; lng?: number; radiusKm?: number; locationShared?: boolean
  }>(req)

  const data: Record<string, unknown> = {}
  if (lat !== undefined && lng !== undefined) { data.lat = lat; data.lng = lng }
  if (radiusKm !== undefined) data.searchRadiusKm = radiusKm
  if (locationShared !== undefined) data.locationShared = locationShared

  // Sincroniza perfil profesional si existe
  const pro = await db.professionalProfile.findUnique({ where: { userId: auth.user.id } })
  if (pro && lat !== undefined && lng !== undefined) {
    await db.professionalProfile.update({
      where: { userId: auth.user.id },
      data: { lat, lng },
    })
  }

  await db.user.update({ where: { id: auth.user.id }, data })
  return ok({ success: true })
}
