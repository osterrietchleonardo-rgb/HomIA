# HomIA — Documento técnico

> **Para qué sirve:** es el sistema visto como ingeniería (arquitectura, stack, datos, integraciones,
> variables, seguridad, pruebas, deploy y trampas). La lógica de negocio (estados, montos, quién
> puede qué) está en [`LOGICA-HOMIA.md`](./LOGICA-HOMIA.md); la usabilidad por rol en
> [`../compartible/estandarizada/FUNCIONAL-HOMIA.md`](../compartible/estandarizada/FUNCIONAL-HOMIA.md).
>
> **Fuente:** el código de la rama `feat/carrito-homy` en el commit `2eed864` (24/09/2026: carrito,
> cargo 1%, cobro a la cuenta del vendedor y súper agente Homy), más los cambios de ese mismo día
> sin commitear de header y panel (§2). Cada afirmación importante lleva `archivo:línea`.
>
> **Regla de mantenimiento:** este documento se actualiza en la misma rama del cambio, antes de
> pedir el OK de merge (ver `docs/README.md`).

---

## 1. Stack y versiones

Versiones declaradas en `package.json` y las instaladas en `node_modules` (medidas el 24/09/2026).

| Pieza | Declarada (`package.json`) | Instalada | Para qué |
|---|---|---|---|
| Next.js (App Router) | `^16.1.1` | 16.1.3 | Framework; la app corre como SPA dentro de un catch-all (§2) |
| React / React DOM | `^19.0.0` | 19.2.3 | UI |
| TypeScript | `^5` | 5.9.3 | Tipado; el build **no** tolera errores (`next.config.ts:6`) |
| Prisma / @prisma/client | `^6.11.1` | 6.19.2 | ORM sobre Postgres (Supabase) |
| Tailwind CSS | `^4` | 4.1.18 | Estilos + shadcn/ui (Radix) |
| zod | `^4.0.2` | 4.3.5 | Validación de cuerpos (`parseBody`, `src/lib/api.ts:16`) |
| mercadopago (SDK) | `^3.6.1` | 3.6.1 | Preferencias, pagos, suscripciones |
| @supabase/supabase-js | `^2.116.0` | — | Solo Storage (subidas y URLs firmadas) |
| jose / bcryptjs | `^6.2.12` / `^3.0.3` | — | JWT de sesión / hash de contraseñas |
| pdf-lib | `^1.17.1` | — | PDF de facturas |
| leaflet / react-leaflet | `^1.9.4` / `^5.0.0` | — | Mapa del buscador |
| sharp | `^0.34.3` | — | Usado por los scripts de prueba (`scripts/e2e-integral.mjs:24`) |

Scripts de npm (`package.json`): `dev` (`next dev -p 3000`), `build` (`prisma generate && next build`),
`postinstall` (`prisma generate`), `lint` (`eslint .`). Existen además `db:push`, `db:migrate` y
`db:reset`, **que no se usan**: con una sola base (producción) `db push`/`migrate reset` son peligrosos
(ver §5).

Dependencias declaradas pero sin uso verificado en `src/`: `next-auth`, `next-intl`, `@mdxeditor/editor`
(heredadas de la plantilla; no se revisó su eliminación — hallazgo, no se toca).

---

## 2. Arquitectura: SPA por hash dentro de Next.js

- **Dos entradas de página.** `src/app/page.tsx:3` sirve la home pública (`<Landing />`) en `/`.
  Todo lo demás cae en el catch-all `src/app/[...slug]/page.tsx:12`, que monta `<AppRoot />`.
- **Router propio por hash.** `src/lib/router.tsx:13-26` parsea `window.location.hash`
  (`#/panel/cliente/proyectos/abc?tab=x`) en `segments` y `query`. `navigate()`
  (`src/lib/router.tsx:28`) empuja `/#/ruta`; desde la home estática hace una navegación real al
  catch-all (`router.tsx:34-37`).
- **Rutas sin `#` también funcionan.** `AppRoot` convierte `pathname` → hash al montar
  (`src/components/app/app-root.tsx:78-84`), y `SpaRedirect` en la home hace lo inverso para
  deep-links `#/...` que caen en `/` (`src/components/home/spa-redirect.tsx`). Por eso las
  `back_urls` de Mercado Pago van **sin `#`** (§8).
- **Registro central de pantallas:** `src/components/app/app-root.tsx:122-163` (rutas públicas y
  gate de sesión) y `panelScreen()` en `app-root.tsx:166-213` (páginas del panel por rol). Pantallas
  comunes a todos los roles dentro del panel: `directorio`, `mensajes`, `verificacion`, `ayuda`
  (`app-root.tsx:173-176`).
- **App-shell.** El panel scrollea dentro de `#homy-app-main`; `resetAppScroll()` lleva ambos
  contenedores arriba en cada navegación (`router.tsx:59-63`).
- **Panel móvil:** el contenido del panel termina con `pb-44` (en escritorio `lg:pb-24`) para que el
  botón flotante de Homy no tape lo último (`src/components/screens/panel/panel-layout.tsx:295`,
  cambio del 24/09 sin commitear). El botón flotante del panel es **uno solo** (`help-dock.tsx`) con
  dos vistas: "Homy" y "Guías y tour".
- **Header público** (`src/components/home/site-header.tsx`): el menú completo se muestra desde
  1280 px (`xl`); por debajo, menú hamburguesa. Los textos no se parten (`whitespace-nowrap`)
  (cambio del 24/09 sin commitear).
- **Rutas nuevas de la SPA:** `/carrito` (pública y dentro del panel), `/panel/cliente/pedidos[/<id>]`
  y `/panel/profesional/pedidos[/<id>]` (`app-root.tsx`). El carrito se sincroniza con la sesión con
  `useCartSync()` (`src/lib/cart.ts`).
- **Cliente de API del front:** `apiFetch()` (`src/lib/api-client.ts:20`) nunca falla en silencio:
  error de red → toast "No pudimos conectar. Reintentá en unos segundos"; 4xx/5xx → toast con el
  `error` que devuelve la API.
- **Backend:** 64 route handlers (+ `src/app/api/[...slug]/route.ts`, que responde 404 JSON a cualquier `/api/*` inexistente) en `src/app/api/**/route.ts` (catálogo completo en
  `LOGICA-HOMIA.md` §13). Respuestas con `ok()`/`fail()` y `Cache-Control: no-store`
  (`src/lib/api.ts:35-43`).

### 2.1 Estructura de carpetas (lo que importa)

