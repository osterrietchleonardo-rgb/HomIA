'use client'
// Caja: la plata que entra y sale de verdad (lo cobrado y lo pagado), el saldo inicial que
// carga el usuario una vez, el gráfico mensual y la diferencia entre ganancia y plata en mano.
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Table2, BarChart3 } from 'lucide-react'
import type { SerieMes } from '@/lib/finanzas/calculos'
import { Ayuda, QueEs, ars, fechaTxt, type DatosFinanzas } from './ui'
import { parseMonto } from './form-movimiento'

const C_ENTRA = '#1D63B8'
const C_SALE = '#FF5A1F'

export default function TabCaja({ d, recargar }: { d: DatosFinanzas; recargar: () => Promise<void> }) {
  const c = d.reporte.caja
  const R = d.reporte.resultados
  const variacionCaja = c.entradas - c.salidas

  return (
    <div className="space-y-5">
      <SaldoInicial d={d} recargar={recargar} />

      <section className="homy-glass rounded-3xl p-4 sm:p-6" aria-labelledby="fin-caja">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="fin-caja" className="flex items-center gap-1 text-lg font-extrabold tracking-tight text-[#0A2540]">Flujo de fondos <Ayuda id="caja" /></h2>
          <span className="text-xs font-bold text-slate-500">{d.reporte.periodo.etiqueta} · lo cobrado y lo pagado</span>
        </div>
        {c.sinSaldoInicial && (
          <p className="mt-2 rounded-xl bg-amber-50 px-3 py-2 text-[12.5px] font-semibold text-amber-900">Sin saldo inicial la caja arranca en $ 0: el saldo muestra solo lo que entró y salió desde tus primeros movimientos.</p>
        )}
        <div className="mt-3 divide-y divide-[#0A2540]/6">
          <Linea label="Caja al empezar el período" monto={c.saldoInicialPeriodo} fuerte />
          <div className="py-2.5">
            <Linea label="Entró" monto={c.entradas} signo="+" />
            {c.detalleEntradas.map((l) => <Sub key={l.concepto} label={l.concepto} monto={l.monto} />)}
          </div>
          <div className="py-2.5">
            <Linea label="Salió" monto={-c.salidas} signo="−" />
            {c.detalleSalidas.map((l) => <Sub key={l.concepto} label={l.concepto} monto={l.monto} />)}
          </div>
          <Linea label="Caja al terminar el período" monto={c.saldoFinal} fuerte />
        </div>
      </section>

      <section className="homy-glass rounded-3xl p-4 sm:p-6" aria-labelledby="fin-ganancia-caja">
        <h2 id="fin-ganancia-caja" className="text-base font-extrabold text-[#0A2540]">¿Por qué mi ganancia no es igual a mi plata?</h2>
        <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
          En el período tu negocio {R.resultadoNeto >= 0 ? 'ganó' : 'perdió'} <b className="text-[#0A2540]">{ars(Math.abs(R.resultadoNeto))}</b> y tu caja {variacionCaja >= 0 ? 'subió' : 'bajó'} <b className="text-[#0A2540]">{ars(Math.abs(variacionCaja))}</b>.
          La diferencia sale de cosas como: facturas que todavía no cobraste o que cobraste de meses anteriores, inversiones que pagaste enteras pero se amortizan de a poco, retiros, préstamos y cuotas, y mercadería que compraste para stock.
        </p>
        <QueEs id="facturado_cobrado" />
      </section>

      <Grafico serie={c.serie} />
    </div>
  )
}

function Linea({ label, monto, fuerte = false, signo }: { label: string; monto: number; fuerte?: boolean; signo?: string }) {
  return (
    <div className={`flex flex-wrap items-baseline justify-between gap-x-3 ${fuerte ? 'py-2.5' : ''}`}>
      <span className={fuerte ? 'font-extrabold text-[#0A2540]' : 'font-bold text-slate-600'}>{signo && <span className="mr-1 text-slate-400" aria-hidden>{signo}</span>}{label}</span>
      <span className={`homy-num ml-auto ${fuerte ? 'text-[17px] font-extrabold' : 'font-bold'} ${monto < -0.5 ? 'text-[#c2410c]' : 'text-[#0A2540]'}`}>{ars(monto)}</span>
    </div>
  )
}
function Sub({ label, monto }: { label: string; monto: number }) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-3 pl-5 text-[13px] text-slate-500">
      <span className="min-w-0">{label}</span><span className="homy-num ml-auto">{ars(monto)}</span>
    </div>
  )
}

