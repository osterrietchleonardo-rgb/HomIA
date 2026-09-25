# AGENTS.md — Contexto del proyecto HomIA

> **Leé esto completo antes de tocar código.** Este documento es la fuente de verdad del
> producto y de la arquitectura. Fue escrito para que cualquier asistente de IA
> (Claude Code, Google Antigravity, Cursor) continúe el desarrollo SIN romper nada.
>
> El detalle vive en `docs/` (ver `docs/README.md`): **funcional** por rol
> (`docs/compartible/estandarizada/FUNCIONAL-HOMIA.md`), **lógica** de negocio y endpoints
> (`docs/interno/LOGICA-HOMIA.md`), **técnico** (`docs/interno/TECNICO-HOMIA.md`), decisiones
> (`docs/interno/decisiones.md`) y bitácora (`docs/interno/bitacora-sesiones.md`, primera lectura de
> cada sesión). **Regla de los tres documentos:** todo cambio o decisión actualiza funcional, lógica
> y técnico en la misma rama, antes de mergear.

---

## 1. Qué es HomIA

Ecosistema digital de servicios del hogar para Argentina, **freemium, 3 roles**:

| Rol | Qué hace | Monetización |
|---|---|---|
| **Cliente** | Busca profesionales (directorio), publica trabajos, contrata (asistente "Contratar"), compra materiales (carrito multiproveedor), paga facturas y pedidos, deja reseñas | Gratis. Si paga con Mercado Pago, paga un **cargo de servicio HomIA del 1%** sumado a su total (en efectivo no hay cargo) |
| **Profesional** | Ofrece servicios, oferta en trabajos (bids), ejecuta proyectos, factura y cobra en **su** cuenta de Mercado Pago (OAuth) o en efectivo; también compra materiales | Gratis (la suscripción PRO de profesionales es legado: responde 403) |
| **Proveedor** | Vende materiales (stock propio sobre catálogo maestro), aprueba y entrega su parte de cada pedido, cobra en **su** cuenta de Mercado Pago (OAuth) o efectivo, acepta devoluciones de sobrantes | **Suscripción mensual en pesos: Básico $50.000 (usar la app completa) o PRO $100.000 (Básico + logo y marca en la home, tarjeta "Recomendado" en marketplace y directorio, analítica de demanda). Trial 14 días.** |

Principios no negociables:
- **100% funcional, cero mock data.** Si algo no está disponible (ej. vendedor sin Mercado Pago conectado), la UI lo dice con un mensaje honesto, nunca inventa datos.
- **Sin escrow ni retención de pago.** El cliente paga al finalizar (facturas de proyecto) o al retirar (pedidos), con Mercado Pago o efectivo. La plata va a la cuenta del vendedor. No existen visitas agendadas por IA. El copy de la home, la ayuda y los prompts tienen que decir exactamente eso.
- **Mobile-first**: la mayoría usa desde el celu. Viewport de referencia 390×844. Todo se verifica en móvil primero.
- **Español rioplatense** en TODA la UI y en los prompts de IA (voseo: "buscá", "contratá").
- **Fallback honesto**: si la IA no responde, hay respuesta de respaldo con datos reales; nunca contenido inventado.

## 2. Stack

- **Next.js 16 App Router** (React 19, TypeScript) como SPA por hash: `src/app/page.tsx` sirve la landing en `/`; todo lo demás entra por `src/app/[...slug]/page.tsx` → `AppRoot`. Las rutas viven en `src/components/app/app-root.tsx` (registro central) + `src/lib/router.tsx` (`navigate()`).
- **Tailwind 4 + shadcn/ui** (Radix). Iconos `lucide-react`.
- **Prisma 6 + Postgres (Supabase)** en todos los entornos: `DATABASE_URL` (pooler 6543) + `DIRECT_URL` (5432). **Una sola base = producción** (local, Preview y Producción usan la misma). Sin `prisma/migrations`: los cambios de schema se aplican con `prisma migrate diff --script` revisado + `prisma db execute` (copia en `supabase/migrations/`), con OK del dueño. **Nunca `prisma db push`** contra la base.
- **Auth propia**: bcryptjs + JWT httpOnly cookie (`SameSite=Lax`, `Secure` auto si HTTPS). Secret en `AUTH_SECRET` (fail-fast en producción). Helpers: `src/lib/auth.ts` (`getSessionUser`), `src/lib/api.ts` (`fail`, `ok`, `parseBody` con zod).
- **PDF**: `pdf-lib` para facturas (`/api/invoices/[id]/pdf`, incluye el cargo de servicio si se pagó por MP).
- **Mapas**: leaflet + react-leaflet (radio de búsqueda del buscador).
- **Archivos**: toda subida de fotos desde el navegador pasa por `subirImagen()` de `src/lib/upload-image.ts` (achica a 2000 px — DNI 2600 — y comprime < 3,5 MB en el navegador: Vercel corta pedidos > 4,5 MB; respeta EXIF; mensajes claros por motivo). Nunca `fetch('/api/uploads')` directo. Supabase Storage vía `POST /api/uploads`. Bucket `homia-uploads` (público: obras, reseñas, avatares, logos, sobrantes) y `dni-docs` (privado: DNI, signed URLs de 10 min solo al dueño).
- **IA** (ver §9): `src/lib/ai.ts` (Chat Completions, `gpt-5.4-mini`) para DNI y catálogo; `src/lib/homy/openai.ts` (Responses API, `gpt-5.6-luna`) para el súper agente Homy.
- **Pagos**: `mercadopago` SDK con DOS apps de la misma cuenta: "Checkout Pro" (`MP_ACCESS_TOKEN`, `MP_CLIENT_ID/SECRET`: OAuth de vendedores, pagos históricos, refunds de la plataforma) y "Suscripciones" (`MP_SUB_ACCESS_TOKEN`: preapprovals del plan). **Todas las preferencias de pago se crean con el token OAuth del vendedor** (`createSellerPreference`): compras y cobros → proveedor; facturas → profesional; el cargo de servicio 1% va como `marketplace_fee`. Sin OAuth del vendedor solo hay efectivo (503 `needsConfig`). Webhook único `POST /api/payments/webhook`: firma HMAC **no bloqueante** (`MP_WEBHOOK_SECRET`, `MP_SUB_WEBHOOK_SECRET`), pista `?ref=<tipo>:<id>` para consultar el pago con el token del vendedor, valida moneda y monto (subtotal + cargo ±1), idempotente por `Payment.mpPaymentId`, guarda `Payment.collector`, busca en el otro entorno (prueba ↔ producción) si no encuentra el pago. **Ingresos de HomIA (D30):** las suscripciones y el 1% llegan a la cuenta de MP de HomIA (la misma de las dos apps); cada cobro mensual de suscripción se registra en `SubscriptionCharge` (tópico `subscription_authorized_payment` + `payment` con `plan:provider:…`, 503 si no se pudo guardar, idempotente por `mpPaymentId`) y se reconcilia en el cron diario; backfill en `scripts/pagos/backfill-suscripciones.mjs` (`--dry-run`).

