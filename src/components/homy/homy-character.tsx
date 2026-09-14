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

/** Proporción del personaje: viewBox 440 × 560 (≈1:1.27, más alto que ancho) */
const VB_W = 440;
const VB_H = 560;

/**
 * Homy — la mascota 2D de HomIA, trazada sobre la geometría real del logo.
 *
 * Anatomía (spec `descripcion_geometrica_personaje`):
 * · Cabeza-cable: tubo blanco que nace detrás del hombro derecho, sube y forma
 *   un bucle casi circular (espacio negativo circular) cuyo extremo superior
 *   izquierdo se desvanece en punta abierta; del costado superior derecho sale
 *   una curva en "S" muy suave hacia el conector USB.
 * · Degradado azul sobre el borde INTERNO del bucle (cian tenue arriba → azul
 *   profundo abajo) y sombra gris-azulada sobre el borde externo (volumen).
 * · Conector USB escalonado: cuerpo blanco con borde degradado cian → naranja
 *   → coral y punta estrecha naranja/coral, levemente inclinado.
 * · Cuerpo rechoncho blanco (trapezoide muy redondeado, hombros caídos),
 *   contorno azul marino #102A45 de grosor constante, brazos integrados a la
 *   silueta con líneas de separación internas, base bilobulada con muesca en U
 *   invertida y sonrisa amplia.
 * · Emblema de pecho: botón de encendido — núcleo degradado azul (izq) →
 *   naranja-rojo (der) con línea blanca vertical y halo de luz (cian izq,
 *   naranja der).
 * 100% transparente (sin fondo), escalable y animable por estados.
 */
