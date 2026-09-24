'use client'
// Tarjetas de resultados del súper agente Homy. Los datos los arma el SERVIDOR
// con lo que devolvieron las herramientas (el modelo solo elige cuáles mostrar):
// precios, nombres, badges y links son reales.
import { ArrowRight, BadgeCheck, Briefcase, HardHat, MapPin, Package, ShieldAlert, ShoppingCart, Sparkles, Star, Store } from 'lucide-react'
import { formatARS } from '@/lib/format'
import { navigate } from '@/lib/router'
import type { Accion, Tarjeta } from '@/lib/homy/tipos'

const km = (d: number | null) => (d == null ? null : d < 1 ? `${Math.round(d * 1000)} m` : `${d.toFixed(1)} km`)

function Verificacion({ ok }: { ok: boolean }) {
  return ok ? (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#0e9f6e]/10 px-1.5 py-0.5 text-[10px] font-extrabold text-[#0e9f6e]">
      <BadgeCheck className="size-3" aria-hidden /> Verificado
    </span>
  ) : (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-slate-500/10 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">
      <ShieldAlert className="size-3" aria-hidden /> No verificado
    </span>
  )
}

function Recomendado() {
  return (
    <span className="inline-flex items-center gap-0.5 rounded-full bg-[#FF5A1F]/10 px-1.5 py-0.5 text-[10px] font-extrabold text-[#FF5A1F]">
      <Sparkles className="size-3" aria-hidden /> Recomendado
    </span>
  )
}

