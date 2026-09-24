// Fuente de datos REAL de las herramientas de Homy (Prisma, solo lectura).
// Las herramientas reciben una `FuenteDatos`: en producción esta; en los tests,
// un doble con datos plausibles (PLAYBOOK §12.14). Nada acá escribe en la base.
import 'server-only'
import { db } from '@/lib/db'
import { parseJson } from '@/lib/api'
import { puedeOperar, esProActivo, planState } from '@/lib/plans'
import { whereUsuarioPublico } from '@/lib/visibility'
import { nextFreeForPros } from '@/lib/schedule-server'

export type ElementoCatalogo = {
  id: string
  nombre: string
  aliases: string[]
  descripcion: string
  unidad: string
  rubro: string
  rubroNombre: string
}

export type OfertaStock = {
  stockId: string
  elementoId: string
  elementoNombre: string
  unidad: string
  marca: string | null
  precio: number
  cantidad: number
  estado: string
  proveedorId: string
  proveedor: string
  ciudad: string | null
  lat: number | null
  lng: number | null
  verificado: boolean
  rating: number
  resenas: number
  recomendado: boolean
  operativo: boolean
  aceptaMercadoPago: boolean
}

export type ProfesionalDato = {
  id: string
  nombre: string
  rubros: string[]
  habilidades: string[]
  bio: string
  ciudad: string | null
  lat: number | null
  lng: number | null
  verificado: boolean
  rating: number
  resenas: number
  obras: number
  experiencia: number
  // calendario del profesional (D21): primer día sin trabajos acordados ni propuestos
  // ("AAAA-MM-DD"; null = sin días libres en el próximo año) y si le queda algún día libre esta semana
  proximaFechaLibre?: string | null
  disponibleEstaSemana?: boolean
}

export type TrabajoDato = {
  id: string
  titulo: string
  descripcion: string
  rubro: string
  urgencia: string
  presupuestoMin: number | null
  presupuestoMax: number | null
  ciudad: string | null
  lat: number | null
  lng: number | null
  presupuestos: number
  creado: Date
}

export type Pendiente = { texto: string; cantidad: number; ruta: string }

export interface FuenteDatos {
  elementos(): Promise<ElementoCatalogo[]>
  ofertas(elementoIds: string[]): Promise<OfertaStock[]>
  profesionales(): Promise<ProfesionalDato[]>
  trabajosAbiertos(): Promise<TrabajoDato[]>
  pendientes(userId: string, rol: 'cliente' | 'profesional' | 'proveedor'): Promise<Pendiente[]>
  rubrosDelProfesional(userId: string): Promise<string[]>
}

// El catálogo (≈1.200 elementos) cambia poco: se cachea 10 min por instancia.
let cacheElementos: { t: number; data: ElementoCatalogo[] } | null = null

