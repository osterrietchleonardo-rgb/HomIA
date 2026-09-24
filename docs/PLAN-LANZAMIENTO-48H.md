# Plan de lanzamiento HomIA — 48 horas

Fecha de arranque: 23 de septiembre de 2026. Objetivo: producto en Vercel, con los tres roles operando de punta a punta con dinero real, sin promesas falsas, sin crashes, el 25 de septiembre.

Base: `AUDITORIA-INTEGRAL.md` (200 hallazgos verificados). Este plan toma de ahí solo lo que bloquea el lanzamiento y agrega las decisiones de producto nuevas.

---

## 0. Decisiones de producto (cerradas)

| Tema | Decisión |
|---|---|
| Escrow / retención de pago | **Fuera.** Se elimina todo copy y resto de código. El pago va directo (MP al vendedor vía OAuth, o efectivo). |
| Visitas agendadas por IA | **Fuera por ahora.** Se elimina el copy. |
| Sobrantes | **Nueva feature, definida en §6.** El cliente o el profesional cargan los sobrantes de un proyecto o compra (foto, descripción, cantidad). El proveedor acepta todos o algunos ítems. Cuando los acercan al local, el proveedor confirma la recepción y la plataforma dispara el reembolso por Mercado Pago (o registra devolución en efectivo si la compra fue en efectivo). |
| Suscripción proveedor | **ARS 50.000/mes Básico** = usar la app (stock, ventas, cobros, CRM, vinculaciones, cuenta MP). **ARS 100.000/mes PRO** = Básico + sponsorship: logo y marca en la home, tarjeta "Recomendado" en marketplace y directorio, analítica. Trial 14 días. Se abandona el precio en USD. |
| Mercado Pago | Variables ya existen en `.env`; hay que **renombrarlas** a los nombres que lee el código (§1). |

---

## 1. Día 0 — Configuración (antes de tocar código, 1 hora)

### 1.1 Variables de entorno: mapeo exacto

El código lee estos nombres. Tu `.env` tiene otros. Sin este paso, MP, OAuth, IA y cron **no funcionan** aunque el código esté perfecto.

| El código lee | En tu `.env` hoy | Acción |
|---|---|---|
| `MP_ACCESS_TOKEN` | `ACCESS_TOKEN` (×4 bloques) | Copiar el **de producción de la app marketplace** (la que tiene `CLIENT_ID`/`CLIENT_SECRET`). Usar el de prueba en Preview. |
| `MP_CLIENT_ID` | `CLIENT_ID` (×2) | Idem, el de la app con OAuth habilitado. |
| `MP_CLIENT_SECRET` | `CLIENT_SECRET` (×2) | Idem. |
| `MP_WEBHOOK_SECRET` | no existe | **Nuevo.** Se genera en la app de MP → Webhooks → "Clave secreta". Necesario para verificar firma. |
| `MP_PROVIDER_BASIC_ARS` | no existe | **Nuevo:** `50000` |
| `MP_PROVIDER_PRO_ARS` | no existe | **Nuevo:** `100000` |
| `MP_PRO_PRICE_ARS` | existe | **Borrar** (legacy del PRO de profesionales). |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL`, `AI_VISION_MODEL` | no existen | **Nuevos.** Sin esto, DNI/Homy/alta IA quedan en fallback honesto (funciona pero no verifica ni responde). Cualquier proveedor OpenAI-compatible con visión. |
| `CRON_SECRET` | no existe | **Nuevo.** String aleatorio; Vercel lo manda solo en el header del cron. |
| `APP_URL` | no existe | **Nuevo:** `https://<dominio>`; reemplaza el `Host` del request en `notification_url`/`back_urls`/OAuth redirect. |
| `AUTH_SECRET`, `DATABASE_URL`, `DIRECT_URL`, `SUPABASE_PROJECT_URL`, `SUPABASE_SERVICE_ROLE` | existen | OK. |
| `PUBLIC_KEY`, `NUMERO_APLICACION`, `USER_ID`, `USUARIO_PRUEBA`, `CONTRASEÑA_PRUEBA`, `CODIGO_VERIFICACION_PRUEBA`, `VERCEL_*`, `GITHUB_*` | existen | No los lee el código. Sacarlos del `.env` de la app (los de MP test van a un `.env.test` local; los de Vercel/GitHub nunca al proyecto). |

### 1.2 En el panel de Mercado Pago (app marketplace)
- Webhooks: URL `https://<dominio>/api/payments/webhook`, eventos `payment` y `subscription_preapproval`. Copiar la clave secreta.
- OAuth: redirect URI `https://<dominio>/api/mp/oauth/callback`. Verificar que la app tenga el scope de marketplace (split de pagos).
- Confirmar que la cuenta esté habilitada para preapprovals (suscripciones).

### 1.3 En Supabase
- Crear bucket **privado** `dni-docs` (la política ya está en `supabase/migrations/0010_storage_policies.sql`). `homia-uploads` queda público para obras, reseñas, avatares, sobrantes.

