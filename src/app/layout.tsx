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
  title: "HomIA — Tu hogar en buenas manos",
  description: "HomIA conecta tu hogar con profesionales y proveedores de tu zona: buscás con lenguaje natural, aprobás un presupuesto integral de mano de obra y materiales, pagás al finalizar por Mercado Pago o efectivo y devolvés los sobrantes al local.",
  keywords: [
    "HomIA",
    "servicios para el hogar",
    "profesionales verificados",
    "presupuesto integral",
    "inteligencia artificial",
    "Homy",
  ],
  authors: [{ name: "HomIA" }],
  openGraph: {
    title: "HomIA — Tu hogar en buenas manos",
    description:
      "Contale qué necesita tu hogar y Homy te conecta con profesionales verificados con DNI y reseñas reales. Presupuesto integral, pago al finalizar por Mercado Pago o efectivo.",
    url: "https://www.somoshomia.com",
    siteName: "HomIA",
    type: "website",
    locale: "es_AR",
  },
  twitter: {
    card: "summary_large_image",
    title: "HomIA — Tu hogar en buenas manos",
    description:
      "Profesionales y proveedores del hogar en Argentina. Presupuesto integral, pago al finalizar, reseñas con foto.",
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