```
src/
  app/
    page.tsx                 home pública (Landing)
    [...slug]/page.tsx       catch-all → AppRoot (la SPA)
    api/**/route.ts          64 endpoints + catch-all 404
  components/
    app/                     app-root (router), hire-wizard, map-view, profile-gate, role-switcher…
    home/                    landing: hero, buscador, cinta de sponsors, widget Homy, header/footer
    screens/                 pantallas públicas (buscar, directorio, materiales, perfiles, auth, ayuda)
    screens/panel/{cliente,profesional,proveedor}/   páginas del panel por rol
    screens/panel/           panel-layout (nav), verificacion, review-form, sobrantes-section
    help/                    tour guiado, ayuda flotante, videos
    ui/                      shadcn/ui
  lib/
    auth.ts  api.ts  db.ts   sesión, helpers de API, Prisma
    mercadopago.ts plans.ts  pagos, suscripciones, planes
    leftovers.ts charge-number.ts   sobrantes, numeración de cobros
    ai.ts dni-ai.ts homy/*   IA (homy/ = súper agente)
    fees.ts orders.ts cart*.ts seller-pay.ts activity.ts units.ts   carrito, pedidos y cobros
    search-match.ts geo.ts   búsqueda difusa y distancias
prisma/schema.prisma         modelo de datos (34 modelos)
supabase/migrations/         SQL aplicado a la base (0001–0023 y 0030)
scripts/                     catálogo, demo, pruebas, limpieza (ver scripts/README.md)
vercel.json                  crons
```

---

## 3. Autenticación y sesión

- Contraseñas con bcrypt (costo 10) — `src/lib/auth.ts:39-45`.
- Sesión = JWT HS256 en cookie `homy_session`, httpOnly, `SameSite=Lax`, 30 días, `Secure` si el
  pedido llega por https (`x-forwarded-proto`) — `src/lib/auth.ts:21-65`.
- `AUTH_SECRET` obligatorio en producción: si falta, el módulo tira error al cargar
  (`src/lib/auth.ts:12-17`). En desarrollo usa un secreto fijo de respaldo (`auth.ts:18-20`).
- `getSessionUser()` (`src/lib/auth.ts:81`) valida el JWT y trae el usuario de la base con sus
  roles (JSON en `User.roles`), `hasProfessional`, `hasProvider`, ubicación y verificación.
- Helpers: `requireAuth()` → 401 "Necesitás iniciar sesión para hacer esto"; `requireRole()` →
  403 con `needsRole` (`src/lib/api.ts:45-60`).
- No hay recuperación de contraseña ni baja de cuenta (no existe endpoint; ver catálogo de
  endpoints en `LOGICA-HOMIA.md` §13).

---

## 4. Modelo de datos (`prisma/schema.prisma`)

Base Postgres (Supabase): `provider = "postgresql"` con `url = DATABASE_URL` y
`directUrl = DIRECT_URL` (`prisma/schema.prisma:9-13`). Convenciones heredadas del sandbox SQLite:
sin enums (estados en `String`), listas como **JSON en texto** (`roles`, `professions`, `photos`,
`aliases`, `materialIds`), lat/lng `Float`, dinero `Float` (no `Decimal`).

**40 modelos** en el commit `2eed864` (34 hasta `48668f3` + 6 nuevos, §4.1). La tabla siguiente
lista los 34 originales.

| Dominio | Modelo | Campos clave | Relaciones |
|---|---|---|---|
| Identidad | `User` (`:17`) | `email` único, `passwordHash`, `roles` (JSON), `verificationStatus` (none/en_revision/verificado/rechazado), `rating`, `reviewsCount`, `lat/lng`, `searchRadiusKm` | 1–1 `ProfessionalProfile`, 1–1 `ProviderProfile`; 1–N casi todo |
| | `IdentityDocument` (`:63`) | `frontUrl`/`backUrl` (paths del bucket privado), `status`, `aiVerdict` (JSON), `aiScore`, `aiNotes` | N–1 `User` |
| | `OAuthState` (`:627`) | `state` único, `sellerId`, `sellerKind`, `codeVerifier` (PKCE), `expiresAt` | sin FK |
| Perfiles | `ProfessionalProfile` (`:78`) | `professions`/`skills` (JSON), `personType`, `dniCuil`, `serviceRadiusKm`, `subscription` (legado free/pro), `mpOauth*` | bids, proyectos, vínculos |
| | `ProviderProfile` (`:119`) | `businessName`, `kind`, `subscription` (trial/basic/pro), `trialEndsAt`, `mpPreapprovalId`, `proSince`, `brandLogoUrl`/`brandTagline`/`brandColor`, `mpOauth*` | stock, vínculos, cobros, compras, devoluciones |
| Catálogo | `Category` (`:162`) | `slug` único, `sortOrder` | 1–N `CatalogElement` |
| | `CatalogElement` (`:171`) | `name`, `aliases` (JSON), `description`, `unit`, `active` | stock, materiales, ítems de devolución |
| | `ProviderStock` (`:186`) | `price`, `quantity`, `minStock` (5), `status` derivado (disponible/por_agotar/agotado), `brand` | único `(providerId, elementId)` |
| | `StockMovement` (`:207`) | `type` (entrada/salida/ajuste/reserva/liberacion/consumo/devolucion), `quantity`, `note` | N–1 stock |
| | `StockReservation` (`:217`) | `status` activa/consumida/liberada | **sin uso en `src/`** (la reserva se hace descontando `quantity`) |
| Trabajos | `JobPost` (`:230`) | `categorySlug`, `urgency`, `budgetMin/Max`, `photos`, `status` (abierto/en_proceso/cerrado/cancelado), `selectedBidId` | 1–N `JobBid`, `Project` |
| | `JobBid` (`:254`) | `amount`, `timelineDays`, `message`, `status` (pendiente/aceptado/rechazado/retirado) | N–1 job, N–1 profesional |
| Proyectos | `Project` (`:271`) | `status` (activo/finalizado/cancelado), `stage` (presupuesto→materiales→ejecucion→revision→finalizado), `laborCost` (0 = sin cotizar), `budgetMin/Max`, `materialsCost`, `materialsPaymentMode` (pro_adelanta/cliente_paga_proveedor), datos del asistente (`urgency`, `address`, `deadline`, `photos`) | materiales, facturas, cobros, obras |
| | `ProjectMaterial` (`:308`) | `status` (propuesto/aprobado/rechazado/reemplazado), `quantity`, `unitPrice`, `providerId?`, `alternativeOfId`, `invoicedAt` | N–1 proyecto/elemento/proveedor |
| | `Invoice` (`:331`) | `number` único `HOM-<año>-<n>`, `laborCost`, `materialsCost`, `total`, `status` (pendiente/pagada/vencida), `paymentMethod`, `mpPreferenceId`, `mpPaymentId` | ítems, pagos |
| | `InvoiceItem` (`:352`) | `kind` material/mano_obra, `subtotal` | N–1 factura |
| | `Payment` (`:364`) | `invoiceId?`/`chargeId?`/`purchaseId?`, `method`, `mpPaymentId` **único**, `status`, `amount`, `refundedAmount`, `confirmedAt` | N–1 factura (opcional) |
| | `ProviderCharge` (`:385`) | `number` único `PRV-<año>-<n>`, `materialIds` (JSON), `amount`, `status` (pendiente/acordada_efectivo/pagada/anulada), `method` | N–1 proyecto (opcional), proveedor, cliente |
| | `ProviderLink` (`:408`) | `accountLabel`, `active` | proveedor ↔ profesional |
| Compras | `Purchase` (`:464`) | `elementName`, `quantity`, `unitPrice`, `total`, `type` compra/reserva, `status` (pendiente_aprobacion/aprobado/entregado/pagado/rechazado/cancelado), `chargeId`, `reservationExpiresAt` | N–1 cliente, proveedor |
| Sobrantes | `LeftoverReturn` (`:638`) | `status` (solicitada/aceptada/aceptada_parcial/rechazada/cancelada/recibida/reembolsada/reembolso_fallido), `paymentMethod`, `mpPaymentId`, `mpRefundId`, `refundTotal` | 1–N `LeftoverItem` |
| | `LeftoverItem` (`:666`) | `qtyRequested/Accepted/Received`, `unitPricePaid`, `refundAmount`, `condition` (sin_abrir/abierto_sin_usar), `photoUrl` obligatoria | N–1 devolución, elemento |
| Reputación | `Review` (`:441`) | `rating` Int 1–5, `comment`, `photos` (JSON), `context` (proyecto/obra/perfil/compra), `projectId?`, `purchaseId?` | autor, destinatario |
| | `CompletedWork` (`:423`) | obra publicada (`photos`, `visible` = baja lógica) | N–1 autor |
| | `Favorite` (`:616`) | único `(userId, targetUserId)` | |
| CRM | `CrmPipeline`/`CrmStage`/`CrmDeal` (`:495-535`) | tablero por usuario con etapas y tratos | |
| Mensajes | `Conversation` (`:541`) | único `(userAId, userBId)` con A < B | 1–N `Message` |
| | `Message` (`:555`) | `body`, `readAt` | |
| Otros | `Notification` (`:571`) | `type`, `title`, `body`, `link` (hash de la SPA), `read` | |
| IA | `HomySession`/`HomyMessage` (`:584-604`) | historial del agente Homy | |
| | `SearchEvent` (`:606`) | `mode`, `query`, `results` (JSON) — alimenta la analítica PRO | |

