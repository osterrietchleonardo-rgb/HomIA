// Avisos de HomIA: la notificación dentro de la app (como siempre) y, para los eventos
// que importan para el negocio, además un mail (si el usuario no apagó los avisos por mail).
//
// El mail sale en segundo plano con `after()` de Next: la respuesta al usuario no espera
// a Resend y un error del envío nunca rompe la acción (se loguea y listo).
// Los mensajes de chat NO mandan mail (sería spam): no están en la lista.
import { after } from 'next/server'
import { db } from '@/lib/db'
import { sendEmail, linkAbsoluto } from '@/lib/email'

export type AvisoData = {
  userId: string
  type: string
  title: string
  body?: string | null
  link?: string | null
}

/** Tipos de notificación que además mandan mail → texto del botón. */
export const TIPOS_CON_MAIL: Record<string, string> = {
  // proveedor: le compraron o le reservaron
  nueva_compra: 'Ver la venta',
  // cliente: su reserva fue aprobada / ya está para retirar
  reserva_aprobada_sin_stock: 'Ver mi pedido',
  compra_aprobada: 'Ver mi pedido',
  reserva_disponible: 'Ver mi pedido',
  // profesional: lo contrataron o le aceptaron el presupuesto
  contratacion: 'Ver el proyecto',
  presupuesto_aceptado: 'Ver el proyecto',
  // cliente: nueva oferta en su trabajo publicado
  nuevo_presupuesto: 'Ver las ofertas',
  // cliente: le emitieron una factura
  factura_emitida: 'Ver la factura',
  // quien cobra: pago acreditado por Mercado Pago
  compra_pagada_prov: 'Ver la venta',
  cobro_pagado: 'Ver el cobro',
  factura_pagada: 'Ver el proyecto',
  // quien recibe el pedido de devolución de sobrantes
  devolucion_solicitada: 'Ver la devolución',
  // fechas del trabajo (D21): la otra parte tiene que responder una propuesta o reprogramación
  fechas_propuestas: 'Ver las fechas',
  fechas_reprogramacion: 'Ver las fechas',
}

export function mandaMail(type: string): boolean {
  return Object.prototype.hasOwnProperty.call(TIPOS_CON_MAIL, type)
}

/**
 * Crea la notificación (mismos argumentos que `db.notification.create`) y, si el tipo está
 * en la lista, programa el mail.
 * Dentro de una transacción: crear la notificación con `tx` como siempre y, después del
 * commit, llamar a `avisarPorMail([...])` (así no sale un mail de algo que se revirtió).
 */
export async function notificar(args: { data: AvisoData }) {
  const n = await db.notification.create({ data: args.data })
  avisarPorMail([args.data])
  return n
}

/**
 * Como `db.notification.createMany`. `mailSoloA`: ids de usuario que reciben el mail
 * (cuando el mismo tipo va a quien cobra y a quien paga, el mail es solo para quien cobra).
 */
export async function notificarVarios(args: { data: AvisoData[] }, opts: { mailSoloA?: string[] } = {}) {
  const r = await db.notification.createMany({ data: args.data })
  const destinatarios = opts.mailSoloA
  avisarPorMail(destinatarios ? args.data.filter((a) => destinatarios.includes(a.userId)) : args.data)
  return r
}

/**
 * Programa el mail de los avisos cuyo tipo está en la lista (los demás se ignoran).
 * Nunca tira ni bloquea: corre después de responder.
 */
export function avisarPorMail(avisos: AvisoData[]): void {
  const aMandar = avisos.filter((a) => mandaMail(a.type))
  if (!aMandar.length) return
  const tarea = async () => {
    for (const a of aMandar) {
      try {
        await mandarAviso(a)
      } catch (e) {
        console.error('[notify] mail de aviso', a.type, a.userId, e instanceof Error ? e.message : e)
      }
    }
  }
  try {
    after(tarea)
  } catch {
    // fuera de un request (scripts/crons invocados a mano): se manda igual, sin esperar
    void tarea().catch(() => {})
  }
}

async function mandarAviso(a: AvisoData) {
  const user = await db.user.findUnique({
    where: { id: a.userId },
    select: { email: true, displayName: true, emailNotifications: true },
  })
  if (!user || !user.emailNotifications) return
  const nombre = (user.displayName || '').trim().split(/\s+/)[0] || ''
  const res = await sendEmail({
    to: user.email,
    subject: a.title,
    heading: a.title,
    paragraphs: [nombre ? `Hola, ${nombre}:` : 'Hola:', ...(a.body ? [a.body] : [])],
    button: { label: TIPOS_CON_MAIL[a.type] || 'Abrir HomIA', url: linkAbsoluto(a.link) },
    unsubscribeFooter: true,
  })
  if (!res.ok && res.reason !== 'no_configurado') {
    console.error('[notify] no salió el mail', a.type, a.userId, res.reason, 'detail' in res ? res.detail : '')
  }
}
