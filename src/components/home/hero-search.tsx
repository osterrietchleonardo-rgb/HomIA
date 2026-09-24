"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { AnimatePresence, MotionConfig, motion } from "framer-motion";
import { ArrowRight, BadgeCheck, Loader2, MessageCircle, Sparkles, X } from "lucide-react";
import { Homy, type HomyState } from "@/components/homy/homy-character";
import { AccionesHomy, TarjetasHomy } from "@/components/homy/homy-tarjetas";
import { rutaActual, useDuenioHomy, useHomy } from "@/components/homy/homy-store";
import { navigate } from "@/lib/router";
import { useLocation } from "@/lib/store";
import { cn } from "@/lib/utils";

/* ------------------------------------------------------------------ */
/*  Ejemplos clickeables: demuestran el razonamiento de intención      */
/* ------------------------------------------------------------------ */
const EXAMPLES = [
  "Se me gotea la canilla, ¿qué necesito?",
  "Busco plomero en Palermo",
  "Precio del cemento de 50kg",
  "¿Cómo funcionan los pagos?",
];

/* Coreografía ambiental del hero (máquina de vidrio): la consulta VUELA desde
   la izquierda legible, se frena al llegar al vidrio y se disuelve EN EL BORDE
   (su punta apenas se asoma detrás del vidrio, ≤6px: NUNCA entra a la barra ni
   pisa al placeholder — la máquina de escribir escribe siempre por dentro, son
   dos cosas distintas que conviven sin tocarse). Después la RESPUESTA SURGE
   desde detrás del vidrio, afuera de la barra, se deja leer y se desvanece
   contra el borde de la página. De a una, ágil, sin superponerse. Los pares
   cubren los 3 roles (cliente · profesional · proveedor) y NUNCA deja de
   aparecer: sigue aunque enfoques, escribas o pases el mouse — solo cede el
   escenario mientras una consulta real está en curso. */
/* Pares ambientales: cubren el POTENCIAL completo del producto rotando los 3
   roles — cliente (emergencia, presupuesto IA, pago, reseñas, categorías,
   mudanza), profesional (bolsa, cobro, sobrantes) y proveedor
   (precios, plan PRO, stock compartido). Sin números inventados. */
const DEMO_PAIRS = [
  { q: "Necesito un plomero urgente", a: "Encontré plomeros verificados cerca tuyo" },
  { q: "¿Qué hay para plomeros?", a: "Hay trabajos de plomería en la bolsa" },
  { q: "Precio del cemento de 50kg", a: "Comparé precios entre proveedores" },
  { q: "¿Cómo funcionan los pagos?", a: "Pagás al finalizar" },
  { q: "¿Cuánto sale pintar un departamento?", a: "Presupuesto completo: obra y materiales" },
  { q: "¿Cómo cobro sin riesgos?", a: "Acordás el pago al finalizar el trabajo" },
  { q: "Busco un electricista de confianza", a: "Perfiles verificados y con reseñas reales" },
  { q: "¿Cómo vendo más materiales?", a: "Con el plan PRO destacás primero" },
  { q: "Me sobraron ladrillos de la obra", a: "Devolvelos y recuperá tu dinero" },
  { q: "Necesito un gasista matriculado", a: "Hay gasistas habilitados en tu zona" },
  { q: "Me mudo el mes que viene", a: "Organizamos la mudanza completa" },
  { q: "Tengo materiales para vender", a: "Tu stock llega a profesionales cercanos" },
] as const;

type DemoFlight =
  | { kind: "q"; q: string }
  | { kind: "a"; stage: "in" | "hold" | "out"; q: string; a: string };

/* Ritmo: de a una, ágil pero leíble (~9s por par, 12 pares rotando ~108s).
   La consulta vuela, se frena en el borde del vidrio y ahí mismo se disuelve
   (sin entrar); la respuesta surge afuera de la barra y muere contra el borde
   de la página. */
