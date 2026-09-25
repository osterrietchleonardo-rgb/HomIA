// Planes de suscripción de HomIA — SOLO los proveedores pagan.
// El cliente y el profesional usan la plataforma gratis, siempre.
//
// ── Plan Básico: $50.000/mes ──
//   · 14 días de prueba gratis desde el alta del proveedor
//   · Uso completo de la plataforma: stock, ventas directas, cobros, CRM, vinculaciones
// ── Plan PRO: $100.000/mes ──
//   · Todo lo del Básico, más:
//   · Logo y marca en la home (cinta de sponsors)
//   · "Recomendado" y primero en directorio, marketplace, búsquedas y agente Homy
//   · Analítica de demanda de tu zona (elementos más pedidos, consultas del rubro)
//
// ── Cancelación y reintegros (D33, 25/09/2026) ──
//   · Se cancela desde HomIA (Mi plan → Cancelar suscripción) o desde Mercado Pago → Suscripciones:
//     da lo mismo. No se vuelve a cobrar; lo ya pagado NO se reintegra, pero el plan sigue operativo
//     hasta el fin del período pago (`planPaidUntil`). El cron diario lo da de baja al vencer.
//   · Elegir un plan durante la prueba no se come los días gratis: la suscripción de MP nace con
//     `start_date` = fin de la prueba (primer cobro ese día). Lo mismo al volver a suscribirse con
//     un período pago vigente: el primer cobro es cuando termina lo ya pagado.
// Todo lo de acá es puro (sin base ni red): lo prueban src/lib/__tests__/plans.test.ts.

import { sumarMes, fechaCortaAR } from '@/lib/suscripciones-core'

export { fechaCortaAR }

export type ProviderPlan = 'trial' | 'basic' | 'pro'

export const TRIAL_DAYS = 14
const DIA_MS = 86_400_000

// Precios mensuales en pesos argentinos (lo que cobra Mercado Pago).
// Configurables por env: MP_PROVIDER_BASIC_ARS / MP_PROVIDER_PRO_ARS.
export const PLAN_PRICE_ARS: Record<'basic' | 'pro', number> = {
  basic: Number(process.env.MP_PROVIDER_BASIC_ARS || 50000),
  pro: Number(process.env.MP_PROVIDER_PRO_ARS || 100000),
}

export const PLAN_FEATURES: Record<'basic' | 'pro', string[]> = {
  basic: [
    'Usá la app completa: stock ilimitado, ventas directas, cobros por Mercado Pago y efectivo, CRM, vinculaciones',
  ],
  pro: [
    'Todo lo del Básico + tu logo y marca en la home, tarjeta Recomendado en marketplace y directorio, analítica de demanda de tu zona',
  ],
}

/** Lo mínimo del perfil que decide el plan. `planPaidUntil` es obligatorio a propósito: toda
 *  consulta que decida si el proveedor opera tiene que traerlo (si no, un plan cancelado y vencido
 *  seguiría visible hasta que corra el cron). */
export type PerfilPlan = {
  subscription: string
  trialEndsAt?: Date | string | null
  createdAt: Date | string
  planPaidUntil: Date | string | null
}

export type PlanState = {
  plan: ProviderPlan
  activo: boolean // puede operar (plan de pago vigente o prueba vigente)
  trialDaysLeft: number | null
  /** fin de la prueba gratis si todavía no terminó (también con un plan ya elegido: ese día es el primer cobro) */
  trialEndsAt: string | null
  esPro: boolean
  etiqueta: string
  /** plan pago con la suscripción cancelada: sigue hasta `accesoHasta` */
  cancelado: boolean
  accesoHasta: string | null
  /** plan elegido durante la prueba: el primer cobro de Mercado Pago es este día (fin de la prueba) */
  primerCobro: string | null
  /** por qué no está activo (null = activo): terminó la prueba o terminó/venció un plan pago */
  motivoInactivo: 'prueba_terminada' | 'plan_vencido' | null
  /** cuándo terminó (prueba o plan), si se sabe */
  vencioEl: string | null
}