### 4.1 Carrito, pedidos, cargo de servicio y Homy (commit `2eed864`)

Migraciones `0022_carrito_pedidos.sql`, `0023_sobrantes_confirmacion.sql` y
`0030_homy_superagente.sql`, todas **solo aditivas** y aplicadas.

| Modelo / columna | Qué guarda |
|---|---|
| `CartItem` | Carrito de un usuario logueado: una fila por oferta (`stockId`) con cantidad; único `(userId, stockId)`. El carrito del visitante vive en `localStorage` |
| `Order` | Pedido confirmado desde el carrito, número único `PED-AAAA-NNNNNN` |
| `Purchase` (cambios) | Ahora es el **sub-pedido de un proveedor** dentro de un `Order` (`orderId`); sus productos en `items`; `elementName` pasa a ser un resumen ("Cemento × 2 bolsa y 1 más"); `stockId/elementId/quantity/unitPrice` quedan solo para compras históricas (opcionales); `serviceFee` |
| `PurchaseItem` | Ítem del sub-pedido: snapshot de elemento, unidad, cantidad, precio y total |
| `ActivityEvent` | Línea de tiempo de pedidos, sub-pedidos y proyectos (actor, rol, tipo, mensaje); solo se agregan filas y registrar nunca rompe el flujo (`src/lib/activity.ts`) |
| `Invoice.serviceFee`, `ProviderCharge.serviceFee` | Cargo de servicio HomIA fijado al pagar por MP (0 en efectivo); no suma al total |
| `Payment.collector` | `vendedor` \| `plataforma` (quién cobró el pago de MP) |
| `LeftoverItem.purchaseItemId` | Ítem de compra devuelto (compras multi-ítem) |
| `LeftoverReturn.refundConfirmedAt/By`, `reminderSentAt` | Confirmación del reembolso en efectivo (`solicitante` \| `automatico`) y recordatorio único al proveedor (migración `0023`) |
| `HomySession.puerta/visitorHash`, `HomyMessage.runId/payload` | Sesiones de Homy de visitantes (hash del token del navegador) y tarjetas mostradas |
| `AiUsage` | Cupo diario de Homy: único `(key, day)` |
| `HomyRun` | Registro de cada corrida de Homy: pasos, modelo, tokens, costo estimado, latencia, resultado |

Con esto el esquema tiene **40 modelos** (34 + `CartItem`, `Order`, `PurchaseItem`,
`ActivityEvent`, `AiUsage`, `HomyRun`).

Archivos nuevos de código: `src/lib/{fees,units,activity,orders,order-view,cart,cart-server,seller-pay,leftovers-cron}.ts`,
`src/lib/homy/*`, `src/app/api/{cart,cart/merge,cart/preview,orders,orders/[id]}`,
`src/app/api/[...slug]/route.ts` (404 JSON para rutas de API inexistentes),
`src/components/cart/*`, `src/components/homy/*`, `src/components/app/{mp-fee,mp-connect-card}.tsx`,
`src/components/screens/cart-screen.tsx`, `src/components/screens/panel/{pedidos,pedido-detalle}.tsx`.

---

## 5. Migraciones y la base única

- **Una sola base = producción.** El `.env` local, los Preview y Producción de Vercel apuntan al
  mismo proyecto Supabase (medido el 24/09/2026; decisión de Leonardo: sin staging — ver
  `decisiones.md`). Todo script, seed, prueba E2E o `npm run dev` que escriba, **escribe en
  producción**.
- **Procedimiento para cambiar el esquema** (README.md, "Cambios de esquema"; ejemplo real en la
  cabecera de `supabase/migrations/0021_pro_branding.sql:1-2` y `0022_carrito_pedidos.sql:3`):
  1. Editar `prisma/schema.prisma`.
  2. Generar el SQL con
     `npx prisma migrate diff --from-url "$DIRECT_URL" --to-schema-datamodel prisma/schema.prisma --script`.
  3. Revisar el SQL a mano (solo aditivo si se puede; nada de `DROP` sin OK).
  4. Guardarlo como `supabase/migrations/00NN_<tema>.sql`.
  5. Pedir OK de Leonardo (escritura en producción) y aplicarlo con
     `npx prisma db execute --file supabase/migrations/00NN_<tema>.sql --schema prisma/schema.prisma`.
  6. `npx prisma generate`.
