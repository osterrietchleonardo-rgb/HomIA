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

export default function Home() {
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