### 1.4 En Vercel
- Cargar todas las variables de §1.1 en Production y Preview.
- Cron ya declarado en `vercel.json` (cada hora).
- Firewall → Rate limiting: reglas para `/api/auth/login` (10/15 min por IP), `/api/auth/register` (8/h por IP), `/api/homy*` (30/h por IP), `/api/uploads` (60/h por IP). Reemplaza el rate-limit en memoria sin escribir código.

---

## 2. Día 1 — Compila, es seguro, y el dinero fluye

Estimación: 10 horas efectivas. Bloques independientes, se pueden paralelizar entre agentes.

### B1. Compila y no crashea (45 min)
- [ ] `profesional/proyecto-detalle.tsx:661` importar `ReviewForm`.
- [ ] `proveedor/stock.tsx:6` agregar `useRef` al import.
- [ ] `proveedor/perfil.tsx:234` `fetchMe()` → `load()`.
- [ ] `cliente/materiales.tsx:61` aceptar `{ role?: 'cliente' | 'profesional' }`; `:241` `user?.roles.includes('profesional')`; `:246` base path según `role`.
- [ ] `marketplace-screen.tsx:167` `icon={<Package />} hint="…"`; `:70` mover el `setState` fuera del efecto.
- [ ] `next.config.ts`: `ignoreBuildErrors: false`. `tsconfig.json`: `noImplicitAny: true` (corregir lo que salga; son pocos `any`).
- [ ] Verificar: `npx tsc --noEmit` = 0, `npx eslint src` = 0, `npm run build` verde.

### B2. Seguridad e infra mínima (2 h)
- [ ] **DNI por fetch** (`src/lib/dni-ai.ts:63-74`): si la URL es http(s), exigir prefijo `${SUPABASE_PROJECT_URL}/storage/v1/object/` + carpeta `${userId}/dni/`; para bucket privado, generar signed URL con `SUPABASE_SERVICE_ROLE` y hacer `fetch` con timeout 15 s → base64. Mantener la rama FS solo en dev.
- [ ] **Uploads** (`uploads/route.ts`): `folder === 'dni'` → bucket `dni-docs`, devolver path interno (no URL pública). `GET /api/profiles/me` devuelve signed URL de 10 min solo al dueño.
- [ ] **`POST /api/verification/dni`**: aceptar solo paths de la carpeta del usuario; no tocar `verificationStatus` hasta tener dictamen; máximo 3 intentos/día.
- [ ] **Webhook MP** (`payments/webhook/route.ts`): validar `x-signature` con `MP_WEBHOOK_SECRET` (HMAC-SHA256 sobre `id:<data.id>;request-id:<x-request-id>;ts:<ts>;`); ignorar `type !== 'payment' && !== 'subscription_preapproval'` con 200; `Payment` por `upsert` en `mpPaymentId` (agregar `@unique` en schema); comparar `transaction_amount` con el total esperado (tolerancia 1 peso) y `currency_id === 'ARS'`; si `external_reference` empieza con `purchase:`, consultar el pago con el token OAuth del proveedor (buscar la purchase → provider → `mpOauthAccessToken`); si la factura ya estaba `pagada`, registrar el pago como `duplicado` y no tocar estado.
- [ ] `export const maxDuration = 60` en `homy`, `homy/agent`, `verification/dni`, `catalog`, `payments/webhook`, `uploads`.
- [ ] `db.ts`: `log: process.env.NODE_ENV === 'development' ? ['query', 'error'] : ['error']`.
- [ ] `cron/reservations/route.ts:7`: `if (!process.env.CRON_SECRET || authHeader !== …) return 401`.
- [ ] `APP_URL`: helper `appUrl()` en `src/lib/api.ts`; reemplazar los 6 `baseUrl` derivados de `req.url` (`charges/[id]`, `invoices/[id]`, `provider/plan`, `provider/subscription`, `purchases/[id]`, `mp/oauth/*`).
- [ ] **IDORs** (15 min cada uno): `GET projects/[id]/invoice` exigir ser parte; `PATCH projects/[id]/materials` `findFirst({ id, projectId })`; `homy/agent` `findFirst({ id: sessionId, userId })`; `crm/deals` `pipelineId = stage.pipelineId`; `GET jobs/[id]` sin sesión → sin `address`, `lat/lng` redondeados a 2 decimales, sin email/teléfono.
- [ ] `homy` y `homy/agent`: exigir sesión (el widget de la home pide login con gate honesto; el hero usa `/api/search` sin IA para anónimos). Alternativa si querés IA anónima: rate limit del WAF (§1.4) y `MAX_ITERATIONS = 3` para anónimos.
- [ ] `mp/oauth/callback`: exigir `getSessionUser()` y que `oauthState.sellerId` pertenezca al usuario; validar `expires_in` numérico; `connect:8` redirigir a `/ingresar`; manejar `?error=` de MP → `/panel/proveedor/cobros?mp=cancelado`.
- [ ] Borrar `src/app/api/profiles/documents/route.ts` y `src/app/api/route.ts` (hello world).
- [ ] `PUT /api/profiles/me`: no crear perfiles; solo `update` si el rol existe; `displayName.trim().length >= 2`; `lat/lng` numéricos; `avatarUrl` solo `https://` del bucket.

### B3. Dinero del proveedor (4 h)

