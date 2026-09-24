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

> ⚠️ Hay **una sola base**: el `.env` local apunta al Postgres de Supabase de **producción**.
> Todo lo que se escribe desde local (scripts, seeds, pruebas) queda en producción.

```bash
npm install
cp .env.example .env          # completar DATABASE_URL + DIRECT_URL (Supabase) y AUTH_SECRET
npm run dev                   # http://localhost:3000
```

- **Cambios de esquema**: nunca `prisma db push` contra producción. Se genera el SQL con `prisma migrate diff --script`, se revisa y se aplica con `prisma db execute` (copia en `supabase/migrations/`). Ver `AGENTS.md` §2.
- **Catálogo** (1247 elementos, 20 categorías, idempotente): `node scripts/catalogo/seed-catalog-maestro.mjs`.
- **Datos demo** (`cliente@homia.test` / `profesional@homia.test` / `proveedor@homia.test`, pass `Homy2026!`): `node scripts/demo/demo-seed.mjs`. Ojo: borra y recrea los datos demo en la base de producción.
- Resto de los scripts: [`scripts/README.md`](./scripts/README.md).

## Roles

- **Cliente**: directorio por reseñas, contratación guiada, facturas PDF, compra directa de materiales, reseñas con foto. Paga al finalizar (facturas de proyecto) o al retirar (compras), con Mercado Pago o efectivo; sin escrow ni retención de pago.
- **Profesional**: ofertas de trabajo, proyectos, facturación, cobros.
- **Proveedor** (suscripción en pesos con trial de 14 días: Básico $50.000/mes para usar la app completa, o PRO $100.000/mes que suma logo y marca en la home, tarjeta "Recomendado" y analítica de demanda): stock sobre un catálogo maestro de 1247 elementos con alta asistida por IA; cobra por Mercado Pago (OAuth) o efectivo.

Stack: bcrypt + JWT httpOnly · pdf-lib · leaflet · Mercado Pago · IA vía endpoint OpenAI-compatible (`src/lib/ai.ts`).
