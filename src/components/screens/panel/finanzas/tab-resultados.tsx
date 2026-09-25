'use client'
// Resultados: el estado de resultados del período, renglón por renglón, cada uno con su
// "¿Qué es esto?" y la cuenta hecha con los números reales. Proveedor: costo de su mercadería.
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, PackageSearch } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Automatico, QueEs, Renglon, ars, pctTxt, type DatosFinanzas } from './ui'
import { parseMonto } from './form-movimiento'

export default function TabResultados({ d, recargar }: { d: DatosFinanzas; recargar: () => Promise<void> }) {
  const R = d.reporte.resultados
  const Rp = d.reporte.resultadosPrev
  const prov = d.rol === 'proveedor'
  const m = R.mercaderia
  const [costos, setCostos] = useState(false)

  const costoPartes = [
    R.costoManual ? `${ars(R.costoManual)} cargados por vos` : '',
    R.comprasHomia ? `${ars(R.comprasHomia)} de materiales comprados en HomIA` : '',
    R.subcontratosHomia ? `${ars(R.subcontratosHomia)} de subcontratos por HomIA` : '',
    m.conocido ? `${ars(m.conocido)} de mercadería vendida (costo cargado)` : '',
    m.estimado ? `${ars(m.estimado)} de mercadería vendida (estimado)` : '',
    m.fueraEstimado ? `${ars(m.fueraEstimado)} de costo estimado de tus ventas por fuera` : '',
    R.reintegros ? `− ${ars(R.reintegros)} de reintegros de sobrantes` : '',
    m.revertido ? `− ${ars(m.revertido)} de mercadería que volvió al stock` : '',
  ].filter(Boolean)

  return (
    <div className="space-y-5">
      <section className="homy-glass rounded-3xl p-4 sm:p-6" aria-labelledby="fin-er">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="fin-er" className="text-lg font-extrabold tracking-tight text-[#0A2540]">Estado de resultados</h2>
          <span className="text-xs font-bold text-slate-500">{d.reporte.periodo.etiqueta} · lo facturado, no lo cobrado</span>
        </div>
        <p className="mt-1 text-[13px] text-slate-500">¿Estoy ganando plata? Se lee de arriba abajo. Lo marcado <Automatico /> sale solo de HomIA.</p>

        <div className="mt-3 divide-y divide-[#0A2540]/6">
          <Renglon label={<span className="inline-flex flex-wrap items-center gap-1.5">{prov ? 'Ventas de HomIA' : 'Facturas de HomIA'} <Automatico /></span>} monto={R.ventasHomia} signo="+">
            {!prov && R.ventasHomia > 0 && (
              <p className="pl-4 text-xs text-slate-500">Mano de obra {ars(R.manoObra)} · materiales facturados {ars(R.materialesFacturados)}</p>
            )}
            <QueEs id="facturado_cobrado" />
          </Renglon>
          <Renglon label="Ventas por fuera de HomIA" monto={R.ventasFuera} signo="+">
            {R.ventasFuera === 0 && <p className="pl-4 text-xs text-slate-500">Si trabajás o vendés por fuera de la app, cargalo en Movimientos como &quot;Ingreso por fuera de HomIA&quot;.</p>}
          </Renglon>
          <Renglon label="Ventas brutas" monto={R.ventasBrutas} signo="=" />
          <Renglon label={<span className="inline-flex flex-wrap items-center gap-1.5">Devoluciones de sobrantes <Automatico /></span>} monto={-R.devoluciones} signo="−">
            <QueEs id="devoluciones" cuenta={R.devoluciones ? `reembolsaste ${ars(R.devoluciones)} en el período` : 'no reembolsaste sobrantes en el período'} />
          </Renglon>
          <Renglon label="Ventas netas" monto={R.ventasNetas} fuerte>
            <QueEs id="ventas_netas" cuenta={`${ars(R.ventasBrutas)} − ${ars(R.devoluciones)} = ${ars(R.ventasNetas)}`} />
          </Renglon>
          <Renglon label="Costo directo" monto={-R.costoDirecto} signo="−">
            <QueEs id="costo_directo" cuenta={costoPartes.length ? `${costoPartes.join(' + ').replace(/\+ −/g, '−')} = ${ars(R.costoDirecto)}` : 'no hay costos directos en el período'} />
            {prov && m.ventasSinCosto > 0 && (
              <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900">
                Vendiste {ars(m.ventasSinCosto)} de productos sin costo cargado: su costo no está sumado (no lo inventamos). <button type="button" onClick={() => setCostos(true)} className="font-extrabold underline">Cargá los costos</button>
              </p>
            )}
            {prov && m.fueraSinCosto > 0 && (
              <p className="mt-1 rounded-lg bg-amber-50 px-2.5 py-1.5 text-xs font-semibold text-amber-900">
                Tus ventas por fuera de HomIA ({ars(m.fueraSinCosto)}) no tienen costo: HomIA no sabe qué productos fueron. Declará un margen estimado (en &quot;Cargar costos&quot;) o cargá ese costo como costo directo; mientras tanto tu margen se ve más alto que el real. <button type="button" onClick={() => setCostos(true)} className="font-extrabold underline">Cargar costos</button>
              </p>
            )}
            {prov && m.fueraEstimado > 0 && <p className="mt-1 text-xs text-slate-500">Incluye {ars(m.fueraEstimado)} de costo estimado de tus ventas por fuera de HomIA ({d.config.costoEstimadoPct}% de lo vendido): es una estimación.</p>}
            {prov && m.estimado > 0 && <p className="mt-1 text-xs text-slate-500">Incluye {ars(m.estimado)} estimados con tu margen declarado ({d.config.costoEstimadoPct}% del precio): es una estimación.</p>}
          </Renglon>
          <Renglon label="Margen bruto" monto={R.margenBruto} fuerte>
            <p className="text-xs font-bold text-slate-500">{R.margenBrutoPct === null ? 'Sin ventas: el % no se puede calcular' : `${pctTxt(R.margenBrutoPct)} de las ventas`}</p>
            <QueEs id="margen_bruto" cuenta={`${ars(R.ventasNetas)} − ${ars(R.costoDirecto)} = ${ars(R.margenBruto)}`} />
          </Renglon>
          <Renglon label="Gastos fijos y operativos" monto={-R.gastos} signo="−">
            {R.gastosPorCategoria.length > 0 ? (
              <ul className="mt-1 space-y-0.5 pl-4 text-xs text-slate-500">
                {R.gastosPorCategoria.map((g) => (
                  <li key={g.categoria} className="flex flex-wrap justify-between gap-x-2"><span>{g.nombre}</span><span className="homy-num font-semibold">{ars(g.monto)}</span></li>
                ))}
              </ul>
            ) : <p className="pl-4 text-xs text-slate-500">No cargaste gastos en el período: por eso tu ganancia se ve más alta que la real.</p>}
            <QueEs id="gastos_fijos" />
          </Renglon>
          <Renglon label="Resultado operativo" monto={R.resultadoOperativo} fuerte>
            <QueEs id="resultado_operativo" cuenta={`${ars(R.margenBruto)} − ${ars(R.gastos)} = ${ars(R.resultadoOperativo)}`} />
          </Renglon>
          <Renglon label="Amortizaciones" monto={-R.amortizaciones} signo="−">
            <QueEs id="amortizacion" cuenta={R.amortizaciones ? `la parte de tus inversiones que se gastó en el período: ${ars(R.amortizaciones)}` : 'no cargaste inversiones'} />
          </Renglon>
          <Renglon label="Resultado antes de intereses" monto={R.resultadoAntesIntereses} fuerte />
          <Renglon label="Intereses de préstamos" monto={-R.intereses} signo="−">
            <QueEs id="intereses" />
          </Renglon>
          <Renglon label={R.resultadoNeto >= 0 ? 'Resultado neto (ganancia)' : 'Resultado neto (pérdida)'} monto={R.resultadoNeto} fuerte>
            <p className="text-xs font-bold text-slate-500">{R.margenNetoPct === null ? 'Margen neto: sin dato' : `Margen neto ${pctTxt(R.margenNetoPct)}`} · {d.reporte.periodo.etiquetaPrev}: {ars(Rp.resultadoNeto)}</p>
            <QueEs id="resultado_neto" abierto cuenta={`${ars(R.resultadoOperativo)} − ${ars(R.amortizaciones)} − ${ars(R.intereses)} = ${ars(R.resultadoNeto)}`} />
          </Renglon>
        </div>
        <p className="mt-3 rounded-xl bg-[#0A2540]/5 px-3 py-2 text-[12.5px] leading-relaxed text-slate-600">
          Aparte: te llevaste <b className="text-[#0A2540]">{ars(R.retiros)}</b> en retiros. No es un gasto del negocio, por eso no está arriba; sí baja tu caja.
        </p>
      </section>

      {prov && (
        <section className="homy-glass rounded-3xl p-4 sm:p-6" aria-labelledby="fin-costos">
          <h2 id="fin-costos" className="flex items-center gap-2 text-lg font-extrabold tracking-tight text-[#0A2540]">
            <PackageSearch className="size-5 text-[#1D63B8]" aria-hidden /> Costo de tu mercadería
          </h2>
          <p className="mt-1 text-[13px] leading-relaxed text-slate-600">
            Para saber cuánto ganás con cada venta, HomIA necesita cuánto te cuesta cada producto. Tenés costo cargado en{' '}
            <b>{d.stock.filter((s) => s.costo !== null).length} de {d.stock.length}</b> productos.
            {d.config.costoEstimadoPct ? ` Para el resto usamos tu estimación: comprás al ${d.config.costoEstimadoPct}% del precio de venta.` : ' Para los que no tienen costo, podés declarar un margen promedio estimado.'}
          </p>
          <button type="button" onClick={() => setCostos(true)} className="homy-btn-dark mt-3 min-h-[44px] px-5 text-sm">Cargar costos</button>
        </section>
      )}

      {costos && <CostosStock d={d} onCerrar={() => setCostos(false)} onGuardado={async () => { setCostos(false); await recargar() }} />}
    </div>
  )
}