const DEMO_T = {
  qFly: 3400, // vuelo completo: se lee, se frena en el vidrio y se disuelve en su borde
  gap: 380, // respiro sin nada en escena (sin pisarse)
  aIn: 1000, // la respuesta surge desde detrás del vidrio
  aHold: 2000, // queda afuera de la barra, leíble
  aOut: 1300, // deriva hacia el borde de la página desvaneciéndose
  next: 900, // pausa antes del siguiente par
  restart: 1100, // cooldown al volver de una consulta real
} as const;

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
  // turno de Homy que abrió ESTE buscador (la conversación es la misma del flotante)
  const [turnoId, setTurnoId] = useState<string | null>(null);
  const [cerrado, setCerrado] = useState(false);
  // Coreografía del pedido: la consulta entra por la izquierda (in), se acopla
  // al motor mientras piensa (think) y sale hacia la derecha con la respuesta (out)
  const [flight, setFlight] = useState<{ text: string; stage: "in" | "think" | "out" } | null>(null);
  // Demo ambiental (sin interacción del usuario): muestra el razonamiento en loop
  const [demo, setDemo] = useState<DemoFlight | null>(null);
  const [reducedMotion, setReducedMotion] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const happyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const location = useLocation();
  useDuenioHomy();
  const preguntar = useHomy((s) => s.preguntar);
  const cupo = useHomy((s) => s.cupo);
  const turno = useHomy((s) => (turnoId ? s.turnos.find((t) => t.id === turnoId) ?? null : null));

  // Geometría de la escena: la respuesta tiene que posarse afuera de la barra
  // y desvanecerse contra el borde REAL de la página → se mide la barra, el
  // viewport y el ancho de la propia tarjeta.
  const barWrapRef = useRef<HTMLDivElement>(null);
  const respChipRef = useRef<HTMLSpanElement>(null);
  const [geo, setGeo] = useState({ vw: 1280, barW: 576, respW: 300 });

  useEffect(() => {
    const measure = () => {
      const bar = barWrapRef.current;
      if (!bar) return;
      const vw = window.innerWidth;
      const barW = bar.getBoundingClientRect().width;
      setGeo((g) => (g.vw !== vw || g.barW !== barW ? { ...g, vw, barW } : g));
    };
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, []);

  // Cuando monta la tarjeta de respuesta, medir su ancho real
  useEffect(() => {
    if (demo?.kind !== "a") return;
    const el = respChipRef.current;
    const bar = barWrapRef.current;
    if (!el || !bar || el.offsetWidth === 0) return;
    const vw = window.innerWidth;
    const barW = bar.getBoundingClientRect().width;
    setGeo((g) =>
      g.respW !== el.offsetWidth || g.vw !== vw || g.barW !== barW
        ? { vw, barW, respW: el.offsetWidth }
        : g
    );
  }, [demo?.kind, demo?.q]);

  const askHomy = useCallback(
    async (question: string, lat?: number | null, lng?: number | null) => {
      const trimmed = question.trim();
      if (trimmed.length < 4 || useHomy.getState().ocupado) return;

      setPhase("thinking");
      setCerrado(false);
      setFlight({ text: trimmed, stage: "in" });
      try {
        // mismo súper agente para visitantes y logueados (el cupo lo cuenta el servidor)
        const pendiente = preguntar(trimmed, { puerta: "home_buscador", pagina: rutaActual(), lat, lng });
        const ultimo = useHomy.getState().turnos.at(-1);
        if (ultimo?.rol === "homy") setTurnoId(ultimo.id);
        await pendiente;
      } finally {
        // el texto queda en la barra: el usuario puede releer y corregir su pedido
        setPhase("done");
        inputRef.current?.blur();
        setFlight((f) => (f ? { ...f, stage: "out" } : null));
        if (happyTimer.current) clearTimeout(happyTimer.current);
        happyTimer.current = setTimeout(() => setPhase("idle"), 1900);
      }
    },
    [preguntar]
  );

  // Sin auto-envío: la consulta sale solo con Enter o el botón (nunca por
  // inactividad, que gastaba IA sin que el usuario lo pidiera).
  const onChange = (next: string) => {
    setValue(next);
    if (debounceRef.current) clearTimeout(debounceRef.current);
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
      setFlight(null);
    },
    []
  );

  // prefers-reduced-motion: la demo ambiental no corre si el usuario la pide
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  // NUNCA deja de aparecer (pedido explícito): la demo sigue aunque el usuario
  // enfoque, escriba o pase el mouse — los chips vuelan POR FUERA de la barra
  // y no pisan nada. Solo cede el escenario mientras una consulta real está
  // en curso (vuelo del usuario, pensando o respuesta del agente en pantalla).
  const ambientAllowed = !reducedMotion && phase === "idle" && !flight;

  // Loop de la demo: consulta (izq → motor) · respuesta (motor → der).
  // Un elemento por vez; cada etapa espera a que la anterior termine.
  useEffect(() => {
    if (!ambientAllowed) return;
    let alive = true;
    const timers: ReturnType<typeof setTimeout>[] = [];
    const wait = (ms: number) =>
      new Promise<void>((res) => {
        const t = setTimeout(res, ms);
        timers.push(t);
      });
    (async () => {
      // Cooldown al (re)iniciar: sin parpadeos cuando el mouse cruza la barra
      await wait(DEMO_T.restart);
      if (!alive) return;
      while (alive) {
        for (let i = 0; i < DEMO_PAIRS.length && alive; i += 1) {
          const { q, a } = DEMO_PAIRS[i];
          // 1) La consulta vuela desde la izquierda y, al llegar, se disuelve
          //    EN el borde del vidrio (sin entrar a la barra: el placeholder
          //    de adentro nunca se entera)
          setDemo({ kind: "q", q });
          await wait(DEMO_T.qFly);
          if (!alive) return;
          setDemo(null); // respiro: la escena queda vacía un instante (sin pisarse)
          await wait(DEMO_T.gap);
          if (!alive) return;
          // 2) La respuesta surge desde detrás del vidrio hacia afuera de la
          //    barra, se deja leer y se desvanece contra el borde de la página
          setDemo({ kind: "a", stage: "in", q, a });
          await wait(DEMO_T.aIn);
          if (!alive) return;
          setDemo({ kind: "a", stage: "hold", q, a });
          await wait(DEMO_T.aHold);
          if (!alive) return;
          setDemo({ kind: "a", stage: "out", q, a });
          await wait(DEMO_T.aOut + DEMO_T.next);
          if (!alive) return;
        }
      }
    })();
    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      setDemo(null);
    };
  }, [ambientAllowed]);

  const placeholderText = useTypewriter(!focused && value === "" && phase !== "thinking");
  // Placeholder y demo son dos cosas distintas que conviven: la máquina de
  // escribir escribe SIEMPRE (sin cortes) y los chips vuelan por FUERA de la
  // barra, disolviéndose en el borde sin pisar nunca el texto.
  const showPlaceholder = placeholderText || "¿Qué necesita tu hogar?";

  const homyState: HomyState = useMemo(() => {
    if (phase === "thinking") return "thinking";
    if (phase === "done") return "happy";
    if (focused || value.length > 0) return "listening";
    // La demo también le cuenta la historia a la mascota
    if (demo?.kind === "q") return "listening";
    if (demo?.kind === "a") return "happy";
    return "idle";
  }, [phase, focused, value, demo]);

  const busy = phase === "thinking";

  // En móvil la barra ocupa casi todo el ancho: no hay lugar para los chips
  // laterales → la demo ambiental pasa a un slot centrado debajo de la barra.
  const compact = geo.vw < 640;
  const mobileDemo = compact ? demo : null;

  return (
    <MotionConfig reducedMotion="user">
    <div className="mx-auto w-full max-w-6xl">
      {/* Homy flotando detrás de la barra: las piernas quedan ocultas
          tras el borde superior (z-0), nunca tapa el texto del input */}
      <div ref={barWrapRef} className="relative z-10 mx-auto w-full max-w-xl">
        <div
          aria-hidden
          className="pointer-events-none relative z-0 mx-auto w-fit origin-bottom animate-float-slow mb-[-26px] sm:mb-[-34px]"
        >
          <Homy size={88} state={homyState} />
        </div>

        {/* Escenario ambiental DETRÁS del vidrio (z-[5] queda por debajo del
            form z-10): el backdrop-filter de la barra esmerila lo que roza el
            borde por detrás → la punta de la consulta se funde con el vidrio
            al desvanecerse y la respuesta emerge esmerilada desde detrás. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 z-[5] flex h-14 items-center sm:h-16"
        >
          {/* CONSULTA (desktop): anclada por su borde DERECHO al borde izquierdo de la
              barra (right-full). Vuela legible desde la izquierda, se frena al
              llegar al vidrio y se disuelve EN el borde: su punta apenas se
              asoma detrás del vidrio (≤6px) — NUNCA entra a la barra ni pisa
              al placeholder, que escribe siempre por dentro (son dos cosas
              distintas que conviven sin tocarse). */}
          {!compact && demo?.kind === "q" &&
            (() => {
              const gapPx = Math.max(0, (geo.vw - geo.barW) / 2);
              const startX = -Math.min(120, Math.max(34, gapPx - 12));
              return (
                <motion.span
                  data-demo="q"
                  initial={{ opacity: 0, x: startX, scale: 0.92 }}
                  animate={{
                    opacity: [0, 1, 1, 0],
                    x: [startX, startX * 0.5, -14, 6],
                    scale: [0.92, 1, 0.99, 0.95],
                  }}
                  transition={{
                    duration: DEMO_T.qFly / 1000,
                    times: [0, 0.3, 0.78, 1],
                    ease: "easeInOut",
                  }}
                  className="homy-flight-chip absolute top-1/2 right-full max-w-[min(62vw,300px)] -translate-y-1/2 px-3.5 py-1.5 sm:max-w-[340px]"
                >
                  <Sparkles className="size-3.5 shrink-0 text-tech" aria-hidden />
                  <span className="min-w-0 truncate text-[13px] font-bold text-navy">
                    {demo.q}
                  </span>
                </motion.span>
              );
            })()}

          {/* RESPUESTA (desktop): arranca escondida detrás del vidrio (x:-44), surge
              afuera de la barra, se deja leer y deriva hasta desvanecerse
              contra el borde real de la página (medido en vivo) */}
          {!compact && demo?.kind === "a" &&
            (() => {
              const gapPx = Math.max(0, (geo.vw - geo.barW) / 2);
              const flotante = gapPx < 130; // poco lugar: flota sobre el borde derecho de la barra
              const restX = flotante
                ? gapPx - 14
                : Math.min(24 + geo.respW, gapPx - 16);
              const restY = flotante ? -46 : 0;
              const exitX = gapPx + 40; // el borde derecho termina ~40px pasada la página
              return (
                <motion.span
                  ref={respChipRef}
                  data-demo="a"
                  initial={{ opacity: 0, x: -44, y: 0 }}
                  animate={
                    demo.stage === "in"
                      ? { opacity: 1, x: restX, y: restY }
                      : demo.stage === "hold"
                        ? { opacity: 1, x: restX, y: restY, scale: [1, 1.015, 1] }
                        : { opacity: 0, x: exitX, y: restY - 8, scale: 0.97 }
                  }
                  transition={
                    demo.stage === "in"
                      ? { duration: DEMO_T.aIn / 1000, ease: [0.22, 1, 0.36, 1] }
                      : demo.stage === "hold"
                        ? {
                            scale: { duration: DEMO_T.aHold / 1000, ease: "easeInOut" },
                            default: { duration: 0.3 },
                          }
                        : { duration: DEMO_T.aOut / 1000, ease: [0.6, 0.05, 0.9, 0.4] }
                  }
                  style={
                    flotante
                      ? undefined
                      : { maxWidth: Math.max(150, Math.min(340, gapPx - 40)) }
                  }
                  className="homy-flight-chip homy-flight-chip--ai ml-auto max-w-[min(58vw,280px)] px-3.5 py-1.5"
                >
                  <BadgeCheck className="size-3.5 shrink-0 text-tech" aria-hidden />
                  <span className="min-w-0 truncate text-[12.5px] font-bold text-navy/85">
                    {demo.a}
                  </span>
                </motion.span>
              );
            })()}
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
            placeholder={showPlaceholder}
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
        {/* Vuelo de la consulta REAL (usuario): entra por la izquierda, se acopla al motor
            y sale hacia la derecha cuando llega la respuesta (solo transform/opacity) */}
        {flight && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 left-1/2 z-20 flex w-0 items-center"
          >
            <motion.span
              initial={{ opacity: 0, x: -270, scale: 0.7 }}
              animate={
                flight.stage === "in"
                  ? { opacity: 1, x: "-50%", scale: 1 }
                  : flight.stage === "think"
                    ? {
                        opacity: 1,
                        x: "-50%",
                        scale: [1, 1.06, 1],
                      }
                    : { opacity: 0, scale: 0.9 }
              }
              transition={
                flight.stage === "in"
                  ? { type: "spring", stiffness: 320, damping: 26 }
                  : flight.stage === "think"
                    ? {
                        scale: { repeat: Infinity, duration: 1.15, ease: "easeInOut" },
                        default: { duration: 0.25 },
                      }
                    : { duration: 0.45, ease: "easeIn" }
              }
              onAnimationComplete={() => {
                if (flight.stage === "in") setFlight((f) => (f ? { ...f, stage: "think" } : null));
                if (flight.stage === "out") setFlight(null);
              }}
              className="homy-flight-chip max-w-[300px] px-3.5 py-1.5 sm:max-w-[380px]"
            >
              <Sparkles className="size-3.5 shrink-0 text-tech" aria-hidden />
              <span className="min-w-0 truncate text-[13px] font-bold text-navy">
                {flight.text}
              </span>
            </motion.span>
          </div>
        )}

        </form>

        {/* Slot de la demo ambiental en MÓVIL: centrado debajo de la barra,
            siempre visible (nunca sale del viewport ni pisa el placeholder).
            La consulta aparece, se deja leer y se desvanece; luego la respuesta.
            La altura queda reservada (h-9) para que nada salte. */}
        {compact && (
          <div aria-hidden className="pointer-events-none relative z-[6] mt-2 flex h-9 items-start justify-center">
            {mobileDemo && (mobileDemo.kind === "q" ? (
              <motion.span
                key={`mq-${mobileDemo.q}`}
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={{ opacity: [0, 1, 1, 0], y: [12, 0, 0, -6], scale: [0.95, 1, 1, 0.97] }}
                transition={{ duration: DEMO_T.qFly / 1000, times: [0, 0.25, 0.8, 1], ease: "easeInOut" }}
                className="homy-flight-chip max-w-[min(92vw,360px)] px-3.5 py-1.5"
              >
                <Sparkles className="size-3.5 shrink-0 text-tech" aria-hidden />
                <span className="min-w-0 truncate text-[12.5px] font-bold text-navy">{mobileDemo.q}</span>
              </motion.span>
            ) : (
              <motion.span
                ref={respChipRef}
                key={`ma-${mobileDemo.a}`}
                initial={{ opacity: 0, y: 12, scale: 0.95 }}
                animate={
                  mobileDemo.stage === "in" || mobileDemo.stage === "hold"
                    ? { opacity: 1, y: 0, scale: mobileDemo.stage === "hold" ? [1, 1.015, 1] : 1 }
                    : { opacity: 0, y: -6, scale: 0.97 }
                }
                transition={
                  mobileDemo.stage === "in"
                    ? { duration: DEMO_T.aIn / 1000, ease: [0.22, 1, 0.36, 1] }
                    : mobileDemo.stage === "hold"
                      ? { scale: { duration: DEMO_T.aHold / 1000, ease: "easeInOut" }, default: { duration: 0.3 } }
                      : { duration: DEMO_T.aOut / 1000, ease: [0.6, 0.05, 0.9, 0.4] }
                }
                className="homy-flight-chip homy-flight-chip--ai max-w-[min(92vw,360px)] px-3.5 py-1.5"
              >
                <BadgeCheck className="size-3.5 shrink-0 text-tech" aria-hidden />
                <span className="min-w-0 truncate text-[12.5px] font-bold text-navy/85">{mobileDemo.a}</span>
              </motion.span>
            ))}
          </div>
        )}

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

      {/* Panel de respuesta del súper agente (streaming: pasos, texto, tarjetas) */}
      <AnimatePresence>
        {turno && !cerrado && (
          <motion.div
            key="homy-reply"
            initial={{ opacity: 0, x: 110, scale: 0.97 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 140, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 260, damping: 24 }}
            className="relative z-10 mx-auto mt-7 w-[min(92vw,640px)]"
            data-homy-hero-reply={turno.estado}
          >
            <div className="homy-glass-strong rounded-[28px] p-5 text-left sm:p-6">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <Homy size={40} state={turno.estado === "streaming" ? "thinking" : "idle"} />
                  <div>
                    <p className="flex items-center gap-2 text-sm font-bold text-navy">
                      Homy
                      <span className="inline-flex items-center gap-1 rounded-full bg-ai-soft px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-tech">
                        <Sparkles className="size-3" aria-hidden />
                        Agente IA
                      </span>
                    </p>
                    <p className="text-xs text-navy/45">Responde con datos reales de HomIA</p>
                  </div>
                </div>
                <button
                  onClick={() => setCerrado(true)}
                  aria-label="Cerrar respuesta"
                  className="homy-focus grid size-9 place-items-center rounded-full text-navy/40 transition-colors hover:bg-confort hover:text-navy"
                >
                  <X className="size-4" />
                </button>
              </div>

              {/* pasos en vivo */}
              {turno.estado === "streaming" && (turno.pasos?.length ?? 0) > 0 && (
                <ul className="mt-4 space-y-1" aria-hidden>
                  {turno.pasos!.slice(-3).map((p, i, arr) => (
                    <li key={`${p}-${i}`} className="flex items-center gap-2 text-[13px] font-semibold text-navy/55">
                      {i === arr.length - 1 && !turno.texto ? (
                        <Loader2 className="size-3.5 animate-spin text-ai" />
                      ) : (
                        <span className="size-1.5 rounded-full bg-ai" />
                      )}
                      {p}
                    </li>
                  ))}
                </ul>
              )}
              {turno.estado === "streaming" && !turno.texto && !(turno.pasos?.length) && (
                <p className="mt-4 flex items-center gap-2 text-[13px] font-semibold text-navy/55">
                  <Loader2 className="size-3.5 animate-spin text-ai" aria-hidden /> Pensando tu pedido…
                </p>
              )}

              {/* el texto se escribe a medida que llega */}
              <div aria-live="polite" aria-busy={turno.estado === "streaming"}>
                {turno.texto && (
                  <p className="mt-4 whitespace-pre-line text-[15px] leading-relaxed text-navy/85">
                    {turno.texto}
                    {turno.estado === "streaming" && <span className="ml-0.5 inline-block h-4 w-1.5 animate-pulse bg-ai align-middle" aria-hidden />}
                  </p>
                )}
              </div>
              {turno.pregunta && turno.estado === "listo" && !turno.texto.includes(turno.pregunta) && (
                <p className="mt-2 font-bold text-navy">{turno.pregunta}</p>
              )}
              {turno.degradado && (
                <p className="mt-2 text-xs text-navy/40">Respuesta armada sin IA (búsqueda directa en HomIA).</p>
              )}

              {turno.tarjetas && <TarjetasHomy tarjetas={turno.tarjetas} max={4} />}
              {turno.acciones && <AccionesHomy acciones={turno.acciones} />}

              {/* aviso de cupo (solo cuando quedan pocas) */}
              {cupo && cupo.restantes > 0 && cupo.restantes <= 3 && turno.estado !== "streaming" && (
                <p className="mt-4 rounded-2xl bg-action/8 px-3.5 py-2 text-[12.5px] font-semibold text-[#9a3412]" data-homy-cupo>
                  Te queda{cupo.restantes === 1 ? "" : "n"} {cupo.restantes} consulta{cupo.restantes === 1 ? "" : "s"} hoy
                  {cupo.tipo === "visitante" ? (
                    <>
                      {" "}sin cuenta.{" "}
                      <button
                        type="button"
                        onClick={() => navigate(`/registrarse?volver=${encodeURIComponent(rutaActual())}`)}
                        className="font-extrabold underline"
                      >
                        Creá tu cuenta gratis
                      </button>{" "}
                      y tenés 60 por día.
                    </>
                  ) : "."}
                </p>
              )}

              {turno.estado === "listo" && (turno.sugerencias?.length ?? 0) > 0 && (
                <div className="mt-5 border-t border-line/70 pt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-navy/40">¿Seguimos por acá?</p>
                  <div className="mt-2.5 flex flex-wrap gap-2">
                    {turno.sugerencias!.map((s) => (
                      <button
                        key={s}
                        onClick={() => void askHomy(s, location.lat, location.lng)}
                        className="homy-focus rounded-full border border-tech/20 bg-white/70 px-3.5 py-1.5 text-[13px] font-medium text-tech transition-all hover:border-tech/40 hover:bg-tech/5 active:scale-[0.97]"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {turno.estado !== "streaming" && (
                <button
                  type="button"
                  onClick={() => window.dispatchEvent(new CustomEvent("homy:open"))}
                  className="homy-focus mt-4 inline-flex items-center gap-1.5 text-[13px] font-bold text-tech hover:underline"
                >
                  <MessageCircle className="size-4" aria-hidden /> Seguir la conversación en el chat
                  <ArrowRight className="size-3.5" aria-hidden />
                </button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
    </MotionConfig>
  );
}
