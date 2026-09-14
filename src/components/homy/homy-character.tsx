"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export type HomyState = "idle" | "listening" | "thinking" | "happy";

interface HomyProps {
  /** Alto/ancho visual en px */
  size?: number;
  state?: HomyState;
  className?: string;
}

/**
 * Homy — la mascota 2D de HomIA, fiel al logo:
 * cuerpo blanco redondeado con contorno azul profundo,
 * cable con enchufe sobre la cabeza y núcleo de energía cálido.
 * Totalmente transparente (sin fondo) y escalable.
 */
export function Homy({ size = 120, state = "idle", className }: HomyProps) {
  const uid = useId().replace(/[:]/g, "");
  const bodyGrad = `homy-body-${uid}`;
  const cableGrad = `homy-cable-${uid}`;
  const orbGrad = `homy-orb-${uid}`;
  const glowGrad = `homy-glow-${uid}`;

  const outline = "#0A2540";

  return (
    <div
      className={cn(
        "homy-wrap relative select-none",
        state === "idle" && "animate-float",
        state === "happy" && "animate-happy",
        className
      )}
      style={{ width: size, height: size * (200 / 220) }}
      data-homy={state}
      role="img"
      aria-label={
        state === "thinking"
          ? "Homy está pensando"
          : state === "listening"
            ? "Homy te está escuchando"
            : "Homy, la mascota de HomIA"
      }
    >
      {/* Burbujas de pensamiento cuando está interpretando */}
      {state === "thinking" && (
        <div
          className="pointer-events-none absolute -top-1 left-1/2 flex -translate-x-1/2 gap-1"
          aria-hidden
        >
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="size-1.5 rounded-full bg-ai animate-dot-bounce"
              style={{ animationDelay: `${i * 0.18}s` }}
            />
          ))}
        </div>
      )}

      <svg
        viewBox="0 0 220 200"
        width="100%"
        height="100%"
        fill="none"
        aria-hidden
      >
        <defs>
          <linearGradient id={bodyGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="72%" stopColor="#F7F9FB" />
            <stop offset="100%" stopColor="#E5EAF1" />
          </linearGradient>
          <linearGradient id={cableGrad} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0%" stopColor="#1D63B8" />
            <stop offset="100%" stopColor="#00C4FF" />
          </linearGradient>
          <radialGradient id={orbGrad} cx="0.42" cy="0.36" r="0.75">
            <stop offset="0%" stopColor="#FFFDF4" />
            <stop offset="26%" stopColor="#FFDE6B" />
            <stop offset="58%" stopColor="#FF5A1F" />
            <stop offset="86%" stopColor="#E23E45" />
            <stop offset="100%" stopColor="#C93B5E" />
          </radialGradient>
          <radialGradient id={glowGrad} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="rgba(255, 90, 31, 0.5)" />
            <stop offset="45%" stopColor="rgba(255, 122, 69, 0.2)" />
            <stop offset="72%" stopColor="rgba(0, 196, 255, 0.14)" />
            <stop offset="100%" stopColor="rgba(0, 196, 255, 0)" />
          </radialGradient>
        </defs>

        {/* Pies */}
        <g stroke={outline} strokeWidth="6">
          <ellipse cx="86" cy="182" rx="16" ry="12" fill={`url(#${bodyGrad})`} />
          <ellipse cx="134" cy="182" rx="16" ry="12" fill={`url(#${bodyGrad})`} />
        </g>

        {/* Brazos */}
        <g stroke={outline} strokeWidth="6">
          <ellipse
            cx="38"
            cy="120"
            rx="13"
            ry="23"
            transform="rotate(18 38 120)"
            fill={`url(#${bodyGrad})`}
          />
          <ellipse
            cx="182"
            cy="120"
            rx="13"
            ry="23"
            transform="rotate(-18 182 120)"
            fill={`url(#${bodyGrad})`}
          />
        </g>

        {/* Cuerpo */}
        <path
          className="homy-body"
          d="M110 44 C153 44 174 82 174 124 C174 158 149 180 110 180 C71 180 46 158 46 124 C46 82 67 44 110 44 Z"
          fill={`url(#${bodyGrad})`}
          stroke={outline}
          strokeWidth="7"
        />

        {/* Halo del núcleo */}
        <circle
          cx="110"
          cy="122"
          r="38"
          fill={`url(#${glowGrad})`}
          className="homy-core"
        />

        {/* Núcleo de energía */}
        <g className="homy-core">
          <circle
            cx="110"
            cy="122"
            r="21"
            fill={`url(#${orbGrad})`}
            stroke="#1D63B8"
            strokeOpacity="0.35"
            strokeWidth="2.5"
          />
          <circle cx="103.5" cy="115.5" r="5.5" fill="#FFFFFF" opacity="0.85" />
        </g>

        {/* Cable + enchufe */}
        <g className="homy-plug">
          <path
            d="M100 50 C94 32 104 16 122 15 C140 14 150 28 142 39 C136 47 122 46 121 36 C120 28 130 22 142 23 C152 24 158 27 163 30"
            stroke={`url(#${cableGrad})`}
            strokeWidth="7"
            strokeLinecap="round"
          />
          <g transform="translate(163 30) rotate(-6)">
            <rect
              x="0"
              y="-8"
              width="14"
              height="16"
              rx="4"
              fill="#FFFFFF"
              stroke={outline}
              strokeWidth="5"
            />
            <rect
              x="12"
              y="-12"
              width="13"
              height="24"
              rx="5"
              fill="#FF5A1F"
              stroke={outline}
              strokeWidth="5"
            />
            <rect
              x="24"
              y="-5"
              width="9"
              height="10"
              rx="3"
              fill="#FFFFFF"
              stroke={outline}
              strokeWidth="5"
            />
          </g>
        </g>
      </svg>
    </div>
  );
}

/**
 * Wordmark HomIA — tipografía con el punto multicolor sobre la "i",
 * igual que en el logo.
 */
export function HomIAWordmark({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "font-extrabold tracking-tight text-navy leading-none",
        className
      )}
    >
      Hom
      <span className="relative inline-block">
        ı
        <span
          aria-hidden
          className="absolute left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-br from-action via-gold to-ai"
          style={{
            width: "0.26em",
            height: "0.26em",
            top: "0.04em",
          }}
        />
      </span>
      A
    </span>
  );
}
