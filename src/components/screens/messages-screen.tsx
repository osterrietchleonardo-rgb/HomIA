'use client'
// Mensajes HomIA — bandeja 1:1 estilo chat (burbujas, acuse de lectura,
// separadores por día) con la gramática glass del sistema. Entre CUALQUIER
// par de roles: cliente↔profesional↔proveedor↔cliente.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { navigate, useRoute } from '@/lib/router'
import { useSession } from '@/lib/store'
import { Loading, EmptyState, UAvatar, VerifyBadge } from '@/components/app/ui-bits'
import { ClientSummaryButton } from '@/components/app/client-summary'
import { MessagesSquare, SendHorizonal, ArrowLeft, UserRound, Compass, CheckCheck, Clock3 } from 'lucide-react'

type ConvInfo = {
  id: string; otherUserId: string; otherName: string; otherAvatarUrl: string | null
  otherRoles: string[]; otherVerification?: string; otherProfileHref: string | null
}
type Conv = ConvInfo & {
  lastMessage: { body: string; senderId: string; senderName: string; createdAt: string; mine: boolean } | null
  unread: number; lastMessageAt: string
}
/** `pending`: mensaje optimista que todavía no confirmó el servidor. */
type Msg = { id: string; senderId: string; body: string; readAt: string | null; createdAt: string; pending?: boolean }
/** `partial`: encabezado armado con los datos de la bandeja mientras llegan los mensajes. */
type Thread = { conv: ConvInfo; messages: Msg[]; partial?: boolean }

// Memoria de la bandeja entre montajes (ir a otra pantalla y volver, bandeja ↔ hilo
// en el celular): se muestra al instante lo último que se vio y se revalida en
// segundo plano. Atada al usuario: al cambiar de sesión se descarta.
const memo: { userId: string | null; convs: Conv[] | null; threads: Map<string, Thread> } = {
  userId: null, convs: null, threads: new Map(),
}
function memoFor(userId: string | undefined) {
  if (!userId) return null
  if (memo.userId !== userId) { memo.userId = userId; memo.convs = null; memo.threads = new Map() }
  return memo
}

/** Suma mensajes nuevos al hilo sin duplicar (por id) y quita los optimistas que ya confirmó el servidor. */
function mergeMessages(prev: Msg[], incoming: Msg[], me: string | undefined): Msg[] {
  if (incoming.length === 0) return prev
  const ids = new Set(prev.map((m) => m.id))
  const fresh = incoming.filter((m) => !ids.has(m.id))
  if (fresh.length === 0) {
    // mismos ids: actualizar acuses de lectura que puedan haber cambiado
    const byId = new Map(incoming.map((m) => [m.id, m]))
    return prev.map((m) => (byId.has(m.id) ? { ...m, readAt: byId.get(m.id)!.readAt ?? m.readAt } : m))
  }
  const confirmedBodies = fresh.filter((m) => m.senderId === me).map((m) => m.body)
  const kept = prev.filter((m) => {
    if (!m.pending) return true
    const i = confirmedBodies.indexOf(m.body)
    if (i < 0) return true
    confirmedBodies.splice(i, 1)
    return false
  })
  return [...kept, ...fresh].sort((a, b) => (a.pending === b.pending ? a.createdAt.localeCompare(b.createdAt) : a.pending ? 1 : -1))
}

/** Acuse de lectura: todo lo mío hasta `readUpTo` ya lo leyó el otro. */
function applyReadUpTo(msgs: Msg[], readUpTo: string | null | undefined, me: string | undefined): Msg[] {
  if (!readUpTo) return msgs
  let changed = false
  const out = msgs.map((m) => {
    if (m.senderId === me && !m.readAt && !m.pending && m.createdAt <= readUpTo) { changed = true; return { ...m, readAt: readUpTo } }
    return m
  })
  return changed ? out : msgs
}

const THREAD_POLL_MS = 3000
const INBOX_POLL_MS = 10000

