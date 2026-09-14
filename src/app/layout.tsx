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
  title: "HomIA — Tu hogar en buenas manos",
  description:
    "HomIA conecta tu hogar con profesionales verificados mediante agentes de inteligencia artificial: presupuestos integrales de mano de obra y materiales, pagos protegidos con escrow y devolución automática de sobrantes.",
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
      "Contale qué necesita tu hogar y los agentes de IA de HomIA se ocupan del resto: profesionales verificados, presupuesto integral y pagos protegidos.",
    siteName: "HomIA",
    type: "website",
    locale: "es_AR",
  },
  twitter: {
    card: "summary_large_image",
    title: "HomIA — Tu hogar en buenas manos",
    description:
      "El ecosistema del hogar potenciado por agentes de inteligencia artificial.",
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
