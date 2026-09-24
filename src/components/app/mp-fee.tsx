'use client'
// Desglose del pago por Mercado Pago: subtotal + "Cargo de servicio HomIA (1%)"
// = total. Se muestra SIEMPRE que se ve un total a pagar por MP. En efectivo no hay
// cargo. Si el vendedor no conectó Mercado Pago, se avisa y solo queda efectivo.
import { formatARS, formatARSCents } from '@/lib/format'
import { SERVICE_FEE_LABEL, serviceFeeFor, totalWithMp } from '@/lib/fees'
import { Banknote } from 'lucide-react'

export function MpFeeBreakdown({ subtotal, className = '' }: { subtotal: number; className?: string }) {
  return (
    <dl className={`space-y-0.5 text-[12px] ${className}`}>
      <div className="flex justify-between gap-3"><dt className="text-slate-500">Subtotal</dt><dd className="tabular-nums text-slate-600">{formatARS(subtotal)}</dd></div>
      <div className="flex justify-between gap-3"><dt className="min-w-0 text-slate-500">{SERVICE_FEE_LABEL}</dt><dd className="shrink-0 tabular-nums text-slate-600">{formatARSCents(serviceFeeFor(subtotal))}</dd></div>
      <div className="flex justify-between gap-3 font-extrabold"><dt className="text-[#0A2540]">Total con Mercado Pago</dt><dd className="tabular-nums text-[#1D63B8]">{formatARSCents(totalWithMp(subtotal))}</dd></div>
      <p className="pt-0.5 text-[11px] text-slate-400">En efectivo pagás {formatARS(subtotal)}, sin cargo.</p>
    </dl>
  )
}

export function NoMpNotice({ name }: { name: string }) {
  return (
    <p className="flex items-start gap-1.5 text-[12px] font-semibold text-slate-600">
      <Banknote className="mt-0.5 size-3.5 shrink-0 text-slate-400" aria-hidden />
      {name} todavía no conectó Mercado Pago: podés pagar en efectivo.
    </p>
  )
}

/** Línea para un pago ya hecho por MP: "+ Cargo de servicio HomIA (1%): $X · pagaste $Y". */
export function PaidFeeLine({ subtotal, fee }: { subtotal: number; fee: number }) {
  if (!(fee > 0)) return null
  return (
    <p className="text-[11.5px] text-slate-500">+ {SERVICE_FEE_LABEL}: {formatARSCents(fee)} · pagaste {formatARSCents(subtotal + fee)} con Mercado Pago</p>
  )
}
