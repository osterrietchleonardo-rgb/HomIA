import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, requireAuth, parseBody } from '@/lib/api'
import { db } from '@/lib/db'

// Guarda ubicación compartida por el usuario (mapa de pines)
export async function PUT(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const parsed = await parseBody(req, z.object({
    lat: z.number().finite().min(-90).max(90).optional(),
    lng: z.number().finite().min(-180).max(180).optional(),
    radiusKm: z.number().finite().min(1).max(500).optional(),
    locationShared: z.boolean().optional(),
  }))
  if (parsed.error) return parsed.error
  const { lat, lng, radiusKm, locationShared } = parsed.data

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
