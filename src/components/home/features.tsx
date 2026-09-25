"use client";

import { motion } from "framer-motion";
import {
  Sparkles,
  MapPin,
  ReceiptText,
  ShieldCheck,
  Recycle,
  Star,
} from "lucide-react";
import { SectionHeading } from "@/components/home/section-heading";

const FEATURES = [
  {
    icon: Sparkles,
    tag: "Homy",
    title: "Contalo como te salga",
    body: "No hace falta saber cómo se llama la pieza. Escribís «pierde agua abajo de la bacha» y Homy te dice qué hace falta, quién lo vende y qué profesionales hay.",
    accent: "text-[#0092C4]",
    chip: "homy-chip-ai",
    glow: "group-hover:shadow-[0_24px_54px_-20px_rgba(0,196,255,0.45)]",
    border: "group-hover:border-ai/40",
  },
  {
    icon: MapPin,
    tag: null,
    title: "Gente de tu zona",
    body: "En el buscador elegís hasta cuántos kilómetros te sirve, de 1 a 100, y ves en el mapa a los profesionales y los materiales que hay cerca.",
    accent: "text-tech",
    chip: "homy-chip-blue",
    glow: "group-hover:shadow-[0_24px_54px_-20px_rgba(29,99,184,0.4)]",
    border: "group-hover:border-tech/40",
  },
  {
    icon: ReceiptText,
    tag: null,
    title: "El precio, antes de empezar",
    body: "El profesional te pasa el precio de su trabajo y te propone cada material con cantidad y precio. Aprobás o rechazás cada uno: nada se suma sin que lo veas.",
    accent: "text-action",
    chip: "homy-chip-orange",
    glow: "group-hover:shadow-[0_24px_54px_-20px_rgba(255,90,31,0.4)]",
    border: "group-hover:border-action/40",
  },
  {
    icon: ShieldCheck,
    tag: null,
    title: "Sin adelantos",
    body: "Pagás la factura cuando el trabajo está hecho, por Mercado Pago o en efectivo. La plata va directo a quien hizo el trabajo. Con Mercado Pago se suma un cargo de servicio del 1%; en efectivo, nada.",
    accent: "text-tech",
    chip: "homy-chip-mint",
    glow: "group-hover:shadow-[0_24px_54px_-20px_rgba(29,99,184,0.4)]",
    border: "group-hover:border-tech/40",
  },
  {
    icon: Recycle,
    tag: "30 días",
    title: "Lo que sobra, vuelve",
    body: "Te sobraron dos latas de pintura o cinco metros de caño: sacás una foto, lo cargás en la app y se lo devolvés a quien te lo vendió. Si pagaste con Mercado Pago, la plata vuelve sola; si fue en efectivo, te la dan en mano.",
    accent: "text-action",
    chip: "homy-chip-orange",
    glow: "group-hover:shadow-[0_24px_54px_-20px_rgba(255,90,31,0.4)]",
    border: "group-hover:border-action/40",
  },
  {
    icon: Star,
    tag: null,
    title: "Reseñas de trabajos hechos",
    body: "Solo deja reseña quien contrató o compró por HomIA, y no se pueden editar. Van con estrellas, comentario y fotos. El profesional también califica al cliente, así que los dos cuidan el trato.",
    accent: "text-[#B98A00]",
    chip: "homy-chip-gold",
    glow: "group-hover:shadow-[0_24px_54px_-20px_rgba(255,199,0,0.45)]",
    border: "group-hover:border-gold/50",
  },
];

export function Features() {
  return (
    <section
      id="beneficios"
      className="scroll-mt-24 py-24 sm:py-28"
      aria-label="Por qué contratar por HomIA"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker="Beneficios"
          title="Menos riesgo que llamar a un número que te pasaron."
          description="Lo que suele salir mal cuando contratás a alguien, acá tiene respuesta: sabés a quién metés en tu casa, ves el precio antes de empezar y no dejás seña."
        />

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.article
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.1 }}
              className={`homy-glass homy-lift homy-card-glow group relative rounded-[26px] p-7 ${f.glow} ${f.border}`}
            >
              {f.tag && (
                <span className="absolute right-5 top-5 rounded-full bg-navy/5 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-navy/50">
                  {f.tag}
                </span>
              )}
              <span
                className={`grid size-13 place-items-center rounded-2xl ${f.chip} transition-transform duration-300 group-hover:scale-110`}
              >
                <f.icon className={`size-6 ${f.accent}`} aria-hidden />
              </span>
              <h3 className="mt-5 text-[17px] font-bold text-navy">
                {f.title}
              </h3>
              <p className="mt-2.5 text-[15px] leading-relaxed text-navy/60">
                {f.body}
              </p>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
