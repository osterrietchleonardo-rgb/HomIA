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
import { ArrowRight, BadgeCheck, Briefcase, Loader2, MapPin, Package, Sparkles, Star, Wrench, X } from "lucide-react";
import { Homy, type HomyState } from "@/components/homy/homy-character";
import { formatARS } from "@/lib/format";
import { navigate } from "@/lib/router";
import { useLocation } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Respuesta del superagente (loop + herramientas reales)             */
/* ------------------------------------------------------------------ */
type AgentIntent = "contratar" | "trabajar" | "materiales" | "ayuda";

type AgentReply = {
  ok: boolean;
  message: string;
  suggestions: string[];
  intent?: AgentIntent;
  question?: { pregunta: string; opciones: string[] };
  results?: {
    professionals?: { id: string; displayName: string; city: string | null; rating: number; reviewsCount: number; verified: boolean }[];
    jobs?: { id: string; title: string; categorySlug: string; budgetMin: number | null; budgetMax: number | null; city: string | null }[];
    materials?: { stockId: string; elementName: string; price: number; unit: string; providerName: string; providerId: string }[];
    comparables?: { stockId: string; elementName: string; price: number; unit: string; providerName: string; providerId: string }[];
  };
  error?: string;
};

const INTENT_CTA: Record<AgentIntent, { label: string; href: string; icon: typeof Wrench }> = {
  contratar: { label: "Ver profesionales en el mapa", href: "/buscar?mode=cliente", icon: MapPin },
  trabajar: { label: "Ver la bolsa de trabajos", href: "/buscar?mode=profesional", icon: Briefcase },
  materiales: { label: "Comparar precios de materiales", href: "/buscar?mode=profesional", icon: Package },
  ayuda: { label: "Abrir el buscador inteligente", href: "/buscar", icon: Sparkles },
};

/* ------------------------------------------------------------------ */
/*  Ejemplos clickeables: demuestran el razonamiento de intención      */
/* ------------------------------------------------------------------ */
const EXAMPLES = [
  "Necesito un plomero urgente",
  "¿Qué hay para plomeros?",
  "Precio del cemento de 50kg",
  "¿Cómo funciona el escrow?",
];

const TYPE_PHRASES = [
  "Contame qué necesita tu hogar…",
  "¿Una fuga, una pintura, una mudanza?",
  "Escribilo como se lo dirías a un vecino…",
];

