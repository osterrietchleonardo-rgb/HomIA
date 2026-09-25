'use client'
// Aprendé: guía corta de los tres informes, cómo cargar cada cosa y el glosario completo con
// ejemplos de un plomero y de una ferretería (todo sale de conceptos.ts).
import { useState } from 'react'
import { ChevronDown, GraduationCap, Rocket, BookOpen, ShieldAlert } from 'lucide-react'
import { GLOSARIO, GUIA, TIPOS, categoriasDe, tiposDe } from '@/lib/finanzas/conceptos'
import type { Rol } from './ui'

export default function TabAprende({ rol, onPrimerUso }: { rol: Rol; onPrimerUso: () => void }) {
  const [abierto, setAbierto] = useState<string | null>(null)
  return (
    <div className="space-y-6">
      <section className="homy-glass-strong rounded-3xl p-5">
        <h2 className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-[#0A2540]">
          <GraduationCap className="size-5 text-[#1D63B8]" aria-hidden /> Finanzas sin saber de finanzas
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-slate-600">
          Tres preguntas, tres informes. Lo que pasa por HomIA (facturas, ventas, devoluciones, compras) se carga solo; vos sumás lo que pasa por fuera.
        </p>
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
          {GUIA.map((g) => (
            <div key={g.titulo} className="rounded-2xl border border-[#0A2540]/8 bg-white/60 p-4">
              <h3 className="font-extrabold text-[#0A2540]">{g.titulo}</h3>
              <p className="mt-1 text-[13.5px] leading-relaxed text-slate-600">{g.texto}</p>
            </div>
          ))}
        </div>
        <button type="button" onClick={onPrimerUso} className="homy-btn-primary mt-4 min-h-[44px] px-5 text-sm"><Rocket className="size-4" aria-hidden /> Hacer el primer uso guiado</button>
      </section>

      <section aria-labelledby="fin-que-cargar">
        <h2 id="fin-que-cargar" className="homy-section-title mb-3">
          <span className="homy-icon-chip homy-chip-orange size-9 shrink-0 [&_svg]:size-4" aria-hidden><BookOpen /></span>
          Qué se carga y dónde va
        </h2>
        <ul className="space-y-2">
          {tiposDe(rol).map((t) => {
            const i = TIPOS[t]
            const open = abierto === `t-${t}`
            return (
              <li key={t} className="homy-glass-soft overflow-hidden rounded-2xl">
                <button type="button" onClick={() => setAbierto(open ? null : `t-${t}`)} aria-expanded={open}
                  className="homy-focus flex min-h-[52px] w-full items-center justify-between gap-2 px-4 py-3 text-left">
                  <span className="min-w-0"><span className="block font-extrabold text-[#0A2540]">{i.nombre}</span><span className="block text-[12.5px] text-slate-500">{i.corto}</span></span>
                  <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                {open && (
                  <div className="space-y-1.5 px-4 pb-4 text-[13px] leading-relaxed text-slate-600">
                    <p>{i.explicacion}</p>
                    <p><b className="text-[#0A2540]">{rol === 'profesional' ? 'Ejemplo de un plomero' : 'Ejemplo de una ferretería'}:</b> {rol === 'profesional' ? i.ejemploPlomero : i.ejemploFerreteria}</p>
                    <p><b className="text-[#0A2540]">En resultados:</b> {i.enResultados} <b className="text-[#0A2540]">En la caja:</b> {i.enCaja} <b className="text-[#0A2540]">En el balance:</b> {i.enBalance}</p>
                    <p className="text-xs text-slate-500"><b>Categorías:</b> {categoriasDe(rol, t).map((c) => c.nombre).join(' · ')}</p>
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <section aria-labelledby="fin-glosario">
        <h2 id="fin-glosario" className="homy-section-title mb-3">
          <span className="homy-icon-chip homy-chip-blue size-9 shrink-0 [&_svg]:size-4" aria-hidden><BookOpen /></span>
          Glosario
        </h2>
        <p className="mb-3 text-[13px] text-slate-500">Los montos de los ejemplos son ilustrativos: no son datos de nadie.</p>
        <ul className="space-y-2">
          {GLOSARIO.map((c) => {
            const open = abierto === c.id
            return (
              <li key={c.id} id={`glosario-${c.id}`} className="homy-glass-soft overflow-hidden rounded-2xl">
                <button type="button" onClick={() => setAbierto(open ? null : c.id)} aria-expanded={open}
                  className="homy-focus flex min-h-[48px] w-full items-center justify-between gap-2 px-4 py-2.5 text-left font-extrabold text-[#0A2540]">
                  <span className="min-w-0">{c.nombre}</span>
                  <ChevronDown className={`size-4 shrink-0 text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} aria-hidden />
                </button>
                {open && (
                  <div className="space-y-1.5 px-4 pb-4 text-[13px] leading-relaxed text-slate-600">
                    <p>{c.queEs}</p>
                    {c.comoSeCalcula && <p><b className="text-[#0A2540]">Cómo se calcula:</b> {c.comoSeCalcula}</p>}
                    {c.ejemploPlomero && <p><b className="text-[#0A2540]">Plomero:</b> {c.ejemploPlomero}</p>}
                    {c.ejemploFerreteria && <p><b className="text-[#0A2540]">Ferretería:</b> {c.ejemploFerreteria}</p>}
                    {c.queHacer && <p><b className="text-[#0A2540]">Qué hacer:</b> {c.queHacer}</p>}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      </section>

      <p className="flex items-start gap-2 rounded-2xl bg-[#1D63B8]/8 px-4 py-3 text-[12.5px] leading-relaxed text-slate-600">
        <ShieldAlert className="mt-0.5 size-4 shrink-0 text-[#1D63B8]" aria-hidden />
        Esto te ayuda a ordenar y entender tu negocio; no es contabilidad oficial ni asesoramiento impositivo. Para impuestos (monotributo, Ingresos Brutos, IVA) consultá a un contador.
      </p>
    </div>
  )
}
