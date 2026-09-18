"use client";
import Link from "next/link";
import { Homy, HomIAWordmark } from "@/components/homy/homy-character";
import { navigate } from "@/lib/router";

const FOOTER_COLUMNS = [
  {
    title: "Plataforma",
    links: [
      { label: "Buscar servicios", href: "#", route: "/buscar" },
      { label: "Soy profesional", href: "#comunidad", route: "#comunidad" },
      { label: "Soy proveedor", href: "#comunidad", route: "#comunidad" },
      { label: "Bolsa de trabajo", href: "#comunidad", route: "#comunidad" },
    ],
  },
  {
    title: "HomIA",
    links: [
      { label: "Cómo funciona", href: "#como-funciona", route: "#como-funciona" },
      { label: "Motor IA", href: "#motor-ia", route: "#motor-ia" },
      { label: "Beneficios", href: "#beneficios", route: "#beneficios" },
      { label: "Directorio de la comunidad", href: "#", route: "/directorio" },
    ],
  },
  {
    title: "Ayuda y confianza",
    links: [
      { label: "Centro de ayuda: dónde hago cada cosa", href: "#", route: "/ayuda" },
      { label: "Escrow y pagos protegidos", href: "#", route: "/ayuda" },
      { label: "Verificación de identidad por IA", href: "#", route: "/ayuda" },
      { label: "Reseñas con fotos", href: "#", route: "/ayuda" },
    ],
  },
];

export function SiteFooter() {
  function go(e: React.MouseEvent, route: string) {
    if (route.startsWith("#") && route !== "#") {
      // ancla de la home: scroll nativo
      const el = document.getElementById(route.slice(1));
      e.preventDefault();
      el?.scrollIntoView({ behavior: "smooth" });
      return;
    }
    if (route.startsWith("/")) {
      e.preventDefault();
      navigate(route);
    }
  }

  return (
    <footer className="homy-glass-strong pb-[env(safe-area-inset-bottom)]">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          {/* Marca */}
          <div>
            <div className="flex items-center gap-2.5">
              <Homy size={44} />
              <HomIAWordmark className="text-2xl" />
            </div>
            <p className="mt-4 max-w-xs text-sm leading-relaxed text-navy/55">
              Tu hogar en buenas manos. El ecosistema que conecta clientes,
              profesionales y proveedores con la inteligencia de agentes de IA.
            </p>
          </div>

          {FOOTER_COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-navy/40">
                {col.title}
              </p>
              <ul className="mt-4 space-y-2.5">
                {col.links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      onClick={(e) => go(e, link.route)}
                      className="text-sm font-medium text-navy/60 transition-colors hover:text-tech"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-line/80 pt-7 sm:flex-row">
          <p className="text-[13px] font-medium text-navy/45">
            © {new Date().getFullYear()} HomIA — Tu hogar en buenas manos.
          </p>
          <p className="flex items-center gap-1.5 text-[13px] font-medium text-navy/45">
            <span className="inline-block size-1.5 rounded-full bg-ai" aria-hidden />
            Potenciado por agentes de inteligencia artificial
          </p>
        </div>
      </div>
    </footer>
  );
}
