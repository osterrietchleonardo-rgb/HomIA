"use client";

import { motion } from "framer-motion";
import {
  Bot,
  ScanSearch,
  ClipboardList,
  ShieldCheck,
  Recycle,
  Star,
} from "lucide-react";
import { SectionHeading } from "@/components/home/section-heading";
import { Homy } from "@/components/homy/homy-character";

const AGENT_NODES = [
  { icon: Bot, label: "Homy interpreta", hint: "lenguaje natural" },
  { icon: ScanSearch, label: "Matching inteligente", hint: "geolocalizado" },
  { icon: ClipboardList, label: "Presupuesto integral", hint: "obra + materiales" },
  { icon: ShieldCheck, label: "Pago al finalizar", hint: "Mercado Pago o efectivo" },
  { icon: Recycle, label: "Devolución de sobrantes", hint: "al local del proveedor" },
  { icon: Star, label: "Reputación 360°", hint: "confianza" },
];

export function AiBand() {
  return (
    <section
      id="motor-ia"
      className="homy-glass-dark relative scroll-mt-24 overflow-hidden py-24 sm:py-28"
      aria-label="Motor de inteligencia artificial de HomIA"
    >
      {/* Decoración de fondo */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-[-30%] size-[560px] -translate-x-1/2 rounded-full bg-tech/25 blur-[120px]" />
        <div className="absolute bottom-[-40%] right-[-10%] size-[420px] rounded-full bg-ai/10 blur-[100px]" />
        <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.035)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.035)_1px,transparent_1px)] bg-[size:52px_52px] [mask-image:radial-gradient(ellipse_70%_60%_at_50%_40%,black,transparent)]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <SectionHeading
          dark
          kicker="Motor HomIA"
          title="Agentes de IA trabajando para tu hogar, no solo en la pantalla."
          description="Cada pedido activa una cadena de agentes que interpretan, coordinan y verifican cada etapa. Vos ves resultados claros; detrás, la tecnología trabaja de forma continua y automatizada."
        />

        {/* Pipeline de agentes — desktop */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="mt-16 hidden lg:block"
        >
          <div className="flex items-stretch">
            {AGENT_NODES.map((node, i) => (
              <div key={node.label} className="flex flex-1 items-center last:flex-none">
                <div className="group flex w-36 shrink-0 flex-col items-center text-center">
                  <div className="relative">
                    <span className="absolute inset-0 rounded-3xl bg-ai/0 transition-all duration-500 group-hover:bg-ai/10" />
                    <div className="grid size-[68px] place-items-center rounded-3xl border border-white/15 bg-white/8 backdrop-blur-sm transition-all duration-300 group-hover:-translate-y-1 group-hover:border-ai/50 group-hover:shadow-[0_0_30px_-6px_rgba(0,196,255,0.5)]">
                      <node.icon className="size-7 text-ai" aria-hidden />
                    </div>
                  </div>
                  <p className="mt-3 text-[13px] font-bold text-white">
                    {node.label}
                  </p>
                  <p className="text-[11px] font-medium text-white/40">
                    {node.hint}
                  </p>
                </div>
                {i < AGENT_NODES.length - 1 && (
                  <div className="flow-line mx-1 h-[2px] flex-1 rounded-full" aria-hidden />
                )}
              </div>
            ))}
          </div>
        </motion.div>

        {/* Pipeline — tablet y mobile */}
        <div className="mt-12 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:hidden">
          {AGENT_NODES.map((node, i) => (
            <motion.div
              key={node.label}
              initial={{ opacity: 0, y: 16 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: i * 0.07 }}
              className="rounded-3xl border border-white/12 bg-white/6 p-4 backdrop-blur-sm"
            >
              <node.icon className="size-6 text-ai" aria-hidden />
              <p className="mt-2.5 text-sm font-bold text-white">
                {node.label}
              </p>
              <p className="text-xs text-white/40">{node.hint}</p>
            </motion.div>
          ))}
        </div>

        {/* Sello de automatización */}
        <div className="mt-16 flex flex-col items-center gap-5 text-center">
          <div className="flex items-center gap-4">
            <Homy size={64} state="idle" />
            <div className="text-left">
              <p className="text-sm font-bold text-white">
                Automatización real, de punta a punta
              </p>
              <p className="max-w-md text-[13px] leading-relaxed text-white/50">
                Homy interpreta tu pedido, arma el presupuesto con materiales
                reales de proveedores y verifica identidades con IA. Vos
                aprobás, pagás al finalizar y vivís tu casa.
              </p>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
