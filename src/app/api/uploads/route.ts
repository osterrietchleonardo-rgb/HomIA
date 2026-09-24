import { NextRequest } from 'next/server'
import { ok, fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

// Subida real de imágenes a Supabase Storage.
//   · folder 'dni' → bucket PRIVADO `dni-docs`; se devuelve el path interno
//     ("dni-docs/<userId>/dni/<archivo>"), nunca una URL pública. Solo el dueño
//     obtiene una signed URL (GET /api/profiles/me, GET /api/verification/dni).
//   · resto → bucket público `homia-uploads` (obras, reseñas, avatares).
// Solo JPG/PNG/WEBP (validados por magic bytes, no por el content-type que dice
// el navegador), máximo 8 MB.
export const maxDuration = 60

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'] as const
type AllowedType = (typeof ALLOWED)[number]
const MAX_SIZE = 8 * 1024 * 1024 // 8 MB
const PUBLIC_BUCKET = 'homia-uploads'
const DNI_BUCKET = 'dni-docs'

/** Detecta el tipo real por los primeros bytes (JPEG / PNG / WEBP). */
function sniffImageType(head: Uint8Array): AllowedType | null {
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg'
  if (
    head.length >= 8 &&
    head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47 &&
    head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a
  ) return 'image/png'
  if (
    head.length >= 12 &&
    head[0] === 0x52 && head[1] === 0x49 && head[2] === 0x46 && head[3] === 0x46 && // RIFF
    head[8] === 0x57 && head[9] === 0x45 && head[10] === 0x42 && head[11] === 0x50 // WEBP
  ) return 'image/webp'
  return null
}

export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para subir archivos', 401)

  // Cliente de Storage creado en el handler: si faltan las envs, 503 honesto
  // (nunca un crash al importar el módulo).
  const supabaseUrl = process.env.SUPABASE_PROJECT_URL
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE
  if (!supabaseUrl || !serviceRole) {
    return fail('La subida de archivos no está disponible por ahora (almacenamiento no configurado).', 503, { needsConfig: true })
  }

  const form = await req.formData().catch(() => null)
  if (!form) return fail('No se recibió ningún archivo')
  const file = form.get('file')
  if (!(file instanceof File)) return fail('No se recibió ningún archivo')
  const rawFolder = String(form.get('folder') || 'general').trim()
  const folder = /^[a-zA-Z0-9_-]{1,40}$/.test(rawFolder) ? rawFolder : 'general'

  if (!ALLOWED.includes(file.type as AllowedType)) return fail('Formato no permitido (usá JPG, PNG o WEBP)')
  if (file.size > MAX_SIZE) return fail('La imagen supera los 8 MB')
  if (file.size === 0) return fail('El archivo está vacío')

  const bytes = new Uint8Array(await file.arrayBuffer())
  const realType = sniffImageType(bytes.subarray(0, 12))
  if (!realType) return fail('El archivo no es una imagen JPG, PNG o WEBP válida')

  const ext = realType === 'image/jpeg' ? 'jpg' : realType === 'image/png' ? 'png' : 'webp'
  const name = `${crypto.randomBytes(8).toString('hex')}.${ext}`
  const path = `${user.id}/${folder}/${name}`
  const isDni = folder === 'dni'
  const bucket = isDni ? DNI_BUCKET : PUBLIC_BUCKET

  const supabase = createClient(supabaseUrl, serviceRole, { auth: { persistSession: false } })
  const { error } = await supabase.storage.from(bucket).upload(path, bytes, {
    contentType: realType,
    upsert: false,
  })
  if (error) {
    console.error('[uploads] Supabase Storage:', error)
    return fail('No pudimos guardar la imagen. Probá de nuevo en unos segundos.', 500)
  }

  if (isDni) {
    // path interno, sin URL pública: el documento es privado
    return ok({ url: `${DNI_BUCKET}/${path}`, name, size: file.size, type: realType, private: true }, 201)
  }
  const { data: { publicUrl } } = supabase.storage.from(PUBLIC_BUCKET).getPublicUrl(path)
  return ok({ url: publicUrl, name, size: file.size, type: realType }, 201)
}
