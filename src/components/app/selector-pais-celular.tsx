'use client'
// Selector "País del celular" (25/09/2026, como PRISMA-SYSTEM): bandera, nombre y código de cada
// país, Argentina primero. `<select>` nativo: en el celular abre el selector del sistema, que es el
// más cómodo para una lista de 245 países. Lo usan el registro y Mi perfil (cliente y profesional).
import { useMemo } from 'react'
import { ChevronDown, CircleCheck } from 'lucide-react'
import { paisesCelular, normalizarCelular, type CountryCode } from '@/lib/registro'

export function SelectorPaisCelular({
  id, value, onChange, label = 'País del celular', required, className = '',
  labelClassName = 'block text-sm font-semibold text-navy',
  selectClassName = 'py-2.5 text-[15px]',
  gapClassName = 'mt-1.5',
}: {
  id: string
  value: CountryCode
  onChange: (pais: CountryCode) => void
  label?: string
  required?: boolean
  className?: string
  /** para que combine con los campos de cada pantalla */
  labelClassName?: string
  selectClassName?: string
  gapClassName?: string
}) {
  const paises = useMemo(() => paisesCelular('es'), [])
  return (
    <div className={className}>
      <label htmlFor={id} className={labelClassName}>
        {label} {required && <span className="text-action" aria-hidden>*</span>}
      </label>
      <div className={`relative ${gapClassName}`}>
        <select
          id={id}
          value={value}
          onChange={(e) => onChange(e.target.value as CountryCode)}
          data-track="elegir país del celular"
          className={`homy-glass-input w-full cursor-pointer appearance-none rounded-xl pl-4 pr-10 outline-none ${selectClassName}`}
        >
          {paises.map((p) => (
            <option key={p.iso} value={p.iso}>
              {p.bandera} {p.nombre} (+{p.codigo})
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute bottom-0 right-3 top-0 my-auto size-4 text-slate-400" aria-hidden />
      </div>
    </div>
  )
}

/**
 * Debajo del celular, en vivo: "Se guardará como +54 9 11 2345-6789" o por qué no es válido para el
 * país elegido (la misma función que usa el servidor al guardar).
 */
export function AvisoCelular({ phone, pais }: { phone: string; pais: CountryCode }) {
  const n = useMemo(() => normalizarCelular(phone, pais), [phone, pais])
  if (!phone.trim()) return null
  if (n.ok) {
    return (
      <p className="mt-1.5 inline-flex items-center gap-1 text-xs text-slate-500" aria-live="polite">
        <CircleCheck className="size-3.5 shrink-0 text-[#0e9f6e]" aria-hidden />
        <span>Se guardará como <b className="whitespace-nowrap text-[#0A2540]">{n.mostrar}</b></span>
      </p>
    )
  }
  if (phone.replace(/\D/g, '').length < 6) return null
  return <p className="mt-1.5 text-xs font-semibold text-[#8a6d00]" aria-live="polite">{n.error}</p>
}
