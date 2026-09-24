# HomIA

Ecosistema digital de servicios del hogar para Argentina — **freemium, 3 roles**: Cliente, Profesional y Proveedor de materiales. Next.js 16 (App Router) + Prisma + Tailwind/shadcn, mobile-first, con IA en todo el circuito.

## Documentación de arranque

| Documento | Para qué |
|---|---|
| [`AGENTS.md`](./AGENTS.md) | **Contexto completo del proyecto** (producto, arquitectura, 58 endpoints, convenciones, reglas). Léelo primero. |
| [`docs/DEPLOY-VERCEL.md`](./docs/DEPLOY-VERCEL.md) | Guía paso a paso: GitHub → Supabase → Vercel + los 5 cambios de migración. |
| [`docs/historico/PROMPT-INICIO.md`](./docs/historico/PROMPT-INICIO.md) | Prompt listo para pegar en Claude Code / Google Antigravity. |
| [`docs/historico/PRODUCCION.md`](./docs/historico/PRODUCCION.md) | Alternativa self-hosted (VPS con servidor standalone + SQLite). |
| `.env.example` | Todas las variables de entorno documentadas. |

## Arranque rápido (desarrollo)

```bash
npm install
cp .env.example .env          # completar DATABASE_URL (SQLite local) y AUTH_SECRET
npx prisma db push
node scripts/catalogo/seed-catalog-maestro.mjs   # catálogo: 1247 elementos, 20 categorías (idempotente)
node scripts/demo/demo-seed.mjs            # opcional: datos demo (usuario@homia.test / Homy2026!)
npm run dev                    # http://localhost:3000
```

## Roles

- **Cliente**: directorio por reseñas, contratación guiada con escrow, facturas PDF, compra directa de materiales, reseñas con foto.
- **Profesional**: ofertas de trabajo, proyectos, facturación, cobros.
- **Proveedor** (suscripción Básico US$50/mes con trial 14 días, o PRO US$100/mes con analítica + sponsor): stock sobre un catálogo maestro de 1247 elementos con alta asistida por IA.

Stack: bcrypt + JWT httpOnly · pdf-lib · leaflet · Mercado Pago · IA vía endpoint OpenAI-compatible (`src/lib/ai.ts`).
