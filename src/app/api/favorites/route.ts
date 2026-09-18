import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// Favoritos HomIA — marcar/desmarcar cualquier usuario (profesional,
// proveedor u otro cliente) desde el directorio o su perfil.
// GET: lista de mis favoritos (ids + datos para el filtro del directorio).
// POST: toggle { targetUserId } → { favorito: bool }

export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const rows = await db.favorite.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: 'desc' },
  })
  const targets = await db.user.findMany({
    where: { id: { in: rows.map((f) => f.targetUserId) } },
    select: { id: true, displayName: true, avatarUrl: true, verificationStatus: true },
  })
  const tMap = new Map(targets.map((t) => [t.id, t]))
  return ok({
    favorites: rows.map((f) => {
      const t = tMap.get(f.targetUserId)
      return {
        targetUserId: f.targetUserId,
        displayName: t?.displayName || 'Usuario',
        avatarUrl: t?.avatarUrl || null,
        verificationStatus: t?.verificationStatus || 'none',
      }
    }),
    ids: rows.map((f) => f.targetUserId),
  })
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para guardar favoritos', 401)
  const d = await body<{ targetUserId?: string }>(req)
  if (!d.targetUserId) return fail('Falta el usuario a marcar')
  if (d.targetUserId === user.id) return fail('No podés marcarte como favorito a vos mismo')
  const target = await db.user.findUnique({ where: { id: d.targetUserId }, select: { id: true } })
  if (!target) return fail('Usuario no encontrado', 404)

  const existing = await db.favorite.findUnique({
    where: { userId_targetUserId: { userId: user.id, targetUserId: d.targetUserId } },
  })
  if (existing) {
    await db.favorite.delete({ where: { id: existing.id } })
    return ok({ favorito: false })
  }
  await db.favorite.create({ data: { userId: user.id, targetUserId: d.targetUserId } })
  return ok({ favorito: true }, 201)
}
