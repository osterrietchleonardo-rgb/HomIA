"use client";

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { Send, X } from "lucide-react";
import { Homy } from "@/components/homy/homy-character";
import type { HomyChatTurn, HomyReply } from "@/lib/homy";
import { cn } from "@/lib/utils";

interface ChatMessage extends HomyChatTurn {
  id: string;
  suggestions?: string[];
  degraded?: boolean;
}

const WELCOME_MESSAGE =
  "¡Hola! Soy Homy, el asistente de HomIA. Contame qué necesita tu hogar —con tus palabras, sin tecnicismos— y yo me encargo de interpretarlo y armar el pedido.";

let messageId = 0;
const nextId = () => `msg-${Date.now()}-${messageId++}`;

export function HomyWidget() {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [thinking, setThinking] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: "welcome", role: "homy", content: WELCOME_MESSAGE },
  ]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("homy:open", onOpen);
    return () => window.removeEventListener("homy:open", onOpen);
  }, []);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
  }, [messages, thinking, open]);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || thinking) return;

      const history: HomyChatTurn[] = messages
        .filter((m) => m.id !== "welcome")
        .slice(-6)
        .map((m) => ({ role: m.role, content: m.content }));

      setMessages((prev) => [
        ...prev,
        { id: nextId(), role: "user", content: trimmed },
      ]);
      setInput("");
      setThinking(true);

      try {
        const res = await fetch("/api/homy", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed, history }),
        });
        const data = (await res.json()) as {
          ok: boolean;
          reply: HomyReply;
        };
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "homy",
            content: data.reply.message,
            suggestions: data.reply.suggestions,
            degraded: !data.ok,
          },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            id: nextId(),
            role: "homy",
            content:
              "Se me cortó la conexión un segundo, pero sigo acá. Probá de nuevo en un momento y seguimos cuidando tu hogar.",
            degraded: true,
          },
        ]);
      } finally {
        setThinking(false);
      }
    },
    [messages, thinking]
  );

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  return (
    <>
      {/* Botón flotante */}
      <motion.button
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1.1, type: "spring", stiffness: 260, damping: 18 }}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar chat con Homy" : "Abrir chat con Homy"}
        aria-expanded={open}
        className="fixed bottom-5 right-5 z-50 grid size-[68px] place-items-center rounded-full border border-white/80 bg-white/85 shadow-[0_16px_40px_-12px_rgba(10,37,64,0.35)] backdrop-blur-md transition-transform hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
      >
        <span className="pointer-events-none absolute inset-0 animate-ping rounded-full border border-ai/30 [animation-duration:2.6s]" aria-hidden />
        {open ? (
          <X className="size-6 text-navy" aria-hidden />
        ) : (
          <Homy size={50} state="idle" />
        )}
        {!open && (
          <span
            className="absolute -right-0.5 -top-0.5 size-3.5 rounded-full border-2 border-white bg-action"
            aria-hidden
          />
        )}
      </motion.button>

      {/* Panel de chat */}
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="fixed bottom-24 right-4 z-50 flex h-[min(560px,calc(100dvh-8rem))] w-[min(380px,calc(100vw-2rem))] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-white/85 shadow-[0_32px_80px_-24px_rgba(10,37,64,0.45)] backdrop-blur-2xl sm:right-6"
            role="dialog"
            aria-label="Chat con Homy, asistente de HomIA"
          >
            {/* Encabezado */}
            <div className="flex items-center gap-3 border-b border-line/70 bg-white/60 px-5 py-4">
              <Homy size={42} state={thinking ? "thinking" : "idle"} />
              <div className="flex-1">
                <p className="text-[15px] font-extrabold text-navy">Homy</p>
                <p className="flex items-center gap-1.5 text-xs text-navy/50">
                  <span className="relative flex size-2">
                    <span className="absolute size-full animate-ping rounded-full bg-ai opacity-60" />
                    <span className="relative size-2 rounded-full bg-ai" />
                  </span>
                  En línea · responde al instante
                </p>
              </div>
              <button
                onClick={() => setOpen(false)}
                aria-label="Cerrar chat"
                className="grid size-8 place-items-center rounded-full text-navy/40 transition-colors hover:bg-confort hover:text-navy"
              >
                <X className="size-4" />
              </button>
            </div>

            {/* Mensajes */}
            <div
              ref={scrollRef}
              className="homy-scroll flex-1 space-y-4 overflow-y-auto px-4 py-4"
            >
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn(
                    "flex flex-col gap-2",
                    m.role === "user" ? "items-end" : "items-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] rounded-3xl px-4 py-3 text-[14px] leading-relaxed",
                      m.role === "user"
                        ? "rounded-br-lg bg-navy font-medium text-chalk shadow-md"
                        : "rounded-bl-lg border border-line/80 bg-white text-navy/85 shadow-sm"
                    )}
                  >
                    {m.content}
                    {m.degraded && (
                      <span className="mt-1.5 block text-[11px] text-navy/40">
                        (respuesta con capacidad reducida)
                      </span>
                    )}
                  </div>
                  {m.suggestions && m.suggestions.length > 0 && (
                    <div className="flex max-w-[92%] flex-wrap gap-1.5">
                      {m.suggestions.map((s) => (
                        <button
                          key={s}
                          onClick={() => void send(s)}
                          className="rounded-full border border-tech/20 bg-white/80 px-3 py-1.5 text-xs font-medium text-tech transition-all hover:border-tech/40 hover:bg-tech/5 active:scale-[0.97]"
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              {thinking && (
                <div className="flex items-center gap-2.5 rounded-3xl rounded-bl-lg border border-line/80 bg-white px-4 py-3.5 shadow-sm" style={{ width: "fit-content" }}>
                  <span className="flex gap-1" aria-label="Homy está escribiendo">
                    {[0, 1, 2].map((i) => (
                      <span
                        key={i}
                        className="size-2 rounded-full bg-ai animate-dot-bounce"
                        style={{ animationDelay: `${i * 0.16}s` }}
                      />
                    ))}
                  </span>
                  <span className="text-xs font-medium text-navy/45">
                    Homy está interpretando…
                  </span>
                </div>
              )}
            </div>

            {/* Entrada */}
            <form
              onSubmit={onSubmit}
              className="border-t border-line/70 bg-white/70 p-3"
            >
              <div className="flex items-center gap-2 rounded-full border border-line bg-white pl-4 pr-1.5 py-1.5 shadow-[inset_0_2px_6px_rgba(10,37,64,0.05)] focus-within:border-tech/40">
                <input
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Escribile a Homy…"
                  aria-label="Mensaje para Homy"
                  maxLength={400}
                  className="h-9 min-w-0 flex-1 bg-transparent text-[14px] text-navy outline-none placeholder:text-navy/35"
                />
                <button
                  type="submit"
                  disabled={thinking || input.trim().length === 0}
                  aria-label="Enviar mensaje"
                  className="grid size-9 shrink-0 place-items-center rounded-full bg-action text-white transition-all hover:brightness-110 active:scale-95 disabled:opacity-40"
                >
                  <Send className="size-4" aria-hidden />
                </button>
              </div>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