function SaldoInicial({ d, recargar }: { d: DatosFinanzas; recargar: () => Promise<void> }) {
  const [editar, setEditar] = useState(d.config.saldoInicial === null)
  const [monto, setMonto] = useState(d.config.saldoInicial === null ? '' : d.config.saldoInicial.toLocaleString('es-AR'))
  const [fecha, setFecha] = useState(d.config.fechaSaldoInicial || d.hoy)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setError(null)
    const n = parseMonto(monto)
    if (n === null) return setError('Poné un monto (puede ser 0)')
    setBusy(true)
    try {
      const r = await fetch('/api/finanzas/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: d.rol, saldoInicial: n, fechaSaldoInicial: fecha }) })
      const j = await r.json().catch(() => ({}))
      if (!r.ok) return setError(j.error || 'No se pudo guardar')
      toast.success('Saldo inicial guardado')
      setEditar(false)
      await recargar()
    } finally { setBusy(false) }
  }

  return (
    <section className="homy-glass-strong rounded-3xl p-4 sm:p-5" aria-labelledby="fin-saldo">
      <h2 id="fin-saldo" className="flex items-center gap-1 text-base font-extrabold text-[#0A2540]">Saldo inicial de caja <Ayuda id="saldo_inicial" /></h2>
      {!editar && d.config.saldoInicial !== null ? (
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <p className="text-sm text-slate-600">Al cierre del {fechaTxt(d.config.fechaSaldoInicial)} el negocio tenía <b className="homy-num text-[#0A2540]">{ars(d.config.saldoInicial)}</b>.</p>
          <button type="button" onClick={() => setEditar(true)} className="homy-focus min-h-[44px] rounded-lg px-2 text-sm font-bold text-[#1D63B8] underline">Corregir</button>
        </div>
      ) : (
        <>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
            ¿Cuánta plata tiene hoy el negocio? Sumá el efectivo, lo que tenés en el banco y en Mercado Pago para trabajar (no tus ahorros personales). Es la plata al cierre de ese día (lo que pagaste o cobraste ese día ya está adentro). Se carga una vez: desde ahí HomIA estima tu caja con tus movimientos.
          </p>
          <div className="mt-2 flex flex-wrap items-end gap-2">
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">Monto
              <input inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Ej.: 350.000" className="homy-glass-input homy-focus min-h-[44px] w-44 rounded-xl px-3 text-[15px] text-[#0A2540]" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-bold text-slate-600">A la fecha
              <input type="date" value={fecha} max={d.hoy} onChange={(e) => setFecha(e.target.value)} className="homy-glass-input homy-focus min-h-[44px] rounded-xl px-3 text-[15px] text-[#0A2540]" />
            </label>
            <button type="button" disabled={busy} onClick={() => void guardar()} className="homy-btn-primary min-h-[44px] px-5 text-sm disabled:opacity-60">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : null} Guardar
            </button>
          </div>
          {error && <p role="alert" className="mt-2 text-sm font-semibold text-red-700">{error}</p>}
        </>
      )}
    </section>
  )
}

