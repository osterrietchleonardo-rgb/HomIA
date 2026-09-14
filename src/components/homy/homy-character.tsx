"use client";

import { useId } from "react";
import { cn } from "@/lib/utils";

export type HomyState = "idle" | "listening" | "thinking" | "happy";

interface HomyProps {
  /** Ancho visual en px (la altura deriva de la proporción del personaje) */
  size?: number;
  state?: HomyState;
  className?: string;
}

/** Proporción del personaje: viewBox 204 × 260 */
const VB_W = 204;
const VB_H = 260;

/**
 * Homy — la mascota 2D de HomIA, fiel al logo real:
 * · Cuerpo blanco rechoncho (estilo astronauta/fantasma) con contorno azul
 *   marino #102A45 grueso y esquinas totalmente redondeadas.
 * · Brazos cortos colgando a los costados, separados del torso por línea curva.
 * · Base con dos piernas redonditas separadas por una U invertida.
 * · Cabeza-cable: bucle casi circular (espacio negativo circular) cuyo extremo
 *   inferior azul asoma sobre el cuerpo; del costado superior derecho sale el
 *   brazo hacia el conector USB escalonado (collar blanco + punta naranja).
 * · Degradado de marca: cian/azul → blanco → naranja → coral a lo largo del cable.
 * · Emblema de pecho: orbe cian→blanco→coral con halo de luz (cian arriba-izq,
 *   naranja abajo-der) y reflejo azul marino en el borde derecho del núcleo.
 * 100% transparente (sin fondo) y escalable.
 */
