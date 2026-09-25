'use client'
// Finanzas del profesional y del proveedor (D24, pedido de Leonardo 25/09/2026).
// Un solo módulo con el rol como parámetro: /panel/profesional/finanzas y /panel/proveedor/finanzas.
// Pestañas: Resumen · Resultados · Caja · Balance · Movimientos · Aprendé (desplazables en 390 px).
// Todo número sale de GET /api/finanzas/resumen (datos reales de la base + lo que cargó el usuario).
import { useCallback, useEffect, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { Loading } from '@/components/app/ui-bits'
import { RefreshCcw, Download, Wallet, Plus, LineChart, Scale, ListOrdered, GraduationCap, LayoutDashboard, Banknote } from 'lucide-react'
import type { DatosFinanzas, Rol } from './ui'
import TabResumen from './tab-resumen'
import TabResultados from './tab-resultados'
import TabCaja from './tab-caja'
import TabBalance from './tab-balance'
import TabMovimientos from './tab-movimientos'
import TabAprende from './tab-aprende'
import FormMovimiento, { type Inicial } from './form-movimiento'
import PrimerUso from './primer-uso'

const TABS = [
  { id: 'resumen', label: 'Resumen', icon: LayoutDashboard },
  { id: 'resultados', label: 'Resultados', icon: LineChart },
  { id: 'caja', label: 'Caja', icon: Banknote },
  { id: 'balance', label: 'Balance', icon: Scale },
  { id: 'movimientos', label: 'Movimientos', icon: ListOrdered },
  { id: 'aprende', label: 'Aprendé', icon: GraduationCap },
] as const
export type TabId = (typeof TABS)[number]['id']

const PERIODOS = [
  { id: 'mes', label: 'Este mes' },
  { id: 'mes_anterior', label: 'Mes anterior' },
  { id: '3m', label: 'Últimos 3 meses' },
  { id: '6m', label: 'Últimos 6 meses' },
  { id: '12m', label: 'Últimos 12 meses' },
  { id: 'anio', label: 'Este año' },
  { id: 'rango', label: 'Elegir fechas…' },
]

const NET = 'No pudimos conectar con HomIA. Revisá tu conexión y probá de nuevo.'

export default function Finanzas({ rol }: { rol: Rol }) {
  const route = useRoute()
  const tabQ = route.query.tab as TabId | undefined
  const tab: TabId = TABS.some((t) => t.id === tabQ) ? tabQ! : 'resumen'
  const [per, setPer] = useState('mes')
  const [rango, setRango] = useState<{ desde: string; hasta: string }>({ desde: '', hasta: '' })
  const [datos, setDatos] = useState<DatosFinanzas | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [cargando, setCargando] = useState(false)
  const [form, setForm] = useState<Inicial | null>(null)
  const [primerUso, setPrimerUso] = useState(false)

  const query = useCallback(() => {
    const q = new URLSearchParams({ role: rol })
    if (per === 'rango') {
      if (rango.desde && rango.hasta) { q.set('desde', rango.desde); q.set('hasta', rango.hasta) } else q.set('periodo', 'mes')
    } else q.set('periodo', per)
    return q.toString()
  }, [rol, per, rango])

  const cargar = useCallback(async () => {
    setCargando(true)
    setError(null)
    try {
      const res = await fetch(`/api/finanzas/resumen?${query()}`)
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'No pudimos calcular tus finanzas'); return }
      setDatos(d as DatosFinanzas)
    } catch {
      setError(NET)
    } finally {
      setCargando(false)
    }
  }, [query])
  useEffect(() => { void cargar() }, [cargar])

  const irTab = (t: string) => navigate(`/panel/${rol}/finanzas?tab=${t}`, { replace: true })
  const nuevo = (ini: Inicial = {}) => setForm(ini)

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Tu negocio</span>
          <h1 className="homy-page-title mt-1.5">Finanzas</h1>
          <p className="homy-page-sub">Cuánto ganás, cuánta plata tenés y cuánto vale tu negocio. Lo de HomIA se carga solo.</p>
        </div>
        <button type="button" onClick={() => nuevo()} className="homy-btn-primary min-h-[44px] shrink-0 px-4 text-sm">
          <Plus className="size-4" aria-hidden /> Cargar movimiento
        </button>
      </header>

      {/* pestañas: desplazables en el celular */}
      <div role="tablist" aria-label="Secciones de Finanzas" className="homy-scroll -mx-4 mb-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0">
        {TABS.map((t) => {
          const Icon = t.icon
          return (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => irTab(t.id)} className="homy-tab shrink-0">
              <Icon className="size-4" aria-hidden /> {t.label}
            </button>
          )
        })}
      </div>

      {tab !== 'aprende' && (
        <div className="mb-4 flex flex-wrap items-end gap-2">
          <label className="flex min-w-0 flex-col gap-1 text-xs font-bold text-slate-500">
            Período
            <select value={per} onChange={(e) => setPer(e.target.value)}
              className="homy-glass-input homy-focus min-h-[44px] rounded-xl px-3 text-sm font-semibold text-[#0A2540]">
              {PERIODOS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
            </select>
          </label>
          {per === 'rango' && (
            <>
              <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">Desde
                <input type="date" value={rango.desde} max={datos?.hoy} onChange={(e) => setRango((r) => ({ ...r, desde: e.target.value }))}
                  className="homy-glass-input homy-focus min-h-[44px] rounded-xl px-3 text-sm text-[#0A2540]" />
              </label>
              <label className="flex flex-col gap-1 text-xs font-bold text-slate-500">Hasta
                <input type="date" value={rango.hasta} max={datos?.hoy} onChange={(e) => setRango((r) => ({ ...r, hasta: e.target.value }))}
                  className="homy-glass-input homy-focus min-h-[44px] rounded-xl px-3 text-sm text-[#0A2540]" />
              </label>
            </>
          )}
          <a href={`/api/finanzas/export.csv?${query()}`} download
            className="homy-glass-soft homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-[#1D63B8] hover:bg-[#1D63B8]/10">
            <Download className="size-4" aria-hidden /> Exportar a Excel
          </a>
          {cargando && datos && <span className="pb-3 text-xs font-semibold text-slate-400">Actualizando…</span>}
        </div>
      )}

      {tab === 'aprende' ? (
        <TabAprende rol={rol} onPrimerUso={() => setPrimerUso(true)} />
      ) : error ? (
        <div className="homy-empty homy-glass-soft border border-dashed border-[#0A2540]/12">
          <span className="homy-empty-icon homy-chip-gold" aria-hidden><Wallet className="size-6" /></span>
          <h3 className="font-extrabold tracking-tight text-[#0A2540]">No pudimos cargar tus finanzas</h3>
          <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-slate-500">{error}</p>
          <button onClick={() => void cargar()} className="homy-btn-primary mt-5 min-h-[44px] px-5 text-sm">
            <RefreshCcw className="size-4" aria-hidden /> Reintentar
          </button>
        </div>
      ) : !datos ? (
        <Loading text="Calculando tus finanzas…" />
      ) : (
        <>
          {tab === 'resumen' && <TabResumen d={datos} irTab={irTab} onPrimerUso={() => setPrimerUso(true)} onNuevo={nuevo} recargar={cargar} />}
          {tab === 'resultados' && <TabResultados d={datos} recargar={cargar} />}
          {tab === 'caja' && <TabCaja d={datos} recargar={cargar} />}
          {tab === 'balance' && <TabBalance d={datos} irTab={irTab} />}
          {tab === 'movimientos' && <TabMovimientos d={datos} onNuevo={nuevo} onEditar={(m) => setForm(m)} recargar={cargar} />}
        </>
      )}

      {form && (
        <FormMovimiento rol={rol} inicial={form} obras={datos?.obras || []} hoy={datos?.hoy}
          onCerrar={() => setForm(null)} onGuardado={() => { setForm(null); void cargar() }} />
      )}
      {primerUso && (
        <PrimerUso rol={rol} hoy={datos?.hoy} onCerrar={() => { setPrimerUso(false); void cargar() }} />
      )}
    </div>
  )
}