- **Nunca `prisma db push`** (puede borrar columnas/datos: el script `db:push` de `package.json`
  incluso lleva `--accept-data-loss`) ni `prisma migrate dev/reset`.
- Migraciones existentes: `0001`–`0011` (esquema base + políticas de Storage + catálogo), `0012`
  (escrow + PRO profesional, **histórico: el escrow se sacó**), `0013` (PRO proveedor), `0014`
  (mensajes), `0015` (fotos en reseñas + DNI), `0016` (asistente Contratar), `0017` (catálogo
  maestro), `0018` (compras + planes), `0019` (lanzamiento: sobrantes, pagos de cobros/compras,
  presupuesto del proyecto, `invoicedAt`), `0020` (PKCE OAuth), `0021` (marca PRO), `0022` (carrito,
  pedidos, cargo de servicio, línea de tiempo), `0023` (confirmación de reembolso en efectivo y
  recordatorio) y `0030` (súper agente Homy: cupo y registro). La numeración salta de 0023 a 0030
  porque los dos equipos reservaron rangos distintos.
- RLS: el commit `2d3b10c` activó RLS en las tablas; script en `scripts/base/enable-rls.mjs`. La app
  accede con el usuario de Prisma (no por la API REST de Supabase), así que RLS protege solo el
  acceso directo por PostgREST.

---

## 6. Integraciones

### 6.1 Mercado Pago

Todo en `src/lib/mercadopago.ts` + `src/app/api/payments/webhook/route.ts` + `src/app/api/mp/oauth/*`.

**Dos apps de MP de la misma cuenta** (`src/lib/mercadopago.ts:1-6`):

| App | Token | Se usa para |
|---|---|---|
| Checkout Pro | `MP_ACCESS_TOKEN` (+ `MP_TEST_ACCESS_TOKEN`) | App de **OAuth** de los vendedores (`MP_CLIENT_ID`/`MP_CLIENT_SECRET`); consulta y reembolso de pagos históricos cobrados con la plataforma. Los pagos nuevos se crean con el token del vendedor (ver abajo) |
| Suscripciones | `MP_SUB_ACCESS_TOKEN` (+ `MP_SUB_TEST_ACCESS_TOKEN`) | Preapprovals mensuales de los planes del proveedor (`createProviderPlanPreapproval`, `:216`). Si falta, cae en el token de Checkout Pro (`:26-28`, `:38-42`) |

**Quién cobra (commit `2eed864`):** todas las preferencias de pago se crean con **el token OAuth del
vendedor** mediante `createSellerPreference()` (`mercadopago.ts:88`), así que la plata va a su
cuenta y HomIA cobra el cargo de servicio como `marketplace_fee`.

| Qué se paga | Token de la preferencia (vendedor) | Cargo de servicio | Fuente |
|---|---|---|---|
| Sub-pedido de compra de materiales (`purchase:<id>`) | OAuth del **proveedor** | 1% del subtotal del sub-pedido | `purchases/[id]/route.ts:150-177` |
| Factura de proyecto (`invoice:<id>`) | OAuth del **profesional** | 1% del total de la factura | `invoices/[id]/route.ts` (POST) |
| Cobro de materiales del proveedor (`charge:<id>`) | OAuth del **proveedor** | 1% del monto del cobro | `charges/[id]/route.ts` (POST) |
| Plan Básico/PRO | App de Suscripciones (HomIA) | — | `mercadopago.ts:163` |

- `createSellerPreference` (`mercadopago.ts:88-127`): `external_reference = <tipo>:<id>`; ítems
  reales (las cantidades fraccionadas van como 1 × total de la línea, `toMpItems`, `:75-86`); si
  hay cargo, suma el ítem "Cargo de servicio HomIA (1%)" y `marketplace_fee`; `notification_url`
  lleva la pista `?ref=<tipo>:<id>`; `back_urls` sin `#` a `/panel/cliente/pedidos`,
  `/panel/cliente/facturas` o `/panel/cliente/proyectos` con `?pago=ok|pendiente|fallo`.
- Cargo: `serviceFeeFor(subtotal) = round2(subtotal × 0,01)` y `totalWithMp()` (`src/lib/fees.ts`).
  Se guarda en `serviceFee` de `Purchase`/`ProviderCharge`/`Invoice` al crear la preferencia y se
  **pone en 0** si se elige efectivo. No suma a `total`/`amount`.
- **Sin OAuth del vendedor → solo efectivo:** `sellerTokenOr503()` (`src/lib/seller-pay.ts`)
  responde **503 `{ needsConfig: true }`** "‹Nombre› todavía no conectó Mercado Pago: podés pagar en
  efectivo"; si MP no responde, `mpDown()` → 503 "Mercado Pago no respondió…".
- `ensureFreshSellerToken(seller, kind)` sirve para proveedor **y profesional**
  (`mercadopago.ts:312-362`): renueva el token si vence en menos de 7 días; si no puede, lo marca
  `expired`.
- Los tokens nunca salen al navegador: las APIs devuelven solo `mpConnected`
  (`projects/route.ts`, `projects/[id]/route.ts`, `invoices/[id]`, `charges/[id]`). En
  `GET /api/projects/[id]` se corrigió una fuga: `links` incluía el perfil completo del proveedor con
  sus tokens; ahora solo datos públicos.

**OAuth del vendedor con PKCE** (`src/app/api/mp/oauth/connect/route.ts`):
1. `GET /api/mp/oauth/connect?kind=provider|professional` (el profesional lo usa desde Mi perfil, el proveedor desde Cobros) exige sesión y perfil; genera `state`
   (uuid) y `codeVerifier` (48 bytes base64url), guarda ambos en `OAuthState` por 10 minutos
   (`:42-54`).
2. Redirige a `https://auth.mercadopago.com.ar/authorization` con `code_challenge` S256
   (`:56-63`). Se usa `.com.ar` para que MP no pida el país (commit `0bcedf4`).
3. `GET /api/mp/oauth/callback` exige sesión, que el `state` exista, no haya vencido y pertenezca al
   perfil del usuario logueado (`callback/route.ts:19-49`); canjea el código en
   `https://api.mercadopago.com/oauth/token` con `code_verifier` (`:54-66`) y guarda
   `mpOauthAccessToken`, `mpOauthRefreshToken`, `mpOauthExpiresAt` (default 180 días) y
   `mpOauthStatus = connected` (`:77-90`). Vuelve siempre al panel con `?mp=conectado|error|cancelado`.
4. Desconectar: `DELETE /api/mp/oauth?kind=provider|professional` limpia los 4 campos `mpOauth*`.
5. Renovación: `ensureFreshSellerToken()` (`mercadopago.ts:312`) renueva si vence en menos de 7
   días; si falla, marca `mpOauthStatus = 'expired'` y el cobro responde "no conectado".
