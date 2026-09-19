import { SiteHeader } from "@/components/home/site-header";
import { Hero } from "@/components/home/hero";
import { HowItWorks } from "@/components/home/how-it-works";
import { AiBand } from "@/components/home/ai-band";
import { Features } from "@/components/home/features";
import { Profiles } from "@/components/home/profiles";
import { CtaFinal } from "@/components/home/cta-final";
import { SiteFooter } from "@/components/home/site-footer";
import { HomyWidget } from "@/components/home/homy-widget";
import { SpaRedirect } from "@/components/home/spa-redirect";

/**
 * Landing pública de HomIA.
 * Vive como caso "sin slug" del catch-all [[...slug]]: Next.js no permite
 * una ruta estática "/" junto a un optional catch-all en build de producción,
 * así que "/" y "/cualquier-ruta" entran por la misma route handler y acá
 * decidimos qué renderizar (landing vs SPA).
 */
export function Landing() {
  return (
    <div className="flex min-h-screen flex-col bg-chalk">
      <SpaRedirect />
      <SiteHeader />
      <main className="flex-1">
        <Hero />
        <HowItWorks />
        <AiBand />
        <Features />
        <Profiles />
        <CtaFinal />
      </main>
      <SiteFooter />
      <HomyWidget />
    </div>
  );
}
