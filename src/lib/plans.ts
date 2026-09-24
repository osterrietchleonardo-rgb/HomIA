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

export type ProviderPlan = 'trial' | 'basic' | 'pro'

export const TRIAL_DAYS = 14

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

export type PlanState = {
  plan: ProviderPlan
  activo: boolean // puede operar (plan de pago activo o prueba vigente)
  trialDaysLeft: number | null
  trialEndsAt: string | null
  esPro: boolean
  etiqueta: string
}

/** Estado del plan de un proveedor, con la cuenta regresiva de la prueba. */
export function planState(
  prov: { subscription: string; trialEndsAt?: Date | null; createdAt: Date | string }
): PlanState {
  const sub = prov.subscription || 'trial'
  const esPro = sub === 'pro'
  if (sub === 'basic' || sub === 'pro') {
    return {
      plan: sub,
      activo: true,
      trialDaysLeft: null,
      trialEndsAt: null,
      esPro,
      etiqueta: sub === 'pro' ? 'Plan PRO' : 'Plan Básico',
    }
  }
  // trial
  const end = prov.trialEndsAt
    ? new Date(prov.trialEndsAt)
    : new Date(new Date(prov.createdAt).getTime() + TRIAL_DAYS * 86400000)
  const daysLeft = Math.ceil((end.getTime() - Date.now()) / 86400000)
  return {
    plan: 'trial',
    activo: daysLeft > 0,
    trialDaysLeft: Math.max(0, daysLeft),
    trialEndsAt: end.toISOString(),
    esPro: false,
    etiqueta: daysLeft > 0 ? `Prueba gratis · ${Math.max(0, daysLeft)} día${daysLeft === 1 ? '' : 's'}` : 'Prueba finalizada',
  }
}

/** ¿El proveedor puede operar (escribir stock, cobrar, gestionar pedidos, aparecer en búsquedas)? */
export function puedeOperar(prov: { subscription: string; trialEndsAt?: Date | null; createdAt: Date | string }): boolean {
  return planState(prov).activo
}

export function esPlanPago(prov: { subscription: string }): boolean {
  return prov.subscription === 'basic' || prov.subscription === 'pro'
}

/**
 * ¿El proveedor tiene el Plan PRO ACTIVO? Única fuente de verdad para todo lo
 * que da el PRO: tarjeta "Recomendado", primero en directorio / marketplace /
 * búsquedas / agente Homy, y la cinta de sponsors de la home. Si deja de pagar
 * o baja a Básico, deja de cumplirse en el acto.
 */
export function esProActivo(prov: { subscription: string; trialEndsAt?: Date | null; createdAt: Date | string }): boolean {
  return prov.subscription === 'pro' && puedeOperar(prov)
}

// ── Transiciones de plan (webhook de Mercado Pago + reconciliación diaria) ──
// Función pura: dice QUÉ hacer con el perfil a partir del estado de una
// suscripción (preapproval). La aplican el webhook y el cron con la base.

export type PlanNotificacion = { type: string; title: string; body: string; link: string }

export type PlanTransicion =
  | { kind: 'ignorar'; motivo: string }
  | {
      kind: 'activar'
      /** suscripción anterior a cancelar en MP (cambio de plan) */
      cancelarAnterior: string | null
      data: { subscription: 'basic' | 'pro'; mpPreapprovalId: string; proSince?: Date | null }
      notificacion: PlanNotificacion | null
    }
  | {
      kind: 'degradar'
      data: { subscription: 'trial'; trialEndsAt: Date; proSince: null }
      notificacion: PlanNotificacion
    }

const LINK_PLAN = '#/panel/proveedor/plan'

export function planTransicion(
  prov: { subscription: string; mpPreapprovalId: string | null },
  pre: { id: string; status: string },
  planNuevo: 'basic' | 'pro',
  motivo: 'webhook' | 'impago' = 'webhook'
): PlanTransicion {
  const anterior = prov.subscription

  if (pre.status === 'authorized' && motivo !== 'impago') {
    const yaActivo = anterior === planNuevo && prov.mpPreapprovalId === pre.id
    if (yaActivo) return { kind: 'ignorar', motivo: 'la suscripción ya estaba activa' }
    // Cambio de plan: la suscripción vieja se cancela recién AHORA que la nueva
    // está autorizada (si el proveedor abandona el checkout, sigue con la vieja).
    const cancelarAnterior =
      prov.mpPreapprovalId && prov.mpPreapprovalId !== pre.id && esPlanPago(prov) ? prov.mpPreapprovalId : null
    const data: { subscription: 'basic' | 'pro'; mpPreapprovalId: string; proSince?: Date | null } = {
      subscription: planNuevo,
      mpPreapprovalId: pre.id,
    }
    if (planNuevo === 'pro' && anterior !== 'pro') data.proSince = new Date()
    if (planNuevo === 'basic' && anterior === 'pro') data.proSince = null

    let notificacion: PlanNotificacion | null
    if (planNuevo === 'pro' && anterior !== 'pro') {
      notificacion = {
        type: 'pro_activa',
        title: '¡Subiste al plan PRO!',
        body: 'Ya aparecés como Recomendado y primero en el directorio, el marketplace de materiales y las búsquedas. Cargá tu logo y tu marca en Mi perfil para salir en la cinta de sponsors de la home.',
        link: '#/panel/proveedor/perfil',
      }
    } else if (planNuevo === 'basic' && anterior === 'pro') {
      notificacion = {
        type: 'plan_basico',
        title: 'Pasaste al plan Básico',
        body: 'Tu plan Básico está activo: seguís usando stock, ventas, cobros, CRM y vinculaciones. Dejaste de aparecer como Recomendado y en la cinta de sponsors de la home.',
        link: LINK_PLAN,
      }
    } else if (planNuevo === 'basic') {
      notificacion = {
        type: 'plan_basico',
        title: 'Plan Básico activo',
        body: 'Tu plan Básico está activo: usá la plataforma completa (stock, ventas, cobros, CRM y vinculaciones).',
        link: LINK_PLAN,
      }
    } else {
      notificacion = null // PRO → PRO con otra suscripción: nada nuevo que contar
    }
    return { kind: 'activar', cancelarAnterior, data, notificacion }
  }

  if (pre.status === 'cancelled' || pre.status === 'paused' || motivo === 'impago') {
    // Solo degrada la suscripción VIGENTE: la vieja de un cambio de plan (o una
    // que el proveedor abandonó en el checkout) no pisa el plan actual.
    if (!prov.mpPreapprovalId || prov.mpPreapprovalId !== pre.id) {
      return { kind: 'ignorar', motivo: 'no es la suscripción vigente' }
    }
    if (!esPlanPago(prov)) return { kind: 'ignorar', motivo: 'el plan ya estaba inactivo' }
    const title =
      motivo === 'impago' ? 'Tu plan se canceló por falta de pago'
        : pre.status === 'paused' ? 'Tu suscripción quedó pausada'
          : 'Tu plan se canceló'
    return {
      kind: 'degradar',
      // sin plan de pago vuelve a "trial" ya consumido → se le pide elegir plan
      data: { subscription: 'trial', trialEndsAt: new Date(0), proSince: null },
      notificacion: {
        type: 'plan_cancelado',
        title,
        body: 'Tu plan se canceló: dejaste de aparecer en marketplace y sponsors. Elegí un plan para volver a vender en HomIA.',
        link: LINK_PLAN,
      },
    }
  }

  return { kind: 'ignorar', motivo: `estado ${pre.status || 'desconocido'} sin acción` }
}
