import { NextRequest } from 'next/server'
import { ok, requireAuth, body } from '@/lib/api'
import { db } from '@/lib/db'

export async function GET() {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const user = await db.user.findUnique({
    where: { id: auth.user.id },
    include: {
      professional: true,
      provider: { include: { stock: { include: { element: true } } } },
      documents: true,
    },
  })
  if (!user) return ok({ user: null })
  const { passwordHash: _ph, ...safe } = user
  return ok({ user: safe })
}

type PutBody = {
  displayName?: string
  phone?: string
  birthday?: string
  address?: string
  city?: string
  lat?: number
  lng?: number
  locationShared?: boolean
  searchRadiusKm?: number
  howFoundUs?: string
  avatarUrl?: string
  bio?: string
  professions?: string[]
  skills?: string[]
  experienceYears?: number
  personType?: string
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

export async function PUT(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const d = await body<PutBody>(req)

  const userData: Record<string, unknown> = {}
  if (d.displayName !== undefined) userData.displayName = d.displayName
  if (d.phone !== undefined) userData.phone = d.phone
  if (d.birthday !== undefined) userData.birthday = d.birthday
  if (d.address !== undefined) userData.address = d.address
  if (d.city !== undefined) userData.city = d.city
  if (d.lat !== undefined) userData.lat = d.lat
  if (d.lng !== undefined) userData.lng = d.lng
  if (d.locationShared !== undefined) userData.locationShared = d.locationShared
  if (d.searchRadiusKm !== undefined) userData.searchRadiusKm = d.searchRadiusKm
  if (d.howFoundUs !== undefined) userData.howFoundUs = d.howFoundUs
  if (d.avatarUrl !== undefined) userData.avatarUrl = d.avatarUrl
  if (Object.keys(userData).length > 0) {
    await db.user.update({ where: { id: auth.user.id }, data: userData })
  }

  const proData: Record<string, unknown> = {}
  if (d.bio !== undefined) proData.bio = d.bio
  if (d.professions !== undefined) proData.professions = JSON.stringify(d.professions)
  if (d.skills !== undefined) proData.skills = JSON.stringify(d.skills)
  if (d.experienceYears !== undefined) proData.experienceYears = d.experienceYears
  if (d.personType !== undefined) proData.personType = d.personType
  if (d.dniCuil !== undefined) proData.dniCuil = d.dniCuil
  if (d.companyName !== undefined) proData.companyName = d.companyName
  if (d.companyCuit !== undefined) proData.companyCuit = d.companyCuit
  if (d.companyWebsite !== undefined) proData.companyWebsite = d.companyWebsite
  if (d.employeesCount !== undefined) proData.employeesCount = d.employeesCount
  if (d.serviceRadiusKm !== undefined) proData.serviceRadiusKm = d.serviceRadiusKm
  if (d.city !== undefined) proData.city = d.city
  if (d.lat !== undefined) proData.lat = d.lat
  if (d.lng !== undefined) proData.lng = d.lng
  if (Object.keys(proData).length > 0) {
    const existing = await db.professionalProfile.findUnique({ where: { userId: auth.user.id } })
    if (existing) {
      await db.professionalProfile.update({ where: { userId: auth.user.id }, data: proData })
    } else {
      await db.professionalProfile.create({
        data: { userId: auth.user.id, personType: 'persona', ...proData } as never,
      })
    }
  }

  const provData: Record<string, unknown> = {}
  if (d.businessName !== undefined) provData.businessName = d.businessName
  if (d.cuit !== undefined) provData.cuit = d.cuit
  if (d.description !== undefined) provData.description = d.description
  if (d.address !== undefined) provData.address = d.address
  if (d.city !== undefined) provData.city = d.city
  if (d.lat !== undefined) provData.lat = d.lat
  if (d.lng !== undefined) provData.lng = d.lng
  if (Object.keys(provData).length > 0) {
    const existing = await db.providerProfile.findUnique({ where: { userId: auth.user.id } })
    if (existing) {
      await db.providerProfile.update({ where: { userId: auth.user.id }, data: provData })
    } else {
      await db.providerProfile.create({
        data: { userId: auth.user.id, businessName: d.businessName || 'Mi negocio', ...provData } as never,
      })
    }
  }

  return ok({ success: true })
}
