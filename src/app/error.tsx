'use client'
// Pantalla de error inesperado (reemplaza la pantalla por defecto de Next.js).
// Nunca muestra detalles técnicos al usuario: el error va solo a la consola.
import { useEffect } from 'react'
import { ErrorView } from '@/components/app/error-view'

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[HomIA] error inesperado', error)
  }, [error])
  return <ErrorView onRetry={reset} />
}
