"use client";

import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { Sparkles, MessagesSquare } from "lucide-react";
import { Homy } from "@/components/homy/homy-character";

export function CtaFinal() {
  const { toast } = useToast();

  const openHomy = () => window.dispatchEvent(new CustomEvent("homy:open"));

  return (
    <section
      className="bg-chalk pb-24 pt-4 sm:pb-28"
      aria-label="Llamado a la acción final"
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="relative overflow-hidden rounded-[36px] bg-navy px-6 py-16 sm:px-12 sm:py-20">
          {/* Decoración */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div className="absolute left-[-8%] top-[-40%] size-[420px] rounded-full bg-tech/35 blur-[110px]" />
            <div className="absolute bottom-[-50%] right-[-6%] size-[400px] rounded-full bg-ai/15 blur-[110px]" />
            <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_70%_80%_at_50%_50%,black,transparent)]" />
          </div>

          <div className="relative flex flex-col items-center gap-10 lg:flex-row lg:justify-between lg:gap-6">
            <div className="max-w-xl text-center lg:text-left">
              <h2 className="text-balance text-3xl font-extrabold tracking-tight text-white sm:text-4xl lg:text-[2.6rem] lg:leading-[1.12]">
                Tu hogar merece buenas manos.{" "}
                <span className="bg-gradient-to-r from-ai to-tech-2 bg-clip-text text-transparent">
                  Empecemos hoy.
                </span>
              </h2>
              <p className="mt-4 text-pretty text-base leading-relaxed text-white/60 sm:text-lg">
                Creá tu cuenta gratis y dejale a Homy lo complicado. Vos solo
                aprobá, disfrutá y volvé a vivir tu casa.
              </p>
            </div>

            <div className="flex flex-col items-center gap-6">
              <Homy size={120} state="idle" />
              <div className="flex flex-col items-center gap-3 sm:flex-row">
                <Button
                  size="lg"
                  className="h-13 rounded-full bg-action px-8 text-base font-bold text-white shadow-[0_16px_36px_-12px_rgba(255,90,31,0.8)] transition-all hover:bg-action-2 hover:shadow-[0_20px_44px_-12px_rgba(255,90,31,0.9)] active:scale-[0.98]"
                  onClick={() =>
                    toast({
                      title: "Muy pronto: creación de cuentas",
                      description:
                        "Estamos puliendo cada detalle para recibirte como te merecés. Un poquito más de paciencia.",
                    })
                  }
                >
                  <Sparkles className="size-5" aria-hidden />
                  Crear cuenta gratis
                </Button>
                <Button
                  size="lg"
                  variant="outline"
                  className="h-13 rounded-full border-white/25 bg-white/5 px-8 text-base font-bold text-white backdrop-blur-sm transition-all hover:border-ai/60 hover:bg-white/10 hover:text-ai"
                  onClick={openHomy}
                >
                  <MessagesSquare className="size-5" aria-hidden />
                  Hablar con Homy
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
