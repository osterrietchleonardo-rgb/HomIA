'use client'
// BackdropFX HomIA — capa de ambiente global (fondo z-0 del z-order sagrado)
// Contrato Glass Core: decoración pura → pointer-events-none + aria-hidden,
// animaciones solo transform/opacity, la grilla vive en TODO el sistema.
export function BackdropFX() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 z-0 overflow-hidden">
      {/* Base atmosférica: chalk → blanco → confort (translúcida para dejar vivo el fondo) */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'linear-gradient(180deg, color-mix(in srgb, #FAFAFA 88%, transparent) 0%, color-mix(in srgb, #FFFFFF 70%, transparent) 38%, color-mix(in srgb, #F0F2F5 82%, transparent) 100%)',
        }}
      />
      {/* Grilla técnica continua — la firma de la home, ahora en todo el sistema */}
      <div className="homy-fx-grid absolute inset-0" />
      {/* Aurora tech/IA: respira arriba a la derecha */}
      <div className="homy-fx-aurora homy-fx-aurora-a absolute -top-40 right-[-12%] size-[560px] bg-ai/12" />
      {/* Aurora cálida: acciona abajo a la izquierda */}
      <div className="homy-fx-aurora homy-fx-aurora-b absolute bottom-[-18%] left-[-10%] size-[500px] bg-action/8" />
      {/* Aurora tech profunda: centro-left muy tenue */}
      <div className="homy-fx-aurora homy-fx-aurora-a absolute left-[18%] top-[30%] size-[420px] bg-tech/8 [animation-delay:-9s]" />
      {/* Sonar IA: ping lento cerca del margen superior derecho */}
      <span className="homy-fx-sonar absolute right-[8%] top-[12%] size-24 rounded-full border border-ai/25" />
      <span className="homy-fx-sonar absolute right-[8%] top-[12%] size-24 rounded-full border border-ai/15 [animation-delay:-2.6s]" />
      {/* Grano fino: materia, no plasticidad */}
      <div
        className="absolute inset-0 opacity-[0.5] mix-blend-multiply"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='0.05'/%3E%3C/svg%3E\")",
        }}
      />
      {/* Viñeta: foco al centro, calma en los bordes */}
      <div
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(120% 90% at 50% 30%, transparent 55%, color-mix(in srgb, #0A2540 5%, transparent) 100%)',
        }}
      />
    </div>
  )
}