6. Los tokens nunca salen al navegador (`profiles/me/route.ts:35-52`). Se guardan en texto plano en
   la base (cifrado pendiente según `docs/PLAN-LANZAMIENTO-48H.md` §4).

**Webhook** `POST /api/payments/webhook` (`src/app/api/payments/webhook/route.ts`):
- Solo procesa `payment` y `subscription_preapproval`; el resto responde 200 sin acción.
- **Firma:** verifica `x-signature` (HMAC-SHA256 del manifest `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`)
  contra `MP_WEBHOOK_SECRET` o `MP_SUB_WEBHOOK_SECRET` (`mercadopago.ts`, `verifyWebhookSignature`).
  **Si no valida, se loguea y se sigue** (commit `d98b549`): MP no firma con la clave de la app los
  avisos de `notification_url` de preferencias ni los de usuarios de prueba. La defensa real es la
  re-consulta.
- **Pista `?ref=<tipo>:<id>`:** como los pagos los cobra el vendedor, el pago se consulta con **el
  token de ese vendedor** (`sellerTokenFor`: proveedor para `purchase`/`charge`, profesional para
  `invoice`) y se aplica solo si el `external_reference` coincide con la pista. Sin pista (pagos
  históricos con token de la plataforma) se consulta con el token de HomIA, con fallback de entorno
  prueba ↔ producción.
- **Monto:** se valida **moneda ARS** y **monto = subtotal + cargo de servicio ±1 peso** (también se
  acepta el subtotal solo, para preferencias anteriores al cargo) — `feeAwareValid`. Si no cuadra,
  `Payment.status = monto_invalido` y no se marca nada pagado. El cargo realmente cobrado
  (`pagado − subtotal`) se guarda en `serviceFee`.
- **`Payment.collector`:** `vendedor` (token OAuth) o `plataforma` (histórico); `null` en filas
  anteriores al carrito. Sirve para reembolsar con el mismo token que cobró.
- **Idempotencia:** `Payment` por `upsert` en `mpPaymentId` único; las transiciones a pagado son
  `updateMany` condicionales (dos avisos simultáneos no duplican notificaciones ni eventos).
- Al acreditar: notificaciones a ambas partes (el aviso de factura pagada lleva ahora a
  `#/panel/profesional/proyectos/<id>`), evento `pagado` en la línea de tiempo.
- **Errores:** si MP no responde → 200 `deferred` (MP reintenta); error de base → 500.

**Suscripciones del proveedor:** preapproval mensual en ARS con `reason` de **≤ 60 caracteres**
(`mercadopago.ts:226-229`; commit `55b5e3a`) y `back_url` `/panel/proveedor/plan?plan=ok`. La lógica
de transición está en `planTransicion()` (`src/lib/plans.ts:115`) y la aplican el webhook y el cron
diario (§6.4).

**Reembolsos (sobrantes):** `refundPayment()` (`mercadopago.ts:217`) llama `POST /v1/payments/{id}/refunds`
con `X-Idempotency-Key: return-<returnId>` y **el mismo token que cobró**: si `Payment.collector =
vendedor` (o compra histórica sin collector), el del vendedor — proveedor en compras y cobros,
**profesional en facturas** —; si no, el de la plataforma (`returns/[id]/route.ts`, `doRefund`). **El
cargo de servicio del 1% no se reembolsa**: el tope es lo pagado menos el cargo menos lo ya
reembolsado (`refundableOf`, `src/lib/leftovers.ts`).

### 6.2 Supabase Storage

- Subida única: `POST /api/uploads` (`src/app/api/uploads/route.ts`). Valida tipo por **bytes
  mágicos** (JPG/PNG/WEBP, no confía en el content-type) y máximo 8 MB (`:16-35`, `:57-63`).
  Ruta `<userId>/<folder>/<aleatorio>.<ext>`.
- Bucket **`homia-uploads` público**: obras, reseñas, avatares, logos de marca, fotos de sobrantes
  y de trabajos (`:19`, `:85`). Los endpoints que reciben fotos aceptan solo URLs de este bucket
  (`isHomiaUploadUrl`, `src/lib/leftovers.ts:10-16`).
- Bucket **`dni-docs` privado**: `folder=dni` devuelve un path interno `dni-docs/<userId>/dni/...`,
  nunca una URL pública (`uploads/route.ts:81-84`). Solo el dueño obtiene una **signed URL de 10
  minutos** (`signDniDocUrl`, `src/lib/dni-ai.ts:148`; usada en `profiles/me/route.ts:27-33` y
  `verification/dni/route.ts:46-51`).
- Si faltan `SUPABASE_PROJECT_URL`/`SUPABASE_SERVICE_ROLE`, responde 503 honesto (`:44-48`).
- Políticas de referencia: `supabase/migrations/0010_storage_policies.sql`.

### 6.3 IA (OpenAI)

Hay **dos caminos** hacia OpenAI:

1. **`src/lib/ai.ts`** — cliente OpenAI-compatible (Chat Completions) con la interfaz del SDK del
   sandbox (`ZAI.create().chat.completions.create/createVision`). El modelo sale de `AI_MODEL` /
   `AI_VISION_MODEL` (`.env`: `gpt-5.4-mini` en los dos). Timeout 45 s. Lo usan **solo** la
   verificación de DNI (`src/lib/dni-ai.ts`) y el alta de elementos del catálogo
   (`src/app/api/catalog/route.ts:3`) — `src/lib/ai.ts:1-8`.
2. **`src/lib/homy/openai.ts`** — el súper agente Homy por la **Responses API** (`POST
   {AI_BASE_URL}/responses`, streaming SSE, herramientas nativas, `store: false`,
   `include: ['reasoning.encrypted_content']`). Modelo `HOMY_MODEL` (default `gpt-5.6-luna`),
   esfuerzo de razonamiento `HOMY_REASONING_EFFORT` (default `low`; se midió contra `medium` y se
   eligió `low`), timeout 45 s por llamada y 1 reintento si todavía no se emitió nada
   (`openai.ts:1-9`, `:56-73`, `:158-164`). Usa `AI_API_KEY` y `AI_BASE_URL`.

El chat viejo (`/api/homy`, `src/lib/homy.ts`) y el agente viejo (`src/lib/homy-agent.ts`) se
**borraron** en el commit `2eed864`.

