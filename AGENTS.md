# AGENTS.md — Contexto del proyecto HomIA

> **Leé esto completo antes de tocar código.** Este documento es la fuente de verdad del
> producto y de la arquitectura. Fue escrito para que cualquier asistente de IA
> (Claude Code, Google Antigravity, Cursor) continúe el desarrollo SIN romper nada.

---

## 1. Qué es HomIA

Ecosistema digital de servicios del hogar para Argentina, **freemium, 3 roles**:

| Rol | Qué hace | Monetización |
|---|---|---|
| **Cliente** | Busca profesionales (directorio), publica trabajos, contrata (wizard), compra materiales (marketplace), paga con facturas, deja reseñas | Gratis |
| **Profesional** | Ofrece servicios, oferta en trabajos (bids), ejecuta proyectos, factura, cobra | Gratis (legacy: suscripción) |
| **Proveedor** | Vende materiales (stock propio sobre catálogo maestro), aprueba y entrega pedidos, cobra por Mercado Pago (OAuth, split con 1% para HomIA) o efectivo, acepta devoluciones de sobrantes | **Suscripción mensual en pesos: Básico $50.000 (usar la app completa) o PRO $100.000 (Básico + logo y marca en la home, tarjeta "Recomendado" en marketplace y directorio, analítica de demanda). Trial 14 días.** |

Principios no negociables:
- **100% funcional, cero mock data.** Si algo no está disponible (ej. proveedor sin Mercado Pago conectado), la UI lo dice con un mensaje honesto, nunca inventa datos.
- **Sin escrow ni retención de pago.** El cliente paga al finalizar (facturas de proyecto) o al retirar (compras), con Mercado Pago o efectivo. No existen visitas agendadas por IA. El copy de la home, la ayuda y los prompts tienen que decir exactamente eso.
- **Mobile-first**: la mayoría usa desde el celu. Viewport de referencia 390×844. Todo se verifica en móvil primero.
- **Español rioplatense** en TODA la UI y en los prompts de IA (voseo: "buscá", "contratá").
- **Fallback honesto**: si la IA no responde, hay respuesta de fallback predefinida; nunca contenido inventado.

## 2. Stack

- **Next.js 16 App Router** (React 19, TypeScript) como SPA: las rutas viven en `src/components/app/app-root.tsx` (registro central) + `src/lib/router.ts` (`navigate()`).
- **Tailwind 4 + shadcn/ui** (Radix). Iconos `lucide-react`.
- **Prisma 6 + Postgres (Supabase)** en todos los entornos: `DATABASE_URL` (pooler 6543) + `DIRECT_URL` (5432). Sin `prisma/migrations`: los cambios de schema se aplican con `prisma migrate diff --script` revisado + `prisma db execute` (copia en `supabase/migrations/`). Nunca `db push --accept-data-loss` a ciegas contra producción.
- **Auth propia**: bcryptjs + JWT httpOnly cookie (`SameSite=Lax`, `Secure` auto si HTTPS). Secret en `AUTH_SECRET` (fail-fast en producción). Helpers: `src/lib/auth.ts` (`getSessionUser`), `src/lib/api.ts` (`fail`, validaciones zod).
- **PDF**: `pdf-lib` para facturas (`/api/invoices/[id]/pdf`).
- **Mapas**: leaflet + react-leaflet (radio de búsqueda del directorio).
- **Archivos**: Supabase Storage vía `POST /api/uploads`. Bucket `homia-uploads` (público: obras, reseñas, avatares, sobrantes) y `dni-docs` (privado: DNI, signed URLs de 10 min solo al dueño).
- **IA**: 4 usos, todos vía `src/lib/ai.ts` (shim OpenAI-compatible; hoy OpenAI `gpt-5.4-mini` texto y visión). Ver §9.
- **Pagos**: `mercadopago` SDK con DOS apps de la misma cuenta: "Checkout Pro" (`MP_ACCESS_TOKEN`, `MP_CLIENT_ID/SECRET`: pagos, OAuth marketplace, refunds) y "Suscripciones" (`MP_SUB_ACCESS_TOKEN`: preapprovals del plan). Webhook único `POST /api/payments/webhook` con firma HMAC (`MP_WEBHOOK_SECRET`, `MP_SUB_WEBHOOK_SECRET`), idempotente por `Payment.mpPaymentId`, valida monto y moneda, usa token de prueba si `live_mode=false`. Las compras directas se cobran con el token OAuth del proveedor (split 1%); sin OAuth solo hay efectivo.

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
scripts/               # ver scripts/README.md
  catalogo/            # catálogo maestro (datos + seeder idempotente)
  demo/                # seed demo + assets (DNI, fotos de reseñas)
  base/                # utilidades de la base (RLS)
  e2e/                 # pruebas vivas (sec-audit.sh)
  limpieza/            # purgas de usuarios/datos de prueba
  medios/              # generadores de imágenes, videos y favicon
  historico/           # scripts de un solo uso y E2E del sandbox viejo (no se corren)
