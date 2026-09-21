# AGENTS.md — Contexto del proyecto HomIA

> **Leé esto completo antes de tocar código.** Este documento es la fuente de verdad del
> producto y de la arquitectura. Fue escrito para que cualquier asistente de IA
> (Claude Code, Google Antigravity, Cursor) continúe el desarrollo SIN romper nada.

---

## 1. Qué es HomIA

Ecosistema digital de servicios del hogar para Argentina, **freemium, 3 roles**:

| Rol | Qué hace | Monetización |
|---|---|---|
| **Cliente** | Busca profesionales (directorio), publica trabajos, contrata (wizard), compra materiales (marketplace), paga con escrow/facturas, deja reseñas | Gratis |
| **Profesional** | Ofrece servicios, oferta en trabajos (bids), ejecuta proyectos, factura, cobra | Gratis (legacy: suscripción) |
| **Proveedor** | Vende materiales (stock propio sobre catálogo maestro), multi-tipo (ferretería/corralón/etc.), unidades de venta, cargas y links de pago | **Suscripción: Básico US$50/mes (trial 14 días) o PRO US$100/mes** (PRO = panel de analítica + sponsor en home + tarjeta "recomendado") |

Principios no negociables:
- **100% funcional, cero mock data.** Si algo no está disponible (ej. Mercado Pago sin token), la UI lo dice con un mensaje honesto, nunca inventa datos.
- **Mobile-first**: la mayoría usa desde el celu. Viewport de referencia 390×844. Todo se verifica en móvil primero.
- **Español rioplatense** en TODA la UI y en los prompts de IA (voseo: "buscá", "contratá").
- **Fallback honesto**: si la IA no responde, hay respuesta de fallback predefinida; nunca contenido inventado.

## 2. Stack

- **Next.js 16 App Router** (React 19, TypeScript) como SPA: las rutas viven en `src/components/app/app-root.tsx` (registro central) + `src/lib/router.ts` (`navigate()`).
- **Tailwind 4 + shadcn/ui** (Radix). Iconos `lucide-react`.
- **Prisma 6 + SQLite en desarrollo** (`db/custom.db`). Ver §12 para migración a Postgres.
- **Auth propia**: bcryptjs + JWT httpOnly cookie (`SameSite=Lax`, `Secure` auto si HTTPS). Secret en `AUTH_SECRET` (fail-fast en producción). Helpers: `src/lib/auth.ts` (`getSessionUser`), `src/lib/api.ts` (`fail`, validaciones zod).
- **PDF**: `pdf-lib` para facturas (`/api/invoices/[id]/pdf`).
- **Mapas**: leaflet + react-leaflet (radio de búsqueda del directorio).
- **IA**: 4 usos, todos vía `src/lib/ai.ts` (shim OpenAI-compatible). Ver §9.
- **Pagos**: `mercadopago` SDK (pagos, escrow, suscripciones proveedor, webhook).

## 3. Estructura del código

```
src/
  app/
    api/…              # 58 endpoints (route.ts) — mapa completo en §6
    layout.tsx         # root layout
  components/
    app/
      app-root.tsx     # ★ registro central de rutas SPA (router cliente)
      …                # una pantalla por feature (mobile-first, .homy-page)
  lib/
    router.ts          # navigate()
    db.ts              # PrismaClient singleton (export db)
    auth.ts            # getSessionUser, JWT, fail-fast AUTH_SECRET
    api.ts             # helpers fail/ok, parseo zod
    ai.ts              # ★ shim IA portable (reemplaza z-ai-web-dev-sdk fuera del sandbox)
    homy-agent.ts      # Superagente Homy: loop ReAct + 4 herramientas reales
    dni-ai.ts          # verificación de DNI con IA (visión)
    search-match.ts    # búsqueda difusa: NFD + lowercase + sin diacríticos + similitud + singular/plural
supabase/migrations/   # 18 migraciones SQL de referencia (espejo Postgres del esquema)
scripts/               # seeds, E2E, auditoría de seguridad
prisma/schema.prisma   # 31 modelos
```

