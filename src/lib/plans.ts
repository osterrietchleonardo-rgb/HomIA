// Planes de suscripción de HomIA — SOLO los proveedores pagan.
// El cliente y el profesional usan la plataforma gratis, siempre.
//
// ── Plan Básico: US$50/mes ──
//   · 14 días de prueba gratis desde el alta del proveedor
//   · Uso completo de la plataforma: stock, CRM, cobros, mensajería, marketplace
// ── Plan PRO: US$100/mes ──
//   · Todo lo del Básico, más:
//   · Analítica en el panel: elementos más pedidos, consultas del rubro,
//     búsquedas que encontraron tu negocio, tendencias
//   · Tarjeta destacada "Recomendado" en primera fila del directorio,
//     del marketplace de materiales y de la búsqueda
//   · Logo y marca en la home como proveedor sponsor de confianza

export type ProviderPlan = 'trial' | 'basic' | 'pro'

export const TRIAL_DAYS = 14

// Precios canónicos del producto (USD) — lo que ve el proveedor
export const PLAN_PRICE_USD: Record<'basic' | 'pro', number> = {
  basic: 50,
  pro: 100,
}

// Equivalente en ARS para cobrar con Mercado Pago (configurable por env;
// default ≈ US$1 = $1500 ARS)
export const MP_PLAN_PRICE_ARS: Record<'basic' | 'pro', number> = {
  basic: Number(process.env.MP_PROVIDER_BASIC_ARS || 75000),
  pro: Number(process.env.MP_PROVIDER_PRO_ARS || 150000),
}

export const PLAN_FEATURES: Record<'basic' | 'pro', string[]> = {
  basic: [
    'Uso completo de la plataforma: stock, pedidos, cobros y mensajería',
    'Aparecés en el directorio y en el marketplace de materiales',
    'Cobrás con Mercado Pago o efectivo con registro de cada venta',
  ],
  pro: [
    'Todo lo del plan Básico',
    'Analítica del negocio: elementos más pedidos, consultas de tu rubro y búsquedas que te encontraron',
    'Tarjeta destacada con etiqueta “Recomendado” en primera fila del directorio y del marketplace',
    'Tu logo y marca en la home como proveedor sponsor de confianza',
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

/** ¿El proveedor puede operar (escribir stock, cobrar, gestionar pedidos)? */
export function puedeOperar(prov: { subscription: string; trialEndsAt?: Date | null; createdAt: Date | string }): boolean {
  return planState(prov).activo
}

export function esPlanPago(prov: { subscription: string }): boolean {
  return prov.subscription === 'basic' || prov.subscription === 'pro'
}