prisma/schema.prisma   # 31 modelos
docs/                  # auditoría, plan de lanzamiento, guía de deploy
  historico/           # worklog, contratos y guías viejas (solo consulta)
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
- Auditoría de seguridad: `bash scripts/e2e/sec-audit.sh` (29 checks: sesión, 401/403 en todos los endpoints, IDOR, XSS uploads, etc.).
- Validación: `parseBody(req, zodSchema)` de `src/lib/api.ts` en las rutas de dinero y estado (purchases, projects, materials, invoice, plan, verification, profiles/me, returns, bids); el resto todavía castea `body<T>()` (deuda). `fail()` para errores.
- Rate limit: `src/lib/rate-limit.ts` (memoria) NO sirve en Vercel; el límite real va en Vercel Firewall (login 10/15 min, registro 8/h, homy 30/h, uploads 60/h por IP). `/api/homy*` exige sesión.
- `next.config.ts` con `ignoreBuildErrors: false` y `tsconfig` con `noImplicitAny: true`: el build tiene que compilar limpio.

## 5. Modelo de datos (33 modelos en prisma/schema.prisma)

- **Identidad**: `User` (roles JSON), `IdentityDocument` (DNI + análisis IA, estado verificación)
- **Perfiles**: `ProfessionalProfile`, `ProviderProfile` (multi-tipo, plan/suscripción, trial)
- **Catálogo**: `Category` (20), `CatalogElement` (1247 elementos con nombre canónico + aliases + descripción + unidad de venta), `ProviderStock`, `StockMovement`, `StockReservation`
- **Trabajo**: `JobPost`, `JobBid`, `Project`, `ProjectMaterial`, `Invoice`, `InvoiceItem`, `Payment`, `ProviderCharge`, `ProviderLink`, `CompletedWork`
- **Reputación**: `Review` (estrellas + comentario + foto opcional; proyecto→profesional, proyecto→proveedor, compra directa→proveedor), `Purchase` (compra directa marketplace)
- **CRM**: `CrmPipeline`, `CrmStage`, `CrmDeal`
- **Comunicación**: `Conversation`, `Message` (estilo WhatsApp, cliente inicia), `Notification`
- **Homy IA**: `HomySession`, `HomyMessage`, `SearchEvent`
- **Sobrantes**: `LeftoverReturn` (devolución a un proveedor; origen proyecto o compra; estado; pago original; reembolso MP) + `LeftoverItem` (foto, cantidad pedida/aceptada/recibida, monto)
- `Favorite`, `OAuthState`

Notas de esquema: SQLite → sin enums (String), sin arrays (JSON como string), lat/lng como Float. Todo el texto de negocio está en español rioplatense.

## 6. Mapa de API

