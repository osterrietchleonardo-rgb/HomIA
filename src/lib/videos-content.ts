// Videoteca HomIA — videitos cortos con locución que explican cada sección,
// cada acción posible de cada rol. Los MP4 se generan con scripts/medios/gen-videos.py
// y viven en /public/videos. Duración real la reporta el propio <video>.
export type VideoRole = 'cliente' | 'profesional' | 'proveedor'

export type VideoItem = {
  id: string
  role: VideoRole
  title: string
  desc: string
  /** 9:16 (videos v2 del 25/09/2026, grabados para el celular) */
  vertical?: boolean
}

export const ROLE_VIDEO_LABEL: Record<VideoRole, string> = {
  cliente: 'Cliente',
  profesional: 'Profesional',
  proveedor: 'Proveedor',
}

// 25/09/2026: se sacaron de la lista (los MP4 siguen en /public/videos) los videos que decían cosas
// que la app no hace: pago "protegido"/"reservado"/escrow (HomIA no retiene plata: se paga al terminar,
// directo al vendedor), que el profesional da la obra por terminada (la finaliza el cliente), plan PRO de
// profesionales (legado) y que el cliente aprueba los pedidos de materiales del proveedor (D15).
// Vuelven cuando se graben de nuevo (guiones en el doc "Videos de ayuda de HomIA"). Los v2 de
// cli-bienvenida, cli-contratar, cli-carrito, gen-registro, pro-bienvenida, pro-presupuestos y prv-ventas
// NO se publican todavía: usan capturas de una versión vieja ("agentes de IA", precios en US$, registro viejo).
export const VIDEOS: VideoItem[] = [
  {
    id: 'cli-materiales',
    role: 'cliente',
    title: 'Materiales: los dos modos',
    desc: 'Modo A: el profesional adelanta. Modo B: vos pagás los materiales al proveedor.',
  },
  {
    id: 'cli-resenas',
    role: 'cliente',
    title: 'Reseñas y mensajes',
    desc: 'Cuándo y dónde se deja la reseña, y por qué el chat arranca por vos.',
  },
  {
    id: 'pro-materiales',
    role: 'profesional',
    title: 'Materiales con proveedores',
    desc: 'Comparador de precios y vinculaciones con tus casas de materiales.',
  },
  {
    id: 'prv-bienvenida',
    role: 'proveedor',
    title: 'Tu negocio en HomIA',
    desc: 'Tu stock como vidriera, verificación y vinculaciones.',
  },
  {
    id: 'prv-stock',
    role: 'proveedor',
    title: 'Publicar y cuidar tu stock',
    desc: 'Publicar elementos, estados automáticos y edición sin fricción.',
  },
  // Videos v2 (25/09/2026, verticales): los que usan pantallas iguales a la app de hoy.
  { id: 'gen-sugerencias', role: 'cliente', title: 'Contanos qué mejorar', desc: 'Sugerencias, quejas e ideas con fotos: seguís el estado y te respondemos.', vertical: true },
  { id: 'cli-devoluciones', role: 'cliente', title: 'Devolver lo que sobró', desc: 'Hasta 30 días: quien te lo vendió lo acepta y te devuelven la plata.', vertical: true },
  { id: 'pro-calendario', role: 'profesional', title: 'Tu calendario y las fechas', desc: 'Proponé días y horario de cada trabajo sin pisarte con otro.', vertical: true },
  { id: 'pro-cobros', role: 'profesional', title: 'Cobrar tus trabajos', desc: 'Conectá tu Mercado Pago, cobrá directo a tu cuenta o en efectivo.', vertical: true },
  { id: 'gen-finanzas', role: 'profesional', title: 'Finanzas: cuánto ganás de verdad', desc: 'Resultados, caja y qué mirar, sin saber de contabilidad.', vertical: true },
  { id: 'gen-sugerencias', role: 'profesional', title: 'Contanos qué mejorar', desc: 'Sugerencias, quejas e ideas con fotos: seguís el estado y te respondemos.', vertical: true },
  { id: 'prv-plan', role: 'proveedor', title: 'Tu plan y cómo cancelar', desc: 'Prueba de 14 días, Básico y PRO, primer cobro y cancelación.', vertical: true },
  { id: 'gen-finanzas', role: 'proveedor', title: 'Finanzas: cuánto ganás de verdad', desc: 'Resultados, caja y qué mirar, sin saber de contabilidad.', vertical: true },
  { id: 'gen-sugerencias', role: 'proveedor', title: 'Contanos qué mejorar', desc: 'Sugerencias, quejas e ideas con fotos: seguís el estado y te respondemos.', vertical: true },
]

export const videosForRole = (role: VideoRole | string | null | undefined): VideoItem[] =>
  role ? VIDEOS.filter((v) => v.role === role) : VIDEOS

export const videoSrc = (id: string) => `/videos/${id}.mp4`
export const videoPoster = (id: string) => `/videos/${id}.jpg`
