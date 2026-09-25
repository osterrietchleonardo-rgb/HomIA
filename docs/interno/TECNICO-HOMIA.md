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
  (`src/lib/router.tsx:28`) empuja `/#/ruta`; desde la home estática (`pathname === '/'`) hace
  SIEMPRE una navegación real al catch-all, aunque la URL ya tenga un `#` (en `/` no hay SPA
  escuchando: cambiar solo el hash dejaba la URL en `#/registrarse` con la home en pantalla;
  corregido el 24/09/2026).
- **Rutas sin `#` también funcionan.** `AppRoot` convierte `pathname` → hash al montar
  (`src/components/app/app-root.tsx:78-84`), y `SpaRedirect` en la home hace lo inverso para
  deep-links `#/...` que caen en `/` (`src/components/home/spa-redirect.tsx`): al montar **y en cada
  `hashchange`** mientras la SPA no está montada (`isSpaMounted()`), porque tipear o pegar
  `somoshomia.com/#/directorio` estando en la home solo cambia el hash, sin recargar (bug del
  24/09/2026: la home quedaba en pantalla). `AppRoot` marca la SPA al renderizar y la **desmarca al
  desmontarse** (`unmarkSpaMounted`): al volver a `/` con el logo (navegación cliente de Next) la marca
  quedaba en `true` y `navigate()` solo cambiaba el hash. Por eso las
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
- **Header público** (`src/components/home/site-header.tsx`): desde 1280 px (`xl`) muestra solo
  `NAV_DESKTOP` (Directorio, Materiales, Cómo funciona, Ayuda); "Homy, el asistente" (ancla
  `#motor-ia`), "Beneficios" y "Para quién es" (ancla `#comunidad`) quedan en el menú hamburguesa
  (`NAV_ITEMS`, por debajo de `xl`) y en el footer. Las anclas no cambiaron con el copy de D31. Carrito
  separado de Ingresar/Crear cuenta por una línea; textos sin partir (`whitespace-nowrap`). 24/09/2026.
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
                             (copy D31, 25/09/2026: hero, hero-search, how-it-works, ai-band,
                             features, profiles, sponsors, cta-final, homy-widget, site-header,
                             site-footer; más app/layout.tsx y lib/og-card.tsx. CTAs con data-track
                             "home: …")
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
supabase/migrations/         SQL aplicado a la base (0001–0024 y 0030)
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
- **Recuperar contraseña (D18, 24/09/2026, migración `0028`):** `POST /api/auth/password/forgot`
  (sin `RESEND_API_KEY` responde 503 `needsConfig`, sin crear tokens: `emailConfigurado()` de `src/lib/email.ts`)
  y `GET/POST /api/auth/password/reset` (§4.10). El token (32 bytes de `crypto.randomBytes`,
  base64url) viaja solo en el link del mail; en `PasswordReset.tokenHash` se guarda su sha256
  (`src/lib/password-reset.ts`). Política de contraseña compartida en
  `src/lib/password-policy.ts` (mismos mensajes que el registro, que todavía valida en línea).
  **Límite conocido:** la sesión es un JWT sin estado; cambiar la contraseña **no** cierra las
  sesiones abiertas en otros dispositivos (no hay `tokenVersion`; hallazgo anotado, no se cambió).
- **Baja de cuenta (D19, 24/09/2026):** existe `POST /api/profiles/me/eliminar` (§4.9). Una cuenta
  con `User.deletedAt` no tiene sesión (`getSessionUser` filtra `deletedAt IS NULL`) y el login la
  rechaza.

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
| Proyectos | `Project` (`:271`) | `status` (activo/finalizado/cancelado), `stage` (presupuesto→materiales→ejecucion→revision→finalizado), `laborCost` (0 = sin cotizar), `budgetMin/Max`, `materialsCost`, `materialsPaymentMode` (pro_adelanta/cliente_paga_proveedor), datos del asistente (`urgency`, `address`, `deadline`, `photos`), `parentProjectId` (subcontratación, D16) | materiales, facturas, cobros, obras; `parent`/`subcontracts` (autorrelación) |
| | `ProjectMaterial` (`:308`) | `status` (propuesto/aprobado/rechazado/reemplazado), `quantity`, `unitPrice`, `providerId?`, `alternativeOfId`, `invoicedAt` | N–1 proyecto/elemento/proveedor |
| | `Invoice` (`:331`) | `number` único `HOM-<año>-<n>`, `laborCost`, `materialsCost`, `total`, `status` (pendiente/pagada/vencida), `paymentMethod`, `mpPreferenceId`, `mpPaymentId` | ítems, pagos |
| | `InvoiceItem` (`:352`) | `kind` material/mano_obra, `subtotal` | N–1 factura |
| | `Payment` (`:364`) | `invoiceId?`/`chargeId?`/`purchaseId?`, `method`, `mpPaymentId` **único**, `status`, `amount`, `refundedAmount`, `confirmedAt` | N–1 factura (opcional) |
| | `ProviderCharge` (`:385`) | `number` único `PRV-<año>-<n>`, `materialIds` (JSON), `amount`, `status` (pendiente/acordada_efectivo/pagada/anulada), `method` | N–1 proyecto (opcional), proveedor, cliente |
| | `ProviderLink` (`:408`) | `accountLabel`, `active` | proveedor ↔ profesional |
| Compras | `Purchase` (`:464`) | `elementName`, `quantity`, `unitPrice`, `total`, `type` compra/reserva, `status` (pendiente_aprobacion/aprobado/entregado/pagado/rechazado/cancelado), `chargeId`, `reservationExpiresAt` | N–1 cliente, proveedor |
| Sobrantes | `LeftoverReturn` | `tipo` (cliente/profesional_a_proveedor), `sellerKind` (proveedor/profesional), `providerId?`, `professionalId?`, `parentReturnId?`, `status` (solicitada/aceptada/aceptada_parcial/rechazada/cancelada/recibida/reembolsada/reembolso_fallido), `paymentMethod`, `mpPaymentId`, `mpRefundId`, `refundTotal`, `refundChannel`, `refundMethod`, `refundMethodNote` | 1–N `LeftoverItem`; N–1 proveedor u profesional (vendedor); autorrelación padre → hijas |
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

### 4.2 Sobrantes con el profesional como vendedor (D14, migración `0024`)

`supabase/migrations/0024_sobrantes_profesional.sql`, **solo aditiva**, aplicada el 24/09/2026 con
`prisma db execute --url $DIRECT_URL` (diff posterior vacío):

| Columna / objeto | Qué guarda |
|---|---|
| `LeftoverReturn.tipo` `TEXT NOT NULL DEFAULT 'cliente'` | Pata: `cliente` (el comprador devuelve a quien le vendió) \| `profesional_a_proveedor` |
| `LeftoverReturn.sellerKind` `TEXT NOT NULL DEFAULT 'proveedor'` | Vendedor que acepta, recibe y reembolsa: `proveedor` \| `profesional` |
| `LeftoverReturn.providerId` → **`DROP NOT NULL`** | Sin proveedor cuando el vendedor es el profesional (FK sin cambios: `ON DELETE RESTRICT`) |
| `LeftoverReturn.professionalId` + FK `ProfessionalProfile` (`RESTRICT`) + índice `(professionalId, status)` | Profesional vendedor (materiales cobrados en su factura) |
| `LeftoverReturn.parentReturnId` + FK a sí misma (`ON DELETE SET NULL`) + índice | Devolución del cliente que originó la del profesional al proveedor |
| `refundChannel`, `refundMethod`, `refundMethodNote` | Cómo se reembolsó: `mercadopago` \| `efectivo` \| `fuera_de_homia`; en la última, `efectivo` \| `transferencia` \| `saldo_a_favor` y la nota del proveedor |

Las filas existentes quedaron `tipo = cliente`, `sellerKind = proveedor` (sin migrar datos).
Código: `src/lib/leftovers.ts` (`sellerKindOf`, `proLegStatus`, `alreadyReturnedQty(…, tipo)`,
`OUTSIDE_REFUND_METHODS`), `returns/route.ts` (GET por rol `solicitante|proveedor|profesional` y
`tipo`; POST con `tipo` y `parentReturnId`), `returns/eligible/route.ts` (`tipo=profesional_a_proveedor`
+ `prefill`), `returns/[id]/route.ts` (actor = vendedor según `sellerKind`; acción nueva
`reembolsar_fuera`; restock solo si el vendedor es proveedor; `logActivity` en cada acción),
`src/lib/leftovers-cron.ts` (ambas patas: confirma a las 72 h todo reembolso que no fue por MP y
recuerda al vendedor que corresponda). UI: `profesional/devoluciones.tsx` (ruta nueva
`/panel/profesional/devoluciones`, en app-root y en el menú "Más"), `profesional/sobrantes-pro.tsx`
(sección del proyecto), `sobrantes-section.tsx` (`ReturnRequestDialog`, `RequesterReturnList`
reutilizables), `proveedor/devoluciones-tab.tsx` (parámetro `viewer`).
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

### 4.3 Compra directa y reservas sin stock (D15, migración `0025`)

`supabase/migrations/0025_compra_directa.sql`, **solo aditiva**, aplicada el 24/09/2026 con
`prisma db execute --file … --url $DIRECT_URL`; el `migrate diff` posterior quedó vacío:

| Columna | Qué guarda |
|---|---|
| `Purchase.availableFrom` `TIMESTAMP(3)` nullable | Reserva sin stock aprobada (estado `esperando_stock`): fecha aproximada que indicó el proveedor (AAAA-MM-DD guardada a las 15:00 UTC = mediodía en Argentina) |

Sin columnas nuevas para el resto: el tipo sigue en `Purchase.type` (`compra` | `reserva`), el estado
`esperando_stock` y el estado de cobro `reembolsada` son valores nuevos de columnas `String`, y la
compra "por pagar" reusa `aprobado`.

Código:
- `src/lib/order-rules.ts` (nuevo, sin dependencias de servidor): plazos `COMPRA_PAGO_MS` (24 h),
  `COMPRA_EFECTIVO_MS` (7 días), `RESERVA_MS` (48 h) y formato de fechas con zona
  `America/Argentina/Buenos_Aires` (Vercel corre en UTC).
- `src/lib/orders.ts`: `validateLines` con `mode` por línea y `inStock`; `createOrder` agrupa por
  proveedor **y** tipo y, dentro de **una** `$transaction` (timeout 20 s), crea las compras en
  `aprobado`, reserva el stock con `reserveItems` y crea el `ProviderCharge` (número `PRV-` calculado
  dentro de la transacción: si choca el único, el reintento de `createWithOrderNumber` recalcula
  pedido y cobros); devuelve `{ ok:false, reason:'stock', item }` si un ítem no alcanza
  (`StockShortError`, rollback total). `reserveItems` y `StockShortError` se comparten con
  `purchases/[id]`.
- `src/app/api/purchases/[id]/route.ts`: acción nueva `disponible`; `aprobar` acepta
  `availableFrom`; `cancelar` del proveedor con motivo obligatorio y reembolso por MP con el token
  OAuth del proveedor (`ensureFreshSellerToken` + `refundPayment`, idempotencia
  `purchase-cancel-<id>`) antes de cambiar el estado.
- `src/app/api/payments/webhook/route.ts`: pago aprobado sobre un sub-pedido `cancelado`/`rechazado`
  → `refundLatePayment` (reembolso total con el token del proveedor, idempotencia
  `purchase-late-<paymentId>`), sin reabrir la compra.
- `src/app/api/cron/reservations/route.ts`: mismo barrido de `aprobado` vencidos; el motivo distingue
  compra 24 h / compra en efectivo 7 días / reserva 48 h.
- `src/app/api/marketplace/route.ts`: lista también las ofertas con cantidad 0 (`inStock: false`, al
  final); `offersCount`/`minPrice` cuentan solo las que tienen stock; `reservableCount` nuevo.
- `src/lib/cart-server.ts` / `api/cart`: sin stock ya no es problema bloqueante (`inStock`,
  `stockNote`); `src/lib/cart.ts`: `addToCart(…, { mode })` y preferencia por oferta en
  `localStorage` (`homia_cart_modes_v1`).