| Dominio | Endpoints | Notas |
|---|---|---|
| auth | `/auth/login` `/auth/logout` `/auth/me` `/auth/register` | registro con rol, cómo nos encontró |
| catálogo | `/catalog` (GET búsqueda difusa, POST alta con IA — solo proveedor, anti-duplicado) | nombre/alias/desc/unidad |
| búsqueda | `/search`, `/search/pins` | fuzzy + geo; pins para mapa |
| directorio | `/directory` | ordenado por reseñas, filtros rubro+precio, adaptativo |
| trabajos | `/jobs`, `/jobs/[id]`, `/jobs/[id]/bids`, `/bids` (GET mine=1), `/bids/[id]` | publicar/ofertar/retirar/asignar; aceptar es transaccional y solo desde `pendiente` |
| proyectos | `/projects`, `/projects/[id]`, `/projects/[id]/invoice`, `/projects/[id]/materials` | wizard (brief `budgetMin/Max`, `laborCost=0`) → el pro cotiza → etapas solo hacia adelante → `finalizado` solo el cliente desde ejecución/revisión → una factura pendiente por proyecto (materiales con `invoicedAt`); stock se reserva al APROBAR el material y se libera al rechazar/cancelar |
| facturas | `/invoices/[id]/pdf` (pdf-lib), `/invoices/[id]/cash` | PDF descargable, pago efectivo |
| marketplace | `/marketplace`, `/purchases`, `/purchases/[id]` | compra directa: `pendiente_aprobacion` → `aprobado` (reserva atómica + `ProviderCharge` + `chargeId`) → `pagar_mp`/`pagar_efectivo` → `entregado`/`pagado`; `rechazado`/`cancelado` liberan stock; excluye proveedores sin plan operativo |
| stock | `/provider/stock` | CRUD stock proveedor sobre catálogo |
| proveedor | `/provider/analytics` (PRO), `/provider/charges`, `/provider/links`, `/provider/plan` | plan en ARS, trial 14 días (`trialEndsAt`); cambiar de plan cancela la preapproval anterior; vencido = 403 en escrituras y fuera de marketplace/search/directorio/sponsors |
| sobrantes | `/returns` (GET, POST), `/returns/[id]` (aceptar/rechazar/cancelar/recibir/reembolsar_efectivo/reintentar_reembolso) | ver §7 punto 6 |
| mercado pago | `/mp/oauth/connect`, `/mp/oauth/callback`, `/mp/oauth` (DELETE) | OAuth del proveedor; refresh automático; exige sesión |
| cron | `/cron/reservations` (cada hora, `CRON_SECRET` obligatorio) | vence pedidos aprobados sin pago (48 h reserva / 7 días compra) y libera stock |
| reseñas | `/reviews` | estrella+comentario+foto; post-proyecto y post-compra |
| mensajes | `/messages/conversations`, `/messages/conversations/[id]`, `/messages/unread` | WhatsApp-like |
| works | `/works` | obras completadas (portafolio) |
| reviews de perfil | `/profiles/professional/[id]`, `/profiles/provider/[id]`, `/profiles/me`, `/profiles/documents` | |
| cliente | `/users/[id]/client-summary` | resumen del cliente visible en chat/proyecto (confianza bidireccional) |
| homy | `/homy` (chat IA), `/homy/agent` (superagente ReAct) | |
| uploads | `/uploads` | Supabase Storage; `folder=dni` → bucket privado, devuelve path `dni-docs/<uid>/dni/<x>`; solo jpg/png/webp por magic bytes, 8 MB |
| verificación | `/verification/dni` | 2 paths `dni-docs/…` propios + IA visión (nombre y DNI detectados, cruce con `dniCuil`) + badge; 3 intentos/día; no degrada `verificado` sin dictamen |
| pagos | `/payments/webhook` | MP: pagos (factura/charge/purchase) + preapprovals; firma HMAC; `Payment` por upsert |
| otros | `/notifications`, `/favorites`, `/sponsors`, `/comparables`, `/charges/[id]` | |

## 7. Flujos críticos (así funcionan, así hay que dejarlos)

