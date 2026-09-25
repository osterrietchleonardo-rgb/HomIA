'use client'
// Bandeja de sugerencias del administrador (D25) — /admin/sugerencias (área /admin, D29).
// Solo para emails de ADMIN_EMAILS: la API responde 404 a cualquier otro y esta pantalla
// muestra "Esta página no existe". Filtros por estado, tipo, rol y sección + búsqueda;
// detalle con fotos (URL firmada de 10 min), datos del autor, cambio de estado y respuesta.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { navigate, useRoute } from '@/lib/router'
import { Loading, EmptyState } from '@/components/app/ui-bits'
import { formatDate } from '@/lib/format'
import { toast } from 'sonner'
import { AREAS, ESTADOS, TIPOS, ROLES_FEEDBACK } from '@/lib/feedback'
import { EstadoPill, FotosPrivadas, TIPO_ICONO, TIPO_TONO, type FeedbackItem } from './sugerencias'
import {
  ArrowLeft, Compass, Inbox, Loader2, Mail, MessageSquareMore, Search, Send, UserRound, Info, RotateCcw,
} from 'lucide-react'

type AdminItem = FeedbackItem & { author: { id: string; name: string; email: string | null; deleted: boolean } }
type Filtros = { status: string; type: string; role: string; area: string; q: string }
const VACIO: Filtros = { status: '', type: '', role: '', area: '', q: '' }

const selectCls = 'homy-glass-input homy-focus min-h-[44px] w-full min-w-0 rounded-xl px-3 text-[13.5px] font-semibold text-[#0A2540]'

