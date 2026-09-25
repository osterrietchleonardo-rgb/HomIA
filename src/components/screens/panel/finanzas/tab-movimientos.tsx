'use client'
// Movimientos del período: lo automático de HomIA (no se edita, se abre el origen) y lo que
// cargó el usuario (se edita o se borra). El profesional asigna sus compras de HomIA a una obra.
import { useEffect, useState } from 'react'
import { toast } from 'sonner'
import { navigate } from '@/lib/router'
import { ArrowUpRight, Pencil, Repeat, Paperclip, Plus } from 'lucide-react'
import type { MovVista } from '@/lib/finanzas/calculos'
import type { TipoMovimiento } from '@/lib/finanzas/conceptos'
import { Automatico, ars, fechaTxt, type DatosFinanzas } from './ui'
import type { Inicial } from './form-movimiento'

type Filtro = 'todos' | 'auto' | 'manual'
type Cargado = Inicial & { id: string }

const ESTADO: Record<string, string> = { cobrado: 'Cobrado', por_cobrar: 'Por cobrar', pagado: '', pendiente: 'Pendiente' }

export default function TabMovimientos({ d, onNuevo, onEditar, recargar }: {
  d: DatosFinanzas; onNuevo: (i?: Inicial) => void; onEditar: (i: Inicial) => void; recargar: () => Promise<void>
}) {
  const [filtro, setFiltro] = useState<Filtro>('todos')
  const [cargados, setCargados] = useState<Cargado[] | null>(null)

  useEffect(() => {
    let vivo = true
    fetch(`/api/finanzas/movimientos?role=${d.rol}`).then((r) => (r.ok ? r.json() : null)).then((j) => {
      if (vivo && j) setCargados((j.movimientos as (Cargado & { type: TipoMovimiento })[]))
    }).catch(() => null)
    return () => { vivo = false }
  }, [d])

  const lista = d.movimientos.filter((m) => filtro === 'todos' || m.origen === filtro)
  const n = (f: Filtro) => d.movimientos.filter((m) => f === 'todos' || m.origen === f).length

  function editar(m: MovVista) {
    const e = cargados?.find((x) => x.id === m.entryId)
    if (!e) { toast.error('Esperá un segundo: estamos cargando tus movimientos'); return }
    onEditar(e)
  }

  async function asignar(chargeId: string, destino: string) {
    const r = await fetch('/api/finanzas/config', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ role: 'profesional', asignar: { chargeId, destino: destino || null } }),
    })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) { toast.error(j.error || 'No se pudo asignar'); return }
    toast.success(destino === 'personal' ? 'Marcada como no del negocio' : destino ? 'Compra asignada a la obra' : 'Asignación quitada')
    await recargar()
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div role="tablist" aria-label="Filtrar movimientos" className="flex flex-wrap gap-1.5">
          {([['todos', 'Todos'], ['auto', 'Automáticos'], ['manual', 'Cargados por vos']] as [Filtro, string][]).map(([f, l]) => (
            <button key={f} role="tab" aria-selected={filtro === f} onClick={() => setFiltro(f)} className="homy-tab">
              {l} <span className="tabular-nums opacity-70">{n(f)}</span>
            </button>
          ))}
        </div>
        <button type="button" onClick={() => onNuevo()} className="homy-btn-dark min-h-[44px] px-4 text-sm"><Plus className="size-4" aria-hidden /> Cargar</button>
      </div>
      <p className="text-[13px] text-slate-500">
        {d.reporte.periodo.etiqueta}. Lo <Automatico /> sale de tus facturas, ventas, compras y devoluciones en HomIA: no se edita acá, tocá &quot;Ver origen&quot;.
        Los gastos mensuales aparecen una vez por mes.
      </p>

      {lista.length === 0 ? (
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">No hay movimientos en este período</h3>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">Cargá tus gastos, costos e ingresos por fuera de HomIA para ver tus números completos.</p>
          <button type="button" onClick={() => onNuevo()} className="homy-btn-primary mt-4 min-h-[44px] px-5 text-sm">Cargar un movimiento</button>
        </div>
      ) : (
        <ul className="space-y-2">
          {lista.map((m) => (
            <li key={m.id} className="homy-row px-4 py-3">
              <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
                <div className="min-w-0 flex-[1_1_14rem]">
                  <p className="flex flex-wrap items-center gap-1.5">
                    <span className="font-extrabold text-[#0A2540]">{m.nombre}</span>
                    {m.origen === 'auto' && <Automatico />}
                    {m.recurring === 'mensual' && <span className="inline-flex items-center gap-1 rounded-full bg-[#0A2540]/6 px-2 py-0.5 text-[10.5px] font-extrabold text-slate-600"><Repeat className="size-3" aria-hidden /> Mensual</span>}
                    {ESTADO[m.estado] && <span className={`rounded-full px-2 py-0.5 text-[10.5px] font-extrabold ${m.estado === 'cobrado' ? 'bg-emerald-50 text-emerald-700' : 'bg-amber-50 text-amber-800'}`}>{ESTADO[m.estado]}</span>}
                    {m.personal && <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10.5px] font-extrabold text-slate-500">No es del negocio</span>}
                  </p>
                  <p className="text-[13px] text-slate-600 [overflow-wrap:anywhere]">{m.descripcion}</p>
                  <p className="text-xs text-slate-400">
                    {fechaTxt(m.fecha)}{m.cobradaEn && m.cobradaEn.slice(0, 10) !== m.fecha.slice(0, 10) ? ` · cobrada ${fechaTxt(m.cobradaEn)}` : ''}
                    {m.projectId && d.obras.find((o) => o.id === m.projectId) ? ` · obra: ${d.obras.find((o) => o.id === m.projectId)!.title}` : ''}
                  </p>
                </div>
                <span className={`homy-num ml-auto text-[16px] font-extrabold ${m.entra ? 'text-emerald-700' : 'text-[#0A2540]'}`}>{m.entra ? '+' : '−'}{ars(m.monto)}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-2">
                {m.origen === 'auto' && m.link && (
                  <button type="button" onClick={() => navigate(m.link!)} className="homy-focus inline-flex min-h-[40px] items-center gap-1 rounded-lg px-1 text-xs font-bold text-[#1D63B8] hover:underline">
                    Ver origen <ArrowUpRight className="size-3.5" aria-hidden />
                  </button>
                )}
                {m.origen === 'manual' && (
                  <button type="button" onClick={() => editar(m)} className="homy-focus inline-flex min-h-[40px] items-center gap-1 rounded-lg px-1 text-xs font-bold text-[#1D63B8] hover:underline">
                    <Pencil className="size-3.5" aria-hidden /> {m.proyectado ? 'Editar el gasto mensual' : 'Editar'}
                  </button>
                )}
                {m.attachmentUrl && (
                  <a href={m.attachmentUrl} target="_blank" rel="noreferrer" className="inline-flex min-h-[40px] items-center gap-1 px-1 text-xs font-bold text-slate-500 hover:underline"><Paperclip className="size-3.5" aria-hidden /> Comprobante</a>
                )}
                {m.tipo === 'compra_homia' && d.rol === 'profesional' && (
                  <label className="flex min-w-0 items-center gap-1.5 text-xs font-bold text-slate-500">
                    Obra:
                    <select value={m.personal ? 'personal' : m.projectId || ''} onChange={(e) => void asignar(m.id.split(':')[1], e.target.value)}
                      className="homy-glass-input homy-focus min-h-[40px] max-w-[14rem] rounded-lg px-2 text-xs font-semibold text-[#0A2540]">
                      <option value="">Sin asignar</option>
                      {d.obras.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                      <option value="personal">No es del negocio</option>
                    </select>
                  </label>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