| Uso | Endpoint | Sesión | Fallback |
|---|---|---|---|
| Súper agente Homy (4 puertas: buscador de la home, flotante de la home, mascota del panel, tarjeta de `/buscar`) | `POST /api/homy/agent` (stream NDJSON), `GET /api/homy/agent?sessionId=` (historial) | **Pública con cupo** (§6.3.1) | Respaldo honesto sin IA con las mismas herramientas (`src/lib/homy/respaldo.ts`) |
| Verificación de DNI (visión sobre frente y dorso) | `POST /api/verification/dni` | Obligatoria | Queda `en_revision` (`dni-ai.ts:174-240`) |
| Alta de elemento de catálogo (descripción + alias + unidad) | `POST /api/catalog` | Proveedor | Descripción genérica honesta (`catalog/route.ts:120-125`) |

Todas las rutas con IA tienen `export const maxDuration = 60`.

#### 6.3.1 Súper agente Homy (`src/lib/homy/*`, `src/app/api/homy/agent/route.ts`)

**Grafo determinista con un solo nodo agéntico** (`homy/agent/route.ts:1-13`):

1. Puerta, rol y usuario salen del JWT (nunca del body); la IP se guarda como hash
   (`sha256(AUTH_SECRET:ip)`, `cupo.ts:14-22`). El body se valida con zod: mensaje 2–600
   caracteres, `puerta` (`home_buscador|home_flotante|panel|buscar`), `sessionId`, página, rol del
   panel y lat/lng (`route.ts:32-40`).
2. **Cupo** (`src/lib/homy/cupo.ts`), en la tabla `AiUsage` (`key` + `day` únicos; día de
   Argentina):
   - visitante: **8 consultas por día por IP** (`key = ip:<hash>`), compartidas entre el buscador
     y el flotante de la home;
   - usuario logueado: **60 por día** (`key = user:<id>`);
   - tope global de todos los visitantes juntos: `HOMY_TOPE_DIARIO_VISITANTES` (default 3000,
     `route.ts:44-49`);
   - si ya está agotado, responde el evento `limite` **sin llamar al modelo** ("Llegaste al límite
     de consultas de hoy sin cuenta: creá tu cuenta gratis y seguimos." / "…Mañana se renueva…",
     `route.ts:245-246`);
   - el cupo se **descuenta con un `INSERT … ON CONFLICT … WHERE count < límite` atómico justo antes
     de la primera llamada al modelo** (`cupo.ts:53-68`) y se **devuelve** si la IA falla y se
     responde con el respaldo (`route.ts:121`).
3. **Kill-switch** `HOMY_APAGADO=1`: responde con el respaldo sin IA (`route.ts:99`).
4. Contexto fijo (rol, ubicación, pantalla) + historial de la sesión (`HomySession`, propia del
   usuario o del token de visitante hasheado en `visitorHash`).
5. **Loop ≤ 6 vueltas** (`loop.ts:11`) con **herramientas de solo lectura** (`herramientas.ts`),
   cada una con estado `encontrado | nada | error`:

   | Herramienta | Qué hace |
   |---|---|
   | `sugerir_materiales` (`:151`) | Elementos del catálogo según la necesidad (el catálogo es conocimiento interno) |
   | `buscar_proveedores_con_stock` (`:208`) | Ofertas reales con precio y stock de proveedores operativos |
   | `buscar_profesionales` (`:288`) | Profesionales por rubro y zona |
   | `buscar_trabajos` (`:360`) | Trabajos abiertos de la bolsa |
   | `como_funciona_homia` (`:432`) | Base de conocimiento de la plataforma (`conocimiento.ts`) |
   | `mis_pendientes` (`:470`) | Solo con sesión: pendientes del usuario en su rol |
   | `responder` (`:505`) | **Obligatoria** para terminar: respuesta validada con zod |

6. **Ranking en código, nunca del modelo** (`ranking.ts`): ofertas → verificado > reseñas con
   promedio bayesiano (prior 4, peso 3) > precio > distancia > PRO activo desempata;
   profesionales → verificado > bayesiano > obras > experiencia > distancia.
7. **Guardarraíles en código** (`guardarrailes.ts`): links solo de secciones fijas (`rutas.ts`) o
   devueltos por una herramienta en la misma corrida; entidades (tarjetas) solo de herramientas;
   montos que aparecen en el texto tienen que haberse leído; "Verificado"/"Recomendado" solo si es
   cierto; frases prohibidas (`prompt.ts:10-22`, p. ej. "como modelo de lenguaje", "te garantizo",
   "llega mañana"). Si algo falla, el motivo vuelve al modelo como resultado de `responder` y se
   corrige en el mismo loop; si agota las vueltas, arma una respuesta determinista con lo que las
   herramientas sí trajeron (`loop.ts:145-196`).
8. **Registro** en `HomyRun` (pregunta, pasos, modelo, tokens, costo estimado, latencia,
   resultado `ok|limite|fallback_ia|agoto_vueltas|error`) + `HomySession`/`HomyMessage` (con
   `runId` y `payload` de tarjetas/acciones).
9. **Stream NDJSON** de eventos `inicio`, `paso`, `texto`, `texto_reinicio`, `final` (mensaje,
   tarjetas, acciones, sugerencias, pregunta, cupo), `limite`, `error` (`tipos.ts:102-109`).

**Medición del equipo (informe del 24/09, no re-medido acá):** set de evaluación de 32 casos 32/32,
0 alucinaciones, costo ≈ US$0,001 por consulta (estimado con precio de lista: cotejar con la factura
de OpenAI), p50 9,3 s.

### 6.4 Vercel

- **Crons** (`vercel.json`): `/api/cron/reservations` cada hora (`0 * * * *`; además corre las tareas de sobrantes de `src/lib/leftovers-cron.ts`: confirmación automática del reembolso en efectivo a las 72 h y recordatorio único al proveedor a las 72 h) y
  `/api/cron/subscriptions` todos los días a las 09:30 UTC (`30 9 * * *`). Ambos exigen
  `Authorization: Bearer <CRON_SECRET>`; sin secreto configurado responden 401 siempre
  (`cron/reservations/route.ts:7-11`, `cron/subscriptions/route.ts:68-72`).
- **Firewall / rate limit:** el rate-limit de `src/lib/rate-limit.ts` es en memoria y en serverless
  no se comparte entre instancias. El plan de lanzamiento indica configurarlo en Vercel Firewall
  (login 10/15 min, registro 8/h, `/api/homy*` 30/h, uploads 60/h por IP —
  el cupo de Homy ahora además vive en la base, §6.3.1;
  `docs/PLAN-LANZAMIENTO-48H.md` §1.4). Esa configuración vive en el panel de Vercel, **no es
  verificable desde el código**.
- Proyecto Vercel `homia` (`prj_c3iqixjpZUf1xjntggWcaiaHnkre`); `DATABASE_URL`/`DIRECT_URL` con
  target `preview,production` (medido el 24/09/2026, memoria `una-sola-base`). Dominio
  `https://www.somoshomia.com`.

---

## 7. Variables de entorno

Nombres exactos que lee el código (`grep process.env` en `src/`) y su documentación en
`.env.example`.