const aFecha = (d: Date | string | null | undefined): Date | null => {
  if (d == null) return null
  const x = new Date(d)
  return Number.isNaN(x.getTime()) ? null : x
}

/** Fin de la prueba gratis (sin dato → 14 días desde el alta). */
export function finDePrueba(prov: { trialEndsAt?: Date | string | null; createdAt: Date | string }): Date {
  return aFecha(prov.trialEndsAt) ?? new Date(new Date(prov.createdAt).getTime() + TRIAL_DAYS * DIA_MS)
}

/** Estado del plan de un proveedor, con la cuenta regresiva de la prueba. */
export function planState(prov: PerfilPlan, ahora: Date = new Date()): PlanState {
  const sub = prov.subscription || 'trial'
  const esPro = sub === 'pro'
  const finPrueba = finDePrueba(prov)
  const pruebaVigente = finPrueba.getTime() > ahora.getTime()
  if (sub === 'basic' || sub === 'pro') {
    const nombre = sub === 'pro' ? 'Plan PRO' : 'Plan Básico'
    const hasta = aFecha(prov.planPaidUntil)
    if (hasta) {
      const activo = hasta.getTime() > ahora.getTime()
      return {
        plan: sub, activo, trialDaysLeft: null, trialEndsAt: null, esPro,
        etiqueta: activo ? `${nombre} · cancelado, sigue hasta el ${fechaCortaAR(hasta)}` : `${nombre} · terminó el ${fechaCortaAR(hasta)}`,
        cancelado: true, accesoHasta: hasta.toISOString(), primerCobro: null,
        motivoInactivo: activo ? null : 'plan_vencido', vencioEl: activo ? null : hasta.toISOString(),
      }
    }
    return {
      plan: sub, activo: true, trialDaysLeft: null,
      trialEndsAt: pruebaVigente ? finPrueba.toISOString() : null,
      esPro,
      etiqueta: pruebaVigente ? `${nombre} · primer cobro el ${fechaCortaAR(finPrueba)}` : nombre,
      cancelado: false, accesoHasta: null,
      primerCobro: pruebaVigente ? finPrueba.toISOString() : null,
      motivoInactivo: null, vencioEl: null,
    }
  }
  // trial (o sin plan). Si tuvo un plan pago que terminó, `planPaidUntil` guarda cuándo terminó
  // (desde D33); `trialEndsAt` en 1970 es la marca vieja de "tuvo plan y se dio de baja".
  const daysLeft = Math.ceil((finPrueba.getTime() - ahora.getTime()) / DIA_MS)
  const activo = daysLeft > 0
  const finPlan = aFecha(prov.planPaidUntil)
  const tuvoPlan = !!finPlan || finPrueba.getTime() <= 0
  return {
    plan: 'trial',
    activo,
    trialDaysLeft: Math.max(0, daysLeft),
    trialEndsAt: finPrueba.toISOString(),
    esPro: false,
    etiqueta: activo ? `Prueba gratis · ${Math.max(0, daysLeft)} día${daysLeft === 1 ? '' : 's'}` : tuvoPlan ? 'Plan vencido' : 'Prueba finalizada',
    cancelado: false,
    accesoHasta: null,
    primerCobro: null,
    motivoInactivo: activo ? null : tuvoPlan ? 'plan_vencido' : 'prueba_terminada',
    vencioEl: activo ? null : finPlan ? finPlan.toISOString() : finPrueba.getTime() > 0 ? finPrueba.toISOString() : null,
  }
}