**Compra directa completa**
- [ ] `purchases/[id]/route.ts`:
  - `aprobar` (proveedor): exigir `total > 0` (si era "a coordinar", el precio se fija acá); **reservar stock** con `updateMany({ where: { id: stockId, quantity: { gte: qty } }, data: { quantity: { decrement: qty } } })` → si `count === 0` → 409 "Sin stock suficiente"; `StockMovement 'reserva'`; crear `ProviderCharge { projectId: null, providerId, clientId, amount: total, number: PRV-…, status: 'pendiente', materialIds: '[]' }` y setear `purchase.chargeId`.
  - `rechazar` / `cancelar` (desde `aprobado`): devolver stock (`increment`), `StockMovement 'liberacion'`, charge → `anulada`.
  - `pagar_efectivo` (cliente): solo desde `aprobado`; setea `paymentMethod: 'efectivo'` y `charge.status: 'acordada_efectivo'`; **no** cambia `purchase.status`.
  - `pagar_mp` (cliente): solo desde `aprobado`, `total > 0`, proveedor con `mpOauthStatus === 'connected'` (si no, 503 `needsConfig` "Este proveedor todavía no conectó Mercado Pago; podés pagar en efectivo"); `marketplace_fee` solo con token del vendedor; try/catch → 503 honesto.
  - `entregar` (proveedor): solo desde `aprobado`; si el charge está `pagada` → `purchase.status = 'pagado'`, si no → `'entregado'`; `StockMovement 'consumo'`. Nunca retroceder `pagado`.
  - Confirmar efectivo (proveedor, `PATCH charges/[id]`): ya existe; al pasar a `pagada` → `purchase.status = 'pagado'`.
  - Cron: vencer solo `aprobado` con `reservationExpiresAt < now` → `cancelado` + devolver stock.
- [ ] `purchases/route.ts:89`: exigir `stock.quantity >= quantity`; `quantity > 0`; enviar `type` desde el front ("Reservar" = 48 h, "Comprar" = 7 días de retiro).
- [ ] `cliente/materiales.tsx`: `STATUS_META` con `pendiente_aprobacion` ("Esperando al proveedor"), `aprobado` ("Aprobado — pagá para retirar"), `rechazado`, `entregado`, `pagado`, `cancelado`; "Cancelar" en `pendiente_aprobacion` y `aprobado`; "Pagar con MP / Efectivo" en `aprobado` llamando `PATCH pagar_*`; MP con `location.href`; reseña en `entregado` o `pagado`; `hasReseña` con `mine=1`; quitar `window.confirm`.
- [ ] `proveedor/cobros.tsx`: tab Ventas con estados reales; "Aceptar" abre Dialog con precio (no `prompt()`); "Entregado" sin toast falso; mostrar charge y método de pago; badge de pedidos nuevos en bottom nav.
- [ ] `provider/analytics/route.ts:135`: `['pendiente_aprobacion', 'aprobado']`; renderizar `ventas` en el dashboard.
- [ ] `reviews/route.ts:54`: misma regex que línea 130 (acepta `https://` del bucket) → fotos de reseña de compra.

**Cobro por Mercado Pago del proveedor (OAuth)**
- [ ] `GET /api/profiles/me`: exponer `provider.mpOauthStatus` y `mpOauthExpiresAt`.
- [ ] `proveedor/cobros.tsx`: bloque arriba "Cobrá con tu Mercado Pago": estado (No conectado / Conectado hasta dd/mm / Vencido), botón "Conectar" → `/api/mp/oauth/connect?kind=provider`, botón "Desconectar" (`DELETE /api/mp/oauth` nuevo, limpia los 4 campos). Aviso claro: "Sin conexión, tus clientes solo pueden pagarte en efectivo".
- [ ] Onboarding del proveedor: tarea "Conectá Mercado Pago" (done = `mpOauthStatus === 'connected'`).
- [ ] Refresh de token: en `createPurchasePreference`/refund, si `mpOauthExpiresAt < now + 7d` → `POST /oauth/token grant_type=refresh_token` y guardar. Cifrado de tokens: **diferido a semana 1** (riesgo aceptado: DB Supabase con RLS y service role).

**Plan y trial**
- [ ] `plans.ts`: eliminar `PLAN_PRICE_USD`; `PLAN_PRICE_ARS = { basic: 50000, pro: 100000 }` desde env; features Básico = "Usá la app completa: stock ilimitado, ventas directas, cobros MP y efectivo, CRM, vinculaciones"; PRO = "Todo lo del Básico + tu logo y marca en la home, tarjeta Recomendado en marketplace y directorio, analítica de demanda".
- [ ] `plan.tsx`: precios en ARS sin "≈"; `location.href` al `init_point`; al volver con `?plan=ok` mostrar "Estamos confirmando tu pago" y polling de `/api/provider/plan` cada 5 s por 1 min.
- [ ] `provider/plan/route.ts`: si existe `mpPreapprovalId` `authorized` y cambia de plan → `PUT /preapproval/{id} { status: 'cancelled' }` antes de crear la nueva.
- [ ] `register/route.ts`: setear `trialEndsAt = now + 14d`. `auth-register.tsx` paso 3 proveedor: tarjeta "14 días gratis. Después: Básico $50.000/mes o PRO $100.000/mes. Cancelás cuando quieras".
- [ ] Trial vencido (`!puedeOperar`): `marketplace/route.ts`, `search/route.ts`, `directory/route.ts`, `sponsors/route.ts`, `search/pins` excluyen al proveedor; `purchases POST` → 409 "Este proveedor no está operando por ahora"; `panel-layout.tsx` pill "Plan vencido → Elegí tu plan" en la topbar del proveedor.
- [ ] Borrar bloque "Plan PRO" legacy de `proveedor/perfil.tsx:186-213` y `src/app/api/provider/subscription/route.ts`; `pro/subscription` queda con 403 honesto.
- [ ] Borrar del webhook los formatos legacy `pro:provider:` y `provider_pro:` (`webhook:160-169, 216-275`) y `createProPreapproval`/`MP_PRO_PRICE_ARS` de `mercadopago.ts`.