| Variable | Obligatoria | La lee | Qué pasa si falta |
|---|---|---|---|
| `DATABASE_URL` | Sí | Prisma (`schema.prisma:11`) | No arranca. Pooler 6543 con `?pgbouncer=true&connection_limit=1` |
| `DIRECT_URL` | Sí | Prisma (`schema.prisma:12`) | Migraciones/diff no andan. Conexión directa 5432 |
| `AUTH_SECRET` | Sí en prod | `auth.ts:8` | Error al cargar en producción |
| `APP_URL` | Sí | `appUrl()` (`api.ts:8`) | Cae en `http://localhost:3000`: back_urls, webhook y OAuth rotos |
| `MP_ACCESS_TOKEN` | Para pagos | `mercadopago.ts:12` | Facturas y cobros responden 503 "no disponible por ahora" |
| `MP_TEST_ACCESS_TOKEN` | No | `mercadopago.ts:14` | Sin fallback de entorno en el webhook |
| `MP_PUBLIC_KEY` | No | — | Documentada en `.env.example`; no la lee `src/` |
| `MP_CLIENT_ID` / `MP_CLIENT_SECRET` | Para OAuth | `oauth/connect:36`, `oauth/callback:58-59`, `mercadopago.ts:381-382` | Conectar MP vuelve con `?mp=error` |
| `MP_WEBHOOK_SECRET` | Recomendado | `webhook/route.ts:97` | Se aceptan avisos sin verificar firma (igual se re-consulta a MP) |
| `MP_SUB_ACCESS_TOKEN` / `MP_SUB_TEST_ACCESS_TOKEN` | Para planes | `mercadopago.ts:13,15`, `cron/subscriptions:34-35` | Usa el token de Checkout Pro |
| `MP_SUB_WEBHOOK_SECRET` | Recomendado | `webhook/route.ts:97` | Idem firma |
| `MP_PROVIDER_BASIC_ARS` / `MP_PROVIDER_PRO_ARS` | No | `plans.ts:20-21` | Defaults 50000 / 100000 |
| `CRON_SECRET` | Sí | crons | Crons responden 401 (nunca corren) |
| `AI_BASE_URL` / `AI_API_KEY` / `AI_MODEL` / `AI_VISION_MODEL` | Para IA | `ai.ts:29-32`; Homy usa `AI_BASE_URL`/`AI_API_KEY` | DNI y catálogo con fallback honesto; Homy responde con el respaldo sin IA |
| `HOMY_MODEL` / `HOMY_REASONING_EFFORT` | No (defaults `gpt-5.6-luna` / `low`) | `src/lib/homy/openai.ts:8-9` | Usa los defaults (cargadas en Vercel según el equipo) |
| `HOMY_TOPE_DIARIO_VISITANTES` | No (default 3000) | `homy/agent/route.ts:44-49` | Tope global diario de consultas con IA de todos los visitantes |
| `HOMY_APAGADO` | No | `homy/agent/route.ts` | `1` = Homy responde sin IA (kill-switch) |
| `NEXT_DIST_DIR` | No (solo desarrollo) | `next.config.ts:4-7` | Carpeta de build alternativa para levantar un segundo `next dev` en la misma carpeta sin pisar `.next` |
| `SUPABASE_PROJECT_URL` / `SUPABASE_SERVICE_ROLE` | Para subidas | `uploads/route.ts:44-45`, `dni-ai.ts`, `leftovers.ts:13` | Subidas 503; fotos de terceros rechazadas |
| `SUPABASE_API_URL` / `NEXT_PUBLIC_SUPABASE_URL` | No | `leftovers.ts:13` (alternativas) | — |

`.env*` está en `.gitignore`; `.env.example` sí está versionado.

---

## 8. Seguridad

- **Autorización por dueño (anti-IDOR):** el dueño siempre sale de la sesión (`getSessionUser`),
  nunca del body. Cada recurso chequea que el usuario sea parte: proyecto (`projects/[id]/route.ts:51-53`),
  material del proyecto (`materials/route.ts:186`: el material tiene que pertenecer a ESE proyecto),
  factura (`invoices/[id]/route.ts:25-28`), cobro (`charges/[id]/route.ts:25-27`), compra
  (`purchases/[id]/route.ts:48-50`), devolución (`returns/[id]/route.ts:43-45`), conversación
  (`messages/conversations/[id]/route.ts:8-13`), trato del CRM (el pipeline sale de la etapa
  validada, nunca del body — `crm/deals/route.ts:46-48`), OAuth (`state` del perfil propio).
- **Validación de cuerpos:** `parseBody()` con zod (`src/lib/api.ts:16`) en la mayoría de las rutas
  que escriben; varias rutas viejas validan a mano con `body()` (p. ej. `jobs/route.ts:84`,
  `reviews/route.ts:24`, `messages/*`, `crm/*`, `charges/[id]/route.ts:67`). Migrar todo a zod está
  anotado como pendiente en `docs/PLAN-LANZAMIENTO-48H.md` §4.
- **Fotos:** solo URLs del bucket propio (`isHomiaUploadUrl`); reseñas y obras además exigen
  extensión de imagen y máximo 4 (`reviews/route.ts:9-14`, `works/route.ts:9-13`).
- **Cabeceras** (`next.config.ts:9-24`): `X-Content-Type-Options: nosniff`,
  `Referrer-Policy: strict-origin-when-cross-origin`,
  `Permissions-Policy: camera=(self), microphone=(), geolocation=(self)`,
  `Content-Security-Policy: frame-ancestors 'self'`.
- **Cupo de IA en la base** (no en memoria): Homy descuenta de `AiUsage` con una sola sentencia
  atómica, así que funciona con varias instancias de Vercel (§6.3.1).
- **Rate limit:** en memoria para login (10 fallos por email+IP y 30 por IP cada 15 min, solo cuentan
  los fallidos — `auth/login/route.ts:18-31`) y registro (8 cuentas por IP por hora —
  `auth/register/route.ts:37-41`). En Vercel el límite real va por Firewall (§6.4).
- **Contraseñas:** mínimo 8 caracteres, letras y números (`auth/register/route.ts:49-54`).
- **Datos sensibles:** `passwordHash` y tokens OAuth nunca se devuelven (`profiles/me/route.ts:24`,
  `:35-52`; las APIs de proyectos, facturas y cobros exponen solo `mpConnected`; la fuga de tokens
  por `links` en `GET /api/projects/[id]` se corrigió en `2eed864`); el detalle público de un trabajo esconde la dirección y redondea lat/lng a ~1 km si no
  hay sesión (`jobs/[id]/route.ts:6-10`, `:40-43`).
- **Webhook:** ver §6.1 (firma + re-consulta + monto/moneda + idempotencia).
- **Logs:** Prisma loguea queries solo en desarrollo (`src/lib/db.ts:12`).