/** Barras agrupadas por mes (entró / salió), un solo eje, leyenda, tooltip y vista de tabla. */
function Grafico({ serie }: { serie: SerieMes[] }) {
  const [tabla, setTabla] = useState(false)
  const [activo, setActivo] = useState<number | null>(null)
  const max = Math.max(1, ...serie.flatMap((s) => [s.entradas, s.salidas]))
  const hayDatos = serie.some((s) => s.entradas || s.salidas)
  const W = 100 / serie.length

  return (
    <section className="homy-glass rounded-3xl p-4 sm:p-6" aria-labelledby="fin-graf">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 id="fin-graf" className="text-base font-extrabold text-[#0A2540]">Entradas y salidas por mes</h2>
        <button type="button" onClick={() => setTabla((t) => !t)} className="homy-focus inline-flex min-h-[40px] items-center gap-1.5 rounded-lg px-2 text-xs font-bold text-[#1D63B8]">
          {tabla ? <><BarChart3 className="size-4" aria-hidden /> Ver gráfico</> : <><Table2 className="size-4" aria-hidden /> Ver como tabla</>}
        </button>
      </div>
      <div className="mt-2 flex flex-wrap gap-4 text-xs font-bold text-slate-600" aria-hidden={tabla}>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: C_ENTRA }} /> Entró</span>
        <span className="inline-flex items-center gap-1.5"><span className="size-3 rounded-sm" style={{ background: C_SALE }} /> Salió</span>
      </div>
      {!hayDatos ? (
        <p className="mt-4 rounded-xl bg-[#0A2540]/5 px-3 py-4 text-center text-sm text-slate-500">Sin entradas ni salidas en estos meses.</p>
      ) : tabla ? (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[20rem] text-left text-[13px]">
            <thead><tr className="text-xs text-slate-500"><th className="py-1.5 font-bold">Mes</th><th className="py-1.5 text-right font-bold">Entró</th><th className="py-1.5 text-right font-bold">Salió</th><th className="py-1.5 text-right font-bold">Resultado</th></tr></thead>
            <tbody className="divide-y divide-[#0A2540]/6">
              {serie.map((s) => (
                <tr key={s.mes}><td className="py-1.5 font-semibold capitalize">{s.etiqueta}</td><td className="homy-num py-1.5 text-right">{ars(s.entradas)}</td><td className="homy-num py-1.5 text-right">{ars(s.salidas)}</td><td className="homy-num py-1.5 text-right">{ars(s.resultado)}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="relative mt-3">
          <svg viewBox="0 0 100 60" preserveAspectRatio="none" className="h-48 w-full" role="img" aria-label="Entradas y salidas de plata por mes">
            {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1="0" x2="100" y1={56 - g * 52} y2={56 - g * 52} stroke="#0A2540" strokeOpacity="0.07" strokeWidth="0.3" vectorEffect="non-scaling-stroke" />)}
            <line x1="0" x2="100" y1="56" y2="56" stroke="#0A2540" strokeOpacity="0.25" strokeWidth="1" vectorEffect="non-scaling-stroke" />
            {serie.map((s, i) => {
              const x = i * W
              const bw = Math.max(0.6, W * 0.32)
              const hE = (s.entradas / max) * 52
              const hS = (s.salidas / max) * 52
              return (
                <g key={s.mes} onMouseEnter={() => setActivo(i)} onMouseLeave={() => setActivo(null)} onClick={() => setActivo(i)}>
                  <rect x={x} y="0" width={W} height="60" fill="transparent" />
                  {activo === i && <rect x={x} y="0" width={W} height="56" fill="#0A2540" fillOpacity="0.04" />}
                  <rect x={x + W / 2 - bw - 0.3} y={56 - hE} width={bw} height={hE} rx="0.8" fill={C_ENTRA} />
                  <rect x={x + W / 2 + 0.3} y={56 - hS} width={bw} height={hS} rx="0.8" fill={C_SALE} />
                </g>
              )
            })}
          </svg>
          <div className="mt-1 flex text-[10.5px] font-semibold text-slate-500">
            {serie.map((s) => <span key={s.mes} className="flex-1 text-center capitalize" style={{ width: `${W}%` }}>{s.etiqueta.split(' ')[0]}</span>)}
          </div>
          {activo !== null && (
            <div className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 rounded-xl bg-[#0A2540] px-3 py-2 text-xs text-white shadow-lg" role="status">
              <p className="font-extrabold capitalize">{serie[activo].etiqueta}</p>
              <p>Entró {ars(serie[activo].entradas)}</p>
              <p>Salió {ars(serie[activo].salidas)}</p>
              <p>Resultado {ars(serie[activo].resultado)}</p>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
