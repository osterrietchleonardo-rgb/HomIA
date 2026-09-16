import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// GET: mis vinculaciones (proveedor ve las suyas; profesional ve las suyas)
export async function GET() {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)

  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })

  const asProvider = prov
    ? await db.providerLink.findMany({
        where: { providerId: prov.id },
        include: {
          professional: {
            include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
          },
        },
        orderBy: { createdAt: 'desc' },
      })
    : []

  const asProfessional = pro
    ? await db.providerLink.findMany({
        where: { professionalId: pro.id, active: true },
        include: {
          provider: { include: { user: { select: { id: true, displayName: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      })
    : []

  return ok({
    asProvider: asProvider.map((l) => ({
      id: l.id,
      accountLabel: l.accountLabel,
      notes: l.notes,
      active: l.active,
      createdAt: l.createdAt,
      professional: {
        id: l.professional.id,
        displayName: l.professional.user.displayName,
        avatarUrl: l.professional.user.avatarUrl,
        personType: l.professional.personType,
        companyName: l.professional.companyName,
        professions: safeParse(l.professional.professions),
      },
    })),
    asProfessional: asProfessional.map((l) => ({
      id: l.id,
      accountLabel: l.accountLabel,
      notes: l.notes,
      active: l.active,
      createdAt: l.createdAt,
      provider: {
        id: l.provider.id,
        businessName: l.provider.businessName,
        city: l.provider.city,
        rating: l.provider.rating,
      },
    })),
  })
}

function safeParse(s: string): string[] {
  try { return JSON.parse(s) as string[] } catch { return [] }
}

// POST: crear vinculación con cuenta de retiro
// - proveedor vincula a un profesional por email
// - profesional solicita vinculación con proveedor por email
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const d = await body<{ email: string; accountLabel: string; notes?: string }>(req)
  if (!d.email || !d.accountLabel) return fail('Email y nombre de cuenta son obligatorios')

  const target = await db.user.findUnique({
    where: { email: d.email.trim().toLowerCase() },
    include: { professional: true, provider: true },
  })
  if (!target) return fail('No encontramos un usuario con ese email. Debe estar registrado en HomIA.', 404)

  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })

  if (prov) {
    // Yo soy proveedor → vinculo al profesional target
    if (!target.professional) return fail('Ese usuario no tiene perfil profesional', 400)
    const dup = await db.providerLink.findFirst({ where: { providerId: prov.id, professionalId: target.professional.id } })
    if (dup) return fail('Ya existe esa vinculación', 409)
    const link = await db.providerLink.create({
      data: {
        providerId: prov.id,
        professionalId: target.professional.id,
        accountLabel: d.accountLabel,
        notes: d.notes || null,
      },
    })
    await db.notification.create({
      data: {
        userId: target.id,
        type: 'vinculacion_creada',
        title: 'Te vincularon con un proveedor',
        body: `${prov.businessName} creó la cuenta de retiro "${d.accountLabel}" para vos`,
        link: '#/panel/profesional/vinculaciones',
      },
    })
    return ok({ link }, 201)
  }

  if (pro) {
    // Yo soy profesional → solicito cuenta de retiro con el proveedor target
    if (!target.provider) return fail('Ese usuario no tiene perfil de proveedor', 400)
    const dup = await db.providerLink.findFirst({ where: { providerId: target.provider.id, professionalId: pro.id } })
    if (dup) return fail('Ya existe esa vinculación', 409)
    const link = await db.providerLink.create({
      data: {
        providerId: target.provider.id,
        professionalId: pro.id,
        accountLabel: d.accountLabel,
        notes: d.notes || null,
      },
    })
    await db.notification.create({
      data: {
        userId: target.id,
        type: 'vinculacion_solicitada',
        title: 'Un profesional quiere tu cuenta de retiro',
        body: `${user.displayName} creó la cuenta "${d.accountLabel}"`,
        link: '#/panel/proveedor/vinculaciones',
      },
    })
    return ok({ link }, 201)
  }

  return fail('Necesitás perfil de proveedor o profesional para vincular cuentas', 403)
}

// PATCH: activar/desactivar
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const { id, active } = await body<{ id: string; active: boolean }>(req)
  if (!id) return fail('Falta el id')
  const link = await db.providerLink.findUnique({
    where: { id },
    include: { provider: true, professional: true },
  })
  if (!link) return fail('Vinculación no encontrada', 404)
  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })
  const isOwner = (prov && link.providerId === prov.id) || (pro && link.professionalId === pro.id)
  if (!isOwner) return fail('Sin permiso', 403)
  await db.providerLink.update({ where: { id }, data: { active } })
  return ok({ success: true })
}