Convenciones de UI (no inventar otras):
- Clases utilitarias del design system: `.homy-page`, `.homy-glass`, `.homy-glass-strong`, `.homy-glass-soft`, `.homy-eyebrow` (glass morphism).
- Layout tipo app-shell (Gmail/Notion): viewport anclado, scroll interno del contenido (`h-screen overflow-hidden` + área scrolleable) en TODOS los listados.
- App móvil 390px: nada se desborda; los números largos (precios) deben reflowear la tarjeta (tarjeta se adapta al número, nunca al revés).
- Badges de verificación DNI: "verificado" / "no verificado" — nunca ocultar el estado.
- Mensajería estilo WhatsApp: **el cliente siempre inicia la conversación** (profesional/proveedor NO pueden iniciar).
- Header del buscador: sticky `top-0`, NO tapa controles del mapa (radio).

## 4. Autenticación y seguridad (implementado y verificado)

- bcrypt (hash) + JWT en cookie httpOnly. `AUTH_SECRET` obligatorio en producción (fail-fast con mensaje claro).
- Cabeceras de seguridad en `next.config.ts` (nosniff, referrer-policy, permissions-policy; uploads con CSP sandbox).
- Auditoría de seguridad: `bash scripts/sec-audit.sh` (29 checks: sesión, 401/403 en todos los endpoints, IDOR, XSS uploads, etc.).
- Rate/validación: zod en todos los bodies, `fail()` para errores.

## 5. Modelo de datos (31 modelos en prisma/schema.prisma)

- **Identidad**: `User` (roles JSON), `IdentityDocument` (DNI + análisis IA, estado verificación)
- **Perfiles**: `ProfessionalProfile`, `ProviderProfile` (multi-tipo, plan/suscripción, trial)
- **Catálogo**: `Category` (20), `CatalogElement` (1247 elementos con nombre canónico + aliases + descripción + unidad de venta), `ProviderStock`, `StockMovement`, `StockReservation`
- **Trabajo**: `JobPost`, `JobBid`, `Project`, `ProjectMaterial`, `Invoice`, `InvoiceItem`, `Payment`, `ProviderCharge`, `ProviderLink`, `CompletedWork`
- **Reputación**: `Review` (estrellas + comentario + foto opcional; proyecto→profesional, proyecto→proveedor, compra directa→proveedor), `Purchase` (compra directa marketplace)
- **CRM**: `CrmPipeline`, `CrmStage`, `CrmDeal`
- **Comunicación**: `Conversation`, `Message` (estilo WhatsApp, cliente inicia), `Notification`
- **Homy IA**: `HomySession`, `HomyMessage`, `SearchEvent`
- `Favorite`

Notas de esquema: SQLite → sin enums (String), sin arrays (JSON como string), lat/lng como Float. Todo el texto de negocio está en español rioplatense.

## 6. Mapa de API (58 endpoints)

| Dominio | Endpoints | Notas |
|---|---|---|
| auth | `/auth/login` `/auth/logout` `/auth/me` `/auth/register` | registro con rol, cómo nos encontró |
| catálogo | `/catalog` (GET búsqueda difusa, POST alta con IA — solo proveedor, anti-duplicado) | nombre/alias/desc/unidad |
| búsqueda | `/search`, `/search/pins` | fuzzy + geo; pins para mapa |
| directorio | `/directory` | ordenado por reseñas, filtros rubro+precio, adaptativo |
| trabajos | `/jobs`, `/jobs/[id]`, `/jobs/[id]/bids`, `/bids/[id]` | publicar/ofertar/asignar |
| proyectos | `/projects`, `/projects/[id]`, `/projects/[id]/escrow` (+`/release`), `/projects/[id]/invoice`, `/projects/[id]/materials` | wizard contratar → escrow → factura |
| facturas | `/invoices/[id]/pdf` (pdf-lib), `/invoices/[id]/cash` | PDF descargable, pago efectivo |
| marketplace | `/marketplace`, `/purchases`, `/purchases/[id]` | compra directa de materiales al proveedor |
| stock | `/provider/stock` | CRUD stock proveedor sobre catálogo |
| proveedor | `/provider/analytics` (PRO), `/provider/charges`, `/provider/links`, `/provider/plan`, `/provider/subscription` | plan Básico/PRO, trial 14 días |
| reseñas | `/reviews` | estrella+comentario+foto; post-proyecto y post-compra |
| mensajes | `/messages/conversations`, `/messages/conversations/[id]`, `/messages/unread` | WhatsApp-like |
| works | `/works` | obras completadas (portafolio) |
| reviews de perfil | `/profiles/professional/[id]`, `/profiles/provider/[id]`, `/profiles/me`, `/profiles/documents` | |
| cliente | `/users/[id]/client-summary` | resumen del cliente visible en chat/proyecto (confianza bidireccional) |
| homy | `/homy` (chat IA), `/homy/agent` (superagente ReAct) | |
| uploads | `/uploads` | fotos: obras, reseñas, DNI. ⚠️ en Vercel → Blob Storage (§12) |
| verificación | `/verification/dni` | 2 fotos (frente/dorso) + IA visión + badge |
| pagos | `/payments/webhook` | MP: pagos + suscripciones (proveedor) |
| otros | `/notifications`, `/favorites`, `/sponsors`, `/comparables`, `/charges/[id]` | |

