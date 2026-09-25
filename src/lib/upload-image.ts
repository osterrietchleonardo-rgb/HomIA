'use client'
// Subida de fotos desde el navegador, común a TODA la app (perfil, logo, obras, stock, reseñas,
// sobrantes, DNI, trabajos, contratar, sugerencias, finanzas).
//
// Por qué existe (25/09/2026, Leonardo: "cuando quiero subir una foto de perfil me dice 'no se
// pudo subir la foto'"):
//  · Vercel corta cualquier pedido de más de 4,5 MB ANTES de llegar a la app (responde 413 con
//    HTML) y las fotos de celular pesan 3-8 MB: fallaba sin explicación.
//  · Cada pantalla tiraba "no se pudo subir la foto" sin leer el motivo que da el servidor.
// Qué hace: lee la imagen en el navegador, la achica si hace falta (lado mayor 2000 px, 2600 px
// para el DNI) y la comprime por debajo de 3,5 MB. Así acepta cualquier tamaño y peso. Si la
// imagen no se puede leer (p. ej. HEIC de iPhone en un navegador que no lo entiende) o falla la
// subida, devuelve un mensaje que dice exactamente qué pasó y qué hacer.

export type SubidaOk = { ok: true; url: string; private?: boolean; width: number; height: number; bytes: number }
export type SubidaError = { ok: false; error: string }
export type Subida = SubidaOk | SubidaError

export type OpcionesImagen = {
  /** Lado mayor máximo en píxeles (por defecto 2000; el DNI usa 2600 para que se lea bien). */
  maxLado?: number
  /** Peso máximo del archivo que se sube (por defecto 3,5 MB, debajo del límite de Vercel). */
  maxBytes?: number
}

const MB = 1024 * 1024
const ACEPTADOS = ['image/jpeg', 'image/png', 'image/webp']

function esHeic(file: File) {
  return /heic|heif/i.test(file.type) || /\.(heic|heif)$/i.test(file.name)
}

function mb(bytes: number) {
  return `${(bytes / MB).toFixed(1).replace('.', ',')} MB`
}

type Decodificada = { fuente: CanvasImageSource; ancho: number; alto: number; cerrar: () => void }

async function decodificar(file: File): Promise<Decodificada | null> {
  // createImageBitmap respeta la orientación EXIF (fotos de celular giradas)
  if (typeof createImageBitmap === 'function') {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' })
      return { fuente: bmp, ancho: bmp.width, alto: bmp.height, cerrar: () => bmp.close() }
    } catch {
      /* sigue con <img> */
    }
  }
  const url = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image()
      i.onload = () => resolve(i)
      i.onerror = () => reject(new Error('no se pudo leer'))
      i.src = url
    })
    return { fuente: img, ancho: img.naturalWidth, alto: img.naturalHeight, cerrar: () => URL.revokeObjectURL(url) }
  } catch {
    URL.revokeObjectURL(url)
    return null
  }
}

function aBlob(canvas: HTMLCanvasElement, tipo: string, calidad: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), tipo, calidad))
}

/**
 * Deja la foto lista para subir: la misma si ya cumple (formato aceptado, peso y tamaño), o una
 * versión achicada y comprimida. Nunca tira: devuelve el archivo o un mensaje claro.
 */
