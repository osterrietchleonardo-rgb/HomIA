"use client";

import { motion } from "framer-motion";
import { UserRound, HardHat, Package, ArrowRight, Check, Compass } from "lucide-react";
import { navigate } from "@/lib/router";
import { SectionHeading } from "@/components/home/section-heading";

const PROFILES = [
  {
    icon: UserRound,
    role: "Para clientes",
    headline: "Recuperá tu tiempo y tu tranquilidad",
    points: [
      "Describí tu necesidad en palabras simples",
      "Aprobás presupuestos integrales con un clic",
      "Pagás al finalizar, por Mercado Pago o efectivo",
      "Devolvés los sobrantes al local y recuperás la plata",
    ],
    cta: "Buscar un servicio",
    href: "/buscar?mode=cliente",
    highlight: false,
  },
  {
    icon: HardHat,
    role: "Para profesionales",
    headline: "Trabajos a tu medida, cobros sin vueltas",
    points: [
      "Ofertá en trabajos publicados de tu oficio",
      "Presupuestá mano de obra y materiales en un solo lugar",
      "Retirá materiales a cuenta del proyecto en proveedores vinculados",
      "Cobrás al finalizar, por Mercado Pago o efectivo, sin comisión",
    ],
    cta: "Quiero recibir licitaciones",
    href: "/registrarse?rol=profesional",
    highlight: true,
  },
  {
    icon: Package,
    role: "Para proveedores",
    headline: "Nuevas ventas, stock bajo control",
    points: [
      "Gestioná tu stock sobre un catálogo de 1247 materiales",
      "Recibís pedidos y cobrás por Mercado Pago o efectivo",
      "Aceptás devoluciones de sobrantes desde la app",
      "14 días gratis, después desde $50.000/mes",
    ],
    cta: "Quiero vender en HomIA",
    href: "/registrarse?rol=proveedor",
    highlight: false,
  },
];

export function Profiles() {
  return (
    <section
      id="comunidad"
      className="scroll-mt-24 py-24 sm:py-28"
      aria-label="Perfiles de la comunidad HomIA"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          kicker="Una comunidad, tres protagonistas"
          title="Todos ganan cuando el hogar funciona."
          description="Clientes, profesionales y proveedores conectados en un mismo ecosistema, con reglas claras para cada uno y beneficios reales para todos."
        />

        <div className="mt-16 grid gap-6 md:grid-cols-3">
          {PROFILES.map((p, i) => (
            <motion.article
              key={p.role}
              initial={{ opacity: 0, y: 26 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ duration: 0.55, delay: i * 0.12 }}
              className={
                p.highlight
                  ? "homy-glass homy-glass-featured homy-lift relative flex flex-col rounded-[30px] p-8"
                  : "homy-glass homy-lift relative flex flex-col rounded-[30px] p-8"
              }
            >
              {p.highlight && (
                <span className="absolute -top-3.5 left-8 rounded-full bg-action px-3.5 py-1 text-[11px] font-bold uppercase tracking-wide text-white shadow-lg">
                  Alta demanda
                </span>
              )}
              <div className="flex items-center gap-3">
                <span
                  className={
                    p.highlight
                      ? "homy-icon-chip size-12 !rounded-2xl homy-chip-orange"
                      : "homy-icon-chip size-12 !rounded-2xl homy-chip-blue"
                  }
                >
                  <p.icon
                    className={p.highlight ? "size-6" : "size-6"}
                    aria-hidden
                  />
                </span>
                <p className="text-sm font-bold uppercase tracking-wide text-navy/50">
                  {p.role}
                </p>
              </div>
              <h3 className="mt-5 text-xl font-extrabold leading-snug text-navy">
                {p.headline}
              </h3>
              <ul className="mt-5 flex-1 space-y-3">
                {p.points.map((point) => (
                  <li key={point} className="flex items-start gap-2.5">
                    <span
                      className={
                        p.highlight
                          ? "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-action/12"
                          : "mt-0.5 grid size-5 shrink-0 place-items-center rounded-full bg-tech/10"
                      }
                    >
                      <Check
                        className={
                          p.highlight
                            ? "size-3 text-action"
                            : "size-3 text-tech"
                        }
                        aria-hidden
                      />
                    </span>
                    <span className="text-[14.5px] leading-snug text-navy/70">
                      {point}
                    </span>
                  </li>
                ))}
              </ul>
              <button
                onClick={() => navigate(p.href)}
                className={
                  p.highlight
                    ? "homy-btn-primary mt-7 w-full py-3 text-[14.5px]"
                    : "mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full border border-line bg-white/60 py-3 text-[14.5px] font-semibold text-navy transition-all duration-300 hover:-translate-y-0.5 hover:border-tech/40 hover:bg-white hover:shadow-[0_12px_28px_-14px_rgba(29,99,184,0.4)]"
                }
              >
                {p.cta}
                <ArrowRight className="size-4" aria-hidden />
              </button>
            </motion.article>
          ))}
        </div>

        {/* banda CTA al directorio de la comunidad */}
        <motion.div
          initial={{ opacity: 0, y: 26 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-40px" }}
          transition={{ duration: 0.55, delay: 0.1 }}
          className="homy-glass homy-glass-featured homy-lift relative mt-8 flex flex-col items-start gap-5 overflow-hidden rounded-[30px] p-7 sm:p-9 md:flex-row md:items-center"
        >
          <span aria-hidden className="pointer-events-none absolute -right-16 -top-20 size-56 rounded-full bg-ai/15 blur-3xl" />
          <span aria-hidden className="pointer-events-none absolute -bottom-24 -left-10 size-56 rounded-full bg-action/10 blur-3xl" />
          <span className="homy-icon-chip size-14 shrink-0 !rounded-2xl homy-chip-blue" aria-hidden>
            <Compass className="size-7" />
          </span>
          <div className="relative flex-1">
            <p className="text-[11px] font-extrabold uppercase tracking-[0.2em] text-tech">Directorio HomIA</p>
            <h3 className="mt-1.5 text-xl font-extrabold leading-snug text-navy sm:text-2xl">
              Mirá quién está en la comunidad antes de decidir
            </h3>
            <p className="mt-1.5 max-w-2xl text-[14.5px] leading-relaxed text-navy/60">
              Todos los profesionales y proveedores registrados en la app, ordenados de más a menos reseñas positivas, con su experiencia, trabajos realizados, catálogo y precios promedio. Abrí su tarjeta y escribile al toque.
            </p>
          </div>
          <div className="relative flex shrink-0 flex-col gap-2.5 sm:flex-row">
            <button
              onClick={() => navigate("/directorio")}
              className="homy-btn-primary inline-flex items-center justify-center gap-2 px-7 py-3.5 text-[15px]"
            >
              Abrir el directorio
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
