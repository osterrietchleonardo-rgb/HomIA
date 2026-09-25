'use client'
// Formulario de carga/edición de un movimiento de Finanzas. Al elegir tipo y categoría se ve
// qué es, ejemplos y qué le hace a cada informe (conceptos.ts, única fuente).
import { useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Camera, Trash2, X, CalendarX } from 'lucide-react'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { subirImagen } from '@/lib/upload-image'
import {
  TIPOS, categoriasDe, tiposDe, categoria, METODOS_PAGO, METODO_LABEL, type TipoMovimiento,
} from '@/lib/finanzas/conceptos'
import type { Rol } from './ui'

export type Inicial = {
  id?: string
  type?: TipoMovimiento
  category?: string
  description?: string
  amount?: number
  interestAmount?: number | null
  date?: string
  paymentMethod?: string | null
  recurring?: string | null
  recurringUntil?: string | null
  projectId?: string | null
  usefulLifeMonths?: number | null
  status?: string
  attachmentUrl?: string | null
}

const CON_ESTADO: TipoMovimiento[] = ['gasto', 'costo_directo', 'inversion', 'compra_mercaderia', 'otro_ingreso']
const CON_RECURRENTE: TipoMovimiento[] = ['gasto', 'costo_directo', 'otro_ingreso', 'pago_prestamo', 'retiro', 'compra_mercaderia']
const CON_OBRA: TipoMovimiento[] = ['costo_directo', 'gasto', 'otro_ingreso']

/** "1.234.567,50", "1234567.5", "$ 1.500" → número; null si no es un monto. */
export function parseMonto(s: string): number | null {
  const t = s.replace(/[$\s]/g, '')
  if (!t) return null
  let n: number
  if (t.includes(',')) n = Number(t.replace(/\./g, '').replace(',', '.'))
  else if (/^\d{1,3}(\.\d{3})+$/.test(t)) n = Number(t.replace(/\./g, ''))
  else n = Number(t)
  return Number.isFinite(n) ? n : null
}
const aTexto = (n: number | null | undefined) => (n === null || n === undefined ? '' : n.toLocaleString('es-AR', { maximumFractionDigits: 2 }))

