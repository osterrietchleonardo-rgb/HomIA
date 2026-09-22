import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { createClient } from '@supabase/supabase-js'
import crypto from 'crypto'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
const MAX_SIZE = 8 * 1024 * 1024 // 8MB

const supabaseUrl = process.env.SUPABASE_PROJECT_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE!
const supabase = createClient(supabaseUrl, supabaseKey)

// Subida real de archivos (DNI frente/dorso, fotos de obras y trabajos)
// → Supabase Storage bucket 'homia-uploads' -> {userId}/{folder}/{nombre}.ext
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para subir archivos', 401)

  const form = await req.formData()
  const file = form.get('file') as File | null
  const rawFolder = ((form.get('folder') as string) || 'general').trim()
  const folder = /^[a-zA-Z0-9_-]{1,40}$/.test(rawFolder) ? rawFolder : 'general'
  if (!file) return fail('No se recibió ningún archivo')
  if (!ALLOWED.includes(file.type)) return fail('Formato no permitido (usá JPG, PNG, WEBP o PDF)')
  if (file.size > MAX_SIZE) return fail('El archivo supera los 8MB')

  const ext = file.type === 'application/pdf' ? '.pdf' : `.${file.type.split('/')[1].replace('jpeg', 'jpg')}`
  const name = `${crypto.randomBytes(8).toString('hex')}${ext}`
  const path = `${user.id}/${folder}/${name}`

  const { data, error } = await supabase.storage.from('homia-uploads').upload(path, file, {
    contentType: file.type,
    upsert: false
  })

  if (error) {
    console.error('Supabase upload error:', error)
    return fail('Error al subir el archivo al servidor', 500)
  }

  const { data: { publicUrl } } = supabase.storage.from('homia-uploads').getPublicUrl(path)

  return NextResponse.json({ url: publicUrl, name, size: file.size, type: file.type })
}