## 7. Flujos críticos (así funcionan, así hay que dejarlos)

1. **Contratar desde el directorio**: directorio (orden por reseñas, filtros rubro+precio) → detalle (gate de login para contactar) → wizard Contratar (presupuesto, materiales A/B, escrow) → proyecto → chat → trabajo completado → **reseña con estrellas+comentario+foto** → factura PDF.
2. **Compra directa de materiales**: buscar elemento (ej. "caño") → resultados de TODOS los proveedores con stock (fuzzy, sin tope, con marcas) → compra → **reseña post-compra** → alimenta analítica PRO.
3. **Alta de elemento con IA (proveedor)**: combobox con búsqueda difusa sobre 1247 elementos → si no existe, botón "Agregar «X» al catálogo con IA" → IA genera descripción+aliases+unidad → anti-duplicado antes de crear.
4. **Verificación DNI**: sube frente+dorso → IA visión valida → badge verificado/no verificado en perfil.
5. **Suscripción proveedor**: Básico US$50/mes trial 14 días / PRO US$100/mes (tarjeta "recomendado" en primera fila, sponsor con logo en home, analítica: elementos más solicitados + consultas por rubro). Solo proveedores.

## 8. Catálogo de elementos

- 1247 elementos, 20 categorías, 100% con descripción natural (español rioplatense) + aliases + unidad de venta.
- Seeder **idempotente**: `node scripts/seed-catalog-maestro.mjs` (upsert por nombre+categoría; NO rompe ProviderStock existente). Los datos viven en `scripts/catalog-maestro.mjs`, `catalog-expansion.mjs`, `catalog-exp2-{a,b,c,d}.mjs`.
- Datos demo completos (3 usuarios demo, stock, proyectos, reseñas): `node scripts/demo-seed.mjs` (+ `demo-seed-lib.mjs`). Credenciales demo: `cliente@homia.test` / `profesional@homia.test` / `proveedor@homia.test`, pass `Homy2026!`.
- Búsqueda difusa obligatoria: usar `src/lib/search-match.ts` (NFD, lowercase, strip diacríticos, similitud, singular/plural). Nunca `String.includes` pelado.

## 9. IA