export async function prepararImagen(
  file: File,
  opts: OpcionesImagen = {},
): Promise<{ ok: true; file: File; width: number; height: number } | SubidaError> {
  const maxLado = opts.maxLado ?? 2000
  const maxBytes = opts.maxBytes ?? 3.5 * MB
  if (!file || file.size === 0) return { ok: false, error: 'El archivo está vacío. Elegí otra foto.' }
  if (file.type && !file.type.startsWith('image/') && !esHeic(file)) {
    return { ok: false, error: 'Eso no es una imagen. Elegí una foto (JPG, PNG, WEBP o la de la cámara del celu).' }
  }

  const img = await decodificar(file)
  if (!img) {
    if (esHeic(file)) {
      return {
        ok: false,
        error:
          'Este navegador no puede abrir fotos HEIC del iPhone. Subila desde el iPhone (se convierte sola), o en el iPhone andá a Ajustes > Cámara > Formatos > "Más compatible", o mandala como JPG.',
      }
    }
    return { ok: false, error: 'No pudimos abrir la imagen: puede estar dañada o en un formato raro. Probá con otra foto o una captura de pantalla.' }
  }

  try {
    const { ancho, alto } = img
    if (!ancho || !alto) return { ok: false, error: 'La imagen no tiene contenido. Probá con otra foto.' }
    const cumple = ACEPTADOS.includes(file.type) && file.size <= maxBytes && Math.max(ancho, alto) <= maxLado
    if (cumple) return { ok: true, file, width: ancho, height: alto }

    const conTransparencia = file.type === 'image/png' || file.type === 'image/webp'
    let escala = Math.min(1, maxLado / Math.max(ancho, alto))
    for (let intento = 0; intento < 6; intento++) {
      const w = Math.max(1, Math.round(ancho * escala))
      const h = Math.max(1, Math.round(alto * escala))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return { ok: false, error: 'Tu navegador no permitió preparar la foto. Probá con otro navegador.' }
      for (const calidad of [0.85, 0.75, 0.65]) {
        let tipo = conTransparencia ? 'image/webp' : 'image/jpeg'
        ctx.clearRect(0, 0, w, h)
        if (tipo === 'image/jpeg') {
          ctx.fillStyle = '#ffffff' // sin fondo negro en PNG con transparencia
          ctx.fillRect(0, 0, w, h)
        }
        ctx.drawImage(img.fuente, 0, 0, w, h)
        let blob = await aBlob(canvas, tipo, calidad)
        if (blob && tipo === 'image/webp' && blob.type !== 'image/webp') {
          // el navegador no sabe hacer WEBP (Safari viejo): JPEG con fondo blanco
          tipo = 'image/jpeg'
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, w, h)
          ctx.drawImage(img.fuente, 0, 0, w, h)
          blob = await aBlob(canvas, tipo, calidad)
        }
        if (blob && blob.size <= maxBytes) {
          const ext = tipo === 'image/webp' ? 'webp' : 'jpg'
          const base = (file.name || 'foto').replace(/\.[^.]+$/, '') || 'foto'
          return { ok: true, file: new File([blob], `${base}.${ext}`, { type: tipo }), width: w, height: h }
        }
      }
      escala *= 0.8
    }
    return { ok: false, error: `No pudimos achicar la foto por debajo de ${mb(maxBytes)}. Probá con otra o recortala.` }
  } finally {
    img.cerrar()
  }
}

/** Traduce la respuesta del servidor a un mensaje claro. */
async function motivoDelServidor(res: Response): Promise<string> {
  let msg = ''
  try {
    const j = await res.clone().json()
    msg = typeof j?.error === 'string' ? j.error : ''
  } catch {
    /* no era JSON (p. ej. el 413 de Vercel es HTML) */
  }
  if (res.status === 401) return 'Tu sesión se cerró. Ingresá de nuevo y volvé a subir la foto.'
  if (res.status === 413) return 'La foto pesa demasiado para subirla. Probá con otra o recortala.'
  if (res.status === 429) return msg || 'Subiste muchas fotos seguidas. Esperá unos minutos y probá de nuevo.'
  if (msg) return msg
  if (res.status >= 500) return 'El servidor no pudo guardar la foto. Probá de nuevo en unos segundos.'
  return `No pudimos subir la foto (error ${res.status}). Probá de nuevo.`
}

/**
 * Prepara y sube una foto a /api/uploads. `folder` es la carpeta de siempre ('general', 'dni',
 * 'sobrantes', 'reviews', …). Devuelve la URL (o el path privado) o un mensaje claro.
 */
export async function subirImagen(file: File, folder?: string, opts: OpcionesImagen = {}): Promise<Subida> {
  const lista = await prepararImagen(file, { maxLado: folder === 'dni' ? 2600 : undefined, ...opts })
  if (!lista.ok) return lista
  const fd = new FormData()
  fd.append('file', lista.file)
  if (folder) fd.append('folder', folder)
  let res: Response
  try {
    res = await fetch('/api/uploads', { method: 'POST', body: fd })
  } catch {
    return { ok: false, error: 'No hay conexión o se cortó mientras subía la foto. Revisá internet y probá de nuevo.' }
  }
  if (!res.ok) return { ok: false, error: await motivoDelServidor(res) }
  try {
    const data = await res.json()
    if (!data?.url) return { ok: false, error: 'El servidor no devolvió la foto guardada. Probá de nuevo.' }
    return { ok: true, url: data.url, private: !!data.private, width: lista.width, height: lista.height, bytes: lista.file.size }
  } catch {
    return { ok: false, error: 'El servidor respondió algo inesperado. Probá de nuevo.' }
  }
}
