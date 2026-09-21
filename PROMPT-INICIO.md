# PROMPT-INICIO — pegar como primer mensaje en Antigravity / Claude Code

> Abrí la carpeta del proyecto con la herramienta y pegá esto tal cual.

---

Este proyecto es **HomIA**, un ecosistema de servicios del hogar (Next.js 16 + Prisma +
Tailwind/shadcn, 3 roles: Cliente / Profesional / Proveedor). Antes de tocar nada, leé
completo el archivo `AGENTS.md` (si sos Claude, ya te cargó `CLAUDE.md` que lo incluye):
ahí está el contexto del producto, la arquitectura, el mapa de los 58 endpoints, las
convenciones de UI y las reglas del proyecto.

**Tu tarea ahora: aplicar los 5 cambios de migración a Vercel que están detallados en
`DEPLOY-VERCEL.md` §2** (leelo completo antes de empezar). Resumen:

1. Prisma: provider `postgresql` + `directUrl` (Supabase), scripts de build limpios
   (`postinstall: prisma generate`, `build: prisma generate && next build`) y quitar
   `output: "standalone"` de `next.config.ts`.
2. IA: reemplazar los imports de `z-ai-web-dev-sdk` por `@/lib/ai` en los 4 archivos que
   lo usan (el shim ya existe en `src/lib/ai.ts`, misma interfaz) y desinstalar el SDK
   viejo. Agregar `export const maxDuration = 60` a los routes que llaman IA.
3. Uploads: reemplazar la escritura a `public/uploads/` por `@vercel/blob` (`put()`,
   guardar la URL devuelta) en `/api/uploads`, `/api/works`, `/api/reviews`,
   `/api/verification/dni`.
4. `.env.example` como referencia de variables; crear `.env` local con las mías
   (te las paso cuando pidas, no las inventes).
5. Verificación: `npx prisma db push`, `npm run build` y `npm run dev` — y probar los
   flujos del checklist §2.5 de `DEPLOY-VERCEL.md` (login, búsqueda "caño", contratar,
   PDF, reseña con foto).

**Reglas**: no introduzcas mock data; respetá el design system y el español rioplatense
(§3 y §10 de `AGENTS.md`); no refactorices de más — los cambios mínimos necesarios.
Cuando termines, dame el diff resumen y avisame si algo de lo pedido no pudo hacerse y
por qué.
