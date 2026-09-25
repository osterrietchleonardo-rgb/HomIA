import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, requireAuth, parseBody } from '@/lib/api'
import { db } from '@/lib/db'
import { canonicalProviderKind } from '@/lib/search-match'
import { signDniDocUrl, DNI_BUCKET } from '@/lib/dni-ai'
import { esProActivo } from '@/lib/plans'
import { normalizarCelular } from '@/lib/registro'

// GET: mi perfil completo (usuario + perfiles + stock + documentos).
// Los documentos de DNI viven en un bucket privado: acá se devuelven como
// signed URL de 10 minutos, SOLO al dueño (esta ruta ya exige sesión).
export async function GET() {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const user = await db.user.findUnique({
    where: { id: auth.user.id },
    include: {
      professional: true,
      provider: { include: { stock: { include: { element: true } } } },
      documents: { orderBy: { createdAt: 'desc' } },
    },
  })
  if (!user) return ok({ user: null })
  const { passwordHash: _ph, ...safe } = user
  void _ph

  const documents = await Promise.all(
    safe.documents.map(async (doc) => ({
      ...doc,
      frontUrl: doc.frontUrl?.startsWith(`${DNI_BUCKET}/`) ? await signDniDocUrl(doc.frontUrl) : doc.frontUrl,
      backUrl: doc.backUrl?.startsWith(`${DNI_BUCKET}/`) ? await signDniDocUrl(doc.backUrl) : doc.backUrl,
    }))
  )

  // los tokens OAuth de MP nunca salen al navegador: solo estado y vencimiento
  const provider = safe.provider
    ? (() => {
        const { mpOauthAccessToken: _a, mpOauthRefreshToken: _r, ...rest } = safe.provider
        void _a
        void _r
        return { ...rest, mpOauthStatus: safe.provider.mpOauthStatus, mpOauthExpiresAt: safe.provider.mpOauthExpiresAt }
      })()
    : null
  const professional = safe.professional
    ? (() => {
        const { mpOauthAccessToken: _a, mpOauthRefreshToken: _r, ...rest } = safe.professional
        void _a
        void _r
        return rest
      })()
    : null

  return ok({ user: { ...safe, documents, provider, professional } })
}

function publicUploadPrefix(): string {
  const base = (process.env.SUPABASE_PROJECT_URL || '').replace(/\/+$/, '')
  return `${base}/storage/v1/object/public/homia-uploads/`
}

const optionalText = (max: number) => z.string().trim().max(max).optional()