export function Homy({ size = 120, state = "idle", className }: HomyProps) {
  const uid = useId().replace(/[:]/g, "");
  const bodyGrad = `homy-body-${uid}`;
  const loopGrad = `homy-loop-${uid}`;
  const armGrad = `homy-arm-${uid}`;
  const tipGrad = `homy-tip-${uid}`;
  const collarGrad = `homy-collar-${uid}`;
  const orbGrad = `homy-orb-${uid}`;
  const glowWarm = `homy-glow-w-${uid}`;
  const glowCool = `homy-glow-c-${uid}`;
  const shadeGrad = `homy-shade-${uid}`;

  const outline = "#102A45";

  return (
    <div
      className={cn(
        "homy-wrap relative select-none",
        state === "idle" && "animate-float",
        state === "happy" && "animate-happy",
        className
      )}
      style={{ width: size, height: size * (VB_H / VB_W) }}
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
          className="pointer-events-none absolute left-1/2 top-0 flex -translate-x-1/2 gap-1"
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
        viewBox={`36 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="100%"
        fill="none"
        aria-hidden
      >
        <defs>
          {/* Cuerpo: blanco con sombreado interior suave (aspecto burbuja) */}
          <linearGradient id={bodyGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="62%" stopColor="#F8FAFC" />
            <stop offset="100%" stopColor="#E8EDF4" />
          </linearGradient>
          {/* Cable del bucle: azul al nacer → blanco en el bucle */}
          <linearGradient
            id={loopGrad}
            gradientUnits="userSpaceOnUse"
            x1="139"
            y1="110"
            x2="96"
            y2="32"
          >
            <stop offset="0%" stopColor="#3E8BFF" />
            <stop offset="20%" stopColor="#7BB6FF" />
            <stop offset="48%" stopColor="#CFE6FF" />
            <stop offset="75%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#FFFFFF" />
          </linearGradient>
          {/* Brazo hacia el enchufe: blanco → naranja cerca del USB */}
          <linearGradient
            id={armGrad}
            gradientUnits="userSpaceOnUse"
            x1="140"
            y1="44"
            x2="196"
            y2="34"
          >
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="38%" stopColor="#FFE9D2" />
            <stop offset="68%" stopColor="#FFB061" />
            <stop offset="100%" stopColor="#FF6A2A" />
          </linearGradient>
          {/* Punta USB: naranja → coral */}
          <linearGradient id={tipGrad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#FFA14D" />
            <stop offset="55%" stopColor="#FF5A1F" />
            <stop offset="100%" stopColor="#EF4E3A" />
          </linearGradient>
          {/* Detalle interno del collar: cian → celeste */}
          <linearGradient id={collarGrad} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#9ADFFF" />
            <stop offset="100%" stopColor="#D9F3FF" />
          </linearGradient>
          {/* Orbe del pecho: cian → blanco → naranja → coral */}
          <linearGradient id={orbGrad} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#4E8EF7" />
            <stop offset="22%" stopColor="#A8D4FF" />
            <stop offset="42%" stopColor="#EDF5FF" />
            <stop offset="68%" stopColor="#FFC46B" />
            <stop offset="85%" stopColor="#FF7A3D" />
            <stop offset="100%" stopColor="#F04E38" />
          </linearGradient>
          <radialGradient id={glowWarm} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#FF8A4D" stopOpacity="0.6" />
            <stop offset="55%" stopColor="#FF7A3D" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#FF7A3D" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={glowCool} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#00C4FF" stopOpacity="0.5" />
            <stop offset="60%" stopColor="#00C4FF" stopOpacity="0.2" />
            <stop offset="100%" stopColor="#00C4FF" stopOpacity="0" />
          </radialGradient>
          {/* Sombra interior inferior del cuerpo */}
          <radialGradient id={shadeGrad} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#C4D2E4" stopOpacity="0.5" />
            <stop offset="70%" stopColor="#C4D2E4" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#C4D2E4" stopOpacity="0" />
          </radialGradient>
          {/* Recorte para el reflejo del orbe (media luna en el borde) */}
          <clipPath id={`homy-orbclip-${uid}`}>
            <circle cx="120" cy="152" r="13.5" />
          </clipPath>
        </defs>

        {/* ── Cabeza-cable: bucle casi circular (detrás del cuerpo) ── */}
        <g strokeLinecap="round" strokeLinejoin="round" fill="none">
          {/* Contorno del bucle */}
          <path
            d="M 139 44 A 37 37 0 1 0 139 104"
            stroke={outline}
            strokeWidth="17.5"
          />
          {/* Relleno del bucle (degradado azul → blanco) */}
          <path
            d="M 139 44 A 37 37 0 1 0 139 104"
            stroke={`url(#${loopGrad})`}
            strokeWidth="10.5"
          />
          {/* Brazo hacia el enchufe: contorno + degradado */}
          <path
            d="M 191 36 C 174 43 156 41 139 44"
            stroke={outline}
            strokeWidth="17.5"
          />
          <path
            d="M 191 36 C 174 43 156 41 139 44"
            stroke={`url(#${armGrad})`}
            strokeWidth="10.5"
          />
        </g>

        {/* ── Conector USB escalonado ── */}
        <g transform="translate(191 36) rotate(-8)">
          <g className="homy-plug">
            {/* Collar blanco */}
            <rect
              x="-4"
              y="-12"
              width="20"
              height="24"
              rx="7"
              fill="#FFFFFF"
              stroke={outline}
              strokeWidth="5.5"
            />
            {/* Detalle interno cian del collar */}
            <rect
              x="1"
              y="-6"
              width="9"
              height="12"
              rx="3.5"
              fill={`url(#${collarGrad})`}
            />
            {/* Punta metálica naranja */}
            <rect
              x="14"
              y="-15"
              width="26"
              height="30"
              rx="8"
              fill={`url(#${tipGrad})`}
              stroke={outline}
              strokeWidth="5.5"
            />
            {/* Lengüeta clara interna */}
            <rect
              x="21"
              y="-8"
              width="13"
              height="16"
              rx="4"
              fill="#FFE3C8"
              opacity="0.95"
            />
          </g>
        </g>

        {/* ── Cuerpo: blob rechoncho con piernas y muesca en U ── */}
        <path
          className="homy-body"
          d="M 120 98
             C 148 98 168 108 176 126
             C 183 141 185 159 183 177
             C 182 191 178 203 172 212
             C 176 219 178 228 175 237
             C 171 247 157 251 147 247
             C 140 244 137 238 137 230
             C 137 224 131 219 120 219
             C 109 219 103 224 103 230
             C 103 238 100 244 93 247
             C 83 251 69 247 65 237
             C 62 228 64 219 68 212
             C 62 203 58 191 57 177
             C 55 159 57 141 64 126
             C 72 108 92 98 120 98
             Z"
          fill={`url(#${bodyGrad})`}
          stroke={outline}
          strokeWidth="7"
          strokeLinejoin="round"
        />

        {/* Sombra interior suave (volumen regordete) */}
        <ellipse
          cx="120"
          cy="230"
          rx="46"
          ry="15"
          fill={`url(#${shadeGrad})`}
          opacity="0.55"
        />

        {/* ── Brazos colgantes, por delante del torso ── */}
        <g strokeLinejoin="round">
          <rect
            x="55"
            y="126"
            width="26"
            height="64"
            rx="13"
            transform="rotate(8 68 158)"
            fill={`url(#${bodyGrad})`}
            stroke={outline}
            strokeWidth="6.5"
          />
          <rect
            x="159"
            y="126"
            width="26"
            height="64"
            rx="13"
            transform="rotate(-8 172 158)"
            fill={`url(#${bodyGrad})`}
            stroke={outline}
            strokeWidth="6.5"
          />
        </g>

        {/* ── Emblema de pecho: halo de luz + orbe ── */}
        <g className="homy-core">
          <circle cx="107" cy="141" r="23" fill={`url(#${glowCool})`} />
          <circle cx="130" cy="162" r="28" fill={`url(#${glowWarm})`} />
        </g>
        <g className="homy-core">
          <circle cx="120" cy="152" r="13.5" fill={`url(#${orbGrad})`} />
          {/* Reflejo azul marino sutil: media luna en el borde derecho */}
          <circle
            cx="132.5"
            cy="154"
            r="5"
            fill={outline}
            opacity="0.6"
            clipPath={`url(#homy-orbclip-${uid})`}
          />
          {/* Brillo blanco superior izquierdo */}
          <ellipse
            cx="114.5"
            cy="146.5"
            rx="4"
            ry="3.6"
            fill="#FFFFFF"
            opacity="0.9"
          />
        </g>
      </svg>
    </div>
  );
}

/**
 * Wordmark HomIA — tipografía con el punto multicolor sobre la "i",
 * igual que en el logo real.
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
