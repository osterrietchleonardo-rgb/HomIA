// Qué NO se registra en las métricas de uso (pedido de Leonardo, 25/09/2026: "en /admin
// limpiar/no registrar lo generado/hecho por los demo y tuyos, deben ser 100% reales de clientes
// reales"). Reglas puras, con tests en src/lib/__tests__/analytics-filtro.test.ts.
//
// · Solo se registra en el sitio publicado (VERCEL_ENV=production). Los servidores locales y las
//   vistas previas escriben en la MISMA base (base única), así que sin esta regla cada prueba
//   ensuciaba las métricas. Las pruebas E2E que miden el registro levantan su server con
//   ANALYTICS_EN_DESARROLLO=1 y purgan lo suyo al final.
// · Nunca navegadores automatizados (Playwright, Chrome sin ventana, robots de buscadores).
// · Nunca el navegador del administrador (cookie de /admin o la marca homia_track_off).

type Entorno = { VERCEL_ENV?: string; ANALYTICS_EN_DESARROLLO?: string }

export function registroHabilitado(env: Entorno = process.env as Entorno): boolean {
  if (env.ANALYTICS_EN_DESARROLLO === '1') return true
  return env.VERCEL_ENV === 'production'
}

const AUTOMATIZADO = /HeadlessChrome|Playwright|Puppeteer|Lighthouse|PhantomJS|Selenium|WebDriver|Googlebot|bingbot|\b(bot|crawler|spider|curl|wget|python-requests|node-fetch|undici)\b/i

export function esNavegadorAutomatizado(ua: string | null | undefined): boolean {
  if (!ua) return true // sin user agent no es una persona con un navegador
  return AUTOMATIZADO.test(ua)
}

/** Email del dueño (ADMIN_EMAIL): si además tiene una cuenta de usuario, su uso tampoco cuenta. */
export function esEmailDelDueno(email: string | null | undefined, env: { ADMIN_EMAIL?: string } = process.env as { ADMIN_EMAIL?: string }): boolean {
  const admin = (env.ADMIN_EMAIL || '').trim().toLowerCase()
  return !!admin && !!email && email.trim().toLowerCase() === admin
}