// ── Plan vencido: qué puede seguir haciendo el proveedor (D33) ──
// Regla: sin plan activo NO abre negocio nuevo, pero SÍ cierra lo que ya tiene con sus clientes y
// nunca pierde nada (panel, stock, ventas, cobros, finanzas, mensajes y perfil siguen ahí; lo público
// no lo muestra). Al volver a pagar, todo reaparece tal como estaba.
export type AccionProveedor =
  // negocio NUEVO → requiere plan activo
  | 'publicar_stock' | 'editar_stock' | 'borrar_stock' | 'aprobar_reserva' | 'marcar_disponible' | 'emitir_cobro'
  // cerrar lo que ya existe → siempre permitido
  | 'entregar' | 'confirmar_efectivo' | 'cancelar_pedido' | 'rechazar_reserva' | 'devolucion'

export const ACCIONES_NEGOCIO_NUEVO: readonly AccionProveedor[] = [
  'publicar_stock', 'editar_stock', 'borrar_stock', 'aprobar_reserva', 'marcar_disponible', 'emitir_cobro',
]

/** ¿Puede hacer esta acción con el estado de plan que tiene? */
export function accionPermitida(accion: AccionProveedor, estado: Pick<PlanState, 'activo'>): boolean {
  return estado.activo || !ACCIONES_NEGOCIO_NUEVO.includes(accion)
}

/** Mensaje honesto del 403 `needsPlan`: qué pasó y qué puede seguir haciendo. */
export function mensajePlanInactivo(estado: Pick<PlanState, 'motivoInactivo' | 'vencioEl'>, queQueria = 'vender'): string {
  const cuando = estado.vencioEl ? ` el ${fechaCortaAR(estado.vencioEl)}` : ''
  const que = estado.motivoInactivo === 'plan_vencido' ? `Tu plan venció${cuando}` : `Tu prueba gratis terminó${cuando}`
  return `${que}: elegí un plan (Básico o PRO) en "Mi plan" para ${queQueria}. Mientras tanto podés terminar las ventas que ya tenés (entregar, confirmar efectivo, cancelar, devoluciones).`
}

/** ¿El proveedor puede operar (escribir stock, cobrar, gestionar pedidos, aparecer en búsquedas)?
 *  Única regla para marketplace, búsqueda, directorio, sponsors, Homy y los 403 de escritura. */
export function puedeOperar(prov: PerfilPlan, ahora: Date = new Date()): boolean {
  return planState(prov, ahora).activo
}

export function esPlanPago(prov: { subscription: string }): boolean {
  return prov.subscription === 'basic' || prov.subscription === 'pro'
}

/**
 * ¿El proveedor tiene el Plan PRO ACTIVO? Única fuente de verdad para todo lo
 * que da el PRO: tarjeta "Recomendado", primero en directorio / marketplace /
 * búsquedas / agente Homy, y la cinta de sponsors de la home. Si cancela, lo
 * conserva hasta el fin del período pago; si deja de pagar o baja a Básico,
 * deja de cumplirse en el acto.
 */
export function esProActivo(prov: PerfilPlan, ahora: Date = new Date()): boolean {
  return prov.subscription === 'pro' && puedeOperar(prov, ahora)
}

// ── Fechas de la suscripción (D33) ──

/** Cobro de suscripción tal como está guardado (SubscriptionCharge). */
export type CobroPlan = { status: string; paidAt: Date | string | null; amount: number; refundedAmount?: number | null }

/** Un cobro cuenta como pagado si fue aprobado y no se reembolsó completo. */
export function cobroVale(c: CobroPlan): boolean {
  return c.status === 'approved' && !!c.paidAt && (c.refundedAmount ?? 0) < c.amount
}

/**
 * Hasta cuándo cubre lo ya pagado: el último cobro que vale (aprobado y no reembolsado completo)
 * + 1 mes. Si HomIA no tiene NINGÚN cobro registrado de esa suscripción se usa lo que informa
 * Mercado Pago (`summarized.last_charged_date` + 1 mes, o `next_payment_date` si MP dice que ya
 * cobró). Si HomIA sí tiene cobros pero ninguno vale (p. ej. el único se reembolsó), no se usa el
 * resumen de MP: MP sigue contando el cobro reembolsado y daría un período que nadie pagó.
 * Sin nada pagado → null (una suscripción elegida en la prueba y cancelada antes del primer cobro
 * no pagó nada).
 */
