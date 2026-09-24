// Videoteca HomIA — videitos cortos con locución que explican cada sección,
// cada acción posible de cada rol. Los MP4 se generan con scripts/gen-videos.py
// y viven en /public/videos. Duración real la reporta el propio <video>.
export type VideoRole = 'cliente' | 'profesional' | 'proveedor'

export type VideoItem = {
  id: string
  role: VideoRole
  title: string
  desc: string
}

export const ROLE_VIDEO_LABEL: Record<VideoRole, string> = {
  cliente: 'Cliente',
  profesional: 'Profesional',
  proveedor: 'Proveedor',
}

export const VIDEOS: VideoItem[] = [
  {
    id: 'cli-bienvenida',
    role: 'cliente',
    title: 'Bienvenido a HomIA',
    desc: 'Qué es HomIA, los tres roles y tu ruta recomendada para arrancar.',
  },
  {
    id: 'cli-contratar',
    role: 'cliente',
    title: 'Publicar y contratar',
    desc: 'De contarle a Homy qué necesitás hasta contratar y pagar al finalizar.',
  },
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
    id: 'pro-bienvenida',
    role: 'profesional',
    title: 'Tu cuenta profesional',
    desc: 'Tu vidriera, la verificación con DNI y tus obras publicadas.',
  },
  {
    id: 'pro-presupuestos',
    role: 'profesional',
    title: 'Presupuestos y trabajos',
    desc: 'De la oportunidad al trabajo aprobado y cobrado.',
  },
  {
    id: 'pro-cobros',
    role: 'profesional',
    title: 'Cobrar tus facturas',
    desc: 'Modos de pago, efectivo y el modo A con todo junto.',
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
  {
    id: 'prv-ventas',
    role: 'proveedor',
    title: 'Ventas y cobros',
    desc: 'Pedidos desde la obra, cobro directo al cliente y facturas en PDF.',
  },
]

export const videosForRole = (role: VideoRole | string | null | undefined): VideoItem[] =>
  role ? VIDEOS.filter((v) => v.role === role) : VIDEOS

export const videoSrc = (id: string) => `/videos/${id}.mp4`
export const videoPoster = (id: string) => `/videos/${id}.jpg`
