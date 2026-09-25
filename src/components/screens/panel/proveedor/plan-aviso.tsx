'use client'
// Aviso fijo arriba del panel del proveedor cuando su plan no está activo (D33): sus productos no se
// ven en lo público, pero puede terminar las ventas que ya tiene. Se muestra en todas las pantallas
// del panel del proveedor menos "Mi plan" (que ya lo explica). Nada se borra: al volver a pagar,
// todo reaparece tal como estaba.
import { useEffect, useState } from 'react'
import { navigate } from '@/lib/router'
import { CircleAlert, Crown } from 'lucide-react'

type Estado = { activo: boolean; motivoInactivo: 'prueba_terminada' | 'plan_vencido' | null; vencioEl: string | null }

function fechaCorta(iso: string): string {
  const x = new Date(new Date(iso).getTime() - 3 * 3600_000)
  return `${String(x.getUTCDate()).padStart(2, '0')}/${String(x.getUTCMonth() + 1).padStart(2, '0')}`
}

export function PlanInactivoAviso() {
  const [estado, setEstado] = useState<Estado | null>(null)
  useEffect(() => {
    let vivo = true
    fetch('/api/provider/plan')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (vivo && d?.plan) setEstado(d.plan as Estado) })
      .catch(() => {})
    return () => { vivo = false }
  }, [])
  if (!estado || estado.activo) return null
  const cuando = estado.vencioEl ? ` el ${fechaCorta(estado.vencioEl)}` : ''
  const titulo = estado.motivoInactivo === 'plan_vencido' ? `Tu plan venció${cuando}.` : `Tu prueba gratis terminó${cuando}.`
  return (
    <div className="homy-page">
      <section role="status" className="homy-glass rounded-2xl p-4 mb-5 flex flex-wrap items-center gap-3 ring-2 ring-[#FF5A1F]/40">
        <span aria-hidden className="homy-icon-chip size-10 shrink-0 [&_svg]:size-5" style={{ background: 'linear-gradient(140deg, #ffedd5 0%, #fed7aa 100%)', color: '#c2410c' }}><CircleAlert /></span>
        <p className="min-w-0 flex-[1_1_14rem] text-[13.5px] leading-relaxed text-slate-600">
          <b>{titulo} Tu plan no está activo: tus productos no se ven en HomIA.</b> Podés terminar las ventas que ya tenés
          (entregar, confirmar efectivo, cancelar, devoluciones). Elegí un plan para volver a vender: tu stock, precios y perfil
          vuelven tal como estaban.
        </p>
        <button data-track="plan: elegir plan desde el aviso de plan vencido" onClick={() => navigate('/panel/proveedor/plan')} className="homy-btn-primary min-h-[44px] shrink-0 px-5 py-2.5 text-sm">
          <Crown className="size-4" aria-hidden /> Ir a Mi plan
        </button>
      </section>
    </div>
  )
}