### B4. Proyecto: estados, cotización, factura (2.5 h)
- [ ] `projects/[id]/route.ts`: `status` solo `activo | cancelado`; `finalizado` solo vía `stage`; transiciones `presupuesto → materiales → ejecucion → revision → finalizado` (permitir saltar hacia adelante solo hasta `revision`; `finalizado` solo desde `ejecucion`/`revision` y **solo el cliente**); no volver atrás desde `finalizado`; `materialsPaymentMode` inmutable si existe factura o charge; `cancelado` solo en `presupuesto`/`materiales`, devuelve stock reservado y notifica.
- [ ] Cotización del profesional: `PATCH projects/[id] { laborCost }` solo el pro y solo en `presupuesto` → notifica al cliente "Te cotizaron la mano de obra: $X". `POST projects` desde el wizard guarda `budgetMin/budgetMax` como brief y `laborCost = null`; el detalle muestra "Presupuesto estimado del cliente" y "Mano de obra cotizada" separados. Botón "No puedo tomar este trabajo" (pro) → `cancelado` con motivo.
- [ ] `hire-wizard.tsx`: enviar `categorySlug` (rubro) y persistirlo; quitar "El pago se realiza al finalizar de forma segura" → "Pagás al finalizar, con Mercado Pago o efectivo"; en éxito, si no hubo mensaje: "Abrí el chat para coordinar (el profesional no puede escribirte primero)".
- [ ] "Finalizar obra": AlertDialog del design system + `busy`; solo si hay al menos una factura emitida (o confirmación explícita "no hubo factura").
- [ ] `projects/[id]/materials`: reservar stock al **aprobar** (mismo `updateMany` atómico), liberar al rechazar/reemplazar/cancelar; exigir `ProviderLink` activo entre pro y proveedor o `providerId` vacío; `providerId: 'none'` → `null`.
- [ ] `invoice/route.ts`: una factura `pendiente` por proyecto; ítems de materiales marcados `invoicedAt` para no refacturar; número por `SELECT nextval` (crear sequence `invoice_seq` y `charge_seq` con `prisma db execute`) o `cuid` corto + reintento en `P2002`.
- [ ] `profesional/proyecto-detalle.tsx`: link PDF por factura; "Emitir factura" deshabilitado si hay una pendiente; combobox difuso para el material (reusar el de `stock.tsx` con `matchScore`); atajo "Abrir chat"; `busy` por acción.
- [ ] `projects/route.ts` `serializeProject`: incluir `client { id, displayName, avatarUrl }`, `pro { id, user { displayName, avatarUrl } }`, `invoices { id, number, total, status, paymentMethod, issuedAt, laborCost, materialsCost }`, `description`, `budgetMin/Max`.

---

## 3. Día 2 — Honestidad, contratos por rol, móvil, sobrantes, salida

Estimación: 11 horas efectivas.

### B5. Copy honesto y precios (1.5 h)
- [ ] Borrar/reescribir: `hero.tsx:9,54`, `features.tsx:49,58-60`, `how-it-works.tsx:28`, `profiles.tsx:17,28-30,43-45`, `ai-band.tsx:20,108-109`, `auth-shell.tsx:19,81`, `layout.tsx:14`, `help-screen.tsx:71,128`, `tour-content.ts:58`, `vinculaciones.tsx:99-100,110`, `hire-wizard.tsx:335`, `profile-gate.tsx:54`. Mensajes nuevos: "Pagás al finalizar, por Mercado Pago o efectivo"; "Devolvé los sobrantes al local y recibí el reembolso por Mercado Pago" (ahora es cierto, §6); "Proveedor: 14 días gratis, después desde $50.000/mes".
- [ ] `cta-final.tsx:47-53` → `navigate('/registrarse')`; borrar `use-toast` y el `Toaster` de `layout.tsx:57` (queda sonner).
- [ ] `auth-register.tsx`: leer `route.query.volver` y respetarlo en `:219`; quitar el checkbox sin efecto (`:137-142`) y la frase "después podés sumar perfiles"; validar contraseña en el paso 2; `accept="image/*"` en DNI; setear `dniFront/Back` al elegir.
- [ ] Ayuda y tour: "Cuenta de retiro" descrita como vinculación para retirar materiales; quitar PRO de profesionales (`tour-content.ts:217`, `howto-content.ts:273`, `videos-content.ts:48`); parada "Mi plan" y "Conectá Mercado Pago" en tour/guía del proveedor; `messages-screen.tsx:158,178` alineado a "el cliente inicia"; `search-screen.tsx:54` "Herrería"; `directory-screen.tsx:199` sin "verificados"; typos (`guardla`, `toqués`, `Vinculame`, `Repone`).
- [ ] Borrar bloque DNI de `perfil.tsx` (pro y proveedor) → link a `/panel/<rol>/verificacion`; pill de verificación lee `user.verificationStatus`; `search/route.ts:111`, `comparables:48`, `homy-agent.ts:164`, `bids:50` derivan de `user.verificationStatus`.
- [ ] `verificacion.tsx`: `refresh()` de sesión tras el dictamen; `toast.error(d.error ?? 'No pudimos procesar el documento')`.

