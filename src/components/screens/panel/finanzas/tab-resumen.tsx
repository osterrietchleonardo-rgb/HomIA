'use client'
// Resumen: cifras del período, recomendaciones (reglas de calculos.ts, con el dato que las
// dispara) y métricas clave con su explicación. Primer uso guiado si todavía no se hizo.
import { useState } from 'react'
import { toast } from 'sonner'
import { AlertTriangle, CheckCircle2, Info, Lightbulb, Sparkles, TrendingDown, TrendingUp, Trophy, Crown, Rocket, X } from 'lucide-react'
import type { Metrica, Recomendacion } from '@/lib/finanzas/calculos'
import { Ayuda, Cifra, ars, pctTxt, numTxt, type DatosFinanzas } from './ui'
import type { Inicial } from './form-movimiento'

const METRICA: Record<string, { label: string; glosario: string }> = {
  ventas_netas: { label: 'Ventas netas', glosario: 'ventas_netas' },
  margen_bruto: { label: 'Margen bruto', glosario: 'margen_bruto' },
  resultado_neto: { label: 'Margen neto', glosario: 'resultado_neto' },
  gastos_fijos: { label: 'Gastos fijos por mes', glosario: 'gastos_fijos' },
  punto_equilibrio: { label: 'Punto de equilibrio (por mes)', glosario: 'punto_equilibrio' },
  ticket_promedio: { label: 'Ticket promedio', glosario: 'ticket_promedio' },
  cantidad: { label: 'Cantidad de ventas', glosario: 'ventas_brutas' },
  dias_cobro: { label: 'Días promedio de cobro', glosario: 'dias_cobro' },
  cuentas_cobrar: { label: 'Sin cobrar hace +15 días', glosario: 'cuentas_cobrar' },
  meses_supervivencia: { label: 'Meses de supervivencia', glosario: 'meses_supervivencia' },
  crecimiento: { label: 'Crecimiento mes a mes', glosario: 'crecimiento' },
  clientes_recurrentes: { label: 'Clientes recurrentes', glosario: 'clientes_recurrentes' },
  tasa_aceptacion: { label: 'Presupuestos aceptados', glosario: 'tasa_aceptacion' },
  rotacion_stock: { label: 'Días de stock', glosario: 'rotacion_stock' },
}

export function valorMetrica(m: Metrica): string {
  if (m.valor === null) return 'Sin dato'
  switch (m.formato) {
    case 'ars': return ars(m.valor)
    case 'pct': return pctTxt(m.valor)
    case 'dias': return `${numTxt(m.valor)} ${m.valor === 1 ? 'día' : 'días'}`
    case 'meses': return `${numTxt(m.valor)} ${m.valor === 1 ? 'mes' : 'meses'}`
    default: return numTxt(m.valor)
  }
}

const TONO: Record<Recomendacion['tono'], { icon: typeof Info; cls: string }> = {
  alerta: { icon: AlertTriangle, cls: 'border-red-200 bg-red-50/80 text-red-800' },
  atencion: { icon: Lightbulb, cls: 'border-amber-200 bg-amber-50/80 text-amber-900' },
  info: { icon: Info, cls: 'border-[#1D63B8]/20 bg-[#1D63B8]/6 text-[#0A2540]' },
  bien: { icon: CheckCircle2, cls: 'border-emerald-200 bg-emerald-50/80 text-emerald-900' },
}

