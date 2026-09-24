// Misma imagen que opengraph-image, publicada como twitter:image (tarjeta summary_large_image).
import { ImageResponse } from 'next/og'
import { HomiaShareCard, OG_ALT, OG_SIZE } from '@/lib/og-card'

export const alt = OG_ALT
export const size = OG_SIZE
export const contentType = 'image/png'

export default function TwitterImage() {
  return new ImageResponse(<HomiaShareCard />, size)
}