### B6. Contratos por rol (2.5 h)
- [ ] Helper `apiFetch(url, init)` en `src/lib/api-client.ts`: `try/catch`, parsea `error`, toast automático "No pudimos conectar. Reintentá" y devuelve `{ ok, data, error }`. Reemplazar los `fetch` de dashboards y listados de los 3 roles (los `try/finally` sin `catch`).
- [ ] Profesional: pantalla **Mis ofertas** (`presupuestos.tsx`): `GET /api/bids?mine=1` nuevo (bid + job + status) con "Retirar" (`action: 'retirar'`); `bids/[id]` `aceptar` solo desde `pendiente`, `retirar` solo desde `pendiente`; `jobs/[id]/bids` re-oferta desde `retirado`; `bids/route.ts:153` no pisar mensaje con vacío; `job-detail.tsx:55` identificar mi bid por `professional.userId === user.id`, mostrar su estado y precargar al editar; "Volver" con `history.back()`.
- [ ] `bolsa.tsx:117` y `stock.tsx:275-281,391-399`: `value="todas"` → `''`; "Limpiar filtros" radio 25.
- [ ] `works/route.ts`: si el autor es pro → `professionalId = pro.id` automático; `obras.tsx` abortar si falla una foto.
- [ ] `provider/links/route.ts:177`: quitar el filtro `active: true` en GET; el link creado por el pro nace `active: false` hasta que el proveedor lo active.
- [ ] `cliente/trabajos.tsx`: filtro "En proyecto" (`en_proceso`) con CTA "Ver proyecto"; soportar `sub` en `app-root.tsx:177` para resaltar el trabajo de la notificación; `closeJob` con `busy` y error.
- [ ] `cliente/facturas.tsx`: usar los campos nuevos del serializer; copy "MP o efectivo"; estado "Pago en proceso" al volver de MP (`?pago=pendiente`).
- [ ] `cliente/publicar.tsx`: categorías desde `/api/directory` (20); validar `min <= max` y `>= 0`; `busy` separado para fotos.
- [ ] `cliente/perfil.tsx`: `displayName` obligatorio; slider con `onValueCommit`.
- [ ] Notificaciones: `reviews/route.ts:179` link a `#/panel/<rol>/proyectos/<id>`; `projects/route.ts:175` y `dni:90` con `#/`.
- [ ] `messages-screen.tsx`: toast en envío fallido; `?c=nuevo:` crea la conversación recién al enviar el primer mensaje.
- [ ] Onboarding proveedor: `provider.description` en vez de `bio`.

### B7. Móvil (1.5 h)
- [ ] `panel-layout.tsx`: bottom nav = 4 ítems del rol + "Más" que abre un `Sheet` con el resto (Perfil, Verificación, Facturas, Obras, Presupuestos, Materiales, Cuentas de retiro, Directorio, Plan, Ayuda, Cerrar sesión). Cliente: Inicio, Trabajos, Proyectos, Mensajes, Más. Profesional: Inicio, Bolsa, Proyectos, Mensajes, Más. Proveedor: Inicio, Stock, Cobros, Mensajes, Más.
- [ ] Tour: no auto-start; botón "Ver tour" en el checklist; en móvil, paradas sin ancla muestran la tarjeta centrada con "Abrí Más → X".
- [ ] `globals.css`: definir `.homy-btn-ghost`. `panel-layout.tsx:221` "Ir a la home" → `/`. `site-footer.tsx`: links con fallback a `/#ancla` y "Bolsa de trabajo" → `/buscar?mode=profesional`.
- [ ] `app-root.tsx:126-132`: `withPublicShell` en buscar, perfiles, trabajo y notificaciones para visitantes (buscador con `top-20`). Doble padding en directorio/materiales/ayuda → `pt-8`.
- [ ] `search-screen.tsx`: debounce 300 ms. `hero-search.tsx:262-273`: quitar el auto-envío a los 20 s; conservar el texto tras responder; intención materiales → `/materiales`.
- [ ] `marketplace-screen.tsx`: `useLocation()` para lat/lng; badge Recomendado con `planPro`; "Ver N ofertas más"; Comprar/Reservar → si `roles.includes('cliente')` navega a `/panel/cliente/materiales?q=<nombre>&stock=<id>` (materiales.tsx abre el diálogo con ese stock), si no → `/proveedor/<id>`. `provider-profile.tsx`: botón "Pedir" por elemento con el mismo deep link; búsqueda con `matchTerms`; borrar bloque inalcanzable `:226-234`.

