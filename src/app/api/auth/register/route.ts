import { NextRequest } from 'next/server'
import { z } from 'zod'
import { ok, fail, parseBody } from '@/lib/api'
import { hashPassword, createSession, parseRoles } from '@/lib/auth'
import { db } from '@/lib/db'
import { ensureDefaultPipelines } from '@/lib/pipelines'
import { rateLimit, ipRateKey } from '@/lib/rate-limit'
import { LEGAL_VERSION } from '@/lib/legal-content'
import { registrarEvento } from '@/lib/analytics/server'
import { problemaDeContrasena } from '@/lib/password-policy'
import { canonicalProviderKind } from '@/lib/search-match'
import {
  normalizarEmail, normalizarCelular, normalizarNombre, problemaNombre, normalizarCuit, normalizarDniOCuil,
} from '@/lib/registro'
import { comprobanteValido, disponibilidad } from '@/lib/verificacion-server'

// POST /api/auth/register (D26, 25/09/2026: datos estandarizados y email verificado ANTES de crear
// la cuenta). Obligatorio para todos: nombre, apellido, email con el comprobante del código que
// llegó por mail (`emailToken`, de POST /api/auth/verificacion/comprobar), celular escrito dos
// veces (`phone` + `phoneConfirm`; con proveedor de SMS/WhatsApp también `phoneToken`), contraseña,
// ciudad o localidad y aceptar los términos. Profesional: al menos un rubro (+ radio de trabajo,
// por defecto 15 km). Proveedor: nombre del comercio, tipo de comercio y dirección del local.
// Todo lo demás es opcional y se valida si viene (DNI/CUIL y CUIT con dígito verificador).
// Un 400 trae TODO lo que falta: `campos` { campo: mensaje } y `faltan` [campos].

const str = (max: number) => z.string().max(max, 'Demasiado largo').optional()

const schema = z.object({
  roles: z.array(z.string().max(20)).max(5).optional(),
  firstName: str(200),
  lastName: str(200),
  email: str(300),
  emailToken: str(2000),
  phone: str(60),
  phoneConfirm: str(60),
  phoneToken: str(2000),
  password: str(300),
  city: str(300),
  lat: z.number().min(-90).max(90).nullable().optional(),
  lng: z.number().min(-180).max(180).nullable().optional(),
  howFoundUs: str(40),
  birthday: z.string().regex(/^(\d{4}-\d{2}-\d{2})?$/, 'Fecha inválida (AAAA-MM-DD)').optional(),
  acceptTerms: z.unknown().optional(),
  // profesional
  personType: z.enum(['persona', 'empresa']).optional(),
  professions: z.array(z.string().trim().max(60)).max(20).optional(),
  skills: z.array(z.string().trim().max(60)).max(40).optional(),
  experienceYears: z.number().int().min(0).max(80).optional(),
  bio: str(1500),
  dniCuil: str(20),
  companyName: str(120),
  companyCuit: str(20),
  companyWebsite: str(200),
  employeesCount: z.number().int().min(0).max(10000).nullable().optional(),
  serviceRadiusKm: z.number().min(1).max(100).optional(),
  // proveedor
  businessName: str(200),
  kind: str(40),
  address: str(300),
  cuit: str(20),
  description: str(1500),
})

const ETIQUETAS: Record<string, string> = {
  firstName: 'nombre', lastName: 'apellido', email: 'email', phone: 'celular', phoneConfirm: 'repetir celular',
  password: 'contraseña', city: 'ciudad o localidad', roles: 'perfil', acceptTerms: 'términos',
  professions: 'rubros', dniCuil: 'DNI o CUIL', companyCuit: 'CUIT de la empresa', businessName: 'nombre del comercio',
  kind: 'tipo de comercio', address: 'dirección del local', cuit: 'CUIT',
}

const HOW_FOUND = ['google', 'redes', 'recomendacion', 'publicidad', 'otro']

