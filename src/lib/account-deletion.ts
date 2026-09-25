// "Eliminar mi cuenta" (Ley 25.326, derecho de supresión — D19, 24/09/2026).
//
// Reglas (ver docs/interno/LOGICA-HOMIA.md §1.1):
//   1. Si el usuario tiene operaciones abiertas, NO se elimina: se le devuelve la lista de
//      lo que tiene que cerrar primero (proyectos activos, facturas, pedidos, cobros,
//      devoluciones, suscripción de proveedor).
//   2. Si no, la cuenta se ANONIMIZA en una transacción (no se borra la fila): así las
//      facturas, pagos, pedidos cerrados, reseñas y chats de OTROS usuarios siguen
//      existiendo (obligaciones legales y fiscales, y para no romperles el historial) y
//      muestran "Usuario eliminado".
//   3. Se borran los documentos de DNI (filas y archivos del bucket privado), el carrito,
//      los favoritos, las sesiones de Homy, las notificaciones, el CRM propio y las
//      sugerencias con sus fotos de evidencia (bucket privado feedback-evidencias, D25) y los
//      movimientos y la configuración de Finanzas (D24).
//   4. La cuenta queda con `deletedAt`: getSessionUser la ignora, el login la rechaza y
//      src/lib/visibility.ts la esconde de todo lo público.
import 'server-only'
import crypto from 'crypto'
import { createClient } from '@supabase/supabase-js'
import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'
import { borrarFotosDeUsuario, refsDeFotos } from '@/lib/feedback-server'

export const NOMBRE_ELIMINADO = 'Usuario eliminado'
export const NEGOCIO_ELIMINADO = 'Proveedor eliminado'
export const emailEliminado = (userId: string) => `eliminado-${userId}@homia.invalid`

export type OperacionAbierta = { tipo: string; cantidad: number; texto: string; ruta: string }

const PEDIDO_ABIERTO = ['pendiente_aprobacion', 'esperando_stock', 'aprobado', 'entregado']
const COBRO_ABIERTO = ['pendiente', 'acordada_efectivo']
const DEVOLUCION_ABIERTA = ['solicitada', 'aceptada', 'aceptada_parcial', 'recibida', 'reembolso_fallido']

