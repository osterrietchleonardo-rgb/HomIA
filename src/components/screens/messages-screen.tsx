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
import { MessagesSquare, SendHorizonal, ArrowLeft, UserRound, Compass, CheckCheck } from 'lucide-react'

type Conv = {
  id: string; otherUserId: string; otherName: string; otherAvatarUrl: string | null
  otherRoles: string[]; otherVerification?: string; otherProfileHref: string | null
  lastMessage: { body: string; senderId: string; senderName: string; createdAt: string; mine: boolean } | null
  unread: number; lastMessageAt: string
}
type Msg = { id: string; senderId: string; body: string; readAt: string | null; createdAt: string }

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
  const [convs, setConvs] = useState<Conv[] | null>(null)
  const [active, setActive] = useState<string | null>(null)
  const [thread, setThread] = useState<{ conv: { id: string; otherUserId: string; otherName: string; otherAvatarUrl: string | null; otherRoles: string[]; otherVerification?: string; otherProfileHref: string | null }; messages: Msg[] } | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [loadingThread, setLoadingThread] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const activeRef = useRef<string | null>(null)
  activeRef.current = active

  const loadConvs = useCallback(async () => {
    try {
      const res = await fetch('/api/messages/conversations')
      if (res.ok) {
        const d = await res.json()
        setConvs(d.conversations)
      }
    } catch { /* silencioso */ }
  }, [])

  const openConv = useCallback(async (id: string) => {
    setActive(id)
    setLoadingThread(true)
    try {
      const res = await fetch(`/api/messages/conversations/${id}`)
      if (res.ok) {
        const d = await res.json()
        setThread({ conv: d.conversation, messages: d.messages })
        setConvs((prev) => (prev || []).map((c) => (c.id === id ? { ...c, unread: 0 } : c)))
      } else {
        setActive(null); setThread(null)
      }
    } finally { setLoadingThread(false) }
  }, [])

  // carga inicial + apertura por deep-link ?c= (id de conversación o "nuevo:<userId>" para
  // empezar un chat con alguien nuevo — ej. "Preguntarle" desde el marketplace)
  useEffect(() => {
    loadConvs()
    const c = route.query.c
    if (c && c.startsWith('nuevo:')) {
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
            navigate(`/mensajes?c=${d.conversation.id}`, { replace: true })
            openConv(d.conversation.id)
          } else {
            toast.error(d.error || 'No se pudo abrir la conversación')
          }
        } catch { toast.error('No se pudo abrir la conversación') }
      })()
    } else if (c) {
      openConv(c)
    }
     
  }, [route.query.c])

  // polling: bandeja 6s, hilo abierto 3s
  useEffect(() => {
    const t1 = setInterval(loadConvs, 6000)
    const t2 = setInterval(() => { if (activeRef.current) openConv(activeRef.current) }, 3000)
    return () => { clearInterval(t1); clearInterval(t2) }
  }, [loadConvs, openConv])

  // autoscroll al pie cuando llegan mensajes
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [thread?.messages.length, active])

  async function send(e?: React.FormEvent) {
    e?.preventDefault()
    const text = draft.trim()
    if (!text || !active || sending) return
    setSending(true)
    try {
      const res = await fetch(`/api/messages/conversations/${active}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      if (res.ok) {
        const d = await res.json()
        setThread((prev) => (prev ? { ...prev, messages: [...prev.messages, d.message] } : prev))
        setDraft('')
        setConvs((prev) => (prev || []).map((c) => (c.id === active ? { ...c, lastMessage: { body: text, senderId: user!.id, senderName: user!.displayName, createdAt: d.message.createdAt, mine: true }, lastMessageAt: d.message.createdAt } : c)))
      } else {
        const d = await res.json().catch(() => ({}))
        toast.error(d.error || 'No se pudo enviar el mensaje. Probá de nuevo.')
      }
    } catch {
      toast.error('No se pudo enviar el mensaje. Revisá tu conexión y probá de nuevo.')
    } finally { setSending(false) }
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
                    onClick={() => navigate(`/mensajes?c=${c.id}`)}
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
            <div className="flex h-full items-center justify-center p-8">
              {loadingThread ? (
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
                  onClick={() => { setActive(null); setThread(null); navigate('/mensajes') }}
                  className="homy-focus rounded-full p-2 text-slate-500 hover:bg-white/70 hover:text-[#0A2540] transition lg:hidden"
                  aria-label="Volver a la bandeja"
                >
                  <ArrowLeft className="size-5" aria-hidden />
                </button>
                <UAvatar name={thread.conv.otherName} url={thread.conv.otherAvatarUrl} size={40} />
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 truncate text-sm font-extrabold text-[#0A2540]">
                    {thread.conv.otherName}
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
                  {thread.messages.length === 0 && (
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
                              {mine && <CheckCheck aria-label={m.readAt ? 'Leído' : 'Enviado'} className={`size-3.5 ${m.readAt ? 'text-[#7dd3fc]' : 'text-white/50'}`} />}
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
                  disabled={!draft.trim() || sending}
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
