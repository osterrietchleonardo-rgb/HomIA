import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { hashPassword, createSession, parseRoles } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureDefaultPipelines } from '@/lib/pipelines'
import { rateLimit, ipRateKey } from '@/lib/rate-limit'
import { LEGAL_VERSION } from '@/lib/legal-content'

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
  acceptTerms?: boolean
}

export async function POST(req: NextRequest) {
  // tope anti-abuso: 8 cuentas por IP por hora
  const rl = rateLimit(ipRateKey(req, 'register'), 8, 60 * 60 * 1000)
  if (!rl.allowed) {
    return fail('Demasiadas cuentas creadas desde tu conexión. Probá de nuevo en un rato.', 429)
  }
  const data = await body<RegisterBody>(req)
  if (typeof data.email !== 'string' || typeof data.password !== 'string' || typeof data.displayName !== 'string' || !data.email || !data.password || !data.displayName) {
    return fail('Email, contraseña y nombre son obligatorios')
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email.trim())) {
    return fail('El email no parece válido')
  }
  if (data.password.length < 8) {
    return fail('La contraseña debe tener al menos 8 caracteres')
  }
  if (!/[a-zA-Z]/.test(data.password) || !/[0-9]/.test(data.password)) {
    return fail('La contraseña debe combinar letras y números para proteger tu cuenta')
  }
  if (data.displayName.trim().length < 2 || data.displayName.trim().length > 60) {
    return fail('El nombre debe tener entre 2 y 60 caracteres')
  }
  if (data.email.length > 200 || data.password.length > 200) {
    return fail('Email o contraseña demasiado largos')
  }
  // D19: sin aceptar los Términos y la Política de Privacidad no se crea la cuenta
  // (se guarda cuándo y qué versión de los textos aceptó).
  if (data.acceptTerms !== true) {
    return fail('Para crear tu cuenta tenés que aceptar los Términos y Condiciones y la Política de Privacidad', 400, { needsTerms: true })
  }
  const email = data.email.trim().toLowerCase()
  const exists = await db.user.findUnique({ where: { email } })
  if (exists) return fail('Ya existe una cuenta con ese email', 409)

  const roles = (Array.isArray(data.roles) ? data.roles : ['cliente']).filter(
    (r: unknown) => typeof r === 'string' && ['cliente', 'profesional', 'proveedor'].includes(r)
  )
  if (roles.length === 0) return fail('Rol inválido')
  // validaciones por rol ANTES de crear el usuario (nunca dejar cuentas a medias)
  const businessName = typeof data.businessName === 'string' ? data.businessName.trim() : ''
  if (roles.includes('proveedor') && businessName.length < 2) {
    return fail('El nombre del negocio es obligatorio para proveedores')
  }

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
      termsAcceptedAt: new Date(),
      termsVersion: LEGAL_VERSION,
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
    await db.providerProfile.create({
      data: {
        userId: user.id,
        businessName,
        cuit: data.cuit || null,
        description: data.description || null,
        address: data.address || null,
        city: data.city || null,
        lat: data.lat ?? null,
        lng: data.lng ?? null,
        // 14 días de prueba gratis desde el alta (después: Básico o PRO)
        subscription: 'trial',
        trialEndsAt: new Date(Date.now() + 14 * 86400000),
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