export default function TabResumen({ d, irTab, onPrimerUso, onNuevo, recargar }: {
  d: DatosFinanzas; irTab: (t: string) => void; onPrimerUso: () => void; onNuevo: (i?: Inicial) => void; recargar: () => Promise<void>
}) {
  const r = d.reporte
  const R = r.resultados
  const vacio = R.ventasBrutas === 0 && d.cantidadMovimientosManuales === 0 && r.caja.entradas === 0 && r.caja.salidas === 0
  const vVentas = r.metricas.find((m) => m.id === 'ventas_netas')?.variacion ?? null
  const [ocultoPrimerUso, setOcultoPrimerUso] = useState(false)

  async function omitirPrimerUso() {
    setOcultoPrimerUso(true)
    await fetch('/api/finanzas/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: d.rol, primerUsoHecho: true }) }).catch(() => null)
  }

  return (
    <div className="space-y-6">
      {!d.config.primerUsoHecho && !ocultoPrimerUso && (
        <section className="homy-glass-strong relative overflow-hidden rounded-3xl p-5">
          <button type="button" onClick={() => void omitirPrimerUso()} aria-label="Ahora no" className="homy-focus absolute right-2 top-2 grid size-11 place-items-center rounded-full text-slate-400 hover:text-[#0A2540]">
            <X className="size-4" aria-hidden />
          </button>
          <div className="flex items-start gap-3 pr-8">
            <span className="homy-icon-chip homy-chip-ai size-11 shrink-0 [&_svg]:size-5" aria-hidden><Rocket /></span>
            <div className="min-w-0">
              <h2 className="text-lg font-extrabold tracking-tight text-[#0A2540]">Arrancá en 3 pasos (2 minutos)</h2>
              <p className="mt-1 text-sm leading-relaxed text-slate-600">
                {d.rol === 'profesional' ? 'Tus facturas de HomIA ya están acá.' : 'Tus ventas de HomIA ya están acá.'} Para que los números sean reales, contanos cuánta plata tiene hoy el negocio, tus gastos fijos del mes y {d.rol === 'profesional' ? 'las herramientas o vehículos' : 'las estanterías, equipos o vehículos'} que ya tenés.
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={onPrimerUso} className="homy-btn-primary min-h-[44px] px-5 text-sm">Empezar</button>
                <button type="button" onClick={() => irTab('aprende')} className="homy-glass-soft homy-focus min-h-[44px] rounded-xl px-4 text-sm font-bold text-[#1D63B8]">Primero quiero entender</button>
              </div>
            </div>
          </div>
        </section>
      )}

      {d.sugerenciaSuscripcion && <SugerenciaSuscripcion d={d} recargar={recargar} />}

      {vacio && (
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <span className="homy-empty-icon homy-chip-blue" aria-hidden><Sparkles className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">Todavía no hay números en {r.periodo.etiqueta.toLowerCase()}</h3>
          <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-500">
            {d.rol === 'profesional'
              ? 'Cuando emitas facturas desde tus proyectos van a aparecer solas. Mientras tanto, podés cargar tus gastos y los trabajos que hiciste por fuera de HomIA.'
              : 'Cuando vendas por HomIA tus ventas van a aparecer solas. Mientras tanto, podés cargar tus gastos y las ventas de mostrador.'}
          </p>
          <button type="button" onClick={() => onNuevo()} className="homy-btn-dark mt-5 min-h-[44px] px-5 text-sm">Cargar un movimiento</button>
        </div>
      )}

      <section aria-label="Cifras del período" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cifra label="Ventas netas" valor={ars(R.ventasNetas)} ayuda="ventas_netas"
          sub={vVentas === null ? `vs ${r.periodo.etiquetaPrev}: sin dato` : (
            <span className={`inline-flex items-center gap-1 font-bold ${vVentas >= 0 ? 'text-emerald-700' : 'text-[#c2410c]'}`}>
              {vVentas >= 0 ? <TrendingUp className="size-3.5" aria-hidden /> : <TrendingDown className="size-3.5" aria-hidden />}
              {vVentas > 0 ? '+' : ''}{pctTxt(vVentas)} vs {r.periodo.etiquetaPrev}
            </span>
          )} />
        <Cifra label={R.resultadoNeto >= 0 ? 'Ganancia' : 'Pérdida'} valor={ars(R.resultadoNeto)} ayuda="resultado_neto"
          tono={R.resultadoNeto < 0 ? 'text-[#c2410c]' : 'text-emerald-700'}
          sub={R.margenNetoPct === null ? 'Margen neto: sin dato' : `Margen neto ${pctTxt(R.margenNetoPct)}`} />
        <Cifra label="Caja estimada" valor={ars(r.caja.saldoFinal)} ayuda="caja" tono={r.caja.saldoFinal < -0.5 ? 'text-[#c2410c]' : undefined}
          sub={r.caja.saldoFinal < -0.5 && !r.caja.sinSaldoInicial ? 'Da negativa: revisá tu saldo inicial o si te falta cargar algún ingreso' : r.caja.sinSaldoInicial ?<button type="button" onClick={() => irTab('caja')} className="font-bold text-[#1D63B8] underline">Falta tu saldo inicial</button> : r.periodo.preset === 'mes_anterior' || r.periodo.preset === 'rango' ? 'Al cierre del período' : 'Plata disponible hoy'} />
        <Cifra label="Margen bruto" valor={pctTxt(R.margenBrutoPct)} ayuda="margen_bruto"
          sub={R.margenBrutoPct === null ? 'Sin ventas en el período' : `${ars(R.margenBruto)} después del costo directo`} />
      </section>

      {r.recomendaciones.length > 0 && (
        <section aria-labelledby="fin-reco">
          <h2 id="fin-reco" className="homy-section-title mb-3">
            <span className="homy-icon-chip homy-chip-gold size-9 shrink-0 [&_svg]:size-4" aria-hidden><Lightbulb /></span>
            Qué mirar ahora
          </h2>
          <ul className="space-y-2.5">
            {r.recomendaciones.map((x) => {
              const T = TONO[x.tono]
              const Icon = T.icon
              return (
                <li key={x.id} className={`rounded-2xl border px-4 py-3.5 ${T.cls}`}>
                  <p className="flex items-start gap-2 font-extrabold"><Icon className="mt-0.5 size-4 shrink-0" aria-hidden /> <span className="min-w-0">{x.titulo}</span></p>
                  <p className="mt-1 text-[13.5px] leading-relaxed opacity-90">{x.texto}</p>
                  <p className="mt-1.5 inline-block rounded-lg bg-white/70 px-2 py-1 text-xs font-bold text-[#0A2540] [overflow-wrap:anywhere]">Dato: {x.dato}</p>
                  {x.accion && (
                    <button type="button" onClick={() => (x.accion?.tab === 'movimientos' && x.id === 'sin_gastos' ? onNuevo({ type: 'gasto' }) : irTab(x.accion!.tab || 'resumen'))}
                      className="homy-focus ml-2 mt-1.5 inline-flex min-h-[36px] items-center rounded-lg px-2 text-xs font-extrabold text-[#1D63B8] underline">
                      {x.accion.label}
                    </button>
                  )}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      <section aria-labelledby="fin-metricas">
        <h2 id="fin-metricas" className="homy-section-title mb-1">
          <span className="homy-icon-chip homy-chip-blue size-9 shrink-0 [&_svg]:size-4" aria-hidden><Sparkles /></span>
          Métricas clave
        </h2>
        <p className="mb-3 text-[13px] text-slate-500">Tocá el <b>?</b> de cada una para ver qué significa, cómo se calcula y qué hacer.</p>
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {r.metricas.map((m) => {
            const meta = METRICA[m.id] || { label: m.id, glosario: m.id }
            const label = m.id === 'cantidad' ? (d.rol === 'profesional' ? 'Cantidad de trabajos' : 'Cantidad de ventas') : meta.label
            return (
              <li key={m.id} className="homy-glass homy-num-cell rounded-2xl p-4">
                <div className="flex items-start justify-between gap-2">
                  <p className="pt-1 text-[0.7rem] font-extrabold uppercase tracking-[0.12em] text-slate-500">{label}</p>
                  <Ayuda id={meta.glosario} className="-mr-1.5 -mt-0.5" />
                </div>
                <p className={`mt-1 font-extrabold leading-tight ${m.valor === null ? 'text-slate-400' : 'text-[#0A2540]'}`}>
                  <span className="homy-num-adapt" style={{ fontSize: 'clamp(1.05rem, 9cqw, 1.5rem)' }}>{valorMetrica(m)}</span>
                  {m.variacion !== undefined && m.variacion !== null && (
                    // en los gastos, subir es malo: el color se invierte
                    <span className={`ml-2 align-middle text-xs font-bold ${(m.id === 'gastos_fijos' ? m.variacion <= 0 : m.variacion >= 0) ? 'text-emerald-700' : 'text-[#c2410c]'}`}>{m.variacion > 0 ? '+' : ''}{pctTxt(m.variacion)}</span>
                  )}
                </p>
                <p className="mt-1 text-xs leading-snug text-slate-500 [overflow-wrap:anywhere]">{m.valor === null ? m.sinDato : m.calculo}</p>
              </li>
            )
          })}
        </ul>
      </section>

      {d.rol === 'profesional' && (
        <section aria-labelledby="fin-obras">
          <h2 id="fin-obras" className="homy-section-title mb-1">
            <span className="homy-icon-chip homy-chip-orange size-9 shrink-0 [&_svg]:size-4" aria-hidden><Trophy /></span>
            Rentabilidad por obra <Ayuda id="rentabilidad_obra" />
          </h2>
          <p className="mb-3 text-[13px] text-slate-500">De todas tus obras facturadas: lo facturado menos los costos que les asignaste.</p>
          {r.obras.length === 0 ? (
            <p className="homy-glass-soft rounded-2xl px-4 py-4 text-sm text-slate-500">Todavía no facturaste obras en HomIA. Cuando lo hagas, acá vas a ver cuánto te dejó cada una.</p>
          ) : (
            <ul className="space-y-2">
              {r.obras.slice(0, 8).map((o) => (
                <li key={o.id} className="homy-row flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
                  <span className="min-w-0 flex-[1_1_12rem] font-bold text-[#0A2540] [overflow-wrap:anywhere]">{o.title}</span>
                  <span className="text-xs text-slate-500">Facturado {ars(o.ingresos)} · costos {ars(o.costos)}</span>
                  <span className={`homy-num font-extrabold ${o.ganancia < 0 ? 'text-[#c2410c]' : 'text-emerald-700'}`}>{ars(o.ganancia)} ({pctTxt(o.margenPct)})</span>
                </li>
              ))}
            </ul>
          )}
          {r.obras.length > 0 && r.obras.every((o) => o.costos === 0) && (
            <p className="mt-2 text-xs text-slate-500">Ninguna obra tiene costos asignados: al cargar un costo elegí la obra, o asigná tus compras de HomIA en Movimientos.</p>
          )}
        </section>
      )}

      {d.rol === 'proveedor' && (
        <section aria-labelledby="fin-productos">
          <h2 id="fin-productos" className="homy-section-title mb-1">
            <span className="homy-icon-chip homy-chip-mint size-9 shrink-0 [&_svg]:size-4" aria-hidden><Trophy /></span>
            Productos que más ganancia dejan <Ayuda id="top_productos" />
          </h2>
          {r.productos.length === 0 ? (
            <p className="homy-glass-soft rounded-2xl px-4 py-4 text-sm text-slate-500">Sin ventas de HomIA en el período.</p>
          ) : (
            <ul className="space-y-2">
              {r.productos.slice(0, 8).map((p) => (
                <li key={p.elementId} className="homy-row flex flex-wrap items-center justify-between gap-x-3 gap-y-1 px-4 py-3">
                  <span className="min-w-0 flex-[1_1_12rem] font-bold text-[#0A2540] [overflow-wrap:anywhere]">{p.nombre}</span>
                  <span className="text-xs text-slate-500">Vendido {ars(p.ventas)}</span>
                  <span className={`homy-num font-extrabold ${p.ganancia === null ? 'text-slate-400' : 'text-emerald-700'}`}>
                    {p.ganancia === null ? 'Ganancia sin dato (falta el costo)' : `Ganancia ${ars(p.ganancia)}`}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </div>
  )
}

function SugerenciaSuscripcion({ d, recargar }: { d: DatosFinanzas; recargar: () => Promise<void> }) {
  const s = d.sugerenciaSuscripcion!
  const [busy, setBusy] = useState(false)
  const [oculta, setOculta] = useState(false)
  if (oculta) return null
  async function cargar() {
    setBusy(true)
    try {
      const res = await fetch('/api/finanzas/movimientos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: 'proveedor', type: 'gasto', category: 'suscripcion_homia', description: `Plan ${s.plan === 'pro' ? 'PRO' : 'Básico'} de HomIA`, amount: s.monto, date: d.hoy, recurring: 'mensual', paymentMethod: 'mercadopago' }),
      })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(j.error || 'No se pudo cargar'); return }
      toast.success('Suscripción cargada como gasto mensual')
      await recargar()
    } finally { setBusy(false) }
  }
  return (
    <section className="homy-glass rounded-2xl p-4">
      <p className="flex items-start gap-2 font-extrabold text-[#0A2540]"><Crown className="mt-0.5 size-4 shrink-0 text-[#b58900]" aria-hidden /> ¿Sumamos tu plan de HomIA como gasto mensual?</p>
      <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
        Tenés el plan {s.plan === 'pro' ? 'PRO' : 'Básico'} ({ars(s.monto)} por mes). HomIA no guarda los cobros de la suscripción (los hace Mercado Pago), así que no lo cargamos solos: confirmalo vos y se cuenta cada mes desde hoy.
      </p>
      <div className="mt-2.5 flex flex-wrap gap-2">
        <button type="button" disabled={busy} onClick={() => void cargar()} className="homy-btn-primary min-h-[44px] px-4 text-sm disabled:opacity-60">Sí, cargarlo</button>
        <button type="button" onClick={() => setOculta(true)} className="homy-glass-soft homy-focus min-h-[44px] rounded-xl px-4 text-sm font-bold text-slate-600">Ahora no</button>
      </div>
    </section>
  )
}
