import { NextRequest } from 'next/server'
import { ok, fail, body } from '@/lib/api'
import { db } from '@/lib/db'
import { planState } from '@/lib/plans'
import { createWithChargeNumber } from '@/lib/charge-number'

// ── Cobros de materiales del proveedor al cliente ──
// Válidos solo en proyectos con materialsPaymentMode = "cliente_paga_proveedor".

// GET: cobros emitidos por mí + materiales aprobados pendientes de cobrar
// (agrupados por proyecto) para que el proveedor sepa qué puede cobrar.
export async function GET() {
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const provider = await db.providerProfile.findUnique({ where: { userId: user.id } })
  if (!provider) return fail('Solo los proveedores tienen cobros de materiales', 403)

  const charges = await db.providerCharge.findMany({
    where: { providerId: provider.id },
    orderBy: { createdAt: 'desc' },
    include: {
      project: { select: { id: true, title: true, materialsPaymentMode: true } },
      client: { select: { id: true, displayName: true } },
    },
  })
  // materiales ya incluidos en algún cobro emitido → nunca se vuelven a cobrar
  const chargedMaterialIds = new Set(
    charges.flatMap((c) => (c.materialIds ? JSON.parse(c.materialIds) as string[] : []))
  )

  // materiales aprobados con mi proveedoría en proyectos modo-B, sin cobro previo
  const materials = await db.projectMaterial.findMany({
    where: {
      providerId: provider.id,
      status: 'aprobado',
      project: { materialsPaymentMode: 'cliente_paga_proveedor', status: 'activo' },
    },
    include: {
      project: {
        select: {
          id: true, title: true, materialsPaymentMode: true,
          client: { select: { id: true, displayName: true } },
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  })

  const groupsMap = new Map<string, {
    projectId: string; projectTitle: string; clientName: string; clientId: string
    materials: { id: string; name: string; quantity: number; unit: string; unitPrice: number; subtotal: number }[]
    amount: number
    bloqueado: boolean
  }>()
  for (const m of materials) {
    if (chargedMaterialIds.has(m.id)) continue // ya cobrado antes
    const key = m.project.id
    if (!groupsMap.has(key)) {
      groupsMap.set(key, {
        projectId: m.project.id,
        projectTitle: m.project.title,
        clientName: m.project.client.displayName,
        clientId: m.project.client.id,
        materials: [],
        amount: 0,
        // un solo cobro abierto por proyecto: si hay uno pendiente, no se emite otro
        bloqueado: charges.some((c) => c.projectId === key && (c.status === 'pendiente' || c.status === 'acordada_efectivo')),
      })
    }
    const g = groupsMap.get(key)!
    const subtotal = Math.round(m.quantity * m.unitPrice * 100) / 100
    g.materials.push({ id: m.id, name: m.name, quantity: m.quantity, unit: m.unit, unitPrice: m.unitPrice, subtotal })
    g.amount = Math.round((g.amount + subtotal) * 100) / 100
  }

  return ok({
    charges: charges.map((c) => ({ ...c })),
    pending: [...groupsMap.values()],
  })
}

// POST: emitir cobro por los materiales aprobados de un proyecto (modo cliente_paga_proveedor)
export async function POST(req: NextRequest) {
  const { getSessionUser } = await import('@/lib/auth')
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión', 401)
  const provider = await db.providerProfile.findUnique({ where: { userId: user.id } })
  if (!provider) return fail('Solo los proveedores pueden emitir cobros de materiales', 403)
  const st = planState(provider)
  if (!st.activo) {
    return fail('Tu prueba gratis terminó: elegí un plan (Básico o PRO) desde "Mi plan" para seguir emitiendo cobros', 403, { needsPlan: true })
  }

  const d = await body<{ projectId?: string }>(req)
  if (!d.projectId) return fail('Falta el proyecto')

  const project = await db.project.findUnique({
    where: { id: d.projectId },
    include: { materials: { where: { status: 'aprobado', providerId: provider.id } } },
  })
  if (!project) return fail('Proyecto no encontrado', 404)
  if (project.materialsPaymentMode !== 'cliente_paga_proveedor') {
    return fail('Este proyecto no está en modo "el cliente paga los materiales al proveedor"', 403)
  }
  if (project.clientId === user.id) return fail('No podés cobrarte a vos mismo')

  const abiertos = await db.providerCharge.count({
    where: { providerId: provider.id, projectId: project.id, status: { in: ['pendiente', 'acordada_efectivo'] } },
  })
  if (abiertos > 0) return fail('Ya tenés un cobro abierto para este proyecto: esperá que el cliente lo pague')

  // los materiales ya incluidos en cobros anteriores (pagados) no se vuelven a cobrar
  const previos = await db.providerCharge.findMany({
    where: { providerId: provider.id, projectId: project.id },
    select: { materialIds: true },
  })
  const yaCobrados = new Set(previos.flatMap((c) => (c.materialIds ? JSON.parse(c.materialIds) as string[] : [])))
  const materials = project.materials.filter((m) => !yaCobrados.has(m.id))
  if (materials.length === 0) {
    return fail('No hay materiales aprobados tuyos sin cobrar en este proyecto todavía')
  }

  const amount = Math.round(materials.reduce((a, m) => a + m.quantity * m.unitPrice, 0) * 100) / 100
  const description = materials
    .map((m) => `${m.name} x${m.quantity} ${m.unit}`)
    .join(', ')
  const materialIds = materials.map((m) => m.id)

  // número secuencial PRV-2026-000001 (con reintento ante colisión)
  const charge = await createWithChargeNumber((number) =>
    db.providerCharge.create({
      data: {
        projectId: project.id,
        providerId: provider.id,
        clientId: project.clientId,
        number,
        description,
        materialIds: JSON.stringify(materialIds),
        amount,
      },
    })
  )
  if (!charge) return fail('No pudimos numerar el cobro: probá de nuevo en unos segundos', 503)

  await db.notification.create({
    data: {
      userId: project.clientId,
      type: 'cobro_materiales',
      title: 'Cobro de materiales del proveedor',
      body: `${provider.businessName} te cobró ${amount.toLocaleString('es-AR', { style: 'currency', currency: 'ARS' })} por los materiales de "${project.title}". Pagalo con Mercado Pago o acordá efectivo.`,
      link: `#/panel/cliente/proyectos/${project.id}`,
    },
  })

  return ok({ charge }, 201)
}