/** Lo que el usuario tiene que cerrar antes de poder eliminar su cuenta (lista vacía = puede). */
export async function operacionesAbiertas(userId: string): Promise<OperacionAbierta[]> {
  const [pro, prov] = await Promise.all([
    db.professionalProfile.findUnique({ where: { userId }, select: { id: true } }),
    db.providerProfile.findUnique({ where: { userId }, select: { id: true, subscription: true, mpPreapprovalId: true, planPaidUntil: true } }),
  ])
  const devolucionAbierta = {
    OR: [
      { status: { in: DEVOLUCION_ABIERTA } },
      // reembolso en efectivo o por fuera de HomIA que todavía no se confirmó (el cron lo cierra a las 72 h)
      { status: 'reembolsada', refundChannel: { in: ['efectivo', 'fuera_de_homia'] }, refundConfirmedAt: null },
    ],
  }
  const ceros = Promise.resolve(0)
  const [
    proyCliente, factCliente, pedCliente, pagadosSinRetirar, cobrosCliente, devSolicitante,
    proyPro, factPro, devPro,
    ventas, ventasPagadasSinEntregar, cobrosProv, devProv,
  ] = await Promise.all([
    db.project.count({ where: { clientId: userId, status: 'activo' } }),
    db.invoice.count({ where: { clientId: userId, status: 'pendiente' } }),
    db.purchase.count({ where: { clientId: userId, status: { in: PEDIDO_ABIERTO } } }),
    // pagado pero todavía no entregado (pedidos del carrito: la entrega queda en la línea de tiempo)
    pagadosSinEntregar({ clientId: userId }),
    db.providerCharge.count({ where: { clientId: userId, status: { in: COBRO_ABIERTO } } }),
    db.leftoverReturn.count({ where: { requesterId: userId, ...devolucionAbierta } }),
    pro ? db.project.count({ where: { professionalId: pro.id, status: 'activo' } }) : ceros,
    pro ? db.invoice.count({ where: { professionalId: pro.id, status: 'pendiente' } }) : ceros,
    pro ? db.leftoverReturn.count({ where: { professionalId: pro.id, sellerKind: 'profesional', ...devolucionAbierta } }) : ceros,
    prov ? db.purchase.count({ where: { providerId: prov.id, status: { in: PEDIDO_ABIERTO } } }) : ceros,
    prov ? pagadosSinEntregar({ providerId: prov.id }) : ceros,
    prov ? db.providerCharge.count({ where: { providerId: prov.id, status: { in: COBRO_ABIERTO } } }) : ceros,
    prov ? db.leftoverReturn.count({ where: { providerId: prov.id, sellerKind: 'proveedor', ...devolucionAbierta } }) : ceros,
  ])

  const out: OperacionAbierta[] = []
  const add = (tipo: string, cantidad: number, texto: string, ruta: string) => {
    if (cantidad > 0) out.push({ tipo, cantidad, texto, ruta })
  }
  add('proyectos_cliente', proyCliente, 'proyecto(s) activo(s) como cliente: finalizalos o cancelalos', '/panel/cliente/proyectos')
  add('facturas_por_pagar', factCliente, 'factura(s) de profesionales sin pagar', '/panel/cliente/facturas')
  add('pedidos_cliente', pedCliente + pagadosSinRetirar, 'pedido(s) de materiales sin cerrar (esperando aprobación, por pagar, por retirar o por entregar)', '/panel/cliente/pedidos')
  add('cobros_por_pagar', cobrosCliente, 'cobro(s) de materiales de proveedores sin pagar', '/panel/cliente/proyectos')
  add('devoluciones_pedidas', devSolicitante, 'devolución(es) de sobrantes en curso que pediste', '/panel/cliente/pedidos')
  add('proyectos_profesional', proyPro, 'proyecto(s) activo(s) como profesional: terminalos o cancelalos con tu cliente', '/panel/profesional/proyectos')
  add('facturas_sin_cobrar', factPro, 'factura(s) que emitiste y todavía no cobraste', '/panel/profesional/cobros')
  add('devoluciones_profesional', devPro, 'devolución(es) de sobrantes de tus clientes sin cerrar', '/panel/profesional/devoluciones')
  add('ventas_proveedor', ventas + ventasPagadasSinEntregar, 'venta(s) o reserva(s) sin cerrar (por aprobar, por pagar o por entregar)', '/panel/proveedor/cobros')
  add('cobros_proveedor', cobrosProv, 'cobro(s) que emitiste y todavía no se pagaron', '/panel/proveedor/cobros')
  add('devoluciones_proveedor', devProv, 'devolución(es) de sobrantes sin cerrar', '/panel/proveedor/cobros')
  if (prov && prov.mpPreapprovalId && !prov.planPaidUntil && (prov.subscription === 'basic' || prov.subscription === 'pro')) {
    add('suscripcion', 1, `suscripción al plan ${prov.subscription === 'pro' ? 'PRO' : 'Básico'} activa en Mercado Pago: cancelala en Mi plan (o en Mercado Pago → Suscripciones)`, '/panel/proveedor/plan')
  }
  return out
}

/** Sub-pedidos del carrito pagados que el proveedor todavía no marcó como entregados. */
async function pagadosSinEntregar(where: { clientId: string } | { providerId: string }): Promise<number> {
  const pagados = await db.purchase.findMany({
    where: { ...where, status: 'pagado', orderId: { not: null } },
    select: { id: true },
    take: 200,
  })
  if (!pagados.length) return 0
  const entregados = await db.activityEvent.findMany({
    where: { purchaseId: { in: pagados.map((p) => p.id) }, type: 'entregado' },
    select: { purchaseId: true },
  })
  const set = new Set(entregados.map((e) => e.purchaseId))
  return pagados.filter((p) => !set.has(p.id)).length
}