- **Único punto de entrada: `src/lib/ai.ts`** (shim OpenAI-compatible: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_VISION_MODEL`). Los 4 call-sites importan `ZAI` de `z-ai-web-dev-sdk` **dentro del sandbox original**; fuera de él hay que cambiar esas 4 líneas de import a `@/lib/ai` (ver §12).
- Usos: (1) chat Homy `/api/homy`, (2) superagente ReAct `/api/homy/agent` con herramientas reales (buscar_profesionales, buscar_trabajos, buscar_materiales, comparar_precios), (3) verificación DNI visión `/api/verification/dni`, (4) alta de elemento con IA `POST /api/catalog`.
- Todos con zod + fallback honesto. Prompts en español rioplatense. No inventar marcas ni datos.

## 10. Reglas para el asistente

1. No introduzcas mock data ni hardcodees resultados. Si un servicio externo no está configurado, devolvé mensaje honesto.
2. Mantené la consistencia del design system (§3) y mobile-first. Probá en 390×844 mentalmente en cada cambio de UI.
3. Todos los endpoints nuevos: zod + auth check (`getSessionUser`) + `fail()` para errores + 401/403 correctos.
4. Mensajería: el cliente SIEMPRE inicia. Reseñas: estrellas+comentario+foto en TODOS los flujos.
5. No rompas la búsqueda difusa: siempre `search-match.ts`.
6. Español rioplatense en UI, prompts y comentarios de negocio.
7. Antes de declarar listo un cambio: build verde + probá el flujo real (script E2E o curl).

## 11. Estado actual (verificado con pruebas reales)

✔ Implementado y probado E2E: auth 3 roles, directorio con reseñas+filtros, wizard contratar con escrow y materiales A/B, facturas PDF (pdf-lib), mensajería WhatsApp-like (cliente inicia), reseñas en los 3 flujos con foto, marketplace de materiales (fuzzy multi-proveedor, "caño" trae stock), catálogo 1247 + alta con IA, verificación DNI con IA + badges, suscripciones MP Básico/PRO con trial + analítica PRO + sponsors, superagente Homy con datos reales, CRM básico, notificaciones, favoritos, app-shell, guía/tour por rol, videos de ayuda, cabeceras de seguridad, auditoría sec-audit 29/29, build standalone verde, E2E visual 14/14, smoke API 18/18.

## 12. ★ TAREAS OBLIGATORIAS de migración a Vercel (hacerlas primero, en orden)

El proyecto venía de un sandbox con SQLite + SDK de IA propio + FS escribible. Para Vercel:

1. **Postgres (Supabase)**: en `prisma/schema.prisma` → `provider = "postgresql"`, agregar `directUrl = env("DIRECT_URL")` al datasource. `DATABASE_URL` = pooler 6543 con `?pgbouncer=true&connection_limit=1`; `DIRECT_URL` = 5432. Luego `npx prisma db push`. (El esquema usa solo String/Float/Boolean/DateTime/JSON-as-string: es 100% válido en PG. Las migraciones SQL de `supabase/migrations/` son solo referencia.)
2. **Build script**: `package.json` → `"build": "prisma generate && next build"` y `"postinstall": "prisma generate"`. Quitar los hacks de standalone/bun del sandbox. En `next.config.ts` quitar `output: "standalone"`.
3. **IA**: cambiar 4 imports `import ZAI from 'z-ai-web-dev-sdk'` → `import ZAI from '@/lib/ai'` en `src/app/api/homy/route.ts`, `src/app/api/homy/agent/route.ts` (si importa ahí), `src/lib/homy-agent.ts`, `src/lib/dni-ai.ts`, `src/app/api/catalog/route.ts` (los que aplique) y desinstalar `z-ai-web-dev-sdk`. Configurar `AI_*` en .env. Agregar `export const maxDuration = 60` en las rutas que llaman IA (vision DNI puede tardar).
4. **Uploads → Vercel Blob**: el FS de serverless es read-only. Instalar `@vercel/blob` y reemplazar la escritura a `public/uploads/` en `src/app/api/uploads/route.ts`, `src/app/api/works/route.ts`, `src/app/api/reviews/route.ts`, `src/app/api/verification/dni/route.ts` por `put()` del blob y guardar la URL devuelta. (Alternativa: Supabase Storage, policies ya bosquejadas en `supabase/migrations/0010_storage_policies.sql`.)
5. **Seeds en producción**: `DATABASE_URL` apuntando a Supabase → `npx prisma db push` → `node scripts/seed-catalog-maestro.mjs` (catálogo) → opcional `node scripts/demo-seed.mjs` (datos demo).
6. **Desinstalar** `z-ai-web-dev-sdk` y cualquier resto del sandbox. Revisar que no queden imports.

Verificación post-migración: registro → login → búsqueda "caño" (materiales) → contratar wizard → PDF factura → reseña con foto → DNI IA → webhook MP (con token test).
