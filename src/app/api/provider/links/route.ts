import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody, parseJson } from '@/lib/api'
import { db } from '@/lib/db'
import { getSessionUser } from '@/lib/auth'

// Cuentas de retiro (ProviderLink): acuerdo entre un proveedor y un profesional
// para retirar materiales del local a cuenta de un proyecto. NO es una cuenta
// bancaria ni mueve plata: solo habilita al profesional frente a ese proveedor.
// Consentimiento: el vínculo lo activa SIEMPRE el proveedor. Si lo pide el
// profesional nace inactivo hasta que el proveedor lo apruebe.

type AsRole = 'profesional' | 'proveedor'
function pickRole(raw: string | null | undefined, hasPro: boolean, hasProv: boolean): AsRole | null {
  if (raw === 'profesional' && hasPro) return 'profesional'
  if (raw === 'proveedor' && hasProv) return 'proveedor'
  if (raw) return null
  // sin preferencia: el proveedor tiene prioridad (comportamiento histórico)
  if (hasProv) return 'proveedor'
  if (hasPro) return 'profesional'
  return null
}

// GET: mis vinculaciones. ?as=profesional|proveedor para usuarios con ambos perfiles.
// Devuelve ambas listas; `as` solo limita cuál se calcula.
export async function GET(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const as = req.nextUrl.searchParams.get('as')
  if (as && as !== 'profesional' && as !== 'proveedor') return fail('El parámetro "as" tiene que ser profesional o proveedor', 400)

  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })
  if (!prov && !pro) return fail('Necesitás perfil de proveedor o profesional para ver vinculaciones', 403)

  const wantProvider = !!prov && (!as || as === 'proveedor')
  const wantPro = !!pro && (!as || as === 'profesional')

  const asProvider = wantProvider
    ? await db.providerLink.findMany({
        where: { providerId: prov!.id },
        include: {
          professional: { include: { user: { select: { id: true, displayName: true, avatarUrl: true } } } },
        },
        orderBy: { createdAt: 'desc' },
      })
    : []

  // el profesional ve TODAS sus vinculaciones (activas, pendientes y pausadas):
  // pausar no hace desaparecer la cuenta
  const asProfessional = wantPro
    ? await db.providerLink.findMany({
        where: { professionalId: pro!.id },
        include: { provider: { select: { id: true, businessName: true, city: true, rating: true } } },
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
        professions: parseJson<string[]>(l.professional.professions, []),
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

const postSchema = z.object({
  email: z.string().trim().toLowerCase().email('Ingresá un email válido'),
  accountLabel: z.string().trim().min(2, 'Poné un nombre para la cuenta de retiro').max(80, 'El nombre puede tener hasta 80 caracteres'),
  notes: z.string().trim().max(500, 'Las notas pueden tener hasta 500 caracteres').optional(),
  as: z.enum(['profesional', 'proveedor']).optional(),
})

// POST: crear vinculación
// - proveedor vincula a un profesional por email → nace ACTIVA (la crea quien la aprueba)
// - profesional la solicita a un proveedor por email → nace INACTIVA hasta que el proveedor la active
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const parsed = await parseBody(req, postSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data

  const prov = await db.providerProfile.findUnique({ where: { userId: user.id } })
  const pro = await db.professionalProfile.findUnique({ where: { userId: user.id } })
  const role = pickRole(d.as ?? req.nextUrl.searchParams.get('as'), !!pro, !!prov)
  if (!role) return fail('Necesitás perfil de proveedor o profesional para vincular cuentas', 403)

  const target = await db.user.findUnique({
    where: { email: d.email },
    include: { professional: true, provider: true },
  })
  if (target?.id === user.id) return fail('No podés vincularte con vos mismo', 400)

  if (role === 'proveedor') {
    // mismo mensaje genérico exista o no el usuario: no se enumeran emails
    if (!target?.professional) return fail('No encontramos un profesional con ese email. Tiene que estar registrado en HomIA como profesional.', 400)
    const dup = await db.providerLink.findFirst({ where: { providerId: prov!.id, professionalId: target.professional.id } })
    if (dup) return fail('Ya existe esa vinculación', 409)
    const link = await db.providerLink.create({
      data: {
        providerId: prov!.id,
        professionalId: target.professional.id,
        accountLabel: d.accountLabel,
        notes: d.notes || null,
        active: true,
      },
    })
    await db.notification.create({
      data: {
        userId: target.id,
        type: 'vinculacion_creada',
        title: 'Un proveedor te habilitó para retirar materiales',
        body: `${prov!.businessName} creó la cuenta de retiro "${d.accountLabel}": podés retirar materiales a cuenta de tus proyectos`,
        link: '#/panel/profesional/vinculaciones',
      },
    })
    return ok({ link }, 201)
  }

  // role === 'profesional'
  if (!target?.provider) return fail('No encontramos un proveedor con ese email', 400)
  const dup = await db.providerLink.findFirst({ where: { providerId: target.provider.id, professionalId: pro!.id } })
  if (dup) return fail('Ya existe esa vinculación', 409)
  const link = await db.providerLink.create({
    data: {
      providerId: target.provider.id,
      professionalId: pro!.id,
      accountLabel: d.accountLabel,
      notes: d.notes || null,
      active: false,
    },
  })
  await db.notification.create({
    data: {
      userId: target.id,
      type: 'vinculacion_solicitada',
      title: 'Un profesional pide cuenta de retiro',
      body: `${user.displayName} quiere retirar materiales en tu local a cuenta de sus proyectos ("${d.accountLabel}"). Activala si estás de acuerdo.`,
      link: '#/panel/proveedor/vinculaciones',
    },
  })
  return ok({ link }, 201)
}

const patchSchema = z.object({
  id: z.string().min(1, 'Falta el id'),
  active: z.boolean({ message: 'El estado tiene que ser verdadero o falso' }),
})

// PATCH: activar/pausar. El proveedor activa y pausa; el profesional solo puede
// pausar la suya (no puede auto-aprobarse).
export async function PATCH(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const parsed = await parseBody(req, patchSchema)
  if (parsed.error) return parsed.error
  const { id, active } = parsed.data

  const link = await db.providerLink.findUnique({
    where: { id },
    include: {
      provider: { select: { id: true, userId: true, businessName: true } },
      professional: { select: { id: true, userId: true } },
    },
  })
  if (!link) return fail('Vinculación no encontrada', 404)
  const isProvider = link.provider.userId === user.id
  const isProfessional = link.professional.userId === user.id
  if (!isProvider && !isProfessional) return fail('Sin permiso', 403)
  if (!isProvider && active) return fail('Solo el proveedor puede activar la cuenta de retiro', 403)
  if (link.active === active) return ok({ success: true, active })

  await db.providerLink.update({ where: { id }, data: { active } })
  if (isProvider) {
    await db.notification.create({
      data: {
        userId: link.professional.userId,
        type: active ? 'vinculacion_activada' : 'vinculacion_pausada',
        title: active ? 'Cuenta de retiro activa' : 'Cuenta de retiro pausada',
        body: active
          ? `${link.provider.businessName} activó "${link.accountLabel}": ya podés retirar materiales a cuenta de tus proyectos`
          : `${link.provider.businessName} pausó "${link.accountLabel}" por ahora`,
        link: '#/panel/profesional/vinculaciones',
      },
    })
  }
  return ok({ success: true, active })
}
