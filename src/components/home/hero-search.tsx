"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArrowRight, Loader2, Sparkles, X } from "lucide-react";
import { Homy, type HomyState } from "@/components/homy/homy-character";
import {
  HOMY_CATEGORY_LABELS,
  type HomyReply,
} from "@/lib/homy";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Consultas y respuestas del flujo ambiental (efecto solicitado)     */
/* ------------------------------------------------------------------ */
const FLOW_QUERIES = [
  "Necesito un plomero urgente en Palermo…",
  "Busco electricista matriculado para el viernes…",
  "Quiero pintar el living de 40 m², ¿qué me conviene?",
];

const FLOW_ANSWERS = [
  "Profesionales verificados cerca tuyo, listos para tu pedido",
  "Presupuesto integral: obra + materiales, sin sorpresas",
  "Tu pago queda protegido hasta que apruebes el trabajo",
];

const FLOW_DURATION = "11.4s";
const FLOW_MASK =
  "linear-gradient(to right, transparent 0%, black 15%, black 85%, transparent 100%)";

const TYPE_PHRASES = [
  "Contame qué necesita tu hogar…",
  "¿Una fuga, una pintura, una mudanza?",
  "Escribilo como se lo dirías a un vecino…",
];

/* ------------------------------------------------------------------ */
/*  Región de flujo (texto en relieve, sin recuadros)                  */
/* ------------------------------------------------------------------ */
type FlowSide = "left" | "right";

