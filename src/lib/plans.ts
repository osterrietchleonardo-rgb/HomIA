// Planes de suscripción de HomIA — SOLO los proveedores pagan.
// El cliente y el profesional usan la plataforma gratis, siempre.
//
// ── Plan Básico: $50.000/mes ──
//   · 14 días de prueba gratis desde el alta del proveedor
//   · Uso completo de la plataforma: stock, ventas directas, cobros, CRM, vinculaciones
// ── Plan PRO: $100.000/mes ──
//   · Todo lo del Básico, más:
//   · Logo y marca en la home como proveedor sponsor
//   · Tarjeta destacada "Recomendado" en marketplace y directorio
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