## 3. Estructura del código

```
src/
  app/
    page.tsx           # landing pública (/)
    [...slug]/page.tsx # catch-all → AppRoot (la SPA)
    api/…              # 64 endpoints (route.ts) + api/[...slug] (404 JSON) — mapa en §6
  components/
    app/
      app-root.tsx     # ★ registro central de rutas SPA (router cliente)
      mp-fee.tsx       # desglose "Cargo de servicio HomIA (1%)" / aviso sin MP
      mp-connect-card.tsx # "Cobrá con tu Mercado Pago" (proveedor y profesional)
    cart/              # botón y contenido del carrito
    homy/              # conversación, tarjetas, store y mascota de Homy
    screens/           # una pantalla por feature (mobile-first, .homy-page); panel/{cliente,profesional,proveedor}/, panel/pedidos, panel/pedido-detalle, panel/finanzas (D24, profesional y proveedor), cart-screen
    help/help-dock.tsx # ★ único botón flotante del panel: vistas "Homy" y "Guías y tour"
  lib/
    router.tsx         # navigate(), useRoute()
    db.ts              # PrismaClient singleton (export db)
    auth.ts            # getSessionUser, JWT, fail-fast AUTH_SECRET
    api.ts             # helpers fail/ok, parseBody (zod)
    ai.ts              # cliente IA Chat Completions (DNI y catálogo)
    homy/              # ★ súper agente Homy: openai, loop, herramientas, datos, ranking, guardarrailes, rutas, prompt, conocimiento, cupo, respaldo, zonas, tipos, __tests__
    fees.ts            # cargo de servicio 1% (serviceFeeFor, totalWithMp)
    cart.ts cart-server.ts # carrito (visitante en localStorage, cuenta en la base)
    orders.ts order-view.ts # pedidos multiproveedor y su resumen
    seller-pay.ts      # token del vendedor o 503 honesto
    activity.ts        # línea de tiempo (ActivityEvent)
    units.ts           # paso de cantidad por unidad (1 o 0,5)
    leftovers.ts leftovers-cron.ts # sobrantes y sus tareas de 72 h
    mercadopago.ts plans.ts # pagos, OAuth, suscripciones y planes
    dni-ai.ts          # verificación de DNI con IA (visión)
    search-match.ts    # búsqueda difusa: NFD + lowercase + sin diacríticos + similitud + singular/plural
    analytics/         # métricas de uso (D27): core (reglas puras), schema (zod), tracker (navegador), server (collect + registrarEvento), metricas (SQL del panel)
    admin.ts admin-core.ts admin-rutas.ts # área /admin con ingreso propio (D29): requireAdmin(), cookie homia_admin, rutas y redirecciones
    finanzas/          # D24: conceptos (tipos, categorías, glosario: única fuente), calculos (puro, tests en __tests__), datos (server), servidor (zod + sesión)
supabase/migrations/   # migraciones SQL aplicadas (lista al día en docs/interno/TECNICO-HOMIA.md §5; última de este equipo: 0032)
scripts/               # ver scripts/README.md
  catalogo/            # catálogo maestro (datos + seeder idempotente)
  demo/                # seed demo + assets (DNI, fotos de reseñas)
  base/                # utilidades de la base (RLS)
  e2e/                 # pruebas vivas (sec-audit.sh)
  e2e-integral.mjs     # suite E2E de API (16 secciones A-P)
  e2e-visual.mjs       # recorrido visual Playwright 390×844 y 1280×800
  homy-eval.mjs        # set de evaluación de Homy (32 casos) + homy-eval-casos.json
  homy-test-alias.mjs  # alias @/ para los tests de src/lib/homy/__tests__
  limpieza/            # purgas de usuarios/datos de prueba
  medios/              # generadores de imágenes, videos y favicon
  historico/           # scripts de un solo uso y E2E del sandbox viejo (no se corren)
prisma/schema.prisma   # 40 modelos
docs/                  # funcional, lógica, técnico, decisiones, bitácora (ver docs/README.md)
  historico/           # worklog, contratos y guías viejas (solo consulta)
```

Convenciones de UI (no inventar otras):
- Clases utilitarias del design system: `.homy-page`, `.homy-glass`, `.homy-glass-strong`, `.homy-glass-soft`, `.homy-eyebrow` (glass morphism).
- Layout tipo app-shell (Gmail/Notion): viewport anclado, scroll interno del contenido (`h-screen overflow-hidden` + área scrolleable) en TODOS los listados. En móvil el contenido del panel termina con `pb-44` para que el botón flotante de Homy no tape lo último.
- App móvil 390px: nada se desborda; los números largos (precios) deben reflowear la tarjeta (tarjeta se adapta al número, nunca al revés).
- Header público de la home: desde 1280 px (`xl`) solo Directorio, Materiales, Cómo funciona y Ayuda (el resto en el menú hamburguesa y el footer); por debajo, menú hamburguesa. Textos sin partir.
- Badges de verificación DNI: "verificado" / "en revisión" / "no verificado" — nunca ocultar el estado.
- Mensajería estilo WhatsApp: **el cliente inicia**. Se decide por el destinatario: una conversación nueva solo se abre hacia quien ofrece algo (profesional o proveedor); a un usuario que solo es cliente nadie le escribe primero.
- Todo total que se paga por Mercado Pago muestra el desglose con `MpFeeBreakdown` (subtotal + "Cargo de servicio HomIA (1%)" = total con MP; "En efectivo pagás $X, sin cargo").
- Header del buscador: sticky `top-0`, NO tapa controles del mapa (radio).

## 4. Autenticación y seguridad (implementado y verificado)

