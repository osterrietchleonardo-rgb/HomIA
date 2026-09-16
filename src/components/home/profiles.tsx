"use client";

import { motion } from "framer-motion";
import { UserRound, HardHat, Package, ArrowRight, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { SectionHeading } from "@/components/home/section-heading";

const PROFILES = [
  {
    icon: UserRound,
    role: "Para clientes",
    headline: "Recuperá tu tiempo y tu tranquilidad",
    points: [
      "Describí tu necesidad en palabras simples",
      "Aprobás presupuestos integrales con un clic",
      "Tu pago protegido hasta la conformidad final",
      "Sobrantes devueltos y reembolsados automáticamente",
    ],
    cta: "Buscar un servicio",
    highlight: false,
  },
  {
    icon: HardHat,
    role: "Para profesionales",
    headline: "Trabajos a tu medida, cobros garantizados",
    points: [
      "Respondé licitaciones seleccionadas para tu oficio",
      "Agendá visitas coordinadas por la IA",
      "Carrito de materiales pre-pagado en proveedores",
      "Cobro asegurado vía escrow, sin perseguir pagos",
    ],
    cta: "Quiero recibir licitaciones",
    highlight: true,
  },
  {
    icon: Package,
    role: "Para proveedores",
    headline: "Nuevas ventas, stock bajo control",
    points: [
      "Gestioná tu stock con paneles simples y claros",
      "Recibís pedidos pre-pagados, listos para despachar",
      "Aprobás devoluciones de sobrantes sin fricción",
      "Un canal nuevo de ventas, sin costo de entrada",
    ],
    cta: "Quiero vender en HomIA",
    highlight: false,
  },
];

export function Profiles() {
  const { toast } = useToast();

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
                      ? "grid size-12 place-items-center rounded-2xl bg-action/12"
                      : "grid size-12 place-items-center rounded-2xl bg-tech/10"
                  }
                >
                  <p.icon
                    className={p.highlight ? "size-6 text-action" : "size-6 text-tech"}
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
              <Button
                variant={p.highlight ? "default" : "outline"}
                className={
                  p.highlight
                    ? "mt-7 w-full rounded-full bg-action font-semibold text-white hover:bg-action-2"
                    : "mt-7 w-full rounded-full border-line font-semibold text-navy hover:bg-confort"
                }
                onClick={() =>
                  toast({
                    title: "Muy pronto: registro de la comunidad",
                    description:
                      "Estamos preparando el ingreso para que sea simple y seguro. ¡Te va a encantar lo que se viene!",
                  })
                }
              >
                {p.cta}
                <ArrowRight className="size-4" aria-hidden />
              </Button>
            </motion.article>
          ))}
        </div>
      </div>
    </section>
  );
}
