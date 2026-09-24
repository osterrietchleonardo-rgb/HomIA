'use client'
// "Eliminar mi cuenta" (Ley 25.326, derecho de supresión — D19). Va al final de Mi perfil
// de los tres roles. Explica qué se borra y qué se conserva, y exige escribir ELIMINAR y
// la contraseña. Si hay operaciones abiertas, el servidor responde 409 con la lista y se
// muestra acá (con link a cada pantalla) sin cerrar el diálogo.
import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, Loader2, Trash2 } from 'lucide-react'
import {
  AlertDialog, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { useSession } from '@/lib/store'
import { navigate } from '@/lib/router'

type Pendiente = { tipo: string; cantidad: number; texto: string; ruta: string }

export function DeleteAccountCard() {
  const [open, setOpen] = useState(false)
  const [confirm, setConfirm] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pendientes, setPendientes] = useState<Pendiente[]>([])
  const [done, setDone] = useState(false)
  const listo = confirm.trim() === 'ELIMINAR' && password.length > 0

  function reset(o: boolean) {
    if (busy || done) return
    setOpen(o)
    if (!o) {
      setConfirm('')
      setPassword('')
      setError(null)
      setPendientes([])
    }
  }

  async function eliminar() {
    if (!listo || busy) return
    setBusy(true)
    setError(null)
    setPendientes([])
    try {
      const res = await fetch('/api/profiles/me/eliminar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: confirm.trim(), password }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.status === 409 && Array.isArray(d.pendientes)) {
        setError(d.error || 'Antes de eliminar tu cuenta tenés que cerrar estas operaciones')
        setPendientes(d.pendientes)
        return
      }
      if (!res.ok) {
        setError(d.error || 'No pudimos eliminar tu cuenta. Probá de nuevo en unos minutos.')
        return
      }
      // la sesión ya la cerró el servidor: se muestra la confirmación y se vuelve al inicio
      // (el estado de sesión se limpia recién al salir: si no, el panel redirige antes de leer el aviso)
      setDone(true)
      toast.success('Tu cuenta fue eliminada', { description: 'Gracias por haber usado HomIA.' })
      setTimeout(() => {
        useSession.setState({ user: null })
        window.location.assign('/')
      }, 2500)
    } catch {
      setError('No pudimos conectar. Reintentá en unos segundos.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="homy-glass rounded-3xl p-5 sm:p-6 ring-1 ring-red-200/70" aria-labelledby="baja-titulo">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 flex-[1_1_16rem] items-start gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-red-50 text-red-600"><Trash2 className="size-5" /></span>
          <div className="min-w-0">
            <h2 id="baja-titulo" className="text-[15px] font-extrabold text-[#0A2540]">Eliminar mi cuenta</h2>
            <p className="mt-0.5 text-[13px] leading-relaxed text-slate-500">
              Borramos tus datos personales y tu cuenta deja de aparecer en HomIA. No se puede deshacer.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="homy-focus inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-red-200 bg-white/70 px-4 text-sm font-bold text-red-600 transition hover:bg-red-50"
        >
          <Trash2 className="size-4" aria-hidden /> Eliminar mi cuenta
        </button>
      </div>

      <AlertDialog open={open} onOpenChange={reset}>
        {/* fondo blanco sólido: es un diálogo largo y destructivo, tiene que leerse sin el vidrio de atrás */}
        <AlertDialogContent className="max-h-[90dvh] overflow-y-auto !bg-white">

          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-red-700">
              <AlertTriangle className="size-5 shrink-0" aria-hidden /> ¿Eliminar tu cuenta?
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-3 text-left text-[13.5px] leading-relaxed text-slate-600">
                <div>
                  <p className="font-bold text-[#0A2540]">Qué se borra</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    <li>Tu nombre, email, teléfono, dirección, foto, ubicación y fecha de nacimiento.</li>
                    <li>Las fotos de tu DNI y su verificación.</li>
                    <li>Tu carrito, favoritos, conversaciones con Homy y notificaciones.</li>
                    <li>Tu perfil deja de aparecer en el directorio, las búsquedas y el marketplace (si sos proveedor, se quita tu stock publicado).</li>
                  </ul>
                </div>
                <div>
                  <p className="font-bold text-[#0A2540]">Qué se conserva, sin tu nombre</p>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    <li>Facturas, pagos y pedidos cerrados, porque la ley nos obliga a guardarlos.</li>
                    <li>Las reseñas y mensajes que intercambiaste, para no romper el historial de los demás: van a figurar como “Usuario eliminado”.</li>
                  </ul>
                </div>
                <p>Si tenés proyectos, pedidos, cobros o devoluciones abiertos, primero tenés que cerrarlos.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>

          {done ? (
            <p role="status" className="rounded-2xl bg-emerald-50 p-4 text-sm font-bold text-emerald-800">
              Tu cuenta fue eliminada. Te llevamos al inicio…
            </p>
          ) : (
          <form
            className="grid gap-3"
            onSubmit={(e) => { e.preventDefault(); void eliminar() }}
          >
            <label className="block text-[13px] font-bold text-[#0A2540]">
              Escribí <span className="font-mono text-red-700">ELIMINAR</span> para confirmar
              <input
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="off"
                autoCapitalize="characters"
                spellCheck={false}
                aria-label="Escribí ELIMINAR para confirmar"
                className="homy-glass-input mt-1.5 w-full rounded-xl px-4 py-3 text-sm font-mono"
              />
            </label>
            <label className="block text-[13px] font-bold text-[#0A2540]">
              Tu contraseña
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                aria-label="Tu contraseña"
                className="homy-glass-input mt-1.5 w-full rounded-xl px-4 py-3 text-sm"
              />
            </label>

            {error && (
              <div role="alert" className="rounded-2xl border border-red-200 bg-red-50/80 p-3 text-[13px] text-red-800">
                <p className="font-bold">{error}</p>
                {pendientes.length > 0 && (
                  <ul className="mt-2 space-y-1.5">
                    {pendientes.map((p) => (
                      <li key={p.tipo} className="flex flex-wrap items-baseline justify-between gap-x-2">
                        <span><b>{p.cantidad}</b> {p.texto}</span>
                        <button
                          type="button"
                          onClick={() => { reset(false); navigate(p.ruta) }}
                          className="homy-focus min-h-[32px] font-bold text-[#1D63B8] underline"
                        >
                          Ir a verlo
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <AlertDialogFooter className="mt-1">
              <AlertDialogCancel type="button" disabled={busy} className="min-h-[44px]">Cancelar</AlertDialogCancel>
              <button
                type="submit"
                disabled={!listo || busy}
                className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-md bg-red-600 px-4 text-sm font-bold text-white transition hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? <><Loader2 className="size-4 animate-spin motion-reduce:animate-none" aria-hidden /> Eliminando…</> : 'Eliminar definitivamente'}
              </button>
            </AlertDialogFooter>
          </form>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