export default function AdminSugerenciasScreen() {
  const { query } = useRoute()
  const [filtros, setFiltros] = useState<Filtros>(VACIO)
  const [qDebounced, setQDebounced] = useState('')
  const [items, setItems] = useState<AdminItem[] | null>(null)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [noExiste, setNoExiste] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const seleccion = query.id || ''

  useEffect(() => {
    const t = setTimeout(() => setQDebounced(filtros.q.trim()), 300)
    return () => clearTimeout(t)
  }, [filtros.q])

  const sp = new URLSearchParams()
  for (const k of ['status', 'type', 'role', 'area'] as const) if (filtros[k]) sp.set(k, filtros[k])
  if (qDebounced) sp.set('q', qDebounced)
  const qs = sp.toString()

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/admin/feedback?${qs}`)
      if (res.status === 404) { setNoExiste(true); return }
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { setError(d.error || 'No pudimos cargar la bandeja'); return }
      setError(null)
      setItems(d.items)
      setCounts(d.counts || {})
    } catch {
      setError('No pudimos conectarnos. Revisá tu conexión y probá de nuevo.')
    }
  }, [qs])
  // carga asíncrona (el setState ocurre después del fetch), igual que en devoluciones.tsx
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load() }, [load])

  const actual = useMemo(() => items?.find((i) => i.id === seleccion) || null, [items, seleccion])
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const set = (k: keyof Filtros, v: string) => setFiltros((f) => ({ ...f, [k]: v }))
  const abrir = (id: string) => navigate(`/admin/sugerencias${id ? `?id=${encodeURIComponent(id)}` : ''}`)

  if (noExiste) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center px-4 py-16 text-center">
        <div className="homy-glass w-full max-w-md rounded-3xl px-8 py-10">
          <span className="homy-empty-icon homy-chip-navy mx-auto"><Compass className="size-7" aria-hidden /></span>
          <p className="homy-eyebrow">Error 404</p>
          <h1 className="mt-2 text-2xl font-extrabold tracking-tight text-navy">Esta página no existe</h1>
          <button onClick={() => navigate('/panel')} className="homy-btn-dark mt-7 px-6 py-3.5 text-[15px]">
            <ArrowLeft className="size-4.5" aria-hidden /> Volver al panel
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="homy-page">
      <header className="homy-page-head">
        <div className="min-w-0">
          <span className="homy-eyebrow">Administración</span>
          <h1 className="homy-page-title mt-1.5">Bandeja de sugerencias</h1>
          <p className="homy-page-sub">Al responder o cambiar el estado, le avisamos al autor.</p>
        </div>
      </header>

      {/* estados: tocás uno y filtra */}
      <div className="-mx-1 mb-3 flex gap-2 overflow-x-auto px-1 pb-1" role="group" aria-label="Filtrar por estado">
        <button type="button" className="homy-tab" aria-pressed={filtros.status === ''} onClick={() => set('status', '')}>Todas · {total}</button>
        {ESTADOS.map((e) => (
          <button key={e.id} type="button" className="homy-tab" aria-pressed={filtros.status === e.id} onClick={() => set('status', filtros.status === e.id ? '' : e.id)}>
            {e.label} · {counts[e.id] || 0}
          </button>
        ))}
      </div>

      <div className="homy-glass mb-4 rounded-2xl p-3 sm:p-4">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
          <input
            value={filtros.q} onChange={(e) => set('q', e.target.value)} placeholder="Buscar en títulos y descripciones…"
            aria-label="Buscar" className="homy-glass-input homy-focus min-h-[44px] w-full rounded-xl pl-9 pr-3 text-[14px] text-[#0A2540] placeholder:text-slate-400"
          />
        </div>
        <div className="mt-2.5 grid grid-cols-2 gap-2 sm:grid-cols-3">
          <select aria-label="Tipo" value={filtros.type} onChange={(e) => set('type', e.target.value)} className={selectCls}>
            <option value="">Todos los tipos</option>
            {TIPOS.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <select aria-label="Rol" value={filtros.role} onChange={(e) => set('role', e.target.value)} className={selectCls}>
            <option value="">Todos los roles</option>
            {ROLES_FEEDBACK.map((r) => <option key={r} value={r}>{r[0].toUpperCase() + r.slice(1)}</option>)}
          </select>
          <select aria-label="Sección" value={filtros.area} onChange={(e) => set('area', e.target.value)} className={`${selectCls} col-span-2 sm:col-span-1`}>
            <option value="">Todas las secciones</option>
            {AREAS.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
          </select>
        </div>
        {(filtros.type || filtros.role || filtros.area || filtros.q || filtros.status) && (
          <button type="button" onClick={() => setFiltros(VACIO)} className="homy-focus mt-2 inline-flex min-h-[36px] items-center gap-1.5 text-[13px] font-bold text-[#1D63B8]">
            <RotateCcw className="size-3.5" aria-hidden /> Limpiar filtros
          </button>
        )}
      </div>

      {error ? (
        <div className="homy-glass rounded-2xl p-4 text-sm text-red-700">{error} <button type="button" onClick={() => void load()} className="font-bold underline">Reintentar</button></div>
      ) : items === null ? (
        <Loading text="Cargando la bandeja…" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-start">
          {/* lista (en el celu se oculta mientras se ve un detalle) */}
          <div className={actual ? 'hidden lg:block' : ''}>
            {items.length === 0 ? (
              <EmptyState icon={<Inbox />} title="No hay envíos con esos filtros" hint="Probá con otros filtros o limpiá la búsqueda." />
            ) : (
              <ul className="space-y-2.5" aria-label="Envíos">
                {items.map((it) => {
                  const Icono = TIPO_ICONO[it.type] || MessageSquareMore
                  const activo = it.id === seleccion
                  return (
                    <li key={it.id}>
                      <button type="button" onClick={() => abrir(it.id)} aria-current={activo ? 'true' : undefined}
                        className={`homy-glass homy-focus flex w-full items-start gap-3 rounded-2xl p-3.5 text-left transition hover:bg-white/80 ${activo ? 'ring-2 ring-[#1D63B8]/60' : ''}`}>
                        <span className={`homy-icon-chip size-9 shrink-0 [&_svg]:size-[18px] ${TIPO_TONO[it.type] || 'homy-chip-navy'}`} aria-hidden><Icono /></span>
                        <span className="min-w-0 flex-1">
                          <span className="block text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{it.typeLabel} · {it.role} · {it.areaLabel}</span>
                          <span className="mt-0.5 block break-words text-[14.5px] font-extrabold leading-snug text-[#0A2540]">{it.title}</span>
                          <span className="mt-0.5 block text-xs text-slate-500">{it.author.name} · {formatDate(it.createdAt)}{it.photos.length ? ` · ${it.photos.length} foto${it.photos.length > 1 ? 's' : ''}` : ''}</span>
                        </span>
                        <EstadoPill status={it.status} label={it.statusLabel} />
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          {/* detalle */}
          {actual ? (
            <Detalle key={actual.id} it={actual} onVolver={() => abrir('')} onGuardado={load} />
          ) : seleccion && items.length > 0 ? (
            <div className="homy-glass rounded-2xl p-4 text-sm text-slate-600">
              Ese envío no está en la lista con estos filtros.{' '}
              <button type="button" onClick={() => setFiltros(VACIO)} className="font-bold text-[#1D63B8] underline">Limpiar filtros</button>
            </div>
          ) : (
            <div className="hidden lg:block">
              <EmptyState icon={<Inbox />} title="Elegí un envío" hint="Tocá uno de la lista para ver el detalle, las fotos y responder." />
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function Detalle({ it, onVolver, onGuardado }: { it: AdminItem; onVolver: () => void; onGuardado: () => Promise<void> }) {
  const [status, setStatus] = useState(it.status)
  const [respuesta, setRespuesta] = useState(it.adminResponse || '')
  const [guardando, setGuardando] = useState(false)
  const cambios = status !== it.status || respuesta.trim() !== (it.adminResponse || '')
  const Icono = TIPO_ICONO[it.type] || MessageSquareMore

  async function guardar() {
    setGuardando(true)
    try {
      const res = await fetch(`/api/admin/feedback/${it.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, adminResponse: respuesta }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) { toast.error(d.error || 'No se pudo guardar'); return }
      toast.success(d.changed ? 'Guardado. Le avisamos al autor.' : 'No había cambios para guardar')
      await onGuardado()
    } catch {
      toast.error('No pudimos conectarnos. Probá de nuevo.')
    } finally { setGuardando(false) }
  }

  const ctx = it.context
  return (
    <article className="homy-glass rounded-3xl p-4 sm:p-6 lg:sticky lg:top-4" aria-label="Detalle del envío">
      <button type="button" onClick={onVolver} className="homy-focus -ml-1 mb-2 inline-flex min-h-[40px] items-center gap-1.5 rounded-full px-2 text-[13px] font-bold text-[#1D63B8] lg:hidden">
        <ArrowLeft className="size-4" aria-hidden /> Volver a la bandeja
      </button>
      <div className="flex items-start gap-3">
        <span className={`homy-icon-chip size-11 shrink-0 [&_svg]:size-5 ${TIPO_TONO[it.type] || 'homy-chip-navy'}`} aria-hidden><Icono /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-slate-400">{it.typeLabel} · {it.areaLabel}</p>
          <h2 className="mt-0.5 break-words text-lg font-extrabold leading-snug text-[#0A2540]">{it.title}</h2>
          <p className="mt-0.5 text-xs text-slate-500">Recibida el {formatDate(it.createdAt)}</p>
        </div>
        <EstadoPill status={it.status} label={it.statusLabel} />
      </div>

      <div className="mt-4 rounded-2xl bg-white/60 p-3.5 ring-1 ring-[#0A2540]/8">
        <p className="flex items-center gap-1.5 text-[12px] font-extrabold uppercase tracking-wider text-slate-400"><UserRound className="size-3.5" aria-hidden /> Autor</p>
        <p className="mt-1 break-words text-sm font-bold text-[#0A2540]">{it.author.name} <span className="font-semibold capitalize text-slate-500">· {it.role}</span></p>
        {it.author.deleted ? (
          <p className="mt-0.5 text-[13px] text-slate-500">La cuenta se eliminó.</p>
        ) : it.author.email ? (
          <a href={`mailto:${it.author.email}?subject=${encodeURIComponent(`Tu sugerencia en HomIA: ${it.title}`)}`} className="mt-0.5 inline-flex min-h-[32px] items-center gap-1.5 break-all text-[13px] font-semibold text-[#1D63B8] underline">
            <Mail className="size-3.5 shrink-0" aria-hidden />{it.author.email}
          </a>
        ) : (
          <p className="mt-0.5 text-[13px] text-slate-500">Prefiere que no lo contacten por mail (respondé acá).</p>
        )}
      </div>

      <p className="mt-4 whitespace-pre-line break-words text-[14.5px] leading-relaxed text-slate-700">{it.description}</p>
      <FotosPrivadas photos={it.photos} />
      {it.photos.length > 0 && <p className="mt-1.5 text-[11.5px] text-slate-400">Los links de las fotos vencen a los 10 minutos: si no abren, recargá la bandeja.</p>}

      {ctx && (
        <div className="mt-4 rounded-2xl border border-[#1D63B8]/15 bg-[#1D63B8]/5 p-3.5">
          <p className="flex items-center gap-1.5 text-[13px] font-extrabold text-[#0A2540]"><Info className="size-4 text-[#1D63B8]" aria-hidden /> Contexto técnico</p>
          <dl className="mt-1.5 grid gap-1 text-[12.5px]">
            {([['Pantalla', ctx.pantalla], ['Dispositivo', ctx.dispositivo], ['Fecha (del usuario)', ctx.fecha], ['Zona horaria', ctx.zonaHoraria], ['Navegador', ctx.navegador]] as const)
              .filter(([, v]) => !!v)
              .map(([k, v]) => (
                <div key={k} className="flex flex-wrap gap-x-1.5">
                  <dt className="font-bold text-slate-600">{k}:</dt>
                  <dd className="min-w-0 break-all text-slate-700">{v}</dd>
                </div>
              ))}
          </dl>
        </div>
      )}

      <div className="mt-5 border-t border-[#0A2540]/8 pt-4">
        <label htmlFor="adm-estado" className="text-sm font-extrabold text-[#0A2540]">Estado</label>
        <select id="adm-estado" value={status} onChange={(e) => setStatus(e.target.value)} className={`${selectCls} mt-1.5`}>
          {ESTADOS.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}
        </select>
        <p className="mt-1 text-[12.5px] text-slate-500">{ESTADOS.find((e) => e.id === status)?.ayuda}</p>
        <label htmlFor="adm-resp" className="mt-4 block text-sm font-extrabold text-[#0A2540]">Respuesta al usuario</label>
        <p className="mt-0.5 text-[12.5px] text-slate-500">La ve en «Mis envíos» y le llega por notificación y mail.</p>
        <textarea id="adm-resp" value={respuesta} onChange={(e) => setRespuesta(e.target.value)} rows={4} maxLength={4000}
          placeholder="Ej.: ¡Gracias! Lo sumamos a los planes del próximo mes."
          className="homy-glass-input homy-focus mt-1.5 w-full resize-y rounded-xl px-3.5 py-3 text-[14.5px] leading-relaxed text-[#0A2540] placeholder:text-slate-400" />
        {it.respondedAt && <p className="mt-1 text-[11.5px] text-slate-400">Última respuesta: {formatDate(it.respondedAt)}</p>}
        <button type="button" onClick={() => void guardar()} disabled={!cambios || guardando}
          className="homy-btn-primary homy-focus mt-3 min-h-[48px] w-full justify-center px-6 text-sm disabled:opacity-50 sm:w-auto">
          {guardando ? <><Loader2 className="size-4 animate-spin" aria-hidden /> Guardando…</> : <><Send className="size-4" aria-hidden /> Guardar y avisar</>}
        </button>
      </div>
    </article>
  )
}
