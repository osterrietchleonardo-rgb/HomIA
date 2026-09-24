// Imagen para compartir el link de HomIA (WhatsApp, redes, buscadores): 1200×630.
// Next la publica sola como og:image en todas las páginas (convención de archivos del App Router).
import { ImageResponse } from 'next/og'
import { HomiaShareCard, OG_ALT, OG_SIZE } from '@/lib/og-card'

export const alt = OG_ALT
export const size = OG_SIZE
export const contentType = 'image/png'

export default function OpengraphImage() {
  return new ImageResponse(<HomiaShareCard />, size)
}
