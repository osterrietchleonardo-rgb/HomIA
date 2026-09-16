"use client";

import { BadgeCheck, Recycle, ShieldCheck, Star } from "lucide-react";
import { HeroSearch } from "@/components/home/hero-search";

const TRUST_CHIPS = [
  { icon: ShieldCheck, label: "Pagos protegidos con escrow" },
  { icon: BadgeCheck, label: "Profesionales verificados" },
  { icon: Recycle, label: "Sobrantes devueltos y reembolsados" },
  { icon: Star, label: "Reseñas 360°" },
];

export function Hero() {
  return (
    <section className="relative overflow-hidden pb-24 pt-36 sm:pt-44" aria-label="Presentación de HomIA">
      {/* Fondos decorativos locales (la grilla global vive en BackdropFX) */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -top-24 right-[-10%] size-[480px] rounded-full bg-ai/10 blur-3xl" />
        <div className="absolute bottom-[-20%] left-[-8%] size-[420px] rounded-full bg-action/8 blur-3xl" />
        {/* Partículas flotantes sutiles */}
        <span className="animate-float-slow absolute left-[12%] top-[22%] size-2 rounded-full bg-ai/40" />
        <span className="animate-float absolute right-[16%] top-[30%] size-1.5 rounded-full bg-action/40 [animation-delay:1.2s]" />
        <span className="animate-float-slow absolute left-[22%] top-[58%] size-1.5 rounded-full bg-gold/50 [animation-delay:2.1s]" />
        <span className="animate-float absolute right-[24%] top-[64%] size-2 rounded-full bg-tech/30 [animation-delay:0.6s]" />
      </div>

      <div className="relative mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex flex-col items-center text-center">
          {/* Sello de tecnología */}
          <div className="animate-glow-ai inline-flex items-center gap-2.5 rounded-full border border-white/80 bg-white/70 px-4 py-2 backdrop-blur-md">
            <span className="relative flex size-2.5">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-ai opacity-60" />
              <span className="relative inline-flex size-2.5 rounded-full bg-ai" />
            </span>
            <span className="text-[13px] font-bold tracking-wide text-navy/75">
              Potenciado por agentes de Inteligencia Artificial
            </span>
          </div>

          {/* Titular */}
          <h1 className="mt-7 max-w-4xl text-balance text-4xl font-extrabold leading-[1.06] tracking-tight text-navy sm:text-6xl lg:text-7xl">
            Tu hogar,
            <br />
            en{" "}
            <span className="bg-gradient-to-r from-tech via-ai to-tech bg-clip-text text-transparent">
              buenas manos
            </span>
            .
          </h1>

          <p className="mt-6 max-w-2xl text-pretty text-base leading-relaxed text-navy/60 sm:text-lg">
            Contale qué necesitás, en tus palabras. Los agentes de HomIA
            encuentran al profesional verificado, arman el presupuesto completo
            —mano de obra y materiales— y cuidan tu pago hasta que estés
            conforme.
          </p>

          {/* Barra de búsqueda con Homy */}
          <div className="mt-16 w-full sm:mt-20">
            <HeroSearch />
          </div>

          {/* Confianza */}
          <ul className="mt-12 flex flex-wrap items-center justify-center gap-x-7 gap-y-3">
            {TRUST_CHIPS.map((chip) => (
              <li
                key={chip.label}
                className="flex items-center gap-2 text-[13px] font-semibold text-navy/55"
              >
                <chip.icon
                  className={
                    chip.label.startsWith("Reseñas")
                      ? "size-4 text-gold"
                      : "size-4 text-tech"
                  }
                  aria-hidden
                />
                {chip.label}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