// ── Storage ──────────────────────────────────────────────────────────────────

function storageClient() {
  const url = process.env.SUPABASE_PROJECT_URL
  const key = process.env.SUPABASE_SERVICE_ROLE
  if (!url || !key) return null
  return createClient(url, key, { auth: { persistSession: false } })
}

type Sb = NonNullable<ReturnType<typeof storageClient>>

async function listarTodo(sb: Sb, bucket: string, prefix: string, depth = 0): Promise<string[] | null> {
  const { data, error } = await sb.storage.from(bucket).list(prefix, { limit: 1000 })
  if (error) return null
  const acc: string[] = []
  for (const it of data || []) {
    const p = `${prefix}/${it.name}`
    if (it.id === null) {
      if (depth > 4) continue
      const sub = await listarTodo(sb, bucket, p, depth + 1)
      if (sub === null) return null
      acc.push(...sub)
    } else acc.push(p)
  }
  return acc
}

/**
 * Borra TODO lo del usuario en el bucket privado `dni-docs/<userId>/`.
 * Devuelve la cantidad de archivos borrados, o un error honesto si no se pudo
 * (en ese caso no se sigue con la baja: el DNI no puede quedar huérfano).
 */
export async function borrarDniDelBucket(userId: string): Promise<{ ok: true; archivos: number } | { ok: false; error: string }> {
  const sb = storageClient()
  const tieneDocs = await db.identityDocument.count({ where: { userId } })
  if (!sb) {
    return tieneDocs
      ? { ok: false, error: 'No pudimos borrar las fotos de tu DNI (almacenamiento no configurado). Probá de nuevo más tarde.' }
      : { ok: true, archivos: 0 }
  }
  const paths = await listarTodo(sb, 'dni-docs', userId)
  if (paths === null) return { ok: false, error: 'No pudimos borrar las fotos de tu DNI. Probá de nuevo en unos minutos.' }
  if (paths.length) {
    const { error } = await sb.storage.from('dni-docs').remove(paths)
    if (error) return { ok: false, error: 'No pudimos borrar las fotos de tu DNI. Probá de nuevo en unos minutos.' }
  }
  return { ok: true, archivos: paths.length }
}

/** Foto de perfil y logo de marca del usuario en el bucket público (best effort: si falla, se loguea). */
async function borrarFotosPublicas(userId: string, urls: (string | null | undefined)[]) {
  const sb = storageClient()
  if (!sb) return
  const marker = '/storage/v1/object/public/homia-uploads/'
  const paths = urls
    .filter((u): u is string => typeof u === 'string' && u.includes(marker))
    .map((u) => decodeURIComponent(u.split(marker)[1].split('?')[0]))
    .filter((p) => p.startsWith(`${userId}/`) && !p.includes('..'))
  if (!paths.length) return
  const { error } = await sb.storage.from('homia-uploads').remove(paths)
  if (error) console.error('[baja] no se pudieron borrar fotos públicas', userId, error.message)
}

// ── Anonimización ────────────────────────────────────────────────────────────

