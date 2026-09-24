import type { NextConfig } from "next";

const nextConfig: NextConfig = {
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