export function calcularPagadoHasta(input: {
  cobros: CobroPlan[]
  mp?: { cobrosMp?: number | null; ultimoCobroMp?: Date | string | null; proximoCobroMp?: Date | string | null } | null
}): Date | null {
  const validos = input.cobros.filter(cobroVale).map((c) => aFecha(c.paidAt)).filter((d): d is Date => !!d)
  if (validos.length) return sumarMes(validos.reduce((a, b) => (b.getTime() > a.getTime() ? b : a)))
  if (input.cobros.length) return null
  const ultMp = aFecha(input.mp?.ultimoCobroMp)
  if (ultMp) return sumarMes(ultMp)
  const prox = aFecha(input.mp?.proximoCobroMp)
  if ((input.mp?.cobrosMp ?? 0) > 0 && prox) return prox
  return null
}

/**
 * Cuándo tiene que ser el PRIMER cobro de una suscripción nueva (auto_recurring.start_date):
 *  · durante la prueba → el día que termina la prueba (no se come los días gratis);
 *  · con un plan cancelado y un período pago vigente → el día que termina lo ya pagado;
 *  · si no → null (MP cobra en el momento).
 * Margen de 10 minutos: MP exige una fecha futura.
 */
export function inicioPrimerCobro(prov: PerfilPlan, ahora: Date = new Date()): Date | null {
  const candidatos: Date[] = []
  const fin = finDePrueba(prov)
  // la prueba cuenta mientras no se haya consumido (trialEndsAt en 1970 = marca vieja de "consumida")
  candidatos.push(fin)
  const hasta = esPlanPago(prov) ? aFecha(prov.planPaidUntil) : null
  if (hasta) candidatos.push(hasta)
  const futuro = candidatos.filter((d) => d.getTime() > ahora.getTime() + 10 * 60_000)
  if (!futuro.length) return null
  return futuro.reduce((a, b) => (b.getTime() > a.getTime() ? b : a))
}

// ── Transiciones de plan (webhook de Mercado Pago, cancelar desde HomIA y cron diario) ──
// Función pura: dice QUÉ hacer con el perfil a partir del estado de una
// suscripción (preapproval). La aplican el webhook, el cron y el endpoint de
// cancelar con la base (src/lib/suscripciones-mp.ts → aplicarBajaSuscripcion).

export type PlanNotificacion = { type: string; title: string; body: string; link: string }

/** Al dar de baja: `planPaidUntil` queda con la fecha en que terminó el plan (para decir "tu plan
 *  venció el DD/MM"), o null si vuelve a una prueba vigente. */
type DatosDegradar = { subscription: 'trial'; proSince: null; planPaidUntil: Date | null }

export type PlanTransicion =
  | { kind: 'ignorar'; motivo: string }
  | {
      kind: 'activar'
      /** suscripción anterior a cancelar en MP (cambio de plan) */
      cancelarAnterior: string | null
      data: { subscription: 'basic' | 'pro'; mpPreapprovalId: string; proSince?: Date | null; planPaidUntil: null }
      notificacion: PlanNotificacion | null
    }
  | {
      /** cancelada/pausada con período pago vigente: sigue con su plan hasta `planPaidUntil` */
      kind: 'programar_baja'
      data: { planPaidUntil: Date }
      notificacion: PlanNotificacion
    }
  | {
      kind: 'degradar'
      // La prueba NO se pisa (antes se ponía trialEndsAt = 1970): si todavía le quedan días
      // gratis, los conserva; si ya terminó, queda como "prueba finalizada".
      data: DatosDegradar
      notificacion: PlanNotificacion
    }

const LINK_PLAN = '#/panel/proveedor/plan'
const degradar = (fin: Date | null): DatosDegradar => ({ subscription: 'trial', proSince: null, planPaidUntil: fin })

