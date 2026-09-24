import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Carpeta de build opcional por variable de entorno: permite levantar un segundo
  // `next dev` (o correr `next build`) en la misma carpeta sin pisar el `.next` de
  // otro server en uso (varios equipos trabajan en paralelo). Sin la variable: `.next`.
  distDir: process.env.NEXT_DIST_DIR || ".next",
  typescript: {
    // El build de producción NO tolera errores de tipos.
    ignoreBuildErrors: false,
  },
  reactStrictMode: false,
  async headers() {
    return [
      {
        // Cabeceras de seguridad básicas para todas las respuestas.
        // frame-ancestors 'self': la app no se puede embeber en iframes de terceros
        // (clickjacking). Las subidas viven en Supabase Storage, no en /uploads.
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(self), microphone=(), geolocation=(self)" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'self'" },
        ],
      },
    ];
  },
};

export default nextConfig;
