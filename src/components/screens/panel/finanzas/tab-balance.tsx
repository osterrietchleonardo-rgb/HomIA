'use client'
// Balance simplificado a una fecha: lo que tenés − lo que debés = lo que es tuyo (patrimonio).
import { Ayuda, Automatico, QueEs, ars, fechaTxt, type DatosFinanzas } from './ui'
import { claveDia } from '@/lib/finanzas/calculos'

export default function TabBalance({ d, irTab }: { d: DatosFinanzas; irTab: (t: string) => void }) {
  const B = d.reporte.balance
  const fecha = claveDia(new Date(new Date(B.fecha).getTime() - 1))
  const prov = d.rol === 'proveedor'

  return (
    <div className="space-y-5">
      <section className="homy-glass rounded-3xl p-4 sm:p-6" aria-labelledby="fin-bal">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="fin-bal" className="text-lg font-extrabold tracking-tight text-[#0A2540]">Balance</h2>
          <span className="text-xs font-bold text-slate-500">Foto al {fechaTxt(fecha)}</span>
        </div>
        <p className="mt-1 text-[13px] text-slate-500">¿Cuánto vale mi negocio? Lo que tenés, menos lo que debés.</p>

        <h3 className="mt-4 text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-emerald-700">Lo que tenés (activos)</h3>
        <div className="mt-1 divide-y divide-[#0A2540]/6">
          <Fila label="Caja estimada" monto={B.caja} ayuda="caja">
            {B.sinSaldoInicial && <p className="text-xs font-semibold text-amber-800">Sin saldo inicial: <button type="button" onClick={() => irTab('caja')} className="font-extrabold underline">cargalo</button> para que sea real.</p>}
          </Fila>
          <Fila label={<span className="inline-flex flex-wrap items-center gap-1.5">Cuentas por cobrar <Automatico /></span>} monto={B.cuentasPorCobrar} ayuda="cuentas_cobrar">
            <p className="text-xs text-slate-500">{ars(B.cuentasPorCobrarHomia)} de HomIA sin cobrar{B.cuentasPorCobrarFuera ? ` + ${ars(B.cuentasPorCobrarFuera)} que te deben por fuera` : ''}</p>
          </Fila>
          {prov && (
            <Fila label="Mercadería (stock al costo)" monto={B.inventario ?? 0} ayuda="inventario">
              <p className="text-xs text-slate-500">
                Valor de hoy, con el costo que cargaste{B.inventarioEstimado ? ` (incluye ${ars(B.inventarioEstimado)} estimados con tu margen declarado)` : ''}.
                {B.productosSinCosto > 0 ? ` ${B.productosSinCosto} ${B.productosSinCosto === 1 ? 'producto no suma' : 'productos no suman'}: falta su costo.` : ''}
              </p>
            </Fila>
          )}
          <Fila label="Herramientas, máquinas y vehículos" monto={B.bienesDeUso} ayuda="bienes_uso">
            <p className="text-xs text-slate-500">Lo que pagaste por tus inversiones menos lo ya amortizado.</p>
          </Fila>
          <Fila label="Total activos" monto={B.activos} fuerte />
        </div>

        <h3 className="mt-5 text-[0.72rem] font-extrabold uppercase tracking-[0.14em] text-[#c2410c]">Lo que debés (pasivos)</h3>
        <div className="mt-1 divide-y divide-[#0A2540]/6">
          <Fila label="Préstamos pendientes" monto={B.prestamos} ayuda="pasivo">
            <p className="text-xs text-slate-500">Lo recibido en préstamos menos el capital de las cuotas pagadas.</p>
          </Fila>
          <Fila label="Cuentas a pagar" monto={B.cuentasAPagar} ayuda="cuentas_pagar" />
          <Fila label="Total pasivos" monto={B.pasivos} fuerte />
        </div>

        <div className="mt-5 rounded-2xl bg-gradient-to-br from-[#0a2540] to-[#103455] px-4 py-4 text-white">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3">
            <span className="flex items-center gap-1 font-extrabold">Patrimonio neto (lo que es tuyo) <Ayuda id="patrimonio" className="text-white/70 hover:bg-white/10 hover:text-white" /></span>
            <span className={`homy-num ml-auto text-xl font-extrabold ${B.patrimonio < 0 ? 'text-[#ffb08a]' : ''}`}>{ars(B.patrimonio)}</span>
          </div>
          <p className="mt-1 text-xs text-white/75 [overflow-wrap:anywhere]">{ars(B.activos)} que tenés − {ars(B.pasivos)} que debés = {ars(B.patrimonio)}</p>
        </div>
        <QueEs id="patrimonio" />
      </section>
    </div>
  )
}

function Fila({ label, monto, fuerte = false, ayuda, children }: { label: React.ReactNode; monto: number; fuerte?: boolean; ayuda?: string; children?: React.ReactNode }) {
  return (
    <div className="py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <span className={`flex min-w-0 items-center gap-1 ${fuerte ? 'font-extrabold text-[#0A2540]' : 'text-[14px] font-semibold text-slate-600'}`}>
          <span className="min-w-0">{label}</span>{ayuda && <Ayuda id={ayuda} />}
        </span>
        <span className={`homy-num ml-auto ${fuerte ? 'text-[17px] font-extrabold' : 'font-bold'} ${monto < -0.5 ? 'text-[#c2410c]' : 'text-[#0A2540]'}`}>{ars(monto)}</span>
      </div>
      {children}
    </div>
  )
}