### B8. Sobrantes (4 h) — ver diseño completo en §6
- [ ] Schema + `db push`.
- [ ] 3 endpoints.
- [ ] Sección "Sobrantes" en el detalle de proyecto (cliente y pro) y en "Mis compras" (cliente).
- [ ] Tab "Devoluciones" en `cobros.tsx` del proveedor.
- [ ] Reembolso MP + registro efectivo + notificaciones.

### B9. Verificación y salida (2 h)
- [ ] `npm run build` verde con `ignoreBuildErrors: false`.
- [ ] Seeds en Supabase de producción: `node scripts/seed-catalog-maestro.mjs`. **No** correr `demo-seed.mjs` en producción (datos falsos).
- [ ] Smoke en Preview con credenciales de prueba de MP (usuario comprador y vendedor de prueba, ya están en tu `.env`):
  1. Registro cliente / profesional / proveedor → login → `?volver=` respetado.
  2. Proveedor: conectar MP (OAuth con el vendedor de prueba) → cargar stock → ver plan (trial 14 d).
  3. Cliente: buscar "caño" → comprar → proveedor aprueba (stock baja) → cliente paga MP (checkout de prueba) → webhook `approved` (firma válida) → `pagado` → proveedor entrega → reseña con foto (foto visible).
  4. Mismo flujo en efectivo: aprobar → acordar efectivo → proveedor confirma → `pagado`.
  5. Cliente cancela un pedido aprobado → stock vuelve.
  6. Wizard contratar → pro cotiza mano de obra → materiales A/B con reserva al aprobar → factura (una sola) → PDF (cliente y pro) → pago MP → finalizar con confirmación → reseñas cruzadas.
  7. Sobrantes: cliente carga 2 ítems → proveedor acepta 1 → confirma recepción → reembolso parcial visible en MP de prueba y en la app.
  8. DNI: subir frente/dorso → dictamen de IA real → badge en topbar, directorio y perfil.
  9. Plan: suscribirse Básico (preapproval de prueba) → webhook `authorized` → `basic`; cambiar a PRO → la anterior queda `cancelled`; sponsor aparece en home.
  10. Trial vencido (forzar `trialEndsAt` en DB) → desaparece del marketplace, pedidos rechazados con mensaje, pill en topbar.
  11. Móvil 390×844: bottom nav "Más" en los 3 roles; sin overflow en marketplace, facturas, detalle de proyecto.
  12. Seguridad: webhook sin firma → 401; `GET projects/<ajeno>/invoice` → 403; `PATCH materials` de otro proyecto → 404; cron sin secret → 401; `POST verification/dni` con URL ajena → 400.
- [ ] Promote a Production. Configurar dominio. Activar reglas de rate limit del WAF.
- [ ] Actualizar `AGENTS.md` (§11 estado real, precios ARS, sobrantes, variables) y `.env.example` nuevo con todos los nombres de §1.1.

---

## 4. Qué NO entra en las 48 h (semana 1 post-lanzamiento, en este orden)

1. zod en las 52 rutas restantes (hoy: validaciones manuales puntuales en las rutas tocadas).
2. Cifrado de tokens OAuth; `tokenVersion` en JWT; recuperación de contraseña; baja de cuenta.
3. `Decimal` para dinero; FKs e índices; `prisma migrate` versionado; `@unique` en reseñas.
4. Paginación y filtros en SQL para directorio/search/comparables; `search-match.ts` con tolerancia a typos; rating por rol.
5. CRM con drag & drop y alimentación automática; responder reseñas; pantalla Favoritos; tabs en el detalle de proyecto; editar/eliminar obras; consentimiento bilateral de vinculaciones.
6. SPA montada en `/` (una sola home), refactor de `hero-search.tsx`, SEO con rutas reales, `og:image`.
7. Reconciliación periódica de preapprovals con MP; job de refresh de tokens; observabilidad (Sentry, request-id).
8. Perfil de proveedor multi-tipo, horarios, geocodificación de dirección; logo separado del avatar (en 48 h el avatar **es** el logo y así se llama en la UI del proveedor).

---

## 5. Criterio de "listo para lanzar"

- Build verde sin `ignoreBuildErrors`.
- Los 12 smokes de B9 en verde en Preview con MP de prueba.
- Ningún texto de la app promete escrow, visitas por IA ni "sin costo".
- Un proveedor nuevo puede, sin ayuda: registrarse → conectar MP → cargar stock → recibir un pedido → aprobarlo → cobrarlo por MP → entregarlo → recibir reseña → aceptar sobrantes → reembolsar.
- Un cliente nuevo puede, desde el celular: registrarse → comprar → pagar → reseñar → devolver sobrantes, y contratar → cotización → factura → pagar → finalizar → reseñar.

---

## 6. Diseño de la feature Sobrantes

