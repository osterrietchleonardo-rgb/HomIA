'use client'
// Home HomIA — misma experiencia visual, ahora integrada al router de la app
import { SiteHeader } from '@/components/home/site-header'
import { Hero } from '@/components/home/hero'
import { HowItWorks } from '@/components/home/how-it-works'
import { AiBand } from '@/components/home/ai-band'
import { Features } from '@/components/home/features'
import { Profiles } from '@/components/home/profiles'
import { CtaFinal } from '@/components/home/cta-final'
import { SiteFooter } from '@/components/home/site-footer'
import { HomyWidget } from '@/components/home/homy-widget'

export default function HomeScreen() {
  return (
    <div className="relative min-h-screen text-navy">
      <SiteHeader />
      <main>
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
  )
}
