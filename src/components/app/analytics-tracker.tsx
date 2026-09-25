'use client'
// Monta el tracker de métricas de uso (D27) una sola vez. No dibuja nada.
// Va en AppRoot (la SPA) y en la home estática (que no monta la SPA).
import { useEffect } from 'react'
import { iniciarTracker } from '@/lib/analytics/tracker'

export default function AnalyticsTracker() {
  useEffect(() => { iniciarTracker() }, [])
  return null
}