export function Homy({ size = 120, state = "idle", className }: HomyProps) {
  const uid = useId().replace(/[:]/g, "");
  const outline = "#102A45";

  // ── Geometría del bucle-cable ──
  // Centro C=(184,145) · radio de línea central 106 · tubo 48 · contorno 13
  // Trayecto ÚNICO continuo: bucle (punta θ=-100° → CCW) + curva S hacia el USB
  const loopSPath =
    "M 165.6 40.6 A 106 106 0 1 0 259 70 " +
    "C 244 57 240 44 248 35 C 258 24 276 26 286 36 C 294 44 297 52 300 58";
  const accentPath = "M 155.3 56.6 A 93 93 0 1 0 266.1 101.4";
  const shadeArcPath = "M 153.7 32 A 117 117 0 1 0 283.2 83";

  // ── Cuerpo ──
  const bodyPath =
    "M 147.5 262 C 173.9 286 266.1 286 292.5 262 C 318.8 250 351.8 280 366 314 " +
    "C 380.3 352 406.7 368 410 396 C 410 425 396.8 448 370.5 452 C 348.6 453 336.5 441 334.3 424 " +
    "C 333.2 418 332.1 414 331 411 C 338.7 448 343.1 479 340.9 505 C 343.1 532 328.9 549 303.6 550 " +
    "C 282.7 551 271.6 540 270.5 524 C 269.4 498 249.6 479 220 479 C 190.4 479 168.4 498 169.5 524 " +
    "C 168.4 540 155.2 551 134.5 550 C 109.3 549 94.5 532 96.7 505 C 94.5 479 98.9 448 106.6 411 " +
    "C 105.5 414 104.4 418 103.3 424 C 101.1 441 89.1 453 66.9 452 C 41.2 448 27.3 425 27.3 396 " +
    "C 30.6 368 56.9 352 71.3 314 C 85.8 280 118.9 250 147.5 262 Z";

  // ── Ids únicos por instancia ──
  const idCableFill = `hc-fill-${uid}`;
  const idCableAccent = `hc-acc-${uid}`;
  const idCableShade = `hc-shd-${uid}`;
  const idFade = `hc-fade-${uid}`;
  const idFadeGrad = `hc-fg-${uid}`;
  const idUsbBorder = `hc-usbb-${uid}`;
  const idUsbTip = `hc-usbt-${uid}`;
  const idUsbFill = `hc-usbf-${uid}`;
  const idBody = `hb-body-${uid}`;
  const idBodyShade = `hb-shade-${uid}`;
  const idSideL = `hb-sidel-${uid}`;
  const idSideR = `hb-sider-${uid}`;
  const idGlowRing = `hb-ring-${uid}`;
  const idCore = `hb-core-${uid}`;
  const idBlurGlow = `hb-blur-${uid}`;
  const idBlurSoft = `hb-blur2-${uid}`;
  const idClipBody = `hb-clip-${uid}`;
  const idAccentFade = `hb-accfade-${uid}`;
  const idShadeFade = `hb-shdfade-${uid}`;

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
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width="100%"
        height="100%"
        fill="none"
        aria-hidden
      >
        <defs>
          {/* Relleno del cable: blanco puro, cian solo justo antes del USB */}
          <linearGradient
            id={idCableFill}
            gradientUnits="userSpaceOnUse"
            x1="100"
            y1="180"
            x2="330"
            y2="50"
          >
            <stop offset="0%" stopColor="#F8FAFD" />
            <stop offset="55%" stopColor="#FFFFFF" />
            <stop offset="82%" stopColor="#EDF8FE" />
            <stop offset="94%" stopColor="#A8E7FC" />
            <stop offset="100%" stopColor="#7FDBFA" />
          </linearGradient>
          {/* Acento del borde interno del bucle: cian tenue → azul profundo */}
          <linearGradient
            id={idCableAccent}
            gradientUnits="userSpaceOnUse"
            x1="150"
            y1="40"
            x2="200"
            y2="280"
          >
            <stop offset="0%" stopColor="#7FD4F5" stopOpacity="0" />
            <stop offset="18%" stopColor="#6FC4EE" stopOpacity="0.55" />
            <stop offset="45%" stopColor="#3E86D9" stopOpacity="0.9" />
            <stop offset="70%" stopColor="#1D4E9E" />
            <stop offset="88%" stopColor="#2E6FD8" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#2E6FD8" stopOpacity="0" />
          </linearGradient>
          {/* Sombra sutil del borde externo del bucle (volumen de burbuja) */}
          <linearGradient
            id={idCableShade}
            gradientUnits="userSpaceOnUse"
            x1="160"
            y1="25"
            x2="200"
            y2="270"
          >
            <stop offset="0%" stopColor="#C9D4E6" stopOpacity="0" />
            <stop offset="45%" stopColor="#C9D4E6" stopOpacity="0.4" />
            <stop offset="80%" stopColor="#C9D4E6" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#C9D4E6" stopOpacity="0" />
          </linearGradient>
          {/* Desvanecido corto de la punta superior izquierda del cable */}
          <linearGradient
            id={idFadeGrad}
            gradientUnits="userSpaceOnUse"
            x1="128"
            y1="54"
            x2="170"
            y2="36"
          >
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="45%" stopColor="#FFFFFF" />
            <stop offset="85%" stopColor="#0B0B0B" />
            <stop offset="100%" stopColor="#0B0B0B" />
          </linearGradient>
          <mask id={idFade} maskUnits="userSpaceOnUse" x="0" y="0" width="440" height="560">
            <rect width="440" height="560" fill="#FFFFFF" />
            <rect x="122" y="0" width="95" height="95" fill={`url(#${idFadeGrad})`} />
          </mask>

          {/* Borde del conector USB: cian → naranja → coral */}
          <linearGradient
            id={idUsbBorder}
            gradientUnits="userSpaceOnUse"
            x1="308"
            y1="24"
            x2="424"
            y2="96"
          >
            <stop offset="0%" stopColor="#3AB5D6" />
            <stop offset="30%" stopColor="#F0962F" />
            <stop offset="64%" stopColor="#F0722A" />
            <stop offset="100%" stopColor="#EC4530" />
          </linearGradient>
          <linearGradient id={idUsbTip} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#F5922F" />
            <stop offset="100%" stopColor="#EC4530" />
          </linearGradient>
          <linearGradient id={idUsbFill} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="100%" stopColor="#E9EEF6" />
          </linearGradient>

          {/* Cuerpo: blanco puro arriba-izquierda (luz), gris-azulado abajo */}
          <linearGradient id={idBody} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="58%" stopColor="#FBFCFE" />
            <stop offset="100%" stopColor="#EDF1F8" />
          </linearGradient>
          <linearGradient id={idBodyShade} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#C7D3E5" stopOpacity="0" />
            <stop offset="55%" stopColor="#C7D3E5" stopOpacity="0.16" />
            <stop offset="100%" stopColor="#BCC9DE" stopOpacity="0.5" />
          </linearGradient>
          <radialGradient id={idSideL} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#CBD6E8" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#CBD6E8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id={idSideR} cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#CBD6E8" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#CBD6E8" stopOpacity="0" />
          </radialGradient>

          {/* Halo del emblema: anillo cian → naranja */}
          <linearGradient id={idGlowRing} x1="0" y1="0" x2="1" y2="0.25">
            <stop offset="0%" stopColor="#00C6FF" />
            <stop offset="48%" stopColor="#7FA0FF" stopOpacity="0.55" />
            <stop offset="100%" stopColor="#FF6A2B" />
          </linearGradient>
          {/* Núcleo del emblema: azul (izq) → naranja-rojo (der) */}
          <linearGradient
            id={idCore}
            gradientUnits="userSpaceOnUse"
            x1="182"
            y1="350"
            x2="258"
            y2="354"
          >
            <stop offset="0%" stopColor="#2E6FE0" />
            <stop offset="34%" stopColor="#344FA8" />
            <stop offset="52%" stopColor="#7A4486" />
            <stop offset="70%" stopColor="#D05230" />
            <stop offset="100%" stopColor="#EF4123" />
          </linearGradient>

          {/* Desvanecido del acento/sombra del cable en el tramo derecho */}
          <linearGradient
            id={idAccentFade}
            gradientUnits="userSpaceOnUse"
            x1="120"
            y1="40"
            x2="300"
            y2="100"
          >
            <stop offset="0%" stopColor="#FFFFFF" />
            <stop offset="55%" stopColor="#0B0B0B" />
            <stop offset="100%" stopColor="#0B0B0B" />
          </linearGradient>
          <mask id={idShadeFade} maskUnits="userSpaceOnUse" x="0" y="0" width="440" height="560">
            <rect width="440" height="560" fill="#FFFFFF" />
            <rect x="90" y="10" width="240" height="130" fill={`url(#${idAccentFade})`} opacity="0.55" />
          </mask>

          <filter id={idBlurGlow} x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="13" />
          </filter>
          <filter id={idBlurSoft} x="-60%" y="-60%" width="220%" height="220%">
            <feGaussianBlur stdDeviation="7" />
          </filter>

          <clipPath id={idClipBody}>
            <path d={bodyPath} />
          </clipPath>
        </defs>

        {/* ══════════ CABEZA-CABLE (detrás del cuerpo) ══════════ */}
        <g mask={`url(#${idFade})`}>
          <g strokeLinecap="round" strokeLinejoin="round" fill="none">
            {/* Capa de contorno azul marino (bucle + S en un solo trayecto) */}
            <path d={loopSPath} stroke={outline} strokeWidth="61" />
            {/* Relleno del tubo (blanco → cian hacia el USB) */}
            <path d={loopSPath} stroke={`url(#${idCableFill})`} strokeWidth="48" />
            {/* Sombra suave del borde externo (volumen) */}
            <path
              d={shadeArcPath}
              stroke={`url(#${idCableShade})`}
              strokeWidth="8"
              mask={`url(#${idShadeFade})`}
            />
            {/* Degradado azul del borde interno del bucle */}
            <path d={accentPath} stroke={`url(#${idCableAccent})`} strokeWidth="16" />
          </g>
        </g>

        {/* Resplandor coral bajo el conector (sangrado de color del logo) */}
        <ellipse
          cx="350"
          cy="96"
          rx="32"
          ry="8"
          fill="#E8563A"
          opacity="0.28"
          filter={`url(#${idBlurSoft})`}
        />

        {/* ══════════ CONECTOR USB ESCALONADO ══════════ */}
        <g transform="rotate(-6 312 60)">
          <g className="homy-plug" strokeLinejoin="round">
            {/* Cuerpo del enchufe: blanco con borde degradado */}
            <rect
              x="312"
              y="28"
              width="76"
              height="64"
              rx="17"
              fill={`url(#${idUsbFill})`}
              stroke={`url(#${idUsbBorder})`}
              strokeWidth="11"
            />
            {/* Punta estrecha naranja/coral */}
            <rect
              x="386"
              y="40"
              width="34"
              height="40"
              rx="11"
              fill="#FFFBF7"
              stroke={`url(#${idUsbTip})`}
              strokeWidth="10"
            />
          </g>
        </g>

        {/* ══════════ CUERPO ══════════ */}
        <path
          className="homy-body"
          d={bodyPath}
          fill={`url(#${idBody})`}
          stroke={outline}
          strokeWidth="14"
          strokeLinejoin="round"
        />

        {/* Sombreado interno (efecto burbuja 3D), recortado al cuerpo */}
        <g clipPath={`url(#${idClipBody})`}>
          <rect x="30" y="330" width="380" height="226" fill={`url(#${idBodyShade})`} />
          {/* Volumen lateral izquierdo/derecho */}
          <ellipse cx="92" cy="445" rx="34" ry="88" fill={`url(#${idSideL})`} />
          <ellipse cx="348" cy="445" rx="34" ry="88" fill={`url(#${idSideR})`} />
          {/* Sombra del cable sobre el pecho */}
          <ellipse cx="220" cy="292" rx="54" ry="14" fill="#C9D4E6" opacity="0.38" filter={`url(#${idBlurSoft})`} />
          {/* Sombra entre las piernas */}
          <ellipse cx="220" cy="530" rx="28" ry="13" fill="#C4D0E4" opacity="0.5" filter={`url(#${idBlurSoft})`} />
        </g>

        {/* Líneas internas: separación de brazos + sonrisa */}
        <g stroke={outline} strokeWidth="11" strokeLinecap="round" fill="none">
          <path d="M 331 414 C 339.7 386 340.8 354 327.6 332" />
          <path d="M 106.6 414 C 100.3 386 99.2 354 112.4 332" />
          <path d="M 148.6 426 C 176 460 197 470 220 470 C 243 470 264 460 291.4 426" />
        </g>

        {/* ══════════ EMBLEMA DE PECHO: BOTÓN DE ENCENDIDO ══════════ */}
        <g className="homy-core">
          {/* Halo de luz (anillo difuminado cian → naranja) */}
          <circle
            cx="220"
            cy="350"
            r="54"
            stroke={`url(#${idGlowRing})`}
            strokeWidth="18"
            fill="none"
            filter={`url(#${idBlurGlow})`}
            opacity="0.85"
          />
          {/* Núcleo */}
          <circle cx="220" cy="350" r="40" fill={`url(#${idCore})`} />
          {/* Línea del botón de encendido */}
          <path
            d="M 220 308 L 220 352"
            stroke="#FFFFFF"
            strokeWidth="8"
            strokeLinecap="round"
          />
          {/* Brillo superior izquierdo */}
          <ellipse cx="203" cy="334" rx="7" ry="4.5" fill="#FFFFFF" opacity="0.35" transform="rotate(-32 203 334)" />
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