function FlowRegion({
  side,
  paused,
}: {
  side: FlowSide;
  paused: boolean;
}) {
  const items = side === "left" ? FLOW_QUERIES : FLOW_ANSWERS;

  return (
    <div
      aria-hidden
      className={cn(
        "pointer-events-none relative h-14 min-w-0 flex-1 select-none overflow-hidden",
        "@container",
        "hidden lg:block",
        "transition-opacity duration-700",
        paused ? "opacity-0" : "opacity-100"
      )}
      style={{
        maskImage: FLOW_MASK,
        WebkitMaskImage: FLOW_MASK,
      }}
    >
      {items.map((text, i) => (
        <span
          key={i}
          className={cn(
            "absolute left-0 -translate-y-1/2 whitespace-nowrap text-[14.5px] font-medium will-change-transform",
            side === "left"
              ? "text-relief animate-flow-q"
              : "text-relief-ai animate-flow-a"
          )}
          style={{
            top: i % 2 === 0 ? "calc(50% - 16px)" : "calc(50% + 16px)",
            animationDelay: `${i * 3.8}s`,
            animationDuration: FLOW_DURATION,
            animationPlayState: paused ? "paused" : "running",
          }}
        >
          {text}
        </span>
      ))}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Placeholder con máquina de escribir (mobile / barra sin foco)      */
/* ------------------------------------------------------------------ */
function useTypewriter(active: boolean) {
  const [text, setText] = useState("");
  const stateRef = useRef({ phrase: 0, char: 0, deleting: false });

  useEffect(() => {
    if (!active) return;
    const tick = () => {
      const s = stateRef.current;
      const phrase = TYPE_PHRASES[s.phrase % TYPE_PHRASES.length];
      if (!s.deleting) {
        s.char += 1;
        if (s.char >= phrase.length) {
          s.deleting = true;
          return 1700;
        }
        return 48;
      }
      s.char -= 1;
      if (s.char <= 0) {
        s.deleting = false;
        s.phrase += 1;
        return 420;
      }
      return 26;
    };

    let timeout: ReturnType<typeof setTimeout>;
    const loop = () => {
      const delay = tick();
      const s = stateRef.current;
      setText(
        TYPE_PHRASES[s.phrase % TYPE_PHRASES.length].slice(0, s.char)
      );
      timeout = setTimeout(loop, delay);
    };
    loop();
    return () => clearTimeout(timeout);
  }, [active]);

  return text;
}

/* ------------------------------------------------------------------ */
/*  HeroSearch                                                         */
/* ------------------------------------------------------------------ */
export function HeroSearch() {
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [phase, setPhase] = useState<"idle" | "thinking" | "done">("idle");
  const [reply, setReply] = useState<HomyReply | null>(null);
  const [degraded, setDegraded] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const happyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const askHomy = useCallback(async (question: string) => {
    const trimmed = question.trim();
    if (trimmed.length < 4) return;

    setPhase("thinking");
    setDegraded(false);
    try {
      const res = await fetch("/api/homy", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: trimmed, history: [] }),
      });
      const data = (await res.json()) as { ok: boolean; reply: HomyReply };
      setReply(data.reply);
      setDegraded(!data.ok);
    } catch {
      setReply({
        message:
          "No pude conectarme con el motor en este momento. Revisá tu conexión y volvé a intentar: sigo acá, cuidando tu hogar.",
        category: "otro",
        urgency: "media",
        summary: "",
        suggestions: [],
      });
      setDegraded(true);
    } finally {
      setPhase("done");
      setValue("");
      inputRef.current?.blur();
      if (happyTimer.current) clearTimeout(happyTimer.current);
      happyTimer.current = setTimeout(() => setPhase("idle"), 1900);
    }
  }, []);

  const onChange = (next: string) => {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length >= 8) {
      debounceRef.current = setTimeout(() => askHomy(next), 1400);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void askHomy(value);
  };

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (happyTimer.current) clearTimeout(happyTimer.current);
    },
    []
  );

  const placeholderText = useTypewriter(!focused && value === "" && phase !== "thinking");

  const homyState: HomyState = useMemo(() => {
    if (phase === "thinking") return "thinking";
    if (phase === "done") return "happy";
    if (focused || value.length > 0) return "listening";
    return "idle";
  }, [phase, focused, value]);

  const busy = phase === "thinking";

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* Fila: flujo de consultas · barra · flujo de respuestas */}
      <div className="flex items-center justify-center">
        <FlowRegion side="left" paused={focused || busy} />

        {/* Barra + Homy detrás */}
        <div className="relative z-10 w-[min(88vw,430px)] shrink-0 px-2">
          {/* Homy detrás de la barra */}
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-0 origin-bottom -translate-x-1/2 scale-[0.7] sm:scale-[0.78]">
            <Homy size={124} state={homyState} />
          </div>

          {/* Anillo de actividad IA */}
          {busy && (
            <span
              aria-hidden
              className="absolute -inset-1.5 rounded-full border-2 border-ai/50 animate-ring-ping"
            />
          )}

          <form
            onSubmit={onSubmit}
            className={cn(
              "bar-relief relative z-10 flex h-14 items-center gap-3 rounded-full pr-2 pl-5 transition-shadow duration-500",
              "focus-within:shadow-[0_18px_44px_-14px_rgba(0,196,255,0.35),inset_0_2px_8px_rgba(10,37,64,0.05)]"
            )}
            role="search"
          >
            <Sparkles
              className={cn(
                "size-5 shrink-0 transition-colors duration-300",
                homyState === "idle" ? "text-tech/60" : "text-ai"
              )}
              aria-hidden
            />
            <input
              ref={inputRef}
              type="text"
              value={value}
              onChange={(e) => onChange(e.target.value)}
              onFocus={() => setFocused(true)}
              onBlur={() => setFocused(false)}
              placeholder={placeholderText || "¿Qué necesita tu hogar?"}
              aria-label="Contale a Homy qué necesitás"
              maxLength={280}
              className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium text-navy outline-none placeholder:text-navy/35"
            />
            <button
              type="submit"
              disabled={busy || value.trim().length === 0}
              aria-label="Preguntarle a Homy"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-action text-white shadow-[0_8px_20px_-8px_rgba(255,90,31,0.8)] transition-all hover:brightness-110 active:scale-95 disabled:opacity-45 disabled:shadow-none"
            >
              {busy ? (
                <Loader2 className="size-4.5 animate-spin" aria-hidden />
              ) : (
                <ArrowRight className="size-4.5" aria-hidden />
              )}
            </button>
          </form>
        </div>

        <FlowRegion side="right" paused={busy} />
      </div>

      {/* Ayuda visible solo en mobile (los flujos laterales son desktop) */}
      <p className="mt-4 text-center text-sm text-navy/50 lg:hidden">
        Escribí con tus palabras: Homy interpreta y arma tu pedido.
      </p>

      {/* Panel de respuesta de Homy */}
      <AnimatePresence>
        {reply && (
          <motion.div
            key="homy-reply"
            initial={{ opacity: 0, y: 18, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="relative z-10 mx-auto mt-7 w-[min(92vw,640px)]"
            role="status"
            aria-live="polite"
          >
            <div className="glass-card rounded-[28px] border border-white/70 p-5 sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Homy size={40} state={busy ? "thinking" : "idle"} />
                  <div>
                    <p className="flex items-center gap-2 text-sm font-bold text-navy">
                      Homy
                      <span className="inline-flex items-center gap-1 rounded-full bg-ai-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-tech">
                        <Sparkles className="size-3" aria-hidden />
                        Agente IA
                      </span>
                    </p>
                    <p className="text-xs text-navy/45">
                      Asistente de HomIA · interpreta tu pedido al instante
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setReply(null)}
                  aria-label="Cerrar respuesta"
                  className="grid size-8 place-items-center rounded-full text-navy/40 transition-colors hover:bg-confort hover:text-navy"
                >
                  <X className="size-4" />
                </button>
              </div>

              <p className="mt-4 text-[15px] leading-relaxed text-navy/85">
                {reply.message}
              </p>

              {(reply.summary || reply.category !== "otro") && (
                <div className="mt-4 flex flex-wrap items-center gap-2">
                  {reply.category !== "otro" && (
                    <span className="rounded-full bg-tech/10 px-3 py-1 text-xs font-semibold text-tech">
                      {HOMY_CATEGORY_LABELS[reply.category] ?? reply.category}
                    </span>
                  )}
                  {reply.urgency === "alta" && (
                    <span className="rounded-full bg-action/10 px-3 py-1 text-xs font-semibold text-action">
                      Urgencia alta
                    </span>
                  )}
                  {reply.summary && (
                    <span className="rounded-full bg-confort px-3 py-1 text-xs font-medium text-navy/60">
                      {reply.summary}
                    </span>
                  )}
                </div>
              )}

              {reply.suggestions.length > 0 && (
                <div className="mt-5 border-t border-line/70 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy/40">
                    ¿Seguimos por acá?
                  </p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {reply.suggestions.map((s) => (
                      <button
                        key={s}
                        onClick={() => {
                          setReply(null);
                          inputRef.current?.focus();
                          void askHomy(s);
                        }}
                        className="rounded-full border border-tech/20 bg-white/70 px-3.5 py-1.5 text-[13px] font-medium text-tech transition-all hover:border-tech/40 hover:bg-tech/5 active:scale-[0.97]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {degraded && (
                <p className="mt-4 text-xs text-navy/40">
                  Nota: respondo con capacidad reducida en este momento.
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