- UI: `cart-contents.tsx` (Comprar/Reservar por producto, resumen "Pagás ahora" / "El proveedor tiene
  que aprobarla"), `pedido-detalle.tsx`, `proveedor/cobros.tsx` (sin "Aprobar" en compras, "Ya lo
  tengo: disponible", diálogo de cancelación con motivo), `marketplace-screen.tsx`,
  `cliente/materiales.tsx` y `search-screen.tsx` (botones "Agregar al carrito"/"Reservar" en la
  tarjeta de material, sin salir de la búsqueda).

### 4.4 Contratar desde un trabajo publicado o un proyecto activo (D16, migración `0027`)

`supabase/migrations/0027_contratar_desde_existente.sql`, **solo aditiva** (sin `DROP`), aplicada el
24/09/2026 con `prisma db execute --file … --url $DIRECT_URL`; el `migrate diff` posterior quedó
vacío:

| Cambio | Detalle |
|---|---|
| `Project.parentProjectId` `TEXT` nullable | En una subcontratación, el proyecto del profesional del que sale |
| Índice `Project_parentProjectId_idx` | Para listar las subcontrataciones de un proyecto |
| FK `Project_parentProjectId_fkey` → `Project(id)` `ON DELETE SET NULL` | Autorrelación `parent` / `subcontracts` (`@relation("ProjectSubcontracts")`) |

El vínculo cliente → trabajo publicado reusa `Project.jobId` (ya existía).

Código:
- `src/lib/job-hire.ts` (nuevo): `assertJobOpen(tx, jobId)` y `closeJobWithHire(tx, {…})` — oferta
  elegida `aceptado`, resto de pendientes `rechazado` con `notification.createMany`, trabajo
  `en_proceso` con `selectedBidId`. Errores tipados `HireError` (`JOB_NOT_OPEN` / `BID_NOT_PENDING`)
  que las rutas traducen a 409. Lo usan `PATCH /api/bids/[id]` (aceptar; refactor sin cambio de
  comportamiento) y `POST /api/projects` con `jobId` (`db.$transaction`).
- `src/app/api/projects/route.ts`: zod con `jobId` / `parentProjectId` (excluyentes, `refine`);
  validaciones 403/404/409 antes de escribir.
- `src/app/api/projects/hire-sources/route.ts` (nuevo): `GET` con zod en la query; solo datos del
  usuario de la sesión (401 sin sesión).
- `src/app/api/projects/[id]/route.ts`: `subcontractInfo()` consulta `parent`/`subcontracts` aparte
  y solo para quien los puede ver; si esa consulta falla, el detalle se sigue sirviendo sin esas
  secciones (y queda en el log).
- UI: `src/components/app/hire-wizard.tsx` (selector nativo `<select>` con `optgroup`, precarga,
  chip "Basado en"), `profesional/proyecto-detalle.tsx` (sección Subcontrataciones; si quien abre
  el proyecto es su cliente —una subcontratación propia— delega en la vista de cliente, porque el
  panel de cliente redirige a quien no tiene ese rol) y `cliente/proyecto-detalle.tsx` ("Parte del
  proyecto <título>").
- Pruebas: `scripts/e2e-integral.mjs` → `flowD16` (en D) y `flowE16` (en E); `hire-sources` en la
  lista de lecturas privadas de N.
- **Trampa vista el 24/09/2026:** después de `prisma generate`, un `next dev` ya levantado sigue con
  el cliente de Prisma viejo en memoria (`Unknown field parent` / `Unknown argument
  parentProjectId`); hay que reiniciar el dev server. En Windows el `generate` falla al renombrar
  `query_engine-windows.dll.node` (EPERM) si el dev está corriendo, pero `index.js`/`index.d.ts` sí
  se regeneran.

### 4.5 Rendimiento de la mensajería, Cobros del profesional y atajos a reseñas (migración `0026`, 24/09/2026)

**Causa raíz medida (no supuesta):**

1. **Cada operación de Prisma cuesta ~4 idas y vueltas a la base.** Con `DATABASE_URL` en el pooler
   (`?pgbouncer=true&connection_limit=1`), Prisma envuelve cada operación en
   `BEGIN` + `DEALLOCATE ALL` + consulta + `COMMIT` (medido con `log: query`,
   `scratch/msg-perf/count2.mjs`): `findUnique` = 4 sentencias (~200 ms desde local);
   `findUnique` con `include` de 2 relaciones 1-1 = 6. Además `connection_limit=1` hace que las
   consultas de requests simultáneos **se encolen** en una sola conexión: con el polling viejo
   (hilo cada 3 s, bandeja cada 6 s, panel cada 15 s) la cola nunca se vaciaba y cada request
   tardaba 4–9 s en dev.
2. **N+1 y consultas sin límite:** `GET /messages/conversations` hacía 6 operaciones y su
   `include: { messages: { take: 1 } }` traía **todos** los mensajes de todas las conversaciones
   (Prisma pagina en memoria: la SQL sale sin `LIMIT`, `scratch/msg-perf/count-queries.mjs`).
   `GET /messages/conversations/[id]` hacía 7; `GET /messages/unread` 2; `POST` del mensaje 6.
3. **Re-montaje en cada clic:** la lista navegaba a `/mensajes?c=…` (ruta de primer nivel) estando en
   `/panel/<rol>/mensajes`: se desmontaba el panel entero y la pantalla (lista en blanco,
   "Cargando…"), `PanelLayout` volvía a pedir notificaciones y no leídos, y la pantalla volvía a
   pedir la bandeja.
4. **Sesión pedida 3 veces al arrancar:** `AppRoot`, `useCartSync` (carrito) y `useDuenioHomy`
   (Homy) llamaban `refresh()` en el mismo montaje → 3× `GET /api/auth/me`; `search-screen` la
   volvía a pedir al montar.

**Lo cambiado:**

| Dónde | Antes | Ahora |
|---|---|---|
| `api/messages/conversations` GET | 6 operaciones + todos los mensajes | **1** `$queryRaw`: `LEFT JOIN LATERAL (… ORDER BY createdAt DESC LIMIT 1)` para el último mensaje, subconsulta de no leídos, perfil pro/proveedor del otro; tope 200 conversaciones |
| `api/messages/conversations/[id]` GET | 7 operaciones | **1** sentencia: CTE que valida acceso, CTE `UPDATE … RETURNING` que marca leídos (corre aunque nadie lea su salida), datos del otro, `readUpTo` y los mensajes (`LIMIT 300`). Con `?after=<ISO>` (zod `datetime`) trae solo los `>= after` |
| `api/messages/conversations/[id]` POST | 6 operaciones | zod + 1 lectura de la conversación + **1** `$transaction([message.create, conversation.update, notification.create])`; el nombre sale de la sesión |
| `api/messages/unread` | 2 | **1** `count(*)` con `JOIN` |
| `messages-screen.tsx` | re-montaje en cada clic; polling que recargaba todo, apilable | navega con `?c=` sobre la **misma** ruta; memoria del módulo por usuario (bandeja + hilos) para mostrar al instante al volver; encabezado del hilo desde la bandeja mientras carga; polling con cursor (`?after=` del último confirmado), sin apilar (`inboxBusy`/`threadBusy`), pausado con la pestaña oculta, bandeja solo si se ve; envío optimista con id temporal y dedupe por id/cuerpo |
| `src/lib/store.ts` | cada `refresh()` = un `/api/auth/me` | `refresh()` suma los llamados de la **misma tanda** (mismo tick) a un solo pedido y descarta respuestas viejas (número de secuencia; el logout invalida); nuevo `revalidate()` (se suma al pedido en curso o no hace nada si la sesión tiene < 30 s) usado por `search-screen`. Ninguno toca `loading` → nunca pantalla de carga si ya hay usuario |
| Índice | `Conversation` sin índice por `userBId` (la bandeja busca por `userAId` **o** `userBId`; el unique solo cubre `userAId`) | `@@index([userBId])` — migración `0026_mensajes_indices.sql`, **solo aditiva**, aplicada el 24/09/2026; `migrate diff` posterior vacío |

**Medición (Playwright, 390×844, dev server compartido `localhost:3000`, datos descartables: 3
conversaciones × 35 mensajes; scripts `scratch/msg-perf/seed.mjs` y
`…/scratchpad/pw/msg-perf.mjs`; resultados en `scratch/msg-perf/*.json`):** ver tabla en
`bitacora-sesiones.md` (24/09/2026, mensajería). Requests sueltos en secuencia (curl, mediana de 5):
bandeja 1,64 s → 0,63 s; hilo 1,44 s → 0,68 s; no leídos 0,81 s → 0,62 s. El piso que queda es
`getSessionUser` (≈ 0,4 s: `findUnique` con 2 `include` = 6 sentencias), que no se tocó
(`src/lib/auth.ts`, fuera del alcance).

**Cobros del profesional:** `GET /api/invoices?mine=1` (`src/app/api/invoices/route.ts`) — zod en
query, dueño por sesión (`ProfessionalProfile.userId`), `select` explícito sin tokens ni email;
pantalla `src/components/screens/panel/profesional/cobros.tsx` (ruta `/panel/profesional/cobros`
en `app-root.tsx`, ítem en `panel-layout.tsx`). El OAuth de MP del profesional vuelve a
`/panel/profesional/cobros` (`api/mp/oauth/connect` y `callback`).

**Atajos a reseñas:** `src/components/app/reviews-shortcut.tsx` (`scrollIntoView` suave —respeta
`prefers-reduced-motion`— + `tabindex=-1` y `focus({preventScroll})` en la sección); usado en
`pro-profile.tsx`, `provider-profile.tsx` y `client-summary.tsx`. Contenedor de stock del
proveedor: `max-h-[60dvh]` (`sm:max-h-[520px]`) con `overflow-y-auto overscroll-contain`.

**Pruebas:** `e2e-integral.mjs` → I (cursor `?after=`, borde incluido, no leídos por conversación,
orden de la bandeja, `readUpTo`, `readAt` en UTC, 400/403) y E ("Cobros del profesional": solo
propias, filtros, resumen, sin datos sensibles, 400/401/403); `/api/invoices?mine=1` en la lista de
GET privados de N.

---

### 4.6 Rendimiento general: región, sesión y pedidos (24/09/2026)

- **Causa medida:** la base está en San Pablo (`aws-0-sa-east-1.pooler.supabase.com`) y las funciones
  de Vercel corrían en Washington (`iad1`, default del proyecto). Con el pooler (`pgbouncer=true`)
  cada consulta de Prisma son ~4 idas y vueltas, y cada una cruzaba el continente. Medido en
  producción antes del cambio: `/api/auth/me` 1,4-1,5 s, bandeja de mensajes 4,9 s, Mis proyectos
  4,9 s, búsqueda de materiales 5,4 s.
- **Región:** `vercel.json` → `"regions": ["gru1"]` (San Pablo, misma región que la base). Desplegado
  en `b4665fb` (24/09/2026); `x-vercel-id` confirma `gru1`. Medido en producción después:
  `/api/auth/me` 0,23-0,36 s (antes 1,4-1,5), bandeja de mensajes 0,21-0,26 s (antes 4,9), Mis
  proyectos 0,39 s (antes 4,9), búsqueda de materiales 0,49 s (antes 5,4).
- **Sesión en una consulta:** `getSessionUser` (`src/lib/auth.ts`) pasó de `findUnique` + `include`
  de 2 relaciones (3 consultas) a un `$queryRaw` con `EXISTS` para los perfiles. Corre en cada pedido
  autenticado. Medido en dev: ~0,49 s → ~0,36 s por pedido.
- **Confirmar pedido:** los avisos a cada proveedor después de la transacción (chat, notificación,
  línea de tiempo) salen en paralelo (`Promise.all`, `src/lib/orders.ts`). Medido en dev desde la PC:
  ~4,3 s por pedido de 2 productos; la transacción sigue siendo secuencial (una conexión).

### 4.7 Calendario del profesional y fechas del trabajo (D21, migración `0031`, 24/09/2026)

- **Esquema** (`supabase/migrations/0031_calendario_profesional.sql`, **solo aditiva**, aplicada el
  24/09/2026 con `prisma db execute`): 8 columnas nullable en `Project` — `startDate`, `endDate`,
  `scheduleStatus`, `scheduleProposedBy`, `scheduleNote`, `scheduleUpdatedAt`, `prevStartDate`,
  `prevEndDate` — e índice `Project_professionalId_startDate_idx`. Los proyectos existentes quedan
  "sin fechas". El diff de Prisma traía además las columnas de `User` de la `0029` (otro equipo), que
  no se incluyeron; después la `0029` se aplicó aparte y el diff quedó vacío.
- **Zona horaria:** las fechas son **días**. Viajan como `"AAAA-MM-DD"` y se guardan al **mediodía
  UTC** (`dayToDate`: `AAAA-MM-DDT12:00:00.000Z` = 09:00 en Argentina). Leer el día = los primeros 10
  caracteres del ISO (`dateToKey`), sin importar si el código corre en UTC (Vercel) o en UTC−3 (el
  navegador). "Hoy" siempre en `America/Argentina/Buenos_Aires` (`todayKey`). Probado: 02:00 UTC del
  25 es todavía el 24 en Argentina; la fecha guardada queda exactamente a las 12:00 UTC (E2E Q).
- **Código:**
  - `src/lib/schedule.ts` — funciones puras: días, validación, `scheduleBlockReason` (presupuesto
    aprobado), `scheduleTransition` (máquina de estados), `busyRangesOf`, `mergeRanges`,
    `nextFreeDay`, `freeThisWeek`. Tests sin base: `src/lib/__tests__/schedule.test.ts` (9; 19 desde
    D23, ver §4.7.1).
  - `src/lib/schedule-server.ts` — consultas: `scheduleView`, `bidAcceptedFor`,
    `scheduledProjectsOf` (usa el índice nuevo), `availabilityOf` (rangos anónimos) y
    `nextFreeForPros` (una sola consulta para N profesionales; la usa Homy).
  - `src/app/api/projects/[id]/schedule/route.ts` — `POST` con zod (`discriminatedUnion` por
    `accion`), concurrencia optimista (`updateMany` condicionado a `scheduleStatus` +
    `scheduleUpdatedAt` leídos → 409 si cambió), aviso con `notificar()` de `src/lib/notify.ts`
    (tipos `fechas_propuestas` y `fechas_reprogramacion` también por mail), mensaje en el chat si
    existe y `logActivity`.
  - `src/app/api/professional/calendar/route.ts` — `GET` del propio profesional (ventana ≤ 190 días).
  - `src/app/api/profiles/professional/[id]/availability/route.ts` — `GET` **público** (ventana ≤ 186
    días; `whereUsuarioPublico()` de `src/lib/visibility.ts`).
  - `GET /api/projects/[id]` suma `schedule` y `scheduleBlocked`.
  - UI: `src/components/app/schedule-card.tsx` (tarjeta + diálogos, en los dos detalles de proyecto),
    `src/components/app/month-grid.tsx` (grilla mensual propia, lunes a domingo, sin librerías),
    `src/components/screens/panel/profesional/calendario.tsx` (ruta `/panel/profesional/calendario`
    en `app-root.tsx` y menú en `panel-layout.tsx`), `src/components/app/availability-section.tsx`
    (en `pro-profile.tsx`). Selector de fechas: `<input type="date">` nativo (en el celu abre el
    selector del sistema). No se agregaron dependencias (`date-fns` y `react-day-picker` ya estaban,
    no hicieron falta).
  - Homy: `ProfesionalDato.proximaFechaLibre`/`disponibleEstaSemana` (`src/lib/homy/datos.ts`),
    expuestos por `buscar_profesionales` (`herramientas.ts`); ruta `/panel/profesional/calendario`
    permitida en `rutas.ts`; entrada `calendario` en `conocimiento.ts`; guías en `howto-content.ts`.
- **Costo en la base:** la disponibilidad pública y el calendario son una consulta cada uno (más la
  sesión); `nextFreeForPros` agrega una consulta a `datos.profesionales()` de Homy.
- **Pruebas (24/09/2026):** sección **Q** de `scripts/e2e-integral.mjs` ("Calendario y fechas del
  trabajo") 60/60 contra un dev propio (`E2E_EMAIL_PREFIX=e2e-cal- … --only Q`, con A 126/126);
  unitarias 9/9 (`schedule.test.ts`, la de "nadie acepta su propia propuesta" se vio fallar con el
  bug metido a mano); recorrido visual `scratch/visual-calendario.mjs` 26/26 capturas (390×844 y
  1280×800) sin scroll horizontal, sin textos rotos y botones tocables; purga verificada (0 usuarios
  `e2e-cal-*`).

### 4.7.1 Horario de cada día y jornada del profesional (D23, migración `0032`, 25/09/2026)

- **Esquema** (`supabase/migrations/0032_calendario_horas.sql`, **solo aditiva**, aplicada el
  25/09/2026 con `prisma db execute`; `ADD COLUMN IF NOT EXISTS`, se puede re-ejecutar): en `Project`
  `dailyStart`, `dailyEnd`, `prevDailyStart`, `prevDailyEnd` (TEXT nullable, "HH:MM"); en
  `ProfessionalProfile` `workdayStart`, `workdayEnd` (TEXT nullable). Proyectos existentes: franja
  `NULL` = día completo; perfiles existentes: jornada `NULL` = 06:00–18:00. Primero se aplicaron las
  4 de `Project` y, el mismo día, las 2 de `ProfessionalProfile` (cambio de diseño de Leonardo: jornada
  configurable). El diff de Prisma trajo solo estas sentencias; después dio vacío.
- **Horas = texto de reloj** en hora argentina, sin zona que convertir (los días siguen al mediodía
  UTC, §4.7). Comparación en minutos (`toMinutes`), intervalos semiabiertos `[inicio, fin)`.
- **Código:**
  - `src/lib/schedule.ts` — `validateSlot`, `slotsOverlap`, `schedulesCollide`, `findCollisions`
    (bloquean = acordados, avisan = propuestos), `dayIntervals` (franjas unidas por estado),
    `freeSlots`, `dayStatus` (libre / con lugar / completo con la jornada), `nextDayWithRoom` (reemplaza
    `nextFreeDay`), `freeThisWeek(…, jornada)`, `jornadaOf`, `JORNADA_INICIO`/`JORNADA_FIN`
    (06:00/18:00), `timeOptions` (00:00–23:45 de a 15), `scheduleText`/`slotText`/`slotLabel`.
    `mergeRanges` se quitó (lo público ahora va por día).
  - `src/lib/schedule-server.ts` — `SCHEDULE_SELECT` y `scheduleView` con las franjas;
    `scheduledWhere` (filtro reutilizable dentro de la transacción); `publicDays`; `availabilityOf(…,
    jornada)`; `nextFreeForPros(perfiles)` recibe los perfiles ya leídos (con su jornada) para no
    sumar consultas.
  - `POST /api/projects/[id]/schedule` — zod con `dailyStart`/`dailyEnd` (`superRefine` con
    `validateSlot`). Proponer y aceptar corren en `db.$transaction` interactiva (timeout 15 s):
    `SELECT id FROM "ProfessionalProfile" WHERE id = … FOR UPDATE` (serializa la agenda del
    profesional; funciona con el pooler en modo transacción porque todo va en la misma transacción),
    re-lectura de los proyectos con fechas del profesional, `findCollisions` → 409 `{ choque: true,
    conflictos }` (título e id solo al profesional) y el `updateMany` condicional de siempre. Textos de
    notificación, chat, línea de tiempo y mail con `scheduleText`.
  - `GET/PATCH /api/professional/calendar` — GET suma `jornada` y `jornadaPorDefecto`; PATCH (zod)
    guarda la jornada del perfil de la sesión (06:00–18:00 exacto se guarda como `NULL`).
  - `GET /api/profiles/professional/[id]/availability` — nueva forma: `{ today, from, to, jornada,
    dias: [{ dia, estado, franjas, libres }], proximoDiaConLugar, disponibleEstaSemana }` (antes
    `ranges`/`proximaFechaLibre`).
  - `GET /api/projects/[id]` — suma `proWorkday`.
  - UI: `schedule-card.tsx` (horario en la tarjeta, diálogo con "Todo el día / Elegir horario" y
    selects de 15 min, choque en vivo para el profesional que deshabilita "Enviar fechas", 409 del
    servidor dentro del diálogo o de la tarjeta), `calendario.tsx` ("Mi jornada", KPIs completos /
    con lugar / libres, cantidad y estado por día, hora de inicio en las barras, vista del día
    ordenada por hora y "Agenda del día" como línea de tiempo con carriles y huecos libres),
    `availability-section.tsx` (estado por día y panel de franjas al tocar un día).
  - Homy: `ProfesionalDato.proximoDiaConLugar` (`datos.ts`), `proximo_dia_con_lugar` en
    `buscar_profesionales` (`herramientas.ts`), textos de `conocimiento.ts` y guías de
    `howto-content.ts`.
- **Pruebas (25/09/2026):** unitarias `schedule.test.ts` 19/19 (con el bug "los bordes que se tocan
  chocan" metido a mano en una copia, 2 en rojo: "choque de franjas" y "findCollisions") y Homy
  19/19; E2E **Q 107/107** (+ A 136/136) contra un dev propio en 3121 con doble de Resend
  (`E2E_EMAIL_PREFIX=e2e-hr- … --only Q --mail-sink 3199`): validación de franja (400 × 7), dos
  trabajos el mismo día 07–12 y 14–19 acordados, borde 12–14, 11–15 → 409 con títulos al profesional
  y sin títulos al cliente, choque solo con propuesta → aviso, carrera de dos aceptaciones que se
  pisan → 200/409 y una sola acordada, reprogramación que restaura la franja, notificación / chat /
  línea de tiempo / mail con el horario, disponibilidad "con lugar" con franjas y huecos sin datos
  privados, proyecto sin franja = día completo, jornada (401/403/400 × 4/200, otro profesional cambia
  solo la suya, jornada 07–12 deja el día "completo" en lo público, volver a la de referencia).
  Visual `scratch/visual-horas.mjs`: 30 capturas (390×844 y 1280×800) sin scroll horizontal, sin
  textos rotos y botones tocables. Purga verificada (0 usuarios `e2e-hr-*`).

### 4.8 Páginas legales y temas de Ayuda (24/09/2026)

- **Contenido:** `src/lib/legal-content.ts` exporta `LEGAL_VERSION` (`AAAA-MM-DD`, la guarda el
  registro al aceptar) y dos `LegalDoc` (`TERMINOS`, `PRIVACIDAD`) con `resumen` y `secciones`; cada
  sección tiene bloques: párrafo, `{lista}`, `{tabla: {columnas, filas}}` o `{nota}`. **Cada plazo o
  monto que cambie en el código se cambia acá y se sube `LEGAL_VERSION`.** Los nombres de cookies y
  claves de `localStorage` listados (`homy_session`, `homia_cart_v1`, `homy_geo_denied`,
  `homy_dock_hint`) salen del código: si se agrega otra, se agrega a la tabla.
- **Pantalla:** `src/components/screens/legal-screen.tsx` (rutas `/terminos` y `/privacidad` en
  `app-root.tsx`, dentro de `withPublicShell`). Tablas → tarjetas por debajo de `sm`; índice con
  `scrollIntoView` diferido 60 ms (en el celu el índice se cierra al elegir y corre el contenido);
  `window.print()` para PDF.
- **Titular:** `TITULAR` en `src/lib/legal-content.ts` (25/09/2026): Leonardo Osterrietch, CUIT
  20-39833562-8, email `business@vakdor.com`, **sin domicilio** (pedido de Leonardo). Son datos
  públicos, por eso viven en el código; las variables `NEXT_PUBLIC_LEGAL_RAZON_SOCIAL`, `_CUIT`,
  `_DOMICILIO` y `_EMAIL` (opcionales, se leen en el build) reemplazan cada valor.
- **Ayuda por tema:** `/ayuda?tema=pagos|verificacion|resenas` abre la pregunta con ese `tema` en
  `FAQ` (`help-screen.tsx`) y la lleva a la vista (`#ayuda-<tema>`, diferido 250 ms para no pelear con
  `resetAppScroll()` de `navigate()`). Los links del footer usan esos temas.
- **Verificación:** Playwright contra dev en 1280 y 390: hash tipeado en la home → 5 pantallas; logo →
  home → header (Directorio, Materiales, Ayuda); los 17 links del footer (páginas, anclas de la home y
  temas de Ayuda abiertos y a la vista); legales sin desborde (`scrollWidth` 390/1280). Capturas en
  `scratch/e2e-nav/`.

### 4.9 Términos al registrarse, "Eliminar mi cuenta" y datos demo ocultos (D19/D20, migración `0029`, 24/09/2026)

- **Esquema** (`supabase/migrations/0029_legal_baja.sql`, **solo aditiva**, aplicada el 24/09/2026
  con `prisma db execute`): tres columnas nullable en `User` — `termsAcceptedAt TIMESTAMP(3)`,
  `termsVersion TEXT`, `deletedAt TIMESTAMP(3)`. Sin índices (las consultas filtran por relación y
  el volumen es chico). Vuelta atrás: `ALTER TABLE "User" DROP COLUMN …` de las tres (se pierde solo
  el registro de aceptación y la marca de baja).
- **Registro:** `auth/register/route.ts` exige `acceptTerms === true` (400 `needsTerms`) y guarda
  `termsAcceptedAt`/`termsVersion` (`LEGAL_VERSION` de `src/lib/legal-content.ts`). Pantalla:
  casilla en el paso 3 de `auth-register.tsx`, links `target="_blank"` a `/terminos` y `/privacidad`.
- **Baja:** `POST /api/profiles/me/eliminar` (ruta propia en vez de `DELETE /api/profiles/me`: la
  acción es explícita y no se cruza con los cambios de otro equipo en ese archivo). Lógica en
  `src/lib/account-deletion.ts`: `operacionesAbiertas()` (13 conteos en paralelo), 
  `borrarDniDelBucket()` (lista recursiva de `dni-docs/<userId>/` con `SUPABASE_SERVICE_ROLE` y
  `remove`; si falla → 503 y no se toca nada) y `anonimizarCuenta()` (una `$transaction` interactiva
  con timeout 30 s; después borra, best effort, la foto de perfil y el logo de marca del bucket
  público si están bajo `<userId>/`). Reglas completas en `LOGICA-HOMIA.md` §1.1. UI:
  `src/components/app/delete-account-card.tsx` (AlertDialog con fondo sólido, `max-h-[90dvh]`
  con scroll), insertada al final de `panel/{cliente,profesional,proveedor}/perfil.tsx`.
- **Sesión de una cuenta eliminada:** `getSessionUser` agrega `AND u."deletedAt" IS NULL` a su única
  consulta (sin costo extra); el login no verifica la contraseña si `deletedAt` está puesto.
  `POST /messages/conversations` responde 404 si el destinatario está eliminado. *(Un hilo que ya
  existía todavía acepta mensajes hacia la cuenta eliminada: no se agregó una consulta más a ese
  camino caliente.)*
- **Visibilidad pública:** `src/lib/visibility.ts` — `ocultarDemo()` lee `HIDE_DEMO_USERS` (`'1'`
  = ocultar), `whereUsuarioPublico()` devuelve el `where` de Prisma sobre `User`
  (`{ deletedAt: null }` y, con el flag, `NOT email endsWith '@homia.test'` sin distinguir
  mayúsculas) y `esUsuarioPublico(u)` hace lo mismo sobre una fila ya leída. Se aplica como filtro
  de relación (`user: …`, `provider: { user: … }`) en directorio, búsqueda, pines, marketplace,
  comparables, sponsors, bolsa, detalle de trabajo, perfiles públicos y `src/lib/homy/datos.ts`.
  Las pruebas E2E crean usuarios `@homia.test`: **la suite necesita el server con el flag en 0**.
- **Imagen para compartir:** `src/app/opengraph-image.tsx` y `src/app/twitter-image.tsx`
  (`ImageResponse` de `next/og`, 1200×630 PNG) con la tarjeta de `src/lib/og-card.tsx` (navy
  `#0A2540`, "HomIA" con "IA" en naranja `#FF5A1F`, lema y línea corta; solo estilos en línea y
  flexbox). Next agrega solo `og:image` y `twitter:image` (con ancho, alto, tipo y alt) a todas las
  páginas; la URL absoluta sale de `metadataBase` del layout (`https://www.somoshomia.com`). En dev
  la URL usa el host local.
- **Páginas de error:** `src/app/error.tsx` (errores de cualquier pantalla, dentro del layout) y
  `src/app/global-error.tsx` (errores del layout raíz: trae su propio `<html>`/`<body>` e importa
  `globals.css`); las dos muestran `src/components/app/error-view.tsx` ("Algo salió mal",
  **Reintentar** = `reset()`, **Ir al inicio** = link a `/`) y hacen `console.error` del error, sin
  mostrar detalles al usuario.
- **Verificación (24/09/2026, dev en 3111):** E2E integral con la sección A ampliada (términos y
  baja, 42 chequeos nuevos) y C (demo visible con el flag en 0); `scratch/visibilidad-demo.mjs`
  con `HIDE_DEMO_USERS=1` (+ `HOMY_APAGADO=1` para probar Homy sin gastar IA) y con 0; Playwright
  390×844 y 1280×800 (`scratch/e2e-legal/`): legales, registro con la casilla, diálogo de baja con
  409 y baja real, página de error forzada con una ruta temporal (borrada).

### 4.10 Recuperar contraseña y avisos por mail (D18, migración `0028`, 24/09/2026)

- **Esquema (aditivo):** `User.emailNotifications Boolean @default(true)` y modelo
  `PasswordReset { id, userId → User (onDelete Cascade), tokenHash @unique, expiresAt, usedAt?,
  createdAt, ip? }` con `@@index([userId])`. RLS activado en la tabla. SQL en
  `supabase/migrations/0028_recuperar_y_mails.sql` (aplicado con `prisma db execute` el 24/09/2026;
  `migrate diff` posterior vacío para estas sentencias).
- **Envío de mails — `src/lib/email.ts`:** Resend por su API HTTP (`POST
  https://api.resend.com/emails`, `Authorization: Bearer RESEND_API_KEY`), con `fetch` y
  `AbortSignal.timeout(10 s)`; sin dependencias nuevas. `sendEmail()` **nunca tira**: devuelve
  `{ ok: true, id }` o `{ ok: false, reason: 'no_configurado' | 'destinatario_invalido' | 'error' }`.
  Sin `RESEND_API_KEY` no intenta y hace un `console.warn` una vez por proceso. **Plantilla de marca
  (25/09/2026, pedido de Leonardo):** tablas y estilos en línea, 560 px que se achica en el celu;
  cabecera azul marino `#0A2540` con el logo PNG (mascota + wordmark en Plus Jakarta Sans, generado
  desde `public/logo.svg` con Playwright; Gmail y Outlook no muestran SVG) **incrustado en el mail**:
  va como adjunto inline (`attachments: [{ content_id: 'homia-logo', … }]`, base64 en
  `src/lib/email-logo.ts`) y el HTML usa `src="cid:homia-logo"`. Con la URL pública
  (`public/email/homia-logo-blanco.png`) Leonardo veía el recuadro vacío (25/09/2026): el cliente de
  correo no la descargaba. Para regenerar: rehacer el PNG y volver a pasarlo a base64 en
  `email-logo.ts` y "Tu hogar en buenas manos"; franja naranja
  `#FF5A1F` / dorado `#FFC700` / celeste `#00C4FF`; título, párrafos, botón naranja con flecha y link
  de respaldo; nota destacada con borde celeste; texto de vista previa oculto; pie gris con el motivo
  del mail, links a Ayuda, Términos y Privacidad y "HomIA es un servicio de Leonardo Osterrietch, CUIT
  …" (`TITULAR`). `$ 45.600` sale con espacio duro y el CUIT sin cortar. Todo en español. Pie de
  avisos: "Recibís este mail porque tenés una cuenta en HomIA. Podés dejar de recibir avisos por mail
  desde tu perfil." (el de recuperar contraseña lleva otro pie). Vista previa: `scratch/mail-render.mjs`.
  `linkAbsoluto()` convierte `#/panel/...` en `${APP_URL}/#/panel/...`. Los destinatarios de
  dominios reservados (`.test`, `.invalid`, `.example`, `.localhost`) no se mandan a Resend real.
  `RESEND_API_URL` (solo fuera de producción) apunta el envío a un doble local para las pruebas.
- **Avisos — `src/lib/notify.ts`:** `notificar({ data })` / `notificarVarios({ data }, { mailSoloA })`
  crean la `Notification` igual que `db.notification.create/createMany` y, si el `type` está en
  `TIPOS_CON_MAIL` y el usuario tiene `emailNotifications`, programan el mail con `after()` de
  `next/server` (corre después de responder; en Vercel mantiene viva la función hasta terminar).
  En transacciones (`bids/[id]`, `projects` con trabajo publicado) se crea con `tx` y se llama a
  `avisarPorMail()` después del commit. Solo se tocaron las creaciones de los tipos de la lista
  (`LOGICA-HOMIA.md` §14.1); el resto del proyecto sigue con `db.notification.create`.
- **Pantallas:** `/recuperar` (`auth-recuperar.tsx`) y `/restablecer?token=`
  (`auth-restablecer.tsx`, valida el link al entrar con `GET /auth/password/reset`), registradas en
  `app-root.tsx` con el mismo `AuthShell` que Ingresar; link en `auth-login.tsx`. Interruptor
  `AvisosMailCard` (`src/components/screens/panel/avisos-mail-card.tsx`, carga y guarda solo con
  `/api/profiles/me`) montado en los tres `perfil.tsx`.
- **Pruebas:** `src/lib/__tests__/email.test.ts` (10, sin red, `fetch` doble); sección A de
  `e2e-integral.mjs` (`flowARecuperarYMails`, con `--mail-sink <puerto>` levanta un doble de Resend);
  visual `scratch/visual-recuperar.mjs` (73/73, capturas en `scratch/e2e-recuperar/`).

### 4.11 Subida de fotos y catálogo ampliado (25/09/2026)

- **Fotos:** `src/lib/upload-image.ts` (cliente). `prepararImagen()` decodifica con `createImageBitmap`
  (`imageOrientation: 'from-image'`, respaldo `<img>`), deja igual lo que ya es JPG/PNG/WEBP de ≤ 3,5 MB
  y ≤ 2000 px (2600 para `folder=dni`), y si no, redimensiona en canvas y codifica JPEG 0,85→0,65 (fondo
  blanco) o WEBP si el original tenía transparencia (respaldo JPEG si el navegador no codifica WEBP),
  achicando 20% por vuelta hasta entrar. `subirImagen(file, folder, opts)` sube a `/api/uploads` y
  traduce la respuesta: 401 → sesión, 413 (Vercel, HTML) → peso, 429, mensaje del servidor, 5xx, red.
  **Causa del reporte de Leonardo** ("no se pudo subir la foto" en el perfil): Vercel rechaza cuerpos
  > 4,5 MB con 413 HTML antes de llegar a la función y `AvatarUploader` tiraba un mensaje genérico (y
  el mismo mensaje si fallaba guardar el perfil). Usan `subirImagen`: foto de perfil (`ui-bits.tsx`,
  1024 px), logo (`proveedor/perfil.tsx`, 1200 px), foto de material, obras, publicar trabajo,
  Contratar, reseñas, sobrantes, DNI, sugerencias y finanzas. Verificado en Chrome real
  (`scratch/upload-image.iife.js` + Playwright): 11,6 MB → 1,43 MB 2000×1500; PNG transparente 11 MB →
  WEBP 2,66 MB; HEIC ilegible, texto y vacío con su mensaje; 413/401/400/500/sin red/éxito.
- **Catálogo:** expansión 3 cargada en producción con `seed-catalog-maestro.mjs` (reescrito: una
  lectura, escritura en lotes, `--dry-run`, `--categorias-nuevas`; idempotente, no toca
  `ProviderStock`): 546 nuevos, 0 actualizados → 1764. Fuentes en `scripts/catalogo/fuentes.mjs`.
  `canonicalCategoria` (`search-match.ts`) ahora busca alias como palabra completa y el más largo
  primero ("control de plagas" ya no cae en `gasistas` por "gas") y suma rubros (fumigador,
  refrigeración, electrodomésticos, cerrajería, pileta, alarmas…). `catalogScore()` pondera nombre y
  aliases sobre la descripción en los buscadores del catálogo (stock del proveedor y materiales del
  proyecto): "cemento" trae primero los cementos.
- **Expansión 4, maderera y carpintería (25/09/2026, pedido de Leonardo):** 138 altas en
  `scripts/catalogo/catalog-exp4-madera.mjs` (sumado a `fuentes.mjs`): maderera 55 (pino bruto y
  cepillado 1x2 a 1x10, tirantes 2x3/3x3, eucalipto, maderas por especie —álamo, kiri, guatambú,
  paraíso, lenga, roble, incienso, anchico, viraró, pino Paraná—, MDF 12/15/25, MDF melamínico,
  melamina 15 y maderada, aglomerado crudo, fenólico 9/12/15, terciado y multilaminado, OSB 9,
  enchapados, alistonados, laminado plástico, chapa natural, molduras, torneados, anticarcoma),
  carpinteria 39 (tapacantos PVC/ABS/preencolado/madera, bisagras codo y supercodo, correderas,
  minifix, tornillos, clavos sin cabeza, placard, estantes, colas D3/PU/termofusible), herramientas 33
  (discos, ingletadora, sierra de banco, mechas Forstner/paleta, router y fresas, sargentos, prensas,
  engrapadora, clavadora brad) y pintura 11 (lacas, sellador nitro, thinner, tinta al agua, aceite de
  lino, fondo blanco, barniz marino de exterior, lijas). Chequeo anti-duplicado contra los 1764 con
  la normalización de `search-match.ts` (nombre igual, alias repetido, similitud de nombre ≥ 0,5:
  solo quedaron variantes de medida). `--dry-run --categorias-nuevas`: 138 nuevos, 0 actualizados,
  0 movidos → 1902. **Cargada en producción el 25/09/2026** (OK de Leonardo): 1902 elementos, stock 46
  filas y 5299 unidades antes y después; un segundo `--dry-run` da 0 nuevos. **Arreglo del seeder:**
  `catalogSources()` usaba por defecto la categoría de respaldo de electrodomesticos y plagas y, como
  ya se habían movido, sin `--categorias-nuevas` los creaba de nuevo (210 "nuevos"); ahora esas
  categorías son el comportamiento por defecto (la opción queda sin efecto).
  `catalogScore` suma 5 por cada medida de la búsqueda que aparece entera en nombre o aliases ("18"
  pega con "18mm", no con "1,83"): `matchScore` ignora tokens de menos de 3 caracteres y "mdf 18"
  empataba todos los MDF. `CATEGORIA_ALIASES` suma aserradero → maderera y mueblero, ebanista,
  ebanistería, carpintero de muebles, lustrador de muebles → carpinteria.
- **Categorías nuevas (OK de Leonardo, 25/09/2026):** `electrodomesticos` (ícono `washing-machine`) y
  `plagas` (`bug`). Primero se publicó el código (`src/lib/categories.ts` íconos y lista de respaldo,
  pestañas "Electro" y "Plagas" en materiales y buscador, oficios del profesional, alias de
  `search-match.ts`), después `seed-catalog-maestro.mjs --categorias-nuevas` movió los 72 elementos
  (39 y 33) desde `electricistas` y `limpieza` cambiando la categoría del mismo elemento: el stock de
  los proveedores no se toca. Como las categorías también son rubros, aparecen solas en publicar,
  bolsa, obras y directorio.

### 4.12 Finanzas del profesional y del proveedor (D24, migración `0033`, 25/09/2026)

- **Modelo (solo aditivo):** `FinanceEntry` (movimientos cargados: `userId`, `role`, `type`,
  `category`, `description`, `amount`, `interestAmount?`, `date`, `paymentMethod?`, `recurring?`,
  `recurringUntil?`, `projectId?` sin FK, `usefulLifeMonths?`, `status` pagado|pendiente,
  `attachmentUrl?`, `deletedAt?`; índice `(userId, role, date)`), `FinanceConfig` (único por
  `userId`+`role`: `openingCash`, `openingDate` = fin del día del saldo, `estimatedCostPct`,
  `onboardedAt`, `tags` JSON `{chargeId: projectId|"personal"}`) y `ProviderStock.unitCost Float?`.
  Ambas tablas con `ON DELETE CASCADE` al usuario y RLS activado. **Por qué `unitCost` en
  `ProviderStock`:** el costo es un atributo de la línea de stock del proveedor (misma clave que el
  precio y la cantidad, se ve junto a ellos) y es lo único que no está en la base; ponerlo en
  finanzas duplicaría el catálogo del proveedor. Limitación documentada: no hay historial de
  costos (el costo de lo vendido y el inventario usan el costo vigente).
- **Código:** `src/lib/finanzas/conceptos.ts` (tipos, categorías con vida útil orientativa,
  glosario, guía, entradas para Homy: única fuente), `calculos.ts` (puro, sin base: períodos en
  hora argentina, recurrentes, amortización, resultados, caja con reconstrucción hacia atrás,
  balance, métricas, obras, productos, recomendaciones, lista de movimientos), `datos.ts`
  (`server-only`: arma la entrada con datos reales), `servidor.ts` (sesión + rol, zod, reglas).
  Pantalla `src/components/screens/panel/finanzas/*` (un módulo, rol por prop) registrada en
  `app-root.tsx` (`page === 'finanzas'` en profesional y proveedor) y en el menú de
  `panel-layout.tsx` (icono `PiggyBank`, dentro de "Más" en el celular). Pestaña por `?tab=`.
  Comprobantes con `subirImagen(file, 'finanzas')` (`upload-image.ts`) al bucket público.
- **Endpoints (6 archivos):** `GET /api/finanzas/resumen`, `GET/POST /api/finanzas/movimientos`,
  `PATCH/DELETE /api/finanzas/movimientos/[id]`, `PUT /api/finanzas/config`,
  `PUT /api/finanzas/costos`, `GET /api/finanzas/export.csv` (detalle en `LOGICA-HOMIA.md` §13 y §16).
- **Rendimiento:** el resumen hace 8 consultas Prisma **en paralelo** (`Promise.all`) filtradas por
  el usuario de la sesión (profesional: config, movimientos, facturas, devoluciones, compras,
  subcontratos, ofertas, proyectos; proveedor: config, movimientos, cobros, ítems de compra,
  materiales de proyecto, stock, devoluciones, perfil) y calcula todo en memoria. La respuesta
  trae `tiempos` (`datosMs`, `totalMs`) para medirlo. Medido en el E2E (sección R, server de
  desarrollo local contra la base de São Paulo): ver §9.
- **Homy:** `conocimiento.ts` suma `entradasHomyFinanzas()` (uso por rol, glosario y tipos); rutas
  `/panel/{profesional,proveedor}/finanzas` en `homy/rutas.ts`. Sin herramientas nuevas: Homy
  explica conceptos y cómo usar la sección, no ve los números.
- **Baja de cuenta:** `anonimizarCuenta` borra `FinanceEntry` y `FinanceConfig` del usuario.

### 4.13 Sugerencias de los usuarios y bandeja del administrador (D25, migración `0034`, 25/09/2026)

- **Referencia:** se miró cómo lo resolvió PRISMA-SYSTEM (`lib/actions/feedback.ts`,
  `components/feedback-form.tsx`, `app/api/admin-vakdor/sugerencias/*`, `lib/admin-vakdor/*`, solo
  lectura). Se tomó el método (una tabla, tipos con ícono, fotos de evidencia, historial del usuario
  con estado y respuesta, bandeja con filtros por estado/tipo y búsqueda). No se tomó: bucket
  **público** con `getPublicUrl` (acá privado con firma), el login de admin aparte con otro JWT
  (acá `ADMIN_EMAILS` sobre la sesión normal), los dos campos de estado (`status`/`estado`) ni las
  dos notas que se cruzaban (acá una sola respuesta que ve el usuario), la subida sin validar tipo
  ni tamaño, la falta de avisos y de tope, y el borrado duro sin limpiar fotos.
- **Modelo (solo aditivo):** `Feedback` (`userId` con `ON DELETE CASCADE`, `role`, `type`, `area`,
  `title`, `description`, `photos` JSON de paths privados, `context` JSON solo para "problema",
  `contactOk`, `status`, `adminResponse?`, `respondedAt?`, `createdAt`, `updatedAt`; índices
  `(userId)` y `(status, createdAt)`; RLS activado). Migración
  `supabase/migrations/0034_sugerencias.sql` generada con `migrate diff` (el diff traía solo esto),
  con `IF NOT EXISTS`, aplicada el 25/09/2026 con `prisma db execute`; re-diff vacío.
- **Bucket `feedback-evidencias` (creado el 25/09/2026 por la API de Storage con
  `SUPABASE_SERVICE_ROLE`):** privado, 8 MB, solo `image/jpeg|png|webp` (misma configuración que
  `dni-docs`). **Por qué un bucket nuevo y no una carpeta en `dni-docs`:** separa por finalidad
  (documento de identidad vs. capturas), permite otra política de retención y borrado sin tocar
  el DNI, y el código de uploads ya elegía bucket por `folder`. `POST /api/uploads` con
  `folder=sugerencias` guarda en `feedback-evidencias/<userId>/sugerencias/<aleatorio>.<ext>` y
  devuelve el path (`private: true`), nunca una URL. Las fotos se firman por 10 minutos en UNA
  llamada (`createSignedUrls`, `src/lib/feedback-server.ts` `firmarFotos`) solo para el autor y el
  admin; la API nunca devuelve el path. Verificado en el E2E: sin firma, `object/public/…` y
  `object/…` no devuelven la imagen; con firma, sí.
- **Código:** `src/lib/feedback.ts` (puro: tipos, estados, áreas por rol, zod de alta y de
  actualización, `esFotoPropia`, `inicioDelDiaAR`, `superaTope`, `esAdmin`, `emailsAdmin`,
  `casillaEquipo`), `src/lib/feedback-server.ts` (firmas, borrado de fotos por usuario, forma
  pública, mail al equipo). Pantallas `src/components/screens/panel/sugerencias.tsx` (los tres
  roles, `role` por prop; fotos con `subirImagen(file, 'sugerencias')`) y `admin-sugerencias.tsx`.
  Rutas en `app-root.tsx`: `page === 'sugerencias'` en `panelScreen` (común) y `/panel/admin/…`
  que se muestra dentro del `PanelLayout` del primer rol del usuario (el layout corrige los roles
  que el usuario no tiene; `admin` no es un rol). `app-root` guarda la pantalla anterior en
  `sessionStorage.homy_prev_path` para el contexto de "Problema técnico". Menú en
  `panel-layout.tsx` (ícono `MessageSquarePlus`, antes de Ayuda; en el celu, dentro de "Más").
- **Administrador:** *reemplazado por D29 (§4.16)*: ya no hay `esAdmin`/`ADMIN_EMAILS` ni email
  reservado en el registro; las rutas de admin usan `requireAdmin()` (cookie `homia_admin` de
  `/admin`) y responden **404** sin ella. La bandeja se ve en `/admin/sugerencias`.
- **Endpoints (4 archivos):** `GET/POST /api/feedback`, `GET /api/feedback/[id]`,
  `GET /api/admin/feedback`, `PATCH /api/admin/feedback/[id]` (reglas en `LOGICA-HOMIA.md` §15).
- **Avisos:** tipos `sugerencia_respuesta` y `sugerencia_estado` en `TIPOS_CON_MAIL`
  (`src/lib/notify.ts`); mail al equipo con `sendEmail` en `after()` a `FEEDBACK_EMAIL` o
  `TITULAR.email`.
- **Homy y ayuda:** ruta `/panel/<rol>/sugerencias` en `homy/rutas.ts` (`comunes`), entrada por
  rol en `homy/conocimiento.ts`, FAQ `tema: 'sugerencias'` en `help-screen.tsx`.
- **Baja de cuenta:** `anonimizarCuenta` borra los `Feedback` del usuario y todo
  `feedback-evidencias/<userId>/sugerencias/` (también las fotos que subió y quitó antes de mandar).
- **Pruebas:** unitarias `src/lib/__tests__/feedback.test.ts` (8; mutaciones verificadas: `esAdmin`
  por substring y tope con `>` ponen la prueba en rojo). E2E sección **S** de `e2e-integral.mjs`
  (server con `ADMIN_EMAILS=<prefijo>admin@homia.test`, `FEEDBACK_EMAIL=<prefijo>equipo@homia.test`
  y `--mail-sink`): 67/67. Visual `scratch/e2e-sugerencias/` (Playwright 390×844 y 1280×800): 52/52.

### 4.14 Registro estandarizado, verificación del email y celular con país (D26, migración `0035`, 25/09/2026)

> **Cambio del 25/09/2026 (Leonardo: "no pedí verificar celular, solo estandarizar"):** se sacó
> toda la verificación del celular por código (se borró `src/lib/celular-proveedor.ts`, el canal
> `celular` de las rutas de verificación, `phoneToken`/`needsPhoneCode`, las variables
> `PHONE_VERIFY_PROVIDER`, `TWILIO_*` y `WHATSAPP_*`) y el celular se estandariza **con país**
> (selector como PRISMA). La verificación de la cuenta es el código del email. **`User.phoneVerifiedAt`
> queda en la base sin uso** (sin migración destructiva: la columna existe, nada la escribe salvo la
> baja de cuenta, que la deja en `NULL`; `channel` de `VerificationCode` queda `email` siempre).

**Modelo (aditivo):** `User.emailVerifiedAt` (DateTime?), `User.phoneE164` (String?, `+549…`),
`User.phoneVerifiedAt` (DateTime?) y la tabla `VerificationCode` (`id`, `userId?` → `User` con
cascade, `channel` email|celular, `purpose` registro|cuenta, `target` email normalizado o E.164,
`codeHash`, `attempts`, `expiresAt`, `usedAt?`, `ip?`, `createdAt`; índices
`(target, channel, purpose, createdAt)`, `(ip, createdAt)`, `(userId)`; RLS activado). `User.phone`
sigue guardando lo que se muestra (`+54 9 11 2345-6789`, `+598 99 123 456`). Las cuentas anteriores
quedan con los tres campos en `NULL` (`GET /api/auth/verificacion` estandariza su `phone` al leer).

**Archivos:**

| Archivo | Qué hace |
|---|---|
| `src/lib/registro.ts` | Compartido cliente/servidor (sin imports de servidor): `normalizarEmail` + `sugerirEmail` (Damerau–Levenshtein contra `DOMINIOS_COMUNES`), `normalizarCelular(texto, pais = 'AR')` → `{ ok, e164, mostrar, pais }` de **cualquier país** (`libphonenumber-js/min`; con `+`/`00` es internacional; en Argentina fuerza el 9 y rechaza no geográficos; error "Número inválido para <país>: …"), `formatearCelular` (internacional, guion final solo en +54), `mismoCelular(a, b, pais)`, `paisesCelular(locale)` (bandera emoji, nombre con `Intl.DisplayNames`, código; AR/UY/CL/PY/BO/MX/ES/US primero, como `getPhoneCountries` de PRISMA), `esPaisCelular` (valida ISO-2 contra `getCountries()`), `paisDeCelular(e164)`, `ejemploCelular(pais)` (placeholder con `getExampleNumber` + `libphonenumber-js/examples.mobile.json`, 4 KB), `nombrePais`, `normalizarNombre` / `problemaNombre`, `normalizarCuit` (DV módulo 11) / `normalizarDniOCuil`, constantes `CODIGO` (6 cifras, 10 min, 5 intentos, 60 s, 5/h) |
| `src/lib/verificacion.ts` | Reglas puras: `nuevoCodigo` (`crypto.randomInt`), `hashCodigo` (HMAC-SHA256), `hashesIguales` (`timingSafeEqual`), `estadoCodigo`, `permisoEnvio` (espera, tope por destino, `TOPE_IP_HORA` = 30), `MENSAJE_CODIGO` |
| `src/lib/verificacion-server.ts` | `server-only`: `enviarCodigo` (topes en la base, cuenta existente → código señuelo + mail "Ya tenés una cuenta", borra el código si el envío falla, limpieza perezosa de códigos de más de 2 días), `comprobarCodigo` (intento descontado atómico con `updateMany`, uso único), `firmarComprobante` / `comprobanteValido` (jose, HS256, `aud` `homia-verificacion`, 30 min), `disponibilidad()`, `ipCliente()`. Claves derivadas de `AUTH_SECRET` con HMAC (`homia:codigos-verificacion`, `homia:comprobante-verificacion`) |
| `src/components/app/selector-pais-celular.tsx` | `SelectorPaisCelular` (`<select>` nativo con la lista de `paisesCelular`, `data-track="elegir país del celular"`, clases ajustables para combinar con cada pantalla) y `AvisoCelular` ("Se guardará como …" o el motivo, en vivo) |
| `src/lib/email.ts` | `EmailContent.codigo`: bloque grande en monoespaciada en el HTML y `Código: …` en el texto |
| `src/app/api/auth/verificacion/route.ts` | `GET`: `disponible.email` + estado de la cuenta (email verificado o no; celular estandarizado, sin estado) |
| `src/app/api/auth/verificacion/enviar/route.ts` | `POST` (zod, `canal: 'email'`; `celular` → 400) |
| `src/app/api/auth/verificacion/comprobar/route.ts` | `POST` (zod, `canal: 'email'`) |
| `src/app/api/auth/register/route.ts` | Reescrito con `parseBody` + zod (antes `body<T>()` sin zod) y validación completa que devuelve todos los errores juntos; usuario y perfiles en un solo `user.create` anidado (P2002 → 409) |
| `src/app/api/profiles/me/route.ts` | Celular estandarizado con `phoneCountry` opcional (zod `refine(esPaisCelular)`, AR por defecto) |
| `src/lib/account-deletion.ts` | La baja borra `phoneE164`, las verificaciones y los `VerificationCode` del usuario |
| `src/components/screens/auth-register.tsx` | Registro en 4 pasos (Perfil, Tus datos, Confirmar email, Tu cuenta) con errores por campo, sugerencia de dominio, país del celular (`SelectorPaisCelular`, AR por defecto, placeholder por país), "Se guardará como …" en vivo, doble tipeo sin pegar, `irA()` lleva la ventana arriba (`window.scrollTo({ top: 0 })`), `InputOTP` (`autocomplete=one-time-code`), cuenta regresiva de reenvío; el DNI opcional se sube con `subirImagen` (`src/lib/upload-image.ts`) y muestra su error tal cual |
| `src/components/app/verificacion-contacto-card.tsx` | Tarjeta "Email y celular" en Mi perfil de los tres roles: email con Verificado / Sin verificar y "Verificar ahora"; celular estandarizado sin insignia |
| `src/components/screens/panel/{cliente,profesional}/perfil.tsx` | Selector de país + `AvisoCelular` junto al celular; país inicial con `paisDeCelular(phoneE164 \|\| phone)`; mandan `phoneCountry`. El proveedor no edita el celular en su perfil |
| `src/components/app/auth-shell.tsx` | Shell de Crear cuenta, Ingresar, Recuperar y Restablecer: el `aside` de marca es `lg:sticky lg:top-0 lg:h-screen lg:self-start` (fijo a la altura de la pantalla; antes crecía con el formulario y su `justify-between` bajaba el titular al pasar al paso 2); solo scrollea la ventana con el formulario |

**Pruebas:** `src/lib/__tests__/registro.test.ts` (20: email, 15 celulares argentinos, 7 países con
su país elegido, internacional con `+`/`00` sin importar el país elegido, "Número inválido para
Uruguay/España", doble tipeo por país, lista de países, `esPaisCelular`/`paisDeCelular`/
`ejemploCelular`, formato; nombres, CUIT, DNI/CUIL) y `src/lib/__tests__/verificacion.test.ts`
(código, HMAC, estados, espera, topes, mail del código). Sección A de `e2e-integral.mjs`: alta de
los tres roles con el código leído del mail (`--mail-sink`), faltantes → 400 con `faltan`, celular
raro normalizado, país inválido (`XX`, `uy`) → 400, número inválido para Uruguay/España → 400 con
mensaje, Uruguay escrito como allá y repetido con `+598`, `+34` con país AR, alta real con celular
de Uruguay, perfil con EE.UU. y España, canal `celular` → 400, email inválido, comprobante ajeno,
sin enumeración, código correcto/incorrecto/usado/vencido/agotado, reenvío con espera, tope por
hora, verificación desde la cuenta; helper `registrar()` usado por todas las secciones. Sin `--mail-sink`, el helper arma el
código por la base (HMAC con el `AUTH_SECRET` del `.env`, solo para `@homia.test`).

### 4.15 Métricas de uso y panel del administrador (D27, migración `0036`, 25/09/2026)

- **D32 (25/09/2026):** `src/lib/analytics/filtro.ts` (`registroHabilitado`, `esNavegadorAutomatizado`,
  `esEmailDelDueno`; tests en `src/lib/__tests__/analytics-filtro.test.ts`) aplicado en
  `/api/analytics/collect` (antes de escribir; también `getAdminSession()`) y en `registrarEvento`
  (con `esCuentaDelDueno()` cacheado 10 min por instancia). `admin-layout.tsx` marca el navegador del
  admin con `homia_track_off`. Limpieza hecha: cuentas demo (5) con todo lo suyo y todo el uso de
  pruebas (`AnalyticsEvent/Session`, `SearchEvent`, Homy, `AiUsage`, códigos y estados OAuth vencidos),
  con copia previa en `scratch/backup-*.json`.

- **Modelos** (aditivos, sin FK a `User`, como `HomyRun`):
  - `AnalyticsEvent` (`id`, `userId?`, `anonId`, `sessionId`, `role?`, `type`
    page_view|click|submit|dialog|search|error|server, `name`, `path` normalizado, `entityType?`,
    `entityId?`, `props jsonb?`, `device?`, `createdAt`). Índices: (`userId`,`createdAt`),
    (`type`,`createdAt`), (`name`,`createdAt`), (`entityType`,`entityId`), (`sessionId`),
    (`anonId`), (`createdAt`).
  - `AnalyticsSession` (`id` = id aleatorio del navegador, `userId?`, `anonId`, `startedAt`,
    `lastSeenAt`, `activeMs`, `pageViews`, `events`, `entryPath`, `referrer` (solo dominio), `utm
    jsonb`, `device`). Índices: (`userId`,`startedAt`), (`anonId`), (`startedAt`).
  - `props`/`utm` son **jsonb** (a diferencia de la convención "JSON como string"): hay que
    agregarlos y filtrarlos en SQL (`props->>'resultados' = '0'`).
  - `SearchEvent` (tabla vieja) no tenía escrituras en el código: las búsquedas se registran ahora
    como `AnalyticsEvent type=search` (término, pantalla, resultados, filtros) y `SearchEvent` queda
    como histórico (sin duplicar).
- **Migración** `supabase/migrations/0036_metricas.sql`: `migrate diff` (el diff traía solo estas
  tablas: 0032–0035 ya estaban aplicadas) + `IF NOT EXISTS` + RLS; aplicada con `prisma db
  execute` el 25/09/2026; diff posterior vacío. Vuelta atrás: `DROP TABLE` de las dos.
- **Recolección** `POST /api/analytics/collect` (`src/app/api/analytics/collect/route.ts`):
  público; `content-length`/texto > 48 KB → 413; JSON roto → 400; zod estricto
  (`src/lib/analytics/schema.ts`: 1–50 eventos, tipos permitidos sin `server`, `path` que empieza
  con `/`, `props` plano ≤ 12 claves y ≤ 1000 caracteres, sin `userId` en ningún lado) → 400;
  tope en memoria 30 lotes/min por `anonId` y 240/min por IP → 429 sin cuerpo. El usuario sale de
  `getSessionUserIdFromCookie()` (solo el JWT, **sin consulta**) y `guardarLote()`
  (`src/lib/analytics/server.ts`) hace **UNA consulta** con CTEs: confirma que la cuenta existe y
  no está eliminada, inserta los eventos con `jsonb_to_recordset` (los latidos no son filas: suman
  a `activeMs`, tope 35 s c/u y 10 min por lote), upsert de la sesión (solo si el `anonId`
  coincide: nadie suma a una sesión ajena) y vincula al usuario los eventos/sesiones anónimos de
  ese `anonId`. `createdAt` del cliente acotado a las últimas 24 h. Respuesta 204.
- **Eventos de servidor** `registrarEvento(req, {...})`: se escriben con `after()` de
  `next/server` (después de responder; fuera de un request, en el acto) y nunca tiran. Leen la
  cookie `homia_anon_id=<anonId>.<sessionId>` y guardan `ipHash` (`hashSeguro` de
  `src/lib/homy/cupo.ts`). Puntos: `auth/login` (`login_ok` con vinculación y `login_fallido` sin
  email ni userId), `auth/logout`, `auth/register` (`registro` con vinculación), `provider/plan`
  (`plan_solicitado`), `payments/webhook` (`plan_activado`, `plan_degradado`), `cron/subscriptions`
  (`plan_degradado`), `invoices/[id]/pdf` (`factura_pdf`). Una línea cada uno.
- **Tracker** `src/lib/analytics/tracker.ts` (reglas puras en `core.ts`): se monta una vez con
  `<AnalyticsTracker />` (`src/components/app/analytics-tracker.tsx`) en `AppRoot` y en la home
  estática (`landing.tsx`). Cola en memoria (máx. 200), lote cada 10 s o 20 eventos, `sendBeacon`
  al ocultar/cerrar la pestaña, `fetch keepalive` si no hay beacon, reintento único ante 5xx/red,
  todo en `try/catch`. Escucha: `hashchange`, `popstate`, `pushState/replaceState` envueltos, clic
  y `submit` en captura (pasivos), `pointerdown/keydown/scroll/touchstart` (solo la hora, nunca la
  tecla), `visibilitychange`, `pagehide`, `error`, `unhandledrejection`, un `MutationObserver`
  sobre los hijos directos de `<body>` (diálogos en portal) y envuelve `window.fetch` para anotar
  `MÉTODO /api/ruta` + estado de las llamadas que modifican (el cuerpo nunca se lee).
  `trackBusqueda()` en `search-screen`, `directory-screen` y `marketplace-screen`.
  `reiniciarVisitante()` al cerrar sesión (`store.ts`).
- **Panel** `/admin/metricas` (`src/components/screens/panel/admin-metricas.tsx`, dentro del área
  `/admin` de §4.16): APIs `GET /api/admin/metricas`
  (`?seccion=usuarios|uso|embudos|retencion|negocio&periodo=hoy|7|30|90|rango&desde&hasta&prueba=incluir&csv=<tabla>`),
  `GET /api/admin/metricas/usuario` (`q` o `id`, `csv=linea|sesiones`) y `GET
  /api/admin/metricas/activo` (`tipo`, `id`, `csv=linea`). Acceso con `requireAdmin()` de
  `src/lib/admin.ts` (cookie `homia_admin`, §4.16): sin ella 404. Cálculo en
  `src/lib/analytics/metricas.ts`: CTEs comunes `p` (período en UTC), `excl` (cuentas
  `@homia.test` si se excluyen) y `xa` (navegadores de esas cuentas); fechas agrupadas en hora de
  Argentina; cada sección 1–13 consultas en paralelo. CSV con `aCsv` (`;`, BOM, anti-fórmulas).
- **Rendimiento:** el tracker no hace nada síncrono pesado (el clic lee `textContent` recortado);
  la recolección es 1 consulta por lote (≈ 1 lote cada 10–30 s por pestaña activa). Medido en
  §9 (D27).
- **Retención:** `purgarEventosViejos()` (eventos > 396 días, 50.000 por corrida) al final del cron
  diario `/api/cron/subscriptions` (devuelve `metricasPurgadas`). Sesiones sin vencimiento. La baja
  de cuenta (`account-deletion.ts`) borra eventos y sesiones del usuario.
- **Privacidad:** Política de Privacidad `LEGAL_VERSION = '2026-09-25'` (§2 fila "Uso de la
  plataforma", §3, §9 `homia_anon_id` y `homia_ses_v1`, §11 plazos, §12 baja).

### 4.16 Área `/admin` con ingreso propio por variables de entorno (D29, 25/09/2026)

- **Archivos:** `src/lib/admin-core.ts` (puro, testeado: `credencialesAdmin`, `verificarCredenciales`
  con `timingSafeEqual` sobre sha256 de ambos lados y comparando siempre email y contraseña,
  `firmarTokenAdmin`/`verificarTokenAdmin` con `jose` — HS256, `AUTH_SECRET`, `sub: 'admin'`,
  audiencia `homia-admin`, 12 h —, `crearLimitadorFallos` 5/IP/15 min); `src/lib/admin.ts`
  (`server-only`: `getAdminSession()`, `requireAdmin()` → 404, `crearSesionAdmin()` cookie
  `homia_admin` httpOnly + `SameSite=Strict` + `Secure` si `x-forwarded-proto=https` + `path=/`
  + 12 h, `cerrarSesionAdmin()`); `src/lib/admin-rutas.ts` (rutas y `rutaAdminNueva` para las
  redirecciones, sin dependencias de servidor).
- **APIs:** `POST/GET /api/admin/login` (zod; 503 `needsConfig` sin variables; 401 genérico; 429;
  eventos `admin_login_ok`/`admin_login_fallido`), `POST /api/admin/logout` (`admin_logout`).
  `requireAdmin()` en `/api/admin/feedback`, `/api/admin/feedback/[id]`, `/api/admin/metricas`,
  `/api/admin/metricas/usuario`, `/api/admin/metricas/activo`; `GET /api/feedback/[id]` acepta la
  sesión de admin. Se quitaron `esAdmin`/`emailsAdmin` de `src/lib/feedback.ts`, el 409 de email
  reservado en `auth/register` y en `verificacion-server.ts` (códigos), e `isAdmin` de `/me` nunca
  se agregó. `LINK_BANDEJA = '/admin/sugerencias'` (mail al equipo). La respuesta al autor va
  firmada "Equipo HomIA".
- **SPA:** rama `s[0] === 'admin'` en `app-root.tsx` → `AdminLayout`
  (`src/components/screens/admin/admin-layout.tsx`): consulta `GET /api/admin/login`; sin sesión
  muestra el formulario "Administración HomIA"; con sesión, barra fija (marca, "Administración",
  **Salir**) + menú Métricas/Sugerencias y el contenido en `#homy-app-main`; `/admin` → `replace`
  a `/admin/metricas`. `/panel/admin/*` → `Redirigir` (con la query). Sin accesos en los paneles
  de usuario.
- **Rate limit real:** el contador es en memoria por instancia; en Vercel Firewall sumar una regla
  para `/api/admin/login` (p. ej. 10 pedidos cada 15 min por IP), como la de login.
- **Pruebas:** `src/lib/__tests__/admin.test.ts` (5, sin red: variables faltantes → no
  configurado, mayúsculas/espacios, contraseña exacta, largos distintos, token vencido/otro
  secreto/JWT de usuario/`sub admin` sin audiencia, limitador, rutas viejas). E2E sección T
  (admin) y S (bandeja) con las credenciales del `.env` leídas de `process.env`, nunca impresas.

### 4.17 Ingresos de HomIA: cobros de suscripción y cargo 1% (D30, migración `0037`, 25/09/2026)

- **Modelos** (aditivos, sin FK al proveedor: el registro contable sobrevive a la baja de la cuenta):
  `SubscriptionCharge` (`providerId`, `userId?`, `providerName`, `plan`, `mpPreapprovalId`,
  `mpPaymentId` **único**, `mpAuthorizedPaymentId?`, `mpEnvironment` live|test, `status`,
  `statusDetail?`, `amount`, `currency`, `refundedAmount`, `netAmount?`, `mpFee?`, `periodStart?`,
  `attemptedAt`, `paidAt?`, `source` webhook|cron|backfill, `raw` jsonb mínimo sin tarjeta ni
  pagador) y `SubscriptionEvent` (`type` activada|reactivada|cambio_plan|cancelada|pausada|impago|
  reemplazada, `fromPlan/toPlan`, `mpPreapprovalId`, `motivo`, `source`, `dedupeKey` **único**:
  `act:<pre>`, `baja:<pre>`, `reemp:<pre>`, `occurredAt`). `Payment` suma `mpApplicationFee` y
  `mpApprovedAt` (lo que MP informa del `application_fee` y `date_approved`; `getPayment()` los lee
  con `applicationFeeDe()`).
- **Archivos:** `src/lib/suscripciones-core.ts` (puro: `cobroDesdeMp`, `clasificarCuenta`,
  `calcularMrr`, `armarSerie`, `armarMensual`, `procesarAvisoCobro` con dependencias inyectadas);
  `src/lib/suscripciones-mp.ts` (sin imports de Next, lo importa también el backfill: `traerFactura`,
  `traerPago`, `guardarCobro` upsert, `procesarAvisoSuscripcion`, `registrarCobroPorPago`,
  `registrarActivacion`, `registrarBaja`, `registrarEventoPlan`, `sincronizarCobros`,
  `traerPreapproval`); `src/lib/ingresos-admin.ts` (`server-only`: `calcularIngresos`,
  `fichaProveedor`; el 1% sale de `cargoServicioRecaudado` de `src/lib/ingresos.ts`, compartida con
  Métricas); APIs `src/app/api/admin/ingresos/route.ts` y `.../proveedor/route.ts`
  (`requireAdmin()`, zod, CSV con `aCsv`); pantalla `src/components/screens/admin/admin-ingresos.tsx`
  (gráficos SVG propios, sin recharts); menú en `admin-layout.tsx`, ruta en `app-root.tsx`,
  `RUTA_ADMIN_INGRESOS` en `admin-rutas.ts`.
- **API de MP usada (solo lectura, tokens del servidor):** `GET /authorized_payments/{id}`,
  `GET /authorized_payments/search?preapproval_id=&limit=12&offset=` (**el máximo de `limit` es 12**:
  con 20, 50 o 100 responde 400 "Invalid value for limit", medido el 25/09/2026),
  `GET /v1/payments/{id}`, `GET /preapproval/search?limit=100&offset=`, `GET /preapproval/{id}`.
  Primero con `MP_SUB_ACCESS_TOKEN` (o `MP_ACCESS_TOKEN`), si da 404 con `MP_SUB_TEST_ACCESS_TOKEN`
  (`mpEnvironment = test`: **los pagos de usuarios de prueba vienen con `live_mode: true`**, el
  entorno se deduce del token que los encontró). `MP_API_BASE_PRUEBAS` apunta a un doble **solo
  fuera de producción** (E2E).
- **Webhook:** tópico nuevo `subscription_authorized_payment` → `procesarAvisoSuscripcion` (503 si
  MP no responde o no se pudo guardar); `payment` con `external_reference` `plan:provider:…` →
  `registrarCobroPorPago`; `subscription_preapproval` registra `act:`/`reemp:`/`baja:` **antes** del
  update del perfil (si el update falla, el reintento no duplica el evento). Firma no bloqueante como
  el resto.
- **Cron** `/api/cron/subscriptions`: `registrarBaja` antes de degradar y
  `sincronizarCobros({ fuente: 'cron', reconstruirEventos: true, entornos: ['live'] })`; devuelve
  `cobros: { nuevos, actualizados, errores }`; si falla, lo loguea y el cron sigue.
- **Backfill:** `node scripts/pagos/backfill-suscripciones.mjs --dry-run` (simula, informa también
  el entorno de prueba); sin `--dry-run` guarda **solo producción** (`--incluir-prueba` para sumar
  prueba). Idempotente. **Escribe en producción:** pedir OK.
- **Pantalla:** el estado de cada suscripción se consulta a MP en vivo (4 en paralelo, caché de 5 min
  por instancia); si MP no responde, la fila dice "sin respuesta de MP" y el pie lo cuenta.
- **Migración `0037_ingresos_homia.sql`:** 2 columnas NULL en `Payment` + 2 tablas + índices + RLS;
  aplicada el 25/09/2026 con `prisma db execute`; `migrate diff` posterior: vacío.

### 4.18 Integración del 25/09/2026 y numeración de comprobantes

- **Integración:** los equipos de calendario (D23), finanzas (D24), sugerencias (D25), registro (D26),
  métricas (D27), `/admin` (D29) e ingresos (D30) se juntaron en `feat/horas-y-logo` con `main`
  (`6e5be1c` fotos y catálogo, `d2ed310` categorías D28). Finales de línea igualados a `HEAD` en los
  archivos que los equipos habían convertido. El área `/admin` no muestra el tour ni el Homy
  flotante (`app-root.tsx`: tapaba los gráficos y no es un área de usuarios).
- **Numeración:** `src/lib/numeracion.ts` (`prefijoAnual`, `ultimoNumero`, `formatearNumero`) reemplaza
  `count()+1` en `createWithOrderNumber` y el cobro dentro del pedido (`orders.ts`),
  `createWithChargeNumber` (`charge-number.ts`) y la factura (`projects/[id]/invoice`). Busca el mayor
  `number` con `startsWith '<SERIE>-<año>-'` y `orderBy desc` (los números van con 6 dígitos, el orden
  alfabético es el numérico). Causa: con `count()` un borrado dejaba el conteo por debajo del último
  número y los 6 intentos chocaban con el `@unique` → 503 (aparecía en las suites E2E que purgan en
  la base única mientras otra crea pedidos). Las facturas demo con formato `A-0001-…` no entran en la
  serie `HOM-`. Tests: `src/lib/__tests__/numeracion.test.ts` (4).

- **25/09/2026 (Leonardo):** vuelve el eslogan "Tu hogar, en buenas manos" en `hero.tsx`,
  `layout.tsx` (title/OG/Twitter) y `og-card.tsx`; `proveedor/perfil.tsx` suma `SelectorPaisCelular` +
  "Celular de contacto" (`phone` + `phoneCountry` en el mismo `PUT /api/profiles/me` de los datos del
  negocio).

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
  recordatorio), `0024` (sobrantes con el profesional como vendedor y pata profesional →
  proveedor, §4.2), `0025` (compra directa: `Purchase.availableFrom`, §4.3), `0026` (índice `Conversation.userBId` para la bandeja, §4.5), `0027` (contratar desde un trabajo o
  proyecto: `Project.parentProjectId`, §4.4), `0028` (recuperar contraseña y avisos por mail:
  `PasswordReset` y `User.emailNotifications`, §4.10), `0029` (términos aceptados y baja de cuenta en `User`, §4.9), `0030` (súper agente Homy: cupo y registro), `0031` (fechas del trabajo y calendario del profesional, §4.7) y `0032` (horario de cada día y jornada del profesional, §4.7.1); `0033` (Finanzas: `FinanceEntry`, `FinanceConfig`, `ProviderStock.unitCost`, §4.12); `0034` (Sugerencias: `Feedback`, §4.13); `0035` (registro y verificación: `User.emailVerifiedAt`, `phoneE164`, `phoneVerifiedAt` y `VerificationCode`, §4.14); `0036` (métricas de uso: `AnalyticsEvent` y `AnalyticsSession`, §4.15); `0037` (ingresos de HomIA: `SubscriptionCharge`, `SubscriptionEvent`, `Payment.mpApplicationFee/mpApprovedAt`, §4.17). La numeración salta de 0023 a 0030
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
- Procesa `payment`, `subscription_preapproval` y (D30) `subscription_authorized_payment` (cobro
  mensual de una suscripción, §4.17); el resto responde 200 sin acción.
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
**profesional en facturas** (D14: ahí el profesional es además el vendedor de la devolución) —; si no, el de la plataforma (`returns/[id]/route.ts`, `doRefund`). La pata profesional → proveedor **nunca** llama a Mercado Pago (reembolso por fuera, `reembolsar_fuera`). **El
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
- Bucket **`feedback-evidencias` privado** (D25): `folder=sugerencias` devuelve el path
  `feedback-evidencias/<userId>/sugerencias/...`; las fotos se firman 10 minutos solo para el autor
  y el administrador (`src/lib/feedback-server.ts`, §4.13).
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

- **Crons** (`vercel.json`): `/api/cron/reservations` cada hora (`0 * * * *`; vence los sub-pedidos `aprobado` sin pago — compra 24 h, compra con efectivo 7 días desde la compra, reserva 48 h, D15 —; además corre las tareas de sobrantes de `src/lib/leftovers-cron.ts`: confirmación automática a las 72 h del reembolso en efectivo o por fuera de HomIA y recordatorio único al vendedor —proveedor o profesional— a las 72 h) y
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
| `HIDE_DEMO_USERS` | **Sí al lanzar** (`1` en Vercel Production) | `src/lib/visibility.ts` | Sin la variable o en `0`: las cuentas demo `@homia.test` se ven en lo público (hoy es así). En `1` se ocultan de directorio, búsqueda, mapa, marketplace, comparables, sponsors, perfiles, bolsa y Homy (§4.9). En local va `0` (las pruebas E2E usan `@homia.test`). **No está cargada en Vercel todavía** |
| `NEXT_PUBLIC_LEGAL_RAZON_SOCIAL` / `NEXT_PUBLIC_LEGAL_CUIT` / `NEXT_PUBLIC_LEGAL_DOMICILIO` / `NEXT_PUBLIC_LEGAL_EMAIL` | Para las páginas legales | `legal-screen.tsx` | Sin nombre y email, `/terminos` y `/privacidad` muestran un contacto genérico (§4.8). Se leen en el build: cargarlas y redeployar |
| `NEXT_DIST_DIR` | No (solo desarrollo) | `next.config.ts:4-7` | Carpeta de build alternativa para levantar un segundo `next dev` en la misma carpeta sin pisar `.next` |
| `RESEND_API_KEY` | **Sí para mandar mails** (recuperar contraseña y avisos) | `src/lib/email.ts` | No se manda ningún mail (log `[email] RESEND_API_KEY no está configurada`); "olvidé mi contraseña" responde igual pero el link no llega. **No está cargada todavía** (§4.10, D18) |
| `EMAIL_FROM` | Opcional | `src/lib/email.ts` | Default `HomIA <avisos@vakbot.vakdor.com>`: el dominio verificado hoy en Resend (25/09/2026, prueba de envío entregada). Cuando se verifique `somoshomia.com`, se cambia con esta variable |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Sí para entrar a `/admin` (Métricas y Sugerencias, D29) | `src/lib/admin-core.ts` (`credencialesAdmin`, `verificarCredenciales`) | `POST /api/admin/login` → 503 "El acceso de administración no está configurado"; nadie entra a `/admin` (el registro de uso y las sugerencias de los usuarios siguen igual). Contraseña larga y única; se cambia en Vercel y se redeploya. Reemplazan a `ADMIN_EMAILS` (D25), que ya no se lee |
| `FEEDBACK_EMAIL` | No | `src/lib/feedback.ts` (`casillaEquipo`) | El mail de cada sugerencia nueva va a `TITULAR.email` (business@vakdor.com). En pruebas se pone una `@homia.test` para no ensuciar la casilla real |
| `RESEND_API_URL` | No (solo pruebas locales) | `src/lib/email.ts` | Se ignora en producción. Apunta el envío a un doble de Resend (`e2e-integral.mjs --mail-sink`) |
| `MP_API_BASE_PRUEBAS` | No (solo pruebas locales) | `src/lib/suscripciones-mp.ts` | Se ignora en producción. Apunta las consultas de cobros de suscripción a un doble de la API de MP (`e2e-integral.mjs --mp-double`) |

| `SUPABASE_PROJECT_URL` / `SUPABASE_SERVICE_ROLE` | Para subidas | `uploads/route.ts:44-45`, `dni-ai.ts`, `leftovers.ts:13` | Subidas 503; fotos de terceros rechazadas |
| `SUPABASE_API_URL` / `NEXT_PUBLIC_SUPABASE_URL` | No | `leftovers.ts:13` (alternativas) | — |

`.env*` está en `.gitignore`; `.env.example` sí está versionado.

---

## 8. Seguridad

- **Autorización por dueño (anti-IDOR):** el dueño siempre sale de la sesión (`getSessionUser`),
  nunca del body. Cada recurso chequea que el usuario sea parte: proyecto (`projects/[id]/route.ts:51-53`),
  material del proyecto (`materials/route.ts:186`: el material tiene que pertenecer a ESE proyecto),
  factura (`invoices/[id]/route.ts:25-28`), cobro (`charges/[id]/route.ts:25-27`), compra
  (`purchases/[id]/route.ts:48-50`), devolución (`returns/[id]/route.ts`: solo solicitante y vendedor según `sellerKind`), conversación
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
- **Contraseñas:** mínimo 8 caracteres, letras y números (`src/lib/password-policy.ts`, usada por el registro y el cambio de contraseña).
- **Registro y códigos (D26, §4.14):** zod en `auth/register` y `auth/verificacion/*`; sin
  enumeración de cuentas (misma respuesta y código señuelo); códigos HMAC-SHA256 con clave del
  servidor, comparación en tiempo constante, 5 intentos atómicos, uso único, 10 min, reenvío 60 s,
  5 por hora por destino y 30 por hora por IP **en la base** (sirve con varias instancias de
  Vercel); comprobante con clave derivada distinta de la de sesión.
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
| `src/lib/__tests__/email.test.ts` | Mails y tokens (D18): payload a Resend (Bearer, from, to, asunto, HTML con marca y botón, texto plano, pie), escape de HTML, sin clave → `no_configurado` sin red, error 4xx/red sin tirar, dominios `.test` nunca a Resend real, `linkAbsoluto`, token 32 bytes + sha256 + estados, política de contraseña (10 tests, sin red ni base) | `node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/email.test.ts` | No escribe nada |
| `src/lib/__tests__/schedule.test.ts` | Fechas del trabajo (D21) y horarios (D23): máquina de estados con franja, validación de días y de franja, hoy en hora argentina, día al mediodía UTC, choque de franjas (ejemplos de Leonardo, bordes, día completo, varios días), bloquea vs. avisa, estado del día con la jornada 06–18 y con jornada propia, unión de franjas y huecos, próximo día con lugar, textos con horario (19 tests, sin base) | `node --test --import ./scripts/homy-test-alias.mjs src/lib/__tests__/schedule.test.ts` | No escribe nada |
| `src/lib/finanzas/__tests__/calculos.test.ts` | Finanzas (D24), 20 tests a mano: plomero con 3 obras renglón por renglón, retiros que no son gasto, caja cobrada vs. facturada, caja que cierra con saldo inicial a mitad de período, rentabilidad por obra, días de cobro, vencidas y recurrentes, punto de equilibrio, recurrentes proyectados/terminados (31 → fin de mes), amortización, préstamo capital/interés, devoluciones y reintegros, balance que cierra y concilia con aportes − retiros + resultado, ferretería con costo cargado/estimado/sin dato y ventas de mostrador, bordes sin NaN, compras personales, lista del período, períodos, contenido; regresión de la madrugada (lo de hoy guardado al mediodía) vista roja con el bug y verde con el arreglo | `node --test --import ./scripts/homy-test-alias.mjs src/lib/finanzas/__tests__/calculos.test.ts` | No escribe nada |
| `scripts/e2e-integral.mjs` sección **R** (Finanzas) | Automáticos = base con las mismas reglas (facturado, cobrado, por cobrar, mano de obra, devoluciones, compras; ventas, cobrado, devoluciones, costo de lo vendido e inventario del proveedor), deltas exactos de gasto/ingreso pendiente/inversión/retiro/préstamo/cuota, recurrente 3 → terminado 2, edición, validaciones, 401/403/400, IDOR 404/403, saldo inicial, compra personal, baja lógica, compra de mercadería, CSV (BOM, `;`, `1.234,56`). Corrida completa 25/09: **R 97/98** (la falla era de la prueba, corregida después, sin re-correr completa); tiempo del resumen en dev local 1,7-2,1 s | `E2E_EMAIL_PREFIX=e2e-fin- node scripts/e2e-integral.mjs --base …` (R usa datos de B, D, E, F, G, P: correr completa) | Escribe en producción; purga verificada con `financeEntries`, `financeConfigs` y `financeOrphans` en 0 |
| `src/lib/homy/__tests__/loop.test.ts` | Pruebas unitarias del loop, guardarraíles, ranking y cupo, sin base ni OpenAI (19 según el equipo) | `node --test --import ./scripts/homy-test-alias.mjs src/lib/homy/__tests__/*.test.ts` (el alias resuelve `@/…`) | No escribe nada |

Build: `npm run build` (tipos estrictos). Lint: `npm run lint`.

**D27/D29 (25/09/2026):** unitarias `src/lib/__tests__/analytics.test.ts` (14: rutas normalizadas,
activos, etiquetas sin datos personales, búsqueda y utm limpias, tiempo activo con latidos, sesión
de 30 min, embudos, cohortes, CSV, zod del lote) y `admin.test.ts` (5); mutaciones verificadas
(quitar la audiencia del token de admin y usar el texto largo como etiqueta ponen la prueba en rojo).
Sección **T** de `e2e-integral.mjs` (`E2E_EMAIL_PREFIX=e2e-met-`, credenciales de admin del `.env`):
collect válido/inválido/413/429, usuario de la cookie, vinculación al ingresar, eventos de servidor,
ingreso de admin (401 genérico, 429, cookie, logout, JWT de usuario rechazado), cifras de negocio
contra la base, búsquedas sin resultado, CSV y fichas: **94/94**; A 151/151. Recorrido visual
(`scratchpad/pw/metricas-visual.mjs` + `scratch/e2e-metricas/verificar-visual.mjs`). La purga borra
`AnalyticsEvent`/`AnalyticsSession` de los usuarios de la suite y todo `anonId` que empieza con `e2e-`.

**D30 (25/09/2026):** unitarias `src/lib/__tests__/ingresos.test.ts` (24: parseo del pago real de
prueba y de la factura de la referencia oficial, comisión/neto sin estimar, estados de cuenta con los
casos borde, MRR, churn/conversión, series, idempotencia y 503 del aviso; mutación verificada: con el
503 cambiado a 200 la prueba se pone roja). Sección **U** de `e2e-integral.mjs` con un doble de la
API de MP (`--mp-double 3172` y el server con `MP_API_BASE_PRUEBAS=http://localhost:3172`): 404 sin
sesión de admin, aviso aprobado/rechazado, idempotencia, 503 con MP caído, estados de cuenta, MRR,
filtros, ficha, exclusión de prueba y CSV: **33/33** (A 108 + 151). La purga borra
`SubscriptionCharge`/`SubscriptionEvent` de los proveedores de la suite y todo `mpPaymentId` que
empieza con `e2e`. Recorrido visual `scratchpad/pw/ingresos-visual.mjs` (390×844 y 1280×800): 38/38.

**D25 (25/09/2026):** sección **S** ("Sugerencias") de `e2e-integral.mjs`: 401 sin sesión, fotos al
bucket privado (sin firma no se ven), alta en los tres roles con y sin fotos, contexto técnico con el
`User-Agent` real, validaciones 400, 403 por panel ajeno, IDOR (404 y sin fotos), bandeja 404 para
no-admin, email de admin reservado (409), filtros y búsqueda, cambio de estado y respuesta →
notificaciones y mails (con `--mail-sink`), sin aviso si no cambió nada, tope 10/día → 429. El admin
se crea directo en la base (su email no se puede registrar). Correr con
`E2E_EMAIL_PREFIX=e2e-sug-` y el server con `ADMIN_EMAILS=e2e-sug-admin@homia.test
FEEDBACK_EMAIL=e2e-sug-equipo@homia.test RESEND_API_KEY=re_test
RESEND_API_URL=http://127.0.0.1:3199/emails`. La purga borra `Feedback` y el bucket
`feedback-evidencias/<userId>/`.

**D19/D20 (24/09/2026):** la sección A de `e2e-integral.mjs` suma aceptación de términos (400
`needsTerms`, `termsVersion` = `LEGAL_VERSION` leído de `legal-content.ts`) y `flowBaja` (usuarios
`<prefijo>bajapro-*` y `bajaprov-*`: 403/400/401/409 con lista, anonimización campo por campo, DNI
fuera de la base y del bucket, historial conservado con "Usuario eliminado", login rechazado y fuera
de directorio/búsqueda/pines/marketplace/perfiles). Las cuentas que la suite elimina quedan con email
`eliminado-<id>@homia.invalid`: sus ids se anotan en `<E2E_OUT>/deleted-users-<prefijo>.json` y la
purga las incluye. La suite **necesita el server con `HIDE_DEMO_USERS` en 0** (sus usuarios son
`@homia.test`); la prueba con el flag prendido es `node scratch/visibilidad-demo.mjs <base> on|off`
(con `on`, levantar el server con `HIDE_DEMO_USERS=1 HOMY_APAGADO=1`).

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
| Carpetas `.next-<puerto>` y Tailwind 4 | Tailwind escanea todo lo que git no ignora: el código compilado de `.next-3101` rompió el CSS ("Unexpected token Delim") y el dev respondió 500 en todas las rutas (24/09/2026) | `/.next-*/` agregado a `.git/info/exclude` (local, no versionado). Si se clona de nuevo, agregarlo a `.gitignore` o al exclude |
| Cantidades fraccionadas en Mercado Pago | MP exige cantidades enteras por ítem | `toMpItems` manda las líneas fraccionadas (2,5 m) como 1 × total de la línea (`mercadopago.ts:75-86`) |
| Consultar un pago cobrado por el vendedor con el token de HomIA | MP responde 404: el pago no se acreditaba | La `notification_url` lleva `?ref=<tipo>:<id>` y el webhook consulta con el token del vendedor |
| Heredocs en Windows (Git Bash/PowerShell) | Mensajes de commit o archivos con `$`, backticks o comillas se rompen | Escribir el texto a un archivo y usar `git commit -F archivo`; en PowerShell here-string `@'…'@` con cierre en columna 0 |
| `reason` de la preapproval > 60 caracteres | MP rechaza la suscripción y la API responde 503 "Mercado Pago no respondió" | Mantener `reason` ≤ 60 (`mercadopago.ts:226-229`; commit `55b5e3a`) |
| `back_urls` con `#` | MP descarta el fragmento al volver: el usuario cae en la home | URLs sin `#` (`/panel/...`); la SPA convierte pathname → hash (`app-root.tsx:78-84`) |
| Muchos logins seguidos (pruebas) | El rate-limit (memoria o Firewall de Vercel) bloquea la IP con 429 | Espaciar pruebas; el E2E usa una IP ficticia por corrida (`e2e-integral.mjs:51`) |
| Avisos de MP sin firma de la app | Si se rechazan, se pierden pagos reales | Se loguean y se procesan re-consultando a MP (§6.1) |
| Pago o suscripción en el "otro" entorno | Un aviso sin `live_mode` se buscaba solo en producción | Fallback prueba ↔ producción en el webhook |
| Contar solo requests y no consultas | Con el pooler (`pgbouncer=true`) cada operación de Prisma son ~4 sentencias (`BEGIN`/`DEALLOCATE ALL`/consulta/`COMMIT`) y con `connection_limit=1` los requests simultáneos se encolan | En rutas calientes, una sola consulta (`$queryRaw` o `$transaction([...])`); nunca `include` con `take` anidado para "el último" (Prisma trae todo y corta en memoria) (§4.5) |
| Links a secciones de la home (`#como-funciona`) desde otra pantalla de la SPA | Cambiar el hash a `#como-funciona` hace que la SPA lo lea como la ruta `como-funciona` → "Esta página no existe" | Header y footer usan `irASeccionHome(id)` (`router.tsx`): scroll si la sección está, si no `navigate('/')` y scroll cuando aparece |
| Cambiar solo el hash estando en la home estática | `/` no monta la SPA: la URL cambia a `#/directorio` y la home queda en pantalla | `SpaRedirect` escucha `hashchange`; `AppRoot` desmarca `spaMounted` al desmontarse (§2) |
| Escribir desde local | Local = producción | Todo lo que escribe necesita OK de Leonardo; probar con cuentas demo y borrar lo creado |