/* ------------------------------------------------------------------ */
/*  Placeholder con máquina de escribir (barra sin foco)               */
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
  const [reply, setReply] = useState<AgentReply | null>(null);
  const [degraded, setDegraded] = useState(false);
  const [lastQuery, setLastQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const happyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();

  const askHomy = useCallback(
    async (question: string, lat?: number | null, lng?: number | null) => {
      const trimmed = question.trim();
      if (trimmed.length < 4) return;

      setPhase("thinking");
      setDegraded(false);
      setLastQuery(trimmed);
      try {
        const res = await fetch("/api/homy/agent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            message: trimmed,
            mode: "auto",
            lat: lat ?? null,
            lng: lng ?? null,
          }),
        });
        const data = (await res.json()) as AgentReply;
        if (!res.ok || !data.ok) {
          setReply({
            ok: false,
            message:
              "El superagente tuvo un problema para razonar tu pedido. Probá de nuevo en unos segundos que sigo acá.",
            suggestions: [],
          });
          setDegraded(true);
        } else {
          setReply(data);
        }
      } catch {
        setReply({
          ok: false,
          message:
            "No pude conectarme con el motor en este momento. Revisá tu conexión y volvé a intentar: sigo acá, cuidando tu hogar.",
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
    },
    []
  );

  const onChange = (next: string) => {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (next.trim().length >= 8) {
      debounceRef.current = setTimeout(
        () => void askHomy(next, location.lat, location.lng),
        1400
      );
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (debounceRef.current) clearTimeout(debounceRef.current);
    void askHomy(value, location.lat, location.lng);
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
      {/* Homy flotando detrás de la barra: las piernas quedan ocultas
          tras el borde superior (z-0), nunca tapa el texto del input */}
      <div className="relative z-10 mx-auto w-full max-w-xl">
        <div
          aria-hidden
          className="pointer-events-none relative z-0 mx-auto w-fit origin-bottom animate-float-slow mb-[-26px] sm:mb-[-34px]"
        >
          <Homy size={88} state={homyState} />
        </div>

        {/* Barra premium */}
        <form
          onSubmit={onSubmit}
          className={cn(
            "bar-relief relative z-10 flex h-14 items-center gap-2 rounded-full pr-2 pl-5 transition-shadow duration-500 sm:h-16 sm:pl-6",
            "focus-within:shadow-[0_22px_54px_-16px_rgba(0,196,255,0.4),inset_0_2px_8px_rgba(10,37,64,0.05)]"
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
            className="h-full min-w-0 flex-1 bg-transparent text-[15px] font-medium text-navy outline-none placeholder:text-navy/35 sm:text-base"
          />
          <button
            type="submit"
            disabled={busy || value.trim().length === 0}
            aria-label="Preguntarle a Homy"
            className="homy-btn-primary size-10 shrink-0 sm:size-11"
          >
            {busy ? (
              <Loader2 className="size-4.5 animate-spin" aria-hidden />
            ) : (
              <ArrowRight className="size-4.5" aria-hidden />
            )}
          </button>
        </form>

        {/* Anillo de actividad IA */}
        {busy && (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1.5 rounded-full border-2 border-ai/50 animate-ring-ping"
          />
        )}
      </div>

      {/* Ejemplos de intención: clickeables, razonan como el agente */}
      <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
        <span className="mr-1 hidden text-xs font-bold uppercase tracking-widest text-navy/40 sm:inline">
          Probá
        </span>
        {EXAMPLES.map((ex) => (
          <button
            key={ex}
            onClick={() => void askHomy(ex, location.lat, location.lng)}
            disabled={busy}
            aria-label={`Probar ejemplo: ${ex}`}
            className="homy-glass-soft homy-focus rounded-full px-3.5 py-1.5 text-[12.5px] font-semibold text-navy/70 transition-all duration-300 hover:-translate-y-0.5 hover:border-tech/35 hover:text-tech active:scale-[0.97] disabled:opacity-50 sm:text-[13px]"
          >
            {ex}
          </button>
        ))}
      </div>

      <p className="mt-4 text-center text-sm text-navy/50 sm:hidden">
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
            <div className="homy-glass-strong rounded-[28px] p-5 sm:p-6">
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

              {/* Pregunta de aclaración del agente (loop de razonamiento) */}
              {reply.question && reply.question.opciones.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {reply.question.opciones.map((op) => (
                    <button
                      key={op}
                      onClick={() => {
                        setReply(null);
                        void askHomy(op, location.lat, location.lng);
                      }}
                      className="rounded-full border border-ai/40 bg-white/80 px-3.5 py-1.5 text-[13px] font-semibold text-tech transition-all hover:border-ai hover:bg-ai/5 active:scale-[0.97]"
                    >
                      {op}
                    </button>
                  ))}
                </div>
              )}

              {/* Resultados REALES de la base (chips compactos clickeables) */}
              {reply.results && (
                <div className="mt-4 space-y-1.5">
                  {(reply.results.jobs ?? []).slice(0, 2).map((j) => (
                    <button
                      key={j.id}
                      onClick={() => navigate(`/trabajo/${j.id}`)}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-line/70 bg-white/70 px-3.5 py-2.5 text-left transition hover:border-tech/40 hover:bg-white"
                    >
                      <Briefcase className="size-4 shrink-0 text-tech" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-navy">
                        {j.title}
                      </span>
                      <span className="shrink-0 text-xs font-bold text-action">
                        {j.budgetMin || j.budgetMax
                          ? formatARS(j.budgetMin ?? j.budgetMax ?? 0)
                          : "A presupuestar"}
                      </span>
                    </button>
                  ))}
                  {(reply.results.professionals ?? []).slice(0, 2).map((p) => (
                    <button
                      key={p.id}
                      onClick={() => navigate(`/profesional/${p.id}`)}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-line/70 bg-white/70 px-3.5 py-2.5 text-left transition hover:border-tech/40 hover:bg-white"
                    >
                      <Wrench className="size-4 shrink-0 text-tech" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-navy">
                        {p.displayName}
                        {p.verified && <span className="ml-1.5 inline-flex items-center gap-0.5 text-[10px] font-bold text-tech"><BadgeCheck className="size-3" aria-hidden /> verificado</span>}
                      </span>
                      <span className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#B98A00]">
                        <Star className="size-3.5 fill-[#FFC700] text-[#FFC700]" aria-hidden />
                        {p.rating > 0 ? p.rating.toFixed(1) : "nuevo"}
                      </span>
                    </button>
                  ))}
                  {[...(reply.results.materials ?? []), ...(reply.results.comparables ?? [])]
                    .slice(0, 2)
                    .map((m) => (
                    <button
                      key={m.stockId}
                      onClick={() => navigate(`/proveedor/${m.providerId}`)}
                      className="flex w-full items-center gap-2.5 rounded-xl border border-line/70 bg-white/70 px-3.5 py-2.5 text-left transition hover:border-tech/40 hover:bg-white"
                    >
                      <Package className="size-4 shrink-0 text-tech" aria-hidden />
                      <span className="min-w-0 flex-1 truncate text-[13px] font-semibold text-navy">
                        {m.elementName}
                        <span className="ml-1.5 text-xs font-normal text-navy/45">{m.providerName}</span>
                      </span>
                      <span className="shrink-0 text-xs font-bold text-action">
                        {formatARS(m.price)}/{m.unit}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* CTA según la intención razonada por el agente */}
              {(() => {
                const intent = reply.intent ?? "ayuda";
                const cta = INTENT_CTA[intent];
                const href = cta.href.includes("?")
                  ? `${cta.href}&q=${encodeURIComponent(lastQuery)}`
                  : cta.href;
                const CtaIcon = cta.icon;
                return (
                  <button
                    onClick={() => navigate(href)}
                    className="homy-btn-dark mt-4 w-full px-5 py-3 text-sm sm:w-auto"
                  >
                    <CtaIcon className="size-4" aria-hidden />
                    {cta.label}
                    <ArrowRight className="size-4" aria-hidden />
                  </button>
                );
              })()}

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
                          void askHomy(s, location.lat, location.lng);
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