export type PerfilTransicion = {
  subscription: string
  mpPreapprovalId: string | null
  trialEndsAt?: Date | string | null
  createdAt?: Date | string
  planPaidUntil?: Date | string | null
}

export function planTransicion(
  prov: PerfilTransicion,
  pre: { id: string; status: string },
  planNuevo: 'basic' | 'pro',
  motivo: 'webhook' | 'impago' = 'webhook',
  extra: { pagadoHasta?: Date | null; ahora?: Date; desdeHomia?: boolean } = {}
): PlanTransicion {
  const anterior = prov.subscription
  const ahora = extra.ahora ?? new Date()
  const finPrueba = prov.createdAt || prov.trialEndsAt ? finDePrueba({ trialEndsAt: prov.trialEndsAt, createdAt: prov.createdAt ?? new Date(0) }) : null
  const pruebaVigente = !!finPrueba && finPrueba.getTime() > ahora.getTime()

  if (pre.status === 'authorized' && motivo !== 'impago') {
    const yaActivo = anterior === planNuevo && prov.mpPreapprovalId === pre.id && !prov.planPaidUntil
    if (yaActivo) return { kind: 'ignorar', motivo: 'la suscripción ya estaba activa' }
    // Cambio de plan: la suscripción vieja se cancela recién AHORA que la nueva
    // está autorizada (si el proveedor abandona el checkout, sigue con la vieja).
    const cancelarAnterior =
      prov.mpPreapprovalId && prov.mpPreapprovalId !== pre.id && esPlanPago(prov) && !prov.planPaidUntil ? prov.mpPreapprovalId : null
    const data: { subscription: 'basic' | 'pro'; mpPreapprovalId: string; proSince?: Date | null; planPaidUntil: null } = {
      subscription: planNuevo,
      mpPreapprovalId: pre.id,
      planPaidUntil: null,
    }
    if (planNuevo === 'pro' && anterior !== 'pro') data.proSince = new Date()
    if (planNuevo === 'basic' && anterior === 'pro') data.proSince = null

    const primerCobro = pruebaVigente && finPrueba ? ` Seguís en tu prueba gratis: el primer cobro de Mercado Pago es el ${fechaCortaAR(finPrueba)}, cuando termina.` : ''
    let notificacion: PlanNotificacion | null
    if (planNuevo === 'pro' && anterior !== 'pro') {
      notificacion = {
        type: 'pro_activa',
        title: '¡Subiste al plan PRO!',
        body: `Ya aparecés como Recomendado y primero en el directorio, el marketplace de materiales y las búsquedas. Cargá tu logo y tu marca en Mi perfil para salir en la cinta de sponsors de la home.${primerCobro}`,
        link: '#/panel/proveedor/perfil',
      }
    } else if (planNuevo === 'basic' && anterior === 'pro') {
      notificacion = {
        type: 'plan_basico',
        title: 'Pasaste al plan Básico',
        body: `Tu plan Básico está activo: seguís usando stock, ventas, cobros, CRM y vinculaciones. Dejaste de aparecer como Recomendado y en la cinta de sponsors de la home.${primerCobro}`,
        link: LINK_PLAN,
      }
    } else if (planNuevo === 'basic') {
      notificacion = {
        type: 'plan_basico',
        title: pruebaVigente ? 'Plan Básico elegido' : 'Plan Básico activo',
        body: `Tu plan Básico está activo: usá la plataforma completa (stock, ventas, cobros, CRM y vinculaciones).${primerCobro}`,
        link: LINK_PLAN,
      }
    } else if (prov.planPaidUntil) {
      notificacion = { type: 'pro_activa', title: 'Volviste a suscribirte al PRO', body: `Tu plan PRO sigue activo y se renueva todos los meses.${primerCobro}`, link: LINK_PLAN }
    } else {
      notificacion = null // PRO → PRO con otra suscripción: nada nuevo que contar
    }
    return { kind: 'activar', cancelarAnterior, data, notificacion }
  }

  if (pre.status === 'cancelled' || pre.status === 'paused' || motivo === 'impago') {
    // Solo da de baja la suscripción VIGENTE: la vieja de un cambio de plan (o una
    // que el proveedor abandonó en el checkout) no pisa el plan actual.
    if (!prov.mpPreapprovalId || prov.mpPreapprovalId !== pre.id) {
      return { kind: 'ignorar', motivo: 'no es la suscripción vigente' }
    }
    if (!esPlanPago(prov)) return { kind: 'ignorar', motivo: 'el plan ya estaba inactivo' }
    const planActual = anterior === 'pro' ? 'PRO' : 'Básico'

    if (motivo === 'impago') {
      return {
        kind: 'degradar',
        data: degradar(pruebaVigente ? null : extra.pagadoHasta ?? ahora),
        notificacion: {
          type: 'plan_cancelado',
          title: 'Tu plan se canceló por falta de pago',
          body: 'Mercado Pago no pudo cobrar tu plan: dejaste de aparecer en marketplace y sponsors. Elegí un plan para volver a vender en HomIA.',
          link: LINK_PLAN,
        },
      }
    }
    // ya tiene la baja programada (aviso repetido, o cancelada desde HomIA y MP avisa después)
    if (prov.planPaidUntil) return { kind: 'ignorar', motivo: 'la baja ya estaba programada' }

    const pausada = pre.status === 'paused'
    const hasta = extra.pagadoHasta ?? null
    if (hasta && hasta.getTime() > ahora.getTime()) {
      return {
        kind: 'programar_baja',
        data: { planPaidUntil: hasta },
        notificacion: {
          type: 'plan_cancelado',
          title: pausada ? 'Tu suscripción quedó pausada' : extra.desdeHomia ? 'Cancelaste tu suscripción' : 'Tu suscripción se canceló',
          body: `No se te vuelve a cobrar. Seguís con tu plan ${planActual} hasta el ${fechaCortaAR(hasta)}, el fin del período que ya pagaste (lo pagado no se reintegra). Después tu stock deja de verse hasta que elijas un plan.`,
          link: LINK_PLAN,
        },
      }
    }
    return {
      kind: 'degradar',
      data: degradar(pruebaVigente ? null : hasta ?? ahora),
      notificacion: {
        type: 'plan_cancelado',
        title: pausada ? 'Tu suscripción quedó pausada' : extra.desdeHomia ? 'Cancelaste tu suscripción' : 'Tu suscripción se canceló',
        body: pruebaVigente && finPrueba
          ? `Cancelaste el plan antes del primer cobro: no se te cobró nada. Seguís en tu prueba gratis hasta el ${fechaCortaAR(finPrueba)}; después elegí un plan para seguir vendiendo.`
          : 'Tu plan se canceló: dejaste de aparecer en marketplace y sponsors. Elegí un plan para volver a vender en HomIA.',
        link: LINK_PLAN,
      },
    }
  }

  return { kind: 'ignorar', motivo: `estado ${pre.status || 'desconocido'} sin acción` }
}

/**
 * Cron diario: un plan cancelado cuyo período pago ya terminó se da de baja. null = nada que hacer.
 */
export function planVencido(prov: { subscription: string; planPaidUntil: Date | string | null }, ahora: Date = new Date()):
  | { kind: 'degradar'; data: DatosDegradar; notificacion: PlanNotificacion }
  | null {
  const hasta = aFecha(prov.planPaidUntil)
  if (!esPlanPago(prov) || !hasta || hasta.getTime() > ahora.getTime()) return null
  return {
    kind: 'degradar',
    data: degradar(hasta),
    notificacion: {
      type: 'plan_vencido',
      title: 'Terminó tu plan',
      body: `El período que pagaste terminó el ${fechaCortaAR(hasta)}: tu stock dejó de verse en marketplace, búsquedas y directorio. Tus datos, reseñas y vinculaciones se conservan. Elegí un plan para volver a vender.`,
      link: LINK_PLAN,
    },
  }
}
