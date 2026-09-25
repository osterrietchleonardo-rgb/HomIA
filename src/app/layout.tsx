import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Toaster } from "@/components/ui/toaster";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin", "latin-ext"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://www.somoshomia.com"),
  title: "HomIA | Tu hogar, en buenas manos",
  description: "Plomeros, electricistas, gasistas, pintores y más. Compará presupuestos sin llamar a nadie, mirá quién validó su DNI y qué dicen otros clientes, y pagá cuando el trabajo está hecho, por Mercado Pago o en efectivo. Gratis para clientes.",
  keywords: [
    "HomIA",
    "servicios para el hogar",
    "profesionales verificados",
    "plomero",
    "electricista",
    "gasista",
    "materiales de construcción",
    "Homy",
  ],
  authors: [{ name: "HomIA" }],
  openGraph: {
    title: "HomIA | Tu hogar, en buenas manos",
    description:
      "Presupuestos de profesionales con reseñas de otros clientes, materiales de varios proveedores en un solo carrito y pago cuando el trabajo está hecho. Gratis para clientes.",
    url: "https://www.somoshomia.com",
    siteName: "HomIA",
    type: "website",
    locale: "es_AR",
  },
  twitter: {
    card: "summary_large_image",
    title: "HomIA | Tu hogar, en buenas manos",
    description:
      "Profesionales y materiales para tu casa, en Argentina. Pagás al terminar, reseñas con fotos, gratis para clientes.",
  },
};

export const viewport: Viewport = {
  themeColor: "#FAFAFA",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es-AR" suppressHydrationWarning>
      <body
        className={`${jakarta.variable} antialiased bg-background text-foreground font-sans`}
      >
        {children}
        <Toaster />
      </body>
    </html>
  );
}
