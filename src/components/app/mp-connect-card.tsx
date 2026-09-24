'use client'
// "Cobrá con tu Mercado Pago" — el vendedor conecta SU cuenta (OAuth) para que los
// pagos por Mercado Pago de sus clientes entren directo en ella. Mismo patrón que
// Cobros del proveedor; acá lo usa el PROFESIONAL (facturas de sus proyectos).
// Sin conexión, sus clientes solo pueden pagarle en efectivo.
import { useCallback, useEffect, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { toast } from 'sonner'
import { CreditCard, Link2, Unlink } from 'lucide-react'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

type Status = 'connected' | 'disconnected' | 'expired'

export default function MpConnectCard({ kind, returnPath }: { kind: 'professional'; returnPath: string }) {
  const route = useRoute()
  const [status, setStatus] = useState<Status | null>(null)
  const [expiresAt, setExpiresAt] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [askOff, setAskOff] = useState(false)

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/profiles/me')
      const d = await res.json().catch(() => ({}))
      const pro = d?.user?.professional
      setStatus(((pro?.mpOauthStatus as Status) || 'disconnected'))
      setExpiresAt(pro?.mpOauthExpiresAt || null)
    } catch {
      setStatus('disconnected')
    }
  }, [])
  useEffect(() => { void load() }, [load])

  // vuelta del OAuth de Mercado Pago: ?mp=conectado|error|cancelado
  useEffect(() => {
    const r = route.query.mp
    if (!r) return
    if (r === 'conectado') toast.success('Mercado Pago conectado', { description: 'Tus clientes ya pueden pagarte las facturas por Mercado Pago: la plata entra en tu cuenta.' })
    else if (r === 'cancelado') toast.info('No conectaste Mercado Pago', { description: 'Podés hacerlo cuando quieras desde tu perfil.' })
    else toast.error('No pudimos conectar tu Mercado Pago', { description: 'Probá de nuevo en un rato. Mientras tanto, tus clientes te pagan en efectivo.' })
    navigate(returnPath, { replace: true })
  }, [route.query.mp, returnPath])

  async function disconnect() {
    setBusy(true)
    try {
      const res = await fetch(`/api/mp/oauth?kind=${kind}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'No pudimos desconectar Mercado Pago'); return }
      toast.success('Mercado Pago desconectado', { description: 'Tus clientes solo pueden pagarte en efectivo hasta que vuelvas a conectar.' })
      setAskOff(false)
      await load()
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(false)
    }
  }

  const exp = expiresAt ? new Date(expiresAt) : null
  return (
    <section
      className={`homy-glass rounded-3xl p-4 sm:p-5 ${status === 'connected' ? 'ring-1 ring-[#0e9f6e]/30' : 'ring-1 ring-[#FFC700]/40'}`}
      aria-label="Cobrá con tu Mercado Pago"
    >
      <div className="flex flex-wrap items-center gap-3">
        <span aria-hidden className={`homy-icon-chip size-11 shrink-0 [&_svg]:size-5 ${status === 'connected' ? 'homy-chip-mint' : 'homy-chip-gold'}`}><CreditCard /></span>
        <div className="min-w-0 flex-[1_1_14rem]">
          <h2 className="text-[15px] font-extrabold text-[#0A2540]">Cobrá con tu Mercado Pago</h2>
          <p className="mt-0.5 text-[13px] leading-relaxed text-slate-600">
            {status === null ? 'Consultando…'
              : status === 'connected' ? (
                <><b className="text-[#0e9f6e]">Conectado</b>{exp ? ` hasta ${exp.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}` : ''}. Cuando un cliente paga tu factura por Mercado Pago, la plata entra en tu cuenta y cobrás el 100%: el cargo de servicio HomIA (1%) lo paga el cliente aparte.</>
              ) : status === 'expired' ? (
                <><b className="text-[#FF5A1F]">Vencido: volvé a conectar.</b> Sin conexión, tus clientes solo pueden pagarte en efectivo.</>
              ) : (
                <><b>No conectado.</b> Sin conexión, tus clientes solo pueden pagarte en efectivo. Conectala para que te paguen las facturas por Mercado Pago, directo a tu cuenta.</>
              )}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === 'connected' ? (
            <button disabled={busy} onClick={() => setAskOff(true)} className="homy-glass-soft inline-flex min-h-[44px] items-center gap-1.5 rounded-full px-4 text-sm font-bold text-slate-500 transition hover:text-red-600 disabled:opacity-50">
              <Unlink className="size-4" aria-hidden /> Desconectar
            </button>
          ) : status !== null ? (
            <button onClick={() => { window.location.href = `/api/mp/oauth/connect?kind=${kind}` }} className="homy-btn-primary min-h-[44px] px-5 text-sm">
              <Link2 className="size-4" aria-hidden /> {status === 'expired' ? 'Volver a conectar' : 'Conectar Mercado Pago'}
            </button>
          ) : null}
        </div>
      </div>

      <AlertDialog open={askOff} onOpenChange={(o) => { if (!busy) setAskOff(o) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Desconectar Mercado Pago?</AlertDialogTitle>
            <AlertDialogDescription>
              Tus clientes van a poder pagarte solo en efectivo hasta que vuelvas a conectar tu cuenta. Los pagos ya iniciados no se ven afectados.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Volver</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void disconnect() }} className="bg-red-600 text-white hover:bg-red-700">
              {busy ? 'Desconectando…' : 'Sí, desconectar'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}