const PutSchema = z.object({
  // usuario
  displayName: z.string().trim().min(2, 'El nombre tiene que tener al menos 2 letras').max(80, 'El nombre es demasiado largo').optional(),
  phone: optionalText(30),
  birthday: z.string().trim().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inválida (AAAA-MM-DD)').optional().or(z.literal('')),
  address: optionalText(200),
  city: optionalText(120),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  locationShared: z.boolean().optional(),
  searchRadiusKm: z.number().min(1).max(200).optional(),
  howFoundUs: optionalText(40),
  // avisos por mail de los eventos importantes (el de recuperar contraseña sale siempre)
  emailNotifications: z.boolean().optional(),
  avatarUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || v.startsWith(publicUploadPrefix()), 'La foto tiene que subirse desde HomIA')
    .optional(),
  // profesional
  bio: optionalText(1500),
  professions: z.array(z.string().trim().min(1).max(60)).max(20).optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  experienceYears: z.number().int().min(0).max(80).optional(),
  personType: z.enum(['persona', 'empresa']).optional(),
  dniCuil: optionalText(20),
  companyName: optionalText(120),
  companyCuit: optionalText(20),
  companyWebsite: optionalText(200),
  employeesCount: z.number().int().min(0).max(10000).nullable().optional(),
  serviceRadiusKm: z.number().min(1).max(200).optional(),
  // proveedor
  businessName: z.string().trim().min(2, 'El nombre del negocio es muy corto').max(120).optional(),
  kind: optionalText(40),
  cuit: optionalText(20),
  description: optionalText(1500),
  // marca del proveedor en la cinta de sponsors (solo Plan PRO activo). '' = borrar
  brandLogoUrl: z
    .string()
    .trim()
    .max(500)
    .refine((v) => v === '' || v.startsWith(publicUploadPrefix()), 'El logo tiene que subirse desde HomIA')
    .optional(),
  brandTagline: z.string().trim().max(60, 'La frase de marca puede tener hasta 60 caracteres').optional(),
  brandColor: z
    .string()
    .trim()
    .regex(/^(#[0-9a-fA-F]{6})?$/, 'El color tiene que ser un hex tipo #1D63B8')
    .optional(),
})

// PUT: actualiza usuario y, si existen y el rol está en user.roles, los perfiles.
// Nunca crea perfiles nuevos (eso lo hace el registro con su flujo propio).
export async function PUT(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const parsed = await parseBody(req, PutSchema)
  if (parsed.error) return parsed.error
  const d = parsed.data
  const roles = auth.user.roles

  // La marca en la home es un beneficio del Plan PRO: se valida ANTES de tocar
  // nada, así un 403 no deja cambios a medias.
  const touchesBrand = d.brandLogoUrl !== undefined || d.brandTagline !== undefined || d.brandColor !== undefined
  if (touchesBrand) {
    const prov = roles.includes('proveedor')
      ? await db.providerProfile.findUnique({
          where: { userId: auth.user.id },
          select: { subscription: true, trialEndsAt: true, createdAt: true },
        })
      : null
    if (!prov) return fail('No tenés perfil de proveedor para editar', 403, { needsRole: 'proveedor' })
    if (!esProActivo(prov)) {
      return fail('El logo y la marca en la home son parte del plan PRO', 403, { needsPro: true })
    }
  }

  const userData: Record<string, unknown> = {}
  if (d.displayName !== undefined) userData.displayName = d.displayName
  if (d.phone !== undefined) {
    // D26: el celular se guarda normalizado (+549… en phoneE164, "+54 9 11 2345-6789" en phone).
    // Si cambia el número, deja de estar verificado. Vacío solo si la cuenta no tenía uno válido.
    const actual = await db.user.findUnique({ where: { id: auth.user.id }, select: { phoneE164: true } })
    if (!d.phone) {
      if (actual?.phoneE164) return fail('El celular es obligatorio: escribí tu número (ej.: 11 2345-6789)', 400, { campo: 'phone' })
      userData.phone = null
    } else {
      const cel = normalizarCelular(d.phone)
      if (!cel.ok) return fail(cel.error, 400, { campo: 'phone' })
      userData.phone = cel.mostrar
      userData.phoneE164 = cel.e164
      if (actual?.phoneE164 !== cel.e164) userData.phoneVerifiedAt = null
    }
  }
  if (d.birthday !== undefined) userData.birthday = d.birthday || null
  if (d.address !== undefined) userData.address = d.address || null
  if (d.city !== undefined) userData.city = d.city || null
  if (d.lat !== undefined) userData.lat = d.lat
  if (d.lng !== undefined) userData.lng = d.lng
  if (d.locationShared !== undefined) userData.locationShared = d.locationShared
  if (d.searchRadiusKm !== undefined) userData.searchRadiusKm = d.searchRadiusKm
  if (d.howFoundUs !== undefined) userData.howFoundUs = d.howFoundUs || null
  if (d.emailNotifications !== undefined) userData.emailNotifications = d.emailNotifications
  if (d.avatarUrl !== undefined) userData.avatarUrl = d.avatarUrl || null

  let writePro = false
  let writeProv = false
  const proData: Record<string, unknown> = {}
  if (d.bio !== undefined) proData.bio = d.bio || null
  if (d.professions !== undefined) proData.professions = JSON.stringify(d.professions)
  if (d.skills !== undefined) proData.skills = JSON.stringify(d.skills)
  if (d.experienceYears !== undefined) proData.experienceYears = d.experienceYears
  if (d.personType !== undefined) proData.personType = d.personType
  if (d.dniCuil !== undefined) proData.dniCuil = d.dniCuil || null
  if (d.companyName !== undefined) proData.companyName = d.companyName || null
  if (d.companyCuit !== undefined) proData.companyCuit = d.companyCuit || null
  if (d.companyWebsite !== undefined) proData.companyWebsite = d.companyWebsite || null
  if (d.employeesCount !== undefined) proData.employeesCount = d.employeesCount
  if (d.serviceRadiusKm !== undefined) proData.serviceRadiusKm = d.serviceRadiusKm
  if (d.city !== undefined) proData.city = d.city || null
  if (d.lat !== undefined) proData.lat = d.lat
  if (d.lng !== undefined) proData.lng = d.lng
  const touchesPro = Object.keys(proData).some((k) => !['city', 'lat', 'lng'].includes(k))
  if (Object.keys(proData).length > 0) {
    const existing = roles.includes('profesional')
      ? await db.professionalProfile.findUnique({ where: { userId: auth.user.id }, select: { id: true } })
      : null
    if (!existing && touchesPro) {
      return fail('No tenés perfil de profesional para editar', 403, { needsRole: 'profesional' })
    }
    writePro = !!existing
  }

  const provData: Record<string, unknown> = {}
  if (d.businessName !== undefined) provData.businessName = d.businessName
  if (d.kind !== undefined) {
    // tipo de negocio (corralón, ferretería, electricidad…): se canoniza y si no
    // matchea se guarda 'multi' para no dejar basura en los filtros
    provData.kind = canonicalProviderKind(d.kind) || 'multi'
  }
  if (d.cuit !== undefined) provData.cuit = d.cuit || null
  if (d.description !== undefined) provData.description = d.description || null
  if (d.address !== undefined) provData.address = d.address || null
  if (d.city !== undefined) provData.city = d.city || null
  if (d.lat !== undefined) provData.lat = d.lat
  if (d.lng !== undefined) provData.lng = d.lng
  if (d.brandLogoUrl !== undefined) provData.brandLogoUrl = d.brandLogoUrl || null
  if (d.brandTagline !== undefined) provData.brandTagline = d.brandTagline || null
  if (d.brandColor !== undefined) provData.brandColor = d.brandColor ? d.brandColor.toUpperCase() : null
  const touchesProv = Object.keys(provData).some((k) => !['address', 'city', 'lat', 'lng'].includes(k))
  if (Object.keys(provData).length > 0) {
    const existing = roles.includes('proveedor')
      ? await db.providerProfile.findUnique({ where: { userId: auth.user.id }, select: { id: true } })
      : null
    if (!existing && touchesProv) {
      return fail('No tenés perfil de proveedor para editar', 403, { needsRole: 'proveedor' })
    }
    writeProv = !!existing
  }

  // Todos los chequeos pasaron: recién ahora se escribe, todo junto (un 403 no deja cambios a medias)
  const ops = []
  if (Object.keys(userData).length > 0) ops.push(db.user.update({ where: { id: auth.user.id }, data: userData }))
  if (writePro) ops.push(db.professionalProfile.update({ where: { userId: auth.user.id }, data: proData }))
  if (writeProv) ops.push(db.providerProfile.update({ where: { userId: auth.user.id }, data: provData }))
  if (ops.length > 0) await db.$transaction(ops)

  return ok({ success: true })
}
