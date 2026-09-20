import { NextRequest, NextResponse } from 'next/server'
import { fail } from '@/lib/api'
import { getSessionUser } from '@/lib/auth'
import { writeFile, mkdir } from 'fs/promises'
import path from 'path'
import crypto from 'crypto'

const ALLOWED = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'application/pdf']
const MAX_SIZE = 8 * 1024 * 1024 // 8MB

// Subida real de archivos (DNI frente/dorso, fotos de obras y trabajos)
// → /public/uploads/{userId}/{nombre}.ext
export async function POST(req: NextRequest) {
  const user = await getSessionUser()
  if (!user) return fail('Necesitás iniciar sesión para subir archivos', 401)

  const form = await req.formData()
  const file = form.get('file') as File | null
  const rawFolder = ((form.get('folder') as string) || 'general').trim()
  // sanitización estricta del folder: solo letras, números, guiones y guiones bajos
  // (evita path traversal tipo "../../etc" escribiendo fuera de /uploads)
  const folder = /^[a-zA-Z0-9_-]{1,40}$/.test(rawFolder) ? rawFolder : 'general'
  if (!file) return fail('No se recibió ningún archivo')
  if (!ALLOWED.includes(file.type)) return fail('Formato no permitido (usá JPG, PNG, WEBP o PDF)')
  if (file.size > MAX_SIZE) return fail('El archivo supera los 8MB')

  const ext = file.type === 'application/pdf' ? '.pdf' : `.${file.type.split('/')[1].replace('jpeg', 'jpg')}`
  const name = `${crypto.randomBytes(8).toString('hex')}${ext}`
  const dir = path.join(process.cwd(), 'public', 'uploads', user.id, folder)
  await mkdir(dir, { recursive: true })
  const buffer = Buffer.from(await file.arrayBuffer())
  await writeFile(path.join(dir, name), buffer)

  const url = `/uploads/${user.id}/${folder}/${name}`
  return NextResponse.json({ url, name, size: file.size, type: file.type })
}
