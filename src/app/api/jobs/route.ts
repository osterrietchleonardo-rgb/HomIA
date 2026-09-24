import { NextRequest } from 'next/server'
import { ok, requireAuth, body, fail } from '@/lib/api'
import { db } from '@/lib/db'
import { withinRadius } from '@/lib/geo'
import { parseJson } from '@/lib/api'
import { isHomiaUploadUrl } from '@/lib/leftovers'
import { whereUsuarioPublico } from '@/lib/visibility'

// GET: bolsa de trabajos (abiertos) con filtros + los míos si mine=1
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams
  const mine = sp.get('mine') === '1'
  const cat = sp.get('cat')
  const urgency = sp.get('urgency')
  const q = (sp.get('q') || '').toLowerCase()
  const lat = sp.get('lat') ? parseFloat(sp.get('lat')!) : null
  const lng = sp.get('lng') ? parseFloat(sp.get('lng')!) : null
  const radius = sp.get('radius') ? parseFloat(sp.get('radius')!) : 25

  const auth = await requireAuth()
  const userId = 'user' in auth ? auth.user.id : null

  if (mine) {
    if ('response' in auth) return auth.response
    const myJobs = await db.jobPost.findMany({
      where: { userId: userId! },
      include: {
        bids: {
          include: {
            professional: {
              include: { user: { select: { displayName: true, avatarUrl: true, verificationStatus: true } } },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    })
    return ok({ jobs: myJobs })
  }

  const jobs = await db.jobPost.findMany({
    where: {
      status: 'abierto',
      // sin cuentas eliminadas ni (con HIDE_DEMO_USERS=1) cuentas demo — src/lib/visibility.ts
      user: whereUsuarioPublico(),
      ...(cat ? { categorySlug: cat } : {}),
      ...(urgency ? { urgency } : {}),
    },
    include: {
      user: { select: { id: true, displayName: true, avatarUrl: true, city: true } },
      bids: { select: { id: true } },
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
  })

  const results = withinRadius(
    jobs
      .filter((j) => !q || `${j.title} ${j.description}`.toLowerCase().includes(q))
      .map((j) => ({
        id: j.id,
        title: j.title,
        description: j.description,
        categorySlug: j.categorySlug,
        urgency: j.urgency,
        budgetMin: j.budgetMin,
        budgetMax: j.budgetMax,
        city: j.city || j.user.city,
        status: j.status,
        photos: parseJson<string[]>(j.photos, []),
        bidsCount: j.bids.length,
        createdAt: j.createdAt,
        lat: j.lat,
        lng: j.lng,
      })),
    lat, lng, radius
  )

  return ok({ jobs: results, authenticated: !!userId })
}

// POST: publicar trabajo
export async function POST(req: NextRequest) {
  const auth = await requireAuth()
  if ('response' in auth) return auth.response
  const d = await body<{
    title: string
    description: string
    categorySlug: string
    urgency?: string
    budgetMin?: number
    budgetMax?: number
    address?: string
    city?: string
    lat?: number
    lng?: number
    photos?: string[]
  }>(req)

  if (!d.title || !d.description || !d.categorySlug) {
    return fail('Título, descripción y categoría son obligatorios')
  }
  const bMin = d.budgetMin ?? null
  const bMax = d.budgetMax ?? null
  if ((bMin !== null && (typeof bMin !== 'number' || !Number.isFinite(bMin) || bMin < 0)) ||
      (bMax !== null && (typeof bMax !== 'number' || !Number.isFinite(bMax) || bMax < 0))) {
    return fail('El presupuesto no puede ser negativo')
  }
  if (bMin !== null && bMax !== null && bMin > bMax) return fail('El mínimo no puede ser mayor que el máximo')
  if (typeof d.title !== 'string' || typeof d.description !== 'string' || d.title.trim().length > 160 || d.description.length > 4000) {
    return fail('El título (hasta 160 caracteres) y la descripción (hasta 4000) tienen que ser texto')
  }
  // el rubro tiene que ser una de las categorías reales (si no, el trabajo no le llega a nadie)
  const category = typeof d.categorySlug === 'string' ? await db.category.findUnique({ where: { slug: d.categorySlug }, select: { id: true } }) : null
  if (!category) return fail('Elegí un rubro de la lista')
  if (d.urgency !== undefined && !['baja', 'normal', 'alta', 'urgente'].includes(d.urgency)) return fail('Urgencia inválida')
  const isCoord = (v: unknown, max: number) => v === undefined || v === null || (typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= max)
  if (!isCoord(d.lat, 90) || !isCoord(d.lng, 180)) return fail('Ubicación inválida')
  if (d.photos !== undefined && !Array.isArray(d.photos)) return fail('Fotos inválidas')
  // fotos: solo subidas reales de HomIA (máx 6)
  const photos = (d.photos || []).filter((p): p is string => typeof p === 'string' && isHomiaUploadUrl(p)).slice(0, 6)

  const user = await db.user.findUnique({ where: { id: auth.user.id } })
  const job = await db.jobPost.create({
    data: {
      userId: auth.user.id,
      title: d.title,
      description: d.description,
      categorySlug: d.categorySlug,
      urgency: d.urgency || 'normal',
      budgetMin: d.budgetMin ?? null,
      budgetMax: d.budgetMax ?? null,
      address: d.address || null,
      city: d.city || user?.city || null,
      lat: d.lat ?? user?.lat ?? null,
      lng: d.lng ?? user?.lng ?? null,
      photos: JSON.stringify(photos),
    },
  })

  // Notificar a profesionales de la categoría
  const pros = await db.professionalProfile.findMany({
    where: { user: { roles: { contains: 'profesional' }, deletedAt: null } },
    select: { userId: true, professions: true },
  })
  const targets = pros.filter((p) => {
    try { return (JSON.parse(p.professions) as string[]).includes(d.categorySlug) } catch { return false }
  }).slice(0, 50)
  await db.notification.createMany({
    data: targets.map((t) => ({
      userId: t.userId,
      type: 'nuevo_trabajo',
      title: 'Nuevo trabajo en tu rubro',
      body: d.title,
      link: `#/trabajo/${job.id}`,
    })),
  })

  return ok({ job }, 201)
}
