# Worklog — Proyecto HomIA

---
Task ID: 1
Agent: Super Z (main)
Task: Página Home de HomIA — logo transparente + wordmark, barra de búsqueda central con flujos animados (consultas ← barra → respuestas), Homy 2D detrás de la barra interactivo, plugin flotante de Homy con chat IA real.

Work Log:
- Inicializado entorno fullstack (Next.js 16 + Tailwind 4 + shadcn/ui + Prisma).
- Analizado logo real subido por el usuario (`upload/Gemini_Generated_Image_v7cj20v7cj20v7cj (1).png`): robot blanco con cable-plug azul/naranja y núcleo cálido + wordmark "HomIA" con punto multicolor.
- `src/app/globals.css`: paleta de marca como tokens Tailwind 4 (navy #0A2540, tech #1D63B8, chalk #FAFAFA, confort #F0F2F5, action #FF5A1F, ai #00C4FF, gold #FFC700), keyframes de flujos (flow-q/flow-a con unidades cqw), estilos text-relief, bar-relief, glass-card, bg-grid-fade, flow-line, soporte prefers-reduced-motion.
- `src/components/homy/homy-character.tsx`: Homy 2D en SVG puro (transparente, escalable, sin fondo blanco), fiel al logo (cuerpo blob, brazos, pies, cable con rizo + enchufe naranja/blanco, núcleo radial con glow). Estados: idle (flotante), listening (núcleo acelerado + enchufe wiggle), thinking (burbujas + tilt), happy (rebote). Wordmark HomIA con punto degradado sobre la "i".
- `src/app/api/homy/route.ts` + `src/lib/homy.ts`: endpoint POST con IA real (z-ai-web-dev-sdk), prompt de sistema en español rioplatense empático, respuesta JSON validada con zod (message, category, urgency, summary, suggestions). Fallback honesto sin datos inventados. Sin mock data.
- `src/components/home/hero-search.tsx`: barra corta centrada (min(88vw,430px)) con efecto vidrio esmerilado tipo relieve; flujos laterales (ocultos < lg) con máscaras de disolución en los bordes y 2 carriles alternos; consultas entran de izquierda y se disuelven al llegar a la barra; respuestas nacen en la barra y viajan al borde derecho; al escribir se pausan los flujos, Homy reacciona y tras debounce de 1.4s consulta la IA real; panel de respuesta glass con chips de categoría/urgencia y sugerencias clickeables; typewriter de placeholder en idle/mobile.
- `site-header.tsx`: logo transparente (sin cuadrado blanco) + wordmark a escala visible, nav con anclas, CTAs con toast honesto ("muy pronto"), menú mobile con Sheet.
- Secciones: `hero.tsx` (sello IA pulsante, titular con degradado tech→ai, chips de confianza), `how-it-works.tsx` (3 pasos animados), `ai-band.tsx` (banda navy con pipeline de 6 agentes IA y líneas de flujo animadas), `features.tsx` (6 beneficios con glow por color), `profiles.tsx` (Cliente/Profesional/Proveedor), `cta-final.tsx` (panel navy + Homy + evento homy:open), `site-footer.tsx`.
- `homy-widget.tsx`: plugin flotante bottom-right con Homy, panel de chat glass con historial, indicador "interpretando", chips de sugerencias generadas por IA real.
- `layout.tsx`: metadata es-AR de HomIA, fuente Plus Jakarta Sans, lang es-AR. `src/app/icon.svg` + `public/logo.svg`: favicon/logo de Homy.
- Verificación con Agent Browser: desktop 1440px (hero, flujos, secciones, CTA, footer), mobile 390px (header, barra, Homy escalado, secciones), prueba end-to-end de la barra ("Necesito un plomero urgente..." → Plomería / Urgencia alta / sugerencias) y del chat ("¿Cómo funciona HomIA?" → respuesta real). Lint sin errores, consola sin errores, API 200.

Stage Summary:
- Home 100% funcional y testeada. Entregados los 3 pedidos: (1) logo sin fondo + "HomIA" a escala, (2) barra central corta con consultas/respuestas en texto relieve sin recuadros, (3) Homy 2D fiel al logo detrás de la barra reaccionando al tipeo + plugin flotante de chat.
- La IA de Homy responde con datos reales del motor (sin mock data). Próximas fases pendientes de confirmación del usuario: FASE 1 (modelado de datos), autenticación, etc.