- bcrypt (hash) + JWT en cookie httpOnly. `AUTH_SECRET` obligatorio en producción (fail-fast con mensaje claro).
- Recuperar contraseña (D18): `POST /api/auth/password/forgot` (siempre 200, no revela emails, 3 por hora por cuenta) y `GET/POST /api/auth/password/reset` (token de un uso, 1 hora; en la base solo su sha256 en `PasswordReset`; no inicia sesión). Pantallas `/recuperar` y `/restablecer`. El JWT no tiene estado: cambiar la contraseña no cierra otras sesiones.
- El dueño de un recurso siempre sale de la sesión (`getSessionUser`), nunca del body (anti-IDOR). Los tokens OAuth de Mercado Pago nunca salen al navegador: las APIs exponen solo `mpConnected`.
- Cabeceras de seguridad en `next.config.ts`: `nosniff`, `Referrer-Policy`, `Permissions-Policy` y `Content-Security-Policy: frame-ancestors 'self'`.
- Auditoría de seguridad: `bash scripts/e2e/sec-audit.sh` (29 checks: sesión, 401/403 en todos los endpoints, IDOR, XSS, contraseñas; usa `http://localhost:3000` y las cuentas demo).
- Validación: `parseBody(req, zodSchema)` de `src/lib/api.ts` en las rutas de dinero y estado (cart, cart/merge, cart/preview, orders, purchases, purchases/[id], projects, projects/[id], projects/[id]/materials, provider/plan, provider/stock, provider/links, verification/dni, profiles/me, auth/register y auth/verificacion/* (D26), returns, returns/[id], bids/[id], works, works/[id], users/location; `homy/agent` y `catalog` validan con zod `safeParse`); todavía castean `body<T>()` sin zod (deuda): `auth/login`, `jobs`, `jobs/[id]`, `jobs/[id]/bids`, `invoices/[id]/cash`, `charges/[id]`, `provider/charges`, `reviews`, `messages/conversations*`, `crm/*`, `favorites`, `notifications`. `fail()` para errores.
- Región: las funciones de Vercel corren en San Pablo (`vercel.json` `regions: ["gru1"]`), la misma región de la base (`sa-east-1`). Con la base lejos, cada consulta cruzaba el continente (medido 1,4-5,4 s por pedido). No cambiarla sin mover la base.
- Registro y verificación (D26): email confirmado con un código de 6 números ANTES de crear la cuenta (HMAC-SHA256 con clave derivada de `AUTH_SECRET`, `timingSafeEqual`, 10 min, 5 intentos atómicos, uso único, reenvío 60 s, 5/h por destino y 30/h por IP contados en la base); sin enumeración (misma respuesta y código señuelo si el email ya tiene cuenta); datos estandarizados con `src/lib/registro.ts` en cliente y servidor. Celular: código solo con proveedor (`PHONE_VERIFY_PROVIDER`), hoy ninguno → "sin verificar".
- Área `/admin` (D29): ingreso propio con `ADMIN_EMAIL` + `ADMIN_PASSWORD` (no es un rol ni una cuenta); cookie `homia_admin` httpOnly/SameSite=Strict/12 h firmada con `AUTH_SECRET`; toda API `/api/admin/*` pasa por `requireAdmin()` (`src/lib/admin.ts`) y responde 404 sin esa sesión; una sesión de usuario no sirve. Límite 5 fallos/IP/15 min en memoria: en Vercel Firewall sumar `/api/admin/login`.
- Rate limit: `src/lib/rate-limit.ts` (memoria, login y registro) NO sirve en Vercel; el límite real va en Vercel Firewall (login 30/10 min, registro 3/10 min, homy 10/10 min, uploads 15/10 min por IP). El cupo de Homy vive en la base (tabla `AiUsage`, §9).
- `/api/*` inexistente responde 404 JSON (`src/app/api/[...slug]/route.ts`).
- `next.config.ts` con `ignoreBuildErrors: false` y `tsconfig` con `noImplicitAny: true`: el build tiene que compilar limpio. `NEXT_DIST_DIR` (opcional) permite levantar un segundo `next dev` en la misma carpeta sin pisar `.next`.

## 5. Modelo de datos (40 modelos en prisma/schema.prisma)

- **Identidad**: `User` (roles JSON; todo registro por pantalla recibe `cliente`; `emailNotifications` para los avisos por mail), `IdentityDocument` (DNI + análisis IA, estado verificación), `OAuthState` (PKCE), `PasswordReset` (recuperar contraseña, hash del token)
- **Perfiles**: `ProfessionalProfile` (con OAuth MP propio), `ProviderProfile` (multi-tipo, plan/suscripción, trial, marca PRO, OAuth MP)
- **Catálogo**: `Category` (22), `CatalogElement` (1764 elementos con nombre canónico + aliases + descripción + unidad de venta), `ProviderStock`, `StockMovement`, `StockReservation` (sin uso: la reserva descuenta `quantity`)
- **Trabajo**: `JobPost`, `JobBid`, `Project`, `ProjectMaterial`, `Invoice` (+`serviceFee`), `InvoiceItem`, `Payment` (+`collector`), `ProviderCharge` (+`serviceFee`), `ProviderLink`, `CompletedWork`
- **Carrito y pedidos**: `CartItem` (carrito de cuenta), `Order` (`PED-AAAA-NNNNNN`), `Purchase` (sub-pedido de un proveedor y un tipo `compra`|`reserva`, +`orderId`, `serviceFee`, `availableFrom` para reservas sin stock), `PurchaseItem`, `ActivityEvent` (línea de tiempo)
- **Reputación**: `Review` (estrellas + comentario + foto; proyecto→profesional, proyecto→proveedor, profesional→cliente, compra→proveedor)
- **CRM**: `CrmPipeline`, `CrmStage`, `CrmDeal`
- **Comunicación**: `Conversation`, `Message`, `Notification`
- **Homy IA**: `HomySession` (+`puerta`, `visitorHash`), `HomyMessage` (+`runId`, `payload`), `HomyRun` (registro de corridas), `AiUsage` (cupo diario), `SearchEvent`
- **Sobrantes**: `LeftoverReturn` (devolución a quien vendió: `tipo` cliente/profesional_a_proveedor, `sellerKind` proveedor/profesional, `providerId?`, `professionalId?`, `parentReturnId?`; origen proyecto o compra; estado; pago original; reembolso MP; `refundChannel/refundMethod/refundMethodNote`; `refundConfirmedAt/By`; `reminderSentAt`) + `LeftoverItem` (foto, cantidad pedida/aceptada/recibida, monto, `purchaseItemId`)
- `Favorite`
- **Ingresos de HomIA (D30)**: `SubscriptionCharge` (cada cobro de suscripción tal como lo informa MP; sin FK) y `SubscriptionEvent` (altas pagas, cambios de plan, bajas, reactivaciones; `dedupeKey` único); `Payment.mpApplicationFee`/`mpApprovedAt`
- **Métricas de uso (D27)**: `AnalyticsEvent` (uso: page_view/click/submit/dialog/search/error/server, `userId?` + `anonId` + `sessionId`, ruta normalizada, `entityType/entityId`, `props` jsonb) y `AnalyticsSession` (inicio, última actividad, `activeMs` real, pantallas, entrada, origen, utm, dispositivo). Sin FK; retención 13 meses de eventos (cron diario). `SearchEvent` queda histórico
- **Sugerencias (D25)**: `Feedback` (sugerencia/queja/mejora/oportunidad/problema/otro de cualquier rol: área, título, descripción, hasta 4 fotos como paths del bucket PRIVADO `feedback-evidencias`, contexto técnico solo en "problema", `contactOk`, estado recibida|en_revision|planificada|resuelta|descartada, respuesta del admin). Admin = sesión propia del área `/admin` con `ADMIN_EMAIL`/`ADMIN_PASSWORD` (D29; no es un rol ni una cuenta)
- **Finanzas (D24)**: `FinanceEntry` (movimientos cargados por el profesional o el proveedor, por `role`; tipo, categoría de `src/lib/finanzas/conceptos.ts`, monto, fecha, recurrente mensual, obra, vida útil, pagado/pendiente, comprobante, baja lógica), `FinanceConfig` (saldo inicial al cierre de un día, margen estimado, primer uso, asignación de compras) y `ProviderStock.unitCost` (costo de compra; null = sin dato). Lo de HomIA no se copia: se lee de sus tablas al calcular

Notas de esquema: la base es Postgres, pero se mantienen las convenciones heredadas de SQLite: sin enums (String), sin arrays (JSON como string), lat/lng como Float, dinero como Float. Todo el texto de negocio está en español rioplatense.

## 6. Mapa de API (64 endpoints)

| Dominio | Endpoints | Notas |
|---|---|---|
| auth | `/auth/login` `/auth/logout` `/auth/me` `/auth/register` `/auth/verificacion` (GET) `/auth/verificacion/enviar` `/auth/verificacion/comprobar` | registro con rol (siempre suma `cliente`), cómo nos encontró, `acceptTerms: true` obligatorio (D19); **D26:** obligatorios nombre, apellido, email con `emailToken` (código por mail), celular + repetido, contraseña, ciudad; profesional + rubros; proveedor + comercio, tipo y dirección; 400 con `campos`/`faltan`; códigos de 6 cifras (`registro` sin cuenta / `cuenta` con sesión); login/registro respetan `?volver=`; `/profiles/me/eliminar` = baja con anonimización |
| catálogo | `/catalog` (GET lista completa por categoría; POST alta con IA — solo proveedor, anti-duplicado) | nombre/alias/desc/unidad; la búsqueda difusa corre en el cliente con `search-match.ts` |
| búsqueda | `/search`, `/search/pins`, `/comparables` | fuzzy + geo; pins para mapa; comparables por precio |
| directorio | `/directory` | lista pública ordenada por reseñas, filtros rubro+precio+rating; PRO activo primero |
| trabajos | `/jobs`, `/jobs/[id]`, `/jobs/[id]/bids`, `/bids` (GET mine=1), `/bids/[id]` | publicar/ofertar/retirar/re-ofertar/asignar; aceptar es transaccional y solo desde `pendiente` |
| proyectos | `/projects`, `/projects/[id]`, `/projects/[id]/invoice`, `/projects/[id]/materials`, `/projects/hire-sources`, `/projects/[id]/schedule` | asistente Contratar (brief `budgetMin/Max`, `laborCost=0`; **D16**: opcional `jobId` = trabajo propio abierto → mismo cierre que aceptar oferta vía `src/lib/job-hire.ts`, u opcional `parentProjectId` = proyecto activo propio como profesional → subcontratación trazable, invisible para el cliente original; `hire-sources` alimenta el selector) → el pro cotiza → etapas solo hacia adelante → `finalizado` solo el cliente desde ejecución/revisión → una factura pendiente por proyecto (materiales con `invoicedAt`); stock se reserva al APROBAR el material; modo de materiales A/B lo elige el profesional en el proyecto; **D21** fechas del trabajo: con presupuesto aprobado (oferta aceptada o fuera de `presupuesto`) el profesional propone inicio+fin estimado, el otro acepta/rechaza/contrapropone, reprogramar mantiene lo acordado vigente, concurrencia optimista (409), solapamiento avisa y no bloquea |
| calendario | `/professional/calendar` (GET calendario / PATCH jornada; solo el profesional de la sesión), `/profiles/professional/[id]/availability` (**público**) | D21: calendario con proyectos con fechas, `sinFecha` y `pendientes`; días `AAAA-MM-DD` guardados al mediodía UTC (`src/lib/schedule.ts`). **D23:** franja diaria `dailyStart`–`dailyEnd` ("HH:MM", de a 15 min; null = día completo); choque con acordados del mismo profesional → 409 al proponer y al aceptar (transacción con `FOR UPDATE` del perfil), con propuestas → aviso; jornada `workdayStart/End` (null = 06:00–18:00) decide libre / con lugar / completo; disponibilidad pública = `dias` con franjas unidas y huecos libres, `proximoDiaConLugar`, ventana ≤ 6 meses, `whereUsuarioPublico()` |
| facturas | `/invoices?mine=1` (GET: Cobros del profesional, solo las suyas + resumen), `/invoices/[id]` (GET detalle; POST pago MP con token del profesional + 1%), `/invoices/[id]/cash`, `/invoices/[id]/pdf` | efectivo: acordar/confirmar/cancelar, sin cargo |
| carrito | `/cart` (GET/POST/PATCH/DELETE), `/cart/merge` (fusiona el del visitante al ingresar), `/cart/preview` (vista del carrito del visitante) | clientes y profesionales; máx. 60 productos; cantidades según unidad (`units.ts`); sin stock se puede agregar (`inStock:false`: solo reserva) |
| pedidos | `/orders` (GET mis pedidos, POST confirmar carrito con `lineTypes`), `/orders/[id]` | **D15**: `Order` con un `Purchase` por proveedor **y tipo**. **Compra** (solo con stock): nace `aprobado` = por pagar, con reserva atómica + `ProviderCharge` en la misma transacción, sin aprobación; 24 h para pagar/elegir efectivo (efectivo: 7 días desde la compra); sin stock → 409 y nada creado. **Reserva** (con o sin stock): `pendiente_aprobacion`, la aprueba el proveedor |
| compras | `/marketplace` (incluye ofertas con cantidad 0: `inStock:false`), `/purchases` (GET compras/ventas; POST pedido de un producto vía `createOrder`), `/purchases/[id]` | reserva: `pendiente_aprobacion` → `aprobado` (con stock: reserva atómica + cobro + 48 h) o `esperando_stock` (sin stock, con `availableFrom`) → `disponible` → `aprobado` (48 h); `pagar_mp` (token del proveedor + 1%) / `pagar_efectivo` → `entregado`/`pagado`; el proveedor cancela con motivo (si ya estaba pagado por MP y no entregó: reembolso total con SU token); `rechazado`/`cancelado` liberan stock; excluye proveedores sin plan operativo |
| cobros | `/charges/[id]` (GET, POST pagar MP con token del proveedor + 1% o efectivo, PATCH confirmar efectivo), `/provider/charges` | cobros de materiales (modo B) y de sub-pedidos |
| stock | `/provider/stock` | CRUD stock proveedor sobre catálogo |
| proveedor | `/provider/analytics` (PRO), `/provider/links`, `/provider/plan` | plan en ARS, trial 14 días (`trialEndsAt`); al cambiar de plan la preapproval anterior se cancela recién cuando MP autoriza la nueva; vencido = 403 en escrituras y fuera de marketplace/search/directorio/sponsors/Homy |
| sobrantes | `/returns` (GET `role=solicitante\|proveedor\|profesional` + `tipo`; POST con `tipo` y `parentReturnId`), `/returns/eligible` (`tipo=profesional_a_proveedor` + `prefill`), `/returns/[id]` (aceptar/rechazar/cancelar/recibir/reembolsar_efectivo/reembolsar_fuera/reintentar_reembolso/confirmar_reembolso) | ver §7 punto 6 |
| mercado pago | `/mp/oauth/connect?kind=provider\|professional`, `/mp/oauth/callback`, `/mp/oauth?kind=…` (DELETE) | OAuth con PKCE del proveedor y del profesional; refresh automático; exige sesión |
| cron | `/cron/reservations` (cada hora), `/cron/subscriptions` (diario 09:30 UTC); ambos con `CRON_SECRET` | reservations: vence sub-pedidos `aprobado` sin pago (compra 24 h, o 7 días con efectivo; reserva 48 h) y libera stock + tareas de sobrantes (confirmación automática 72 h y recordatorio 72 h); subscriptions: reconcilia planes con MP (degrada `cancelled`/`paused` o 35 días sin cobro) |
| reseñas | `/reviews` | estrella+comentario+foto; post-proyecto y post-compra |
| mensajes | `/messages/conversations`, `/messages/conversations/[id]` (`?after=<ISO>` = solo lo nuevo + `readUpTo`), `/messages/unread` | WhatsApp-like; regla "el cliente inicia" por destinatario; bandeja/hilo/no leídos en UNA consulta SQL cada uno (con pgbouncer cada consulta Prisma ≈ 4 idas a la base: contá consultas) |
| obras | `/works`, `/works/[id]` | obras completadas (portafolio); editar y baja lógica |
| perfiles | `/profiles/professional/[id]`, `/profiles/provider/[id]` (exigen sesión; `chatBlocked=false`), `/profiles/me` | |
| usuarios | `/users/[id]/client-summary`, `/users/location` | reputación del cliente (confianza bidireccional); ubicación compartida |
| homy | `/homy/agent` (POST stream NDJSON, público con cupo; GET historial solo del dueño) | súper agente, ver §9 |
| uploads | `/uploads` | Supabase Storage; `folder=dni` → bucket privado, devuelve path `dni-docs/<uid>/dni/<x>`; `folder=sugerencias` → bucket privado `feedback-evidencias/<uid>/sugerencias/<x>`; solo jpg/png/webp por magic bytes, 8 MB |
| sugerencias | `/feedback` (GET mis envíos, POST alta; tope 10/día → 429), `/feedback/[id]` (autor o admin), `/admin/feedback` (GET bandeja con filtros), `/admin/feedback/[id]` (PATCH estado + respuesta → notificación y mail al autor) | D25: fotos firmadas 10 min solo al autor y al admin; admin = sesión de `/admin` (D29), sin ella 404; respuestas firmadas "Equipo HomIA"; mail al equipo (`FEEDBACK_EMAIL` o business@vakdor.com) por cada envío; ver LOGICA §15 |
| verificación | `/verification/dni` | 2 paths `dni-docs/…` propios + IA visión (nombre y DNI detectados, cruce con `dniCuil`) + badge; 3 intentos/día; no degrada `verificado` sin dictamen |
| pagos | `/payments/webhook` | MP: pagos (factura/charge/purchase) + preapprovals; ver §2 |
| finanzas | `/finanzas/resumen?role=&periodo=` (GET), `/finanzas/movimientos` (GET/POST), `/finanzas/movimientos/[id]` (PATCH/DELETE), `/finanzas/config` (PUT), `/finanzas/costos` (PUT, proveedor), `/finanzas/export.csv` (GET) | D24: profesional y proveedor, todos los planes; todo calculado en el servidor con datos reales (8 consultas en paralelo); facturado ≠ cobrado; comisiones de MP y suscripción NO se estiman; 401/403, IDOR 404; ver LOGICA §16 |
| métricas | `/analytics/collect` (POST público: lote ≤ 50 eventos/48 KB, zod estricto, 429 por navegador/IP, usuario de la cookie, 1 consulta, 204), `/admin/metricas` (`seccion` usuarios\|uso\|embudos\|retencion\|negocio, `periodo`, `prueba=incluir`, `csv=<tabla>`), `/admin/metricas/usuario` (`q` o `id`), `/admin/metricas/activo` (`tipo`, `id`) | D27: registro de uso propio sin terceros ni texto tipeado; hechos de negocio desde sus tablas; eventos de servidor con `registrarEvento()` (login, logout, registro, plan, PDF, admin); solo con la sesión de `/admin`, resto 404; ver LOGICA §17 |
| administración | `/admin/login` (POST ingreso con `ADMIN_EMAIL`/`ADMIN_PASSWORD`, zod, tiempo constante, 401 genérico, 429 a los 5 fallos/IP/15 min, 503 sin variables; GET `{ admin }`), `/admin/logout` | D29: cookie propia `homia_admin` (httpOnly, SameSite=Strict, 12 h), independiente de la sesión de usuario; `requireAdmin()` de `src/lib/admin.ts` en todas las `/api/admin/*`; ver LOGICA §18 |
| ingresos | `/admin/ingresos` (GET: resumen, MRR, estados de cuenta, movimiento, churn, tablas filtrables, `csv=<tabla>`), `/admin/ingresos/proveedor?id=` (ficha y línea de tiempo) | D30: solo sesión de `/admin` (404 sin ella); lectura de MP con los tokens del servidor; ver LOGICA §19 |
| otros | `/notifications`, `/favorites`, `/sponsors`, `/crm/pipelines`, `/crm/deals`, `/pro/subscription` (legado: 403) | |

## 7. Flujos críticos (así funcionan, así hay que dejarlos)

1. **Contratar desde el directorio**: directorio (orden por reseñas, filtros rubro+precio) → perfil (requiere sesión) → asistente Contratar (opcional "¿Es para algo que ya publicaste?": trabajo abierto del cliente o proyecto activo del profesional, precarga editable — D16; qué, cuándo/dónde, presupuesto estimado, mensaje inicial) → proyecto en etapa presupuesto → el profesional cotiza y elige el modo de materiales A/B → chat → obra finalizada por el cliente → **reseña con estrellas+comentario+foto** → factura PDF → pago MP (a la cuenta del profesional + 1%) o efectivo.
2. **Compra de materiales con carrito**: buscar elemento (ej. "caño") → resultados de TODOS los proveedores con stock (fuzzy, sin tope, con marcas) → "Agregar al carrito" o "Reservar" (también en la lista de materiales de `/buscar`, sin salir de la búsqueda; también visitantes, en `localStorage`; se fusiona al ingresar; lo sin stock solo "Reservar") → carrito agrupado por proveedor con subtotal, "Cargo de servicio HomIA (1%) — solo si pagás con Mercado Pago" y total con MP → confirmar (Comprar/Reservar **por producto**) → `Order` con un sub-pedido por proveedor y tipo → **D15: las compras con stock nacen "por pagar" (stock reservado al confirmar, SIN aprobación); las reservas las aprueba el proveedor (sin stock: fecha aproximada → "disponible")** → "Mis pedidos": "X de Y proveedores pagados · Falta pagar $Z", pago de a uno (MP con desglose o efectivo sin cargo), línea de tiempo → entrega → **reseña post-compra** → alimenta analítica PRO.
3. **Alta de elemento con IA (proveedor)**: combobox con búsqueda difusa sobre 1764 elementos (`catalogScore`: el nombre pesa más que la descripción) → si no existe, botón "Agregar «X» al catálogo con IA" → IA genera descripción+aliases+unidad → anti-duplicado antes de crear.
4. **Verificación DNI**: sube frente+dorso → IA visión valida → badge verificado/en revisión/no verificado en perfil.
5. **Suscripción proveedor**: trial 14 días → Básico $50.000/mes (usar la app) o PRO $100.000/mes (sponsor con logo y marca en home, tarjeta "Recomendado" en marketplace y directorio, analítica). Solo proveedores. Preapproval de la app Suscripciones; el webhook activa/cancela; el cron diario reconcilia.
6. **Sobrantes** (D14, 24/09/2026: *devuelve la plata quien la cobró, y los materiales vuelven a quien se los vendió al cliente*): el comprador (cliente de un proyecto o de un sub-pedido; el profesional como comprador solo en modo B) carga ítems pagados con foto, cantidad y condición → **el vendedor** acepta todos o algunos (fija monto) o rechaza → si no responde en 72 h le llega UN recordatorio → se los entregan → marca recibido → si el pago fue por MP, HomIA dispara el refund parcial con **el mismo token que cobró**, **sin el cargo de servicio del 1%**, idempotente por `returnId`; si fue efectivo, lo devuelve en mano y el solicitante confirma "Recibí el reembolso" (o se confirma solo a las 72 h). Plazo 30 días. **Vendedor:** compra directa y modo `cliente_paga_proveedor` → proveedor (lo recibido vuelve a su stock); modo `pro_adelanta` (materiales en la factura del profesional) → **el profesional** (`sellerKind = profesional`; no vuelve a ningún stock; lo gestiona en `/panel/profesional/devoluciones`). **Pata opcional profesional → proveedor** (`tipo = profesional_a_proveedor`, desde el proyecto: "Pedir devolución a <proveedor>", precarga lo que devolvió el cliente con `parentReturnId`): tope = lo que ese proveedor le vendió para el proyecto menos lo ya pedido; el proveedor acepta/recibe (vuelve al stock) y, como el pago fue por fuera de HomIA, marca `reembolsar_fuera` (efectivo/transferencia/saldo a favor + nota); el profesional confirma (o 72 h). Nunca MP en esa pata. Solo las dos partes ven y actúan (IDOR).
7. **Cobro del vendedor por MP**: proveedor en Cobros (`/panel/proveedor/cobros`), profesional en **Cobros** (`/panel/profesional/cobros`, desde el 24/09/2026: tarjeta de MP + cobrado del mes/pendiente + todas sus facturas vía `GET /api/invoices?mine=1`, PDF y confirmar efectivo; el OAuth vuelve ahí) → "Conectar Mercado Pago" (OAuth con PKCE). Cobra el 100% de su precio en su cuenta; el cliente paga aparte el 1%. Sin conexión, sus clientes solo pueden pagarle en efectivo (503 `needsConfig` honesto).

## 8. Catálogo de elementos

- 1764 elementos (1218 + 546 de la expansión 3 del 25/09/2026: techos, refuerzo y humedad, plomería y termotanques, gas y calefacción, redes/TV/CCTV, refrigeración, repuestos de electrodomésticos, cerrajería y aberturas, jardín y piscina, control de plagas, acabados, limpieza especializada), 22 categorías (`electrodomesticos` y `plagas` creadas el 25/09/2026 con OK de Leonardo: también son rubros de profesionales), 100% con descripción natural (español rioplatense) + aliases + unidad de venta.
- Seeder **idempotente**: `node scripts/catalogo/seed-catalog-maestro.mjs` (upsert por nombre+categoría; NO rompe ProviderStock existente). Los datos viven en `scripts/catalogo/catalog-maestro.mjs`, `catalog-expansion.mjs`, `catalog-exp2-{a,b,c,d}.mjs`. **Escribe en producción** (base única): pedir OK.
- Datos demo completos (3 usuarios demo, stock, proyectos, reseñas): `node scripts/demo/demo-seed.mjs` (+ `demo-seed-lib.mjs`); borra y recrea los datos demo en producción. Credenciales demo: `cliente@homia.test` / `profesional@homia.test` / `proveedor@homia.test`, pass `Homy2026!`.
- Búsqueda difusa obligatoria: usar `src/lib/search-match.ts` (NFD, lowercase, strip diacríticos, similitud, singular/plural). Nunca `String.includes` pelado. *Deuda conocida:* `/directory`, `/jobs` (GET) y `/search/pins` todavía usan `includes`.

## 9. IA

- **Dos clientes:** `src/lib/ai.ts` (Chat Completions; `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_VISION_MODEL`; producción `gpt-5.4-mini`) para (1) verificación DNI visión `/api/verification/dni` y (2) alta de elemento con IA `POST /api/catalog`; y `src/lib/homy/openai.ts` (Responses API, `HOMY_MODEL` = `gpt-5.6-luna`, `HOMY_REASONING_EFFORT` = `low`, mismo `AI_API_KEY`/`AI_BASE_URL`) para (3) el **súper agente Homy** `/api/homy/agent`. `maxDuration = 60` en rutas con IA. El chat viejo `/api/homy` y `src/lib/homy-agent.ts` ya no existen.
- **Homy** (`src/lib/homy/*`): grafo determinista con un solo nodo agéntico (loop ≤ 6 vueltas); 4 puertas (buscador de la home, flotante de la home, mascota del panel dentro de `help-dock.tsx`, tarjeta de `/buscar`); herramientas **solo lectura** (`sugerir_materiales`, `buscar_proveedores_con_stock`, `buscar_profesionales`, `buscar_trabajos`, `como_funciona_homia`, `mis_pendientes`) con estados `encontrado|nada|error`; respuesta final por la herramienta obligatoria `responder` validada con zod; **guardarraíles en código** (links permitidos, entidades solo de herramientas, montos leídos, insignias verdaderas, frases prohibidas); **ranking en código** (verificado > reseñas bayesianas > precio/obras > distancia; PRO desempata); catálogo como conocimiento interno; stream NDJSON; registro en `HomyRun`.
- **Cupo** (`src/lib/homy/cupo.ts`, tabla `AiUsage`): visitantes 8/día por IP (hash) compartido home + flotante; logueados 60/día por usuario; descontado atómicamente justo antes de llamar al modelo y devuelto si la IA falla; tope global de visitantes `HOMY_TOPE_DIARIO_VISITANTES` (3000); kill-switch `HOMY_APAGADO=1`. Si la IA falla: respaldo honesto sin IA con las mismas herramientas.
- Evaluación: `node scripts/homy-eval.mjs` (32 casos; 32/32, 0 alucinaciones; ≈ US$0,001/consulta estimado, cotejar con la factura; p50 9,3 s). Tests: `node --test --import ./scripts/homy-test-alias.mjs src/lib/homy/__tests__/*.test.ts` (19).
- Todos con zod + fallback honesto. Prompts en español rioplatense. No inventar marcas ni datos.

## 10. Reglas para el asistente

1. No introduzcas mock data ni hardcodees resultados. Si un servicio externo no está configurado, devolvé mensaje honesto.
2. Mantené la consistencia del design system (§3) y mobile-first. Probá en 390×844 en cada cambio de UI.
3. Todos los endpoints nuevos: zod (`parseBody`) + auth check (`getSessionUser`) + `fail()` para errores + 401/403 correctos.
4. Mensajería: el cliente inicia (regla por destinatario, §3). Reseñas: estrellas+comentario+foto en TODOS los flujos.
5. No rompas la búsqueda difusa: siempre `search-match.ts`.
6. Español rioplatense en UI, prompts y comentarios de negocio.
7. Antes de declarar listo un cambio: build verde + probá el flujo real (script E2E o curl) + navegador en escritorio y 390×844.
8. Pagos: toda preferencia nueva con el token del vendedor (`createSellerPreference`) y el cargo de `fees.ts`; nunca cobrar con el token de la plataforma salvo suscripciones.
9. Una sola base = producción: todo lo que escribe (seeds, E2E, migraciones) necesita OK del dueño. Migraciones con `migrate diff` + `db execute`, nunca `db push`.
10. Regla de los tres documentos: actualizá `docs/` (funcional, lógica, técnico, decisiones, bitácora) en la misma rama del cambio.
11. Métricas (D27): toda pantalla o botón nuevo lleva `data-track="<acción en español>"` y, si pertenece a un activo, `data-entity="<tipo>:<id>"` (project, order, purchase, invoice, charge, job, bid, stock, conversation, review, work, return). Nunca metas texto tipeado, montos ni datos personales en `data-track`. Todo evento nuevo de servidor va con `registrarEvento()` (no bloquea); los hechos de negocio NO se duplican en eventos.
11. Toda consulta nueva que muestre usuarios, perfiles, stock o trabajos en lo público (listados, búsquedas, Homy) filtra con `src/lib/visibility.ts` (`whereUsuarioPublico()` / `esUsuarioPublico()`): nunca muestra cuentas eliminadas y, con `HIDE_DEMO_USERS=1`, tampoco las demo `@homia.test` (D20). Las suites E2E corren con el flag en 0.
12. Mails: todo envío pasa por `src/lib/email.ts` (Resend por HTTP, nunca tira, sin clave no manda). Un evento nuevo que merezca mail se crea con `notificar()` de `src/lib/notify.ts` y su `type` se suma a `TIPOS_CON_MAIL` (respeta `User.emailNotifications`). Los mensajes del chat no mandan mail.

## 11. Estado actual (24 de septiembre de 2026)

✔ Migración a Vercel + Supabase hecha (Postgres, Storage con dos buckets, IA, variables en Vercel).
✔ Lanzamiento (`docs/PLAN-LANZAMIENTO-48H.md`): compra directa con reserva de stock, OAuth MP con PKCE, plan en pesos con trial real, máquina de estados de proyecto, factura única, webhook con firma no bloqueante + re-consulta + idempotencia, DNI por Supabase, IDORs cerrados, copy honesto (commits `288f9a0` a `2a8cd95` en `main`).
✔ Plan PRO con marca y cinta de sponsors + cron diario de suscripciones (`48668f3`).
✔ Carrito multiproveedor y pedidos, cargo de servicio 1% visible, cobro a la cuenta del vendedor (proveedor y profesional), sobrantes con confirmación y recordatorio de 72 h, súper agente Homy con cupo, regla del chat por destinatario, 404 JSON en `/api` (`2eed864`, rama `feat/carrito-homy`). Migraciones 0022, 0023 y 0030 aplicadas.
✔ Pruebas: suite E2E 16 secciones A–P 727/727 (equipo de carrito), A+I 69/69 tras el cambio del chat; Homy 32/32 y 19 tests.
◻ Antes de lanzar: rate limit en Vercel Firewall (manual), `MP_WEBHOOK_SECRET` y `MP_SUB_WEBHOOK_SECRET` cargados, pago real de prueba de punta a punta con OAuth del vendedor.
✔ Sobrantes con el profesional como vendedor en modo `pro_adelanta` y pata profesional → proveedor con reembolso por fuera de HomIA (D14, migración 0024 aplicada, rama `feat/carrito-homy`).
✔ Contratar eligiendo un trabajo publicado (cliente) o un proyecto activo (profesional que subcontrata), con `Project.parentProjectId` (D16, migración 0027 aplicada, rama `feat/carrito-homy`).
✔ Términos aceptados al registrarse (`acceptTerms`, `User.termsAcceptedAt/termsVersion`), "Eliminar mi cuenta" con anonimización (`POST /api/profiles/me/eliminar`, `User.deletedAt`), filtro de cuentas demo por `HIDE_DEMO_USERS`, imagen para compartir (`opengraph-image`) y páginas de error (D19/D20, migración 0029 aplicada, rama `feat/recuperar-mails`).
✔ Recuperar contraseña por mail y avisos por mail de los eventos clave con interruptor en el perfil de los tres roles (D18, migración 0028 aplicada, rama `feat/recuperar-mails`). E2E A+B+F 286/286 con doble de Resend.
◻ Mails: crear la cuenta de Resend, verificar `somoshomia.com` y cargar `RESEND_API_KEY` + `EMAIL_FROM` en Vercel. Sin eso no sale ningún mail (tampoco el de recuperar contraseña).
◻ Cuando Leonardo esté conforme con las pruebas: **borrar los datos y cuentas demo** (`@homia.test`) de la base, con su OK. Hasta entonces, `HIDE_DEMO_USERS=1` en Vercel el día del lanzamiento los oculta.
◻ Mails: `RESEND_API_KEY` tiene que estar en Vercel (Production) y hace falta un redeploy; remitente `avisos@vakbot.vakdor.com` hasta verificar `somoshomia.com`. Los textos legales quedan como versión vigente, sin revisión de abogado (decisión de Leonardo, D22).
◻ Deuda priorizada: `docs/AUDITORIA-INTEGRAL.md` §9 y `docs/PLAN-LANZAMIENTO-48H.md` §4 (zod en las rutas que faltan, `includes` en directorio/bolsa/pines, cifrado de tokens OAuth).

## 12. Variables de entorno (nombres exactos que lee el código)

Ver `.env.example`: `DATABASE_URL`, `DIRECT_URL`, `AUTH_SECRET`, `APP_URL`, `MP_ACCESS_TOKEN`, `MP_PUBLIC_KEY`, `MP_CLIENT_ID`, `MP_CLIENT_SECRET`, `MP_TEST_ACCESS_TOKEN`, `MP_WEBHOOK_SECRET`, `MP_SUB_ACCESS_TOKEN`, `MP_SUB_TEST_ACCESS_TOKEN`, `MP_SUB_WEBHOOK_SECRET`, `MP_PROVIDER_BASIC_ARS`, `MP_PROVIDER_PRO_ARS`, `CRON_SECRET`, `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_VISION_MODEL`, `HOMY_MODEL`, `HOMY_REASONING_EFFORT`, `HOMY_TOPE_DIARIO_VISITANTES`, `HOMY_APAGADO`, `SUPABASE_PROJECT_URL`, `SUPABASE_SERVICE_ROLE`, `HIDE_DEMO_USERS` (1 en producción al lanzar; 0 en local), `NEXT_PUBLIC_LEGAL_RAZON_SOCIAL`, `NEXT_PUBLIC_LEGAL_CUIT`, `NEXT_PUBLIC_LEGAL_DOMICILIO`, `NEXT_PUBLIC_LEGAL_EMAIL`, `RESEND_API_KEY`, `EMAIL_FROM`, `ADMIN_EMAIL` y `ADMIN_PASSWORD` (ingreso propio al área `/admin`: Métricas y Sugerencias; contraseña larga y única, se cambia en Vercel y se redeploya; sin ellas `/admin` responde "no configurado", D29), `FEEDBACK_EMAIL` (opcional; por defecto business@vakdor.com), `PHONE_VERIFY_PROVIDER` (vacía hoy; `twilio` o `whatsapp`) con `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, `TWILIO_SMS_FROM` o `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, `WHATSAPP_OTP_TEMPLATE`, `WHATSAPP_OTP_LANG` (D26). Solo desarrollo: `NEXT_DIST_DIR`, `RESEND_API_URL` (doble de Resend en pruebas), `MP_API_BASE_PRUEBAS` (doble de la API de MP en pruebas, D30).

Dominio: `https://www.somoshomia.com`. Webhook MP (prueba y producción, ambas apps): `https://www.somoshomia.com/api/payments/webhook`. Redirect OAuth: `https://www.somoshomia.com/api/mp/oauth/callback`.
