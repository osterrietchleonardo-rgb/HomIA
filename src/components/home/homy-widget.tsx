"use client";

// Botón flotante de Homy en la home (landing y home de la SPA): mismo súper
// agente, misma conversación y mismo cupo que el buscador principal.
import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X } from "lucide-react";
import { Homy } from "@/components/homy/homy-character";
import { HomyConversacion } from "@/components/homy/homy-conversacion";
import { useDuenioHomy, useHomy } from "@/components/homy/homy-store";

const SUGERENCIAS = [
  "Se me gotea la canilla, ¿qué necesito?",
  "Busco un plomero en Palermo",
  "¿Cómo funciona el pago?",
  "¿Cuánto cuesta ser proveedor?",
];

export function HomyWidget() {
  const [open, setOpen] = useState(false);
  const botonRef = useRef<HTMLButtonElement>(null);
  const { user } = useDuenioHomy();
  const ocupado = useHomy((s) => s.ocupado);

  // el buscador y otros CTA de la home abren este mismo chat
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("homy:open", onOpen);
    return () => window.removeEventListener("homy:open", onOpen);
  }, []);

  // Esc cierra y devuelve el foco al botón
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        botonRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <motion.button
        ref={botonRef}
        initial={{ scale: 0, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ delay: 1.1, type: "spring", stiffness: 260, damping: 18 }}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Cerrar chat con Homy" : "Abrir chat con Homy"}
        aria-expanded={open}
        data-homy-fab
        className="fixed bottom-5 right-5 z-50 grid size-[68px] place-items-center rounded-full border border-white/80 bg-white/85 shadow-[0_16px_40px_-12px_rgba(10,37,64,0.35)] backdrop-blur-md transition-transform hover:scale-105 active:scale-95 sm:bottom-6 sm:right-6"
      >
        <span className="pointer-events-none absolute inset-0 animate-ping rounded-full border border-ai/30 [animation-duration:2.6s]" aria-hidden />
        {open ? <X className="size-6 text-navy" aria-hidden /> : <Homy size={44} state={ocupado ? "thinking" : "idle"} />}
      </motion.button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 24, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 18, scale: 0.97 }}
            transition={{ type: "spring", stiffness: 280, damping: 26 }}
            className="fixed bottom-24 right-3 z-50 flex h-[min(620px,calc(100dvh-7.5rem))] w-[min(400px,calc(100vw-1.5rem))] flex-col overflow-hidden rounded-[28px] border border-white/70 bg-[#f6f8fb]/95 shadow-[0_32px_80px_-24px_rgba(10,37,64,0.45)] backdrop-blur-2xl sm:right-6"
            role="dialog"
            aria-label="Chat con Homy, asistente de HomIA"
            data-homy-panel
          >
            <div className="flex items-center gap-3 border-b border-line/70 bg-white/70 px-4 py-3">
              <Homy size={38} state={ocupado ? "thinking" : "idle"} />
              <div className="min-w-0 flex-1">
                <p className="text-[15px] font-extrabold text-navy">Homy</p>
                <p className="truncate text-xs text-navy/50">Responde con datos reales de HomIA</p>
              </div>
              <button
                onClick={() => { setOpen(false); botonRef.current?.focus(); }}
                aria-label="Cerrar chat"
                className="homy-focus grid size-9 place-items-center rounded-full text-navy/40 transition-colors hover:bg-confort hover:text-navy"
              >
                <X className="size-4" />
              </button>
            </div>
            <HomyConversacion
              puerta="home_flotante"
              autoFocus
              bienvenida={
                user
                  ? `¡Hola, ${user.displayName.split(" ")[0]}! Contame qué necesita tu casa o qué querés hacer en HomIA y lo buscamos con datos reales.`
                  : "¡Hola! Soy Homy. Contame qué necesita tu casa —con tus palabras— y te digo qué hace falta, quién lo tiene y a qué precio."
              }
              sugerenciasIniciales={SUGERENCIAS}
              onNavegar={() => setOpen(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