1. **Contratar desde el directorio**: directorio (orden por reseñas, filtros rubro+precio) → detalle (gate de login para contactar) → wizard Contratar (presupuesto, materiales A/B) → proyecto → chat → trabajo completado → **reseña con estrellas+comentario+foto** → factura PDF.
2. **Compra directa de materiales**: buscar elemento (ej. "caño") → resultados de TODOS los proveedores con stock (fuzzy, sin tope, con marcas) → compra → **reseña post-compra** → alimenta analítica PRO.
3. **Alta de elemento con IA (proveedor)**: combobox con búsqueda difusa sobre 1247 elementos → si no existe, botón "Agregar «X» al catálogo con IA" → IA genera descripción+aliases+unidad → anti-duplicado antes de crear.
4. **Verificación DNI**: sube frente+dorso → IA visión valida → badge verificado/no verificado en perfil.
5. **Suscripción proveedor**: trial 14 días → Básico $50.000/mes (usar la app) o PRO $100.000/mes (sponsor con logo y marca en home, tarjeta "Recomendado" en marketplace y directorio, analítica). Solo proveedores. Preapproval de la app Suscripciones; el webhook activa/cancela.
6. **Sobrantes**: cliente o profesional (proyecto) / cliente (compra) cargan ítems pagados con foto, cantidad y condición → el proveedor acepta todos o algunos (fija monto) → los acercan al local → el proveedor marca recibido (vuelven al stock) → si el pago fue por MP, HomIA dispara el refund parcial con el mismo token que cobró (idempotente por `returnId`); si fue efectivo, el proveedor devuelve en el mostrador y lo marca. Plazo 30 días.
7. **Cobro del proveedor por MP**: Cobros → "Conectá Mercado Pago" (OAuth). Sin conexión, sus clientes solo pueden pagarle en efectivo (503 `needsConfig` honesto).

## 8. Catálogo de elementos

- 1247 elementos, 20 categorías, 100% con descripción natural (español rioplatense) + aliases + unidad de venta.
- Seeder **idempotente**: `node scripts/catalogo/seed-catalog-maestro.mjs` (upsert por nombre+categoría; NO rompe ProviderStock existente). Los datos viven en `scripts/catalogo/catalog-maestro.mjs`, `catalog-expansion.mjs`, `catalog-exp2-{a,b,c,d}.mjs`.
- Datos demo completos (3 usuarios demo, stock, proyectos, reseñas): `node scripts/demo/demo-seed.mjs` (+ `demo-seed-lib.mjs`). Credenciales demo: `cliente@homia.test` / `profesional@homia.test` / `proveedor@homia.test`, pass `Homy2026!`.
- Búsqueda difusa obligatoria: usar `src/lib/search-match.ts` (NFD, lowercase, strip diacríticos, similitud, singular/plural). Nunca `String.includes` pelado.

## 9. IA

- **Único punto de entrada: `src/lib/ai.ts`** (shim OpenAI-compatible: `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_VISION_MODEL`). Producción: OpenAI `gpt-5.4-mini` texto y visión. `/api/homy*` exige sesión (anónimos usan `/api/search` sin IA). `maxDuration = 60` en rutas con IA.
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

## 11. Estado actual (23 de septiembre de 2026)

✔ Migración a Vercel + Supabase hecha (Postgres, Storage con dos buckets, IA vía `ai.ts`, variables en Vercel).
✔ Plan de lanzamiento (`docs/PLAN-LANZAMIENTO-48H.md`), Día 1: compra directa completa (reserva de stock, cobro, pago), OAuth MP del proveedor, plan en pesos con trial real, máquina de estados de proyecto con cotización del profesional, factura única, webhook con firma e idempotente, DNI por Supabase, IDORs cerrados, copy honesto. E2E de proyectos 44/44 contra la base real.
◻ Antes de lanzar: smokes B9 del plan (MP de prueba, OAuth real, suscripción, sobrantes, móvil), purga de datos de prueba, rate limit en Vercel Firewall (manual), `MP_WEBHOOK_SECRET` y `MP_SUB_WEBHOOK_SECRET` cargados.
◻ Deuda priorizada: `docs/AUDITORIA-INTEGRAL.md` §9 y `docs/PLAN-LANZAMIENTO-48H.md` §4.

## 12. Variables de entorno (nombres exactos que lee el código)

Ver `.env.example`: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `APP_URL`, `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_TEST_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_SUB_ACCESS_TOKEN`, `MP_SUB_TEST_ACCESS_TOKEN`, `MP_SUB_WEBHOOK_SECRET`, `MP_PROVIDER_BASIC_ARS`, `MP_PROVIDER_PRO_ARS`, `CRON_SECRET`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_VISION_MODEL`, `SUPABASE_PROJECT_URL`, `SUPABASE_SERVICE_ROLE`.

Dominio: `https://www.somoshomia.com`. Webhook MP (prueba y producción, ambas apps): `https://www.somoshomia.com/api/payments/webhook`. Redirect OAuth: `https://www.somoshomia.com/api/mp/oauth/callback`.