### 6.1 Reglas
- **Quién carga**: el cliente o el profesional de un proyecto (para materiales comprados dentro del proyecto), o el cliente de una compra directa. Solo sobre materiales/compras en estado `pagado` (proyecto: factura o charge `pagada`; compra: `pagado`).
- **A quién**: al proveedor que vendió ese material (`ProjectMaterial.providerId` o `Purchase.providerId`). Un pedido de devolución agrupa ítems de **un solo** proveedor.
- **Qué se carga por ítem**: elemento del catálogo (preseleccionado del material original), cantidad a devolver (≤ cantidad comprada), estado ("sin abrir" / "abierto, sin usar"), foto obligatoria, nota opcional.
- **Qué hace el proveedor**: acepta todo, acepta algunos ítems (con cantidad ajustada), o rechaza con motivo. Al aceptar, fija el monto a reembolsar por ítem (por defecto precio unitario pagado × cantidad aceptada; puede aplicar un descuento por manipulación, visible).
- **Entrega**: el cliente/pro acerca los ítems al local. El proveedor marca "Recibido" (puede ajustar cantidades recibidas).
- **Reembolso**:
  - Si el pago original fue por **Mercado Pago**: la plataforma llama `POST /v1/payments/{mpPaymentId}/refunds { amount }` con el **mismo token** con el que se cobró (OAuth del proveedor si fue split, plataforma si no). MP acredita al medio de pago original en 1 a 15 días. Se guarda `mpRefundId`.
  - Si fue **efectivo**: el proveedor devuelve en el local y marca "Reembolsado en efectivo"; el cliente confirma (o pasa a confirmado a las 72 h).
  - Reembolsos parciales múltiples sobre el mismo pago están soportados por MP mientras la suma no supere el total.
- **Plazo**: se puede pedir hasta 30 días después del pago. El proveedor tiene 72 h para responder; si no responde, notificación de recordatorio (sin auto-aceptación en v1).
- **Stock**: al marcar "Recibido", los ítems aceptados **vuelven al stock** del proveedor (`increment` + `StockMovement 'devolucion'`).
- **Reseñas**: no cambia nada; la devolución no habilita ni bloquea reseñas.

### 6.2 Estados (`LeftoverReturn.status`)
`solicitada` → `aceptada` | `aceptada_parcial` | `rechazada` → (`aceptada*`) `recibida` → `reembolsada` | `reembolso_fallido` → (retry) `reembolsada`.
`solicitada` → `cancelada` (por quien la pidió). Sin retroceso desde `recibida`.

### 6.3 Schema (Prisma)
```prisma
model LeftoverReturn {
  id            String   @id @default(cuid())
  requesterId   String                     // User que pide (cliente o pro)
  providerId    String                     // ProviderProfile
  projectId     String?                    // origen: proyecto…
  purchaseId    String?                    // …o compra directa
  chargeId      String?                    // ProviderCharge original (para el pago)
  invoiceId     String?                    // Invoice original (si el material se facturó ahí)
  status        String   @default("solicitada")
  paymentMethod String?                    // 'mercadopago' | 'efectivo' (del pago original)
  mpPaymentId   String?                    // pago a reembolsar
  mpRefundId    String?
  refundTotal   Float    @default(0)
  providerNote  String?
  requestedAt   DateTime @default(now())
  respondedAt   DateTime?
  receivedAt    DateTime?
  refundedAt    DateTime?
  items         LeftoverItem[]
  requester     User            @relation(fields: [requesterId], references: [id])
  provider      ProviderProfile @relation(fields: [providerId], references: [id])
  @@index([providerId, status])
  @@index([requesterId])
}

model LeftoverItem {
  id              String  @id @default(cuid())
  returnId        String
  elementId       String
  materialId      String?   // ProjectMaterial origen
  purchaseId      String?   // Purchase origen
  qtyRequested    Float
  qtyAccepted     Float?
  qtyReceived     Float?
  unitPricePaid   Float
  refundAmount    Float?    // fijado por el proveedor
  condition       String    // 'sin_abrir' | 'abierto_sin_usar'
  photoUrl        String
  note            String?
  status          String    @default("propuesto") // propuesto | aceptado | rechazado
  return          LeftoverReturn @relation(fields: [returnId], references: [id], onDelete: Cascade)
  element         CatalogElement @relation(fields: [elementId], references: [id])
  @@index([returnId])
}
```
Además: `Payment.mpPaymentId String? @unique`, `ProviderProfile.leftoverReturns LeftoverReturn[]`, `User.leftoverReturns LeftoverReturn[]`.