function Estrellas({ rating, resenas }: { rating: number; resenas: number }) {
  return (
    <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-[#B98A00]">
      <Star className="size-3 fill-[#FFC700] text-[#FFC700]" aria-hidden />
      {resenas > 0 ? `${rating.toFixed(1)} (${resenas})` : 'sin reseñas'}
    </span>
  )
}

const caja = 'homy-glass-soft rounded-2xl p-3 text-left'
const boton =
  'homy-focus inline-flex min-h-[36px] items-center justify-center gap-1 rounded-full px-3 text-[12px] font-extrabold transition active:scale-[0.97]'

export function TarjetaHomy({ t, onNavegar }: { t: Tarjeta; onNavegar?: () => void }) {
  const ir = (href: string) => { onNavegar?.(); navigate(href) }

  if (t.tipo === 'material') {
    return (
      <div className={caja} data-homy-card="material">
        <div className="flex items-start gap-2.5">
          <span className="homy-icon-chip homy-chip-mint size-8 shrink-0 [&_svg]:size-4" aria-hidden><Package /></span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-extrabold leading-snug text-[#0A2540]">
              {t.nombre}{t.marca ? <span className="font-semibold text-slate-500"> · {t.marca}</span> : null}
            </p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-slate-500">
              <Store className="size-3 shrink-0" aria-hidden />
              <span className="font-semibold text-slate-600">{t.proveedor}</span>
              {t.recomendado && <Recomendado />}
              <Verificacion ok={t.verificado} />
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span className="text-[15px] font-extrabold tabular-nums text-[#0A2540]">{formatARS(t.precio)}</span>
              <span className="text-[11px] font-semibold text-slate-500">por {t.unidad}</span>
              <Estrellas rating={t.rating} resenas={t.resenas} />
              {km(t.distanciaKm) && <span className="inline-flex items-center gap-0.5 text-[11px] text-slate-500"><MapPin className="size-3" aria-hidden />{km(t.distanciaKm)}</span>}
            </p>
            {!t.aceptaMercadoPago && <p className="mt-1 text-[11px] font-semibold text-slate-500">Con este proveedor se paga en efectivo.</p>}
            {t.estadoStock === 'por_agotar' && <p className="mt-0.5 text-[11px] font-semibold text-[#B45309]">Quedan pocas unidades.</p>}
          </div>
        </div>
        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <button type="button" onClick={() => ir(t.hrefCarrito)} className={`${boton} bg-[#FF5A1F] text-white hover:brightness-110`}>
            <ShoppingCart className="size-3.5" aria-hidden /> {t.hrefCarrito.startsWith('/registrarse') ? 'Crear cuenta y comprar' : 'Agregar al carrito'}
          </button>
          <button type="button" onClick={() => ir(t.hrefProveedor)} className={`${boton} bg-[#1D63B8]/10 text-[#1D63B8] hover:bg-[#1D63B8] hover:text-white`}>
            Ver proveedor
          </button>
        </div>
      </div>
    )
  }

  if (t.tipo === 'elemento') {
    return (
      <div className={caja} data-homy-card="elemento">
        <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-[#0A2540]">
          <Sparkles className="size-3.5 shrink-0 text-[#0092c4]" aria-hidden /> {t.nombre}
        </p>
        <p className="mt-1 text-[12px] leading-relaxed text-slate-600"><span className="font-bold">Para qué sirve: </span>{t.paraQueSirve}</p>
        <p className="mt-1 text-[11px] font-semibold text-slate-500">
          Se vende por {t.unidad} · {t.conStock > 0 ? `lo tiene${t.conStock === 1 ? '' : 'n'} ${t.conStock} proveedor${t.conStock === 1 ? '' : 'es'} en HomIA` : 'hoy sin stock en HomIA'}
        </p>
      </div>
    )
  }

  if (t.tipo === 'profesional') {
    return (
      <button type="button" onClick={() => ir(t.href)} className={`${caja} homy-focus block w-full transition hover:bg-white`} data-homy-card="profesional">
        <span className="flex items-start gap-2.5">
          <span className="homy-icon-chip homy-chip-blue size-8 shrink-0 [&_svg]:size-4" aria-hidden><HardHat /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-extrabold leading-snug text-[#0A2540]">{t.nombre}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-slate-500">
              <Verificacion ok={t.verificado} />
              <Estrellas rating={t.rating} resenas={t.resenas} />
              {t.obras > 0 && <span>{t.obras} obra{t.obras === 1 ? '' : 's'}</span>}
              {km(t.distanciaKm) && <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" aria-hidden />{km(t.distanciaKm)}</span>}
            </span>
            {t.rubros.length > 0 && <span className="mt-0.5 block truncate text-[11px] capitalize text-slate-500">{t.rubros.join(' · ')}</span>}
          </span>
          <ArrowRight className="mt-1 size-4 shrink-0 text-slate-300" aria-hidden />
        </span>
      </button>
    )
  }

  if (t.tipo === 'proveedor') {
    return (
      <button type="button" onClick={() => ir(t.href)} className={`${caja} homy-focus block w-full transition hover:bg-white`} data-homy-card="proveedor">
        <span className="flex items-start gap-2.5">
          <span className="homy-icon-chip homy-chip-ai size-8 shrink-0 [&_svg]:size-4" aria-hidden><Store /></span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-extrabold text-[#0A2540]">{t.nombre}</span>
            <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11.5px] text-slate-500">
              {t.recomendado && <Recomendado />}
              <Verificacion ok={t.verificado} />
              <Estrellas rating={t.rating} resenas={t.resenas} />
              {km(t.distanciaKm) && <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" aria-hidden />{km(t.distanciaKm)}</span>}
            </span>
          </span>
          <ArrowRight className="mt-1 size-4 shrink-0 text-slate-300" aria-hidden />
        </span>
      </button>
    )
  }

  // trabajo
  return (
    <button type="button" onClick={() => ir(t.href)} className={`${caja} homy-focus block w-full transition hover:bg-white`} data-homy-card="trabajo">
      <span className="flex items-start gap-2.5">
        <span className="homy-icon-chip homy-chip-orange size-8 shrink-0 [&_svg]:size-4" aria-hidden><Briefcase /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13px] font-extrabold leading-snug text-[#0A2540]">{t.titulo}</span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11.5px] text-slate-500">
            <span className="capitalize">{t.rubro}</span>
            <span className="capitalize">urgencia {t.urgencia}</span>
            {t.ciudad && <span>{t.ciudad}</span>}
            {km(t.distanciaKm) && <span className="inline-flex items-center gap-0.5"><MapPin className="size-3" aria-hidden />{km(t.distanciaKm)}</span>}
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[12px]">
            <span className="font-extrabold tabular-nums text-[#0A2540]">
              {t.presupuestoMin || t.presupuestoMax
                ? `${formatARS(t.presupuestoMin ?? t.presupuestoMax)}${t.presupuestoMax && t.presupuestoMin && t.presupuestoMax !== t.presupuestoMin ? ` a ${formatARS(t.presupuestoMax)}` : ''}`
                : 'A presupuestar'}
            </span>
            <span className="text-[11px] text-slate-500">{t.presupuestos} presupuesto{t.presupuestos === 1 ? '' : 's'}</span>
          </span>
        </span>
        <ArrowRight className="mt-1 size-4 shrink-0 text-slate-300" aria-hidden />
      </span>
    </button>
  )
}

export function TarjetasHomy({ tarjetas, max = 6, onNavegar }: { tarjetas: Tarjeta[]; max?: number; onNavegar?: () => void }) {
  if (!tarjetas.length) return null
  return (
    <div className="mt-3 grid gap-2">
      {tarjetas.slice(0, max).map((t) => <TarjetaHomy key={`${t.tipo}:${t.id}`} t={t} onNavegar={onNavegar} />)}
    </div>
  )
}

export function AccionesHomy({ acciones, onNavegar }: { acciones: Accion[]; onNavegar?: () => void }) {
  if (!acciones.length) return null
  return (
    <div className="mt-3 flex flex-wrap gap-1.5">
      {acciones.map((a, i) => (
        <button
          key={`${a.href}-${i}`}
          type="button"
          onClick={() => { onNavegar?.(); navigate(a.href) }}
          className={`${boton} ${i === 0 ? 'bg-[#0A2540] text-white hover:bg-[#1D63B8]' : 'border border-[#1D63B8]/25 bg-white/80 text-[#1D63B8] hover:border-[#1D63B8]'}`}
        >
          {a.etiqueta} <ArrowRight className="size-3.5" aria-hidden />
        </button>
      ))}
    </div>
  )
}
