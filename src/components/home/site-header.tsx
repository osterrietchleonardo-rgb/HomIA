"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Menu, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Homy, HomIAWordmark } from "@/components/homy/homy-character";
import { cn } from "@/lib/utils";
import { useSession } from "@/lib/store";
import { navigate } from "@/lib/router";
import { LayoutDashboard } from "lucide-react";

const NAV_ITEMS = [
  { label: "Cómo funciona", href: "#como-funciona" },
  { label: "Motor IA", href: "#motor-ia" },
  { label: "Beneficios", href: "#beneficios" },
  { label: "Comunidad", href: "#comunidad" },
];

export function SiteHeader() {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 10);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const { user, loading } = useSession();

  const goPanel = () => {
    const role = user?.roles?.[0] || "cliente";
    navigate(`/panel/${role}`);
  };

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 transition-all duration-500",
        scrolled
          ? "homy-glass-strong border-x-0 border-t-0 shadow-[0_8px_30px_-12px_rgba(10,37,64,0.15)]"
          : "bg-transparent border-b border-transparent"
      )}
    >
      <div className="mx-auto flex h-20 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        {/* Logo: Homy sin fondo + wordmark */}
        <Link
          href="/"
          className="group flex items-center gap-2.5 rounded-2xl outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="HomIA — Ir al inicio"
        >
          <span className="transition-transform duration-300 group-hover:scale-110">
            <Homy size={46} state="idle" />
          </span>
          <HomIAWordmark className="text-[26px] sm:text-[28px]" />
        </Link>

        {/* Navegación desktop */}
        <nav
          className="hidden items-center gap-1 lg:flex"
          aria-label="Navegación principal"
        >
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className="homy-nav-link rounded-full px-4 py-2 text-[15px] font-semibold text-navy/70 transition-colors hover:text-navy"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* Acciones */}
        <div className="hidden items-center gap-2 lg:flex">
          {!loading && user ? (
            <Button
              className="rounded-full bg-navy font-semibold text-white shadow-[0_10px_24px_-10px_rgba(10,37,64,0.6)] transition-all hover:bg-[#123455] active:scale-[0.98]"
              onClick={goPanel}
            >
              <LayoutDashboard className="size-4" aria-hidden />
              Mi panel
            </Button>
          ) : (
            <>
              <Button
                variant="ghost"
                className="rounded-full font-semibold text-navy hover:bg-confort"
                onClick={() => navigate("/ingresar")}
              >
                Ingresar
              </Button>
              <button
                className="homy-btn-primary px-5 py-2.5 text-[14px]"
                onClick={() => navigate("/registrarse")}
              >
                <Sparkles className="size-4" aria-hidden />
                Crear cuenta
              </button>
            </>
          )}
        </div>

        {/* Menú mobile */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild className="lg:hidden">
            <Button
              variant="outline"
              size="icon"
              className="size-11 rounded-2xl border-line bg-white/70 text-navy"
              aria-label="Abrir menú"
            >
              <Menu className="size-5" />
            </Button>
          </SheetTrigger>
          <SheetContent
            side="right"
            className="w-[300px] homy-glass-strong"
          >
            <SheetHeader>
              <SheetTitle className="flex items-center gap-2">
                <Homy size={36} />
                <HomIAWordmark className="text-xl" />
              </SheetTitle>
            </SheetHeader>
            <nav
              className="mt-2 flex flex-col gap-1 px-4"
              aria-label="Navegación móvil"
            >
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setOpen(false)}
                  className="rounded-2xl px-4 py-3 text-base font-semibold text-navy/80 transition-colors hover:bg-confort hover:text-navy"
                >
                  {item.label}
                </Link>
              ))}
              <div className="my-3 h-px bg-line" />
              {!loading && user ? (
                <Button
                  className="mt-2 rounded-full bg-navy font-semibold text-white hover:bg-[#123455]"
                  onClick={() => {
                    setOpen(false);
                    goPanel();
                  }}
                >
                  Mi panel
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    className="rounded-full font-semibold"
                    onClick={() => {
                      setOpen(false);
                      navigate("/ingresar");
                    }}
                  >
                    Ingresar
                  </Button>
                  <Button
                    className="mt-2 rounded-full bg-action font-semibold text-white hover:bg-action-2"
                    onClick={() => {
                      setOpen(false);
                      navigate("/registrarse");
                    }}
                  >
                    Crear cuenta
                  </Button>
                </>
              )}
            </nav>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