/** Anonimiza la cuenta en UNA transacción. Llamar solo si `operacionesAbiertas` vino vacía. */
export async function anonimizarCuenta(userId: string): Promise<void> {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      avatarUrl: true,
      professional: { select: { id: true } },
      provider: { select: { id: true, brandLogoUrl: true } },
    },
  })
  if (!user) return
  const proId = user.professional?.id
  const provId = user.provider?.id
  // contraseña imposible de adivinar (nadie la conoce: la cuenta no vuelve a entrar)
  const passwordHash = await hashPassword(crypto.randomBytes(32).toString('base64url'))
  // fotos de evidencia de sus sugerencias (privadas): se borran después de la transacción
  const fotosSugerencias = refsDeFotos(await db.feedback.findMany({ where: { userId }, select: { photos: true } }))
  const ahora = new Date()

  await db.$transaction(async (tx) => {
    // lo personal que no hace falta para el historial de nadie: se borra
    await tx.identityDocument.deleteMany({ where: { userId } })
    await tx.cartItem.deleteMany({ where: { userId } })
    await tx.favorite.deleteMany({ where: { OR: [{ userId }, { targetUserId: userId }] } })
    await tx.homySession.deleteMany({ where: { userId } })
    await tx.homyRun.updateMany({ where: { userId }, data: { userId: null } })
    await tx.searchEvent.updateMany({ where: { userId }, data: { userId: null } })
    // métricas de uso (D27): su registro de uso se borra (los hechos de negocio quedan anonimizados)
    await tx.analyticsEvent.deleteMany({ where: { userId } })
    await tx.analyticsSession.deleteMany({ where: { userId } })
    await tx.aiUsage.deleteMany({ where: { key: `user:${userId}` } })
    await tx.notification.deleteMany({ where: { userId } })
    await tx.passwordReset.deleteMany({ where: { userId } })
    await tx.crmPipeline.deleteMany({ where: { ownerId: userId } })
    // Finanzas (D24): movimientos y configuración son datos privados del usuario
    await tx.financeEntry.deleteMany({ where: { userId } })
    await tx.financeConfig.deleteMany({ where: { userId } })
    await tx.feedback.deleteMany({ where: { userId } })
    // trabajos publicados: los abiertos se cancelan (salen de la bolsa); la dirección se borra
    await tx.jobPost.updateMany({ where: { userId, status: 'abierto' }, data: { status: 'cancelado' } })
    await tx.jobPost.updateMany({ where: { userId }, data: { address: null } })
    await tx.completedWork.updateMany({ where: { authorId: userId }, data: { visible: false } })

    if (proId) {
      await tx.jobBid.updateMany({ where: { professionalId: proId, status: 'pendiente' }, data: { status: 'retirado' } })
      await tx.completedWork.updateMany({ where: { professionalId: proId }, data: { visible: false } })
      await tx.providerLink.updateMany({ where: { professionalId: proId }, data: { active: false } })
      await tx.professionalProfile.update({
        where: { id: proId },
        data: {
          bio: null, dniCuil: null, companyName: null, companyCuit: null, companyWebsite: null,
          employeesCount: null, skills: '[]', lat: null, lng: null, city: null,
          mpOauthAccessToken: null, mpOauthRefreshToken: null, mpOauthExpiresAt: null, mpOauthStatus: 'disconnected',
        },
      })
    }

    if (provId) {
      // el stock publicado se quita (también sale de los carritos de otros); los pedidos
      // cerrados conservan su detalle porque guardan una copia de cada producto
      await tx.providerStock.deleteMany({ where: { providerId: provId } })
      await tx.providerLink.updateMany({ where: { providerId: provId }, data: { active: false } })
      await tx.providerProfile.update({
        where: { id: provId },
        data: {
          businessName: NEGOCIO_ELIMINADO, cuit: null, description: null, address: null, city: null,
          lat: null, lng: null, brandLogoUrl: null, brandTagline: null, brandColor: null,
          mpOauthAccessToken: null, mpOauthRefreshToken: null, mpOauthExpiresAt: null, mpOauthStatus: 'disconnected',
        },
      })
    }

    await tx.verificationCode.deleteMany({ where: { userId } })
    await tx.user.update({
      where: { id: userId },
      data: {
        email: emailEliminado(userId),
        displayName: NOMBRE_ELIMINADO,
        passwordHash,
        phone: null, avatarUrl: null, howFoundUs: null, birthday: null, address: null, city: null,
        lat: null, lng: null, locationShared: false,
        // D26: celular normalizado y verificaciones (los códigos pendientes se borran abajo)
        phoneE164: null, phoneVerifiedAt: null, emailVerifiedAt: null,
        verificationStatus: 'none', verifiedAt: null,
        emailNotifications: false,
        deletedAt: ahora,
      },
    })
  }, { timeout: 30_000, maxWait: 10_000 })

  await borrarFotosPublicas(userId, [user.avatarUrl, user.provider?.brandLogoUrl])
  await borrarFotosDeUsuario(userId, fotosSugerencias)
}
