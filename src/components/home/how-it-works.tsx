"use client";

import { motion } from "framer-motion";
import { MessagesSquare, ClipboardList, ShieldCheck } from "lucide-react";
import { SectionHeading } from "@/components/home/section-heading";

const STEPS = [
  {
    icon: MessagesSquare,
    num: "01",
    title: "Contale qué necesitás",
    body: "Escribí con lenguaje natural, como se lo contarías a un vecino de confianza. Homy, nuestro agente de IA, interpreta tu necesidad y la traduce en un pedido técnico claro y completo.",
    accent: "text-tech",
    chipBg: "bg-tech/10",
  },
  {
    icon: ClipboardList,
    num: "02",
    title: "Los agentes arman tu presupuesto",
    body: "La IA coordina mano de obra, materiales y tiempos en un presupuesto integral. Todo a la vista, sin letra chica: sabés exactamente qué pagás y para qué, antes de aprobar nada.",
    accent: "text-action",
    chipBg: "bg-action/10",
  },
  {
    icon: ShieldCheck,
    num: "03",
    title: "Aprobás y HomIA coordina",
    body: "Tu pago queda protegido en escrow y se libera recién cuando aprobás el trabajo. ¿Sobró material? Se devuelve al proveedor y tu reembolso se procesa automáticamente.",
    accent: "text-tech",
    chipBg: "bg-tech/10",
  },
];

export function HowItWorks() {
  return (
    <section
      id="como-funciona"
      className="scroll-mt-24 py-24 sm:py-28"
      aria-label="Cómo funciona HomIA"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker="Cómo funciona"
          title="Tres pasos. Cero estrés."
          description="HomIA se ocupa de la complejidad para que vos solo tomes una decisión: aprobar. Así de simple funciona un hogar bien cuidado."
        />

        <div className="relative mt-16 grid gap-6 md:grid-cols-3 md:gap-8">
          {/* Línea conectora (decorativa) */}
          <div
            aria-hidden
            className="absolute left-[16%] right-[16%] top-16 hidden h-px bg-gradient-to-r from-tech/10 via-ai/40 to-tech/10 md:block"
          />
          {STEPS.map((step, i) => (
            <motion.article
              key={step.num}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.55, delay: i * 0.12 }}
              className="homy-glass homy-lift group relative rounded-[28px] p-7"
            >
              <div className="flex items-center justify-between">
                <span
                  className={`grid size-14 place-items-center rounded-3xl ${step.chipBg} transition-transform duration-300 group-hover:scale-110`}
                >
                  <step.icon className={`size-6 ${step.accent}`} aria-hidden />
                </span>
                <span className="text-4xl font-extrabold text-navy/8 select-none">
                  {step.num}
                </span>
              </div>
              <h3 className="mt-6 text-lg font-bold text-navy">
                {step.title}
              </h3>
              <p className="mt-3 text-[15px] leading-relaxed text-navy/60">
                {step.body}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
