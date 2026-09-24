'use client'
// Error en el layout raíz: Next reemplaza TODO el documento, así que esta página trae su
// propio <html>/<body> y los estilos. Mismo mensaje amable, sin detalles técnicos.
import { useEffect } from 'react'
import './globals.css'
import { ErrorView } from '@/components/app/error-view'

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('[HomIA] error inesperado (layout raíz)', error)
  }, [error])
  return (
    <html lang="es-AR">
      <body className="antialiased bg-background text-foreground font-sans">
        <title>Algo salió mal — HomIA</title>
        <ErrorView onRetry={reset} />
      </body>
    </html>
  )
}
