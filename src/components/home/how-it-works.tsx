"use client";

import { motion } from "framer-motion";
import { MessagesSquare, ClipboardList, ShieldCheck } from "lucide-react";
import { SectionHeading } from "@/components/home/section-heading";

const STEPS = [
  {
    icon: MessagesSquare,
    num: "01",
    title: "Contá qué pasó",
    body: "Publicás el trabajo con hasta 4 fotos, o le preguntás a Homy con tus palabras. A los profesionales de ese oficio les llega el aviso y te mandan su presupuesto. Si ya sabés a quién querés, lo contratás directo desde el directorio.",
    accent: "text-tech",
    chipBg: "bg-tech/10",
  },
  {
    icon: ClipboardList,
    num: "02",
    title: "Elegí con datos, no a ciegas",
    body: "Cada presupuesto trae el precio, el plazo en días y quién lo manda: si validó su DNI, sus estrellas y sus obras. Le escribís por chat antes de decidir. Los materiales te los propone uno por uno, con precio, y aprobás cada uno.",
    accent: "text-action",
    chipBg: "bg-action/10",
  },
  {
    icon: ShieldCheck,
    num: "03",
    title: "Pagás cuando está terminado",
    body: "La factura te llega a la app y la pagás por Mercado Pago o en efectivo. La plata va directo al profesional: HomIA no la retiene. Si sobró material, se lo devolvés a quien te lo vendió y te reintegran lo que pagaste por eso.",
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
          title="De «se rompió» a «quedó bien», en tres pasos."
          description="No hace falta saber de tecnología. Si mandás mensajes por WhatsApp, ya sabés usar HomIA: se maneja desde el celular."
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