const ROLE_LABEL: Record<string, string> = { cliente: 'Cliente', profesional: 'Profesional', proveedor: 'Proveedor' }

function hhmm(iso: string) {
  return new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' })
}
function dayLabel(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date(Date.now() - 86400000)
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString()
  if (same(d, today)) return 'Hoy'
  if (same(d, yesterday)) return 'Ayer'
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })
}
function listTime(iso: string) {
  const d = new Date(iso)
  const today = new Date()
  if (d.toDateString() === today.toDateString()) return hhmm(iso)
  if (d.getTime() > Date.now() - 6 * 86400000) return d.toLocaleDateString('es-AR', { weekday: 'short' }).replace('.', '')
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'numeric' })
}

export default function MessagesScreen({ embedded = false }: { embedded?: boolean }) {
  const route = useRoute()
  const { user } = useSession()
  const me = user?.id
  const cache = memoFor(me)
  // la bandeja vive en /panel/<rol>/mensajes o en /mensajes: abrir/cerrar un hilo
  // solo cambia ?c= sobre la MISMA ruta (no re-monta el panel ni esta pantalla)
  const base = route.path.endsWith('/mensajes') ? route.path : '/mensajes'
  const c = route.query.c || ''
  const active = c && !c.startsWith('nuevo:') ? c : null

  const [convs, setConvsState] = useState<Conv[] | null>(() => cache?.convs ?? null)
  const [thread, setThreadState] = useState<Thread | null>(() => (active && cache?.threads.get(active)) || null)
  const [draft, setDraft] = useState('')
  const [threadError, setThreadError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<string | null>(active)
  activeRef.current = active
  const inboxBusy = useRef(false)
  const threadBusy = useRef(false)

  // setters que además guardan en la memoria compartida
  const setConvs = useCallback((fn: (prev: Conv[] | null) => Conv[] | null) => {
    setConvsState((prev) => {
      const next = fn(prev)
      if (memo.userId === me) memo.convs = next
      return next
    })
  }, [me])
  const setThread = useCallback((id: string, fn: (prev: Thread | null) => Thread | null) => {
    setThreadState((prev) => {
      const current = prev && prev.conv.id === id ? prev : memo.threads.get(id) || null
      const next = fn(current)
      if (next && memo.userId === me) memo.threads.set(id, next)
      return activeRef.current === id ? next : prev
    })
  }, [me])

  const loadConvs = useCallback(async () => {
    if (inboxBusy.current) return // nunca apilar pedidos
    inboxBusy.current = true
    try {
      const res = await fetch('/api/messages/conversations')
      if (res.ok) {
        const d = await res.json()
        const list = d.conversations as Conv[]
        // el hilo abierto ya está leído aunque el servidor todavía no lo sepa
        setConvs(() => list.map((x) => (x.id === activeRef.current ? { ...x, unread: 0 } : x)))
      } else if (res.status === 401) {
        setConvs((prev) => prev ?? [])
      }
    } catch { /* silencioso: queda la última bandeja */ } finally {
      inboxBusy.current = false
    }
  }, [setConvs])

  /** Trae el hilo: completo la primera vez; después solo lo nuevo (cursor ?after=). */
  const loadThread = useCallback(async (id: string) => {
    if (threadBusy.current) return
    threadBusy.current = true
    try {
      const known = memo.userId === me ? memo.threads.get(id) : undefined
      const lastConfirmed = known ? [...known.messages].reverse().find((m) => !m.pending) : undefined
      const url = lastConfirmed
        ? `/api/messages/conversations/${id}?after=${encodeURIComponent(lastConfirmed.createdAt)}`
        : `/api/messages/conversations/${id}`
      const res = await fetch(url)
      if (activeRef.current !== id) return
      if (!res.ok) {
        if (!known) {
          const d = await res.json().catch(() => ({}))
          setThreadError(d.error || 'No se pudo abrir la conversación')
        }
        return
      }
      const d = await res.json()
      setThreadError(null)
      setThread(id, (prev) => {
        const msgs = prev && d.incremental ? mergeMessages(prev.messages, d.messages, me) : mergeMessages((prev?.messages || []).filter((m) => m.pending), d.messages, me)
        return { conv: d.conversation, messages: applyReadUpTo(msgs, d.readUpTo, me) }
      })
      const newest = (d.messages as Msg[])[d.messages.length - 1]
      setConvs((prev) => (prev || []).map((x) => (x.id === id
        ? { ...x, unread: 0, ...(newest && (!x.lastMessage || newest.createdAt > x.lastMessage.createdAt)
            ? { lastMessage: { body: newest.body, senderId: newest.senderId, senderName: '', createdAt: newest.createdAt, mine: newest.senderId === me }, lastMessageAt: newest.createdAt }
            : {}) }
        : x)))
    } catch { /* silencioso: se reintenta en el próximo ciclo */ } finally {
      threadBusy.current = false
    }
  }, [me, setThread, setConvs])

  // bandeja: se muestra lo que haya en memoria y se revalida una vez al montar
  useEffect(() => { void loadConvs() }, [loadConvs])

  // hilo activo (o "nuevo:<userId>" para empezar un chat con alguien — ej.
  // "Preguntarle" desde el marketplace)
  useEffect(() => {
    if (c.startsWith('nuevo:')) {
      const targetUserId = c.slice('nuevo:'.length)
      ;(async () => {
        try {
          const res = await fetch('/api/messages/conversations', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ targetUserId }),
          })
          const d = await res.json()
          if (res.ok && d.conversation?.id) {
            navigate(`${base}?c=${d.conversation.id}`, { replace: true })
            if (res.status === 201) void loadConvs()
          } else {
            toast.error(d.error || 'No se pudo abrir la conversación')
            navigate(base, { replace: true })
          }
        } catch { toast.error('No se pudo abrir la conversación') }
      })()
      return
    }
    setThreadError(null)
    if (!active) { setThreadState(null); return }
    // al instante lo que ya se vio; en segundo plano, lo nuevo
    // si nunca se abrió, el encabezado sale ya de la bandeja (nombre, foto, perfil)
    const seen = memo.userId === me ? memo.threads.get(active) : undefined
    const fromList = memo.convs?.find((x) => x.id === active)
    setThreadState(seen || (fromList ? { conv: fromList, messages: [], partial: true } : null))
    setConvs((prev) => (prev ? prev.map((x) => (x.id === active ? { ...x, unread: 0 } : x)) : prev))
    threadBusy.current = false
    void loadThread(active)
  }, [c, me])

  // polling liviano: hilo abierto cada 3 s (solo lo nuevo); bandeja cada 10 s y
  // solo si está a la vista (en el celular, con un hilo abierto, no se ve).
  // Pestaña oculta → no se pide nada.
  useEffect(() => {
    const t1 = setInterval(() => {
      if (document.hidden) return
      const listVisible = !activeRef.current || window.matchMedia('(min-width: 1024px)').matches
      if (listVisible) void loadConvs()
    }, INBOX_POLL_MS)
    const t2 = setInterval(() => {
      if (document.hidden || !activeRef.current) return
      void loadThread(activeRef.current)
    }, THREAD_POLL_MS)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [loadConvs, loadThread])

  // autoscroll al pie cuando llegan mensajes
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread?.messages.length, active])

  function openConv(id: string) {
    navigate(`${base}?c=${id}`)
  }
  function backToInbox() {
    navigate(base)
    void loadConvs()
  }

  // envío optimista: la burbuja aparece al instante y se confirma cuando responde el servidor
  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    const text = draft.trim()
    const id = active
    if (!text || !id || !me) return
    const tempId = `tmp-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    const nowIso = new Date().toISOString()
    const temp: Msg = { id: tempId, senderId: me, body: text, readAt: null, createdAt: nowIso, pending: true }
    setDraft('')
    setThread(id, (prev) => (prev ? { ...prev, messages: [...prev.messages, temp] } : prev))
    setConvs((prev) => (prev || []).map((x) => (x.id === id ? { ...x, lastMessage: { body: text, senderId: me, senderName: user?.displayName || '', createdAt: nowIso, mine: true }, lastMessageAt: nowIso } : x)))
    try {
      const res = await fetch(`/api/messages/conversations/${id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      if (res.ok) {
        const d = await res.json()
        const real = d.message as Msg
        setThread(id, (prev) => {
          if (!prev) return prev
          const withoutTemp = prev.messages.filter((m) => m.id !== tempId)
          return { ...prev, messages: withoutTemp.some((m) => m.id === real.id) ? withoutTemp : mergeMessages(withoutTemp, [real], undefined) }
        })
      } else {
        const d = await res.json().catch(() => ({}))
        setThread(id, (prev) => (prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== tempId) } : prev))
        setDraft((cur) => cur || text)
        toast.error(d.error || 'No se pudo enviar el mensaje. Probá de nuevo.')
      }
    } catch {
      setThread(id, (prev) => (prev ? { ...prev, messages: prev.messages.filter((m) => m.id !== tempId) } : prev))
      setDraft((cur) => cur || text)
      toast.error('No se pudo enviar el mensaje. Revisá tu conexión y probá de nuevo.')
    }
  }

  const heightCls = embedded ? 'h-[calc(100vh-11.5rem)] min-h-[440px] lg:h-[calc(100vh-10rem)]' : 'h-[calc(100vh-6rem)] min-h-[480px]'
  const convsSorted = useMemo(() => convs || [], [convs])
  const totalUnread = convsSorted.reduce((a, c) => a + c.unread, 0)

  return (
    <div className={embedded ? 'homy-page' : 'min-h-screen'}>
      <div className="mb-5">
        <p className="homy-eyebrow">Mensajes</p>
        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
          <h1 className="homy-page-title">Bandeja de entrada</h1>
          {totalUnread > 0 && (
            <span className="homy-badge-pop inline-flex min-w-[22px] h-[22px] items-center justify-center rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#ff8a3d] px-1.5 text-[11px] font-extrabold text-white">{totalUnread}</span>
          )}
        </div>
        <p className="mt-1.5 max-w-2xl text-[15px] leading-relaxed text-slate-500">
          Respondé a quien te escribió. Las conversaciones nuevas las inicia el cliente; profesionales y proveedores responden.
        </p>
      </div>

      <div className={`homy-glass overflow-hidden rounded-3xl flex ${heightCls}`} role="region" aria-label="Mensajes directos">
        {/* ── lista de conversaciones ── */}
        <aside className={`${active ? 'hidden lg:flex' : 'flex'} w-full flex-col border-r border-[#0A2540]/6 lg:w-[340px] lg:shrink-0`}>
          <div className="border-b border-[#0A2540]/6 px-4 py-3">
            <div className="relative">
              <UserRound aria-hidden className="size-4 text-slate-300 pointer-events-none absolute right-4 top-1/2 -translate-y-1/2" />
              <p className="text-xs font-extrabold uppercase tracking-[0.14em] text-slate-400">Conversaciones</p>
            </div>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {convs === null ? (
              <Loading />
            ) : convsSorted.length === 0 ? (
              <div className="px-4 py-10 text-center">
                <span aria-hidden className="homy-icon-chip homy-chip-blue size-12 mx-auto"><Compass /></span>
                <p className="mt-3 text-sm font-bold text-[#0A2540]">Todavía no tenés chats</p>
                <p className="mx-auto mt-1.5 max-w-[240px] text-[13px] leading-relaxed text-slate-500">Abrí una tarjeta del directorio y tocá “Contactar” para empezar una conversación.</p>
                <button onClick={() => navigate('/directorio')} className="homy-btn-dark mt-4 px-5 py-2.5 min-h-[44px] text-sm">Ir al directorio</button>
              </div>
            ) : (
              convsSorted.map((c) => {
                const isActive = c.id === active
                return (
                  <button
                    key={c.id}
                    onClick={() => openConv(c.id)}
                    aria-current={isActive ? 'true' : undefined}
                    className={`homy-focus mb-1 flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-all duration-300 ${
                      isActive ? 'bg-gradient-to-r from-[#1D63B8]/12 to-[#00C4FF]/10 ring-1 ring-[#1D63B8]/25' : 'hover:bg-white/70'
                    }`}
                  >
                    <span className="relative shrink-0">
                      <UAvatar name={c.otherName} url={c.otherAvatarUrl} size={44} />
                      {c.unread > 0 && (
                        <span className="homy-badge-pop absolute -top-1 -right-1 grid min-w-[18px] h-[18px] place-items-center rounded-full bg-gradient-to-br from-[#FF5A1F] to-[#ff8a3d] px-1 text-[10px] font-extrabold text-white ring-2 ring-white">{c.unread > 9 ? '9+' : c.unread}</span>
                      )}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-1.5">
                          <span className="truncate text-sm font-bold text-[#0A2540]">{c.otherName}</span>
                          <VerifyBadge status={c.otherVerification} />
                        </span>
                        <span className="shrink-0 text-[10.5px] font-semibold text-slate-400">{c.lastMessage ? listTime(c.lastMessage.createdAt) : ''}</span>
                      </span>
                      <span className="mt-0.5 flex items-center gap-1.5">
                        <span className={`truncate text-[12.5px] ${c.unread > 0 ? 'font-bold text-slate-600' : 'text-slate-400'}`}>
                          {c.lastMessage ? `${c.lastMessage.mine ? 'Vos: ' : ''}${c.lastMessage.body}` : 'Nueva conversación'}
                        </span>
                      </span>
                      <span className="mt-0.5 block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                        {c.otherRoles.map((r) => ROLE_LABEL[r] || r).join(' · ') || 'Usuario'}
                      </span>
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        {/* ── panel de chat ── */}
        <section className={`${active ? 'flex' : 'hidden lg:flex'} min-w-0 flex-1 flex-col`}>
          {!active || !thread ? (
            <div className="flex h-full flex-col items-center justify-center gap-4 p-8">
              {active && threadError ? (
                <>
                  <EmptyState icon={<MessagesSquare />} title={threadError} hint="Volvé a la bandeja y elegí otra conversación." />
                  <button onClick={backToInbox} className="homy-btn-dark min-h-[44px] px-5 text-sm">Volver a la bandeja</button>
                </>
              ) : active ? (
                <Loading text="Abriendo conversación…" />
              ) : (
                <EmptyState
                  icon={<MessagesSquare />}
                  title="Elegí una conversación"
                  hint="Seleccioná un chat de la lista o contactá a alguien desde su tarjeta del directorio."
                />
              )}
            </div>
          ) : (
            <>
              {/* header del chat */}
              <header className="flex items-center gap-3 border-b border-[#0A2540]/6 px-3 py-2.5 sm:px-4">
                <button
                  onClick={backToInbox}
                  className="homy-focus grid size-11 shrink-0 place-items-center rounded-full text-slate-500 hover:bg-white/70 hover:text-[#0A2540] transition lg:hidden"
                  aria-label="Volver a la bandeja"
                >
                  <ArrowLeft className="size-5" aria-hidden />
                </button>
                <UAvatar name={thread.conv.otherName} url={thread.conv.otherAvatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  {/* el nombre se corta con "…" y la insignia de verificación queda siempre entera */}
                  <p className="flex min-w-0 items-center gap-1.5 text-sm font-extrabold text-[#0A2540]">
                    <span className="truncate">{thread.conv.otherName}</span>
                    <VerifyBadge status={thread.conv.otherVerification} />
                  </p>
                  <p className="truncate text-[11px] font-bold uppercase tracking-wider text-slate-400">
                    {thread.conv.otherRoles.map((r) => ROLE_LABEL[r] || r).join(' · ') || 'Usuario'}
                  </p>
                </div>
                {thread.conv.otherProfileHref && (
                  <button
                    onClick={() => navigate(thread.conv.otherProfileHref!)}
                    className="homy-focus inline-flex items-center gap-1.5 rounded-full homy-glass-soft px-3.5 py-2 text-xs font-bold text-[#1D63B8] hover:translate-y-[-1px] transition sm:px-4"
                  >
                    Ver perfil
                  </button>
                )}
                {/* sin perfil público (clientes) → reputación del cliente: reseñas,
                    obras y compras con las que decido si trabajar con esa persona */}
                {!thread.conv.otherProfileHref &&
                  thread.conv.otherRoles.includes('cliente') &&
                  (user?.roles?.includes('profesional') || user?.roles?.includes('proveedor')) && (
                    <ClientSummaryButton userId={thread.conv.otherUserId} />
                  )}
              </header>

              {/* hilo */}
              <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4 sm:px-6" style={{ background: 'linear-gradient(180deg, rgba(10,37,64,0.025), rgba(10,37,64,0.05))' }}>
                <div className="mx-auto flex max-w-2xl flex-col gap-1.5">
                  {thread.partial && thread.messages.length === 0 && <Loading text="Cargando mensajes…" />}
                  {!thread.partial && thread.messages.length === 0 && (
                    <p className="my-8 text-center text-sm text-slate-400">Arrancá la conversación con un saludo 👋</p>
                  )}
                  {thread.messages.map((m, i) => {
                    const mine = m.senderId === user?.id
                    const prev = thread.messages[i - 1]
                    const newDay = !prev || dayLabel(prev.createdAt) !== dayLabel(m.createdAt)
                    return (
                      <div key={m.id} className="contents">
                        {newDay && (
                          <div className="my-3 flex justify-center">
                            <span className="homy-glass-soft rounded-full px-3.5 py-1 text-[10.5px] font-extrabold uppercase tracking-wider text-slate-400">{dayLabel(m.createdAt)}</span>
                          </div>
                        )}
                        <div className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                          <div
                            className={
                              mine
                                ? 'max-w-[80%] rounded-2xl rounded-br-md bg-gradient-to-br from-[#1D63B8] to-[#2b7fd0] px-4 py-2.5 text-white shadow-[0_10px_24px_-12px_rgba(29,99,184,0.75)]'
                                : 'max-w-[80%] rounded-2xl rounded-bl-md homy-glass-strong px-4 py-2.5 text-slate-700'
                            }
                          >
                            <p className="whitespace-pre-wrap break-words text-[14.5px] leading-relaxed">{m.body}</p>
                            <p className={`mt-1 flex items-center justify-end gap-1 text-[10px] font-semibold tabular-nums ${mine ? 'text-white/70' : 'text-slate-400'}`}>
                              {hhmm(m.createdAt)}
                              {mine && (m.pending
                                ? <Clock3 aria-label="Enviando" className="size-3.5 text-white/60" />
                                : <CheckCheck aria-label={m.readAt ? 'Leído' : 'Enviado'} className={`size-3.5 ${m.readAt ? 'text-[#7dd3fc]' : 'text-white/50'}`} />)}
                            </p>
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>

              {/* compose */}
              <form onSubmit={send} className="flex items-center gap-2.5 border-t border-[#0A2540]/6 p-3 sm:px-5 sm:py-4">
                <input
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="Escribí un mensaje…"
                  aria-label="Escribir mensaje"
                  className="homy-glass-input min-h-[46px] flex-1 rounded-full px-5 py-3 text-sm"
                  maxLength={4000}
                />
                <button
                  type="submit"
                  disabled={!draft.trim()}
                  aria-label="Enviar mensaje"
                  className="homy-focus grid size-[46px] shrink-0 place-items-center rounded-full bg-gradient-to-br from-[#1D63B8] to-[#2b7fd0] text-white shadow-[0_12px_26px_-10px_rgba(29,99,184,0.8)] transition-all duration-300 hover:scale-105 disabled:opacity-40 disabled:hover:scale-100"
                >
                  <SendHorizonal className="size-5" aria-hidden />
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  )
}