export default function FormMovimiento({ rol, inicial, obras, hoy, onCerrar, onGuardado }: {
  rol: Rol; inicial: Inicial; obras: { id: string; title: string; status: string }[]; hoy?: string
  onCerrar: () => void; onGuardado: () => void
}) {
  const hoyStr = hoy || new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10)
  const editando = !!inicial.id
  const tipos = tiposDe(rol)
  const [type, setType] = useState<TipoMovimiento>(inicial.type || 'gasto')
  const cats = useMemo(() => categoriasDe(rol, type), [rol, type])
  const [category, setCategory] = useState(inicial.category && categoria(inicial.category)?.tipo === (inicial.type || 'gasto') ? inicial.category : '')
  const [description, setDescription] = useState(inicial.description || '')
  const [monto, setMonto] = useState(aTexto(inicial.amount))
  const [interes, setInteres] = useState(aTexto(inicial.interestAmount))
  const [date, setDate] = useState(inicial.date || hoyStr)
  const [metodo, setMetodo] = useState(inicial.paymentMethod || '')
  const [recurrente, setRecurrente] = useState(inicial.recurring === 'mensual')
  const [hasta, setHasta] = useState(inicial.recurringUntil || '')
  const [obra, setObra] = useState(inicial.projectId || '')
  const [vida, setVida] = useState(inicial.usefulLifeMonths ? String(inicial.usefulLifeMonths) : '')
  const [pendiente, setPendiente] = useState(inicial.status === 'pendiente')
  const [foto, setFoto] = useState(inicial.attachmentUrl || '')
  const [subiendo, setSubiendo] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmarBorrar, setConfirmarBorrar] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  const info = TIPOS[type]
  const cat = category ? categoria(category) : undefined
  const esIngreso = info.entra

  function elegirTipo(t: TipoMovimiento) {
    setType(t)
    setCategory('')
    setVida('')
    if (!CON_RECURRENTE.includes(t)) setRecurrente(false)
    if (!CON_ESTADO.includes(t)) setPendiente(false)
    if (!CON_OBRA.includes(t)) setObra('')
  }
  function elegirCategoria(id: string) {
    setCategory(id)
    const c = categoria(id)
    if (c?.vidaUtilMeses && !vida) setVida(String(c.vidaUtilMeses))
    if (c?.recurrente && !editando && CON_RECURRENTE.includes(type)) setRecurrente(true)
  }

  async function subir(files: FileList | null) {
    const f = files?.[0]
    if (!f) return
    setSubiendo(true)
    try {
      const r = await subirImagen(f, 'finanzas')
      if (!r.ok) { toast.error(r.error); return }
      setFoto(r.url)
    } finally {
      setSubiendo(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function guardar(extra: Record<string, unknown> = {}) {
    setError(null)
    const amount = parseMonto(monto)
    if (!category) return setError('Elegí una categoría')
    if (!description.trim()) return setError('Escribí una descripción corta')
    if (amount === null || amount <= 0) return setError('Poné un monto mayor a cero (por ejemplo 15.000)')
    const interestAmount = type === 'pago_prestamo' ? parseMonto(interes || '0') : null
    if (type === 'pago_prestamo' && (interestAmount === null || interestAmount < 0)) return setError('El interés tiene que ser un número (0 si no pagaste interés)')
    const body: Record<string, unknown> = {
      type, category, description: description.trim(), amount, date,
      interestAmount, paymentMethod: metodo || null,
      recurring: recurrente && CON_RECURRENTE.includes(type) ? 'mensual' : null,
      recurringUntil: recurrente && hasta ? hasta : null,
      projectId: obra && CON_OBRA.includes(type) ? obra : null,
      usefulLifeMonths: type === 'inversion' ? Number(vida) || null : null,
      status: CON_ESTADO.includes(type) && pendiente ? 'pendiente' : 'pagado',
      attachmentUrl: foto || null,
      ...extra,
    }
    setGuardando(true)
    try {
      const res = await fetch(editando ? `/api/finanzas/movimientos/${inicial.id}` : '/api/finanzas/movimientos', {
        method: editando ? 'PATCH' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editando ? body : { ...body, role: rol }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'No se pudo guardar'); return }
      toast.success(editando ? 'Movimiento actualizado' : 'Movimiento cargado', { description: 'Tus números ya se recalcularon.' })
      onGuardado()
    } catch {
      setError('No pudimos conectar con HomIA. Probá de nuevo.')
    } finally {
      setGuardando(false)
    }
  }

  async function borrar() {
    if (!inicial.id) return
    if (!confirmarBorrar) { setConfirmarBorrar(true); return }
    setGuardando(true)
    try {
      const res = await fetch(`/api/finanzas/movimientos/${inicial.id}`, { method: 'DELETE' })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'No se pudo borrar'); return }
      toast.success('Movimiento borrado')
      onGuardado()
    } finally {
      setGuardando(false)
    }
  }

  const campo = 'homy-glass-input homy-focus min-h-[44px] w-full rounded-xl px-3 text-[15px] text-[#0A2540]'
  const etiqueta = 'block text-[13px] font-bold text-[#0A2540]'

  return (
    <Dialog open onOpenChange={(o) => { if (!o && !guardando) onCerrar() }}>
      <DialogContent className="max-h-[92vh] overflow-y-auto p-5 sm:max-w-xl" style={{ background: "rgba(255, 255, 255, 0.97)" }}>
        <DialogHeader className="text-left">
          <DialogTitle className="pr-8 text-lg font-extrabold text-[#0A2540]">{editando ? 'Editar movimiento' : 'Cargar un movimiento'}</DialogTitle>
          <DialogDescription className="text-[13px] text-slate-500">
            Lo que pasa por HomIA ya se carga solo. Acá va el resto: gastos, costos, ingresos por fuera, inversiones, retiros y préstamos.
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={(e) => { e.preventDefault(); void guardar() }}>
          <fieldset>
            <legend className={etiqueta}>¿Qué querés cargar?</legend>
            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
              {tipos.map((t) => (
                <button key={t} type="button" onClick={() => elegirTipo(t)} aria-pressed={type === t} disabled={editando && t !== type}
                  className={`homy-focus min-h-[52px] rounded-xl border px-3 py-2 text-left transition disabled:opacity-40 ${type === t ? 'border-[#1D63B8] bg-[#1D63B8]/10' : 'border-[#0A2540]/10 bg-white/60 hover:border-[#1D63B8]/40'}`}>
                  <span className="block text-[13.5px] font-extrabold text-[#0A2540]">{TIPOS[t].nombre}</span>
                  <span className="block text-[12px] leading-snug text-slate-500">{TIPOS[t].corto}</span>
                </button>
              ))}
            </div>
            <div className="mt-2 rounded-xl bg-[#1D63B8]/6 px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-600">
              <p>{info.explicacion}</p>
              <ul className="mt-1.5 space-y-0.5">
                <li><b className="text-[#0A2540]">En resultados:</b> {info.enResultados}</li>
                <li><b className="text-[#0A2540]">En la caja:</b> {info.enCaja}</li>
                <li><b className="text-[#0A2540]">En el balance:</b> {info.enBalance}</li>
              </ul>
            </div>
          </fieldset>

          <div>
            <label htmlFor="fin-cat" className={etiqueta}>Categoría</label>
            <select id="fin-cat" value={category} onChange={(e) => elegirCategoria(e.target.value)} className={`${campo} mt-1.5`}>
              <option value="">Elegí una categoría…</option>
              {cats.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
            </select>
            {cat && (
              <div className="mt-2 rounded-xl border border-[#0A2540]/8 bg-white/70 px-3 py-2.5 text-[12.5px] leading-relaxed text-slate-600" aria-live="polite">
                <p><b className="text-[#0A2540]">{cat.nombre}</b> · tipo: {TIPOS[cat.tipo].nombre}.</p>
                <p className="mt-0.5">{cat.explicacion}</p>
                <p className="mt-0.5"><b className="text-[#0A2540]">Ejemplos:</b> {cat.ejemplos}</p>
              </div>
            )}
          </div>

          <div>
            <label htmlFor="fin-desc" className={etiqueta}>Descripción</label>
            <input id="fin-desc" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={200}
              placeholder={cat ? cat.ejemplos.split(',')[0] : 'Ej.: nafta de la semana'} className={`${campo} mt-1.5`} />
          </div>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="fin-monto" className={etiqueta}>{type === 'pago_prestamo' ? 'Cuota total (pesos)' : 'Monto (pesos)'}</label>
              <input id="fin-monto" inputMode="decimal" value={monto} onChange={(e) => setMonto(e.target.value)} placeholder="Ej.: 25.000" className={`${campo} mt-1.5`} />
            </div>
            <div>
              <label htmlFor="fin-fecha" className={etiqueta}>{recurrente ? 'Desde (primer mes)' : 'Fecha'}</label>
              <input id="fin-fecha" type="date" value={date} max={hoyStr} onChange={(e) => setDate(e.target.value)} className={`${campo} mt-1.5`} />
            </div>
          </div>

          {type === 'pago_prestamo' && (
            <div>
              <label htmlFor="fin-int" className={etiqueta}>¿Cuánto de la cuota es interés?</label>
              <input id="fin-int" inputMode="decimal" value={interes} onChange={(e) => setInteres(e.target.value)} placeholder="Ej.: 30.000 (0 si no hay interés)" className={`${campo} mt-1.5`} />
              <p className="mt-1 text-xs text-slate-500">El interés es gasto; el resto (capital) baja tu deuda. Lo ves en el resumen del banco.</p>
            </div>
          )}

          {type === 'inversion' && (
            <div>
              <label htmlFor="fin-vida" className={etiqueta}>¿Cuántos meses te va a durar? (vida útil)</label>
              <input id="fin-vida" inputMode="numeric" value={vida} onChange={(e) => setVida(e.target.value.replace(/\D/g, ''))} className={`${campo} mt-1.5`} />
              <p className="mt-1 text-xs text-slate-500">
                Sugerido para esta categoría: {cat?.vidaUtilMeses ?? 36} meses (orientativo; cambialo si sabés que dura más o menos).
                {parseMonto(monto) && Number(vida) > 0 ? ` Cada mes tu resultado se lleva $ ${Math.round((parseMonto(monto) || 0) / Number(vida)).toLocaleString('es-AR')} de amortización.` : ''}
              </p>
            </div>
          )}

          {CON_ESTADO.includes(type) && (
            <fieldset>
              <legend className={etiqueta}>{esIngreso ? '¿Ya lo cobraste?' : '¿Ya lo pagaste?'}</legend>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {[false, true].map((p) => (
                  <button key={String(p)} type="button" aria-pressed={pendiente === p} onClick={() => setPendiente(p)}
                    className={`homy-focus min-h-[44px] rounded-xl border px-4 text-sm font-bold ${pendiente === p ? 'border-[#1D63B8] bg-[#1D63B8]/10 text-[#1D63B8]' : 'border-[#0A2540]/10 bg-white/60 text-slate-600'}`}>
                    {p ? (esIngreso ? 'Me lo deben' : 'Lo debo (a pagar)') : (esIngreso ? 'Ya lo cobré' : 'Ya lo pagué')}
                  </button>
                ))}
              </div>
            </fieldset>
          )}

          {CON_RECURRENTE.includes(type) && (
            <div className="rounded-xl border border-[#0A2540]/8 bg-white/60 px-3 py-2.5">
              <label className="flex min-h-[44px] cursor-pointer items-center gap-2.5 text-[14px] font-bold text-[#0A2540]">
                <input type="checkbox" checked={recurrente} onChange={(e) => setRecurrente(e.target.checked)} className="size-5 accent-[#1D63B8]" />
                Se repite todos los meses
              </label>
              {recurrente && (
                <div className="mt-1">
                  <p className="text-xs text-slate-500">Lo cargás una vez y se cuenta solo cada mes (el mismo día), hasta que lo termines.</p>
                  <label htmlFor="fin-hasta" className="mt-2 block text-xs font-bold text-slate-600">Termina el (opcional)</label>
                  <input id="fin-hasta" type="date" value={hasta} min={date} onChange={(e) => setHasta(e.target.value)} className={`${campo} mt-1`} />
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="fin-metodo" className={etiqueta}>Medio de pago (opcional)</label>
              <select id="fin-metodo" value={metodo} onChange={(e) => setMetodo(e.target.value)} className={`${campo} mt-1.5`}>
                <option value="">Sin indicar</option>
                {METODOS_PAGO.map((m) => <option key={m} value={m}>{METODO_LABEL[m]}</option>)}
              </select>
            </div>
            {rol === 'profesional' && CON_OBRA.includes(type) && (
              <div>
                <label htmlFor="fin-obra" className={etiqueta}>¿Es de una obra? (opcional)</label>
                <select id="fin-obra" value={obra} onChange={(e) => setObra(e.target.value)} className={`${campo} mt-1.5`}>
                  <option value="">No es de una obra en particular</option>
                  {obras.map((o) => <option key={o.id} value={o.id}>{o.title}</option>)}
                </select>
              </div>
            )}
          </div>

          <div>
            <p className={etiqueta}>Foto del comprobante (opcional)</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              {foto ? (
                <>
                  <a href={foto} target="_blank" rel="noreferrer" className="text-sm font-bold text-[#1D63B8] underline">Ver comprobante</a>
                  <button type="button" onClick={() => setFoto('')} className="homy-focus inline-flex min-h-[44px] items-center gap-1 rounded-xl px-3 text-sm font-bold text-slate-500 hover:text-red-600">
                    <X className="size-4" aria-hidden /> Quitar
                  </button>
                </>
              ) : (
                <button type="button" disabled={subiendo} onClick={() => fileRef.current?.click()}
                  className="homy-glass-soft homy-focus inline-flex min-h-[44px] items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-[#1D63B8] disabled:opacity-60">
                  {subiendo ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Camera className="size-4" aria-hidden />} {subiendo ? 'Subiendo…' : 'Subir foto'}
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={(e) => void subir(e.target.files)} />
            </div>
            <p className="mt-1 text-xs text-slate-500">La foto se guarda con un link: no aparece en ningún listado, pero quien tenga el link la puede ver. No subas datos que no quieras compartir.</p>
          </div>

          {confirmarBorrar && <p role="alert" className="rounded-xl bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">¿Seguro? Se deja de contar en todos tus números. Tocá "Sí, borrarlo" para confirmar.</p>}
          {error && <p role="alert" className="rounded-xl bg-red-50 px-3 py-2 text-sm font-semibold text-red-700">{error}</p>}

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <button type="submit" disabled={guardando || subiendo} className="homy-btn-primary min-h-[48px] flex-1 px-5 text-[15px] disabled:opacity-60">
              {guardando ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Guardando…</> : editando ? 'Guardar cambios' : 'Cargar'}
            </button>
            {editando && inicial.recurring === 'mensual' && !inicial.recurringUntil && (
              <button type="button" disabled={guardando} onClick={() => void guardar({ recurringUntil: hoyStr })}
                className="homy-glass-soft homy-focus inline-flex min-h-[48px] items-center gap-1.5 rounded-xl px-4 text-sm font-bold text-[#0A2540]">
                <CalendarX className="size-4" aria-hidden /> Terminar hoy
              </button>
            )}
            {editando && (
              <button type="button" disabled={guardando} onClick={() => void borrar()}
                className="homy-focus inline-flex min-h-[48px] items-center gap-1.5 rounded-xl border border-red-200 px-4 text-sm font-bold text-red-600 hover:bg-red-50">
                <Trash2 className="size-4" aria-hidden /> {confirmarBorrar ? 'Sí, borrarlo' : 'Borrar'}
              </button>
            )}
          </div>
        </form>
      </DialogContent>
    </Dialog>
  )
}