export async function POST(req: NextRequest) {
  // tope anti-abuso: 8 cuentas por IP por hora (además, cada cuenta necesita un código por mail)
  const rl = rateLimit(ipRateKey(req, 'register'), 8, 60 * 60 * 1000)
  if (!rl.allowed) {
    return fail('Demasiadas cuentas creadas desde tu conexión. Probá de nuevo en un rato.', 429)
  }
  const parsed = await parseBody(req, schema)
  if (parsed.error) return parsed.error
  const d = parsed.data
  const campos: Record<string, string> = {}

  // ── roles ──
  const roles = [...new Set(d.roles && d.roles.length ? d.roles : ['cliente'])]
  if (roles.some((r) => !['cliente', 'profesional', 'proveedor'].includes(r))) campos.roles = 'Perfil inválido'
  const esPro = roles.includes('profesional')
  const esProv = roles.includes('proveedor')

  // ── datos de todos ──
  const firstName = normalizarNombre(d.firstName)
  const lastName = normalizarNombre(d.lastName)
  const pNom = problemaNombre(firstName, 'nombre')
  if (pNom) campos.firstName = pNom
  const pApe = problemaNombre(lastName, 'apellido')
  if (pApe) campos.lastName = pApe

  const em = normalizarEmail(d.email)
  if (!em.ok) campos.email = em.error

  const pw = problemaDeContrasena(d.password)
  if (pw) campos.password = pw

  const cel = normalizarCelular(d.phone)
  if (!cel.ok) campos.phone = cel.error
  else {
    const rep = normalizarCelular(d.phoneConfirm)
    if (!(d.phoneConfirm || '').trim()) campos.phoneConfirm = 'Repetí tu celular para confirmarlo'
    else if (!rep.ok || rep.e164 !== cel.e164) campos.phoneConfirm = 'Los dos celulares no coinciden: revisalos'
  }

  const city = (d.city || '').trim().replace(/\s+/g, ' ')
  if (city.length < 2) campos.city = 'Escribí tu ciudad o localidad'

  if (d.acceptTerms !== true) {
    campos.acceptTerms = 'Para crear tu cuenta tenés que aceptar los Términos y Condiciones y la Política de Privacidad'
  }

  // ── profesional ──
  const professions = (d.professions || []).filter(Boolean)
  let dniCuil: string | null = null
  let companyCuit: string | null = null
  if (esPro) {
    if (professions.length === 0) campos.professions = 'Elegí al menos un rubro en el que trabajás'
    else if (professions.some((p) => !/^[a-z0-9-]{2,40}$/.test(p))) campos.professions = 'Rubro inválido'
    if ((d.dniCuil || '').trim()) {
      const r = normalizarDniOCuil(d.dniCuil)
      if (r.ok) dniCuil = r.valor
      else campos.dniCuil = r.error
    }
    if ((d.companyCuit || '').trim()) {
      const r = normalizarCuit(d.companyCuit)
      if (r.ok) companyCuit = r.cuit
      else campos.companyCuit = r.error
    }
  }

  // ── proveedor ──
  const businessName = (d.businessName || '').trim().replace(/\s+/g, ' ')
  const address = (d.address || '').trim().replace(/\s+/g, ' ')
  let kind: string | undefined
  let cuit: string | null = null
  if (esProv) {
    if (businessName.length < 2) campos.businessName = 'Escribí el nombre de tu comercio'
    else if (businessName.length > 120) campos.businessName = 'El nombre del comercio es demasiado largo'
    kind = canonicalProviderKind(d.kind)
    if (!kind) campos.kind = 'Elegí qué tipo de comercio es (corralón, ferretería…)'
    if (address.length < 5 || !/\d/.test(address)) campos.address = 'Escribí la dirección del local (calle y número)'
    if ((d.cuit || '').trim()) {
      const r = normalizarCuit(d.cuit)
      if (r.ok) cuit = r.cuit
      else campos.cuit = r.error
    }
  }

  // ── verificación: el email con su código (siempre); el celular con el suyo solo si hay proveedor ──
  let needsEmailCode = false
  let needsPhoneCode = false
  if (em.ok && !campos.email && !(await comprobanteValido(d.emailToken, 'email', em.email))) {
    campos.email = 'Confirmá tu email con el código de 6 números que te mandamos'
    needsEmailCode = true
  }
  const celularConCodigo = disponibilidad().celular
  let phoneVerified = false
  if (cel.ok && !campos.phone && !campos.phoneConfirm && celularConCodigo) {
    phoneVerified = await comprobanteValido(d.phoneToken, 'celular', cel.e164)
    if (!phoneVerified) {
      campos.phone = 'Confirmá tu celular con el código que te mandamos'
      needsPhoneCode = true
    }
  }

  const faltan = Object.keys(campos)
  if (faltan.length > 0) {
    const error = faltan.length === 1 ? campos[faltan[0]] : `Revisá estos datos: ${faltan.map((k) => ETIQUETAS[k] || k).join(', ')}`
    return fail(error, 400, {
      campos,
      faltan,
      ...(campos.acceptTerms ? { needsTerms: true } : {}),
      ...(needsEmailCode ? { needsEmailCode: true } : {}),
      ...(needsPhoneCode ? { needsPhoneCode: true } : {}),
    })
  }
  // (acá em.ok y cel.ok son true: si no, habría campos con error)
  if (!em.ok || !cel.ok) return fail('Datos inválidos', 400)
  const email = em.email

  // Solo quien tiene el código del mail llega hasta acá: el 409 no revela cuentas a terceros.
  const exists = await db.user.findUnique({ where: { email }, select: { id: true } })
  if (exists) return fail('Ya existe una cuenta con ese email: ingresá o recuperá tu contraseña', 409)

  const lat = d.lat ?? null
  const lng = d.lng ?? null
  const ahora = new Date()
  let user
  try {
    // usuario y perfiles en UNA escritura (nunca quedan cuentas a medias)
    user = await db.user.create({
      data: {
        email,
        passwordHash: await hashPassword(d.password!),
        displayName: `${firstName} ${lastName}`.slice(0, 80),
        roles: JSON.stringify(roles),
        howFoundUs: d.howFoundUs && HOW_FOUND.includes(d.howFoundUs) ? d.howFoundUs : null,
        phone: cel.mostrar,
        phoneE164: cel.e164,
        phoneVerifiedAt: phoneVerified ? ahora : null,
        emailVerifiedAt: ahora,
        birthday: d.birthday || null,
        address: esProv ? address : null,
        city,
        lat,
        lng,
        locationShared: lat != null && lng != null,
        termsAcceptedAt: ahora,
        termsVersion: LEGAL_VERSION,
        ...(esPro
          ? {
              professional: {
                create: {
                  personType: d.personType === 'empresa' ? 'empresa' : 'persona',
                  professions: JSON.stringify(professions),
                  skills: JSON.stringify((d.skills || []).filter(Boolean)),
                  experienceYears: d.experienceYears ?? 0,
                  bio: d.bio?.trim() || null,
                  dniCuil,
                  companyName: d.companyName?.trim() || null,
                  companyCuit,
                  companyWebsite: d.companyWebsite?.trim() || null,
                  employeesCount: d.employeesCount ?? null,
                  serviceRadiusKm: d.serviceRadiusKm ?? 15,
                  lat,
                  lng,
                  city,
                },
              },
            }
          : {}),
        ...(esProv
          ? {
              provider: {
                create: {
                  businessName,
                  kind: kind!,
                  cuit,
                  description: d.description?.trim() || null,
                  address,
                  city,
                  lat,
                  lng,
                  // 14 días de prueba gratis desde el alta (después: Básico o PRO)
                  subscription: 'trial',
                  trialEndsAt: new Date(Date.now() + 14 * 86400000),
                },
              },
            }
          : {}),
      },
    })
  } catch (e) {
    // dos pedidos a la vez con el mismo email: gana uno, el otro ve el 409
    if (e && typeof e === 'object' && 'code' in e && (e as { code?: string }).code === 'P2002') {
      return fail('Ya existe una cuenta con ese email: ingresá o recuperá tu contraseña', 409)
    }
    throw e
  }

  await ensureDefaultPipelines(user.id, roles)
  await createSession(user.id)
  // métricas (D27): registro completo + vincula lo anónimo previo del navegador (no demora la respuesta)
  registrarEvento(req, { name: 'registro', userId: user.id, path: '/registrarse', vincular: true, props: { roles: roles.join(',') } })

  return ok({
    user: {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      roles: parseRoles(user.roles),
      hasProfessional: esPro,
      hasProvider: esProv,
      emailVerified: true,
      phone: cel.mostrar,
      phoneVerified,
    },
  }, 201)
}