---

## 9. Pruebas

| Prueba | Qué cubre | Cómo se corre | Ojo |
|---|---|---|---|
| `scripts/e2e-integral.mjs` | Suite E2E de API: **16 secciones A–P** (auth, proveedor+catálogo IA+plan, búsqueda, trabajos, proyectos+materiales+facturas, compra directa, sobrantes, reseñas, mensajes, notificaciones, DNI, obras, CRM+favoritos, seguridad, IA, **P: carrito y pedidos multiproveedor**) — `:56-61`. Última corrida completa: **727/727** (equipo de carrito, commit `2eed864`); re-verificado A+I 69/69 tras el cambio de la regla del chat | Con el server levantado: `node scripts/e2e-integral.mjs` (default `http://localhost:3031`; `--base`, `--only A,B`, `--no-purge`, `--purge-only`) | Escribe en **producción**: crea usuarios `e2e-q-<rol>-<ts>@homia.test` con marca `[E2E]` y purga todo al final (`:14-20`) |
| `scripts/e2e-visual.mjs` (249 líneas) | Recorrido visual con Playwright de todas las pantallas por rol en 390×844 (y las principales en 1280×800): captura, errores de consola, overflow horizontal, textos "undefined/NaN", botón "Más" del menú móvil (`:12-18`) | `PLAYWRIGHT_DIR=<carpeta con playwright> node scripts/e2e-visual.mjs [--base] [--out] [--keep]`; sin `--data` corre antes la integral con `--no-purge` y purga al final | Mismo aviso: escribe en producción |
| `scripts/e2e/sec-audit.sh` (130 líneas) | Auditoría de seguridad en vivo: login de las 3 cuentas demo, 401 sin sesión, 403 cruzados entre roles, IDOR sobre factura/PDF/cobro/proyecto/conversación/compra, bloqueo tras 10 logins fallidos, reglas de contraseña, inyección SQL/XSS en búsquedas | `bash scripts/e2e/sec-audit.sh` (usa `http://localhost:3000`, `sec-audit.sh:3`) | Usa las cuentas demo reales |

| `scripts/homy-eval.mjs` + `scripts/homy-eval-casos.json` | Set de evaluación del súper agente: 32 casos contra un server real; mide herramientas usadas, textos que deben/no deben aparecer, links válidos, montos que existen en la base y que no haya caído al respaldo (`homy-eval.mjs:1-8`). Resultado del equipo: 32/32, 0 alucinaciones | `node scripts/homy-eval.mjs [http://localhost:3061] [--solo=id1,id2] [--conc=4]` | Usa las cuentas demo solo para leer, pero **escribe** `HomyRun`, `HomySession`, `HomyMessage`, `AiUsage` y `SearchEvent` en producción; los ids quedan en `scratch/homy-eval/` para limpiarlos |
| `src/lib/homy/__tests__/loop.test.ts` | Pruebas unitarias del loop, guardarraíles, ranking y cupo, sin base ni OpenAI (19 según el equipo) | `node --test --import ./scripts/homy-test-alias.mjs src/lib/homy/__tests__/*.test.ts` (el alias resuelve `@/…`) | No escribe nada |

Build: `npm run build` (tipos estrictos). Lint: `npm run lint`.

---

## 10. Deploy y verificación post-deploy

1. Rama propia desde `main` → cambios → build y pruebas → verificación en navegador (escritorio y
   390×844) → **OK explícito de Leonardo** → merge `--ff-only` a `main` local → `git push` de `main`
   (memoria `ciclo-de-trabajo`). Las ramas no se pushean; Vercel despliega `main`.
2. Migraciones de esquema: antes del deploy, con OK, según §5.
3. Después del deploy: esperar a Vercel y probar en `https://www.somoshomia.com`: un endpoint nuevo
   tiene que dar 401 (no 404) sin sesión; recorrer el flujo tocado con una cuenta demo.
4. Verificación completa sugerida (AGENTS.md §12): registro → login → búsqueda "caño" → contratar
   → factura PDF → reseña con foto → DNI con IA → webhook MP con token de prueba.
5. `docs/DEPLOY-VERCEL.md` describe la migración original desde el sandbox; varias instrucciones
   suyas (`prisma db push`, Vercel Blob) **ya no aplican** (se usa `db execute` y Supabase Storage).

---

## 11. Trampas conocidas

| Trampa | Qué pasa | Cómo evitarla |
|---|---|---|
| `prisma generate` con el dev server corriendo (Windows) | EPERM: el motor de Prisma está bloqueado por el proceso de Next | Parar el dev server propio (verificando que el puerto sea de esta carpeta) y regenerar |
| `next build` con el dev levantado | Pisa `.next` y rompe el dev | No correr build con el dev prendido, o usar otra carpeta con `NEXT_DIST_DIR=.next-otra` (útil cuando dos equipos levantan servers en la misma carpeta) |
| Cantidades fraccionadas en Mercado Pago | MP exige cantidades enteras por ítem | `toMpItems` manda las líneas fraccionadas (2,5 m) como 1 × total de la línea (`mercadopago.ts:75-86`) |
| Consultar un pago cobrado por el vendedor con el token de HomIA | MP responde 404: el pago no se acreditaba | La `notification_url` lleva `?ref=<tipo>:<id>` y el webhook consulta con el token del vendedor |
| Heredocs en Windows (Git Bash/PowerShell) | Mensajes de commit o archivos con `$`, backticks o comillas se rompen | Escribir el texto a un archivo y usar `git commit -F archivo`; en PowerShell here-string `@'…'@` con cierre en columna 0 |
| `reason` de la preapproval > 60 caracteres | MP rechaza la suscripción y la API responde 503 "Mercado Pago no respondió" | Mantener `reason` ≤ 60 (`mercadopago.ts:226-229`; commit `55b5e3a`) |
| `back_urls` con `#` | MP descarta el fragmento al volver: el usuario cae en la home | URLs sin `#` (`/panel/...`); la SPA convierte pathname → hash (`app-root.tsx:78-84`) |
| Muchos logins seguidos (pruebas) | El rate-limit (memoria o Firewall de Vercel) bloquea la IP con 429 | Espaciar pruebas; el E2E usa una IP ficticia por corrida (`e2e-integral.mjs:51`) |
| Avisos de MP sin firma de la app | Si se rechazan, se pierden pagos reales | Se loguean y se procesan re-consultando a MP (§6.1) |
| Pago o suscripción en el "otro" entorno | Un aviso sin `live_mode` se buscaba solo en producción | Fallback prueba ↔ producción en el webhook |
| Escribir desde local | Local = producción | Todo lo que escribe necesita OK de Leonardo; probar con cuentas demo y borrar lo creado |
