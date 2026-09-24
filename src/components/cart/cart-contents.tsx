'use client'
// Contenido del carrito — lo comparten el panel lateral/inferior (CartSheet) y la
// pantalla /carrito. Ítems AGRUPADOS POR PROVEEDOR con cantidad editable (paso según
// la unidad, tope en el stock), subtotal por proveedor, total general y el cargo de
// servicio HomIA (1%) que se suma SOLO si pagás con Mercado Pago. Al confirmar, cada
// producto va como COMPRA (con stock: sin aprobación, se paga enseguida) o RESERVA (la
// aprueba el proveedor; lo sin stock solo se reserva) — D15. Se crea un pedido con un
// sub-pedido por proveedor y tipo; el visitante primero crea su cuenta o ingresa.
import { useEffect, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { useSession } from '@/lib/store'
import { useCart, readModePrefs, type CartLine, type CartGroup, type LineMode } from '@/lib/cart'
import { formatARS, formatARSCents } from '@/lib/format'
import { SERVICE_FEE_LABEL } from '@/lib/fees'
import { UAvatar, Loading } from '@/components/app/ui-bits'
import { toast } from 'sonner'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import {
  ShoppingCart, Minus, Plus, Trash2, AlertTriangle, Store, Wallet, Banknote, Clock, ShoppingBag,
  ArrowLeft, Send, Loader2, Package, UserPlus, LogIn,
} from 'lucide-react'

type Step = 'lista' | 'confirmar'

/** Panel del comprador para las rutas de pedidos (cliente, o profesional si no es cliente). */
export function useBuyerPanel(): 'cliente' | 'profesional' {
  const route = useRoute()
  const { user } = useSession()
  const inPanel = route.segments[0] === 'panel' ? route.segments[1] : null
  if (inPanel === 'cliente' || inPanel === 'profesional') return inPanel
  return user?.roles.includes('cliente') ? 'cliente' : 'profesional'
}

export default function CartContents({ variant, onDone }: { variant: 'sheet' | 'page'; onDone?: () => void }) {
  const { mode, view, loading, local, setQty, remove, clear, refresh } = useCart()
  const { user } = useSession()
  const panel = useBuyerPanel()
  const [step, setStep] = useState<Step>('lista')
  // elección por producto (stockId): lo sin stock siempre es reserva
  const [types, setTypes] = useState<Record<string, LineMode>>({})
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [askClear, setAskClear] = useState(false)

  // al abrir, datos frescos (precio y stock pueden haber cambiado)
  useEffect(() => { void refresh() }, [refresh])

  if (mode === 'sin_carrito') {
    return (
      <Empty
        title="El carrito es para clientes y profesionales"
        hint="Con tu cuenta de proveedor vendés: tus ventas están en Cobros → Ventas."
        action={null}
      />
    )
  }
  if (!view && loading) return <div className="py-10"><Loading text="Cargando tu carrito…" /></div>

  const groups = view?.groups || []
  const orphans = view?.orphans || []
  const empty = groups.length === 0 && orphans.length === 0

  if (empty) {
    return (
      <Empty
        title="Tu carrito está vacío"
        hint="Buscá materiales y tocá «Agregar al carrito». Podés sumar productos de varios proveedores y confirmarlos juntos."
        action={
          <button
            onClick={() => { onDone?.(); navigate(user ? `/panel/${panel}/materiales` : '/materiales') }}
            className="homy-btn-primary min-h-[44px] px-5 text-sm"
          >
            <Package className="size-4" aria-hidden /> Buscar materiales
          </button>
        }
      />
    )
  }

  async function confirmar() {
    setBusy(true)
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lineTypes: resolvedTypes(groups, types), note: note.trim() || undefined }),
      })
      const d = (await res.json().catch(() => ({}))) as { error?: string; order?: { id: string; number: string }; purchases?: { type: string }[] }
      if (!res.ok || !d.order) {
        toast.error(d.error || 'No pudimos confirmar el pedido')
        void refresh()
        setStep('lista')
        return
      }
      const compras = (d.purchases || []).filter((p) => p.type === 'compra').length
      const reservas = (d.purchases || []).length - compras
      toast.success(`Pedido ${d.order.number} confirmado`, {
        description: compras && reservas ? 'Pagá tus compras en las próximas 24 h; las reservas las aprueba cada proveedor.'
          : compras ? 'Stock reservado: pagá en las próximas 24 h (Mercado Pago o elegí efectivo al retirar).'
            : 'Cada proveedor aprueba su reserva y te avisamos.',
      })
      await refresh()
      setStep('lista')
      setNote('')
      onDone?.()
      navigate(`/panel/${panel}/pedidos/${d.order.id}`)
    } catch {
      toast.error('No pudimos conectar. Reintentá')
    } finally {
      setBusy(false)
    }
  }

  async function doClear() {
    const r = await clear()
    setAskClear(false)
    if (!r.ok) toast.error(r.error)
    else toast.info('Vaciaste el carrito')
  }

  const blocked = !!view?.blocked
  const providers = groups.length

  return (
    <div className={variant === 'page' ? 'space-y-4' : 'flex min-h-0 flex-1 flex-col'}>
      <div className={variant === 'sheet' ? 'min-h-0 flex-1 space-y-3 overflow-y-auto px-4 pb-3' : 'space-y-3'}>
        {step === 'lista' ? (
          <>
            {groups.map((g) => (
              <ProviderGroup key={g.provider.id} g={g} onQty={setQty} onRemove={remove} />
            ))}
            {orphans.length > 0 && (
              <section className="homy-glass-soft rounded-2xl p-3.5" aria-label="Productos que ya no están disponibles">
                <p className="text-[12px] font-extrabold uppercase tracking-wider text-red-600">Ya no disponibles</p>
                <ul className="mt-2 space-y-2">
                  {orphans.map((o) => (
                    <li key={o.stockId} className="flex items-center justify-between gap-2 text-[13px]">
                      <span className="min-w-0 text-slate-600">
                        {local.find((l) => l.stockId === o.stockId)?.name || 'Producto'} · {o.problemText}
                      </span>
                      <RemoveBtn onClick={() => remove(o.stockId)} label="Sacar del carrito" />
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </>
        ) : (
          <ConfirmStep groups={groups} types={types} setTypes={setTypes} note={note} setNote={setNote} />
        )}
      </div>

      {/* resumen y acciones */}
      <div className={variant === 'sheet' ? 'shrink-0 border-t border-[#0A2540]/10 bg-white px-4 pb-4 pt-3' : 'homy-glass rounded-3xl p-4'}>
        <dl className="space-y-1 text-[13px]">
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Total ({providers} proveedor{providers === 1 ? '' : 'es'})</dt>
            <dd className="homy-num-adapt font-extrabold text-[#0A2540] tabular-nums">{formatARS(view?.subtotal ?? 0)}</dd>
          </div>
          <div className="flex items-start justify-between gap-3">
            <dt className="min-w-0 text-slate-500">{SERVICE_FEE_LABEL} — solo si pagás con Mercado Pago</dt>
            <dd className="shrink-0 font-bold text-slate-600 tabular-nums">{formatARSCents(view?.serviceFee ?? 0)}</dd>
          </div>
          <div className="flex items-center justify-between gap-3">
            <dt className="text-slate-500">Total con Mercado Pago</dt>
            <dd className="font-extrabold text-[#1D63B8] tabular-nums">{formatARSCents(view?.totalMp ?? 0)}</dd>
          </div>
          <p className="pt-0.5 text-[11.5px] leading-snug text-slate-400">En efectivo pagás {formatARS(view?.subtotal ?? 0)}, sin cargo. Lo que comprás con stock se paga enseguida; las reservas, cuando el proveedor las aprueba.</p>
        </dl>

        {blocked && step === 'lista' && (
          <p className="mt-2 flex items-start gap-1.5 rounded-xl bg-red-500/8 px-3 py-2 text-[12px] font-semibold text-red-700" role="alert">
            <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Hay productos marcados en rojo: sacalos o ajustá la cantidad para poder confirmar.
          </p>
        )}

        {step === 'lista' ? (
          <div className="mt-3 flex flex-col gap-2">
            <button
              onClick={() => { setTypes((prev) => ({ ...readModePrefs(), ...prev })); setStep('confirmar') }}
              disabled={blocked || loading}
              className="homy-btn-primary min-h-[46px] w-full text-[15px] disabled:opacity-50"
            >
              <ShoppingBag className="size-4" aria-hidden /> Confirmar pedido
            </button>
            <button
              onClick={() => setAskClear(true)}
              className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full text-[13px] font-bold text-slate-500 transition hover:text-red-600"
            >
              <Trash2 className="size-3.5" aria-hidden /> Vaciar carrito
            </button>
          </div>
        ) : mode === 'visitante' ? (
          <div className="mt-3 space-y-2">
            <p className="text-[12.5px] leading-relaxed text-slate-600">
              Para enviar el pedido necesitás una cuenta (es gratis y tarda un minuto). <b>Tu carrito se guarda</b> y lo encontrás al entrar.
            </p>
            <button onClick={() => { onDone?.(); navigate(`/registrarse?volver=${encodeURIComponent('/carrito')}`) }} className="homy-btn-primary min-h-[46px] w-full text-[15px]">
              <UserPlus className="size-4" aria-hidden /> Crear cuenta y confirmar
            </button>
            <button onClick={() => { onDone?.(); navigate(`/ingresar?volver=${encodeURIComponent('/carrito')}`) }} className="homy-btn-dark min-h-[44px] w-full text-sm">
              <LogIn className="size-4" aria-hidden /> Ya tengo cuenta
            </button>
            <BackBtn onClick={() => setStep('lista')} />
          </div>
        ) : (
          <div className="mt-3 flex flex-col gap-2">
            <button onClick={() => void confirmar()} disabled={busy} className="homy-btn-primary min-h-[46px] w-full text-[15px] disabled:opacity-60">
              {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              {busy ? 'Enviando…' : confirmLabel(groups, types)}
            </button>
            <BackBtn onClick={() => setStep('lista')} disabled={busy} />
          </div>
        )}
      </div>

      <AlertDialog open={askClear} onOpenChange={setAskClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Vaciar el carrito?</AlertDialogTitle>
            <AlertDialogDescription>
              Se sacan los {view?.count ?? 0} producto{(view?.count ?? 0) === 1 ? '' : 's'} de tu carrito. No se envía nada a los proveedores.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Volver</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void doClear() }} className="bg-red-600 text-white hover:bg-red-700">
              Sí, vaciar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Empty({ title, hint, action }: { title: string; hint: string; action: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center px-6 py-10 text-center">
      <span className="homy-icon-chip homy-chip-blue size-14"><ShoppingCart className="size-7" aria-hidden /></span>
      <p className="mt-4 text-[17px] font-extrabold text-[#0A2540]">{title}</p>
      <p className="mt-1.5 max-w-xs text-[13.5px] leading-relaxed text-slate-500">{hint}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  )
}

function BackBtn({ onClick, disabled }: { onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className="inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-full text-[13px] font-bold text-slate-500 transition hover:text-[#0A2540] disabled:opacity-50">
      <ArrowLeft className="size-3.5" aria-hidden /> Volver al carrito
    </button>
  )
}

function RemoveBtn({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button onClick={onClick} aria-label={label} title={label} className="grid size-10 shrink-0 place-items-center rounded-full text-slate-400 transition hover:bg-red-50 hover:text-red-600">
      <Trash2 className="size-4" aria-hidden />
    </button>
  )
}

function ProviderGroup({ g, onQty, onRemove }: {
  g: CartGroup
  onQty: (stockId: string, q: number) => Promise<{ ok: true } | { ok: false; error: string }>
  onRemove: (stockId: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  return (
    <section className="homy-glass rounded-2xl p-3.5" aria-label={`Productos de ${g.provider.businessName}`}>
      <header className="flex items-center gap-2.5">
        <UAvatar name={g.provider.businessName} url={g.provider.avatarUrl} size={34} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] font-extrabold text-[#0A2540]" title={g.provider.businessName}>{g.provider.businessName}</p>
          <p className="flex flex-wrap items-center gap-x-2 text-[11.5px] text-slate-500">
            {g.provider.city && <span className="inline-flex items-center gap-1"><Store className="size-3" aria-hidden />{g.provider.city}</span>}
            {g.provider.mpConnected
              ? <span className="inline-flex items-center gap-1 font-semibold text-[#1D63B8]"><Wallet className="size-3" aria-hidden />Mercado Pago o efectivo</span>
              : <span className="inline-flex items-center gap-1 font-semibold text-slate-500"><Banknote className="size-3" aria-hidden />Cobra solo en efectivo</span>}
          </p>
        </div>
      </header>
      <ul className="mt-2.5 divide-y divide-[#0A2540]/8">
        {g.items.map((l) => <LineRow key={`${l.stockId}:${l.quantity}`} l={l} onQty={onQty} onRemove={onRemove} />)}
      </ul>
      <div className="mt-2 flex items-center justify-between border-t border-[#0A2540]/10 pt-2 text-[13px]">
        <span className="font-bold text-slate-500">Subtotal {g.provider.businessName.length > 22 ? 'del proveedor' : g.provider.businessName}</span>
        <span className="homy-num-adapt font-extrabold text-[#0A2540] tabular-nums">{formatARS(g.subtotal)}</span>
      </div>
    </section>
  )
}

function LineRow({ l, onQty, onRemove }: {
  l: CartLine
  onQty: (stockId: string, q: number) => Promise<{ ok: true } | { ok: false; error: string }>
  onRemove: (stockId: string) => Promise<{ ok: true } | { ok: false; error: string }>
}) {
  // el padre remonta la fila (key con la cantidad) cuando cambia la cantidad guardada
  const [draft, setDraft] = useState(String(l.quantity))
  const [busy, setBusy] = useState(false)
  const unit = l.element?.unit || 'unidad'
  // se puede pedir más de lo que hay: lo que no alcanza va como reserva (D15)
  const max = 100000

  async function commit(q: number) {
    if (!Number.isFinite(q) || q <= 0) { setDraft(String(l.quantity)); return }
    const stepped = Math.round(q / l.step) * l.step
    const clamped = Math.min(Math.max(stepped, l.step), Math.max(max, l.step))
    if (clamped !== q) toast.info(`Se vende de a ${l.step} ${unit}`)
    if (clamped === l.quantity) { setDraft(String(l.quantity)); return }
    setBusy(true)
    const r = await onQty(l.stockId, clamped)
    setBusy(false)
    if (!r.ok) { toast.error(r.error); setDraft(String(l.quantity)) }
  }

  return (
    <li className="py-2.5">
      <div className="flex items-start gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="text-[13.5px] font-bold leading-snug text-[#0A2540]">{l.element?.name || 'Producto'}</p>
          <p className="text-[11.5px] text-slate-500">
            {formatARS(l.price)} por {unit}{l.brand ? ` · ${l.brand}` : ''} · stock {l.available}
          </p>
        </div>
        <RemoveBtn onClick={() => { void onRemove(l.stockId).then((r) => { if (!r.ok) toast.error(r.error) }) }} label={`Sacar ${l.element?.name || 'producto'} del carrito`} />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex items-center rounded-full bg-white/70 ring-1 ring-[#0A2540]/12" role="group" aria-label={`Cantidad de ${l.element?.name || 'producto'}`}>
          <button
            onClick={() => void commit(l.quantity - l.step)}
            disabled={busy || l.quantity - l.step < l.step - 1e-9}
            aria-label="Restar"
            className="grid size-10 place-items-center rounded-full text-[#0A2540] transition hover:bg-white disabled:opacity-35"
          >
            <Minus className="size-4" aria-hidden />
          </button>
          <input
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(',', '.'))}
            onBlur={() => void commit(parseFloat(draft))}
            onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
            inputMode="decimal"
            aria-label={`Cantidad (${unit})`}
            className="w-14 bg-transparent text-center text-[14px] font-extrabold text-[#0A2540] tabular-nums outline-none"
          />
          <button
            onClick={() => void commit(l.quantity + l.step)}
            disabled={busy || l.quantity + l.step > max + 1e-9}
            aria-label="Sumar"
            className="grid size-10 place-items-center rounded-full text-[#0A2540] transition hover:bg-white disabled:opacity-35"
          >
            <Plus className="size-4" aria-hidden />
          </button>
        </div>
        <span className="text-[11.5px] text-slate-400">{unit}</span>
        <span className="homy-num-adapt ml-auto text-[14px] font-extrabold text-[#0A2540] tabular-nums">{formatARS(l.lineTotal)}</span>
      </div>
      {l.problem ? (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-red-500/10 px-2.5 py-1.5 text-[12px] font-semibold text-red-700" role="alert">
          <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {l.problemText}
        </p>
      ) : l.stockNote ? (
        <p className="mt-1.5 flex items-start gap-1.5 rounded-lg bg-[#1D63B8]/8 px-2.5 py-1.5 text-[12px] font-semibold text-[#1D63B8]">
          <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {l.stockNote}
        </p>
      ) : null}
    </li>
  )
}

/** Compra o reserva de una línea: lo que no tiene stock suficiente solo se reserva. */
function modeOf(l: CartLine, types: Record<string, LineMode>): LineMode {
  if (!l.inStock) return 'reserva'
  return types[l.stockId] || 'compra'
}

function resolvedTypes(groups: CartGroup[], types: Record<string, LineMode>): Record<string, LineMode> {
  const out: Record<string, LineMode> = {}
  for (const g of groups) for (const l of g.items) out[l.stockId] = modeOf(l, types)
  return out
}

function confirmLabel(groups: CartGroup[], types: Record<string, LineMode>): string {
  let compras = 0
  let reservas = 0
  for (const g of groups) {
    const modes = new Set(g.items.map((l) => modeOf(l, types)))
    if (modes.has('compra')) compras++
    if (modes.has('reserva')) reservas++
  }
  if (compras && !reservas) return compras === 1 ? 'Confirmar compra' : `Confirmar ${compras} compras`
  if (reservas && !compras) return reservas === 1 ? 'Enviar reserva' : `Enviar ${reservas} reservas`
  return `Confirmar ${compras} compra${compras === 1 ? '' : 's'} y ${reservas} reserva${reservas === 1 ? '' : 's'}`
}

function ConfirmStep({ groups, types, setTypes, note, setNote }: {
  groups: CartGroup[]
  types: Record<string, LineMode>
  setTypes: (t: Record<string, LineMode>) => void
  note: string
  setNote: (v: string) => void
}) {
  return (
    <div className="space-y-3">
      <p className="text-[13px] leading-relaxed text-slate-600">
        Elegí qué <b>comprás</b> y qué <b>reservás</b>. Lo que comprás con stock <b>no necesita aprobación</b>: te lo reservamos al confirmar y lo pagás enseguida (Mercado Pago o efectivo al retirar). Lo que reservás lo <b>aprueba el proveedor</b>; lo que no tiene stock solo se puede reservar y el proveedor te avisa cuándo lo tiene.
      </p>
      {groups.map((g) => {
        const compra = g.items.filter((l) => modeOf(l, types) === 'compra')
        const reserva = g.items.filter((l) => modeOf(l, types) === 'reserva')
        const sum = (ls: CartLine[]) => ls.reduce((a, l) => a + l.lineTotal, 0)
        return (
          <section key={g.provider.id} className="homy-glass rounded-2xl p-3.5" aria-label={`Qué comprás y qué reservás a ${g.provider.businessName}`}>
            <p className="text-[14px] font-extrabold text-[#0A2540]">{g.provider.businessName}</p>
            <ul className="mt-2 space-y-2">
              {g.items.map((l) => {
                const m = modeOf(l, types)
                return (
                  <li key={l.stockId} className="rounded-xl bg-white/50 p-2.5 ring-1 ring-[#0A2540]/8">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-2">
                      <span className="min-w-0 flex-[1_1_10rem] text-[13px] font-bold text-[#0A2540]">{l.element?.name || 'Producto'} × {l.quantity}</span>
                      <span className="homy-num-adapt text-[13px] font-extrabold tabular-nums text-[#0A2540]">{formatARS(l.lineTotal)}</span>
                    </div>
                    {l.inStock ? (
                      <div role="radiogroup" aria-label={`Comprar o reservar ${l.element?.name || 'producto'}`} className="mt-2 grid grid-cols-2 gap-1.5">
                        {(['compra', 'reserva'] as const).map((opt) => (
                          <button
                            key={opt}
                            type="button"
                            role="radio"
                            aria-checked={m === opt}
                            onClick={() => setTypes({ ...types, [l.stockId]: opt })}
                            className={`inline-flex min-h-[40px] items-center justify-center gap-1.5 rounded-xl px-2 text-[12.5px] font-extrabold ring-1 transition ${m === opt ? 'bg-[#1D63B8]/10 text-[#0A2540] ring-[#1D63B8]/45' : 'bg-white/60 text-slate-500 ring-[#0A2540]/10 hover:bg-white'}`}
                          >
                            {opt === 'compra' ? <ShoppingBag className="size-3.5 text-[#FF5A1F]" aria-hidden /> : <Clock className="size-3.5 text-[#1D63B8]" aria-hidden />}
                            {opt === 'compra' ? 'Comprar' : 'Reservar'}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="mt-1.5 flex items-start gap-1.5 text-[12px] font-semibold text-[#1D63B8]">
                        <Clock className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {l.stockNote || 'Sin stock: podés reservarlo y el proveedor te avisa'}
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
            <div className="mt-2.5 space-y-1.5">
              {compra.length > 0 && (
                <p className="flex flex-wrap items-center justify-between gap-x-2 rounded-xl bg-[#FF5A1F]/8 px-3 py-2 text-[12.5px]">
                  <span className="font-extrabold text-[#b8410f]"><ShoppingBag className="mr-1 inline size-3.5" aria-hidden />Compra directa · Pagás ahora</span>
                  <span className="homy-num-adapt font-extrabold tabular-nums text-[#0A2540]">{formatARS(sum(compra))}</span>
                  <span className="basis-full text-[11.5px] text-slate-500">Sin aprobación: el stock queda reservado y tenés 24 h para pagar o elegir efectivo (con efectivo, 7 días para retirar).</span>
                </p>
              )}
              {reserva.length > 0 && (
                <p className="flex flex-wrap items-center justify-between gap-x-2 rounded-xl bg-[#1D63B8]/8 px-3 py-2 text-[12.5px]">
                  <span className="font-extrabold text-[#1D63B8]"><Clock className="mr-1 inline size-3.5" aria-hidden />Reserva · El proveedor tiene que aprobarla</span>
                  <span className="homy-num-adapt font-extrabold tabular-nums text-[#0A2540]">{formatARS(sum(reserva))}</span>
                  <span className="basis-full text-[11.5px] text-slate-500">Si tiene stock te lo guarda 48 h; si no, te dice cuándo lo tiene.</span>
                </p>
              )}
            </div>
          </section>
        )
      })}
      <label className="block text-xs font-extrabold uppercase tracking-wider text-slate-400" htmlFor="cart-note">Aclaración para los proveedores (opcional)</label>
      <textarea
        id="cart-note"
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={2}
        maxLength={500}
        placeholder="Cuándo pasás a retirar, marca preferida…"
        className="homy-glass-input w-full rounded-2xl px-4 py-3 text-sm"
      />
      <p className="text-[11.5px] leading-snug text-slate-400">El pedido le llega a cada proveedor por notificación y en el chat (vos iniciás la conversación).</p>
    </div>
  )
}