export const fuenteDatosPrisma: FuenteDatos = {
  async elementos() {
    if (cacheElementos && Date.now() - cacheElementos.t < 10 * 60_000) return cacheElementos.data
    const rows = await db.catalogElement.findMany({
      where: { active: true },
      select: { id: true, name: true, aliases: true, description: true, unit: true, category: { select: { slug: true, name: true } } },
    })
    const data = rows.map((e) => ({
      id: e.id,
      nombre: e.name,
      aliases: parseJson<string[]>(e.aliases, []),
      descripcion: e.description || '',
      unidad: e.unit,
      rubro: e.category.slug,
      rubroNombre: e.category.name,
    }))
    cacheElementos = { t: Date.now(), data }
    return data
  },

  async ofertas(elementoIds) {
    if (elementoIds.length === 0) return []
    const rows = await db.providerStock.findMany({
      // sin cuentas eliminadas ni (con HIDE_DEMO_USERS=1) cuentas demo — src/lib/visibility.ts
      where: { elementId: { in: elementoIds }, provider: { user: whereUsuarioPublico() } },
      include: {
        element: { select: { name: true, unit: true } },
        provider: {
          select: {
            id: true, businessName: true, city: true, lat: true, lng: true, subscription: true, trialEndsAt: true,
            createdAt: true, mpOauthStatus: true,
            user: { select: { city: true, verificationStatus: true, rating: true, reviewsCount: true } },
          },
        },
      },
      take: 500,
    })
    return rows.map((s) => ({
      stockId: s.id,
      elementoId: s.elementId,
      elementoNombre: s.element.name,
      unidad: s.element.unit,
      marca: s.brand,
      precio: s.price,
      cantidad: s.quantity,
      estado: s.status,
      proveedorId: s.provider.id,
      proveedor: s.provider.businessName,
      ciudad: s.provider.city || s.provider.user.city,
      lat: s.provider.lat,
      lng: s.provider.lng,
      verificado: s.provider.user.verificationStatus === 'verificado',
      rating: s.provider.user.rating,
      resenas: s.provider.user.reviewsCount,
      recomendado: esProActivo(s.provider),
      operativo: puedeOperar(s.provider),
      aceptaMercadoPago: s.provider.mpOauthStatus === 'connected',
    }))
  },

  async profesionales() {
    const rows = await db.professionalProfile.findMany({
      where: { user: whereUsuarioPublico() },
      include: { user: { select: { displayName: true, city: true, verificationStatus: true, rating: true, reviewsCount: true } } },
      take: 500,
    })
    // una sola consulta para la disponibilidad de todos (si falla, Homy sigue sin ese dato)
    const libres = await nextFreeForPros(rows.map((p) => p.id)).catch((e) => {
      console.error('[homy/datos] disponibilidad', e)
      return new Map<string, { proximaFechaLibre: string | null; disponibleEstaSemana: boolean }>()
    })
    return rows.map((p) => ({
      id: p.id,
      proximaFechaLibre: libres.get(p.id)?.proximaFechaLibre,
      disponibleEstaSemana: libres.get(p.id)?.disponibleEstaSemana,
      nombre: p.companyName ? `${p.companyName} (${p.user.displayName})` : p.user.displayName,
      rubros: parseJson<string[]>(p.professions, []),
      habilidades: parseJson<string[]>(p.skills, []),
      bio: p.bio || '',
      ciudad: p.city || p.user.city,
      lat: p.lat,
      lng: p.lng,
      verificado: p.user.verificationStatus === 'verificado',
      rating: p.user.rating,
      resenas: p.user.reviewsCount,
      obras: p.worksCount,
      experiencia: p.experienceYears,
    }))
  },

  async trabajosAbiertos() {
    const rows = await db.jobPost.findMany({
      where: { status: 'abierto', user: whereUsuarioPublico() },
      select: {
        id: true, title: true, description: true, categorySlug: true, urgency: true, budgetMin: true, budgetMax: true,
        city: true, lat: true, lng: true, createdAt: true, _count: { select: { bids: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 150,
    })
    // sin nombre, dirección ni datos del cliente: solo lo público del trabajo
    return rows.map((j) => ({
      id: j.id,
      titulo: j.title,
      descripcion: j.description,
      rubro: j.categorySlug,
      urgencia: j.urgency,
      presupuestoMin: j.budgetMin,
      presupuestoMax: j.budgetMax,
      ciudad: j.city,
      lat: j.lat,
      lng: j.lng,
      presupuestos: j._count.bids,
      creado: j.createdAt,
    }))
  },

  async rubrosDelProfesional(userId) {
    const p = await db.professionalProfile.findUnique({ where: { userId }, select: { professions: true } })
    return p ? parseJson<string[]>(p.professions, []) : []
  },

  async pendientes(userId, rol) {
    const out: Pendiente[] = []
    const add = (cantidad: number, texto: string, ruta: string) => {
      if (cantidad > 0) out.push({ cantidad, texto, ruta })
    }
    if (rol === 'cliente') {
      const [porAprobar, porPagar, facturas, cobros, proyectos, trabajos] = await Promise.all([
        db.purchase.count({ where: { clientId: userId, status: 'pendiente_aprobacion' } }),
        db.purchase.count({ where: { clientId: userId, status: 'aprobado' } }),
        db.invoice.count({ where: { clientId: userId, status: 'pendiente' } }),
        db.providerCharge.count({ where: { clientId: userId, status: 'pendiente', projectId: { not: null } } }),
        db.project.count({ where: { clientId: userId, status: 'activo' } }),
        db.jobPost.findMany({ where: { userId, status: 'abierto' }, select: { _count: { select: { bids: true } } } }),
      ])
      add(porPagar, 'compra(s) o reserva(s) de materiales por pagar (las compras vencen a las 24 h si no pagás ni elegís efectivo)', '/panel/cliente/pedidos')
      add(porAprobar, 'reserva(s) de materiales esperando que el proveedor las apruebe', '/panel/cliente/pedidos')
      add(facturas, 'factura(s) de profesionales pendiente(s) de pago', '/panel/cliente/facturas')
      add(cobros, 'cobro(s) de materiales de proveedores pendiente(s) en tus proyectos', '/panel/cliente/proyectos')
      add(proyectos, 'proyecto(s) activo(s)', '/panel/cliente/proyectos')
      const conOfertas = trabajos.filter((t) => t._count.bids > 0).length
      add(conOfertas, 'trabajo(s) publicado(s) con presupuestos para comparar', '/panel/cliente/trabajos')
      add(trabajos.length - conOfertas, 'trabajo(s) publicado(s) todavía sin presupuestos', '/panel/cliente/trabajos')
    } else if (rol === 'profesional') {
      const prof = await db.professionalProfile.findUnique({ where: { userId }, select: { id: true, mpOauthStatus: true } })
      if (!prof) return out
      const [ofertas, proyectos, facturas, efectivo, devolucionesPro] = await Promise.all([
        db.jobBid.count({ where: { professionalId: prof.id, status: 'pendiente' } }),
        db.project.count({ where: { professionalId: prof.id, status: 'activo' } }),
        db.invoice.count({ where: { professionalId: prof.id, status: 'pendiente' } }),
        db.invoice.count({ where: { professionalId: prof.id, status: 'pendiente', paymentMethod: 'efectivo' } }),
        db.leftoverReturn.count({ where: { professionalId: prof.id, sellerKind: 'profesional', status: 'solicitada' } }),
      ])
      add(ofertas, 'presupuesto(s) enviado(s) esperando respuesta del cliente', '/panel/profesional/presupuestos')
      add(proyectos, 'proyecto(s) activo(s)', '/panel/profesional/proyectos')
      add(facturas - efectivo, 'factura(s) emitida(s) pendiente(s) de pago', '/panel/profesional/proyectos')
      add(efectivo, 'factura(s) con pago en efectivo acordado: confirmá el cobro cuando lo recibas', '/panel/profesional/proyectos')
      add(devolucionesPro, 'devolución(es) de sobrantes de tus clientes para responder', '/panel/profesional/devoluciones')    } else {
      const prov = await db.providerProfile.findUnique({
        where: { userId },
        select: { id: true, subscription: true, trialEndsAt: true, createdAt: true, mpOauthStatus: true },
      })
      if (!prov) return out
      const [porAprobar, aprobados, cobros, efectivo, devoluciones, agotados, porAgotar] = await Promise.all([
        db.purchase.count({ where: { providerId: prov.id, status: 'pendiente_aprobacion' } }),
        db.purchase.count({ where: { providerId: prov.id, status: 'aprobado' } }),
        db.providerCharge.count({ where: { providerId: prov.id, status: 'pendiente' } }),
        db.providerCharge.count({ where: { providerId: prov.id, status: 'acordada_efectivo' } }),
        db.leftoverReturn.count({ where: { providerId: prov.id, sellerKind: 'proveedor', status: 'solicitada' } }),
        db.providerStock.count({ where: { providerId: prov.id, status: 'agotado' } }),
        db.providerStock.count({ where: { providerId: prov.id, status: 'por_agotar' } }),
      ])
      add(porAprobar, 'reserva(s) de clientes esperando tu aprobación', '/panel/proveedor/cobros')
      add(aprobados, 'venta(s) con stock reservado esperando el pago del cliente', '/panel/proveedor/cobros')
      add(cobros, 'cobro(s) emitido(s) pendiente(s) de pago', '/panel/proveedor/cobros')
      add(efectivo, 'cobro(s) en efectivo acordado(s): confirmalos cuando recibas el dinero', '/panel/proveedor/cobros')
      add(devoluciones, 'devolución(es) de sobrantes para responder', '/panel/proveedor/cobros')
      add(agotados, 'producto(s) agotado(s) en tu stock', '/panel/proveedor/stock')
      add(porAgotar, 'producto(s) por agotarse', '/panel/proveedor/stock')
      const plan = planState(prov)
      if (plan.plan === 'trial') {
        out.push({
          cantidad: plan.activo ? plan.trialDaysLeft ?? 0 : 0,
          texto: plan.activo ? `día(s) de prueba gratis restantes (${plan.etiqueta})` : 'tu prueba gratis terminó: elegí un plan para seguir vendiendo',
          ruta: '/panel/proveedor/plan',
        })
      }
      if (prov.mpOauthStatus !== 'connected') {
        out.push({ cantidad: 1, texto: 'Mercado Pago sin conectar: hoy solo podés cobrar en efectivo', ruta: '/panel/proveedor/cobros' })
      }
    }
    return out
  },
}