### 6.4 Endpoints
| Método | Ruta | Quién | Qué hace |
|---|---|---|---|
| `GET` | `/api/returns?role=solicitante\|proveedor` | sesión | Lista mis devoluciones (con ítems, elemento, contraparte). |
| `POST` | `/api/returns` | cliente/pro del origen | Body zod: `{ projectId? \| purchaseId?, items: [{ materialId? \| purchaseId?, elementId, qty, condition, photoUrl, note? }] }`. Valida: origen pagado, un solo proveedor, `qty <= comprado - ya devuelto`, ≤ 30 días, foto del bucket. Resuelve `chargeId/invoiceId/mpPaymentId/paymentMethod` del pago original. Notifica al proveedor (`#/panel/proveedor/cobros?tab=devoluciones`). Abre mensaje en el chat existente. |
| `PATCH` | `/api/returns/[id]` | según `action` | `aceptar { items: [{ id, qtyAccepted, refundAmount }] }` (proveedor; los no listados quedan `rechazado`; status `aceptada`/`aceptada_parcial`); `rechazar { note }` (proveedor); `cancelar` (solicitante, solo `solicitada`); `recibir { items: [{ id, qtyReceived }] }` (proveedor; devuelve stock; si `paymentMethod === 'mercadopago'` dispara el refund y pasa a `reembolsada` o `reembolso_fallido`; si efectivo → `recibida` esperando `reembolsar_efectivo`); `reembolsar_efectivo` (proveedor → `reembolsada`); `reintentar_reembolso` (proveedor, desde `reembolso_fallido`). Cada acción notifica a la otra parte. |

`src/lib/mercadopago.ts`: `refundPayment({ paymentId, amount, accessToken })` → `POST /v1/payments/{id}/refunds` con `X-Idempotency-Key = returnId`. El webhook ya recibe `payment.updated` con `status_detail = 'partially_refunded'/'refunded'`: registrar en `Payment.refundedAmount` (nuevo campo) sin tocar estados de factura/compra.

### 6.5 Pantallas
- **Detalle de proyecto (cliente y pro)**: sección "Sobrantes" debajo de materiales: lista de devoluciones con estado + botón "Devolver sobrantes" (solo si hay materiales pagados). Diálogo: elegir proveedor (si hubo más de uno), tabla de materiales pagados con cantidad a devolver, estado, foto por ítem (uploader existente, `folder=sobrantes`), nota. Resumen "Reembolso estimado: $X (lo confirma el proveedor)".
- **Mis compras (cliente)**: botón "Devolver sobrantes" en compras `pagado` ≤ 30 días; mismo diálogo.
- **Cobros del proveedor**: tab "Devoluciones" con badge; tarjeta por solicitud: ítems con foto, cantidad, condición; acciones "Aceptar todo", "Aceptar algunos" (editar cantidad y monto por ítem), "Rechazar" (motivo); luego "Marcar recibido" (cantidades); luego estado del reembolso ("Reembolsado por MP el dd/mm", "Reembolsá en efectivo y marcá acá", "Falló el reembolso: reintentar").
- **Copy honesto en home/ayuda**: "Devolvé los sobrantes al local. Si pagaste con Mercado Pago, el reembolso vuelve solo a tu medio de pago; si pagaste en efectivo, te lo devuelven en el mostrador y lo confirmás en la app."
- **Tour/guía**: paso "Sobrantes" para cliente y proveedor.

### 6.6 Bordes cubiertos
- Ítem devuelto dos veces: `qty <= comprado - sum(qtyAccepted de devoluciones no rechazadas/canceladas)`.
- Reembolso mayor al pago: `refundTotal <= payment.amount - payment.refundedAmount` (validado antes de llamar a MP).
- Proveedor sin OAuth pero pago cobrado con token de plataforma: se reembolsa con token de plataforma (el que cobró).
- Pago MP `pending`/`in_process`: no se permite pedir devolución hasta `approved`.
- Proveedor con trial vencido: puede responder devoluciones (no es "operar", es obligación con clientes existentes).

---

## 7. Orden de ejecución sugerido con agentes en paralelo

| Franja | Agente A | Agente B | Agente C |
|---|---|---|---|
| Día 1 mañana | B1 + B2 | B3 compra directa + stock | B4 estados + cotización |
| Día 1 tarde | B3 OAuth + plan | B4 factura + serializers | B5 copy |
| Día 2 mañana | B8 sobrantes (schema + API) | B6 contratos por rol | B7 móvil |
| Día 2 tarde | B8 sobrantes (UI) | B9 smokes 1-6 | B9 smokes 7-12 + deploy |

Integración obligatoria al final de cada franja: `tsc`, `eslint`, `build`. Nadie mergea con rojo.

---

## 8. Riesgos que pueden mover la fecha

1. **Credenciales de MP en producción**: si la app marketplace no tiene OAuth ni split habilitado, el cobro al proveedor por MP no funciona el día 2. Verificar en el panel de MP el Día 0. Plan B: lanzar con "solo efectivo para ventas directas" y cobro MP únicamente en facturas de proyecto (token de plataforma), dejando claro el copy.
2. **Proveedor de IA**: sin `AI_*` configurado, la verificación DNI queda en "en revisión" para todos. Plan B: badge "Documento recibido, en revisión" y verificación manual desde Supabase (cambiar `verificationStatus` a mano) los primeros días.
3. **Sobrantes**: es la única feature nueva. Si el Día 2 se atrasa, se lanza con la solicitud + aceptación + recepción + reembolso en efectivo, y el refund automático por MP entra en la semana 1. El copy de la home se ajusta a lo que exista.
4. **Bucket privado de DNI**: si cambiar el bucket rompe las URLs ya guardadas en DB (usuarios demo), correr un script que mueva los archivos o pedir re-subida.