function CostosStock({ d, onCerrar, onGuardado }: { d: DatosFinanzas; onCerrar: () => void; onGuardado: () => Promise<void> }) {
  const [vals, setVals] = useState<Record<string, string>>(() => Object.fromEntries(d.stock.map((s) => [s.id, s.costo === null ? '' : s.costo.toLocaleString('es-AR')])))
  const [pct, setPct] = useState(d.config.costoEstimadoPct ? String(d.config.costoEstimadoPct) : '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function guardar() {
    setError(null)
    const items: { stockId: string; unitCost: number | null }[] = []
    for (const s of d.stock) {
      const txt = (vals[s.id] || '').trim()
      const n = txt ? parseMonto(txt) : null
      if (txt && (n === null || n < 0)) return setError(`El costo de "${s.nombre}" no es un número válido`)
      if (n !== s.costo) items.push({ stockId: s.id, unitCost: n })
    }
    const p = pct.trim() ? Number(pct.replace(',', '.')) : null
    if (p !== null && (!Number.isFinite(p) || p < 1 || p > 99)) return setError('El porcentaje estimado va de 1 a 99')
    setBusy(true)
    try {
      if (items.length) {
        const r = await fetch('/api/finanzas/costos', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ items }) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) return setError(j.error || 'No se pudieron guardar los costos')
      }
      if (p !== d.config.costoEstimadoPct) {
        const r = await fetch('/api/finanzas/config', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: 'proveedor', costoEstimadoPct: p }) })
        const j = await r.json().catch(() => ({}))
        if (!r.ok) return setError(j.error || 'No se pudo guardar el margen estimado')
      }
      toast.success('Costos guardados', { description: 'Tu margen y tu stock ya se recalcularon.' })
      await onGuardado()
    } finally { setBusy(false) }
  }

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onCerrar() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-5 sm:max-w-xl" style={{ background: "rgba(255, 255, 255, 0.97)" }}>
        <DialogHeader className="text-left">
          <DialogTitle className="pr-8 text-lg font-extrabold text-[#0A2540]">Costo de tus productos</DialogTitle>
          <DialogDescription className="text-[13px] text-slate-500">Lo que te cuesta a vos cada unidad (lo que le pagás al distribuidor), no el precio de venta.</DialogDescription>
        </DialogHeader>
        {d.stock.length === 0 ? (
          <p className="text-sm text-slate-500">Todavía no cargaste productos en tu stock.</p>
        ) : (
          <ul className="space-y-2">
            {d.stock.map((s) => (
              <li key={s.id} className="rounded-xl border border-[#0A2540]/8 bg-white/60 px-3 py-2">
                <label htmlFor={`costo-${s.id}`} className="block text-[13.5px] font-bold text-[#0A2540] [overflow-wrap:anywhere]">{s.nombre}</label>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <input id={`costo-${s.id}`} inputMode="decimal" value={vals[s.id] || ''} onChange={(e) => setVals((v) => ({ ...v, [s.id]: e.target.value }))}
                    placeholder="Costo por unidad" className="homy-glass-input homy-focus min-h-[44px] w-40 rounded-xl px-3 text-[15px]" />
                  <span className="text-xs text-slate-500">{s.detalle ? `${s.detalle} · ` : ''}Precio de venta {ars(s.precio)} · stock {s.cantidad.toLocaleString('es-AR')}</span>
                </div>
              </li>
            ))}
          </ul>
        )}
        <div className="rounded-xl bg-[#1D63B8]/6 px-3 py-2.5">
          <label htmlFor="costo-pct" className="block text-[13px] font-bold text-[#0A2540]">Margen estimado para los productos sin costo (opcional)</label>
          <p className="text-xs text-slate-500">&quot;Estimo que compro al X% del precio de venta.&quot; Se usa solo donde falta el costo y se muestra siempre como estimación.</p>
          <div className="mt-1.5 flex items-center gap-2">
            <input id="costo-pct" inputMode="numeric" value={pct} onChange={(e) => setPct(e.target.value)} placeholder="Ej.: 70" className="homy-glass-input homy-focus min-h-[44px] w-24 rounded-xl px-3 text-[15px]" />
            <span className="text-sm font-bold text-slate-600">% del precio de venta</span>
          </div>
        </div>
        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}
        <button type="button" disabled={busy} onClick={() => void guardar()} className="homy-btn-primary min-h-[48px] w-full text-[15px] disabled:opacity-60">
          {busy ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Guardando…</> : 'Guardar'}
        </button>
      </DialogContent>
    </Dialog>
  )
}
