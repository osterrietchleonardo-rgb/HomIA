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
    tag: "IA",
    title: "Búsqueda en lenguaje natural",
    body: "Contás qué necesitás con tus palabras y Homy lo traduce a un pedido técnico. Sin formularios eternos ni categorías raras: tu forma de hablar alcanza.",
    accent: "text-ai",
    chip: "bg-ai/12",
    glow: "group-hover:shadow-[0_24px_54px_-20px_rgba(0,196,255,0.45)]",
    border: "group-hover:border-ai/40",
  },
  {
    icon: MapPin,
    tag: null,
    title: "Geolocalización precisa",
    body: "Encontramos profesionales verificados cerca de tu casa, filtrando por zona real y disponibilidad. La distancia deja de ser un problema.",
    accent: "text-tech",
    chip: "bg-tech/10",
    glow: "group-hover:shadow-[0_24px_54px_-20px_rgba(29,99,184,0.4)]",
    border: "group-hover:border-tech/40",
  },
  {
    icon: ReceiptText,
    tag: null,
    title: "Presupuesto integral",
    body: "Mano de obra y materiales en un único presupuesto transparente. Ves cada línea antes de aprobar: nada de sorpresas a mitad del trabajo.",
    accent: "text-action",
    chip: "bg-action/10",
    glow: "group-hover:shadow-[0_24px_54px_-20px_rgba(255,90,31,0.4)]",
    border: "group-hover:border-action/40",
  },
  {
    icon: ShieldCheck,
    tag: null,
    title: "Tu dinero, protegido",
    body: "El pago queda retenido en escrow y se libera recién cuando aprobás el trabajo terminado. La tranquilidad de pagar con garantía real.",
    accent: "text-tech",
    chip: "bg-tech/10",
    glow: "group-hover:shadow-[0_24px_54px_-20px_rgba(29,99,184,0.4)]",
    border: "group-hover:border-tech/40",
  },
  {
    icon: Recycle,
    tag: "Circular",
    title: "Logística inversa de sobrantes",
    body: "¿Sobró pintura, caños o cables? Se marcan en la app, el proveedor los recibe de vuelta y tu reembolso se procesa automáticamente.",
    accent: "text-action",
    chip: "bg-action/10",
    glow: "group-hover:shadow-[0_24px_54px_-20px_rgba(255,90,31,0.4)]",
    border: "group-hover:border-action/40",
  },
  {
    icon: Star,
    tag: null,
    title: "Reseñas 360°",
    body: "Clientes, profesionales y proveedores se califican entre sí. La reputación se construye con transparencia y se refleja en cada estrella dorada.",
    accent: "text-gold",
    chip: "bg-gold/15",
    glow: "group-hover:shadow-[0_24px_54px_-20px_rgba(255,199,0,0.45)]",
    border: "group-hover:border-gold/50",
  },
];

export function Features() {
  return (
    <section
      id="beneficios"
      className="scroll-mt-24 py-24 sm:py-28"
      aria-label="Beneficios de HomIA"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker="Beneficios"
          title="La seriedad de un servicio profesional, con la inteligencia de la IA."
          description="Cada detalle de HomIA está pensado para que confiar sea lo más fácil: tecnología que trabaja, reglas claras y tu dinero siempre protegido."
        />

        <div className="mt-16 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f, i) => (
            <motion.article
              key={f.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.5, delay: (i % 3) * 0.1 }}
              className={`homy-glass homy-lift group relative rounded-[26px] p-7 ${f.glow} ${f.border}`}
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
