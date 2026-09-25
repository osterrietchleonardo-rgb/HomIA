'use client'
// Primer uso guiado de Finanzas (3 pasos): saldo inicial de caja, gastos fijos del mes
// (sugeridos por rubro, sin montos: los pone el usuario) e inversiones que ya tiene.
import { useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Plus, Trash2 } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { GASTOS_SUGERIDOS, categoria, categoriasDe } from '@/lib/finanzas/conceptos'
import { parseMonto } from './form-movimiento'
import type { Rol } from './ui'

type Inv = { category: string; description: string; monto: string; mes: string; vida: string }

export default function PrimerUso({ rol, hoy, onCerrar }: { rol: Rol; hoy?: string; onCerrar: () => void }) {
  const hoyStr = hoy || new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
  const [paso, setPaso] = useState(1)
  const [saldo, setSaldo] = useState('')
  const [gastos, setGastos] = useState<Record<string, string>>({})
  const [invs, setInvs] = useState<Inv[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const catsInv = categoriasDe(rol, 'inversion')
  const mesMax = hoyStr.slice(0, 7)

  const post = async (url: string, method: string, body: unknown) => {
    const r = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
    const j = await r.json().catch(() => ({}))
    if (!r.ok) throw new Error(j.error || 'No se pudo guardar')
  }

  async function terminar() {
    setError(null)
    // validar todo antes de escribir nada
    const s = saldo.trim() ? parseMonto(saldo) : null
    if (saldo.trim() && s === null) { setPaso(1); return setError('El saldo inicial no es un número válido') }
    const gs: { category: string; amount: number }[] = []
    for (const [cat, txt] of Object.entries(gastos)) {
      if (!txt.trim()) continue
      const n = parseMonto(txt)
      if (n === null || n <= 0) { setPaso(2); return setError(`El monto de "${categoria(cat)?.nombre}" no es válido`) }
      gs.push({ category: cat, amount: n })
    }
    const is: { category: string; description: string; amount: number; date: string; usefulLifeMonths: number }[] = []
    for (const i of invs) {
      const n = parseMonto(i.monto)
      if (!i.description.trim() || n === null || n <= 0 || !i.mes) { setPaso(3); return setError('Completá descripción, monto y mes de compra de cada inversión (o borrala)') }
      const fecha = `${i.mes}-01` > hoyStr ? hoyStr : `${i.mes}-01`
      is.push({ category: i.category, description: i.description.trim(), amount: n, date: fecha, usefulLifeMonths: Number(i.vida) || categoria(i.category)?.vidaUtilMeses || 36 })
    }
    setBusy(true)
    try {
      if (s !== null) await post('/api/finanzas/config', 'PUT', { role: rol, saldoInicial: s, fechaSaldoInicial: hoyStr })
      for (const g of gs) {
        const c = categoria(g.category)
        await post('/api/finanzas/movimientos', 'POST', { role: rol, type: 'gasto', category: g.category, description: c?.nombre || 'Gasto fijo', amount: g.amount, date: hoyStr, recurring: c?.recurrente ? 'mensual' : null })
      }
      for (const i of is) await post('/api/finanzas/movimientos', 'POST', { role: rol, type: 'inversion', ...i })
      await post('/api/finanzas/config', 'PUT', { role: rol, primerUsoHecho: true })
      toast.success('¡Listo! Tus finanzas ya tienen tus números', { description: 'Podés corregir todo desde Movimientos y Caja.' })
      onCerrar()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally { setBusy(false) }
  }

  const campo = 'homy-glass-input homy-focus min-h-[44px] rounded-xl px-3 text-[15px] text-[#0A2540]'

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !busy) onCerrar() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-5 sm:max-w-xl" style={{ background: "rgba(255, 255, 255, 0.97)" }}>
        <DialogHeader className="text-left">
          <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-[#1D63B8]">Paso {paso} de 3</p>
          <DialogTitle className="pr-8 text-lg font-extrabold text-[#0A2540]">
            {paso === 1 ? '¿Cuánta plata tiene hoy el negocio?' : paso === 2 ? '¿Qué gastos fijos pagás por mes?' : '¿Qué herramientas o bienes ya tenés?'}
          </DialogTitle>
          <DialogDescription className="text-[13px] leading-relaxed text-slate-500">
            {paso === 1 && 'Sumá el efectivo, el banco y el Mercado Pago que usás para trabajar (no tus ahorros personales). Es tu saldo inicial de caja: desde hoy HomIA la estima con tus movimientos.'}
            {paso === 2 && 'Completá solo los que pagás (los demás dejalos vacíos). Los que se pagan todos los meses se repiten solos; los podés terminar cuando quieras.'}
            {paso === 3 && 'Herramientas eléctricas, máquinas, vehículo, computadora. No restan de golpe: se reparten mes a mes durante su vida útil (amortización). Como ya los pagaste antes de hoy, no bajan tu caja.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1.5" aria-hidden>{[1, 2, 3].map((p) => <span key={p} className={`h-1.5 flex-1 rounded-full ${p <= paso ? 'bg-[#1D63B8]' : 'bg-[#0A2540]/10'}`} />)}</div>

        {paso === 1 && (
          <label className="block text-[13px] font-bold text-[#0A2540]">Saldo de hoy (pesos)
            <input inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="Ej.: 350.000" className={`${campo} mt-1.5 w-full`} />
            <span className="mt-1 block text-xs font-normal text-slate-500">Si no lo sabés ahora, dejalo vacío y cargalo después en Caja.</span>
          </label>
        )}

        {paso === 2 && (
          <ul className="space-y-2">
            {GASTOS_SUGERIDOS[rol].map((id) => {
              const c = categoria(id)!
              return (
                <li key={id} className="rounded-xl border border-[#0A2540]/8 bg-white/60 px-3 py-2">
                  <label htmlFor={`pu-${id}`} className="block text-[13.5px] font-bold text-[#0A2540]">{c.nombre}{c.recurrente ? ' · todos los meses' : ''}</label>
                  <p className="text-xs text-slate-500">{c.ejemplos}</p>
                  <input id={`pu-${id}`} inputMode="decimal" value={gastos[id] || ''} onChange={(e) => setGastos((g) => ({ ...g, [id]: e.target.value }))} placeholder="Monto por mes (vacío si no pagás)" className={`${campo} mt-1.5 w-full`} />
                </li>
              )
            })}
          </ul>
        )}

        {paso === 3 && (
          <div className="space-y-2">
            {invs.map((i, k) => (
              <div key={k} className="space-y-1.5 rounded-xl border border-[#0A2540]/8 bg-white/60 p-3">
                <div className="flex items-center gap-2">
                  <select aria-label="Tipo de bien" value={i.category} onChange={(e) => setInvs((xs) => xs.map((x, j) => (j === k ? { ...x, category: e.target.value, vida: String(categoria(e.target.value)?.vidaUtilMeses || 36) } : x)))} className={`${campo} min-w-0 flex-1`}>
                    {catsInv.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  </select>
                  <button type="button" aria-label="Borrar este bien" onClick={() => setInvs((xs) => xs.filter((_, j) => j !== k))} className="homy-focus grid size-11 shrink-0 place-items-center rounded-xl text-slate-400 hover:text-red-600"><Trash2 className="size-4" aria-hidden /></button>
                </div>
                <input aria-label="Descripción" value={i.description} onChange={(e) => setInvs((xs) => xs.map((x, j) => (j === k ? { ...x, description: e.target.value } : x)))} placeholder="Ej.: Taladro percutor" className={`${campo} w-full`} />
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-3">
                  <input aria-label="Cuánto pagaste" inputMode="decimal" value={i.monto} onChange={(e) => setInvs((xs) => xs.map((x, j) => (j === k ? { ...x, monto: e.target.value } : x)))} placeholder="Cuánto pagaste" className={campo} />
                  <input aria-label="Mes de compra" type="month" max={mesMax} value={i.mes} onChange={(e) => setInvs((xs) => xs.map((x, j) => (j === k ? { ...x, mes: e.target.value } : x)))} className={campo} />
                  <input aria-label="Vida útil en meses" inputMode="numeric" value={i.vida} onChange={(e) => setInvs((xs) => xs.map((x, j) => (j === k ? { ...x, vida: e.target.value.replace(/\D/g, '') } : x)))} placeholder="Meses de vida útil" className={campo} />
                </div>
                <p className="text-xs text-slate-500">Vida útil sugerida: {categoria(i.category)?.vidaUtilMeses} meses (orientativa).</p>
              </div>
            ))}
            <button type="button" onClick={() => setInvs((xs) => [...xs, { category: catsInv[0].id, description: '', monto: '', mes: '', vida: String(catsInv[0].vidaUtilMeses || 36) }])}
              className="homy-glass-soft homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-[#1D63B8]">
              <Plus className="size-4" aria-hidden /> Agregar un bien
            </button>
            {invs.length === 0 && <p className="text-xs text-slate-500">Si no tenés o preferís cargarlos después, tocá Terminar.</p>}
          </div>
        )}

        {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}

        <div className="flex flex-wrap gap-2">
          {paso > 1 && <button type="button" disabled={busy} onClick={() => setPaso((p) => p - 1)} className="homy-glass-soft homy-focus min-h-[48px] rounded-xl px-5 text-sm font-bold text-slate-600">Atrás</button>}
          {paso < 3 ? (
            <button type="button" onClick={() => { setError(null); setPaso((p) => p + 1) }} className="homy-btn-primary min-h-[48px] flex-1 px-5 text-[15px]">Siguiente</button>
          ) : (
            <button type="button" disabled={busy} onClick={() => void terminar()} className="homy-btn-primary min-h-[48px] flex-1 px-5 text-[15px] disabled:opacity-60">
              {busy ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Guardando…</> : 'Terminar'}
            </button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
