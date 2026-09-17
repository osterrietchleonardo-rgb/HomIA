import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { hashPassword, createSession, parseRoles } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureDefaultPipelines } from '@/lib/pipelines'

type RegisterBody = {
  email: string
  password: string
  displayName: string
  roles: string[]
  howFoundUs?: string
  phone?: string
  birthday?: string
  address?: string
  city?: string
  lat?: number
  lng?: number
  personType?: 'persona' | 'empresa'
  professions?: string[]
  skills?: string[]
  experienceYears?: number
  bio?: string
  dniCuil?: string
  companyName?: string
  companyCuit?: string
  companyWebsite?: string
  employeesCount?: number
  serviceRadiusKm?: number
  businessName?: string
  cuit?: string
  description?: string
}

export async function POST(req: NextRequest) {
  const data = await body<RegisterBody>(req)
  if (!data.email || !data.password || !data.displayName) {
    return fail('Email, contraseña y nombre son obligatorios')
  }
  if (data.password.length < 6) return fail('La contraseña debe tener al menos 6 caracteres')
  const email = data.email.trim().toLowerCase()
  const exists = await db.user.findUnique({ where: { email } })
  if (exists) return fail('Ya existe una cuenta con ese email', 409)

  const roles = (data.roles || ['cliente']).filter((r) =>
    ['cliente', 'profesional', 'proveedor'].includes(r)
  )
  if (roles.length === 0) return fail('Rol inválido')

  const user = await db.user.create({
    data: {
      email,
      passwordHash: await hashPassword(data.password),
      displayName: data.displayName.trim(),
      roles: JSON.stringify(roles),
      howFoundUs: data.howFoundUs || null,
      phone: data.phone || null,
      birthday: data.birthday || null,
      address: data.address || null,
      city: data.city || null,
      lat: data.lat ?? null,
      lng: data.lng ?? null,
      locationShared: !!(data.lat && data.lng),
    },
  })

  if (roles.includes('profesional')) {
    await db.professionalProfile.create({
      data: {
        userId: user.id,
        personType: data.personType === 'empresa' ? 'empresa' : 'persona',
        professions: JSON.stringify(data.professions || []),
        skills: JSON.stringify(data.skills || []),
        experienceYears: data.experienceYears || 0,
        bio: data.bio || null,
        dniCuil: data.dniCuil || null,
        companyName: data.companyName || null,
        companyCuit: data.companyCuit || null,
        companyWebsite: data.companyWebsite || null,
        employeesCount: data.employeesCount ?? null,
        serviceRadiusKm: data.serviceRadiusKm || 15,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        city: data.city || null,
      },
    })
  }

  if (roles.includes('proveedor')) {
    if (!data.businessName) {
      await db.user.delete({ where: { id: user.id } })
      return fail('El nombre del negocio es obligatorio para proveedores')
    }
    await db.providerProfile.create({
      data: {
        userId: user.id,
        businessName: data.businessName,
        cuit: data.cuit || null,
        description: data.description || null,
        address: data.address || null,
        city: data.city || null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
      },
    })
  }

  await ensureDefaultPipelines(user.id, roles)
  await createSession(user.id)

  return ok({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: parseRoles(user.roles),
      hasProfessional: roles.includes('profesional'),
      hasProvider: roles.includes('proveedor'),
    },
  }, 201)
}
